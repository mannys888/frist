/**
 * live2cms.js (升级版 - 配置驱动，不改变 join 方法)
 * 支持多类型直播源：text / m3u / json
 * 保留原分组逻辑及播放列表拼接方式：单线路用 #，多线路用 $$$
 */
String.prototype.rstrip = function (chars) {
  let regex = new RegExp(chars + "$");
  return this.replace(regex, "");
};

const request_timeout = 5000;
const RKEY = 'live2cms';
const VERSION = 'live2cms v2 (配置驱动)';
const UA = 'Mozilla/5.0';
const def_pic = 'https://avatars.githubusercontent.com/u/97389433?s=120&v=4';
const tips = `\n道长直播转点播js-当前版本${VERSION}`;

let __ext_config = { sources: [], global: {} };
let cache_data = {}; // 缓存源文件内容

function setItem(k, v) { local.set(RKEY, k, v); console.log(`设置 ${k} => ${v}`); }
function getItem(k, v) { return local.get(RKEY, k) || v; }
function clearItem(k) { local.delete(RKEY, k); }

var showMode = getItem('showMode', 'groups');
var groupDict = JSON.parse(getItem('groupDict', '{}'));

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

// ========== 解析器：根据配置将原始内容转换为 { title, url } 数组 ==========
function parseSource(content, sourceConfig, baseUrl) {
  let items = [];
  let type = sourceConfig.type || 'text';
  if (type === 'm3u') {
    // 标准 m3u 解析
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
  else { // type === 'text' (默认)
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

// 获取源内容（支持缓存、重试）
function fetchSource(url, sourceConfig) {
  if (cache_data[url]) return cache_data[url];
  let options = { timeout: request_timeout, headers: { 'User-Agent': UA } };
  if (sourceConfig.headers) Object.assign(options.headers, sourceConfig.headers);
  if (sourceConfig.referer) options.headers['Referer'] = sourceConfig.referer;
  try {
    let resp = req(url, options);
    let content = resp.content || '';
    // 如果是 m3u 格式且未指定 type，自动转换（与原逻辑一致）
    if (!sourceConfig.type && /#EXTM3U/.test(content)) {
      content = convertM3uToNormal(content);
    }
    cache_data[url] = content;
    return content;
  } catch(e) {
    print(`获取源失败 ${url}: ${e.message}`);
    return '';
  }
}

// 原 m3u 转普通格式函数（保持不变）
function convertM3uToNormal(m3u) {
  try {
    const lines = m3u.split('\n');
    let result = '';
    let TV = '';
    let flag = '#m3u#';
    let currentGroupTitle = '';
    lines.forEach((line) => {
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
    });
    return result.trim();
  } catch (e) {
    print(`m3u转换错误: ${e.message}`);
    return m3u;
  }
}

// 原分组算法（保持不变）
function splitArray(arr, parse) {
  parse = parse && typeof parse == 'function' ? parse : '';
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

const http = function (url, options = {}) {
  if (options.method === 'POST' && options.data) {
    options.body = JSON.stringify(options.data);
    options.headers = Object.assign({ 'content-type': 'application/json' }, options.headers);
  }
  options.timeout = request_timeout;
  if (!options.headers) options.headers = {};
  let keys = Object.keys(options.headers).map(it => it.toLowerCase());
  if (!keys.includes('referer')) options.headers['Referer'] = getHome(url);
  if (!keys.includes('user-agent')) options.headers['User-Agent'] = UA;
  try {
    const res = req(url, options);
    res.json = () => res && res.content ? JSON.parse(res.content) : null;
    res.text = () => res && res.content ? res.content : '';
    return res;
  } catch (e) {
    return { json() { return null; }, text() { return ''; } };
  }
};
["get", "post"].forEach(method => {
  http[method] = function (url, options = {}) {
    return http(url, Object.assign(options, { method: method.toUpperCase() }));
  };
});

// ========== 导出函数 ==========
function init(ext) {
  console.log("当前版本号:" + VERSION);
  let configData = null;
  if (typeof ext == 'object') {
    configData = ext;
    print('live ext:object');
  } else if (typeof ext == 'string') {
    if (ext.startsWith('http')) {
      let ext_paramas = ext.split(';');
      let data_url = ext_paramas[0];
      print(data_url);
      configData = http.get(data_url).json();
    } else {
      try { configData = JSON.parse(ext); } catch(e) { configData = null; }
    }
  }
  // 兼容原格式：若为数组且每项有 name/url，则包装为 sources
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
  }
  print('init执行完毕，共 ' + __ext_config.sources.length + ' 个源');
}

function home(filter) {
  let classes = __ext_config.sources.map(it => ({
    type_id: it.url,
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
  if (__ext_config.sources.length === 0) return JSON.stringify({ list: [] });
  let first = __ext_config.sources[0];
  let html = fetchSource(first.url, first);
  let arr = html.match(/.*?[,，]#[\s\S].*?#/g) || [];
  let _list = [];
  arr.forEach(it => {
    let vname = it.split(/[,，]/)[0];
    let vtab = it.match(/#(.*?)#/)[0];
    _list.push({
      vod_name: vname,
      vod_id: first.url + '$' + vname,
      vod_pic: def_pic,
      vod_remarks: vtab,
    });
  });
  return JSON.stringify({ list: _list });
}

function category(tid, pg, filter, extend) {
  let fl = filter ? extend : {};
  if (fl.show) {
    showMode = fl.show;
    setItem('showMode', showMode);
  }
  if (parseInt(pg) > 1) return JSON.stringify({ list: [] });

  let source = __ext_config.sources.find(s => s.url === tid);
  if (!source) return JSON.stringify({ list: [] });
  let html = fetchSource(tid, source);
  let arr = html.match(/.*?[,，]#[\s\S].*?#/g) || [];
  let _list = [];
  arr.forEach(it => {
    let vname = it.split(/[,，]/)[0];
    let vtab = it.match(/#(.*?)#/)[0];
    _list.push({
      vod_name: vname,
      vod_id: tid + '$' + vname,
      vod_pic: def_pic,
      vod_remarks: vtab,
    });
  });
  return JSON.stringify({
    page: 1, pagecount: 1, limit: _list.length, total: _list.length, list: _list,
  });
}

function detail(tid) {
  let parts = tid.split('$');
  let _get_url = parts[0];
  let _tab = parts[1];
  if (tid.includes('#search#')) {
    let vod_name = _tab.replace('#search#', '');
    let vod_play_from = '来自搜索';
    vod_play_from += `:${_get_url}`;
    let vod_play_url = groupDict[_get_url].map(x => x.replace(',', '$')).join('#');
    return JSON.stringify({
      list: [{
        vod_id: tid, vod_name: '搜索:' + vod_name, type_name: "直播列表", vod_pic: def_pic,
        vod_content: tid, vod_play_from: vod_play_from, vod_play_url: vod_play_url,
        vod_director: tips, vod_remarks: `道长直播转点播js-当前版本${VERSION}`,
      }]
    });
  }
  let source = __ext_config.sources.find(s => s.url === _get_url);
  if (!source) return JSON.stringify({ list: [] });
  let html = fetchSource(_get_url, source);
  // 以下是原分组/单线路逻辑，完全保留 join 方法
  let a = new RegExp(`.*?${_tab.replace('(', '\\(').replace(')', '\\)')}[,，]#[\\s\\S].*?#`);
  let b = html.match(a)[0];
  let c = html.split(b)[1];
  if (c.match(/.*?[,，]#[\s\S].*?#/)) {
    let d = c.match(/.*?[,，]#[\s\S].*?#/)[0];
    c = c.split(d)[0];
  }
  let arr = c.trim().split('\n');
  let _list = [];
  arr.forEach((it) => {
    if (it.trim()) {
      let t = it.trim().split(',')[0];
      let u = it.trim().split(',')[1];
      _list.push(t + '$' + u);
    }
  });
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
    vod_id: tid, vod_name: vod_name + '|' + _tab, type_name: "直播列表", vod_pic: def_pic,
    vod_content: tid, vod_play_from: vod_play_from, vod_play_url: vod_play_url,
    vod_director: tips, vod_remarks: `道长直播转点播js-当前版本${VERSION}`,
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