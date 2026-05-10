// ==================== 极简测试爬虫（无外部依赖） ====================
// 功能：直接返回一个测试分类和一个测试视频，用于验证爬虫基础功能
// ================================================================

function init(extend) {
    console.log("极简测试爬虫初始化");
}

function home(filter) {
    // 固定返回一个测试分类
    let classes = [
        { type_id: "test", type_name: "📺 测试分类" }
    ];
    let filters = {};
    return JSON.stringify({ class: classes, filters: filters });
}

function homeVod() {
    return JSON.stringify({ list: [] });
}

function category(tid, pg, filter, extend) {
    // 返回一个测试视频
    let videos = [
        {
            vod_id: "https://test.com/video.mp4###single",
            vod_name: "测试视频（点击播放）",
            vod_pic: "https://picsum.photos/200/300?random=1",
            vod_remarks: "测试用"
        }
    ];
    return JSON.stringify({
        list: videos,
        page: 1,
        pagecount: 1,
        limit: 90,
        total: 1
    });
}

function detail(vodId) {
    let parts = vodId.split("###");
    let url = parts[0];
    let title = "测试视频";
    let vod = {
        vod_id: url,
        vod_name: title,
        vod_pic: "https://picsum.photos/200/300?random=1",
        vod_play_from: "播放源",
        vod_play_url: "播放$" + url
    };
    return JSON.stringify({ list: [vod] });
}

function play(flag, id, vipFlags) {
    return JSON.stringify({ parse: 0, url: id });
}

function search(keyword, page) {
    return JSON.stringify({ list: [] });
}

export default { init, home, homeVod, category, detail, play, search };