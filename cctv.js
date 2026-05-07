/**
 * 央视网爬虫（不依赖 ext，完全自包含）
 * 功能：获取央视栏目列表，每个栏目下的多集视频用 # 连接播放列表
 * 支持自定义请求头，适配 tv.cctv.com 接口
 */

// ========== 自定义全局请求头 ==========
const CUSTOM_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  "Referer": "https://tv.cctv.com/",
  "Origin": "https://tv.cctv.com"
};

// ========== 同步请求封装 ==========
function fetchSync(url, options = {}) {
  const method = options.method || 'GET';
  const headers = { ...CUSTOM_HEADERS, ...(options.headers || {}) };
  let reqOptions = { method, headers };
  if (options.body) {
    reqOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
  }
  try {
    const resp = req(url, reqOptions);
    let content = resp.content || '';
    if (options.json) {
      return JSON.parse(content);
    }
    return content;
  } catch (e) {
    console.error(`请求失败: ${url}`, e);
    return options.json ? null : '';
  }
}

// ========== 工具函数 ==========
function getCover(title, id) {
  // 简单返回一个默认封面，也可以从栏目logo获取
  return `https://picsum.photos/200/300?random=${Math.abs((title+id).hashCode() || 0) % 1000}`;
}

String.prototype.hashCode = function() {
  let hash = 0;
  for (let i = 0; i < this.length; i++) {
    hash = ((hash << 5) - hash) + this.charCodeAt(i);
    hash |= 0;
  }
  return hash;
};

// ========== 爬虫核心方法 ==========
function init(extend) {
  console.log("央视爬虫已启动（自包含版本）");
}

function home() {
  // 固定一个分类：“央视大全”
  return JSON.stringify({
    class: [{ type_name: "央视大全", type_id: "cctv_all" }],
    filters: null
  });
}

function homeVod() {
  return JSON.stringify({ list: [] });
}

async function category(tid, pg, filter, extend) {
  pg = pg || 1;
  // 只处理 tid === "cctv_all"
  if (tid !== "cctv_all") return JSON.stringify({ list: [], page: pg, pagecount: 0, total: 0 });
  
  // 请求栏目列表 API
  const url = `https://api.cntv.cn/lanmu/columnSearch?p=${pg}&n=30&serviceId=tvcctv&t=json`;
  const data = fetchSync(url, { json: true });
  if (!data || !data.response || !data.response.docs) {
    return JSON.stringify({ list: [], page: pg, pagecount: 0, total: 0 });
  }
  
  const docs = data.response.docs;
  const videos = [];
  for (let item of docs) {
    const columnId = item.column_id;
    const columnName = item.column_name;
    const logo = item.column_logo || '';
    // 将栏目信息存入 vod_id（JSON 字符串）
    const vodId = JSON.stringify({ id: columnId, name: columnName, pic: logo });
    videos.push({
      vod_id: vodId,
      vod_name: columnName,
      vod_pic: logo || getCover(columnName, columnId),
      vod_remarks: ''
    });
  }
  
  const total = data.response.numFound || videos.length;
  const pagecount = Math.ceil(total / 30);
  return JSON.stringify({
    list: videos,
    page: pg,
    pagecount: pagecount,
    limit: 30,
    total: total
  });
}

function detail(vodId) {
  let info;
  try {
    info = JSON.parse(vodId);
  } catch(e) {
    return JSON.stringify({ list: [] });
  }
  const columnId = info.id;
  const columnName = info.name;
  const logo = info.pic || '';
  
  // 获取该栏目下的视频列表（最多 100 条，按时间倒序）
  const url = `https://api.cntv.cn/NewVideo/getVideoListByColumn?id=${columnId}&p=1&n=100&sort=desc&mode=0&serviceId=tvcctv&t=json`;
  const data = fetchSync(url, { json: true });
  if (!data || !data.data || !data.data.list) {
    return JSON.stringify({ list: [] });
  }
  
  const videoList = data.data.list;
  if (videoList.length === 0) {
    return JSON.stringify({ list: [] });
  }
  
  // 构建播放列表：标题$guid，用 # 连接
  const playItems = videoList.map(v => `${v.title}$${v.guid}`);
  const playUrl = playItems.join('#');
  
  const vod = {
    vod_id: vodId,
    vod_name: columnName,
    vod_pic: logo || getCover(columnName, columnId),
    type_name: "央视栏目",
    vod_play_from: "央视影音",
    vod_play_url: playUrl,
    vod_remarks: `共 ${videoList.length} 期`,
    vod_content: `《${columnName}》栏目合集，包含最近 ${videoList.length} 期内容。`
  };
  return JSON.stringify({ list: [vod] });
}

function play(flag, id, vipFlags) {
  // id 是 guid（视频唯一标识）
  // 请求视频信息接口获取最高码率 m3u8
  const infoUrl = `https://vdn.apps.cntv.cn/api/getHttpVideoInfo.do?pid=${id}`;
  const info = fetchSync(infoUrl, { json: true });
  if (!info || !info.hls_url) {
    return JSON.stringify({ parse: 0, url: id }); // 降级返回原始 id
  }
  let hlsUrl = info.hls_url.trim();
  
  // 可选：尝试获取 1200 码率（原 python 逻辑）
  try {
    // 获取 m3u8 内容，找到最后一个流（通常最高码率）
    const m3u8Content = fetchSync(hlsUrl);
    if (m3u8Content) {
      const lines = m3u8Content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
      if (lines.length > 0) {
        let lastLine = lines[lines.length - 1].trim();
        let baseUrl = hlsUrl.substring(0, hlsUrl.lastIndexOf('/') + 1);
        let highUrl = lastLine.startsWith('http') ? lastLine : baseUrl + lastLine;
        // 替换码率为 1200
        if (highUrl.includes('/800/')) highUrl = highUrl.replace('/800/', '/1200/');
        else if (highUrl.includes('/400/')) highUrl = highUrl.replace('/400/', '/1200/');
        // 测试是否存在
        const testResp = req(highUrl, { method: 'HEAD', headers: CUSTOM_HEADERS });
        if (testResp && (testResp.status === 200 || testResp.status_code === 200)) {
          hlsUrl = highUrl;
        }
      }
    }
  } catch(e) {
    console.warn("码率切换失败", e);
  }
  
  return JSON.stringify({ parse: 0, playUrl: '', url: hlsUrl });
}

function search(keyword, page) {
  // 可选实现搜索（略）
  return JSON.stringify({ list: [] });
}

// 导出爬虫对象
__JS_SPIDER__ = { init, home, homeVod, category, detail, play, search };