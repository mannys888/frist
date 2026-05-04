// JavaScript 爬虫代码 - 对应 Python 版本功能
// 环境要求：支持 fetch, TextDecoder 等 ES6+ API

// ==================== 辅助函数 ====================
/**
 * 发送 HTTP GET 请求，返回响应文本
 * @param {string} url 请求地址
 * @param {Object} headers 请求头
 * @returns {Promise<string>}
 */
async function httpGet(url, headers = {}) {
    const response = await fetch(url, {
        method: 'GET',
        headers: headers,
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.text();
}

/**
 * 发送 HTTP GET 请求，返回 JSON 对象
 * @param {string} url 
 * @param {Object} headers 
 * @returns {Promise<Object>}
 */
async function httpGetJson(url, headers = {}) {
    const text = await httpGet(url, headers);
    return JSON.parse(text);
}

// ==================== 爬虫对象定义 ====================
const spider = {
    // 配置信息
    config: {
        player: {},
        filter: {}
    },
    header: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.54 Safari/537.36"
    },
    // 内部状态
    tid: null,      // 当前分类ID
    txty: null,     // 临时存储后缀或额外信息

    /**
     * 初始化方法
     * @param {string} extend 扩展参数
     */
    init(extend = "") {
        console.log(`============${extend}============`);
        this.tid = null;
        this.txty = null;
    },

    /**
     * 首页内容 – 获取分类列表
     * @returns {Promise<Object>} { class: [], filters: {} }
     */
    async home() {
        const url = "http://127.0.0.1:9978/file/test-教育课-py/py/cateManual.json";
        const text = await httpGet(url, this.header);
        const cateManual = JSON.parse(text);
        const classes = [];
        for (const key in cateManual) {
            classes.push({
                type_name: key,
                type_id: cateManual[key]
            });
        }
        return {
            class: classes,
            filters: this.config['filter']
        };
    },

    /**
     * 首页视频推荐（未实现，返回空列表）
     * @returns {Promise<Object>} { list: [] }
     */
    async homeVod() {
        return { list: [] };
    },

    /**
     * 处理本地文本文件（get_rank 逻辑）
     * @param {string} tid 文件名
     * @param {number} pg 页码（未使用）
     * @returns {Promise<Object>} 分页视频列表
     */
    async getRank(tid, pg) {
        const url = `http://127.0.0.1:9978/file/test-教育课-py/py/${tid}`;
        const text = await httpGet(url, this.header);
        const lines = text.split(/\r?\n/);
        const videos = [];
        const protocolPattern = /^(http|https|ftp):/i;

        for (const line of lines) {
            if (protocolPattern.test(line)) {
                const parts = line.split(',');
                if (parts.length >= 2) {
                    const title = parts[0].trim();
                    const link = parts[1].trim();
                    videos.push({
                        vod_id: `${link}###True111`,   // 标记为本地文本类型
                        vod_name: title,
                        vod_pic: link,
                        vod_remarks: ''
                    });
                }
            }
        }
        return {
            list: videos,
            page: pg,
            pagecount: 9999,
            limit: 90,
            total: 999999
        };
    },

    /**
     * 请求央视接口获取视频列表
     * @param {string} tid 分类ID（未直接使用）
     * @param {number} pg 页码
     * @param {string} suffix 拼接的URL参数
     * @returns {Promise<Object>}
     */
    async getJson(tid, pg, suffix) {
        const url = `https://api.cntv.cn/NewVideo/getVideoListByColumn?${suffix}&n=20&sort=desc&mode=0&serviceId=tvcctv&t=json`;
        const data = await httpGetJson(url, this.header);
        const vodList = data.data.list;
        const videos = vodList.map(vod => ({
            vod_id: `${vod.guid}###${suffix}`,
            vod_name: vod.title,
            vod_pic: vod.image,
            vod_remarks: ''
        }));
        return {
            list: videos,
            page: pg,
            pagecount: 9999,
            limit: 90,
            total: 999999
        };
    },

    /**
     * 分类内容 – 根据 tid 类型选择数据源
     * @param {string} tid 分类ID
     * @param {number} pg 页码
     * @param {boolean} filter 是否过滤（未使用）
     * @param {Object} extend 扩展参数 { id, p, d }
     * @returns {Promise<Object>}
     */
    async category(tid, pg, filter, extend) {
        // 构建URL后缀参数
        const filterParams = ["id", "p", "d"];
        const params = ["", "", ""];
        for (let i = 0; i < filterParams.length; i++) {
            const fp = filterParams[i];
            if (extend && extend[fp] !== undefined) {
                params[i] = `${fp}=${extend[fp]}`;
            }
        }
        const suffix = params.filter(p => p !== "").join('&');
        this.tid = tid;   // 存储当前分类ID

        if (!tid.startsWith('TOPC')) {
            // 非TOPC使用本地文本文件
            return await this.getRank(tid, pg);
        } else {
            // TOPC使用央视接口
            return await this.getJson(tid, pg, suffix);
        }
    },

    /**
     * 处理详情页 – 根据标记获取播放列表
     * @param {Array<string>} array 第一个元素格式 "id###flag"
     * @returns {Promise<Object>} { list: [vod] }
     */
    async detail(array) {
        const parts = array[0].split('###');
        const tid = parts[0];      // 视频id或链接
        const flag = parts[1];     // 标记：True111 或其他(suffix)

        if (flag === "True111") {
            // 本地文本文件的详情
            return await this.getListFromLocal(array);
        } else {
            // 央视接口的详情
            return await this.getVodListFromCCTV(array);
        }
    },

    /**
     * 从本地文本文件构造vod的播放列表 (原 get_listwww)
     * @param {Array<string>} array 
     * @returns {Promise<Object>}
     */
    async getListFromLocal(array) {
        const parts = array[0].split('###');
        const tid = parts[0];            // 未使用
        const pic = parts[1];            // 封面图占位
        const url = `http://127.0.0.1:9978/file/test-教育课-py/py/${this.tid}`;
        const text = await httpGet(url, this.header);
        const lines = text.split(/\r?\n/);
        const videoList = [];
        const protocolPattern = /^(http|https|ftp):/i;

        for (const line of lines) {
            if (protocolPattern.test(line)) {
                const partsLine = line.split(',');
                if (partsLine.length >= 2) {
                    const title = partsLine[0].trim();
                    const link = partsLine[1].trim();
                    videoList.push(`${title}$${link}`);
                }
            }
        }

        const vod = {
            vod_id: tid,
            vod_name: "本地资源",
            vod_pic: pic,
            type_name: '',
            vod_year: '',
            vod_area: '',
            vod_remarks: '',
            vod_actor: '',
            vod_director: '',
            vod_content: '',
            vod_play_from: "True111",
            vod_play_url: videoList.join('#')
        };
        return { list: [vod] };
    },

    /**
     * 从央视接口构造vod的播放列表 (原 get_vodeolist)
     * @param {Array<string>} array 
     * @returns {Promise<Object>}
     */
    async getVodListFromCCTV(array) {
        const parts = array[0].split('###');
        const tid = parts[0];
        const suffix = parts[1];    // 保存的URL参数
        const url = `https://api.cntv.cn/NewVideo/getVideoListByColumn?${suffix}&n=20&sort=desc&mode=0&serviceId=tvcctv&t=json`;
        const data = await httpGetJson(url, this.header);
        const vodList = data.data.list;
        const videoList = [];

        for (const vod of vodList) {
            videoList.push(`${vod.title}$${vod.guid}`);
        }

        const vodItem = {
            vod_id: tid,
            vod_name: vodList[0]?.title || "",
            vod_pic: array[0].split('###')[1] || "",
            type_name: '',
            vod_year: '',
            vod_area: '',
            vod_remarks: '',
            vod_actor: '',
            vod_director: '',
            vod_content: '',
            vod_play_from: suffix,
            vod_play_url: videoList.join('#')
        };
        return { list: [vodItem] };
    },

    /**
     * 播放器解析 – 获取视频播放地址
     * @param {string} flag 标记（未使用）
     * @param {string} id 视频id或直接URL
     * @param {string} vipFlags VIP标记（未使用）
     * @returns {Promise<Object>} { parse, playUrl, url, header }
     */
    async play(flag, id, vipFlags) {
        let link = "";
        const urlPattern = /^(https?:\/\/[^/]+)/i;
        if (urlPattern.test(id)) {
            link = id;
        } else {
            // 当作 pid 处理，请求央视获取 hls_url
            const apiUrl = `https://vdn.apps.cntv.cn/api/getHttpVideoInfo.do?pid=${id}`;
            const data = await httpGetJson(apiUrl, this.header);
            link = data.hls_url;
        }
        return {
            parse: 0,
            playUrl: '',
            url: link,
            header: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36"
            }
        };
    },

    /**
     * 搜索功能（未实现，返回空列表）
     * @returns {Promise<Object>} { list: [] }
     */
    async search() {
        return { list: [] };
    }
};

// ==================== 导出符合规范的爬虫对象 ====================
const __JS_SPIDER__ = {
    init: spider.init.bind(spider),
    home: spider.home.bind(spider),
    homeVod: spider.homeVod.bind(spider),
    category: spider.category.bind(spider),
    detail: spider.detail.bind(spider),
    play: spider.play.bind(spider),
    search: spider.search.bind(spider)
};

// 如果使用 module.exports (Node环境)，可取消下一行注释；浏览器环境直接使用全局变量即可
// if (typeof module !== 'undefined' && module.exports) { module.exports = __JS_SPIDER__; }

// 注意：以上代码在爬虫框架中通常期望 __JS_SPIDER__ 全局可