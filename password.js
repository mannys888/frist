// ==================== 通用动态爬虫 v34（时间密码 + 系统输入框解锁） ====================
// 密码为当前时间 HHMM（例如 19:22 -> 1922，9:08 -> 0908）
// 解锁后有效期 60 分钟，超时自动锁定
// 使用系统输入框输入密码（电视需支持键盘弹窗）
// ================================================================

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
const VERSION = 'universal v3.4 (time password)';
const tips = `\n${VERSION}`;
const RKEY = 'universal_spider';

// ========== 动态时间密码配置 ==========
const UNLOCK_VALID_MINUTES = 60;  // 解锁有效时长（分钟）

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

function verifyPassword(pwd) {
  return pwd === getCurrentTimePassword();
}

// 弹窗输入密码（如果你的电视支持 prompt）
function promptPassword() {
  if (typeof prompt !== 'undefined') {
    let pwd = prompt("请输入当前时间（四位数字，例如 1922）：", "");
    return pwd;
  }
  return null;
}

// ========== 辅助函数（与原版相同） ==========
function print(any) {
  if (!debugMode) return;
  if (typeof any == 'object' && Object.keys(any).length > 0) {
    try { console.log(JSON.stringify(any)); } catch(e) { console.log(any); }
  } else { console.log(any); }
}
function setItem(k, v) { local.set(RKEY, k, v); print(`设置 ${k} => ${v}`); }
function getItem(k, v) { return local.get(RKEY, k) || v; }

// 智能请求（与原版相同）
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
    try {
      let xml = content;
      let titleRe = /<title>(.*?)<\/title>/g;
      let linkRe = /<link>(.*?)<\/link>/g;
      let titles = [...xml.matchAll(titleRe)].map(m => m[1]);
      let links = [...xml.matchAll(linkRe)].map(m => m[1]);
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

const customHandlers = {
  encryptedSite: function(ctx) {
    let { url, parseConfig } = ctx;
    let encryptedContent = fetchSource(url, parseConfig);
    let decryptedContent = myDecrypt(encryptedContent, parseConfig.key || 'defaultKey');
    let items = parseList(decryptedContent, parseConfig, url);
    return items;
  },
  loginRequired: function(ctx) {
    let { url, parseConfig } = ctx;
    let loginUrl = parseConfig.loginUrl;
    let loginBody = parseConfig.loginBody;
    let loginResp = smartRequest(loginUrl, { method: 'POST', body: loginBody });
    let cookie = loginResp.headers['set-cookie'];
    if (cookie) setItem('site_cookie', cookie);
    let opts = { headers: { 'Cookie': getItem('site_cookie') } };
    let content = fetchSource(url, { ...parseConfig, ...opts });
    let items = parseList(content, parseConfig, url);
    return items;
  },
  dynamicContent: function(ctx) {
    let { url, parseConfig } = ctx;
    let browserService = parseConfig.browserService || 'http://localhost:3000/render';
    let resp = smartRequest(browserService, { method: 'POST', body: JSON.stringify({ url }) });
    let renderedHtml = resp.text();
    let items = parseList(renderedHtml, parseConfig, url);
    return items;
  }
};

function myDecrypt(encrypted, key) {
  let result = '';
  for (let i = 0; i < encrypted.length; i++) {
    result += String.fromCharCode(encrypted.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

// ========== 外部接口 ==========
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

function home(filter) {
  // 每次访问首页时检查是否超时
  if (unlocked) {
    let storedTime = parseInt(getItem('global_unlock_time', '0'));
    if (storedTime && (Date.now() - storedTime) > UNLOCK_VALID_MINUTES * 60 * 1000) {
      setUnlocked(false);
      unlocked = false;
    }
  }
  if (!unlocked) {
    // 未解锁时只显示解锁分类
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
    // 弹出输入框（电视需支持 prompt）
    let pwd = promptPassword();
    if (pwd && verifyPassword(pwd)) {
      setUnlocked(true);
      unlocked = true;
      print("解锁成功");
      // 返回空列表，让前端返回到首页，然后刷新显示分类
      return JSON.stringify({ list: [] });
    } else {
      // 密码错误，重新显示解锁界面（可停留在当前页面并提示错误）
      let errorClass = { type_id: '__UNLOCK__', type_name: '❌ 密码错误，重新点击解锁', icon: '🔒' };
      return JSON.stringify({ class: [errorClass], filters: {} });
    }
  }

  // 以下是原有的 category 逻辑（完全未修改）
  let fl = filter ? extend : {};
  if (fl.show) { showMode = fl.show; setItem('showMode', showMode); }
  if (parseInt(pg) > 1) return JSON.stringify({ list: [] });
  let source = __ext_config.sources.find(s => s.name === tid);
  if (!source) return JSON.stringify({ list: [] });

  if (source.handler && customHandlers[source.handler]) {
    let ctx = { url: source.url, parseConfig: source.parseConfig || {}, extra: { tid, pg, filter, extend } };
    let items = customHandlers[source.handler](ctx);
    let isSeries = source.parseConfig?.mode === 'series';
    if (isSeries) {
      if (!items.length) return JSON.stringify({ list: [] });
      let collectionName = source.parseConfig.collectionName || (source.url.split('/').pop().replace(/\.(txt|m3u8?|json)$/i, '') + '合集');
      let vod_id = source.url + '###series';
      return JSON.stringify({
        list: [{ vod_id, vod_name: collectionName, vod_pic: def_pic, vod_remarks: `📚 共${items.length}集` }],
        page: 1, pagecount: 1, limit: 1, total: items.length
      });
    } else {
      let videos = items.map(item => ({
        vod_id: item.url + '###single',
        vod_name: item.title,
        vod_pic: def_pic,
        vod_remarks: '特殊站点'
      }));
      return JSON.stringify({ list: videos, page: 1, pagecount: 1, limit: videos.length, total: videos.length });
    }
  }

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
  // 原版 detail 逻辑（未修改）
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
    let playUrl = items.map(ep => `${ep.title}$${ep.url}`).join('#');
    let vodName = source.parseConfig.collectionName || (sourceUrl.split('/').pop().replace(/\.(txt|m3u8?|json)$/i, '') + '合集');
    let vod = {
      vod_id: tid, vod_name: vodName, vod_pic: def_pic,
      type_name: "连续剧", vod_play_from: source.name, vod_play_url: playUrl,
      vod_remarks: `共${items.length}集`
    };
    return JSON.stringify({ list: [vod] });
  }

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

function play(flag, id, vipFlags) {
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

export default { init, home, homeVod, category, detail, play, search };