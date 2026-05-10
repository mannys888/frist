// ==================== 按键自动解锁爬虫 v46 ====================
// 解锁方式：进入解锁界面后，连续点击数字（0-9）输入4位密码（默认1234）
// 每输入一位显示 *，输入完四位自动验证，正确则解锁并返回首页分类
// 支持删除、清除按钮，但自动验证让操作更简便
// =========================================================

let __ext_config = { sources: [], global: {} };
let cache_data = {};
let debugMode = true;
let def_pic = 'https://picsum.photos/200/300?random=1';
const VERSION = '按键自动解锁 v1.0';
const RKEY = 'unlock_spider';
const PASSWORD = '1234';   // 默认密码，可修改为任意长度数字

let unlocked = false;
let inputBuffer = '';       // 当前输入的临时密码

function print(any) {
    if (!debugMode) return;
    console.log(typeof any === 'object' ? JSON.stringify(any) : any);
}
function setItem(k, v) { local.set(RKEY, k, v); print(`设置 ${k} => ${v}`); }
function getItem(k, v) { return local.get(RKEY, k) || v; }

// 内置测试分类（解锁后显示，可替换为您的真实源）
const dummySources = [
    { name: "📺 央视测试", url: "https://example.com/cctv.m3u8" },
    { name: "🎬 电影测试", url: "https://example.com/movie.m3u8" }
];

// 虚拟键盘布局（0-9 + 删除 + 清除）
function getKeyboardItems() {
    let items = [];
    for (let i = 0; i <= 9; i++) {
        items.push({ title: ` ${i} `, value: i.toString() });
    }
    items.push({ title: " ⌫ 删除", value: "backspace" });
    items.push({ title: " 🗑 清除", value: "clear" });
    return items;
}

// ---------- 占位函数（简化版，如需实际播放请扩展）----------
function smartRequest(url, options = {}) { return { text: () => '', json: () => ({}) }; }
function fetchSource(url, sourceConfig = {}, noCache = false) { return ''; }
function parseList(content, parseConfig, baseUrl) { return []; }
function convertM3uToNormal(m3u) { return m3u; }
function splitArray(arr, parse) { return []; }

// ---------- 外部接口 ----------
function init(ext) {
    print(VERSION);
    unlocked = getItem('global_unlock', 'false') === 'true';
    // 解析用户真实的 ext 配置（如果存在）
    let configData = null;
    if (typeof ext === 'object') configData = ext;
    else if (typeof ext === 'string') {
        if (ext.startsWith('http')) {
            let resp = smartRequest(ext);
            configData = resp.json();
        } else {
            try { configData = JSON.parse(ext); } catch(e) {}
        }
    }
    if (configData) {
        if (Array.isArray(configData)) __ext_config.sources = configData;
        else if (configData.sources) __ext_config.sources = configData.sources;
        if (configData.global && configData.global.debug !== undefined) debugMode = configData.global.debug;
    } else {
        __ext_config.sources = dummySources;
    }
    print(`解锁状态: ${unlocked}, 分类数: ${__ext_config.sources.length}`);
}

function home(filter) {
    if (!unlocked) {
        return JSON.stringify({
            class: [{ type_id: '__UNLOCK__', type_name: '🔒 点击解锁', icon: '🔒' }],
            filters: {}
        });
    }
    let classes = __ext_config.sources.map(s => ({ type_id: s.name, type_name: s.name }));
    return JSON.stringify({ class: classes, filters: {} });
}
function homeVod() { return JSON.stringify({ list: [] }); }

function category(tid, pg, filter, extend) {
    if (!unlocked) {
        if (tid === '__UNLOCK__') {
            let items = getKeyboardItems();
            let videos = items.map((item, idx) => ({
                vod_id: `key_${idx}###${item.value}`,
                vod_name: item.title,
                vod_pic: def_pic,
                vod_remarks: ''
            }));
            let display = '*'.repeat(inputBuffer.length) + '_'.repeat(PASSWORD.length - inputBuffer.length);
            let statusItem = {
                vod_id: 'status',
                vod_name: `🔐 请输入 ${PASSWORD.length} 位密码: ${display}`,
                vod_pic: def_pic,
                vod_remarks: '用遥控器选择数字，自动解锁'
            };
            videos.unshift(statusItem);
            return JSON.stringify({ list: videos, page: 1, pagecount: 1, limit: videos.length, total: videos.length });
        }
        return JSON.stringify({ list: [] });
    }

    // 已解锁：正常分类内容（需根据您的实际数据源实现）
    if (pg > 1) return JSON.stringify({ list: [] });
    let source = __ext_config.sources.find(s => s.name === tid);
    if (!source) return JSON.stringify({ list: [] });
    // 示例：返回测试视频，实际应解析源文件
    let testItems = [
        { title: "测试视频1", url: "https://test.com/1.mp4" },
        { title: "测试视频2", url: "https://test.com/2.mp4" }
    ];
    let videos = testItems.map(item => ({
        vod_id: item.url + '###single',
        vod_name: item.title,
        vod_pic: def_pic,
        vod_remarks: ''
    }));
    return JSON.stringify({ list: videos, page: 1, pagecount: 1, limit: videos.length, total: videos.length });
}

function detail(tid) {
    // 处理键盘按键
    if (tid.startsWith('key_')) {
        let parts = tid.split('###');
        let value = parts[1];
        if (value === 'backspace') {
            inputBuffer = inputBuffer.slice(0, -1);
        } else if (value === 'clear') {
            inputBuffer = '';
        } else if (value >= '0' && value <= '9') {
            if (inputBuffer.length < PASSWORD.length) {
                inputBuffer += value;
                // 自动验证：当输入长度达到密码长度时
                if (inputBuffer.length === PASSWORD.length && inputBuffer === PASSWORD) {
                    setItem('global_unlock', 'true');
                    unlocked = true;
                    print("解锁成功！");
                    return JSON.stringify({ list: [] });  // 返回空列表，应用会返回到分类页
                }
            }
        }
        // 刷新键盘界面
        let items = getKeyboardItems();
        let videos = items.map((item, idx) => ({
            vod_id: `key_${idx}###${item.value}`,
            vod_name: item.title,
            vod_pic: def_pic,
            vod_remarks: ''
        }));
        let display = '*'.repeat(inputBuffer.length) + '_'.repeat(PASSWORD.length - inputBuffer.length);
        let statusItem = {
            vod_id: 'status',
            vod_name: `🔐 请输入 ${PASSWORD.length} 位密码: ${display}`,
            vod_pic: def_pic,
            vod_remarks: '输入正确后自动返回'
        };
        videos.unshift(statusItem);
        return JSON.stringify({ list: videos });
    }

    // 正常视频详情
    let parts = tid.split('###');
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