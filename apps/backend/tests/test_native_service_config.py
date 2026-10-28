from types import SimpleNamespace

import pytest

from application.model_services import validate_service_config
from infrastructure.settings import BASES, validate_base
from shared.errors import ApiError


def config(provider, model='synthetic-model'):
    return {'label': '合成配置', 'provider': provider, 'baseUrl': BASES[provider][0],
            'model': model, 'maxOutputTokens': 1024, 'capabilities': ['research', 'report'],
            'apiKey': 'synthetic-not-a-real-key'}


@pytest.mark.parametrize('provider', ['anthropic', 'gemini'])
def test_native_config_keeps_provider_model_and_capabilities(provider):
    result = validate_service_config(SimpleNamespace(compatible_bases=[]), config(provider))
    assert result['provider'] == provider
    assert result['model'] == 'synthetic-model'
    assert result['capabilities'] == ['research', 'report']
    assert 'apiKey' not in result


@pytest.mark.parametrize('provider', ['anthropic', 'gemini'])
@pytest.mark.parametrize('bad_base', ['http://localhost/v1', 'https://api.anthropic.com.evil.invalid/v1',
                                      'https://generativelanguage.googleapis.com/v1beta?key=secret',
                                      'https://api.anthropic.com/v1/../messages', 'https://user:pass@api.anthropic.com/v1'])
def test_native_destinations_cannot_redirect_keys(provider, bad_base):
    value = config(provider)
    value['baseUrl'] = bad_base
    with pytest.raises(ApiError) as error:
        validate_service_config(SimpleNamespace(compatible_bases=[]), value)
    assert error.value.code == 'destination_not_allowed'


@pytest.mark.parametrize('model', ['../models/other', 'models/model-id', 'models/../../other',
                                  'model:generateContent', 'https://other.invalid/model'])
def test_gemini_model_id_is_not_a_url_path(model):
    with pytest.raises(ApiError):
        validate_service_config(SimpleNamespace(compatible_bases=[]), config('gemini', model))


def test_compatible_provider_still_requires_operator_approval():
    custom = 'https://synthetic-model.invalid/v1'
    with pytest.raises(ValueError):
        validate_base('compatible', custom)
    assert validate_base('compatible', custom, {**BASES, 'compatible': (custom,)}) == custom
    value = config('openai', 'organization/model-name')
    assert validate_service_config(SimpleNamespace(compatible_bases=[]), value)['model'] == 'organization/model-name'
