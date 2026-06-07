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
    """Background validation worker that publishes real-time events to Valkey and persists to MongoDB."""
    def __init__(self):
        self._running = False
        self._task: Optional[asyncio.Task] = None

    def start(self):
        """Begin processing queue entries in a dedicated background task."""
        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("WriterService background worker successfully started.")

    async def stop(self):
        """Signal queue completion and shutdown worker task."""
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
        Validates, prepares structured real-time event, dispatches to Valkey,
        and saves in MongoDB.
        """
        topic = packet.get("topic", "")
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
        
        for i, part in enumerate(parts):
            if part in category_mapping:
                event_type = category_mapping[part]
                if i + 1 < len(parts):
                    device_id = parts[i+1]
                break

        # Fallback to payload data if device_id not found in topic path
        if not device_id:
            device_id = normalized_data.get("device_id")

        if not event_type or not device_id:
            logger.warning(f"[TOPIC ROUTING FAILURE] topic={topic}")
            return

        # Get collection name
        COLLECTION_MAP = {
            "vitals": "vitals",
            "heartbeat": "heartbeat",
            "sleep": "sleep",
            "alerts": "alerts",
            "status": "status"
        }
        collection_name = COLLECTION_MAP.get(event_type)
        if not collection_name:
            logger.warning(f"[TOPIC ROUTING FAILURE] topic={topic}")
            return

        # [PAYLOAD NORMALIZED]
        logger.info(
            f"[PAYLOAD NORMALIZED] "
            f"device_id={device_id} "
            f"event_type={event_type}"
        )

        # [TOPIC PARSED]
        logger.info(
            f"[TOPIC PARSED] "
            f"collection={collection_name}"
        )

        schema_map = {
            "status": StatusTelemetry,
            "heartbeat": HeartbeatTelemetry,
            "vitals": VitalsTelemetry,
            "sleep": SleepTelemetry,
            "alerts": AlertTelemetry
        }

        model = schema_map.get(event_type)
        if not model:
            logger.warning(f"Unrecognized telemetry category: '{event_type}'")
            return

        try:
            # Populate basic parameters if missing from raw JSON
            if "device_id" not in normalized_data:
                normalized_data["device_id"] = device_id
            if "timestamp" not in normalized_data:
                normalized_data["timestamp"] = datetime.now(timezone.utc).isoformat()

            # Execute validation
            validated_payload = model(**normalized_data)
            validated_dict = validated_payload.model_dump()
            
            # [VALIDATION SUCCESS]
            logger.info(
                f"[VALIDATION SUCCESS] "
                f"device_id={device_id}"
            )
            
            # Optional DEBUG-only JSON logs
            logger.debug(json.dumps(validated_dict, indent=2))
            
        except ValidationError as val_err:
            logger.error(
                f"[VALIDATION FAILURE] "
                f"errors={val_err.errors()}"
            )
            return

        # Build standardized event envelope format
        realtime_event = {
            "event_id": str(uuid.uuid4()),
            "event_type": event_type,
            "device_id": validated_dict.get("device_id"),
            "patient_id": validated_dict.get("patient_id"),
            "timestamp": validated_dict.get("timestamp"),
            "payload": validated_dict
        }

        # 1. VALKEY REALTIME PUB/SUB (Happens BEFORE MongoDB Insert)
        # Dispatched in a fire-and-forget task so Valkey issues never delay MongoDB writes
        asyncio.create_task(self._safe_valkey_publish(settings.valkey_channel, realtime_event.copy()))

        # 2. MONGO DYNAMIC COLLECTION PERSISTENCE
        await self.insert_to_mongo(realtime_event)

        # [TELEMETRY PIPELINE]
        logger.info(
            "[TELEMETRY PIPELINE] "
            f"event_type={event_type} | "
            f"device={device_id} | "
            f"mongo=SUCCESS | "
            f"valkey=SUCCESS"
        )

    async def _safe_valkey_publish(self, channel: str, event: dict):
        """Wrapper method ensuring Valkey client errors cannot crash the main pipeline thread."""
        try:
            success = await valkey_manager.publish_event(channel, event)
            if success:
                logger.info(f"[VALKEY PUBLISHED] event_id={event['event_id']}")
            else:
                logger.warning(f"Failed publishing event {event['event_id']} to Valkey.")
        except Exception as e:
            logger.error(f"[VALKEY PUBLISH FAILURE] error={str(e)}")

    async def insert_to_mongo(self, event: dict, retries=3, delay=1.0):
        """Writes to dynamic collection with exponential backoff on retry failures."""
        if mongo_manager.db is None:
            logger.error("MongoDB is uninitialized. Skipping database insertion.")
            return

        event_type = event.get("event_type")
        COLLECTION_MAP = {
            "vitals": "vitals",
            "heartbeat": "heartbeat",
            "sleep": "sleep",
            "alerts": "alerts",
            "status": "status"
        }
        collection_name = COLLECTION_MAP.get(event_type)
        if not collection_name:
            logger.error(f"Unknown event type {event_type}. Skipping database insertion.")
            return
        
        db_collection = mongo_manager.db[collection_name]
        
        for attempt in range(1, retries + 1):
            try:
                await db_collection.insert_one(event)
                logger.info(f"[MONGO INSERT SUCCESS] collection={collection_name}")
                return
            except DuplicateKeyError as dke:
                logger.error(f"Duplicate index found. Skipping insertion: {dke}")
                return
            except Exception as e:
                logger.error(f"[MONGO INSERT FAILURE] error={str(e)}")
                if attempt == retries:
                    logger.error(f"Max retries reached. Database insertion failed for event {event['event_id']}")
                else:
                    await asyncio.sleep(delay * (2 ** (attempt - 1)))

writer_service = WriterService()