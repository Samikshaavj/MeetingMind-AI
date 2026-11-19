#!/usr/bin/env bash
python -m celery -A core.celery_app.celery_engine worker --loglevel=info --concurrency=1 &
uvicorn main:app --host 0.0.0.0 --port $PORT