from shared.errors import ApiError
from shared.contracts import uuid_string, canonical
from infrastructure.database.models import Operation
from infrastructure.security import keyed

def reserve_operation(settings, session, user, scope, data):
    key = uuid_string(data['idempotencyKey'])
    digest = keyed(settings, 'operation-payload/v1', canonical(data))
    existing = session.get(Operation, (user.id, scope, key))
    if existing:
        if existing.payload_hash != digest:
            raise ApiError(409, 'idempotency_conflict', '操作标识已用于不同请求。')
        return (existing, True)
    item = Operation(user_id=user.id, scope=scope, key=key, payload_hash=digest)
    session.add(item)
    return (item, False)
