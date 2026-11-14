"""API HTTP security headers, anti-scraping User-Agent filter, and sliding-window throttling."""
from collections import defaultdict, deque
import re
import time
from fastapi import Request
from fastapi.responses import JSONResponse

SCRAPER_UA_RE = re.compile(r"(sqlmap|nikto|nmap|masscan|acunetix|scrapy|httrack|webcopier)", re.IGNORECASE)


def _client_ip(request: Request) -> str:
    host = request.client.host if request.client else "unknown"
    if host in ("127.0.0.1", "::1", "localhost"):
        forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        real_ip = request.headers.get("x-real-ip", "").strip()
        if real_ip:
            return real_ip
        if forwarded:
            return forwarded
    return host


def install_security_middleware(app, settings) -> None:
    ip_buckets: dict[str, deque[float]] = defaultdict(deque)
    rate_window = 60.0
    rate_limit = 240 if getattr(settings, "mode", "production") != "local_test" else 600

    @app.middleware("http")
    async def anti_scrape_and_security_headers(request: Request, call_next):
        ua = request.headers.get("user-agent", "")
        path = request.url.path
        if path.startswith("/api/") and SCRAPER_UA_RE.search(ua):
            return JSONResponse(
                {"error": {"code": "forbidden_client", "message": "拒绝自动化扫描或恶意采集请求。"}},
                status_code=403,
            )
        if path.startswith("/api/") and not path.endswith("/health"):
            ip = _client_ip(request)
            now = time.monotonic()
            if len(ip_buckets) > 2048:
                stale = [k for k, dq in ip_buckets.items() if not dq or now - dq[-1] > rate_window]
                for k in stale:
                    ip_buckets.pop(k, None)
            bucket = ip_buckets[ip]
            while bucket and now - bucket[0] > rate_window:
                bucket.popleft()
            if len(bucket) >= rate_limit:
                return JSONResponse(
                    {"error": {"code": "rate_limited", "message": "请求频率过高，请稍后重试。"}},
                    status_code=429,
                )
            bucket.append(now)
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        if path.startswith("/api/"):
            response.headers.setdefault("X-Robots-Tag", "noindex, nofollow, noarchive")
        return response
