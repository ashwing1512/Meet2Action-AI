import re
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


class TranscriptRequest(BaseModel):
    title: str = Field(default="Untitled Meeting")
    transcript: str = Field(..., min_length=20)
    participants: str = ""


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=2000)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: List[ChatMessage] = Field(default_factory=list, max_length=12)


class TaskSchema(BaseModel):
    title: str
    description: Optional[str] = None
    assignee: Optional[str] = None
    priority: Literal["low", "medium", "high", "critical"] = "medium"
    status: Literal["todo", "in_progress", "completed"] = "todo"
    due_date: Optional[str] = None
    role: Optional[str] = None
    source: Optional[str] = "manual"


class MeetingAnalysisResult(BaseModel):
    summary: str
    notes: List[str] = []
    tasks: List[TaskSchema] = []
    roles: List[str] = []
    deadlines: List[str] = []
    responsible_people: List[str] = []


class MeetingOutput(BaseModel):
    id: int
    title: str
    date: str
    summary: str
    participants: str
    transcript: str
    created_at: str


class TeamMemberSchema(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    role: str = Field(min_length=1, max_length=120)
    email: str = Field(default="", max_length=180)
    team: str = Field(min_length=1, max_length=120)
    capacity: int = Field(ge=1, le=100)
    load: int = Field(ge=0, le=100)


class RoleSchema(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    team_member_id: Optional[int] = None


class UserProfileSchema(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(default="", max_length=40)
    role: str = Field(min_length=1, max_length=120)
    team: str = Field(min_length=1, max_length=120)
    company: str = Field(min_length=1, max_length=180)
    timezone: str = Field(min_length=1, max_length=80)
    photo: str = Field(default="", max_length=3_000_000)


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=180)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", normalized):
            raise ValueError("Enter a valid email address.")
        return normalized


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=180)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", normalized):
            raise ValueError("Enter a valid email address.")
        return normalized


class PasswordConfirmation(BaseModel):
    password: str = Field(min_length=1, max_length=128)


class WorkspaceSettingsSchema(BaseModel):
    theme: Literal["light", "dark"] = "light"
    notifications: bool = True
    aiSummary: bool = True
    defaultExport: Literal["PDF", "CSV"] = "PDF"
