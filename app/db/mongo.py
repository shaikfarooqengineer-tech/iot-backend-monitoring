#  ══════════════════════════════════════════════════════════════════════════════
# FILE: backend/app/db/mongo.py
#  ══════════════════════════════════════════════════════════════════════════════

import asyncio
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.config import settings
from app.utils.logger import logger

class MongoManager:
    """
    Centralized async MongoDB manager.

    Responsibilities:
    - Create Mongo client
    - Initialize collections
    - Create indexes
    - Provide database access
    - Handle graceful shutdown
    """

    def __init__(self) -> None:
        self.client: Optional[AsyncIOMotorClient] = None
        self.db: Optional[AsyncIOMotorDatabase] = None

    def connect(self):
        """Initialize motor client connection."""
        if not self.client:
            logger.info(f"Connecting to MongoDB at {settings.mongo_uri}")
            self.client = AsyncIOMotorClient(settings.mongo_uri)
            self.db = self.client[settings.mongo_db_name]
            logger.info("MongoDB client connected successfully.")

    async def ping(self) -> bool:
        """Verify MongoDB connectivity by pinging the admin database."""
        if not self.client:
            logger.error("MongoDB client is not initialized.")
            return False
        try:
            await asyncio.wait_for(self.client.admin.command("ping"), timeout=2.0)
            logger.info("MongoDB connection ping succeeded.")
            return True
        except Exception as e:
            logger.error(f"MongoDB reachability check failed at {settings.mongo_uri}: {e}")
            return False

    async def close(self):
        """Close motor client connection cleanly."""
        if self.client:
            self.client.close()
            self.client = None
            self.db = None
            logger.info("MongoDB client connection closed.")

mongo_manager = MongoManager()