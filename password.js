// ==================== 通用动态爬虫 v42（自稳定 + 手机解锁） ====================
// 特点：
//   - 如果 ext 无效，自动使用内置测试分类，确保首页绝不空白
//   - 手机解锁基于 jsonblob.com，零配置
//   - 解锁后显示正常分类（内置测试数据，或用户提供的 ext 数据）
// ============================================================================

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
const VERSION = 'universal v4.2 (self-stable)';
const tips = `\n${VERSION}`;
const RKEY = 'universal_spider';
const PASSWORD = 'admin';   // 可修改密码

// ---------- 辅助函数 ----------
function print(any) {
  if (!debugMode) return;
  if (typeof any == 'object' && Object.keys(any).length > 0) {
    try { console.log(JSON.stringify(any)); } catch(e) { console.log(any); }
  } else { console.log(any); }
}
function setItem(k, v) { local.set(RKEY, k, v); print(`设置 ${k} => ${v}`); }
function getItem(k, v) { return local.get(RKEY, k) || v; }

// ---------- 手机解锁相关 ----------
let isUnlocked = false;
let pollInterval = null;
let readUrl = null;
let writeUrl = null;

// 使用 jsonblob.com 创建临时 JSON
function createJsonBlob() {
  let createUrl = 'https://jsonblob.com/api/jsonBlob';
  let data = { password: '' };
  let resp = smartRequest(createUrl, {
    method: 'POST',
    body: JSON.stringify(data),
    headers: { 'Content-Type': 'application/json' }
  });
  if (resp.status === 201 || resp.status === 200) {
    let location = resp.headers['location'];
    if (location) {
      readUrl = location;
      writeUrl = location + '/edit';
      return true;
    }
  }
  print("创建临时 JSON 失败，将使用备用方案（直接解锁）");
  // 备用：如果创建失败，直接解锁（避免卡死）
  setItem('global_unlock', 'true');
  isUnlocked = true;
  return true;
}

function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(() => {
    if (!readUrl) return;
    let resp = smartRequest(readUrl);
    let json = resp.json();
    if (json && json.password === PASSWORD) {
      clearInterval(pollInterval);
      setItem('global_unlock', 'true');
      isUnlocked = true;
      print("手机解锁成功！请返回首页刷新。");
    }
  }, 3000);
}

// ---------- 网络请求 ----------
function smartRequest(url, options = {}) {
  let method = options.method || 'GET';
  let headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', ...(options.headers || {}) };
  if (!headers['Referer']) {
    let match = url.match(/^(https?:\/\/[^/]+)/);
    if (match) headers['Referer'] = match[1] + '/';
  }
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
      res.status = res.statusCode || 200;
      res.headers = res.headers || {};
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
  if (!sourceConfig.type && content && content.includes('#EXTM3U')) {
    content = convertM3uToNormal(content);
  }
  if (!noCache) cache_data[url] = content;
  return content;
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

function parseList(content, parseConfig, baseUrl) {
  let items = [];
  if (!content) return items;
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
    } catch(e) { print("JSON解析错误"); }
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

// ---------- 内置测试数据（保证永远有分类） ----------
function getBuiltinSources() {
  return [
    {
      name: "📺 测试直播",
      url: "https://raw.githubusercontent.com/xxx/test_live.txt", // 注意：实际不存在，但会触发错误后使用内置 fallback
      parseConfig: { mode: "series", line_sep: "," }
    }
  ];
}
// 内置 fallback 条目（实在无法获取时显示）
function getFallbackItems() {
  return [
    { title: "测试视频1", url: "https://test.com/1.mp4" },
    { title: "测试视频2", url: "https://test.com/2.mp4" }
  ];
}

// ---------- 外部接口 ----------
function init(ext) {
  print(`初始化 ${VERSION}`);
  let configData = null;
  // 解析 ext（兼容多种格式）
  if (typeof ext === 'object') {
    configData = ext;
  } else if (typeof ext === 'string') {
    if (ext.startsWith('http')) {
      let resp = smartRequest(ext);
      if (resp) configData = resp.json();
    } else {
      try { configData = JSON.parse(ext); } catch(e) { print("ext 不是有效 JSON，将使用内置分类"); configData = null; }
    }
  }
  if (configData) {
    if (Array.isArray(configData) && configData[0]?.name && configData[0]?.url) {
      __ext_config.sources = configData;
    } else if (configData.sources && Array.isArray(configData.sources)) {
      __ext_config.sources = configData.sources;
    } else {
      __ext_config.sources = getBuiltinSources();
    }
  } else {
    __ext_config.sources = getBuiltinSources();
  }
  // global 配置
  if (configData && configData.global) {
    __ext_config.global = configData.global;
    if (__ext_config.global.defaultPic) def_pic = __ext_config.global.defaultPic;
    if (__ext_config.global.defaultTimeout) defaultTimeout = __ext_config.global.defaultTimeout;
    if (__ext_config.global.debug !== undefined) debugMode = __ext_config.global.debug;
  }
  showMode = getItem('showMode', 'groups');
  groupDict = JSON.parse(getItem('groupDict', '{}'));
  print(`有效分类数量: ${__ext_config.sources.length}`);

  // 手机解锁初始化
  isUnlocked = getItem('global_unlock', 'false') === 'true';
  if (!isUnlocked) {
    if (createJsonBlob()) {
      print(`手机解锁链接: ${writeUrl}`);
      startPolling();
    } else {
      print("创建临时 JSON 失败，已自动解锁");
    }
  }
}

function home(filter) {
  if (!isUnlocked) {
    let unlockClass = {
      type_id: '__UNLOCK__',
      type_name: `🔓 手机解锁 (点击进入)`,
      icon: '📱'
    };
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
  if (!isUnlocked) {
    if (tid === '__UNLOCK__') {
      let vod = {
        vod_id: 'unlock_tip',
        vod_name: `📱 手机浏览器打开以下链接\n${writeUrl || '创建失败，请查看日志'}\n将 JSON 内容改为 {"password": "${PASSWORD}"}`,
        vod_pic: def_pic,
        vod_remarks: '修改后等待几秒，返回首页刷新即可'
      };
      return JSON.stringify({ list: [vod], page: 1, pagecount: 1, limit: 1, total: 1 });
    }
    return JSON.stringify({ list: [], page: 1, pagecount: 0, total: 0 });
  }

  let fl = filter ? extend : {};
  if (fl.show) { showMode = fl.show; setItem('showMode', showMode); }
  if (parseInt(pg) > 1) return JSON.stringify({ list: [] });
  let source = __ext_config.sources.find(s => s.name === tid);
  if (!source) return JSON.stringify({ list: [] });

  let isSeries = source.parseConfig?.mode === 'series';
  let content = fetchSource(source.url, source);
  let baseDir = source.url.substring(0, source.url.lastIndexOf('/')+1);
  let items = [];
  if (content) {
    items = parseList(content, source.parseConfig || {}, baseDir);
  }
  // 如果解析失败（例如 URL 不存在），使用内置 fallback 数据
  if (!items.length && tid === "📺 测试直播") {
    items = getFallbackItems();
  }
  if (isSeries) {
    if (!items.length) return JSON.stringify({ list: [] });
    let collectionName = source.parseConfig?.collectionName || (source.url.split('/').pop().replace(/\.(txt|m3u8?|json)$/i, '') + '合集');
    let vod_id = source.url + '###series';
    return JSON.stringify({
      list: [{ vod_id, vod_name: collectionName, vod_pic: def_pic, vod_remarks: `📚 共${items.length}集` }],
      page: 1, pagecount: 1, limit: 1, total: items.length
    });
  }

  let videos = items.map(item => ({
    vod_id: `${item.url}###single`,
    vod_name: item.title,
    vod_pic: def_pic,
    vod_remarks: ''
  }));
  return JSON.stringify({ list: videos, page: 1, pagecount: 1, limit: videos.length, total: videos.length });
}

function detail(tid) {
  if (!isUnlocked) return JSON.stringify({ list: [] });
  let parts = tid.split('###');
  if (parts.length < 2) return JSON.stringify({ list: [] });
  let mode = parts.length > 1 ? parts[1] : 'single';
  let left = parts[0];

  if (mode === 'series') {
    let sourceUrl = left;
    // 寻找源配置（简化：直接使用 sourceUrl 作为标识）
    let source = __ext_config.sources.find(s => s.url === sourceUrl);
    if (!source) return JSON.stringify({ list: [] });
    let content = fetchSource(sourceUrl, source);
    let baseDir = sourceUrl.substring(0, sourceUrl.lastIndexOf('/')+1);
    let episodes = parseList(content, source.parseConfig || {}, baseDir);
    if (!episodes.length && source.name === "📺 测试直播") episodes = getFallbackItems();
    if (!episodes.length) return JSON.stringify({ list: [] });
    let playUrl = episodes.map(ep => `${ep.title}$${ep.url}`).join('#');
    let vodName = source.parseConfig?.collectionName || (sourceUrl.split('/').pop().replace(/\.(txt|m3u8?|json)$/i, '') + '合集');
    let vod = {
      vod_id: tid, vod_name: vodName, vod_pic: def_pic,
      type_name: "连续剧", vod_play_from: source.name, vod_play_url: playUrl,
      vod_remarks: `共${episodes.length}集`
    };
    return JSON.stringify({ list: [vod] });
  }

  let url = left;
  let title = decodeURIComponent(url.split('/').pop().split('.')[0] || "媒体");
  let vod = {
    vod_id: url,
    vod_name: title,
    vod_pic: def_pic,
    vod_play_from: "播放源",
    vod_play_url: "播放$" + url
  };
  return JSON.stringify({ list: [vod] });
}

function play(flag, id, vipFlags) {
  if (!isUnlocked) return JSON.stringify({ parse: 0, url: '', error: '未解锁' });
  let parse = /m3u8|ts|flv/i.test(id) ? 0 : 1;
  return JSON.stringify({ parse, playUrl: '', url: id });
}

function search(wd, quick) {
  if (!isUnlocked) return JSON.stringify({ list: [] });
  let results = [];
  for (let src of __ext_config.sources) {
    let content = fetchSource(src.url, src);
    let baseDir = src.url.substring(0, src.url.lastIndexOf('/')+1);
    let items = parseList(content, src.parseConfig || {}, baseDir);
    if (!items.length && src.name === "📺 测试直播") items = getFallbackItems();
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
  init, home, homeVod, category, detail, play, search
};