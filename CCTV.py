# -*- coding: utf-8 -*-
import sys
sys.path.append('..')
from base.spider import Spider
import requests
import json
import re
import time
from functools import lru_cache

class cctvSpider(Spider):
    """央视栏目爬虫 - 直接调用央视官方 API"""
    
    def __init__(self):
        self.cache = {}          # 简单缓存
        self.cache_ttl = 600     # 10分钟
    
    def _fetch_json(self, url, timeout=10):
        """请求 JSON 并返回字典"""
        try:
            resp = requests.get(url, timeout=timeout)
            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            print(f"请求失败: {url} - {e}")
        return {}
    
    def _get_column_list(self, p, n):
        """获取栏目列表（带缓存）"""
        cache_key = f"col_list_{p}_{n}"
        now = time.time()
        if cache_key in self.cache and now - self.cache[cache_key]['ts'] < self.cache_ttl:
            return self.cache[cache_key]['data']
        url = f'https://api.cntv.cn/lanmu/columnSearch?p={p}&n={n}&serviceId=tvcctv&t=json'
        data = self._fetch_json(url)
        docs = data.get('response', {}).get('docs', [])
        result = []
        for item in docs:
            title = item.get('column_name', '无标题')
            last_video = item.get('lastVIDE') or item.get('videoSharedCode')
            if not last_video:
                continue
            pic = item.get('column_logo', '')
            # 将最新视频ID作为栏目标识，缓存栏目信息供 detail 使用
            self.cache[f"col_info_{last_video}"] = {'title': title, 'pic': pic}
            result.append({
                'vod_id': last_video,           # 用最新视频ID作为栏目ID
                'vod_name': title,
                'vod_pic': pic
            })
        self.cache[cache_key] = {'ts': now, 'data': result}
        return result
    
    # ================== 必须实现的接口 ==================
    
    def init(self, ext):
        """初始化（可配置扩展）"""
        print("央视爬虫初始化成功")
        return {}
    
    def home(self, filter=False):
        """返回分类列表（首页分类）"""
        classes = [
            {'type_id': 'cctv', 'type_name': '📺 央视栏目'}
        ]
        # 如果需要筛选器可在此添加
        filters = {}
        return {'class': classes, 'filters': filters}
    
    def homeVod(self):
        """首页推荐（可选）"""
        # 返回空列表，或者可以返回一些热门栏目
        return {'list': []}
    
    def category(self, tid, pg, filter, extend):
        """根据分类ID获取视频列表"""
        # 这里tid固定为 'cctv'，我们直接获取栏目列表
        try:
            p = int(pg) if pg else 1
            n = 20   # 每页数量
            items = self._get_column_list(p, n)
            # 构造返回数据
            total = len(items)   # 这里简单处理，真实API可能返回总数
            return {
                'page': p,
                'pagecount': 1,   # 仅简单分页
                'limit': n,
                'total': total,
                'list': items
            }
        except Exception as e:
            print(f"category 错误: {e}")
            return {'list': []}
    
    def detail(self, tid):
        """获取一个栏目的剧集详情（视频列表）"""
        vid = tid   # tid就是最新视频ID
        # 1. 获取视频信息以得到栏目ctid
        info_url = f'https://api.cntv.cn/video/videoinfoByGuid?guid={vid}&serviceId=tvcctv'
        info = self._fetch_json(info_url)
        ctid = info.get('ctid')
        channel = info.get('channel', '')
        if not ctid:
            return {'list': []}
        # 2. 获取该栏目下的视频列表
        list_url = f'https://api.cntv.cn/NewVideo/getVideoListByColumn?id={ctid}&d=&p=1&n=100&sort=desc&mode=0&serviceId=tvcctv&t=json'
        list_data = self._fetch_json(list_url)
        video_list = list_data.get('data', {}).get('list', [])
        # 构建播放链接字符串
        play_urls = []
        for video in video_list:
            play_id = video.get('pid') or video.get('vid') or video.get('guid')
            if play_id:
                title = video.get('title', '未命名')
                play_urls.append(f"{title}${play_id}")
        if not play_urls:
            return {'list': []}
        # 从缓存获取栏目名和图片（之前在列表时已缓存）
        col_info = self.cache.get(f"col_info_{vid}", {})
        title = col_info.get('title', '央视栏目')
        pic = col_info.get('pic', '')
        vod = {
            'vod_id': tid,
            'vod_name': title,
            'vod_pic': pic,
            'type_name': channel,
            'vod_play_from': 'CCTV',
            'vod_play_url': '#'.join(play_urls)
        }
        return {'list': [vod]}
    
    def play(self, flag, id, vipFlags):
        """获取播放地址"""
        # id 就是视频的 pid/vid
        play_url = f'https://vdn.apps.cntv.cn/api/getHttpVideoInfo.do?pid={id}'
        data = self._fetch_json(play_url)
        hls = data.get('hls_url', '')
        return {'parse': 0, 'playUrl': '', 'url': hls}
    
    def search(self, wd, quick):
        """搜索功能（可选）"""
        # 这里可以调用央视搜索接口，但暂时返回空
        return {'list': []}

# 导出类名（TVBox 要求）
Spider = cctvSpider