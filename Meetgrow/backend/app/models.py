from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Meeting(Base):
    __tablename__ = "meetings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    date: Mapped[str] = mapped_column(String(50), default=lambda: datetime.utcnow().date().isoformat())
    summary: Mapped[str] = mapped_column(Text, default="")
    transcript: Mapped[str] = mapped_column(Text, default="")
    participants: Mapped[str] = mapped_column(String(255), default="")
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("user_accounts.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    tasks: Mapped[list["Task"]] = relationship(back_populates="meeting")


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    assignee: Mapped[str | None] = mapped_column(String(120), nullable=True)
    priority: Mapped[str] = mapped_column(String(20), default="medium")
    status: Mapped[str] = mapped_column(String(20), default="todo")
    due_date: Mapped[str | None] = mapped_column(String(50), nullable=True)
    role: Mapped[str | None] = mapped_column(String(120), nullable=True)
    source: Mapped[str] = mapped_column(String(50), default="manual")
    meeting_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("meetings.id"), nullable=True)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("user_accounts.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    meeting: Mapped[Meeting | None] = relationship(back_populates="tasks")


class TaskOverdueNotification(Base):
    __tablename__ = "task_overdue_notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), nullable=False, unique=True, index=True)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("user_accounts.id"), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    email_status: Mapped[str] = mapped_column(String(30), default="pending")
    email_recipients: Mapped[str] = mapped_column(Text, default="")
    email_attempted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    task: Mapped[Task] = relationship()


class TeamMember(Base):
    __tablename__ = "team_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[str] = mapped_column(String(120), default="Team Member")
    email: Mapped[str] = mapped_column(String(180), default="")
    team: Mapped[str] = mapped_column(String(120), default="Product")
    capacity: Mapped[int] = mapped_column(Integer, default=8)
    load: Mapped[int] = mapped_column(Integer, default=4)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("user_accounts.id"), nullable=True)

    roles: Mapped[list["Role"]] = relationship(back_populates="team_member")


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, default="Sarah Chen")
    email: Mapped[str] = mapped_column(String(180), nullable=False, default="sarah@meetgrow.io")
    phone: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    role: Mapped[str] = mapped_column(String(120), nullable=False, default="Product Operations Manager")
    team: Mapped[str] = mapped_column(String(120), nullable=False, default="Product")
    company: Mapped[str] = mapped_column(String(180), nullable=False, default="Meetgrow")
    timezone: Mapped[str] = mapped_column(String(80), nullable=False, default="UTC+5:30")
    photo: Mapped[str] = mapped_column(Text, nullable=False, default="")


class AssistantMessage(Base):
    __tablename__ = "assistant_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("user_accounts.id"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class WorkspaceSettings(Base):
    __tablename__ = "workspace_settings"

    owner_id: Mapped[int] = mapped_column(ForeignKey("user_accounts.id"), primary_key=True)
    theme: Mapped[str] = mapped_column(String(20), default="light")
    notifications: Mapped[bool] = mapped_column(default=True)
    ai_summary: Mapped[bool] = mapped_column(default=True)
    default_export: Mapped[str] = mapped_column(String(20), default="PDF")


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    team_member_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("team_members.id"), nullable=True)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("user_accounts.id"), nullable=True)

    team_member: Mapped[TeamMember | None] = relationship(back_populates="roles")


class UserAccount(Base):
    __tablename__ = "user_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(180), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("user_accounts.id"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
