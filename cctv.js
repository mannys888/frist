// ==================== 终极通用动态爬虫 ====================
// 版本: 10.1.0
// 特性: 智能封面处理（无图时显示地址文字）

const header = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
};

// ==================== 全局变量 ====================
let dynamicClasses = [];
let extBasePath = "";
let defaultBasePath = "https://raw.githubusercontent.com/mannys888/frist/refs/heads/main/";
let cache = {};
let debugMode = true;

// ==================== 日志系统 ====================
function log(msg, level = "INFO") {
    if (!debugMode && level === "DEBUG") return;
    console.log(`[${level}] ${msg}`);
}

// ==================== 工具函数 ====================

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
        if (content && useCache) cache[url] = content;
        return content;
    } catch (e) {
        log(`请求失败: ${url} - ${e.message}`, "ERROR");
        return null;
    }
}

function clearCache() { cache = {}; log("缓存已清除", "INFO"); }

/**
 * 🔥 智能封面生成
 * 优先级: 1. 原图片地址  2. 视频截图API  3. 视频地址文字  4. 默认封面
 */
function getCover(title, url, originalPic = null) {
    // 1. 如果有原图片且有效，使用原图片
    if (originalPic && originalPic.match(/^https?:\/\//i)) {
        return originalPic;
    }
    
    // 2. 如果有视频URL，生成基于URL的封面（显示地址文字）
    if (url && url.match(/^https?:\/\//i)) {
        // 方案A: 使用在线截图服务（如果支持）
        // 方案B: 生成带有URL文字的图片（使用Canvas风格）
        // 这里使用一个专门的服务来生成带文字的图片
        let encodedUrl = encodeURIComponent(url);
        let shortUrl = url.length > 50 ? url.substring(0, 47) + '...' : url;
        
        // 使用动态图片生成服务（将文字渲染成图片）
        // 优先使用 text-to-image 服务
        let textImageUrl = `https://via.placeholder.com/200x300/1e293b/ffffff?text=${encodeURIComponent(shortUrl)}`;
        
        // 更好的方案：使用 Canvas 风格的 API
        // 如果有自己的图片服务器更好，这里使用占位图服务
        return textImageUrl;
    }
    
    // 3. 默认封面（基于标题的随机图）
    let hash = 0;
    for (let i = 0; i < (title || "").length; i++) {
        hash = ((hash << 5) - hash) + title.charCodeAt(i);
    }
    let themes = ["music", "nature", "abstract", "art", "film"];
    let theme = themes[Math.abs(hash) % themes.length];
    return `https://picsum.photos/200/300?random=${Math.abs(hash) % 100}&theme=${theme}`;
}

/**
 * 🔥 生成文本封面（纯文字，用于显示URL）
 * 返回一个 data:image 格式的图片，显示视频地址
 */
function generateTextCover(text, width = 200, height = 300) {
    // 使用 Canvas 生成图片（在浏览器端）
    // 由于爬虫环境限制，返回一个特殊标记，由前端渲染
    if (typeof window !== 'undefined') {
        // 浏览器环境，返回特殊标记
        return `data:text/plain,cover_text:${encodeURIComponent(text)}`;
    }
    // TVBox 环境，返回默认图片
    return `https://picsum.photos/${width}/${height}?random=${Math.random()}`;
}

function getFileType(url) {
    if (!url) return "📄 未知";
    let ext = url.split('.').pop().toLowerCase();
    let types = {
        'mp3': '🎵 音频', 'wav': '🎵 音频', 'ogg': '🎵 音频', 'flac': '🎵 音频',
        'mp4': '🎬 视频', 'mkv': '🎬 视频', 'avi': '🎬 视频', 'mov': '🎬 视频',
        'm3u8': '📺 直播', 'flv': '📺 直播', 'ts': '📺 直播',
        'jpg': '🖼️ 图片', 'png': '🖼️ 图片', 'gif': '🖼️ 图片'
    };
    return types[ext] || '🎵 媒体';
}

function resolvePath(path, basePath) {
    if (!path) return "";
    if (path.match(/^https?:\/\//i)) return path;
    if (path.startsWith('data:')) return path;
    
    let base = basePath;
    if (!base.endsWith('/')) base = base + '/';
    
    if (path.startsWith('./')) return base + path.substring(2);
    if (path.startsWith('../')) {
        let parts = base.split('/');
        let upCount = (path.match(/\.\.\//g) || []).length;
        for (let i = 0; i < upCount && parts.length > 3; i++) parts.pop();
        return parts.join('/') + '/' + path.replace(/\.\.\//g, '');
    }
    if (path.startsWith('/')) {
        let match = base.match(/^(https?:\/\/[^/]+)/);
        if (match) return match[1] + path;
        return base + path.substring(1);
    }
    return base + path;
}

function normalizeFileName(fileName, defaultExt = '.txt') {
    if (!fileName) return fileName;
    if (fileName.includes('.')) return fileName;
    return fileName + defaultExt;
}

function parseContent(content, options = {}) {
    let items = [];
    let separators = options.separators || [',', '\t', '|', '$'];
    let lines = content.split(/\r?\n/);
    
    for (let line of lines) {
        if (!line || line.trim() === "") continue;
        if (line.startsWith('#') || line.startsWith('//')) continue;
        
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
            items.push({ title: "媒体文件", url: line });
        }
    }
    return items;
}

// ==================== ext 配置解析 ====================

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
                    }
                }
            }
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
    extBasePath = defaultBasePath;
    if (extend && extend.match(/^https?:\/\//i)) {
        extBasePath = extend.substring(0, extend.lastIndexOf('/') + 1);
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
 * 🔥 通用 category 函数 - 增强版（智能封面）
 */
function category(tid, pg, filter, extend) {
    try {
        pg = parseInt(pg) || 1;
        log(`category: ${tid}, pg: ${pg}`, "DEBUG");
        
        if (pg >= 2) {
            return JSON.stringify({ list: [], page: pg, pagecount: 1, limit: 90, total: 0 });
        }
        
        let videos = [];
        
        // 央视栏目
        if (tid === "cctv" || tid === "央视栏目" || tid === "CCTV") {
            let channels = [
                "CCTV-1 综合", "CCTV-2 财经", "CCTV-3 综艺", "CCTV-4 中文国际",
                "CCTV-5 体育", "CCTV-6 电影", "CCTV-7 国防军事", "CCTV-8 电视剧",
                "CCTV-9 纪录", "CCTV-10 科教", "CCTV-11 戏曲", "CCTV-12 社会与法",
                "CCTV-13 新闻", "CCTV-14 少儿", "CCTV-15 音乐"
            ];
            for (let i = 0; i < channels.length; i++) {
                videos.push({
                    vod_id: "cctv" + (i+1) + "###cctv",
                    vod_name: channels[i],
                    vod_pic: getCover(channels[i], null, null),
                    vod_remarks: "📺 直播"
                });
            }
        } 
        else {
            let fileUrl = tid;
            if (!tid.match(/^https?:\/\//i)) {
                fileUrl = resolvePath(tid, extBasePath);
                if (!fileUrl.match(/^https?:\/\//i)) {
                    fileUrl = defaultBasePath + tid;
                }
            }
            
            log(`请求文件: ${fileUrl}`, "INFO");
            let content = fetchSync(fileUrl);
            
            if (content && content.length > 0) {
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
                        }
                    } catch(e) {}
                }
                
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
                        
                        // 🔥 关键：智能生成封面
                        let cover = getCover(item.title, link, item.pic);
                        
                        videos.push({
                            vod_id: link + "###music",
                            vod_name: item.title || "未命名",
                            vod_pic: cover,
                            vod_remarks: getFileType(link)
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
                vod_pic: getCover("央视直播", streamUrl, null),
                vod_play_from: "央视直播",
                vod_play_url: "直播流$" + streamUrl
            };
            return JSON.stringify({ list: [vod] });
        } else {
            let title = videoId.split('/').pop().split('.')[0] || "媒体播放";
            let vod = {
                vod_id: videoId,
                vod_name: decodeURIComponent(title),
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

function search(keyword, page) {
    return JSON.stringify({ list: [] });
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