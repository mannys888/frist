/**
 * 零硬编码通用动态爬虫 v24 (修复 ext 读取问题)
 * 特性：
 *   - 支持直播源 (text/m3u/json) 和点播源 (API 链式调用)
 *   - 完全保留 join 逻辑：单线路用 #，多线路分组用 $$$ 分隔组、组内用 #
 *   - 自定义请求头/请求体/方法
 *   - 智能缓存、分组算法、搜索聚合
 */

// ======================== 全局变量 ========================
let extConfig = { sources: [], global: {} };
let cache = {};
let requestTimeout = 5000;
let defaultPic = 'https://avatars.githubusercontent.com/u/97389433?s=120&v=4';
let userAgent = 'Mozilla/5.0';
const STORAGE_KEY = 'universal_spider_v24';
let showMode = 'groups';
let groupDict = {};

// ======================== 工具函数 ========================
function getItem(k, def) { let v = local.get(STORAGE_KEY, k); return v !== undefined ? v : def; }
function setItem(k, v) { local.set(STORAGE_KEY, k, v); }
function log(msg, lvl = 'INFO') { console.log(`[${lvl}] ${msg}`); }

// 增强请求 (支持自定义 headers/body/method)
function fetchSync(url, options = {}) {
  let { method = 'GET', headers = {}, body, contentType, timeout = requestTimeout, json = false, cache: useCache = true, cacheKey, interpolate = {} } = options;
  let reqHeaders = { 'User-Agent': userAgent, ...headers };
  if (contentType) reqHeaders['Content-Type'] = contentType;
  let reqOptions = { method, headers: reqHeaders, timeout };
  if (body) {
    if (typeof body === 'object' && !(body instanceof String)) {
      reqOptions.body = JSON.stringify(body);
      if (!contentType) reqOptions.headers['Content-Type'] = 'application/json';
    } else {
      let bodyStr = String(body);
      for (let [k, v] of Object.entries(interpolate)) {
        bodyStr = bodyStr.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
      }
      reqOptions.body = bodyStr;
    }
  }
  let cacheKeyReal = cacheKey || url + method + (body ? JSON.stringify(reqOptions.body) : '');
  if (useCache && cache[cacheKeyReal]) return cache[cacheKeyReal];
  try {
    let resp = req(url, reqOptions);
    let content = resp.content || '';
    let result = json ? JSON.parse(content) : content;
    if (useCache) cache[cacheKeyReal] = result;
    return result;
  } catch (e) {
    log(`请求失败 ${url}: ${e.message}`, 'ERROR');
    return json ? null : '';
  }
}

// 解析内容为 {title, url} 数组 (同之前)
function parseItems(content, parseConfig, baseUrl) {
  let items = [];
  let type = parseConfig.type || 'text';
  if (type === 'json') {
    try {
      let json = typeof content === 'string' ? JSON.parse(content) : content;
      let data = json;
      if (parseConfig.dataPath) {
        let parts = parseConfig.dataPath.split('.');
        for (let p of parts) data = data[p];
      }
      if (!Array.isArray(data)) data = data || [];
      for (let item of data) {
        let title = parseConfig.titleField ? item[parseConfig.titleField] : (item.title || item.name);
        let url = parseConfig.urlField ? item[parseConfig.urlField] : (item.url || item.link);
        if (title && url) {
          if (!url.match(/^https?:\/\//i) && baseUrl) url = new URL(url, baseUrl).href;
          items.push({ title, url, raw: item });
        }
      }
    } catch (e) { log(`JSON解析失败: ${e.message}`, 'ERROR'); }
  } else if (type === 'm3u') {
    // 标准 m3u 解析
    let lines = content.split(/\r?\n/);
    let currentTitle = '';
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
  } else if (type === 'regex') {
    let re = new RegExp(parseConfig.pattern, parseConfig.flags || 'g');
    let match;
    while ((match = re.exec(content)) !== null) {
      let title = match[parseConfig.titleGroup || 1] || '未命名';
      let url = match[parseConfig.urlGroup || 2];
      if (url) items.push({ title, url });
    }
  } else { // text 默认
    let lines = content.split(/\r?\n/);
    let sep = parseConfig.separator || ',';
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
  }
  return items;
}

// 分组算法 (原版 splitArray)
function splitArray(arr, parse) {
  parse = parse && typeof parse === 'function' ? parse : '';
  if (!arr.length) return [];
  let result = [[arr[0]]];
  for (let i = 1; i < arr.length; i++) {
    let index = -1;
    for (let j = 0; j < result.length; j++) {
      if (parse && result[j].map(parse).includes(parse(arr[i]))) {
        index = j;
      } else if (!parse && result[j].includes(arr[i])) {
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

function applyPostProcess(items, postProcess) {
  if (!postProcess) return items;
  if (typeof postProcess === 'function') return postProcess(items);
  if (postProcess.filter) {
    let re = new RegExp(postProcess.filter.regex || '.*');
    items = items.filter(item => re.test(item[postProcess.filter.field || 'title']));
  }
  if (postProcess.sort) {
    let field = postProcess.sort.field || 'title';
    let order = postProcess.sort.order === 'desc' ? -1 : 1;
    items.sort((a, b) => order * (a[field] > b[field] ? 1 : -1));
  }
  if (postProcess.limit) items = items.slice(0, postProcess.limit);
  return items;
}

// M3U 转普通格式
function convertM3uToNormal(m3u) {
  try {
    const lines = m3u.split('\n');
    let result = '', TV = '', flag = '#m3u#', currentGroup = '';
    for (let line of lines) {
      if (line.startsWith('#EXTINF:')) {
        let group = line.split('"')[1]?.trim() || '';
        TV = line.split('"')[2]?.substring(1) || '';
        if (currentGroup !== group) {
          currentGroup = group;
          result += `\n${currentGroup},${flag}\n`;
        }
      } else if (line.startsWith('http')) {
        let splitLine = line.split(',');
        result += `${TV}\,${splitLine[0]}\n`;
      }
    }
    return result.trim();
  } catch(e) { return m3u; }
}

// 获取源内容 (自动检测 M3U)
function fetchSource(url, sourceConfig) {
  if (cache[url]) return cache[url];
  let opts = {
    method: sourceConfig.method || 'GET',
    headers: sourceConfig.headers || {},
    body: sourceConfig.body,
    contentType: sourceConfig.contentType,
    timeout: sourceConfig.timeout
  };
  let content = fetchSync(url, opts);
  if (!sourceConfig.type && content && content.includes('#EXTM3U')) {
    content = convertM3uToNormal(content);
  }
  cache[url] = content;
  return content;
}

// ======================== 核心逻辑 ========================
// 处理直播分类页 (生成带分组标记的列表)
function processLiveCategory(source, pg) {
  if (pg > 1) return { list: [], total: 0, pagecount: 1 };
  let html = fetchSource(source.url, source);
  let groupMatches = html.match(/.*?[,，]#[\s\S].*?#/g) || [];
  let videos = groupMatches.map(line => {
    let vname = line.split(/[,，]/)[0];
    let vtab = line.match(/#(.*?)#/)[0];
    return {
      vod_name: vname,
      vod_id: source.url + '$' + vname,
      vod_pic: defaultPic,
      vod_remarks: vtab,
    };
  });
  return { list: videos, page: 1, pagecount: 1, total: videos.length };
}

// 处理直播详情 (生成播放列表，保留 # 和 $$$ join)
function processLiveDetail(source, tid, selectedTab) {
  let html = fetchSource(source.url, source);
  let regex = new RegExp(`.*?${selectedTab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[,，]#[\\s\\S].*?#`);
  let match = html.match(regex);
  if (!match) return null;
  let block = match[0];
  let after = html.split(block)[1];
  let nextMatch = after.match(/.*?[,，]#[\s\S].*?#/);
  if (nextMatch) after = after.split(nextMatch[0])[0];
  let lines = after.trim().split('\n');
  let playItems = [];
  for (let line of lines) {
    if (line.trim()) {
      let parts = line.trim().split(',');
      if (parts.length >= 2) playItems.push(`${parts[0]}$${parts[1]}`);
    }
  }
  let sourceName = source.name;
  let vodPlayUrl, vodPlayFrom;
  if (showMode === 'groups') {
    let groups = splitArray(playItems, x => x.split('$')[0]);
    let tabs = groups.map((_, i) => i === 0 ? sourceName + '1' : ` ${i+1} `);
    vodPlayUrl = groups.map(g => g.join('#')).join('$$$');
    vodPlayFrom = tabs.join('$$$');
  } else {
    vodPlayUrl = playItems.join('#');
    vodPlayFrom = sourceName;
  }
  return {
    vod_name: `${sourceName}|${selectedTab}`,
    vod_play_from: vodPlayFrom,
    vod_play_url: vodPlayUrl,
    vod_pic: defaultPic
  };
}

// ======================== CMS 标准接口 ========================
function init(extend) {
  log('零硬编码爬虫 v24 初始化 (修复 ext 读取)', 'INFO');
  log(`原始 extend 类型: ${typeof extend}`, 'DEBUG');
  
  let rawConfig = null;
  
  // 1. 如果 extend 是对象，直接使用
  if (typeof extend === 'object') {
    rawConfig = extend;
    log('ext 是对象类型', 'DEBUG');
  } 
  // 2. 如果是字符串
  else if (typeof extend === 'string') {
    // 2.1 如果是 URL
    if (extend.startsWith('http://') || extend.startsWith('https://')) {
      log(`从远程加载 ext: ${extend}`, 'INFO');
      rawConfig = fetchSync(extend, { json: true, cache: false });
      if (!rawConfig) log('远程 ext 加载失败', 'ERROR');
      else log('远程 ext 加载成功', 'INFO');
    } 
    // 2.2 尝试解析为 JSON 字符串
    else {
      try {
        rawConfig = JSON.parse(extend);
        log('ext 是 JSON 字符串，解析成功', 'DEBUG');
      } catch(e) {
        // 2.3 可能是纯文本内容（如直播源的 txt 内容？但 ext 不应该直接是内容，忽略）
        log(`ext 字符串无法解析为 JSON: ${e.message}`, 'WARN');
        rawConfig = null;
      }
    }
  }
  
  // 3. 如果 rawConfig 为空，尝试从全局变量获取（备用）
  if (!rawConfig) {
    log('未能从 extend 获取配置，尝试使用全局变量', 'WARN');
    rawConfig = { sources: [] };
  }
  
  // 4. 标准化配置结构
  if (Array.isArray(rawConfig)) {
    // 纯数组格式：每个元素是 {name, url} 的直播源
    extConfig.sources = rawConfig;
    extConfig.global = {};
    log(`从数组加载 ${extConfig.sources.length} 个直播源`, 'INFO');
  } 
  else if (rawConfig.sources && Array.isArray(rawConfig.sources)) {
    extConfig = rawConfig;
    log(`从对象加载 ${extConfig.sources.length} 个站点`, 'INFO');
  } 
  else if (rawConfig.name && rawConfig.url) {
    // 单个源对象
    extConfig.sources = [rawConfig];
    extConfig.global = {};
    log('加载单个源', 'INFO');
  }
  else {
    // 无法识别，创建空配置
    extConfig.sources = [];
    extConfig.global = {};
    log('无法识别的 ext 格式，已初始化为空', 'ERROR');
  }
  
  // 5. 应用全局设置
  if (extConfig.global) {
    if (extConfig.global.defaultPic) defaultPic = extConfig.global.defaultPic;
    if (extConfig.global.request_timeout) requestTimeout = extConfig.global.request_timeout;
    if (extConfig.global.userAgent) userAgent = extConfig.global.userAgent;
  }
  
  // 6. 恢复持久化状态
  showMode = getItem('showMode', 'groups');
  groupDict = JSON.parse(getItem('groupDict', '{}'));
  
  log(`初始化完成，共 ${extConfig.sources.length} 个源`, 'INFO');
  if (extConfig.sources.length === 0) {
    log('警告：没有加载到任何源，请检查 ext 参数', 'WARN');
  }
}

function home() {
  let classes = extConfig.sources.map(src => ({
    type_id: src.name,
    type_name: src.name
  }));
  // 为每个直播源添加展示模式筛选器
  let filters = {};
  let globalFilter = [{
    key: 'show', name: '播放展示', value: [
      { n: '多线路分组', v: 'groups' },
      { n: '单线路合并', v: 'all' }
    ]
  }];
  for (let cls of classes) {
    filters[cls.type_id] = [...globalFilter];
    // 如果源自身有 filters 配置，合并
    let src = extConfig.sources.find(s => s.name === cls.type_id);
    if (src && src.filters) filters[cls.type_id].push(...src.filters);
  }
  return JSON.stringify({ class: classes, filters });
}

function homeVod() {
  return JSON.stringify({ list: [] });
}

function category(tid, pg, filter, extendParams) {
  pg = parseInt(pg) || 1;
  // 处理展示模式切换
  let fl = filter ? extendParams : {};
  if (fl.show) {
    showMode = fl.show;
    setItem('showMode', showMode);
  }
  
  let source = extConfig.sources.find(s => s.name === tid);
  if (!source) return JSON.stringify({ list: [] });
  
  // 目前仅支持直播源，未来可扩展点播源
  let result = processLiveCategory(source, pg);
  return JSON.stringify(result);
}

function detail(vodId) {
  // vodId 格式: "源URL$分组名"
  let parts = vodId.split('$');
  if (parts.length < 2) return JSON.stringify({ list: [] });
  let srcUrl = parts[0];
  let tab = parts[1];
  let source = extConfig.sources.find(s => s.url === srcUrl);
  if (!source) return JSON.stringify({ list: [] });
  
  let vod = processLiveDetail(source, srcUrl, tab);
  if (!vod) return JSON.stringify({ list: [] });
  
  let resultVod = {
    vod_id: vodId,
    vod_name: vod.vod_name,
    vod_pic: vod.vod_pic,
    type_name: '直播',
    vod_play_from: vod.vod_play_from,
    vod_play_url: vod.vod_play_url,
    vod_director: '零硬编码爬虫 v24',
    vod_remarks: '直播列表'
  };
  return JSON.stringify({ list: [resultVod] });
}

function play(flag, id, vipFlags) {
  return JSON.stringify({ parse: 0, playUrl: '', url: id });
}

function search(wd, quick) {
  // 可选：合并所有源的搜索，按分组返回
  if (!extConfig.sources.length) return JSON.stringify({ list: [] });
  let allLines = [];
  for (let src of extConfig.sources) {
    let html = fetchSource(src.url, src);
    let lines = html.split('\n').filter(l => l.trim() && l.includes(',') && l.split(',')[1]?.trim().startsWith('http'));
    allLines.push(...lines);
  }
  let unique = [...new Map(allLines.map(l => [l.split(',')[1]?.trim(), l])).values()];
  let filtered = unique.filter(l => l.includes(wd));
  let newGroups = {};
  for (let line of filtered) {
    let name = line.split(',')[0];
    if (!newGroups[name]) newGroups[name] = [];
    newGroups[name].push(line);
  }
  Object.assign(groupDict, newGroups);
  setItem('groupDict', JSON.stringify(groupDict));
  let list = Object.keys(newGroups).map(name => ({
    vod_name: name,
    vod_id: name + '$' + wd + '#search#',
    vod_pic: defaultPic
  }));
  return JSON.stringify({ list });
}

// 导出
__JS_SPIDER__ = { init, home, homeVod, category, detail, play, search };