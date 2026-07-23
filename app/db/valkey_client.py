#  ══════════════════════════════════════════════════════════════════════════════
# FILE: backend/app/db/valkey_client.py
#  ══════════════════════════════════════════════════════════════════════════════
import json
import asyncio
import valkey.asyncio as valkey
from typing import Optional
from app.config import settings
from app.utils.logger import logger

class ValkeyManager:
    """Centralized async Valkey database client for Pub/Sub operations."""
    def __init__(self):
        self.client: Optional[valkey.Valkey] = None

    def connect(self):
        """Initialize connection pooling to Valkey."""
        if not self.client:
            logger.info(f"Initializing Valkey connection pool on {settings.valkey_host}:{settings.valkey_port}")
            self.client = valkey.Valkey(
                host=settings.valkey_host,
                port=settings.valkey_port,
                password=settings.valkey_password,
                decode_responses=True,
                socket_timeout=5.0,
                socket_connect_timeout=5.0,
                retry_on_timeout=True
            )

    async def ping(self) -> bool:
        """Verify Valkey connectivity by pinging the server."""
        if not self.client:
            logger.error("Valkey client is not initialized.")
            return False
        try:
            response = await asyncio.wait_for(self.client.ping(), timeout=2.0)
            logger.info("Valkey connection ping succeeded.")
            return response == True or response == "PONG"
        except Exception as e:
            logger.error(f"Valkey reachability check failed (host={settings.valkey_host}, port={settings.valkey_port}): {e}")
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

valkey_manager = ValkeyManager()
