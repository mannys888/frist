# -*- coding: utf-8 -*-
"""
TVBox 爬虫 Python 后端 API 示例
支持 home、category、detail、play 四个标准接口
使用 Flask 框架，运行后访问 http://127.0.0.1:5000/api/spider?method=home 测试
"""

from flask import Flask, request, jsonify
import requests
import json
import re

app = Flask(__name__)

# ========== 配置区域 ==========
# 你可以在这里修改你的 Cookie（如果需要访问 B站等需要登录的站点）
BILI_COOKIE = "SESSDATA=你的SESSDATA; bili_jct=你的bili_jct; DedeUserID=你的UID"
# 或者直接从浏览器复制完整的 Cookie 字符串

# 请求头
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://www.bilibili.com"
}

# ========== 爬虫核心函数（借鉴您的 B站爬虫） ==========
def fetch(url, cookies=None):
    """发送 GET 请求，返回响应文本"""
    headers = HEADERS.copy()
    if cookies:
        headers["Cookie"] = cookies
    resp = requests.get(url, headers=headers, timeout=10)
    resp.encoding = 'utf-8'
    return resp.text

def get_home():
    """返回分类列表（与你的 homeContent 逻辑一致）"""
    cateManual = {
        "7年级地理": "7年级地理",
        "7年级生物": "7年级生物",
        "7年级物理": "7年级物理",
        "7年级化学": "7年级化学",
        "8年级语文": "8年级语文",
        "8年级数学": "8年级数学",
        "8年级英语": "8年级英语",
        "8年级历史": "8年级历史",
        "8年级地理": "8年级地理",
        "8年级生物": "8年级生物",   
        "8年级物理": "8年级物理",
        "8年级化学": "8年级化学",
        "9年级语文": "9年级语文",
        "9年级数学": "9年级数学",
        "9年级英语": "9年级英语",
        "9年级历史": "9年级历史",
        "9年级地理": "9年级地理",
        "9年级生物": "9年级生物",
        "9年级物理": "9年级物理",
        "9年级化学": "9年级化学"
    }
    classes = [{"type_name": k, "type_id": v} for k, v in cateManual.items()]
    return {"class": classes, "filters": None}

def get_category(tid, pg):
    """根据分类名称返回视频列表（与你的 categoryContent 逻辑类似）"""
    pg = int(pg)
    # 这里只实现了按关键词搜索，其他分类（热门、排行榜、动态）可自行扩展
    if tid == "热门":
        url = f"https://api.bilibili.com/x/web-interface/popular?ps=20&pn={pg}"
        text = fetch(url, cookies=BILI_COOKIE)
        data = json.loads(text)
        videos = []
        if data.get('code') == 0:
            for vod in data['data']['list']:
                videos.append({
                    "vod_id": str(vod['aid']),
                    "vod_name": vod['title'].replace("<em class=\"keyword\">", "").replace("</em>", ""),
                    "vod_pic": vod['pic'],
                    "vod_remarks": str(vod['duration'])
                })
        return {"list": videos, "page": pg, "pagecount": 9999, "limit": 20, "total": 999999}
    
    elif tid == "排行榜":
        url = "https://api.bilibili.com/x/web-interface/ranking/v2?rid=0&type=all"
        text = fetch(url, cookies=BILI_COOKIE)
        data = json.loads(text)
        videos = []
        if data.get('code') == 0:
            for vod in data['data']['list']:
                videos.append({
                    "vod_id": str(vod['aid']),
                    "vod_name": vod['title'].replace("<em class=\"keyword\">", "").replace("</em>", ""),
                    "vod_pic": vod['pic'],
                    "vod_remarks": str(vod['duration'])
                })
        return {"list": videos, "page": 1, "pagecount": 1, "limit": 90, "total": len(videos)}
    
    elif tid == "动态":
        url = f"https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all?timezone_offset=-480&type=all&page={pg}"
        text = fetch(url, cookies=BILI_COOKIE)
        data = json.loads(text)
        videos = []
        if data.get('code') == 0:
            for item in data['data']['items']:
                if item['type'] == 'DYNAMIC_TYPE_AV':
                    arch = item['modules']['module_dynamic']['major']['archive']
                    videos.append({
                        "vod_id": str(arch['aid']),
                        "vod_name": arch['title'].replace("<em class=\"keyword\">", "").replace("</em>", ""),
                        "vod_pic": arch['cover'],
                        "vod_remarks": str(arch['duration_text'])
                    })
        return {"list": videos, "page": pg, "pagecount": 9999, "limit": 20, "total": 999999}
    
    else:
        # 默认按关键词搜索（tid 作为关键词）
        url = f"https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword={tid}&page={pg}"
        text = fetch(url, cookies=BILI_COOKIE)
        data = json.loads(text)
        videos = []
        if data.get('code') == 0:
            for vod in data['data']['result']:
                videos.append({
                    "vod_id": str(vod['aid']),
                    "vod_name": f"{tid}: {vod['title'].replace('<em class=\"keyword\">', '').replace('</em>', '')}",
                    "vod_pic": "https:" + vod['pic'],
                    "vod_remarks": str(vod['duration'])
                })
        return {"list": videos, "page": pg, "pagecount": 9999, "limit": 20, "total": 999999}

def get_detail(vid):
    """根据视频ID（aid）返回详情，包含播放列表"""
    aid = vid
    url = f"https://api.bilibili.com/x/web-interface/view?aid={aid}"
    text = fetch(url, cookies=BILI_COOKIE)
    data = json.loads(text)
    if data.get('code') != 0:
        return {"list": []}
    info = data['data']
    # 构建播放列表（多P）
    pages = info.get('pages', [])
    play_url = ""
    for p in pages:
        cid = p['cid']
        part = p['part']
        play_url += f"{part}${aid}_{cid}#"
    vod = {
        "vod_id": aid,
        "vod_name": info['title'].replace("<em class=\"keyword\">", "").replace("</em>", ""),
        "vod_pic": info['pic'],
        "type_name": info.get('tname', ''),
        "vod_year": "",
        "vod_area": "B站",
        "vod_remarks": "",
        "vod_actor": info['owner']['name'],
        "vod_director": info['owner']['name'],
        "vod_content": info.get('desc', ''),
        "vod_play_from": "B站",
        "vod_play_url": play_url.rstrip('#')
    }
    return {"list": [vod]}

def get_play(vid):
    """根据 vid（格式 aid_cid）返回真实播放地址"""
    parts = vid.split('_')
    if len(parts) != 2:
        return {"parse": 0, "url": ""}
    aid, cid = parts[0], parts[1]
    url = f"https://api.bilibili.com/x/player/playurl?avid={aid}&cid={cid}&qn=112"
    text = fetch(url, cookies=BILI_COOKIE)
    data = json.loads(text)
    if data.get('code') != 0:
        return {"parse": 0, "url": ""}
    durls = data['data'].get('durl', [])
    if not durls:
        return {"parse": 0, "url": ""}
    # 选择最高码率的视频地址（按文件大小排序）
    best = max(durls, key=lambda x: x.get('size', 0))
    play_url = best['url']
    return {"parse": 0, "url": play_url}

# ========== Flask 路由 ==========
@app.route('/api/spider')
def spider_api():
    method = request.args.get('method')
    if method == 'home':
        return jsonify(get_home())
    elif method == 'category':
        tid = request.args.get('tid', '')
        pg = request.args.get('pg', 1)
        result = get_category(tid, pg)
        return jsonify(result)
    elif method == 'detail':
        vid = request.args.get('vid', '')
        result = get_detail(vid)
        return jsonify(result)
    elif method == 'play':
        vid = request.args.get('vid', '')
        result = get_play(vid)
        return jsonify(result)
    else:
        return jsonify({"error": "unknown method"}), 400

if __name__ == '__main__':
    # 启动服务，监听所有网卡，端口 5000
    app.run(host='0.0.0.0', port=5000, debug=True)