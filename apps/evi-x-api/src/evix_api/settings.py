from pathlib import Path
import re
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASES = {
    "openai": ("https://api.openai.com/v1",),
    "deepseek": ("https://api.deepseek.com/v1",),
    "qwen": ("https://dashscope.aliyuncs.com/compatible-mode/v1",),
    "compatible": (),
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="EVIX_", extra="forbid", env_file=None, hide_input_in_errors=True)
    mode: Literal["local_test", "production"] = "production"
    database_url: str = Field(repr=False)
    allowed_origins: list[str]
    invited_emails: list[str]
    auth_secret: str = Field(repr=False)
    keyring: dict[str, str] = Field(repr=False)
    active_key_id: str = "v1"
    compatible_bases: list[str] = Field(default_factory=list)
    mail_mode: Literal["fixture", "resend"] = "resend"
    provider_mode: Literal["fixture", "live"] = "live"
    mailbox_dir: Path = Path(".local/mailbox")
    mail_api_key: str = Field(default="", repr=False)
    mail_from: str = ""
    cookie_name: str = "evix_session"
    proposal_stale_seconds: int = 120
    # 硅基样本 runs spend the user's own API quota, so every bound is explicit.
    silicon_max_calls: int = 240
    silicon_concurrency: int = 3
    silicon_hourly_runs: int = 6
    silicon_call_seconds: int = 45
    silicon_stale_seconds: int = 600

    # SAV stays private and disposable; limits apply before native decoding.
    sav_temp_dir: Path = Path(".local/sav-imports")
    sav_upload_seconds: int = 20
    sav_parse_seconds: int = 15
    sav_cleanup_seconds: int = 60
    sav_hourly_imports: int = 12
    sav_global_hourly_imports: int = 120

    @model_validator(mode="after")
    def valid(self):
        if not self.database_url.startswith("postgresql+psycopg://"):
            raise ValueError("PostgreSQL with psycopg is required")
        if not self.allowed_origins or not self.invited_emails or len(self.invited_emails) > 1000:
            raise ValueError("Explicit origins and invitation list required")
        for origin in self.allowed_origins:
            parsed = urlsplit(origin)
            if parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
                raise ValueError("Origin must be exact")
            if self.mode == "production" and parsed.scheme != "https":
                raise ValueError("Production requires HTTPS origins")
            if self.mode == "local_test" and (parsed.scheme != "http" or parsed.hostname not in ("localhost", "127.0.0.1", "::1")):
                raise ValueError("Local fixtures require loopback origins")
        if not re.fullmatch(r"[a-fA-F0-9]{64}", self.auth_secret) or len(set(bytes.fromhex(self.auth_secret))) < 16:
            raise ValueError("Strong authentication secret required")
        if self.active_key_id not in self.keyring or not self.keyring or len(self.keyring) > 8:
            raise ValueError("Active vault key must exist")
        for name, key in self.keyring.items():
            if not re.fullmatch(r"[A-Za-z0-9_-]{1,32}", name) or not re.fullmatch(r"[a-fA-F0-9]{64}", key) or len(set(bytes.fromhex(key))) < 16:
                raise ValueError("Invalid vault keyring")
        if self.auth_secret.lower() in [key.lower() for key in self.keyring.values()]:
            raise ValueError("Authentication and vault keys must differ")
        self.invited_emails = list(dict.fromkeys(normalize_email(v) for v in self.invited_emails))
        if self.mode == "production" and (self.mail_mode != "resend" or self.provider_mode != "live"):
            raise ValueError("Production rejects all fixture modes")
        if self.mode == "local_test" and (self.mail_mode != "fixture" or self.provider_mode != "fixture"):
            raise ValueError("Local-test mode requires both synthetic mail and provider")
        if self.mail_mode == "fixture" and any(not v.endswith("@example.test") for v in self.invited_emails):
            raise ValueError("Fixture invitations must use example.test")
        if self.mail_mode == "resend" and (not re.fullmatch(r"[!-~]{8,512}", self.mail_api_key) or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", self.mail_from)):
            raise ValueError("Production mail must be configured")
        if self.mode == "production" and not self.cookie_name.startswith("__Host-"):
            raise ValueError("Production requires a __Host- cookie")
        if not 60 <= self.proposal_stale_seconds <= 3600:
            raise ValueError("Invalid stale call boundary")
        if not (1 <= self.silicon_max_calls <= 1000 and 1 <= self.silicon_concurrency <= 8 and 1 <= self.silicon_hourly_runs <= 60
                and 5 <= self.silicon_call_seconds <= 120 and 120 <= self.silicon_stale_seconds <= 7200):
            raise ValueError("Invalid silicon run bounds")
        if (not self.sav_temp_dir.parts or ".." in self.sav_temp_dir.parts
                or not (1 <= self.sav_upload_seconds <= 60 and 1 <= self.sav_parse_seconds <= 60
                        and 30 <= self.sav_cleanup_seconds <= 3600
                        and 1 <= self.sav_hourly_imports <= 60
                        and self.sav_hourly_imports <= self.sav_global_hourly_imports <= 1000)):
            raise ValueError("Invalid private SAV conversion bounds")
        for base in self.compatible_bases:
            validate_base("compatible", base, {"compatible": tuple(self.compatible_bases)})
        return self


def normalize_email(email: str) -> str:
    if not isinstance(email, str):
        raise ValueError("Invalid email")
    email = email.strip().lower()
    if len(email) > 254 or not re.fullmatch(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}", email):
        raise ValueError("Invalid email")
    local, domain = email.split("@")
    if len(local) > 64 or local.startswith(".") or local.endswith(".") or ".." in email or any(len(v) > 63 or v.startswith("-") or v.endswith("-") for v in domain.split(".")):
        raise ValueError("Invalid email")
    return email


def validate_base(provider: str, base: str, allowlist=None) -> str:
    if provider not in BASES or not isinstance(base, str) or len(base) > 512 or re.search(r"[\x00-\x20\x7f\\]", base):
        raise ValueError("Invalid destination")
    p = urlsplit(base)
    if p.scheme != "https" or not p.hostname or p.username or p.password or "?" in base or "#" in base or base.endswith("/"):
        raise ValueError("Invalid destination")
    # Exact policy matching, not hostname suffix matching or URL normalization.
    approved = (allowlist or BASES).get(provider, ())
    if base not in approved:
        raise ValueError("Destination is not operator approved")
    if p.hostname != p.hostname.lower() or p.netloc != p.hostname or any(v in (".", "..") for v in p.path.split("/")):
        raise ValueError("Destination must be canonical")
    return base
