// ==================== 零硬编码通用动态爬虫 v18.0 ====================
// 说明：所有分类、解析规则、数据源均由 ext 参数动态提供，无任何内嵌预设。
// 支持的 ext 格式：JSON 对象或指向 JSON 文件的 URL（支持多仓 sites 数组、自定义 handlers）

// 全局配置缓存与调试开关
let dynamicClasses = [];
let extBasePath = "";
let cache = {};
let debugMode = true;

// 日志函数
function log(msg, level = "INFO") {
    if (!debugMode && level === "DEBUG") return;
    console.log(`[${level}] ${msg}`);
}

// 同步网络请求（由 TVBox 环境注入 req 函数）
function fetchSync(url, useCache = true) {
    if (useCache && cache[url] && cache[url].expire > Date.now()) return cache[url].data;
    try {
        let response = req(url, { method: 'GET', headers: { "User-Agent": "Mozilla/5.0" } });
        let content = typeof response === 'string' ? response : (response?.content || "");
        if (content && useCache) cache[url] = { data: content, expire: Date.now() + 600000 };
        return content;
    } catch (e) {
        log(`请求失败: ${url} - ${e.message}`, "ERROR");
        return null;
    }
}

// 智能路径解析（支持相对路径、绝对路径、完整URL）
function resolvePath(path, basePath) {
    if (!path) return "";
    if (path.match(/^https?:\/\//i)) return path;
    if (path.startsWith('data:')) return path;
    let base = basePath || extBasePath;
    if (!base && typeof window !== 'undefined') base = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
    if (!base) return path;
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

// 辅助函数：将文本 content 解析为视频列表（用于 detail 中构建播放串）
function parseTextToPlaylist(content, baseUrl, separators = [',', '|', '$', '\t']) {
    let items = [];
    let lines = content.split(/\r?\n/);
    for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith('#') || line.includes('#genre#')) continue;
        let title = "", url = "";
        let bestSep = null, bestIdx = -1;
        for (let sep of separators) {
            let idx = line.indexOf(sep);
            if (idx > 0 && (bestIdx === -1 || idx < bestIdx)) { bestIdx = idx; bestSep = sep; }
        }
        if (bestSep) {
            title = line.substring(0, bestIdx).trim();
            let rest = line.substring(bestIdx + 1).trim();
            let urlMatch = rest.match(/^(https?:\/\/[^\s]+)/);
            if (urlMatch) url = urlMatch[1];
            else if (rest.match(/^https?:\/\//i)) url = rest;
        } else if (line.match(/^https?:\/\//i)) {
            url = line;
            title = "媒体文件";
        } else {
            let parts = line.split(/\s+/);
            if (parts.length >= 2 && parts[1].match(/^https?:\/\//i)) { title = parts[0]; url = parts[1]; }
        }
        if (url && url.match(/^https?:\/\//i)) {
            if (!url.match(/^https?:\/\//i)) url = resolvePath(url, baseUrl);
            if (!title) title = "媒体文件";
            items.push(`${title}$${url}`);
        }
    }
    return items.join("#");
}

// 根据 ext 配置动态生成分类列表
function parseExtConfig(extParam, basePath) {
    let classes = [];
    try {
        let configData = null;
        if (typeof extParam === 'string' && extParam.match(/^https?:\/\//i)) {
            let content = fetchSync(extParam);
            if (content) {
                try { configData = JSON.parse(content); } catch(e) { configData = content; }
            }
        } else if (typeof extParam === 'string') {
            try { configData = JSON.parse(extParam); } catch(e) { configData = extParam; }
        } else if (typeof extParam === 'object') {
            configData = extParam;
        }
        if (!configData) return classes;

        // 提取站点数组：支持 sites / categories / list 或直接数组
        let sites = [];
        if (Array.isArray(configData)) sites = configData;
        else if (configData.sites && Array.isArray(configData.sites)) sites = configData.sites;
        else if (configData.categories && Array.isArray(configData.categories)) sites = configData.categories;
        else if (configData.list && Array.isArray(configData.list)) sites = configData.list;
        else if (typeof configData === 'string') {
            // 纯文本格式：每行 分类名,URL
            let lines = configData.split(/\r?\n/);
            for (let line of lines) {
                let parts = line.split(',');
                if (parts.length >= 2) {
                    classes.push({
                        type_name: parts[0].trim(),
                        type_id: resolvePath(parts[1].trim(), basePath)
                    });
                }
            }
            return classes;
        }

        for (let item of sites) {
            if (item.name) {
                let typeId = item.url || item.api || item.id || item.name;
                if (typeId && !typeId.match(/^https?:\/\//i)) typeId = resolvePath(typeId, basePath);
                classes.push({
                    type_name: item.name,
                    type_id: typeId,
                    icon: item.icon || "",
                    description: item.description || "",
                    handler: item.handler || null,          // 可选的处理器名称
                    parseConfig: item.parseConfig || null   // 该分类特有的解析配置
                });
            }
        }
    } catch(e) {
        log(`解析 ext 失败: ${e.message}`, "ERROR");
    }
    return classes;
}

// 执行自定义处理器（通过 ext 中的 customHandlers 注册）
function invokeHandler(handlerName, context, customHandlers) {
    if (!handlerName) return null;
    let handler = customHandlers?.[handlerName];
    if (handler) {
        if (typeof handler === 'function') return handler(context);
        if (typeof handler === 'string') {
            try {
                let fn = new Function('ctx', 'return (' + handler + ')(ctx);');
                return fn(context);
            } catch(e) {
                log(`执行处理器 ${handlerName} 失败: ${e.message}`, "ERROR");
            }
        }
    }
    return null;
}

// 通用文件处理器：根据 parseConfig 解析文本/JSON/正则文件，生成视频列表
function handleFileSource(fileUrl, parseConfig, basePath, coverConfig) {
    let resolvedUrl = fileUrl;
    if (!resolvedUrl.match(/^https?:\/\//i)) resolvedUrl = resolvePath(fileUrl, basePath);
    if (!resolvedUrl) return [];
    // 自动补全扩展名（若配置）
    if (parseConfig?.autoExt && !resolvedUrl.includes('.')) {
        let testUrl = resolvedUrl + parseConfig.autoExt;
        let testContent = fetchSync(testUrl, true);
        if (testContent) resolvedUrl = testUrl;
    }
    let content = fetchSync(resolvedUrl);
    if (!content) return [];

    let items = [];
    // JSON 解析
    if (parseConfig?.type === 'json') {
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
    // 正则解析
    else if (parseConfig?.type === 'regex') {
        let regex = new RegExp(parseConfig.pattern, parseConfig.flags || 'g');
        let match;
        while ((match = regex.exec(content)) !== null) {
            let title = match[parseConfig.titleGroup] || "未命名";
            let url = match[parseConfig.urlGroup];
            if (url) items.push({ title, url });
        }
    }
    // 默认文本解析
    else {
        let separators = parseConfig?.separators || [',', '|', '$', '\t'];
        let lines = content.split(/\r?\n/);
        for (let line of lines) {
            line = line.trim();
            if (!line || line.startsWith('#') || line.includes('#genre#')) continue;
            let title = "", url = "";
            let bestSep = null, bestIdx = -1;
            for (let sep of separators) {
                let idx = line.indexOf(sep);
                if (idx > 0 && (bestIdx === -1 || idx < bestIdx)) { bestIdx = idx; bestSep = sep; }
            }
            if (bestSep) {
                title = line.substring(0, bestIdx).trim();
                let rest = line.substring(bestIdx + 1).trim();
                let urlMatch = rest.match(/^(https?:\/\/[^\s]+)/);
                if (urlMatch) url = urlMatch[1];
                else if (rest.match(/^https?:\/\//i)) url = rest;
            } else if (line.match(/^https?:\/\//i)) {
                url = line;
                title = "媒体文件";
            }
            if (url && url.match(/^https?:\/\//i)) {
                if (!url.match(/^https?:\/\//i)) url = resolvePath(url, resolvedUrl.substring(0, resolvedUrl.lastIndexOf('/')+1));
                if (!title) title = "媒体文件";
                items.push({ title, url });
            }
        }
    }

    // 生成最终视频列表（作为 category 的一级展示）
    let videos = [];
    for (let item of items) {
        if (item.url) {
            videos.push({
                vod_id: item.url + "###single",   // 使用 ###single 标记单集
                vod_name: item.title,
                vod_pic: getCover(item.title, item.url, coverConfig),
                vod_remarks: getFileType(item.url)
            });
        }
    }
    return videos;
}

// 辅助：获取文件类型图标
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

// 辅助：生成封面（全部可配置）
function getCover(title, url, coverConfig) {
    if (coverConfig && coverConfig.type === 'fixed' && coverConfig.url) return coverConfig.url;
    let hash = 0;
    let str = (title || "media") + (url || "");
    for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash) + str.charCodeAt(i);
    let baseUrl = coverConfig?.baseUrl || "https://picsum.photos";
    let width = coverConfig?.width || 200;
    let height = coverConfig?.height || 300;
    return `${baseUrl}/${width}/${height}?random=${Math.abs(hash) % 1000}`;
}

// ==================== 必须导出的标准接口 ====================
let globalExtConfig = null;  // 存储完整的 ext 配置（含 customHandlers, coverConfig 等）

function init(extend) {
    log("零硬编码爬虫初始化", "INFO");
    // 解析 ext，同时提取基础路径
    if (typeof extend === 'string' && extend.match(/^https?:\/\//i)) {
        let lastSlash = extend.lastIndexOf('/');
        if (lastSlash > 0) extBasePath = extend.substring(0, lastSlash + 1);
    }
    let configData = null;
    try {
        if (typeof extend === 'string' && extend.match(/^https?:\/\//i)) {
            let content = fetchSync(extend);
            if (content) configData = JSON.parse(content);
        } else if (typeof extend === 'string') {
            configData = JSON.parse(extend);
        } else if (typeof extend === 'object') {
            configData = extend;
        }
    } catch(e) {}
    globalExtConfig = configData || {};
    // 从 ext 中提取 basePath（可以覆盖从 URL 推导的路径）
    if (globalExtConfig.basePath) extBasePath = globalExtConfig.basePath;
    dynamicClasses = parseExtConfig(extend, extBasePath);
    log(`生成 ${dynamicClasses.length} 个分类`, "INFO");
}

function home() {
    return JSON.stringify({
        class: dynamicClasses.map(c => ({ type_name: c.type_name, type_id: c.type_id, icon: c.icon })),
        filters: null
    });
}

function homeVod() {
    return JSON.stringify({ list: [] });
}

function category(tid, pg, filter, extend) {
    pg = parseInt(pg) || 1;
    log(`category: ${tid}, page=${pg}`, "DEBUG");
    // 查找分类配置
    let classConfig = dynamicClasses.find(c => c.type_id === tid || c.type_name === tid);
    if (!classConfig) {
        log(`未找到分类配置: ${tid}`, "WARN");
        return JSON.stringify({ list: [], page: pg, pagecount: 0, total: 0 });
    }
    let videos = [];
    // 优先使用 handler（自定义处理器）
    let handler = classConfig.handler;
    let parseConfig = classConfig.parseConfig || {};
    let customHandlers = globalExtConfig.customHandlers || {};
    let coverConfig = globalExtConfig.cover || {};
    if (handler) {
        let ctx = { tid, pg, filter, parseConfig, coverConfig, basePath: extBasePath, customHandlers, globalExtConfig };
        let result = invokeHandler(handler, ctx, customHandlers);
        if (result && Array.isArray(result)) videos = result;
    }
    // 无 handler 或未返回结果，则作为普通文件源处理
    if (videos.length === 0) {
        let fileUrl = classConfig.type_id;
        videos = handleFileSource(fileUrl, parseConfig, extBasePath, coverConfig);
    }
    // 简单分页（每页 50 条）
    const PAGE_SIZE = 50;
    let start = (pg - 1) * PAGE_SIZE;
    let pagedList = videos.slice(start, start + PAGE_SIZE);
    let total = videos.length;
    let pagecount = Math.ceil(total / PAGE_SIZE);
    return JSON.stringify({
        list: pagedList,
        page: pg,
        pagecount: pagecount,
        limit: PAGE_SIZE,
        total: total
    });
}

function detail(vodId) {
    log(`detail: ${vodId}`, "DEBUG");
    let parts = vodId.split('###');
    if (parts.length < 2) return JSON.stringify({ list: [] });
    let id = parts[0];
    let type = parts[1];
    // 单集播放
    if (type === "single") {
        let title = id.split('/').pop().split('.')[0] || "媒体";
        title = decodeURIComponent(title);
        let vod = {
            vod_id: id,
            vod_name: title,
            vod_pic: getCover(title, id, globalExtConfig.cover),
            vod_play_from: "播放源",
            vod_play_url: "播放$" + id
        };
        return JSON.stringify({ list: [vod] });
    }
    // 文件集（如 txt/m3u 解析出的多集）
    else if (type === "file") {
        let fileUrl = id;
        if (!fileUrl.match(/^https?:\/\//i)) fileUrl = resolvePath(fileUrl, extBasePath);
        let content = fetchSync(fileUrl);
        if (!content) return JSON.stringify({ list: [] });
        let baseDir = fileUrl.substring(0, fileUrl.lastIndexOf('/') + 1);
        let playUrl = "";
        // 尝试 JSON 解析
        if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
            try {
                let json = JSON.parse(content);
                let arr = Array.isArray(json) ? json : (json.list || json.data || []);
                let items = [];
                for (let item of arr) {
                    let title = item.title || item.name || "未命名";
                    let url = item.url || item.link || item.src || item.play_url;
                    if (url) {
                        if (!url.match(/^https?:\/\//i)) url = resolvePath(url, baseDir);
                        items.push(`${title}$${url}`);
                    }
                }
                playUrl = items.join("#");
            } catch(e) {}
        }
        if (!playUrl) {
            let separators = globalExtConfig.separators || [',', '|', '$', '\t'];
            playUrl = parseTextToPlaylist(content, baseDir, separators);
        }
        if (!playUrl) return JSON.stringify({ list: [] });
        let firstTitle = playUrl.split('#')[0].split('$')[0] || "媒体合集";
        let vod = {
            vod_id: fileUrl,
            vod_name: firstTitle,
            vod_pic: getCover(firstTitle, fileUrl, globalExtConfig.cover),
            vod_play_from: "播放列表",
            vod_play_url: playUrl
        };
        return JSON.stringify({ list: [vod] });
    }
    return JSON.stringify({ list: [] });
}

function play(flag, id, vipFlags) {
    log(`play: ${id}`, "DEBUG");
    return JSON.stringify({ parse: 0, url: id });
}

function search(keyword, page) {
    return JSON.stringify({ list: [] });
}

// 导出标准接口
__JS_SPIDER__ = { init, home, homeVod, category, detail, play, search };