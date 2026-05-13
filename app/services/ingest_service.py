import asyncio

from app.config import settings

# Central ingestion queue
# MQTT pushes telemetry here
# Writer service consumes from here

ingestion_queue: asyncio.Queue = asyncio.Queue(
    maxsize=settings.queue_max_size
)