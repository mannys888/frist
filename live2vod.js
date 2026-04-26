// 通用动态爬虫 - 完全基于ext配置，无硬编码
// 支持动态定义请求、解析、字段映射等所有行为

// 工具函数：动态执行配置中的函数字符串或直接返回值
function dynamicExecute(rule, context, defaultValue = null) {
    if (rule === undefined || rule === null) return defaultValue;
    if (typeof rule === 'function') return rule(context);
    if (typeof rule === 'string') {
        try {
            // 使用Function构造器避免with语句，传入context作为参数
            const fn = new Function('ctx', 'return (' + rule + ')(ctx);');
            return fn(context);
        } catch (e) {
            console.error('[动态执行错误]', rule, e);
            return defaultValue;
        }
    }
    if (typeof rule === 'object' && rule !== null && !Array.isArray(rule)) {
        // 如果是对象，尝试作为配置递归处理（简单场景返回自身）
        return rule;
    }
    return rule;
}

// 通用请求函数，包装环境提供的req
function request(url, options = {}) {
    if (typeof req === 'function') {
        return req(url, options);
    }
    console.error('环境缺少req函数');
    return null;
}

// 解析响应内容，根据配置规则提取数据
function parseResponse(response, rule, context = {}) {
    if (!response) return null;
    const content = response.content || response.body || response;
    const parseType = rule.type || 'text'; // text, json, regex
    let data = content;
    if (parseType === 'json') {
        try {
            data = typeof content === 'string' ? JSON.parse(content) : content;
        } catch (e) {
            console.error('JSON解析失败', e);
            return null;
        }
    }
    // 如果定义了提取规则，执行提取
    if (rule.extract) {
        const extractCtx = { data, content, response, ...context };
        return dynamicExecute(rule.extract, extractCtx, null);
    }
    return data;
}

// 构建动态请求并解析
function dynamicFetch(config, extraContext = {}) {
    if (!config || !config.url) return null;
    const url = dynamicExecute(config.url, extraContext, '');
    if (!url) return null;
    const method = dynamicExecute(config.method, extraContext, 'GET');
    const headers = dynamicExecute(config.headers, extraContext, {});
    const response = request(url, { method, headers });
    if (!response) return null;
    return parseResponse(response, config.parse || {}, { url, ...extraContext });
}

// 核心爬虫对象
const Spider = {
    // 存储ext配置
    extConfig: null,
    
    // 初始化配置
    init(ext) {
        this.extConfig = ext || {};
        console.log('[动态爬虫] 初始化完成，配置项:', Object.keys(this.extConfig));
        return true;
    },
    
    // 获取配置中的某个规则
    getRule(path, defaultValue = null) {
        if (!this.extConfig) return defaultValue;
        const parts = path.split('.');
        let cur = this.extConfig;
        for (const p of parts) {
            if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
            else return defaultValue;
        }
        return cur !== undefined ? cur : defaultValue;
    },
    
    // 动态执行规则，支持函数字符串
    execRule(rulePath, context, defaultValue = null) {
        const rule = this.getRule(rulePath);
        return dynamicExecute(rule, context, defaultValue);
    },
    
    // 首页分类数据 - 从配置中获取分类列表
    home(ext) {
        if (ext) this.extConfig = ext;
        // 获取分类配置: 可以是静态数组，也可以是动态获取函数
        const classRule = this.getRule('home.classes');
        let classes = [];
        if (classRule) {
            classes = dynamicExecute(classRule, { spider: this }, []);
        }
        // 过滤器配置（可选）
        const filters = this.execRule('home.filters', { spider: this }, null);
        return JSON.stringify({ class: classes, filters });
    },
    
    // 首页视频推荐（可选，如果未配置则返回空列表）
    homeVod(ext) {
        if (ext) this.extConfig = ext;
        const rule = this.getRule('homeVod');
        if (!rule) return JSON.stringify({ list: [] });
        const result = dynamicFetch(rule, { spider: this, pg: 1 });
        const list = result ? this.execRule('homeVod.listExtract', { data: result, spider: this }, []) : [];
        return JSON.stringify({ list });
    },
    
    // 分类页数据
    category(tid, pg, filter, ext) {
        if (ext) this.extConfig = ext;
        const rule = this.getRule('category');
        if (!rule) return JSON.stringify({ list: [], page: pg, pagecount: 0, total: 0 });
        const context = { tid, pg, filter, spider: this };
        let data = dynamicFetch(rule, context);
        // 支持二次解析提取列表
        let list = data ? this.execRule('category.listExtract', { data, ...context }, []) : [];
        // 分页信息提取
        let pagecount = this.execRule('category.pageCount', { data, ...context }, 1);
        let total = this.execRule('category.total', { data, ...context }, list.length);
        return JSON.stringify({ list, page: parseInt(pg), pagecount: parseInt(pagecount), total: parseInt(total) });
    },
    
    // 详情页数据
    detail(ids, ext) {
        if (ext) this.extConfig = ext;
        const rule = this.getRule('detail');
        if (!rule) return JSON.stringify({ list: [] });
        const context = { ids, spider: this };
        // 支持多个id，通常只有一个，按需处理
        let data = dynamicFetch(rule, context);
        // 提取详情项，可能返回单个或数组
        let detailItem = data ? this.execRule('detail.itemExtract', { data, ...context }, null) : null;
        if (!detailItem) return JSON.stringify({ list: [] });
        // 确保vod_play_from和vod_play_url字段存在
        if (!detailItem.vod_play_from) {
            detailItem.vod_play_from = this.execRule('detail.defaultPlayFrom', context, '默认源');
        }
        if (!detailItem.vod_play_url) {
            detailItem.vod_play_url = '';
        }
        return JSON.stringify({ list: [detailItem] });
    },
    
    // 播放链接解析
    play(flag, id, ext) {
        if (ext) this.extConfig = ext;
        const rule = this.getRule('play');
        if (!rule) return JSON.stringify({ parse: 0, url: id });
        const context = { flag, id, spider: this };
        let result = dynamicFetch(rule, context);
        let playUrl = result ? this.execRule('play.urlExtract', { data: result, ...context }, id) : id;
        let parseType = this.execRule('play.parse', context, 0);
        return JSON.stringify({ parse: parseInt(parseType), url: playUrl });
    },
    
    // 搜索功能
    search(wd, quick, pg, ext) {
        if (ext) this.extConfig = ext;
        const rule = this.getRule('search');
        if (!rule) return JSON.stringify({ list: [] });
        const context = { wd, quick, pg, spider: this };
        let data = dynamicFetch(rule, context);
        let list = data ? this.execRule('search.listExtract', { data, ...context }, []) : [];
        return JSON.stringify({ list });
    }
};

// 导出标准接口
__JS_SPIDER__ = {
    init: (ext) => Spider.init(ext),
    home: (ext) => Spider.home(ext),
    homeVod: (ext) => Spider.homeVod(ext),
    category: (tid, pg, filter, ext) => Spider.category(tid, pg, filter, ext),
    detail: (ids, ext) => Spider.detail(ids, ext),
    play: (flag, id, ext) => Spider.play(flag, id, ext),
    search: (wd, quick, pg, ext) => Spider.search(wd, quick, pg, ext)
};

/* 
使用示例：ext配置结构（JSON对象）
{
    "home": {
        "classes": "() => [{type_id:'1',type_name:'电影'},{type_id:'2',type_name:'电视剧'}]"
    },
    "category": {
        "url": "(ctx) => `https://example.com/api/list?tid=${ctx.tid}&pg=${ctx.pg}`",
        "method": "GET",
        "parse": { "type": "json", "extract": "(ctx) => ctx.data.data.list" },
        "listExtract": "(ctx) => ctx.data.map(item => ({vod_id:item.id, vod_name:item.name, vod_pic:item.pic, vod_remarks:item.remark}))",
        "pageCount": "(ctx) => ctx.data.total_page"
    },
    "detail": {
        "url": "(ctx) => `https://example.com/api/detail?id=${ctx.ids}`",
        "parse": { "type": "json", "extract": "(ctx) => ctx.data.data" },
        "itemExtract": "(ctx) => ({vod_id:ctx.data.id, vod_name:ctx.data.title, vod_pic:ctx.data.pic, vod_play_from:'资源站', vod_play_url:ctx.data.play_url})"
    },
    "play": {
        "url": "(ctx) => ctx.id",
        "parse": { "type": "text" },
        "urlExtract": "(ctx) => ctx.data",
        "parse": 0
    },
    "search": {
        "url": "(ctx) => `https://example.com/api/search?wd=${encodeURIComponent(ctx.wd)}&pg=${ctx.pg}`",
        "parse": { "type": "json", "extract": "(ctx) => ctx.data.list" },
        "listExtract": "(ctx) => ctx.data.map(item => ({vod_id:item.id, vod_name:item.title, vod_pic:item.pic}))"
    }
}
*/