/**
 * universal_spider_v29.1.js (基于 v29，单线路跳集版)
 * 核心改动：播放失败只跳下一集，绝不切换剧本/频道/线路
 * 保留：密码锁、解锁视频列表、搜索、series、customHandlers 机制
 */

// ========== 默认请求头 ==========
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

// ========== 基础 ==========
String.prototype.rstrip = function (chars) {
  let regex = new RegExp(chars + "$");
  return this.replace(regex, "");
};

const request_timeout = 5000;
const RKEY = 'universal_spider';
const VERSION = 'universal v2.9.1 (single-line jump-episode)';
const UA = 'Mozilla/5.0';
let def_pic = 'https://picsum.photos/200/300?random=1';
const tips = `\n${VERSION}`;

function getDynamicPic(seed) {
  if (!seed) return def_pic;
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/200/300`;
}

let remoteUnlockVideos = null;
let externalUnlockVideos = null;

let __ext_config = { sources: [], global: {} };
let cache_data = {};
let showMode = 'groups';
let groupDict = {};

// ========== 密码锁 ==========
const UNLOCK_VALID_MINUTES = 10;

function getCurrentTimePassword() {
  let now = new Date();
  let hours = now.getHours().toString().padStart(2, '0');
  let minutes = now.getMinutes().toString().padStart(2, '0');
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

function getKeyboardVideos() {
  let items = [];
  for (let i = 0; i <= 9; i++) {
    items.push({ vod_id: `__UNLOCK_KEY__${i}`, vod_name: `${i}`, vod_pic: getDynamicPic(`key_${i}`), vod_remarks: '' });
  }
  items.push({ vod_id: '__UNLOCK_BACKSPACE', vod_name: '⌫ 删除', vod_pic: getDynamicPic(`backspace`), vod_remarks: '' });
  items.push({ vod_id: '__UNLOCK_CLEAR', vod_name: '🗑 清除', vod_pic: getDynamicPic(`clear`), vod_remarks: '' });
  return items;
}

let unlockBuffer = '';
let unlockMode = false;

// ========== smartParseList（原样保留） ==========
function smartParseList(content, opt = {}) {
  if (!content || typeof content !== 'string') return [];
  const cfg = {
    defaultTitle: '媒体流',
    trimTitle: true,
    trimUrl: true,
    skipEmptyLines: true,
    skipCommentLines: true,
    commentChars: ['#', '//'],
    lineSep: ',',
    allowSepSpaces: true,
    jsonPath: null,
    titleFields: ['title', 'name', '节目名', 'vod_name', 'episode', 'fulltitle'],
    urlFields: ['url', 'link', 'play_url', 'src', 'href', 'm3u8', 'stream'],
    m3uUseGroupTitle: false,
    rssTitleTag: 'title',
    rssLinkTag: 'link',
    autoDetect: true,
    forceType: null,
    debug: false
  };
  Object.assign(cfg, opt);

  let type = cfg.forceType;
  if (cfg.autoDetect && !type) {
    const trimmed = content.trim();
    if (/^[\s]*[\[\{]/i.test(trimmed)) type = 'json';
    else if (trimmed.startsWith('#EXTM3U')) type = 'm3u';
    else if (/<rss|<feed|<channel|<item/i.test(trimmed)) type = 'rss';
    else type = 'txt';
  }

  if (type === 'json') {
    try {
      let data = JSON.parse(content);
      if (cfg.jsonPath) {
        for (let p of cfg.jsonPath.split('.')) data = data[p];
      }
      let arr = Array.isArray(data) ? data : (data ? [data] : []);
      const result = [];
      const titleFields = cfg.titleFields.map(f => f.toLowerCase());
      const urlFields = cfg.urlFields.map(f => f.toLowerCase());
      for (let item of arr) {
        if (!item || typeof item !== 'object') continue;
        let title = null, url = null;
        const lowerItem = {};
        for (let k in item) lowerItem[k.toLowerCase()] = item[k];
        for (let tf of titleFields) { if (lowerItem[tf]) { title = lowerItem[tf]; break; } }
        for (let uf of urlFields) { if (lowerItem[uf]) { url = lowerItem[uf]; break; } }
        if (title && url) {
          if (cfg.trimTitle) title = String(title).trim();
          if (cfg.trimUrl) url = String(url).trim();
          result.push({ title, url });
        }
      }
      return result;
    } catch (e) {}
  }

  if (type === 'm3u') {
    const lines = content.split(/\r?\n/);
    const result = [];
    let currentTitle = '';
    let currentGroup = '';
    for (let line of lines) {
      line = line.trim();
      if (line.startsWith('#EXTINF:')) {
        const groupMatch = line.match(/group-title="([^"]*)"/);
        if (groupMatch) currentGroup = groupMatch[1];
        const titleMatch = line.match(/#EXTINF:.*?,(.*)/);
        if (titleMatch) currentTitle = titleMatch[1].trim();
      } else if (line && !line.startsWith('#') && line.match(/^https?:\/\//i)) {
        let title = currentTitle || cfg.defaultTitle;
        if (cfg.m3uUseGroupTitle && currentGroup) title = `[${currentGroup}] ${title}`;
        result.push({ title, url: line });
        currentTitle = '';
        currentGroup = '';
      }
    }
    return result;
  }

  if (type === 'rss') {
    try {
      const titleReg = new RegExp(`<${cfg.rssTitleTag}>(.*?)</${cfg.rssTitleTag}>`, 'gi');
      const linkReg = new RegExp(`<${cfg.rssLinkTag}>(.*?)</${cfg.rssLinkTag}>`, 'gi');
      const titles = [...content.matchAll(titleReg)].map(m => m[1]);
      const links = [...content.matchAll(linkReg)].map(m => m[1]);
      const result = [];
      for (let i = 0; i < Math.min(titles.length, links.length); i++) {
        if (links[i].startsWith('http')) result.push({ title: titles[i], url: links[i] });
      }
      return result;
    } catch (e) {}
  }

  // TXT 通用
  const lines = content.split(/\r?\n/);
  const result = [];
  let sepRegex;
  if (cfg.lineSep instanceof RegExp) {
    sepRegex = new RegExp(`^(.+?)${cfg.lineSep.source}\\s*(https?://\\S+)`, 'i');
  } else {
    const escapedSep = cfg.lineSep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    sepRegex = cfg.allowSepSpaces
      ? new RegExp(`^(.+?)${escapedSep}\\s*(https?://\\S+)`, 'i')
      : new RegExp(`^(.+?)${escapedSep}(https?://\\S+)`, 'i');
  }

  for (let rawLine of lines) {
    let line = rawLine;
    if (cfg.skipEmptyLines && line.trim() === '') continue;
    if (cfg.skipCommentLines) {
      let isComment = false;
      for (let cmt of cfg.commentChars) {
        if (line.trim().startsWith(cmt)) { isComment = true; break; }
      }
      if (isComment) continue;
    }
    let match = line.match(sepRegex);
    if (match) {
      let title = match[1];
      let url = match[2];
      if (cfg.trimTitle) title = title.trim();
      if (cfg.trimUrl) url = url.trim();
      result.push({ title, url });
      continue;
    }
    if (line.match(/^https?:\/\//i)) {
      result.push({ title: cfg.defaultTitle, url: line.trim() });
      continue;
    }
  }
  return result;
}

// ========== 存储 ==========
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

// ========== httpRequest（原样） ==========
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

// ========== 源解析 ==========
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
  } else if (type === 'json') {
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
    } catch (e) { print("JSON解析失败: " + e.message); }
    return items;
  } else {
    let lines = content.split(/\r?\n/);
    let sep = sourceConfig.line_sep || ',';
    let escapedSep = sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let regex = new RegExp(`^(.+?)${escapedSep}\\s*(https?://\\S+)`, 'i');
    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;
      let match = line.match(regex);
      if (match) items.push({ title: match[1].trim(), url: match[2].trim() });
      else if (line.match(/^https?:\/\//i)) items.push({ title: "直播流", url: line });
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
  if (!sourceConfig.type && content.includes('#EXTM3U')) content = convertM3uToNormal(content);
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
  } catch (e) { return m3u; }
}

// ========== ★ 修改：splitArray（按 key 完整归并，修复串组 bug） ==========
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

// ========== ★ 新增：构造去重后的集条目 ==========
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
    } catch (e) {}
  }
  if (content.includes("#EXTM3U")) return parseSource(content, { type: "m3u" }, baseUrl);
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
    let resp = httpRequestForData(infoUrl, {
      method: vodConfig.infoMethod || 'GET',
      headers: vodConfig.infoHeaders || {},
      body: vodConfig.infoBody,
      contentType: vodConfig.infoContentType
    });
    infoData = resp.json();
  }
  let listUrl = vodConfig.listApi;
  let replaceMap = { ...extraParams, ...(infoData || {}) };
  for (let [k, v] of Object.entries(replaceMap)) {
    listUrl = listUrl.replace(new RegExp(`\\{${k}\\}`, 'g'), encodeURIComponent(v));
  }
  let resp = httpRequestForData(listUrl, {
    method: vodConfig.listMethod || 'GET',
    headers: vodConfig.listHeaders || {},
    body: vodConfig.listBody,
    contentType: vodConfig.listContentType
  });
  let listJson = resp.json();
  if (!listJson) return null;
  let parseConf = vodConfig.listParse || { type: 'json', dataPath: 'data.list', titleField: 'title', urlField: 'guid' };
  let items = parseSource(listJson, parseConf, '');
  if (!items.length) return null;
  let videoList = items.map(item => `${item.title}$${item.url}`);
  return { playUrl: videoList.join('#'), playFrom: vodConfig.playFrom || '播放源', infoData };
}

// ========== init（原样保留） ==========
function init(ext) {
  unlocked = getUnlocked();
  print(`解锁状态: ${unlocked ? '已解锁' : '未解锁'}`);
  console.log("当前版本号:" + VERSION);

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
      try { configData = JSON.parse(ext); } catch (e) { configData = null; }
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

  if (__ext_config.global && __ext_config.global.unlockVideos) {
    externalUnlockVideos = __ext_config.global.unlockVideos;
    print("已加载外部解锁视频列表，共 " + externalUnlockVideos.length + " 个");
  } else {
    externalUnlockVideos = null;
  }

  let remoteUrl = (__ext_config.global && __ext_config.global.unlockVideosUrl)
    ? __ext_config.global.unlockVideosUrl
    : "https://raw.githubusercontent.com/mannys888/frist/refs/heads/main/迦南诗歌.txt";
  try {
    print("正在预加载远程视频列表: " + remoteUrl);
    let resp = httpRequest(remoteUrl, { timeout: 3000 });
    let content = resp.text();
    let videoItems = [];

    try {
      let json = JSON.parse(content);
      if (Array.isArray(json) && json.length > 0 && json[0].title && json[0].url) {
        videoItems = json;
        print("远程列表解析成功 (JSON 数组格式)");
      }
    } catch (e) {}

    if (videoItems.length === 0) {
      let items = smartParseList(content, { lineSep: ',' });
      if (items.length > 0) {
        videoItems = items.map(item => ({ title: item.title, url: item.url }));
        print("TXT 解析成功，共 " + videoItems.length + " 个视频");
      }
    }

    if (videoItems.length > 0) {
      remoteUnlockVideos = videoItems.filter(item => item && item.title && item.url);
      print("预加载成功，共 " + remoteUnlockVideos.length + " 个视频");
    } else {
      remoteUnlockVideos = null;
    }
  } catch (e) {
    print("预加载远程视频列表失败: " + e.message);
    remoteUnlockVideos = null;
  }

  print('init执行完毕，共 ' + __ext_config.sources.length + ' 个源');
}

// ========== home ==========
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
  let classes = __ext_config.sources.map(it => ({ type_id: it.name, type_name: it.name }));
  // ★ 文案更新：不再叫"多线路/单线路"，因为都单线路了
  let filters = [{
    key: 'show',
    name: '排列方式',
    value: [
      { n: '同频道连续（推荐）', v: 'groups' },
      { n: '原始顺序', v: 'all' }
    ]
  }];
  let filter_dict = {};
  classes.forEach(it => { filter_dict[it.type_id] = filters; });
  return JSON.stringify({ 'class': classes, 'filters': filter_dict });
}

function homeVod(params) {
  return JSON.stringify({ list: [] });
}

// ========== category（原样保留） ==========
function category(tid, pg, filter, extend) {
  if (!unlocked && tid === '__UNLOCK__') {
    unlockMode = true;
    unlockBuffer = '';
    let videos = getKeyboardVideos();
    videos.unshift({
      vod_id: '__UNLOCK_STATUS_INIT',
      vod_name: '🔐 请输入4位',
      vod_pic: def_pic,
      vod_remarks: '找管理员要0101'
    });
    return JSON.stringify({ list: videos, page: 1, pagecount: 1, limit: videos.length, total: videos.length });
  }

  let fl = filter ? extend : {};
  if (fl.show) { showMode = fl.show; setItem('showMode', showMode); }
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
    _list.push({ vod_name: vname, vod_id: vod_id, vod_pic: def_pic, vod_remarks: vtab });
  }
  return JSON.stringify({ page: 1, pagecount: 1, limit: _list.length, total: _list.length, list: _list });
}

// ========== detail（保留原功能，普通直播改单线路） ==========
function detail(tid) {
  // 解锁键盘
  if (unlockMode && tid.startsWith('__UNLOCK_KEY__')) {
    let digit = tid.replace('__UNLOCK_KEY__', '');
    if (digit >= '0' && digit <= '9') {
      if (unlockBuffer.length < 4) {
        unlockBuffer += digit;
        if (unlockBuffer.length === 4) {
          if (verifyDynamicPassword(unlockBuffer)) {
            setUnlocked(true); unlocked = true; unlockMode = false;
            print("密码正确，解锁成功！");

            let videoList = [];
            if (remoteUnlockVideos && Array.isArray(remoteUnlockVideos) && remoteUnlockVideos.length > 0) {
              videoList = remoteUnlockVideos;
              print("使用远程预加载视频列表，共 " + videoList.length + " 个");
            } else if (externalUnlockVideos && Array.isArray(externalUnlockVideos) && externalUnlockVideos.length > 0) {
              videoList = externalUnlockVideos.filter(item => item && item.title && item.url);
              print("使用 ext 配置视频列表，共 " + videoList.length + " 个");
            }
            if (videoList.length === 0) {
              videoList = [
                { title: "🎉 庆祝视频 - 精彩剪辑", url: "https://vd2.bdstatic.com/mda-sbehdejw4kmibhkh/576p/h264/1771157811027978795/mda-sbehdejw4kmibhkh.mp4" },
                { title: "📺 第二集 - 花絮彩蛋", url: "https://vd2.bdstatic.com/mda-qiakr3cmtvs6w0d4/hd/cae_h264/1726065783439501256/mda-qiakr3cmtvs6w0d4.mp4" },
                { title: "🔔 第三集 - 幕后制作", url: "https://vd3.bdstatic.com/mda-rdkgd5132u941fcr/576p/h264/1745235281540035966/mda-rdkgd5132u941fcr.mp4" }
              ];
              print("未获取到远程或ext列表，使用内置默认");
            }

            // ★ 解锁合集也用 buildEpisodeEntries（重名集自动加序号）
            const playUrl = buildEpisodeEntries(videoList).join('#');
            return JSON.stringify({
              list: [{
                vod_id: '__UNLOCK_SUCCESS_MULTI',
                vod_name: '🎉 解锁成功！请选择视频播放',
                vod_pic: def_pic,
                type_name: "解锁合集",
                vod_play_from: "庆祝源",       // ★ 单线路
                vod_play_url: playUrl,           // ★ 所有集用 #
                vod_remarks: `共${videoList.length}个视频，密码正确已解锁`
              }]
            });
          } else {
            unlockBuffer = '';
            let videos = getKeyboardVideos();
            videos.unshift({
              vod_id: '__UNLOCK_STATUS_ERR_' + Date.now(),
              vod_name: `❌ 密码错误，请重试`,
              vod_pic: def_pic,
              vod_remarks: '找管理员要密码'
            });
            return JSON.stringify({ list: videos });
          }
        }
      }
    }
    let videos = getKeyboardVideos();
    let display = '*'.repeat(unlockBuffer.length) + '_'.repeat(4 - unlockBuffer.length);
    videos.unshift({
      vod_id: '__UNLOCK_STATUS_' + unlockBuffer.length + '_' + Date.now(),
      vod_name: `🔐 密码: ${display}`,
      vod_pic: def_pic,
      vod_remarks: '请输入4位数字'
    });
    return JSON.stringify({ list: videos });
  }
  if (unlockMode && tid === '__UNLOCK_BACKSPACE') {
    if (unlockBuffer.length > 0) unlockBuffer = unlockBuffer.slice(0, -1);
    let videos = getKeyboardVideos();
    let display = '*'.repeat(unlockBuffer.length) + '_'.repeat(4 - unlockBuffer.length);
    videos.unshift({
      vod_id: '__UNLOCK_STATUS_' + unlockBuffer.length + '_' + Date.now(),
      vod_name: `🔐 密码: ${display}`,
      vod_pic: def_pic,
      vod_remarks: '请输入4位数字'
    });
    return JSON.stringify({ list: videos });
  }
  if (unlockMode && tid === '__UNLOCK_CLEAR') {
    unlockBuffer = '';
    let videos = getKeyboardVideos();
    let display = '_'.repeat(4);
    videos.unshift({
      vod_id: '__UNLOCK_STATUS_CLEAR_' + Date.now(),
      vod_name: `🔐 密码: ${display}`,
      vod_pic: def_pic,
      vod_remarks: '请输入4位数字'
    });
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

  // 搜索历史
  if (tid.includes('#search#')) {
    let vod_name = tab.replace('#search#', '');
    let vod_play_from = '来自搜索:' + sourceUrl;
    let vod_play_url = groupDict[sourceUrl].map(x => x.replace(',', '$')).join('#');
    return JSON.stringify({
      list: [{
        vod_id: tid, vod_name: '搜索:' + vod_name, type_name: "直播列表", vod_pic: def_pic,
        vod_content: tid, vod_play_from: vod_play_from, vod_play_url: vod_play_url,
        vod_director: tips, vod_remarks: VERSION
      }]
    });
  }

  // series 模式（本来就是单线路）
  if (mode === 'series') {
    let seriesUrl = sourceUrl;
    let seriesConfig = __ext_config.series || {};
    let content = fetchSource(seriesUrl, source);
    let baseDir = seriesUrl.substring(0, seriesUrl.lastIndexOf('/') + 1);
    let episodes = parseSeriesEpisodes(content, baseDir, seriesConfig);
    if (!episodes.length) return JSON.stringify({ list: [] });
    // ★ 用 buildEpisodeEntries 处理重名集
    let playUrl = buildEpisodeEntries(episodes).join('#');
    let seriesTitle = seriesConfig.title || source.name;
    return JSON.stringify({
      list: [{
        vod_id: tid,
        vod_name: seriesTitle + '|' + tab,
        vod_pic: def_pic,
        type_name: "连续剧",
        vod_play_from: seriesConfig.playFrom || source.name,  // ★ 单线路
        vod_play_url: playUrl,                                  // ★ 所有集用 #
        vod_director: tips,
        vod_remarks: VERSION
      }]
    });
  }

  // ============ ★ 普通直播分组：核心修改 ============
  let html = fetchSource(sourceUrl, source);
  let escTab = tab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let a = new RegExp(`.*?${escTab}[,，]#[\\s\\S].*?#`);
  let b = html.match(a);
  if (!b) return JSON.stringify({ list: [] });
  let c = html.split(b[0])[1];
  if (c.match(/.*?[,，]#[\s\S].*?#/)) {
    let d = c.match(/.*?[,，]#[\s\S].*?#/)[0];
    c = c.split(d)[0];
  }

  // 解析为 {title, url} 对象
  let rawItems = [];
  for (let line of c.trim().split('\n')) {
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

  // ★ groups：按标题分组 → 同组连续排列；单线路
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
      vod_play_from: source.name,       // ★ 唯一一条线路
      vod_play_url: entries.join('#'),   // ★ 所有条目用 #，切下一集 = 下一条
      vod_director: tips,
      vod_remarks: `${ordered.length} 条 · 失败点下一集`
    }]
  });
}

// ========== ★ 修改：play（直链强制 parse:0） ==========
function play(flag, id, flags) {
  // 密码锁检查
  if (!getUnlocked()) {
    print("播放被拒绝：密码锁已过期或未解锁，请重新解锁后再试");
    const tipVideo = "https://vd2.bdstatic.com/mda-sbehdejw4kmibhkh/576p/h264/1771157811027978795/mda-sbehdejw4kmibhkh.mp4";
    return JSON.stringify({ parse: 1, playUrl: '', url: tipVideo });
  }

  // ★ 直链（含 mp4/m3u8/ts/flv/m4a/mp3/mkv）一律 parse:0
  // 避免被当成"需要嗅探"，嗅探失败触发客户端切线路
  if (/^https?:\/\//i.test(id) && /\.(m3u8|mp4|ts|flv|m4a|mp3|mkv)(\?|#|$)/i.test(id)) {
    return JSON.stringify({ parse: 0, playUrl: '', url: id });
  }

  // 其他情况（可能是页面 URL）
  let isLiveSource = /\.(m3u|txt|json)$/i.test(id);
  let parse = isLiveSource ? 0 : 1;
  return JSON.stringify({ parse: parse, playUrl: '', url: id });
}

// ========== search（原样） ==========
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
    _list.push({ vod_name: it, vod_id: it + '$' + wd + '#search#', vod_pic: def_pic });
  });
  return JSON.stringify({ list: _list });
}

export default { init, home, homeVod, category, detail, play, search };