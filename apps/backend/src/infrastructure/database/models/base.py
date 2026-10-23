from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy.orm import DeclarativeBase

def now():
    return datetime.now(timezone.utc)

def new_id():
    return str(uuid4())

class Base(DeclarativeBase):
    pass
