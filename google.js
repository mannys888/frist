// 极简测试脚本 - 仅用于验证解锁分类是否显示
let unlocked = false;

function init(ext) { print("init executed"); }
function home(filter) {
    if (!unlocked) {
        return JSON.stringify({ class: [{ type_id: '__UNLOCK__', type_name: '🔒 点击解锁' }], filters: {} });
    }
    return JSON.stringify({ class: [], filters: {} });
}
function homeVod() { return JSON.stringify({ list: [] }); }
function category(tid) {
    if (tid === '__UNLOCK__') {
        return JSON.stringify({ list: [{ vod_id: 'unlock', vod_name: '点击解锁', vod_pic: '' }] });
    }
    return JSON.stringify({ list: [] });
}
function detail(tid) {
    if (tid === 'unlock') {
        // 简单密码：1234
        return JSON.stringify({ list: [{ vod_id: 'success', vod_name: '解锁成功', vod_play_url: 'https://vd2.bdstatic.com/mda-sbehdejw4kmibhkh/576p/h264/1771157811027978795/mda-sbehdejw4kmibhkh.mp4' }] });
    }
    return JSON.stringify({ list: [] });
}
function play() { return JSON.stringify({ parse: 0, url: '' }); }
function search(wd) { return JSON.stringify({ list: [] }); }
export default { init, home, homeVod, category, detail, play, search };