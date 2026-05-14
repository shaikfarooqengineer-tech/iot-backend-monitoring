from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING

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

    async def connect(self) -> None:
        """
        Initialize MongoDB connection.
        """

        logger.info("Connecting to MongoDB...")

        self.client = AsyncIOMotorClient(
            settings.mongo_uri,
            serverSelectionTimeoutMS=5000
        )

        # Verify connection
        await self.client.admin.command("ping")

        self.db = self.client[settings.mongo_db]

        logger.info("MongoDB connection established")

        await self.initialize_indexes()

    async def initialize_indexes(self) -> None:
        """
        Create required indexes for all collections.
        """

        logger.info("Creating MongoDB indexes...")

        collections = [
            "status",
            "heartbeat",
            "vitals",
            "sleep",
            "alerts"
        ]

        for collection_name in collections:
            collection = self.db[collection_name]

            # Unique event protection
            await collection.create_index(
                [("event_id", ASCENDING)],
                unique=True,
                name="idx_unique_event_id"
            )

            # Timestamp queries
            await collection.create_index(
                [("ts", ASCENDING)],
                name="idx_ts"
            )

            # Device-based lookups
            await collection.create_index(
                [("device_id", ASCENDING)],
                name="idx_device_id"
            )

            logger.info(
                f"Indexes initialized for collection: {collection_name}"
            )

    async def disconnect(self) -> None:
        """
        Gracefully close MongoDB connection.
        """

        if self.client:
            logger.info("Closing MongoDB connection...")
            self.client.close()
            logger.info("MongoDB connection closed")


mongo_manager = MongoManager()