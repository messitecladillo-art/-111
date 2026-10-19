from shared.contracts import object_fields, strict_json
from shared.errors import ApiError

async def body(request, required, optional=(), limit=350_000):
    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
        raise ApiError(415, "unsupported_media_type", "请求须为JSON。")
    advertised = request.headers.get("content-length")
    if advertised and (not advertised.isdecimal() or int(advertised) > limit):
        raise ApiError(413, "payload_too_large", "请求内容超过上限。")
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > limit:
            raise ApiError(413, "payload_too_large", "请求内容超过上限。")
        chunks.append(chunk)
    try:
        decoded = b"".join(chunks).decode("utf-8", errors="strict")
    except UnicodeDecodeError:
        raise ApiError() from None
    return object_fields(strict_json(decoded), required, optional)


async def questionnaire_save_body(request):
    """Keep the legacy raw 350KB cap; allow the two-design apply envelope 1MB."""
    class CountedRequest:
        headers = request.headers
        size = 0

        async def stream(self):
            async for chunk in request.stream():
                self.size += len(chunk)
                yield chunk

    counted = CountedRequest()
    data = await body(counted, ("design", "expectedRevision", "idempotencyKey"), ("sourceProposalId", "topicBindingMutation"), limit=1_000_000)
    advertised = request.headers.get("content-length")
    if "topicBindingMutation" not in data and (counted.size > 350_000 or advertised and int(advertised) > 350_000):
        raise ApiError(413, "payload_too_large", "请求内容超过上限。")
    return data
