/**
 * universal_spider_v30.js (基于 v29 增加时间密码解锁)
 * 特点：
 *   - 保留 v29 所有特性：数据源请求自动添加 User-Agent、Referer 等
 *   - 保留原分组/连续剧/搜索等全部逻辑
 *   - 新增：基于当前时间的4位数字密码解锁（默认有效期60分钟）
 *   - 未解锁时只显示“🔒 点击解锁”分类，解锁后显示真实分类
 */

// ========== 新增：时间密码解锁模块 ==========
const UNLOCK_VALID_MINUTES = 60;   // 解锁有效期（分钟）
let unlocked = false;
let unlockTime = 0;
let unlockMode = false;            // 是否处于解锁界面
let unlockBuffer = '';             // 暂存输入的密码

function setUnlocked(status) {
  if (status) {
    unlockTime = Date.now();
    local.set(RKEY, 'global_unlock_time', unlockTime.toString());
    local.set(RKEY, 'global_unlock', 'true');
  } else {
    local.set(RKEY, 'global_unlock', 'false');
    local.set(RKEY, 'global_unlock_time', '0');
    unlockTime = 0;
  }
  unlocked = status;
}

function getUnlocked() {
  let stored = local.get(RKEY, 'global_unlock') === 'true';
  if (!stored) return false;
  let storedTime = parseInt(local.get(RKEY, 'global_unlock_time') || '0');
  if (storedTime === 0) return false;
  let now = Date.now();
  if ((now - storedTime) > UNLOCK_VALID_MINUTES * 60 * 1000) {
    setUnlocked(false);
    return false;
  }
  unlockTime = storedTime;
  return true;
}

function getCurrentTimePassword() {
  let now = new Date();
  let hours = now.getHours().toString().padStart(2, '0');
  let minutes = now.getMinutes().toString().padStart(2, '0');
  return hours + minutes;
}

function verifyDynamicPassword(input) {
  return input === getCurrentTimePassword();
}

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

// ========== 以下为 v29 原版内容（未改动，仅整合新增解锁逻辑） ==========
String.prototype.rstrip = function (chars) {
  let regex = new RegExp(chars + "$");
  return this.replace(regex, "");
};

const request_timeout = 5000;
const RKEY = 'universal_spider';
const VERSION = 'universal v2.9 (增强数据源请求头) + 时间密码解锁';
const UA = 'Mozilla/5.0';
let def_pic = 'https://avatars.githubusercontent.com/u/97389433?s=120&v=4';
const tips = `\n${VERSION}`;

let __ext_config = { sources: [], global: {} };
let cache_data = {};
let showMode = 'groups';
let groupDict = {};

function setItem(k, v) { local.set(RKEY, k, v); console.log(`设置 ${k} => ${v}`); }
function getItem(k, v) { return local.get(RKEY, k) || v; }
function clearItem(k) { local.delete(RKEY, k); }

function print(any) {
  any = any || '';
  if (typeof any == 'object' && Object.keys(any).length > 0) {
    try { any = JSON.stringify(any); console.log(any); } catch (e) { console.log(typeof any + ':' + any.length); }
  } else if (typeof any == 'object') { console.log('null object'); } else { console.log(any); }
}

function getHome(url) {
  if (!url) return '';
  let tmp = url.split('//');
  url = tmp[0] + '//' + tmp[1].split('/')[0];
  try { url = decodeURIComponent(url); } catch (e) {}
  return url;
}

// ========== 原始 httpRequest（用于 ext 请求，不带额外头，保证成功） ==========
function httpRequest(url, options = {}) {
  let method = options.method || 'GET';
  let headers = { 'User-Agent': UA, ...(options.headers || {}) };
  if (options.referer) headers['Referer'] = options.referer;
  if (options.contentType) headers['Content-Type'] = options.contentType;
  let reqOptions = { method, headers, timeout: options.timeout || request_timeout };
  if (options.body) {
    reqOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
  }
  try {
    const res = req(url, reqOptions);
    res.json = () => res && res.content ? JSON.parse(res.content) : null;
    res.text = () => res && res.content ? res.content : '';
    return res;
  } catch (e) {
    print(`请求失败 ${url}: ${e.message}`);
    return { json: () => null, text: () => '', content: '' };
  }
}

// ========== 用于数据源的请求（自带默认请求头） ==========
const DATA_DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
  "Connection": "keep-alive"
};

function getDynamicHeaders(url) {
  let headers = {};
  if (url.includes('cntv.cn') || url.includes('cctv.com')) {
    headers['Referer'] = 'https://tv.cctv.com/';
    headers['Origin'] = 'https://tv.cctv.com';
  } else if (url.includes('bilibili.com')) {
    headers['Referer'] = 'https://www.bilibili.com/';
  } else {
    let match = url.match(/^(https?:\/\/[^/]+)/);
    if (match) headers['Referer'] = match[1] + '/';
  }
  return headers;
}

function httpRequestForData(url, options = {}) {
  let method = options.method || 'GET';
  let dynamicHeaders = getDynamicHeaders(url);
  let headers = { ...DATA_DEFAULT_HEADERS, ...dynamicHeaders, ...(options.headers || {}) };
  if (options.referer) headers['Referer'] = options.referer;
  if (options.contentType) headers['Content-Type'] = options.contentType;
  let reqOptions = { method, headers, timeout: options.timeout || request_timeout };
  if (options.body) {
    reqOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
  }
  try {
    const res = req(url, reqOptions);
    res.json = () => res && res.content ? JSON.parse(res.content) : null;
    res.text = () => res && res.content ? res.content : '';
    return res;
  } catch (e) {
    print(`数据源请求失败 ${url}: ${e.message}`);
    return { json: () => null, text: () => '', content: '' };
  }
}

// ========== 解析器 ==========
function parseSource(content, sourceConfig, baseUrl) {
  let items = [];
  let type = sourceConfig.type || 'text';
  if (type === 'm3u') {
    let lines = content.split(/\r?\n/);
    let currentTitle = "";
    for (let line of lines) {
      line = line.trim();
      if (line.startsWith("#EXTINF:")) {
        let match = line.match(/#EXTINF:.*?,(.*)/);
        if (match) currentTitle = match[1].trim();
      } else if (line && !line.startsWith("#")) {
        if (line.match(/^https?:\/\//i)) {
          items.push({ title: currentTitle || "直播流", url: line });
          currentTitle = "";
        }
      }
    }
    return items;
  } 
  else if (type === 'json') {
    try {
      let json = JSON.parse(content);
      let dataArr = json;
      if (sourceConfig.json_path) {
        let parts = sourceConfig.json_path.split('.');
        for (let p of parts) dataArr = dataArr[p];
      }
      if (!Array.isArray(dataArr)) dataArr = dataArr || [];
      for (let item of dataArr) {
        let title = sourceConfig.title_field ? item[sourceConfig.title_field] : (item.title || item.name);
        let url = sourceConfig.url_field ? item[sourceConfig.url_field] : (item.url || item.play_url);
        if (title && url) items.push({ title, url });
      }
    } catch(e) { print("JSON解析失败: " + e.message); }
    return items;
  }
  else {
    let lines = content.split(/\r?\n/);
    let sep = sourceConfig.line_sep || ',';
    let regex = new RegExp(`^(.+?)${sep}(https?://\\S+)`);
    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;
      let match = line.match(regex);
      if (match) {
        items.push({ title: match[1].trim(), url: match[2].trim() });
      } else if (line.match(/^https?:\/\//i)) {
        items.push({ title: "直播流", url: line });
      }
    }
    return items;
  }
}

function fetchSource(url, sourceConfig) {
  if (cache_data[url]) return cache_data[url];
  let options = {
    method: sourceConfig.method || 'GET',
    headers: sourceConfig.headers || {},
    body: sourceConfig.body,
    contentType: sourceConfig.contentType,
    timeout: sourceConfig.timeout
  };
  let resp = httpRequestForData(url, options);
  let content = resp.text();
  if (!sourceConfig.type && content.includes('#EXTM3U')) {
    content = convertM3uToNormal(content);
  }
  cache_data[url] = content;
  return content;
}

function convertM3uToNormal(m3u) {
  try {
    const lines = m3u.split('\n');
    let result = '', TV = '', flag = '#m3u#', currentGroupTitle = '';
    for (let line of lines) {
      if (line.startsWith('#EXTINF:')) {
        const groupTitle = line.split('"')[1].trim();
        TV = line.split('"')[2].substring(1);
        if (currentGroupTitle !== groupTitle) {
          currentGroupTitle = groupTitle;
          result += `\n${currentGroupTitle},${flag}\n`;
        }
      } else if (line.startsWith('http')) {
        const splitLine = line.split(',');
        result += `${TV}\,${splitLine[0]}\n`;
      }
    }
    return result.trim();
  } catch(e) { return m3u; }
}

function splitArray(arr, parse) {
  parse = parse && typeof parse == 'function' ? parse : '';
  if (!arr.length) return [];
  let result = [[arr[0]]];
  for (let i = 1; i < arr.length; i++) {
    let index = -1;
    for (let j = 0; j < result.length; j++) {
      if (parse && result[j].map(parse).includes(parse(arr[i]))) {
        index = j;
      } else if ((!parse) && result[j].includes(arr[i])) {
        index = j;
      }
    }
    if (index >= result.length - 1) {
      result.push([]);
      result[result.length - 1].push(arr[i]);
    } else {
      result[index + 1].push(arr[i]);
    }
  }
  return result;
}

function gen_group_dict(arr, parse) {
  let dict = {};
  arr.forEach((it) => {
    let k = it.split(',')[0];
    if (parse && typeof parse === 'function') k = parse(k);
    if (!dict[k]) dict[k] = [it];
    else dict[k].push(it);
  });
  return dict;
}

function parseSeriesEpisodes(content, baseUrl, seriesConfig) {
  if (seriesConfig && seriesConfig.parseConfig) {
    return parseSource(content, seriesConfig.parseConfig, baseUrl);
  }
  let trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      let json = JSON.parse(trimmed);
      let episodes = json.episodes || json.list || json.data || json.items || (Array.isArray(json) ? json : []);
      let items = [];
      for (let ep of episodes) {
        let title = ep.title || ep.name || ep.episode || "第" + (ep.index || '?') + "集";
        let url = ep.url || ep.link || ep.src || ep.play_url;
        if (title && url) items.push({ title, url });
      }
      if (items.length) return items;
    } catch(e) {}
  }
  if (content.includes("#EXTM3U")) {
    return parseSource(content, { type: "m3u" }, baseUrl);
  }
  return parseSource(content, { separators: [',', '|', '$', '\t'] }, baseUrl);
}

function handleVodSource(vodConfig, extraParams) {
  if (!vodConfig || !vodConfig.listApi) return null;
  let infoData = null;
  if (vodConfig.infoApi) {
    let infoUrl = vodConfig.infoApi;
    for (let [k, v] of Object.entries(extraParams)) {
      infoUrl = infoUrl.replace(new RegExp(`\\{${k}\\}`, 'g'), encodeURIComponent(v));
    }
    let infoOpts = {
      method: vodConfig.infoMethod || 'GET',
      headers: vodConfig.infoHeaders || {},
      body: vodConfig.infoBody,
      contentType: vodConfig.infoContentType
    };
    let resp = httpRequestForData(infoUrl, infoOpts);
    infoData = resp.json();
  }
  let listUrl = vodConfig.listApi;
  let replaceMap = { ...extraParams, ...(infoData || {}) };
  for (let [k, v] of Object.entries(replaceMap)) {
    listUrl = listUrl.replace(new RegExp(`\\{${k}\\}`, 'g'), encodeURIComponent(v));
  }
  let listOpts = {
    method: vodConfig.listMethod || 'GET',
    headers: vodConfig.listHeaders || {},
    body: vodConfig.listBody,
    contentType: vodConfig.listContentType
  };
  let resp = httpRequestForData(listUrl, listOpts);
  let listJson = resp.json();
  if (!listJson) return null;
  let parseConf = vodConfig.listParse || { type: 'json', dataPath: 'data.list', titleField: 'title', urlField: 'guid' };
  let items = parseSource(listJson, parseConf, '');
  if (!items.length) return null;
  let videoList = items.map(item => `${item.title}$${item.url}`);
  let playUrl = videoList.join('#');
  let playFrom = vodConfig.playFrom || '播放源';
  return { playUrl, playFrom, infoData };
}

// ========== ext 配置解析 ==========
function init(ext) {
  console.log("当前版本号:" + VERSION);
  // 初始化解锁状态
  unlocked = getUnlocked();
  console.log(`解锁状态: ${unlocked ? '已解锁' : '未解锁'}`);
  
  let configData = null;
  if (typeof ext == 'object') {
    configData = ext;
    print('ext:object');
  } else if (typeof ext == 'string') {
    if (ext.startsWith('http')) {
      let data_url = ext.split(';')[0];
      print(data_url);
      configData = httpRequest(data_url, { json: true }).json();
    } else {
      try { configData = JSON.parse(ext); } catch(e) { configData = null; }
    }
  }
  if (Array.isArray(configData) && configData.length > 0 && configData[0].name && configData[0].url) {
    __ext_config.sources = configData;
  } else if (configData && configData.sources) {
    __ext_config = configData;
  } else {
    __ext_config.sources = [];
  }
  if (configData && configData.global) {
    __ext_config.global = configData.global;
    if (__ext_config.global.defaultPic) def_pic = __ext_config.global.defaultPic;
    if (__ext_config.global.defaultTimeout) request_timeout = __ext_config.global.defaultTimeout;
  }
  showMode = getItem('showMode', 'groups');
  groupDict = JSON.parse(getItem('groupDict', '{}'));
  print('init执行完毕，共 ' + __ext_config.sources.length + ' 个源');
}

// ========== 修改 home：未解锁时只显示解锁分类 ==========
function home(filter) {
  // 检查解锁有效期（被动超时）
  if (unlocked) {
    let storedTime = parseInt(local.get(RKEY, 'global_unlock_time') || '0');
    if (storedTime && (Date.now() - storedTime) > UNLOCK_VALID_MINUTES * 60 * 1000) {
      setUnlocked(false);
      unlocked = false;
    }
  }
  if (!unlocked) {
    let unlockClass = { type_id: '__UNLOCK__', type_name: '🔒 点击解锁', icon: '🔒' };
    return JSON.stringify({ class: [unlockClass], filters: {} });
  }
  // 已解锁，正常返回分类
  let classes = __ext_config.sources.map(it => ({
    type_id: it.name,
    type_name: it.name,
  }));
  let filters = [
    { 'key': 'show', 'name': '播放展示', 'value': [{ 'n': '多线路分组', 'v': 'groups' }, { 'n': '单线路', 'v': 'all' }] }
  ];
  let filter_dict = {};
  classes.forEach(it => { filter_dict[it.type_id] = filters; });
  return JSON.stringify({ 'class': classes, 'filters': filter_dict });
}

function homeVod(params) {
  return JSON.stringify({ list: [] });
}

// 修改 category：处理解锁分类
function category(tid, pg, filter, extend) {
  if (!unlocked && tid === '__UNLOCK__') {
    unlockMode = true;
    unlockBuffer = '';
    let videos = getKeyboardVideos();
    let statusItem = {
      vod_id: '__UNLOCK_STATUS_INIT_' + Date.now(),
      vod_name: `🔐 请输入当前时间密码（4位数字）`,
      vod_pic: def_pic,
      vod_remarks: '例如 09:08 输入 0908，19:22 输入 1922'
    };
    videos.unshift(statusItem);
    return JSON.stringify({ list: videos, page: 1, pagecount: 1, limit: videos.length, total: videos.length });
  }
  
  let fl = filter ? extend : {};
  if (fl.show) {
    showMode = fl.show;
    setItem('showMode', showMode);
  }
  if (parseInt(pg) > 1) return JSON.stringify({ list: [] });
  let source = __ext_config.sources.find(s => s.name === tid);
  if (!source) return JSON.stringify({ list: [] });
  let html = fetchSource(source.url, source);
  let arr = html.match(/.*?[,，]#[\s\S].*?#/g) || [];
  let _list = [];
  for (let it of arr) {
    let vname = it.split(/[,，]/)[0];
    let vtab = it.match(/#(.*?)#/)[0];
    let modeSuffix = (source.parseConfig && source.parseConfig.mode === 'series') ? 'series' : 'single';
    let vod_id = source.url + '$' + vname + '###' + modeSuffix;
    _list.push({
      vod_name: vname,
      vod_id: vod_id,
      vod_pic: def_pic,
      vod_remarks: vtab,
    });
  }
  return JSON.stringify({
    page: 1, pagecount: 1, limit: _list.length, total: _list.length, list: _list,
  });
}

// 修改 detail：处理虚拟键盘按键和解锁成功
function detail(tid) {
  // 处理解锁界面按键
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
              vod_id: '__UNLOCK_STATUS_ERR_' + Date.now(),
              vod_name: `❌ 密码错误，请重试`,
              vod_pic: def_pic,
              vod_remarks: '当前时间密码是 ' + getCurrentTimePassword()
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
      vod_name: `🔐 密码: ${display}`,
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
      vod_name: `🔐 密码: ${display}`,
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
      vod_id: '__UNLOCK_STATUS_CLEAR_' + Date.now(),
      vod_name: `🔐 密码: ${display}`,
      vod_pic: def_pic,
      vod_remarks: '请输入4位数字'
    };
    videos.unshift(statusItem);
    return JSON.stringify({ list: videos });
  }
  if (unlocked) unlockMode = false; // 确保解锁后退出解锁模式

  // 以下为原 detail 逻辑（处理正常视频）
  let parts = tid.split('###');
  let mode = parts.length > 1 ? parts[1] : 'single';
  let left = parts[0];
  let sourceUrl = left.split('$')[0];
  let tab = left.split('$')[1];
  let source = __ext_config.sources.find(s => s.url === sourceUrl);
  if (!source) return JSON.stringify({ list: [] });
  
  if (tid.includes('#search#')) {
    let vod_name = tab.replace('#search#', '');
    let vod_play_from = '来自搜索:' + sourceUrl;
    let vod_play_url = groupDict[sourceUrl].map(x => x.replace(',', '$')).join('#');
    return JSON.stringify({
      list: [{
        vod_id: tid, vod_name: '搜索:' + vod_name, type_name: "直播列表", vod_pic: def_pic,
        vod_content: tid, vod_play_from: vod_play_from, vod_play_url: vod_play_url,
        vod_director: tips, vod_remarks: VERSION,
      }]
    });
  }
  
  if (mode === 'series') {
    let seriesUrl = sourceUrl;
    let seriesConfig = __ext_config.series || {};
    let content = fetchSource(seriesUrl, source);
    let baseDir = seriesUrl.substring(0, seriesUrl.lastIndexOf('/') + 1);
    let episodes = parseSeriesEpisodes(content, baseDir, seriesConfig);
    if (!episodes.length) return JSON.stringify({ list: [] });
    let videoList = episodes.map(ep => `${ep.title}$${ep.url}`);
    let playUrl = videoList.join('#');
    let seriesTitle = seriesConfig.title || source.name;
    let vod = {
      vod_id: tid,
      vod_name: seriesTitle + '|' + tab,
      vod_pic: def_pic,
      type_name: "连续剧",
      vod_play_from: seriesConfig.playFrom || source.name,
      vod_play_url: playUrl,
      vod_director: tips,
      vod_remarks: VERSION,
    };
    return JSON.stringify({ list: [vod] });
  }
  
  let html = fetchSource(sourceUrl, source);
  let a = new RegExp(`.*?${tab.replace('(', '\\(').replace(')', '\\)')}[,，]#[\\s\\S].*?#`);
  let b = html.match(a);
  if (!b) return JSON.stringify({ list: [] });
  let c = html.split(b[0])[1];
  if (c.match(/.*?[,，]#[\s\S].*?#/)) {
    let d = c.match(/.*?[,，]#[\s\S].*?#/)[0];
    c = c.split(d)[0];
  }
  let lines = c.trim().split('\n');
  let _list = [];
  for (let line of lines) {
    if (line.trim()) {
      let t = line.trim().split(',')[0];
      let u = line.trim().split(',')[1];
      _list.push(t + '$' + u);
    }
  }
  let vod_name = source.name;
  let vod_play_url, vod_play_from;
  if (showMode === 'groups') {
    let groups = splitArray(_list, x => x.split('$')[0]);
    let tabs = [];
    for (let i = 0; i < groups.length; i++) {
      if (i === 0) tabs.push(vod_name + '1');
      else tabs.push(` ${i + 1} `);
    }
    vod_play_url = groups.map(it => it.join('#')).join('$$$');
    vod_play_from = tabs.join('$$$');
  } else {
    vod_play_url = _list.join('#');
    vod_play_from = vod_name;
  }
  let vod = {
    vod_id: tid,
    vod_name: vod_name + '|' + tab,
    type_name: "直播列表",
    vod_pic: def_pic,
    vod_content: tid,
    vod_play_from: vod_play_from,
    vod_play_url: vod_play_url,
    vod_director: tips,
    vod_remarks: VERSION,
  };
  return JSON.stringify({ list: [vod] });
}

function play(flag, id, flags) {
  let vod = { 'parse': /m3u8/.test(id) ? 0 : 1, 'playUrl': '', 'url': id };
  return JSON.stringify(vod);
}

function search(wd, quick) {
  if (__ext_config.sources.length === 0) return JSON.stringify({ list: [] });
  let allLines = [];
  for (let src of __ext_config.sources) {
    let html = fetchSource(src.url, src);
    let lines = html.split('\n').filter(it => it.trim() && it.includes(',') && it.split(',')[1].trim().startsWith('http'));
    allLines.push(...lines);
  }
  let plays = Array.from(new Set(allLines));
  plays = plays.filter(it => it.includes(wd));
  let new_group = gen_group_dict(plays);
  groupDict = Object.assign(groupDict, new_group);
  setItem('groupDict', JSON.stringify(groupDict));
  let _list = [];
  Object.keys(groupDict).forEach((it) => {
    _list.push({
      vod_name: it,
      vod_id: it + '$' + wd + '#search#',
      vod_pic: def_pic,
    });
  });
  return JSON.stringify({ list: _list });
}

export default { init, home, homeVod, category, detail, play, search };