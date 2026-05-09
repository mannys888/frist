// ==================== 完全动态爬虫（零硬编码）+ 合集模式 ====================
// 版本: 11.1.0
// 特性: 所有数据源均来自 ext 配置，支持集合播放列表

const header = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
};

// ==================== 全局变量 ====================
let dynamicClasses = [];
let extBasePath = "";
let defaultBasePath = "https://raw.githubusercontent.com/mannys888/frist/refs/heads/main/";
let cache = {};
let debugMode = true;

// ==================== 日志 ====================
function log(msg, level = "INFO") {
    if (!debugMode && level === "DEBUG") return;
    console.log(`[${level}] ${msg}`);
}

// ==================== 网络请求（带缓存） ====================
function fetchSync(url, useCache = true) {
    if (useCache && cache[url]) return cache[url];
    try {
        log(`请求: ${url}`, "DEBUG");
        let response = req(url, { method: 'GET', headers: header });
        let content = (typeof response === 'string') ? response : (response?.content || null);
        if (content && useCache) cache[url] = content;
        return content;
    } catch (e) {
        log(`请求失败: ${url} - ${e.message}`, "ERROR");
        return null;
    }
}

// ==================== 工具函数 ====================
function getRandomCover(title) {
    let hash = 0;
    for (let i = 0; i < (title || "").length; i++) hash = ((hash << 5) - hash) + title.charCodeAt(i);
    let themes = ["music", "nature", "abstract", "art", "film"];
    let theme = themes[Math.abs(hash) % themes.length];
    return `https://picsum.photos/200/300?random=${Math.abs(hash) % 100}&theme=${theme}`;
}

function getFileType(url) {
    if (!url) return "📄 未知";
    let ext = url.split('.').pop().toLowerCase();
    let types = {
        'mp3': '🎵 音频', 'wav': '🎵 音频', 'ogg': '🎵 音频', 'flac': '🎵 音频',
        'mp4': '🎬 视频', 'mkv': '🎬 视频', 'avi': '🎬 视频', 'mov': '🎬 视频',
        'm3u8': '📺 直播', 'flv': '📺 直播', 'ts': '📺 直播',
        'jpg': '🖼️ 图片', 'png': '🖼️ 图片', 'gif': '🖼️ 图片',
        'txt': '📄 文本', 'json': '📋 数据', 'xml': '📋 数据'
    };
    return types[ext] || '🎵 媒体';
}

function resolvePath(path, basePath) {
    if (!path) return "";
    if (path.match(/^https?:\/\//i)) return path;
    if (path.startsWith('data:')) return path;
    let base = basePath.endsWith('/') ? basePath : basePath + '/';
    if (path.startsWith('./')) return base + path.substring(2);
    if (path.startsWith('../')) {
        let parts = base.split('/');
        let upCount = (path.match(/\.\.\//g) || []).length;
        for (let i = 0; i < upCount && parts.length > 3; i++) parts.pop();
        let newBase = parts.join('/') + '/';
        return newBase + path.replace(/\.\.\//g, '');
    }
    if (path.startsWith('/')) {
        let match = base.match(/^(https?:\/\/[^/]+)/);
        return match ? match[1] + path : base + path.substring(1);
    }
    return base + path;
}

function parseContent(content, options = {}) {
    let items = [];
    let separators = options.separators || [',', '\t', '|', '$'];
    let lines = content.split(/\r?\n/);
    for (let line of lines) {
        if (!line || line.trim() === "") continue;
        if (line.startsWith('#') || line.startsWith('//')) continue;
        let foundSep = null, sepIdx = -1;
        for (let sep of separators) {
            let idx = line.indexOf(sep);
            if (idx > 0 && (sepIdx === -1 || idx < sepIdx)) { sepIdx = idx; foundSep = sep; }
        }
        if (foundSep) {
            let title = line.substring(0, sepIdx).trim();
            let url = line.substring(sepIdx + 1).trim();
            items.push({ title, url });
        } else if (line.match(/^https?:\/\//i)) {
            items.push({ title: "媒体文件", url: line });
        }
    }
    return items;
}

// ==================== ext 配置解析 ====================
function parseExtConfig(extParam, basePath) {
    let classes = [];
    if (!extParam) return classes;

    try {
        let configData = null;
        if (typeof extParam === 'string' && extParam.match(/^https?:\/\//i)) {
            log(`下载 ext 配置: ${extParam}`, "INFO");
            let content = fetchSync(extParam);
            if (content) {
                try {
                    configData = JSON.parse(content);
                } catch(e) { configData = content; }
            }
        } 
        else if (typeof extParam === 'string' && (extParam.trim().startsWith('{') || extParam.trim().startsWith('['))) {
            try { configData = JSON.parse(extParam); } catch(e) { configData = extParam; }
        }
        else if (typeof extParam === 'object') {
            configData = extParam;
        }
        else if (typeof extParam === 'string') {
            configData = extParam;
        }

        if (configData) {
            if (Array.isArray(configData)) {
                for (let item of configData) {
                    if (item.name) {
                        let typeId = item.url || item.typeId || item.id || item.name;
                        if (typeId && !typeId.match(/^https?:\/\//i)) {
                            typeId = resolvePath(typeId, basePath);
                        }
                        classes.push({
                            type_name: item.name,
                            type_id: typeId,
                            icon: item.icon || "",
                            description: item.description || "",
                            handler: item.handler || null,
                            parseConfig: item.parseConfig || null
                        });
                    }
                }
            }
            else if (configData.sites && Array.isArray(configData.sites)) {
                for (let site of configData.sites) {
                    if (site.name) {
                        let typeId = site.url || site.api || site.key || site.name;
                        if (typeId && !typeId.match(/^https?:\/\//i)) {
                            typeId = resolvePath(typeId, basePath);
                        }
                        classes.push({
                            type_name: site.name,
                            type_id: typeId,
                            icon: site.icon || "",
                            handler: site.handler || null,
                            parseConfig: site.parseConfig || null
                        });
                    }
                }
            }
            else if (configData.categories && Array.isArray(configData.categories)) {
                for (let cat of configData.categories) {
                    if (cat.name) {
                        let typeId = cat.url || cat.id || cat.name;
                        if (typeId && !typeId.match(/^https?:\/\//i)) {
                            typeId = resolvePath(typeId, basePath);
                        }
                        classes.push({
                            type_name: cat.name,
                            type_id: typeId,
                            icon: cat.icon || "",
                            handler: cat.handler || null,
                            parseConfig: cat.parseConfig || null
                        });
                    }
                }
            }
            else if (typeof configData === 'string') {
                let lines = configData.split(/\r?\n/);
                for (let line of lines) {
                    if (!line.trim()) continue;
                    let parts = line.split(',');
                    if (parts.length >= 2) {
                        classes.push({
                            type_name: parts[0].trim(),
                            type_id: resolvePath(parts[1].trim(), basePath),
                            handler: null
                        });
                    } else if (parts.length === 1 && parts[0].match(/^https?:\/\//i)) {
                        classes.push({
                            type_name: "链接 " + (classes.length + 1),
                            type_id: parts[0].trim(),
                            handler: null
                        });
                    }
                }
            }
        }
    } catch(e) {
        log(`解析 ext 失败: ${e.message}`, "ERROR");
    }

    if (classes.length === 0) {
        log("警告: ext 配置未生成任何分类，请检查配置内容", "WARN");
    }
    return classes;
}

// ==================== 处理器（如 cctv） ====================
function handleCategoryByHandler(handler, tid, pg, context) {
    if (handler === "cctv") {
        let cctvChannels = context.cctvChannels || [];
        if (cctvChannels.length === 0) {
            log("未在 ext 中配置 cctvChannels，返回空", "WARN");
            return [];
        }
        let videos = [];
        for (let ch of cctvChannels) {
            videos.push({
                vod_id: ch.id + "###cctv",
                vod_name: ch.name,
                vod_pic: getRandomCover(ch.name),
                vod_remarks: "📺 直播"
            });
        }
        return videos;
    }
    if (typeof handler === 'function') {
        return handler(tid, pg, context);
    }
    return null;
}

// ==================== 文件处理器（支持合集模式） ====================
function handleFileSource(fileUrl, parseConfig, basePath, asCollection = false) {
    let resolvedUrl = fileUrl;
    if (!resolvedUrl.match(/^https?:\/\//i)) {
        resolvedUrl = resolvePath(fileUrl, basePath);
    }
    if (parseConfig && parseConfig.autoExt && !resolvedUrl.includes('.')) {
        let testUrl = resolvedUrl + parseConfig.autoExt;
        let testContent = fetchSync(testUrl, true);
        if (testContent) {
            resolvedUrl = testUrl;
            log(`自动补全扩展名: ${resolvedUrl}`, "INFO");
        }
    }
    log(`请求文件: ${resolvedUrl}`, "INFO");
    let content = fetchSync(resolvedUrl);
    if (!content) return [];

    let items = [];
    if (parseConfig && parseConfig.type === "json") {
        try {
            let json = JSON.parse(content);
            let dataArr = parseConfig.dataPath ? json[parseConfig.dataPath] : (Array.isArray(json) ? json : (json.list || []));
            for (let item of dataArr) {
                let title = parseConfig.titleField ? item[parseConfig.titleField] : (item.title || item.name);
                let url = parseConfig.urlField ? item[parseConfig.urlField] : (item.url || item.link);
                if (title && url) items.push({ title, url });
            }
        } catch(e) { log("JSON解析失败", "ERROR"); }
    } 
    else if (parseConfig && parseConfig.type === "regex") {
        let regex = new RegExp(parseConfig.pattern, parseConfig.flags || 'g');
        let match;
        while ((match = regex.exec(content)) !== null) {
            let title = match[parseConfig.titleGroup] || "未命名";
            let url = match[parseConfig.urlGroup];
            if (url) items.push({ title, url });
        }
    }
    else {
        items = parseContent(content, { separators: parseConfig?.separators || [',', '\t', '|', '$'] });
    }

    // 合集模式：返回单个条目，vod_id 后缀为 ###file
    if (asCollection && items.length > 0) {
        let collectionName = parseConfig?.collectionName || (fileUrl.split('/').pop().replace(/\.(txt|m3u8?|json)$/i, '') + " 合集");
        let vod_id = resolvedUrl + "###file";
        return [{
            vod_id: vod_id,
            vod_name: collectionName,
            vod_pic: getRandomCover(collectionName),
            vod_remarks: `共${items.length}集`
        }];
    }

    // 非合集模式：每个资源一个条目
    let videos = [];
    let fileBase = resolvedUrl.substring(0, resolvedUrl.lastIndexOf('/') + 1);
    for (let item of items) {
        if (item.url) {
            let link = item.url.match(/^https?:\/\//i) ? item.url : resolvePath(item.url, fileBase);
            videos.push({
                vod_id: link + "###music",
                vod_name: item.title || "未命名",
                vod_pic: getRandomCover(item.title),
                vod_remarks: getFileType(link)
            });
        }
    }
    return videos;
}

// ==================== 对外接口 ====================
function init(extend) {
    log(`========== 爬虫初始化（合集模式支持） ==========`, "INFO");
    extBasePath = defaultBasePath;
    if (extend && typeof extend === 'string' && extend.match(/^https?:\/\//i)) {
        extBasePath = extend.substring(0, extend.lastIndexOf('/') + 1);
    }
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
    log(`category: tid=${tid}, pg=${pg}`, "DEBUG");
    if (pg >= 2) {
        return JSON.stringify({ list: [], page: pg, pagecount: 1, limit: 90, total: 0 });
    }

    let classConfig = dynamicClasses.find(c => c.type_id === tid || c.type_name === tid);
    if (!classConfig) {
        log(`未找到分类配置: ${tid}`, "WARN");
        return JSON.stringify({ list: [], page: pg, pagecount: 0, total: 0 });
    }

    let videos = [];
    let handler = classConfig.handler;
    let parseConfig = classConfig.parseConfig || {};
    let collectionMode = parseConfig.collectionMode === true;

    if (handler) {
        let context = { 
            cctvChannels: parseConfig.cctvChannels || [], 
            basePath: extBasePath,
            tid, pg 
        };
        let result = handleCategoryByHandler(handler, tid, pg, context);
        if (result) videos = result;
        else log(`处理器 ${handler} 未返回数据`, "WARN");
    }

    if (videos.length === 0) {
        let fileUrl = classConfig.type_id;
        videos = handleFileSource(fileUrl, parseConfig, extBasePath, collectionMode);
    }

    return JSON.stringify({
        list: videos,
        page: pg,
        pagecount: 1,
        limit: 90,
        total: videos.length
    });
}

function detail(vodId) {
    log(`detail: ${vodId}`, "DEBUG");
    let parts = vodId.split('###');
    if (parts.length < 2) return JSON.stringify({ list: [] });
    let videoId = parts[0];
    let type = parts[1];

    // 合集类型（文件集合）
    if (type === "file") {
        let fileUrl = videoId;
        if (!fileUrl.match(/^https?:\/\//i)) fileUrl = resolvePath(fileUrl, extBasePath);
        let content = fetchSync(fileUrl);
        if (!content) return JSON.stringify({ list: [] });
        let baseDir = fileUrl.substring(0, fileUrl.lastIndexOf('/') + 1);
        let items = [];

        // JSON
        if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
            try {
                let json = JSON.parse(content);
                let arr = Array.isArray(json) ? json : (json.list || json.data || []);
                for (let item of arr) {
                    let title = item.title || item.name || "未命名";
                    let url = item.url || item.link || item.src || item.play_url;
                    if (url) {
                        if (!url.match(/^https?:\/\//i)) url = resolvePath(url, baseDir);
                        items.push(`${title}$${url}`);
                    }
                }
            } catch(e) {}
        }
        // M3U
        if (items.length === 0 && content.includes("#EXTM3U")) {
            let lines = content.split(/\r?\n/);
            let currentTitle = "";
            for (let line of lines) {
                line = line.trim();
                if (line.startsWith("#EXTINF:")) {
                    let match = line.match(/#EXTINF:.*?,(.*)/);
                    if (match) currentTitle = match[1].trim();
                } else if (line && !line.startsWith("#")) {
                    if (line.match(/^https?:\/\//i)) {
                        items.push(`${currentTitle || "直播流"}$${line}`);
                        currentTitle = "";
                    }
                }
            }
        }
        // 通用分隔符
        if (items.length === 0) {
            let separators = [',', '\t', '|', '$'];
            let parsed = parseContent(content, { separators });
            for (let p of parsed) {
                items.push(`${p.title}$${p.url}`);
            }
        }

        if (items.length === 0) return JSON.stringify({ list: [] });
        let playUrl = items.join("#");
        let firstTitle = items[0].split('$')[0] || "媒体合集";
        let vod = {
            vod_id: vodId,
            vod_name: firstTitle,
            vod_pic: getRandomCover(firstTitle),
            vod_play_from: "播放列表",
            vod_play_url: playUrl
        };
        return JSON.stringify({ list: [vod] });
    }

    // 原有 cctv 直播
    if (type === "cctv") {
        let classConfig = dynamicClasses.find(c => c.handler === "cctv");
        let channels = classConfig?.parseConfig?.cctvChannels || [];
        let channel = channels.find(ch => ch.id === videoId);
        let streamUrl = channel ? channel.url : "";
        let vod = {
            vod_id: videoId,
            vod_name: channel ? channel.name : "央视直播",
            vod_pic: getRandomCover("cctv"),
            vod_play_from: "央视直播",
            vod_play_url: streamUrl ? ("直播流$" + streamUrl) : ""
        };
        return JSON.stringify({ list: [vod] });
    } else {
        let title = decodeURIComponent(videoId.split('/').pop().split('.')[0] || "媒体播放");
        let vod = {
            vod_id: videoId,
            vod_name: title,
            vod_pic: getRandomCover(title),
            vod_play_from: "播放源",
            vod_play_url: "播放$" + videoId
        };
        return JSON.stringify({ list: [vod] });
    }
}

function play(flag, id, vipFlags) {
    log(`play: ${id}`, "DEBUG");
    return JSON.stringify({ parse: 0, url: id });
}

function search(keyword, page) {
    return JSON.stringify({ list: [] });
}

__JS_SPIDER__ = { init, home, homeVod, category, detail, play, search };