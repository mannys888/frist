// ==================== 终极通用动态爬虫 v13.0 (修复详情解析) ====================
// 特性:
// 1. 文本文件分类 → 生成单个卡片，点击后解析全部媒体为多集播放串
// 2. JSON数组 → 每个条目生成独立卡片，点击直接播放
// 3. 支持相对路径、分页、缓存、搜索
// 4. 播放串格式: 标题$地址#标题2$地址2 (自动连播)

const header = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
};

let dynamicClasses = [];
let extBasePath = "";
let defaultBasePath = "https://raw.githubusercontent.com/mannys888/frist/refs/heads/main/";
let cache = {};
let debugMode = true;
const CACHE_TTL = 10 * 60 * 1000;

function log(msg, level = "INFO") {
    if (!debugMode && level === "DEBUG") return;
    console.log(`[${level}] ${msg}`);
}

function fetchSync(url, useCache = true) {
    if (useCache && cache[url] && cache[url].expire > Date.now()) {
        log(`缓存命中: ${url}`, "DEBUG");
        return cache[url].data;
    }
    try {
        log(`请求: ${url}`, "DEBUG");
        let response = req(url, { 'method': 'GET', 'headers': header });
        let content = typeof response === 'string' ? response : (response?.content || "");
        if (content && useCache) cache[url] = { data: content, expire: Date.now() + CACHE_TTL };
        return content;
    } catch (e) {
        log(`请求失败: ${url} - ${e.message}`, "ERROR");
        return null;
    }
}

function resolvePath(path, basePath) {
    if (!path) return "";
    if (path.match(/^https?:\/\//i)) return path;
    if (path.startsWith('data:')) return path;
    let base = basePath;
    if (!base.endsWith('/')) base += '/';
    if (path.startsWith('./')) path = path.substring(2);
    while (path.startsWith('../')) {
        let lastSlash = base.lastIndexOf('/', base.length - 2);
        if (lastSlash > 0) base = base.substring(0, lastSlash + 1);
        path = path.substring(3);
    }
    if (path.startsWith('/')) {
        let match = base.match(/^(https?:\/\/[^/]+)/);
        if (match) return match[1] + path;
        return base + path.substring(1);
    }
    return base + path;
}

function getFileType(url) {
    if (!url) return "📄 未知";
    let ext = url.split('.').pop().toLowerCase();
    let types = {
        'mp3': '🎵 音频', 'wav': '🎵 音频', 'ogg': '🎵 音频', 'flac': '🎵 音频',
        'mp4': '🎬 视频', 'mkv': '🎬 视频', 'avi': '🎬 视频', 'mov': '🎬 视频',
        'm3u8': '📺 直播', 'flv': '📺 直播', 'ts': '📺 直播'
    };
    return types[ext] || '🎵 媒体';
}

function getCover(title, url, originalPic = null) {
    if (originalPic && originalPic.match(/^https?:\/\//i)) return originalPic;
    let hash = 0;
    let str = (title || "media") + (url || "");
    for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash) + str.charCodeAt(i);
    return `https://picsum.photos/200/300?random=${Math.abs(hash) % 1000}`;
}

/**
 * 将文本文件内容解析为多集播放串 (标题$地址#标题2$地址2)
 */
function buildPlaylistFromText(content, baseUrl) {
    let items = [];
    let lines = content.split(/\r?\n/);
    for (let line of lines) {
        let trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
        let title = "", url = "";
        // 尝试分割符: | , $ \t
        let separators = ['|', ',', '$', '\t'];
        let bestSep = null, bestIdx = -1;
        for (let sep of separators) {
            let idx = trimmed.indexOf(sep);
            if (idx > 0 && (bestIdx === -1 || idx < bestIdx)) {
                bestIdx = idx;
                bestSep = sep;
            }
        }
        if (bestSep) {
            title = trimmed.substring(0, bestIdx).trim();
            let rest = trimmed.substring(bestIdx + 1).trim();
            // 提取第一个 URL（支持空格后的备注）
            let urlMatch = rest.match(/^(https?:\/\/[^\s]+)/);
            if (urlMatch) url = urlMatch[1];
            else if (rest.match(/^https?:\/\//i)) url = rest;
            else continue;
        } else if (trimmed.match(/^https?:\/\//i)) {
            url = trimmed;
            title = "媒体文件";
        } else {
            continue;
        }
        // 相对路径解析
        if (url && !url.match(/^https?:\/\//i)) url = resolvePath(url, baseUrl);
        if (url) items.push(`${title}$${url}`);
    }
    log(`解析到 ${items.length} 个媒体项`, "DEBUG");
    return items.join("#");
}

/**
 * 从 JSON 内容构建播放串（单条目或多条目）
 * 若 JSON 是数组，返回 # 连接的多集串；若是对象，提取 list/data 后处理
 */
function buildPlaylistFromJSON(content, baseUrl) {
    let items = [];
    try {
        let json = JSON.parse(content);
        let arr = Array.isArray(json) ? json : (json.list || json.data || []);
        for (let item of arr) {
            let title = item.title || item.name || "未命名";
            let url = item.url || item.link || item.src || item.play_url;
            if (url) {
                if (!url.match(/^https?:\/\//i)) url = resolvePath(url, baseUrl);
                items.push(`${title}$${url}`);
            }
        }
    } catch(e) { log("JSON 解析失败", "DEBUG"); }
    return items.join("#");
}

// ==================== ext 配置解析 ====================
function parseExtConfig(extParam, basePath) {
    let classes = [];
    try {
        let configData = null;
        if (extParam && extParam.match(/^https?:\/\//i)) {
            let content = fetchSync(extParam);
            if (content) {
                try { configData = JSON.parse(content); } catch(e) { configData = content; }
            }
        } else if (extParam) {
            try { configData = JSON.parse(extParam); } catch(e) { configData = extParam; }
        }
        if (configData) {
            if (Array.isArray(configData)) {
                for (let item of configData) {
                    if (item.name) {
                        let typeId = item.url || item.api || item.id || item.name;
                        if (typeId && !typeId.match(/^https?:\/\//i)) typeId = resolvePath(typeId, basePath);
                        classes.push({ type_name: item.name, type_id: typeId, icon: item.icon || "" });
                    }
                }
            } else if (configData.sites && Array.isArray(configData.sites)) {
                for (let site of configData.sites) {
                    if (site.name) {
                        let typeId = site.url || site.api || site.key || site.name;
                        if (typeId && !typeId.match(/^https?:\/\//i)) typeId = resolvePath(typeId, basePath);
                        classes.push({ type_name: site.name, type_id: typeId, icon: site.icon || "" });
                    }
                }
            } else if (typeof configData === 'string') {
                let lines = configData.split(/\r?\n/);
                for (let line of lines) {
                    if (!line.trim()) continue;
                    let parts = line.split(',');
                    if (parts.length >= 2) {
                        let name = parts[0].trim();
                        let url = parts[1].trim();
                        classes.push({ type_name: name, type_id: resolvePath(url, basePath) });
                    }
                }
            }
        }
    } catch(e) { log(`解析 ext 失败: ${e.message}`, "ERROR"); }
    if (classes.length === 0) {
        classes = [{ type_name: "示例分类", type_id: resolvePath("example.txt", basePath) }];
    }
    return classes;
}

function init(extend) {
    log("========== 爬虫初始化 v13.0 ==========", "INFO");
    extBasePath = defaultBasePath;
    if (extend && extend.match(/^https?:\/\//i)) {
        let lastSlash = extend.lastIndexOf('/');
        if (lastSlash > 0) extBasePath = extend.substring(0, lastSlash + 1);
    }
    log(`基础路径: ${extBasePath}`, "INFO");
    dynamicClasses = parseExtConfig(extend, extBasePath);
    log(`生成 ${dynamicClasses.length} 个分类`, "INFO");
}

function home() {
    return JSON.stringify({ class: dynamicClasses, filters: null });
}

function homeVod() {
    return JSON.stringify({ list: [] });
}

// 分页列表（核心修复）
function category(tid, pg, filter, extend) {
    pg = parseInt(pg) || 1;
    log(`category: ${tid}, page=${pg}`, "DEBUG");
    let videos = [];
    let total = 0;
    let pagecount = 1;
    const PAGE_SIZE = 50;
    try {
        // 央视特殊处理
        if (tid === "cctv" || tid === "央视栏目") {
            let channels = ["CCTV-1 综合","CCTV-2 财经","CCTV-3 综艺","CCTV-4 中文国际","CCTV-5 体育","CCTV-6 电影","CCTV-7 国防军事","CCTV-8 电视剧","CCTV-9 纪录","CCTV-10 科教","CCTV-11 戏曲","CCTV-12 社会与法","CCTV-13 新闻","CCTV-14 少儿","CCTV-15 音乐"];
            total = channels.length;
            pagecount = Math.ceil(total / PAGE_SIZE);
            let start = (pg - 1) * PAGE_SIZE;
            let end = start + PAGE_SIZE;
            for (let i = start; i < end && i < channels.length; i++) {
                videos.push({
                    vod_id: "cctv" + (i+1) + "###cctv",
                    vod_name: channels[i],
                    vod_pic: getCover(channels[i], null, null),
                    vod_remarks: "📺 直播"
                });
            }
        } else {
            let fileUrl = tid;
            if (!fileUrl.match(/^https?:\/\//i)) fileUrl = resolvePath(tid, extBasePath);
            let content = fetchSync(fileUrl);
            if (content && content.length > 0) {
                // 尝试 JSON 解析
                if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
                    try {
                        let json = JSON.parse(content);
                        let arr = Array.isArray(json) ? json : (json.list || json.data || []);
                        for (let item of arr) {
                            let title = item.title || item.name || "未命名";
                            let url = item.url || item.link || item.src;
                            if (url) {
                                if (!url.match(/^https?:\/\//i)) {
                                    let base = fileUrl.substring(0, fileUrl.lastIndexOf('/') + 1);
                                    url = resolvePath(url, base);
                                }
                                videos.push({
                                    vod_id: url + "###single",
                                    vod_name: title,
                                    vod_pic: getCover(title, url, item.pic || item.cover),
                                    vod_remarks: getFileType(url)
                                });
                            }
                        }
                        total = videos.length;
                        pagecount = Math.ceil(total / PAGE_SIZE);
                        let start = (pg - 1) * PAGE_SIZE;
                        videos = videos.slice(start, start + PAGE_SIZE);
                    } catch(e) { log("JSON 解析失败，降级为文本", "DEBUG"); }
                }
                // 非 JSON 或 JSON 解析失败 → 作为文本文件处理，生成单个多集卡片
                if (videos.length === 0) {
                    // 统计媒体条目数量（用于显示提示）
                    let lineCount = content.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('//')).length;
                    let displayName = fileUrl.split('/').pop().replace(/\.(txt|js|m3u)$/i, '') || "媒体合集";
                    videos.push({
                        vod_id: fileUrl + "###multi",
                        vod_name: displayName,
                        vod_pic: getCover(displayName, fileUrl, null),
                        vod_remarks: `${lineCount} 个媒体`
                    });
                    total = 1;
                    pagecount = 1;
                }
            } else {
                videos.push({
                    vod_id: "error###test",
                    vod_name: `⚠️ 无法加载: ${tid.substring(0, 40)}`,
                    vod_pic: "https://picsum.photos/200/300?random=999",
                    vod_remarks: "请检查网络或文件是否存在"
                });
                total = 1;
            }
        }
    } catch(e) {
        log(`category 错误: ${e.message}`, "ERROR");
    }
    return JSON.stringify({ list: videos, page: pg, pagecount: pagecount, limit: PAGE_SIZE, total: total });
}

// 详情：构建播放串（修复关键）
function detail(vodId) {
    try {
        let parts = vodId.split('###');
        if (parts.length < 2) return JSON.stringify({ list: [] });
        let id = parts[0];
        let type = parts[1];
        
        if (type === "cctv") {
            let streamMap = {
                "cctv1": "https://cctv1h5cctv.aikan.miguvideo.com/cctv1_2/index.m3u8",
                "cctv2": "https://cctv2h5cctv.aikan.miguvideo.com/cctv2_2/index.m3u8",
                "cctv3": "https://cctv3h5cctv.aikan.miguvideo.com/cctv3_2/index.m3u8",
                "cctv4": "https://cctv4h5cctv.aikan.miguvideo.com/cctv4_2/index.m3u8",
                "cctv5": "https://cctv5h5cctv.aikan.miguvideo.com/cctv5_2/index.m3u8",
                "cctv6": "https://cctv6h5cctv.aikan.miguvideo.com/cctv6_2/index.m3u8"
            };
            let streamUrl = streamMap[id] || streamMap["cctv1"];
            let vod_name = id.replace(/^cctv(\d+)/, "CCTV-$1 直播");
            let vod = {
                vod_id: id,
                vod_name: vod_name,
                vod_pic: getCover(vod_name, streamUrl, null),
                vod_play_from: "央视直播",
                vod_play_url: "直播流$" + streamUrl
            };
            return JSON.stringify({ list: [vod] });
        } 
        else if (type === "single") {
            // 单集直接播放
            let title = id.split('/').pop().split('.')[0] || "媒体";
            title = decodeURIComponent(title);
            let vod = {
                vod_id: id,
                vod_name: title,
                vod_pic: getCover(title, id, null),
                vod_play_from: "播放源",
                vod_play_url: "播放$" + id
            };
            return JSON.stringify({ list: [vod] });
        }
        else if (type === "multi") {
            // 多集文件：解析整个文件内容
            let fileUrl = id;
            if (!fileUrl.match(/^https?:\/\//i)) fileUrl = resolvePath(fileUrl, extBasePath);
            let content = fetchSync(fileUrl);
            if (!content) {
                log(`无法获取文件内容: ${fileUrl}`, "ERROR");
                return JSON.stringify({ list: [] });
            }
            let baseDir = fileUrl.substring(0, fileUrl.lastIndexOf('/') + 1);
            let playUrl = "";
            if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
                playUrl = buildPlaylistFromJSON(content, baseDir);
            } else {
                playUrl = buildPlaylistFromText(content, baseDir);
            }
            if (!playUrl) {
                log(`未能解析任何播放地址: ${fileUrl}`, "WARN");
                return JSON.stringify({ list: [] });
            }
            let firstTitle = playUrl.split('#')[0].split('$')[0] || "媒体合集";
            let vod = {
                vod_id: fileUrl,
                vod_name: firstTitle,
                vod_pic: getCover(firstTitle, fileUrl, null),
                vod_play_from: "播放列表",
                vod_play_url: playUrl
            };
            return JSON.stringify({ list: [vod] });
        }
        else {
            // 未知类型，回退为单集
            let title = id.split('/').pop().split('.')[0] || "媒体";
            title = decodeURIComponent(title);
            let vod = {
                vod_id: id,
                vod_name: title,
                vod_pic: getCover(title, id, null),
                vod_play_from: "播放源",
                vod_play_url: "播放$" + id
            };
            return JSON.stringify({ list: [vod] });
        }
    } catch(e) {
        log(`detail 错误: ${e.message}`, "ERROR");
        return JSON.stringify({ list: [] });
    }
}

function play(flag, id, vipFlags) {
    log(`play: ${id}`, "DEBUG");
    return JSON.stringify({ parse: 0, url: id });
}

function search(keyword, page) {
    return JSON.stringify({ list: [] });
}

__JS_SPIDER__ = {
    init: init,
    home: home,
    homeVod: homeVod,
    category: category,
    detail: detail,
    play: play,
    search: search
};