import asyncio
from app.config import settings

# Bounded in-memory queue. Consumed by WriterService
ingestion_queue: asyncio.Queue = asyncio.Queue(maxsize=settings.queue_max_size)