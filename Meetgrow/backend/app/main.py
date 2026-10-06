import asyncio
import hashlib
import hmac
import logging
import re
import secrets
import smtplib
from datetime import date, datetime, timedelta
from email.message import EmailMessage
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from starlette.responses import JSONResponse

from app.config import settings
from app.database import SessionLocal, get_db, init_db
from app.models import AssistantMessage, AuthSession, Meeting, Role, Task, TaskOverdueNotification, TeamMember, UserAccount, UserProfile, WorkspaceSettings
from app.schemas import ChatRequest, LoginRequest, PasswordConfirmation, RegisterRequest, RoleSchema, TaskSchema, TeamMemberSchema, TranscriptRequest, UserProfileSchema, WorkspaceSettingsSchema
from app.services.gemini_service import GeminiService

app = FastAPI(title=settings.APP_NAME, version="1.0.0")
room_connections: dict[str, dict[str, WebSocket]] = {}
logger = logging.getLogger(__name__)
overdue_monitor_task: asyncio.Task[None] | None = None
AUTH_EXEMPT_PATHS = {"/api/health", "/api/auth/register", "/api/auth/login"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event() -> None:
    global overdue_monitor_task
    init_db()
    seed_demo_data()
    overdue_monitor_task = asyncio.create_task(overdue_monitor())


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 310_000)
    return f"{salt.hex()}:{digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt_hex, expected = stored_hash.split(":", 1)
        candidate = hash_password(password, bytes.fromhex(salt_hex)).split(":", 1)[1]
        return hmac.compare_digest(candidate, expected)
    except (TypeError, ValueError):
        return False


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(db: Session, account: UserAccount) -> str:
    token = secrets.token_urlsafe(40)
    db.add(
        AuthSession(
            account_id=account.id,
            token_hash=token_digest(token),
            expires_at=datetime.utcnow() + timedelta(days=30),
        )
    )
    return token


@app.middleware("http")
async def require_authenticated_session(request: Request, call_next):
    path = request.url.path
    if not path.startswith("/api/") or path in AUTH_EXEMPT_PATHS or request.method == "OPTIONS":
        return await call_next(request)

    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        return JSONResponse(status_code=401, content={"detail": "Please sign in to continue."})
    db = SessionLocal()
    try:
        session = db.query(AuthSession).filter(AuthSession.token_hash == token_digest(token)).first()
        if session is None or session.expires_at <= datetime.utcnow():
            if session is not None:
                db.delete(session)
                db.commit()
            return JSONResponse(status_code=401, content={"detail": "Your session has expired. Please sign in again."})
        request.state.account_id = session.account_id
    finally:
        db.close()
    return await call_next(request)


def account_id_from_request(request: Request) -> int:
    return request.state.account_id


def assign_legacy_workspace(db: Session, account_id: int) -> None:
    for model in (Meeting, Task, TaskOverdueNotification, TeamMember, Role):
        db.query(model).filter(model.owner_id.is_(None)).update(
            {model.owner_id: account_id},
            synchronize_session=False,
        )


@app.on_event("shutdown")
async def shutdown_event() -> None:
    if overdue_monitor_task is not None:
        overdue_monitor_task.cancel()
        try:
            await overdue_monitor_task
        except asyncio.CancelledError:
            pass


async def overdue_monitor() -> None:
    while True:
        await asyncio.to_thread(process_overdue_tasks)
        await asyncio.sleep(60)


def parse_due_date(value: str | None) -> date | None:
    if not value:
        return None
    match = re.search(r"\d{4}-\d{2}-\d{2}", value)
    if match:
        try:
            return date.fromisoformat(match.group(0))
        except ValueError:
            return None
    weekday_match = re.search(
        r"\b(?:(?:by|before|due|on|for)\s+)?(next\s+)?"
        r"(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow)\b",
        value,
        flags=re.IGNORECASE,
    )
    if not weekday_match:
        return None
    today = date.today()
    if weekday_match.group(2).lower() == "tomorrow":
        return today + timedelta(days=1)
    target_weekday = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].index(
        weekday_match.group(2).lower()
    )
    days_ahead = (target_weekday - today.weekday()) % 7
    if days_ahead == 0 or weekday_match.group(1):
        days_ahead += 7
    return today + timedelta(days=days_ahead)


def send_overdue_email(task: Task, recipient_emails: list[str]) -> None:
    message = EmailMessage()
    message["Subject"] = f"Overdue task: {task.title}"
    message["From"] = settings.SMTP_FROM or settings.SMTP_USER
    message["To"] = ", ".join(recipient_emails)
    message.set_content(
        f'The task "{task.title}" assigned to {task.assignee or "an unassigned team member"} '
        f'passed its deadline ({task.due_date}). Current status: {task.status}.'
    )

    if settings.SMTP_STARTTLS:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
            smtp.starttls()
            if settings.SMTP_USER:
                smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.send_message(message)
    else:
        with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
            if settings.SMTP_USER:
                smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.send_message(message)


def process_overdue_tasks() -> None:
    db = SessionLocal()
    try:
        tasks = db.query(Task).filter(
            Task.status != "completed",
            Task.due_date.isnot(None),
        ).all()
        existing_ids = {
            notification.task_id
            for notification in db.query(TaskOverdueNotification.task_id).all()
        }
        today = date.today()
        for task in tasks:
            deadline = parse_due_date(task.due_date)
            if deadline is not None and deadline < today and task.id not in existing_ids:
                db.add(
                    TaskOverdueNotification(
                        task_id=task.id,
                        owner_id=task.owner_id,
                        message=f"{task.title} assigned to {task.assignee or 'Unassigned'} is overdue.",
                    )
                )
        db.commit()

        retry_before = datetime.utcnow() - timedelta(minutes=15)
        notifications = (
            db.query(TaskOverdueNotification)
            .join(TaskOverdueNotification.task)
            .options(joinedload(TaskOverdueNotification.task))
            .filter(
                TaskOverdueNotification.email_status.in_(["pending", "not_configured", "no_manager", "failed"]),
                Task.status != "completed",
                TaskOverdueNotification.email_attempted_at.is_(None)
                | (TaskOverdueNotification.email_attempted_at < retry_before),
            )
            .all()
        )
        for notification in notifications:
            manager_emails = [
                member.email.strip()
                for member in db.query(TeamMember).filter(TeamMember.owner_id == notification.owner_id).all()
                if re.search(r"\b(manager|head)\b", member.role, flags=re.IGNORECASE)
                and re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", member.email.strip())
            ]
            notification.email_attempted_at = datetime.utcnow()
            notification.email_recipients = ", ".join(manager_emails)
            db.commit()

            if not manager_emails:
                notification.email_status = "no_manager"
                logger.warning("Overdue task %s has no manager/head team member with an email address.", notification.task_id)
            elif not settings.SMTP_HOST or not (settings.SMTP_FROM or settings.SMTP_USER):
                notification.email_status = "not_configured"
                logger.warning("SMTP is not configured; overdue email for task %s was not sent.", notification.task_id)
            else:
                try:
                    send_overdue_email(notification.task, manager_emails)
                    notification.email_status = "sent"
                except Exception:
                    notification.email_status = "failed"
                    logger.exception("Could not send overdue email for task %s.", notification.task_id)
            db.commit()
    except Exception:
        db.rollback()
        logger.exception("Could not check or create overdue task notifications.")
    finally:
        db.close()


def seed_demo_data() -> None:
    db = SessionLocal()
    try:
        if db.query(Meeting).count() > 0:
            return

        members = [
            TeamMember(name="Aisha Khan", role="Product Lead", email="aisha@meetgrow.io", team="Product", capacity=8, load=6),
            TeamMember(name="Leo Martinez", role="Frontend Engineer", email="leo@meetgrow.io", team="Engineering", capacity=9, load=7),
            TeamMember(name="Nina Patel", role="Design Lead", email="nina@meetgrow.io", team="Design", capacity=7, load=5),
            TeamMember(name="Omar Hassan", role="Engineering Manager", email="omar@meetgrow.io", team="Engineering", capacity=8, load=6),
        ]
        db.add_all(members)
        db.flush()

        seed_roles = [
            Role(name="Project owner", description="Owns scope, milestones, and delivery quality.", team_member_id=members[0].id),
            Role(name="Frontend engineer", description="Builds and ships the user experience for the application.", team_member_id=members[1].id),
            Role(name="Design lead", description="Shapes UI quality, accessibility, and interaction flows.", team_member_id=members[2].id),
            Role(name="Engineering manager", description="Coordinates planning, dependencies, execution, and staffing.", team_member_id=members[3].id),
        ]
        db.add_all(seed_roles)

        sample_meetings = [
            Meeting(
                title="Weekly product sync",
                date=datetime.utcnow().date().isoformat(),
                summary="Product team aligned on launch readiness and follow-up items for the client portal update.",
                participants="Aisha, Leo, Nina, Omar",
                transcript="Aisha: We need to finalize the launch checklist by Friday. Leo: I will complete the dashboard QA and share the bug list. Nina: I will review the mobile redesign and update the hero section. Omar: Please keep engineering capacity available for the API sync. We need a release candidate by next Wednesday.",
            ),
            Meeting(
                title="Roadmap planning",
                date="2026-10-15",
                summary="Team agreed on milestones for the AI workflow release and the customer onboarding automation sprint.",
                participants="Aisha, Leo, Nina",
                transcript="Aisha: The AI workflow release is the top priority this month. Leo: I will implement the transcript parser and merge it into the dashboard. Nina: I need design sign-off by October 18. Aisha: Please have the onboarding automation draft ready by October 20. Omar: We need to track the API integration tasks for QA.",
            ),
        ]
        db.add_all(sample_meetings)
        db.flush()

        db.add_all(
            [
                Task(title="Finalize launch checklist", description="Confirm launch blockers and sign-off items before Friday.", assignee="Aisha Khan", priority="high", status="in_progress", due_date="2026-10-08", role="Project owner", source="manual", meeting_id=sample_meetings[0].id),
                Task(title="Complete dashboard QA", description="Run end-to-end checks on the dashboard before the milestone review.", assignee="Leo Martinez", priority="high", status="todo", due_date="2026-10-09", role="Frontend engineer", source="manual", meeting_id=sample_meetings[0].id),
                Task(title="Update mobile hero section", description="Apply the final design revisions to the hero and navigation layout.", assignee="Nina Patel", priority="medium", status="todo", due_date="2026-10-11", role="Design lead", source="manual", meeting_id=sample_meetings[0].id),
                Task(title="Implement transcript parser", description="Ship the transcript ingestion and extraction pipeline for the AI dashboard.", assignee="Leo Martinez", priority="critical", status="in_progress", due_date="2026-10-18", role="Frontend engineer", source="manual", meeting_id=sample_meetings[1].id),
                Task(title="Design sign-off for AI workflow", description="Review and approve the workflow wireframes before release planning.", assignee="Nina Patel", priority="high", status="todo", due_date="2026-10-18", role="Design lead", source="manual", meeting_id=sample_meetings[1].id),
            ]
        )

        db.commit()
    finally:
        db.close()


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "message": "AI Meeting & Team Work Tracker backend is running."}


def account_response(account: UserAccount) -> dict[str, Any]:
    return {"id": account.id, "name": account.name, "email": account.email}


@app.post("/api/auth/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    email = payload.email.strip().lower()
    if db.query(UserAccount).filter(func.lower(UserAccount.email) == email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists.")

    account = UserAccount(name=payload.name.strip(), email=email, password_hash=hash_password(payload.password))
    db.add(account)
    db.flush()
    if account.id == 1:
        assign_legacy_workspace(db, account.id)
    saved_profile = db.query(UserProfile).filter(UserProfile.id == account.id).first()
    if saved_profile is None:
        saved_profile = UserProfile(
            id=account.id,
            name=account.name,
            email=account.email,
            role="Team member",
            team="My team",
            company="My company",
        )
        db.add(saved_profile)
    saved_profile.name = account.name
    saved_profile.email = account.email
    token = create_session(db, account)
    db.commit()
    db.refresh(account)
    return {"access_token": token, "token_type": "bearer", "user": account_response(account)}


@app.post("/api/auth/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    account = db.query(UserAccount).filter(UserAccount.email == payload.email.strip().lower()).first()
    if account is None or not verify_password(payload.password, account.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email or password is incorrect.")
    token = create_session(db, account)
    db.commit()
    return {"access_token": token, "token_type": "bearer", "user": account_response(account)}


@app.get("/api/auth/me")
def current_account(request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    account = db.query(UserAccount).filter(UserAccount.id == account_id_from_request(request)).first()
    if account is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account not found.")
    return account_response(account)


@app.post("/api/auth/logout")
def logout(request: Request, db: Session = Depends(get_db)) -> dict[str, str]:
    token = request.headers.get("Authorization", "").partition(" ")[2]
    session = db.query(AuthSession).filter(AuthSession.token_hash == token_digest(token)).first()
    if session:
        db.delete(session)
        db.commit()
    return {"message": "Signed out."}


@app.websocket("/api/rooms/{room_id}/ws/{peer_id}")
async def meeting_room_socket(websocket: WebSocket, room_id: str, peer_id: str) -> None:
    token = websocket.query_params.get("token", "")
    db = SessionLocal()
    try:
        session = db.query(AuthSession).filter(AuthSession.token_hash == token_digest(token)).first() if token else None
        if session is None or session.expires_at <= datetime.utcnow():
            await websocket.close(code=4401)
            return
    finally:
        db.close()
    await websocket.accept()
    room = room_connections.setdefault(room_id, {})
    existing_peers = list(room)
    room[peer_id] = websocket
    await websocket.send_json({"type": "peers", "peerIds": existing_peers})

    for peer_socket in list(room.values()):
        if peer_socket is not websocket:
            await peer_socket.send_json({"type": "peer-joined", "peerId": peer_id})

    try:
        while True:
            message = await websocket.receive_json()
            target = room.get(message.get("to"))
            if target is not None:
                await target.send_json({**message, "from": peer_id})
    except WebSocketDisconnect:
        room.pop(peer_id, None)
        for peer_socket in list(room.values()):
            await peer_socket.send_json({"type": "peer-left", "peerId": peer_id})
        if not room:
            room_connections.pop(room_id, None)


@app.get("/api/dashboard")
def dashboard(
    db: Session = Depends(get_db),
    account_id: int = Depends(account_id_from_request),
) -> dict[str, Any]:
    total_meetings = db.query(Meeting).filter(Meeting.owner_id == account_id).count()
    total_tasks = db.query(Task).filter(Task.owner_id == account_id).count()
    critical_tasks = db.query(Task).filter(Task.owner_id == account_id, Task.priority == "critical").count()
    completed_tasks = db.query(Task).filter(Task.owner_id == account_id, Task.status == "completed").count()
    current_week = db.query(Meeting).filter(Meeting.owner_id == account_id).order_by(Meeting.created_at.desc()).limit(3).all()

    team = db.query(TeamMember).filter(TeamMember.owner_id == account_id).all()
    workload = [{"name": member.name, "role": member.role, "load": member.load, "capacity": member.capacity} for member in team]

    upcoming = db.query(Task).filter(Task.owner_id == account_id, Task.status != "completed").order_by(Task.due_date.asc()).limit(4).all()
    return {
        "summary": {
            "totalMeetings": total_meetings,
            "totalTasks": total_tasks,
            "completedTasks": completed_tasks,
            "criticalTasks": critical_tasks,
        },
        "workload": workload,
        "recentMeetings": [
            {"id": meeting.id, "title": meeting.title, "summary": meeting.summary, "participants": meeting.participants}
            for meeting in current_week
        ],
        "upcomingTasks": [
            {"id": task.id, "title": task.title, "assignee": task.assignee, "priority": task.priority, "dueDate": task.due_date}
            for task in upcoming
        ],
    }


@app.post("/api/chat")
def chat_with_assistant(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    account_id: int = Depends(account_id_from_request),
) -> dict[str, str]:
    meetings = db.query(Meeting).filter(Meeting.owner_id == account_id).order_by(Meeting.created_at.desc()).limit(5).all()
    tasks = db.query(Task).filter(Task.owner_id == account_id, Task.status != "completed").order_by(Task.due_date.asc()).limit(10).all()
    members = db.query(TeamMember).filter(TeamMember.owner_id == account_id).all()
    context = {
        "recent_meetings": [
            {"title": meeting.title, "summary": meeting.summary, "participants": meeting.participants}
            for meeting in meetings
        ],
        "upcoming_tasks": [
            {
                "title": task.title,
                "assignee": task.assignee,
                "priority": task.priority,
                "due_date": task.due_date,
            }
            for task in tasks
        ],
        "team_workload": [
            {
                "name": member.name,
                "role": member.role,
                "load": member.load,
                "capacity": member.capacity,
            }
            for member in members
        ],
    }
    history = [
        {"role": item.role, "content": item.content}
        for item in reversed(
            db.query(AssistantMessage)
            .filter(AssistantMessage.owner_id == account_id)
            .order_by(AssistantMessage.created_at.desc())
            .limit(12)
            .all()
        )
    ]
    result = GeminiService.answer_question(payload.message, history, context)
    db.add_all(
        [
            AssistantMessage(owner_id=account_id, role="user", content=payload.message),
            AssistantMessage(owner_id=account_id, role="assistant", content=result["answer"]),
        ]
    )
    db.commit()
    return result


@app.get("/api/chat/history")
def get_chat_history(
    db: Session = Depends(get_db),
    account_id: int = Depends(account_id_from_request),
) -> list[dict[str, Any]]:
    messages = (
        db.query(AssistantMessage)
        .filter(AssistantMessage.owner_id == account_id)
        .order_by(AssistantMessage.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        {"role": message.role, "content": message.content, "createdAt": message.created_at.isoformat()}
        for message in reversed(messages)
    ]


@app.get("/api/meetings")
def list_meetings(
    db: Session = Depends(get_db),
    account_id: int = Depends(account_id_from_request),
) -> list[dict[str, Any]]:
    meetings = db.query(Meeting).filter(Meeting.owner_id == account_id).order_by(Meeting.created_at.desc()).all()
    return [
        {
            "id": meeting.id,
            "title": meeting.title,
            "summary": meeting.summary,
            "transcript": meeting.transcript,
            "participants": meeting.participants,
            "date": meeting.date,
            "createdAt": meeting.created_at.isoformat(),
        }
        for meeting in meetings
    ]


@app.post("/api/meetings/analyze")
def analyze_meeting(
    payload: TranscriptRequest,
    db: Session = Depends(get_db),
    account_id: int = Depends(account_id_from_request),
) -> dict[str, Any]:
    analysis = GeminiService.analyze_transcript(payload.transcript, title=payload.title)

    meeting = Meeting(
        title=payload.title,
        date=datetime.utcnow().date().isoformat(),
        summary=analysis.get("summary", payload.title),
        transcript=payload.transcript,
        participants=payload.participants or ", ".join(analysis.get("responsible_people", [])),
        owner_id=account_id,
    )
    db.add(meeting)
    db.flush()

    for task in analysis.get("tasks", []):
        db.add(
            Task(
                title=task.get("title", "Follow up on meeting action"),
                description=task.get("description", ""),
                assignee=task.get("assignee"),
                priority=task.get("priority", "medium"),
                status=task.get("status", "todo"),
                due_date=task.get("due_date"),
                role=task.get("role"),
                source=task.get("source", "ai"),
                meeting_id=meeting.id,
                owner_id=account_id,
            )
        )

    for role_name in analysis.get("roles", []):
        role = db.query(Role).filter(Role.owner_id == account_id, Role.name == role_name).first()
        if not role:
            db.add(Role(name=role_name, description=f"Role extracted during meeting review for {meeting.title}", owner_id=account_id))

    db.commit()
    db.refresh(meeting)

    return {"meeting": {"id": meeting.id, "title": meeting.title, "summary": meeting.summary, "date": meeting.date}, "analysis": analysis}


@app.get("/api/tasks")
def list_tasks(
    db: Session = Depends(get_db),
    account_id: int = Depends(account_id_from_request),
) -> list[dict[str, Any]]:
    tasks = db.query(Task).filter(Task.owner_id == account_id).order_by(Task.created_at.desc()).all()
    return [
        {
            "id": task.id,
            "title": task.title,
            "description": task.description,
            "assignee": task.assignee,
            "priority": task.priority,
            "status": task.status,
            "dueDate": task.due_date,
            "role": task.role,
            "source": task.source,
            "meetingId": task.meeting_id,
        }
        for task in tasks
    ]


@app.get("/api/notifications")
def list_notifications(
    db: Session = Depends(get_db),
    account_id: int = Depends(account_id_from_request),
) -> list[dict[str, Any]]:
    notifications = (
        db.query(TaskOverdueNotification)
        .filter(TaskOverdueNotification.owner_id == account_id)
        .options(joinedload(TaskOverdueNotification.task))
        .order_by(TaskOverdueNotification.created_at.desc())
        .limit(25)
        .all()
    )
    return [
        {
            "id": notification.id,
            "taskId": notification.task_id,
            "title": notification.task.title,
            "message": notification.message,
            "assignee": notification.task.assignee,
            "dueDate": notification.task.due_date,
            "createdAt": notification.created_at.isoformat(),
            "read": notification.read_at is not None,
            "emailStatus": notification.email_status,
            "emailRecipients": notification.email_recipients,
        }
        for notification in notifications
    ]


@app.post("/api/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    account_id: int = Depends(account_id_from_request),
) -> dict[str, Any]:
    notification = db.query(TaskOverdueNotification).filter(
        TaskOverdueNotification.id == notification_id,
        TaskOverdueNotification.owner_id == account_id,
    ).first()
    if notification is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found.")
    if notification.read_at is None:
        notification.read_at = datetime.utcnow()
        db.commit()
    return {"id": notification.id, "read": True}


@app.post("/api/tasks")
def create_task(
    payload: TaskSchema,
    db: Session = Depends(get_db),
    account_id: int = Depends(account_id_from_request),
) -> dict[str, Any]:
    task = Task(
        title=payload.title,
        description=payload.description or "",
        assignee=payload.assignee,
        priority=payload.priority,
        status=payload.status,
        due_date=payload.due_date,
        role=payload.role,
        source=payload.source or "manual",
        owner_id=account_id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return {
        "id": task.id,
        "title": task.title,
        "status": task.status,
        "priority": task.priority,
        "assignee": task.assignee,
        "dueDate": task.due_date,
    }


@app.delete("/api/tasks/completed")
def clear_completed_tasks(
    db: Session = Depends(get_db),
    account_id: int = Depends(account_id_from_request),
) -> dict[str, int]:
    completed_task_ids = [
        task_id
        for (task_id,) in db.query(Task.id).filter(
            Task.owner_id == account_id,
            Task.status == "completed",
        ).all()
    ]
    if not completed_task_ids:
        return {"deleted": 0}

    db.query(TaskOverdueNotification).filter(
        TaskOverdueNotification.owner_id == account_id,
        TaskOverdueNotification.task_id.in_(completed_task_ids),
    ).delete(synchronize_session=False)
    deleted = db.query(Task).filter(
        Task.owner_id == account_id,
        Task.id.in_(completed_task_ids),
    ).delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted}


@app.delete("/api/tasks")
def delete_all_tasks(
    payload: PasswordConfirmation,
    request: Request,
    db: Session = Depends(get_db),
) -> dict[str, int]:
    account_id = account_id_from_request(request)
    account = db.query(UserAccount).filter(UserAccount.id == account_id).first()
    if account is None or not verify_password(payload.password, account.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="The account password is incorrect.")

    task_ids = [
        task_id
        for (task_id,) in db.query(Task.id).filter(Task.owner_id == account_id).all()
    ]
    if not task_ids:
        return {"deleted": 0}

    db.query(TaskOverdueNotification).filter(
        TaskOverdueNotification.owner_id == account_id,
        TaskOverdueNotification.task_id.in_(task_ids),
    ).delete(synchronize_session=False)
    deleted = db.query(Task).filter(
        Task.owner_id == account_id,
        Task.id.in_(task_ids),
    ).delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted}


@app.patch("/api/tasks/{task_id}")
def update_task_progress(
    task_id: int,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    account_id: int = Depends(account_id_from_request),
) -> dict[str, Any]:
    task = db.query(Task).filter(Task.id == task_id, Task.owner_id == account_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if "status" in payload:
        task.status = payload["status"]
    if "assignee" in payload:
        task.assignee = payload["assignee"]
    if "priority" in payload:
        task.priority = payload["priority"]
    if "title" in payload:
        task.title = payload["title"]
    if "description" in payload:
        task.description = payload["description"]

    db.commit()
    return {"id": task.id, "title": task.title, "status": task.status, "assignee": task.assignee}


@app.get("/api/team")
def team(
    db: Session = Depends(get_db),
    account_id: int = Depends(account_id_from_request),
) -> list[dict[str, Any]]:
    members = db.query(TeamMember).filter(TeamMember.owner_id == account_id).all()
    return [
        {
            "id": member.id,
            "name": member.name,
            "role": member.role,
            "email": member.email,
            "team": member.team,
            "capacity": member.capacity,
            "load": member.load,
        }
        for member in members
    ]


@app.post("/api/team", status_code=status.HTTP_201_CREATED)
def create_team_member(
    payload: TeamMemberSchema,
    db: Session = Depends(get_db),
    account_id: int = Depends(account_id_from_request),
) -> dict[str, Any]:
    member = TeamMember(**payload.model_dump(), owner_id=account_id)
    db.add(member)
    db.commit()
    db.refresh(member)
    return {
        "id": member.id,
        "name": member.name,
        "role": member.role,
        "email": member.email,
        "team": member.team,
        "capacity": member.capacity,
        "load": member.load,
    }


@app.put("/api/team/{member_id}")
def update_team_member(
    member_id: int,
    payload: TeamMemberSchema,
    db: Session = Depends(get_db),
    account_id: int = Depends(account_id_from_request),
) -> dict[str, Any]:
    member = db.query(TeamMember).filter(
        TeamMember.id == member_id,
        TeamMember.owner_id == account_id,
    ).first()
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team member not found.")
    for field, value in payload.model_dump().items():
        setattr(member, field, value)
    db.commit()
    return {"id": member.id, **payload.model_dump()}


@app.delete("/api/team/{member_id}")
def delete_team_member(
    member_id: int,
    db: Session = Depends(get_db),
    account_id: int = Depends(account_id_from_request),
) -> dict[str, int]:
    member = db.query(TeamMember).filter(
        TeamMember.id == member_id,
        TeamMember.owner_id == account_id,
    ).first()
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team member not found.")
    db.query(Role).filter(
        Role.team_member_id == member_id,
        Role.owner_id == account_id,
    ).update({Role.team_member_id: None}, synchronize_session=False)
    db.delete(member)
    db.commit()
    return {"deleted": 1}


@app.get("/api/roles")
def list_roles(
    db: Session = Depends(get_db),
    account_id: int = Depends(account_id_from_request),
) -> list[dict[str, Any]]:
    roles = db.query(Role).filter(Role.owner_id == account_id).all()
    return [{"id": role.id, "name": role.name, "description": role.description, "teamMemberId": role.team_member_id} for role in roles]


@app.post("/api/roles", status_code=status.HTTP_201_CREATED)
def create_role(
    payload: RoleSchema,
    db: Session = Depends(get_db),
    account_id: int = Depends(account_id_from_request),
) -> dict[str, Any]:
    if payload.team_member_id is not None:
        member_exists = db.query(TeamMember.id).filter(
            TeamMember.id == payload.team_member_id,
            TeamMember.owner_id == account_id,
        ).first()
        if member_exists is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Selected team member not found.")
    role = Role(**payload.model_dump(), owner_id=account_id)
    db.add(role)
    db.commit()
    db.refresh(role)
    return {"id": role.id, "name": role.name, "description": role.description, "teamMemberId": role.team_member_id}


@app.put("/api/roles/{role_id}")
def update_role(
    role_id: int,
    payload: RoleSchema,
    db: Session = Depends(get_db),
    account_id: int = Depends(account_id_from_request),
) -> dict[str, Any]:
    role = db.query(Role).filter(Role.id == role_id, Role.owner_id == account_id).first()
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found.")
    if payload.team_member_id is not None:
        member_exists = db.query(TeamMember.id).filter(
            TeamMember.id == payload.team_member_id,
            TeamMember.owner_id == account_id,
        ).first()
        if member_exists is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Selected team member not found.")
    for field, value in payload.model_dump().items():
        setattr(role, field, value)
    db.commit()
    return {"id": role.id, "name": role.name, "description": role.description, "teamMemberId": role.team_member_id}


@app.delete("/api/roles/{role_id}")
def delete_role(
    role_id: int,
    db: Session = Depends(get_db),
    account_id: int = Depends(account_id_from_request),
) -> dict[str, int]:
    role = db.query(Role).filter(Role.id == role_id, Role.owner_id == account_id).first()
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found.")
    db.delete(role)
    db.commit()
    return {"deleted": 1}


def serialize_profile(profile: UserProfile) -> dict[str, Any]:
    return {
        "name": profile.name,
        "email": profile.email,
        "phone": profile.phone,
        "role": profile.role,
        "team": profile.team,
        "company": profile.company,
        "timezone": profile.timezone,
        "photo": profile.photo,
        "avatar": "".join(part[0] for part in profile.name.split()[:2]).upper(),
    }


@app.get("/api/profile")
def profile(
    db: Session = Depends(get_db),
    account_id: int = Depends(account_id_from_request),
) -> dict[str, Any]:
    account_profile = (
        db.query(UserAccount, UserProfile)
        .outerjoin(UserProfile, UserProfile.id == UserAccount.id)
        .filter(UserAccount.id == account_id)
        .first()
    )
    if account_profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found.")
    account, saved_profile = account_profile
    if saved_profile is None:
        saved_profile = UserProfile(
            id=account_id,
            name=account.name,
            email=account.email,
            role="Team member",
            team="My team",
            company="My company",
        )
        db.add(saved_profile)
        db.commit()
    result = serialize_profile(saved_profile)
    result["name"] = account.name
    result["email"] = account.email
    return result


@app.put("/api/profile")
def update_profile(
    payload: UserProfileSchema,
    db: Session = Depends(get_db),
    account_id: int = Depends(account_id_from_request),
) -> dict[str, Any]:
    account_profile = (
        db.query(UserAccount, UserProfile)
        .outerjoin(UserProfile, UserProfile.id == UserAccount.id)
        .filter(UserAccount.id == account_id)
        .first()
    )
    if account_profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found.")
    account, saved_profile = account_profile
    if saved_profile is None:
        saved_profile = UserProfile(
            id=account_id,
            name=account.name,
            email=account.email,
        )
        db.add(saved_profile)

    for field, value in payload.model_dump().items():
        setattr(saved_profile, field, value)

    account.name = payload.name
    saved_profile.name = account.name
    saved_profile.email = account.email
    db.commit()
    return serialize_profile(saved_profile)


@app.get("/api/settings")
def settings_data(
    db: Session = Depends(get_db),
    account_id: int = Depends(account_id_from_request),
) -> dict[str, Any]:
    saved = db.query(WorkspaceSettings).filter(WorkspaceSettings.owner_id == account_id).first()
    return serialize_settings(saved)


def serialize_settings(saved: WorkspaceSettings | None) -> dict[str, Any]:
    if saved is None:
        return {"theme": "light", "notifications": True, "aiSummary": True, "defaultExport": "PDF"}
    return {
        "theme": saved.theme,
        "notifications": saved.notifications,
        "aiSummary": saved.ai_summary,
        "defaultExport": saved.default_export,
    }


@app.put("/api/settings")
def update_settings(
    payload: WorkspaceSettingsSchema,
    db: Session = Depends(get_db),
    account_id: int = Depends(account_id_from_request),
) -> dict[str, Any]:
    saved = db.query(WorkspaceSettings).filter(WorkspaceSettings.owner_id == account_id).first()
    if saved is None:
        saved = WorkspaceSettings(owner_id=account_id)
        db.add(saved)
    saved.theme = payload.theme
    saved.notifications = payload.notifications
    saved.ai_summary = payload.aiSummary
    saved.default_export = payload.defaultExport
    db.commit()
    return serialize_settings(saved)
