"""Durable dispatch around one role, with no database transaction across a call.

This is not a provider adapter or a retry queue. The registered handler is trusted
server code; unresolved calls are never automatically sent again.
"""
import asyncio
from copy import deepcopy
from datetime import timedelta, timezone
import hashlib
import inspect
import json

from sqlalchemy import select, text as sql_text

from infrastructure.database.models import AgentTaskExecution, now, new_id
from multi_agent.workflow.orchestrator import WorkflowState, WorkflowStatus
from shared.contracts import integer
from shared.errors import ApiError, ProviderFailure

EXECUTION_TIMEOUT_SECONDS = 60
EXECUTION_LEASE_SECONDS = 90


def fingerprint(value):
    raw = json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def iso(value):
    return value.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z') if value else None


def expired(execution):
    return execution.status == 'running' and execution.lease_expires_at <= now()


def execution_view(execution):
    if execution is None:
        return None
    return {
        'id': execution.id, 'role': execution.role,
        'status': 'outcome_unknown' if expired(execution) else execution.status,
        'inputRevision': execution.base_revision, 'claimedRevision': execution.claimed_revision,
        'inputHash': execution.input_hash, 'resultHash': execution.result_hash,
        'errorCode': 'execution_lease_expired' if expired(execution) else execution.error_code,
        'startedAt': iso(execution.created_at), 'leaseExpiresAt': iso(execution.lease_expires_at),
        'finishedAt': iso(execution.finished_at),
    }


def latest_execution(session, task_id, *, lock=False):
    query = select(AgentTaskExecution).where(AgentTaskExecution.task_id == task_id).order_by(
        AgentTaskExecution.base_revision.desc()).limit(1)
    if lock:
        query = query.with_for_update()
    return session.execute(query.execution_options(populate_existing=True)).scalar_one_or_none()


def visible_task(view, row, execution):
    result = view(row)
    if execution is not None:
        result['execution'] = execution_view(execution)
        # Readers see a truthful state without needing permission to UPDATE.
        if row.status == 'running' and row.revision == execution.claimed_revision and (
            expired(execution) or execution.status != 'running'
        ):
            result['state'] = deepcopy(result['state'])
            result['status'] = result['state']['status'] = 'blocked'
            result['state']['errors'] = [*result['state']['errors'], 'execution_requires_reconciliation']
    return result


class DurableTaskExecution:
    def __init__(self, *, load, save, view, engine):
        self.load, self.save, self.view, self.engine = load, save, view, engine

    def _reply(self, row, execution):
        return visible_task(self.view, row, execution)

    def _recover(self, row, execution):
        if expired(execution):
            execution.status = 'outcome_unknown'
            execution.error_code = 'execution_lease_expired'
            execution.finished_at = now()
        if row.status == 'running' and row.revision == execution.claimed_revision and execution.status != 'running':
            state = WorkflowState.from_dict(row.state)
            state.status = WorkflowStatus.BLOCKED
            state.errors.append('execution_requires_reconciliation')
            self.save(row, state)

    async def advance(self, *, project_id, task_id, user, session, data, check_session):
        expected = integer(data['expectedRevision'], 0)
        row = self.load(session=session, user=user, project_id=project_id, task_id=task_id, lock=True)
        existing = session.execute(select(AgentTaskExecution).where(
            AgentTaskExecution.task_id == task_id, AgentTaskExecution.base_revision == expected,
        ).with_for_update().execution_options(populate_existing=True)).scalar_one_or_none()
        previous = latest_execution(session, task_id, lock=True)
        # Authentication before waiting for locks is not sufficient: a logout
        # that committed while waiting must prevent this dispatch altogether.
        check_session(session)
        if existing is not None:
            self._recover(row, existing)
            reply = self._reply(row, existing)
            session.commit()
            return reply
        if expected != row.revision:
            raise ApiError(409, 'revision_conflict', '任务状态已变化，请先刷新。')
        if previous is None and row.status == 'running':
            state = WorkflowState.from_dict(row.state)
            state.status = WorkflowStatus.BLOCKED
            state.errors.append('legacy_execution_requires_reconciliation')
            self.save(row, state)
            reply = self._reply(row, None)
            session.commit()
            return reply
        if previous is not None and row.status == 'running':
            self._recover(row, previous)
            if row.status == 'running':
                raise ApiError(409, 'execution_active', '当前步骤仍在执行，请查看原回执。')
            reply = self._reply(row, previous)
            session.commit()
            return reply
        before = deepcopy(row.state)
        prepared = self.engine.prepare_step(WorkflowState.from_dict(before))
        if prepared.handler is None:
            if prepared.state.to_dict() != row.state:
                self.save(row, prepared.state)
            reply = self._reply(row, previous)
            session.commit()
            return reply

        frozen = prepared.state.to_dict()
        started = now()
        execution = AgentTaskExecution(
            id=new_id(), task_id=task_id, project_id=project_id, created_by=user.id,
            base_revision=expected, claimed_revision=expected + 1,
            role=prepared.role.value, status='running', input_hash=fingerprint(before),
            created_at=started, lease_expires_at=started + timedelta(seconds=EXECUTION_LEASE_SECONDS),
        )
        self.save(row, prepared.state)
        # INSERT trigger verifies the already-flushed task claim, even when the
        # ORM sees no relationship dependency between two separately loaded rows.
        session.flush()
        session.add(execution)
        session.commit()
        execution_id, actor_id = execution.id, user.id

        next_state, error_code, status, cancelled = None, None, 'completed', False
        result_hash = None
        try:
            async with asyncio.timeout(EXECUTION_TIMEOUT_SECONDS):
                invocation_state = WorkflowState.from_dict(deepcopy(frozen))
                if inspect.iscoroutinefunction(prepared.handler) or inspect.iscoroutinefunction(getattr(prepared.handler, '__call__', None)):
                    result = await prepared.handler(invocation_state)
                else:
                    result = await asyncio.to_thread(prepared.handler, invocation_state)
                    if inspect.isawaitable(result):
                        result = await result
                next_state = self.engine.apply_result(WorkflowState.from_dict(deepcopy(frozen)), result)
                if next_state.status is WorkflowStatus.FAILED:
                    status, error_code = 'failed', 'invalid_agent_result'
                else:
                    result_hash = fingerprint(next_state.to_dict())
        except ProviderFailure as exc:
            status = 'outcome_unknown' if exc.unknown else 'failed'
            # Do not persist arbitrary provider exception strings or custom codes.
            error_code = 'execution_outcome_unknown' if exc.unknown else 'execution_provider_rejected'
        except asyncio.CancelledError:
            status, error_code, cancelled = 'outcome_unknown', 'execution_interrupted', True
        except TimeoutError:
            status, error_code = 'outcome_unknown', 'execution_timeout'
        except Exception:
            status, error_code = 'outcome_unknown', 'execution_outcome_unknown'

        # There was no open transaction while calling the handler. SET LOCAL
        # from authentication was consumed by the claim commit and must be reset.
        session.execute(sql_text("SELECT set_config('evix.user_id', :id, true)"), {'id': actor_id})
        try:
            row = self.load(session=session, user=user, project_id=project_id, task_id=task_id, lock=True)
            receipt = session.execute(select(AgentTaskExecution).where(AgentTaskExecution.id == execution_id)
                .with_for_update().execution_options(populate_existing=True)).scalar_one()
            # A lock wait can outlast logout. Check the session after all waits,
            # with its row locked through commit so logout cannot pass the check.
            check_session(session)
        except ApiError:
            session.rollback()
            session.execute(sql_text("SELECT set_config('evix.user_id', :id, true)"), {'id': actor_id})
            receipt = session.execute(select(AgentTaskExecution).where(
                AgentTaskExecution.id == execution_id, AgentTaskExecution.created_by == actor_id,
            ).with_for_update().execution_options(populate_existing=True)).scalar_one()
            if receipt.status == 'running':
                receipt.status, receipt.error_code, receipt.finished_at = 'discarded', 'execution_access_changed', now()
            session.commit()
            if cancelled:
                raise asyncio.CancelledError()
            raise
        self._recover(row, receipt)
        if receipt.status == 'running':
            if row.revision != receipt.claimed_revision or row.status != 'running' or row.state != frozen:
                receipt.status, receipt.error_code, receipt.finished_at = 'discarded', 'execution_stale', now()
            else:
                if next_state is None:
                    next_state = WorkflowState.from_dict(deepcopy(frozen))
                    next_state.status = WorkflowStatus.BLOCKED if status == 'outcome_unknown' else WorkflowStatus.FAILED
                    next_state.errors.append(error_code)
                self.save(row, next_state)
                receipt.status, receipt.error_code, receipt.finished_at = status, error_code, now()
                receipt.result_hash = result_hash
        reply = self._reply(row, receipt)
        session.commit()
        if cancelled:
            raise asyncio.CancelledError()
        return reply

    def cancel(self, *, project_id, task_id, user, session, data):
        row = self.load(session=session, user=user, project_id=project_id, task_id=task_id, lock=True)
        if integer(data['expectedRevision'], 0) != row.revision:
            raise ApiError(409, 'revision_conflict', '任务状态已变化，请先刷新。')
        execution = latest_execution(session, task_id, lock=True)
        if execution is None or execution.status != 'running' or row.status != 'running':
            raise ApiError(409, 'invalid_transition', '没有正在执行的步骤。')
        self._recover(row, execution)
        if execution.status == 'running':
            execution.status, execution.error_code, execution.finished_at = 'cancelled', 'execution_cancelled', now()
            state = WorkflowState.from_dict(row.state)
            state.status = WorkflowStatus.BLOCKED
            state.errors.append('execution_cancelled')
            self.save(row, state)
        reply = self._reply(row, execution)
        session.commit()
        return reply
