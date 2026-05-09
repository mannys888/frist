// ==================== 百度视频搜索爬虫（直解析版，无需API Key） ====================
// 功能：搜索百度视频，返回视频列表（点击播放直接打开原网页）
// 注意：容易被封IP，仅供测试

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
function parseBaiduVideoHtml(html, wd, page) {
  let videos = [];
  // 百度移动端视频结果通常在 <div class="result c-abstract-1"> 或类似结构中
  // 这里使用宽松的正则匹配，提取视频卡片
  // 匹配模式：<a href="(视频链接)".*?<img src="(封面)".*?<span class="c-title">(标题)</span>
  // 用正则提取标题、链接、封面
  
  // 方案1：提取所有带有视频缩略图的a标签
  let blockRegex = /<a[^>]*?href="(https?:\/\/[^"]+)"[^>]*?>[\s\S]*?<img[^>]*?src="(https?:\/\/[^"]+)"[^>]*?>[\s\S]*?<span[^>]*?class="[^"]*title[^"]*"[^>]*?>([\s\S]*?)<\/span>/gi;
  let match;
  while ((match = blockRegex.exec(html)) !== null && videos.length < 20) {
    let url = match[1];
    let pic = match[2];
    let title = match[3].replace(/<[^>]+>/g, '').trim();
    // 过滤广告或非视频链接
    if (url && title && !url.includes('pos.baidu.com')) {
      videos.push({
        vod_id: `bdvideo###${encodeURIComponent(title)}###${url}`,
        vod_name: title,
        vod_pic: pic,
        vod_remarks: '百度视频',
        vod_actor: '',
        vod_director: url
      });
    }
  }
  
  // 如果正则没匹配到，尝试用另一种模式：查找 result-op 类
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
          vod_actor: '',
          vod_director: url
        });
      }
    }
  }
  
  // 如果仍然没有结果，回退：提取所有a标签，但只保留包含视频域名的（如 v.qq.com, youku.com 等）
  if (videos.length === 0) {
    let allLinks = [...html.matchAll(/<a[^>]*?href="(https?:\/\/[^"]+)"[^>]*?>([\s\S]*?)<\/a>/gi)];
    let videoDomains = ['v.qq.com', 'youku.com', 'iqiyi.com', 'm.bilibili.com', 'v.163.com', 'sohu.com', 'm.iqiyi.com', 'kuaishou.com', 'douyin.com'];
    for (let link of allLinks) {
      let url = link[1];
      let rawTitle = link[2].replace(/<[^>]+>/g, '').trim();
      if (videoDomains.some(domain => url.includes(domain)) && rawTitle.length > 5) {
        // 尝试获取封面（可能没有）
        let picMatch = url.match(/[\s\S]*?(?:cover|thumb|img)=\/\/[^&]+/);
        let pic = picMatch ? 'https:' + picMatch[0].split('=')[1] : '';
        videos.push({
          vod_id: `bdvideo###${encodeURIComponent(rawTitle)}###${url}`,
          vod_name: rawTitle,
          vod_pic: pic,
          vod_remarks: '百度视频',
          vod_actor: '',
          vod_director: url
        });
        if (videos.length >= 20) break;
      }
    }
  }
  
  return videos;
}

function init(extend) {
  console.log("百度视频搜索爬虫（直解析版）已启动");
}

function home() {
  return JSON.stringify({
    class: [{ type_name: "百度视频搜索", type_id: "baidu_video" }],
    filters: {}  // 无筛选器
  });
}

function homeVod() {
  return JSON.stringify({ list: [] });
}

function search(wd, pg, filter) {
  pg = parseInt(pg) || 1;
  // 百度移动版每页10条，pn参数从0开始
  let pn = (pg - 1) * 10;
  let url = `https://m.baidu.com/s?word=${encodeURIComponent(wd)}&pn=${pn}&rsv_bp=1&tn=SE_baidu&ie=utf-8&f=8&bs=1&rsv_spt=1&rsv_sug2=0&inputT=1285&rsv_sug4=5738`;
  let html = fetchSync(url, { cache: false });
  if (!html) {
    return JSON.stringify({ list: [], page: pg, pagecount: 0, total: 0 });
  }
  
  let videos = parseBaiduVideoHtml(html, wd, pg);
  
  // 估计总页数：百度不返回总条数，我们简单限制最多10页
  let pagecount = videos.length < 10 ? pg : pg + 1;
  if (pg >= 10) pagecount = pg;
  
  return JSON.stringify({
    list: videos,
    page: pg,
    pagecount: pagecount,
    limit: 10,
    total: videos.length
  });
}

function detail(vodId) {
  let parts = vodId.split('###');
  if (parts.length < 3) return JSON.stringify({ list: [] });
  let title = parts[1];
  let url = parts[2];
  let vod = {
    vod_id: vodId,
    vod_name: decodeURIComponent(title),
    vod_pic: '',
    type_name: '百度搜索结果',
    vod_year: '',
    vod_area: '',
    vod_remarks: '点击播放将跳转到原网页',
    vod_actor: '',
    vod_director: url,
    vod_content: `来源页面: ${url}`,
    vod_play_from: 'BaiduVideo',
    vod_play_url: `${decodeURIComponent(title)}$${url}`
  };
  return JSON.stringify({ list: [vod] });
}

function play(flag, id, vipFlags) {
  // id 就是原视频网页URL
  return JSON.stringify({ parse: 0, playUrl: '', url: id });
}

function category(tid, pg, filter, extend) {
  return JSON.stringify({ list: [], page: 1, pagecount: 0, total: 0 });
}

__JS_SPIDER__ = { init, home, homeVod, category, detail, play, search };