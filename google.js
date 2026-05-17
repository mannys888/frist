// ==================== 本地直播源搜索爬虫 ====================
// 功能：密码锁 + 直播源分类 + 搜索本地直播源（按标题匹配）
// ============================================================

String.prototype.rstrip = function (chars) {
  let regex = new RegExp(chars + "$");
  return this.replace(regex, "");
};

// ========== 全局配置 ==========
let __ext_config = { sources: [], global: {} };
let cache_data = {};
let showMode = 'groups';
let groupDict = {};
let debugMode = true;
let defaultTimeout = 10000;
let defaultRetry = 2;
let def_pic = 'https://picsum.photos/200/300?random=1';
const VERSION = 'local source search';
const tips = `\n${VERSION}`;
const RKEY = 'local_search';

function getDynamicPic(seed) {
  if (!seed) return def_pic;
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/200/300`;
}

// ========== 密码锁核心 ==========
let remoteUnlockVideos = null;
let externalUnlockVideos = null;
const UNLOCK_VALID_MINUTES = 10;

function getCurrentTimePassword() {
    let now = new Date();
    let hours = now.getHours().toString().padStart(2,'0');
    let minutes = now.getMinutes().toString().padStart(2,'0');
    return hours + minutes;
}
function verifyDynamicPassword(input) {
    return input === getCurrentTimePassword();
}
let unlocked = false;
let unlockTime = 0;
function setUnlocked(status) {
    if (status) {
        unlockTime = Date.now();
        setItem('global_unlock_time', unlockTime.toString());
        setItem('global_unlock', 'true');
    } else {
        setItem('global_unlock', 'false');
        setItem('global_unlock_time', '0');
        unlockTime = 0;
    }
    unlocked = status;
}
function getUnlocked() {
    let stored = getItem('global_unlock', 'false') === 'true';
    if (!stored) return false;
    let storedTime = parseInt(getItem('global_unlock_time', '0'));
    if (storedTime === 0) return false;
    let diffMinutes = (Date.now() - storedTime) / (1000 * 60);
    if (diffMinutes > UNLOCK_VALID_MINUTES) {
        setUnlocked(false);
        return false;
    }
    unlockTime = storedTime;
    return true;
}

function getPasswordKeyboard() {
    let items = [];
    for (let i = 0; i <= 9; i++) {
        items.push({ vod_id: `__PWD_KEY__${i}`, vod_name: `${i}`, vod_pic: getDynamicPic(`pwd_key_${i}`), vod_remarks: '' });
    }
    items.push({ vod_id: '__PWD_BACKSPACE', vod_name: '⌫ 删除', vod_pic: getDynamicPic('pwd_backspace'), vod_remarks: '' });
    items.push({ vod_id: '__PWD_CLEAR', vod_name: '🗑 清除', vod_pic: getDynamicPic('pwd_clear'), vod_remarks: '' });
    return items;
}
let unlockBuffer = '';
let unlockMode = false;

// ========== 辅助函数 ==========
function print(any) {
  if (!debugMode) return;
  if (typeof any == 'object' && Object.keys(any).length > 0) {
    try { console.log(JSON.stringify(any)); } catch(e) { console.log(any); }
  } else { console.log(any); }
}
function setItem(k, v) { local.set(RKEY, k, v); print(`设置 ${k} => ${v}`); }
function getItem(k, v) { return local.get(RKEY, k) || v; }

// ========== 智能请求 ==========
function smartRequest(url, options = {}) {
  let method = options.method || 'GET';
  let headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', ...(options.headers || {}) };
  if (!headers['Referer']) {
    let match = url.match(/^(https?:\/\/[^/]+)/);
    if (match) headers['Referer'] = match[1] + '/';
  }
  if (options.cookie) headers['Cookie'] = options.cookie;
  let reqOptions = { method, headers, timeout: options.timeout || defaultTimeout };
  if (options.body) {
    reqOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
  }
  let retries = options.retry || defaultRetry;
  for (let i = 0; i <= retries; i++) {
    try {
      let res = req(url, reqOptions);
      res.json = () => res.content ? JSON.parse(res.content) : null;
      res.text = () => res.content || '';
      return res;
    } catch(e) {
      if (i === retries) throw e;
      print(`请求失败，重试 ${i+1}/${retries}: ${url} - ${e.message}`);
    }
  }
}

// ========== 解析直播源（txt格式） ==========
function parseLiveSource(content) {
  let items = [];
  let lines = content.split(/\r?\n/);
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    let parts = line.split(',');
    if (parts.length >= 2) {
      let title = parts[0].trim();
      let url = parts[1].trim();
      if (title && url) items.push({ title, url });
    }
  }
  return items;
}

// ========== 搜索本地直播源 ==========
function searchLocalSource(keyword, sourceUrl, sourceConfig) {
  let results = [];
  try {
    let content = fetchSource(sourceUrl, sourceConfig);
    let items = parseLiveSource(content);
    for (let item of items) {
      if (item.title.toLowerCase().includes(keyword.toLowerCase())) {
        results.push({
          vod_id: item.url + '###single',
          vod_name: item.title,
          vod_pic: getDynamicPic(item.title),
          vod_remarks: '搜索结果'
        });
      }
    }
  } catch(e) {
    print("搜索直播源失败: " + e.message);
  }
  return results;
}

function fetchSource(url, sourceConfig, noCache = false) {
  if (!noCache && cache_data[url]) return cache_data[url];
  let opts = {
    method: sourceConfig.method || 'GET',
    headers: { ...(sourceConfig.headers || {}) },
    body: sourceConfig.body,
    timeout: sourceConfig.timeout || defaultTimeout,
    cookie: sourceConfig.cookie || getItem('site_cookie'),
    retry: sourceConfig.retry
  };
  let resp = smartRequest(url, opts);
  let content = resp.text();
  if (!noCache) cache_data[url] = content;
  return content;
}

// ========== 外部接口 ==========
function init(ext) {
    unlocked = getUnlocked();
    print(`解锁状态: ${unlocked ? '已解锁' : '未解锁'}`);
    
    let configData = null;
    if (typeof ext === 'object') configData = ext;
    else if (typeof ext === 'string') {
        if (ext.startsWith('http')) {
            try {
                let resp = smartRequest(ext);
                configData = resp.json();
            } catch(e) { print("远程配置获取失败:"+e); }
        } else {
            try { configData = JSON.parse(ext); } catch(e) { print("ext JSON解析失败"); }
        }
    }
    if (configData) {
        if (Array.isArray(configData) && configData[0]?.name && configData[0]?.url) __ext_config.sources = configData;
        else if (configData.sources) __ext_config = configData;
        if (__ext_config.global) {
            if (__ext_config.global.defaultPic) def_pic = __ext_config.global.defaultPic;
            if (__ext_config.global.defaultTimeout) defaultTimeout = __ext_config.global.defaultTimeout;
            if (__ext_config.global.debug !== undefined) debugMode = __ext_config.global.debug;
        }
    }
    
    if (!__ext_config.sources) __ext_config.sources = [];
    print(`加载 ${__ext_config.sources.length} 个分类`);
    
    showMode = getItem('showMode', 'groups');
    groupDict = JSON.parse(getItem('groupDict', '{}'));
    
    if (__ext_config.global && __ext_config.global.unlockVideos) {
        externalUnlockVideos = __ext_config.global.unlockVideos;
    } else {
        externalUnlockVideos = null;
    }
}

function home(filter) {
    if (unlocked) {
        let storedTime = parseInt(getItem('global_unlock_time', '0'));
        if (storedTime && (Date.now() - storedTime) > (UNLOCK_VALID_MINUTES * 60 * 1000)) {
            setUnlocked(false);
            unlocked = false;
        }
    }
    if (!unlocked) {
        let unlockClass = { type_id: '__UNLOCK__', type_name: '🔒 点击解锁', icon: '🔒' };
        return JSON.stringify({ class: [unlockClass], filters: {} });
    }
    let classes = __ext_config.sources.map(s => ({ type_id: s.name, type_name: s.name }));
    let filters = [{ key: 'show', name: '播放展示', value: [{ n: '多线路分组', v: 'groups' }, { n: '单线路', v: 'all' }] }];
    let filterDict = {};
    classes.forEach(c => { filterDict[c.type_id] = filters; });
    return JSON.stringify({ class: classes, filters: filterDict });
}

function homeVod() { return JSON.stringify({ list: [] }); }

function category(tid, pg, filter, extend) {
    if (!unlocked && tid === '__UNLOCK__') {
        unlockMode = true;
        unlockBuffer = '';
        let videos = getPasswordKeyboard();
        let statusItem = {
            vod_id: '__UNLOCK_STATUS_INIT_' + Date.now(),
            vod_name: `🔐 请输入密码____`,
            vod_pic: getDynamicPic('unlock_status'),
            vod_remarks: '使用遥控器数字键输入当前时间（HHMM），将明文显示'
        };
        videos.unshift(statusItem);
        return JSON.stringify({ list: videos, page: 1, pagecount: 1, limit: videos.length, total: videos.length });
    }
    
    let fl = filter ? extend : {};
    if (fl.show) { showMode = fl.show; setItem('showMode', showMode); }
    if (parseInt(pg) > 1) return JSON.stringify({ list: [] });
    let source = __ext_config.sources.find(s => s.name === tid);
    if (!source) return JSON.stringify({ list: [] });
    
    // 获取直播源内容并解析
    let content = fetchSource(source.url, source);
    let items = parseLiveSource(content);
    let videos = items.map(item => ({
        vod_id: item.url + '###single',
        vod_name: item.title,
        vod_pic: getDynamicPic(item.title),
        vod_remarks: source.name
    }));
    return JSON.stringify({ list: videos, page: 1, pagecount: 1, limit: videos.length, total: videos.length });
}

function detail(tid) {
    // ========== 1. 优先处理音乐/视频直链（__MUSIC__ 前缀） ==========
    if (tid && tid.startsWith('__MUSIC__')) {
        let encodedUrl = tid.substring('__MUSIC__'.length);
        let url = decodeURIComponent(encodedUrl);
        print("播放媒体直链: " + url);
        let vod = {
            vod_id: tid,
            vod_name: '媒体播放',
            vod_pic: def_pic,
            type_name: "直链",
            vod_play_from: "直链",
            vod_play_url: url,
            vod_remarks: '点击播放'
        };
        return JSON.stringify({ list: [vod] });
    }

    // ========== 2. 处理直播源卡片：如果 tid 是 http(s)://...###single 格式 ==========
    if (tid && tid.includes('###single') && (tid.startsWith('http://') || tid.startsWith('https://'))) {
        let url = tid.split('###')[0];
        print("播放直播源链接: " + url);
        let vod = {
            vod_id: tid,
            vod_name: '直播播放',
            vod_pic: def_pic,
            type_name: "直播",
            vod_play_from: "直链",
            vod_play_url: url,
            vod_remarks: '点击播放'
        };
        return JSON.stringify({ list: [vod] });
    }

    // ========== 3. 密码锁键盘处理 ==========
    if (unlockMode && tid.startsWith('__PWD_KEY__')) {
        let digit = tid.replace('__PWD_KEY__', '');
        if (digit >= '0' && digit <= '9') {
            if (unlockBuffer.length < 4) {
                unlockBuffer += digit;
                if (unlockBuffer.length === 4) {
                    if (verifyDynamicPassword(unlockBuffer)) {
                        setUnlocked(true);
                        unlocked = true;
                        unlockMode = false;
                        let videoList = [];
                        if (remoteUnlockVideos && remoteUnlockVideos.length) videoList = remoteUnlockVideos;
                        else if (externalUnlockVideos && externalUnlockVideos.length) videoList = externalUnlockVideos;
                        if (videoList.length === 0) {
                            videoList = [
                                { title: "🎉 庆祝视频 - 精彩剪辑", url: "https://vd2.bdstatic.com/mda-sbehdejw4kmibhkh/576p/h264/1771157811027978795/mda-sbehdejw4kmibhkh.mp4" },
                                { title: "📺 第二集 - 花絮彩蛋", url: "https://vd2.bdstatic.com/mda-qiakr3cmtvs6w0d4/hd/cae_h264/1726065783439501256/mda-qiakr3cmtvs6w0d4.mp4" },
                                { title: "🔔 第三集 - 幕后制作", url: "https://vd3.bdstatic.com/mda-rdkgd5132u941fcr/576p/h264/1745235281540035966/mda-rdkgd5132u941fcr.mp4" }
                            ];
                        }
                        const playUrl = videoList.map(item => `${item.title}$${item.url}`).join('#');
                        let vod = {
                            vod_id: '__UNLOCK_SUCCESS_MULTI',
                            vod_name: '🎉 解锁成功！请选择视频播放',
                            vod_pic: getDynamicPic('unlock_success'),
                            type_name: "解锁合集",
                            vod_play_from: "庆祝源",
                            vod_play_url: playUrl,
                            vod_remarks: `共${videoList.length}个视频`
                        };
                        return JSON.stringify({ list: [vod] });
                    } else {
                        unlockBuffer = '';
                        let videos = getPasswordKeyboard();
                        let statusItem = { vod_id: '__UNLOCK_STATUS_ERR_' + Date.now(), vod_name: `❌ 密码错误，请重试`, vod_pic: getDynamicPic('unlock_error'), vod_remarks: '找管理员要密码' };
                        videos.unshift(statusItem);
                        return JSON.stringify({ list: videos });
                    }
                }
            }
        }
        let videos = getPasswordKeyboard();
        let displayPlain = unlockBuffer + '_'.repeat(4 - unlockBuffer.length);
        let statusItem = { vod_id: '__UNLOCK_STATUS_' + unlockBuffer.length + '_' + Date.now(), vod_name: `🔐 密码: ${displayPlain}`, vod_pic: getDynamicPic('unlock_status'), vod_remarks: '请输入4位数字' };
        videos.unshift(statusItem);
        return JSON.stringify({ list: videos });
    }
    if (unlockMode && tid === '__PWD_BACKSPACE') {
        if (unlockBuffer.length > 0) unlockBuffer = unlockBuffer.slice(0, -1);
        let videos = getPasswordKeyboard();
        let displayPlain = unlockBuffer + '_'.repeat(4 - unlockBuffer.length);
        let statusItem = { vod_id: '__UNLOCK_STATUS_' + unlockBuffer.length + '_' + Date.now(), vod_name: `🔐 密码: ${displayPlain}`, vod_pic: getDynamicPic('unlock_status'), vod_remarks: '请输入4位数字' };
        videos.unshift(statusItem);
        return JSON.stringify({ list: videos });
    }
    if (unlockMode && tid === '__PWD_CLEAR') {
        unlockBuffer = '';
        let videos = getPasswordKeyboard();
        let displayPlain = '_'.repeat(4);
        let statusItem = { vod_id: '__UNLOCK_STATUS_CLEAR_' + Date.now(), vod_name: `🔐 密码: ${displayPlain}`, vod_pic: getDynamicPic('unlock_status'), vod_remarks: '请输入4位数字' };
        videos.unshift(statusItem);
        return JSON.stringify({ list: videos });
    }
    if (unlocked) unlockMode = false;

    // ========== 4. 搜索键盘输入处理 ==========
    if (searchInputMode) {
        if (tid.startsWith('__SEARCH_LETTER__')) {
            let letter = tid.replace('__SEARCH_LETTER__', '');
            searchBuffer += letter;
            let keyboard = getSearchKeyboard();
            let statusItem = {
                vod_id: '__SEARCH_STATUS_' + Date.now(),
                vod_name: `🔍 输入搜索词: ${searchBuffer}`,
                vod_pic: getDynamicPic('search_status'),
                vod_remarks: '点击字母/数字，完成后按🔍搜索'
            };
            keyboard.unshift(statusItem);
            return JSON.stringify({ list: keyboard });
        }
        if (tid.startsWith('__SEARCH_DIGIT__')) {
            let digit = tid.replace('__SEARCH_DIGIT__', '');
            searchBuffer += digit;
            let keyboard = getSearchKeyboard();
            let statusItem = {
                vod_id: '__SEARCH_STATUS_' + Date.now(),
                vod_name: `🔍 输入搜索词: ${searchBuffer}`,
                vod_pic: getDynamicPic('search_status'),
                vod_remarks: '点击字母/数字，完成后按🔍搜索'
            };
            keyboard.unshift(statusItem);
            return JSON.stringify({ list: keyboard });
        }
        if (tid === '__SEARCH_BACKSPACE') {
            if (searchBuffer.length > 0) searchBuffer = searchBuffer.slice(0, -1);
            let keyboard = getSearchKeyboard();
            let display = searchBuffer === '' ? '______' : searchBuffer;
            let statusItem = {
                vod_id: '__SEARCH_STATUS_' + Date.now(),
                vod_name: `🔍 输入搜索词: ${display}`,
                vod_pic: getDynamicPic('search_status'),
                vod_remarks: '点击字母/数字，完成后按🔍搜索'
            };
            keyboard.unshift(statusItem);
            return JSON.stringify({ list: keyboard });
        }
        if (tid === '__SEARCH_CLEAR') {
            searchBuffer = '';
            let keyboard = getSearchKeyboard();
            let statusItem = {
                vod_id: '__SEARCH_STATUS_' + Date.now(),
                vod_name: `🔍 输入搜索词: ______`,
                vod_pic: getDynamicPic('search_status'),
                vod_remarks: '点击字母/数字，完成后按🔍搜索'
            };
            keyboard.unshift(statusItem);
            return JSON.stringify({ list: keyboard });
        }
        if (tid === '__SEARCH_SUBMIT') {
            if (searchBuffer.trim() === '') {
                let keyboard = getSearchKeyboard();
                let statusItem = {
                    vod_id: '__SEARCH_STATUS_EMPTY_' + Date.now(),
                    vod_name: `⚠️ 请输入搜索词`,
                    vod_pic: getDynamicPic('search_error'),
                    vod_remarks: '先点击字母或数字'
                };
                keyboard.unshift(statusItem);
                return JSON.stringify({ list: keyboard });
            }
            searchInputMode = false;
            let keyword = searchBuffer.trim();
            let results = performMultiEngineSearch(keyword);
            return JSON.stringify({ list: results });
        }
    }

    // ========== 5. 普通视频/直播详情解析（原有逻辑） ==========
    let parts = tid.split('###');
    let mode = parts.length > 1 ? parts[1] : 'single';
    let left = parts[0];
    let sourceUrl = left.split('$')[0];
    let tab = left.split('$')[1];
    let source = __ext_config.sources.find(s => s.url === sourceUrl);
    if (!source) return JSON.stringify({ list: [] });

    if (source.handler && customHandlers[source.handler] && mode === 'series') {
        let ctx = { url: sourceUrl, parseConfig: source.parseConfig || {}, extra: { tid } };
        let items = customHandlers[source.handler](ctx);
        if (!items.length) return JSON.stringify({ list: [] });
        let playUrl = buildSeriesPlayUrl(items, source);
        let vodName = source.parseConfig.collectionName || (sourceUrl.split('/').pop().replace(/\.(txt|m3u8?|json)$/i, '') + '合集');
        let vod = { vod_id: tid, vod_name: vodName, vod_pic: getDynamicPic(tid), type_name: "连续剧", vod_play_from: source.name, vod_play_url: playUrl, vod_remarks: `共${items.length}集` };
        return JSON.stringify({ list: [vod] });
    }

    if (mode === 'series') {
        let content = fetchSource(sourceUrl, source);
        let baseDir = sourceUrl.substring(0, sourceUrl.lastIndexOf('/')+1);
        let episodes = parseList(content, source.parseConfig || {}, baseDir);
        if (!episodes.length) return JSON.stringify({ list: [] });
        let playUrl = buildSeriesPlayUrl(episodes, source);
        let vodName = source.parseConfig.collectionName || (sourceUrl.split('/').pop().replace(/\.(txt|m3u8?|json)$/i, '') + '合集');
        let vod = { vod_id: tid, vod_name: vodName, vod_pic: getDynamicPic(tid), type_name: "连续剧", vod_play_from: source.name, vod_play_url: playUrl, vod_remarks: `共${episodes.length}集` };
        return JSON.stringify({ list: [vod] });
    }

    let html = fetchSource(sourceUrl, source);
    let regex = new RegExp(`.*?${tab.replace('(', '\\(').replace(')', '\\)')}[,，]#[\\s\\S].*?#`);
    let match = html.match(regex);
    if (!match) return JSON.stringify({ list: [] });
    let rest = html.split(match[0])[1];
    if (rest.match(/.*?[,，]#[\s\S].*?#/)) rest = rest.split(rest.match(/.*?[,，]#[\s\S].*?#/)[0])[0];
    let lines = rest.trim().split('\n').filter(l => l.trim());
    let items = lines.map(l => { let [t, u] = l.split(','); return t + '$' + u; });
    let playUrl, playFrom;
    if (showMode === 'groups') {
        let groups = splitArray(items, x => x.split('$')[0]);
        let tabs = groups.map((_, i) => i === 0 ? source.name + '1' : ` ${i + 1} `);
        playUrl = groups.map(g => g.join('#')).join('$$$');
        playFrom = tabs.join('$$$');
    } else {
        playUrl = items.join('#');
        playFrom = source.name;
    }
    let vod = {
        vod_id: tid, vod_name: source.name + '|' + tab, type_name: "直播列表", vod_pic: getDynamicPic(tid),
        vod_content: tid, vod_play_from: playFrom, vod_play_url: playUrl,
        vod_director: tips, vod_remarks: VERSION
    };
    return JSON.stringify({ list: [vod] });
}








function play(flag, id, vipFlags) {
    if (!getUnlocked()) {
        print("播放被拒绝：密码锁已过期");
        const tipVideo = "https://vd2.bdstatic.com/mda-sbehdejw4kmibhkh/576p/h264/1771157811027978795/mda-sbehdejw4kmibhkh.mp4";
        return JSON.stringify({ parse: 1, playUrl: '', url: tipVideo });
    }
    let autoParse = /m3u8|ts|flv/i.test(id) ? 0 : 1;
    return JSON.stringify({ parse: autoParse, playUrl: '', url: id });
}

function search(wd, quick) {
    let results = [];
    // 遍历所有 sources，搜索本地直播源
    for (let src of __ext_config.sources) {
        // 只对 txt 类型的源进行搜索（排除其他类型）
        if (src.parseConfig && src.parseConfig.type === 'txt') {
            let searchResults = searchLocalSource(wd, src.url, src);
            results.push(...searchResults);
        }
    }
    if (results.length === 0) {
        results.push({
            vod_id: 'no_result',
            vod_name: `❌ 未找到“${wd}”相关结果`,
            vod_pic: def_pic,
            vod_remarks: '请尝试其他关键词'
        });
    }
    return JSON.stringify({ list: results });
}

export default { init, home, homeVod, category, detail, play, search };