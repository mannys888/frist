// ==================== 通用动态爬虫 v39（分类级密码验证） ====================
// 功能：
//   - 支持普通线路、合集模式、多格式解析、全局搜索
//   - 数据源文件中使用 "#genre#" 标记密码分类，格式："vip_密码,#genre#"
//   - 例如："vip_001,#genre#" 表示该分类密码为 "001"
//   - 用户点击分类时弹窗输入密码，验证通过后才能加载该分类内容
//   - 验证状态按分类独立保存
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
const VERSION = 'universal v3.9 (category password)';
const tips = `\n${VERSION}`;
const RKEY = 'universal_spider';

// ---------- 辅助函数 ----------
function print(any) {
  if (!debugMode) return;
  if (typeof any == 'object' && Object.keys(any).length > 0) {
    try { console.log(JSON.stringify(any)); } catch(e) { console.log(any); }
  } else { console.log(any); }
}
function setItem(k, v) { local.set(RKEY, k, v); print(`设置 ${k} => ${v}`); }
function getItem(k, v) { return local.get(RKEY, k) || v; }

// ---------- 分类密码管理 ----------
// 存储每个分类的密码哈希（key: 分类名, value: 密码）
let categoryPasswords = {};

// 检查某分类是否已被解锁
function isCategoryUnlocked(categoryName) {
  return getItem(`unlock_${categoryName}`, 'false') === 'true';
}
function setCategoryUnlocked(categoryName, unlocked) {
  setItem(`unlock_${categoryName}`, unlocked ? 'true' : 'false');
}

// 验证某分类的密码
function verifyCategoryPassword(categoryName, pwd) {
  let expected = categoryPasswords[categoryName];
  if (!expected) return false; // 该分类无密码，无需验证
  if (pwd === expected) {
    setCategoryUnlocked(categoryName, true);
    print(`分类 ${categoryName} 解锁成功`);
    return true;
  }
  print(`分类 ${categoryName} 密码错误`);
  return false;
}

// 尝试弹窗输入密码（如果环境支持）
function tryPromptForCategory(categoryName) {
  if (typeof prompt !== 'undefined') {
    let pwd = prompt(`请输入分类“${categoryName}”的密码：`, "");
    if (pwd !== null) {
      return verifyCategoryPassword(categoryName, pwd);
    }
  }
  return false;
}

// ---------- 解析源文件，提取分类和条目 ----------
// 输入：源文件URL、parseConfig、源文件内容
// 输出：{ categories: [{ name, password, lines }], 普通条目列表 }
function parseSourceWithPassword(content, baseUrl, sourceName) {
  let lines = content.split(/\r?\n/);
  let result = {
    categories: [],      // 分类信息 { name, password, startLineIdx, endLineIdx }
    plainItems: []       // 不属于任何密码分类的普通条目
  };
  let currentCategory = null;
  let categoryStart = -1;
  let i = 0;
  while (i < lines.length) {
    let line = lines[i].trim();
    // 检测密码行格式：xxx,#genre#
    if (line.includes('#genre#')) {
      // 如果之前有未闭合的分类，先闭合
      if (currentCategory) {
        currentCategory.endLineIdx = i - 1;
        result.categories.push(currentCategory);
        currentCategory = null;
      }
      // 解析新分类
      let parts = line.split(',');
      let namePart = parts[0]; // 例如 "vip_001"
      let password = null;
      let categoryName = namePart;
      if (namePart.startsWith('vip_')) {
        password = namePart.substring(4); // 提取 "001"
        categoryName = `🔒 ${namePart}`;   // 前端显示带锁图标
      }
      currentCategory = {
        name: categoryName,
        rawName: namePart,
        password: password,
        startLineIdx: i + 1,
        endLineIdx: -1,
        sourceUrl: baseUrl,
        sourceName: sourceName
      };
      i++;
      continue;
    }
    // 如果在分类内部
    if (currentCategory) {
      // 分类内容解析暂时跳过，实际内容会在 category 函数中单独解析
      i++;
      continue;
    }
    // 普通行（无分类）
    i++;
  }
  if (currentCategory) {
    currentCategory.endLineIdx = lines.length - 1;
    result.categories.push(currentCategory);
  }
  return result;
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
      // 跳过密码行
      if (line.includes('#genre#')) continue;
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
let sourceParsedCache = {}; // 缓存每个源的解析结果（分类信息）

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
  print(`加载 ${__ext_config.sources.length} 个源配置`);

  // 预解析所有源，提取密码分类信息
  for (let src of __ext_config.sources) {
    let content = fetchSource(src.url, src);
    let baseDir = src.url.substring(0, src.url.lastIndexOf('/')+1);
    let parsed = parseSourceWithPassword(content, baseDir, src.name);
    sourceParsedCache[src.url] = parsed;
    // 记录密码映射
    for (let cat of parsed.categories) {
      if (cat.password) {
        categoryPasswords[cat.name] = cat.password;
        print(`发现密码分类: ${cat.name} (密码: ${cat.password})`);
      }
    }
  }
}

function home(filter) {
  // 构建分类列表：来自所有源的分类 + 普通未分类的源（如果是 series 模式则作为单独分类）
  let classes = [];
  for (let src of __ext_config.sources) {
    let parsed = sourceParsedCache[src.url];
    if (parsed && parsed.categories.length) {
      for (let cat of parsed.categories) {
        classes.push({
          type_id: `${src.url}###${cat.name}`,
          type_name: cat.name,
          icon: cat.password ? '🔒' : ''
        });
      }
    } else {
      // 没有分类的源视为普通分类（直接使用源名称）
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

function category(tid, pg, filter, extend) {
  pg = parseInt(pg) || 1;
  if (pg > 1) return JSON.stringify({ list: [] });

  // 解析 tid：如果是密码分类，tid 格式为 "源URL###分类名"
  let isProtectedCategory = tid.includes('###');
  let sourceUrl = null;
  let categoryName = null;
  if (isProtectedCategory) {
    let parts = tid.split('###');
    sourceUrl = parts[0];
    categoryName = parts[1];
  } else {
    // 普通分类（无密码）
    let source = __ext_config.sources.find(s => s.name === tid);
    if (!source) return JSON.stringify({ list: [] });
    sourceUrl = source.url;
    categoryName = null;
  }

  // 检查是否需要密码验证
  if (categoryName && categoryPasswords[categoryName] && !isCategoryUnlocked(categoryName)) {
    // 尝试弹窗验证
    let success = tryPromptForCategory(categoryName);
    if (!success) {
      // 验证失败，返回空列表，并可选提示
      return JSON.stringify({ list: [], page: 1, pagecount: 1, limit: 0, total: 0, error: '需要密码验证' });
    }
  }

  // 获取源分类内容
  let source = __ext_config.sources.find(s => s.url === sourceUrl);
  if (!source) return JSON.stringify({ list: [] });

  let parsed = sourceParsedCache[sourceUrl];
  if (!parsed) return JSON.stringify({ list: [] });

  let targetCategory = null;
  if (categoryName) {
    targetCategory = parsed.categories.find(c => c.name === categoryName);
    if (!targetCategory) return JSON.stringify({ list: [] });
  }

  // 解析分类内的内容（从源文件中提取对应行）
  let content = fetchSource(sourceUrl, source);
  let lines = content.split(/\r?\n/);
  let startLine = targetCategory ? targetCategory.startLineIdx : 0;
  let endLine = targetCategory ? targetCategory.endLineIdx : lines.length - 1;
  let categoryContent = lines.slice(startLine, endLine + 1).join('\n');
  let baseDir = sourceUrl.substring(0, sourceUrl.lastIndexOf('/')+1);
  let items = parseList(categoryContent, source.parseConfig || {}, baseDir);

  // 检查是否为合集模式
  let isSeries = source.parseConfig?.mode === 'series';
  if (isSeries) {
    if (!items.length) return JSON.stringify({ list: [] });
    let collectionName = source.parseConfig.collectionName || (categoryName || source.name);
    let vod_id = `${sourceUrl}###${categoryName || source.name}###series`;
    return JSON.stringify({
      list: [{ vod_id, vod_name: collectionName, vod_pic: def_pic, vod_remarks: `📚 共${items.length}集` }],
      page: 1, pagecount: 1, limit: 1, total: items.length
    });
  }

  // 普通模式（分组）
  // 将 items 转换为 vod 列表
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
  let mode = parts.length > 1 ? parts[1] : 'single';
  let left = parts[0];

  if (mode === 'series') {
    // 合集模式：需要知道源URL和分类名
    let sourceUrl = parts.length > 2 ? parts[0] : null;
    let categoryName = parts[1];
    if (!sourceUrl) return JSON.stringify({ list: [] });
    let source = __ext_config.sources.find(s => s.url === sourceUrl);
    if (!source) return JSON.stringify({ list: [] });
    let parsed = sourceParsedCache[sourceUrl];
    let targetCategory = parsed.categories.find(c => c.name === categoryName);
    if (!targetCategory) return JSON.stringify({ list: [] });
    let content = fetchSource(sourceUrl, source);
    let lines = content.split(/\r?\n/);
    let categoryContent = lines.slice(targetCategory.startLineIdx, targetCategory.endLineIdx + 1).join('\n');
    let baseDir = sourceUrl.substring(0, sourceUrl.lastIndexOf('/')+1);
    let episodes = parseList(categoryContent, source.parseConfig || {}, baseDir);
    if (!episodes.length) return JSON.stringify({ list: [] });
    let playUrl = episodes.map(ep => `${ep.title}$${ep.url}`).join('#');
    let vodName = source.parseConfig?.collectionName || (categoryName || source.name);
    let vod = {
      vod_id: tid, vod_name: vodName, vod_pic: def_pic,
      type_name: "连续剧", vod_play_from: source.name, vod_play_url: playUrl,
      vod_remarks: `共${episodes.length}集`
    };
    return JSON.stringify({ list: [vod] });
  }

  // 单文件模式
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

export default {
  init, home, homeVod, category, detail, play, search,
  verifyCategoryPassword   // 可手动调用验证
};