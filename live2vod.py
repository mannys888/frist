#!/usr/bin/env python3
# -*- coding: utf-8 -*-
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
DEFAULT_CACHE_TTL = 600
DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
DEFAULT_RETRY = 2
DEFAULT_RETRY_DELAY = 1

cache = {}
cache_lock = Lock()
# 当前请求的 ext 配置（动态，每次请求独立，不全局存储）
# 改为每次请求解析

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

# ==================== 网络请求 ====================
def fetch(url, headers=None, retry=DEFAULT_RETRY, retry_delay=DEFAULT_RETRY_DELAY):
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
            resp = requests.get(url, headers=req_headers, timeout=15)
            resp.encoding = 'utf-8'
            if resp.status_code == 200:
                content = resp.text
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
    if not path:
        return ""
    if path.startswith(("http://", "https://", "data:")):
        return path
    if not base_path:
        return path  # 无 base_path 时保持原样
    if not base_path.endswith("/"):
        base_path += "/"
    if path.startswith("./"):
        path = path[2:]
    while path.startswith("../"):
        parent = base_path.rstrip("/").rfind("/") + 1
        base_path = base_path[:parent]
        path = path[3:]
    if path.startswith("/"):
        match = re.match(r"^(https?://[^/]+)", base_path)
        if match:
            return match.group(1) + path
        else:
            return base_path + path[1:]
    return base_path + path

# ==================== 解析内容 ====================
def parse_content(content, parse_config, base_url):
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

    else:  # text
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
                url_match = re.search(r"https?://[^\s]+", rest)
                if url_match:
                    url = url_match.group(0)
                    items.append({"title": title, "url": url})
            else:
                if re.match(r"^https?://", line):
                    items.append({"title": "媒体文件", "url": line})

    # 后处理
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

    for item in items:
        if not item["url"].startswith(("http://", "https://")):
            item["url"] = resolve_path(item["url"], base_url)
    return items

# ==================== 文件源处理 ====================
def handle_file_source(file_url, parse_config, base_path, cover_config, pg=1):
    resolved_url = resolve_path(file_url, base_path)
    if not resolved_url:
        return {"list": [], "total": 0, "nextPage": None, "pageSize": 50}
    auto_ext = parse_config.get("autoExt")
    if auto_ext and "." not in resolved_url:
        test_url = resolved_url + auto_ext
        if fetch(test_url):
            resolved_url = test_url
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
    pagination = parse_config.get("pagination")
    if pagination and start + page_size < total:
        next_url = pagination.get("nextUrl")
        if next_url:
            next_page = resolve_path(next_url.replace("{page}", str(pg+1)), base_path)
        else:
            next_page = pg + 1
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

# ==================== ext 解析（增强版） ====================
def parse_ext_config(ext_param):
    """解析 ext 参数，返回 (classes, global_config, base_path)"""
    config_data = None
    base_path = ""
    if ext_param:
        if isinstance(ext_param, str):
            # 如果是 URL
            if ext_param.startswith(("http://", "https://")):
                content = fetch(ext_param)
                if content:
                    try:
                        config_data = json.loads(content)
                    except:
                        config_data = content
            else:
                # 尝试作为 JSON 字符串解析
                try:
                    config_data = json.loads(ext_param)
                except:
                    config_data = ext_param
        elif isinstance(ext_param, dict):
            config_data = ext_param
        else:
            config_data = ext_param

    # 如果 config_data 是字符串，尝试作为纯文本分类列表解析
    if isinstance(config_data, str):
        classes = []
        for line in config_data.splitlines():
            if "," in line:
                parts = line.split(",", 1)
                classes.append({
                    "type_name": parts[0].strip(),
                    "type_id": parts[1].strip()
                })
        return classes, {}, ""

    if not isinstance(config_data, dict):
        return [], {}, ""

    # 提取全局配置
    base_path = config_data.get("basePath", "")
    cover_config = config_data.get("cover", {})
    headers = config_data.get("headers", {})
    # 提取分类列表
    sites = []
    if "sites" in config_data and isinstance(config_data["sites"], list):
        sites = config_data["sites"]
    elif "categories" in config_data and isinstance(config_data["categories"], list):
        sites = config_data["categories"]
    elif "list" in config_data and isinstance(config_data["list"], list):
        sites = config_data["list"]
    elif isinstance(config_data, list):
        sites = config_data

    classes = []
    for item in sites:
        if "name" in item:
            type_id = item.get("url") or item.get("api") or item.get("id") or item.get("name")
            classes.append({
                "type_name": item["name"],
                "type_id": type_id,
                "icon": item.get("icon", ""),
                "description": item.get("description", ""),
                "handler": item.get("handler"),
                "parseConfig": item.get("parseConfig", {})
            })

    # 将全局配置打包返回
    global_config = {
        "cover": cover_config,
        "headers": headers,
        "basePath": base_path
    }
    return classes, global_config, base_path

# ==================== TVBox 接口 ====================
def home(ext_param):
    classes, _, _ = parse_ext_config(ext_param)
    return {"class": classes, "filters": None}

def category(tid, pg, ext_param):
    pg = int(pg) if pg else 1
    classes, global_config, base_path = parse_ext_config(ext_param)
    # 查找匹配的分类
    class_config = None
    for c in classes:
        if c["type_id"] == tid or c["type_name"] == tid:
            class_config = c
            break
    if not class_config:
        return {"list": [], "page": pg, "pagecount": 0, "total": 0}
    file_url = class_config["type_id"]
    parse_config = class_config.get("parseConfig", {})
    cover_config = global_config.get("cover", {})
    result = handle_file_source(file_url, parse_config, base_path, cover_config, pg)
    return {
        "list": result["list"],
        "page": pg,
        "pagecount": (result["total"] + result["pageSize"] - 1) // result["pageSize"] if result["total"] > 0 else 1,
        "limit": result["pageSize"],
        "total": result["total"]
    }

def detail(vid):
    parts = vid.split("###")
    if len(parts) < 2:
        return {"list": []}
    vid_id = parts[0]
    vid_type = parts[1]
    if vid_type == "single":
        title = vid_id.split("/")[-1].split(".")[0] if "/" in vid_id else "媒体"
        try:
            title = urllib.parse.unquote(title)
        except:
            pass
        vod = {
            "vod_id": vid_id,
            "vod_name": title,
            "vod_pic": get_cover(title, vid_id, {}),   # 封面可后续从全局配置提取，但这里简单处理
            "vod_play_from": "播放源",
            "vod_play_url": f"播放${vid_id}"
        }
        return {"list": [vod]}
    elif vid_type == "file":
        # 这里需要 base_path，但 detail 没有 ext 参数，需要额外传递。为简化，可要求前端在 vid 中包含 base_path
        # 或者从全局存储中获取上次的 base_path，这里简单返回空
        return {"list": []}
    return {"list": []}

def play(vid):
    return {"parse": 0, "url": vid}

# ==================== Flask 路由 ====================
@app.route("/")
def spider_api():
    method = request.args.get("method")
    ext_param = request.args.get("ext", "")
    # 如果 ext 为空，尝试从请求头或 Cookie 获取？不需要，直接返回空分类
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
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)