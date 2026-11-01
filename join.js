// ==================== 通用动态爬虫 v3.5（单线路跳集版） ====================
// 基于 v34 修改，核心目标：播放失败只跳下一集，绝不切换剧本/频道/线路
// ================================================================

String.prototype.rstrip = function (chars) {
  let regex = new RegExp(chars + '$');
  return this.replace(regex, '');
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
const VERSION = 'universal v3.5 (single-line jump-episode)';
const tips = `\n${VERSION}`;
const RKEY = 'universal_spider';

function getDynamicPic(seed) {
  if (!seed) return def_pic;
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/200/300`;
}

// ========== 动态时间密码 ==========
const UNLOCK_VALID_MINUTES = 60;

function getCurrentTimePassword() {
  let now = new Date();
  return now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
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
  if ((Date.now() - storedTime) > UNLOCK_VALID_MINUTES * 60 * 1000) {
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
    items.push({ vod_id: `__UNLOCK_KEY__${i}`, vod_name: `[ ${i} ]`, vod_pic: def_pic, vod_remarks: '' });
  }
  items.push({ vod_id: '__UNLOCK_BACKSPACE', vod_name: '⌫ [删除]', vod_pic: def_pic, vod_remarks: '' });
  items.push({ vod_id: '__UNLOCK_CLEAR', vod_name: '🗑 [清除]', vod_pic: def_pic, vod_remarks: '' });
  return items;
}

// ========== 辅助 ==========
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

function fetchSource(url, sourceConfig = {}, noCache = false) {
  if (!noCache && cache_data[url]) return cache_data[url];
  let opts = {
    method: sourceConfig.method || 'GET',
    headers: { ...(sourceConfig.headers || {}) },
    body: sourceConfig.body,
    timeout: sourceConfig.timeout,
    cookie: sourceConfig.cookie || getItem('site_cookie'),
    retry: sourceConfig.retry
  };
  let resp = smartRequest(url, opts);
  let content = resp.text();
  if (!sourceConfig.type && content.includes('#EXTM3U')) content = convertM3uToNormal(content);
  if (!noCache) cache_data[url] = content;
  return content;
}

// ========== 列表解析 ==========
function parseList(content, parseConfig, baseUrl) {
  let items = [];
  let type = parseConfig.type || 'text';

  if (type === 'json') {
    try {
      let json = JSON.parse(content);
      let dataArr = json;
      if (parseConfig.jsonPath) {
        for (let p of parseConfig.jsonPath.split('.')) dataArr = dataArr[p];
      }
      if (!Array.isArray(dataArr)) dataArr = dataArr || [];
      for (let item of dataArr) {
        let title = parseConfig.titleField ? item[parseConfig.titleField] : (item.title || item.name);
        let url = parseConfig.urlField ? item[parseConfig.urlField] : (item.url || item.link || item.play_url);
        if (title && url) items.push({ title, url });
      }
    } catch(e) { print("JSON解析错误: " + e.message); }
  }
  else if (type === 'rss') {
    try {
      let titleRe = /<title>(.*?)<\/title>/g;
      let linkRe = /<link>(.*?)<\/link>/g;
      let titles = [...content.matchAll(titleRe)].map(m => m[1]);
      let links  = [...content.matchAll(linkRe)].map(m => m[1]);
      for (let i = 0; i < Math.min(titles.length, links.length); i++) {
        if (links[i].startsWith('http')) items.push({ title: titles[i], url: links[i] });
      }
    } catch(e) { print("RSS解析失败"); }
  }
  else if (type === 'm3u') {
    let lines = content.split(/\r?\n/);
    let currentTitle = "";
    for (let line of lines) {
      line = line.trim();
      if (line.startsWith("#EXTINF:")) {
        let match = line.match(/#EXTINF:.*?,(.*)/);
        if (match) currentTitle = match[1].trim();
      } else if (line && !line.startsWith("#") && line.match(/^https?:\/\//i)) {
        items.push({ title: currentTitle || "直播流", url: line });
        currentTitle = "";
      }
    }
  }
  else {
    let sep = parseConfig.line_sep || ',';
    let regex = new RegExp(`^(.+?)${sep}(https?://\\S+)`);
    for (let line of content.split(/\r?\n/)) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;
      let match = line.match(regex);
      if (match) items.push({ title: match[1].trim(), url: match[2].trim() });
      else if (line.match(/^https?:\/\//i)) items.push({ title: "媒体文件", url: line });
    }
  }
  return items;
}

function convertM3uToNormal(m3u) {
  try {
    const lines = m3u.split('\n');
    let result = '', TV = '', flag = '#m3u#', currentGroupTitle = '';
    for (let line of lines) {
      if (line.startsWith('#EXTINF:')) {
        const groupTitle = line.split('"')[1]?.trim() || '';
        TV = line.split('"')[2]?.substring(1) || '';
        if (currentGroupTitle !== groupTitle) {
          currentGroupTitle = groupTitle;
          result += `\n${currentGroupTitle},${flag}\n`;
        }
      } else if (line.startsWith('http')) {
        result += `${TV}\,${line.split(',')[0]}\n`;
      }
    }
    return result.trim();
  } catch(e) { return m3u; }
}

// ========== splitArray（按 key 完整归并） ==========
function splitArray(arr, parse) {
  if (!arr.length) return [];
  let result = [];
  let map = {};
  for (let i = 0; i < arr.length; i++) {
    let key = (parse && typeof parse === 'function') ? parse(arr[i]) : arr[i];
    if (!map[key]) { map[key] = []; result.push(map[key]); }
    map[key].push(arr[i]);
  }
  return result;
}

function gen_group_dict(arr, parse) {
  let dict = {};
  arr.forEach(it => {
    let k = it.split(',')[0];
    if (parse && typeof parse === 'function') k = parse(k);
    if (!dict[k]) dict[k] = [it];
    else dict[k].push(it);
  });
  return dict;
}

// ========== 构造去重后的集条目 ==========
function buildEpisodeEntries(objs) {
  let counter = {};
  let entries = [];
  for (let it of objs) {
    let key = it.title;
    counter[key] = (counter[key] || 0) + 1;
    let n = counter[key];
    let display = n > 1 ? `${it.title}·${n}` : it.title;
    entries.push(`${display}$${it.url}`);
  }
  return entries;
}

const customHandlers = {
  encryptedSite: function(ctx) {
    let { url, parseConfig } = ctx;
    let encryptedContent = fetchSource(url, parseConfig);
    let decryptedContent = myDecrypt(encryptedContent, parseConfig.key || 'defaultKey');
    return parseList(decryptedContent, parseConfig, url);
  },
  loginRequired: function(ctx) {
    let { url, parseConfig } = ctx;
    let loginResp = smartRequest(parseConfig.loginUrl, { method: 'POST', body: parseConfig.loginBody });
    let cookie = loginResp.headers['set-cookie'];
    if (cookie) setItem('site_cookie', cookie);
    let content = fetchSource(url, { ...parseConfig, headers: { 'Cookie': getItem('site_cookie') } });
    return parseList(content, parseConfig, url);
  },
  dynamicContent: function(ctx) {
    let { url, parseConfig } = ctx;
    let browserService = parseConfig.browserService || 'http://localhost:3000/render';
    let resp = smartRequest(browserService, { method: 'POST', body: JSON.stringify({ url }) });
    return parseList(resp.text(), parseConfig, url);
  }
};

function myDecrypt(encrypted, key) {
  let result = '';
  for (let i = 0; i < encrypted.length; i++) {
    result += String.fromCharCode(encrypted.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

// ========== 初始化 ==========
function init(ext) {
  print(`初始化 ${VERSION}`);
  unlocked = getUnlocked();
  print(`解锁状态: ${unlocked ? '已解锁' : '未解锁'}`);

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
      if (__ext_config.global.defaultTimeout) defaultTimeout = __ext_config.global.defaultTimeout;
      if (__ext_config.global.debug !== undefined) debugMode = __ext_config.global.debug;
    }
  }
  showMode = getItem('showMode', 'groups');
  groupDict = JSON.parse(getItem('groupDict', '{}'));
  print(`加载 ${__ext_config.sources.length} 个分类`);
}

// ========== 首页 ==========
function home(filter) {
  if (unlocked) {
    let storedTime = parseInt(getItem('global_unlock_time', '0'));
    if (storedTime && (Date.now() - storedTime) > UNLOCK_VALID_MINUTES * 60 * 1000) {
      setUnlocked(false);
      unlocked = false;
    }
  }
  if (!unlocked) {
    return JSON.stringify({
      class: [{ type_id: '__UNLOCK__', type_name: '🔒 点击解锁', icon: '🔒' }],
      filters: {}
    });
  }
  let classes = __ext_config.sources.map(s => ({ type_id: s.name, type_name: s.name }));
  let filters = [{
    key: 'show',
    name: '排列方式',
    value: [
      { n: '同频道连续（推荐）', v: 'groups' },
      { n: '原始顺序', v: 'all' }
    ]
  }];
  let filterDict = {};
  classes.forEach(c => { filterDict[c.type_id] = filters; });
  return JSON.stringify({ class: classes, filters: filterDict });
}
function homeVod() { return JSON.stringify({ list: [] }); }

// ========== 一级分类 ==========
function category(tid, pg, filter, extend) {
  if (!unlocked && tid === '__UNLOCK__') {
    unlockMode = true;
    unlockBuffer = '';
    let videos = getKeyboardVideos();
    videos.unshift({
      vod_id: '__UNLOCK_STATUS_INIT_' + Date.now(),
      vod_name: `🔐 请输入密码（4位数字）`,
      vod_pic: def_pic,
      vod_remarks: '例如 上午9:08 输入 0908'
    });
    return JSON.stringify({ list: videos, page: 1, pagecount: 1, limit: videos.length, total: videos.length });
  }

  let fl = filter ? extend : {};
  if (fl.show) { showMode = fl.show; setItem('showMode', showMode); }
  if (parseInt(pg) > 1) return JSON.stringify({ list: [] });

  let source = __ext_config.sources.find(s => s.name === tid);
  if (!source) return JSON.stringify({ list: [] });

  // customHandler
  if (source.handler && customHandlers[source.handler]) {
    let ctx = { url: source.url, parseConfig: source.parseConfig || {}, extra: { tid, pg, filter, extend } };
    let items = customHandlers[source.handler](ctx);
    let isSeries = source.parseConfig?.mode === 'series';
    if (isSeries) {
      if (!items.length) return JSON.stringify({ list: [] });
      let collectionName = source.parseConfig.collectionName || (source.url.split('/').pop().replace(/\.(txt|m3u8?|json)$/i, '') + '合集');
      return JSON.stringify({
        list: [{ vod_id: source.url + '###series', vod_name: collectionName, vod_pic: def_pic, vod_remarks: `📚 共${items.length}集` }],
        page: 1, pagecount: 1, limit: 1, total: items.length
      });
    } else {
      let videos = items.map(item => ({ vod_id: item.url + '###single', vod_name: item.title, vod_pic: def_pic, vod_remarks: '特殊站点' }));
      return JSON.stringify({ list: videos, page: 1, pagecount: 1, limit: videos.length, total: videos.length });
    }
  }

  let isSeries = source.parseConfig?.mode === 'series';
  if (isSeries) {
    let content = fetchSource(source.url, source);
    let baseDir = source.url.substring(0, source.url.lastIndexOf('/') + 1);
    let items = parseList(content, source.parseConfig || {}, baseDir);
    if (!items.length) return JSON.stringify({ list: [] });
    let collectionName = source.parseConfig.collectionName || (source.url.split('/').pop().replace(/\.(txt|m3u8?|json)$/i, '') + '合集');
    return JSON.stringify({
      list: [{ vod_id: source.url + '###series', vod_name: collectionName, vod_pic: def_pic, vod_remarks: `📚 共${items.length}集` }],
      page: 1, pagecount: 1, limit: 1, total: items.length
    });
  }

  // 普通直播源：分组卡片
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

// ========== 二级详情（全部单线路） ==========
function detail(tid) {
  // 解锁键盘
  if (unlockMode && tid.startsWith('__UNLOCK_KEY__')) {
    let digit = tid.replace('__UNLOCK_KEY__', '');
    if (digit >= '0' && digit <= '9' && unlockBuffer.length < 4) {
      unlockBuffer += digit;
      if (unlockBuffer.length === 4) {
        if (verifyDynamicPassword(unlockBuffer)) {
          setUnlocked(true); unlocked = true; unlockMode = false;
          return JSON.stringify({
            list: [{ vod_id: '__UNLOCK_SUCCESS', vod_name: '✅ 解锁成功！请按返回键返回首页', vod_pic: def_pic, vod_remarks: '密码正确，内容已解锁' }]
          });
        } else {
          unlockBuffer = '';
          let videos = getKeyboardVideos();
          videos.unshift({ vod_id: '__UNLOCK_STATUS_ERR_' + Date.now(), vod_name: `❌ 密码错误，请重试`, vod_pic: def_pic, vod_remarks: '请找管理员要密码' });
          return JSON.stringify({ list: videos });
        }
      }
    }
    let videos = getKeyboardVideos();
    let display = '*'.repeat(unlockBuffer.length) + '_'.repeat(4 - unlockBuffer.length);
    videos.unshift({ vod_id: '__UNLOCK_STATUS_' + unlockBuffer.length + '_' + Date.now(), vod_name: `🔐 密码: ${display}`, vod_pic: def_pic, vod_remarks: '请输入4位数字' });
    return JSON.stringify({ list: videos });
  }
  if (unlockMode && tid === '__UNLOCK_BACKSPACE') {
    if (unlockBuffer.length > 0) unlockBuffer = unlockBuffer.slice(0, -1);
    let videos = getKeyboardVideos();
    let display = '*'.repeat(unlockBuffer.length) + '_'.repeat(4 - unlockBuffer.length);
    videos.unshift({ vod_id: '__UNLOCK_STATUS_' + unlockBuffer.length + '_' + Date.now(), vod_name: `🔐 密码: ${display}`, vod_pic: def_pic, vod_remarks: '请输入4位数字' });
    return JSON.stringify({ list: videos });
  }
  if (unlockMode && tid === '__UNLOCK_CLEAR') {
    unlockBuffer = '';
    let videos = getKeyboardVideos();
    videos.unshift({ vod_id: '__UNLOCK_STATUS_CLEAR_' + Date.now(), vod_name: `🔐 密码: ____`, vod_pic: def_pic, vod_remarks: '请输入4位数字' });
    return JSON.stringify({ list: videos });
  }
  if (unlocked) unlockMode = false;

  // 直链
  if (tid.match(/^https?:\/\//) && /\.(m3u8|mp4|m4a|ts|flv)(\?|$)/.test(tid)) {
    return JSON.stringify({
      list: [{
        vod_id: tid, vod_name: '媒体播放', vod_pic: def_pic, type_name: '直链',
        vod_play_from: '直链', vod_play_url: tid, vod_remarks: '点击播放'
      }]
    });
  }

  let parts = tid.split('###');
  let mode = parts.length > 1 ? parts[1] : 'single';
  let left = parts[0];
  let sourceUrl = left.split('$')[0];
  let tab = left.split('$')[1];
  let source = __ext_config.sources.find(s => s.url === sourceUrl);
  if (!source) return JSON.stringify({ list: [] });

  // customHandler + series
  if (source.handler && customHandlers[source.handler] && mode === 'series') {
    let ctx = { url: sourceUrl, parseConfig: source.parseConfig || {}, extra: { tid } };
    let items = customHandlers[source.handler](ctx);
    if (!items.length) return JSON.stringify({ list: [] });
    let entries = buildEpisodeEntries(items);
    return JSON.stringify({
      list: [{
        vod_id: tid,
        vod_name: source.parseConfig.collectionName || (sourceUrl.split('/').pop().replace(/\.(txt|m3u8?|json)$/i, '') + '合集'),
        vod_pic: def_pic, type_name: "连续剧",
        vod_play_from: source.name,
        vod_play_url: entries.join('#'),
        vod_remarks: `共${items.length}集`
      }]
    });
  }

  // 普通 series
  if (mode === 'series') {
    let content = fetchSource(sourceUrl, source);
    let baseDir = sourceUrl.substring(0, sourceUrl.lastIndexOf('/') + 1);
    let episodes = parseList(content, source.parseConfig || {}, baseDir);
    if (!episodes.length) return JSON.stringify({ list: [] });
    let entries = buildEpisodeEntries(episodes);
    return JSON.stringify({
      list: [{
        vod_id: tid,
        vod_name: source.parseConfig.collectionName || (sourceUrl.split('/').pop().replace(/\.(txt|m3u8?|json)$/i, '') + '合集'),
        vod_pic: def_pic, type_name: "连续剧",
        vod_play_from: source.name,
        vod_play_url: entries.join('#'),
        vod_remarks: `共${episodes.length}集`
      }]
    });
  }

  // 普通直播分组：单线路
  let html = fetchSource(sourceUrl, source);
  let escTab = tab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let regex = new RegExp(`.*?${escTab}[,，]#[\\s\\S].*?#`);
  let match = html.match(regex);
  if (!match) return JSON.stringify({ list: [] });

  let rest = html.split(match[0])[1];
  if (rest.match(/.*?[,，]#[\s\S].*?#/)) rest = rest.split(rest.match(/.*?[,，]#[\s\S].*?#/)[0])[0];

  let rawItems = [];
  for (let line of rest.trim().split('\n')) {
    line = line.trim();
    if (!line) continue;
    let idx = -1;
    for (let s of [',', '，']) { idx = line.indexOf(s); if (idx > 0) break; }
    if (idx > 0) {
      let t = line.substring(0, idx).trim();
      let u = line.substring(idx + 1).trim();
      if (t && u) rawItems.push({ title: t, url: u });
    }
  }
  if (!rawItems.length) return JSON.stringify({ list: [] });

  let ordered;
  if (showMode === 'groups') {
    let groups = splitArray(rawItems, x => x.title);
    ordered = [];
    for (let g of groups) for (let it of g) ordered.push(it);
  } else {
    ordered = rawItems;
  }

  let entries = buildEpisodeEntries(ordered);

  return JSON.stringify({
    list: [{
      vod_id: tid,
      vod_name: source.name + '|' + tab,
      type_name: "直播列表",
      vod_pic: def_pic,
      vod_content: tid,
      vod_play_from: source.name,
      vod_play_url: entries.join('#'),
      vod_director: tips,
      vod_remarks: `${ordered.length} 条 · 失败点下一集`
    }]
  });
}

// ========== 播放（默认 parse:0） ==========
function play(flag, id, vipFlags) {
  let parse = 0;
  let finalUrl = id;

  if (__ext_config.global && __ext_config.global.parseUrl) {
    try {
      let parseApi = __ext_config.global.parseUrl;
      let parseUrl = parseApi.replace('{url}', encodeURIComponent(id));
      let resp = smartRequest(parseUrl);
      let json = resp.json();
      if (json && json.url) finalUrl = json.url;
      if (json && json.parse === 1) parse = 1;
    } catch(e) { print('parseUrl 失败: ' + e.message); }
  }

  if (/^https?:\/\//i.test(finalUrl) && /\.(m3u8|mp4|ts|flv|m4a|mp3|mkv)(\?|#|$)/i.test(finalUrl)) {
    parse = 0;
  }

  return JSON.stringify({ parse, playUrl: '', url: finalUrl });
}

// ========== 搜索 ==========
function search(wd, quick) {
  let results = [];
  for (let src of __ext_config.sources) {
    let content = fetchSource(src.url, src);
    let baseDir = src.url.substring(0, src.url.lastIndexOf('/') + 1);
    let items = parseList(content, src.parseConfig || {}, baseDir);
    let matched = items.filter(item => item.title.includes(wd));
    for (let m of matched) {
      results.push({ vod_id: m.url + '###single', vod_name: `[${src.name}] ${m.title}`, vod_pic: def_pic, vod_remarks: '搜索命中' });
    }
  }
  return JSON.stringify({ list: results });
}

export default { init, home, homeVod, category, detail, play, search };