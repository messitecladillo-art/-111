class ApiError(Exception):
    def __init__(self, status=422, code="invalid_input", message="请求格式或字段无效。"):
        self.status, self.code, self.message = status, code, message


class ProviderFailure(Exception):
    def __init__(self, code="provider_unavailable", unknown=False):
        allowed = {"provider_unavailable", "invalid_proposal", "input_too_large", "redirect_blocked", "authentication_failed",
                   "rate_limited", "provider_rejected", "invalid_response", "response_too_large", "provider_timeout", "provider_failure"}
        self.code, self.unknown = code if isinstance(code, str) and code in allowed else "provider_failure", unknown is True
        super().__init__(self.code)
