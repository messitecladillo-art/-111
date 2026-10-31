"""Invitation codes: registration for addresses outside the operator's invitation list.

Like users and email_challenges, invite_codes is read and written on the unauthenticated sign-in path, before any
evix.user_id exists, so it carries no row-level policy; the service filters by issuer for listing and revoking.
"""

from alembic import op

revision = "0010_invite_codes"
down_revision = "0009_agent_task_collaboration"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""CREATE TABLE invite_codes (
      id VARCHAR(36) PRIMARY KEY,
      code_hash VARCHAR(64) NOT NULL UNIQUE,
      created_by VARCHAR(36) NOT NULL REFERENCES users(id),
      label VARCHAR(40) NOT NULL,
      max_uses INTEGER NOT NULL CHECK(max_uses BETWEEN 1 AND 50),
      uses INTEGER NOT NULL DEFAULT 0 CHECK(uses >= 0 AND uses <= max_uses),
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL
    )""")
    op.execute("CREATE INDEX ix_invite_codes_created_by ON invite_codes(created_by)")
    op.execute("ALTER TABLE users ADD COLUMN invite_id VARCHAR(36) REFERENCES invite_codes(id)")
    op.execute("ALTER TABLE email_challenges ADD COLUMN invite_id VARCHAR(36) REFERENCES invite_codes(id)")


def downgrade():
    raise RuntimeError("Destructive downgrade disabled; restore a verified backup")
