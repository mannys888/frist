// ==================== 通用动态爬虫 v41（分类文件夹版） ====================
// 数据格式示例：
//   1️⃣看直播,#genre#
//   公众号【小马网络园】,https://...
//   qq群【869256826】,https://...
//   2️⃣随时更新频道,#genre#
//   CCTV-1(高清),http://...
//   ...
// 效果：首页显示各个分类（文件夹），点击分类进入该分类的视频列表（合集）
// ================================================================

let __ext_config = { sources: [], global: {} };
let cache_data = {};
let debugMode = true;
let defaultTimeout = 8000;
let def_pic = 'https://avatars.githubusercontent.com/u/97389433?s=120&v=4';
const VERSION = 'universal v4.1 (category folder)';

function print(any) {
  if (!debugMode) return;
  console.log(typeof any === 'object' ? JSON.stringify(any) : any);
}

function setItem(k, v) { local.set('spider', k, v); }
function getItem(k, v) { return local.get('spider', k) || v; }

function smartRequest(url, options = {}) {
  let method = options.method || 'GET';
  let headers = { 'User-Agent': 'Mozilla/5.0', ...(options.headers || {}) };
  let reqOptions = { method, headers, timeout: options.timeout || defaultTimeout };
  if (options.body) reqOptions.body = options.body;
  try {
    let res = req(url, reqOptions);
    res.text = () => res.content || '';
    return res;
  } catch(e) {
    print(`请求失败: ${url} - ${e.message}`);
    return { text: () => '' };
  }
}

function fetchSource(url) {
  if (cache_data[url]) return cache_data[url];
  let resp = smartRequest(url);
  let content = resp.text();
  cache_data[url] = content;
  return content;
}

// 解析数据源文件，提取分类结构
function parseCategories(content) {
  let lines = content.split(/\r?\n/);
  let categories = [];
  let current = null;
  let i = 0;
  while (i < lines.length) {
    let line = lines[i].trim();
    if (line.includes('#genre#')) {
      if (current) {
        current.endLine = i - 1;
        categories.push(current);
        current = null;
      }
      let name = line.split(',')[0];
      current = { name, startLine: i + 1, endLine: -1 };
      i++;
      continue;
    }
    i++;
  }
  if (current) {
    current.endLine = lines.length - 1;
    categories.push(current);
  }
  return categories;
}

// 解析分类内的视频条目（每行格式：标题,地址）
function parseItems(content, parseConfig, baseUrl) {
  let items = [];
  let lines = content.split(/\r?\n/);
  let sep = parseConfig?.line_sep || ',';
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

let sourceStructure = {};

function init(ext) {
  print(`初始化 ${VERSION}`);
  let configData = null;
  if (typeof ext === 'string' && ext.startsWith('http')) {
    let resp = smartRequest(ext);
    configData = resp.json();
  } else if (typeof ext === 'object') {
    configData = ext;
  }
  if (configData) {
    if (Array.isArray(configData)) __ext_config.sources = configData;
    else if (configData.sources) __ext_config = configData;
    if (configData.global) {
      if (configData.global.defaultPic) def_pic = configData.global.defaultPic;
      if (configData.global.debug !== undefined) debugMode = configData.global.debug;
    }
  }
  // 预解析所有源文件
  for (let src of __ext_config.sources) {
    let content = fetchSource(src.url);
    let categories = parseCategories(content);
    sourceStructure[src.url] = { categories, content };
  }
  print(`加载 ${__ext_config.sources.length} 个源`);
}

function home(filter) {
  let classes = [];
  for (let src of __ext_config.sources) {
    let cats = sourceStructure[src.url]?.categories || [];
    if (cats.length) {
      for (let cat of cats) {
        classes.push({
          type_id: `${src.url}###${cat.name}`,
          type_name: cat.name,
          icon: '📁'
        });
      }
    } else {
      // 整个文件作为一个分类
      classes.push({
        type_id: src.name,
        type_name: src.name,
        icon: '📁'
      });
    }
  }
  return JSON.stringify({ class: classes, filters: {} });
}
function homeVod() { return JSON.stringify({ list: [] }); }

function category(tid, pg, filter, extend) {
  if (parseInt(pg) > 1) return JSON.stringify({ list: [] });
  let parts = tid.split('###');
  let sourceUrl, categoryName;
  if (parts.length === 2) {
    sourceUrl = parts[0];
    categoryName = parts[1];
  } else {
    // 无分类的源
    let source = __ext_config.sources.find(s => s.name === tid);
    if (!source) return JSON.stringify({ list: [] });
    sourceUrl = source.url;
    categoryName = null;
  }
  let src = __ext_config.sources.find(s => s.url === sourceUrl);
  if (!src) return JSON.stringify({ list: [] });
  let structure = sourceStructure[sourceUrl];
  if (!structure) return JSON.stringify({ list: [] });
  let baseDir = sourceUrl.substring(0, sourceUrl.lastIndexOf('/') + 1);

  let lines = structure.content.split(/\r?\n/);
  let startLine = 0, endLine = lines.length - 1;
  if (categoryName) {
    let cat = structure.categories.find(c => c.name === categoryName);
    if (cat) {
      startLine = cat.startLine;
      endLine = cat.endLine;
    }
  } else {
    if (structure.categories.length) endLine = structure.categories[0].startLine - 1;
  }
  let categoryContent = lines.slice(startLine, endLine + 1).join('\n');
  let items = parseItems(categoryContent, src.parseConfig, baseDir);
  // 转换为视频列表（每个视频一个条目，不分页）
  let videos = items.map(item => ({
    vod_id: `${item.url}###single`,
    vod_name: item.title,
    vod_pic: def_pic,
    vod_remarks: ''
  }));
  return JSON.stringify({ list: videos, page: 1, pagecount: 1, limit: videos.length, total: videos.length });
}

function detail(tid) {
  let parts = tid.split('###');
  if (parts.length < 2) return JSON.stringify({ list: [] });
  let url = parts[0];
  let title = decodeURIComponent(url.split('/').pop().split('.')[0] || "媒体");
  let vod = {
    vod_id: url,
    vod_name: title,
    vod_pic: def_pic,
    vod_play_from: "播放源",
    vod_play_url: "播放$" + url
  };
  return JSON.stringify({ list: [vod] });
}

function play(flag, id, vipFlags) {
  let parse = /m3u8|ts|flv/i.test(id) ? 0 : 1;
  return JSON.stringify({ parse, playUrl: '', url: id });
}

function search(wd, quick) {
  return JSON.stringify({ list: [] });
}

export default { init, home, homeVod, category, detail, play, search };