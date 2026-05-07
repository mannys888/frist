/**
 * universal_spider_v28.js (基于 v27 成功版，增加内置请求头)
 * 特性：完全保留 v27 的 ext 读取逻辑（已验证可读），额外增加默认请求头
 * 支持：直播源 (text/m3u/json) / 连续剧模式 / 分组算法 (# 和 $$$)
 */

// ========== 新增：内置默认请求头（可被 ext 中的 headers 覆盖） ==========
const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  //"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
  "Connection": "keep-alive"
};

// 动态 Referer（根据 URL 域名智能添加）
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

// ========== 以下为 v27 原版（完全保留，仅修改 httpRequest 合并默认头） ==========
String.prototype.rstrip = function (chars) {
  let regex = new RegExp(chars + "$");
  return this.replace(regex, "");
};

const request_timeout = 5000;
const RKEY = 'universal_spider';
const VERSION = 'universal v2.8 (内置请求头)';
const UA = DEFAULT_HEADERS["User-Agent"];
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

// ========== 修改网络请求：合并默认头 + 动态 Referer ==========
function httpRequest(url, options = {}) {
  let method = options.method || 'GET';
  let dynamicHeaders = getDynamicHeaders(url);
  // 合并优先级：默认头 < 动态头 < 用户传入的 headers
  let headers = { ...DEFAULT_HEADERS, ...dynamicHeaders, ...(options.headers || {}) };
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

// ========== 以下函数与 v27 完全一致（未作任何改动） ==========
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
  let resp = httpRequest(url, options);
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

// ========== 点播API链式处理（可选） ==========
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
    let resp = httpRequest(infoUrl, infoOpts);
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
  let resp = httpRequest(listUrl, listOpts);
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

// ========== ext 配置解析 (完全保留 v27 的成功逻辑) ==========
function init(ext) {
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

function home(filter) {
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

function category(tid, pg, filter, extend) {
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

function detail(tid) {
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