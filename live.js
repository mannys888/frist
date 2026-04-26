// ==================== 终极通用动态爬虫 v11.0 ====================
// 升级内容:
// 1. 支持分页 (category 根据 pg 参数返回对应页数据)
// 2. 相对路径解析更完善 (基于 ext 配置文件所在目录)
// 3. 缓存带 TTL (10分钟过期)
// 4. 增加搜索功能 (基于已加载的文件内容)
// 5. 封面生成降级: 优先使用本地 data:image 文本封面
// 6. 播放列表优化: 支持同一文件内多个地址合并为多集

const header = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
};

// ==================== 全局变量 ====================
let dynamicClasses = [];          // 分类列表 [{ type_id, type_name, icon }]
let extBasePath = "";             // ext配置文件所在目录 (用于解析相对路径)
let defaultBasePath = "https://raw.githubusercontent.com/mannys888/frist/refs/heads/main/";
let cache = {};                   // 缓存 { url: { data, expire } }
let debugMode = true;             // 调试模式
const CACHE_TTL = 10 * 60 * 1000; // 10分钟

// ==================== 日志系统 ====================
function log(msg, level = "INFO") {
    if (!debugMode && level === "DEBUG") return;
    console.log(`[${level}] ${msg}`);
}

// ==================== 工具函数 ====================

/**
 * 带缓存的同步请求
 * @param {string} url - 请求地址
 * @param {boolean} useCache - 是否使用缓存
 * @returns {string|null} 响应内容
 */
function fetchSync(url, useCache = true) {
    if (useCache && cache[url] && cache[url].expire > Date.now()) {
        log(`缓存命中: ${url}`, "DEBUG");
        return cache[url].data;
    }
    try {
        log(`请求: ${url}`, "DEBUG");
        let response = req(url, { 'method': 'GET', 'headers': header });
        let content = null;
        if (typeof response === 'string') {
            content = response;
        } else if (response && response.content) {
            content = response.content;
        }
        if (content && useCache) {
            cache[url] = { data: content, expire: Date.now() + CACHE_TTL };
        }
        return content;
    } catch (e) {
        log(`请求失败: ${url} - ${e.message}`, "ERROR");
        return null;
    }
}

function clearCache() { 
    cache = {}; 
    log("缓存已清除", "INFO"); 
}

/**
 * 解析相对路径 (基于 basePath)
 * @param {string} path - 原始路径
 * @param {string} basePath - 基础路径 (目录)
 * @returns {string} 绝对URL
 */
function resolvePath(path, basePath) {
    if (!path) return "";
    if (path.match(/^https?:\/\//i)) return path;
    if (path.startsWith('data:')) return path;
    
    let base = basePath;
    if (!base.endsWith('/')) base = base + '/';
    
    // 去除开头的 ./ 
    if (path.startsWith('./')) path = path.substring(2);
    // 处理 ../ 向上跳转
    while (path.startsWith('../')) {
        let lastSlash = base.lastIndexOf('/', base.length - 2);
        if (lastSlash > 0) base = base.substring(0, lastSlash + 1);
        path = path.substring(3);
    }
    // 绝对路径
    if (path.startsWith('/')) {
        let match = base.match(/^(https?:\/\/[^/]+)/);
        if (match) return match[1] + path;
        return base + path.substring(1);
    }
    return base + path;
}

/**
 * 获取文件类型图标
 */
function getFileType(url) {
    if (!url) return "📄 未知";
    let ext = url.split('.').pop().toLowerCase();
    let types = {
        'mp3': '🎵 音频', 'wav': '🎵 音频', 'ogg': '🎵 音频', 'flac': '🎵 音频',
        'mp4': '🎬 视频', 'mkv': '🎬 视频', 'avi': '🎬 视频', 'mov': '🎬 视频',
        'm3u8': '📺 直播', 'flv': '📺 直播', 'ts': '📺 直播',
        'jpg': '🖼️ 图片', 'png': '🖼️ 图片', 'gif': '🖼️ 图片',
        'pdf': '📄 文档', 'txt': '📄 文本'
    };
    return types[ext] || '🎵 媒体';
}

/**
 * 智能封面生成 (降级方案: 最终使用文字占位图)
 */
function getCover(title, url, originalPic = null) {
    // 优先使用原图
    if (originalPic && originalPic.match(/^https?:\/\//i)) {
        return originalPic;
    }
    // 其次使用基于标题的 placeholder 服务 (可靠, 无网络依赖)
    let shortTitle = (title || "未命名").substring(0, 30);
    // 使用 picsum 随机图 + 标题作为备用 (可显示)
    let hash = 0;
    for (let i = 0; i < shortTitle.length; i++) {
        hash = ((hash << 5) - hash) + shortTitle.charCodeAt(i);
    }
    // 最终fallback: 返回一个可用的默认图 (避免空白)
    return `https://picsum.photos/200/300?random=${Math.abs(hash) % 1000}`;
}

/**
 * 解析文本内容为列表项
 * @param {string} content - 文件内容
 * @param {number} page - 页码 (从1开始)
 * @param {number} pageSize - 每页条数
 * @returns {object} { items, total, totalPages }
 */
function parseContentItems(content, page = 1, pageSize = 50) {
    let items = [];
    let lines = content.split(/\r?\n/);
    // 支持的字段分隔符优先级: | , $ \t
    for (let line of lines) {
        if (!line || line.trim() === "") continue;
        if (line.startsWith('#') || line.startsWith('//')) continue;
        
        let title = "", url = "", remark = "";
        // 尝试多种分隔符
        let separators = ['|', ',', '$', '\t'];
        let bestSep = null;
        let bestIdx = -1;
        for (let sep of separators) {
            let idx = line.indexOf(sep);
            if (idx > 0 && (bestIdx === -1 || idx < bestIdx)) {
                bestIdx = idx;
                bestSep = sep;
            }
        }
        if (bestSep) {
            title = line.substring(0, bestIdx).trim();
            let rest = line.substring(bestIdx + 1).trim();
            if (rest.match(/^https?:\/\//i)) {
                url = rest;
            } else {
                // 可能 url 和备注同时存在，格式 title|url|remark
                let parts = rest.split(/\s+/);
                url = parts[0];
                remark = parts.slice(1).join(' ') || "";
            }
        } else if (line.match(/^https?:\/\//i)) {
            // 只有 URL
            url = line;
            title = "媒体文件";
        } else {
            // 无效行
            continue;
        }
        if (url) {
            items.push({ title, url, remark });
        }
    }
    // 分页处理
    let total = items.length;
    let totalPages = Math.ceil(total / pageSize);
    let start = (page - 1) * pageSize;
    let end = start + pageSize;
    let pageItems = items.slice(start, end);
    return { items: pageItems, total, totalPages, pageSize };
}

// ==================== ext 配置解析 (增强) ====================

function parseExtConfig(extParam, basePath) {
    let classes = [];
    try {
        let configData = null;
        if (extParam && extParam.match(/^https?:\/\//i)) {
            log(`下载 ext 配置: ${extParam}`, "INFO");
            let content = fetchSync(extParam);
            if (content) {
                try {
                    configData = JSON.parse(content);
                    log("JSON 解析成功", "INFO");
                } catch(e) {
                    configData = content;
                    log("作为文本格式处理", "INFO");
                }
            }
        } else if (extParam) {
            try {
                configData = JSON.parse(extParam);
                log("直接解析 JSON 成功", "INFO");
            } catch(e) {
                configData = extParam;
                log("作为文本格式处理", "INFO");
            }
        }
        
        if (configData) {
            // 1. 数组格式: [{ name, url, icon }]
            if (Array.isArray(configData)) {
                for (let item of configData) {
                    if (item.name) {
                        let typeId = item.url || item.api || item.id || item.name;
                        if (typeId && !typeId.match(/^https?:\/\//i)) {
                            typeId = resolvePath(typeId, basePath);
                        }
                        classes.push({
                            type_name: item.name,
                            type_id: typeId,
                            icon: item.icon || item.pic || "",
                            description: item.description || ""
                        });
                    }
                }
            }
            // 2. sites 字段 (多仓标准)
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
                            icon: site.icon || site.logo || "",
                            description: site.description || ""
                        });
                    }
                }
            }
            // 3. categories 字段
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
                            description: cat.description || ""
                        });
                    }
                }
            }
            // 4. 纯文本 (每行 name,url)
            else if (typeof configData === 'string') {
                let lines = configData.split(/\r?\n/);
                for (let line of lines) {
                    if (!line.trim()) continue;
                    let parts = line.split(',');
                    if (parts.length >= 2) {
                        let name = parts[0].trim();
                        let url = parts[1].trim();
                        classes.push({
                            type_name: name,
                            type_id: resolvePath(url, basePath)
                        });
                    }
                }
            }
            // 5. 对象格式 (key 为分类名)
            else {
                for (let key in configData) {
                    let item = configData[key];
                    if (item && typeof item === 'object' && item.name) {
                        let typeId = item.url || item.api || key;
                        if (typeId && !typeId.match(/^https?:\/\//i)) {
                            typeId = resolvePath(typeId, basePath);
                        }
                        classes.push({
                            type_name: item.name,
                            type_id: typeId,
                            icon: item.icon || "",
                            description: item.description || ""
                        });
                    }
                }
            }
        }
    } catch(e) {
        log(`解析 ext 失败: ${e.message}`, "ERROR");
    }
    
    // 默认分类 (保证至少有一个)
    if (classes.length === 0) {
        log("使用默认分类", "WARN");
        classes = [
            { type_name: "📖 迦南诗歌", type_id: resolvePath("迦南诗歌.txt", defaultBasePath) },
            { type_name: "🎵 音乐排行", type_id: resolvePath("yypy.txt", defaultBasePath) },
            { type_name: "🙏 赞美诗歌", type_id: resolvePath("zm.txt", defaultBasePath) },
            { type_name: "📺 央视栏目", type_id: "cctv" }
        ];
    }
    return classes;
}

// ==================== 核心接口 ====================

function init(extend) {
    log(`========== 爬虫初始化 v11.0 ==========`, "INFO");
    extBasePath = defaultBasePath;
    if (extend && extend.match(/^https?:\/\//i)) {
        // 获取 ext 配置文件所在目录
        let lastSlash = extend.lastIndexOf('/');
        if (lastSlash > 0) {
            extBasePath = extend.substring(0, lastSlash + 1);
        }
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
 * category 支持分页
 * @param {string} tid - 分类ID (可以是文件URL或特殊标识)
 * @param {number} pg - 页码
 * @param {boolean} filter - 是否过滤
 * @param {object} extend - 扩展参数
 */
function category(tid, pg, filter, extend) {
    pg = parseInt(pg) || 1;
    log(`category: ${tid}, page=${pg}`, "DEBUG");
    let videos = [];
    let total = 0;
    let pagecount = 1;
    const PAGE_SIZE = 50;  // 每页显示条数
    
    try {
        // 央视直播特殊处理
        if (tid === "cctv" || tid === "央视栏目" || tid === "CCTV") {
            let channels = [
                "CCTV-1 综合", "CCTV-2 财经", "CCTV-3 综艺", "CCTV-4 中文国际",
                "CCTV-5 体育", "CCTV-6 电影", "CCTV-7 国防军事", "CCTV-8 电视剧",
                "CCTV-9 纪录", "CCTV-10 科教", "CCTV-11 戏曲", "CCTV-12 社会与法",
                "CCTV-13 新闻", "CCTV-14 少儿", "CCTV-15 音乐"
            ];
            total = channels.length;
            pagecount = Math.ceil(total / PAGE_SIZE);
            let start = (pg - 1) * PAGE_SIZE;
            let end = start + PAGE_SIZE;
            let pageChannels = channels.slice(start, end);
            for (let i = 0; i < pageChannels.length; i++) {
                let name = pageChannels[i];
                videos.push({
                    vod_id: "cctv" + (i+1+start) + "###cctv",
                    vod_name: name,
                    vod_pic: getCover(name, null, null),
                    vod_remarks: "📺 直播"
                });
            }
        } 
        else {
            let fileUrl = tid;
            if (!tid.match(/^https?:\/\//i)) {
                fileUrl = resolvePath(tid, extBasePath);
            }
            log(`请求文件: ${fileUrl}`, "INFO");
            let content = fetchSync(fileUrl);
            
            if (content && content.length > 0) {
                // 尝试 JSON 解析
                let items = [];
                if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
                    try {
                        let json = JSON.parse(content);
                        if (Array.isArray(json)) {
                            for (let item of json) {
                                if (item.title || item.name) {
                                    items.push({
                                        title: item.title || item.name,
                                        url: item.url || item.link || item.src,
                                        pic: item.pic || item.cover || item.image
                                    });
                                }
                            }
                        } else if (json.list && Array.isArray(json.list)) {
                            for (let item of json.list) {
                                items.push({
                                    title: item.title || item.name,
                                    url: item.url || item.link,
                                    pic: item.pic || item.cover
                                });
                            }
                        } else if (json.data && Array.isArray(json.data)) {
                            for (let item of json.data) {
                                items.push({
                                    title: item.title || item.name,
                                    url: item.url || item.play_url,
                                    pic: item.pic || item.cover
                                });
                            }
                        }
                    } catch(e) {}
                }
                // 非JSON则按文本行解析
                if (items.length === 0) {
                    let parsed = parseContentItems(content, pg, PAGE_SIZE);
                    items = parsed.items;
                    total = parsed.total;
                    pagecount = parsed.totalPages;
                } else {
                    total = items.length;
                    pagecount = Math.ceil(total / PAGE_SIZE);
                    let start = (pg - 1) * PAGE_SIZE;
                    let end = start + PAGE_SIZE;
                    items = items.slice(start, end);
                }
                
                log(`解析到 ${items.length} 条数据 (总 ${total})`, "INFO");
                const fileBase = fileUrl.substring(0, fileUrl.lastIndexOf('/') + 1);
                for (let item of items) {
                    if (item.url) {
                        let link = item.url;
                        if (!link.match(/^https?:\/\//i)) {
                            link = resolvePath(link, fileBase);
                        }
                        let cover = getCover(item.title, link, item.pic);
                        videos.push({
                            vod_id: link + "###music",
                            vod_name: item.title || "未命名",
                            vod_pic: cover,
                            vod_remarks: getFileType(link) + (item.remark ? " " + item.remark : "")
                        });
                    }
                }
            } else {
                log(`文件请求失败: ${fileUrl}`, "WARN");
                videos.push({
                    vod_id: "error###test",
                    vod_name: `⚠️ 无法加载: ${tid.substring(0, 50)}`,
                    vod_pic: "https://picsum.photos/200/300?random=999",
                    vod_remarks: "请检查网络或文件是否存在"
                });
                total = 1;
                pagecount = 1;
            }
        }
    } catch(e) {
        log(`category 错误: ${e.message}`, "ERROR");
    }
    
    return JSON.stringify({
        list: videos,
        page: pg,
        pagecount: pagecount,
        limit: PAGE_SIZE,
        total: total
    });
}

function detail(vodId) {
    try {
        let parts = vodId.split('###');
        if (parts.length < 2) return JSON.stringify({ list: [] });
        
        let videoId = parts[0];
        let type = parts[1];
        
        if (type === "cctv") {
            // 央视直播 m3u8 地址映射 (部分示例)
            let streamMap = {
                "cctv1": "https://cctv1h5cctv.aikan.miguvideo.com/cctv1_2/index.m3u8",
                "cctv2": "https://cctv2h5cctv.aikan.miguvideo.com/cctv2_2/index.m3u8",
                "cctv3": "https://cctv3h5cctv.aikan.miguvideo.com/cctv3_2/index.m3u8",
                "cctv4": "https://cctv4h5cctv.aikan.miguvideo.com/cctv4_2/index.m3u8",
                "cctv5": "https://cctv5h5cctv.aikan.miguvideo.com/cctv5_2/index.m3u8",
                "cctv6": "https://cctv6h5cctv.aikan.miguvideo.com/cctv6_2/index.m3u8"
            };
            let streamUrl = streamMap[videoId] || streamMap["cctv1"];
            let vod_name = videoId.replace(/^cctv(\d+)/, "CCTV-$1 直播");
            let vod = {
                vod_id: videoId,
                vod_name: vod_name,
                vod_pic: getCover(vod_name, streamUrl, null),
                vod_play_from: "央视直播",
                vod_play_url: "直播流$" + streamUrl
            };
            return JSON.stringify({ list: [vod] });
        } else {
            // 普通媒体文件
            let title = videoId.split('/').pop().split('.')[0] || "媒体播放";
            title = decodeURIComponent(title);
            let vod = {
                vod_id: videoId,
                vod_name: title,
                vod_pic: getCover(title, videoId, null),
                vod_play_from: "播放源",
                vod_play_url: "播放$" + videoId
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

/**
 * 搜索功能: 在分类文件内容中搜索关键词
 * @param {string} keyword - 搜索关键词
 * @param {number} page - 页码
 */
function search(keyword, page) {
    page = parseInt(page) || 1;
    let results = [];
    if (!keyword || keyword.trim() === "") {
        return JSON.stringify({ list: [], page: 1, pagecount: 0 });
    }
    try {
        // 遍历所有分类，搜索其对应的文件内容
        for (let cls of dynamicClasses) {
            let fileUrl = cls.type_id;
            if (fileUrl === "cctv") continue; // 央视直播忽略搜索
            if (!fileUrl.match(/^https?:\/\//i)) {
                fileUrl = resolvePath(fileUrl, extBasePath);
            }
            let content = fetchSync(fileUrl);
            if (content) {
                let items = [];
                if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
                    try {
                        let json = JSON.parse(content);
                        let arr = Array.isArray(json) ? json : (json.list || json.data || []);
                        for (let item of arr) {
                            if (item.title && item.title.includes(keyword)) {
                                items.push({
                                    title: item.title,
                                    url: item.url || item.link,
                                    pic: item.pic
                                });
                            }
                        }
                    } catch(e) {}
                } else {
                    let lines = content.split(/\r?\n/);
                    for (let line of lines) {
                        if (line.includes(keyword)) {
                            let parts = line.split(/[|,]/);
                            let title = parts[0].trim();
                            let url = parts.length > 1 ? parts[1].trim() : "";
                            if (url.match(/^https?:\/\//i)) {
                                items.push({ title, url });
                            }
                        }
                    }
                }
                // 去重 & 限制数量
                items = items.slice(0, 100);
                for (let item of items) {
                    if (item.url) {
                        results.push({
                            vod_id: item.url + "###music",
                            vod_name: item.title,
                            vod_pic: getCover(item.title, item.url, item.pic),
                            vod_remarks: "搜索结果"
                        });
                    }
                }
            }
        }
        let total = results.length;
        let pageSize = 20;
        let start = (page - 1) * pageSize;
        let pageResults = results.slice(start, start + pageSize);
        return JSON.stringify({
            list: pageResults,
            page: page,
            pagecount: Math.ceil(total / pageSize),
            total: total
        });
    } catch(e) {
        log(`搜索错误: ${e.message}`, "ERROR");
        return JSON.stringify({ list: [] });
    }
}

__JS_SPIDER__ = {
    'init': init,
    'home': home,
    'homeVod': homeVod,
    'category': category,
    'detail': detail,
    'play': play,
    'search': search
};