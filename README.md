# DentaCRM Backend

Django 5 + DRF backend for the DentaCRM system.

## Local development (inside Docker)

From the ``dentacrm/`` project root:

```bash
docker compose up --build
```

The backend container will:

1. Wait for Postgres/Redis/MinIO health checks
2. Run ``python manage.py migrate --noinput``
3. Start ``python manage.py runserver 0.0.0.0:8000``

Then open:

- API root: <http://localhost:8000/>
- Swagger UI: <http://localhost:8000/api/docs/>
- ReDoc: <http://localhost:8000/api/redoc/>
- OpenAPI schema: <http://localhost:8000/api/schema/>
- Admin: <http://localhost:8000/admin/>
- Health: <http://localhost:8000/healthz/>

## Local development (outside Docker)

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip setuptools wheel
pip install -r requirements/dev.txt

cp .env.example .env   # adjust as needed
export DJANGO_SETTINGS_MODULE=config.settings.dev

python manage.py migrate
python manage.py runserver
```

Without a Postgres available, ``config.settings.base`` falls back to
SQLite so ``manage.py check`` / ``migrate`` still work.

## Layout

```
backend/
├── config/
│   ├── settings/
│   │   ├── base.py
│   │   ├── dev.py
│   │   └── prod.py
│   ├── celery.py
│   ├── urls.py
│   ├── wsgi.py
│   └── asgi.py
├── apps/                # business apps (added per task)
├── tests/               # cross-app smoke tests
├── manage.py
├── pyproject.toml       # ruff + mypy config
├── pytest.ini
└── requirements/
    ├── base.txt
    ├── dev.txt
    └── prod.txt
```

## Tests

```bash
pytest -q
```

## Linting / typing

```bash
ruff check .
ruff format --check .
mypy .
```
