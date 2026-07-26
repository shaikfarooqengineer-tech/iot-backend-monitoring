#  ══════════════════════════════════════════════════════════════════════════════
# FILE: backend/app/config.py
#  ══════════════════════════════════════════════════════════════════════════════

from __future__ import annotations
from pydantic_settings import BaseSettings
from dotenv import load_dotenv
import os

load_dotenv()

class Settings(BaseSettings):
    # MQTT Configuration
    mqtt_host: str = os.getenv("MQTT_HOST", "a2f21c1405bc437b9508ec02e6bd8aa0.s1.eu.hivemq.cloud")
    mqtt_port: int = int(os.getenv("MQTT_PORT", 8883))
    mqtt_topic: str = os.getenv("MQTT_TOPIC", "test/olt/esp32/#")
    mqtt_username: str | None = os.getenv("MQTT_USERNAME", "olt_sleep")
    mqtt_password: str | None = os.getenv("MQTT_PASSWORD", "Olt@1234")
    mqtt_use_tls: bool = os.getenv("MQTT_USE_TLS", "true").lower() == "true"
    
    # Local Queue Configuration
    queue_max_size: int = int(os.getenv("QUEUE_MAX_SIZE", 10000))
    
    # Logging
    log_level: str = os.getenv("LOG_LEVEL", "INFO")
    
    # MongoDB Configuration
    mongo_uri: str = os.getenv("MONGO_URI", "")
    mongo_db_name: str = os.getenv("MONGO_DB_NAME", "vitals_monitoring")
    # Valkey / Redis Configuration
    valkey_host: str = os.getenv("VALKEY_HOST", "localhost")
    valkey_port: int = int(os.getenv("VALKEY_PORT", 6379))
    valkey_channel: str = os.getenv("VALKEY_CHANNEL", "hospital.telemetry.events")
    valkey_password: str | None = os.getenv("VALKEY_PASSWORD", "25fac5c6f53ce29324bf08855d335a61c204754436a4511843785987d6bc6279")

settings = Settings()