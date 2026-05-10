// ==================== 通用动态爬虫 v34（时间密码 + 自动锁定 - 通用版） ====================
// 适配 Web 前端与 TVBox 环境（定义 __JS_SPIDER__ 全局变量）
// 密码为当前时间（小时+分钟），例如 19:22 -> 1922，9:08 -> 0908
// ================================================================

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
let defaultTimeout = 8000;
let defaultRetry = 2;
let def_pic = 'https://picsum.photos/200/300?random=1';
const VERSION = 'universal v3.4 (time password web)';
const tips = `\n${VERSION}`;
const RKEY = 'universal_spider';

// ========== 兼容 Web 的存储（使用内存变量，TVBox 中也可以正常使用） ==========
let memStore = {};
function setItem(k, v) { 
  if (typeof local !== 'undefined' && local.set) {
    local.set(RKEY, k, v);
  } else {
    memStore[k] = v;
  }
  console.log(`设置 ${k} => ${v}`);
}
function getItem(k, v) { 
  if (typeof local !== 'undefined' && local.get) {
    return local.get(RKEY, k) || v;
  }
  return memStore[k] !== undefined ? memStore[k] : v;
}

// ========== 动态时间密码配置 ==========
const UNLOCK_VALID_MINUTES = 10;

function getCurrentTimePassword() {
  let now = new Date();
  let hours = now.getHours().toString().padStart(2, '0');
  let minutes = now.getMinutes().toString().padStart(2, '0');
  return hours + minutes;
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
  let now = Date.now();
  if ((now - storedTime) > UNLOCK_VALID_MINUTES * 60 * 1000) {
    setUnlocked(false);
    return false;
  }
  unlockTime = storedTime;
  return true;
}

function verifyDynamicPassword(input) {
  return input === getCurrentTimePassword();
}

let unlockBuffer = '';
let unlockMode = false;

function getKeyboardVideos() {
  let items = [];
  for (let i = 0; i <= 9; i++) {
    items.push({
      vod_id: `__UNLOCK_KEY__${i}`,
      vod_name: `[ ${i} ]`,
      vod_pic: `https://picsum.photos/200/300?random=${100 + i}`,
      vod_remarks: ''
    });
  }
  items.push({
    vod_id: '__UNLOCK_BACKSPACE',
    vod_name: '⌫ [删除]',
    vod_pic: `https://picsum.photos/200/300?random=200`,
    vod_remarks: ''
  });
  items.push({
    vod_id: '__UNLOCK_CLEAR',
    vod_name: '🗑 [清除]',
    vod_pic: `https://picsum.photos/200/300?random=201`,
    vod_remarks: ''
  });
  return items;
}

// ========== 网络请求（兼容 Web 和 TVBox） ==========
function smartRequest(url, options = {}) {
  let method = options.method || 'GET';
  let headers = { 'User-Agent': 'Mozilla/5.0', ...(options.headers || {}) };
  let reqOptions = { method, headers, timeout: options.timeout || defaultTimeout };
  if (options.body) {
    reqOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
  }
  let retries = options.retry || defaultRetry;
  for (let i = 0; i <= retries; i++) {
    try {
      let xhr = new XMLHttpRequest();
      xhr.open(method, url, false);
      xhr.send();
      let res = { content: xhr.responseText, status: xhr.status, headers: {} };
      res.json = () => JSON.parse(res.content);
      res.text = () => res.content;
      return res;
    } catch(e) {
      if (i === retries) throw e;
    }
  }
}

function fetchSource(url, sourceConfig = {}, noCache = false) {
  if (!noCache && cache_data[url]) return cache_data[url];
  let opts = {
    method: sourceConfig.method || 'GET',
    headers: { ...(sourceConfig.headers || {}) },
    body: sourceConfig.body,
    timeout: sourceConfig.timeout,
    cookie: sourceConfig.cookie,
    retry: sourceConfig.retry
  };
  let resp = smartRequest(url, opts);
  let content = resp.text();
  if (!noCache) cache_data[url] = content;
  return content;
}

function parseList(content, parseConfig, baseUrl) {
  let items = [];
  let type = parseConfig.type || 'text';
  if (type === 'json') {
    try {
      let json = JSON.parse(content);
      let dataArr = json;
      if (parseConfig.jsonPath) {
        let parts = parseConfig.jsonPath.split('.');
        for (let p of parts) dataArr = dataArr[p];
      }
      if (!Array.isArray(dataArr)) dataArr = dataArr || [];
      for (let item of dataArr) {
        let title = parseConfig.titleField ? item[parseConfig.titleField] : (item.title || item.name);
        let url = parseConfig.urlField ? item[parseConfig.urlField] : (item.url || item.link || item.play_url);
        if (title && url) items.push({ title, url });
      }
    } catch(e) { console.log("JSON解析错误: " + e.message); }
  } 
  else {
    let sep = parseConfig.line_sep || ',';
    let regex = new RegExp(`^(.+?)${sep}(https?://\\S+)`);
    let lines = content.split(/\r?\n/);
    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;
      let match = line.match(regex);
      if (match) {
        items.push({ title: match[1].trim(), url: match[2].trim() });
      } else if (line.match(/^https?:\/\//i)) {
        items.push({ title: "媒体文件", url: line });
      }
    }
  }
  return items;
}

function convertM3uToNormal(m3u) { return m3u; }

function splitArray(arr, parse) { return [arr]; }
function gen_group_dict(arr, parse) { return {}; }

// ========== 外部接口 ==========
function init(ext) {
  console.log(`初始化 ${VERSION}`);
  unlocked = getUnlocked();
  console.log(`解锁状态: ${unlocked ? '已解锁' : '未解锁'}`);

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
    if (Array.isArray(configData) && configData[0]?.name && configData[0]?.url) __ext_config.sources = configData;
    else if (configData.sources) __ext_config = configData;
    if (__ext_config.global) {
      if (__ext_config.global.defaultPic) def_pic = __ext_config.global.defaultPic;
      if (__ext_config.global.debug !== undefined) debugMode = __ext_config.global.debug;
    }
  }
  showMode = getItem('showMode', 'groups');
  groupDict = JSON.parse(getItem('groupDict', '{}'));
  console.log(`加载 ${__ext_config.sources.length} 个分类`);
}

function home(filter) {
  if (unlocked) {
    let storedTime = parseInt(getItem('global_unlock_time', '0'));
    if (storedTime && (Date.now() - storedTime) > UNLOCK_VALID_MINUTES * 60 * 1000) {
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
    let videos = getKeyboardVideos();
    let statusItem = {
      vod_id: '__UNLOCK_STATUS_INIT_' + Date.now(),
      vod_name: `🔐 请输入密码（4位数字）`,
      vod_pic: def_pic,
      vod_remarks: '找管理员要密码'
    };
    videos.unshift(statusItem);
    return JSON.stringify({ list: videos, page: 1, pagecount: 1, limit: videos.length, total: videos.length });
  }

  let fl = filter ? extend : {};
  if (fl.show) { showMode = fl.show; setItem('showMode', showMode); }
  if (parseInt(pg) > 1) return JSON.stringify({ list: [] });
  let source = __ext_config.sources.find(s => s.name === tid);
  if (!source) return JSON.stringify({ list: [] });

  let isSeries = source.parseConfig?.mode === 'series';
  if (isSeries) {
    let content = fetchSource(source.url, source);
    let baseDir = source.url.substring(0, source.url.lastIndexOf('/')+1);
    let items = parseList(content, source.parseConfig || {}, baseDir);
    if (!items.length) return JSON.stringify({ list: [] });
    let collectionName = source.parseConfig.collectionName || (source.url.split('/').pop().replace(/\.(txt|m3u8?|json)$/i, '') + '合集');
    let vod_id = source.url + '###series';
    return JSON.stringify({
      list: [{ vod_id, vod_name: collectionName, vod_pic: def_pic, vod_remarks: `📚 共${items.length}集` }],
      page: 1, pagecount: 1, limit: 1, total: items.length
    });
  }

  let html = fetchSource(source.url, source);
  let arr = html.match(/.*?[,，]#[\s\S].*?#/g) || [];
  let _list = [];
  for (let it of arr) {
    let vname = it.split(/[,，]/)[0];
    let vtab = it.match(/#(.*?)#/)[0];
    let vod_id = source.url + '$' + vname + '###single';
    _list.push({ vod_name: vname, vod_id, vod_pic: def_pic, vod_remarks: vtab });
  }
  return JSON.stringify({ page: 1, pagecount: 1, limit: _list.length, total: _list.length, list: _list });
}

function detail(tid) {
  if (unlockMode && tid.startsWith('__UNLOCK_KEY__')) {
    let digit = tid.replace('__UNLOCK_KEY__', '');
    if (digit >= '0' && digit <= '9') {
      if (unlockBuffer.length < 4) {
        unlockBuffer += digit;
        if (unlockBuffer.length === 4) {
          if (verifyDynamicPassword(unlockBuffer)) {
            setUnlocked(true);
            unlocked = true;
            unlockMode = false;
            console.log("密码正确，解锁成功！");
            let successItem = {
              vod_id: '__UNLOCK_SUCCESS',
              vod_name: '✅ 解锁成功！请按返回键返回首页',
              vod_pic: def_pic,
              vod_remarks: '密码正确，内容已解锁'
            };
            return JSON.stringify({ list: [successItem] });
          } else {
            unlockBuffer = '';
            let videos = getKeyboardVideos();
            let statusItem = {
              vod_id: '__UNLOCK_STATUS_ERR_',
              vod_name: `❌ 密码错误，请重试`,
              vod_pic: def_pic,
              vod_remarks: '找管理员要密码 '
            };
            videos.unshift(statusItem);
            return JSON.stringify({ list: videos });
          }
        }
      }
    }
    let videos = getKeyboardVideos();
    let display = '*'.repeat(unlockBuffer.length) + '_'.repeat(4 - unlockBuffer.length);
    let statusItem = {
      vod_id: '__UNLOCK_STATUS_' + unlockBuffer.length + '_' + Date.now(),
      vod_name: `🔐 密码: ___`,
      vod_pic: def_pic,
      vod_remarks: '请输入4位数字'
    };
    videos.unshift(statusItem);
    return JSON.stringify({ list: videos });
  }
  if (unlockMode && tid === '__UNLOCK_BACKSPACE') {
    if (unlockBuffer.length > 0) unlockBuffer = unlockBuffer.slice(0, -1);
    let videos = getKeyboardVideos();
    let display = '*'.repeat(unlockBuffer.length) + '_'.repeat(4 - unlockBuffer.length);
    let statusItem = {
      vod_id: '__UNLOCK_STATUS_' + unlockBuffer.length + '_' + Date.now(),
      vod_name: `🔐 密码: ____`,
      vod_pic: def_pic,
      vod_remarks: '请输入4位数字'
    };
    videos.unshift(statusItem);
    return JSON.stringify({ list: videos });
  }
  if (unlockMode && tid === '__UNLOCK_CLEAR') {
    unlockBuffer = '';
    let videos = getKeyboardVideos();
    let display = '_'.repeat(4);
    let statusItem = {
      vod_id: '__UNLOCK_STATUS_CLEAR_',
      vod_name: `🔐 密码: __`,
      vod_pic: def_pic,
      vod_remarks: '请输入4位数字'
    };
    videos.unshift(statusItem);
    return JSON.stringify({ list: videos });
  }
  if (unlocked) unlockMode = false;

  let parts = tid.split('###');
  let mode = parts.length > 1 ? parts[1] : 'single';
  let left = parts[0];
  let sourceUrl = left.split('$')[0];
  let tab = left.split('$')[1];
  let source = __ext_config.sources.find(s => s.url === sourceUrl);
  if (!source) return JSON.stringify({ list: [] });

  let html = fetchSource(sourceUrl, source);
  let regex = new RegExp(`.*?${tab.replace('(', '\\(').replace(')', '\\)')}[,，]#[\\s\\S].*?#`);
  let match = html.match(regex);
  if (!match) return JSON.stringify({ list: [] });
  let rest = html.split(match[0])[1];
  if (rest.match(/.*?[,，]#[\s\S].*?#/)) rest = rest.split(rest.match(/.*?[,，]#[\s\S].*?#/)[0])[0];
  let lines = rest.trim().split('\n').filter(l => l.trim());
  let items = lines.map(l => { let [t, u] = l.split(','); return t + '$' + u; });
  let playUrl = items.join('#');
  let playFrom = source.name;
  let vod = {
    vod_id: tid, vod_name: source.name + '|' + tab, type_name: "直播列表", vod_pic: def_pic,
    vod_content: tid, vod_play_from: playFrom, vod_play_url: playUrl,
    vod_director: tips, vod_remarks: VERSION
  };
  return JSON.stringify({ list: [vod] });
}

function play(flag, id, vipFlags) {
  let parse = /m3u8|ts|flv/i.test(id) ? 0 : 1;
  return JSON.stringify({ parse, playUrl: '', url: id });
}

function search(wd, quick) {
  let results = [];
  for (let src of __ext_config.sources) {
    let content = fetchSource(src.url, src);
    let baseDir = src.url.substring(0, src.url.lastIndexOf('/')+1);
    let items = parseList(content, src.parseConfig || {}, baseDir);
    let matched = items.filter(item => item.title.includes(wd));
    for (let m of matched) {
      results.push({
        vod_id: m.url + '###single',
        vod_name: `[${src.name}] ${m.title}`,
        vod_pic: def_pic,
        vod_remarks: '搜索命中'
      });
    }
  }
  return JSON.stringify({ list: results });
}

// ========== 定义全局 __JS_SPIDER__ 对象（兼容 Web 和 TVBox） ==========
var __JS_SPIDER__ = {
  init: init,
  home: home,
  homeVod: homeVod,
  category: category,
  detail: detail,
  play: play,
  search: search
};