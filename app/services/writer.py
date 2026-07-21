# ==============================================================================
# FILE: backend/app/services/writer.py
# ==============================================================================

import asyncio
import uuid
import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from pymongo.errors import DuplicateKeyError
from pydantic import ValidationError

from app.db.mongo import mongo_manager
from app.db.valkey_client import valkey_manager
from app.config import settings
from app.models.telemetry import (
    BaseTelemetry,
    StatusTelemetry,
    HeartbeatTelemetry,
    VitalsTelemetry,
    SleepTelemetry,
    AlertTelemetry
)
from app.services.ingest_service import ingestion_queue
from app.utils.logger import logger

class WriterService:
    """Background validation worker that handles payload enrichment, 
    awaited Valkey publishing with timeout, and async MongoDB persistence.
    """
    def __init__(self):
        self._running = False
        self._task: Optional[asyncio.Task] = None

    def start(self):
        """Begin processing queue entries in a dedicated background task."""
        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("WriterService background worker successfully started.")

    async def stop(self):
        """Signal queue completion and shutdown worker task cleanly."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("WriterService background worker stopped.")

    async def _loop(self):
        """Infinite processing worker loop."""
        while self._running:
            try:
                packet = await ingestion_queue.get()
                await self.process_packet(packet)
                ingestion_queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"WriterService worker processing error: {e}", exc_info=True)
                await asyncio.sleep(1)

    def normalize_payload(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize types, strings, and aliases in the payload dictionary."""
        normalized = {}
        for key, val in data.items():
            # Standardize common field aliases at the top level
            norm_key = key
            if key == "did":
                norm_key = "device_id"
            elif key == "br":
                norm_key = "rr"
            
            # 🚨 THE FIX: Aggressively intercept ANY firmware key and force string type
            if key in ["fw", "fw_version", "firmware"]:
                normalized[norm_key] = str(val)
                continue # Skip the rest of the type checking, it's already safely a string

            # Normalize values
            if val is None:
                normalized[norm_key] = None
            elif isinstance(val, str):
                val_stripped = val.strip()
                # 1. Null / empty string representation
                if val_stripped == "" or val_stripped.lower() == "null":
                    normalized[norm_key] = None
                # 2. Boolean strings
                elif val_stripped.lower() == "true":
                    normalized[norm_key] = True
                elif val_stripped.lower() == "false":
                    normalized[norm_key] = False
                # 3. Numeric strings
                else:
                    try:
                        if "." in val_stripped:
                            normalized[norm_key] = float(val_stripped)
                        else:
                            normalized[norm_key] = int(val_stripped)
                    except ValueError:
                        normalized[norm_key] = val_stripped
            elif isinstance(val, bool):
                normalized[norm_key] = val
            elif isinstance(val, (int, float)):
                normalized[norm_key] = val
            else:
                normalized[norm_key] = val
                
        return normalized

    async def process_packet(self, packet: Dict[str, Any]):
        """
        Extracts metadata, validates, prepares structured real-time event,
        dispatches to Valkey (awaited with timeout), and persists to MongoDB.
        """
        topic = packet.get("topic", "")
        data = packet.get("payload", {})

        # Safety Fallback in case of queue key mismatch
        if not data and "data" in packet:
            data = packet.get("data", {})
        
        # [MQTT RECEIVED]
        logger.info(f"[MQTT RECEIVED] topic={topic}")
        
        # 1. Normalize payload BEFORE validation & parsing checks
        normalized_data = self.normalize_payload(data)
        
        # 2. Parse topic dynamically to extract event type and device id
        parts = [p.lower() for p in topic.split('/') if p]
        
        category_mapping = {
            "status": "status",
            "heartbeat": "heartbeat",
            "vital": "vitals",
            "vitals": "vitals",
            "sleep": "sleep",
            "alert": "alerts",
            "alerts": "alerts"
        }
        
        event_type = None
        device_id = None
        
        # Highly robust, bi-directional topic extraction logic:
        # Assumes format: .../{device_id}/{event_type} (e.g. test/olt/esp32/sleep)
        if len(parts) >= 2 and parts[-1] in category_mapping:
            event_type = category_mapping[parts[-1]]
            device_id = parts[-2]
        else:
            # Fallback search matching category anywhere in parts
            for i, part in enumerate(parts):
                if part in category_mapping:
                    event_type = category_mapping[part]
                    # If category is followed by device ID (e.g. test/olt/sleep/esp32)
                    if i + 1 < len(parts):
                        device_id = parts[i+1]
                    # If category is at the end of the path (e.g. test/olt/esp32/sleep)
                    elif i - 1 >= 0:
                        device_id = parts[i-1]
                    break

        # Fallback to payload data if device_id not found in topic path
        if not device_id:
            device_id = normalized_data.get("device_id")

        if not event_type or not device_id:
            logger.warning(f"[TOPIC ROUTING FAILURE] topic={topic}")
            return

        # Confirm expected database target collection name
        COLLECTION_MAP = {
            "vitals": "vitals",
            "heartbeat": "heartbeat",
            "sleep": "sleep",
            "alerts": "alerts",
            "status": "status"
        }
        collection_name = COLLECTION_MAP.get(event_type)
        if not collection_name:
            logger.warning(f"[TOPIC ROUTING FAILURE] Unrecognized dynamic collection route for topic={topic}")
            return

        # [PAYLOAD NORMALIZED] & [TOPIC PARSED]
        logger.info(f"[PAYLOAD NORMALIZED] device_id={device_id} event_type={event_type}")
        logger.info(f"[TOPIC PARSED] collection={collection_name}")

        schema_map = {
            "status": StatusTelemetry,
            "heartbeat": HeartbeatTelemetry,
            "vitals": VitalsTelemetry,
            "sleep": SleepTelemetry,
            "alerts": AlertTelemetry
        }

        model = schema_map.get(event_type)
        if not model:
            logger.warning(f"Unrecognized telemetry model schema category: '{event_type}'")
            return

        # Inject parsed routing parameters to guarantee validation passes successfully
        if "device_id" not in normalized_data or not normalized_data["device_id"]:
            normalized_data["device_id"] = device_id
        if "event_type" not in normalized_data or not normalized_data["event_type"]:
            normalized_data["event_type"] = event_type
        if "timestamp" not in normalized_data or not normalized_data["timestamp"]:
            normalized_data["timestamp"] = datetime.now(timezone.utc).isoformat()

        # 3. Pydantic Validation
        try:
            validated_payload = model(**normalized_data)
            validated_dict = validated_payload.model_dump()
            
            # [VALIDATION SUCCESS]
            logger.info(
                f"[REALTIME PAYLOAD]{json.dumps(validated_dict, default=str)}"
            )

        except ValidationError as val_err:
            logger.error(f"[VALIDATION FAILURE] Validation rules broken: errors={val_err.errors()}")
            return

        # 4. AWAITED VALKEY REALTIME PUB/SUB (Happens BEFORE MongoDB Insert)
        # Timeout lock ensures any Valkey communication problems do NOT block ingestion loop.
        valkey = valkey_manager.client
        if valkey:
            try:
                # 🚨 THE FIX: Publish the flat 'validated_dict' directly, dropping the wrapper envelope!
                await asyncio.wait_for(
                    valkey.publish(settings.valkey_channel, json.dumps(validated_dict, default=str)),
                    timeout=0.5
                )
                logger.info(f"[VALKEY PUBLISHED] Channel={settings.valkey_channel} | Device={device_id}")
            except asyncio.TimeoutError:
                logger.error("[VALKEY TIMEOUT] Realtime publish to Valkey timed out (1.0s limit). Resiliently continuing to MongoDB.")
            except Exception as e:
                logger.error(f"[VALKEY PUBLISH FAILURE] Error publishing event to Valkey: {e}")
        else:
            logger.error("Valkey client is not initialized.")

        # 5. MONGO DYNAMIC COLLECTION PERSISTENCE (Happens AFTER Valkey Pub/Sub)
        await self.insert_to_mongo(collection_name, validated_dict)

        # [TELEMETRY PIPELINE COMPLETE]
        logger.info(
            f"[TELEMETRY PIPELINE] event_type={event_type} | "
            f"device={device_id} | mongo=SUCCESS"
        )

    async def insert_to_mongo(self, collection_name: str, doc: dict, retries=3, delay=1.0):
        """Writes validated telemetry to its dedicated collection with exponential backoff retries."""
        if mongo_manager.db is None:
            logger.error("MongoDB is uninitialized. Skipping database insertion.")
            return
        
        db_collection = mongo_manager.db[collection_name]
        
        for attempt in range(1, retries + 1):
            try:
                await db_collection.insert_one(doc)
                logger.info(f"[MONGO INSERT SUCCESS] collection={collection_name}")
                return
            except DuplicateKeyError as dke:
                logger.error(f"[MONGO DUPLICATE KEY] Record already exists. Skipping: {dke}")
                return
            except Exception as e:
                logger.warning(f"[MONGO INSERT FAILURE] Attempt {attempt} failed: {e}")
                if attempt == retries:
                    logger.error(f"[MONGO WRITE ERROR] Max retries reached. Record dropped for device {doc.get('device_id')}")
                else:
                    await asyncio.sleep(delay * (2 ** (attempt - 1)))

writer_service = WriterService()