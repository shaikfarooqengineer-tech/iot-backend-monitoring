import asyncio
from typing import Any

from pymongo.errors import DuplicateKeyError
from pydantic import ValidationError

from app.db.mongo import mongo_manager
from app.models.telemetry import (
    AlertTelemetry,
    SleepTelemetry,
    VitalsTelemetry
)
from app.services.ingest_service import ingestion_queue
from app.utils.logger import logger


class WriterService:
    """
    Background telemetry writer service.

    Responsibilities:
    - Consume queue messages
    - Validate telemetry
    - Route collections
    - Insert into MongoDB
    """

    def __init__(self) -> None:
        self.running = False

    async def start(self) -> None:
        """
        Start continuous queue consumer loop.
        """

        self.running = True

        logger.info("Writer service started")

        while self.running:
            try:
                telemetry_packet = await ingestion_queue.get()

                await self.process_packet(telemetry_packet)

                ingestion_queue.task_done()

            except Exception as exc:
                logger.exception(
                    f"Writer loop error: {exc}"
                )

                await asyncio.sleep(1)

    async def stop(self) -> None:
        """
        Stop writer service.
        """

        self.running = False

        logger.info("Writer service stopped")


async def process_packet(
    self,
    telemetry_packet: dict[str, Any]
) -> None:

    topic = telemetry_packet["topic"]

    payload = telemetry_packet["payload"]

    try:

        # Convert seconds -> milliseconds
        if payload.get("ts") and payload["ts"] < 999999999999:
            payload["ts"] *= 1000

        collection_name, validated_payload = (
            self.route_and_validate(
                topic,
                payload
            )
        )

        collection = mongo_manager.db[collection_name]

        await self.insert_with_retry(
            collection,
            validated_payload.model_dump(by_alias=False)
        )

        logger.info(
            f"Telemetry inserted | collection={collection_name}"
        )

    except DuplicateKeyError:
        logger.warning(
            f"Duplicate event ignored | "
            f"event_id={payload.get('event_id')}"
        )

    except ValidationError as exc:
        logger.error(
            f"Telemetry validation failed: {exc}"
        )

    except ValueError as exc:
        logger.error(str(exc))

    except Exception as exc:
        logger.exception(
            f"Telemetry processing failure: {exc}"
        )

    async def insert_with_retry(
        self,
        collection,
        document: dict,
        retries: int = 3
    ) -> None:
        """
        Retry Mongo inserts for transient failures.
        """

        for attempt in range(retries):
            try:
                await collection.insert_one(document)

                return

            except DuplicateKeyError:
                raise

            except Exception as exc:

                logger.warning(
                    f"Mongo insert retry "
                    f"{attempt + 1}/{retries}: {exc}"
                )

                await asyncio.sleep(1)

        raise Exception(
            "Mongo insert failed after retries"
        )



    def route_and_validate(
        self,
        topic: str,
        payload: dict[str, Any]
    ):
        """
        Route MQTT topic to:
        - Mongo collection
        - Pydantic validation model
        """

        topic = topic.lower()

        if topic.endswith("/vitals"):
            validated = VitalsTelemetry(**payload)
            return "vitals", validated

        elif topic.endswith("/sleep"):
            validated = SleepTelemetry(**payload)
            return "sleep", validated

        elif topic.endswith("/alerts"):
            validated = AlertTelemetry(**payload)
            return "alerts", validated

        raise ValueError(
            f"Unsupported telemetry topic: {topic}"
        )


writer_service = WriterService()