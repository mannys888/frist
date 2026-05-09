// ==================== 百度视频搜索爬虫（修复分类点击无数据，开箱即用） ====================
let globalHeaders = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Mobile Safari/537.36 Edg/91.0.864.59",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.8,en-US;q=0.5,en;q=0.3",
  "Referer": "https://m.baidu.com/"
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
    if (options.cache !== false) cache[url] = content;
    return content;
  } catch (e) {
    console.log(`请求失败: ${url} - ${e.message}`);
    return '';
  }
}

// 解析百度移动版视频搜索结果
function parseBaiduVideoHtml(html) {
  let videos = [];
  // 匹配视频卡片
  let blockRegex = /<a[^>]*?href="(https?:\/\/[^"]+)"[^>]*?>[\s\S]*?<img[^>]*?src="(https?:\/\/[^"]+)"[^>]*?>[\s\S]*?<span[^>]*?class="[^"]*title[^"]*"[^>]*?>([\s\S]*?)<\/span>/gi;
  let match;
  while ((match = blockRegex.exec(html)) !== null && videos.length < 20) {
    let url = match[1];
    let pic = match[2];
    let title = match[3].replace(/<[^>]+>/g, '').trim();
    if (url && title && !url.includes('pos.baidu.com')) {
      videos.push({
        vod_id: `bdvideo###${encodeURIComponent(title)}###${url}`,
        vod_name: title,
        vod_pic: pic,
        vod_remarks: '百度视频',
        vod_director: url
      });
    }
  }
  // 备用解析规则
  if (videos.length === 0) {
    let altRegex = /<div[^>]*?class="[^"]*?result[^"]*?"[^>]*?>[\s\S]*?<a[^>]*?href="(https?:\/\/[^"]+)"[\s\S]*?<img[^>]*?src="(https?:\/\/[^"]+)"[\s\S]*?<span[^>]*?>([\s\S]*?)<\/span>/gi;
    while ((match = altRegex.exec(html)) !== null && videos.length < 20) {
      let url = match[1];
      let pic = match[2];
      let title = match[3].replace(/<[^>]+>/g, '').trim();
      if (url && title && !url.includes('pos.baidu.com')) {
        videos.push({
          vod_id: `bdvideo###${encodeURIComponent(title)}###${url}`,
          vod_name: title,
          vod_pic: pic,
          vod_remarks: '百度视频',
          vod_director: url
        });
      }
    }
  }
  return videos;
}

function init(extend) {
  console.log("百度视频搜索爬虫（修复版）已启动");
}

function home() {
  // 提供一个分类“热门推荐”，点击后自动搜索“短视频”
  return JSON.stringify({
    class: [{ type_name: "热门推荐", type_id: "hot" }],
    filters: {}
  });
}

function homeVod() {
  return JSON.stringify({ list: [] });
}

// 执行搜索的核心函数
function doSearch(keyword, pg) {
  pg = parseInt(pg) || 1;
  let pn = (pg - 1) * 10;
  let url = `https://m.baidu.com/s?word=${encodeURIComponent(keyword)}&pn=${pn}&rsv_bp=1&tn=SE_baidu&ie=utf-8`;
  let html = fetchSync(url, { cache: false });
  if (!html) {
    return { list: [], page: pg, pagecount: 0, total: 0 };
  }
  let videos = parseBaiduVideoHtml(html);
  let pagecount = videos.length < 10 ? pg : pg + 1;
  if (pg >= 10) pagecount = pg;
  return { list: videos, page: pg, pagecount: pagecount, limit: 10, total: videos.length };
}

function search(wd, pg, filter) {
  let result = doSearch(wd, pg);
  return JSON.stringify(result);
}

function category(tid, pg, filter, extend) {
  // 分类点击时，默认搜索“短视频”，也可根据tid自定义
  let keyword = "短视频";
  if (tid === "hot") keyword = "短视频";
  else if (tid && tid !== "baidu_video") keyword = tid;
  let result = doSearch(keyword, pg);
  return JSON.stringify(result);
}

function detail(vodId) {
  let parts = vodId.split('###');
  if (parts.length < 3) return JSON.stringify({ list: [] });
  let title = decodeURIComponent(parts[1]);
  let url = parts[2];
  let vod = {
    vod_id: vodId,
    vod_name: title,
    vod_pic: '',
    type_name: '百度视频',
    vod_remarks: '点击播放跳转原网页',
    vod_director: url,
    vod_content: `来源: ${url}`,
    vod_play_from: 'Baidu',
    vod_play_url: `${title}$${url}`
  };
  return JSON.stringify({ list: [vod] });
}

function play(flag, id, vipFlags) {
  return JSON.stringify({ parse: 0, playUrl: '', url: id });
}

__JS_SPIDER__ = { init, home, homeVod, category, detail, play, search };