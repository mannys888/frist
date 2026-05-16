// ==================== 统一音乐搜索脚本（分类键盘+遥控器搜索都可用） ====================
// 功能：支持普通直播源分类 + iTunes 音乐搜索（30秒试听）
//      分类点击后弹出字母键盘，搜索逻辑与遥控器搜索完全一致
// ================================================================

let __ext_config = { sources: [] };
let debugMode = true;
let def_pic = 'https://picsum.photos/200/300?random=1';
const RKEY = 'music_search';

function print(any) {
  if (!debugMode) return;
  console.log(any);
}
function setItem(k, v) { local.set(RKEY, k, v); }
function getItem(k, v) { return local.get(RKEY, k) || v; }

function smartRequest(url, options) {
  let headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
  let reqOptions = { method: options.method || 'GET', headers, timeout: options.timeout || 10000 };
  if (options.body) reqOptions.body = options.body;
  let res = req(url, reqOptions);
  res.json = () => res.content ? JSON.parse(res.content) : null;
  return res;
}

function fetchSource(url, cfg) {
  let resp = smartRequest(url, { timeout: cfg.timeout || 8000 });
  return resp.text();
}

function parseList(content, cfg) {
  let items = [];
  if (cfg.type === 'json') {
    try {
      let json = JSON.parse(content);
      let data = json;
      if (cfg.jsonPath) {
        let parts = cfg.jsonPath.split('.');
        for (let p of parts) data = data[p];
      }
      if (Array.isArray(data)) {
        for (let it of data) {
          let title = it[cfg.titleField] || '';
          let url = it[cfg.urlField] || '';
          if (title && url) items.push({ title, url });
        }
      }
    } catch(e) { print("JSON解析失败:"+e); }
  } else if (cfg.type === 'txt') {
    let lines = content.split('\n');
    let sep = cfg.line_sep || ',';
    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;
      let parts = line.split(sep);
      if (parts.length >= 2) {
        items.push({ title: parts[0].trim(), url: parts[1].trim() });
      }
    }
  }
  return items;
}

// ========== 音乐搜索核心（统一供全局搜索和分类键盘调用） ==========
function performMusicSearch(keyword) {
  let results = [];
  let apiUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(keyword)}&limit=30&entity=song`;
  try {
    let resp = smartRequest(apiUrl, { timeout: 15000 });
    let json = resp.json();
    if (json && json.results) {
      for (let item of json.results) {
        if (item.previewUrl) {
          results.push({
            vod_id: '__MUSIC__' + encodeURIComponent(item.previewUrl),
            vod_name: `${item.trackName} - ${item.artistName}`,
            vod_pic: item.artworkUrl100 || def_pic,
            vod_remarks: '🎵 30秒试听'
          });
        }
      }
    }
  } catch(e) { print("音乐搜索失败:"+e); }
  if (results.length === 0) {
    results.push({ vod_id: 'none', vod_name: `❌ 未找到“${keyword}”`, vod_pic: def_pic, vod_remarks: '请换关键词' });
  }
  return results;
}

// ========== 分类键盘输入界面 ==========
let searchInputMode = false;
let searchBuffer = '';
let currentSearchSource = null;

function getSearchKeyboard() {
  let items = [];
  let letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  for (let l of letters) {
    items.push({ vod_id: `__SEARCH_LETTER__${l}`, vod_name: l, vod_pic: def_pic, vod_remarks: '' });
  }
  for (let i = 0; i <= 9; i++) {
    items.push({ vod_id: `__SEARCH_DIGIT__${i}`, vod_name: `${i}`, vod_pic: def_pic, vod_remarks: '' });
  }
  items.push({ vod_id: '__SEARCH_BACKSPACE', vod_name: '⌫ 删除', vod_pic: def_pic, vod_remarks: '' });
  items.push({ vod_id: '__SEARCH_CLEAR', vod_name: '🗑 清空', vod_pic: def_pic, vod_remarks: '' });
  items.push({ vod_id: '__SEARCH_SUBMIT', vod_name: '🔍 搜索', vod_pic: def_pic, vod_remarks: '确认搜索' });
  return items;
}

function init(ext) {
  let cfg = null;
  if (typeof ext === 'object') cfg = ext;
  else if (typeof ext === 'string') {
    if (ext.startsWith('http')) {
      let resp = smartRequest(ext, {});
      cfg = resp.json();
    } else {
      try { cfg = JSON.parse(ext); } catch(e) {}
    }
  }
  if (cfg && cfg.sources) __ext_config.sources = cfg.sources;
  print(`加载 ${__ext_config.sources.length} 个分类`);
}

function home(filter) {
  let classes = __ext_config.sources.map(s => ({ type_id: s.name, type_name: s.name }));
  return JSON.stringify({ class: classes, filters: {} });
}
function homeVod() { return JSON.stringify({ list: [] }); }

function category(tid, pg, filter, extend) {
  let source = __ext_config.sources.find(s => s.name === tid);
  if (!source) return JSON.stringify({ list: [] });
  
  // 如果是音乐搜索源（URL包含{wd}），则进入搜索键盘模式
  if (source.url && source.url.includes('{wd}')) {
    searchInputMode = true;
    searchBuffer = '';
    currentSearchSource = source;
    let keyboard = getSearchKeyboard();
    let statusItem = {
      vod_id: '__SEARCH_STATUS_' + Date.now(),
      vod_name: `🔍 输入搜索词: ______`,
      vod_pic: def_pic,
      vod_remarks: '点击字母/数字，完成后按🔍搜索'
    };
    keyboard.unshift(statusItem);
    return JSON.stringify({ list: keyboard, page: 1, pagecount: 1, limit: keyboard.length, total: keyboard.length });
  }
  
  // 普通直播源处理
  let content = fetchSource(source.url, source);
  let items = parseList(content, source.parseConfig);
  let videos = items.map(item => ({
    vod_id: item.url + '###single',
    vod_name: item.title,
    vod_pic: def_pic,
    vod_remarks: source.name
  }));
  return JSON.stringify({ list: videos });
}

function detail(tid) {
  // 处理音乐直链播放
  if (tid.startsWith('__MUSIC__')) {
    let encodedUrl = tid.substring('__MUSIC__'.length);
    let url = decodeURIComponent(encodedUrl);
    let vod = {
      vod_id: tid,
      vod_name: '音乐播放',
      vod_pic: def_pic,
      vod_play_url: url,
      vod_remarks: '点击播放'
    };
    return JSON.stringify({ list: [vod] });
  }
  
  // 处理搜索键盘按键
  if (searchInputMode) {
    if (tid.startsWith('__SEARCH_LETTER__')) {
      let letter = tid.replace('__SEARCH_LETTER__', '');
      searchBuffer += letter;
      let keyboard = getSearchKeyboard();
      let statusItem = {
        vod_id: '__SEARCH_STATUS_' + Date.now(),
        vod_name: `🔍 输入搜索词: ${searchBuffer}`,
        vod_pic: def_pic,
        vod_remarks: '点击字母/数字，完成后按🔍搜索'
      };
      keyboard.unshift(statusItem);
      return JSON.stringify({ list: keyboard });
    }
    if (tid.startsWith('__SEARCH_DIGIT__')) {
      let digit = tid.replace('__SEARCH_DIGIT__', '');
      searchBuffer += digit;
      let keyboard = getSearchKeyboard();
      let statusItem = {
        vod_id: '__SEARCH_STATUS_' + Date.now(),
        vod_name: `🔍 输入搜索词: ${searchBuffer}`,
        vod_pic: def_pic,
        vod_remarks: '点击字母/数字，完成后按🔍搜索'
      };
      keyboard.unshift(statusItem);
      return JSON.stringify({ list: keyboard });
    }
    if (tid === '__SEARCH_BACKSPACE') {
      if (searchBuffer.length > 0) searchBuffer = searchBuffer.slice(0, -1);
      let keyboard = getSearchKeyboard();
      let display = searchBuffer === '' ? '______' : searchBuffer;
      let statusItem = {
        vod_id: '__SEARCH_STATUS_' + Date.now(),
        vod_name: `🔍 输入搜索词: ${display}`,
        vod_pic: def_pic,
        vod_remarks: '点击字母/数字，完成后按🔍搜索'
      };
      keyboard.unshift(statusItem);
      return JSON.stringify({ list: keyboard });
    }
    if (tid === '__SEARCH_CLEAR') {
      searchBuffer = '';
      let keyboard = getSearchKeyboard();
      let statusItem = {
        vod_id: '__SEARCH_STATUS_' + Date.now(),
        vod_name: `🔍 输入搜索词: ______`,
        vod_pic: def_pic,
        vod_remarks: '点击字母/数字，完成后按🔍搜索'
      };
      keyboard.unshift(statusItem);
      return JSON.stringify({ list: keyboard });
    }
    if (tid === '__SEARCH_SUBMIT') {
      if (searchBuffer.trim() === '') {
        let keyboard = getSearchKeyboard();
        let statusItem = {
          vod_id: '__SEARCH_STATUS_EMPTY_' + Date.now(),
          vod_name: `⚠️ 请输入搜索词`,
          vod_pic: def_pic,
          vod_remarks: '先点击字母或数字'
        };
        keyboard.unshift(statusItem);
        return JSON.stringify({ list: keyboard });
      }
      searchInputMode = false;
      let keyword = searchBuffer.trim();
      // 调用统一的音乐搜索函数
      let results = performMusicSearch(keyword);
      return JSON.stringify({ list: results });
    }
  }
  
  // 处理普通直播源的播放
  let url = tid.split('###')[0];
  let vod = {
    vod_id: tid,
    vod_name: '播放',
    vod_play_url: url,
    vod_pic: def_pic
  };
  return JSON.stringify({ list: [vod] });
}

function play(flag, id) {
  let finalUrl = id;
  let autoParse = /m3u8|ts|flv/i.test(finalUrl) ? 0 : 1;
  return JSON.stringify({ parse: autoParse, url: finalUrl });
}

function search(wd, quick) {
  let results = performMusicSearch(wd);
  return JSON.stringify({ list: results });
}

export default { init, home, homeVod, category, detail, play, search };