import hashlib
from fastapi import Request, Depends
from fastapi.responses import JSONResponse, Response
from sqlalchemy import select
from infrastructure.database.models import User
from features.net_exam import NetExamBank


def _etag_matches(header_val: str | None, etag: str) -> bool:
    if not header_val:
        return False
    target = etag.removeprefix("W/").strip()
    for candidate in header_val.split(","):
        token = candidate.strip()
        if token == "*" or token.removeprefix("W/").strip() == target:
            return True
    return False


def register_routes(app, *, settings, db, auth, session_user):
    exam_bank = NetExamBank(settings.net_exam_bank_path)

    @app.get("/api/health")
    def health(session=Depends(db)):
        session.execute(select(User.id).limit(1))
        return JSONResponse(
            {"status": "ok", "database": "ok", "mode": str(settings.mode)},
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/api/session")
    def get_session(request: Request, session=Depends(db)):
        user, row = session_user(request, session, required=False)
        headers = {"Cache-Control": "no-store", "Vary": "Cookie"}
        if user is None:
            return JSONResponse(
                {"authenticated": False, "mode": str(settings.mode), "providerMode": str(settings.provider_mode)},
                headers=headers,
            )
        return JSONResponse(
            {
                "authenticated": True,
                "user": {"id": user.id, "email": user.email},
                "csrfToken": row.csrf,
                "mode": str(settings.mode),
                "providerMode": str(settings.provider_mode),
            },
            headers=headers,
        )

    @app.get("/api/net-exam/bank")
    def net_exam_bank(request: Request, user=Depends(auth)):
        raw = exam_bank.body()
        etag = f'"sha256-{hashlib.sha256(raw).hexdigest()[:24]}"'
        headers = {"Cache-Control": "no-store", "Vary": "Cookie", "ETag": etag}
        if _etag_matches(request.headers.get("if-none-match"), etag):
            return Response(status_code=304, headers=headers)
        return Response(raw, media_type="application/json", headers=headers)
