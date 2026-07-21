#  ══════════════════════════════════════════════════════════════════════════════
# FILE: backend/app/config.py
#  ══════════════════════════════════════════════════════════════════════════════

from pydantic import BaseModel
from pydantic_settings import BaseSettings
from dotenv import load_dotenv
import os

load_dotenv()


class Settings(BaseModel):
    # MQTT
    mqtt_host: str = os.getenv("MQTT_HOST", "")
    mqtt_port: int = int(os.getenv("MQTT_PORT", 1883))

    mqtt_username: str = os.getenv("MQTT_USERNAME", "")
    mqtt_password: str = os.getenv("MQTT_PASSWORD", "")
    mqtt_use_tls: bool = os.getenv("MQTT_USE_TLS", "false").lower() == "true"

    mqtt_topic: str = os.getenv(
    "MQTT_TOPIC",
    "test/olt/esp32/telemetry"
)

    # Mongo
    mongo_uri: str = os.getenv("MONGO_URI", "")
    mongo_db_name: str = os.getenv("MONGO_DB_NAME")

    # Queue
    queue_max_size: int = int(os.getenv("QUEUE_MAX_SIZE", 10000))
    # Logging
    log_level: str = os.getenv("LOG_LEVEL", "INFO")

    # Valkey / Redis Configuration
    valkey_host: str = os.getenv("VALKEY_HOST", "localhost")
    valkey_port: int = os.getenv("VALKEY_PORT", 6379)
    valkey_channel: str = os.getenv("VALKEY_CHANNEL", "telemetry_events")
    valkey_password: str | None = os.getenv("VALKEY_PASSWORD", None)

settings = Settings()