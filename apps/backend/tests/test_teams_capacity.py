import asyncio
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient

from application.services.teams import MAX_TEAM_MEMBERS, TeamService
from shared.errors import ApiError


def test_max_team_members_constant_allows_six_members():
    assert MAX_TEAM_MEMBERS == 6


class _FakeResult:
    def __init__(self, scalar_val=None, rows=None):
        self._scalar = scalar_val
        self._rows = rows or []

    def scalar_one(self):
        return self._scalar

    def scalar_one_or_none(self):
        return self._scalar

    def all(self):
        return self._rows


class _FakeSession:
    def __init__(self, users_by_email, initial_count=6):
        self.users_by_email = users_by_email
        self.count = initial_count
        self.added = []
        self.committed = False

    def execute(self, stmt):
        sql_text = str(stmt)
        if 'count(' in sql_text.lower():
            return _FakeResult(scalar_val=self.count)
        if 'FROM teams' in sql_text or 'teams.id' in sql_text:
            return _FakeResult(scalar_val=SimpleNamespace(id='team-1', name='Test'))
        if 'FROM users' in sql_text:
            # Determine requested email from compiled parameters when present, else return first candidate.
            params = stmt.compile().params
            email = next((v for v in params.values() if isinstance(v, str) and '@' in v), '')
            return _FakeResult(scalar_val=self.users_by_email.get(email))
        return _FakeResult(rows=[])

    def get(self, model, key):
        return None

    def add(self, obj):
        self.added.append(obj)
        self.count += 1

    def commit(self):
        self.committed = True


def test_team_service_blocks_seventh_member_and_allows_sixth():
    owner = SimpleNamespace(id='owner-1', email='owner@example.test', invite_id='inv-1')
    candidate6 = SimpleNamespace(id='user-6', email='six@example.test', invite_id='inv-6')
    candidate7 = SimpleNamespace(id='user-7', email='seven@example.test', invite_id='inv-7')
    settings = SimpleNamespace(invited_emails={'owner@example.test', 'six@example.test', 'seven@example.test'})
    service = TeamService(settings=settings, membership=lambda *a, **kw: None)

    session_at_5 = _FakeSession({'six@example.test': candidate6}, initial_count=5)
    added = asyncio.run(
        service.add_member(
            team_id='team-1',
            user=owner,
            session=session_at_5,
            data={'email': 'six@example.test', 'role': 'editor'},
        )
    )
    assert added['userId'] == 'user-6'
    assert session_at_5.committed is True

    session_at_6 = _FakeSession({'seven@example.test': candidate7}, initial_count=6)
    with pytest.raises(ApiError) as exc:
        asyncio.run(
            service.add_member(
                team_id='team-1',
                user=owner,
                session=session_at_6,
                data={'email': 'seven@example.test', 'role': 'editor'},
            )
        )
    assert exc.value.status == 409
    assert exc.value.code == 'team_full'


def test_team_presence_heartbeat_roundtrip():
    owner = SimpleNamespace(id='owner-1', email='owner@example.test', invite_id='inv-1')
    mate = SimpleNamespace(id='mate-2', email='mate@example.test', invite_id='inv-2')
    settings = SimpleNamespace(invited_emails=set())
    service = TeamService(settings=settings, membership=lambda *a, **kw: None)

    hb = service.heartbeat_presence(
        team_id='team-1',
        user=mate,
        session=_FakeSession({}),
        data={'status': 'writing', 'note': '正在校对第3章图表'},
    )
    assert hb['status'] == 'writing'

    presence_session = _FakeSession({})
    presence_session.execute = lambda stmt: _FakeResult(rows=[(owner, 'owner'), (mate, 'editor')])
    res = service.presence(team_id='team-1', user=owner, session=presence_session)
    assert res['maxMembers'] == 6
    by_id = {m['userId']: m for m in res['members']}
    assert by_id['owner-1']['status'] == 'online'
    assert by_id['mate-2']['status'] == 'writing'
    assert by_id['mate-2']['note'] == '正在校对第3章图表'


def test_api_anti_scrape_middleware_blocks_scanners_and_sets_headers(settings, tmp_path):
    from evix_api.app import create_app

    app = create_app(settings=settings)
    client = TestClient(app)

    blocked = client.get('/api/health', headers={'User-Agent': 'Scrapy/2.11 (+https://scrapy.org)'})
    assert blocked.status_code == 403
    assert blocked.json()['error']['code'] == 'forbidden_client'

    ok = client.get('/api/health', headers={'User-Agent': 'Mozilla/5.0'})
    assert ok.headers.get('X-Content-Type-Options') == 'nosniff'
    assert ok.headers.get('X-Frame-Options') == 'DENY'
    assert ok.headers.get('X-Robots-Tag') == 'noindex, nofollow, noarchive'


def test_security_client_ip_unwraps_loopback_proxy_headers():
    from evix_api.security import _client_ip

    proxied = SimpleNamespace(
        client=SimpleNamespace(host='127.0.0.1'),
        headers={'x-forwarded-for': '203.0.113.9, 127.0.0.1', 'x-real-ip': ''},
    )
    assert _client_ip(proxied) == '203.0.113.9'

    direct = SimpleNamespace(
        client=SimpleNamespace(host='198.51.100.4'),
        headers={'x-forwarded-for': '1.2.3.4'},
    )
    assert _client_ip(direct) == '198.51.100.4'
