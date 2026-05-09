// ==================== 零硬编码通用动态爬虫 v30（稳定合集版） ====================
// 基于 v29 架构，增强数据源请求头，支持合集模式（系列剧）
// 特点：
//   - ext 配置灵活，支持远程 JSON
//   - 自动为不同域名添加 Referer/Origin
//   - 支持 txt(分隔符)、json、m3u 解析
//   - 合集模式：分类页显示一个条目，详情页生成播放列表

// ========== 默认请求头（用于数据源） ==========
const DATA_DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
  "Connection": "keep-alive"
};

// 动态 Referer（根据 URL 域名自动生成）
function getDynamicHeaders(url) {
  let headers = {};
  if (url.includes('cntv.cn') || url.includes('cctv.com')) {
    headers['Referer'] = 'https://tv.cctv.com/';
    headers['Origin'] = 'https://tv.cctv.com';
  } else if (url.includes('bilibili.com')) {
    headers['Referer'] = 'https://www.bilibili.com/';
  } else {
    let match = url.match(/^(https?:\/\/[^/]+)/);
    if (match) headers['Referer'] = match[1] + '/';
  }
  return headers;
}

// ========== 网络请求（带缓存，区分 ext 请求和数据源请求） ==========
let cache = {};
let debugMode = true;
let defaultTimeout = 5000;

function log(msg, level = "INFO") {
  if (!debugMode && level === "DEBUG") return;
  console.log(`[${level}] ${msg}`);
}

// 用于 ext 配置请求（简单头）
function httpRequest(url, options = {}) {
  let method = options.method || 'GET';
  let headers = { 'User-Agent': "Mozilla/5.0", ...(options.headers || {}) };
  let reqOptions = { method, headers, timeout: options.timeout || defaultTimeout };
  if (options.body) {
    reqOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
  }
  try {
    let res = req(url, reqOptions);
    res.json = () => res && res.content ? JSON.parse(res.content) : null;
    res.text = () => res && res.content ? res.content : '';
    return res;
  } catch (e) {
    log(`ext请求失败 ${url}: ${e.message}`, "ERROR");
    return { json: () => null, text: () => '', content: '' };
  }
}

// 用于数据源请求（增强头 + 动态 Referer）
function fetchSource(url, sourceConfig = {}) {
  if (cache[url]) return cache[url];
  let method = sourceConfig.method || 'GET';
  let dynamicHeaders = getDynamicHeaders(url);
  let headers = { ...DATA_DEFAULT_HEADERS, ...dynamicHeaders, ...(sourceConfig.headers || {}) };
  let reqOptions = { method, headers, timeout: sourceConfig.timeout || defaultTimeout };
  if (sourceConfig.body) {
    reqOptions.body = typeof sourceConfig.body === 'string' ? sourceConfig.body : JSON.stringify(sourceConfig.body);
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
  }
  try {
    let res = req(url, reqOptions);
    let content = res.text();
    cache[url] = content;
    return content;
  } catch (e) {
    log(`数据源请求失败 ${url}: ${e.message}`, "ERROR");
    return '';
  }
}

// ========== 解析函数 ==========
function parseContent(content, parseConfig, baseUrl) {
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
    } catch(e) { log("JSON解析失败: " + e.message, "ERROR"); }
  } else if (type === 'm3u') {
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
  } else {
    let separators = parseConfig.separators || [',', '|', '$', '\t'];
    let lines = content.split(/\r?\n/);
    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;
      let bestSep = null, bestIdx = -1;
      for (let sep of separators) {
        let idx = line.indexOf(sep);
        if (idx > 0 && (bestIdx === -1 || idx < bestIdx)) { bestIdx = idx; bestSep = sep; }
      }
      if (bestSep) {
        let title = line.substring(0, bestIdx).trim();
        let rest = line.substring(bestIdx + 1).trim();
        let urlMatch = rest.match(/^(https?:\/\/[^\s]+)/);
        let url = urlMatch ? urlMatch[1] : (rest.match(/^https?:\/\//i) ? rest : null);
        if (url) items.push({ title, url });
      } else if (line.match(/^https?:\/\//i)) {
        items.push({ title: "媒体文件", url: line });
      }
    }
  }
  return items;
}

// 生成随机封面
function getCover(title, url, coverConfig) {
  if (coverConfig && coverConfig.type === 'fixed' && coverConfig.url) return coverConfig.url;
  let hash = 0;
  let str = (title || "media") + (url || "");
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash) + str.charCodeAt(i);
  let baseUrl = coverConfig?.baseUrl || "https://picsum.photos";
  let width = coverConfig?.width || 200;
  let height = coverConfig?.height || 300;
  return `${baseUrl}/${width}/${height}?random=${Math.abs(hash) % 1000}`;
}

function getFileType(url) {
  if (!url) return "📄 未知";
  let ext = url.split('.').pop().toLowerCase();
  let types = {
    'mp3': '🎵 音频', 'wav': '🎵 音频', 'ogg': '🎵 音频', 'flac': '🎵 音频',
    'mp4': '🎬 视频', 'mkv': '🎬 视频', 'avi': '🎬 视频', 'mov': '🎬 视频',
    'm3u8': '📺 直播', 'flv': '📺 直播', 'ts': '📺 直播'
  };
  return types[ext] || '🎵 媒体';
}

// ========== ext 配置解析 ==========
let __ext_config = { sources: [], global: {} };
let extBasePath = "";
let defaultBasePath = "https://raw.githubusercontent.com/mannys888/frist/refs/heads/main/";

function parseExtConfig(extParam) {
  let sources = [];
  let configData = null;
  if (typeof extParam === 'object') {
    configData = extParam;
  } else if (typeof extParam === 'string') {
    if (extParam.match(/^https?:\/\//i)) {
      let resp = httpRequest(extParam);
      try { configData = JSON.parse(resp.text()); } catch(e) { configData = null; }
    } else {
      try { configData = JSON.parse(extParam); } catch(e) { configData = null; }
    }
  }
  if (configData) {
    if (configData.sources && Array.isArray(configData.sources)) sources = configData.sources;
    else if (Array.isArray(configData) && configData[0] && configData[0].name && configData[0].url) sources = configData;
    if (configData.global) __ext_config.global = configData.global;
    else __ext_config.global = {};
  }
  // 处理相对路径
  for (let s of sources) {
    if (s.url && !s.url.match(/^https?:\/\//i)) {
      s.url = (extBasePath || defaultBasePath) + s.url;
    }
  }
  return sources;
}

function init(extend) {
  log("零硬编码爬虫 v30 (合集稳定版) 初始化", "INFO");
  if (typeof extend === 'string' && extend.match(/^https?:\/\//i)) {
    let lastSlash = extend.lastIndexOf('/');
    if (lastSlash > 0) extBasePath = extend.substring(0, lastSlash + 1);
  }
  __ext_config.sources = parseExtConfig(extend);
  if (__ext_config.global.debug !== undefined) debugMode = __ext_config.global.debug;
  log(`加载 ${__ext_config.sources.length} 个分类`, "INFO");
}

function home(filter) {
  let classes = __ext_config.sources.map(s => ({
    type_id: s.name,
    type_name: s.name,
    icon: s.icon || ""
  }));
  // 可选筛选器
  let filters = {
    "show": [{ "n": "多线路分组", "v": "groups" }, { "n": "单线路", "v": "all" }]
  };
  let filterDict = {};
  classes.forEach(c => { filterDict[c.type_id] = [filters]; });
  return JSON.stringify({ class: classes, filters: filterDict });
}

function homeVod() {
  return JSON.stringify({ list: [] });
}

function category(tid, pg, filter, extend) {
  pg = parseInt(pg) || 1;
  if (pg > 1) return JSON.stringify({ list: [], page: pg, pagecount: 1, limit: 50, total: 0 });
  let source = __ext_config.sources.find(s => s.name === tid);
  if (!source) return JSON.stringify({ list: [], page: pg, pagecount: 0, total: 0 });

  let parseConfig = source.parseConfig || {};
  let mode = parseConfig.mode; // 'series' 为合集模式，否则为普通模式
  let coverConfig = __ext_config.global.cover || {};
  let fileUrl = source.url;
  let content = fetchSource(fileUrl, source);
  if (!content) return JSON.stringify({ list: [], page: pg, pagecount: 0, total: 0 });

  let items = parseContent(content, parseConfig, fileUrl.substring(0, fileUrl.lastIndexOf('/')+1));
  let total = items.length;
  let pageSize = parseConfig.pageSize || 50;

  // 合集模式：返回单个条目
  if (mode === 'series') {
    if (total === 0) {
      log(`合集模式：文件 ${fileUrl} 未解析到有效条目`, "WARN");
      return JSON.stringify({ list: [], page: pg, pagecount: 0, total: 0 });
    }
    let collectionName = parseConfig.collectionName || (fileUrl.split('/').pop().replace(/\.(txt|m3u8?|json)$/i, '') + " 合集");
    let vod_id = fileUrl + "###series";  // 后缀用于 detail 识别
    let vod = {
      vod_id: vod_id,
      vod_name: collectionName,
      vod_pic: getCover(collectionName, fileUrl, coverConfig),
      vod_remarks: `📚 共${total}集`
    };
    log(`✅ 生成合集条目: ${collectionName} (${total}集)`, "INFO");
    return JSON.stringify({
      list: [vod],
      page: pg,
      pagecount: 1,
      limit: 1,
      total: total
    });
  }

  // 普通模式：分页返回每个资源作为一个视频
  let start = (pg - 1) * pageSize;
  let paged = items.slice(start, start + pageSize);
  let videos = paged.map(item => {
    let url = item.url;
    if (!url.match(/^https?:\/\//i)) {
      let baseDir = fileUrl.substring(0, fileUrl.lastIndexOf('/') + 1);
      url = (baseDir + url).replace(/\/+/g, '/');
    }
    return {
      vod_id: url + "###single",
      vod_name: item.title || "未命名",
      vod_pic: getCover(item.title, url, coverConfig),
      vod_remarks: getFileType(url)
    };
  });
  let pagecount = Math.ceil(total / pageSize);
  return JSON.stringify({
    list: videos,
    page: pg,
    pagecount: pagecount,
    limit: pageSize,
    total: total
  });
}

function detail(vodId) {
  log(`detail: ${vodId}`, "DEBUG");
  let parts = vodId.split('###');
  if (parts.length < 2) return JSON.stringify({ list: [] });
  let id = parts[0];
  let type = parts[1];

  // 合集模式（series）
  if (type === 'series') {
    let fileUrl = id;
    if (!fileUrl.match(/^https?:\/\//i)) fileUrl = (extBasePath || defaultBasePath) + fileUrl;
    let content = fetchSource(fileUrl, {});
    if (!content) return JSON.stringify({ list: [] });
    let baseDir = fileUrl.substring(0, fileUrl.lastIndexOf('/') + 1);
    // 尝试智能解析（自动检测格式）
    let items = [];
    if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
      try {
        let json = JSON.parse(content);
        let arr = Array.isArray(json) ? json : (json.list || json.data || []);
        for (let item of arr) {
          let title = item.title || item.name || "未命名";
          let url = item.url || item.link || item.src || item.play_url;
          if (url) {
            if (!url.match(/^https?:\/\//i)) url = resolvePath(url, baseDir);
            items.push(`${title}$${url}`);
          }
        }
      } catch(e) {}
    }
    if (items.length === 0 && content.includes("#EXTM3U")) {
      let parsed = parseContent(content, { type: "m3u" }, baseDir);
      items = parsed.map(item => `${item.title}$${item.url}`);
    }
    if (items.length === 0) {
      let parsed = parseContent(content, { separators: [',', '|', '$', '\t'] }, baseDir);
      items = parsed.map(item => `${item.title}$${item.url}`);
    }
    if (items.length === 0) {
      log(`合集文件 ${fileUrl} 未能解析出任何播放地址`, "ERROR");
      return JSON.stringify({ list: [] });
    }
    let playUrl = items.join("#");
    let firstTitle = items[0].split('$')[0] || "媒体合集";
    let vod = {
      vod_id: vodId,
      vod_name: firstTitle,
      vod_pic: getCover(firstTitle, fileUrl, __ext_config.global.cover),
      vod_play_from: "播放列表",
      vod_play_url: playUrl,
      vod_remarks: `共${items.length}集`
    };
    return JSON.stringify({ list: [vod] });
  }

  // 单文件模式
  if (type === 'single') {
    let title = decodeURIComponent(id.split('/').pop().split('.')[0] || "媒体");
    let vod = {
      vod_id: id,
      vod_name: title,
      vod_pic: getCover(title, id, __ext_config.global.cover),
      vod_play_from: "播放源",
      vod_play_url: "播放$" + id
    };
    return JSON.stringify({ list: [vod] });
  }

  return JSON.stringify({ list: [] });
}

function resolvePath(path, base) {
  if (path.match(/^https?:\/\//i)) return path;
  if (!base.endsWith('/')) base += '/';
  if (path.startsWith('./')) path = path.substring(2);
  return base + path;
}

function play(flag, id, vipFlags) {
  return JSON.stringify({ parse: 0, url: id });
}

function search(keyword, page) {
  return JSON.stringify({ list: [] });
}

// 导出接口
__JS_SPIDER__ = { init, home, homeVod, category, detail, play, search };