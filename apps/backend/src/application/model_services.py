import re
from infrastructure.settings import BASES, validate_base
from shared.errors import ApiError
from shared.contracts import text, integer

def validate_service_config(settings, data):
    label = text(data['label'], 80, 1)
    model = text(data['model'], 120, 1)
    if label != label.strip() or re.search('[\\x00-\\x1f\\x7f-\\x9f\\u2028\\u2029]', label) or (not re.fullmatch('[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}', model)):
        raise ApiError()
    if data['provider'] == 'gemini' and not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,119}', model):
        raise ApiError(422, 'invalid_model', '请填写 Gemini 的模型 ID，不要填写 URL 或 models/ 路径。')
    caps = data['capabilities']
    if not isinstance(caps, list) or not 1 <= len(caps) <= 4 or any((not isinstance(c, str) for c in caps)) or (len(set(caps)) != len(caps)) or any((c not in ('questionnaire', 'research', 'report', 'defense') for c in caps)):
        raise ApiError()
    policy = {**BASES, 'compatible': tuple(settings.compatible_bases)}
    try:
        validate_base(data['provider'], data['baseUrl'], policy)
    except (ValueError, TypeError):
        raise ApiError(422, 'destination_not_allowed', '服务地址未获运营者允许。') from None
    if 'apiKey' in data and (not isinstance(data['apiKey'], str) or not re.fullmatch('[!-~]{8,1024}', data['apiKey'])):
        raise ApiError(422, 'invalid_key', '密钥格式无效。')
    return {'label': label, 'provider': data['provider'], 'base_url': data['baseUrl'], 'model': model, 'max_output_tokens': integer(data['maxOutputTokens'], 128, 4096), 'capabilities': caps}
