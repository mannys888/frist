// ==================== 零硬编码通用动态爬虫 v20 (完整连续剧支持) ====================
// 新增：分类配置 mode: "series" 自动生成剧集列表，detail 中构建 "标题$URL" 并用 # 连接

let dynamicClasses = [];
let extBasePath = "";
let cache = {};
let debugMode = true;
let globalHeaders = { "User-Agent": "Mozilla/5.0" };
let globalCookies = "";

const DEFAULT_RETRY_COUNT = 2;
const DEFAULT_RETRY_DELAY = 500;

function log(msg, level = "INFO") {
    if (!debugMode && level === "DEBUG") return;
    console.log(`[${level}] ${msg}`);
}

function fetchSync(url, useCache = true, retry = 0, options = {}) {
    if (!url) return null;
    const maxRetry = options.maxRetry !== undefined ? options.maxRetry : DEFAULT_RETRY_COUNT;
    const retryDelay = options.retryDelay || DEFAULT_RETRY_DELAY;
    if (useCache && cache[url] && cache[url].expire > Date.now()) return cache[url].data;
    try {
        let headers = { ...globalHeaders, ...(options.headers || {}) };
        if (globalCookies) headers["Cookie"] = globalCookies;
        let response = req(url, { method: options.method || 'GET', headers: headers });
        let content = typeof response === 'string' ? response : (response?.content || "");
        if (content && useCache) {
            let ttl = options.ttl || 600000;
            cache[url] = { data: content, expire: Date.now() + ttl };
        }
        return content;
    } catch (e) {
        log(`请求失败 (${retry+1}/${maxRetry+1}): ${url} - ${e.message}`, "WARN");
        if (retry < maxRetry) {
            sleep(retryDelay);
            return fetchSync(url, useCache, retry + 1, options);
        }
        log(`请求最终失败: ${url}`, "ERROR");
        return null;
    }
}

function sleep(ms) { for (let start = Date.now(); Date.now() - start < ms; ) { /* 同步延迟 */ } }

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

function parseByType(content, parseConfig, baseUrl) {
    let items = [];
    if (!parseConfig) parseConfig = {};
    if (parseConfig.type === "json") {
        try {
            let json = typeof content === 'string' ? JSON.parse(content) : content;
            let dataArr = parseConfig.dataPath ? json[parseConfig.dataPath] : (Array.isArray(json) ? json : (json.list || []));
            for (let item of dataArr) {
                let title = parseConfig.titleField ? item[parseConfig.titleField] : (item.title || item.name);
                let url = parseConfig.urlField ? item[parseConfig.urlField] : (item.url || item.link);
                if (title && url) items.push({ title, url });
            }
        } catch(e) { log("JSON解析失败", "ERROR"); }
    }
    else if (parseConfig.type === "regex") {
        let regex = new RegExp(parseConfig.pattern, parseConfig.flags || 'g');
        let match;
        while ((match = regex.exec(content)) !== null) {
            let title = match[parseConfig.titleGroup] || "未命名";
            let url = match[parseConfig.urlGroup];
            if (url) items.push({ title, url });
        }
    }
    else if (parseConfig.type === "m3u") {
        let lines = content.split(/\r?\n/);
        let currentTitle = "";
        for (let line of lines) {
            line = line.trim();
            if (line.startsWith("#EXTINF:")) {
                let match = line.match(/#EXTINF:.*?,(.*)/);
                if (match) currentTitle = match[1].trim();
            } else if (line && !line.startsWith("#")) {
                if (line.match(/^https?:\/\//i)) {
                    items.push({ title: currentTitle || "直播流", url: line });
                    currentTitle = "";
                }
            }
        }
    }
    else {
        let separators = parseConfig.separators || [',', '|', '$', '\t'];
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
                if (!url.match(/^https?:\/\//i)) url = resolvePath(url, baseUrl);
                if (!title) title = "媒体文件";
                items.push({ title, url });
            }
        }
    }
    return items;
}

function applyPostProcess(items, postProcess, coverConfig) {
    if (!postProcess) return items;
    if (typeof postProcess === 'function') return postProcess(items);
    if (typeof postProcess === 'string') {
        try {
            let fn = new Function('items', 'coverConfig', 'return (' + postProcess + ')(items, coverConfig);');
            return fn(items, coverConfig);
        } catch(e) { log("后处理函数执行失败: " + e.message, "ERROR"); }
    }
    if (postProcess.filter) {
        let re = new RegExp(postProcess.filter.regex || ".*");
        items = items.filter(item => re.test(item[postProcess.filter.field || "title"]));
    }
    if (postProcess.sort) {
        let field = postProcess.sort.field || "title";
        let order = postProcess.sort.order === "desc" ? -1 : 1;
        items.sort((a,b) => order * (a[field] > b[field] ? 1 : -1));
    }
    if (postProcess.limit) items = items.slice(0, postProcess.limit);
    return items;
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

function handleFileSource(fileUrl, parseConfig, basePath, coverConfig, pg = 1) {
    let resolvedUrl = fileUrl;
    if (!resolvedUrl.match(/^https?:\/\//i)) resolvedUrl = resolvePath(fileUrl, basePath);
    if (!resolvedUrl) return { list: [], total: 0, nextPage: null };
    
    let requestOptions = { headers: parseConfig.headers || {}, method: parseConfig.method || 'GET' };
    if (parseConfig.ttl) requestOptions.ttl = parseConfig.ttl;
    if (parseConfig.maxRetry !== undefined) requestOptions.maxRetry = parseConfig.maxRetry;
    
    let content = fetchSync(resolvedUrl, true, 0, requestOptions);
    if (!content) return { list: [], total: 0, nextPage: null };
    
    let items = parseByType(content, parseConfig, resolvedUrl.substring(0, resolvedUrl.lastIndexOf('/')+1));
    items = applyPostProcess(items, parseConfig.postProcess, coverConfig);
    
    let total = items.length;
    let pageSize = parseConfig.pageSize || 50;
    let start = (pg - 1) * pageSize;
    let pagedItems = items.slice(start, start + pageSize);
    let nextPage = null;
    if (parseConfig.pagination && start + pageSize < total) {
        let nextUrl = parseConfig.pagination.nextUrl;
        if (nextUrl) {
            nextPage = resolvePath(nextUrl.replace('{page}', pg+1), basePath);
        } else {
            nextPage = pg + 1;
        }
    }
    
    // 关键修改：根据 mode 决定后缀
    let modeSuffix = (parseConfig.mode === 'series') ? 'series' : 'single';
    
    let videos = pagedItems.map(item => {
        let url = item.url;
        if (!url.match(/^https?:\/\//i)) {
            let baseDir = resolvedUrl.substring(0, resolvedUrl.lastIndexOf('/') + 1);
            url = resolvePath(url, baseDir);
        }
        return {
            vod_id: url + "###" + modeSuffix,
            vod_name: item.title || "未命名",
            vod_pic: getCover(item.title, url, coverConfig),
            vod_remarks: getFileType(url)
        };
    });
    
    return { list: videos, total: total, nextPage: nextPage };
}

function parseExtConfig(extParam, basePath) {
    let classes = [];
    try {
        let configData = null;
        if (typeof extParam === 'string' && extParam.match(/^https?:\/\//i)) {
            let content = fetchSync(extParam, true);
            if (content) {
                try { configData = JSON.parse(content); } catch(e) { configData = content; }
            }
        } else if (typeof extParam === 'string') {
            try { configData = JSON.parse(extParam); } catch(e) { configData = extParam; }
        } else if (typeof extParam === 'object') {
            configData = extParam;
        }
        if (!configData) return classes;
        
        if (configData.headers) Object.assign(globalHeaders, configData.headers);
        if (configData.cookies) globalCookies = configData.cookies;
        if (configData.debug !== undefined) debugMode = configData.debug;
        
        let sites = [];
        if (Array.isArray(configData)) sites = configData;
        else if (configData.sites && Array.isArray(configData.sites)) sites = configData.sites;
        else if (configData.categories && Array.isArray(configData.categories)) sites = configData.categories;
        else if (configData.list && Array.isArray(configData.list)) sites = configData.list;
        else if (typeof configData === 'string' && configData.includes('\n')) {
            let lines = configData.split(/\r?\n/);
            for (let line of lines) {
                let parts = line.split(',');
                if (parts.length >= 2) {
                    classes.push({
                        type_name: parts[0].trim(),
                        type_id: resolvePath(parts[1].trim(), basePath),
                        // 可默认为连续剧？由配置决定
                        parseConfig: { mode: 'single' } // 默认单集
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
                    handler: item.handler || null,
                    parseConfig: item.parseConfig || null   // 包含 mode, 解析规则等
                });
            }
        }
    } catch(e) {
        log(`解析 ext 失败: ${e.message}`, "ERROR");
    }
    return classes;
}

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

let globalExtConfig = null;

function init(extend) {
    log("零硬编码爬虫 v20 (完整连续剧支持) 初始化", "INFO");
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
    } catch(e) {
        log("ext 解析警告: " + e.message, "WARN");
    }
    globalExtConfig = configData || {};
    if (globalExtConfig.basePath) extBasePath = globalExtConfig.basePath;
    dynamicClasses = parseExtConfig(extend, extBasePath);
    log(`生成 ${dynamicClasses.length} 个分类`, "INFO");
    if (dynamicClasses.length === 0) {
        log("警告：没有解析到任何分类，请检查 ext 配置格式", "WARN");
    }
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
    let classConfig = dynamicClasses.find(c => c.type_id === tid || c.type_name === tid);
    if (!classConfig) {
        log(`未找到分类配置: ${tid}`, "WARN");
        return JSON.stringify({ list: [], page: pg, pagecount: 0, total: 0 });
    }
    let videos = [];
    let total = 0;
    let pagecount = 1;
    let handler = classConfig.handler;
    let parseConfig = classConfig.parseConfig || {};
    let customHandlers = globalExtConfig.customHandlers || {};
    let coverConfig = globalExtConfig.cover || {};
    if (handler) {
        let ctx = { tid, pg, filter, parseConfig, coverConfig, basePath: extBasePath, customHandlers, globalExtConfig };
        let result = invokeHandler(handler, ctx, customHandlers);
        if (result && Array.isArray(result)) videos = result;
    }
    if (videos.length === 0) {
        let fileUrl = classConfig.type_id;
        let result = handleFileSource(fileUrl, parseConfig, extBasePath, coverConfig, pg);
        videos = result.list;
        total = result.total;
        pagecount = result.nextPage ? Math.ceil(total / (parseConfig.pageSize || 50)) : pg;
    } else {
        total = videos.length;
        pagecount = Math.ceil(total / (parseConfig.pageSize || 50));
    }
    return JSON.stringify({
        list: videos,
        page: pg,
        pagecount: pagecount,
        limit: parseConfig.pageSize || 50,
        total: total
    });
}

// 解析剧集列表（支持传入专用 parseConfig）
function parseEpisodes(content, baseUrl, parseConfig) {
    if (parseConfig && Object.keys(parseConfig).length > 0) {
        return parseByType(content, parseConfig, baseUrl);
    }
    // 自动检测模式
    let trimmed = content.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            let json = JSON.parse(trimmed);
            let episodes = json.episodes || json.list || json.data || json.items || (Array.isArray(json) ? json : []);
            let items = [];
            for (let ep of episodes) {
                let title = ep.title || ep.name || ep.episode || "第" + (ep.index || '?') + "集";
                let url = ep.url || ep.link || ep.src || ep.play_url;
                if (title && url) items.push({ title, url });
            }
            if (items.length) return items;
        } catch(e) {}
    }
    if (content.includes("#EXTM3U")) {
        return parseByType(content, { type: "m3u" }, baseUrl);
    }
    return parseByType(content, { separators: [',', '|', '$', '\t'] }, baseUrl);
}

function detail(vodId) {
    log(`detail: ${vodId}`, "DEBUG");
    let parts = vodId.split('###');
    if (parts.length < 2) return JSON.stringify({ list: [] });
    let id = parts[0];
    let type = parts[1];
    
    // 单集视频
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
    // 文件列表（旧版兼容）
    else if (type === "file") {
        let fileUrl = id;
        if (!fileUrl.match(/^https?:\/\//i)) fileUrl = resolvePath(fileUrl, extBasePath);
        let content = fetchSync(fileUrl);
        if (!content) return JSON.stringify({ list: [] });
        let baseDir = fileUrl.substring(0, fileUrl.lastIndexOf('/') + 1);
        let playUrl = "";
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
        if (!playUrl && content.includes("#EXTM3U")) {
            let items = parseByType(content, { type: "m3u" }, baseDir);
            playUrl = items.map(item => `${item.title}$${item.url}`).join("#");
        }
        if (!playUrl) {
            let separators = globalExtConfig.separators || [',', '|', '$', '\t'];
            playUrl = parseByType(content, { separators: separators }, baseDir)
                        .map(item => `${item.title}$${item.url}`).join("#");
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
    // ========== 连续剧模式（生成 # 连接的播放列表） ==========
    else if (type === "series") {
        let seriesUrl = id;
        if (!seriesUrl.match(/^https?:\/\//i)) seriesUrl = resolvePath(seriesUrl, extBasePath);
        log(`连续剧模式，解析剧集源: ${seriesUrl}`, "INFO");
        
        // 获取该分类的全局配置（可能在 ext 中定义了 series 字段）
        let seriesGlobal = globalExtConfig.series || {};
        // 尝试从 parseConfig 中获取（可能通过某种方式传入，这里简化：从缓存中根据 URL 匹配 parseConfig 较复杂，实际可从 context 传）
        // 为了灵活性，允许在 ext 中配置 seriesParse 规则
        let parseConfig = seriesGlobal.parseConfig || null;
        
        let requestOptions = { 
            headers: seriesGlobal.headers || {}, 
            method: seriesGlobal.method || 'GET',
            maxRetry: seriesGlobal.maxRetry,
            ttl: seriesGlobal.ttl
        };
        let content = fetchSync(seriesUrl, true, 0, requestOptions);
        if (!content) {
            log("连续剧源获取失败", "ERROR");
            return JSON.stringify({ list: [] });
        }
        
        let baseDir = seriesUrl.substring(0, seriesUrl.lastIndexOf('/') + 1);
        let episodes = parseEpisodes(content, baseDir, parseConfig);
        
        // 后处理
        if (seriesGlobal.postProcess) {
            episodes = applyPostProcess(episodes, seriesGlobal.postProcess, globalExtConfig.cover);
        }
        
        if (!episodes || episodes.length === 0) {
            log("未解析到任何剧集", "WARN");
            return JSON.stringify({ list: [] });
        }
        
        // 构建播放列表：格式 "第1集$url1#第2集$url2"
        let videoList = [];
        for (let ep of episodes) {
            let epUrl = ep.url;
            if (!epUrl.match(/^https?:\/\//i)) epUrl = resolvePath(epUrl, baseDir);
            let epTitle = ep.title || "第" + (ep.index || "?") + "集";
            videoList.push(`${epTitle}$${epUrl}`);
        }
        let playUrl = videoList.join("#");
        
        // 确定显示名称
        let seriesTitle = seriesGlobal.title;
        if (!seriesTitle) {
            let urlParts = seriesUrl.split('/');
            let lastPart = urlParts.pop() || "连续剧";
            seriesTitle = decodeURIComponent(lastPart).replace(/\.(json|txt|m3u8?)$/i, '');
        }
        
        let vod = {
            vod_id: seriesUrl + "###series",
            vod_name: seriesTitle,
            vod_pic: getCover(seriesTitle, seriesUrl, globalExtConfig.cover),
            vod_play_from: seriesGlobal.playFrom || seriesTitle,   // 播放源名称
            vod_play_url: playUrl                                   // # 连接的剧集列表
        };
        
        log(`成功生成连续剧 "${seriesTitle}"，共 ${episodes.length} 集，播放列表长度: ${playUrl.length}`, "INFO");
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

__JS_SPIDER__ = { init, home, homeVod, category, detail, play, search };