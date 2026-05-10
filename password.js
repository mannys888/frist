// ==================== 央视分类爬虫 v43（内置直播源，无密码） ====================
// 数据源：直接内置您的示例内容，无需 ext 配置
// 分类：1️⃣看直播、2️⃣随时更新频道
// 播放：支持 mp4 和 m3u8
// ================================================================

let cache_data = {};
let debugMode = true;
let def_pic = 'https://picsum.photos/200/300?random=1';

function print(any) {
    if (!debugMode) return;
    console.log(typeof any === 'object' ? JSON.stringify(any) : any);
}

// 内置直播源内容（完全基于您的示例）
const SOURCE_CONTENT = `1️⃣看直播,#genre#
公众号【小马网络园】,https://cloud.video.taobao.com//play/u/709608496/p/1/e/6/t/1/313341682455.mp4
qq群【869256826】,https://cloud.video.taobao.com//play/u/709608496/p/1/e/6/t/1/313689895693.mp4
更新于,http://antiserver.kuwo.cn/anti.s?rid=MUSIC_1583215&response=res&format=mp4&type=convert_url
24年9月3日,http://antiserver.kuwo.cn/anti.s?rid=MUSIC_28470656&response=res&format=mp4&type=convert_url
新增音乐频道,https://txmov2.a.kwimgs.com/bs3/video-hls/5235434676052149493_hlsb.m3u8
走进新时代,https://txmov2.a.kwimgs.com/bs3/video-hls/5246693673454575210_hlsb.m3u8
2️⃣随时更新频道,#genre#
CCTV-1(高清),http://1.203.184.49:8888/udp/225.1.8.1:8008
CCTV-2(高清),http://1.203.184.49:8888/udp/225.1.8.2:8084
CCTV-3(高清),http://1.203.184.49:8888/udp/225.1.8.88:8000
CCTV-4(高清),http://1.203.184.49:8888/udp/225.1.8.4:8092
CCTV-5(高清),http://1.203.184.49:8888/udp/225.1.8.89:8000
CCTV-5+(高清),http://1.203.184.49:8888/udp/225.1.8.20:8004
CCTV-6(高清),http://1.203.184.49:8888/udp/225.1.8.84:8000
`;

// 解析分类和条目
function parseSource(content) {
    let lines = content.split(/\r?\n/);
    let categories = [];
    let current = null;
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (line.includes('#genre#')) {
            if (current) {
                current.end = i - 1;
                categories.push(current);
                current = null;
            }
            let name = line.split(',')[0];
            current = { name, start: i + 1, end: -1 };
        }
    }
    if (current) {
        current.end = lines.length - 1;
        categories.push(current);
    }
    return { lines, categories };
}

const parsed = parseSource(SOURCE_CONTENT);

function init(extend) {
    print("爬虫初始化（内置直播源）");
}

function home(filter) {
    let classes = parsed.categories.map(cat => ({
        type_id: cat.name,
        type_name: cat.name,
        icon: '📺'
    }));
    return JSON.stringify({ class: classes, filters: {} });
}

function homeVod() { return JSON.stringify({ list: [] }); }

function category(tid, pg, filter, extend) {
    if (pg > 1) return JSON.stringify({ list: [] });
    let category = parsed.categories.find(c => c.name === tid);
    if (!category) return JSON.stringify({ list: [] });
    let items = [];
    for (let i = category.start; i <= category.end; i++) {
        let line = parsed.lines[i].trim();
        if (!line) continue;
        let idx = line.indexOf(',');
        if (idx > 0) {
            let title = line.substring(0, idx).trim();
            let url = line.substring(idx + 1).trim();
            if (url) items.push({ title, url });
        }
    }
    let videos = items.map(item => ({
        vod_id: item.url + '###single',
        vod_name: item.title,
        vod_pic: def_pic,
        vod_remarks: ''
    }));
    return JSON.stringify({ list: videos, page: 1, pagecount: 1, limit: videos.length, total: videos.length });
}

function detail(vodId) {
    let parts = vodId.split('###');
    let url = parts[0];
    let title = decodeURIComponent(url.split('/').pop().split('.')[0] || "媒体");
    let vod = {
        vod_id: url,
        vod_name: title,
        vod_pic: def_pic,
        vod_play_from: "播放源",
        vod_play_url: "播放$" + url
    };
    return JSON.stringify({ list: [vod] });
}

function play(flag, id, vipFlags) {
    let parse = /m3u8|ts|flv/i.test(id) ? 0 : 1;
    return JSON.stringify({ parse, playUrl: '', url: id });
}

function search(wd, quick) {
    return JSON.stringify({ list: [] });
}

export default { init, home, homeVod, category, detail, play, search };