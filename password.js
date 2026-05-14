// ==================== 通用动态爬虫 v34（分类伪装密码锁 + 爱情进度显示） ====================
// 功能：
//   - 未解锁时，首页显示“分类”列表（爱情、武打等），用于输入数字密码
//   - 第一个分类（爱情）动态显示当前输入进度（例如“爱情 *___”）
//   - 点击分类依次输入4位时间密码，正确后解锁并加载正常数据源
//   - 解锁有效期10分钟，超时自动锁定
//   - 历史记录播放时校验密码锁，过期则播放提示视频
//   - 支持 TXT/JSON/M3U/RSS 等多格式解析，特殊站点处理器等
// ================================================================

String.prototype.rstrip = function (chars) {
  let regex = new RegExp(chars + "$");
  return this.replace(regex, "");
};

// ========== 全局配置 ==========
let __ext_config = { sources: [], global: {} };
let cache_data = {};
let showMode = 'groups';
let groupDict = {};
let debugMode = true;
let defaultTimeout = 8000;
let defaultRetry = 2;
let def_pic = 'https://avatars.githubusercontent.com/u/97389433?s=120&v=4';
const VERSION = 'universal v3.4 (category password lock)';
const tips = `\n${VERSION}`;
const RKEY = 'universal_spider';

// ========== 🔐 动态密码锁核心 ==========
const UNLOCK_VALID_MINUTES = 10;

function getCurrentTimePassword() {
    let now = new Date();
    let hours = now.getHours().toString().padStart(2,'0');
    let minutes = now.getMinutes().toString().padStart(2,'0');
    return hours + minutes;
}

function verifyDynamicPassword(input) {
    return input === getCurrentTimePassword();
}

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

// 远程拉取的视频列表（init 时预加载）
let remoteUnlockVideos = null;
// ext 配置中的视频列表
let externalUnlockVideos = null;

// 解锁缓冲区和模式标志
let unlockBuffer = '';
let unlockMode = false;

// 伪装分类映射（数字1-9,0对应显示名称）
const UNLOCK_CATEGORIES_BASE = {
    '1': '🌸 爱情片',
    '2': '⚔️ 动作片',
    '3': '📰 新闻',
    '4': '🎭 喜剧',
    '5': '🔪 悬疑',
    '6': '🧟 恐怖',
    '7': '👨‍👩‍👧 家庭',
    '8': '🚀 科幻',
    '9': '🏀 体育',
    '0': '🎵 音乐'
};

// 获取带进度显示的分类名称（仅用于第一个分类，即数字1对应的“爱情片”）
function getFirstCategoryName() {
    if (!unlockMode && unlockBuffer.length === 0) {
        return UNLOCK_CATEGORIES_BASE['1'];
    }
    let stars = '*'.repeat(unlockBuffer.length) + '_'.repeat(4 - unlockBuffer.length);
    // 将“爱情片”改为“爱情片 ***_”形式
    return `${UNLOCK_CATEGORIES_BASE['1'].split(' ')[0]} ${stars}`;
}

// ========== 辅助函数 ==========
function print(any) {
  if (!debugMode) return;
  if (typeof any == 'object' && Object.keys(any).length > 0) {
    try { console.log(JSON.stringify(any)); } catch(e) { console.log(any); }
  } else { console.log(any); }
}
function setItem(k, v) { local.set(RKEY, k, v); print(`设置 ${k} => ${v}`); }
function getItem(k, v) { return local.get(RKEY, k) || v; }

// ========== 智能请求 ==========
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

// ========== 数据源专用请求 ==========
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

// ========== 通用解析器 ==========
function smartParseList(content, opt = {}) {
    if (!content || typeof content !== 'string') return [];
    const cfg = {
        defaultTitle: '媒体流',
        trimTitle: true,
        trimUrl: true,
        skipEmptyLines: true,
        skipCommentLines: true,
        commentChars: ['#', '//'],
        lineSep: ',',
        allowSepSpaces: true,
        jsonPath: null,
        titleFields: ['title', 'name', '节目名', 'vod_name', 'episode', 'fulltitle'],
        urlFields: ['url', 'link', 'play_url', 'src', 'href', 'm3u8', 'stream'],
        m3uUseGroupTitle: false,
        rssTitleTag: 'title',
        rssLinkTag: 'link',
        autoDetect: true,
        forceType: null,
        debug: false
    };
    Object.assign(cfg, opt);
    
    let type = cfg.forceType;
    if (cfg.autoDetect && !type) {
        const trimmed = content.trim();
        if (/^[\s]*[\[\{]/i.test(trimmed)) type = 'json';
        else if (trimmed.startsWith('#EXTM3U')) type = 'm3u';
        else if (/<rss|<feed|<channel|<item/i.test(trimmed)) type = 'rss';
        else type = 'txt';
    }
    if (cfg.debug) print(`[smartParse] 类型: ${type}`);
    
    if (type === 'json') {
        try {
            let data = JSON.parse(content);
            if (cfg.jsonPath) {
                const parts = cfg.jsonPath.split('.');
                for (let p of parts) data = data[p];
            }
            let arr = Array.isArray(data) ? data : (data ? [data] : []);
            const result = [];
            const titleFields = cfg.titleFields.map(f => f.toLowerCase());
            const urlFields = cfg.urlFields.map(f => f.toLowerCase());
            for (let item of arr) {
                if (!item || typeof item !== 'object') continue;
                const lowerItem = {};
                for (let k in item) lowerItem[k.toLowerCase()] = item[k];
                let title = null, url = null;
                for (let tf of titleFields) if (lowerItem[tf]) { title = lowerItem[tf]; break; }
                for (let uf of urlFields) if (lowerItem[uf]) { url = lowerItem[uf]; break; }
                if (title && url) {
                    if (cfg.trimTitle) title = String(title).trim();
                    if (cfg.trimUrl) url = String(url).trim();
                    result.push({ title, url });
                }
            }
            return result;
        } catch(e) { if (cfg.debug) print("JSON解析失败"); }
    }
    if (type === 'm3u') {
        const lines = content.split(/\r?\n/);
        const result = [];
        let currentTitle = '', currentGroup = '';
        for (let line of lines) {
            line = line.trim();
            if (line.startsWith('#EXTINF:')) {
                const groupMatch = line.match(/group-title="([^"]*)"/);
                if (groupMatch) currentGroup = groupMatch[1];
                const titleMatch = line.match(/#EXTINF:.*?,(.*)/);
                if (titleMatch) currentTitle = titleMatch[1].trim();
            } else if (line && !line.startsWith('#') && line.match(/^https?:\/\//i)) {
                let title = currentTitle || cfg.defaultTitle;
                if (cfg.m3uUseGroupTitle && currentGroup) title = `[${currentGroup}] ${title}`;
                result.push({ title, url: line });
                currentTitle = ''; currentGroup = '';
            }
        }
        return result;
    }
    if (type === 'rss') {
        try {
            const titleReg = new RegExp(`<${cfg.rssTitleTag}>(.*?)</${cfg.rssTitleTag}>`, 'gi');
            const linkReg = new RegExp(`<${cfg.rssLinkTag}>(.*?)</${cfg.rssLinkTag}>`, 'gi');
            const titles = [...content.matchAll(titleReg)].map(m => m[1]);
            const links = [...content.matchAll(linkReg)].map(m => m[1]);
            const result = [];
            for (let i = 0; i < Math.min(titles.length, links.length); i++) {
                if (links[i].startsWith('http')) result.push({ title: titles[i], url: links[i] });
            }
            return result;
        } catch(e) { if (cfg.debug) print("RSS解析失败"); }
    }
    // TXT
    const lines = content.split(/\r?\n/);
    const result = [];
    const escapedSep = cfg.lineSep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sepRegex = cfg.allowSepSpaces 
        ? new RegExp(`^(.+?)${escapedSep}\\s*(https?://\\S+)`, 'i')
        : new RegExp(`^(.+?)${escapedSep}(https?://\\S+)`, 'i');
    for (let rawLine of lines) {
        let line = rawLine;
        if (cfg.skipEmptyLines && line.trim() === '') continue;
        if (cfg.skipCommentLines) {
            let isComment = false;
            for (let cmt of cfg.commentChars) if (line.trim().startsWith(cmt)) { isComment = true; break; }
            if (isComment) continue;
        }
        let match = line.match(sepRegex);
        if (match) {
            let title = match[1], url = match[2];
            if (cfg.trimTitle) title = title.trim();
            if (cfg.trimUrl) url = url.trim();
            result.push({ title, url });
            continue;
        }
        if (line.match(/^https?:\/\//i)) {
            result.push({ title: cfg.defaultTitle, url: line.trim() });
        }
    }
    return result;
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
    let regex = new RegExp(`^(.+?)${sep}\\s*(https?://\\S+)`);
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
  encryptedSite: function(ctx) {
    let { url, parseConfig } = ctx;
    let encryptedContent = fetchSource(url, parseConfig);
    let decryptedContent = myDecrypt(encryptedContent, parseConfig.key || 'defaultKey');
    let items = parseList(decryptedContent, parseConfig, url);
    return items;
  },
  loginRequired: function(ctx) {
    let { url, parseConfig } = ctx;
    let loginUrl = parseConfig.loginUrl;
    let loginBody = parseConfig.loginBody;
    let loginResp = smartRequest(loginUrl, { method: 'POST', body: loginBody });
    let cookie = loginResp.headers['set-cookie'];
    if (cookie) setItem('site_cookie', cookie);
    let opts = { headers: { 'Cookie': getItem('site_cookie') } };
    let content = fetchSource(url, { ...parseConfig, ...opts });
    let items = parseList(content, parseConfig, url);
    return items;
  },
  dynamicContent: function(ctx) {
    let { url, parseConfig } = ctx;
    let browserService = parseConfig.browserService || 'http://localhost:3000/render';
    let resp = smartRequest(browserService, { method: 'POST', body: JSON.stringify({ url }) });
    let renderedHtml = resp.text();
    let items = parseList(renderedHtml, parseConfig, url);
    return items;
  }
};

function myDecrypt(encrypted, key) {
  let result = '';
  for (let i = 0; i < encrypted.length; i++) {
    result += String.fromCharCode(encrypted.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

// ========== 外部接口 ==========
function init(ext) {
  unlocked = getUnlocked();
  print(`解锁状态: ${unlocked ? '已解锁' : '未解锁'}`);
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

  if (__ext_config.global && __ext_config.global.unlockVideos) {
    externalUnlockVideos = __ext_config.global.unlockVideos;
    print("已加载外部解锁视频列表，共 " + externalUnlockVideos.length + " 个");
  } else {
    externalUnlockVideos = null;
  }

  let remoteUrl = (__ext_config.global && __ext_config.global.unlockVideosUrl) 
                  ? __ext_config.global.unlockVideosUrl 
                  : "https://raw.githubusercontent.com/userfree66666/TVpg/refs/heads/main/ext.json";
  try {
    print("正在预加载远程视频列表: " + remoteUrl);
    let resp = smartRequest(remoteUrl, { timeout: 3000 });
    let content = resp.text();
    let videoItems = smartParseList(content, { lineSep: ',', forceType: 'txt' });
    if (videoItems.length > 0) {
      remoteUnlockVideos = videoItems;
      print("预加载成功，共 " + remoteUnlockVideos.length + " 个视频");
    } else {
      print("远程数据无效或为空");
      remoteUnlockVideos = null;
    }
  } catch(e) {
    print("预加载远程视频列表失败: " + e.message);
    remoteUnlockVideos = null;
  }

  print(`加载 ${__ext_config.sources.length} 个分类`);
}

function home(filter) {
  if (unlocked) {
    let storedTime = parseInt(getItem('global_unlock_time','0'));
    if (storedTime && (Date.now() - storedTime) > UNLOCK_VALID_MINUTES * 60 * 1000) {
      setUnlocked(false);
      unlocked = false;
    }
  }

  if (!unlocked) {
    let classes = [];
    // 数字1对应的分类（爱情片）显示进度
    let firstCatName = getFirstCategoryName();
    classes.push({
      type_id: '__UNLOCK_KEY__1',
      type_name: firstCatName,
      icon: '🌸'
    });
    for (let i = 2; i <= 9; i++) {
      classes.push({
        type_id: `__UNLOCK_KEY__${i}`,
        type_name: UNLOCK_CATEGORIES_BASE[String(i)],
        icon: '🎬'
      });
    }
    classes.push({
      type_id: '__UNLOCK_KEY__0',
      type_name: UNLOCK_CATEGORIES_BASE['0'],
      icon: '🎵'
    });
    classes.push({
      type_id: '__UNLOCK_BACKSPACE',
      type_name: '⌫ 删除上一步',
      icon: '⬅️'
    });
    classes.push({
      type_id: '__UNLOCK_CLEAR',
      type_name: '🗑 全部清空',
      icon: '🗑️'
    });
    return JSON.stringify({ class: classes, filters: {} });
  }

  let classes = __ext_config.sources.map(s => ({ type_id: s.name, type_name: s.name }));
  let filters = [{ key: 'show', name: '播放展示', value: [{ n: '多线路分组', v: 'groups' }, { n: '单线路', v: 'all' }] }];
  let filterDict = {};
  classes.forEach(c => { filterDict[c.type_id] = filters; });
  return JSON.stringify({ class: classes, filters: filterDict });
}

function homeVod() { return JSON.stringify({ list: [] }); }

function category(tid, pg, filter, extend) {
  if (!unlocked && (tid.startsWith('__UNLOCK_KEY__') || tid === '__UNLOCK_BACKSPACE' || tid === '__UNLOCK_CLEAR')) {
    if (unlockMode === false) {
      unlockMode = true;
      unlockBuffer = '';
    }

    if (tid.startsWith('__UNLOCK_KEY__')) {
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
              // 返回空列表，前端刷新首页
              return JSON.stringify({ list: [] });
            } else {
              unlockBuffer = '';
              print("密码错误，请重新输入");
              // 刷新当前分类列表并显示错误（不额外处理，用户继续输入即可）
            }
          }
        }
      }
    }
    if (tid === '__UNLOCK_BACKSPACE') {
      if (unlockBuffer.length > 0) unlockBuffer = unlockBuffer.slice(0, -1);
    }
    if (tid === '__UNLOCK_CLEAR') {
      unlockBuffer = '';
    }

    // 重新构造分类列表，并让第一个分类显示进度
    let classes = [];
    let firstCatName = getFirstCategoryName();
    classes.push({
      type_id: '__UNLOCK_KEY__1',
      type_name: firstCatName,
      icon: '🌸'
    });
    for (let i = 2; i <= 9; i++) {
      classes.push({
        type_id: `__UNLOCK_KEY__${i}`,
        type_name: UNLOCK_CATEGORIES_BASE[String(i)],
        icon: '🎬'
      });
    }
    classes.push({
      type_id: '__UNLOCK_KEY__0',
      type_name: UNLOCK_CATEGORIES_BASE['0'],
      icon: '🎵'
    });
    classes.push({
      type_id: '__UNLOCK_BACKSPACE',
      type_name: '⌫ 删除上一步',
      icon: '⬅️'
    });
    classes.push({
      type_id: '__UNLOCK_CLEAR',
      type_name: '🗑 全部清空',
      icon: '🗑️'
    });
    return JSON.stringify({ class: classes, filters: {} });
  }

  let fl = filter ? extend : {};
  if (fl.show) { showMode = fl.show; setItem('showMode', showMode); }
  if (parseInt(pg) > 1) return JSON.stringify({ list: [] });
  let source = __ext_config.sources.find(s => s.name === tid);
  if (!source) return JSON.stringify({ list: [] });

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
  if (unlocked) unlockMode = false;

  let parts = tid.split('###');
  let mode = parts.length > 1 ? parts[1] : 'single';
  let left = parts[0];
  let sourceUrl = left.split('$')[0];
  let tab = left.split('$')[1];
  let source = __ext_config.sources.find(s => s.url === sourceUrl);
  if (!source) return JSON.stringify({ list: [] });

  if (source.handler && customHandlers[source.handler] && mode === 'series') {
    let ctx = { url: sourceUrl, parseConfig: source.parseConfig || {}, extra: { tid } };
    let items = customHandlers[source.handler](ctx);
    if (!items.length) return JSON.stringify({ list: [] });
    let playUrl = items.map(ep => `${ep.title}$${ep.url}`).join('#');
    let vodName = source.parseConfig.collectionName || (sourceUrl.split('/').pop().replace(/\.(txt|m3u8?|json)$/i, '') + '合集');
    let vod = {
      vod_id: tid, vod_name: vodName, vod_pic: def_pic,
      type_name: "连续剧", vod_play_from: source.name, vod_play_url: playUrl,
      vod_remarks: `共${items.length}集`
    };
    return JSON.stringify({ list: [vod] });
  }

  if (mode === 'series') {
    let content = fetchSource(sourceUrl, source);
    let baseDir = sourceUrl.substring(0, sourceUrl.lastIndexOf('/')+1);
    let parseConfig = source.parseConfig || {};
    let episodes = parseList(content, parseConfig, baseDir);
    if (!episodes.length) return JSON.stringify({ list: [] });
    let playUrl = episodes.map(ep => `${ep.title}$${ep.url}`).join('#');
    let vodName = parseConfig.collectionName || (sourceUrl.split('/').pop().replace(/\.(txt|m3u8?|json)$/i, '') + '合集');
    let vod = {
      vod_id: tid, vod_name: vodName, vod_pic: def_pic,
      type_name: "连续剧", vod_play_from: source.name, vod_play_url: playUrl,
      vod_remarks: `共${episodes.length}集`
    };
    return JSON.stringify({ list: [vod] });
  }

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

function play(flag, id, vipFlags) {
  if (!getUnlocked()) {
    print("播放被拒绝：密码锁已过期或未解锁，请返回首页重新解锁");
    const tipVideoUrl = "https://vd2.bdstatic.com/mda-sbehdejw4kmibhkh/576p/h264/1771157811027978795/mda-sbehdejw4kmibhkh.mp4";
    return JSON.stringify({ parse: 1, playUrl: '', url: tipVideoUrl });
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