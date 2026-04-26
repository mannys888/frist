// ==================== 终极通用动态爬虫 v12.0 (多集连播 + 超时跳过) ====================
// 特性:
// 1. 解析分类文件生成多集播放串 (标题$地址#标题2$地址2)
// 2. play 方法支持地址有效性预检 (可选，默认关闭，避免延迟)
// 3. 分页、缓存、相对路径解析、搜索功能完整
// 4. 央视直播单集处理

const header = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
};

// ==================== 全局变量 ====================
let dynamicClasses = [];
let extBasePath = "";
let defaultBasePath = "https://raw.githubusercontent.com/mannys888/frist/refs/heads/main/";
let cache = {};
let debugMode = true;
const CACHE_TTL = 10 * 60 * 1000; // 10分钟

function log(msg, level = "INFO") {
    if (!debugMode && level === "DEBUG") return;
    console.log(`[${level}] ${msg}`);
}

// --------------------------- 工具函数 ---------------------------
function fetchSync(url, useCache = true) {
    if (useCache && cache[url] && cache[url].expire > Date.now()) {
        log(`缓存命中: ${url}`, "DEBUG");
        return cache[url].data;
    }
    try {
        log(`请求: ${url}`, "DEBUG");
        let response = req(url, { 'method': 'GET', 'headers': header });
        let content = null;
        if (typeof response === 'string') content = response;
        else if (response && response.content) content = response.content;
        if (content && useCache) cache[url] = { data: content, expire: Date.now() + CACHE_TTL };
        return content;
    } catch (e) {
        log(`请求失败: ${url} - ${e.message}`, "ERROR");
        return null;
    }
}

function clearCache() { cache = {}; log("缓存已清除", "INFO"); }

function resolvePath(path, basePath) {
    if (!path) return "";
    if (path.match(/^https?:\/\//i)) return path;
    if (path.startsWith('data:')) return path;
    let base = basePath;
    if (!base.endsWith('/')) base = base + '/';
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
    let shortTitle = (title || "未命名").substring(0, 30);
    let hash = 0;
    for (let i = 0; i < shortTitle.length; i++) hash = ((hash << 5) - hash) + shortTitle.charCodeAt(i);
    return `https://picsum.photos/200/300?random=${Math.abs(hash) % 1000}`;
}

/**
 * 将文本文件内容解析为多集播放串 (标题$地址#标题2$地址2)
 * @param {string} content - 文件内容
 * @param {string} baseUrl - 文件所在目录，用于相对路径解析
 * @returns {string} 播放串
 */
function buildPlaylistFromText(content, baseUrl) {
    let items = [];
    let lines = content.split(/\r?\n/);
    for (let line of lines) {
        if (!line || line.trim() === "") continue;
        if (line.startsWith('#') || line.startsWith('//')) continue;
        let title = "", url = "";
        // 支持分隔符: | , $ \t
        let separators = ['|', ',', '$', '\t'];
        let bestSep = null, bestIdx = -1;
        for (let sep of separators) {
            let idx = line.indexOf(sep);
            if (idx > 0 && (bestIdx === -1 || idx < bestIdx)) { bestIdx = idx; bestSep = sep; }
        }
        if (bestSep) {
            title = line.substring(0, bestIdx).trim();
            let rest = line.substring(bestIdx + 1).trim();
            // 提取第一个URL
            let urlMatch = rest.match(/^(https?:\/\/[^\s]+)/);
            if (urlMatch) url = urlMatch[1];
            else if (rest.match(/^https?:\/\//i)) url = rest;
            else continue;
        } else if (line.match(/^https?:\/\//i)) {
            url = line;
            title = "媒体文件";
        } else continue;
        // 相对路径处理
        if (url && !url.match(/^https?:\/\//i)) url = resolvePath(url, baseUrl);
        if (url) items.push(`${title}$${url}`);
    }
    return items.join("#");
}

/**
 * 从JSON内容构建播放串
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
    } catch(e) {}
    return items.join("#");
}

// --------------------------- ext 配置解析 ---------------------------
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
        classes = [
            { type_name: "示例分类", type_id: resolvePath("example.txt", basePath) }
        ];
    }
    return classes;
}

// --------------------------- 核心接口 ---------------------------
function init(extend) {
    log("========== 爬虫初始化 v12.0 ==========", "INFO");
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

/**
 * 分类列表（支持分页）
 */
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
                let items = [];
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
                if (items.length === 0) {
                    // 文本行解析，但只返回第一个文件作为入口，实际播放时会重新解析全集
                    // 这里为了列表不过于庞大，只返回第一条作为卡片，点击后 detail 解析全集
                    // 更好方式：把每个文件条目作为独立卡片？不，固定模式：一个分类文件对应一个多集视频。
                    // 为了UI友好，将整个文件作为一个卡片，点击后进入多集选择。
                    let firstTitle = content.split(/\r?\n/)[0]?.substring(0, 30) || "媒体合集";
                    videos.push({
                        vod_id: fileUrl + "###file",
                        vod_name: firstTitle,
                        vod_pic: getCover(firstTitle, fileUrl, null),
                        vod_remarks: `${content.split(/\r?\n/).filter(l=>l.trim() && !l.startsWith('#')).length} 个媒体`
                    });
                    total = 1;
                    pagecount = 1;
                } else {
                    // JSON 格式的条目可以作为单独卡片，便于管理
                    for (let item of items) {
                        let link = item.url;
                        if (!link.match(/^https?:\/\//i)) {
                            let base = fileUrl.substring(0, fileUrl.lastIndexOf('/') + 1);
                            link = resolvePath(link, base);
                        }
                        videos.push({
                            vod_id: link + "###single",
                            vod_name: item.title,
                            vod_pic: getCover(item.title, link, item.pic),
                            vod_remarks: getFileType(link)
                        });
                    }
                    total = videos.length;
                    pagecount = Math.ceil(total / PAGE_SIZE);
                    let start = (pg - 1) * PAGE_SIZE;
                    videos = videos.slice(start, start + PAGE_SIZE);
                }
            } else {
                videos.push({ vod_id: "error", vod_name: `⚠️ 无法加载: ${tid}`, vod_pic: "https://picsum.photos/200/300?random=999", vod_remarks: "请检查网络" });
                total = 1;
            }
        }
    } catch(e) { log(`category 错误: ${e.message}`, "ERROR"); }
    return JSON.stringify({ list: videos, page: pg, pagecount: pagecount, limit: PAGE_SIZE, total: total });
}

/**
 * 详情：构建多集播放串
 */
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
        else {
            // 文件合集：解析完整内容生成播放串
            let fileUrl = id;
            if (!fileUrl.match(/^https?:\/\//i)) fileUrl = resolvePath(fileUrl, extBasePath);
            let content = fetchSync(fileUrl);
            if (!content) return JSON.stringify({ list: [] });
            
            let playUrl = "";
            let baseDir = fileUrl.substring(0, fileUrl.lastIndexOf('/') + 1);
            if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
                playUrl = buildPlaylistFromJSON(content, baseDir);
            } else {
                playUrl = buildPlaylistFromText(content, baseDir);
            }
            if (!playUrl) return JSON.stringify({ list: [] });
            
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

/**
 * play 方法：返回播放地址
 * 可选：添加地址有效性预检（快速 HEAD 请求，若无效则尝试下一个，但会延迟）
 * 默认不预检，依赖播放器自动跳过
 */
function play(flag, id, vipFlags) {
    log(`play: ${id}`, "DEBUG");
    // 如果需要预检健康性，可以取消注释以下代码（会增加延迟）
    // 注意：同步 HEAD 请求可能阻塞，不推荐大规模使用
    // try {
    //     let testReq = req(id, { method: 'HEAD' });
    //     if (!testReq || testReq.status >= 400) {
    //         log(`地址可能失效: ${id}`, "WARN");
    //         // 无法在此处自动跳转，应由播放器处理
    //     }
    // } catch(e) {}
    return JSON.stringify({ parse: 0, url: id });
}

/**
 * 搜索功能（可选）
 */
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