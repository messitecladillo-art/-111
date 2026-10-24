from sqlalchemy import select, func
from shared.errors import ApiError
from shared.contracts import uuid_string, integer
from infrastructure.database.models import Service, new_id
from infrastructure.security import config_view, encrypt, decrypt

class ModelConfigurationService:

    def __init__(self, *, settings, lock_user, operation, settings_input, owned_service):
        self.settings = settings
        self.lock_user = lock_user
        self.operation = operation
        self.settings_input = settings_input
        self.owned_service = owned_service

    def services(self, *, user, session):
        return {'services': [config_view(s) for s in session.execute(select(Service).where(Service.user_id == user.id, Service.deleted.is_(False))).scalars()]}

    async def create_service(self, *, user, session, data):
        self.lock_user(session, user)
        op, repeated = self.operation(session, user, 'services', data)
        if repeated:
            return op.response
        config = self.settings_input(data)
        if session.scalar(select(func.count()).select_from(Service).where(Service.user_id == user.id, Service.deleted.is_(False))) >= 8:
            raise ApiError(409, 'service_limit', '最多保存8个服务。')
        s = Service(id=new_id(), user_id=user.id, revision=1, **config)
        encrypt(self.settings, s, data['apiKey'])
        session.add(s)
        op.response = config_view(s)
        session.commit()
        return op.response

    async def edit_service(self, *, service_id: str, user, session, data):
        self.lock_user(session, user)
        uuid_string(service_id)
        op, repeated = self.operation(session, user, 'service:' + service_id, data)
        if repeated:
            return op.response
        s = self.owned_service(session, user, service_id, lock=True)
        if integer(data['expectedRevision'], 1) != s.revision:
            raise ApiError(409, 'revision_conflict', '配置已变化，请刷新。')
        if s.revision >= 2147483647:
            raise ApiError(409, 'version_limit', '服务版本上限已达到，请新建配置。')
        config = self.settings_input(data)
        if (config['provider'] != s.provider or config['base_url'] != s.base_url) and 'apiKey' not in data:
            raise ApiError(422, 'new_key_required', '改变服务地址必须重新提供密钥。')
        key = data.get('apiKey') or decrypt(self.settings, s)
        for name, value in config.items():
            setattr(s, name, value)
        s.revision += 1
        encrypt(self.settings, s, key)
        op.response = config_view(s)
        session.commit()
        return op.response

    async def remove_service(self, *, service_id: str, user, session, data):
        self.lock_user(session, user)
        op, repeated = self.operation(session, user, 'delete-service:' + service_id, data)
        if repeated:
            return None
        s = self.owned_service(session, user, service_id, lock=True)
        if integer(data['expectedRevision'], 1) != s.revision:
            raise ApiError(409, 'revision_conflict', '配置已变化，请刷新。')
        s.deleted, s.ciphertext, s.iv = (True, b'', b'')
        op.response = {'deleted': True}
        session.commit()
        return None
