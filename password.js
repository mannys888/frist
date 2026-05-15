// ==================== 通用动态爬虫 v34（全能旗舰版 + 超时跳过增强） ====================
// 功能：
//   - 普通线路（分组/单线路）& 合集模式（系列剧）
//   - 文本/JSON/M3U/RSS 等多格式解析
//   - 全局搜索（支持标题匹配）
//   - 播放器增强（自定义请求头、Referer、Cookie、解析接口）
//   - 特殊站点处理器：加密、登录、动态加载（模拟/可替换真实逻辑）
//   - 动态 Referer / Origin 自动适配
//   - 缓存、重试、超时配置
//   - 【新增】播放超时自动跳过：合集模式下自动生成主备地址，超时失败后切备源或下一集
// ================================================================

String.prototype.rstrip = function (chars) {
  let regex = new RegExp(chars + "$");
  return this.replace(regex, "");
};

// ========== 全局配置 ==========
let __ext_config = { sources: [], global: {} };
let cache_data = {};
let showMode = 'groups';        // groups / all
let groupDict = {};
let debugMode = true;
let defaultTimeout = 8000;
let defaultRetry = 2;
//let def_pic = 'https://avatars.githubusercontent.com/u/97389433?s=120&v=4';
let def_pic = 'https://picsum.photos/200/300?random=1';
const VERSION = 'universal v3.4 (skip timeout enhanced)';
const tips = `\n${VERSION}`;
const RKEY = 'universal_spider';

// 1️⃣========== 🔻 密码锁核心 🔻==========

// 远程拉取的视频列表（init 时预加载）
let remoteUnlockVideos = null;

// 外部视频列表（可从 ext 配置中加载）
let externalUnlockVideos = null;


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

/**
 * 通用列表解析函数（支持 TXT / M3U / JSON / RSS / 自定义分隔符）
 * @param {string} content - 原始文本内容
 * @param {object} options - 可选配置
 *   - type: 强制指定类型 ('txt', 'm3u', 'json', 'rss')，不指定则自动识别
 *   - line_sep: TXT 模式的分隔符，默认 ','
 *   - trim_title: 是否去除标题首尾空格，默认 true
 *   - trim_url: 是否去除 URL 首尾空格，默认 true
 *   - skip_comments: 是否跳过以 '#' 开头的行，默认 true
 *   - skip_empty: 是否跳过空行，默认 true
 *   - default_title: 当行内只有 URL 时使用的默认标题，默认 '直播流'
 * @returns {Array<{title: string, url: string}>}
 */
function parseUniversalList(content, options = {}) {
    const opts = {
        line_sep: ',',
        trim_title: true,
        trim_url: true,
        skip_comments: true,
        skip_empty: true,
        default_title: '直播流',
        ...options
    };

    if (!content || typeof content !== 'string') return [];

    // 自动识别格式（若未指定 type）
    let type = opts.type;
    if (!type) {
        const trimmed = content.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            type = 'json';
        } else if (trimmed.startsWith('#EXTM3U')) {
            type = 'm3u';
        } else if (/<rss|<feed/i.test(trimmed)) {
            type = 'rss';
        } else {
            type = 'txt';
        }
    }

    // 处理 JSON 格式
    if (type === 'json') {
        try {
            let json = JSON.parse(content);
            let dataArr = json;
            if (opts.dataPath) {
                const parts = opts.dataPath.split('.');
                for (let p of parts) dataArr = dataArr[p];
            }
            if (!Array.isArray(dataArr)) dataArr = dataArr || [];
            return dataArr
                .map(item => {
                    let title = opts.titleField ? item[opts.titleField] : (item.title || item.name);
                    let url = opts.urlField ? item[opts.urlField] : (item.url || item.link || item.play_url);
                    if (title && url) return { title: String(title), url: String(url) };
                    return null;
                })
                .filter(v => v);
        } catch(e) {
            print("JSON 解析失败: " + e.message);
            return [];
        }
    }

    // 处理 M3U 格式
    if (type === 'm3u') {
        const lines = content.split(/\r?\n/);
        let items = [];
        let currentTitle = "";
        for (let line of lines) {
            line = line.trim();
            if (line.startsWith("#EXTINF:")) {
                const match = line.match(/#EXTINF:.*?,(.*)/);
                if (match) currentTitle = match[1].trim();
            } else if (line && !line.startsWith("#") && line.match(/^https?:\/\//i)) {
                items.push({ title: currentTitle || opts.default_title, url: line });
                currentTitle = "";
            }
        }
        return items;
    }

    // 处理 RSS / XML 格式
    if (type === 'rss') {
        try {
            const titleRe = /<title>(.*?)<\/title>/g;
            const linkRe = /<link>(.*?)<\/link>/g;
            const titles = [...content.matchAll(titleRe)].map(m => m[1]);
            const links = [...content.matchAll(linkRe)].map(m => m[1]);
            const items = [];
            for (let i = 0; i < Math.min(titles.length, links.length); i++) {
                if (links[i].startsWith('http')) {
                    items.push({ title: titles[i], url: links[i] });
                }
            }
            return items;
        } catch(e) {
            print("RSS 解析失败: " + e.message);
            return [];
        }
    }

    // 处理 TXT 格式（默认）
    const lines = content.split(/\r?\n/);
    const items = [];
    // 构建正则：支持分隔符前后有空白字符
    const sep = opts.line_sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // 转义特殊字符
    const regex = new RegExp(`^(.+?)${sep}\\s*(https?://\\S+)`, 'i');
    
    for (let rawLine of lines) {
        let line = rawLine.trim();
        if (opts.skip_empty && line === '') continue;
        if (opts.skip_comments && line.startsWith('#')) continue;
        
        // 尝试匹配 "标题分隔符URL" 格式
        let match = line.match(regex);
        if (match) {
            let title = match[1];
            let url = match[2];
            if (opts.trim_title) title = title.trim();
            if (opts.trim_url) url = url.trim();
            items.push({ title: title, url: url });
            continue;
        }
        
        // 如果整行就是 URL（没有标题）
        if (line.match(/^https?:\/\//i)) {
            let title = opts.default_title;
            items.push({ title: title, url: line });
        }
    }
    return items;
}

// =========🔺密码锁核心结束 🔺============


// ========== 辅助函数 ==========
function print(any) {
  if (!debugMode) return;
  if (typeof any == 'object' && Object.keys(any).length > 0) {
    try { console.log(JSON.stringify(any)); } catch(e) { console.log(any); }
  } else { console.log(any); }
}
function setItem(k, v) { local.set(RKEY, k, v); print(`设置 ${k} => ${v}`); }
function getItem(k, v) { return local.get(RKEY, k) || v; }

// ========== 智能请求（带重试、缓存、自动 Referer） ==========
function smartRequest(url, options = {}) {
  let method = options.method || 'GET';
  let headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', ...(options.headers || {}) };
  // 动态 Referer
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

// ========== 数据源专用请求（自动处理缓存） ==========
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
  // 自动识别 M3U 并转换
  if (!sourceConfig.type && content.includes('#EXTM3U')) {
    content = convertM3uToNormal(content);
  }
  if (!noCache) cache_data[url] = content;
  return content;
}

// ========== 列表解析（支持 txt/json/m3u/rss） ==========
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
    try {
      let xml = content;
      let titleRe = /<title>(.*?)<\/title>/g;
      let linkRe = /<link>(.*?)<\/link>/g;
      let titles = [...xml.matchAll(titleRe)].map(m => m[1]);
      let links = [...xml.matchAll(linkRe)].map(m => m[1]);
      for (let i = 0; i < Math.min(titles.length, links.length); i++) {
        if (links[i].startsWith('http')) items.push({ title: titles[i], url: links[i] });
      }
    } catch(e) { print("RSS解析失败"); }
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
    //let regex = new RegExp(`^(.+?)${sep}\\s*(https?://\\S+)`);
    let lines = content.split(/\r?\n/);
    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;
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

// M3U 转普通列表（用于分组）
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

// 分组工具
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
function gen_group_dict(arr, parse) {
  let dict = {};
  arr.forEach(it => {
    let k = it.split(',')[0];
    if (parse && typeof parse === 'function') k = parse(k);
    if (!dict[k]) dict[k] = [it];
    else dict[k].push(it);
  });
  return dict;
}

// ========== 特殊站点处理器 ==========
const customHandlers = {
  // 示例：加密站点（需实现真实解密）
  encryptedSite: function(ctx) {
    let { url, parseConfig } = ctx;
    let encryptedContent = fetchSource(url, parseConfig);
    // TODO: 替换为真实的解密函数
    let decryptedContent = myDecrypt(encryptedContent, parseConfig.key || 'defaultKey');
    let items = parseList(decryptedContent, parseConfig, url);
    return items;
  },
  // 示例：需要登录的站点
  loginRequired: function(ctx) {
    let { url, parseConfig } = ctx;
    // 1. 登录获取 Cookie
    let loginUrl = parseConfig.loginUrl;
    let loginBody = parseConfig.loginBody;
    let loginResp = smartRequest(loginUrl, { method: 'POST', body: loginBody });
    let cookie = loginResp.headers['set-cookie'];
    if (cookie) setItem('site_cookie', cookie);
    // 2. 携带 Cookie 请求目标数据
    let opts = { headers: { 'Cookie': getItem('site_cookie') } };
    let content = fetchSource(url, { ...parseConfig, ...opts });
    let items = parseList(content, parseConfig, url);
    return items;
  },
  // 示例：动态加载（需部署无头浏览器服务）
  dynamicContent: function(ctx) {
    let { url, parseConfig } = ctx;
    let browserService = parseConfig.browserService || 'http://localhost:3000/render';
    let resp = smartRequest(browserService, { method: 'POST', body: JSON.stringify({ url }) });
    let renderedHtml = resp.text();
    let items = parseList(renderedHtml, parseConfig, url);
    return items;
  }
};

// 模拟解密函数（实际使用需替换为真实解密算法）
function myDecrypt(encrypted, key) {
  // 示例：简单的 XOR 解密（仅为演示）
  let result = '';
  for (let i = 0; i < encrypted.length; i++) {
    result += String.fromCharCode(encrypted.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

// ========== 外部接口 ==========
function init(ext) {
   // 【新增】恢复解锁状态（自动处理超时）
    unlocked = getUnlocked();
    print(`解锁状态: ${unlocked ? '已解锁' : '未解锁'}`);
    
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
      // 新增：是否启用双地址备援（超时跳备用/下一集）
      if (__ext_config.global.double_url_fallback === undefined) {
        __ext_config.global.double_url_fallback = false; // 默认关闭，需手动开启
      }
    }
  }
  // 🔻加载外部解锁视频列表（如果配置了）🔻
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
    let resp = smartRequest(remoteUrl, { timeout: 3000 });
    let content = resp.text();
    
    let videoItems = [];  // 临时存储 {title, url}
    
    // 1. 尝试作为 JSON 数组解析（兼容原逻辑）
    try {
        let json = JSON.parse(content);
        if (Array.isArray(json) && json.length > 0) {
            // 检测第一个元素是否有 title 和 url
            if (json[0].title && json[0].url) {
                videoItems = json;
                print("远程列表解析成功 (JSON 数组格式)");
            } else {
                print("JSON 数组缺少 title/url 字段，尝试其他格式");
            }
        }
    } catch(e) { /* 不是 JSON，继续 */ }
    
    // 2. 若 JSON 解析失败或无有效数据，尝试作为 TXT 逗号分隔格式解析
    if (videoItems.length === 0) {
        print("尝试作为 TXT 逗号分隔格式解析...");
        // 使用 parseList 函数，分隔符为逗号（默认）
        let items = parseUniversalList(content, { line_sep: ',' }, remoteUrl);
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

   //🔺加载外部解锁视频列表（如果配置了）🔺
  
  
  print(`加载 ${__ext_config.sources.length} 个分类`);
}

function home(filter) {
  // 被动检查超时（每次访问首页时刷新有效期）
    if (unlocked) {
        let storedTime = parseInt(getItem('global_unlock_time', '0'));
        if (storedTime && (Date.now() - storedTime) > (UNLOCK_VALID_MINUTES * 60 * 1000)) {
            setUnlocked(false);
            unlocked = false;
        }
    }
    
    // 🚪 未解锁 -> 只返回解锁分类
    if (!unlocked) {
        let unlockClass = { type_id: '__UNLOCK__', type_name: '🔒 点击解锁', icon: '🔒' };
        return JSON.stringify({ class: [unlockClass], filters: {} });
    }
    
    // ✅ 已解锁 -> 正常返回所有数据源分类
  
  let classes = __ext_config.sources.map(s => ({ type_id: s.name, type_name: s.name }));
  let filters = [{ key: 'show', name: '播放展示', value: [{ n: '多线路分组', v: 'groups' }, { n: '单线路', v: 'all' }] }];
  let filterDict = {};
  classes.forEach(c => { filterDict[c.type_id] = filters; });
  return JSON.stringify({ class: classes, filters: filterDict });
}
function homeVod() { return JSON.stringify({ list: [] }); }

function category(tid, pg, filter, extend) {
  
  // ========== 处理解锁分类 ==========
    if (!unlocked && tid === '__UNLOCK__') {
        unlockMode = true;
        unlockBuffer = '';
        let videos = getKeyboardVideos();
        let statusItem = {
            vod_id: '__UNLOCK_STATUS_INIT_' + Date.now(),
            vod_name: `🔐 请输入密码___`,
            vod_pic: def_pic,
            vod_remarks: '使用遥控器数字键输入当前时间（HHMM）'
        };
        videos.unshift(statusItem);
        return JSON.stringify({ list: videos, page: 1, pagecount: 1, limit: videos.length, total: videos.length });
    }
  let fl = filter ? extend : {};
  if (fl.show) { showMode = fl.show; setItem('showMode', showMode); }
  if (parseInt(pg) > 1) return JSON.stringify({ list: [] });
  let source = __ext_config.sources.find(s => s.name === tid);
  if (!source) return JSON.stringify({ list: [] });

  // 特殊站点处理器优先
  if (source.handler && customHandlers[source.handler]) {
    let ctx = { url: source.url, parseConfig: source.parseConfig || {}, extra: { tid, pg, filter, extend } };
    let items = customHandlers[source.handler](ctx);
    let isSeries = source.parseConfig?.mode === 'series';
    if (isSeries) {
      if (!items.length) return JSON.stringify({ list: [] });
      let collectionName = source.parseConfig.collectionName || (source.url.split('/').pop().replace(/\.(txt|m3u8?|json)$/i, '') + '合集');
      let vod_id = source.url + '###series';
      return JSON.stringify({
        list: [{ vod_id, vod_name: collectionName, vod_pic: def_pic, vod_remarks: `📚 共${items.length}集` }],
        page: 1, pagecount: 1, limit: 1, total: items.length
      });
    } else {
      let videos = items.map(item => ({
        vod_id: item.url + '###single',
        vod_name: item.title,
        vod_pic: def_pic,
        vod_remarks: '特殊站点'
      }));
      return JSON.stringify({ list: videos, page: 1, pagecount: 1, limit: videos.length, total: videos.length });
    }
  }

  // 普通模式（使用 # 分组）
  let isSeries = source.parseConfig?.mode === 'series';
  if (isSeries) {
    let content = fetchSource(source.url, source);
    let baseDir = source.url.substring(0, source.url.lastIndexOf('/')+1);
    let items = parseList(content, source.parseConfig || {}, baseDir);
    if (!items.length) return JSON.stringify({ list: [] });
    let collectionName = source.parseConfig.collectionName || (source.url.split('/').pop().replace(/\.(txt|m3u8?|json)$/i, '') + '合集');
    let vod_id = source.url + '###series';
    return JSON.stringify({
      list: [{ vod_id, vod_name: collectionName, vod_pic: def_pic, vod_remarks: `📚 共${items.length}集` }],
      page: 1, pagecount: 1, limit: 1, total: items.length
    });
  }

  let html = fetchSource(source.url, source);
  let arr = html.match(/.*?[,，]#[\s\S].*?#/g) || [];
  let _list = [];
  for (let it of arr) {
    let vname = it.split(/[,，]/)[0];
    let vtab = it.match(/#(.*?)#/)[0];
    let vod_id = source.url + '$' + vname + '###single';
    _list.push({ vod_name: vname, vod_id, vod_pic: def_pic, vod_remarks: vtab });
  }
  return JSON.stringify({ page: 1, pagecount: 1, limit: _list.length, total: _list.length, list: _list });
}

function detail(tid) {
  
   // ---------解锁模式下的按键处理 ----------

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


    
    // ---------- 正常 detail 解析（播放列表/剧集）----------
  
  let parts = tid.split('###');
  let mode = parts.length > 1 ? parts[1] : 'single';
  let left = parts[0];
  let sourceUrl = left.split('$')[0];
  let tab = left.split('$')[1];
  let source = __ext_config.sources.find(s => s.url === sourceUrl);
  if (!source) return JSON.stringify({ list: [] });

  // 特殊站点处理器（合集模式）
  if (source.handler && customHandlers[source.handler] && mode === 'series') {
    let ctx = { url: sourceUrl, parseConfig: source.parseConfig || {}, extra: { tid } };
    let items = customHandlers[source.handler](ctx);
    if (!items.length) return JSON.stringify({ list: [] });
    // 【增强】双地址备援处理
    let playUrl = buildSeriesPlayUrl(items, source);
    let vodName = source.parseConfig.collectionName || (sourceUrl.split('/').pop().replace(/\.(txt|m3u8?|json)$/i, '') + '合集');
    let vod = {
      vod_id: tid, vod_name: vodName, vod_pic: def_pic,
      type_name: "连续剧", vod_play_from: source.name, vod_play_url: playUrl,
      vod_remarks: `共${items.length}集`
    };
    return JSON.stringify({ list: [vod] });
  }

  // 普通合集模式
  if (mode === 'series') {
    let content = fetchSource(sourceUrl, source);
    let baseDir = sourceUrl.substring(0, sourceUrl.lastIndexOf('/')+1);
    let parseConfig = source.parseConfig || {};
    let episodes = parseList(content, parseConfig, baseDir);
    if (!episodes.length) return JSON.stringify({ list: [] });
    // 【增强】双地址备援处理
    let playUrl = buildSeriesPlayUrl(episodes, source);
    let vodName = parseConfig.collectionName || (sourceUrl.split('/').pop().replace(/\.(txt|m3u8?|json)$/i, '') + '合集');
    let vod = {
      vod_id: tid, vod_name: vodName, vod_pic: def_pic,
      type_name: "连续剧", vod_play_from: source.name, vod_play_url: playUrl,
      vod_remarks: `共${episodes.length}集`
    };
    return JSON.stringify({ list: [vod] });
  }

  // 普通模式（分组/单线路）
  let html = fetchSource(sourceUrl, source);
  let regex = new RegExp(`.*?${tab.replace('(', '\\(').replace(')', '\\)')}[,，]#[\\s\\S].*?#`);
  let match = html.match(regex);
  if (!match) return JSON.stringify({ list: [] });
  let rest = html.split(match[0])[1];
  if (rest.match(/.*?[,，]#[\s\S].*?#/)) rest = rest.split(rest.match(/.*?[,，]#[\s\S].*?#/)[0])[0];
  let lines = rest.trim().split('\n').filter(l => l.trim());
  let items = lines.map(l => { let [t, u] = l.split(','); return t + '$' + u; });
  let playUrl, playFrom;
  if (showMode === 'groups') {
    let groups = splitArray(items, x => x.split('$')[0]);
    let tabs = groups.map((_,i) => i===0 ? source.name+'1' : ` ${i+1} `);
    playUrl = groups.map(g => g.join('#')).join('$$$');
    playFrom = tabs.join('$$$');
  } else {
    playUrl = items.join('#');
    playFrom = source.name;
  }
  let vod = {
    vod_id: tid, vod_name: source.name + '|' + tab, type_name: "直播列表", vod_pic: def_pic,
    vod_content: tid, vod_play_from: playFrom, vod_play_url: playUrl,
    vod_director: tips, vod_remarks: VERSION
  };
  return JSON.stringify({ list: [vod] });
}

/**
 * 为系列剧生成播放URL，支持双地址备援（超时自动切备源，失败后播下一集）
 * @param {Array} episodes - [{title, url}, ...]
 * @param {object} source - 数据源配置
 * @returns {string} 形如 "标题$地址#标题$地址"
 */
function buildSeriesPlayUrl(episodes, source) {
  const fallbackEnabled = __ext_config.global?.double_url_fallback === true;
  const parseApi = __ext_config.global?.parseUrl;
  const useFallback = fallbackEnabled && parseApi && typeof parseApi === 'string' && parseApi.includes('{url}');
  
  if (!useFallback) {
    // 原逻辑：直接单地址
    return episodes.map(ep => `${ep.title}$${ep.url}`).join('#');
  }
  
  // 生成主备地址： 解析后地址（首选） + 原始直连地址（备选）
  const playItems = [];
  for (let ep of episodes) {
    const parsedUrl = parseApi.replace('{url}', encodeURIComponent(ep.url));
    // 格式：标题$地址1#标题$地址2 （标题可相同，播放器会依次尝试）
    playItems.push(`${ep.title}$${parsedUrl}#${ep.title}$${ep.url}`);
  }
  return playItems.join('#');
}

// 播放器优化：支持全局解析接口、自定义请求头
function play(flag, id, vipFlags) {
    

// 调用 getUnlocked() 会重新验证有效期（超时自动锁定）
    if (!getUnlocked()) {
        print("播放被拒绝：密码锁已过期或未解锁，请重新解锁后再试");
        // 返回一个提示视频（可替换为您自己的提醒视频地址）
        const tipVideo = "https://vd2.bdstatic.com/mda-sbehdejw4kmibhkh/576p/h264/1771157811027978795/mda-sbehdejw4kmibhkh.mp4"; 
        // 注意：此提示视频内容建议是“请返回首页重新解锁”的短暂黑屏或文字提示
        return JSON.stringify({ parse: 1, playUrl: '', url: tipVideo });
    }

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

// 全局搜索
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

export default { init, home, homeVod, category, detail, play, search };