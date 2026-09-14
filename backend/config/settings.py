"""
EthioHire — Django settings.

Stack: Django REST Framework + PostgreSQL.
Auth: dual-mode — Firebase ID tokens (Bearer) or demo HMAC-signed session
cookie, exactly mirroring the original Next.js implementation.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_env_file(path: Path) -> None:
    """Tiny dependency-free .env loader.

    - KEY=VALUE lines only; '#' comment lines and blank lines are skipped.
    - Values are taken verbatim (no inline-comment stripping) so JSON blobs
      such as FIREBASE_SERVICE_ACCOUNT_JSON survive intact.
    - Surrounding single/double quotes are stripped.
    - NEVER overrides variables already present in the real environment, so
      docker-compose / platform env injection keeps precedence.
    """
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export "):].strip()
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        if key and key not in os.environ:
            os.environ[key] = value


# Load the repo-root .env first, then backend/.env (more specific wins for
# keys not already in the real environment).
_load_env_file(BASE_DIR.parent / ".env")
_load_env_file(BASE_DIR / ".env")

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "ethiohire-django-dev-secret-change-in-production")
AUTH_SECRET = os.environ.get("AUTH_SECRET", "ethiohire-dev-secret-change-in-production")

DEBUG = os.environ.get("DJANGO_DEBUG", "1") != "0"
ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "eh",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    # Firebase signInWithPopup needs opener/popup in the same browsing
    # context group (see config/middleware.py for the full rationale).
    "config.middleware.COOPHeaderMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": []},
    }
]

WSGI_APPLICATION = "config.wsgi.application"

# ---- Database: PostgreSQL ----
# Default matches scripts/start_postgres.py; override with env (PGHOST etc.)
# in docker-compose / Render deployments.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("PGDATABASE", "ethiohire"),
        "USER": os.environ.get("PGUSER", "ethiohire"),
        "PASSWORD": os.environ.get("PGPASSWORD", "ethiohire"),
        "HOST": os.environ.get("PGHOST", "127.0.0.1"),
        "PORT": os.environ.get("PGPORT", "5432"),
        "CONN_MAX_AGE": 0,
    }
}

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": [],
    "UNAUTHENTICATED_USER": None,
}

# Allow base64 webcam snapshots (up to ~4MB) inside JSON bodies
DATA_UPLOAD_MAX_MEMORY_SIZE = 12 * 1024 * 1024

CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
