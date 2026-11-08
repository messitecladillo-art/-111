"""HTTP boundary for authorized report runs and individual call receipts."""
from fastapi import Depends, Request

from application.services.full_report_section import FullReportSectionService
from evix_api.requests import body
from multi_agent.agents.writing_agent.services import full_report_section as domain


def register_full_report_sections(app, *, settings, db, session_user, lock_user, operation, owned_project, owned_service, generator):
    service = FullReportSectionService(settings=settings, lock_user=lock_user, operation=operation,
        owned_project=owned_project, owned_service=owned_service, generator=generator)

    def auth(request: Request, session=Depends(db)):
        user, _ = session_user(request, session)
        return user

    @app.post("/api/agent/report-sections/preflight")
    async def preflight(request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, domain.PREFLIGHT_FIELDS, limit=4096)
        return service.preflight(user=user, session=session, raw_data=data,
            check_session=lambda session, **kwargs: session_user(request, session, **kwargs))

    @app.post("/api/agent/report-sections", status_code=201)
    async def create_section(request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, domain.REQUEST_FIELDS, limit=90000)
        return await service.create_section(user=user, session=session, raw_data=data,
            check_session=lambda session, **kwargs: session_user(request, session, **kwargs))

    @app.get("/api/agent/report-sections/{section_id}")
    def receipt(section_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        return service.receipt(section_id=section_id, user=user, session=session,
            check_session=lambda session, **kwargs: session_user(request, session, **kwargs))

    @app.get("/api/agent/report-runs/{run_id}")
    def run_receipt(run_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        return service.run_receipt(run_id=run_id, user=user, session=session,
            check_session=lambda session, **kwargs: session_user(request, session, **kwargs))
