// ==================== 按键解锁爬虫 v45 ====================
// 首次启动：只显示一个“🔒 点击解锁”分类，点击后进入虚拟键盘
// 使用遥控器上下左右移动，确定键输入数字，输入密码（默认 1234）后解锁
// =========================================================

let __ext_config = { sources: [], global: {} };
let cache_data = {};
let debugMode = true;
let def_pic = 'https://avatars.githubusercontent.com/u/97389433?s=120&v=4';
const VERSION = '按键解锁 v1.0';
const RKEY = 'unlock_spider';
const PASSWORD = '1234';   // 默认密码，可修改

let unlocked = false;
let inputBuffer = '';       // 当前输入的临时密码

// ---------- 辅助函数 ----------
function print(any) {
    if (!debugMode) return;
    console.log(typeof any === 'object' ? JSON.stringify(any) : any);
}
function setItem(k, v) { local.set(RKEY, k, v); print(`设置 ${k} => ${v}`); }
function getItem(k, v) { return local.get(RKEY, k) || v; }

// ---------- 内置测试分类（用于解锁后展示） ----------
const dummySources = [
    { name: "📺 测试直播1", url: "https://example.com/1.m3u8" },
    { name: "📺 测试直播2", url: "https://example.com/2.m3u8" }
];

// 虚拟键盘布局：每个条目格式 { title, value }
function getKeyboardItems() {
    let items = [];
    for (let i = 0; i <= 9; i++) {
        items.push({ title: ` ${i} `, value: i.toString() });
    }
    items.push({ title: " ✅ 确认", value: "confirm" });
    items.push({ title: " ❌ 删除", value: "backspace" });
    items.push({ title: " 🔄 清除", value: "clear" });
    return items;
}

// ---------- 网络请求（预留） ----------
function smartRequest(url, options = {}) {
    // 空实现，为兼容原接口
    return { text: () => '', json: () => ({}) };
}
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
        // 没有 ext 配置时使用测试数据
        __ext_config.sources = dummySources;
    }
    print(`解锁状态: ${unlocked}, 分类数: ${__ext_config.sources.length}`);
}

function home(filter) {
    if (!unlocked) {
        // 未解锁时只显示解锁入口
        return JSON.stringify({
            class: [{ type_id: '__UNLOCK__', type_name: '🔒 点击解锁', icon: '🔒' }],
            filters: {}
        });
    }
    // 已解锁，正常返回分类
    let classes = __ext_config.sources.map(s => ({ type_id: s.name, type_name: s.name }));
    let filters = {};
    return JSON.stringify({ class: classes, filters: filters });
}
function homeVod() { return JSON.stringify({ list: [] }); }

function category(tid, pg, filter, extend) {
    if (!unlocked) {
        if (tid === '__UNLOCK__') {
            // 进入解锁界面：返回虚拟键盘列表
            let items = getKeyboardItems();
            let videos = items.map((item, idx) => ({
                vod_id: `key_${idx}###${item.value}`,
                vod_name: item.title,
                vod_pic: def_pic,
                vod_remarks: ''
            }));
            // 在列表顶部显示当前输入状态
            let statusItem = {
                vod_id: 'status',
                vod_name: `📝 已输入: ${inputBuffer.padEnd(4, '_')}`,
                vod_pic: def_pic,
                vod_remarks: '使用遥控器选择数字，确定键输入'
            };
            videos.unshift(statusItem);
            return JSON.stringify({ list: videos, page: 1, pagecount: 1, limit: videos.length, total: videos.length });
        }
        return JSON.stringify({ list: [] });
    }

    // 正常分类逻辑（此处简化，实际应调用 fetchSource 解析）
    if (pg > 1) return JSON.stringify({ list: [] });
    let source = __ext_config.sources.find(s => s.name === tid);
    if (!source) return JSON.stringify({ list: [] });
    // 为简化，直接返回一个测试视频列表
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
    // 处理解锁界面中的按键
    if (tid.startsWith('key_')) {
        let parts = tid.split('###');
        let value = parts[1];
        if (value === 'confirm') {
            // 确认密码
            if (inputBuffer === PASSWORD) {
                setItem('global_unlock', 'true');
                unlocked = true;
                print("解锁成功！");
                // 返回一个提示，前端会自动刷新？这里需要返回一个特殊指令
                // 返回一个空列表，并期望前端重新加载首页
                return JSON.stringify({ list: [] });
            } else {
                inputBuffer = '';
                print("密码错误，已清空");
                // 刷新当前页面，显示错误提示
                let items = getKeyboardItems();
                let videos = items.map((item, idx) => ({
                    vod_id: `key_${idx}###${item.value}`,
                    vod_name: item.title,
                    vod_pic: def_pic,
                    vod_remarks: ''
                }));
                let statusItem = {
                    vod_id: 'status',
                    vod_name: `❌ 密码错误，已清空`,
                    vod_pic: def_pic,
                    vod_remarks: '重新输入'
                };
                videos.unshift(statusItem);
                return JSON.stringify({ list: videos, page: 1, pagecount: 1, limit: videos.length, total: videos.length });
            }
        } else if (value === 'backspace') {
            inputBuffer = inputBuffer.slice(0, -1);
        } else if (value === 'clear') {
            inputBuffer = '';
        } else {
            // 数字
            if (inputBuffer.length < 4) inputBuffer += value;
        }
        // 刷新键盘界面
        let items = getKeyboardItems();
        let videos = items.map((item, idx) => ({
            vod_id: `key_${idx}###${item.value}`,
            vod_name: item.title,
            vod_pic: def_pic,
            vod_remarks: ''
        }));
        let display = inputBuffer.padEnd(4, '_');
        let statusItem = {
            vod_id: 'status',
            vod_name: `📝 已输入: ${display}`,
            vod_pic: def_pic,
            vod_remarks: '使用遥控器选择数字，确定键输入'
        };
        videos.unshift(statusItem);
        return JSON.stringify({ list: videos, page: 1, pagecount: 1, limit: videos.length, total: videos.length });
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