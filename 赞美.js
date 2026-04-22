// ==================== 专业爬虫App框架 ====================
// 版本: 3.0.0

// ==================== 全局配置 ====================
const config = {
    player: {},
    filter: {}
};

const header = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.54 Safari/537.36"
};

// ==================== 全局变量 ====================
let txty = null;
let tid = null;
let txt = null;

// ==================== 工具函数 ====================

/**
 * 同步网络请求（TVBox环境使用req）
 */
function fetchSync(url, customHeaders) {
    try {
        let reqHeaders = customHeaders || header;
        let response = req(url, {
            'method': 'GET',
            'headers': reqHeaders
        });
        return response;
    } catch (error) {
        console.log("fetchSync error: " + url);
        return null;
    }
}

// ==================== 核心功能 ====================

/**
 * 初始化函数
 */
function init(extend) {
    try {
        console.log("============初始化成功============");
        txty = null;
        tid = null;
        txt = null;
    } catch (error) {
        console.log("init error: " + error);
    }
}

/**
 * 首页函数 - 返回分类列表
 */
function home() {
    try {
        let classes = [
            { type_name: "音乐排行", type_id: "yypy" },
            { type_name: "迦南诗歌", type_id: "赞美诗.txt" },
            { type_name: "赞美🩷诗歌", type_id: "zm.txt" },
            { type_name: "央视栏目", type_id: "TOPC" }
        ];
        
        return JSON.stringify({
            class: classes,
            filters: null
        });
    } catch (error) {
        console.log("home error: " + error);
        return JSON.stringify({ class: [], filters: null });
    }
}

/**
 * 首页视频列表
 */
function homeVod() {
    try {
        return JSON.stringify({ list: [] });
    } catch (error) {
        console.log("homeVod error: " + error);
        return JSON.stringify({ list: [] });
    }
}

/**
 * 分类页面
 */
function category(tid, pg, filter, extend) {
    try {
        pg = parseInt(pg) || 1;
        
        if (pg >= 2) {
            return JSON.stringify({
                list: [],
                page: pg,
                pagecount: 1,
                limit: 90,
                total: 0
            });
        }
        
        let result;
        
        // 处理不同类型的分类
        if (tid === "yypy") {
            result = getRank("yypy.txt", pg);
        } else if (tid === "zm") {
            result = getRank("赞美诗.txt", pg);
        } else if (tid === "赞美诗.txt") {
            result = getRank("赞美诗.txt", pg);
        } else if (tid && tid === "TOPC") {
            result = getCCTVList(pg);
        } else {
            result = getRank(tid, pg);
        }
        
        return JSON.stringify(result);
    } catch (error) {
        console.log("category error: " + error);
        return JSON.stringify({ list: [], page: pg, pagecount: 0, limit: 90, total: 0 });
    }
}

/**
 * 获取排行数据（TXT格式）- 修复版
 */
function getRank(tidParam, pg) {
    try {
        txt = "True111";
        let url = "https://raw.githubusercontent.com/mannys888/frist/refs/heads/main/赞美诗.txt"
        let response = fetchSync(url);
        
        let videos = [];
        
        if (response && response.content) {
            let jo = response.content;
            let lines = jo.split(/\r?\n/);
            
            for (let i = 0; i < lines.length; i++) {
                let line = lines[i];
                if (!line || line.trim() === "") continue;
                
                // 检查是否包含http链接
                if (line.indexOf('http') >= 0) {
                    let parts = line.split(',');
                    if (parts.length >= 2) {
                        let link = parts[1].trim();      // 视频/音频URL
                        let title = parts[0].trim();     // 标题
                        
                        // 提取文件名作为图片URL的替代方案
                        let fileName = title;
                        if (title.indexOf('/') >= 0) {
                            fileName = title.split('/').pop();
                        }
                        
                        videos.push({
                            vod_id: link + "###" + txt,
                            vod_name: title,  // 使用真实标题，不是URL
                            vod_pic: getMusicCover(title),  // 根据标题获取封面
                            vod_remarks: formatDuration(link)  // 显示时长或格式
                        });
                    }
                }
            }
        }
        
        console.log("getRank完成，共获取 " + videos.length + " 条数据");
        
        return {
            list: videos,
            page: pg,
            pagecount: 9999,
            limit: 90,
            total: videos.length
        };
    } catch (error) {
        console.log("getRank error: " + error);
        return { list: [], page: pg, pagecount: 0, limit: 90, total: 0 };
    }
}

/**
 * 根据音乐标题获取封面图片
 */
function getMusicCover(title) {
    try {
        // 使用免费的音乐封面API或默认图片
        let defaultCovers = [
            "https://picsum.photos/200/300?random=1",
            "https://picsum.photos/200/300?random=2",
            "https://picsum.photos/200/300?random=3",
            "https://picsum.photos/200/300?random=4",
            "https://picsum.photos/200/300?random=5"
        ];
        
        // 根据标题hash选择不同的默认图片
        let hash = 0;
        for (let i = 0; i < title.length; i++) {
            hash = ((hash << 5) - hash) + title.charCodeAt(i);
            hash = hash & hash;
        }
        let index = Math.abs(hash) % defaultCovers.length;
        
        return defaultCovers[index];
    } catch (error) {
        return "https://picsum.photos/200/300";
    }
}

/**
 * 格式化时长
 */
function formatDuration(url) {
    try {
        if (url.indexOf('.mp3') > 0) {
            return "音频";
        } else if (url.indexOf('.mp4') > 0) {
            return "视频";
        } else if (url.indexOf('.m3u8') > 0) {
            return "直播";
        } else {
            return "点播";
        }
    } catch (error) {
        return "未知";
    }
}

/**
 * 获取央视栏目列表
 */
function getCCTVList(pg) {
    try {
        let videos = [];
        let cctvChannels = [
            { name: "CCTV-1 综合", id: "EPGC1386744804340101", pic: "https://picsum.photos/200/300?random=11" },
            { name: "CCTV-2 财经", id: "EPGC1386744804340102", pic: "https://picsum.photos/200/300?random=12" },
            { name: "CCTV-3 综艺", id: "EPGC1386744804340103", pic: "https://picsum.photos/200/300?random=13" },
            { name: "CCTV-4 中文国际", id: "EPGC1386744804340104", pic: "https://picsum.photos/200/300?random=14" },
            { name: "CCTV-5 体育", id: "EPGC1386744804340107", pic: "https://picsum.photos/200/300?random=15" },
            { name: "CCTV-6 电影", id: "EPGC1386744804340108", pic: "https://picsum.photos/200/300?random=16" },
            { name: "CCTV-7 国防军事", id: "EPGC1386744804340109", pic: "https://picsum.photos/200/300?random=17" },
            { name: "CCTV-8 电视剧", id: "EPGC1386744804340110", pic: "https://picsum.photos/200/300?random=18" },
            { name: "CCTV-9 纪录", id: "EPGC1386744804340112", pic: "https://picsum.photos/200/300?random=19" },
            { name: "CCTV-10 科教", id: "EPGC1386744804340113", pic: "https://picsum.photos/200/300?random=20" },
            { name: "CCTV-11 戏曲", id: "EPGC1386744804340114", pic: "https://picsum.photos/200/300?random=21" },
            { name: "CCTV-12 社会与法", id: "EPGC1386744804340115", pic: "https://picsum.photos/200/300?random=22" },
            { name: "CCTV-13 新闻", id: "EPGC1386744804340116", pic: "https://picsum.photos/200/300?random=23" },
            { name: "CCTV-14 少儿", id: "EPGC1386744804340117", pic: "https://picsum.photos/200/300?random=24" },
            { name: "CCTV-15 音乐", id: "EPGC1386744804340118", pic: "https://picsum.photos/200/300?random=25" }
        ];
        
        for (let i = 0; i < cctvChannels.length; i++) {
            let channel = cctvChannels[i];
            videos.push({
                vod_id: channel.id + "###cctv",
                vod_name: channel.name,
                vod_pic: channel.pic,
                vod_remarks: "央视直播"
            });
        }
        
        return {
            list: videos,
            page: pg,
            pagecount: 1,
            limit: 90,
            total: videos.length
        };
    } catch (error) {
        console.log("getCCTVList error: " + error);
        return { list: [], page: pg, pagecount: 0, limit: 90, total: 0 };
    }
}

/**
 * 获取视频列表（CNTV点播详情）
 */
function getVodeolist(vodId) {
    try {
        let aid = vodId.split('###');
        if (aid.length < 2) {
            return { list: [] };
        }
        
        let tidParam = aid[0];
        let videoList = [];
        
        // 央视直播流地址
        let streamUrls = {
            "EPGC1386744804340101": "https://m3u8.38cdn.com/newhd/202312/658c5d677ebb8b1bc4c9e4f0/hls/index.m3u8",
            "EPGC1386744804340102": "https://cctv2h5cctv.aikan.miguvideo.com/cctv2_2/index.m3u8",
            "EPGC1386744804340103": "https://cctv3h5cctv.aikan.miguvideo.com/cctv3_2/index.m3u8",
            "EPGC1386744804340104": "https://cctv4h5cctv.aikan.miguvideo.com/cctv4_2/index.m3u8",
            "EPGC1386744804340107": "https://cctv5h5cctv.aikan.miguvideo.com/cctv5_2/index.m3u8"
        };
        
        let streamUrl = streamUrls[tidParam] || "https://cctv1h5cctv.aikan.miguvideo.com/cctv1_2/index.m3u8";
        
        videoList.push("直播流$" + streamUrl);
        
        let vod = {
            vod_id: tidParam,
            vod_name: "央视直播",
            vod_pic: aid[1] || "",
            type_name: '直播',
            vod_year: '',
            vod_area: '',
            vod_remarks: '高清直播',
            vod_actor: '',
            vod_director: '',
            vod_content: '央视高清直播频道'
        };
        
        vod.vod_play_from = "央视直播";
        vod.vod_play_url = videoList.join('#');
        
        return { list: [vod] };
    } catch (error) {
        console.log("getVodeolist error: " + error);
        return { list: [] };
    }
}

/**
 * 获取列表数据（TXT直播详情）- 修复版
 */
function getListwww(vodId) {
    try {
        let aid = vodId.split('###');
        if (aid.length < 2) {
            return { list: [] };
        }
        
        let videoList = [];
        let url = aid[0];  // 直接使用链接作为播放地址
        
        // 从URL中提取标题
        let title = "音乐播放";
        let urlParts = url.split('/');
        if (urlParts.length > 0) {
            let fileName = urlParts[urlParts.length - 1];
            title = fileName.split('.')[0] || "音乐";
        }
        
        videoList.push(title + "$" + url);
        
        let vod = {
            vod_id: url,
            vod_name: title,
            vod_pic: getMusicCover(title),
            type_name: '音频',
            vod_year: '',
            vod_area: '',
            vod_remarks: '点击播放',
            vod_actor: '',
            vod_director: '',
            vod_content: title
        };
        
        vod.vod_play_from = "音乐";
        vod.vod_play_url = videoList.join('#');
        
        return { list: [vod] };
    } catch (error) {
        console.log("getListwww error: " + error);
        return { list: [] };
    }
}

/**
 * 详情页面
 */
function detail(vodId) {
    try {
        if (!vodId) {
            return JSON.stringify({ list: [] });
        }
        
        let aid = vodId.split('###');
        if (aid.length < 2) {
            return JSON.stringify({ list: [] });
        }
        
        let txtParam = aid[1];
        
        let result;
        if (txtParam === "True111") {
            result = getListwww(vodId);
        } else if (txtParam === "cctv") {
            result = getVodeolist(vodId);
        } else {
            result = getVodeolist(vodId);
        }
        
        return JSON.stringify(result);
    } catch (error) {
        console.log("detail error: " + error);
        return JSON.stringify({ list: [] });
    }
}

/**
 * 播放函数
 */
function play(flag, id, vipFlags) {
    try {
        let link = id;
        
        // 检查是否是URL
        let pattern = /(https?:\/\/[^/]+)/;
        let match = pattern.exec(id);
        
        if (!match) {
            // 不是URL，尝试获取视频信息
            let url = "https://vdn.apps.cntv.cn/api/getHttpVideoInfo.do?pid=" + id;
            let response = fetchSync(url);
            
            if (response && response.content) {
                try {
                    let jo = JSON.parse(response.content);
                    if (jo && jo.hls_url) {
                        link = jo.hls_url.trim();
                    }
                } catch (e) {
                    console.log("parse error: " + e);
                }
            }
        }
        
        let result = {
            parse: 0,
            playUrl: '',
            url: link,
            header: header
        };
        
        console.log("播放地址: " + link);
        return JSON.stringify(result);
    } catch (error) {
        console.log("play error: " + error);
        return JSON.stringify({ parse: 0, playUrl: '', url: '' });
    }
}

/**
 * 搜索功能
 */
function search(keyword, page) {
    try {
        return JSON.stringify({ list: [] });
    } catch (error) {
        console.log("search error: " + error);
        return JSON.stringify({ list: [] });
    }
}

// ==================== 导出模块 ====================
__JS_SPIDER__ = {
    'init': init,
    'home': home,
    'homeVod': homeVod,
    'category': category,
    'detail': detail,
    'play': play,
    'search': search
};