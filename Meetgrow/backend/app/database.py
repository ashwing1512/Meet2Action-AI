from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(settings.DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def init_db() -> None:
    from app.models import AssistantMessage, AuthSession, Meeting, Role, Task, TaskOverdueNotification, TeamMember, UserAccount, UserProfile, WorkspaceSettings  # noqa: F401

    Base.metadata.create_all(bind=engine)
    legacy_owner_tables = ("meetings", "tasks", "task_overdue_notifications", "team_members", "roles")
    inspector = inspect(engine)
    with engine.begin() as connection:
        for table in legacy_owner_tables:
            if table not in inspector.get_table_names():
                continue
            columns = {column["name"] for column in inspector.get_columns(table)}
            if "owner_id" not in columns:
                connection.execute(text(f"ALTER TABLE {table} ADD COLUMN owner_id INTEGER REFERENCES user_accounts(id)"))
        if "user_accounts" in inspector.get_table_names():
            first_account_id = connection.execute(text("SELECT MIN(id) FROM user_accounts")).scalar()
            if first_account_id is not None:
                for table in legacy_owner_tables:
                    if table in inspector.get_table_names():
                        connection.execute(
                            text(f"UPDATE {table} SET owner_id = :account_id WHERE owner_id IS NULL"),
                            {"account_id": first_account_id},
                        )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
