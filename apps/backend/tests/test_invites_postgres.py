"""Actual PostgreSQL acceptance of registration by invitation code, with synthetic addresses only."""
import pytest
from sqlalchemy import delete, select, update
from fastapi.testclient import TestClient
from infrastructure.database.models import InviteCode, RateEvent, User, now
from application.services.invites import normalize_code, new_code

pytestmark = pytest.mark.postgres


def request_code(app, settings, email, invite=None):
    client = TestClient(app)
    body = {"email": email, **({"inviteCode": invite} if invite is not None else {})}
    response = client.post("/api/auth/code", headers={"origin": settings.allowed_origins[0]}, json=body)
    assert response.status_code == 202, response.text
    return client, response.json()["challengeId"]


def forget_rate(pg_engine):
    """The per-address one-minute spacing is not under test here: clear it before asking the same address again."""
    with pg_engine.begin() as connection:
        connection.execute(delete(RateEvent))


def verify(client, settings, challenge, code):
    return client.post("/api/auth/verify", headers={"origin": settings.allowed_origins[0]}, json={"challengeId": challenge, "code": code})


def issue(admin, label="队友", uses=1, days=7):
    response = admin.post("/api/invites", json={"label": label, "maxUses": uses, "days": days})
    assert response.status_code == 201, response.text
    return response.json()


def test_a_new_address_registers_only_with_a_usable_code(harness, settings, pg_engine):
    app, login, deliveries, _ = harness
    admin, _ = login()
    # Without a code: the same receipt, but no mail and no way in.
    _, cid = request_code(app, settings, "new@example.test")
    assert cid not in deliveries
    invite = issue(admin)
    assert normalize_code(invite["code"]) and invite["status"] == "active" and invite["uses"] == 0
    assert "code" not in admin.get("/api/invites").json()["invites"][0], "the code is shown once, never listed"
    # With the code, typed loosely: the mail arrives, verification registers the account and claims the code.
    forget_rate(pg_engine)
    client, cid = request_code(app, settings, "new@example.test", " " + invite["code"].lower().replace("-", " ") + " ")
    response = verify(client, settings, cid, deliveries[cid][1])
    assert response.status_code == 200, response.text
    client.headers.update({"origin": settings.allowed_origins[0], "x-csrf-token": response.json()["csrfToken"]})
    assert client.get("/api/teams").status_code == 200, "an account registered by code is admitted"
    listed = admin.get("/api/invites").json()["invites"][0]
    assert listed["uses"] == 1 and listed["status"] == "used_up"
    with pg_engine.connect() as connection:
        assert connection.execute(select(User.invite_id).where(User.email == "new@example.test")).scalar_one() == invite["id"]
    # The code is used up: a second address gets no mail.
    _, cid = request_code(app, settings, "other@example.test", invite["code"])
    assert cid not in deliveries
    # The registered account signs in again without a code.
    forget_rate(pg_engine)
    client, cid = request_code(app, settings, "new@example.test")
    assert verify(client, settings, cid, deliveries[cid][1]).status_code == 200


def test_codes_are_issued_only_by_listed_administrators_and_revocation_stops_registration(harness, settings, pg_engine):
    app, login, deliveries, _ = harness
    admin, _ = login()
    invite = issue(admin, uses=3)
    client, cid = request_code(app, settings, "guest@example.test", invite["code"])
    response = verify(client, settings, cid, deliveries[cid][1])
    client.headers.update({"origin": settings.allowed_origins[0], "x-csrf-token": response.json()["csrfToken"]})
    refused = client.post("/api/invites", json={"label": "转发", "maxUses": 5, "days": 7})
    assert refused.status_code == 403 and refused.json()["error"]["code"] == "invite_forbidden", "an invited account cannot invite"
    assert client.get("/api/invites").status_code == 403
    revoked = admin.post(f"/api/invites/{invite['id']}/revoke")
    assert revoked.status_code == 200 and revoked.json()["status"] == "revoked"
    _, cid = request_code(app, settings, "late@example.test", invite["code"])
    assert cid not in deliveries, "a revoked code admits no one"
    assert client.get("/api/teams").status_code == 200, "accounts it already admitted keep their access"
    other, _ = login("b@example.test")
    assert other.post(f"/api/invites/{invite['id']}/revoke").status_code == 404, "an administrator revokes only their own codes"
    for bad in ({"label": "x", "maxUses": 0, "days": 7}, {"label": "x", "maxUses": 51, "days": 7}, {"label": "x", "maxUses": 1, "days": 31}, {"label": "   ", "maxUses": 1, "days": 1}, {"label": "a\x07b", "maxUses": 1, "days": 1}):
        assert admin.post("/api/invites", json=bad).status_code == 422


def test_a_single_use_is_claimed_once_even_by_two_pending_registrations(harness, settings):
    app, login, deliveries, _ = harness
    admin, _ = login()
    invite = issue(admin, uses=1)
    first, first_id = request_code(app, settings, "one@example.test", invite["code"])
    second, second_id = request_code(app, settings, "two@example.test", invite["code"])
    assert verify(first, settings, first_id, deliveries[first_id][1]).status_code == 200
    late = verify(second, settings, second_id, deliveries[second_id][1])
    assert late.status_code == 401 and late.json()["error"]["code"] == "invite_unavailable"


def test_an_expired_code_and_a_delisted_address_are_not_ways_in(harness, settings, pg_engine):
    app, login, deliveries, _ = harness
    admin, _ = login()
    invite = issue(admin)
    with pg_engine.begin() as connection:
        connection.execute(update(InviteCode).where(InviteCode.id == invite["id"]).values(expires_at=now()))
    _, cid = request_code(app, settings, "expired@example.test", invite["code"])
    assert cid not in deliveries
    # c@example.test signs up while listed, then is taken off the list: a fresh code does not readmit the account.
    login("c@example.test")
    settings.invited_emails.remove("c@example.test")
    fresh = issue(admin)
    forget_rate(pg_engine)
    client, cid = request_code(app, settings, "c@example.test", fresh["code"])
    assert verify(client, settings, cid, deliveries[cid][1]).status_code == 401
    assert admin.get("/api/invites").json()["invites"][0]["uses"] == 0, "the code was not spent on a delisted account"


def test_team_owners_can_add_accounts_registered_by_code(harness, settings):
    app, login, deliveries, _ = harness
    admin, me = login()
    invite = issue(admin)
    client, cid = request_code(app, settings, "member@example.test", invite["code"])
    assert verify(client, settings, cid, deliveries[cid][1]).status_code == 200
    team = admin.get("/api/teams").json()["teams"][0]["id"]
    added = admin.post(f"/api/teams/{team}/members", json={"email": "member@example.test", "role": "editor"})
    assert added.status_code == 201, added.text


def test_codes_have_the_documented_shape():
    code = new_code()
    assert len(code) == 14 and code.count("-") == 2 and normalize_code(code) == code.replace("-", "")
    assert normalize_code("ＡＢＣＤ－ＥＦＧＨ－ＪＫＭＮ") == "ABCDEFGHJKMN", "full-width input is folded"
    assert normalize_code("ABCD-EFGH-JKM0") is None, "0 is not in the alphabet"
    assert normalize_code(123) is None and normalize_code("x" * 65) is None
