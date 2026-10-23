import asyncio
import json
import httpx
from shared.contracts import strict_json

from shared.errors import ProviderFailure

class ChatCompletionClient:
    async def complete(self, config, key, message, limit):
        parameter = "max_completion_tokens" if config["provider"] in ("openai", "qwen") else "max_tokens"
        payload = {"model": config["model"], "messages": [{"role": "user", "content": message}], "stream": False,
                   parameter: config["maxOutputTokens"]}
        if config["provider"] == "openai":
            payload["store"] = False
        encoded = json.dumps(payload, ensure_ascii=False).encode()
        if len(encoded) > limit:
            raise ProviderFailure("input_too_large")
        try:
            async with asyncio.timeout(30):
                async with httpx.AsyncClient(timeout=httpx.Timeout(30, connect=5), follow_redirects=False, trust_env=False) as client:
                    async with client.stream("POST", config["baseUrl"] + "/chat/completions", headers={"authorization": "Bearer " + key, "content-type": "application/json"}, content=encoded) as response:
                        if 300 <= response.status_code < 400:
                            raise ProviderFailure("redirect_blocked")
                        if response.status_code in (401, 403):
                            raise ProviderFailure("authentication_failed")
                        if response.status_code == 429:
                            raise ProviderFailure("rate_limited")
                        if not 200 <= response.status_code < 300:
                            # A timeout or server error may follow completed billable
                            # work; preserve reconciliation state without re-dispatch.
                            raise ProviderFailure("provider_rejected", unknown=response.status_code == 408 or response.status_code >= 500)
                        if not response.headers.get("content-type", "").split(";", 1)[0].endswith("json"):
                            raise ProviderFailure("invalid_response")
                        chunks, size = [], 0
                        async for chunk in response.aiter_bytes():
                            size += len(chunk)
                            if size > 131072:
                                raise ProviderFailure("response_too_large")
                            chunks.append(chunk)
                        data = strict_json(b"".join(chunks).decode("utf-8"))
                        if not isinstance(data, dict) or not isinstance(data.get("choices"), list) or len(data["choices"]) != 1:
                            raise ProviderFailure("invalid_response")
                        choice = data["choices"][0]
                        m = choice.get("message", {})
                        result = m.get("content")
                        if choice.get("finish_reason") in ("length", "tool_calls", "function_call") or m.get("tool_calls") or m.get("function_call") or not isinstance(result, str) or key in result:
                            raise ProviderFailure("invalid_response")
                        return result
        except ProviderFailure:
            raise
        except (TimeoutError, httpx.HTTPError):
            raise ProviderFailure("provider_timeout", unknown=True) from None
        except Exception:
            raise ProviderFailure("invalid_response") from None
