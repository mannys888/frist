/**
 * 通用爬虫 v3.0 (修复 ext 读取 + 内置请求头 + 保留 join)
 * 特性：
 *   - 稳健读取 ext（支持 URL / 字符串 / 对象 / 数组）
 *   - 内置常用请求头，自动添加 Referer
 *   - 支持直播源 (TXT/M3U/JSON) 和连续剧模式（# 连接）
 *   - 保留分组算法 (splitArray) 和 join: 单线路 #，多线路 $$$
 */

// ========== 内置请求头 ==========
const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
  "Accept-Encoding": "gzip, deflate, br",
  "Connection": "keep-alive"
};

function getDynamicHeaders(url) {
  let headers = {};
  if (url.includes('cntv.cn') || url.includes('cctv.com')) {
    headers['Referer'] = 'https://tv.cctv.com/';
    headers['Origin'] = 'https://tv.cctv.com';
  } else {
    let match = url.match(/^(https?:\/\/[^/]+)/);
    if (match) headers['Referer'] = match[1] + '/';
  }
  return headers;
}

// ========== 以下代码与原 live2cms 成功版一致 ==========
String.prototype.rstrip = function (chars) {
  let regex = new RegExp(chars + "$");
  return this.replace(regex, "");
};

const request_timeout = 5000;
const RKEY = 'universal_spider';
const VERSION = 'v3.0 (修复ext读取)';
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

function httpRequest(url, options = {}) {
  let method = options.method || 'GET';
  let dynamicHeaders = getDynamicHeaders(url);
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

// ========== 修复后的 init，能够稳健读取 ext ==========
function init(ext) {
  console.log("当前版本号:" + VERSION);
  console.log("原始 ext 参数类型: " + typeof ext);
  if (typeof ext === 'string') console.log("ext 字符串前100字符: " + ext.substring(0, 100));
  
  let configData = null;
  // 1. 对象直接使用
  if (typeof ext === 'object') {
    configData = ext;
    print('ext 是对象');
  }
  // 2. 字符串处理
  else if (typeof ext === 'string') {
    let trimmed = ext.trim();
    // 2.1 远程 URL
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      let url = trimmed.split(';')[0];
      console.log("请求远程 ext: " + url);
      let resp = httpRequest(url, { json: true });
      configData = resp.json();
      if (!configData) console.error("远程 ext 请求失败或 JSON 解析错误");
      else console.log("远程 ext 加载成功");
    }
    // 2.2 尝试解析为 JSON
    else {
      try {
        configData = JSON.parse(trimmed);
        console.log("ext 字符串解析为 JSON 成功");
      } catch(e) {
        console.error("ext 字符串不是合法 JSON: " + e.message);
        configData = null;
      }
    }
  }
  
  // 2.3 如果 configData 仍为空，尝试将其当作直接来源（例如纯文本格式，但一般不会）
  if (!configData) {
    configData = [];
    console.warn("ext 解析失败，使用空数组");
  }
  
  // 3. 标准化配置结构
  if (Array.isArray(configData)) {
    // 判断是 [{name, url}] 还是其他数组
    if (configData.length > 0 && configData[0].name && configData[0].url) {
      __ext_config.sources = configData;
      __ext_config.global = {};
      console.log(`从数组加载 ${__ext_config.sources.length} 个直播源`);
    } else {
      __ext_config.sources = [];
      console.warn("数组格式不正确，缺少 name/url 字段");
    }
  } 
  else if (configData.sources && Array.isArray(configData.sources)) {
    __ext_config = configData;
    console.log(`从对象加载 ${__ext_config.sources.length} 个站点`);
  }
  else if (configData.name && configData.url) {
    __ext_config.sources = [configData];
    __ext_config.global = {};
    console.log("加载单个源");
  }
  else {
    __ext_config.sources = [];
    __ext_config.global = {};
    console.warn("无法识别的 ext 格式，已初始化为空");
  }
  
  // 应用全局设置
  if (__ext_config.global) {
    if (__ext_config.global.defaultPic) def_pic = __ext_config.global.defaultPic;
    if (__ext_config.global.defaultTimeout) request_timeout = __ext_config.global.defaultTimeout;
  }
  
  // 恢复持久化状态
  showMode = getItem('showMode', 'groups');
  groupDict = JSON.parse(getItem('groupDict', '{}'));
  
  console.log(`初始化完成，共 ${__ext_config.sources.length} 个源`);
  if (__ext_config.sources.length === 0) {
    console.error("警告：没有加载到任何源，请检查 ext 参数");
  } else {
    console.log("第一个源示例: " + JSON.stringify(__ext_config.sources[0]));
  }
}

// ========== 其余 CMS 标准接口（与成功版一致） ==========
function home(filter) {
  let classes = __ext_config.sources.map(it => ({ type_id: it.name, type_name: it.name }));
  let filters = [{ 'key': 'show', 'name': '播放展示', 'value': [{ 'n': '多线路分组', 'v': 'groups' }, { 'n': '单线路', 'v': 'all' }] }];
  let filter_dict = {};
  classes.forEach(it => { filter_dict[it.type_id] = filters; });
  return JSON.stringify({ 'class': classes, 'filters': filter_dict });
}

function homeVod(params) { return JSON.stringify({ list: [] }); }

function category(tid, pg, filter, extend) {
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
    return JSON.stringify({ list: [{ vod_id: tid, vod_name: '搜索:' + vod_name, type_name: "直播列表", vod_pic: def_pic, vod_content: tid, vod_play_from: vod_play_from, vod_play_url: vod_play_url, vod_director: tips, vod_remarks: VERSION }] });
  }
  
  if (mode === 'series') {
    let seriesConfig = __ext_config.series || {};
    let content = fetchSource(sourceUrl, source);
    let baseDir = sourceUrl.substring(0, sourceUrl.lastIndexOf('/') + 1);
    let episodes = parseSeriesEpisodes(content, baseDir, seriesConfig);
    if (!episodes.length) return JSON.stringify({ list: [] });
    let videoList = episodes.map(ep => `${ep.title}$${ep.url}`);
    let playUrl = videoList.join('#');
    let seriesTitle = seriesConfig.title || source.name;
    let vod = { vod_id: tid, vod_name: seriesTitle + '|' + tab, vod_pic: def_pic, type_name: "连续剧", vod_play_from: seriesConfig.playFrom || source.name, vod_play_url: playUrl, vod_director: tips, vod_remarks: VERSION };
    return JSON.stringify({ list: [vod] });
  }
  
  let html = fetchSource(sourceUrl, source);
  let regex = new RegExp(`.*?${tab.replace('(', '\\(').replace(')', '\\)')}[,，]#[\\s\\S].*?#`);
  let match = html.match(regex);
  if (!match) return JSON.stringify({ list: [] });
  let after = html.split(match[0])[1];
  let nextMatch = after.match(/.*?[,，]#[\s\S].*?#/);
  if (nextMatch) after = after.split(nextMatch[0])[0];
  let lines = after.trim().split('\n');
  let _list = [];
  for (let line of lines) {
    if (line.trim()) {
      let [t, u] = line.trim().split(',');
      if (t && u) _list.push(t + '$' + u);
    }
  }
  let vod_name = source.name;
  let vod_play_url, vod_play_from;
  if (showMode === 'groups') {
    let groups = splitArray(_list, x => x.split('$')[0]);
    let tabs = groups.map((_, i) => i === 0 ? vod_name + '1' : ` ${i+1} `);
    vod_play_url = groups.map(g => g.join('#')).join('$$$');
    vod_play_from = tabs.join('$$$');
  } else {
    vod_play_url = _list.join('#');
    vod_play_from = vod_name;
  }
  let vod = { vod_id: tid, vod_name: vod_name + '|' + tab, type_name: "直播列表", vod_pic: def_pic, vod_content: tid, vod_play_from: vod_play_from, vod_play_url: vod_play_url, vod_director: tips, vod_remarks: VERSION };
  return JSON.stringify({ list: [vod] });
}

function play(flag, id, flags) { return JSON.stringify({ parse: /m3u8/.test(id) ? 0 : 1, playUrl: '', url: id }); }

function search(wd, quick) {
  if (__ext_config.sources.length === 0) return JSON.stringify({ list: [] });
  let allLines = [];
  for (let src of __ext_config.sources) {
    let html = fetchSource(src.url, src);
    let lines = html.split('\n').filter(l => l.trim() && l.includes(',') && l.split(',')[1]?.trim().startsWith('http'));
    allLines.push(...lines);
  }
  let plays = Array.from(new Set(allLines));
  plays = plays.filter(l => l.includes(wd));
  let new_group = gen_group_dict(plays);
  groupDict = Object.assign(groupDict, new_group);
  setItem('groupDict', JSON.stringify(groupDict));
  let _list = Object.keys(groupDict).map(name => ({ vod_name: name, vod_id: name + '$' + wd + '#search#', vod_pic: def_pic }));
  return JSON.stringify({ list: _list });
}

export default { init, home, homeVod, category, detail, play, search };