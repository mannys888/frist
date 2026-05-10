// ==================== 通用动态爬虫 v38（加载即验证 + 备用入口） ====================
// 功能：
//   - 支持普通线路、合集模式、多格式解析、全局搜索
//   - 密码验证（默认 admin）
//   - 优先在 init 时弹出密码输入框（若环境支持）
//   - 若环境不支持弹窗，则在首页显示一个“验证密码”分类，点击后验证
//   - 验证后永久解锁，显示全部分类
// ================================================================

// ---------- 基础配置 ----------
String.prototype.rstrip = function (chars) {
  let regex = new RegExp(chars + "$");
  return this.replace(regex, "");
};

let __ext_config = { sources: [], global: {} };
let cache_data = {};
let showMode = 'groups';
let groupDict = {};
let debugMode = true;
let defaultTimeout = 8000;
let defaultRetry = 2;
let def_pic = 'https://avatars.githubusercontent.com/u/97389433?s=120&v=4';
const VERSION = 'universal v3.8 (load-auth)';
const tips = `\n${VERSION}`;
const RKEY = 'universal_spider';
const PASSWORD_KEY = 'cctv_auth';
const DEFAULT_PASSWORD = 'admin';

// ---------- 辅助函数 ----------
function print(any) {
  if (!debugMode) return;
  if (typeof any == 'object' && Object.keys(any).length > 0) {
    try { console.log(JSON.stringify(any)); } catch(e) { console.log(any); }
  } else { console.log(any); }
}
function setItem(k, v) { local.set(RKEY, k, v); print(`设置 ${k} => ${v}`); }
function getItem(k, v) { return local.get(RKEY, k) || v; }

// 密码验证状态
function isAuthorized() {
  return getItem(PASSWORD_KEY, 'false') === 'true';
}
function setAuthorized(val) {
  setItem(PASSWORD_KEY, val ? 'true' : 'false');
}

// 验证密码（返回布尔值）
function verifyPassword(pwd) {
  if (pwd === DEFAULT_PASSWORD) {
    setAuthorized(true);
    print("密码正确，已解锁");
    return true;
  }
  print("密码错误");
  return false;
}

// 尝试弹窗输入密码（如果环境支持）
function tryPromptAuth() {
  if (typeof prompt !== 'undefined') {
    let pwd = prompt("请输入密码以解锁所有内容：", "");
    if (pwd !== null) {
      return verifyPassword(pwd);
    }
  }
  return false;
}

// ---------- 网络请求（与前相同） ----------
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
  if (!sourceConfig.type && content.includes('#EXTM3U')) {
    content = convertM3uToNormal(content);
  }
  if (!noCache) cache_data[url] = content;
  return content;
}

// ---------- 解析函数 ----------
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
    } catch(e) { print("JSON解析错误: " + e.message); }
  } 
  else if (type === 'rss') {
    let titles = [...content.matchAll(/<title>(.*?)<\/title>/g)].map(m => m[1]);
    let links = [...content.matchAll(/<link>(.*?)<\/link>/g)].map(m => m[1]);
    for (let i = 0; i < Math.min(titles.length, links.length); i++) {
      if (links[i].startsWith('http')) items.push({ title: titles[i], url: links[i] });
    }
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
      if (parse && result[j].map(parse).includes(parse(arr[i]))) index = j;
      else if ((!parse) && result[j].includes(arr[i])) index = j;
    }
    if (index >= result.length - 1) {
      result.push([]);
      result[result.length-1].push(arr[i]);
    } else result[index+1].push(arr[i]);
  }
  return result;
}

// ---------- 外部接口 ----------
function init(ext) {
  print(`初始化 ${VERSION}`);
  // 1. 解析配置
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
  print(`原始配置加载 ${__ext_config.sources.length} 个分类`);

  // 2. 尝试立即弹窗验证（如果环境支持且未验证）
  if (!isAuthorized()) {
    let success = tryPromptAuth();
    if (!success && __ext_config.sources.length === 0) {
      // 配置本身为空，也可以不处理
    }
  }
}

function home(filter) {
  // 如果未验证，返回一个特殊的“密码验证”分类，引导用户点击验证
  if (!isAuthorized()) {
    let authClass = [{
      type_id: '__AUTH__',
      type_name: '🔐 点击验证密码',
      icon: ''
    }];
    return JSON.stringify({ class: authClass, filters: {} });
  }

  // 已验证，返回正常分类
  let classes = __ext_config.sources.map(s => ({ type_id: s.name, type_name: s.name }));
  let filters = [{ key: 'show', name: '播放展示', value: [{ n: '多线路分组', v: 'groups' }, { n: '单线路', v: 'all' }] }];
  let filterDict = {};
  classes.forEach(c => { filterDict[c.type_id] = filters; });
  return JSON.stringify({ class: classes, filters: filterDict });
}
function homeVod() { return JSON.stringify({ list: [] }); }

function category(tid, pg, filter, extend) {
  // 处理特殊分类：验证入口
  if (tid === '__AUTH__') {
    // 尝试再次弹窗验证（兼容无prompt环境，这里会报错，但至少用户点击了）
    let pwd = null;
    if (typeof prompt !== 'undefined') {
      pwd = prompt("请输入密码以解锁全部内容：", "");
    }
    if (pwd !== null && verifyPassword(pwd)) {
      // 验证成功，返回空列表（前端会重新加载首页，从而显示正常分类）
      return JSON.stringify({ list: [], page: 1, pagecount: 1, limit: 0, total: 0 });
    } else {
      return JSON.stringify({ list: [], page: 1, pagecount: 1, limit: 0, total: 0 });
    }
  }

  // 未验证时拒绝访问其他分类
  if (!isAuthorized()) {
    return JSON.stringify({ list: [], page: 1, pagecount: 0, total: 0 });
  }

  let fl = filter ? extend : {};
  if (fl.show) { showMode = fl.show; setItem('showMode', showMode); }
  if (parseInt(pg) > 1) return JSON.stringify({ list: [] });
  let source = __ext_config.sources.find(s => s.name === tid);
  if (!source) return JSON.stringify({ list: [] });

  // 合集模式
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

  // 普通模式
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
  if (!isAuthorized()) return JSON.stringify({ list: [] });

  let parts = tid.split('###');
  let mode = parts.length > 1 ? parts[1] : 'single';
  let left = parts[0];
  let sourceUrl = left.split('$')[0];
  let tab = left.split('$')[1];
  let source = __ext_config.sources.find(s => s.url === sourceUrl);
  if (!source) return JSON.stringify({ list: [] });

  if (mode === 'series') {
    let content = fetchSource(sourceUrl, source);
    let baseDir = sourceUrl.substring(0, sourceUrl.lastIndexOf('/')+1);
    let parseConfig = source.parseConfig || {};
    let episodes = parseList(content, parseConfig, baseDir);
    if (!episodes.length) return JSON.stringify({ list: [] });
    let playUrl = episodes.map(ep => `${ep.title}$${ep.url}`).join('#');
    let vodName = parseConfig.collectionName || (sourceUrl.split('/').pop().replace(/\.(txt|m3u8?|json)$/i, '') + '合集');
    let vod = {
      vod_id: tid, vod_name: vodName, vod_pic: def_pic,
      type_name: "连续剧", vod_play_from: source.name, vod_play_url: playUrl,
      vod_remarks: `共${episodes.length}集`
    };
    return JSON.stringify({ list: [vod] });
  }

  // 普通模式
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
    let tabs = groups.map((_,i) => i===0 ? source.name+'1' : ` ${i+1} `);
    playUrl = groups.map(g => g.join('#')).join('$$$');
    playFrom = tabs.join('$$$');
  } else {
    playUrl = items.join('#');
    playFrom = source.name;
  }
  let vod = {
    vod_id: tid, vod_name: source.name + '|' + tab, type_name: "直播列表", vod_pic: def_pic,
    vod_content: tid, vod_play_from: playFrom, vod_play_url: playUrl,
    vod_director: tips, vod_remarks: VERSION
  };
  return JSON.stringify({ list: [vod] });
}

// 播放器（未验证返回错误）
function play(flag, id, vipFlags) {
  if (!isAuthorized()) {
    return JSON.stringify({ parse: 0, playUrl: '', url: '', error: '需要密码验证' });
  }
  let parse = 0;
  let finalUrl = id;
  if (__ext_config.global && __ext_config.global.parseUrl) {
    let parseApi = __ext_config.global.parseUrl;
    let parseUrl = parseApi.replace('{url}', encodeURIComponent(id));
    let resp = smartRequest(parseUrl);
    let json = resp.json();
    if (json && json.url) finalUrl = json.url;
    parse = json && json.parse === 1 ? 1 : 0;
  }
  let autoParse = /m3u8|ts|flv/i.test(finalUrl) ? 0 : 1;
  return JSON.stringify({ parse: autoParse, playUrl: '', url: finalUrl });
}

function search(wd, quick) {
  if (!isAuthorized()) return JSON.stringify({ list: [] });
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

export default {
  init, home, homeVod, category, detail, play, search,
  verifyPassword   // 提供手动验证接口
};