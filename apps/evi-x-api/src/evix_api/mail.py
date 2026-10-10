import asyncio
import json
import os
from pathlib import Path
import httpx


class MailFailure(Exception):
    pass


class FixtureMail:
    def __init__(self, directory: Path):
        self.directory = directory

    async def __call__(self, challenge_id, email, code):
        if not email.endswith("@example.test"):
            raise MailFailure()
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        if self.directory.is_symlink():
            raise MailFailure()
        target = self.directory / (challenge_id + ".json")
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump({"challengeId": challenge_id, "email": email, "code": code,
                       "classification": "synthetic_local_test"}, handle)


class ResendMail:
    def __init__(self, settings):
        self.settings = settings

    async def __call__(self, challenge_id, email, code):
        try:
            async with asyncio.timeout(10):
                async with httpx.AsyncClient(timeout=10, follow_redirects=False, trust_env=False) as client:
                    async with client.stream("POST", "https://api.resend.com/emails", headers={
                        "authorization": "Bearer " + self.settings.mail_api_key,
                        "idempotency-key": "evix-login-" + challenge_id,
                    }, json={"from": self.settings.mail_from, "to": [email], "subject": "证见 EVI-X 登录验证码",
                             "text": f"登录验证码 {code}，10分钟内有效。非本人操作请忽略。"}) as response:
                        if not 200 <= response.status_code < 300:
                            raise MailFailure()
                        data = bytearray()
                        async for chunk in response.aiter_bytes():
                            data.extend(chunk)
                            if len(data) > 8192:
                                raise MailFailure()
                        payload = json.loads(data)
                        if not isinstance(payload, dict) or not isinstance(payload.get("id"), str):
                            raise MailFailure()
        except Exception:
            raise MailFailure() from None
