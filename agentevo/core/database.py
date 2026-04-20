"""Database engine, session management, and lightweight schema migration."""

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker, declarative_base

from agentevo.core.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {},
    echo=settings.DEBUG,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI dependency that yields a DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables."""
    Base.metadata.create_all(bind=engine)
    _migrate_agents_table_if_needed()
    _migrate_chat_sessions_if_needed()


def _migrate_chat_sessions_if_needed():
    """Add new columns to chat_sessions for existing SQLite databases."""
    if "sqlite" not in settings.DATABASE_URL:
        return

    inspector = inspect(engine)
    if "chat_sessions" not in inspector.get_table_names():
        return

    columns = {col["name"] for col in inspector.get_columns("chat_sessions")}
    new_cols = {
        "learning_objective": "TEXT DEFAULT ''",
        "turn": "VARCHAR(32) DEFAULT 'student'",
        "shared_asset_id": "VARCHAR(32)",
    }

    to_add = {k: v for k, v in new_cols.items() if k not in columns}
    if not to_add:
        return

    raw_conn = engine.raw_connection()
    try:
        cursor = raw_conn.cursor()
        for col_name, col_def in to_add.items():
            cursor.execute(f"ALTER TABLE chat_sessions ADD COLUMN {col_name} {col_def}")
        raw_conn.commit()
    finally:
        raw_conn.close()


def _migrate_agents_table_if_needed():
    """Rebuild the agents table in SQLite when older schemas are still installed."""
    if "sqlite" not in settings.DATABASE_URL:
        return

    inspector = inspect(engine)
    if "agents" not in inspector.get_table_names():
        return

    columns = {column["name"]: column for column in inspector.get_columns("agents")}
    owner_is_nullable = columns.get("owner_id", {}).get("nullable", False)
    has_association_type = "association_type" in columns
    has_bound_at = "bound_at" in columns

    if owner_is_nullable and has_association_type and has_bound_at:
        return

    raw_conn = engine.raw_connection()
    try:
        cursor = raw_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=OFF")
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS agents__new (
                id VARCHAR(32) PRIMARY KEY,
                owner_id VARCHAR(32),
                name VARCHAR(128) NOT NULL,
                description TEXT DEFAULT '',
                agent_type VARCHAR(64) DEFAULT 'generic',
                capabilities JSON DEFAULT '[]',
                api_key VARCHAR(128) UNIQUE,
                association_type VARCHAR(64) DEFAULT 'unbound',
                status VARCHAR(32) DEFAULT 'active',
                last_heartbeat DATETIME,
                bound_at DATETIME,
                created_at DATETIME,
                updated_at DATETIME,
                FOREIGN KEY(owner_id) REFERENCES users (id)
            )
            """
        )
        cursor.execute(
            """
            INSERT INTO agents__new (
                id, owner_id, name, description, agent_type, capabilities,
                api_key, association_type, status, last_heartbeat, bound_at,
                created_at, updated_at
            )
            SELECT
                id,
                owner_id,
                name,
                COALESCE(description, ''),
                COALESCE(agent_type, 'generic'),
                COALESCE(capabilities, '[]'),
                api_key,
                CASE
                    WHEN owner_id IS NULL THEN 'unbound'
                    ELSE 'user_manual_registered'
                END,
                COALESCE(status, 'active'),
                last_heartbeat,
                CASE
                    WHEN owner_id IS NULL THEN NULL
                    ELSE COALESCE(updated_at, created_at)
                END,
                created_at,
                updated_at
            FROM agents
            """
        )
        cursor.execute("DROP TABLE agents")
        cursor.execute("ALTER TABLE agents__new RENAME TO agents")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_agents_owner_id ON agents (owner_id)")
        cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_agents_api_key ON agents (api_key)")
        cursor.execute("PRAGMA foreign_keys=ON")
        raw_conn.commit()
    finally:
        raw_conn.close()
