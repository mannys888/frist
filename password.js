// ==================== 通用动态爬虫 v37（手机扫码解锁版） ====================
// 需要配合 Cloudflare Worker 使用：https://your-worker.workers.dev
// 使用说明：
//   1. 部署 Worker（上方代码）
//   2. 将下面的 WORKER_URL 改为您的 Worker 域名
//   3. 爬虫启动后，遇到需要密码的分类，会显示一个网址
//   4. 用户用手机访问该网址并在 URL 后添加 ?password=xxx 即可解锁
// ================================================================

// ---------- 基础配置 ----------
String.prototype.rstrip = function (chars) {
  let regex = new RegExp(chars + "$");
  return this.replace(regex, "");
};

let __ext_config = { sources: [], global: {} };
let cache_data = {};
let showMode = 'groups';
let groupDict = {};
let debugMode = true;
let defaultTimeout = 8000;
let defaultRetry = 2;
let def_pic = 'https://avatars.githubusercontent.com/u/97389433?s=120&v=4';
const VERSION = 'universal v3.7 (mobile unlock)';
const tips = `\n${VERSION}`;
const RKEY = 'universal_spider';
const WORKER_URL = 'https://your-worker.workers.dev'; // 修改为您的 Worker 地址

// ---------- 辅助函数 ----------
function print(any) {
  if (!debugMode) return;
  if (typeof any == 'object' && Object.keys(any).length > 0) {
    try { console.log(JSON.stringify(any)); } catch(e) { console.log(any); }
  } else { console.log(any); }
}
function setItem(k, v) { local.set(RKEY, k, v); print(`设置 ${k} => ${v}`); }
function getItem(k, v) { return local.get(RKEY, k) || v; }

// 生成随机 token
function generateToken() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    let r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 轮询查询密码
let pollInterval = null;
function startPolling(token, onSuccess) {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(() => {
    let url = `${WORKER_URL}?token=${token}`;
    let resp = smartRequest(url);
    let pwd = resp.text();
    if (pwd && pwd.length > 0) {
      clearInterval(pollInterval);
      onSuccess(pwd);
    }
  }, 2000);
}

// ---------- 网络请求 ----------
function smartRequest(url, options = {}) {
  let method = options.method || 'GET';
  let headers = { 'User-Agent': 'Mozilla/5.0', ...(options.headers || {}) };
  if (!headers['Referer']) {
    let match = url.match(/^(https?:\/\/[^/]+)/);
    if (match) headers['Referer'] = match[1] + '/';
  }
  let reqOptions = { method, headers, timeout: options.timeout || defaultTimeout };
  if (options.body) {
    reqOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
  }
  try {
    let res = req(url, reqOptions);
    res.json = () => res.content ? JSON.parse(res.content) : null;
    res.text = () => res.content || '';
    return res;
  } catch(e) {
    print(`请求失败: ${url} - ${e.message}`);
    return { text: () => '' };
  }
}

function fetchSource(url, sourceConfig = {}, noCache = false) {
  if (!noCache && cache_data[url]) return cache_data[url];
  let opts = {
    method: sourceConfig.method || 'GET',
    headers: { ...(sourceConfig.headers || {}) },
    body: sourceConfig.body,
    timeout: sourceConfig.timeout,
    cookie: sourceConfig.cookie,
    retry: sourceConfig.retry
  };
  let resp = smartRequest(url, opts);
  let content = resp.text();
  if (!noCache) cache_data[url] = content;
  return content;
}

// 解析函数（简化版，仅支持普通 txt）
function parseList(content, parseConfig, baseUrl) {
  let items = [];
  let sep = parseConfig?.line_sep || ',';
  let lines = content.split(/\r?\n/);
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    let idx = line.indexOf(sep);
    if (idx > 0) {
      let title = line.substring(0, idx).trim();
      let url = line.substring(idx + 1).trim();
      if (url && (url.startsWith('http') || url.startsWith('/'))) {
        if (!url.startsWith('http')) url = baseUrl + url;
        items.push({ title, url });
      }
    } else if (line.startsWith('http')) {
      items.push({ title: "媒体文件", url: line });
    }
  }
  return items;
}

// ---------- 全局变量 ----------
let globalUnlockToken = null;
let isUnlocked = false;

function init(ext) {
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
    if (Array.isArray(configData)) __ext_config.sources = configData;
    else if (configData.sources) __ext_config = configData;
    if (__ext_config.global) {
      if (__ext_config.global.defaultPic) def_pic = __ext_config.global.defaultPic;
      if (__ext_config.global.debug !== undefined) debugMode = __ext_config.global.debug;
    }
  }
  showMode = getItem('showMode', 'groups');
  groupDict = JSON.parse(getItem('groupDict', '{}'));
  print(`加载 ${__ext_config.sources.length} 个分类`);
  // 检查是否已解锁
  isUnlocked = getItem('global_unlock', 'false') === 'true';
  if (!isUnlocked) {
    globalUnlockToken = generateToken();
    print(`生成解锁 token: ${globalUnlockToken}`);
    print(`手机访问以下 URL 并附加 ?password=您的密码 来解锁：`);
    let authUrl = `${WORKER_URL}?token=${globalUnlockToken}&password=密码`;
    print(authUrl);
    startPolling(globalUnlockToken, (pwd) => {
      if (pwd === 'admin') {  // 这里可以改为从 ext 或固定密码
        setItem('global_unlock', 'true');
        isUnlocked = true;
        print("手机解锁成功！");
      } else {
        print("密码错误，解锁失败");
      }
    });
  }
}

function home(filter) {
  let classes = __ext_config.sources.map(s => ({ type_id: s.name, type_name: s.name }));
  let filters = [{ key: 'show', name: '播放展示', value: [{ n: '多线路分组', v: 'groups' }, { n: '单线路', v: 'all' }] }];
  let filterDict = {};
  classes.forEach(c => { filterDict[c.type_id] = filters; });
  return JSON.stringify({ class: classes, filters: filterDict });
}
function homeVod() { return JSON.stringify({ list: [] }); }

function category(tid, pg, filter, extend) {
  if (!isUnlocked) {
    // 未解锁：返回一个提示条目，显示解锁二维码/网址
    let authUrl = `${WORKER_URL}?token=${globalUnlockToken}`;
    let vod = {
      vod_id: 'unlock_placeholder',
      vod_name: `📱 手机扫码解锁：${authUrl}`,
      vod_pic: def_pic,
      vod_remarks: '请用手机浏览器访问该网址，并添加 ?password=admin'
    };
    return JSON.stringify({ list: [vod], page: 1, pagecount: 1, limit: 1, total: 1 });
  }

  let fl = filter ? extend : {};
  if (fl.show) { showMode = fl.show; setItem('showMode', showMode); }
  if (parseInt(pg) > 1) return JSON.stringify({ list: [] });
  let source = __ext_config.sources.find(s => s.name === tid);
  if (!source) return JSON.stringify({ list: [] });

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
  if (!isUnlocked) return JSON.stringify({ list: [] });
  let parts = tid.split('###');
  let mode = parts.length > 1 ? parts[1] : 'single';
  let left = parts[0];
  let sourceUrl = left.split('$')[0];
  let tab = left.split('$')[1];
  let source = __ext_config.sources.find(s => s.url === sourceUrl);
  if (!source) return JSON.stringify({ list: [] });

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
  if (!isUnlocked) return JSON.stringify({ parse: 0, url: '', error: '未解锁' });
  let parse = /m3u8|ts|flv/i.test(id) ? 0 : 1;
  return JSON.stringify({ parse, playUrl: '', url: id });
}

function search(wd, quick) {
  if (!isUnlocked) return JSON.stringify({ list: [] });
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

export default {
  init, home, homeVod, category, detail, play, search
};