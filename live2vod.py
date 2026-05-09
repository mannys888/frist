# coding=utf-8
#!/usr/bin/python
import sys
sys.path.append('..')
from base.spider import Spider
import json
import time
import base64
import re
import traceback

class Spider(Spider):
    def getName(self):
        return "小学学习"

    def init(self, extend=""):
        print("============ 小学学习爬虫初始化 ============")
        print("extend参数: %s" % extend)
        self.category_url = "https://raw.githubusercontent.com/mannys888/frist/refs/heads/main/cateManual(1).json"
        # 文件内容缓存，避免重复下载
        self.file_cache = {}

    def isVideoFormat(self, url):
        pass

    def manualVideoCheck(self):
        pass

    def homeContent(self, filter):
        result = {}
        classes = []
        try:
            rsp = self.fetch(self.category_url, headers=self.header)
            if rsp.status_code == 200:
                cateManual = rsp.json()
                for k in cateManual:
                    classes.append({
                        'type_name': k,
                        'type_id': cateManual[k]
                    })
            else:
                raise Exception("HTTP %d" % rsp.status_code)
        except Exception as e:
            print("获取分类配置失败: %s" % e)
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
        result['filters'] = {} if filter else None
        return result

    def homeVideoContent(self):
        return {'list': []}

    def _parse_file_to_videos(self, file_url):
        """解析文本文件，返回视频列表（每个元素为 {title, url}）"""
        if file_url in self.file_cache:
            return self.file_cache[file_url]
        try:
            rsp = self.fetch(file_url, headers=self.header)
            if rsp.status_code != 200:
                print("获取文件失败: %s" % rsp.status_code)
                return []
            content = rsp.text
            videos = []
            lines = content.splitlines()
            for line in lines:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                title = None
                link = None
                # 支持分隔符: , | \t 空格
                for sep in [',', '|', '\t', ' ']:
                    if sep in line:
                        parts = line.split(sep, 1)
                        if len(parts) == 2:
                            title = parts[0].strip()
                            link = parts[1].strip()
                            break
                if not title and re.match(r'^https?://', line):
                    title = "媒体文件"
                    link = line
                if title and link:
                    videos.append({"title": title, "url": link})
            self.file_cache[file_url] = videos
            return videos
        except Exception as e:
            print("解析文件出错: %s" % e)
            traceback.print_exc()
            return []

    def categoryContent(self, tid, pg, filter, extend):
        result = {}
        pg = int(pg) if pg else 1
        print("categoryContent: tid=%s, pg=%d" % (tid, pg))

        # 央视分类分支（保留）
        if tid.startswith('TOPC'):
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

        # 普通文件分类：每个 txt 文件作为一个合集（单条目），提高用户体验
        file_url = "https://raw.githubusercontent.com/mannys888/frist/refs/heads/main/{0}".format(tid)
        videos = self._parse_file_to_videos(file_url)
        if not videos:
            result['list'] = []
        else:
            # 构造一个虚拟的 vod_id，用于 detailContent 识别（格式：file://文件URL###分类名）
            # 同时存储分类名，便于显示
            vod_id = "file://{0}###{1}".format(file_url, tid)
            result['list'] = [{
                "vod_id": vod_id,
                "vod_name": tid.replace('.txt', '') + " 合集",   # 显示为“迦南诗歌 合集”
                "vod_pic": "",   # 可以设置一个默认封面
                "vod_remarks": "共{}集".format(len(videos))
            }]
        result['page'] = pg
        result['pagecount'] = 1
        result['limit'] = 20
        result['total'] = len(videos)
        return result

    def detailContent(self, array):
        vod_input = array[0]
        # 处理文件合集类型
        if vod_input.startswith('file://'):
            # 格式：file://文件URL###分类名
            parts = vod_input.split('###')
            if len(parts) >= 2:
                file_url = parts[0][7:]  # 去掉 "file://"
                category_name = parts[1]
                videos = self._parse_file_to_videos(file_url)
                if videos:
                    # 拼接播放列表：标题1$url1#标题2$url2
                    play_url = "#".join(["{0}${1}".format(v['title'], v['url']) for v in videos])
                    vod = {
                        "vod_id": vod_input,
                        "vod_name": category_name.replace('.txt', '') + " 合集",
                        "vod_pic": "",
                        "type_name": "教育",
                        "vod_year": "",
                        "vod_area": "",
                        "vod_remarks": "共{}集".format(len(videos)),
                        "vod_actor": "",
                        "vod_director": "",
                        "vod_content": "本合集包含{}个视频，请在播放列表中选择。".format(len(videos)),
                        "vod_play_from": "直链",
                        "vod_play_url": play_url
                    }
                    return {'list': [vod]}
                else:
                    return {'list': []}

        # 直链类型（旧格式：url###single）
        if vod_input.startswith('http') and '###single' in vod_input:
            url_part = vod_input.split('###')[0]
            title = url_part.split('/')[-1].split('.')[0]
            vod = {
                "vod_id": vod_input,
                "vod_name": title,
                "vod_pic": "",
                "type_name": '',
                "vod_year": "",
                "vod_area": "",
                "vod_remarks": "",
                "vod_actor": "",
                "vod_director": "",
                "vod_content": "",
                "vod_play_from": "直链",
                "vod_play_url": title + "$" + url_part
            }
            return {'list': [vod]}

        # 央视 pid 类型（pid###img）
        if '###' in vod_input:
            parts = vod_input.split('###')
            pid = parts[0]
            pic_url = parts[1] if len(parts) > 1 else ""
            url = "https://vdn.apps.cntv.cn/api/getHttpVideoInfo.do?pid={0}".format(pid)
            try:
                rsp = self.fetch(url, headers=self.header)
                jo = json.loads(rsp.text)
                title = jo.get('title', '未知标题').strip()
                link = jo.get('hls_url', '').strip()
                if not link:
                    raise Exception("没有获取到播放地址")
                vod = {
                    "vod_id": pid,
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
                vod = {
                    "vod_id": pid,
                    "vod_name": "播放失败",
                    "vod_pic": pic_url,
                    "vod_play_from": "错误",
                    "vod_play_url": ""
                }
                return {'list': [vod]}

        # 保底：直接当作普通链接处理
        vod = {
            "vod_id": vod_input,
            "vod_name": "未知视频",
            "vod_pic": "",
            "vod_play_from": "直链",
            "vod_play_url": "视频$" + vod_input
        }
        return {'list': [vod]}

    def searchContent(self, key, quick):
        return {'list': []}

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
        return [200, "video/MP2T", "", ""]