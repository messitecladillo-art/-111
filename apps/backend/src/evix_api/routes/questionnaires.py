from fastapi import Request, Depends
from evix_api.requests import questionnaire_save_body
from application.services.questionnaires import QuestionnaireService

def register_routes(app, *, db, auth, owned_project, operation):
    service = QuestionnaireService(owned_project=owned_project, operation=operation)

    @app.get('/api/projects/{project_id}/questionnaire')
    def get_questionnaire(project_id: str, user=Depends(auth), session=Depends(db)):
        return service.get_questionnaire(project_id=project_id, user=user, session=session)

    @app.get('/api/projects/{project_id}/questionnaire/versions')
    def get_versions(project_id: str, beforeRevision: int | None=None, user=Depends(auth), session=Depends(db)):
        return service.get_versions(project_id=project_id, beforeRevision=beforeRevision, user=user, session=session)

    @app.get('/api/projects/{project_id}/questionnaire/versions/{version_id}')
    def get_version(project_id: str, version_id: str, user=Depends(auth), session=Depends(db)):
        return service.get_version(project_id=project_id, version_id=version_id, user=user, session=session)

    @app.post('/api/projects/{project_id}/questionnaire/versions', status_code=201)
    async def save_questionnaire(project_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await questionnaire_save_body(request)
        return await service.save_questionnaire(project_id=project_id, user=user, session=session, data=data)

    @app.get('/api/projects/{project_id}/questionnaire/versions/{version_id}/topic-binding')
    def get_questionnaire_topic_binding(project_id: str, version_id: str, user=Depends(auth), session=Depends(db)):
        return service.get_questionnaire_topic_binding(project_id=project_id, version_id=version_id, user=user, session=session)
