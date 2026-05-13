/**
 * universal_spider_v29.js (基于 v27 成功版，为数据源请求增加默认头)
 * 特点：
 *   - ext 读取逻辑与 v27 完全相同（保证能读）
 *   - 请求直播源/TXT/JSON/M3U 时自动添加 User-Agent、Referer 等
 *   - 保留所有 join 逻辑 (# 和 $$$)
 */

// ========== 新增：默认请求头（仅用于数据源请求） ==========
const DATA_DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
  "Connection": "keep-alive"
};

// 动态 Referer（根据 URL 域名）
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

// ========== 以下为 v27 原版（未改动的部分） ==========
String.prototype.rstrip = function (chars) {
  let regex = new RegExp(chars + "$");
  return this.replace(regex, "");
};

const request_timeout = 5000;
const RKEY = 'universal_spider';
const VERSION = 'universal v2.9 (增强数据源请求头)';
const UA = 'Mozilla/5.0';
let def_pic = 'https://avatars.githubusercontent.com/u/97389433?s=120&v=4';
const tips = `\n${VERSION}`;

// 远程拉取的视频列表（init 时预加载）
let remoteUnlockVideos = null;

// 外部视频列表（可从 ext 配置中加载）
let externalUnlockVideos = null;

let __ext_config = { sources: [], global: {} };
let cache_data = {};
let showMode = 'groups';
let groupDict = {};


// 1️⃣========== 🔻密码锁配置 🔻==========
const UNLOCK_VALID_MINUTES = 10;      // 解锁有效分钟数，可改

// 获取当前时间密码（HHMM）
function getCurrentTimePassword() {
    let now = new Date();
    let hours = now.getHours().toString().padStart(2,'0');
    let minutes = now.getMinutes().toString().padStart(2,'0');
    return hours + minutes;
}

function verifyDynamicPassword(input) {
    return input === getCurrentTimePassword();
}

// 状态变量
let unlocked = false;
let unlockTime = 0;

function setUnlocked(status) {
    if (status) {
        unlockTime = Date.now();
        setItem('global_unlock_time', unlockTime.toString());
        setItem('global_unlock', 'true');
    } else {
        setItem('global_unlock', 'false');
        setItem('global_unlock_time', '0');
        unlockTime = 0;
    }
    unlocked = status;
}

function getUnlocked() {
    let stored = getItem('global_unlock', 'false') === 'true';
    if (!stored) return false;
    let storedTime = parseInt(getItem('global_unlock_time', '0'));
    if (storedTime === 0) return false;
    let diffMinutes = (Date.now() - storedTime) / (1000 * 60);
    if (diffMinutes > UNLOCK_VALID_MINUTES) {
        setUnlocked(false);
        return false;
    }
    unlockTime = storedTime;
    return true;
}

// 虚拟键盘数据
function getKeyboardVideos() {
    let items = [];
    for (let i = 0; i <= 9; i++) {
        items.push({ vod_id: `__UNLOCK_KEY__${i}`, vod_name: `${i}`, vod_pic: def_pic, vod_remarks: '' });
    }
    items.push({ vod_id: '__UNLOCK_BACKSPACE', vod_name: '⌫ 删除', vod_pic: def_pic, vod_remarks: '' });
    items.push({ vod_id: '__UNLOCK_CLEAR', vod_name: '🗑 清除', vod_pic: def_pic, vod_remarks: '' });
    return items;
}

let unlockBuffer = '';
let unlockMode = false;



/**2️⃣2️⃣2️⃣2️⃣
 * 超级通用解析器 - 一码行天下
 * 支持格式：JSON, M3U, RSS, TXT(自定义分隔符), 纯URL列表, 混合格式
 * @param {string} content - 原始文本
 * @param {object} opt - 配置参数（可选，全部有默认）
 * @returns {Array<{title: string, url: string}>}
 */
function smartParseList(content, opt = {}) {
    if (!content || typeof content !== 'string') return [];
    
    // 默认配置
    const cfg = {
        // 通用
        defaultTitle: '媒体流',
        trimTitle: true,
        trimUrl: true,
        skipEmptyLines: true,
        skipCommentLines: true,      // 跳过 # 或 // 开头的行
        commentChars: ['#', '//'],   // 注释标记
        
        // TXT 专用
        lineSep: ',',                 // 分隔符，支持字符串或正则
        allowSepSpaces: true,        // 是否允许分隔符前后有空格
        
        // JSON 专用
        jsonPath: null,              // 如 'data.list' 或 'result.videos'
        titleFields: ['title', 'name', '节目名', 'vod_name', 'episode', 'fulltitle'],
        urlFields: ['url', 'link', 'play_url', 'src', 'href', 'm3u8', 'stream'],
        
        // M3U 专用
        m3uUseGroupTitle: false,     // 是否在标题前加上分组名
        
        // RSS 专用
        rssTitleTag: 'title',
        rssLinkTag: 'link',
        
        // 自动识别开关
        autoDetect: true,            // 自动根据内容判断格式
        forceType: null,             // 强制指定类型: 'json', 'm3u', 'rss', 'txt'
        
        // 调试
        debug: false
    };
    
    // 合并用户配置
    Object.assign(cfg, opt);
    
    // 自动识别类型
    let type = cfg.forceType;
    if (cfg.autoDetect && !type) {
        const trimmed = content.trim();
        if (/^[\s]*[\[\{]/i.test(trimmed)) type = 'json';
        else if (trimmed.startsWith('#EXTM3U')) type = 'm3u';
        else if (/<rss|<feed|<channel|<item/i.test(trimmed)) type = 'rss';
        else type = 'txt';
    }
    
    if (cfg.debug) print(`[smartParse] 检测到类型: ${type}`);
    
    // ----- JSON 处理 -----
    if (type === 'json') {
        try {
            let data = JSON.parse(content);
            // 根据 jsonPath 提取数据
            if (cfg.jsonPath) {
                const parts = cfg.jsonPath.split('.');
                for (let p of parts) data = data[p];
            }
            // 确保是数组
            let arr = Array.isArray(data) ? data : (data ? [data] : []);
            const result = [];
            const titleFields = cfg.titleFields.map(f => f.toLowerCase());
            const urlFields = cfg.urlFields.map(f => f.toLowerCase());
            
            for (let item of arr) {
                if (!item || typeof item !== 'object') continue;
                let title = null, url = null;
                // 尝试所有可能的大小写和字段名
                const lowerItem = {};
                for (let k in item) lowerItem[k.toLowerCase()] = item[k];
                
                for (let tf of titleFields) {
                    if (lowerItem[tf]) { title = lowerItem[tf]; break; }
                }
                for (let uf of urlFields) {
                    if (lowerItem[uf]) { url = lowerItem[uf]; break; }
                }
                if (title && url) {
                    if (cfg.trimTitle) title = String(title).trim();
                    if (cfg.trimUrl) url = String(url).trim();
                    result.push({ title, url });
                }
            }
            if (cfg.debug) print(`[smartParse] JSON解析到 ${result.length} 条`);
            return result;
        } catch(e) {
            if (cfg.debug) print(`[smartParse] JSON解析失败: ${e.message}`);
            // 降级尝试 TXT 解析
        }
    }
    
    // ----- M3U 处理 -----
    if (type === 'm3u') {
        const lines = content.split(/\r?\n/);
        const result = [];
        let currentTitle = '';
        let currentGroup = '';
        for (let line of lines) {
            line = line.trim();
            if (line.startsWith('#EXTINF:')) {
                // 提取标题和组别
                const groupMatch = line.match(/group-title="([^"]*)"/);
                if (groupMatch) currentGroup = groupMatch[1];
                const titleMatch = line.match(/#EXTINF:.*?,(.*)/);
                if (titleMatch) currentTitle = titleMatch[1].trim();
            } else if (line && !line.startsWith('#') && line.match(/^https?:\/\//i)) {
                let title = currentTitle || cfg.defaultTitle;
                if (cfg.m3uUseGroupTitle && currentGroup) title = `[${currentGroup}] ${title}`;
                result.push({ title, url: line });
                currentTitle = '';
                currentGroup = '';
            }
        }
        if (cfg.debug) print(`[smartParse] M3U解析到 ${result.length} 条`);
        return result;
    }
    
    // ----- RSS / XML 处理 -----
    if (type === 'rss') {
        try {
            // 简单正则提取
            const titleReg = new RegExp(`<${cfg.rssTitleTag}>(.*?)</${cfg.rssTitleTag}>`, 'gi');
            const linkReg = new RegExp(`<${cfg.rssLinkTag}>(.*?)</${cfg.rssLinkTag}>`, 'gi');
            const titles = [...content.matchAll(titleReg)].map(m => m[1]);
            const links = [...content.matchAll(linkReg)].map(m => m[1]);
            const result = [];
            for (let i = 0; i < Math.min(titles.length, links.length); i++) {
                if (links[i].startsWith('http')) {
                    result.push({ title: titles[i], url: links[i] });
                }
            }
            if (cfg.debug) print(`[smartParse] RSS解析到 ${result.length} 条`);
            return result;
        } catch(e) {
            if (cfg.debug) print(`[smartParse] RSS解析失败: ${e.message}`);
            // 降级 TXT
        }
    }
    
    // ----- TXT / 通用文本处理（最强大）-----
    // 支持任意分隔符，自动处理空格，支持纯URL行
    const lines = content.split(/\r?\n/);
    const result = [];
    // 构建分隔符正则：允许前后空白
    let sepRegex;
    if (cfg.lineSep instanceof RegExp) {
        sepRegex = new RegExp(`^(.+?)${cfg.lineSep.source}\\s*(https?://\\S+)`, 'i');
    } else {
        const escapedSep = cfg.lineSep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (cfg.allowSepSpaces) {
            sepRegex = new RegExp(`^(.+?)${escapedSep}\\s*(https?://\\S+)`, 'i');
        } else {
            sepRegex = new RegExp(`^(.+?)${escapedSep}(https?://\\S+)`, 'i');
        }
    }
    
    for (let rawLine of lines) {
        let line = rawLine;
        if (cfg.skipEmptyLines && line.trim() === '') continue;
        // 跳过注释行
        if (cfg.skipCommentLines) {
            let isComment = false;
            for (let cmt of cfg.commentChars) {
                if (line.trim().startsWith(cmt)) { isComment = true; break; }
            }
            if (isComment) continue;
        }
        
        // 匹配 标题分隔符URL
        let match = line.match(sepRegex);
        if (match) {
            let title = match[1];
            let url = match[2];
            if (cfg.trimTitle) title = title.trim();
            if (cfg.trimUrl) url = url.trim();
            result.push({ title, url });
            continue;
        }
        
        // 纯 URL 行（无标题）
        if (line.match(/^https?:\/\//i)) {
            result.push({ title: cfg.defaultTitle, url: line.trim() });
            continue;
        }
        
        // 其他情况：忽略（可记录日志）
        if (cfg.debug) print(`[smartParse] 跳过无法解析的行: ${line.substring(0, 50)}`);
    }
    if (cfg.debug) print(`[smartParse] TXT解析到 ${result.length} 条`);
    return result;
}

// =========🔺密码锁核心结束 🔺============


function setItem(k, v) { local.set(RKEY, k, v); console.log(`设置 ${k} => ${v}`); }
function getItem(k, v) { return local.get(RKEY, k) || v; }
function clearItem(k) { local.delete(RKEY, k); }

function print(any) {
  any = any || '';
  if (typeof any == 'object' && Object.keys(any).length > 0) {
    try { any = JSON.stringify(any); console.log(any); } catch (e) { console.log(typeof any + ':' + any.length); }
  } else if (typeof any == 'object') { console.log('null object'); } else { console.log(any); }
}

function getHome(url) {
  if (!url) return '';
  let tmp = url.split('//');
  url = tmp[0] + '//' + tmp[1].split('/')[0];
  try { url = decodeURIComponent(url); } catch (e) {}
  return url;
}

// ========== 原始 httpRequest（用于 ext 请求，不带额外头，保证成功） ==========
function httpRequest(url, options = {}) {
  let method = options.method || 'GET';
  let headers = { 'User-Agent': UA, ...(options.headers || {}) };
  if (options.referer) headers['Referer'] = options.referer;
  if (options.contentType) headers['Content-Type'] = options.contentType;
  let reqOptions = { method, headers, timeout: options.timeout || request_timeout };
  if (options.body) {
    reqOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
  }
  try {
    const res = req(url, reqOptions);
    res.json = () => res && res.content ? JSON.parse(res.content) : null;
    res.text = () => res && res.content ? res.content : '';
    return res;
  } catch (e) {
    print(`请求失败 ${url}: ${e.message}`);
    return { json: () => null, text: () => '', content: '' };
  }
}

// ========== 新增：用于数据源的请求（自带默认请求头） ==========
function httpRequestForData(url, options = {}) {
  let method = options.method || 'GET';
  let dynamicHeaders = getDynamicHeaders(url);
  let headers = { ...DATA_DEFAULT_HEADERS, ...dynamicHeaders, ...(options.headers || {}) };
  if (options.referer) headers['Referer'] = options.referer;
  if (options.contentType) headers['Content-Type'] = options.contentType;
  let reqOptions = { method, headers, timeout: options.timeout || request_timeout };
  if (options.body) {
    reqOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
  }
  try {
    const res = req(url, reqOptions);
    res.json = () => res && res.content ? JSON.parse(res.content) : null;
    res.text = () => res && res.content ? res.content : '';
    return res;
  } catch (e) {
    print(`数据源请求失败 ${url}: ${e.message}`);
    return { json: () => null, text: () => '', content: '' };
  }
}

// ========== 以下函数与 v27 完全一致，仅修改 fetchSource 使用新请求函数 ==========
function parseSource(content, sourceConfig, baseUrl) {
  let items = [];
  let type = sourceConfig.type || 'text';
  if (type === 'm3u') {
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
    return items;
  } 
  else if (type === 'json') {
    try {
      let json = JSON.parse(content);
      let dataArr = json;
      if (sourceConfig.json_path) {
        let parts = sourceConfig.json_path.split('.');
        for (let p of parts) dataArr = dataArr[p];
      }
      if (!Array.isArray(dataArr)) dataArr = dataArr || [];
      for (let item of dataArr) {
        let title = sourceConfig.title_field ? item[sourceConfig.title_field] : (item.title || item.name);
        let url = sourceConfig.url_field ? item[sourceConfig.url_field] : (item.url || item.play_url);
        if (title && url) items.push({ title, url });
      }
    } catch(e) { print("JSON解析失败: " + e.message); }
    return items;
  }
  else {
    let lines = content.split(/\r?\n/);
    let sep = sourceConfig.line_sep || ',';
    let escapedSep = sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let regex = new RegExp(`^(.+?)${escapedSep}\\s*(https?://\\S+)`, 'i');
   
    //let regex = new RegExp(`^(.+?)${sep}(https?://\\S+)`);
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
    return items;
  }
}

// 修改：fetchSource 使用 httpRequestForData，而不是原来的 httpRequest
function fetchSource(url, sourceConfig) {
  if (cache_data[url]) return cache_data[url];
  let options = {
    method: sourceConfig.method || 'GET',
    headers: sourceConfig.headers || {},
    body: sourceConfig.body,
    contentType: sourceConfig.contentType,
    timeout: sourceConfig.timeout
  };
  let resp = httpRequestForData(url, options);
  let content = resp.text();
  if (!sourceConfig.type && content.includes('#EXTM3U')) {
    content = convertM3uToNormal(content);
  }
  cache_data[url] = content;
  return content;
}

function convertM3uToNormal(m3u) {
  try {
    const lines = m3u.split('\n');
    let result = '', TV = '', flag = '#m3u#', currentGroupTitle = '';
    for (let line of lines) {
      if (line.startsWith('#EXTINF:')) {
        const groupTitle = line.split('"')[1].trim();
        TV = line.split('"')[2].substring(1);
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
      if (parse && result[j].map(parse).includes(parse(arr[i]))) {
        index = j;
      } else if ((!parse) && result[j].includes(arr[i])) {
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

function gen_group_dict(arr, parse) {
  let dict = {};
  arr.forEach((it) => {
    let k = it.split(',')[0];
    if (parse && typeof parse === 'function') k = parse(k);
    if (!dict[k]) dict[k] = [it];
    else dict[k].push(it);
  });
  return dict;
}

function parseSeriesEpisodes(content, baseUrl, seriesConfig) {
  if (seriesConfig && seriesConfig.parseConfig) {
    return parseSource(content, seriesConfig.parseConfig, baseUrl);
  }
  let trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      let json = JSON.parse(trimmed);
      let episodes = json.episodes || json.list || json.data || json.items || (Array.isArray(json) ? json : []);
      let items = [];
      for (let ep of episodes) {
        let title = ep.title || ep.name || ep.episode || "第" + (ep.index || '?') + "集";
        let url = ep.url || ep.link || ep.src || ep.play_url;
        if (title && url) items.push({ title, url });
      }
      if (items.length) return items;
    } catch(e) {}
  }
  if (content.includes("#EXTM3U")) {
    return parseSource(content, { type: "m3u" }, baseUrl);
  }
  return parseSource(content, { separators: [',', '|', '$', '\t'] }, baseUrl);
}

function handleVodSource(vodConfig, extraParams) {
  if (!vodConfig || !vodConfig.listApi) return null;
  let infoData = null;
  if (vodConfig.infoApi) {
    let infoUrl = vodConfig.infoApi;
    for (let [k, v] of Object.entries(extraParams)) {
      infoUrl = infoUrl.replace(new RegExp(`\\{${k}\\}`, 'g'), encodeURIComponent(v));
    }
    let infoOpts = {
      method: vodConfig.infoMethod || 'GET',
      headers: vodConfig.infoHeaders || {},
      body: vodConfig.infoBody,
      contentType: vodConfig.infoContentType
    };
    let resp = httpRequestForData(infoUrl, infoOpts);
    infoData = resp.json();
  }
  let listUrl = vodConfig.listApi;
  let replaceMap = { ...extraParams, ...(infoData || {}) };
  for (let [k, v] of Object.entries(replaceMap)) {
    listUrl = listUrl.replace(new RegExp(`\\{${k}\\}`, 'g'), encodeURIComponent(v));
  }
  let listOpts = {
    method: vodConfig.listMethod || 'GET',
    headers: vodConfig.listHeaders || {},
    body: vodConfig.listBody,
    contentType: vodConfig.listContentType
  };
  let resp = httpRequestForData(listUrl, listOpts);
  let listJson = resp.json();
  if (!listJson) return null;
  let parseConf = vodConfig.listParse || { type: 'json', dataPath: 'data.list', titleField: 'title', urlField: 'guid' };
  let items = parseSource(listJson, parseConf, '');
  if (!items.length) return null;
  let videoList = items.map(item => `${item.title}$${item.url}`);
  let playUrl = videoList.join('#');
  let playFrom = vodConfig.playFrom || '播放源';
  return { playUrl, playFrom, infoData };
}

// ========== ext 配置解析（完全保留 v27 成功逻辑，使用原始 httpRequest） ==========
function init(ext) {

 // 恢复解锁状态（会自动检查是否超时）
    unlocked = getUnlocked();
    print(`解锁状态: ${unlocked ? '已解锁' : '未解锁'}`);

  console.log("当前版本号:" + VERSION);
  let configData = null;
  if (typeof ext == 'object') {
    configData = ext;
    print('ext:object');
  } else if (typeof ext == 'string') {
    if (ext.startsWith('http')) {
      let data_url = ext.split(';')[0];
      print(data_url);
      configData = httpRequest(data_url, { json: true }).json();
    } else {
      try { configData = JSON.parse(ext); } catch(e) { configData = null; }
    }
  }
  if (Array.isArray(configData) && configData.length > 0 && configData[0].name && configData[0].url) {
    __ext_config.sources = configData;
  } else if (configData && configData.sources) {
    __ext_config = configData;
  } else {
    __ext_config.sources = [];
  }
  if (configData && configData.global) {
    __ext_config.global = configData.global;
    if (__ext_config.global.defaultPic) def_pic = __ext_config.global.defaultPic;
    if (__ext_config.global.defaultTimeout) request_timeout = __ext_config.global.defaultTimeout;
  }

  // 🔻加载外部解锁视频列表（如果配置了）
    showMode = getItem('showMode', 'groups');
    groupDict = JSON.parse(getItem('groupDict', '{}'));

    // 加载外部解锁视频列表（ext 配置）
    if (__ext_config.global && __ext_config.global.unlockVideos) {
        externalUnlockVideos = __ext_config.global.unlockVideos;
        print("已加载外部解锁视频列表，共 " + externalUnlockVideos.length + " 个");
    } else {
        externalUnlockVideos = null;
    }

    // 【新增】预加载远程解锁视频列表（推荐将远程地址放在 ext 的 global.unlockVideosUrl 中）
    // 【修改】预加载远程解锁视频列表（支持 JSON 数组 或 TXT 逗号分隔格式）
    let remoteUrl = (__ext_config.global && __ext_config.global.unlockVideosUrl) 
                    ? __ext_config.global.unlockVideosUrl 
                    : "https://raw.githubusercontent.com/mannys888/frist/refs/heads/main/迦南诗歌.txt";  // 默认地址
    try {
        print("正在预加载远程视频列表: " + remoteUrl);
        let resp = httpRequest(remoteUrl, { timeout: 3000 });
        let content = resp.text();
        
        let videoItems = [];
        
        // 1. 尝试作为 JSON 数组解析
        try {
            let json = JSON.parse(content);
            if (Array.isArray(json) && json.length > 0 && json[0].title && json[0].url) {
                videoItems = json;
                print("远程列表解析成功 (JSON 数组格式)");
            } else if (Array.isArray(json)) {
                print("JSON 数组缺少 title/url 字段，尝试 TXT 格式");
            }
        } catch(e) { /* 不是 JSON，继续尝试 TXT */ }
        
        // 2. 若 JSON 无效，尝试作为 TXT 逗号分隔格式解析（利用已有的 parseSource 函数）
        if (videoItems.length === 0) {
            print("尝试作为 TXT 逗号分隔格式解析...");
            // 注意：parseSource 函数需要 type 为 'text' 且 line_sep 为 ','
            //let items = smartParseList(content, { type: 'text', line_sep: ',' }, remoteUrl);
            let items = smartParseList(content, { lineSep: ',' });
            if (items.length > 0) {
                videoItems = items.map(item => ({ title: item.title, url: item.url }));
                print("TXT 解析成功，共 " + videoItems.length + " 个视频");
            } else {
                print("TXT 解析未获取到有效数据");
            }
        }
        
        if (videoItems.length > 0) {
            remoteUnlockVideos = videoItems.filter(item => item && item.title && item.url);
            print("预加载成功，共 " + remoteUnlockVideos.length + " 个视频");
        } else {
            print("远程数据格式无效，无法解析");
            remoteUnlockVideos = null;
        }
    } catch(e) {
        print("预加载远程视频列表失败: " + e.message);
        remoteUnlockVideos = null;
    }

    print('init执行完毕，共 ' + __ext_config.sources.length + ' 个源');
}



function home(filter) {
    

// 被动刷新有效期（在首页调用时检查是否超时）
    if (unlocked) {
        let storedTime = parseInt(getItem('global_unlock_time','0'));
        if (storedTime && (Date.now()-storedTime) > UNLOCK_VALID_MINUTES*60*1000) {
            setUnlocked(false);
            unlocked = false;
        }
    }

    // 未解锁 → 只显示一个解锁分类
    if (!unlocked) {
        let unlockClass = {
            type_id: '__UNLOCK__',
            type_name: '🔒 点击解锁',
            icon: '🔒'
        };
        return JSON.stringify({ class: [unlockClass], filters: {} });
    }

  let classes = __ext_config.sources.map(it => ({
    type_id: it.name,
    type_name: it.name,
  }));
  let filters = [
    { 'key': 'show', 'name': '播放展示', 'value': [{ 'n': '多线路分组', 'v': 'groups' }, { 'n': '单线路', 'v': 'all' }] }
  ];
  let filter_dict = {};
  classes.forEach(it => { filter_dict[it.type_id] = filters; });
  return JSON.stringify({ 'class': classes, 'filters': filter_dict });
}

function homeVod(params) {
  return JSON.stringify({ list: [] });
}

function category(tid, pg, filter, extend) {
    

// ========== 处理解锁分类 ==========
    if (!unlocked && tid === '__UNLOCK__') {
        unlockMode = true;
        unlockBuffer = '';
        let videos = getKeyboardVideos();
        // 在顶部加一个状态条
        videos.unshift({
            vod_id: '__UNLOCK_STATUS_INIT',
            vod_name: '🔐 请输入4位',
            vod_pic: def_pic,
            vod_remarks: '找管理员要0101'
        });
        return JSON.stringify({
            list: videos,
            page: 1, pagecount: 1,
            limit: videos.length,
            total: videos.length
        });
    }

  let fl = filter ? extend : {};
  if (fl.show) {
    showMode = fl.show;
    setItem('showMode', showMode);
  }
  if (parseInt(pg) > 1) return JSON.stringify({ list: [] });
  let source = __ext_config.sources.find(s => s.name === tid);
  if (!source) return JSON.stringify({ list: [] });
  let html = fetchSource(source.url, source);
  let arr = html.match(/.*?[,，]#[\s\S].*?#/g) || [];
  let _list = [];
  for (let it of arr) {
    let vname = it.split(/[,，]/)[0];
    let vtab = it.match(/#(.*?)#/)[0];
    let modeSuffix = (source.parseConfig && source.parseConfig.mode === 'series') ? 'series' : 'single';
    let vod_id = source.url + '$' + vname + '###' + modeSuffix;
    _list.push({
      vod_name: vname,
      vod_id: vod_id,
      vod_pic: def_pic,
      vod_remarks: vtab,
    });
  }
  return JSON.stringify({
    page: 1, pagecount: 1, limit: _list.length, total: _list.length, list: _list,
  });
}

function detail(tid) {
    

 // 处理虚拟键盘按键
  if (unlockMode && tid.startsWith('__UNLOCK_KEY__')) {
    let digit = tid.replace('__UNLOCK_KEY__', '');
    if (digit >= '0' && digit <= '9') {
      if (unlockBuffer.length < 4) {
        unlockBuffer += digit;
        if (unlockBuffer.length === 4) {
        if (verifyDynamicPassword(unlockBuffer)) {
    setUnlocked(true);
    unlocked = true;
    unlockMode = false;
    print("密码正确，解锁成功！");

    // ----- 获取视频列表：远程缓存 > ext 配置 > 内置默认 -----
    let videoList = [];

    // 1. 优先使用预加载的远程列表
    if (remoteUnlockVideos && Array.isArray(remoteUnlockVideos) && remoteUnlockVideos.length > 0) {
        videoList = remoteUnlockVideos;
        print("使用远程预加载视频列表，共 " + videoList.length + " 个");
    }
    // 2. 其次使用 ext 配置中的列表
    else if (externalUnlockVideos && Array.isArray(externalUnlockVideos) && externalUnlockVideos.length > 0) {
        videoList = externalUnlockVideos.filter(item => item && item.title && item.url);
        print("使用 ext 配置视频列表，共 " + videoList.length + " 个");
    }
    // 3. 最后降级为内置默认
    if (videoList.length === 0) {
        videoList = [
            { title: "🎉 庆祝视频 - 精彩剪辑", url: "https://vd2.bdstatic.com/mda-sbehdejw4kmibhkh/576p/h264/1771157811027978795/mda-sbehdejw4kmibhkh.mp4" },
            { title: "📺 第二集 - 花絮彩蛋",   url: "https://vd2.bdstatic.com/mda-qiakr3cmtvs6w0d4/hd/cae_h264/1726065783439501256/mda-qiakr3cmtvs6w0d4.mp4" },
            { title: "🔔 第三集 - 幕后制作",   url: "https://vd3.bdstatic.com/mda-rdkgd5132u941fcr/576p/h264/1745235281540035966/mda-rdkgd5132u941fcr.mp4" }
        ];
        print("未获取到远程或ext列表，使用内置默认");
    }

    const playUrl = videoList.map(item => `${item.title}$${item.url}`).join('#');
    let vod = {
        vod_id: '__UNLOCK_SUCCESS_MULTI',
        vod_name: '🎉 解锁成功！请选择视频播放',
        vod_pic: def_pic,
        type_name: "解锁合集",
        vod_play_from: "庆祝源",
        vod_play_url: playUrl,
        vod_remarks: `共${videoList.length}个视频，密码正确已解锁`
    };
    return JSON.stringify({ list: [vod] });
} else {
    // 密码错误处理（保持原有代码）
    unlockBuffer = '';
    let videos = getKeyboardVideos();
    let statusItem = {
        vod_id: '__UNLOCK_STATUS_ERR_' + Date.now(),
        vod_name: `❌ 密码错误，请重试`,
        vod_pic: def_pic,
        vod_remarks: '找管理员要密码 '
    };
    videos.unshift(statusItem);
    return JSON.stringify({ list: videos });
}
        }
      }
    }
    let videos = getKeyboardVideos();
    let display = '*'.repeat(unlockBuffer.length) + '_'.repeat(4 - unlockBuffer.length);
    let statusItem = {
      vod_id: '__UNLOCK_STATUS_' + unlockBuffer.length + '_' + Date.now(),
      vod_name: `🔐 密码: ${display}`,
      vod_pic: def_pic,
      vod_remarks: '请输入4位数字'
    };
    videos.unshift(statusItem);
    return JSON.stringify({ list: videos });
  }
  if (unlockMode && tid === '__UNLOCK_BACKSPACE') {
    if (unlockBuffer.length > 0) unlockBuffer = unlockBuffer.slice(0, -1);
    let videos = getKeyboardVideos();
    let display = '*'.repeat(unlockBuffer.length) + '_'.repeat(4 - unlockBuffer.length);
    let statusItem = {
      vod_id: '__UNLOCK_STATUS_' + unlockBuffer.length + '_' + Date.now(),
      vod_name: `🔐 密码: ${display}`,
      vod_pic: def_pic,
      vod_remarks: '请输入4位数字'
    };
    videos.unshift(statusItem);
    return JSON.stringify({ list: videos });
  }
  if (unlockMode && tid === '__UNLOCK_CLEAR') {
    unlockBuffer = '';
    let videos = getKeyboardVideos();
    let display = '_'.repeat(4);
    let statusItem = {
      vod_id: '__UNLOCK_STATUS_CLEAR_' + Date.now(),
      vod_name: `🔐 密码: ${display}`,
      vod_pic: def_pic,
      vod_remarks: '请输入4位数字'
    };
    videos.unshift(statusItem);
    return JSON.stringify({ list: videos });
  }
  if (unlocked) unlockMode = false;


  let parts = tid.split('###');
  let mode = parts.length > 1 ? parts[1] : 'single';
  let left = parts[0];
  let sourceUrl = left.split('$')[0];
  let tab = left.split('$')[1];
  let source = __ext_config.sources.find(s => s.url === sourceUrl);
  if (!source) return JSON.stringify({ list: [] });
  
  if (tid.includes('#search#')) {
    let vod_name = tab.replace('#search#', '');
    let vod_play_from = '来自搜索:' + sourceUrl;
    let vod_play_url = groupDict[sourceUrl].map(x => x.replace(',', '$')).join('#');
    return JSON.stringify({
      list: [{
        vod_id: tid, vod_name: '搜索:' + vod_name, type_name: "直播列表", vod_pic: def_pic,
        vod_content: tid, vod_play_from: vod_play_from, vod_play_url: vod_play_url,
        vod_director: tips, vod_remarks: VERSION,
      }]
    });
  }
  
  if (mode === 'series') {
    let seriesUrl = sourceUrl;
    let seriesConfig = __ext_config.series || {};
    let content = fetchSource(seriesUrl, source);
    let baseDir = seriesUrl.substring(0, seriesUrl.lastIndexOf('/') + 1);
    let episodes = parseSeriesEpisodes(content, baseDir, seriesConfig);
    if (!episodes.length) return JSON.stringify({ list: [] });
    let videoList = episodes.map(ep => `${ep.title}$${ep.url}`);
    let playUrl = videoList.join('#');
    let seriesTitle = seriesConfig.title || source.name;
    let vod = {
      vod_id: tid,
      vod_name: seriesTitle + '|' + tab,
      vod_pic: def_pic,
      type_name: "连续剧",
      vod_play_from: seriesConfig.playFrom || source.name,
      vod_play_url: playUrl,
      vod_director: tips,
      vod_remarks: VERSION,
    };
    return JSON.stringify({ list: [vod] });
  }
  
  let html = fetchSource(sourceUrl, source);
  let a = new RegExp(`.*?${tab.replace('(', '\\(').replace(')', '\\)')}[,，]#[\\s\\S].*?#`);
  let b = html.match(a);
  if (!b) return JSON.stringify({ list: [] });
  let c = html.split(b[0])[1];
  if (c.match(/.*?[,，]#[\s\S].*?#/)) {
    let d = c.match(/.*?[,，]#[\s\S].*?#/)[0];
    c = c.split(d)[0];
  }
  let lines = c.trim().split('\n');
  let _list = [];
  for (let line of lines) {
    if (line.trim()) {
      let t = line.trim().split(',')[0];
      let u = line.trim().split(',')[1];
      _list.push(t + '$' + u);
    }
  }
  let vod_name = source.name;
  let vod_play_url, vod_play_from;
  if (showMode === 'groups') {
    let groups = splitArray(_list, x => x.split('$')[0]);
    let tabs = [];
    for (let i = 0; i < groups.length; i++) {
      if (i === 0) tabs.push(vod_name + '1');
      else tabs.push(` ${i + 1} `);
    }
    vod_play_url = groups.map(it => it.join('#')).join('$$$');
    vod_play_from = tabs.join('$$$');
  } else {
    vod_play_url = _list.join('#');
    vod_play_from = vod_name;
  }
  let vod = {
    vod_id: tid,
    vod_name: vod_name + '|' + tab,
    type_name: "直播列表",
    vod_pic: def_pic,
    vod_content: tid,
    vod_play_from: vod_play_from,
    vod_play_url: vod_play_url,
    vod_director: tips,
    vod_remarks: VERSION,
  };
  return JSON.stringify({ list: [vod] });
}

function play(flag, id, flags) {
    // ========== 密码锁检查：确保只有解锁状态下才能播放 ==========
    // 调用 getUnlocked() 会重新验证有效期（超时自动锁定）
    if (!getUnlocked()) {
        print("播放被拒绝：密码锁已过期或未解锁，请重新解锁后再试");
        // 返回一个提示视频（可替换为您自己的提醒视频地址）
        const tipVideo = "https://vd2.bdstatic.com/mda-sbehdejw4kmibhkh/576p/h264/1771157811027978795/mda-sbehdejw4kmibhkh.mp4"; 
        // 注意：此提示视频内容建议是“请返回首页重新解锁”的短暂黑屏或文字提示
        return JSON.stringify({ parse: 1, playUrl: '', url: tipVideo });
    }
    // ========== 原有的播放逻辑（不变） ==========
    // 对于常见直播源格式，强制解析（parse=0）；否则根据是否m3u8判断
    let isLiveSource = /\.(m3u|txt|json|m3u8)$/i.test(id);
    let parse = isLiveSource ? 0 : (/m3u8/.test(id) ? 0 : 1);
    return JSON.stringify({ parse: parse, playUrl: '', url: id });
}

function search(wd, quick) {
  if (__ext_config.sources.length === 0) return JSON.stringify({ list: [] });
  let allLines = [];
  for (let src of __ext_config.sources) {
    let html = fetchSource(src.url, src);
    let lines = html.split('\n').filter(it => it.trim() && it.includes(',') && it.split(',')[1].trim().startsWith('http'));
    allLines.push(...lines);
  }
  let plays = Array.from(new Set(allLines));
  plays = plays.filter(it => it.includes(wd));
  let new_group = gen_group_dict(plays);
  groupDict = Object.assign(groupDict, new_group);
  setItem('groupDict', JSON.stringify(groupDict));
  let _list = [];
  Object.keys(groupDict).forEach((it) => {
    _list.push({
      vod_name: it,
      vod_id: it + '$' + wd + '#search#',
      vod_pic: def_pic,
    });
  });
  return JSON.stringify({ list: _list });
}

export default { init, home, homeVod, category, detail, play, search };