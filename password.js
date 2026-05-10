// ==================== 通用动态爬虫 v43（密码轮询版） ====================
// 数据文件: 支持 #genre# 分类，支持 vip_xxx,#genre# 密码分类
// 解锁方式: 全局配置中设置 passwordPollUrl，爬虫会轮询该 URL，若返回的密码匹配则解锁
// 您可以用手机访问该 URL 的编辑页面，动态修改密码值
// ================================================================

let __ext_config = { sources: [], global: {} };
let cache_data = {};
let debugMode = true;
let defaultTimeout = 8000;
let def_pic = 'https://avatars.githubusercontent.com/u/97389433?s=120&v=4';
const VERSION = 'universal v4.3 (password poll)';

function print(any) {
  if (!debugMode) return;
  console.log(typeof any === 'object' ? JSON.stringify(any) : any);
}
function setItem(k, v) { local.set('spider', k, v); }
function getItem(k, v) { return local.get('spider', k) || v; }

function smartRequest(url, options = {}) {
  let method = options.method || 'GET';
  let headers = { 'User-Agent': 'Mozilla/5.0', ...(options.headers || {}) };
  let reqOptions = { method, headers, timeout: options.timeout || defaultTimeout };
  if (options.body) reqOptions.body = options.body;
  try {
    let res = req(url, reqOptions);
    res.json = () => res.content ? JSON.parse(res.content) : null;
    res.text = () => res.content || '';
    return res;
  } catch(e) {
    print(`请求失败: ${url} - ${e.message}`);
    return { json: () => null, text: () => '' };
  }
}
function fetchSource(url) {
  if (cache_data[url]) return cache_data[url];
  let resp = smartRequest(url);
  let content = resp.text();
  cache_data[url] = content;
  return content;
}

// 密码管理
let categoryPasswords = {};
let pollInterval = null;
let passwordPollUrl = null;

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
  return false;
}
function unlockAll(password) {
  let anySuccess = false;
  for (let catName in categoryPasswords) {
    if (verifyCategoryPassword(catName, password)) anySuccess = true;
  }
  return anySuccess;
}

// 轮询获取密码
function startPasswordPolling() {
  if (!passwordPollUrl) return;
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(() => {
    let resp = smartRequest(passwordPollUrl);
    let data = resp.json();
    if (data && data.password) {
      let pwd = data.password;
      if (pwd) {
        unlockAll(pwd);
        // 验证成功后可以停止轮询（可选）
        // clearInterval(pollInterval);
      }
    } else if (typeof data === 'string') {
      unlockAll(data.trim());
    }
  }, 5000); // 每5秒轮询一次
}

// 解析分类
function parseCategories(content) {
  let lines = content.split(/\r?\n/);
  let categories = [];
  let current = null;
  let i = 0;
  while (i < lines.length) {
    let line = lines[i].trim();
    if (line.includes('#genre#')) {
      if (current) {
        current.endLine = i - 1;
        categories.push(current);
        current = null;
      }
      let rawName = line.split(',')[0];
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
        endLine: -1
      };
      if (password) categoryPasswords[displayName] = password;
      i++;
      continue;
    }
    i++;
  }
  if (current) {
    current.endLine = lines.length - 1;
    categories.push(current);
  }
  return categories;
}

function parseItems(content, parseConfig, baseUrl) {
  let items = [];
  let lines = content.split(/\r?\n/);
  let sep = parseConfig?.line_sep || ',';
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#') || line.includes('#genre#')) continue;
    let idx = line.indexOf(sep);
    if (idx > 0) {
      let title = line.substring(0, idx).trim();
      let url = line.substring(idx + 1).trim();
      if (url && (url.startsWith('http') || url.startsWith('/'))) {
        if (!url.startsWith('http')) url = baseUrl + url;
        items.push({ title, url });
      }
    } else if (line.startsWith('http')) {
      items.push({ title: "媒体文件", url: line });
    }
  }
  return items;
}

let sourceStructure = {};

function init(ext) {
  print(`初始化 ${VERSION}`);
  let configData = null;
  if (typeof ext === 'string' && ext.startsWith('http')) {
    let resp = smartRequest(ext);
    configData = resp.json();
  } else if (typeof ext === 'object') {
    configData = ext;
  }
  if (configData) {
    if (Array.isArray(configData)) __ext_config.sources = configData;
    else if (configData.sources) __ext_config = configData;
    if (configData.global) {
      if (configData.global.defaultPic) def_pic = configData.global.defaultPic;
      if (configData.global.debug !== undefined) debugMode = configData.global.debug;
      passwordPollUrl = configData.global.passwordPollUrl;
    }
  }
  for (let src of __ext_config.sources) {
    let content = fetchSource(src.url);
    let categories = parseCategories(content);
    sourceStructure[src.url] = { categories, content };
  }
  // 启动密码轮询
  if (passwordPollUrl) startPasswordPolling();
  print(`加载 ${__ext_config.sources.length} 个源，密码轮询地址: ${passwordPollUrl}`);
}

function home(filter) {
  let classes = [];
  for (let src of __ext_config.sources) {
    let cats = sourceStructure[src.url]?.categories || [];
    if (cats.length) {
      for (let cat of cats) {
        classes.push({
          type_id: `${src.url}###${cat.name}`,
          type_name: cat.name,
          icon: cat.password ? '🔒' : '📁'
        });
      }
    } else {
      classes.push({
        type_id: src.name,
        type_name: src.name,
        icon: '📁'
      });
    }
  }
  return JSON.stringify({ class: classes, filters: {} });
}
function homeVod() { return JSON.stringify({ list: [] }); }

function category(tid, pg, filter, extend) {
  if (parseInt(pg) > 1) return JSON.stringify({ list: [] });
  let parts = tid.split('###');
  let sourceUrl, categoryName;
  if (parts.length === 2) {
    sourceUrl = parts[0];
    categoryName = parts[1];
  } else {
    let source = __ext_config.sources.find(s => s.name === tid);
    if (!source) return JSON.stringify({ list: [] });
    sourceUrl = source.url;
    categoryName = null;
  }
  let src = __ext_config.sources.find(s => s.url === sourceUrl);
  if (!src) return JSON.stringify({ list: [] });
  let structure = sourceStructure[sourceUrl];
  if (!structure) return JSON.stringify({ list: [] });

  let catObj = (categoryName && structure.categories.find(c => c.name === categoryName)) || null;
  if (catObj && catObj.password && !isCategoryUnlocked(categoryName)) {
    print(`分类 ${categoryName} 需要密码，尚未解锁`);
    return JSON.stringify({ list: [], page: 1, pagecount: 1, limit: 0, total: 0 });
  }

  let baseDir = sourceUrl.substring(0, sourceUrl.lastIndexOf('/') + 1);
  let lines = structure.content.split(/\r?\n/);
  let startLine = 0, endLine = lines.length - 1;
  if (categoryName) {
    let cat = structure.categories.find(c => c.name === categoryName);
    if (cat) {
      startLine = cat.startLine;
      endLine = cat.endLine;
    }
  } else {
    if (structure.categories.length) endLine = structure.categories[0].startLine - 1;
  }
  let categoryContent = lines.slice(startLine, endLine + 1).join('\n');
  let items = parseItems(categoryContent, src.parseConfig, baseDir);
  let videos = items.map(item => ({
    vod_id: `${item.url}###single`,
    vod_name: item.title,
    vod_pic: def_pic,
    vod_remarks: ''
  }));
  return JSON.stringify({ list: videos, page: 1, pagecount: 1, limit: videos.length, total: videos.length });
}

function detail(tid) {
  let parts = tid.split('###');
  if (parts.length < 2) return JSON.stringify({ list: [] });
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
function play(flag, id, vipFlags) {
  let parse = /m3u8|ts|flv/i.test(id) ? 0 : 1;
  return JSON.stringify({ parse, playUrl: '', url: id });
}
function search(wd, quick) {
  return JSON.stringify({ list: [] });
}

export default { init, home, homeVod, category, detail, play, search, unlockAll };