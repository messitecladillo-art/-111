"""API HTTP security headers, anti-scraping User-Agent filter, and sliding-window throttling."""
from collections import defaultdict, deque
import re
import time
import unicodedata
from urllib.parse import quote
from fastapi import Request
from fastapi.responses import JSONResponse

SCRAPER_UA_RE = re.compile(r"(sqlmap|nikto|nmap|masscan|acunetix|scrapy|httrack|webcopier)", re.IGNORECASE)
_UNSAFE_FILENAME_CHARS_RE = re.compile(r'[\\/"\';<>:|?*]+')
_EXT_RE = re.compile(r"\.([A-Za-z0-9]{1,10})$")


def safe_content_disposition(
    filename: str,
    disposition: str = "attachment",
    *,
    fallback_stem: str = "export",
) -> str:
    """Build an RFC 6266 / RFC 5987 Content-Disposition header immune to CRLF splitting and quote injection."""
    disp = str(disposition or "attachment").strip().lower()
    if disp not in ("attachment", "inline"):
        raise ValueError("Invalid Content-Disposition type")

    safe_fallback = re.sub(r"[^A-Za-z0-9_-]+", "-", str(fallback_stem or "export")).strip("-_") or "export"
    raw = unicodedata.normalize("NFKC", str(filename or ""))
    # Strip CR, LF, NUL, and all Unicode control/format/line-separator characters
    cleaned_chars = [
        ch
        for ch in raw
        if ord(ch) >= 0x20 and ord(ch) != 0x7F and unicodedata.category(ch) not in {"Cc", "Cf", "Cs", "Zl", "Zp"}
    ]
    cleaned = "".join(cleaned_chars).strip()

    ext_match = _EXT_RE.search(cleaned)
    ext = f".{ext_match.group(1).lower()}" if ext_match else ""
    stem_raw = cleaned[: ext_match.start()] if ext_match else cleaned
    stem_clean = _UNSAFE_FILENAME_CHARS_RE.sub("_", stem_raw)
    stem_clean = re.sub(r"\.{2,}", "_", stem_clean)
    stem_clean = re.sub(r"[\s_]+", "_", stem_clean).strip("._ -")[:100]
    if not stem_clean:
        stem_clean = safe_fallback

    unicode_filename = f"{stem_clean}{ext}"
    ascii_stem = re.sub(r"[^A-Za-z0-9_-]+", "_", stem_clean).strip("_-")[:80]
    if not ascii_stem or not any(ch.isalnum() for ch in ascii_stem):
        ascii_stem = safe_fallback
    ascii_filename = f"{ascii_stem}{ext}"
    rfc5987_value = quote(unicode_filename.encode("utf-8"), safe="-._~")
    return f'{disp}; filename="{ascii_filename}"; filename*=UTF-8\'\'{rfc5987_value}'


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
