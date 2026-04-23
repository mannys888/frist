// ==================== 终极通用动态爬虫 ====================
// 版本: 10.0.0
// 特性: 自动路径解析、多格式支持、智能缓存、错误恢复、详细日志

const header = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
};

// ==================== 全局变量 ====================
let dynamicClasses = [];
let extBasePath = "";
let defaultBasePath = "https://raw.githubusercontent.com/mannys888/frist/refs/heads/main/";
let cache = {};           // 缓存请求结果
let debugMode = true;     // 调试模式

// ==================== 日志系统 ====================
function log(msg, level = "INFO") {
    if (!debugMode && level === "DEBUG") return;
    console.log(`[${level}] ${msg}`);
}

// ==================== 工具函数 ====================

/**
 * 智能网络请求 - 带缓存
 */
function fetchSync(url, useCache = true) {
    if (useCache && cache[url]) {
        log(`缓存命中: ${url}`, "DEBUG");
        return cache[url];
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
            cache[url] = content;
        }
        return content;
    } catch (e) {
        log(`请求失败: ${url} - ${e.message}`, "ERROR");
        return null;
    }
}

/**
 * 清除缓存
 */
function clearCache() {
    cache = {};
    log("缓存已清除", "INFO");
}

/**
 * 获取随机封面图
 */
function getRandomCover(title) {
    let hash = 0;
    for (let i = 0; i < (title || "").length; i++) {
        hash = ((hash << 5) - hash) + title.charCodeAt(i);
    }
    let themes = ["music", "nature", "abstract", "art", "film"];
    let theme = themes[Math.abs(hash) % themes.length];
    return `https://picsum.photos/200/300?random=${Math.abs(hash) % 100}&theme=${theme}`;
}

/**
 * 获取文件类型
 */
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

/**
 * 通用路径解析 - 增强版
 * 支持: ./xxx, ../xxx, /xxx, xxx, 以及各种变体
 */
function resolvePath(path, basePath) {
    if (!path) return "";
    
    // 已经是完整URL
    if (path.match(/^https?:\/\//i)) {
        return path;
    }
    
    // 处理 data: 协议
    if (path.startsWith('data:')) {
        return path;
    }
    
    // 确保 basePath 以 / 结尾
    let base = basePath;
    if (!base.endsWith('/')) {
        base = base + '/';
    }
    
    // 处理各种相对路径
    if (path.startsWith('./')) {
        return base + path.substring(2);
    }
    
    if (path.startsWith('../')) {
        let parts = base.split('/');
        let upCount = (path.match(/\.\.\//g) || []).length;
        for (let i = 0; i < upCount && parts.length > 3; i++) {
            parts.pop();
        }
        let newBase = parts.join('/') + '/';
        return newBase + path.replace(/\.\.\//g, '');
    }
    
    if (path.startsWith('/')) {
        let match = base.match(/^(https?:\/\/[^/]+)/);
        if (match) {
            return match[1] + path;
        }
        return base + path.substring(1);
    }
    
    // 普通相对路径
    return base + path;
}

/**
 * 智能文件名处理
 * 自动补全扩展名
 */
function normalizeFileName(fileName, defaultExt = '.txt') {
    if (!fileName) return fileName;
    if (fileName.includes('.')) return fileName;
    return fileName + defaultExt;
}

/**
 * 解析多种格式的文本内容
 * 支持: CSV(逗号分隔)、TSV(制表符)、自定义分隔符
 */
function parseContent(content, options = {}) {
    let items = [];
    let separators = options.separators || [',', '\t', '|', '$'];
    let lines = content.split(/\r?\n/);
    
    for (let line of lines) {
        if (!line || line.trim() === "") continue;
        if (line.startsWith('#') || line.startsWith('//')) continue; // 跳过注释
        
        let foundSeparator = null;
        let separatorIndex = -1;
        
        for (let sep of separators) {
            let idx = line.indexOf(sep);
            if (idx > 0 && (separatorIndex === -1 || idx < separatorIndex)) {
                separatorIndex = idx;
                foundSeparator = sep;
            }
        }
        
        if (foundSeparator) {
            let title = line.substring(0, separatorIndex).trim();
            let url = line.substring(separatorIndex + 1).trim();
            items.push({ title, url });
        } else if (line.match(/^https?:\/\//i)) {
            // 只有URL，没有标题
            items.push({ title: "媒体文件", url: line });
        }
    }
    
    return items;
}

// ==================== ext 配置解析 ====================

/**
 * 解析 ext 配置 - 支持多种格式
 */
function parseExtConfig(extParam, basePath) {
    let classes = [];
    
    try {
        let configData = null;
        
        // 1. 获取配置数据
        if (extParam && extParam.match(/^https?:\/\//i)) {
            log(`下载 ext 配置: ${extParam}`, "INFO");
            let content = fetchSync(extParam);
            if (content) {
                try {
                    configData = JSON.parse(content);
                    log("JSON 解析成功", "INFO");
                } catch(e) {
                    // 可能是文本格式
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
        
        // 2. 根据数据类型生成分类
        if (configData) {
            // 情况1: JSON 数组
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
            // 情况2: 对象 with sites
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
            // 情况3: 对象 with categories
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
            // 情况4: 对象 with list
            else if (configData.list && Array.isArray(configData.list)) {
                for (let item of configData.list) {
                    if (item.name) {
                        let typeId = item.url || item.id || item.name;
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
            // 情况5: 纯文本格式 (每行: 名称,URL)
            else if (typeof configData === 'string') {
                let lines = configData.split(/\r?\n/);
                for (let line of lines) {
                    if (!line.trim()) continue;
                    let parts = line.split(',');
                    if (parts.length >= 2) {
                        classes.push({
                            type_name: parts[0].trim(),
                            type_id: resolvePath(parts[1].trim(), basePath)
                        });
                    } else if (parts.length === 1 && parts[0].match(/^https?:\/\//i)) {
                        classes.push({
                            type_name: "链接 " + (classes.length + 1),
                            type_id: parts[0].trim()
                        });
                    }
                }
            }
            // 情况6: 直接遍历对象属性
            else {
                for (let key in configData) {
                    let item = configData[key];
                    if (item && typeof item === 'object') {
                        if (item.name) {
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
                    } else if (typeof item === 'string') {
                        classes.push({
                            type_name: key,
                            type_id: resolvePath(item, basePath)
                        });
                    }
                }
            }
        }
    } catch(e) {
        log(`解析 ext 失败: ${e.message}`, "ERROR");
    }
    
    // 默认分类（兜底）
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

// ==================== 核心功能 ====================

function init(extend) {
    log(`========== 爬虫初始化 ==========`, "INFO");
    log(`extend 参数: ${extend ? extend.substring(0, 200) : "null"}`, "DEBUG");
    
    // 提取基础路径
    extBasePath = defaultBasePath;
    if (extend) {
        if (extend.match(/^https?:\/\//i)) {
            extBasePath = extend.substring(0, extend.lastIndexOf('/') + 1);
        } else if (extend.trim().startsWith('{')) {
            log("ext 是 JSON 内容，使用默认基础路径", "INFO");
        }
    }
    log(`基础路径: ${extBasePath}`, "INFO");
    
    // 解析配置
    dynamicClasses = parseExtConfig(extend, extBasePath);
    log(`生成 ${dynamicClasses.length} 个分类`, "INFO");
    
    // 输出分类列表
    for (let i = 0; i < dynamicClasses.length; i++) {
        log(`  ${i+1}. ${dynamicClasses[i].type_name} -> ${dynamicClasses[i].type_id}`, "DEBUG");
    }
}

function home() {
    return JSON.stringify({
        class: dynamicClasses,
        filters: null
    });
}

function homeVod() {
    return JSON.stringify({ list: [] });
}

/**
 * 通用 category 函数 - 增强版
 */
function category(tid, pg, filter, extend) {
    try {
        pg = parseInt(pg) || 1;
        log(`========== category ==========`, "DEBUG");
        log(`tid: ${tid}, pg: ${pg}`, "DEBUG");
        
        if (pg >= 2) {
            return JSON.stringify({ list: [], page: pg, pagecount: 1, limit: 90, total: 0 });
        }
        
        let videos = [];
        
        // 央视栏目特殊处理
        if (tid === "cctv" || tid === "央视栏目" || tid === "CCTV") {
            log("处理央视栏目", "INFO");
            let channels = [
                { name: "CCTV-1 综合", id: "cctv1", url: "https://cctv1h5cctv.aikan.miguvideo.com/cctv1_2/index.m3u8" },
                { name: "CCTV-2 财经", id: "cctv2", url: "https://cctv2h5cctv.aikan.miguvideo.com/cctv2_2/index.m3u8" },
                { name: "CCTV-3 综艺", id: "cctv3", url: "https://cctv3h5cctv.aikan.miguvideo.com/cctv3_2/index.m3u8" },
                { name: "CCTV-4 中文国际", id: "cctv4", url: "https://cctv4h5cctv.aikan.miguvideo.com/cctv4_2/index.m3u8" },
                { name: "CCTV-5 体育", id: "cctv5", url: "https://cctv5h5cctv.aikan.miguvideo.com/cctv5_2/index.m3u8" },
                { name: "CCTV-6 电影", id: "cctv6", url: "https://cctv6h5cctv.aikan.miguvideo.com/cctv6_2/index.m3u8" },
                { name: "CCTV-7 国防军事", id: "cctv7", url: "https://cctv7h5cctv.aikan.miguvideo.com/cctv7_2/index.m3u8" },
                { name: "CCTV-8 电视剧", id: "cctv8", url: "https://cctv8h5cctv.aikan.miguvideo.com/cctv8_2/index.m3u8" },
                { name: "CCTV-9 纪录", id: "cctv9", url: "https://cctv9h5cctv.aikan.miguvideo.com/cctv9_2/index.m3u8" },
                { name: "CCTV-10 科教", id: "cctv10", url: "https://cctv10h5cctv.aikan.miguvideo.com/cctv10_2/index.m3u8" },
                { name: "CCTV-11 戏曲", id: "cctv11", url: "https://cctv11h5cctv.aikan.miguvideo.com/cctv11_2/index.m3u8" },
                { name: "CCTV-12 社会与法", id: "cctv12", url: "https://cctv12h5cctv.aikan.miguvideo.com/cctv12_2/index.m3u8" },
                { name: "CCTV-13 新闻", id: "cctv13", url: "https://cctv13h5cctv.aikan.miguvideo.com/cctv13_2/index.m3u8" },
                { name: "CCTV-14 少儿", id: "cctv14", url: "https://cctv14h5cctv.aikan.miguvideo.com/cctv14_2/index.m3u8" },
                { name: "CCTV-15 音乐", id: "cctv15", url: "https://cctv15h5cctv.aikan.miguvideo.com/cctv15_2/index.m3u8" }
            ];
            for (let ch of channels) {
                videos.push({
                    vod_id: ch.id + "###cctv",
                    vod_name: ch.name,
                    vod_pic: getRandomCover(ch.name),
                    vod_remarks: "📺 直播"
                });
            }
        } 
        else {
            // 通用文件处理
            let fileUrl = tid;
            
            // 路径解析
            if (!tid.match(/^https?:\/\//i)) {
                fileUrl = resolvePath(tid, extBasePath);
                if (!fileUrl.match(/^https?:\/\//i)) {
                    fileUrl = defaultBasePath + tid;
                }
            }
            
            // 自动补全扩展名
            if (!fileUrl.includes('.') && !fileUrl.endsWith('/')) {
                let testUrl = fileUrl + '.txt';
                let testContent = fetchSync(testUrl, true);
                if (testContent) {
                    fileUrl = testUrl;
                    log(`自动补全扩展名: ${fileUrl}`, "INFO");
                }
            }
            
            log(`请求文件: ${fileUrl}`, "INFO");
            let content = fetchSync(fileUrl);
            
            if (content && content.length > 0) {
                // 自动检测格式并解析
                let items = [];
                
                // 尝试 JSON 解析
                if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
                    try {
                        let json = JSON.parse(content);
                        if (Array.isArray(json)) {
                            for (let item of json) {
                                if (item.title || item.name) {
                                    items.push({
                                        title: item.title || item.name,
                                        url: item.url || item.link || item.src
                                    });
                                }
                            }
                        } else if (json.list && Array.isArray(json.list)) {
                            for (let item of json.list) {
                                items.push({
                                    title: item.title || item.name,
                                    url: item.url || item.link
                                });
                            }
                        }
                    } catch(e) {}
                }
                
                // 如果不是 JSON 或解析失败，按文本处理
                if (items.length === 0) {
                    items = parseContent(content);
                }
                
                log(`解析到 ${items.length} 条数据`, "INFO");
                
                for (let item of items) {
                    if (item.url) {
                        let link = item.url;
                        if (!link.match(/^https?:\/\//i)) {
                            let fileBase = fileUrl.substring(0, fileUrl.lastIndexOf('/') + 1);
                            link = resolvePath(link, fileBase);
                        }
                        
                        videos.push({
                            vod_id: link + "###music",
                            vod_name: item.title || "未命名",
                            vod_pic: getRandomCover(item.title),
                            vod_remarks: getFileType(link)
                        });
                    }
                }
            } else {
                log(`文件请求失败: ${fileUrl}`, "WARN");
                videos.push({
                    vod_id: "error###test",
                    vod_name: `⚠️ 无法加载: ${tid.substring(0, 50)}`,
                    vod_pic: "",
                    vod_remarks: "请检查网络或文件是否存在"
                });
            }
        }
        
        return JSON.stringify({
            list: videos,
            page: pg,
            pagecount: 1,
            limit: 90,
            total: videos.length
        });
    } catch(e) {
        log(`category 错误: ${e.message}`, "ERROR");
        return JSON.stringify({ list: [], page: pg, pagecount: 0, limit: 90, total: 0 });
    }
}

function detail(vodId) {
    try {
        log(`detail: ${vodId}`, "DEBUG");
        let parts = vodId.split('###');
        if (parts.length < 2) return JSON.stringify({ list: [] });
        
        let videoId = parts[0];
        let type = parts[1];
        
        if (type === "cctv") {
            let streamUrls = {
                "cctv1": "https://cctv1h5cctv.aikan.miguvideo.com/cctv1_2/index.m3u8",
                "cctv2": "https://cctv2h5cctv.aikan.miguvideo.com/cctv2_2/index.m3u8",
                "cctv3": "https://cctv3h5cctv.aikan.miguvideo.com/cctv3_2/index.m3u8",
                "cctv4": "https://cctv4h5cctv.aikan.miguvideo.com/cctv4_2/index.m3u8",
                "cctv5": "https://cctv5h5cctv.aikan.miguvideo.com/cctv5_2/index.m3u8"
            };
            let streamUrl = streamUrls[videoId] || streamUrls["cctv1"];
            let vod = {
                vod_id: videoId,
                vod_name: "央视直播",
                vod_pic: getRandomCover("cctv"),
                vod_play_from: "央视直播",
                vod_play_url: "直播流$" + streamUrl
            };
            return JSON.stringify({ list: [vod] });
        } else {
            let title = videoId.split('/').pop().split('.')[0] || "媒体播放";
            let vod = {
                vod_id: videoId,
                vod_name: decodeURIComponent(title),
                vod_pic: getRandomCover(title),
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

function search(keyword, page) {
    log(`search: ${keyword}, page: ${page}`, "DEBUG");
    return JSON.stringify({ list: [] });
}

// ==================== 导出 ====================
__JS_SPIDER__ = {
    'init': init,
    'home': home,
    'homeVod': homeVod,
    'category': category,
    'detail': detail,
    'play': play,
    'search': search
};