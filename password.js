// ==================== 通用动态爬虫 v40（手机网页解锁版） ====================
// 基于 v39 扩展：
//   - 不再使用 prompt 弹窗
//   - 需要密码时，显示一个 URL，用户手机访问后输入密码，电视端自动解锁
//   - 需要在 ext 的 global 中配置 passwordPollUrl（一个可写的 JSON 接口）
//   - 推荐使用 jsonbin.io 创建临时 bin，获取读取和编辑 URL
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
const VERSION = 'universal v4.0 (mobile web auth)';
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
let categoryPasswords = {};
let passwordPollUrl = null;
let pollInterval = null;

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

// 轮询密码接口
function startPasswordPolling() {
  if (!passwordPollUrl) return;
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(() => {
    let resp = smartRequest(passwordPollUrl);
    let data = resp.json();
    let pwd = null;
    if (data && data.password) pwd = data.password;
    else if (typeof data === 'string') pwd = data.trim();
    if (pwd) {
      let success = unlockAll(pwd);
      if (success) {
        // 解锁成功，停止轮询
        clearInterval(pollInterval);
        pollInterval = null;
        print("密码轮询解锁成功");
      }
    }
  }, 3000); // 每3秒轮询一次
}

// ---------- 解析源文件 ----------
function parseSourceWithPassword(content, baseUrl, sourceName) {
  let lines = content.split(/\r?\n/);
  let result = { categories: [], plainItems: [] };
  let currentCategory = null;
  let i = 0;
  while (i < lines.length) {
    let line = lines[i].trim();
    if (line.includes('#genre#')) {
      if (currentCategory) {
        currentCategory.endLineIdx = i - 1;
        result.categories.push(currentCategory);
        currentCategory = null;
      }
      let parts = line.split(',');
      let namePart = parts[0];
      let password = null;
      let categoryName = namePart;
      if (namePart.startsWith('vip_')) {
        password = namePart.substring(4);
        categoryName = `🔒 ${namePart}`;
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
    i++;
  }
  if (currentCategory) {
    currentCategory.endLineIdx = lines.length - 1;
    result.categories.push(currentCategory);
  }
  return result;
}

// ---------- 网络请求 ----------
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
let sourceParsedCache = {};

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
      passwordPollUrl = __ext_config.global.passwordPollUrl;
    }
  }
  showMode = getItem('showMode', 'groups');
  groupDict = JSON.parse(getItem('groupDict', '{}'));
  print(`加载 ${__ext_config.sources.length} 个源配置`);

  for (let src of __ext_config.sources) {
    let content = fetchSource(src.url, src);
    let baseDir = src.url.substring(0, src.url.lastIndexOf('/')+1);
    let parsed = parseSourceWithPassword(content, baseDir, src.name);
    sourceParsedCache[src.url] = parsed;
    for (let cat of parsed.categories) {
      if (cat.password) {
        categoryPasswords[cat.name] = cat.password;
        print(`发现密码分类: ${cat.name} (密码: ${cat.password})`);
      }
    }
  }

  // 如果存在密码分类且配置了轮询URL，启动轮询
  if (Object.keys(categoryPasswords).length > 0 && passwordPollUrl) {
    print(`密码轮询已启动，轮询地址: ${passwordPollUrl}`);
    startPasswordPolling();
  } else if (Object.keys(categoryPasswords).length > 0 && !passwordPollUrl) {
    print(`警告：存在密码分类，但未配置 passwordPollUrl，请使用外部调用 verifyCategoryPassword 解锁`);
  }
}

function home(filter) {
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

  let isProtectedCategory = tid.includes('###');
  let sourceUrl = null, categoryName = null;
  if (isProtectedCategory) {
    let parts = tid.split('###');
    sourceUrl = parts[0];
    categoryName = parts[1];
  } else {
    let source = __ext_config.sources.find(s => s.name === tid);
    if (!source) return JSON.stringify({ list: [] });
    sourceUrl = source.url;
    categoryName = null;
  }

  // 检查是否需要密码验证
  if (categoryName && categoryPasswords[categoryName] && !isCategoryUnlocked(categoryName)) {
    // 不再弹窗，直接返回空列表，提示需要手机解锁
    print(`分类 ${categoryName} 需要密码，请通过手机访问 ${passwordPollUrl || '密码轮询地址'} 输入密码`);
    // 如果配置了轮询URL，可以返回一个提示信息（前端可显示）
    return JSON.stringify({
      list: [],
      page: 1,
      pagecount: 1,
      limit: 0,
      total: 0,
      needAuth: true,
      authUrl: passwordPollUrl || '请配置 global.passwordPollUrl'
    });
  }

  let source = __ext_config.sources.find(s => s.url === sourceUrl);
  if (!source) return JSON.stringify({ list: [] });
  let parsed = sourceParsedCache[sourceUrl];
  if (!parsed) return JSON.stringify({ list: [] });
  let targetCategory = null;
  if (categoryName) targetCategory = parsed.categories.find(c => c.name === categoryName);
  if (!targetCategory && categoryName) return JSON.stringify({ list: [] });

  let content = fetchSource(sourceUrl, source);
  let lines = content.split(/\r?\n/);
  let startLine = targetCategory ? targetCategory.startLineIdx : 0;
  let endLine = targetCategory ? targetCategory.endLineIdx : lines.length - 1;
  let categoryContent = lines.slice(startLine, endLine + 1).join('\n');
  let baseDir = sourceUrl.substring(0, sourceUrl.lastIndexOf('/')+1);
  let items = parseList(categoryContent, source.parseConfig || {}, baseDir);

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
  verifyCategoryPassword,
  unlockAll
};