// ==================== 完全动态爬虫（零硬编码） ====================
// 版本: 12.0.0
// 说明: 所有配置均从 ext 参数动态获取，包括 basePath、分类、解析规则、特殊处理器等

const HTTP_HEADER = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
};

// ==================== 全局变量 ====================
let globalConfig = null;       // 存储解析后的配置对象
let extBasePath = "";          // ext 文件所在的基础路径（用于解析相对路径）
let cache = {};
let debugMode = true;

// ==================== 日志 ====================
function log(msg, level = "INFO") {
    if (!debugMode && level === "DEBUG") return;
    console.log(`[${level}] ${msg}`);
}

// ==================== 网络请求 ====================
function fetchSync(url, useCache = true) {
    if (useCache && cache[url]) return cache[url];
    try {
        log(`请求: ${url}`, "DEBUG");
        let response = req(url, { method: 'GET', headers: HTTP_HEADER });
        let content = (typeof response === 'string') ? response : (response?.content || null);
        if (content && useCache) cache[url] = content;
        return content;
    } catch (e) {
        log(`请求失败: ${url} - ${e.message}`, "ERROR");
        return null;
    }
}

// ==================== 路径解析（无硬编码） ====================
function resolvePath(path, basePath) {
    if (!path) return "";
    if (path.match(/^https?:\/\//i)) return path;
    if (path.startsWith('data:')) return path;
    if (!basePath) {
        log(`无法解析相对路径 "${path}"，未提供 basePath`, "WARN");
        return path;
    }
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

// ==================== 文本内容解析 ====================
function parseTextContent(content, separators = [',', '\t', '|', '$']) {
    let items = [];
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

// ==================== 媒体类型图标 ====================
function getFileTypeIcon(url) {
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

// ==================== 随机封面生成（可配置样式） ====================
function getRandomCover(title, coverConfig) {
    if (coverConfig && coverConfig.type === "fixed" && coverConfig.url) {
        return coverConfig.url;
    }
    let hash = 0;
    for (let i = 0; i < (title || "").length; i++) hash = ((hash << 5) - hash) + title.charCodeAt(i);
    let themes = coverConfig?.themes || ["music", "nature", "abstract", "art", "film"];
    let theme = themes[Math.abs(hash) % themes.length];
    let baseUrl = coverConfig?.baseUrl || "https://picsum.photos";
    let width = coverConfig?.width || 200;
    let height = coverConfig?.height || 300;
    return `${baseUrl}/${width}/${height}?random=${Math.abs(hash) % 100}&theme=${theme}`;
}

// ==================== 解析 ext 配置（完全动态） ====================
function parseExtConfig(extParam) {
    let config = { classes: [], basePath: "", coverConfig: {}, customHandlers: {} };
    if (!extParam) return config;

    try {
        let rawConfig = null;
        // ext 是 URL -> 下载
        if (typeof extParam === 'string' && extParam.match(/^https?:\/\//i)) {
            let content = fetchSync(extParam);
            if (content) {
                try { rawConfig = JSON.parse(content); } catch(e) { rawConfig = content; }
            }
            // 记录 ext 文件的基础路径
            config.basePath = extParam.substring(0, extParam.lastIndexOf('/') + 1);
        }
        // ext 是 JSON 字符串
        else if (typeof extParam === 'string' && (extParam.trim().startsWith('{') || extParam.trim().startsWith('['))) {
            try { rawConfig = JSON.parse(extParam); } catch(e) { rawConfig = extParam; }
        }
        // ext 已经是对象
        else if (typeof extParam === 'object') {
            rawConfig = extParam;
        }
        // 纯文本
        else if (typeof extParam === 'string') {
            rawConfig = extParam;
        }

        // 处理原始配置，提取分类
        if (rawConfig) {
            // 全局 basePath（如果配置中指定，则覆盖从 URL 推导的）
            if (rawConfig.basePath) config.basePath = rawConfig.basePath;
            if (rawConfig.cover) config.coverConfig = rawConfig.cover;
            if (rawConfig.customHandlers) config.customHandlers = rawConfig.customHandlers;

            // 提取分类列表
            let sitesList = null;
            if (Array.isArray(rawConfig)) sitesList = rawConfig;
            else if (rawConfig.sites && Array.isArray(rawConfig.sites)) sitesList = rawConfig.sites;
            else if (rawConfig.categories && Array.isArray(rawConfig.categories)) sitesList = rawConfig.categories;
            else if (rawConfig.list && Array.isArray(rawConfig.list)) sitesList = rawConfig.list;

            if (sitesList) {
                for (let item of sitesList) {
                    if (item.name) {
                        let typeId = item.url || item.typeId || item.id || item.name;
                        config.classes.push({
                            type_name: item.name,
                            type_id: typeId,
                            icon: item.icon || "",
                            description: item.description || "",
                            handler: item.handler || null,
                            parseConfig: item.parseConfig || {}
                        });
                    }
                }
            } else if (typeof rawConfig === 'string') {
                // 纯文本每行: 名称,URL
                let lines = rawConfig.split(/\r?\n/);
                for (let line of lines) {
                    if (!line.trim()) continue;
                    let parts = line.split(',');
                    if (parts.length >= 2) {
                        config.classes.push({
                            type_name: parts[0].trim(),
                            type_id: parts[1].trim(),
                            handler: null,
                            parseConfig: {}
                        });
                    }
                }
            }
        }
    } catch(e) {
        log(`解析 ext 失败: ${e.message}`, "ERROR");
    }
    return config;
}

// ==================== 动态处理器分发 ====================
function invokeCustomHandler(handlerName, context, customHandlers) {
    if (!handlerName) return null;
    // 先查找配置中注册的处理器函数（字符串形式）
    let handlerDef = customHandlers[handlerName];
    if (handlerDef) {
        if (typeof handlerDef === 'function') return handlerDef(context);
        if (typeof handlerDef === 'string') {
            try {
                let fn = new Function('ctx', 'return (' + handlerDef + ')(ctx);');
                return fn(context);
            } catch(e) { log(`执行处理器 ${handlerName} 失败: ${e.message}`, "ERROR"); }
        }
    }
    // 内置处理器（仅演示，可扩展）
    if (handlerName === "cctv") {
        // 需要从 parseConfig 中获取 cctvChannels
        let channels = context.parseConfig?.cctvChannels || [];
        return channels.map(ch => ({
            vod_id: ch.id + "###cctv",
            vod_name: ch.name,
            vod_pic: getRandomCover(ch.name, context.coverConfig),
            vod_remarks: "📺 直播"
        }));
    }
    return null;
}

// ==================== 通用文件源处理 ====================
function handleFileSource(fileUrl, parseConfig, basePath, coverConfig) {
    let resolvedUrl = fileUrl;
    if (!resolvedUrl.match(/^https?:\/\//i)) {
        resolvedUrl = resolvePath(fileUrl, basePath);
        if (!resolvedUrl.match(/^https?:\/\//i)) return [];
    }
    // 自动补全扩展名
    if (parseConfig.autoExt && !resolvedUrl.includes('.')) {
        let testUrl = resolvedUrl + parseConfig.autoExt;
        let testContent = fetchSync(testUrl, true);
        if (testContent) resolvedUrl = testUrl;
    }
    log(`请求文件源: ${resolvedUrl}`, "INFO");
    let content = fetchSync(resolvedUrl);
    if (!content) return [];

    let items = [];
    if (parseConfig.type === "json") {
        try {
            let json = JSON.parse(content);
            let dataArr = parseConfig.dataPath ? json[parseConfig.dataPath] : (Array.isArray(json) ? json : (json.list || []));
            for (let item of dataArr) {
                let title = parseConfig.titleField ? item[parseConfig.titleField] : (item.title || item.name);
                let url = parseConfig.urlField ? item[parseConfig.urlField] : (item.url || item.link);
                if (title && url) items.push({ title, url });
            }
        } catch(e) { log("JSON解析失败", "ERROR"); }
    } else if (parseConfig.type === "regex") {
        let regex = new RegExp(parseConfig.pattern, parseConfig.flags || 'g');
        let match;
        while ((match = regex.exec(content)) !== null) {
            let title = match[parseConfig.titleGroup] || "未命名";
            let url = match[parseConfig.urlGroup];
            if (url) items.push({ title, url });
        }
    } else {
        let separators = parseConfig.separators || [',', '\t', '|', '$'];
        items = parseTextContent(content, separators);
    }

    let videos = [];
    let fileBase = resolvedUrl.substring(0, resolvedUrl.lastIndexOf('/') + 1);
    for (let item of items) {
        if (item.url) {
            let link = item.url.match(/^https?:\/\//i) ? item.url : resolvePath(item.url, fileBase);
            videos.push({
                vod_id: link + "###file",
                vod_name: item.title || "未命名",
                vod_pic: getRandomCover(item.title, coverConfig),
                vod_remarks: getFileTypeIcon(link)
            });
        }
    }
    return videos;
}

// ==================== 对外接口 ====================
function init(extend) {
    log(`========== 爬虫初始化 ==========`, "INFO");
    let parsed = parseExtConfig(extend);
    globalConfig = {
        classes: parsed.classes,
        basePath: parsed.basePath,
        coverConfig: parsed.coverConfig,
        customHandlers: parsed.customHandlers
    };
    extBasePath = globalConfig.basePath;
    log(`基础路径: ${extBasePath || "(未提供)"}`, "INFO");
    log(`生成 ${globalConfig.classes.length} 个分类`, "INFO");
}

function home() {
    if (!globalConfig) return JSON.stringify({ class: [], filters: null });
    return JSON.stringify({
        class: globalConfig.classes.map(c => ({ type_name: c.type_name, type_id: c.type_id, icon: c.icon })),
        filters: null
    });
}

function homeVod() {
    return JSON.stringify({ list: [] });
}

function category(tid, pg, filter, extend) {
    pg = parseInt(pg) || 1;
    log(`category: tid=${tid}, pg=${pg}`, "DEBUG");
    if (!globalConfig) return JSON.stringify({ list: [], page: pg, pagecount: 0, total: 0 });
    if (pg >= 2) {
        return JSON.stringify({ list: [], page: pg, pagecount: 1, limit: 90, total: 0 });
    }

    let classConfig = globalConfig.classes.find(c => c.type_id === tid || c.type_name === tid);
    if (!classConfig) {
        log(`未找到分类配置: ${tid}`, "WARN");
        return JSON.stringify({ list: [], page: pg, pagecount: 0, total: 0 });
    }

    let videos = [];
    let handler = classConfig.handler;
    let parseConfig = classConfig.parseConfig || {};

    if (handler) {
        let ctx = {
            tid, pg, filter,
            parseConfig: parseConfig,
            coverConfig: globalConfig.coverConfig,
            basePath: globalConfig.basePath,
            customHandlers: globalConfig.customHandlers
        };
        let result = invokeCustomHandler(handler, ctx, globalConfig.customHandlers);
        if (result && Array.isArray(result)) videos = result;
    }

    if (videos.length === 0) {
        let fileUrl = classConfig.type_id;
        videos = handleFileSource(fileUrl, parseConfig, globalConfig.basePath, globalConfig.coverConfig);
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
    if (!globalConfig) return JSON.stringify({ list: [] });
    let parts = vodId.split('###');
    if (parts.length < 2) return JSON.stringify({ list: [] });
    let videoId = parts[0];
    let type = parts[1];

    if (type === "cctv") {
        // 从分类配置中获取频道信息
        let cctvClass = globalConfig.classes.find(c => c.handler === "cctv");
        let channels = cctvClass?.parseConfig?.cctvChannels || [];
        let channel = channels.find(ch => ch.id === videoId);
        let streamUrl = channel ? channel.url : "";
        let vod = {
            vod_id: videoId,
            vod_name: channel ? channel.name : "央视直播",
            vod_pic: getRandomCover("cctv", globalConfig.coverConfig),
            vod_play_from: "央视直播",
            vod_play_url: streamUrl ? ("直播流$" + streamUrl) : ""
        };
        return JSON.stringify({ list: [vod] });
    } else {
        let title = decodeURIComponent(videoId.split('/').pop().split('.')[0] || "媒体播放");
        let vod = {
            vod_id: videoId,
            vod_name: title,
            vod_pic: getRandomCover(title, globalConfig.coverConfig),
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