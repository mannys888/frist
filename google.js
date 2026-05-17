/**
 * universal_spider_v35.js (全能旗舰版)
 * 特性：
 *   - 支持直播源（txt/m3u）和点播合集（series）
 *   - 支持 customHandlers 完全配置驱动（无需改动脚本）
 *   - 自动适配 TVBox/OK 应用的详情选集规范
 *   - 增强请求头、缓存、重试
 *   - 所有解析规则由 ext 配置定义
 * 使用：复制整个脚本到 TVBox 的爬虫地址或本地文件，ext 配置按示例填写
 */

// ========== 全局常量 ==========
const DATA_DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.8",
  "Connection": "keep-alive"
};

const VERSION = "universal v3.5 (旗舰版)";
const RKEY = "universal_spider";
let def_pic = "https://avatars.githubusercontent.com/u/97389433?s=120&v=4";
let debugMode = true;
let defaultTimeout = 8000;

// 配置存储
let __ext_config = { sources: [], global: {}, customHandlers: {} };
let cache_data = {};
let showMode = "groups";    // groups / all
let groupDict = {};

// ========== 工具函数 ==========
function print(any) {
  if (!debugMode) return;
  if (typeof any === "object") {
    try { console.log(JSON.stringify(any)); } catch(e) { console.log(any); }
  } else { console.log(any); }
}
function setItem(k, v) { local.set(RKEY, k, v); print(`设置 ${k}=${v}`); }
function getItem(k, d) { return local.get(RKEY, k) || d; }
function sleep(ms) { let start = Date.now(); while(Date.now() - start < ms); }

// ========== 智能请求（带重试、默认头、动态Referer） ==========
function getDynamicHeaders(url) {
  let headers = {};
  let match = url.match(/^(https?:\/\/[^/]+)/);
  if (match) headers["Referer"] = match[1] + "/";
  if (url.includes("cntv.cn") || url.includes("cctv.com")) headers["Origin"] = "https://tv.cctv.com";
  if (url.includes("bilibili.com")) headers["Referer"] = "https://www.bilibili.com/";
  return headers;
}

function httpRequest(url, options = {}) {
  let method = options.method || "GET";
  let headers = { ...DATA_DEFAULT_HEADERS, ...getDynamicHeaders(url), ...(options.headers || {}) };
  if (options.cookie) headers["Cookie"] = options.cookie;
  let reqOptions = { method, headers, timeout: options.timeout || defaultTimeout };
  if (options.body) {
    reqOptions.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }
  let retry = options.retry || 2;
  for (let i = 0; i <= retry; i++) {
    try {
      let resp = req(url, reqOptions);
      resp.json = () => resp.content ? JSON.parse(resp.content) : null;
      resp.text = () => resp.content || "";
      return resp;
    } catch(e) {
      if (i === retry) throw e;
      print(`请求失败，重试${i+1}/${retry}: ${url} - ${e.message}`);
      sleep(500);
    }
  }
}

// 带缓存的数据源请求
function fetchSource(url, sourceConfig = {}) {
  if (cache_data[url]) return cache_data[url];
  let opts = {
    method: sourceConfig.method || "GET",
    headers: sourceConfig.headers || {},
    body: sourceConfig.body,
    timeout: sourceConfig.timeout,
    retry: sourceConfig.retry
  };
  let resp = httpRequest(url, opts);
  let content = resp.text();
  // 自动转换 M3U 为通用格式
  if (!sourceConfig.type && content.includes("#EXTM3U")) content = convertM3uToNormal(content);
  cache_data[url] = content;
  return content;
}

// M3U 转简单格式
function convertM3uToNormal(m3u) {
  let lines = m3u.split("\n");
  let result = "", tv = "", group = "";
  for (let line of lines) {
    line = line.trim();
    if (line.startsWith("#EXTINF:")) {
      let g = line.match(/group-title="([^"]*)"/);
      if (g) group = g[1];
      let title = line.split(",")[1];
      tv = title || "直播流";
    } else if (line && !line.startsWith("#") && line.match(/^https?:\/\//)) {
      result += (group ? `${group},${line}\n` : `${tv},${line}\n`);
    }
  }
  return result.trim();
}

// ========== 列表解析器（文本/JSON/M3U） ==========
function parseList(content, parseConfig, baseUrl) {
  if (!content) return [];
  let items = [];
  let type = parseConfig.type || "text";
  
  if (type === "json") {
    try {
      let json = typeof content === "string" ? JSON.parse(content) : content;
      let data = json;
      if (parseConfig.jsonPath) {
        let parts = parseConfig.jsonPath.split(".");
        for (let p of parts) data = data[p];
      }
      if (!Array.isArray(data)) data = data || [];
      for (let item of data) {
        let title = parseConfig.titleField ? item[parseConfig.titleField] : (item.title || item.name);
        let url = parseConfig.urlField ? item[parseConfig.urlField] : (item.url || item.link || item.play_url);
        if (title && url) items.push({ title, url });
      }
    } catch(e) { print("JSON解析失败: " + e.message); }
  } 
  else if (type === "m3u") {
    let lines = content.split(/\r?\n/);
    let currentTitle = "";
    for (let line of lines) {
      line = line.trim();
      if (line.startsWith("#EXTINF:")) {
        let match = line.match(/#EXTINF:.*?,(.*)/);
        if (match) currentTitle = match[1];
      } else if (line && !line.startsWith("#") && line.match(/^https?:\/\//i)) {
        items.push({ title: currentTitle || "直播流", url: line });
        currentTitle = "";
      }
    }
  }
  else {
    let sep = parseConfig.line_sep || ",";
    let lines = content.split(/\r?\n/);
    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith("#") || line.includes("#genre#")) continue;
      let idx = line.indexOf(sep);
      if (idx > 0) {
        let title = line.substring(0, idx).trim();
        let rest = line.substring(idx+1).trim();
        let urlMatch = rest.match(/^(https?:\/\/[^\s]+)/);
        if (urlMatch) items.push({ title, url: urlMatch[1] });
        else if (rest.match(/^https?:\/\//i)) items.push({ title, url: rest });
      } else if (line.match(/^https?:\/\//i)) {
        items.push({ title: "媒体文件", url: line });
      }
    }
  }
  return items;
}

// ========== 分组工具 ==========
function splitArray(arr, parseFn) {
  if (!arr.length) return [];
  let result = [[arr[0]]];
  for (let i = 1; i < arr.length; i++) {
    let found = -1;
    for (let j = 0; j < result.length; j++) {
      if (parseFn && result[j].map(parseFn).includes(parseFn(arr[i]))) found = j;
      else if (!parseFn && result[j].includes(arr[i])) found = j;
    }
    if (found >= result.length-1) result.push([arr[i]]);
    else result[found+1].push(arr[i]);
  }
  return result;
}

// ========== customHandler 执行器 ==========
function executeHandler(handlerName, ctx) {
  let handler = __ext_config.customHandlers?.[handlerName];
  if (!handler) return null;
  try {
    if (typeof handler === "function") return handler(ctx);
    if (typeof handler === "string") {
      let fn = new Function("ctx", "return (" + handler + ")(ctx);");
      return fn(ctx);
    }
  } catch(e) { print(`执行${handlerName}失败: ${e.message}`); }
  return null;
}

// ========== 初始化和首页 ==========
function init(ext) {
  print(VERSION + " 初始化");
  let configData = null;
  if (typeof ext === "object") configData = ext;
  else if (typeof ext === "string") {
    if (ext.startsWith("http")) {
      let resp = httpRequest(ext.split(";")[0]);
      configData = resp.json();
    } else {
      try { configData = JSON.parse(ext); } catch(e) {}
    }
  }
  if (configData) {
    if (Array.isArray(configData) && configData[0]?.name && configData[0]?.url) __ext_config.sources = configData;
    else if (configData.sources) __ext_config = configData;
    if (configData.global) {
      if (configData.global.defaultPic) def_pic = configData.global.defaultPic;
      if (configData.global.defaultTimeout) defaultTimeout = configData.global.defaultTimeout;
      if (configData.global.debug !== undefined) debugMode = configData.global.debug;
    }
    if (configData.customHandlers) __ext_config.customHandlers = configData.customHandlers;
  }
  showMode = getItem("showMode", "groups");
  groupDict = JSON.parse(getItem("groupDict", "{}"));
  print(`加载 ${__ext_config.sources.length} 个分类`);
}

function home() {
  let classes = __ext_config.sources.map(s => ({ type_id: s.name, type_name: s.name }));
  let filters = [{ key: "show", name: "播放展示", value: [{ n: "多线路分组", v: "groups" }, { n: "单线路", v: "all" }] }];
  let filterDict = {};
  classes.forEach(c => { filterDict[c.type_id] = filters; });
  return JSON.stringify({ class: classes, filters: filterDict });
}
function homeVod() { return JSON.stringify({ list: [] }); }

// ========== 分类列表 ==========
function category(tid, pg, filter, extend) {
  let fl = filter ? extend : {};
  if (fl.show) { showMode = fl.show; setItem("showMode", showMode); }
  let source = __ext_config.sources.find(s => s.name === tid);
  if (!source) return JSON.stringify({ list: [] });
  
  // 优先使用 handler
  if (source.handler && __ext_config.customHandlers[source.handler]) {
    let ctx = { tid, pg: parseInt(pg) || 1, filter: fl, source, globalConfig: __ext_config.global };
    let result = executeHandler(source.handler, ctx);
    if (result && Array.isArray(result)) {
      let videos = result.map(v => ({
        vod_id: v.vod_id,
        vod_name: v.vod_name,
        vod_pic: v.vod_pic || def_pic,
        vod_remarks: v.vod_remarks || ""
      }));
      return JSON.stringify({ list: videos, page: 1, pagecount: 1, limit: videos.length, total: videos.length });
    } else if (result && result.list) return JSON.stringify(result);
  }
  
  // 普通文本源（#分组# 格式）
  if (parseInt(pg) > 1) return JSON.stringify({ list: [] });
  let html = fetchSource(source.url, source);
  let arr = html.match(/.*?[,，]#[\s\S].*?#/g) || [];
  let list = [];
  for (let it of arr) {
    let vname = it.split(/[,，]/)[0];
    let vtab = it.match(/#(.*?)#/)[0];
    let vod_id = source.url + "$" + vname + "###single";
    list.push({ vod_name: vname, vod_id, vod_pic: def_pic, vod_remarks: vtab });
  }
  return JSON.stringify({ list, page: 1, pagecount: 1, limit: list.length, total: list.length });
}

// ========== 详情页（支持选集） ==========
function detail(tid) {
  // 处理搜索历史
  if (tid.includes("#search#")) {
    let left = tid.split("###")[0];
    let sourceUrl = left.split("$")[0];
    let wd = left.split("$")[1];
    let source = __ext_config.sources.find(s => s.url === sourceUrl);
    if (source && groupDict[sourceUrl]) {
      let playUrl = groupDict[sourceUrl].map(x => x.replace(",", "$")).join("#");
      let vod = {
        vod_id: tid, vod_name: "搜索:" + wd, type_name: "搜索结果", vod_pic: def_pic,
        vod_play_from: "来自搜索:" + sourceUrl, vod_play_url: playUrl, vod_remarks: VERSION
      };
      return JSON.stringify({ list: [vod] });
    }
    return JSON.stringify({ list: [] });
  }
  
  let parts = tid.split("###");
  let mode = parts.length > 1 ? parts[1] : "single";
  let left = parts[0];
  let sourceUrl = left.split("$")[0];
  let tab = left.split("$")[1];
  let source = __ext_config.sources.find(s => s.url === sourceUrl);
  
  // 如果找不到 source，尝试用 detailHandler fallback
  if (!source) {
    for (let s of __ext_config.sources) {
      if (s.detailHandler && __ext_config.customHandlers[s.detailHandler]) {
        let ctx = { vodId: tid, mode, sourceUrl: null, tab: null, source: s, globalConfig: __ext_config.global };
        let result = executeHandler(s.detailHandler, ctx);
        if (result && result.list) return JSON.stringify(result);
      }
    }
    return JSON.stringify({ list: [] });
  }
  
  // 优先使用 detailHandler
  if (source.detailHandler && __ext_config.customHandlers[source.detailHandler]) {
    let ctx = { vodId: tid, mode, sourceUrl, tab, source, globalConfig: __ext_config.global };
    let result = executeHandler(source.detailHandler, ctx);
    if (result && result.list) return JSON.stringify(result);
  }
  
  // 系列合集模式
  if (mode === "series") {
    let content = fetchSource(sourceUrl, source);
    let baseDir = sourceUrl.substring(0, sourceUrl.lastIndexOf("/")+1);
    let parseCfg = source.parseConfig || {};
    let episodes = parseList(content, parseCfg, baseDir);
    if (!episodes.length) return JSON.stringify({ list: [] });
    let playUrl = episodes.map(ep => `${ep.title}$${ep.url}`).join("#");
    let vodName = parseCfg.collectionName || source.name + "合集";
    let vod = {
      vod_id: tid, vod_name: vodName, vod_pic: def_pic, type_name: "连续剧",
      vod_play_from: source.name, vod_play_url: playUrl, vod_remarks: `共${episodes.length}集`
    };
    return JSON.stringify({ list: [vod] });
  }
  
  // 普通分组模式
  let html = fetchSource(sourceUrl, source);
  let escTab = tab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let regex = new RegExp(`.*?${escTab}[,，]#[\\s\\S].*?#`);
  let match = html.match(regex);
  if (!match) return JSON.stringify({ list: [] });
  let rest = html.split(match[0])[1];
  if (rest.match(/.*?[,，]#[\s\S].*?#/)) rest = rest.split(rest.match(/.*?[,，]#[\s\S].*?#/)[0])[0];
  let lines = rest.trim().split("\n").filter(l => l.trim());
  let items = lines.map(l => { let [t, u] = l.split(","); return t + "$" + u; });
  let playUrl, playFrom;
  if (showMode === "groups") {
    let groups = splitArray(items, x => x.split("$")[0]);
    let tabs = groups.map((_,i) => i===0 ? source.name+"1" : ` ${i+1} `);
    playUrl = groups.map(g => g.join("#")).join("$$$");
    playFrom = tabs.join("$$$");
  } else {
    playUrl = items.join("#");
    playFrom = source.name;
  }
  let vod = {
    vod_id: tid, vod_name: source.name + "|" + tab, type_name: "直播列表", vod_pic: def_pic,
    vod_play_from: playFrom, vod_play_url: playUrl, vod_remarks: VERSION
  };
  return JSON.stringify({ list: [vod] });
}

// ========== 播放 ==========
function play(flag, id, vip) {
  // 尝试 playHandler
  for (let src of __ext_config.sources) {
    if (src.playHandler && __ext_config.customHandlers[src.playHandler]) {
      let ctx = { flag, id, vip, source: src };
      let result = executeHandler(src.playHandler, ctx);
      if (result && result.url) return JSON.stringify(result);
    }
  }
  // 默认
  let parse = /m3u8|ts|flv/.test(id) ? 0 : 1;
  return JSON.stringify({ parse, playUrl: "", url: id });
}

// ========== 搜索（简单遍历） ==========

function search(wd, quick) {
  let results = [];
  // 1. searchHandler 优先
  for (let src of __ext_config.sources) {
    if (src.searchHandler && __ext_config.customHandlers[src.searchHandler]) {
      let ctx = { wd, quick, source: src, globalConfig: __ext_config.global };
      let ret = executeHandler(src.searchHandler, ctx);
      if (ret && Array.isArray(ret)) results.push(...ret);
      else if (ret && ret.list) results.push(...ret.list);
    }
  }
  // 2. 普通源：支持 {wd} 替换和标题匹配
  for (let src of __ext_config.sources) {
    if (src.url && !src.handler && !src.searchHandler) {
      let url = src.url.replace(/\{wd\}/g, encodeURIComponent(wd));
      let content = fetchSource(url, src);
      let items = parseList(content, src.parseConfig || {}, "");
      for (let m of items) {
        if (m.title.includes(wd)) {
          results.push({
            vod_id: m.url + "###single",
            vod_name: `[${src.name}] ${m.title}`,
            vod_pic: def_pic,
            vod_remarks: "搜索"
          });
        }
      }
    }
  }
  return JSON.stringify({ list: results });
}

export default { init, home, homeVod, category, detail, play, search };