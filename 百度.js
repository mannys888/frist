// ==================== SerpApi 谷歌视频搜索爬虫（稳定商业版，需要API密钥） ====================
// 功能：调用 SerpApi 的 google_videos 引擎，返回视频搜索结果列表，点击播放跳转原网页
// 使用前请前往 https://serpapi.com/ 注册并获取 API Key（免费套餐每月100次查询）
// 注意：本爬虫不直接返回视频流地址，而是返回搜索结果页面的原始URL，用户点击后跳转观看

// 全局请求头，模拟普通浏览器访问
let globalHeaders = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.54 Safari/537.36",
  "Accept": "application/json"
};

// 缓存对象，避免短时间内重复请求相同 URL（可选）
let cache = {};

// 核心请求函数，兼容 CMS 的 req 方法
// url: 请求地址, options: { method, headers, cache?: false 禁用缓存 }
function fetchSync(url, options = {}) {
  // 如果开启缓存且缓存中有，直接返回
  if (options.cache !== false && cache[url]) {
    return cache[url];
  }
  try {
    let reqOpts = {
      method: options.method || 'GET',
      headers: { ...globalHeaders, ...(options.headers || {}) }
    };
    // 调用 CMS 提供的 req 函数，返回 { content, status } 或字符串
    let resp = req(url, reqOpts);
    let content = typeof resp === 'string' ? resp : resp.content;
    // 存入缓存
    if (options.cache !== false) {
      cache[url] = content;
    }
    return content;
  } catch (e) {
    console.log(`SerpApi 请求失败: ${url} - ${e.message}`);
    return '';
  }
}

// ==================== 核心搜索函数（调用 SerpApi） ====================
// keyword: 搜索关键词, page: 页码（从1开始）, filter: 额外筛选参数（本爬虫未使用，但保留参数）
function searchViaSerpApi(keyword, page, filter) {
  // 请将下方字符串替换为你在 SerpApi 官网获取的真实 API Key
  const API_KEY = "你的SerpApi密钥";   // <--- 重要：必须替换为实际密钥
  
  page = parseInt(page) || 1;
  // SerpApi 的分页参数 start 从 0 开始，每页 10 条
  let start = (page - 1) * 10;
  
  // 构建请求 URL
  // 参数说明：
  // - engine: 使用 google_videos 视频搜索引擎
  // - q: 搜索关键词
  // - api_key: 你的密钥
  // - start: 起始位置
  // - hl: 界面语言（简体中文）
  // - gl: 国家/地区（中国，可根据需要修改为 us, jp 等）
  let params = new URLSearchParams({
    engine: 'google_videos',
    q: keyword,
    api_key: API_KEY,
    start: start,
    hl: 'zh-CN',
    gl: 'cn'
  });
  let url = `https://serpapi.com/search?${params.toString()}`;
  
  // 发起请求，禁用缓存（避免多次测试时返回旧数据）
  let jsonStr = fetchSync(url, { cache: false });
  if (!jsonStr) {
    return { list: [], page: page, pagecount: 0, total: 0 };
  }
  
  let data;
  try {
    data = JSON.parse(jsonStr);
  } catch (e) {
    console.log("解析 SerpApi 响应失败:", e);
    return { list: [], page: page, pagecount: 0, total: 0 };
  }
  
  // 检查 API 错误
  if (data.error) {
    console.log("SerpApi 错误:", data.error);
    return { list: [], page: page, pagecount: 0, total: 0 };
  }
  
  // 提取视频结果列表
  let videoResults = data.video_results || [];
  let videos = [];
  for (let item of videoResults) {
    // 必需字段：标题和链接
    if (item.title && item.link) {
      // vod_id 格式：serpapi###标题###URL（用于 detail 解析）
      let vodId = `serpapi###${encodeURIComponent(item.title)}###${item.link}`;
      videos.push({
        vod_id: vodId,
        vod_name: item.title,                           // 视频标题
        vod_pic: item.thumbnail ? item.thumbnail.static : '',  // 缩略图地址
        vod_remarks: item.source || 'Google Videos',    // 来源网站（如 YouTube）
        vod_actor: '',                                 // 无演员信息
        vod_director: item.link,                       // 导演字段存放原始链接，方便调试
        vod_content: item.description || ''            // 视频描述（如有）
      });
    }
  }
  
  // 估算总结果数（SerpApi 返回 search_information.total_results）
  let total = data.search_information?.total_results || videos.length;
  let pagecount = Math.ceil(total / 10);
  if (pagecount === 0) pagecount = 1;
  
  return {
    list: videos,
    page: page,
    pagecount: pagecount,
    limit: 10,
    total: total
  };
}

// ==================== CMS 标准接口实现 ====================
// 初始化函数，CMS 加载爬虫时调用
function init(extend) {
  console.log("SerpApi 谷歌视频搜索爬虫已启动（请确保已配置 API Key）");
}

// 首页返回分类信息（只有一个分类“全网视频”）
function home() {
  return JSON.stringify({
    class: [
      { type_name: "全网视频", type_id: "video" }   // type_id 用于 category 函数
    ],
    filters: {}   // 本爬虫不支持筛选器，留空
  });
}

// 首页视频推荐（一般留空，不用）
function homeVod() {
  return JSON.stringify({ list: [] });
}

// 分类页面函数：CMS 点击“全网视频”分类时调用，等同于执行一次搜索（默认关键词“热门视频”）
function category(tid, pg, filter, extend) {
  // tid 为 home 中定义的 type_id，此处为 "video"，可以自定义搜索词
  let keyword = "热门视频";   // 你可以改为任何默认搜索词，如 "搞笑视频"、"音乐MV" 等
  // 如果 tid 有特殊含义，也可以根据 tid 来改变关键词（可选）
  if (tid === "video") keyword = "热门视频";
  else if (tid) keyword = tid;   // 其他 tid 直接作为关键词
  
  let result = searchViaSerpApi(keyword, pg, filter);
  return JSON.stringify(result);
}

// 搜索函数：CMS 搜索框输入关键词时调用
function search(wd, pg, filter) {
  let result = searchViaSerpApi(wd, pg, filter);
  return JSON.stringify(result);
}

// 详情页函数：根据 vod_id 构造视频详情（用于展示单集信息）
function detail(vodId) {
  let parts = vodId.split('###');
  if (parts.length < 3) {
    return JSON.stringify({ list: [] });
  }
  let title = decodeURIComponent(parts[1]);
  let url = parts[2];
  
  // 构造单个视频的详情数据
  let vod = {
    vod_id: vodId,
    vod_name: title,
    vod_pic: '',                      // 可再从 API 获取，但简单处理留空
    type_name: '谷歌视频',
    vod_year: '',
    vod_area: '',
    vod_remarks: '点击播放将跳转到原始视频页面',
    vod_actor: '',
    vod_director: url,
    vod_content: `视频来源：${url}`,
    vod_play_from: 'GoogleVideo',
    // 播放列表格式：标题$URL，多个用 # 分隔，此处只有一个
    vod_play_url: `${title}$${url}`
  };
  return JSON.stringify({ list: [vod] });
}

// 播放函数：CMS 点击播放按钮时调用，直接返回原始网页 URL（跳转模式）
function play(flag, id, vipFlags) {
  // id 参数就是 vod_play_url 中 $ 后面的 URL，或者 detail 中 vod_director
  // 直接原样返回，让 CMS 打开该 URL（通常是跳转到 YouTube、B站等原页面）
  return JSON.stringify({ parse: 0, playUrl: '', url: id });
}

// 导出爬虫对象（必须使用 __JS_SPIDER__ 全局变量）
__JS_SPIDER__ = {
  init: init,
  home: home,
  homeVod: homeVod,
  category: category,
  detail: detail,
  play: play,
  search: search
};