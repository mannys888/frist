#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
完全动态 Python 爬虫服务端 (TVBox 适配)
支持通过 ext 配置动态定义分类、解析规则、请求头等。
使用方式: python spider_server.py
接口:
  /?method=home                -> 返回分类
  /?method=category&tid=xxx&pg=1 -> 返回视频列表
  /?method=detail&vid=xxx      -> 返回详情及播放列表
  /?method=play&vid=xxx        -> 返回真实播放地址
"""

import os
import re
import json
import time
import requests
import urllib.parse
from flask import Flask, request, jsonify
from functools import lru_cache
from threading import Lock

app = Flask(__name__)

# ==================== 全局配置 ====================
DEFAULT_CACHE_TTL = 600          # 缓存时间(秒)
DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
DEFAULT_RETRY = 2
DEFAULT_RETRY_DELAY = 1

# 缓存字典 {url: {"data": content, "expire": timestamp}}
cache = {}
cache_lock = Lock()

# 全局 ext 配置 (在 init 时从请求参数中加载)
global_ext_config = {}
ext_base_path = ""

# ==================== 缓存工具 ====================
def get_cache(url):
    with cache_lock:
        item = cache.get(url)
        if item and item["expire"] > time.time():
            return item["data"]
    return None

def set_cache(url, data, ttl=DEFAULT_CACHE_TTL):
    with cache_lock:
        cache[url] = {"data": data, "expire": time.time() + ttl}

def clear_cache():
    with cache_lock:
        cache.clear()

# ==================== 网络请求（带重试） ====================
def fetch(url, headers=None, cookies=None, retry=DEFAULT_RETRY, retry_delay=DEFAULT_RETRY_DELAY):
    if not url:
        return None
    cached = get_cache(url)
    if cached:
        return cached
    for attempt in range(retry + 1):
        try:
            req_headers = {"User-Agent": DEFAULT_USER_AGENT}
            if headers:
                req_headers.update(headers)
            resp = requests.get(url, headers=req_headers, cookies=cookies, timeout=15)
            resp.encoding = 'utf-8'
            if resp.status_code == 200:
                content = resp.text
                # 缓存
                ttl = headers.get("X-Cache-TTL", DEFAULT_CACHE_TTL) if headers else DEFAULT_CACHE_TTL
                set_cache(url, content, ttl)
                return content
            else:
                print(f"请求失败 {url}: HTTP {resp.status_code}")
        except Exception as e:
            print(f"请求异常 (尝试 {attempt+1}/{retry+1}): {e}")
            if attempt < retry:
                time.sleep(retry_delay)
            else:
                return None
    return None

# ==================== 路径解析 ====================
def resolve_path(path, base_path):
    """将相对路径转为绝对URL"""
    if not path:
        return ""
    if path.startswith(("http://", "https://", "data:")):
        return path
    if not base_path:
        base_path = ext_base_path
    if not base_path:
        return path
    if not base_path.endswith("/"):
        base_path += "/"
    if path.startswith("./"):
        path = path[2:]
    while path.startswith("../"):
        parent = base_path.rstrip("/").rfind("/") + 1
        base_path = base_path[:parent]
        path = path[3:]
    if path.startswith("/"):
        # 提取协议+域名
        match = re.match(r"^(https?://[^/]+)", base_path)
        if match:
            return match.group(1) + path
        else:
            return base_path + path[1:]
    return base_path + path

# ==================== 解析器 ====================
def parse_content(content, parse_config, base_url):
    """根据 parseConfig 解析内容为 [{title, url}]"""
    items = []
    if not parse_config:
        parse_config = {}
    parse_type = parse_config.get("type", "text")

    if parse_type == "json":
        try:
            data = json.loads(content)
            data_path = parse_config.get("dataPath")
            if data_path:
                for key in data_path.split("."):
                    data = data.get(key, [])
            if not isinstance(data, list):
                data = data if isinstance(data, list) else []
            title_field = parse_config.get("titleField", "title")
            url_field = parse_config.get("urlField", "url")
            for item in data:
                title = item.get(title_field) or item.get("name") or "未命名"
                url = item.get(url_field) or item.get("link") or item.get("src")
                if title and url:
                    items.append({"title": title, "url": url})
        except Exception as e:
            print(f"JSON解析失败: {e}")

    elif parse_type == "regex":
        pattern = parse_config.get("pattern", "")
        flags = parse_config.get("flags", "g")
        re_flags = 0
        if "i" in flags: re_flags |= re.IGNORECASE
        if "m" in flags: re_flags |= re.MULTILINE
        regex = re.compile(pattern, re_flags)
        title_group = parse_config.get("titleGroup", 2)
        url_group = parse_config.get("urlGroup", 1)
        for match in regex.finditer(content):
            title = match.group(title_group) if match.lastindex >= title_group else "未命名"
            url = match.group(url_group) if match.lastindex >= url_group else ""
            if url:
                items.append({"title": title.strip(), "url": url.strip()})

    elif parse_type == "m3u":
        lines = content.splitlines()
        current_title = ""
        for line in lines:
            line = line.strip()
            if line.startswith("#EXTINF:"):
                match = re.search(r",(.*)", line)
                if match:
                    current_title = match.group(1).strip()
            elif line and not line.startswith("#"):
                if re.match(r"^https?://", line):
                    items.append({"title": current_title or "直播流", "url": line})
                    current_title = ""

    else:  # text 默认按分隔符解析
        separators = parse_config.get("separators", [",", "|", "$", "\t"])
        lines = content.splitlines()
        for line in lines:
            line = line.strip()
            if not line or line.startswith("#") or "#genre#" in line:
                continue
            best_sep = None
            best_idx = -1
            for sep in separators:
                idx = line.find(sep)
                if idx > 0 and (best_idx == -1 or idx < best_idx):
                    best_idx = idx
                    best_sep = sep
            if best_sep:
                title = line[:best_idx].strip()
                rest = line[best_idx+1:].strip()
                # 提取URL
                url_match = re.search(r"https?://[^\s]+", rest)
                if url_match:
                    url = url_match.group(0)
                    items.append({"title": title, "url": url})
            else:
                # 整行可能是URL
                if re.match(r"^https?://", line):
                    items.append({"title": "媒体文件", "url": line})

    # 后处理：过滤、排序、限制
    post_process = parse_config.get("postProcess")
    if post_process:
        if "filter" in post_process:
            field = post_process["filter"].get("field", "title")
            regex_str = post_process["filter"].get("regex", ".*")
            regex = re.compile(regex_str, re.IGNORECASE)
            items = [item for item in items if regex.search(item.get(field, ""))]
        if "sort" in post_process:
            field = post_process["sort"].get("field", "title")
            reverse = post_process["sort"].get("order") == "desc"
            items.sort(key=lambda x: x.get(field, ""), reverse=reverse)
        if "limit" in post_process:
            items = items[:post_process["limit"]]

    # 将相对URL转为绝对
    for item in items:
        if not item["url"].startswith(("http://", "https://")):
            item["url"] = resolve_path(item["url"], base_url)
    return items

# ==================== 文件源处理 ====================
def handle_file_source(file_url, parse_config, base_path, cover_config, pg=1):
    resolved_url = resolve_path(file_url, base_path)
    if not resolved_url:
        return {"list": [], "total": 0, "nextPage": None, "pageSize": 50}
    # 自动补全扩展名
    auto_ext = parse_config.get("autoExt")
    if auto_ext and "." not in resolved_url:
        test_url = resolved_url + auto_ext
        if fetch(test_url):
            resolved_url = test_url
    # 获取内容
    headers = parse_config.get("headers", {})
    content = fetch(resolved_url, headers=headers)
    if not content:
        return {"list": [], "total": 0, "nextPage": None, "pageSize": 50}
    base_dir = resolved_url[:resolved_url.rfind("/")+1]
    items = parse_content(content, parse_config, base_dir)
    total = len(items)
    page_size = parse_config.get("pageSize", 50)
    start = (pg - 1) * page_size
    paged_items = items[start:start+page_size]
    next_page = None
    # 支持分页规则
    pagination = parse_config.get("pagination")
    if pagination and start + page_size < total:
        next_url = pagination.get("nextUrl")
        if next_url:
            next_page = resolve_path(next_url.replace("{page}", str(pg+1)), base_path)
        else:
            next_page = pg + 1  # 表示存在下一页，但需外部处理
    # 转换为标准视频格式
    videos = []
    for item in paged_items:
        videos.append({
            "vod_id": item["url"] + "###single",
            "vod_name": item["title"],
            "vod_pic": get_cover(item["title"], item["url"], cover_config),
            "vod_remarks": get_file_type(item["url"])
        })
    return {"list": videos, "total": total, "nextPage": next_page, "pageSize": page_size}

def get_file_type(url):
    ext = url.split(".")[-1].lower() if "." in url else ""
    type_map = {
        "mp3": "🎵 音频", "wav": "🎵 音频", "ogg": "🎵 音频", "flac": "🎵 音频",
        "mp4": "🎬 视频", "mkv": "🎬 视频", "avi": "🎬 视频", "mov": "🎬 视频",
        "m3u8": "📺 直播", "flv": "📺 直播", "ts": "📺 直播"
    }
    return type_map.get(ext, "📄 媒体")

def get_cover(title, url, cover_config):
    if cover_config and cover_config.get("type") == "fixed" and cover_config.get("url"):
        return cover_config["url"]
    hash_val = hash((title or "media") + (url or ""))
    base_url = cover_config.get("baseUrl", "https://picsum.photos") if cover_config else "https://picsum.photos"
    width = cover_config.get("width", 200) if cover_config else 200
    height = cover_config.get("height", 300) if cover_config else 300
    return f"{base_url}/{width}/{height}?random={abs(hash_val) % 1000}"

# ==================== ext 配置解析 ====================
def parse_ext_config(ext_param, base_path):
    """解析 ext 参数，返回分类列表和全局配置"""
    global global_ext_config, ext_base_path
    config_data = None
    if ext_param is None:
        config_data = None
    elif isinstance(ext_param, str):
        if ext_param.startswith(("http://", "https://")):
            content = fetch(ext_param)
            if content:
                try:
                    config_data = json.loads(content)
                except:
                    config_data = content
        else:
            try:
                config_data = json.loads(ext_param)
            except:
                config_data = ext_param
    elif isinstance(ext_param, dict):
        config_data = ext_param

    # 重置全局配置
    global_ext_config = config_data if isinstance(config_data, dict) else {}
    if config_data and "basePath" in config_data:
        ext_base_path = config_data["basePath"]

    # 提取分类列表
    classes = []
    if config_data:
        sites = []
        if isinstance(config_data, list):
            sites = config_data
        elif "sites" in config_data and isinstance(config_data["sites"], list):
            sites = config_data["sites"]
        elif "categories" in config_data and isinstance(config_data["categories"], list):
            sites = config_data["categories"]
        elif "list" in config_data and isinstance(config_data["list"], list):
            sites = config_data["list"]
        elif isinstance(config_data, str):
            # 纯文本格式
            for line in config_data.splitlines():
                if "," in line:
                    parts = line.split(",", 1)
                    classes.append({
                        "type_name": parts[0].strip(),
                        "type_id": resolve_path(parts[1].strip(), base_path)
                    })
            return classes

        for item in sites:
            if "name" in item:
                type_id = item.get("url") or item.get("api") or item.get("id") or item.get("name")
                if type_id and not type_id.startswith(("http://", "https://")):
                    type_id = resolve_path(type_id, base_path)
                classes.append({
                    "type_name": item["name"],
                    "type_id": type_id,
                    "icon": item.get("icon", ""),
                    "description": item.get("description", ""),
                    "handler": item.get("handler"),
                    "parseConfig": item.get("parseConfig")
                })
    return classes

# ==================== TVBox 接口 ====================
def home(ext_param):
    classes = parse_ext_config(ext_param, ext_base_path)
    return {"class": classes, "filters": None}

def category(tid, pg, ext_param):
    pg = int(pg) if pg else 1
    # 解析 ext 以获取分类配置
    classes = parse_ext_config(ext_param, ext_base_path)
    class_config = None
    for c in classes:
        if c["type_id"] == tid or c["type_name"] == tid:
            class_config = c
            break
    if not class_config:
        return {"list": [], "page": pg, "pagecount": 0, "total": 0}
    videos = []
    total = 0
    pagecount = 1
    handler = class_config.get("handler")
    parse_config = class_config.get("parseConfig", {})
    cover_config = global_ext_config.get("cover", {})
    if handler:
        # 自定义处理器，这里简单模拟，实际可扩展
        pass
    # 默认文件源处理
    file_url = class_config["type_id"]
    result = handle_file_source(file_url, parse_config, ext_base_path, cover_config, pg)
    videos = result["list"]
    total = result["total"]
    page_size = result["pageSize"]
    if result.get("nextPage"):
        pagecount = (total + page_size - 1) // page_size
    else:
        pagecount = pg
    return {
        "list": videos,
        "page": pg,
        "pagecount": pagecount,
        "limit": page_size,
        "total": total
    }

def detail(vid):
    # vid 格式: 真实地址###single 或者 文件地址###file
    parts = vid.split("###")
    if len(parts) < 2:
        return {"list": []}
    vid_id = parts[0]
    vid_type = parts[1]
    if vid_type == "single":
        title = vid_id.split("/")[-1].split(".")[0] or "媒体文件"
        try:
            title = urllib.parse.unquote(title)
        except:
            pass
        vod = {
            "vod_id": vid_id,
            "vod_name": title,
            "vod_pic": get_cover(title, vid_id, global_ext_config.get("cover")),
            "vod_play_from": "播放源",
            "vod_play_url": f"播放${vid_id}"
        }
        return {"list": [vod]}
    elif vid_type == "file":
        file_url = resolve_path(vid_id, ext_base_path)
        content = fetch(file_url)
        if not content:
            return {"list": []}
        base_dir = file_url[:file_url.rfind("/")+1]
        # 尝试 JSON
        play_url = ""
        if content.strip().startswith(("{", "[")):
            try:
                data = json.loads(content)
                arr = data if isinstance(data, list) else data.get("list") or data.get("data") or []
                items = []
                for item in arr:
                    title = item.get("title") or item.get("name") or "未命名"
                    url = item.get("url") or item.get("link") or item.get("src") or item.get("play_url")
                    if url:
                        if not url.startswith(("http://", "https://")):
                            url = resolve_path(url, base_dir)
                        items.append(f"{title}${url}")
                play_url = "#".join(items)
            except:
                pass
        if not play_url and "#EXTM3U" in content:
            items = parse_content(content, {"type": "m3u"}, base_dir)
            play_url = "#".join([f"{item['title']}${item['url']}" for item in items])
        if not play_url:
            items = parse_content(content, {}, base_dir)
            play_url = "#".join([f"{item['title']}${item['url']}" for item in items])
        if not play_url:
            return {"list": []}
        first_title = play_url.split("#")[0].split("$")[0] if "$" in play_url else "媒体合集"
        vod = {
            "vod_id": file_url,
            "vod_name": first_title,
            "vod_pic": get_cover(first_title, file_url, global_ext_config.get("cover")),
            "vod_play_from": "播放列表",
            "vod_play_url": play_url
        }
        return {"list": [vod]}
    return {"list": []}

def play(vid):
    # 对于单集，vid 即为播放地址；对于列表中的某一集，前端会传入 ### 分隔后的url部分
    # 这里简化，直接返回原地址
    return {"parse": 0, "url": vid}

# ==================== Flask 路由 ====================
@app.route("/")
def spider_api():
    method = request.args.get("method")
    ext_param = request.args.get("ext")   # 支持通过URL参数传递ext配置（JSON字符串或URL）
    # 也支持通过POST body传递ext，这里为简化，仅从参数获取
    if not ext_param:
        # 也可以从全局预设的ext文件读取，但为了动态，要求每次请求都带ext
        ext_param = "{}"  # 默认空，将返回空分类

    if method == "home":
        result = home(ext_param)
        return jsonify(result)
    elif method == "category":
        tid = request.args.get("tid", "")
        pg = request.args.get("pg", 1)
        result = category(tid, pg, ext_param)
        return jsonify(result)
    elif method == "detail":
        vid = request.args.get("vid", "")
        result = detail(vid)
        return jsonify(result)
    elif method == "play":
        vid = request.args.get("vid", "")
        result = play(vid)
        return jsonify(result)
    else:
        return jsonify({"error": "unknown method"}), 400

if __name__ == "__main__":
    # 启动服务
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)