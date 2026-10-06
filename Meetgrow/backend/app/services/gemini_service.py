import json
import re
from typing import Any, Dict, List

from google import genai

from app.config import settings


class GeminiService:
    @staticmethod
    def answer_question(message: str, history: List[Dict[str, str]], context: Dict[str, Any]) -> Dict[str, str]:
        if settings.GEMINI_API_KEY:
            try:
                client = genai.Client(api_key=settings.GEMINI_API_KEY)
                conversation = "\n".join(
                    f"{item['role']}: {item['content']}" for item in history[-12:]
                )
                prompt = f"""
                You are Meetgrow AI, a friendly assistant inside an AI meeting and team task tracker.
                Give practical, concise answers about this app, video meetings, meeting summaries,
                tasks, deadlines, team workload, and roles. Do not claim to take actions or access
                information beyond the context below. For meeting questions, explain that users can
                open Meetings, select New meeting, allow camera/microphone access, then share the
                invite link or room code. A room code only connects participants when the app server
                is running and is shared with them.

                Current workspace data:
                {json.dumps(context, ensure_ascii=False)}

                Recent conversation:
                {conversation}

                User question: {message}
                """
                response = client.models.generate_content(
                    model="gemini-2.0-flash",
                    contents=prompt,
                )
                answer = (response.text or "").strip()
                if answer:
                    return {"answer": answer, "source": "gemini", "notice": ""}
                failure_notice = "Gemini returned an empty reply; showing built-in help instead."
            except Exception:
                failure_notice = "Gemini is unavailable right now; showing built-in help instead."
        else:
            failure_notice = "Add a Gemini API key to the backend .env file for generative answers. Built-in help is available meanwhile."

        answer = GeminiService._fallback_answer(message, context)
        return {"answer": answer, "source": "built_in", "notice": failure_notice}

    @staticmethod
    def _fallback_answer(message: str, context: Dict[str, Any]) -> str:
        question = message.lower()
        if any(term in question for term in ["join", "invite", "room code", "video", "call", "meeting room", "camera", "mic"]):
            return (
                "To start a call, open Meetings and choose New meeting. Allow camera and microphone "
                "access, then use Copy invite link to share the room. Teammates can open the link or "
                "enter the room code under Join a meeting. Keep the app and backend running while you call."
            )
        if any(term in question for term in ["task", "deadline", "due", "priority", "action item"]):
            tasks = context.get("upcoming_tasks", [])
            if not tasks:
                return "There are no open tasks in the workspace right now. You can add one from the Tasks page or analyze a transcript to extract action items."
            task_lines = [
                f"- {task['title']} — {task.get('assignee') or 'Unassigned'}, {task.get('priority')} priority, due {task.get('due_date') or 'not set'}"
                for task in tasks[:5]
            ]
            return "Here are the next open tasks:\n" + "\n".join(task_lines)
        if any(term in question for term in ["team", "workload", "busy", "capacity"]):
            members = context.get("team_workload", [])
            if not members:
                return "No team workload data is available yet. Add team members to see capacity here."
            lines = [f"- {person['name']} ({person['role']}): {person['load']}/{person['capacity']} capacity" for person in members]
            return "Current team workload:\n" + "\n".join(lines)
        if any(term in question for term in ["summary", "recent meeting", "what happened", "meeting notes"]):
            meetings = context.get("recent_meetings", [])
            if not meetings:
                return "There are no saved meetings yet. Add a transcript on the Meetings page to get an AI summary and action items."
            return "Recent meeting notes:\n" + "\n".join(
                f"- {meeting['title']}: {meeting['summary']}" for meeting in meetings[:3]
            )
        return (
            "I can help you start or join a video meeting, understand recent meeting summaries, "
            "find action items and deadlines, or check team workload. Try asking “How do I invite "
            "my team to a call?” or “What tasks are due next?”"
        )

    @staticmethod
    def analyze_transcript(transcript: str, title: str = "Untitled Meeting") -> Dict[str, Any]:
        if settings.GEMINI_API_KEY:
            try:
                client = genai.Client(api_key=settings.GEMINI_API_KEY)
                prompt = f"""
                Analyze the following meeting transcript and return valid JSON only.
                Extract only action items that someone explicitly committed to or was assigned.
                Do not invent tasks or turn general discussion into action items. If there are no
                clear action items, return an empty tasks array.
                Required JSON shape:
                {{
                  "summary": "short meeting summary",
                  "notes": ["key bullet 1", "key bullet 2"],
                  "tasks": [
                    {{
                      "title": "Task title",
                      "description": "context",
                      "assignee": "person name if mentioned",
                      "priority": "low|medium|high|critical",
                      "status": "todo|in_progress|completed",
                      "due_date": "YYYY-MM-DD or null",
                      "role": "role if mentioned",
                      "source": "ai"
                    }}
                  ],
                  "roles": ["role 1", "role 2"],
                  "deadlines": ["2025-01-14 - final design review"],
                  "responsible_people": ["Alice", "Sam"]
                }}

                Title: {title}
                Transcript:
                {transcript}
                """
                response = client.models.generate_content(
                    model="gemini-2.0-flash",
                    contents=prompt,
                )
                content = response.text.strip()
                if content.startswith("```"):
                    content = content.replace("```json", "").replace("```", "").strip()
                return json.loads(content)
            except Exception:
                pass

        return GeminiService._fallback_analysis(transcript, title)

    @staticmethod
    def _fallback_analysis(transcript: str, title: str) -> Dict[str, Any]:
        sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", transcript.strip()) if part.strip()]
        summary = " ".join(sentences[:2]) if sentences else f"Meeting review for {title}."
        notes = [sentence for sentence in sentences[:4]]

        tasks: List[Dict[str, Any]] = []
        seen_titles = set()

        for sentence in sentences:
            candidate = GeminiService._build_task_from_sentence(sentence)
            if candidate is None:
                continue
            title_key = candidate["title"].lower()
            if title_key in seen_titles:
                continue
            tasks.append(candidate)
            seen_titles.add(title_key)

        deadlines = GeminiService._extract_deadlines(transcript)
        roles = GeminiService._extract_roles(transcript, tasks)
        responsible_people = sorted({item["assignee"] for item in tasks if item.get("assignee")})

        return {
            "summary": summary,
            "notes": notes,
            "tasks": tasks,
            "roles": roles,
            "deadlines": deadlines,
            "responsible_people": responsible_people,
        }

    @staticmethod
    def _build_task_from_sentence(sentence: str) -> Dict[str, Any] | None:
        lowered = sentence.lower()
        if not any(keyword in lowered for keyword in ["need", "must", "will", "can", "please", "action", "follow up", "review", "complete", "send", "draft", "prepare", "update", "fix", "launch", "ship", "sync", "assign", "owner"]):
            return None

        speaker_match = re.match(r"^([A-Z][A-Za-z.-]+(?:\s+[A-Z][A-Za-z.-]+)?)\s*:\s*(.+)$", sentence)
        if speaker_match:
            assignee = speaker_match.group(1).strip()
            task_text = speaker_match.group(2).strip()
        else:
            assignee = GeminiService._infer_assignee(sentence)
            task_text = sentence.strip()

        assigned_match = re.search(r"(?:assigned to|for|owner is|owned by)\s+([A-Z][A-Za-z.-]+(?:\s+[A-Z][A-Za-z.-]+)?)", sentence)
        if assigned_match:
            assignee = assigned_match.group(1).strip()

        task_title = GeminiService._extract_task_title(task_text)
        if not task_title:
            task_title = sentence[:90].rstrip(".")
        due_date = GeminiService._extract_deadline(task_text) or GeminiService._extract_deadline(sentence)
        priority = GeminiService._infer_priority(task_text)
        return {
            "title": task_title,
            "description": task_text,
            "assignee": assignee,
            "priority": priority,
            "status": "todo",
            "due_date": due_date,
            "role": GeminiService._infer_role(task_text, assignee),
            "source": "ai",
        }

    @staticmethod
    def _extract_task_title(task_text: str) -> str:
        patterns = [
            r"(?:will|can|should|must|please|need to|needs to|let's|let us)\s+(.*?)(?=(?:by\s+|due\s+|on\s+\d{4}|\b(?:tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b)|$)",
            r"(?:follow up on|review|complete|prepare|draft|update|fix|launch|ship|sync|send)\s+(.*?)(?=(?:by\s+|due\s+|on\s+\d{4}|\b(?:tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b)|$)",
        ]
        for pattern in patterns:
            match = re.search(pattern, task_text, flags=re.IGNORECASE)
            if match:
                title = match.group(1).strip().rstrip(".")
                if title:
                    return title[:100]
        return task_text[:100].rstrip(".")

    @staticmethod
    def _infer_priority(sentence: str) -> str:
        lowered = sentence.lower()
        if any(term in lowered for term in ["urgent", "asap", "critical", "blocker", "immediately", "release candidate", "launch blocker"]):
            return "critical"
        if any(term in lowered for term in ["high priority", "important", "deadline", "launch", "release", "client", "demo" ]):
            return "high"
        if any(term in lowered for term in ["soon", "next", "review", "prototype", "follow up", "finalize"]):
            return "medium"
        return "low"

    @staticmethod
    def _infer_assignee(sentence: str) -> str | None:
        candidates = [
            "Aisha", "Leo", "Nina", "Omar", "Alice", "Sam", "Priya", "Daniel", "Chris", "Maya",
            "Jordan", "Alex", "Leah", "Harper", "Jamie", "Taylor"
        ]
        for name in candidates:
            if re.search(rf"\b{name}\b", sentence, flags=re.IGNORECASE):
                return name
        speaker_match = re.search(r"^([A-Z][A-Za-z.-]+(?:\s+[A-Z][A-Za-z.-]+)?)\s*:", sentence)
        if speaker_match:
            return speaker_match.group(1)
        return None

    @staticmethod
    def _infer_role(task_text: str, assignee: str | None) -> str:
        lowered = task_text.lower()
        if any(term in lowered for term in ["design", "ui", "ux", "wireframe", "hero", "mockup", "figma"]):
            return "Design lead"
        if any(term in lowered for term in ["api", "backend", "database", "service", "server", "integration", "deployment"]):
            return "Engineering manager"
        if any(term in lowered for term in ["launch", "roadmap", "scope", "milestone", "decision", "review"]):
            return "Project owner"
        if assignee:
            return "Team contributor"
        return "Project lead"

    @staticmethod
    def _extract_deadline(sentence: str) -> str | None:
        date_match = re.search(r"(\d{4}-\d{2}-\d{2})", sentence)
        if date_match:
            return date_match.group(1)

        week_day_match = re.search(r"\b(?:by|before|due|on|for)\s+(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow)\b", sentence, flags=re.IGNORECASE)
        if week_day_match:
            return week_day_match.group(0).strip()
        return None

    @staticmethod
    def _extract_deadlines(transcript: str) -> List[str]:
        deadlines = []
        for sentence in re.split(r"(?<=[.!?])\s+", transcript):
            match = GeminiService._extract_deadline(sentence)
            if match:
                deadlines.append(f"{match} - {sentence.strip()[:80]}")
        return deadlines[:5]

    @staticmethod
    def _extract_roles(transcript: str, tasks: List[Dict[str, Any]]) -> List[str]:
        roles = []
        if any("design" in sentence.lower() for sentence in re.split(r"(?<=[.!?])\s+", transcript)):
            roles.append("Design review")
        if any("api" in sentence.lower() or "backend" in sentence.lower() for sentence in re.split(r"(?<=[.!?])\s+", transcript)):
            roles.append("Engineering owner")
        if any("launch" in sentence.lower() or "roadmap" in sentence.lower() for sentence in re.split(r"(?<=[.!?])\s+", transcript)):
            roles.append("Project owner")
        for task in tasks:
            role = task.get("role")
            if role and role not in roles:
                roles.append(role)
        return roles[:6]
