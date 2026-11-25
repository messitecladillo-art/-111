import re

from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy.exc import SQLAlchemyError
from shared.errors import ApiError

_ERROR_JARGON_RULES: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\bR[e]Act\b\s*(?:\u8f68\u8ff9|\u7b97\u5b50)?", re.I), "多步实证"),
    (re.compile(r"(?:\u79d1\u7814\u7ed8\u56fe|\u7edf\u8ba1\u8ba1\u7b97|\u53d7\u63a7|\u5b89\u5168)?\u6c99\u76d2"), "统计环境"),
    (re.compile(r"\u53d7\u63a7\u7b97\u5b50|\u81ea\u4e3b\u7b97\u5b50|\u7b97\u5b50\u56de\u6267|\u7b97\u5b50"), "统计方法"),
    (re.compile(r"\b(?:Epistemic[G]raph|Run[L]ease)\b", re.I), ""),
    (re.compile(r"\u8ba4\u77e5\u56fe\u8c31|\u6709\u5411\u65e0\u73af\u56fe|\u6709\u5411\u56fe|\bD[A]G\b"), "证据链"),
    (re.compile(r"\bB[Y]OK\b", re.I), "专属服务配置"),
    (re.compile(r"\bB[e]nto\b", re.I), "复合信息图"),
    (re.compile(r"\bA[t]ypica\b", re.I), "深度访谈"),
)


_ERROR_BRACKET_MAP: dict[int, str | None] = {
    0x300C: "“",
    0x300E: "“",
    0x300D: "”",
    0x300F: "”",
    0x3010: None,
    0x3011: None,
}


def _sanitize_error_message(raw: object) -> str:
    msg = str(raw or "").strip()
    for pat, repl in _ERROR_JARGON_RULES:
        msg = pat.sub(repl, msg)
    msg = msg.translate(_ERROR_BRACKET_MAP)
    return re.sub(r"\s{2,}", " ", msg).strip() or "当前请求未能完成，请稍后重试。"


def install_handlers(app):
    @app.middleware("http")
    async def security_headers(request, call_next):
        response = await call_next(request)
        response.headers.setdefault("cache-control", "no-store")
        response.headers["x-content-type-options"] = "nosniff"
        response.headers["referrer-policy"] = "no-referrer"
        return response

    @app.exception_handler(ApiError)
    async def error_handler(request, error):
        return JSONResponse(
            {"error": {"code": error.code, "message": _sanitize_error_message(error.message)}},
            status_code=error.status,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request, error):
        return JSONResponse({"error": {"code": "invalid_input", "message": "提交的请求参数格式无效，请检查后重试。"}}, status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def http_handler(request, error):
        is_not_found = error.status_code == 404
        return JSONResponse(
            {
                "error": {
                    "code": "not_found" if is_not_found else "http_error",
                    "message": "所请求的内容不存在或当前无法访问。" if is_not_found else "当前请求暂时无法处理，请稍后重试。",
                }
            },
            status_code=error.status_code,
        )

    @app.exception_handler(Exception)
    async def internal_handler(request, error):
        return JSONResponse({"error": {"code": "internal_error", "message": "当前操作暂未完成，请稍后手动核查状态，勿自动重复提交。"}}, status_code=500,
                            headers={"cache-control": "no-store", "x-content-type-options": "nosniff"})

    @app.exception_handler(SQLAlchemyError)
    async def storage_handler(request, error):
        return JSONResponse({"error": {"code": "storage_unavailable", "message": "数据服务暂不可用，请稍后再试，勿自动重复提交。"}}, status_code=503)
