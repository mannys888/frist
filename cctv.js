// ==================== 央视大全爬虫 (完整修复版，支持导演字段显示播放地址) ====================
let globalHeaders = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.54 Safari/537.36",
  //"Host": "dh5.cntv.cdn20.com",
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

// ---------- 筛选器配置 ----------
const filtersConfig = [
  {
    "key": "cid", "name": "频道", "value": [
      { "n": "全部", "v": "" },
      { "n": "CCTV-1综合", "v": "EPGC1386744804340101" },
      { "n": "CCTV-2财经", "v": "EPGC1386744804340102" },
      { "n": "CCTV-3综艺", "v": "EPGC1386744804340103" },
      { "n": "CCTV-4中文国际", "v": "EPGC1386744804340104" },
      { "n": "CCTV-5体育", "v": "EPGC1386744804340107" },
      { "n": "CCTV-6电影", "v": "EPGC1386744804340108" },
      { "n": "CCTV-7国防军事", "v": "EPGC1386744804340109" },
      { "n": "CCTV-8电视剧", "v": "EPGC1386744804340110" },
      { "n": "CCTV-9纪录", "v": "EPGC1386744804340112" },
      { "n": "CCTV-10科教", "v": "EPGC1386744804340113" },
      { "n": "CCTV-11戏曲", "v": "EPGC1386744804340114" },
      { "n": "CCTV-12社会与法", "v": "EPGC1386744804340115" },
      { "n": "CCTV-13新闻", "v": "EPGC1386744804340116" },
      { "n": "CCTV-14少儿", "v": "EPGC1386744804340117" },
      { "n": "CCTV-15音乐", "v": "EPGC1386744804340118" },
      { "n": "CCTV-16奥林匹克", "v": "EPGC1634630207058998" },
      { "n": "CCTV-17农业农村", "v": "EPGC1563932742616872" },
      { "n": "CCTV-5+体育赛事", "v": "EPGC1468294755566101" }
    ]
  },
  {
    "key": "fc", "name": "分类", "value": [
      { "n": "全部", "v": "" },
      { "n": "新闻", "v": "新闻" }, { "n": "体育", "v": "体育" }, { "n": "综艺", "v": "综艺" },
      { "n": "健康", "v": "健康" }, { "n": "生活", "v": "生活" }, { "n": "科教", "v": "科教" },
      { "n": "经济", "v": "经济" }, { "n": "农业", "v": "农业" }, { "n": "法治", "v": "法治" },
      { "n": "军事", "v": "军事" }, { "n": "少儿", "v": "少儿" }, { "n": "动画", "v": "动画" },
      { "n": "纪实", "v": "纪实" }, { "n": "戏曲", "v": "戏曲" }, { "n": "音乐", "v": "音乐" },
      { "n": "影视", "v": "影视" }
    ]
  },
  {
    "key": "fl", "name": "字母", "value": [
      { "n": "全部", "v": "" },
      "A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z".split(',').map(l => ({ n: l, v: l }))
    ].flat()
  },
  {
    "key": "year", "name": "年份", "value": [
      { "n": "全部", "v": "" },
      ...Array.from({ length: 23 }, (_, i) => ({ n: (2022 - i).toString(), v: (2022 - i).toString() }))
    ]
  },
  {
    "key": "month", "name": "月份", "value": [
      { "n": "全部", "v": "" },
      ...Array.from({ length: 12 }, (_, i) => ({ n: (i + 1).toString().padStart(2, '0'), v: (i + 1).toString().padStart(2, '0') }))
    ]
  }
];

function init(extend) {
  console.log("央视大全爬虫-完整修复版");
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
  pg = parseInt(pg) || 1;
  let params = { ...(filter || {}), ...(extend || {}) };
  let year = params.year || '';
  let month = params.month || '';
  let prefix = year + month;
  
  let queryParams = {
    fl: params.fl || '',
    fc: params.fc || '',
    cid: params.cid || '',
    p: pg,
    n: 20,
    serviceId: 'tvcctv',
    t: 'json'
  };
  let url = 'https://api.cntv.cn/lanmu/columnSearch?' + Object.entries(queryParams).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  
  let json = fetchSync(url, { json: true });
  if (!json || !json.response || !json.response.docs) {
    return JSON.stringify({ list: [], page: pg, pagecount: 0, total: 0 });
  }
  
  let videos = [];
  for (let vod of json.response.docs) {
    let lastVideo = vod.lastVIDE?.videoSharedCode || '';
    if (lastVideo === '') lastVideo = '_';
    let guid = `${prefix}###${vod.column_name}###${lastVideo}###${vod.column_logo || ''}`;
    videos.push({
      vod_id: guid,
      vod_name: vod.column_name,
      vod_pic: vod.column_logo || '',
      vod_remarks: ''
    });
  }
  
  let total = json.response.numFound || videos.length;
  let pagecount = Math.ceil(total / 20);
  return JSON.stringify({
    list: videos,
    page: pg,
    pagecount: pagecount,
    limit: 20,
    total: total
  });
}

// 获取最佳码率 m3u8（解析子流，选择最高带宽）
function getBestM3u8(pid) {
  if (!pid) return null;
  let infoUrl = `https://vdn.apps.cntv.cn/api/getHttpVideoInfo.do?pid=${pid}`;
  let info = fetchSync(infoUrl, { json: true });
  if (!info || !info.hls_url) return null;
  let hlsUrl = info.hls_url.trim();
  
  let m3u8Content = fetchSync(hlsUrl, { cache: false });
  if (!m3u8Content) return hlsUrl;
  
  let lines = m3u8Content.split(/\r?\n/);
  let bestBandwidth = -1;
  let bestUrl = null;
  let baseUrl = hlsUrl.substring(0, hlsUrl.lastIndexOf('/') + 1);
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (line.startsWith('#EXT-X-STREAM-INF')) {
      let bwMatch = line.match(/BANDWIDTH=(\d+)/);
      let bandwidth = bwMatch ? parseInt(bwMatch[1]) : 0;
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
    let nonComment = lines.filter(l => l.trim() && !l.trim().startsWith('#'));
    if (nonComment.length > 0) {
      let last = nonComment[nonComment.length - 1].trim();
      bestUrl = last.startsWith('http') ? last : baseUrl + last;
    } else {
      bestUrl = hlsUrl;
    }
  }
  return bestUrl;
}

function detail(vodId) {
  let parts = vodId.split('###');
  if (parts.length < 4) return JSON.stringify({ list: [] });
  let prefix = parts[0];
  let title = parts[1];
  let lastVideo = parts[2];
  let logo = parts[3];
  
  if (lastVideo === '_') return JSON.stringify({ list: [] });
  
  let infoUrl = `https://api.cntv.cn/video/videoinfoByGuid?guid=${lastVideo}&serviceId=tvcctv`;
  let infoJson = fetchSync(infoUrl, { json: true });
  if (!infoJson || !infoJson.ctid) return JSON.stringify({ list: [] });
  let topicId = infoJson.ctid;
  let channel = infoJson.channel || '';
  
  let listUrl = `https://api.cntv.cn/NewVideo/getVideoListByColumn?id=${topicId}&d=${prefix}&p=1&n=100&sort=desc&mode=0&serviceId=tvcctv&t=json`;
  let listJson = fetchSync(listUrl, { json: true });
  if (!listJson || !listJson.data || !listJson.data.list) return JSON.stringify({ list: [] });
  
  let videoList = [];
  for (let video of listJson.data.list) {
    let playId = video.pid || video.vid || video.guid;
    if (playId) {
      videoList.push(`${video.title}$${playId}`);
    }
  }
  if (videoList.length === 0) return JSON.stringify({ list: [] });
  
  // 调试：将第一集的播放地址放入导演字段
  let debugPlayUrl = '';
  let firstPid = videoList[0].split('$')[1];
  if (firstPid) {
    debugPlayUrl = getBestM3u8(firstPid) || '';
  }
  
  let displayDate = prefix || new Date().getFullYear().toString();
  let vod = {
    vod_id: vodId,
    vod_name: `${displayDate} ${title}`,
    vod_pic: logo,
    type_name: channel,
    vod_year: displayDate,
    vod_area: "",
    vod_remarks: displayDate,
    vod_actor: "",
    vod_director: debugPlayUrl,
    vod_content: " ③当前页面默认只展示最新100期的内容,可在分类页面选择年份和月份进行往期节目查看。年份和月份仅影响当前页面内容,不参与分类过滤。视频默认播放可以获取到的最高帧率。",
    vod_play_from: "CCTV",
    vod_play_url: videoList.join("#")
  };
  return JSON.stringify({ list: [vod] });
}

function play(flag, id, vipFlags) {
  let bestUrl = getBestM3u8(id);
  if (!bestUrl) {
    return JSON.stringify({ parse: 0, playUrl: '', url: "https://vd4.bdstatic.com/mda-qkr85nw9z8k8uydx/hd/cae_h264/1732600097751621207/mda-qkr85nw9z8k8uydx.mp4?v_from_s=bdapp-bdappcore-feed-hnb" });
  }
  // 返回标准播放地址，播放器会使用全局请求头（由爬虫环境自动携带）
  return JSON.stringify({ parse: 0, playUrl: '', url: bestUrl });
}

function search(wd, quick) {
  return JSON.stringify({ list: [] });
}

__JS_SPIDER__ = { init, home, homeVod, category, detail, play, search };