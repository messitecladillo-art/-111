import hashlib
import hmac
import secrets
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from .contracts import canonical, fingerprint, ApiError


def keyed(settings, domain, value):
    return hmac.new(bytes.fromhex(settings.auth_secret), (domain + ":" + value).encode(), hashlib.sha256).hexdigest()


def random_token():
    return secrets.token_urlsafe(32)


def code_verifier(settings, challenge_id, email, code):
    return keyed(settings, "otp/v1", canonical([challenge_id, email, code]))


def config_view(service):
    return {"id": service.id, "label": service.label, "provider": service.provider, "baseUrl": service.base_url,
            "model": service.model, "maxOutputTokens": service.max_output_tokens, "capabilities": service.capabilities,
            "revision": service.revision}


def aad(service):
    config = {key: value for key, value in config_view(service).items() if key != "revision"}
    return canonical(["evix/vault/v1", service.user_id, service.id, service.revision, service.key_id, fingerprint(config)]).encode()


def encrypt(settings, service, key):
    if key in canonical(config_view(service)):
        raise ApiError(422, "invalid_service_input", "服务公开配置不能包含密钥。")
    service.key_id = settings.active_key_id
    service.iv = secrets.token_bytes(12)
    service.ciphertext = AESGCM(bytes.fromhex(settings.keyring[service.key_id])).encrypt(service.iv, key.encode(), aad(service))


def decrypt(settings, service):
    try:
        return AESGCM(bytes.fromhex(settings.keyring[service.key_id])).decrypt(service.iv, service.ciphertext, aad(service)).decode()
    except Exception:
        raise ApiError(503, "vault_unavailable", "服务凭据暂不可用，请重新配置。") from None
