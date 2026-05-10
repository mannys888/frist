// ==================== 通用动态爬虫 v40_fix（合集模式+密码验证） ====================
// 功能：
//   - 支持数据源文件中 #genre# 标记密码分类（vip_密码,#genre#）
//   - 支持普通分类（无密码标记）
//   - 支持合集模式（series）和普通分组模式
//   - 密码分类独立解锁，弹窗验证（若环境不支持，可外部调用 verifyCategoryPassword）
//   - 详细修复合集模式：确保显示一个条目，详情页生成 # 分隔的播放列表
// ================================================================

// ---------- 基础配置 ----------
let __ext_config = { sources: [], global: {} };
let cache_data = {};
let showMode = 'groups';
let groupDict = {};
let debugMode = true;
let defaultTimeout = 8000;
let defaultRetry = 2;
let def_pic = 'https://avatars.githubusercontent.com/u/97389433?s=120&v=4';
const VERSION = 'universal v4.0 (series fixed)';
const tips = `\n${VERSION}`;
const RKEY = 'universal_spider';

function print(any) {
  if (!debugMode) return;
  if (typeof any == 'object' && Object.keys(any).length > 0) {
    try { console.log(JSON.stringify(any)); } catch(e) { console.log(any); }
  } else { console.log(any); }
}
function setItem(k, v) { local.set(RKEY, k, v); print(`设置 ${k} => ${v}`); }
function getItem(k, v) { return local.get(RKEY, k) || v; }

// ---------- 分类密码管理 ----------
let categoryPasswords = {};
function isCategoryUnlocked(categoryName) {
  return getItem(`unlock_${categoryName}`, 'false') === 'true';
}
function setCategoryUnlocked(categoryName, unlocked) {
  setItem(`unlock_${categoryName}`, unlocked ? 'true' : 'false');
}
function verifyCategoryPassword(categoryName, pwd) {
  let expected = categoryPasswords[categoryName];
  if (!expected) return false;
  if (pwd === expected) {
    setCategoryUnlocked(categoryName, true);
    print(`分类 ${categoryName} 解锁成功`);
    return true;
  }
  print(`分类 ${categoryName} 密码错误`);
  return false;
}
function tryPromptForCategory(categoryName) {
  if (typeof prompt !== 'undefined') {
    let pwd = prompt(`请输入分类“${categoryName}”的密码：`, "");
    if (pwd !== null) return verifyCategoryPassword(categoryName, pwd);
  }
  return false;
}

// ---------- 网络请求 ----------
function smartRequest(url, options = {}) {
  let method = options.method || 'GET';
  let headers = { 'User-Agent': 'Mozilla/5.0', ...(options.headers || {}) };
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
    // 简单 M3U 转换（如果需要）
  }
  if (!noCache) cache_data[url] = content;
  return content;
}

// ---------- 解析普通条目 ----------
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
    } catch(e) { print("JSON解析错误"); }
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
      if (!line || line.startsWith('#') || line.includes('#genre#')) continue;
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

// ---------- 解析源文件，提取分类结构和条目 ----------
function parseSourceStructure(content, sourceUrl, sourceName) {
  let lines = content.split(/\r?\n/);
  let categories = [];      // 每个元素 { name, rawName, password, startLine, endLine }
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (line.includes('#genre#')) {
      if (current) {
        current.endLine = i - 1;
        categories.push(current);
        current = null;
      }
      let parts = line.split(',');
      let rawName = parts[0];
      let password = null;
      let displayName = rawName;
      if (rawName.startsWith('vip_')) {
        password = rawName.substring(4);
        displayName = `🔒 ${rawName}`;
      }
      current = {
        name: displayName,
        rawName: rawName,
        password: password,
        startLine: i + 1,
        endLine: -1,
        sourceUrl: sourceUrl
      };
      if (password) categoryPasswords[displayName] = password;
    }
  }
  if (current) {
    current.endLine = lines.length - 1;
    categories.push(current);
  }
  return { categories, totalLines: lines.length };
}

let sourceStructureCache = {};

// ---------- 初始化 ----------
function init(ext) {
  print(`初始化 ${VERSION}`);
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
  // 预解析所有源的结构
  for (let src of __ext_config.sources) {
    let content = fetchSource(src.url, src);
    let structure = parseSourceStructure(content, src.url, src.name);
    sourceStructureCache[src.url] = structure;
  }
  print(`加载 ${__ext_config.sources.length} 个源`);
}

// ---------- 首页 ----------
function home(filter) {
  let classes = [];
  for (let src of __ext_config.sources) {
    let structure = sourceStructureCache[src.url];
    if (structure.categories.length) {
      for (let cat of structure.categories) {
        classes.push({
          type_id: `${src.url}###${cat.name}`,
          type_name: cat.name,
          icon: cat.password ? '🔒' : ''
        });
      }
    } else {
      // 无分类的源，整个源作为一个分类
      classes.push({
        type_id: src.name,
        type_name: src.name,
        icon: ''
      });
    }
  }
  let filters = [{ key: 'show', name: '播放展示', value: [{ n: '多线路分组', v: 'groups' }, { n: '单线路', v: 'all' }] }];
  let filterDict = {};
  classes.forEach(c => { filterDict[c.type_id] = filters; });
  return JSON.stringify({ class: classes, filters: filterDict });
}
function homeVod() { return JSON.stringify({ list: [] }); }

// ---------- 分类内容 ----------
function category(tid, pg, filter, extend) {
  pg = parseInt(pg) || 1;
  if (pg > 1) return JSON.stringify({ list: [] });

  // 解析 tid
  let isProtected = tid.includes('###');
  let sourceUrl = null;
  let categoryName = null;
  if (isProtected) {
    let parts = tid.split('###');
    sourceUrl = parts[0];
    categoryName = parts[1];
  } else {
    let source = __ext_config.sources.find(s => s.name === tid);
    if (!source) return JSON.stringify({ list: [] });
    sourceUrl = source.url;
    categoryName = null;
  }

  let source = __ext_config.sources.find(s => s.url === sourceUrl);
  if (!source) return JSON.stringify({ list: [] });
  let parseConfig = source.parseConfig || {};
  let isSeries = parseConfig.mode === 'series';

  // 密码验证
  if (categoryName && categoryPasswords[categoryName] && !isCategoryUnlocked(categoryName)) {
    let success = tryPromptForCategory(categoryName);
    if (!success) {
      return JSON.stringify({ list: [], page: 1, pagecount: 1, limit: 0, total: 0 });
    }
  }

  // 获取该分类对应的内容行
  let content = fetchSource(sourceUrl, source);
  let lines = content.split(/\r?\n/);
  let baseDir = sourceUrl.substring(0, sourceUrl.lastIndexOf('/') + 1);
  let structure = sourceStructureCache[sourceUrl];

  let startLine = 0, endLine = lines.length - 1;
  if (categoryName) {
    let cat = structure.categories.find(c => c.name === categoryName);
    if (cat) {
      startLine = cat.startLine;
      endLine = cat.endLine;
    }
  } else {
    // 普通分类（无密码标记）：取文件开头到第一个分类之前，或整个文件
    if (structure.categories.length) {
      endLine = structure.categories[0].startLine - 1;
    }
  }

  let categoryContent = lines.slice(startLine, endLine + 1).join('\n');
  let items = parseList(categoryContent, parseConfig, baseDir);

  // 合集模式：返回单个条目
  if (isSeries) {
    if (!items.length) return JSON.stringify({ list: [] });
    let collectionName = parseConfig.collectionName || (categoryName || source.name);
    let vod_id = `${sourceUrl}###${categoryName || source.name}###series`;
    return JSON.stringify({
      list: [{ vod_id, vod_name: collectionName, vod_pic: def_pic, vod_remarks: `📚 共${items.length}集` }],
      page: 1, pagecount: 1, limit: 1, total: items.length
    });
  }

  // 普通模式：每个条目作为一个视频（不分组）
  let videos = items.map(item => ({
    vod_id: `${item.url}###single`,
    vod_name: item.title,
    vod_pic: def_pic,
    vod_remarks: ''
  }));
  return JSON.stringify({ list: videos, page: 1, pagecount: 1, limit: videos.length, total: videos.length });
}

// ---------- 详情 ----------
function detail(tid) {
  let parts = tid.split('###');
  let mode = parts.length > 1 ? parts[1] : 'single';
  if (mode === 'series') {
    // 合集模式：需要 sourceUrl, categoryName
    if (parts.length < 3) return JSON.stringify({ list: [] });
    let sourceUrl = parts[0];
    let categoryName = parts[1];
    let source = __ext_config.sources.find(s => s.url === sourceUrl);
    if (!source) return JSON.stringify({ list: [] });
    let content = fetchSource(sourceUrl, source);
    let lines = content.split(/\r?\n/);
    let baseDir = sourceUrl.substring(0, sourceUrl.lastIndexOf('/') + 1);
    let structure = sourceStructureCache[sourceUrl];
    let cat = structure.categories.find(c => c.name === categoryName);
    if (!cat) return JSON.stringify({ list: [] });
    let categoryContent = lines.slice(cat.startLine, cat.endLine + 1).join('\n');
    let items = parseList(categoryContent, source.parseConfig || {}, baseDir);
    if (!items.length) return JSON.stringify({ list: [] });
    let playUrl = items.map(item => `${item.title}$${item.url}`).join('#');
    let vodName = source.parseConfig?.collectionName || (categoryName || source.name);
    let vod = {
      vod_id: tid,
      vod_name: vodName,
      vod_pic: def_pic,
      type_name: "合集",
      vod_play_from: source.name,
      vod_play_url: playUrl,
      vod_remarks: `共${items.length}集`
    };
    return JSON.stringify({ list: [vod] });
  } else {
    // 单文件
    let url = parts[0];
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
}

function play(flag, id, vipFlags) {
  let parse = /m3u8|ts|flv/i.test(id) ? 0 : 1;
  return JSON.stringify({ parse, playUrl: '', url: id });
}

function search(wd, quick) {
  return JSON.stringify({ list: [] });
}

export default {
  init, home, homeVod, category, detail, play, search,
  verifyCategoryPassword
};