from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy.exc import SQLAlchemyError
from shared.errors import ApiError

def install_handlers(app):
    @app.middleware("http")
    async def security_headers(request, call_next):
        response = await call_next(request)
        response.headers["cache-control"] = "no-store"
        response.headers["x-content-type-options"] = "nosniff"
        response.headers["referrer-policy"] = "no-referrer"
        return response

    @app.exception_handler(ApiError)
    async def error_handler(request, error):
        return JSONResponse({"error": {"code": error.code, "message": error.message}}, status_code=error.status)

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request, error):
        return JSONResponse({"error": {"code": "invalid_input", "message": "请求格式无效。"}}, status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def http_handler(request, error):
        return JSONResponse({"error": {"code": "not_found" if error.status_code == 404 else "http_error", "message": "接口或请求不可用。"}}, status_code=error.status_code)

    @app.exception_handler(Exception)
    async def internal_handler(request, error):
        return JSONResponse({"error": {"code": "internal_error", "message": "请求暂未完成，请勿自动重发生成请求。"}}, status_code=500,
                            headers={"cache-control": "no-store", "x-content-type-options": "nosniff"})

    @app.exception_handler(SQLAlchemyError)
    async def storage_handler(request, error):
        return JSONResponse({"error": {"code": "storage_unavailable", "message": "存储暂不可用，请勿自动重发生成请求。"}}, status_code=503)
