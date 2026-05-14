import asyncio
import json
import ssl
from typing import Any

from gmqtt import Client as MQTTClient

from app.config import settings
from app.services.ingest_service import ingestion_queue
from app.utils.logger import logger


MQTT_TOPIC = settings.mqtt_topic


class MQTTConsumer:
    """
    Async MQTT consumer for telemetry ingestion.
    """

    def __init__(self) -> None:
        self.client = MQTTClient("hospital-backend-consumer")
        self.connected = False
        self.reconnect_delay = 5
        self._configure_client()

    def _configure_client(self) -> None:
        """
        Configure MQTT callbacks and authentication.
        """

        self.client.set_auth_credentials(
            settings.mqtt_username,
            settings.mqtt_password
        )

        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        self.client.on_disconnect = self.on_disconnect
        self.client.on_subscribe = self.on_subscribe
    
    async def connect(self) -> None:
        """
        Connect to MQTT broker.
        Supports:
        - Localhost non-TLS
        - HiveMQ TLS
        """

        logger.info("Connecting to MQTT broker...")

        connect_kwargs = {
            "host": settings.mqtt_host,
            "port": settings.mqtt_port,
            "keepalive": 60
        }

        # Enable TLS only if configured
        if settings.mqtt_use_tls:
            logger.info("TLS enabled for MQTT connection")

            ssl_context = ssl.create_default_context()

            connect_kwargs["ssl"] = ssl_context

        await self.client.connect(**connect_kwargs)



    # async def connect(self) -> None:
    #     """
    #     Connect to HiveMQ Cloud over TLS.
    #     """

    #     logger.info("Connecting to MQTT broker...")

    #     ssl_context = ssl.create_default_context()

    #     await self.client.connect(
    #         host=settings.mqtt_host,
    #         port=settings.mqtt_port,
    #         ssl=ssl_context,
    #         keepalive=60
    #     )

    async def disconnect(self) -> None:
        """
        Gracefully disconnect MQTT client.
        """

        logger.info("Disconnecting MQTT client...")

        await self.client.disconnect()

        logger.info("MQTT client disconnected")

    def on_connect(
        self,
        client: MQTTClient,
        flags: dict,
        rc: int,
        properties: Any
    ) -> None:
        """
        MQTT connected callback.
        """

        self.connected = True

        logger.info(
            f"Connected to MQTT broker with result code: {rc}"
        )

        client.subscribe(MQTT_TOPIC, qos=1)

        logger.info(
            f"Subscribed to topic: {MQTT_TOPIC}"
        )

    def on_disconnect(
        self,
        client: MQTTClient,
        packet,
        exc=None
    ) -> None:
        """
        MQTT disconnect callback.
        """

        self.connected = False

        logger.warning(
            "Disconnected from MQTT broker"
        )

        if exc:
            logger.error(
                f"Disconnect exception: {exc}"
            )

    def on_subscribe(
        self,
        client: MQTTClient,
        mid: int,
        qos: list,
        properties: Any
    ) -> None:
        """
        MQTT subscription confirmation callback.
        """

        logger.info(
            f"Subscription successful. MID={mid}, QOS={qos}"
        )

    async def reconnect_loop(self) -> None:
        """
        Continuous reconnect loop.
        """

        while not self.connected:
            try:
                logger.info(
                    "Attempting MQTT reconnection..."
                )

                await self.connect()

                logger.info(
                    "MQTT reconnection successful"
                )

                return

            except Exception as exc:
                logger.error(
                    f"MQTT reconnect failed: {exc}"
                )

                await asyncio.sleep(
                    self.reconnect_delay
                )


    async def on_message(
        self,
        client: MQTTClient,
        topic: str,
        payload: bytes,
        qos: int,
        properties: Any
    ) -> None:
        """
        MQTT message handler.

        IMPORTANT:
        We NEVER write directly to Mongo here.
        We only enqueue messages.
        """

        try:
            decoded_payload = payload.decode()

            logger.info(
            f"RAW MQTT RECEIVED | topic={topic} | payload={decoded_payload}"
        )

            message = json.loads(decoded_payload)

            telemetry_packet = {
                "topic": topic,
                "payload": message
            }

            ingestion_queue.put_nowait(telemetry_packet)

            logger.info(
                f"Telemetry queued | topic={topic}"
            )

        except asyncio.QueueFull:
            logger.critical(
                    "QUEUE OVERFLOW | "
                    f"current_size={ingestion_queue.qsize()}"
            )

        except json.JSONDecodeError:
            logger.error(
                f"Invalid JSON received on topic: {topic}"
            )

        except Exception as exc:
            logger.exception(
                f"Unexpected MQTT message processing error: {exc}"
            )


mqtt_consumer = MQTTConsumer()