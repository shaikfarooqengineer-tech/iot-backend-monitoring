import asyncio

from fastapi import FastAPI

from app.db.mongo import mongo_manager
from app.mqtt.consumer import mqtt_consumer
from app.services.ingest_service import ingestion_queue
from app.services.writer import writer_service
from app.utils.logger import logger

app = FastAPI(
    title="Hospital MQTT Ingestion Backend",
    version="1.0.0"
)

writer_task = None


@app.get("/health")
async def health():
    return {
        "status": "running",
        "mqtt_connected": mqtt_consumer.connected,
        "queue_size": ingestion_queue.qsize(),
        "queue_max_size": ingestion_queue.maxsize,
        "mongo_connected": (
            mongo_manager.client is not None
        )
    }


@app.on_event("startup")
async def startup_event():
    """
    Application startup lifecycle.
    """

    global writer_task

    logger.info("Application starting...")

    # Mongo
    await mongo_manager.connect()

    # MQTT
    await mqtt_consumer.connect()

    # Writer Service
    writer_task = asyncio.create_task(
        writer_service.start()
    )

    logger.info("Startup completed")


@app.on_event("shutdown")
async def shutdown_event():
    """
    Application shutdown lifecycle.
    """

    logger.info("Application shutting down...")

    # Stop writer
    await writer_service.stop()

    # Cancel task
    if writer_task:
        writer_task.cancel()
        try:
            await writer_task

        except asyncio.CancelledError:
            logger.info(
                "Writer task cancelled cleanly"
            )

    # MQTT
    await mqtt_consumer.disconnect()

    # Mongo
    await mongo_manager.disconnect()

    logger.info("Shutdown completed")