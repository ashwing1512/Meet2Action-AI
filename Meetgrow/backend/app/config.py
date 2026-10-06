import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


class Settings:
    APP_NAME = "AI Meeting & Team Work Tracker"
    API_V1_STR = "/api"
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./app.db")
    SMTP_HOST = os.getenv("SMTP_HOST", "")
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM = os.getenv("SMTP_FROM", "")
    SMTP_STARTTLS = os.getenv("SMTP_STARTTLS", "true").lower() == "true"


settings = Settings()
