// ==================== 通用动态爬虫 v34（全能旗舰版 + 音乐搜索） ====================
// 功能：
//   - 普通线路（分组/单线路）& 合集模式（系列剧）
//   - 文本/JSON/M3U/RSS 等多格式解析
//   - 全局搜索（支持标题匹配 + 歌曲搜索）
//   - 播放器增强（自定义请求头、Referer、Cookie、解析接口）
//   - 特殊站点处理器：加密、登录、动态加载（模拟/可替换真实逻辑）
//   - 动态 Referer / Origin 自动适配
//   - 缓存、重试、超时配置
//   - 播放超时自动跳过（双地址备援）
//   - 卡片图片差异化（基于ID动态生成）
//   - 密码输入明文显示
//   - 内置歌曲搜索（iTunes API，可替换为Google等）
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
let def_pic = 'https://picsum.photos/200/300?random=1';
const VERSION = 'universal v3.4 (music search)';
const tips = `\n${VERSION}`;
const RKEY = 'universal_spider';

// 生成动态图片（基于种子字符串）
function getDynamicPic(seed) {
  if (!seed) return def_pic;
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/200/300`;
}

// 1️⃣========== 🔻 密码锁核心 🔻==========

let remoteUnlockVideos = null;
let externalUnlockVideos = null;

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

function getKeyboardVideos() {
    let items = [];
    for (let i = 0; i <= 9; i++) {
        items.push({ 
            vod_id: `__UNLOCK_KEY__${i}`, 
            vod_name: `${i}`, 
            vod_pic: getDynamicPic(`key_${i}`),
            vod_remarks: '' 
        });
    }
    items.push({ 
        vod_id: '__UNLOCK_BACKSPACE', 
        vod_name: '⌫ 删除', 
        vod_pic: getDynamicPic('backspace'), 
        vod_remarks: '' 
    });
    items.push({ 
        vod_id: '__UNLOCK_CLEAR', 
        vod_name: '🗑 清除', 
        vod_pic: getDynamicPic('clear'), 
        vod_remarks: '' 
    });
    return items;
}

let unlockBuffer = '';
let unlockMode = false;

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

// 数据源专用请求（支持URL模板替换）
function fetchSource(url, sourceConfig = {}, noCache = false, extraParams = {}) {
  let finalUrl = url;
  // 支持 {wd} 替换（用于搜索）
  if (extraParams.wd && finalUrl.includes('{wd}')) {
    finalUrl = finalUrl.replace(/\{wd\}/g, encodeURIComponent(extraParams.wd));
  }
  if (!noCache && cache_data[finalUrl]) return cache_data[finalUrl];
  
  let opts = {
    method: sourceConfig.method || 'GET',
    headers: { ...(sourceConfig.headers || {}) },
    body: sourceConfig.body,
    timeout: sourceConfig.timeout,
    cookie: sourceConfig.cookie || getItem('site_cookie'),
    retry: sourceConfig.retry
  };
  let resp = smartRequest(finalUrl, opts);
  let content = resp.text();
  if (!sourceConfig.type && content.includes('#EXTM3U')) {
    content = convertM3uToNormal(content);
  }
  if (!noCache) cache_data[finalUrl] = content;
  return content;
}

// 列表解析（支持 txt/json/m3u/rss）
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
            if (__ext_config.global.double_url_fallback === undefined) {
                __ext_config.global.double_url_fallback = false;
            }
        }
    }
    
    // 如果没有配置任何数据源，则添加默认的音乐搜索源（iTunes）
    if (!__ext_config.sources || __ext_config.sources.length === 0) {
        __ext_config.sources = [
            {
                name: "🎵 音乐搜索",
                url: "https://itunes.apple.com/search?term={wd}&limit=30&entity=song",
                parseConfig: {
                    type: "json",
                    jsonPath: "results",
                    titleField: "trackName",
                    urlField: "previewUrl"
                }
            }
        ];
        print("已添加默认音乐搜索源（iTunes）");
    }
    
    showMode = getItem('showMode', 'groups');
    groupDict = JSON.parse(getItem('groupDict', '{}'));
    
    if (__ext_config.global && __ext_config.global.unlockVideos) {
        externalUnlockVideos = __ext_config.global.unlockVideos;
    } else {
        externalUnlockVideos = null;
    }
    
    let remoteUrl = (__ext_config.global && __ext_config.global.unlockVideosUrl) 
                    ? __ext_config.global.unlockVideosUrl 
                    : "https://raw.githubusercontent.com/mannys888/frist/refs/heads/main/迦南诗歌.txt";
    try {
        print("正在预加载远程视频列表: " + remoteUrl);
        let resp = smartRequest(remoteUrl, { timeout: 3000 });
        let content = resp.text();
        let videoItems = [];
        try {
            let json = JSON.parse(content);
            if (Array.isArray(json) && json.length > 0 && json[0].title && json[0].url) {
                videoItems = json;
            }
        } catch(e) {}
        if (videoItems.length === 0) {
            let items = parseUniversalList(content, { line_sep: ',' });
            if (items.length > 0) videoItems = items.map(item => ({ title: item.title, url: item.url }));
        }
        if (videoItems.length > 0) {
            remoteUnlockVideos = videoItems.filter(item => item && item.title && item.url);
            print("预加载成功，共 " + remoteUnlockVideos.length + " 个视频");
        } else {
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
        let storedTime = parseInt(getItem('global_unlock_time', '0'));
        if (storedTime && (Date.now() - storedTime) > (UNLOCK_VALID_MINUTES * 60 * 1000)) {
            setUnlocked(false);
            unlocked = false;
        }
    }
    
    if (!unlocked) {
        let unlockClass = { type_id: '__UNLOCK__', type_name: '🔒 点击解锁', icon: '🔒' };
        return JSON.stringify({ class: [unlockClass], filters: {} });
    }
    
    let classes = __ext_config.sources.map(s => ({ type_id: s.name, type_name: s.name }));
    let filters = [{ key: 'show', name: '播放展示', value: [{ n: '多线路分组', v: 'groups' }, { n: '单线路', v: 'all' }] }];
    let filterDict = {};
    classes.forEach(c => { filterDict[c.type_id] = filters; });
    return JSON.stringify({ class: classes, filters: filterDict });
}

function homeVod() { return JSON.stringify({ list: [] }); }

function category(tid, pg, filter, extend) {
    if (!unlocked && tid === '__UNLOCK__') {
        unlockMode = true;
        unlockBuffer = '';
        let videos = getKeyboardVideos();
        let statusItem = {
            vod_id: '__UNLOCK_STATUS_INIT_' + Date.now(),
            vod_name: `🔐 请输入密码____`,
            vod_pic: getDynamicPic('unlock_status'),
            vod_remarks: '使用遥控器数字键输入当前时间（HHMM），将明文显示'
        };
        videos.unshift(statusItem);
        return JSON.stringify({ list: videos, page: 1, pagecount: 1, limit: videos.length, total: videos.length });
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
                list: [{ vod_id, vod_name: collectionName, vod_pic: getDynamicPic(vod_id), vod_remarks: `📚 共${items.length}集` }],
                page: 1, pagecount: 1, limit: 1, total: items.length
            });
        } else {
            let videos = items.map(item => ({
                vod_id: item.url + '###single',
                vod_name: item.title,
                vod_pic: getDynamicPic(item.url),
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
            list: [{ vod_id, vod_name: collectionName, vod_pic: getDynamicPic(vod_id), vod_remarks: `📚 共${items.length}集` }],
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
        _list.push({ vod_name: vname, vod_id, vod_pic: getDynamicPic(vod_id), vod_remarks: vtab });
    }
    return JSON.stringify({ page: 1, pagecount: 1, limit: _list.length, total: _list.length, list: _list });
}

function detail(tid) {
    // ========== 🔒 解锁模式下的按键处理 ==========
    if (unlockMode && tid.startsWith('__UNLOCK_KEY__')) {
        let digit = tid.replace('__UNLOCK_KEY__', '');
        if (digit >= '0' && digit <= '9') {
            if (unlockBuffer.length < 4) {
                unlockBuffer += digit;
                // 检查是否输入满4位
                if (unlockBuffer.length === 4) {
                    if (verifyDynamicPassword(unlockBuffer)) {
                        setUnlocked(true);
                        unlocked = true;
                        unlockMode = false;
                        print("密码正确，解锁成功！");
                        
                        // 获取视频列表
                        let videoList = [];
                        if (remoteUnlockVideos && Array.isArray(remoteUnlockVideos) && remoteUnlockVideos.length > 0) {
                            videoList = remoteUnlockVideos;
                        } else if (externalUnlockVideos && Array.isArray(externalUnlockVideos) && externalUnlockVideos.length > 0) {
                            videoList = externalUnlockVideos.filter(item => item && item.title && item.url);
                        }
                        if (videoList.length === 0) {
                            videoList = [
                                { title: "🎉 庆祝视频 - 精彩剪辑", url: "https://vd2.bdstatic.com/mda-sbehdejw4kmibhkh/576p/h264/1771157811027978795/mda-sbehdejw4kmibhkh.mp4" },
                                { title: "📺 第二集 - 花絮彩蛋",   url: "https://vd2.bdstatic.com/mda-qiakr3cmtvs6w0d4/hd/cae_h264/1726065783439501256/mda-qiakr3cmtvs6w0d4.mp4" },
                                { title: "🔔 第三集 - 幕后制作",   url: "https://vd3.bdstatic.com/mda-rdkgd5132u941fcr/576p/h264/1745235281540035966/mda-rdkgd5132u941fcr.mp4" }
                            ];
                        }
                        const playUrl = videoList.map(item => `${item.title}$${item.url}`).join('#');
                        let vod = {
                            vod_id: '__UNLOCK_SUCCESS_MULTI',
                            vod_name: '🎉 解锁成功！请选择视频播放',
                            vod_pic: getDynamicPic('unlock_success'),
                            type_name: "解锁合集",
                            vod_play_from: "庆祝源",
                            vod_play_url: playUrl,
                            vod_remarks: `共${videoList.length}个视频，密码正确已解锁`
                        };
                        return JSON.stringify({ list: [vod] });
                    } else {
                        // 密码错误
                        unlockBuffer = '';
                        let videos = getKeyboardVideos();
                        let statusItem = {
                            vod_id: '__UNLOCK_STATUS_ERR_' + Date.now(),
                            vod_name: `❌ 密码错误，请重试`,
                            vod_pic: getDynamicPic('unlock_error'),
                            vod_remarks: '找管理员要密码'
                        };
                        videos.unshift(statusItem);
                        return JSON.stringify({ list: videos });
                    }
                }
            }
        }
        // 未满4位，刷新键盘显示
        let videos = getKeyboardVideos();
        let displayPlain = unlockBuffer + '_'.repeat(4 - unlockBuffer.length);
        let statusItem = {
            vod_id: '__UNLOCK_STATUS_' + unlockBuffer.length + '_' + Date.now(),
            vod_name: `🔐 密码: ${displayPlain}`,
            vod_pic: getDynamicPic('unlock_status'),
            vod_remarks: '请输入4位数字（显示明文）'
        };
        videos.unshift(statusItem);
        return JSON.stringify({ list: videos });
    }
    
    if (unlockMode && tid === '__UNLOCK_BACKSPACE') {
        if (unlockBuffer.length > 0) unlockBuffer = unlockBuffer.slice(0, -1);
        let videos = getKeyboardVideos();
        let displayPlain = unlockBuffer + '_'.repeat(4 - unlockBuffer.length);
        let statusItem = {
            vod_id: '__UNLOCK_STATUS_' + unlockBuffer.length + '_' + Date.now(),
            vod_name: `🔐 密码: ${displayPlain}`,
            vod_pic: getDynamicPic('unlock_status'),
            vod_remarks: '请输入4位数字（显示明文）'
        };
        videos.unshift(statusItem);
        return JSON.stringify({ list: videos });
    }
    
    if (unlockMode && tid === '__UNLOCK_CLEAR') {
        unlockBuffer = '';
        let videos = getKeyboardVideos();
        let displayPlain = '_'.repeat(4);
        let statusItem = {
            vod_id: '__UNLOCK_STATUS_CLEAR_' + Date.now(),
            vod_name: `🔐 密码: ${displayPlain}`,
            vod_pic: getDynamicPic('unlock_status'),
            vod_remarks: '请输入4位数字（显示明文）'
        };
        videos.unshift(statusItem);
        return JSON.stringify({ list: videos });
    }
    
    if (unlocked) unlockMode = false;
    
    // ========== 正常 detail 解析（播放列表/剧集）==========
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
        let playUrl = buildSeriesPlayUrl(items, source);
        let vodName = source.parseConfig.collectionName || (sourceUrl.split('/').pop().replace(/\.(txt|m3u8?|json)$/i, '') + '合集');
        let vod = {
            vod_id: tid, vod_name: vodName, vod_pic: getDynamicPic(tid),
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
        let playUrl = buildSeriesPlayUrl(episodes, source);
        let vodName = parseConfig.collectionName || (sourceUrl.split('/').pop().replace(/\.(txt|m3u8?|json)$/i, '') + '合集');
        let vod = {
            vod_id: tid, vod_name: vodName, vod_pic: getDynamicPic(tid),
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
        vod_id: tid, vod_name: source.name + '|' + tab, type_name: "直播列表", vod_pic: getDynamicPic(tid),
        vod_content: tid, vod_play_from: playFrom, vod_play_url: playUrl,
        vod_director: tips, vod_remarks: VERSION
    };
    return JSON.stringify({ list: [vod] });
}

function buildSeriesPlayUrl(episodes, source) {
    const fallbackEnabled = __ext_config.global?.double_url_fallback === true;
    const parseApi = __ext_config.global?.parseUrl;
    const useFallback = fallbackEnabled && parseApi && typeof parseApi === 'string' && parseApi.includes('{url}');
    if (!useFallback) {
        return episodes.map(ep => `${ep.title}$${ep.url}`).join('#');
    }
    const playItems = [];
    for (let ep of episodes) {
        const parsedUrl = parseApi.replace('{url}', encodeURIComponent(ep.url));
        playItems.push(`${ep.title}$${parsedUrl}#${ep.title}$${ep.url}`);
    }
    return playItems.join('#');
}

// 播放器优化
function play(flag, id, vipFlags) {
    if (!getUnlocked()) {
        print("播放被拒绝：密码锁已过期或未解锁");
        const tipVideo = "https://vd2.bdstatic.com/mda-sbehdejw4kmibhkh/576p/h264/1771157811027978795/mda-sbehdejw4kmibhkh.mp4";
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

// 全局搜索（支持歌曲搜索）
function search(wd, quick) {
    let results = [];
    for (let src of __ext_config.sources) {
        // 如果 url 包含 {wd}，则为动态搜索源，需要替换关键词
        let isSearchSource = src.url && src.url.includes('{wd}');
        let content;
        if (isSearchSource) {
            content = fetchSource(src.url, src, true, { wd: wd });
        } else {
            content = fetchSource(src.url, src);
        }
        let baseDir = src.url.substring(0, src.url.lastIndexOf('/')+1);
        let items = parseList(content, src.parseConfig || {}, baseDir);
        // 对普通静态源，进行标题过滤；对搜索源，所有结果都返回
        let matched = isSearchSource ? items : items.filter(item => item.title.includes(wd));
        for (let m of matched) {
            let vod_id = m.url + '###single';
            // 尝试从 iTunes 结果中获取封面，若无则动态生成
            let pic = def_pic;
            if (src.parseConfig?.picField && m.pic) {
                pic = m.pic;
            } else if (src.name === "🎵 音乐搜索" && m.artworkUrl100) {
                pic = m.artworkUrl100;
            } else {
                pic = getDynamicPic(vod_id);
            }
            results.push({
                vod_id: vod_id,
                vod_name: `[${src.name}] ${m.title}`,
                vod_pic: pic,
                vod_remarks: isSearchSource ? (m.artistName || '歌曲') : '搜索命中'
            });
        }
    }
    return JSON.stringify({ list: results });
}

// 通用列表解析函数（用于远程解锁）
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
    let type = opts.type;
    if (!type) {
        const trimmed = content.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) type = 'json';
        else if (trimmed.startsWith('#EXTM3U')) type = 'm3u';
        else if (/<rss|<feed/i.test(trimmed)) type = 'rss';
        else type = 'txt';
    }
    if (type === 'json') {
        try {
            let json = JSON.parse(content);
            let dataArr = json;
            if (opts.dataPath) {
                const parts = opts.dataPath.split('.');
                for (let p of parts) dataArr = dataArr[p];
            }
            if (!Array.isArray(dataArr)) dataArr = dataArr || [];
            return dataArr.map(item => {
                let title = opts.titleField ? item[opts.titleField] : (item.title || item.name);
                let url = opts.urlField ? item[opts.urlField] : (item.url || item.link || item.play_url);
                if (title && url) return { title: String(title), url: String(url) };
                return null;
            }).filter(v => v);
        } catch(e) { return []; }
    }
    // 其他格式简化处理...
    return [];
}

export default { init, home, homeVod, category, detail, play, search };