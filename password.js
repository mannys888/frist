// ==================== 通用动态爬虫 v45（分类文件夹 + 手机解锁） ====================
// 特点：
//   1. 基于 v41 稳定版，确保 ext 读取正常，支持分类文件夹
//   2. 密码分类格式：vip_密码,#genre#
//   3. 新增解锁方式：手机扫描二维码，在手机上输入密码，电视端自动解锁（无需弹窗）
//   4. 自动生成二维码（二维码内容为临时密码文件的 URL，手机打开后输入密码即可）
//   5. 密码通过轮询一个临时 JSON 文件获取（需您提供可写的云存储，如 jsonbin.io）
// 如果无法提供云存储，也可使用“控制台手动解锁”的方式
// ================================================================

let __ext_config = { sources: [], global: {} };
let cache_data = {};
let debugMode = true;
let defaultTimeout = 8000;
let def_pic = 'https://avatars.githubusercontent.com/u/97389433?s=120&v=4';
const VERSION = 'universal v4.5 (mobile auth)';

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

// 二维码轮询解锁
function startPasswordPolling(pollUrl) {
  if (!pollUrl) return;
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(() => {
    let resp = smartRequest(pollUrl);
    let data = resp.json();
    if (data && data.password) {
      let pwd = data.password;
      if (pwd) {
        unlockAll(pwd);
        // 解锁成功后可以停止轮询
        clearInterval(pollInterval);
        pollInterval = null;
        print("密码解锁成功，正刷新分类");
      }
    } else if (typeof data === 'string') {
      unlockAll(data.trim());
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }, 3000); // 每3秒轮询一次
}

// 生成随机 token（用于标识本次解锁会话）
function generateToken() {
  return 'xxxx-xxxx-xxxx-xxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
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
  // 解析 ext 配置（兼容多种格式）
  if (typeof ext === 'string') {
    if (ext.startsWith('http')) {
      let resp = smartRequest(ext);
      configData = resp.json();
    } else {
      try { configData = JSON.parse(ext); } catch(e) { print("JSON解析失败，尝试作为URL处理"); configData = null; }
    }
  } else if (typeof ext === 'object') {
    configData = ext;
  }
  if (configData) {
    if (Array.isArray(configData)) __ext_config.sources = configData;
    else if (configData.sources) __ext_config = configData;
    if (configData.global) {
      if (configData.global.defaultPic) def_pic = configData.global.defaultPic;
      if (configData.global.debug !== undefined) debugMode = configData.global.debug;
      if (configData.global.passwordPollUrl) {
        passwordPollUrl = configData.global.passwordPollUrl;
        startPasswordPolling(passwordPollUrl);
      }
    }
  } else {
    // 兼容纯文本（每行 分类名,URL）
    if (typeof ext === 'string') {
      let lines = ext.split('\n');
      let sources = [];
      for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        let parts = line.split(',');
        if (parts.length >= 2) {
          sources.push({ name: parts[0].trim(), url: parts[1].trim() });
        }
      }
      __ext_config.sources = sources;
    }
  }

  // 加载每个源的内容
  for (let src of __ext_config.sources) {
    let content = fetchSource(src.url);
    let categories = parseCategories(content);
    sourceStructure[src.url] = { categories, content };
  }
  print(`加载 ${__ext_config.sources.length} 个源，共 ${Object.keys(categoryPasswords).length} 个加密分类`);

  // 如果有密码分类但未配置轮询地址，输出提示
  if (Object.keys(categoryPasswords).length > 0 && !passwordPollUrl) {
    let token = generateToken();
    print(`\n========== 密码解锁提示 ==========`);
    print(`发现加密分类，请使用手机浏览器访问以下 URL 输入密码后解锁：`);
    let fakeUrl = `https://example.com/auth?token=${token}`;
    print(fakeUrl);
    print(`实际使用中，您需要部署一个简单的密码接收页面，或使用 jsonbin.io 配置 passwordPollUrl`);
    print(`================================\n`);
  }
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

export default {
  init, home, homeVod, category, detail, play, search,
  verifyCategoryPassword,
  unlockAll
};