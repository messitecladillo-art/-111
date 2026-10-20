from fastapi import Request, Depends
from fastapi.responses import Response
from sqlalchemy import select
from infrastructure.database.models import User
from features.net_exam import NetExamBank


def register_routes(app, *, settings, db, auth, session_user):
    exam_bank = NetExamBank(settings.net_exam_bank_path)

    @app.get("/api/health")
    def health(session=Depends(db)):
        session.execute(select(User.id).limit(1))
        return {"status": "ok", "database": "ok", "mode": settings.mode}

    @app.get("/api/session")
    def get_session(request: Request, session=Depends(db)):
        user, row = session_user(request, session, required=False)
        if user is None:
            return {"authenticated": False, "mode": settings.mode}
        return {"authenticated": True, "user": {"id": user.id, "email": user.email}, "csrfToken": row.csrf, "mode": settings.mode}

    @app.get("/api/net-exam/bank")
    def net_exam_bank(user=Depends(auth)):
        # The security middleware marks every API response no-store.
        return Response(exam_bank.body(), media_type="application/json")
