# coding=utf-8
#!/usr/bin/python
import sys
sys.path.append('..')
from base.spider import Spider
import json
import time
import base64
import requests
import re
import traceback

class Spider(Spider):
    def getName(self):
        return "小学学习"

    def init(self, extend=""):
        print("============ 小学学习爬虫初始化 ============")
        print("extend参数: %s" % extend)
        # 可以在这里初始化一些配置，如分类文件地址
        self.category_url = "https://raw.githubusercontent.com/mannys888/frist/refs/heads/main/cateManual(1).json"
        # 如果本地有文件，也可以使用本地地址
        # self.category_url = "http://127.0.0.1:9978/file/test-教育课-py/py/cateManual.json"
        pass

    def isVideoFormat(self, url):
        pass

    def manualVideoCheck(self):
        pass

    def homeContent(self, filter):
        result = {}
        classes = []
        # 尝试从远程获取分类配置
        try:
            rsp = requests.get(self.category_url, timeout=10)
            if rsp.status_code == 200:
                cateManual = rsp.json()
                # 期望格式: {"分类名1": "文件标识1", "分类名2": "文件标识2"}
                for k in cateManual:
                    classes.append({
                        'type_name': k,
                        'type_id': cateManual[k]
                    })
            else:
                raise Exception("HTTP %d" % rsp.status_code)
        except Exception as e:
            print("获取分类配置失败: %s" % e)
            # 如果获取失败，使用默认分类（硬编码，可根据需要修改）
            print("使用默认硬编码分类")
            default_categories = {
                "迦南诗歌": "迦南诗歌.txt",
                "经典咏流传": "yypy.txt",
                "赞美诗歌": "zm.txt"
            }
            for k in default_categories:
                classes.append({
                    'type_name': k,
                    'type_id': default_categories[k]
                })

        result['class'] = classes
        # 如果你有过滤器配置，可以添加，否则为 None
        result['filters'] = {} if filter else None
        return result

    def homeVideoContent(self):
        result = {'list': []}
        return result

    def get_rank(self, tid):
        """从 GitHub 读取文本文件，解析为视频列表"""
        url = 'https://raw.githubusercontent.com/mannys888/frist/refs/heads/main/{0}'.format(tid)
        print("正在解析文件: %s" % url)
        try:
            response = requests.get(url, timeout=15)
            if response.status_code != 200:
                print("获取文件失败，状态码: %d" % response.status_code)
                return []
            content = response.text
            videos = []
            lines = content.splitlines()
            for line in lines:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                # 支持多种分隔符: 逗号、竖线、制表符、空格
                title = None
                link = None
                # 尝试用常见分隔符分割
                for sep in [',', '|', '\t', ' ']:
                    if sep in line:
                        parts = line.split(sep, 1)
                        if len(parts) == 2:
                            title = parts[0].strip()
                            link = parts[1].strip()
                            break
                # 如果没有分隔符，检查整行是否为 URL
                if not title and re.match(r'^https?://', line):
                    title = "媒体文件"
                    link = line
                if title and link:
                    videos.append({
                        "vod_id": link + "###single",   # 添加后缀，便于 detail 识别
                        "vod_name": title,
                        "vod_pic": link,  # 可以替换为默认封面
                        "vod_remarks": ''
                    })
            print("解析到 %d 个视频" % len(videos))
            return videos
        except Exception as e:
            print("解析文件出错: %s" % e)
            traceback.print_exc()
            return []

    def categoryContent(self, tid, pg, filter, extend):
        result = {}
        pg = int(pg) if pg else 1
        print("categoryContent: tid=%s, pg=%d" % (tid, pg))

        # 如果 tid 不是以 TOPC 开头（央视分类），则走普通文件解析
        if not tid.startswith('TOPC'):
            videos = self.get_rank(tid)
            total = len(videos)
            # 简单分页，每页 50 条
            page_size = 50
            start = (pg - 1) * page_size
            page_list = videos[start:start+page_size]
            pagecount = (total + page_size - 1) // page_size if total > 0 else 1
            result['list'] = page_list
            result['page'] = pg
            result['pagecount'] = pagecount
            result['limit'] = page_size
            result['total'] = total
        else:
            # 央视分类处理（原代码逻辑，但需要完善）
            # 拼接参数
            filterParams = ["id", "p", "d"]
            params = []
            for fp in filterParams:
                if fp in extend:
                    params.append("{0}={1}".format(fp, extend[fp]))
                elif fp == 'id':
                    params.append("id={0}".format(tid))
            suffix = '&'.join(params)
            url = 'https://api.cntv.cn/NewVideo/getVideoListByColumn?{0}&n=20&sort=desc&mode=0&serviceId=tvcctv&t=json'.format(suffix)
            print("央视请求URL: %s" % url)
            try:
                rsp = self.fetch(url, headers=self.header)
                jo = json.loads(rsp.text)
                vodList = jo['data']['list']
                videos = []
                for vod in vodList:
                    guid = vod['guid']
                    title = vod['title']
                    img = vod['image']
                    videos.append({
                        "vod_id": guid + "###" + img,
                        "vod_name": title,
                        "vod_pic": img,
                        "vod_remarks": ''
                    })
                result['list'] = videos
                result['page'] = pg
                result['pagecount'] = 9999
                result['limit'] = 90
                result['total'] = 999999
            except Exception as e:
                print("央视接口请求失败: %s" % e)
                result['list'] = []
                result['page'] = pg
                result['pagecount'] = 0
                result['limit'] = 90
                result['total'] = 0

        return result

    def detailContent(self, array):
        # array 是一个列表，本爬虫中传入的是 vod_id（可能包含额外信息）
        vod_input = array[0]
        parts = vod_input.split('###')
        tid = parts[0]
        # 如果有封面图，则使用，否则留空
        pic_url = parts[1] if len(parts) > 1 else ""

        # 如果 tid 是 http 开头的，说明是普通媒体文件，直接返回播放地址
        if tid.startswith('http'):
            title = tid.split('/')[-1].split('.')[0] if '/' in tid else "媒体文件"
            vod = {
                "vod_id": tid,
                "vod_name": title,
                "vod_pic": pic_url,
                "type_name": '',
                "vod_year": "",
                "vod_area": "",
                "vod_remarks": "",
                "vod_actor": "",
                "vod_director": "",
                "vod_content": "",
                "vod_play_from": "直链",
                "vod_play_url": title + "$" + tid
            }
            return {'list': [vod]}

        # 否则视为央视 pid，请求播放地址
        url = "https://vdn.apps.cntv.cn/api/getHttpVideoInfo.do?pid={0}".format(tid)
        try:
            rsp = self.fetch(url, headers=self.header)
            jo = json.loads(rsp.text)
            title = jo.get('title', '未知标题').strip()
            link = jo.get('hls_url', '').strip()
            if not link:
                raise Exception("没有获取到播放地址")
            vod = {
                "vod_id": tid,
                "vod_name": title,
                "vod_pic": pic_url,
                "type_name": '',
                "vod_year": "",
                "vod_area": "",
                "vod_remarks": "",
                "vod_actor": "",
                "vod_director": "",
                "vod_content": "",
                "vod_play_from": "央视源",
                "vod_play_url": title + "$" + link
            }
            return {'list': [vod]}
        except Exception as e:
            print("获取详情失败: %s" % e)
            # 出错时返回一个占位，避免前端报错
            vod = {
                "vod_id": tid,
                "vod_name": "播放失败",
                "vod_pic": pic_url,
                "vod_play_from": "错误",
                "vod_play_url": ""
            }
            return {'list': [vod]}

    def searchContent(self, key, quick):
        result = {'list': []}
        return result

    def playerContent(self, flag, url, vipFlags):
        result = {}
        result["parse"] = 0
        result["playUrl"] = ''
        result["url"] = url
        result["header"] = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36"
        }
        return result

    config = {
        "player": {},
        "filter": {}
    }

    header = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.54 Safari/537.36",
        "Referer": "https://www.cntv.cn"
    }

    def localProxy(self, param):
        # 如果需要代理，在这里实现，否则可以返回空或直接转发
        return [200, "video/MP2T", "", ""]