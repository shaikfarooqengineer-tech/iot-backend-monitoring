#  ══════════════════════════════════════════════════════════════════════════════
# FILE: backend/app/main.py
#  ══════════════════════════════════════════════════════════════════════════════

import asyncio
from fastapi import FastAPI
from app.db.mongo import mongo_manager
from app.db.valkey_client import valkey_manager
from app.mqtt.consumer import mqtt_consumer
from app.services.ingest_service import ingestion_queue
from app.services.writer import writer_service
from app.utils.logger import logger

app = FastAPI(
    title="Hospital MQTT Ingestion Backend",
    version="1.0.0"
)

@app.get("/health")
async def health():
    return {
        "status": "running",
        "mqtt_connected": mqtt_consumer.connected,
        "queue_size": ingestion_queue.qsize(),
        "queue_max_size": ingestion_queue.maxsize,
<<<<<<< HEAD
        "mongo_connected": (
            mongo_manager.client is not None
        ),
        # pyrefly: ignore [parse-error]
=======
        "mongo_connected": (mongo_manager.client is not None),
>>>>>>> cd28364c17ac2aaabbb6853365379f34badc6f4e
        "valkey_connected": (valkey_manager.client is not None)
    }

@app.on_event("startup")
async def startup_event():
    """Application startup lifecycle."""
    logger.info("Initializing Hospital MQTT Ingestion Server...")
    startup_start = asyncio.get_event_loop().time()
    
    # 1. Connect MongoDB
    logger.info("Step 1: Connecting MongoDB...")
    mongo_manager.connect()
    mongo_ok = await mongo_manager.ping()
    if not mongo_ok:
        logger.warning("MongoDB is uninitialized or unreachable. Datastore writes will fail.")
        
    # 2. Connect Valkey Connection Pool
    logger.info("Step 2: Connecting Valkey Connection Pool...")
    valkey_manager.connect()
    valkey_ok = await valkey_manager.ping()
    if not valkey_ok:
        logger.warning("Valkey is unreachable. Real-time pub/sub notifications will be skipped.")
        
    # 3. Start background writer consumer task
    logger.info("Step 3: Starting WriterService background worker...")
    writer_service.start()
    
    # 4. Connect MQTT Broker and subscribe
    logger.info("Step 4: Connecting MQTT Broker...")
    await mqtt_consumer.start()
    
    startup_duration = asyncio.get_event_loop().time() - startup_start
    logger.info(f"Hospital Ingestion Server startup steps completed in {startup_duration:.2f}s.")

@app.on_event("shutdown")
async def shutdown_event():
    """Application shutdown lifecycle."""
<<<<<<< HEAD

    # 1. Stop incoming MQTT packets (MQTT Disconnect)
=======
    logger.info("Shutting down Hospital MQTT Ingest Server...")
    
    # 1. Stop incoming MQTT packets (MQTT Disconnect)
    logger.info("Step 1: Disconnecting MQTT client...")
>>>>>>> cd28364c17ac2aaabbb6853365379f34badc6f4e
    await mqtt_consumer.stop()
    
    # 2. Drain Queue
    logger.info("Step 2: Draining ingestion queue...")
    try:
        # Wait up to 5 seconds for the queue to drain
        await asyncio.wait_for(ingestion_queue.join(), timeout=5.0)
        logger.info("Ingestion queue drained successfully.")
    except asyncio.TimeoutError:
        logger.warning(f"Ingestion queue drain timed out. {ingestion_queue.qsize()} events dropped.")
    
    # 3. Halt background persistence workers (Stop WriterService)
    logger.info("Step 3: Stopping WriterService background worker...")
    await writer_service.stop()
    
    # 4. Disconnect connection pools (Close Valkey, Close Mongo)
    logger.info("Step 4: Closing database connection pools...")
    await valkey_manager.close()
    await mongo_manager.close()
    
    logger.info("Hospital Ingestion Server shutdown finalized clean.")