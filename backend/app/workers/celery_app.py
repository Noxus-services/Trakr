from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "trakr_prospector",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/Paris",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    beat_schedule={
        "process-sequences-hourly": {
            "task": "app.workers.tasks.task_process_sequences",
            "schedule": 3600.0,  # every hour
        },
    },
)
