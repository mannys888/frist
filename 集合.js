// ==================== 增强版爬虫 ====================
// 版本: 7.0.0 - 合并 ext 动态分类 + 通用文件请求

const header = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
};

// ==================== 工具函数 ====================

function fetchSync(url) {
    try {
        console.log("[fetchSync] 请求: " + url);
        let response = req(url, { 'method': 'GET', 'headers': header });
        if (typeof response === 'string') return response;
        if (response && response.content) return response.content;
        return null;
    } catch (e) {
        console.log("[fetchSync] 错误: " + e.message);
        return null;
    }
}

function getMusicCover(title) {
    let hash = 0;
    for (let i = 0; i < (title || "").length; i++) {
        hash = ((hash << 5) - hash) + title.charCodeAt(i);
    }
    return "https://picsum.photos/200/300?random=" + (Math.abs(hash) % 20);
}

function getFileType(url) {
    if (!url) return "🎵 音乐";
    if (url.indexOf('.mp3') > 0) return "🎵 音频";
    if (url.indexOf('.mp4') > 0) return "🎬 视频";
    if (url.indexOf('.m3u8') > 0) return "📺 直播";
    return "🎵 音乐";
}

// ==================== 解析 ext 配置 ====================
function parseExtConfig(extParam) {
    let classes = [];
    try {
        let configData = null;
        
        if (extParam && (extParam.startsWith('http://') || extParam.startsWith('https://'))) {
            console.log("[init] ext 是 URL，开始下载: " + extParam);
            let content = fetchSync(extParam);
            if (content) {
                configData = JSON.parse(content);
                console.log("[init] 下载并解析 JSON 成功");
            }
        } else if (extParam) {
            configData = JSON.parse(extParam);
            console.log("[init] 解析传入的 JSON 字符串成功");
        }
        
        if (configData) {
            if (Array.isArray(configData)) {
                for (let item of configData) {
                    if (item.name) {
                        classes.push({
                            type_name: item.name,
                            type_id: item.url || item.name
                        });
                    }
                }
            } else if (configData.sites && Array.isArray(configData.sites)) {
                for (let site of configData.sites) {
                    if (site.name) {
                        classes.push({
                            type_name: site.name,
                            type_id: site.url || site.api || site.name
                        });
                    }
                }
            } else {
                for (let key in configData) {
                    if (configData[key] && typeof configData[key] === 'object' && configData[key].name) {
                        classes.push({
                            type_name: configData[key].name,
                            type_id: configData[key].url || key
                        });
                    }
                }
            }
        }
    } catch(e) {
        console.log("[init] 解析 ext 失败: " + e.message);
    }
    
    // 🔥 如果没有从 ext 解析到分类，使用扩展的默认分类（支持更多类型）
    if (classes.length === 0) {
        console.log("[init] 未从 ext 解析到分类，使用默认分类");
        classes = [
            { type_name: "🎵 音乐排行", type_id: "yypy.txt" },
            { type_name: "📖 迦南诗歌", type_id: "迦南诗歌.txt" },
            { type_name: "🙏 赞美诗歌", type_id: "zm.txt" },
            { type_name: "🎤 赞美诗", type_id: "赞美诗.txt" },
            { type_name: "📺 央视栏目", type_id: "cctv" }
        ];
    }
    
    return classes;
}

// ==================== 全局变量 ====================
let dynamicClasses = [];

// ==================== 核心功能 ====================

function init(extend) {
    console.log("[init] 爬虫初始化，extend: " + (extend ? extend.substring(0, 100) : "null"));
    dynamicClasses = parseExtConfig(extend);
    console.log("[init] 生成分类数量: " + dynamicClasses.length);
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

// 🔥 核心修复：category 函数 - 通用处理任何分类
function category(tid, pg, filter, extend) {
    try {
        pg = parseInt(pg) || 1;
        console.log("[category] tid: " + tid + ", pg: " + pg);
        
        if (pg >= 2) {
            return JSON.stringify({ list: [], page: pg, pagecount: 1, limit: 90, total: 0 });
        }
        
        let videos = [];
        let baseUrl = "https://raw.githubusercontent.com/mannys888/frist/refs/heads/main/";
        
        // 🔥 央视栏目特殊处理
        if (tid === "cctv" || tid === "央视栏目") {
            let channels = [
                "CCTV-1 综合", "CCTV-2 财经", "CCTV-3 综艺", "CCTV-4 中文国际",
                "CCTV-5 体育", "CCTV-6 电影", "CCTV-7 国防军事", "CCTV-8 电视剧"
            ];
            for (let i = 0; i < channels.length; i++) {
                videos.push({
                    vod_id: "cctv" + (i+1) + "###cctv",
                    vod_name: channels[i],
                    vod_pic: getMusicCover(channels[i]),
                    vod_remarks: "📺 直播"
                });
            }
        } 
        // 🔥 其他分类：通用处理 - 根据 tid 请求对应的文件
        else {
            // 直接使用 tid 作为文件名（保留原始格式）
            let fileName = tid;
            
            // 如果文件名没有 .txt 后缀，尝试添加
            if (!fileName.endsWith('.txt')) {
                // 先尝试原文件名
                let fileUrl = baseUrl + fileName;
                console.log("[category] 尝试请求: " + fileUrl);
                let testContent = fetchSync(fileUrl);
                if (testContent && testContent.length > 0) {
                    // 成功，使用原文件名
                    fileName = tid;
                } else {
                    // 失败，尝试添加 .txt
                    fileName = tid + '.txt';
                }
            }
            
            let fileUrl = baseUrl + fileName;
            console.log("[category] 最终请求文件: " + fileUrl);
            
            let content = fetchSync(fileUrl);
            if (content && content.length > 0) {
                let lines = content.split(/\r?\n/);
                console.log("[category] 文件行数: " + lines.length);
                
                for (let line of lines) {
                    if (!line || line.trim() === "") continue;
                    
                    // 支持两种格式: "标题,URL" 或 "标题$URL"
                    let separator = line.indexOf(',') > 0 ? ',' : '$';
                    let commaIndex = line.indexOf(separator);
                    
                    if (commaIndex > 0) {
                        let title = line.substring(0, commaIndex).trim();
                        let link = line.substring(commaIndex + 1).trim();
                        
                        if (link && (link.startsWith('http') || link.startsWith('https'))) {
                            videos.push({
                                vod_id: link + "###music",
                                vod_name: title,
                                vod_pic: getMusicCover(title),
                                vod_remarks: getFileType(link)
                            });
                        } else if (link && link.length > 0) {
                            // 可能是相对路径，尝试补全
                            let fullLink = baseUrl + link;
                            videos.push({
                                vod_id: fullLink + "###music",
                                vod_name: title,
                                vod_pic: getMusicCover(title),
                                vod_remarks: "🎵 音乐"
                            });
                        }
                    }
                }
                console.log("[category] 获取到 " + videos.length + " 条数据");
            } else {
                console.log("[category] 文件请求失败或为空: " + fileUrl);
                // 返回提示信息
                videos.push({
                    vod_id: "error###test",
                    vod_name: "⚠️ 无法加载数据，请检查文件是否存在: " + fileName,
                    vod_pic: "",
                    vod_remarks: "错误"
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
        console.log("[category] 错误: " + e.message);
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
            let streamUrl = "https://cctv1h5cctv.aikan.miguvideo.com/cctv1_2/index.m3u8";
            let vod = {
                vod_id: videoId,
                vod_name: "央视直播",
                vod_play_from: "央视直播",
                vod_play_url: "直播流$" + streamUrl
            };
            return JSON.stringify({ list: [vod] });
        } else {
            let title = videoId.split('/').pop().split('.')[0] || "音乐";
            let vod = {
                vod_id: videoId,
                vod_name: title,
                vod_pic: getMusicCover(title),
                vod_play_from: "音乐",
                vod_play_url: title + "$" + videoId
            };
            return JSON.stringify({ list: [vod] });
        }
    } catch(e) {
        console.log("[detail] 错误: " + e.message);
        return JSON.stringify({ list: [] });
    }
}

function play(flag, id, vipFlags) {
    console.log("[play] " + id);
    return JSON.stringify({ parse: 0, url: id });
}

function search(keyword, page) {
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