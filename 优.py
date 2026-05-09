#coding=utf-8
#!/usr/bin/python
import sys
sys.path.append('..')
from base.spider import Spider
import json
import time

class Spider(Spider):
    def getName(self):
        return "央视大全"

    def init(self, extend=""):
        print(f"央视爬虫加载完成，extend={extend}")
        self._cache = {}

    def isVideoFormat(self, url):
        pass

    def manualVideoCheck(self):
        pass

    def homeContent(self, filter):
        """返回首页分类及筛选器配置"""
        result = {
            "class": [{"type_name": "央视大全", "type_id": "CCTV"}],
            "filters": {}
        }
        if filter:
            # 直接使用 config 中的筛选器配置
            result["filters"] = self.config.get("filter", {})
        return result

    def homeVideoContent(self):
        return {"list": []}

    def _fetch_json(self, url):
        """封装请求，返回 JSON 对象"""
        if url in self._cache:
            return self._cache[url]
        try:
            resp = self.fetch(url, headers=self.header)
            data = resp.json()
            self._cache[url] = data
            return data
        except Exception as e:
            print(f"请求失败: {url}\n错误: {e}")
            return None

    def categoryContent(self, tid, pg, filter, extend):
        """
        获取栏目列表（完整支持筛选和翻页）
        :param tid: 分类ID（固定为 "CCTV"）
        :param pg: 页码
        :param filter: 筛选器参数（来自前端选择）
        :param extend: 扩展参数（年月等）
        """
        pg = int(pg) if pg else 1

        # 合并参数（filter 和 extend 同级）
        params = {}
        if filter:
            params.update(filter)
        if extend:
            params.update(extend)

        # 处理年月前缀（用于 vod_id）
        year = params.get("year", "")
        month = params.get("month", "")
        if year == "":
            month = ""    # 年份为空时月份无效
        prefix = year + month

        # 构建标准查询参数（与 JS 完全一致）
        query = {
            "fl": params.get("fl", ""),
            "fc": params.get("fc", ""),
            "cid": params.get("cid", ""),
            "p": pg,
            "n": 20,
            "serviceId": "tvcctv",
            "t": "json"
        }
        # 拼接 URL
        url = "https://api.cntv.cn/lanmu/columnSearch?" + "&".join(f"{k}={v}" for k, v in query.items())
        data = self._fetch_json(url)
        if not data or "response" not in data:
            return {"list": [], "page": pg, "pagecount": 0, "total": 0}

        docs = data["response"].get("docs", [])
        videos = []
        for vod in docs:
            # 获取最后一条视频的 guid
            last_video = vod.get("lastVIDE", {}).get("videoSharedCode", "")
            if not last_video:
                last_video = "_"
            column_name = vod.get("column_name", "")
            column_logo = vod.get("column_logo", "")
            vod_id = f"{prefix}###{column_name}###{last_video}###{column_logo}"
            videos.append({
                "vod_id": vod_id,
                "vod_name": column_name,
                "vod_pic": column_logo,
                "vod_remarks": ""
            })

        total = data["response"].get("numFound", len(videos))
        pagecount = (total + 19) // 20
        return {
            "list": videos,
            "page": pg,
            "pagecount": pagecount,
            "limit": 20,
            "total": total
        }

    def _get_raw_hls_url(self, pid):
        """通过 pid 获取最高码率的 hls_url"""
        if not pid:
            return None
        url = f"https://vdn.apps.cntv.cn/api/getHttpVideoInfo.do?pid={pid}"
        data = self._fetch_json(url)
        if data and "hls_url" in data:
            return data["hls_url"].strip()
        return None

    def detailContent(self, array):
        """获取栏目详情及播放列表"""
        if not array:
            return {"list": []}
        vod_id = array[0]
        parts = vod_id.split("###")
        if len(parts) < 4:
            return {"list": []}
        prefix, title, last_video, logo = parts[0], parts[1], parts[2], parts[3]

        if last_video == "_":
            return {"list": []}

        # 通过任意一期视频获取栏目 ctid
        info_url = f"https://api.cntv.cn/video/videoinfoByGuid?guid={last_video}&serviceId=tvcctv"
        info = self._fetch_json(info_url)
        if not info or "ctid" not in info:
            return {"list": []}
        topic_id = info["ctid"]
        channel = info.get("channel", "")

        # 获取该栏目下所有视频（最多100条）
        list_url = f"https://api.cntv.cn/NewVideo/getVideoListByColumn?id={topic_id}&d={prefix}&p=1&n=100&sort=desc&mode=0&serviceId=tvcctv&t=json"
        list_data = self._fetch_json(list_url)
        if not list_data or "data" not in list_data or "list" not in list_data["data"]:
            return {"list": []}

        video_list = []
        for video in list_data["data"]["list"]:
            play_id = video.get("pid") or video.get("vid") or video.get("guid")
            if play_id:
                video_list.append(f"{video.get('title', '')}${play_id}")
        if not video_list:
            return {"list": []}

        # 获取第一集播放地址（用于显示）
        first_pid = video_list[0].split("$")[1] if "$" in video_list[0] else ""
        debug_url = self._get_raw_hls_url(first_pid) or ""

        display_date = prefix if prefix else time.strftime("%Y", time.localtime())
        vod = {
            "vod_id": vod_id,
            "vod_name": f"{display_date} {title}",
            "vod_pic": logo,
            "type_name": channel,
            "vod_year": display_date,
            "vod_area": "",
            "vod_remarks": debug_url,
            "vod_actor": "",
            "vod_director": topic_id,
            "vod_content": "当前页面默认展示最新100期内容，可在分类页面选择年份和月份查看往期节目。",
            "vod_play_from": "CCTV",
            "vod_play_url": "#".join(video_list)
        }
        return {"list": [vod]}

    def searchContent(self, key, quick):
        return {"list": []}

    def playerContent(self, flag, id, vipFlags):
        """播放地址直接使用原始 hls_url（简化版）"""
        raw_url = self._get_raw_hls_url(id)
        if not raw_url:
            # 降级：直接返回 pid，让外部解析器处理
            return {"parse": 0, "playUrl": "", "url": id}
        return {
            "parse": 0,
            "playUrl": "",
            "url": raw_url,
            "header": self.header
        }

    # ==================== 配置区域 ====================
    config = {
        "player": {},
        "filter": {
            "CCTV": [
                {"key": "cid", "name": "频道", "value": [
                    {"n": "全部", "v": ""},
                    {"n": "CCTV-1综合", "v": "EPGC1386744804340101"},
                    {"n": "CCTV-2财经", "v": "EPGC1386744804340102"},
                    {"n": "CCTV-3综艺", "v": "EPGC1386744804340103"},
                    {"n": "CCTV-4中文国际", "v": "EPGC1386744804340104"},
                    {"n": "CCTV-5体育", "v": "EPGC1386744804340107"},
                    {"n": "CCTV-6电影", "v": "EPGC1386744804340108"},
                    {"n": "CCTV-7国防军事", "v": "EPGC1386744804340109"},
                    {"n": "CCTV-8电视剧", "v": "EPGC1386744804340110"},
                    {"n": "CCTV-9纪录", "v": "EPGC1386744804340112"},
                    {"n": "CCTV-10科教", "v": "EPGC1386744804340113"},
                    {"n": "CCTV-11戏曲", "v": "EPGC1386744804340114"},
                    {"n": "CCTV-12社会与法", "v": "EPGC1386744804340115"},
                    {"n": "CCTV-13新闻", "v": "EPGC1386744804340116"},
                    {"n": "CCTV-14少儿", "v": "EPGC1386744804340117"},
                    {"n": "CCTV-15音乐", "v": "EPGC1386744804340118"},
                    {"n": "CCTV-16奥林匹克", "v": "EPGC1634630207058998"},
                    {"n": "CCTV-17农业农村", "v": "EPGC1563932742616872"},
                    {"n": "CCTV-5+体育赛事", "v": "EPGC1468294755566101"}
                ]},
                {"key": "fc", "name": "分类", "value": [
                    {"n": "全部", "v": ""}, {"n": "新闻", "v": "新闻"}, {"n": "体育", "v": "体育"},
                    {"n": "综艺", "v": "综艺"}, {"n": "健康", "v": "健康"}, {"n": "生活", "v": "生活"},
                    {"n": "科教", "v": "科教"}, {"n": "经济", "v": "经济"}, {"n": "农业", "v": "农业"},
                    {"n": "法治", "v": "法治"}, {"n": "军事", "v": "军事"}, {"n": "少儿", "v": "少儿"},
                    {"n": "动画", "v": "动画"}, {"n": "纪实", "v": "纪实"}, {"n": "戏曲", "v": "戏曲"},
                    {"n": "音乐", "v": "音乐"}, {"n": "影视", "v": "影视"}
                ]},
                {"key": "fl", "name": "字母", "value": [{"n": "全部", "v": ""}] +
                    [{"n": c, "v": c} for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ"]},
                {"key": "year", "name": "年份", "value": [{"n": "全部", "v": ""}] +
                    [{"n": str(y), "v": str(y)} for y in range(2022, 1999, -1)]},
                {"key": "month", "name": "月份", "value": [{"n": "全部", "v": ""}] +
                    [{"n": f"{m:02d}", "v": f"{m:02d}"} for m in range(1, 13)]}
            ]
        }
    }

    header = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.54 Safari/537.36",
        "Origin": "https://tv.cctv.com",
        "Referer": "https://tv.cctv.com/"
    }

    def localProxy(self, param):
        return [200, "video/MP2T", "", ""]


if __name__ == "__main__":
    sp = Spider()
    # 测试首页
    print("homeContent:", sp.homeContent(True))
    # 测试分类（无筛选）
    print("categoryContent:", sp.categoryContent("CCTV", 1, {}, {}))