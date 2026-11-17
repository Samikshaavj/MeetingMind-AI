import os
from celery import Celery
from dotenv import load_dotenv

# Load our .env file to get the Redis URL
load_dotenv()
REDIS_URL = os.getenv("REDIS_URL")

if not REDIS_URL:
    raise ValueError("No REDIS_URL found in .env file!")

# Initialize the Celery application
celery_engine = Celery(
    "meetingmind_worker",
    broker=REDIS_URL,
    backend=REDIS_URL
)

# Configuration for reliability
celery_engine.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    broker_connection_retry_on_startup=True
)

# This tells Celery where to look for the AI tasks
celery_engine.autodiscover_tasks(["core"])