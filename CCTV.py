#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
央视栏目数据服务
- /cctv/list      : 获取栏目列表（分页）
- /cctv/detail?id : 根据栏目最新视频ID获取该栏目的视频列表
- /cctv/play?vid  : 根据视频PID获取播放地址（m3u8）
依赖：flask, requests
"""

import time
from functools import lru_cache
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

# ------------------ 缓存配置 ------------------
CACHE_TTL = 600  # 10分钟
cache = {}

def fetch_json(url, timeout=10):
    """获取JSON并返回字典"""
    try:
        resp = requests.get(url, timeout=timeout)
        resp.encoding = 'utf-8'
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        print(f"请求失败: {url} - {e}")
    return {}

# ------------------ 列表接口 ------------------
@lru_cache(maxsize=128)
def get_column_list(p, n):
    """缓存栏目列表"""
    url = f'https://api.cntv.cn/lanmu/columnSearch?p={p}&n={n}&serviceId=tvcctv&t=json'
    data = fetch_json(url)
    docs = data.get('response', {}).get('docs', [])
    return docs

@app.route('/cctv/list')
def cctv_list():
    p = request.args.get('p', 1, type=int)
    n = request.args.get('n', 20, type=int)
    docs = get_column_list(p, n)
    items = []
    for item in docs:
        title = item.get('column_name', '无标题')
        # 取最新视频ID作为栏目标识
        last_video = item.get('lastVIDE') or item.get('videoSharedCode') or ''
        if not last_video:
            continue
        pic = item.get('column_logo', '')
        # 将栏目信息存入缓存供 detail 使用
        cache[f'col_{last_video}'] = {'title': title, 'pic': pic}
        items.append({
            'vod_id': last_video,          # 用最新视频ID作为栏目ID
            'vod_name': title,
            'vod_pic': pic
        })
    return jsonify({'list': items})

# ------------------ 详情接口 ------------------
@app.route('/cctv/detail')
def cctv_detail():
    vid = request.args.get('id')
    if not vid:
        return jsonify({'list': []})
    
    # 1. 根据最新视频ID获取栏目信息
    info_url = f'https://api.cntv.cn/video/videoinfoByGuid?guid={vid}&serviceId=tvcctv'
    info = fetch_json(info_url)
    ctid = info.get('ctid')
    channel = info.get('channel', '')
    if not ctid:
        return jsonify({'list': []})
    
    # 2. 获取该栏目下的所有视频（最多100条）
    list_url = f'https://api.cntv.cn/NewVideo/getVideoListByColumn?id={ctid}&d=&p=1&n=100&sort=desc&mode=0&serviceId=tvcctv&t=json'
    list_data = fetch_json(list_url)
    video_list = list_data.get('data', {}).get('list', [])
    
    play_urls = []
    for video in video_list:
        play_id = video.get('pid') or video.get('vid') or video.get('guid')
        if play_id:
            play_urls.append(f"{video.get('title', '未命名')}${play_id}")
    
    if not play_urls:
        return jsonify({'list': []})
    
    # 从缓存获取栏目名和图片
    col_info = cache.get(f'col_{vid}', {})
    title = col_info.get('title', '央视栏目')
    pic = col_info.get('pic', '')
    
    vod = {
        'vod_id': vid,
        'vod_name': title,
        'vod_pic': pic,
        'type_name': channel,
        'vod_play_from': 'CCTV',
        'vod_play_url': '#'.join(play_urls)
    }
    return jsonify({'list': [vod]})

# ------------------ 播放接口 ------------------
@app.route('/cctv/play')
def cctv_play():
    pid = request.args.get('vid')
    if not pid:
        return jsonify({'parse': 0, 'url': ''})
    play_url = f'https://vdn.apps.cntv.cn/api/getHttpVideoInfo.do?pid={pid}'
    data = fetch_json(play_url)
    hls = data.get('hls_url', '')
    return jsonify({'parse': 0, 'playUrl': '', 'url': hls})

if __name__ == '__main__':
    # 监听所有地址，端口可自定义
    app.run(host='0.0.0.0', port=5000, debug=False)