#  ══════════════════════════════════════════════════════════════════════════════
# FILE: \backend\app\mqtt\consumer.py
#  ══════════════════════════════════════════════════════════════════════════════
import asyncio
import json
import socket
from typing import Any, Optional
from gmqtt import Client as MQTTClient
from app.config import settings
from app.services.ingest_service import ingestion_queue
from app.utils.logger import logger

class MQTTConsumer:
    """Async MQTT consumer for hospital telemetry ingestion."""
    def __init__(self):
        self.client: Optional[MQTTClient] = None
        self.connected = False
        self._retry_task: Optional[asyncio.Task] = None
        self._stop_event = asyncio.Event()
<<<<<<< HEAD
        self._reconnect_running = False
=======
>>>>>>> cd28364c17ac2aaabbb6853365379f34badc6f4e

    def on_connect(self, client, flags, rc, properties):
        self.connected = True
        logger.info(f"Successfully connected to MQTT broker. Result Code: {rc}")
        client.subscribe(settings.mqtt_topic, qos=1)
        logger.info(f"MQTT subscription active on topic pattern: {settings.mqtt_topic}")

    def on_disconnect(self, client, packet, exc=None):
        self.connected = False
        logger.warning(f"Disconnected from MQTT broker: {exc}")
        if not self._stop_event.is_set():
            logger.info("Scheduling automatic reconnection to MQTT broker...")
            self._start_reconnect_loop()

    def on_message(self, client, topic, payload, qos, properties):
        try:
            raw_data = json.loads(payload.decode('utf-8'))
            if not ingestion_queue.full():
<<<<<<< HEAD
                # FIXED: Aligned key name to "payload" to match WriterService contract expectations
                ingestion_queue.put_nowait({"topic": topic, "payload": raw_data})
=======
                ingestion_queue.put_nowait({"topic": topic, "data": raw_data})
>>>>>>> cd28364c17ac2aaabbb6853365379f34badc6f4e
            else:
                logger.error(f"In-memory queue is full ({settings.queue_max_size} packets). Dropping payload from topic: {topic}")
        except Exception as e:
            logger.error(f"Failed to process and enqueue incoming MQTT message: {e}")

    def _start_reconnect_loop(self):
        if self._retry_task is None or self._retry_task.done():
            self._retry_task = asyncio.create_task(self._reconnect_loop())

    async def _reconnect_loop(self):
<<<<<<< HEAD
        if self._reconnect_running:
            return
        self._reconnect_running = True
        
        retries = 0
        base_delay = 3.0
=======
        retries = 0
        base_delay = 1.0
>>>>>>> cd28364c17ac2aaabbb6853365379f34badc6f4e
        max_delay = 60.0
        
        # Configure TLS if enabled
        connect_kwargs = {}
        if getattr(settings, "mqtt_use_tls", False):
            import ssl
            connect_kwargs["ssl"] = ssl.create_default_context()
            
<<<<<<< HEAD
        # Warn the user once that telemetry logging is entering a "staled" state
        logger.warning("MQTT is NOT connected. Staling connection logs to avoid terminal flooding.")
        
        while not self.connected and not self._stop_event.is_set():
            retries += 1
            delay = min(base_delay * (2 ** (retries - 1)), max_delay)
            
            # Repetitive retry messages are staled: Only log to INFO level once every 5 attempts
            should_log_info = (retries == 1 or retries % 5 == 0)
            
            if should_log_info:
                logger.info(f"Connecting to MQTT Broker at {settings.mqtt_host}:{settings.mqtt_port} (attempt {retries})...")
            else:
                logger.debug(f"Connecting to MQTT Broker (attempt {retries})...")
                
            try:
                # Run DNS resolution in a non-blocking executor thread to prevent freezing the event loop
                try:
                    await asyncio.get_event_loop().run_in_executor(
                        None, socket.gethostbyname, settings.mqtt_host
                    )
                except socket.gaierror as dns_err:
                    if should_log_info:
                        logger.error(f"DNS lookup/resolution failed for host '{settings.mqtt_host}': {dns_err}")
=======
        while not self.connected and not self._stop_event.is_set():
            retries += 1
            delay = min(base_delay * (2 ** (retries - 1)), max_delay)
            logger.info(f"Connecting to MQTT Broker at {settings.mqtt_host}:{settings.mqtt_port} (attempt {retries})...")
            try:
                # Perform DNS check (host lookup) to log explicit gaierrors before connect
                try:
                    socket.gethostbyname(settings.mqtt_host)
                except socket.gaierror as dns_err:
                    logger.error(f"DNS lookup/resolution failed for host '{settings.mqtt_host}': {dns_err}")
>>>>>>> cd28364c17ac2aaabbb6853365379f34badc6f4e
                    raise dns_err

                await self.client.connect(settings.mqtt_host, settings.mqtt_port, **connect_kwargs)
                
<<<<<<< HEAD
                # gmqtt connect is async. Monitor self.connected state changes
=======
                # gmqtt connect is async. Wait for connection status to update to True
>>>>>>> cd28364c17ac2aaabbb6853365379f34badc6f4e
                for _ in range(50):
                    if self.connected or self._stop_event.is_set():
                        break
                    await asyncio.sleep(0.1)
                
                if self.connected:
                    logger.info(f"MQTT connection successfully established on attempt {retries}.")
<<<<<<< HEAD
                    self._reconnect_running = False
                    return
                else:
                    raise ConnectionError("Handshake not completed within 5.0 seconds.")
                    
            except Exception as e:
                if should_log_info:
                    logger.error(f"MQTT connection attempt {retries} failed. Retrying in {delay:.1f}s... (Logs are staled)")
                else:
                    logger.debug(f"MQTT connection attempt {retries} failed: {e}")
                
                await asyncio.sleep(delay)
                
        self._reconnect_running = False
=======
                    return
                else:
                    raise ConnectionError("Handshake not completed within 5.0 seconds.")
            except (socket.gaierror, ConnectionRefusedError, OSError, Exception) as e:
                logger.error(f"MQTT connection attempt {retries} failed: {e}. Retrying in {delay:.1f}s...")
                await asyncio.sleep(delay)
>>>>>>> cd28364c17ac2aaabbb6853365379f34badc6f4e

    async def start(self):
        """Establish the client connection and bind callback triggers."""
        self._stop_event.clear()
        self.client = MQTTClient("hospital_backend_ingester")
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        self.client.on_disconnect = self.on_disconnect
        
        # Configure credentials if present
        if getattr(settings, "mqtt_username", None) and getattr(settings, "mqtt_password", None):
            self.client.set_auth_credentials(settings.mqtt_username, settings.mqtt_password)
            
<<<<<<< HEAD
        logger.info("Validating MQTT configurations:")
=======
        logger.info(f"Validating MQTT configurations:")
>>>>>>> cd28364c17ac2aaabbb6853365379f34badc6f4e
        logger.info(f"  MQTT_HOST: {settings.mqtt_host}")
        logger.info(f"  MQTT_PORT: {settings.mqtt_port}")
        logger.info(f"  MQTT_TOPIC: {settings.mqtt_topic}")
        logger.info(f"  MQTT_USE_TLS: {getattr(settings, 'mqtt_use_tls', False)}")
        
        if not settings.mqtt_host:
            logger.error("MQTT_HOST is not configured or is empty. MQTT ingestion will not start.")
            return

        if not (1 <= settings.mqtt_port <= 65535):
            logger.error(f"MQTT_PORT {settings.mqtt_port} is invalid. MQTT ingestion will not start.")
            return

        # Start connection process in background so startup lifecycle doesn't block
        self._start_reconnect_loop()

    async def stop(self):
        """Gracefully unsubscribe and disconnect."""
        self._stop_event.set()
        if self._retry_task and not self._retry_task.done():
            self._retry_task.cancel()
            try:
                await self._retry_task
            except asyncio.CancelledError:
                pass
        
        if self.client:
            await self.client.disconnect()
            self.connected = False
            logger.info("MQTT Client connection closed.")

mqtt_consumer = MQTTConsumer()