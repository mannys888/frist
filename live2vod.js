// ==================== 可读版本 ====================
// 全局变量
let headers = { "User-Agent": "Mozilla/5.0" };
let classes = [];          // 分类列表
let cates = {};            // 每个分类下的视频缓存
let picUrl = '';           // 封面图基础URL
let webPaths = {};         // 分类对应的服务器路径

// ==================== 初始化 ====================
function init(configStr) {
    let baseUrl = '';
    // 提取基础URL（如果配置中包含 "://"）
    if (configStr.indexOf('://') > 0) {
        let parts = configStr.split('://');
        baseUrl = parts[0] + '://';
        configStr = parts[1].trim();
    }
    // 提取封面图URL（如果配置中包含 "&&&"）
    if (configStr.indexOf('&&&') > 0) {
        let parts = configStr.split('&&&');
        picUrl = parts[1].trim();
        if (picUrl.indexOf('://') < 0) {
            picUrl = baseUrl + picUrl;
        }
        configStr = parts[0].trim();
    }
    console.log('picUrl: ' + picUrl);

    // 配置字符串格式：分类1#分类2#分类3...
    let rawCates = configStr.split('#');
    for (let raw of rawCates) {
        if (raw.indexOf('$') > 0) {
            // 格式：分类名$频道列表文件URL
            let parts = raw.split('$');
            let typeName = parts[0];
            let typeId = parts[1];
            if (typeId.indexOf('://') < 0) {
                typeId = baseUrl + typeId;
            }
            classes.push({
                type_id: typeId,
                type_name: typeName.replace('!!', '')
            });
        } else {
            // 格式：频道列表文件URL（可能包含通配符 {name} {cate}）
            let fileUrl = raw;
            if (fileUrl.indexOf('://') < 0) {
                fileUrl = baseUrl + fileUrl;
            }
            fileUrl = fileUrl.replace('/livesourcelist', '/file/livesourcelist');
            let response = req(fileUrl, { method: 'GET', headers: headers });
            try {
                let data = JSON.parse(response.content);
                let prefix = fileUrl.substring(0, fileUrl.lastIndexOf('/') + 1);
                for (let item of data) {
                    let cateName = item.name;
                    let cateUrl = item.url;
                    let typeId = cateName + '$' + (cateUrl.indexOf('://') < 0 ? prefix : '') + cateUrl;
                    classes.push({
                        type_id: typeId,
                        type_name: cateName.replace('!!', '')
                    });
                    webPaths[typeId] = prefix;
                }
            } catch (e) {
                console.log('解析JSON失败：' + e);
            }
        }
    }
}

// ==================== 首页（分类列表） ====================
function home() {
    return JSON.stringify({ class: classes, filters: null });
}

// ==================== 解析M3U格式直播源 ====================
function parseM3u(content, channelName) {
    let groups = {};
    let regex = /#EXTINF:.+?,([^,]+?)\s*\n(.+?)\s*\n/g;
    let match;
    while ((match = regex.exec(content)) != null) {
        let extinf = match[1];
        let title = match[2];
        let url = match[3];
        if (!title || !url) continue;
        title = title.trim();
        url = url.trim();
        let group = channelName;
        let groupMatch = /group-title="(.*?)"/.exec(extinf);
        if (groupMatch) {
            group = groupMatch[1];
        }
        if (!groups[group]) groups[group] = [];
        groups[group].push(title + ',' + url);
    }
    let result = '';
    for (let g in groups) {
        result += g + '\n';
        for (let line of groups[g]) {
            result += line + '\n';
        }
    }
    return result;
}

// ==================== 解析FM格式（JSON） ====================
function parseFm(jsonStr) {
    let result = '';
    let data = JSON.parse(jsonStr);
    for (let prov of data) {
        let provName = prov.name;
        result += provName + ',#genre#\n';
        for (let channel of prov.urls) {
            let channelName = channel.name;
            for (let url of channel.url) {
                result += channelName + ',' + url + '\n';
            }
        }
    }
    return result;
}

// ==================== 解析LU格式（JSON） ====================
function parseLu(jsonStr) {
    let result = '';
    let data = JSON.parse(jsonStr);
    let datalist = data.datalist;
    for (let item of datalist.list) {
        let name = item.name;
        let prov = item.prov;
        result += name + ',#genre#\n';
        for (let channel of prov) {
            let channelName = channel.name;
            for (let url of channel.url) {
                result += channelName + '---' + url.line + ',' + url.url + '\n';
            }
        }
    }
    return result;
}

// ==================== 获取某个分类下的视频列表 ====================
function getCateData(typeId) {
    let coverBase = picUrl;
    if (typeId.indexOf('&&&') > 0) {
        coverBase = typeId.split('&&&')[1].trim();
        if (coverBase.indexOf('://') < 0 && webPaths[typeId]) {
            coverBase = webPaths[typeId] + coverBase;
        }
        typeId = typeId.split('&&&')[0].trim();
    }
    console.log('webPicUrl: ' + coverBase);

    let parts = typeId.split('$');
    let url = parts[1];
    let channelName = parts[0];

    if (!cates[typeId]) {
        cates[typeId] = [];
        let reqHeaders = headers;
        // 如果URL中包含自定义请求头（格式：url|header1=value1&header2=value2）
        if (url.indexOf('|') > 0) {
            let headerStr = decodeURIComponent(url.split('|')[1]);
            url = url.split('|')[0];
            for (let pair of headerStr.split('&')) {
                if (pair.indexOf('=') > 0) {
                    let key = pair.split('=')[0];
                    let val = pair.split('=')[1];
                    reqHeaders[key] = val;
                }
            }
        }

        let response = req(url, { method: 'GET', headers: reqHeaders });
        let content = response.content.trim();

        // 根据内容格式选择解析器
        if (content.indexOf('#EXTM3U') >= 0) {
            content = parseM3u(content, channelName);
        } else if (content.indexOf('"channel"') > 0 && content.indexOf('"urls"') > 0) {
            content = parseFm(content);
        } else if (content.indexOf('"datalist"') > 0 && content.indexOf('"urls"') > 0) {
            content = parseLu(content);
        }

        let lines = (channelName + '\n' + content.replace(/\r/g, '')).split('\n');
        let currentName = channelName;
        let currentUrlList = '';
        let tempCover = '';

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].replace(/\s+/g, '');
            if (line != '' && line.indexOf('://') < 0 && (line.indexOf(',') < 0 || line.indexOf('#genre#') > 0)) {
                // 这是一个分组名（频道组）
                if (currentUrlList != '') {
                    // 生成上一个频道的视频项
                    let cover = coverBase.replace('{name}', encodeURIComponent(currentName))
                                         .replace('{cate}', encodeURIComponent(channelName));
                    let left = cover.indexOf('<');
                    let right = cover.indexOf('>');
                    if (left > -1 && right > left) {
                        let patternStr = cover.substring(left, right + 1);
                        let regex = new RegExp(patternStr.replace(/<|>/g, ''));
                        let replaced = currentName.replace(regex, function(match, group) { return group; });
                        cover = cover.replace(patternStr, replaced);
                        console.log(currentName + ', ' + cover);
                    }
                    let vod = {
                        vod_id: typeId + '$$' + cates[typeId].length,
                        vod_name: currentName,
                        vod_pic: cover,
                        vod_remarks: '',
                        type_name: '直播列表',
                        vod_year: '',
                        vod_area: '',
                        vod_actor: '',
                        vod_director: '',
                        vod_content: '',
                        vod_play_from: channelName,
                        vod_play_url: currentUrlList
                    };
                    cates[typeId].push(vod);
                }
                currentName = line.split(',')[0].trim();
                currentUrlList = '';
            } else if (line.indexOf(',') > 0 && /http|rtmp|rtsp|rsp/.test(line)) {
                // 这是一个具体的直播流
                let pair = line.split(',');
                if (currentUrlList != '') currentUrlList += '#';
                currentUrlList += pair[0].trim() + '$' + pair[1].trim();
            }
        }
        // 处理最后一个频道
        if (currentUrlList != '') {
            let cover = coverBase.replace('{name}', encodeURIComponent(currentName))
                                 .replace('{cate}', encodeURIComponent(channelName));
            let left = cover.indexOf('<');
            let right = cover.indexOf('>');
            if (left > -1 && right > left) {
                let patternStr = cover.substring(left, right + 1);
                let regex = new RegExp(patternStr.replace(/<|>/g, ''));
                let replaced = regex.test(currentName) ? currentName.match(regex)[1] : 'null';
                cover = cover.replace(patternStr, replaced);
            }
            let vod = {
                vod_id: typeId + '$$' + cates[typeId].length,
                vod_name: currentName,
                vod_pic: cover,
                vod_remarks: '',
                type_name: '直播列表',
                vod_year: '',
                vod_area: '',
                vod_actor: '',
                vod_director: '',
                vod_content: '',
                vod_play_from: channelName,
                vod_play_url: currentUrlList
            };
            cates[typeId].push(vod);
        }
    }
    return cates[typeId];
}

// ==================== 首页视频列表（默认第一个分类） ====================
function homeVod() {
    let list = getCateData(classes[0].type_id);
    return JSON.stringify({ list: list });
}

// ==================== 分类页面（按页获取） ====================
function category(tid, pg, filter, extend) {
    let list = [];
    if (pg == 1) {
        list = getCateData(tid);
    }
    return JSON.stringify({ list: list });
}

// ==================== 详情页面 ====================
function detail(vodId) {
    let parts = vodId.split('$$');
    let typeId = parts[0];
    let index = parseInt(parts[1]);
    let vod = getCateData(typeId)[index];
    console.log(JSON.stringify(vod));

    let channelName = vod.vod_play_from;
    if (channelName.indexOf('!!') >= 0) {
        channelName = channelName.replace('!!', '');
        const urls = vod.vod_play_url.split('#');
        console.log(JSON.stringify(urls));
        let groupMap = {};
        let finalMap = {};
        for (let urlItem of urls) {
            let name = urlItem.split('$')[0];
            let group = channelName;
            if (name.indexOf('---') > 0) {
                group = name.split('---')[1];
                name = name.split('---')[0];
            }
            if (!groupMap.hasOwnProperty(name)) groupMap[name] = 0;
            else groupMap[name]++;
            group = channelName + (groupMap[name] > 1 ? ' ' + groupMap[name] : '');
            if (!finalMap.hasOwnProperty(group)) finalMap[group] = [];
            finalMap[group].push(name + '$' + urlItem.split('$')[1]);
        }
        let groups = [];
        let urlsGroup = [];
        for (let g in finalMap) {
            groups.push(g);
            urlsGroup.push(finalMap[g].join('#'));
        }
        vod.vod_play_from = groups.join('$$');
        vod.vod_play_url = urlsGroup.join('$$');
    }
    return JSON.stringify({ list: [vod] });
}

// ==================== 播放 ====================
function play(flag, id, vipFlags) {
    return JSON.stringify({ parse: 0, url: id });
}

// ==================== 搜索（未实现） ====================
function search(keyword, page) {
    return null;
}

// ==================== 导出 ====================
__JS_SPIDER__ = {
    init: init,
    home: home,
    homeVod: homeVod,
    category: category,
    detail: detail,
    play: play,
    search: search
};