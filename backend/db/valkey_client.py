# ══════════════════════════════════════════════════════════════════════════════
# FILE: backend/db/valkey_client.py
# PURPOSE: Centralized async Valkey database client for connection pooling.
# ══════════════════════════════════════════════════════════════════════════════
import json
import asyncio
import os
import logging
import valkey.asyncio as valkey
from typing import Optional
from dotenv import load_dotenv

# 1. Initialize Standard Logger to replace the old app.utils.logger
logger = logging.getLogger(__name__)

# Load environment variables from .env file
load_dotenv()

# Get Valkey connection parameters from environment variables
VALKEY_HOST = os.getenv("VALKEY_HOST", "localhost")
VALKEY_PORT = int(os.getenv("VALKEY_PORT", 6379))
VALKEY_PASSWORD = os.getenv("VALKEY_PASSWORD")

class ValkeyManager:
    """Centralized async Valkey database client for Pub/Sub operations."""
    def __init__(self):
        self.client: Optional[valkey.Valkey] = None

    def connect(self):
        """Initialize connection pooling to Valkey."""
        if not self.client:
            # FIX: Replaced 'settings.valkey_host' with 'VALKEY_HOST'
            logger.info(f"Initializing Valkey connection pool on {VALKEY_HOST}:{VALKEY_PORT}")
            self.client = valkey.Valkey(
                host=VALKEY_HOST,
                port=VALKEY_PORT,
                password=VALKEY_PASSWORD,
                decode_responses=True,
                health_check_interval=30,
                retry_on_timeout=True
            )

    async def check_health(self) -> bool:
        """Pings the Valkey server to verify reachability."""
        if not self.client:
            return False
        try:
            response = await self.client.ping()
            logger.info("Valkey ping succeeded.")
            return response == True or response == "PONG"
        except Exception as e:
            # FIX: Replaced 'settings.valkey_host' with 'VALKEY_HOST'
            logger.error(f"Valkey reachability check failed (host={VALKEY_HOST}, port={VALKEY_PORT}): {e}")
            return False

    async def publish_event(self, channel: str, message: dict) -> bool:
        """
        Publishes a message payload to Valkey Pub/Sub channel.
        Safe, non-blocking, and handles timeouts or client disconnects.
        """
        if not self.client:
            logger.error("Valkey client is not initialized. Cannot publish event.")
            return False
        try:
            serialized = json.dumps(message)
            # Limit blocking publish calls to 2.0s to maintain ingestion pipeline flow
            await asyncio.wait_for(self.client.publish(channel, serialized), timeout=2.0)
            return True
        except asyncio.TimeoutError:
            logger.warning(f"Valkey publish operation timed out on channel '{channel}'")
            return False
        except Exception as e:
            logger.error(f"Failed to publish to Valkey on channel '{channel}': {e}", exc_info=True)
            return False

    async def close(self):
        """Gracefully disconnect Valkey connection pool."""
        if self.client:
            await self.client.close()
            self.client = None
            logger.info("Valkey connection pool closed.")

# Instantiate the global manager
valkey_manager = ValkeyManager()