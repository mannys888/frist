
//· 主要用于解析直播源（M3U8格式）和点播资源
//· 支持FM广播源和普通视频源的解析



// 解混淆后的代码
let headers = {
    'User-Agent': 'Mozilla/5.0'
};
let classes = [];
let cates = {};
let picUrl = '';
let webPaths = {};

function init(input) {
    let baseUrl = '';
    
    // 处理基础URL
    if (input.indexOf('http') > 0) {
        baseUrl = input.split('http')[0].trim();
        input = input.split('http')[1].trim();
    }
    
    // 处理图片URL
    if (input.indexOf('picUrl:') > 0) {
        picUrl = input.split('picUrl:')[1].trim();
        if (picUrl.indexOf('http') < 0) {
            picUrl = baseUrl + picUrl;
        }
        input = input.split('picUrl:')[0].trim();
    }
    
    console.log('picUrl: ' + picUrl);
    
    let sections = input.split('#');
    for (const section of sections) {
        if (section.indexOf('$') > 0) {
            // 处理分类
            let typeId = section;
            let typeName = section.split('$')[0];
            if (typeId.indexOf('http') < 0) {
                typeId = typeId.replace('$', '$' + baseUrl);
            }
            classes.push({
                'type_id': typeId,
                'type_name': typeName.replace('!!', '')
            });
        } else {
            // 处理频道数据
            let channelUrl = section;
            if (channelUrl.indexOf('http') < 0) {
                channelUrl = baseUrl + channelUrl;
            }
            channelUrl = channelUrl.replace('/file/livesourcelist', '/livesourcelist');
            
            let response = req(channelUrl, {
                'method': 'GET',
                'headers': headers
            });
            
            try {
                let dataList = JSON.parse(response.content);
                let basePath = channelUrl.substring(0, channelUrl.lastIndexOf('/') + 1);
                
                for (const item of dataList) {
                    let name = item.name;
                    let url = item.url;
                    let typeId = name + '$' + (url.indexOf('http') < 0 ? basePath : '') + url;
                    classes.push({
                        'type_id': typeId,
                        'type_name': name.replace('!!', '')
                    });
                    webPaths[typeId] = basePath;
                }
            } catch(e) {
                console.log('error: ' + e);
            }
        }
    }
}

function home() {
    return JSON.stringify({
        'class': classes,
        'filters': null
    });
}

function parseM3u(content, groupName) {
    let result = {};
    let regex = /(#EXTINF:.+?,([^,]+?)\s*\n(.+?)\s*\n)/g;
    let match = null;
    
    while ((match = regex.exec(content)) != null) {
        let extinf = match[1];
        let title = match[2];
        let url = match[3];
        
        if (title == null || url == null || title == '' || url == '') {
            continue;
        }
        
        title = title.trim();
        url = url.trim();
        
        let group = groupName;
        let groupRegex = /group-title="(.*?)"/;
        if (groupRegex.test(extinf)) {
            group = extinf.match(groupRegex)[1];
        }
        
        if (!result[group]) {
            result[group] = [];
        }
        result[group].push(title + ',' + url);
    }
    
    let output = '';
    for (const group in result) {
        output += group + '\n';
        let items = result[group];
        for (const item of items) {
            output += item + '\n';
        }
    }
    return output;
}

function parseFm(data) {
    let output = '';
    let parsed = JSON.parse(data);
    
    for (const item of parsed) {
        let name = item.name;
        let urls = item.urls;
        output += name + ',#genre#\n';
        
        for (const urlItem of urls) {
            let urlName = urlItem.name;
            let urlList = urlItem.urls;
            for (const url of urlList) {
                output += urlName + ',' + url + '\n';
            }
        }
    }
    return output;
}

function parseLu(data) {
    let output = '';
    let parsed = JSON.parse(data);
    let dataList = parsed.datalist;
    
    for (const item of dataList.list) {
        let line = item.line;
        let prov = item.prov;
        output += line + ',#genre#\n';
        
        for (const provItem of prov) {
            let name = provItem.name;
            let urls = provItem.urls;
            for (const urlItem of urls) {
                output += name + '----' + urlItem.name + ',' + urlItem.url + '\n';
            }
        }
    }
    return output;
}

function getCateData(typeId) {
    let currentPicUrl = picUrl;
    
    if (typeId.indexOf('picUrl:') > 0) {
        currentPicUrl = typeId.split('picUrl:')[1].trim();
        if (currentPicUrl.indexOf('http') < 0 && webPaths[typeId]) {
            currentPicUrl = webPaths[typeId] + currentPicUrl;
        }
        typeId = typeId.split('picUrl:')[0].trim();
    }
    
    console.log('webPicUrl: ' + currentPicUrl);
    
    let urlPart = typeId.split('$')[1];
    let groupName = typeId.split('$')[0];
    
    if (!cates[typeId]) {
        cates[typeId] = [];
        let customHeaders = headers;
        
        // 处理自定义请求头
        if (urlPart.indexOf('|') > 0) {
            let headerStr = decodeURIComponent(urlPart.split('|')[1]);
            urlPart = urlPart.split('|')[0];
            
            for (const headerItem of headerStr.split('&')) {
                if (headerItem.indexOf('=') > 0) {
                    let key = headerItem.split('=')[0];
                    let value = headerItem.split('=')[1];
                    customHeaders[key] = value;
                }
            }
        }
        
        let response = req(urlPart, {
            'method': 'GET',
            'headers': customHeaders
        });
        
        let content = response.content.trim();
        
        if (content.indexOf('#EXTM3U') >= 0) {
            content = parseM3u(content, groupName);
        } else if (content.indexOf('"channel"') > 0 && content.indexOf('"urls"') > 0) {
            content = parseFm(content);
        } else if (content.indexOf('"datalist"') > 0 && content.indexOf('"urls"') > 0) {
            content = parseLu(content);
        }
        
        let lines = (groupName + '\n' + content.replace('\r', '')).split('\n');
        let currentGroup = groupName;
        let currentUrls = '';
        let currentTitle = '';
        
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].replace(/\s+/g, '');
            
            if (line != '' && line.indexOf('http') < 0 && (line.indexOf(',') < 0 || line.indexOf('#genre#') > 0)) {
                if (currentUrls != '') {
                    let picHtml = currentPicUrl.replace('{name}', encodeURIComponent(currentGroup))
                                               .replace('{cate}', encodeURIComponent(groupName));
                    let startIdx = picHtml.indexOf('<');
                    let endIdx = picHtml.lastIndexOf('>');
                    
                    if (startIdx > -1 && endIdx > startIdx) {
                        let tag = picHtml.substring(startIdx, endIdx + 1);
                        let regex = new RegExp(tag.replace(/<|>/g, ''));
                        let matched = currentGroup.match(regex);
                        let replaceStr = matched ? matched[1] : 'null';
                        picHtml = picHtml.replace(tag, replaceStr);
                        console.log(currentGroup + ', ' + picHtml);
                    }
                    
                    let vodItem = {
                        'vod_id': typeId + '$$' + cates[typeId].length,
                        'vod_name': currentGroup,
                        'vod_pic': picHtml,
                        'vod_remarks': '',
                        'type_name': '直播列表',
                        'vod_year': '',
                        'vod_area': '',
                        'vod_actor': '',
                        'vod_director': '',
                        'vod_content': '',
                        'vod_play_from': groupName,
                        'vod_play_url': currentUrls
                    };
                    cates[typeId].push(vodItem);
                }
                currentGroup = line.split(',')[0].trim();
                currentUrls = '';
            } else if (line.indexOf(',') > 0 && /http|rtmp|rtsp|rsp/.test(line)) {
                let parts = line.split(',');
                if (currentUrls != '') {
                    currentUrls += '#';
                }
                currentUrls += parts[0].trim() + '$' + parts[1].trim();
            }
        }
        
        if (currentUrls != '') {
            let picHtml = currentPicUrl.replace('{name}', encodeURIComponent(currentGroup))
                                       .replace('{cate}', encodeURIComponent(groupName));
            let startIdx = picHtml.indexOf('<');
            let endIdx = picHtml.lastIndexOf('>');
            
            if (startIdx > -1 && endIdx > startIdx) {
                let tag = picHtml.substring(startIdx, endIdx + 1);
                let regex = new RegExp(tag.replace(/<|>/g, ''));
                let replaceStr = regex.test(currentGroup) ? currentGroup.match(regex)[1] : 'null';
                picHtml = picHtml.replace(tag, replaceStr);
            }
            
            let vodItem = {
                'vod_id': typeId + '$$' + cates[typeId].length,
                'vod_name': currentGroup,
                'vod_pic': picHtml,
                'vod_remarks': '',
                'type_name': '直播列表',
                'vod_year': '',
                'vod_area': '',
                'vod_actor': '',
                'vod_director': '',
                'vod_content': '',
                'vod_play_from': groupName,
                'vod_play_url': currentUrls
            };
            cates[typeId].push(vodItem);
        }
    }
    return cates[typeId];
}

function homeVod() {
    let dataList = getCateData(classes[0].type_id);
    return JSON.stringify({ 'list': dataList });
}

function category(typeId, page, sort, style) {
    let dataList = [];
    if (page == 1) {
        dataList = getCateData(typeId);
    }
    return JSON.stringify({ 'list': dataList });
}

function detail(vodId) {
    let parts = vodId.split('$$');
    let typeId = parts[0];
    let groupName = typeId.split('$')[0];
    let index = parseInt(parts[1]);
    let vodData = getCateData(typeId)[index];
    
    console.log(JSON.stringify(vodData));
    
    if (groupName.indexOf('!!') >= 0) {
        groupName = groupName.replace('!!', '');
        const playUrls = vodData.vod_play_url.split('#');
        console.log(JSON.stringify(playUrls));
        
        let nameCount = {};
        let groupMap = {};
        
        for (const urlItem of playUrls) {
            let name = urlItem.split('$')[0];
            let displayGroup = groupName;
            
            if (name.indexOf('----') > 0) {
                displayGroup = name.split('----')[1];
                name = name.split('----')[0];
            }
            
            if (!nameCount.hasOwnProperty(name)) {
                nameCount[name] = 1;
            } else {
                nameCount[name]++;
            }
            
            displayGroup = groupName + (nameCount[name] > 1 ? ' ' + nameCount[name] : '');
            
            if (!groupMap.hasOwnProperty(displayGroup)) {
                groupMap[displayGroup] = [];
            }
            groupMap[displayGroup].push(name + '$' + urlItem.split('$')[1]);
        }
        
        let groupNames = [];
        let groupUrls = [];
        
        for (let group in groupMap) {
            groupNames.push(group);
            groupUrls.push(groupMap[group].join('#'));
        }
        
        vodData.vod_play_from = groupNames.join('$$');
        vodData.vod_play_url = groupUrls.join('$$');
    }
    
    return JSON.stringify({ 'list': [vodData] });
}

function play(flag, url, parseUrl) {
    return JSON.stringify({ 'parse': 0, 'url': url });
}

function search(keyword, page) {
    return null;
}

__JS_SPIDER__ = {
    'init': init,
    'home': home,
    'homeVod': homeVod,
    'category': category,
    'detail': detail,
    'play': play,
    'search': search
};