// ==================== 零硬编码通用动态爬虫 v31（修复合集显示问题） ====================
// 修复：fetchSource 正确获取 content，增强解析健壮性，增加详细调试输出
// 支持：txt/json/m3u 解析，合集模式（series），单文件模式

// ========== 默认请求头 ==========
const DATA_DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.8"
};

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

let cache = {};
let debugMode = true;
let defaultTimeout = 5000;

function log(msg, level = "INFO") {
  if (!debugMode && level === "DEBUG") return;
  console.log(`[${level}] ${msg}`);
}

// 请求 ext 配置文件（简单头）
function httpRequest(url) {
  try {
    let res = req(url, { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: defaultTimeout });
    return res && res.content ? res.content : null;
  } catch (e) {
    log(`ext请求失败 ${url}: ${e.message}`, "ERROR");
    return null;
  }
}

// 请求数据源（增强头 + 动态 Referer）
function fetchSource(url) {
  if (cache[url]) return cache[url];
  try {
    let dynamicHeaders = getDynamicHeaders(url);
    let headers = { ...DATA_DEFAULT_HEADERS, ...dynamicHeaders };
    let res = req(url, { method: 'GET', headers, timeout: defaultTimeout });
    let content = res && res.content ? res.content : '';
    if (content) cache[url] = content;
    return content;
  } catch (e) {
    log(`数据源请求失败 ${url}: ${e.message}`, "ERROR");
    return '';
  }
}

// 解析内容为 [{title, url}] 
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
  } 
  else if (type === 'm3u') {
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
  } 
  else {
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
  let types = { 'mp3':'🎵音频', 'mp4':'🎬视频', 'm3u8':'📺直播', 'flv':'📺直播' };
  return types[ext] || '🎵媒体';
}

// ========== 全局配置 ==========
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
      let content = httpRequest(extParam);
      if (content) try { configData = JSON.parse(content); } catch(e) { configData = null; }
    } else {
      try { configData = JSON.parse(extParam); } catch(e) { configData = null; }
    }
  }
  if (configData) {
    if (configData.sources && Array.isArray(configData.sources)) sources = configData.sources;
    else if (Array.isArray(configData) && configData[0] && configData[0].name && configData[0].url) sources = configData;
    if (configData.global) __ext_config.global = configData.global;
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
  log("央视爬虫 v31 (修复合集显示) 初始化", "INFO");
  if (typeof extend === 'string' && extend.match(/^https?:\/\//i)) {
    let lastSlash = extend.lastIndexOf('/');
    if (lastSlash > 0) extBasePath = extend.substring(0, lastSlash + 1);
  }
  __ext_config.sources = parseExtConfig(extend);
  if (__ext_config.global.debug !== undefined) debugMode = __ext_config.global.debug;
  log(`加载 ${__ext_config.sources.length} 个分类`, "INFO");
}

function home(filter) {
  let classes = __ext_config.sources.map(s => ({ type_id: s.name, type_name: s.name, icon: s.icon || "" }));
  return JSON.stringify({ class: classes, filters: {} });
}

function homeVod() { return JSON.stringify({ list: [] }); }

function category(tid, pg, filter, extend) {
  pg = parseInt(pg) || 1;
  if (pg > 1) return JSON.stringify({ list: [], page: pg, pagecount: 1, limit: 50, total: 0 });
  let source = __ext_config.sources.find(s => s.name === tid);
  if (!source) return JSON.stringify({ list: [], page: pg, pagecount: 0, total: 0 });

  let parseConfig = source.parseConfig || {};
  let mode = parseConfig.mode; // 'series' 合集模式
  let coverConfig = __ext_config.global.cover || {};
  let fileUrl = source.url;
  let content = fetchSource(fileUrl);
  if (!content) {
    log(`获取文件内容失败: ${fileUrl}`, "ERROR");
    return JSON.stringify({ list: [], page: pg, pagecount: 0, total: 0 });
  }

  let baseDir = fileUrl.substring(0, fileUrl.lastIndexOf('/') + 1);
  let items = parseContent(content, parseConfig, baseDir);
  let total = items.length;
  log(`解析到 ${total} 个条目`, "DEBUG");

  if (mode === 'series') {
    if (total === 0) {
      log(`合集模式但无条目: ${fileUrl}`, "WARN");
      return JSON.stringify({ list: [], page: pg, pagecount: 0, total: 0 });
    }
    let collectionName = parseConfig.collectionName || (fileUrl.split('/').pop().replace(/\.(txt|m3u8?|json)$/i, '') + " 合集");
    let vod_id = fileUrl + "###series";
    let vod = {
      vod_id: vod_id,
      vod_name: collectionName,
      vod_pic: getCover(collectionName, fileUrl, coverConfig),
      vod_remarks: `📚 共${total}集`
    };
    return JSON.stringify({
      list: [vod],
      page: pg,
      pagecount: 1,
      limit: 1,
      total: total
    });
  }

  // 普通模式（分页）
  let pageSize = parseConfig.pageSize || 50;
  let start = (pg - 1) * pageSize;
  let paged = items.slice(start, start + pageSize);
  let videos = paged.map(item => {
    let url = item.url;
    if (!url.match(/^https?:\/\//i)) {
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
  let parts = vodId.split('###');
  if (parts.length < 2) return JSON.stringify({ list: [] });
  let id = parts[0];
  let type = parts[1];

  if (type === 'series') {
    let fileUrl = id;
    if (!fileUrl.match(/^https?:\/\//i)) fileUrl = (extBasePath || defaultBasePath) + fileUrl;
    let content = fetchSource(fileUrl);
    if (!content) return JSON.stringify({ list: [] });
    let baseDir = fileUrl.substring(0, fileUrl.lastIndexOf('/') + 1);
    // 自动检测格式
    let items = [];
    // JSON
    if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
      try {
        let json = JSON.parse(content);
        let arr = Array.isArray(json) ? json : (json.list || json.data || []);
        for (let item of arr) {
          let title = item.title || item.name || "未命名";
          let url = item.url || item.link || item.src || item.play_url;
          if (url) {
            if (!url.match(/^https?:\/\//i)) url = (baseDir + url).replace(/\/+/g, '/');
            items.push(`${title}$${url}`);
          }
        }
      } catch(e) {}
    }
    // M3U
    if (items.length === 0 && content.includes("#EXTM3U")) {
      let parsed = parseContent(content, { type: "m3u" }, baseDir);
      items = parsed.map(item => `${item.title}$${item.url}`);
    }
    // 普通文本
    if (items.length === 0) {
      let parsed = parseContent(content, { separators: [',', '|', '$', '\t'] }, baseDir);
      items = parsed.map(item => `${item.title}$${item.url}`);
    }
    if (items.length === 0) {
      log(`合集解析无结果: ${fileUrl}`, "ERROR");
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

function play(flag, id, vipFlags) {
  return JSON.stringify({ parse: 0, url: id });
}

function search(keyword, page) {
  return JSON.stringify({ list: [] });
}

__JS_SPIDER__ = { init, home, homeVod, category, detail, play, search };