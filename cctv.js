// ==================== 央视大全爬虫 (修复请求头 & 保留地址参数) ====================
let globalHeaders = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.54 Safari/537.36",
  "Origin": "https://tv.cctv.com",
  "Referer": "https://tv.cctv.com/"
};

let cache = {};

function fetchSync(url, options = {}) {
  if (cache[url]) return cache[url];
  try {
    let reqOpts = { method: options.method || 'GET', headers: { ...globalHeaders, ...(options.headers || {}) } };
    if (options.data && reqOpts.method === 'POST') {
      reqOpts.body = JSON.stringify(options.data);
      reqOpts.headers['Content-Type'] = 'application/json';
    }
    let resp = req(url, reqOpts);
    let content = typeof resp === 'string' ? resp : resp.content;
    if (options.json) {
      let json = JSON.parse(content);
      if (options.cache !== false) cache[url] = json;
      return json;
    }
    if (options.cache !== false) cache[url] = content;
    return content;
  } catch (e) {
    console.log(`请求失败: ${url} - ${e.message}`);
    return options.json ? null : '';
  }
}

// 筛选器配置（不变，省略以节省长度，实际使用时保留原 filtersConfig）
const filtersConfig = [ /* 内容同前，此处省略 */ ];

function init(extend) {
  console.log("央视大全爬虫-修复请求头版");
}

function home() {
  return JSON.stringify({
    class: [{ type_name: "央视大全", type_id: "CCTV" }],
    filters: { "CCTV": filtersConfig }
  });
}

function homeVod() {
  return JSON.stringify({ list: [] });
}

function category(tid, pg, filter, extend) {
  // 内容同前，无修改，省略...
}

// 稳健获取最佳 m3u8 地址，并保留原始 hls_url 的参数（若需要）
function getBestM3u8(pid) {
  if (!pid) return null;
  let infoUrl = `https://vdn.apps.cntv.cn/api/getHttpVideoInfo.do?pid=${pid}`;
  let info = fetchSync(infoUrl, { json: true });
  if (!info || !info.hls_url) return null;
  let hlsUrl = info.hls_url.trim(); // 原始地址，可能带参数如 ?maxbr=1400&contentid=...
  
  let m3u8Content = fetchSync(hlsUrl, { cache: false });
  if (!m3u8Content) return hlsUrl; // 降级返回原始地址（含参数）
  
  let lines = m3u8Content.split(/\r?\n/);
  let bestBandwidth = -1;
  let bestUrl = null;
  let baseUrl = hlsUrl.substring(0, hlsUrl.lastIndexOf('/') + 1);
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (line.startsWith('#EXT-X-STREAM-INF')) {
      let bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
      let bandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1]) : 0;
      let nextLine = lines[i + 1] ? lines[i + 1].trim() : '';
      if (nextLine && !nextLine.startsWith('#')) {
        let streamUrl = nextLine.startsWith('http') ? nextLine : baseUrl + nextLine;
        if (bandwidth > bestBandwidth) {
          bestBandwidth = bandwidth;
          bestUrl = streamUrl;
        }
      }
    }
  }
  
  if (!bestUrl) {
    // 没有 EXT-X-STREAM-INF，直接取最后一个非注释行
    let nonCommentLines = lines.filter(l => l.trim() && !l.trim().startsWith('#'));
    if (nonCommentLines.length > 0) {
      let lastLine = nonCommentLines[nonCommentLines.length - 1].trim();
      bestUrl = lastLine.startsWith('http') ? lastLine : baseUrl + lastLine;
    } else {
      bestUrl = hlsUrl;
    }
  }
  
  // 注意：子流地址通常不需要参数，直接返回即可
  return bestUrl;
}

function detail(vodId) {
  // 内容同前，无修改，但其中 debugPlayUrl 会调用 getBestM3u8 获得完整地址
  // ...（省略重复代码）
}

function play(flag, id, vipFlags) {
  let bestUrl = getBestM3u8(id);
  if (!bestUrl) {
    return JSON.stringify({ parse: 0, playUrl: '', url: id });
  }
  // 关键修复：添加请求头，让播放器在请求 m3u8 和 ts 片段时携带正确的 Referer/Origin
  return JSON.stringify({
    parse: 0,
    playUrl: '',
    url: bestUrl,
    headers: {
      "User-Agent": globalHeaders["User-Agent"],
      "Origin": "https://tv.cctv.com",
      "Referer": "https://tv.cctv.com/"
    }
  });
}

function search(wd, quick) {
  return JSON.stringify({ list: [] });
}

__JS_SPIDER__ = { init, home, homeVod, category, detail, play, search };