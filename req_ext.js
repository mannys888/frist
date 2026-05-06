// ==================== 零硬编码通用动态爬虫 v23 (支持自定义请求头/体) ====================
// 新增：每个源/每个API可独立配置 method, headers, body, contentType
// 保留 join 逻辑 (# 和 $$$)

let extConfig = { global: {}, sites: [] };
let cache = {};
let requestTimeout = 5000;
let defaultPic = 'https://avatars.githubusercontent.com/u/97389433?s=120&v=4';
let userAgent = 'Mozilla/5.0';
const STORAGE_KEY = 'universal_spider_v23';
let showMode = 'groups';
let groupDict = {};

function getItem(k, def) { let v = local.get(STORAGE_KEY, k); return v !== undefined ? v : def; }
function setItem(k, v) { local.set(STORAGE_KEY, k, v); }
function log(msg, lvl = 'INFO') { console.log(`[${lvl}] ${msg}`); }

// 增强版 fetch，支持自定义请求头/体
function fetchSync(url, options = {}) {
  let { method = 'GET', headers = {}, body, contentType, timeout = requestTimeout, json = false, cacheKey, cache: useCache = true, interpolate = {} } = options;
  let reqHeaders = { 'User-Agent': userAgent, ...headers };
  if (contentType) reqHeaders['Content-Type'] = contentType;
  let reqOptions = { method, headers: reqHeaders, timeout };
  if (body) {
    if (typeof body === 'object' && !(body instanceof String)) {
      reqOptions.body = JSON.stringify(body);
      if (!contentType) reqOptions.headers['Content-Type'] = 'application/json';
    } else {
      let bodyStr = String(body);
      // 变量替换
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

// 解析 items（同 v22，略，可复用之前代码）
function parseItems(content, parseConfig, baseUrl) { /* ... 保持不变 ... */ }
function splitArray(arr, parse) { /* ... 保持不变 ... */ }
function applyPostProcess(items, postProcess) { /* ... 保持不变 ... */ }

// 获取源内容（支持自定义请求）
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

// ---------- 分类页处理（支持请求配置） ----------
function handleCategory(source, pg, filterParams) {
  pg = parseInt(pg) || 1;
  let homeUrl = source.homeUrl;
  let method = source.method || 'GET';
  let headers = source.headers || {};
  let body = source.body;
  let contentType = source.contentType;
  let finalUrl = homeUrl;
  let finalBody = body;
  if (method === 'GET') {
    let params = { ...(source.homeParams || {}), p: pg, ...filterParams };
    finalUrl += '?' + Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  } else {
    // POST 请求，将参数放入 body（支持变量替换）
    let bodyObj = typeof body === 'object' ? { ...body } : {};
    if (source.homeParams) Object.assign(bodyObj, source.homeParams);
    bodyObj.p = pg;
    Object.assign(bodyObj, filterParams);
    finalBody = bodyObj;
  }
  let jsonData = fetchSync(finalUrl, { method, headers, body: finalBody, contentType, json: true });
  if (!jsonData) return { list: [], total: 0, pagecount: 1 };
  let listParse = source.listParse;
  let items = parseItems(jsonData, listParse, '');
  items = applyPostProcess(items, source.postProcess);
  let videos = items.map(item => ({
    vod_id: JSON.stringify({ id: item.url, name: item.title, pic: item.raw?.pic || defaultPic }),
    vod_name: item.title,
    vod_pic: item.raw?.pic || defaultPic,
    vod_remarks: ''
  }));
  let total = jsonData.total || jsonData.response?.numFound || videos.length;
  let pagecount = Math.ceil(total / (source.homeParams?.n || 20));
  return { list: videos, page: pg, pagecount, total };
}

// 详情处理（支持自定义请求）
function handleVodDetail(source, extra) {
  let detailConf = source.detail;
  if (!detailConf) return null;
  let infoData = null;
  if (detailConf.infoApi) {
    let url = detailConf.infoApi.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(extra[k] || ''));
    let opts = {
      method: detailConf.infoMethod || 'GET',
      headers: detailConf.infoHeaders || {},
      body: detailConf.infoBody,
      contentType: detailConf.infoContentType,
      json: true
    };
    infoData = fetchSync(url, opts);
    if (!infoData) return null;
  }
  let listUrl = detailConf.listApi;
  let replaceMap = { ...extra, ...(infoData || {}) };
  listUrl = listUrl.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(replaceMap[k] || ''));
  let listOpts = {
    method: detailConf.listMethod || 'GET',
    headers: detailConf.listHeaders || {},
    body: detailConf.listBody,
    contentType: detailConf.listContentType,
    json: true
  };
  // 若为POST且body需要变量替换
  if (listOpts.body && typeof listOpts.body === 'string') {
    listOpts.body = listOpts.body.replace(/\{(\w+)\}/g, (_, k) => replaceMap[k] || '');
  }
  let listJson = fetchSync(listUrl, listOpts);
  if (!listJson) return null;
  let listParse = detailConf.listParse || { type: 'json', dataPath: 'data.list', titleField: 'title', urlField: 'guid' };
  let items = parseItems(listJson, listParse, '');
  if (!items.length) return null;
  let videoList = items.map(item => `${item.title}$${item.url}`);
  return {
    vod_name: extra.name || source.name,
    vod_pic: extra.pic || defaultPic,
    type_name: infoData?.channel || '',
    vod_year: extra.year || '',
    vod_remarks: extra.date || '',
    vod_director: extra.topicId || '',
    vod_content: detailConf.content || '',
    vod_play_from: detailConf.playFrom || source.name,
    vod_play_url: videoList.join('#')
  };
}

// 直播详情（同 v22，略）
function handleLiveDetail(source, tid, selectedTab, showMode) { /* ... 同前 ... */ }

// ---------- CMS 标准接口 ----------
function init(extend) {
  log('零硬编码通用爬虫 v23 初始化 (支持自定义请求头/体)');
  // 解析 ext 同 v22，略...
}

function home() { /* 同 v22 */ }
function homeVod() { return JSON.stringify({ list: [] }); }
function category(tid, pg, filter, extend) { /* 同 v22，调用 handleCategory */ }
function detail(vodId) { /* 同 v22，调用 handleLiveDetail 或 handleVodDetail */ }
function play(flag, id, vipFlags) { return JSON.stringify({ parse: 0, url: id }); }
function search(wd, quick) { return JSON.stringify({ list: [] }); }

__JS_SPIDER__ = { init, home, homeVod, category, detail, play, search };