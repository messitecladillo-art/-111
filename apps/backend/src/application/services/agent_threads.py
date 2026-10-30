from datetime import datetime, timezone

from sqlalchemy import select

from infrastructure.database.models import AgentThreadSnapshot, new_id
from shared.contracts import canonical, fingerprint, integer, object_fields, text, uuid_string
from shared.errors import ApiError

MAX_MESSAGES = 160
MAX_EVENTS = 2000
MAX_PAYLOAD_BYTES = 300_000


def _payload(data):
    object_fields(data, ("schemaVersion", "idempotencyKey", "expectedRevision", "title", "messages", "events"), ("checkpoint",))
    if data["schemaVersion"] != 1:
        raise ApiError()
    title = text(data["title"], 80, 1)
    messages, events = data["messages"], data["events"]
    if not isinstance(messages, list) or len(messages) > MAX_MESSAGES:
        raise ApiError()
    if not isinstance(events, list) or len(events) > MAX_EVENTS:
        raise ApiError()
    for row in messages + events:
        if not isinstance(row, dict):
            raise ApiError()
    checkpoint = data.get("checkpoint")
    if checkpoint is not None and not isinstance(checkpoint, dict):
        raise ApiError()
    value = {"title": title, "messages": messages, "events": events, "checkpoint": checkpoint}
    if len(canonical(value).encode("utf-8")) > MAX_PAYLOAD_BYTES:
        raise ApiError(422, "snapshot_too_large", "对话备份超过大小上限。")
    return value


class AgentThreadService:
    """Explicit, owner-only backups of project-bound agent threads."""

    def __init__(self, *, owned_project, operation):
        self.owned_project = owned_project
        self.operation = operation

    def _row(self, session, *, project_id, owner_id, thread_id):
        return session.execute(select(AgentThreadSnapshot).where(
            AgentThreadSnapshot.project_id == project_id,
            AgentThreadSnapshot.owner_id == owner_id,
            AgentThreadSnapshot.client_thread_id == thread_id,
        )).scalar_one_or_none()

    def list(self, *, project_id, user, session):
        project, _ = self.owned_project(session, user, project_id)
        rows = session.execute(select(AgentThreadSnapshot).where(
            AgentThreadSnapshot.project_id == project.id,
            AgentThreadSnapshot.owner_id == user.id,
        ).order_by(AgentThreadSnapshot.updated_at.desc())).scalars().all()
        return {"threads": [{
            "threadId": row.client_thread_id, "title": row.title, "revision": row.revision,
            "updatedAt": row.updated_at.isoformat(), "contentHash": row.content_hash,
        } for row in rows]}

    def get(self, *, project_id, thread_id, user, session):
        project, _ = self.owned_project(session, user, project_id)
        uuid_string(thread_id)
        row = self._row(session, project_id=project.id, owner_id=user.id, thread_id=thread_id)
        if row is None:
            raise ApiError(404, "not_found", "云端对话备份不存在。")
        return {
            "schemaVersion": 1, "threadId": row.client_thread_id, "title": row.title, "revision": row.revision,
            "messages": row.messages, "events": row.events, "checkpoint": row.checkpoint,
            "contentHash": row.content_hash, "updatedAt": row.updated_at.isoformat(),
        }

    async def save(self, *, project_id, thread_id, user, session, data):
        project, _ = self.owned_project(session, user, project_id)
        uuid_string(thread_id)
        op, repeated = self.operation(session, user, f"agent-thread:{project.id}:{thread_id}", data)
        if repeated:
            return op.response
        expected = integer(data["expectedRevision"], 0, 2147483646)
        value = _payload(data)
        row = self._row(session, project_id=project.id, owner_id=user.id, thread_id=thread_id)
        if expected != (row.revision if row else 0):
            raise ApiError(409, "snapshot_revision_conflict", "云端备份已有新版本，请刷新后再备份。")
        revision = expected + 1
        content_hash = fingerprint(value)
        now = datetime.now(timezone.utc)
        if row is None:
            row = AgentThreadSnapshot(
                id=new_id(), project_id=project.id, owner_id=user.id, client_thread_id=thread_id,
                revision=revision, title=value["title"], messages=value["messages"], events=value["events"],
                checkpoint=value["checkpoint"], content_hash=content_hash, created_at=now, updated_at=now,
            )
            session.add(row)
        else:
            row.revision = revision
            row.title = value["title"]
            row.messages = value["messages"]
            row.events = value["events"]
            row.checkpoint = value["checkpoint"]
            row.content_hash = content_hash
            row.updated_at = now
        session.flush()
        op.response = {
            "schemaVersion": 1, "threadId": row.client_thread_id, "title": row.title, "revision": row.revision,
            "contentHash": row.content_hash, "updatedAt": row.updated_at.isoformat(),
        }
        session.commit()
        return op.response
