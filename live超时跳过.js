// ==================== 终极通用动态爬虫 v12.1 (修复 #genre# 解析错误) ====================
// 特性:
// 1. 解析文本文件时自动跳过包含 #genre# 的行及无效行
// 2. 只识别以 http:// 或 https:// 开头的地址
// 3. 其他功能同 v12.0：多集连播、分页、缓存、相对路径解析

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
 * 修复：自动跳过包含 #genre# 的行，并严格校验 URL 格式
 */
function buildPlaylistFromText(content, baseUrl) {
    let items = [];
    let lines = content.split(/\r?\n/);
    for (let line of lines) {
        let trimmed = line.trim();
        if (!trimmed) continue;
        // 跳过注释行或包含 #genre# 的元数据行
        if (trimmed.startsWith('#') || trimmed.includes('#genre#')) continue;
        
        let title = "", url = "";
        // 尝试分隔符: | , $ \t
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
            // 提取第一个以 http:// 或 https:// 开头的字符串
            let urlMatch = rest.match(/^(https?:\/\/[^\s]+)/);
            if (urlMatch) url = urlMatch[1];
            else if (rest.match(/^https?:\/\//i)) url = rest;
            else continue; // 无效 URL
        } else if (trimmed.match(/^https?:\/\//i)) {
            url = trimmed;
            title = "媒体文件";
        } else {
            // 尝试空格分隔: "标题 地址"
            let parts = trimmed.split(/\s+/);
            if (parts.length >= 2 && parts[1].match(/^https?:\/\//i)) {
                title = parts[0];
                url = parts[1];
            } else {
                continue;
            }
        }
        // 最终验证 URL 是否有效
        if (url && url.match(/^https?:\/\//i)) {
            if (!url.match(/^https?:\/\//i)) url = resolvePath(url, baseUrl);
            if (!title) title = "媒体文件";
            items.push(`${title}$${url}`);
        }
    }
    log(`解析到 ${items.length} 个有效媒体`, "DEBUG");
    return items.join("#");
}

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
    } catch(e) {}
    return items.join("#");
}

// ext 配置解析（同原版，省略... 但保留完整）
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
    log("========== 爬虫初始化 v12.1 ==========", "INFO");
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

function category(tid, pg, filter, extend) {
    pg = parseInt(pg) || 1;
    log(`category: ${tid}, page=${pg}`, "DEBUG");
    let videos = [];
    let total = 0;
    let pagecount = 1;
    const PAGE_SIZE = 50;
    try {
        if (tid === "cctv" || tid === "央视栏目") {
            let channels = ["CCTV-1 综合","CCTV-2 财经","CCTV-3 综艺","CCTV-4 中文国际","CCTV-5 体育","CCTV-6 电影","CCTV-7 国防军事","CCTV-8 电视剧","CCTV-9 纪录","CCTV-10 科教","CCTV-11 戏曲","CCTV-12 社会与法","CCTV-13 新闻","CCTV-14 少儿","CCTV-15 音乐"];
            total = channels.length;
            pagecount = Math.ceil(total / PAGE_SIZE);
            let start = (pg - 1) * PAGE_SIZE;
            let end = start + PAGE_SIZE;
            let pageChannels = channels.slice(start, end);
            for (let i = 0; i < pageChannels.length; i++) {
                videos.push({
                    vod_id: "cctv" + (i+1+start) + "###cctv",
                    vod_name: pageChannels[i],
                    vod_pic: getCover(pageChannels[i], null, null),
                    vod_remarks: "📺 直播"
                });
            }
        } else {
            let fileUrl = tid;
            if (!tid.match(/^https?:\/\//i)) fileUrl = resolvePath(tid, extBasePath);
            let content = fetchSync(fileUrl);
            if (content) {
                // 尝试 JSON 格式
                if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
                    try {
                        let json = JSON.parse(content);
                        let arr = Array.isArray(json) ? json : (json.list || json.data || []);
                        for (let item of arr) {
                            let title = item.title || item.name || "未命名";
                            let url = item.url || item.link || item.src;
                            if (url) items.push({ title, url, pic: item.pic || item.cover });
                        }
                    } catch(e) {}
                }
                // 文本文件：生成一个文件夹卡片（代表整个文件）
                let firstTitle = content.split(/\r?\n/)[0]?.substring(0, 30) || "媒体合集";
                // 统计有效行数（不包含 #genre# 和无效行）
                let validCount = 0;
                let lines = content.split(/\r?\n/);
                for (let line of lines) {
                    let trimmed = line.trim();
                    if (!trimmed) continue;
                    if (trimmed.startsWith('#') || trimmed.includes('#genre#')) continue;
                    if (trimmed.match(/https?:\/\//)) validCount++;
                }
                videos.push({
                    vod_id: fileUrl + "###file",
                    vod_name: firstTitle,
                    vod_pic: getCover(firstTitle, fileUrl, null),
                    vod_remarks: `${validCount} 个媒体`
                });
                total = 1;
                pagecount = 1;
            } else {
                videos.push({ vod_id: "error", vod_name: `⚠️ 无法加载: ${tid}`, vod_pic: "https://picsum.photos/200/300?random=999", vod_remarks: "请检查网络" });
                total = 1;
            }
        }
    } catch(e) { log(`category 错误: ${e.message}`, "ERROR"); }
    return JSON.stringify({ list: videos, page: pg, pagecount: pagecount, limit: PAGE_SIZE, total: total });
}

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
        else {
            let fileUrl = id;
            if (!fileUrl.match(/^https?:\/\//i)) fileUrl = resolvePath(fileUrl, extBasePath);
            let content = fetchSync(fileUrl);
            if (!content) return JSON.stringify({ list: [] });
            let playUrl = "";
            let baseDir = fileUrl.substring(0, fileUrl.lastIndexOf('/') + 1);
            if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
                playUrl = buildPlaylistFromJSON(content, baseDir);
            }
            if (!playUrl) {
                playUrl = buildPlaylistFromText(content, baseDir);
            }
            if (!playUrl) {
                log(`未能解析播放列表: ${fileUrl}`, "WARN");
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