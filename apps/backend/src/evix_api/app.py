"""Application composition root. HTTP and business logic live in their modules."""
from fastapi import FastAPI
from evix_api.runtime import create_runtime
from evix_api.dependencies import create_dependencies
from evix_api.errors import install_handlers
from multi_agent.workflow import WorkflowEngine
from multi_agent.workflow.langgraph_runner import LangGraphRunner
from evix_api.routes import system, auth, teams, projects, model_services, questionnaires, proposals, survey_runs, uploads, knowledge, topics, topic_agent, topic_projects, project_memory, surveys, reports, latex, agent_tasks, agent_chat
from application.services.project_memory import ProjectMemoryService

def create_app(settings=None, mail=None, provider=None, engine=None, knowledge_config=None, workflow_handlers=None):
    runtime = create_runtime(settings, mail=mail, provider=provider, engine=engine)
    settings = runtime.settings
    deps = create_dependencies(settings, runtime.engine)
    memory_service = ProjectMemoryService(owned_project=deps.owned_project, operation=deps.operation)
    app = FastAPI(title="EVI-X API", lifespan=runtime.lifespan, docs_url=None if settings.mode == "production" else "/docs", redoc_url=None, openapi_url=None if settings.mode == "production" else "/openapi.json")
    app.state.settings, app.state.engine, app.state.provider = settings, runtime.engine, runtime.generator
    app.state.silicon_tasks = set()
    app.state.sav_imports, app.state.preflights = runtime.sav_imports, runtime.preflights
    app.state.workflow_engine = LangGraphRunner(WorkflowEngine(workflow_handlers or {}))
    install_handlers(app)
    system.register_routes(app, settings=settings, db=deps.db, auth=deps.auth, session_user=deps.session_user)
    auth.register_routes(app, settings=settings, mailer=runtime.mailer, db=deps.db, auth=deps.auth, origin=deps.origin, session_user=deps.session_user)
    teams.register_routes(app, settings=settings, db=deps.db, auth=deps.auth, membership=deps.membership)
    projects.register_routes(app, db=deps.db, auth=deps.auth, membership=deps.membership, lock_user=deps.lock_user, operation=deps.operation, owned_project=deps.owned_project)
    model_services.register_routes(app, settings=settings, db=deps.db, auth=deps.auth, lock_user=deps.lock_user, operation=deps.operation, settings_input=deps.settings_input, owned_service=deps.owned_service)
    questionnaires.register_routes(app, db=deps.db, auth=deps.auth, owned_project=deps.owned_project, operation=deps.operation)
    proposals.register_routes(app, settings=settings, generator=runtime.generator, db=deps.db, auth=deps.auth, owned_project=deps.owned_project, owned_service=deps.owned_service, lock_user=deps.lock_user, session_user=deps.session_user)
    survey_runs.register_routes(app, settings=settings, engine=runtime.engine, generator=runtime.generator, db=deps.db, auth=deps.auth, owned_project=deps.owned_project, owned_service=deps.owned_service, lock_user=deps.lock_user, session_user=deps.session_user)
    uploads.register_routes(app, settings=settings, engine=runtime.engine, sav_imports=runtime.sav_imports, preflights=runtime.preflights, session_user=deps.session_user)
    surveys.install_routes(app, settings=settings, db=deps.db, auth=deps.auth, origin=deps.origin, owned_project=deps.owned_project, operation=deps.operation)
    knowledge.register_knowledge(app, settings, deps.db, deps.session_user, deps.owned_project, deps.lock_user, deps.operation, config=knowledge_config)
    topics.register_topics(app, settings, deps.db, deps.session_user, deps.lock_user, deps.operation, deps.owned_service, runtime.generator)
    topic_agent.register_topic_agent(app, settings, deps.db, deps.session_user, deps.lock_user, deps.operation, deps.owned_service, runtime.generator, owned_project=deps.owned_project)
    agent_chat.register_agent_chat(app, settings, deps.db, deps.session_user, deps.lock_user, deps.operation, deps.owned_service, runtime.generator, project_memory=memory_service)
    topic_projects.register_topic_projects(app, auth=deps.auth, db=deps.db, owned_project=deps.owned_project, operation=deps.operation)
    project_memory.register_memory(app, auth=deps.auth, db=deps.db, owned_project=deps.owned_project, operation=deps.operation, service=memory_service)
    reports.register_reports(app, auth=deps.auth, db=deps.db, owned_project=deps.owned_project, operation=deps.operation)
    latex.register_latex(app, settings=settings, auth=deps.auth, db=deps.db, owned_project=deps.owned_project)
    agent_tasks.register_routes(app, db=deps.db, auth=deps.auth, owned_project=deps.owned_project)
    return app
