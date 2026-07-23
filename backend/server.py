# ══════════════════════════════════════════════════════════════════════════════
# FILE: backend/server.py
# IMPLEMENTATION: Main backend gateway managing authentication, device provisioning, 
# and a WebSocket-first event-driven push architecture with Redis-ready event routing.
# ══════════════════════════════════════════════════════════════════════════════

from fastapi import status, Query, Depends, FastAPI, APIRouter, WebSocket, WebSocketDisconnect, Request, Response, HTTPException
from starlette.concurrency import run_in_threadpool
from pymongo.errors import DuplicateKeyError, DuplicateKeyError as MongoDuplicateKeyError
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Set
from collections import defaultdict
from enum import Enum
from pathlib import Path
from valkey.exceptions import TimeoutError  # Used for catching PubSub timeouts safely
import bcrypt
import httpx
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import uuid
import asyncio
import random
import json

import valkey.asyncio as valkey
from db.valkey_client import valkey_manager

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

_SECURE_COOKIES: bool = os.environ.get("SECURE_COOKIES", "true").lower() != "false"

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# MongoDB connection - Connects with optimized connection pools
try:
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME')
    telemetry_db_name = os.environ.get('TELEMETRY_DB_NAME', 'vitals_monitoring')

    if not mongo_url or not db_name:
        raise ValueError("MONGO_URL and DB_NAME must be set in .env file")

    # OPTIMIZATION: Maximize pool limits and timeout controls for high-speed concurrent routing
    client = AsyncIOMotorClient(
        mongo_url, 
        serverSelectionTimeoutMS=2000,
        maxPoolSize=200,
        minPoolSize=10,
        maxIdleTimeMS=45000,
        waitQueueTimeoutMS=5000
    )
    db = client[db_name]                                    # Main app database context (users, sessions, devices)
    telemetry_db = client[telemetry_db_name]                # IoT telemetry database context (vitals, sleep, alerts)
    logger.info(f"Connected to App DB: {db_name} and Telemetry DB: {telemetry_db_name}")
except Exception as e:
    logger.warning(f"Failed to connect to MongoDB: {e}. Running without database connection.")
    db = None
    telemetry_db = None

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# ══════════════════════════════════════════════════════════════════════════════
# EVENT BUS & PATIENT ROOM CONNECTION MANAGER
# ══════════════════════════════════════════════════════════════════════════════

class ConnectionManager:
    """
    O(1) Connection Manager utilizing targeted patient rooms.
    Elimates global connection scans and isolates data delivery.
    """
    def __init__(self):
        # Maps patient_id -> set of active WebSockets
        self.patient_connections: Dict[str, Set[WebSocket]] = defaultdict(set)

    # ──────────────────────────────────────────────────────────────────────────
    # Core Patient-Centric Logic & Implementations
    # ──────────────────────────────────────────────────────────────────────────
    async def connect_patient(self, patient_id: str, websocket: WebSocket):
        """
        Directly registers and accepts a WebSocket connection for the specified Patient ID.
        """
        self.patient_connections[patient_id].add(websocket)
        logger.info(
            f"WebSocket connection established for Patient: {patient_id}. "
            f"Active connections for this patient: {len(self.patient_connections[patient_id])}"
        )

    def disconnect_patient(self, patient_id: str, websocket: WebSocket):
        """
        Safely removes a WebSocket connection matching the specified Patient ID.
        Cleans up key allocations once all connections are closed.
        """
        if patient_id in self.patient_connections:
            self.patient_connections[patient_id].discard(websocket)
            if not self.patient_connections[patient_id]:
                del self.patient_connections[patient_id]
        logger.info(f"WebSocket connection closed for Patient: {patient_id}.")

    async def broadcast_to_patient(self, patient_id: str, message: dict):
        """
        Directly broadcasts JSON telemetry payloads to all listeners for a given Patient ID.
        Identifies and prunes stale/dead connections in real-time.
        """
        if patient_id not in self.patient_connections:
            return

        stale_connections: Set[WebSocket] = set()
        tasks = []

        # Iterate over a copied list to prevent set modification errors during runtime
        active_viewers = list(self.patient_connections[patient_id])

        for connection in active_viewers:
            async def safe_send(conn: WebSocket = connection):
                try:
                    await conn.send_json(message)
                except Exception as e:
                    logger.warning(
                        f"Failed to stream JSON to WebSocket for Patient {patient_id}: {e}"
                    )
                    stale_connections.add(conn)

            tasks.append(safe_send())

        if tasks:
            # Gather tasks concurrently; do not let single client errors abort other broadcasts
            await asyncio.gather(*tasks, return_exceptions=True)

        # Dynamic pruning: Clean up stale connections discovered during the transmission loop
        for dead_conn in stale_connections:
            self.disconnect_patient(patient_id, dead_conn)

# Global Instance
manager = ConnectionManager()


class EventBusBackend:
    """Interface class designed for future horizontal clustering (Redis Pub/Sub, Kafka, etc.)"""
    async def publish(self, patient_id: str, payload: dict):
        raise NotImplementedError()


class TelemetryEventBus(EventBusBackend):
    """
    Core event distribution layer managing patient streams in-memory with ultra-low latency.
    """
    def __init__(self, connection_manager: ConnectionManager):
        self.cm = connection_manager

    async def publish(self, patient_id: str, payload: dict):
        # DIRECT EVENT -> WS PUSH: Broadcast immediately
        await self.cm.broadcast_to_patient(patient_id, payload)

# Global event bus singleton mapped to our socket rooms
event_bus = TelemetryEventBus(manager)


# ─── Health Monitoring Models ─────────────────────────────────────────────────

class Patient(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    room: str
    age: int
    status: str
    avatar_url: Optional[str] = None

# ─── Permission Models ────────────────────────────────────────────────────────
class HospitalCreate(BaseModel):
    name: str
    address: Optional[str] = None

# ─── User Role Models ────────────────────────────────────────────────────────

class UserRole(str, Enum):
    SUPERADMIN = "superadmin"
    HOSPITAL_ADMIN = "hospital_admin"
    STAFF = "staff"
    PATIENT = "patient"

# ─── Permission Models ────────────────────────────────────────────────────────

class Permission(str, Enum):
    CREATE_HOSPITAL = "create_hospital"
    MANAGE_HOSPITAL = "manage_hospital"
    ADD_STAFF = "add_staff"
    ADD_PATIENT = "add_patient"
    VIEW_PATIENT_DATA = "view_patient_data"
    EDIT_PATIENT_DATA = "edit_patient_data"
    ASSIGN_DEVICES = "assign_devices"
    VIEW_IOT_STREAM = "view_iot_stream"

# ─── Role Create Permission Models─────────────────────────────────────────────────────

ROLE_CREATE_PERMISSIONS: dict[UserRole, list[UserRole]] = {
    UserRole.SUPERADMIN:     [UserRole.SUPERADMIN, UserRole.HOSPITAL_ADMIN],
    UserRole.HOSPITAL_ADMIN: [UserRole.STAFF, UserRole.PATIENT],
    UserRole.STAFF:          [UserRole.PATIENT],   # staff can enroll patients
    UserRole.PATIENT:        [],                    # patients cannot create users
}

# ─── Hospital Models ────────────────────────────────────────────────────────

class Hospital(BaseModel):
    hospital_id: str = Field(default_factory=lambda: f"hospital_{uuid.uuid4().hex[:12]}")
    name: str
    address: Optional[str] = None
    created_by: str  # superadmin user_id
    created_at: datetime

class Vitals(BaseModel):
    heart_rate: int
    heart_rate_status: str
    respiration_rate: int
    respiration_status: str
    sleep_status: str
    sleep_quality: str
    fall_detected: bool
    fall_status: str

class RoomStatus(BaseModel):
    presence_detected: bool
    distance: float
    light: int
    temperature: float
    motion: str

class DeviceStatus(BaseModel):
    radar_sensor: str
    signal: str
    battery: int

class Alert(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str
    message: str
    time: str
    severity: str

class SleepQuality(BaseModel):
    total_hours: float
    total_minutes: int
    deep_sleep_hours: float
    deep_sleep_minutes: int
    quality_percentage: int
    quality_label: str

class ActivityLevel(BaseModel):
    movement: str
    steps: int

class DashboardData(BaseModel):
    patient: Patient
    vitals: Vitals
    room_status: RoomStatus
    device_status: DeviceStatus
    alerts: List[Alert]
    sleep_quality: SleepQuality
    activity_level: ActivityLevel
    heart_rate_history: List[dict]
    respiration_history: List[dict]
    timestamp: str

# ─── Auth / User Models ────────────────────────────────────────────────────────

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    username: Optional[str] = None
    email: str
    name: str
    picture: Optional[str] = None
    role: UserRole
    hospital_id: Optional[str] = None
    can_create_patients: bool = True
    can_assign_devices: bool = False  # ─── NEW: set via PATCH /users/{id}/device-permissions
    created_at: datetime

class UserCreate(BaseModel):
    username: str
    password: str
    email: str
    name: str
    role: UserRole  # superadmin | hospital_admin | staff | patient
    hospital_id: Optional[str] = None
    can_create_patients: bool = True

# ─── Staff Permission Update ──────────────────────────────────────────────────
class StaffPermissionUpdate(BaseModel):
    can_create_patients: bool

# ─── Patient Creation (dedicated endpoint) ────────────────────────────────────
class PatientCreate(BaseModel):
    username: str
    password: str
    email: str
    name: str
    room: Optional[str] = None
    age: Optional[int] = None
    status: str = "Admitted"

# ─── User / Patient Update (partial) ─────────────────────────────────────────
class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    username: Optional[str] = None
    picture: Optional[str] = None

class PatientUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    username: Optional[str] = None
    room: Optional[str] = None
    age: Optional[int] = None
    status: Optional[str] = None

# ─── Device Models ─────────────────────────────────────────────────────────────
class DeviceCreate(BaseModel):
    device_serial: str
    device_type: str = "sleep_monitor"
    firmware_version: Optional[str] = None

class DeviceAssign(BaseModel):
    hospital_id: str

class DeviceAssignToPatient(BaseModel):
    patient_id: str

# ─── NEW: Device response model (API output — separate from input models above) ───
class Device(BaseModel):
    model_config = ConfigDict(extra="ignore")
    device_id: str
    device_serial: str
    device_type: str
    firmware_version: Optional[str] = None
    hospital_id: Optional[str] = None
    assigned_patient_id: Optional[str] = None
    status: str  # "available" | "assigned_to_hospital" | "assigned_to_patient"
    last_seen: Optional[str] = None
    created_at: datetime
    updated_at: datetime

# ─── NEW: Device permission update body ──────────────────────────────────────
class DevicePermissionUpdate(BaseModel):
    can_assign_devices: bool


class LoginRequest(BaseModel):
    username: str
    password: str

class AdminRegister(BaseModel):
    username: str
    password: str
    email: str
    name: str
    company_name: str

class SessionData(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    session_token: str
    expires_at: datetime
    created_at: datetime

class PasswordResetRequest(BaseModel):
    username: str

class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str

# ─── Employee Models ───────────────────────────────────────────────────────────

class Employee(BaseModel):
    model_config = ConfigDict(extra="ignore")
    employee_id: str
    name: str
    email: str
    phone: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    join_date: str
    status: str = "active"  # active, on_leave, inactive
    created_at: datetime

class EmployeeCreate(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    join_date: str

class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    join_date: Optional[str] = None
    status: Optional[str] = None


# ─── Activity & Notification Models ───────────────────────────────────────────

class Activity(BaseModel):
    model_config = ConfigDict(extra="ignore")
    activity_id: str
    user_id: str
    user_name: str
    action: str  # created, updated, deleted, completed
    entity_type: str  # project, task, client, meeting, document, employee
    entity_name: str
    description: str
    created_at: datetime

class Notification(BaseModel):
    model_config = ConfigDict(extra="ignore")
    notification_id: str
    user_id: str
    title: str
    message: str
    type: str  # task_assigned, meeting_reminder, project_update
    is_read: bool = False
    created_at: datetime


# ─── Knowledge Base Models ─────────────────────────────────────────────────────

class KnowledgeArticle(BaseModel):
    model_config = ConfigDict(extra="ignore")
    article_id: str
    title: str
    content: str
    category: str  # technical, hr, process, general
    tags: List[str] = []
    author_id: str
    author_name: str
    created_at: datetime
    updated_at: datetime

class KnowledgeArticleCreate(BaseModel):
    title: str
    content: str
    category: str
    tags: List[str] = []

#─── Helper function to hash password ───
def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


# Helper function to verify password
def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))


# Helper function to get user from token
async def get_current_user(request: Request) -> User:
    """
    Reads session_token from cookie first, then Authorization header,
    then ?token= query param (for WebSocket upgrade requests).
    """
    # Check cookie first, then Authorization header as fallback
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.replace("Bearer ", "")
        
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    # Find session
    session_doc = await db.user_sessions.find_one(
        {"session_token": session_token},
        {"_id": 0}
    )
    
    if not session_doc:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    # Check expiry
    expires_at = session_doc["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    
    # Get user
    user_doc = await db.users.find_one(
        {"user_id": session_doc["user_id"]},
        {"_id": 0, "password": 0}
    )
    
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Convert datetime if needed
    if isinstance(user_doc['created_at'], str):
        user_doc['created_at'] = datetime.fromisoformat(user_doc['created_at'])
    
    return User(**user_doc)


# ─── RBAC Helper ──────────────────────────────────────────────────────────────

class RoleChecker:
    """
    Dependency that enforces role access on a route.
    Usage:
        @router.get("/hospitals")
        async def list_hospitals(user = Depends(RoleChecker([UserRole.SUPERADMIN]))):
            ...
    """
    def __init__(self, allowed_roles: list[UserRole]):
        self.allowed_roles = allowed_roles

    async def __call__(self, request: Request) -> User:
        user = await get_current_user(request)
        if user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Role '{user.role}' is not permitted for this action"
            )
        return user


# Helper to ensure user belongs to the requested hospital
def require_same_hospital(user: User, hospital_id: str):
    """
    For patients and admins: must belong to the same hospital.
    Superadmins can access any hospital.
    """
    if user.role == UserRole.SUPERADMIN:
        return
    if user.hospital_id != hospital_id:
        raise HTTPException(status_code=403, detail="You do not belong to this hospital")


async def log_activity(user_id: str, user_name: str, action: str, entity_type: str, entity_name: str, description: str):
    activity_id = f"act_{uuid.uuid4().hex[:12]}"
    await db.activities.insert_one({
        "activity_id": activity_id,
        "user_id": user_id,
        "user_name": user_name,
        "action": action,
        "entity_type": entity_type,
        "entity_name": entity_name,
        "description": description,
        "created_at": datetime.now(timezone.utc).isoformat()
    })

async def send_email(to_email: str, subject: str, html_content: str):
    logging.warning("Email sending not configured")
    return None


# ══════════════════════════════════════════════════════════════════════════════
# AWS-SCALABLE VALKEY CACHE INVALIDATION
# ══════════════════════════════════════════════════════════════════════════════

async def invalidate_device_cache(device_serial: str):
    """
    Clears the distributed Valkey cache whenever a device is assigned or unassigned.
    Forces all AWS nodes/containers to pull the fresh assignment from MongoDB.
    """
    if valkey_manager.client:
        try:
            await valkey_manager.client.delete(f"route:{device_serial}")
            logger.info(f"Cleared distributed routing cache for device: {device_serial}")
        except Exception as e:
            logger.error(f"Failed to clear cache for {device_serial}: {e}")

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 2 — DEVICE SERVICE HELPERS & REAL-TIME CACHING
# ══════════════════════════════════════════════════════════════════════════════

# OPTIMIZATION: Ultra-fast O(1) Memory Resolve pulling exclusively from Valkey
async def resolve_telemetry(patient_id: str) -> dict:
    """
    Queries Valkey memory cache for real-time vitals, sleep, and alerts.
    Falls back to concurrent MongoDB queries if the cache expires.
    Injects precise online/offline status dynamically without database polling.
    """
    if db is None or telemetry_db is None:
        return {
            "source": "empty", 
            "no_device": True, 
            "device_type": "sleep_monitor",
            "reason": "Database unavailable"
        }

    device = await db.devices.find_one(
        {"assigned_patient_id": patient_id},
        {"_id": 0}
    )
    if not device:
        return {
            "source": "empty",
            "no_device": True,
            "device_type": "sleep_monitor",
            "reason": "No device assigned to this patient"
        }

    device_serial = device["device_serial"]
    device_type = device.get("device_type") or "sleep_monitor"

    vitals_doc, sleep_doc, alerts_doc = None, None, None

    # 1. OPTIMIZATION: Ultra-fast RAM MGET for completely reducing Dashboard Latency
    if valkey_manager.client:
        try:
            keys = [
                f"telemetry:vitals:{device_serial}",
                f"telemetry:sleep:{device_serial}",
                f"telemetry:alerts:{device_serial}"
            ]
            cached_vals = await valkey_manager.client.mget(keys)
            if cached_vals[0]: vitals_doc = json.loads(cached_vals[0])
            if cached_vals[1]: sleep_doc = json.loads(cached_vals[1])
            if cached_vals[2]: alerts_doc = json.loads(cached_vals[2])
        except Exception as e:
            logger.warning(f"Valkey cache read failed for {device_serial}: {e}")

    # 2. OPTIMIZATION: Run concurrent MongoDB Fallback Queries if Cache is completely empty
    if not vitals_doc and not sleep_doc and not alerts_doc:
        vitals_task = telemetry_db.vitals.find_one({"device_id": device_serial}, sort=[("ts", -1)], projection={"_id": 0})
        sleep_task = telemetry_db.sleep.find_one({"device_id": device_serial}, sort=[("ts", -1)], projection={"_id": 0})
        alerts_task = telemetry_db.alerts.find_one({"device_id": device_serial}, sort=[("ts", -1)], projection={"_id": 0})

        vitals_doc, sleep_doc, alerts_doc = await asyncio.gather(vitals_task, sleep_task, alerts_task)

    # ──────────────────────────────────────────────────────────────────────────
    # CRITICAL DEPENDENCY: DYNAMIC MONGO/VALKEY UNWRAPPING GUARD
    # If the documents are wrapped in our Event Envelope pattern, we unwrap them
    # concurrently here to ensure extraction logic and chart history remain 100% flat.
    # ──────────────────────────────────────────────────────────────────────────
    if vitals_doc and "payload" in vitals_doc:
        vitals_doc = {**vitals_doc["payload"], "event_type": vitals_doc.get("event_type"), "device_id": vitals_doc.get("device_id") or device_serial}
    if sleep_doc and "payload" in sleep_doc:
        sleep_doc = {**sleep_doc["payload"], "event_type": sleep_doc.get("event_type"), "device_id": sleep_doc.get("device_id") or device_serial}
    if alerts_doc and "payload" in alerts_doc:
        alerts_doc = {**alerts_doc["payload"], "event_type": alerts_doc.get("event_type"), "device_id": alerts_doc.get("device_id") or device_serial}

    # Trigger safe early return overlay if no telemetry frames exist across any collection
    if not vitals_doc and not sleep_doc and not alerts_doc:
        return {
            "source": "empty",
            "no_device": False,
            "device_serial": device_serial,
            "device_type": device_type,
            "reason": "Device assigned but no telemetry received yet",
            "is_online": False
        }

    # Extract clean epochs from MongoDB Int64 / $numberLong representations (millis vs seconds)
    def extract_epoch(doc: dict) -> int:
        if not doc:
            return 0
        epoch_val = doc.get("epoch")
        if epoch_val and isinstance(epoch_val, (int, float)):
            return int(epoch_val // 1000) if epoch_val > 9999999999 else int(epoch_val)
            
        ts_val = doc.get("ts")
        if ts_val:
            if isinstance(ts_val, dict) and "$numberLong" in ts_val:
                val = int(ts_val["$numberLong"])
                return val // 1000 if val > 9999999999 else val
            elif isinstance(ts_val, (int, float)):
                return int(ts_val // 1000) if ts_val > 9999999999 else int(ts_val)
        return 0

    vitals_epoch = extract_epoch(vitals_doc)
    sleep_epoch = extract_epoch(sleep_doc)
    alerts_epoch = extract_epoch(alerts_doc)

    # Establish the most recent active epoch
    max_epoch = max(vitals_epoch, sleep_epoch, alerts_epoch)
    if max_epoch <= 0:
        max_epoch = int(datetime.now(timezone.utc).timestamp())

    iso_timestamp = datetime.fromtimestamp(max_epoch, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # 3. OPTIMIZATION: Real-time latency check for TRUE online/offline Status Tracking
    current_epoch = int(datetime.now(timezone.utc).timestamp())
    is_online = (current_epoch - max_epoch) < 60  # Marked Offline if silent for 60 seconds

    # Map fields safely into the frontend contract dictionary
    merged = {
        "device_id": device_serial,
        "device_type": device_type,  
        "epoch": max_epoch,
        "iso_timestamp": iso_timestamp,
        "schema": "vitals",
        "is_online": is_online,
        
        # Existing Vital Fields...
        "hr": vitals_doc.get("hr") if vitals_doc else None,
        "br": vitals_doc.get("br") if vitals_doc and vitals_doc.get("br") is not None else (vitals_doc.get("rr") if vitals_doc else None),
        "bp": vitals_doc.get("bp") if vitals_doc and vitals_doc.get("bp") is not None else ({"systolic": vitals_doc.get("sys"), "diastolic": vitals_doc.get("dia")} if vitals_doc and (vitals_doc.get("sys") is not None or vitals_doc.get("dia") is not None) else None),
        "temp": vitals_doc.get("temp") if vitals_doc else None,
        "spo2": vitals_doc.get("spo2") if vitals_doc and vitals_doc.get("spo2") is not None else (vitals_doc.get("bh") if vitals_doc else None),
        "lx": vitals_doc.get("lux") if vitals_doc and vitals_doc.get("lux") is not None else (vitals_doc.get("lx", 0.0) if vitals_doc else 0.0),
        "human_detected": vitals_doc.get("human_detected") if vitals_doc and vitals_doc.get("human_detected") is not None else (vitals_doc.get("hu", False) if vitals_doc else False),
        "distance": vitals_doc.get("distance") if vitals_doc and vitals_doc.get("distance") is not None else (vitals_doc.get("di", 0.0) if vitals_doc else 0.0),
        "uptime_ms": vitals_doc.get("uptime_ms", 0) if vitals_doc else 0,
        
        # Alert Payload Fields Mapping
        "al": alerts_doc.get("al", "OK") if alerts_doc else "OK",
        "fl": alerts_doc.get("fl", False) if alerts_doc else False,
        "fs": alerts_doc.get("fs", "NONE") if alerts_doc else "NONE",
        "bx": alerts_doc.get("bx", False) if alerts_doc else False,
        "im": alerts_doc.get("im", False) if alerts_doc else False,
        "po": alerts_doc.get("po", False) if alerts_doc else False,
        "dt": alerts_doc.get("dt", False) if alerts_doc else False,
        "rl": alerts_doc.get("rl", False) if alerts_doc else False,
        "mp": alerts_doc.get("mp", False) if alerts_doc else False,
        
        # Sleep Payload Fields Mapping
        "sa": sleep_doc.get("sa", False) if sleep_doc else False,
        "sg": sleep_doc.get("sg", "UNKNOWN") if sleep_doc else "UNKNOWN",
        "qq": sleep_doc.get("qq") if sleep_doc else (sleep_doc.get("bb") if sleep_doc else None),
        "di": sleep_doc.get("di", False) if sleep_doc else False,
        "sr": sleep_doc.get("sr", False) if sleep_doc else False,
        "sleeping": False,
    }

    # Order our available collection documents chronologically to overlay values sequentially
    docs_with_epochs = []
    if vitals_doc:
        docs_with_epochs.append((vitals_epoch, vitals_doc))
    if sleep_doc:
        docs_with_epochs.append((sleep_epoch, sleep_doc))
    if alerts_doc:
        docs_with_epochs.append((alerts_epoch, alerts_doc))

    # Sort ascending so newest documents' properties overwrite older ones
    docs_with_epochs.sort(key=lambda x: x[0])

    for _, doc in docs_with_epochs:
        for k, v in doc.items():
            if k == "_id":
                continue
            # Let the outer frame construct and own timestamps
            if k in ["epoch", "ts", "iso_timestamp", "iso"]:
                continue
            merged[k] = v

    # Post-merge key validation checks (Specifically guard device_type)
    final_device_type = merged.get("device_type") or merged.get("dv") or device_type
    if not isinstance(final_device_type, str) or not final_device_type.strip():
        final_device_type = "sleep_monitor"
    merged["device_type"] = final_device_type

    # Force fallback support for nested structures
    if "bp" not in merged and "bp" in (vitals_doc or {}):
        merged["bp"] = vitals_doc["bp"]
    if "temp" not in merged and "temp" in (vitals_doc or {}):
        merged["temp"] = vitals_doc["temp"]
    if "spo2" not in merged and "spo2" in (vitals_doc or {}):
        merged["spo2"] = vitals_doc["spo2"]

    # Normalize state triggers
    if "sg" in merged:
        merged["sleeping"] = merged["sg"] != "AWAKE"

    merged["heartbeat_confidence"] = float(merged.get("heartbeat_confidence", merged.get("cf", 90.0)))
    merged["breath_confidence"] = float(merged.get("breath_confidence", merged.get("cf", 85.0)))
    merged["confidence"] = float(merged.get("confidence", merged.get("cf", 0.95)))
    
    if "sleep_quality" not in merged and "sq" in merged:
        merged["sleep_quality"] = merged["sq"]
    merged["source"] = "live"
    merged["no_device"] = False

    return merged


def validate_device_available(device_doc: dict):
    """Raises 409 if device is already assigned to a patient."""
    if device_doc.get("assigned_patient_id") is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Device is already assigned to patient {device_doc['assigned_patient_id']}"
        )


async def validate_patient_has_no_device(patient_id: str):
    """Raises 409 if the patient already has an active device."""
    existing = await db.devices.find_one(
        {"assigned_patient_id": patient_id},
        {"_id": 0, "device_serial": 1}
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Patient already has an active device: {existing['device_serial']}"
        )


def validate_hospital_match(current_user: User, device_doc: dict):
    """Raises 403 if non-superadmin user's hospital doesn't match the device's hospital."""
    if current_user.role == UserRole.SUPERADMIN:
        return
    if device_doc.get("hospital_id") != current_user.hospital_id:
        raise HTTPException(
            status_code=403,
            detail="Device does not belong to your hospital"
        )


def can_assign_devices_check(user: User):
    """Raises 403 unless user is superadmin, hospital_admin, or staff with can_assign_devices=True."""
    if user.role in [UserRole.SUPERADMIN, UserRole.HOSPITAL_ADMIN]:
        return
    if user.role == UserRole.STAFF and user.can_assign_devices:
        return
    raise HTTPException(
        status_code=403,
        detail="You do not have permission to assign devices to patients"
    )

# OPTIMIZATION: Processes all device synchronizations concurrently using a Semaphore limits
async def sync_single_device(device, semaphore: asyncio.Semaphore):
    async with semaphore:
        try:
            # Check the latest timestamp from vitals collection inside vitals_monitoring
            latest_vitals = await telemetry_db.vitals.find_one(
                {"device_id": device["device_serial"]},
                sort=[("ts", -1)],
                projection={"_id": 0, "iso": 1}
            )
            if latest_vitals:
                now_iso = datetime.now(timezone.utc).isoformat()
                iso_val = latest_vitals.get("iso") or now_iso
                await db.devices.update_one(
                    {"device_serial": device["device_serial"]},
                    {"$set": {
                        "last_seen": iso_val,
                        "updated_at": now_iso
                    }}
                )
        except Exception as e:
            logger.error(f"sync_single_device error for {device.get('device_serial')}: {e}")

async def sync_last_seen():
    """
    Background task: every 10s syncs devices.last_seen from latest vitals_monitoring doc.
    OPTIMIZATION: Re-architected task queue to run concurrent gather cycles.
    """
    sem = asyncio.Semaphore(50)  # Limit concurrent tasks to avoid DB execution bottlenecking
    while True:
        try:
            await asyncio.sleep(10)
            if db is None or telemetry_db is None:
                continue

            assigned = await db.devices.find(
                {"assigned_patient_id": {"$ne": None}},
                {"device_serial": 1, "_id": 0}
            ).to_list(1000)

            if not assigned:
                continue

            # Run all updates concurrently
            tasks = [sync_single_device(device, sem) for device in assigned]
            await asyncio.gather(*tasks, return_exceptions=True)
        except Exception as e:
            logger.warning(f"sync_last_seen scheduler error: {e}")


#──────────────────────────────────────── Email templates───────────────────────────────────────────
def get_password_reset_email(user_name: str, reset_token: str):
    return f"""
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4F46E5;">Password Reset Request</h2>
            <p>Hello {user_name},</p>
            <p>You requested a password reset for your OLT Innovations account.</p>
            <p>Your reset token is:</p>
            <div style="background: #F3F4F6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <code style="font-size: 14px; word-break: break-all;">{reset_token}</code>
            </div>
            <p>This token expires in <strong>1 hour</strong>.</p>
            <p>To reset your password:</p>
            <ol>
                <li>Go to the login page</li>
                <li>Click "Forgot Password?"</li>
                <li>Click "Already have a token? Enter it here"</li>
                <li>Enter the token above and your new password</li>
            </ol>
            <p>If you didn't request this reset, please ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;">
            <p style="color: #6B7280; font-size: 12px;">OLT Innovations - Operations Management System</p>
        </div>
    </body>
    </html>
    """


# ─────────────────────────────────────────── Auth Routes/register-admin ───────────────────────────────────────────
@api_router.post("/auth/register-admin")
async def register_admin(admin_data: AdminRegister, response: Response):
    # 1. Parallelize existence checks (or rely on Unique Indexes in DB)
    # Checking both at once reduces latency.
    existing_check = await db.users.find_one({
        "$or": [
            {"role": UserRole.SUPERADMIN.value},
            {"username": admin_data.username}
        ]
    })   
    
    if existing_check:
        if existing_check.get("role") == UserRole.SUPERADMIN.value:
            raise HTTPException(status_code=400, detail="Admin already exists")
        raise HTTPException(status_code=400, detail="Username already taken")
    
    # Create admin & session for the user
    admin_id = f"olt_{uuid.uuid4().hex[:12]}"
    session_token = f"session_{uuid.uuid4().hex}"
    now = datetime.now(timezone.utc)
    
    # 2. Prepare documents
    user_doc = {
        "user_id": admin_id,
        "username": admin_data.username,
        "password": hash_password(admin_data.password),
        "email": admin_data.email,
        "name": admin_data.name,
        "picture": None,
        "role": UserRole.SUPERADMIN.value,
        "created_at": now.isoformat(),
        "is_default": True if not existing_check else False
    }
    
    # Create session for the user
    session_doc = {
        "user_id": admin_id,
        "session_token": session_token,
        "expires_at": now + timedelta(days=7),
        "created_at": now
    }

    # 3. Robust Sequential Insert with Manual Rollback (Compatible with Standalone MongoDB and Replica Sets)
    try:
        await db.users.insert_one(user_doc)
        await db.user_sessions.insert_one(session_doc)
        await db.company_settings.insert_one({
            "company_name": admin_data.company_name,
            "created_at": now
        })
    except DuplicateKeyError:
        # Catch duplicate write race conditions and clean up cleanly
        await db.users.delete_one({"user_id": admin_id})
        await db.user_sessions.delete_one({"session_token": session_token})
        raise HTTPException(status_code=400, detail="User or Admin already exists")
    except Exception as e:
        # Rollback insert pipeline to maintain state consistency
        await db.users.delete_one({"user_id": admin_id})
        await db.user_sessions.delete_one({"session_token": session_token})
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=_SECURE_COOKIES,
        samesite="none" if _SECURE_COOKIES else "lax",
        path="/",
        max_age=7 * 24 * 60 * 60
    )
    
    # Clean up for response
    user_doc.pop("password", None)
    user_doc.pop("_id", None) # OPTIMIZATION: pop newly inserted '_id' field containing PyMongo ObjectID to prevent serialisation errors
    return {**user_doc, "session_token": session_token}

# ───────────── Auth Routes/Login ───────────────────────────────────────────
@api_router.post("/auth/login")
async def login(login_data: LoginRequest, response: Response):
    # 1. Single database lookup using $or
    user_doc = await db.users.find_one({
        "$or": [
            {"username": login_data.username},
            {"email": login_data.username}
        ]
    }, {"_id": 0})
    
    # 2. Prevent Timing Attacks & CPU Blocking
    # Use a dummy hash if user doesn't exist so execution time remains identical
    dummy_hash = "$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36Xvyw162v.zfeC3N9EaC.i" # Example bcrypt dummy string
    db_hash = user_doc["password"] if user_doc else dummy_hash
    
    # Assuming verify_password is CPU-intensive (e.g., bcrypt/argon2),
    # run it in a threadpool to keep the async event loop completely unblocked.
    is_password_correct = await run_in_threadpool(verify_password, login_data.password, db_hash)
    
    if not user_doc or not is_password_correct:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Invalid email/username or password"
        )
    # 3. Create session tokens & Timestamps
    session_token = f"session_{uuid.uuid4().hex}"
    now = datetime.now(timezone.utc)
    
    await db.user_sessions.insert_one({
        "user_id": user_doc["user_id"],
        "session_token": session_token,
        "expires_at": now + timedelta(days=7),
        "created_at": now
    })
    
    # 4. Set cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=_SECURE_COOKIES,
        samesite="none" if _SECURE_COOKIES else "lax",
        path="/",
        max_age=7 * 24 * 60 * 60
    )
    
    if isinstance(user_doc['created_at'], str):
        user_doc['created_at'] = datetime.fromisoformat(user_doc['created_at'])
    
    # 5. Clean up and return response
    user_doc.pop("password", None)
    user_response = User(**user_doc).model_dump()
    user_response['session_token'] = session_token
    return user_response

# ────── Auth Routes/Create User ───────────────────────────────────────────
@api_router.post("/api/auth/create-user")
@api_router.post("/auth/create-user")
async def create_team_member(user_data: UserCreate, request: Request):
    current_user = await get_current_user(request)

    allowed_to_create = ROLE_CREATE_PERMISSIONS.get(current_user.role, [])
    if user_data.role not in allowed_to_create:
        raise HTTPException(status_code=403, detail=f"Role '{current_user.role}' cannot create users with role '{user_data.role}'")

    # Staff creating patients: check can_create_patients permission
    if current_user.role == UserRole.STAFF and user_data.role == UserRole.PATIENT:
        staff_doc = await db.users.find_one(
            {"user_id": current_user.user_id}, {"_id": 0, "can_create_patients": 1}
        )
        if staff_doc and staff_doc.get("can_create_patients") is False:
            raise HTTPException(
                status_code=403,
                detail="You have not been granted permission to create patient accounts. Contact your hospital admin."
            )
    
    # Determine the hospital_id for the new user
    if current_user.role == UserRole.SUPERADMIN:
        # Superadmin must supply hospital_id when creating hospital_admin
        if user_data.role == UserRole.HOSPITAL_ADMIN:
            if not user_data.hospital_id:
                raise HTTPException(status_code=400, detail="hospital_id is required when creating a hospital_admin")
            # Verify the hospital exists
            hospital = await db.hospitals.find_one({"hospital_id": user_data.hospital_id}, {"_id": 0})
            if not hospital:
                raise HTTPException(status_code=404, detail="Hospital not found")
            target_hospital_id = user_data.hospital_id
        else:
            # Superadmin creating another superadmin — no hospital
            target_hospital_id = None
    else:
        # hospital_admin / staff always create users in their OWN hospital
        target_hospital_id = current_user.hospital_id
        if not target_hospital_id:
            raise HTTPException(status_code=400, detail="Your account has no hospital_id assigned")

    # Check if username exists
    if await db.users.find_one({"username": user_data.username}, {"_id": 0}):
        raise HTTPException(status_code=400, detail="Username already taken")
    
    if await db.users.find_one({"email": user_data.email}, {"_id": 0}):
        raise HTTPException(status_code=400, detail="Email already taken")
    
    # Create user
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    user_doc = {
        "user_id": user_id,
        "username": user_data.username,
        "password": hash_password(user_data.password),
        "email": user_data.email,
        "name": user_data.name,
        "picture": None,
        "role": user_data.role.value,
        "hospital_id": target_hospital_id,
        "created_at": now.isoformat()
    }
    
    await db.users.insert_one(user_doc)
    await log_activity(current_user.user_id, current_user.name, "created", "user", user_data.name, f"Created user account: {user_data.username}")
    
    user_doc['created_at'] = now
    del user_doc['password']
    return User(**user_doc)

# ───────────── Auth Routes/check-admin ───────────────────────────────────────────
@api_router.get("/auth/check-admin")
async def check_admin_exists():
    admin = await db.users.find_one({"role": UserRole.SUPERADMIN.value}, {"_id": 0})
    return {"admin_exists": admin is not None}

# ───────────── Auth Routes/change-password ───────────────────────────────────────────
@api_router.post("/auth/change-password")
async def change_password(request: Request):
    user = await get_current_user(request)
    
    body = await request.json()
    current_password = body.get("current_password")
    new_password = body.get("new_password")
    
    if not current_password or not new_password:
        raise HTTPException(status_code=400, detail="Current and new password required")
    
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    
    # Get user with password
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    
    # Verify current password
    if not verify_password(current_password, user_doc["password"]):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    
    # Update password
    new_hashed = hash_password(new_password)
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"password": new_hashed}}
    )
    
    await log_activity(user.user_id, user.name, "updated", "password", "Password", "Changed password")
    
    return {"message": "Password changed successfully"}

# ───────────── Auth Routes/admin-reset-password ──────────────────────────────
@api_router.post("/auth/admin-reset-password")
async def admin_reset_password(request: Request):
    current_user = await get_current_user(request)
    
    if current_user.role not in [UserRole.SUPERADMIN, UserRole.HOSPITAL_ADMIN]:
        raise HTTPException(status_code=403, detail="Only hospital admins and superadmins can reset passwords")
    
    body = await request.json()
    target_user_id = body.get("user_id")
    new_password = body.get("new_password")
    
    if not target_user_id or not new_password:
        raise HTTPException(status_code=400, detail="User ID and new password required")
    
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    
    # Get target user
    target_user = await db.users.find_one({"user_id": target_user_id}, {"_id": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Hospital admin can only reset passwords within their own hospital
    if current_user.role == UserRole.HOSPITAL_ADMIN:
        if target_user.get("hospital_id") != current_user.hospital_id:
            raise HTTPException(status_code=403, detail="Cannot reset password for a user in a different hospital")

    # Update password
    await db.users.update_one(
        {"user_id": target_user_id},
        {"$set": {"password": hash_password(new_password)}}
    )
    
    await log_activity(
        current_user.user_id, 
        current_user.name, 
        "reset", 
        "password", 
        target_user["name"], 
        f"Admin reset password for {target_user['name']}"
    )
    
    return {"message": f"Password reset successfully for {target_user['name']}"}

# ───────────── Auth Routes/password-reset-request ──────────────────────────────
@api_router.post("/auth/request-password-reset")
async def request_password_reset(reset_request: PasswordResetRequest):
    # Find user by username OR email
    user = await db.users.find_one({"username": reset_request.username}, {"_id": 0})
    
    if not user:
        user = await db.users.find_one({"email": reset_request.username}, {"_id": 0})
    
    if not user:
        return {"message": "If this email/username exists, a reset token has been generated. Please contact your administrator for the token."}
    
    # Generate reset token
    reset_token = f"reset_{uuid.uuid4().hex}"
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)  # Token valid for 1 hour
    
    # Store reset token
    await db.password_resets.delete_many({"user_id": user["user_id"]})  # Remove old tokens
    await db.password_resets.insert_one({
        "user_id": user["user_id"],
        "username": user["username"],
        "token": reset_token,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc)
    })
    
    await log_activity(user["user_id"], user["name"], "requested", "password_reset", "Password Reset", f"Password reset requested for {user['username']}")
    
    # Send password reset email
    email_html = get_password_reset_email(user["name"], reset_token)
    await send_email(user["email"], "Password Reset - OLT Innovations", email_html)
    
    return {
        "message": "Password reset token generated and sent to your email.",
        "token": reset_token,
        "expires_in": "1 hour",
        "note": "Check your email for the reset token."
    }

@api_router.post("/auth/reset-password")
async def reset_password_with_token(reset_data: PasswordResetConfirm):
    if len(reset_data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    # Find reset token
    reset_record = await db.password_resets.find_one({"token": reset_data.token}, {"_id": 0})
    
    if not reset_record:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    
    # Check expiry — handle both datetime objects and ISO strings (migration safety)
    expires_at = reset_record["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    if expires_at < datetime.now(timezone.utc):
        await db.password_resets.delete_one({"token": reset_data.token})
        raise HTTPException(status_code=400, detail="Reset token has expired. Please request a new one.")
    
    # Update password
    new_hashed = hash_password(reset_data.new_password)
    await db.users.update_one(
        {"user_id": reset_record["user_id"]},
        {"$set": {"password": new_hashed}}
    )
    
    # Delete used token
    await db.password_resets.delete_one({"token": reset_data.token})
    
    # Get user for logging
    user = await db.users.find_one({"user_id": reset_record["user_id"]}, {"_id": 0})
    if user:
        await log_activity(user["user_id"], user["name"], "reset", "password", "Password", f"Password reset via token for {user['username']}")
    
    return {"message": "Password reset successfully. You can now login with your new password."}

# Admin endpoint to view pending reset tokens
@api_router.get("/auth/pending-resets")
async def get_pending_resets(request: Request):
    current_user = await get_current_user(request)
    
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view pending resets")
    
    # Get all pending reset tokens
    resets = await db.password_resets.find({}, {"_id": 0}).to_list(100)
    
    # Filter out expired ones and add status
    now = datetime.now(timezone.utc)
    result = []
    for reset in resets:
        expires_at = reset["expires_at"]
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        
        if expires_at > now:
            result.append({
                "username": reset["username"],
                "token": reset["token"],
                "expires_at": reset["expires_at"],
                "created_at": reset["created_at"]
            })
        else:
            # Clean up expired token
            await db.password_resets.delete_one({"token": reset["token"]})
    
    return result

@api_router.post("/auth/session")
async def create_session(request: Request, response: Response):
    body = await request.json()
    session_id = body.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    
    # Call Emergent Auth API
    async with httpx.AsyncClient() as client:
        auth_response = await client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
    
    if auth_response.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")
    
    user_data = auth_response.json()
    session_token = user_data["session_token"]
    
    # Check if user exists
    existing_user = await db.users.find_one(
        {"email": user_data["email"]},
        {"_id": 0}
    )
    
    if existing_user:
        user_id = existing_user["user_id"]
        # Update user info
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {
                "name": user_data["name"],
                "picture": user_data.get("picture")
            }}
        )
    else:
        # Create_user
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        
         # First OAuth user becomes superadmin, subsequent ones become patients
        user_count = await db.users.count_documents({})
        default_role = UserRole.SUPERADMIN if user_count == 0 else UserRole.PATIENT
        
        await db.users.insert_one({
            "user_id": user_id,
            "email": user_data["email"],
            "name": user_data["name"],
            "picture": user_data.get("picture"),
            "role": default_role.value,
            "hospital_id": None,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    
    # Create session
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc)
    })
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=_SECURE_COOKIES,
        samesite="none" if _SECURE_COOKIES else "lax",
        path="/",
        max_age=7 * 24 * 60 * 60
    )
    
    # Get full user data
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password": 0})
    if isinstance(user_doc['created_at'], str):
        user_doc['created_at'] = datetime.fromisoformat(user_doc['created_at'])
    
    user_response = User(**user_doc).model_dump()
    user_response['session_token'] = session_token
    return user_response


# ═══════════════════════════════════════════════════════════════════════════════
# HOSPITAL ROUTES  (superadmin only)
# ═══════════════════════════════════════════════════════════════════════════════
 
# New hospital management endpoints
@api_router.post("/hospitals")
async def create_hospital(
    hospital_data: HospitalCreate,
    current_user: User = Depends(RoleChecker([UserRole.SUPERADMIN]))
):
    hospital_id = f"hospital_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
 
    doc = {
        "hospital_id": hospital_id,
        "name": hospital_data.name,
        "address": hospital_data.address,
        "created_by": current_user.user_id,   # set server-side, not from request body
        "created_at": now.isoformat(),
        "is_active": True
    }
    await db.hospitals.insert_one(doc)
    await log_activity(
        current_user.user_id, current_user.name,
        "created", "hospital", hospital_data.name, f"Created hospital: {hospital_data.name}"
    )
    doc["created_at"] = now
    return Hospital(**doc)
 
 
@api_router.get("/hospitals")
async def list_hospitals(
    current_user: User = Depends(RoleChecker([UserRole.SUPERADMIN]))
):
    hospitals = await db.hospitals.find({}, {"_id": 0}).to_list(1000)
    for h in hospitals:
        if isinstance(h.get("created_at"), str):
            h["created_at"] = datetime.fromisoformat(h["created_at"])
    return hospitals

 
@api_router.get("/hospitals/{hospital_id}")
async def get_hospital(hospital_id: str, request: Request):
    current_user = await get_current_user(request)
    require_same_hospital(current_user, hospital_id)
 
    hospital = await db.hospitals.find_one({"hospital_id": hospital_id}, {"_id": 0})
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")
    if isinstance(hospital.get("created_at"), str):
        hospital["created_at"] = datetime.fromisoformat(hospital.get("created_at"))
    return hospital
 

@api_router.patch("/hospitals/{hospital_id}")
async def update_hospital(
    hospital_id: str,
    request: Request,
    current_user: User = Depends(RoleChecker([UserRole.SUPERADMIN]))
):
    body = await request.json()
    allowed_fields = {"is_active", "name", "address"}
    update_data = {k: v for k, v in body.items() if k in allowed_fields}

    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    hospital = await db.hospitals.find_one({"hospital_id": hospital_id}, {"_id": 0})
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")

    await db.hospitals.update_one(
        {"hospital_id": hospital_id},
        {"$set": update_data}
    )
    await log_activity(
        current_user.user_id, current_user.name,
        "updated", "hospital", hospital["name"],
        f"Updated hospital {hospital_id}: {update_data}"
    )

    updated = await db.hospitals.find_one({"hospital_id": hospital_id}, {"_id": 0})
    if isinstance(updated.get("created_at"), str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    return updated


@api_router.delete("/hospitals/{hospital_id}")
async def delete_hospital(
    hospital_id: str,
    current_user: User = Depends(RoleChecker([UserRole.SUPERADMIN]))
):
    hospital = await db.hospitals.find_one({"hospital_id": hospital_id}, {"_id": 0})
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")

    await db.hospitals.delete_one({"hospital_id": hospital_id})
    await log_activity(
        current_user.user_id, current_user.name,
        "deleted", "hospital", hospital["name"],
        f"Deleted hospital: {hospital['name']} ({hospital_id})"
    )
    return {"message": f"Hospital '{hospital['name']}' deleted successfully"}



# ═══════════════════════════════════════════════════════════════════════════════

# get_users is now role-aware
#  - superadmin sees all users (optionally filtered by hospital_id query param)
#  - hospital_admin and staff see only their hospital's users

@api_router.get("/auth/me", response_model=User)
async def get_me(request: Request):
    return await get_current_user(request)

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    # Check cookie first, then Authorization header (matches cross-domain auth pattern)
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.replace("Bearer ", "")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    
    response.delete_cookie("session_token", path="/")
    return {"message": "Logged out successfully"}


# ─────── User Management Routes (Admin only) ─────────────
@api_router.get("/users", response_model=List[User])
async def get_users(
    request: Request,
    hospital_id: Optional[str] = None
):
    current_user = await get_current_user(request)
    
    if current_user.role == UserRole.SUPERADMIN:
        query = {"hospital_id": hospital_id} if hospital_id else {}
    elif current_user.role == UserRole.HOSPITAL_ADMIN or current_user.role == UserRole.STAFF:
        query = {"hospital_id": current_user.hospital_id}
    else:
        raise HTTPException(status_code=403, detail="Only admins can view all users")
        
    users = await db.users.find(query, {"_id": 0, "password": 0}).to_list(1000)
    
    # Convert datetime strings
    for u in users:
        if isinstance(u.get('created_at'), str):
            u['created_at'] = datetime.fromisoformat(u['created_at'])
    
    return users


# ─────── User Management delete user ─────────────
@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, request: Request):
    current_user = await get_current_user(request)

    if current_user.role not in [UserRole.SUPERADMIN, UserRole.HOSPITAL_ADMIN]:
        raise HTTPException(status_code=403, detail="Not authorized")

    user = await db.users.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # 🚫 Block default superadmin
    if user.get("is_default"):
        raise HTTPException(
            status_code=403,
            detail="Default Super Admin cannot be deleted"
        )

    if current_user.role == UserRole.HOSPITAL_ADMIN:
        if user.get("hospital_id") != current_user.hospital_id:
            raise HTTPException(status_code=403, detail="Different hospital")

    await db.users.delete_one({"user_id": user_id})

    return {"message": "User deleted successfully"}

 
# ─────── User Management details ─────────────
@api_router.get("/users/{user_id}", response_model=User)
async def get_user(user_id: str, request: Request):
    current_user = await get_current_user(request)
 
    # Patients can only fetch their own record
    if current_user.role == UserRole.PATIENT and current_user.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
 
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
 
    # Hospital-scoped roles can only see users in their hospital
    if current_user.role in [UserRole.HOSPITAL_ADMIN, UserRole.STAFF]:
        if user_doc.get("hospital_id") != current_user.hospital_id:
            raise HTTPException(status_code=403, detail="Access denied: different hospital")
 
    if isinstance(user_doc.get('created_at'), str):
        user_doc['created_at'] = datetime.fromisoformat(user_doc['created_at'])
    return User(**user_doc)


# ─────── Update Permissions ─────────────
@api_router.patch("/users/{user_id}/permissions")
async def update_permissions(user_id: str, data: StaffPermissionUpdate, request: Request):
    current_user = await get_current_user(request)

    if current_user.role not in [UserRole.SUPERADMIN, UserRole.HOSPITAL_ADMIN]:
        raise HTTPException(status_code=403, detail="Not authorized")

    user = await db.users.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if current_user.role == UserRole.HOSPITAL_ADMIN:
        if user.get("hospital_id") != current_user.hospital_id:
            raise HTTPException(status_code=403, detail="Different hospital")

    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"can_create_patients": data.can_create_patients}}
    )

    return {"message": "Permissions updated"}

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 3 — DEVICE API ROUTES
# ══════════════════════════════════════════════════════════════════════════════


@api_router.post("/devices", status_code=201)
async def register_device(
    device_data: DeviceCreate,
    current_user: User = Depends(RoleChecker([UserRole.SUPERADMIN]))
):
    """Register a new device into the unassigned pool. SuperAdmin only."""
    device_id = f"device_{uuid.uuid4().hex[:16]}"
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    doc = {
        "device_id": device_id,
        "device_serial": device_data.device_serial,
        "device_type": device_data.device_type,
        "firmware_version": device_data.firmware_version,
        "hospital_id": None,
        "assigned_patient_id": None,
        "status": "available",
        "last_seen": None,
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    try:
        await db.devices.insert_one(doc)
    except MongoDuplicateKeyError:
        raise HTTPException(
            status_code=409,
            detail=f"A device with serial '{device_data.device_serial}' already exists"
        )

    await log_activity(
        current_user.user_id, current_user.name,
        "created", "device", device_data.device_serial,
        f"Registered device: {device_data.device_serial} (type={device_data.device_type})"
    )

    doc["created_at"] = now
    doc["updated_at"] = now
    doc.pop("_id", None)
    return Device(**doc)


@api_router.get("/devices")
async def list_devices(
    request: Request,
    hospital_id: Optional[str] = None
):
    """List devices. SuperAdmin=all; HospitalAdmin+Staff=hospital-scoped; Patient=403."""
    current_user = await get_current_user(request)

    if current_user.role == UserRole.PATIENT:
        raise HTTPException(status_code=403, detail="Patients cannot access device management")

    if current_user.role == UserRole.SUPERADMIN:
        query = {"hospital_id": hospital_id} if hospital_id else {}
    else:
        query = {"hospital_id": current_user.hospital_id}

    devices = await db.devices.find(query, {"_id": 0}).to_list(1000)

    result = []
    for d in devices:
        if isinstance(d.get("created_at"), str):
            d["created_at"] = datetime.fromisoformat(d["created_at"])
        if isinstance(d.get("updated_at"), str):
            d["updated_at"] = datetime.fromisoformat(d["updated_at"])
        result.append(Device(**d).model_dump())
    return result


@api_router.get("/devices/{device_id}")
async def get_device(device_id: str, request: Request):
    """Get a single device. SuperAdmin=any; HospitalAdmin+Staff=hospital-scoped."""
    current_user = await get_current_user(request)

    if current_user.role == UserRole.PATIENT:
        raise HTTPException(status_code=403, detail="Access denied")

    device = await db.devices.find_one({"device_id": device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    if current_user.role != UserRole.SUPERADMIN:
        if device.get("hospital_id") != current_user.hospital_id:
            raise HTTPException(status_code=403, detail="Device does not belong to your hospital")

    if isinstance(device.get("created_at"), str):
        device["created_at"] = datetime.fromisoformat(device["created_at"])
    if isinstance(device.get("updated_at"), str):
        device["updated_at"] = datetime.fromisoformat(device["updated_at"])
    return Device(**device)


@api_router.patch("/devices/{device_id}/assign-hospital")
async def assign_hospital(
    device_id: str,
    body: DeviceAssign,
    current_user: User = Depends(RoleChecker([UserRole.SUPERADMIN]))
):
    """Assign a device to a hospital. SuperAdmin only."""
    device = await db.devices.find_one({"device_id": device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    hospital = await db.hospitals.find_one({"hospital_id": body.hospital_id}, {"_id": 0})
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    updated = await db.devices.find_one_and_update(
        {"device_id": device_id},
        {"$set": {
            "hospital_id": body.hospital_id,
            "status": "assigned_to_hospital",
            "updated_at": now_iso
        }},
        return_document=True,
        projection={"_id": 0}
    )

    await log_activity(
        current_user.user_id, current_user.name,
        "assigned", "device", device["device_serial"],
        f"Assigned device {device['device_serial']} to hospital {body.hospital_id}"
    )

    if isinstance(updated.get("created_at"), str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    updated["updated_at"] = now
    return Device(**updated)


@api_router.patch("/devices/{device_id}/assign-patient")
async def assign_patient(device_id: str, body: DeviceAssignToPatient, request: Request):
    """Assign a device to a patient."""
    current_user = await get_current_user(request)
    can_assign_devices_check(current_user)

    device = await db.devices.find_one({"device_id": device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    validate_hospital_match(current_user, device)
    validate_device_available(device)

    # Verify patient exists
    patient = await db.users.find_one(
        {"user_id": body.patient_id, "role": UserRole.PATIENT.value},
        {"_id": 0, "name": 1, "hospital_id": 1}
    )
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Hospital-scoped users can only assign to patients in their own hospital
    if current_user.role != UserRole.SUPERADMIN:
        if patient.get("hospital_id") != current_user.hospital_id:
            raise HTTPException(status_code=403, detail="Patient is in a different hospital")

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    try:
        updated = await db.devices.find_one_and_update(
            {"device_id": device_id, "assigned_patient_id": None},
            {"$set": {
                "assigned_patient_id": body.patient_id,
                "status": "assigned_to_patient",
                "updated_at": now_iso
            }},
            return_document=True,
            projection={"_id": 0}
        )
    except MongoDuplicateKeyError:
        raise HTTPException(
            status_code=409,
            detail="Patient already has an active device assigned"
        )

    if updated is None:
        raise HTTPException(
            status_code=409,
            detail="Device was just assigned by another request"
        )

    await log_activity(
        current_user.user_id, current_user.name,
        "assigned", "device", device["device_serial"],
        f"Assigned device {device['device_serial']} to patient {body.patient_id}"
    )

    # AWS-SCALABLE VALIDATION: Clear the Valkey routing cache immediately so next packets hit DB properly
    await invalidate_device_cache(device["device_serial"])

    if isinstance(updated.get("created_at"), str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    updated["updated_at"] = now
    return Device(**updated)


@api_router.patch("/devices/{device_id}/unassign")
async def unassign_device(device_id: str, request: Request):
    """Unassign device from its patient."""
    current_user = await get_current_user(request)

    if current_user.role not in [UserRole.SUPERADMIN, UserRole.HOSPITAL_ADMIN]:
        raise HTTPException(
            status_code=403,
            detail="Only superadmins and hospital admins can unassign devices"
        )

    device = await db.devices.find_one({"device_id": device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    validate_hospital_match(current_user, device)

    new_status = "assigned_to_hospital" if device.get("hospital_id") else "available"
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    updated = await db.devices.find_one_and_update(
        {"device_id": device_id, "assigned_patient_id": {"$ne": None}},
        {"$set": {
            "assigned_patient_id": None,
            "status": new_status,
            "updated_at": now_iso
        }},
        return_document=True,
        projection={"_id": 0}
    )

    if updated is None:
        raise HTTPException(status_code=409, detail="Device is not currently assigned to any patient")

    await log_activity(
        current_user.user_id, current_user.name,
        "unassigned", "device", device["device_serial"],
        f"Unassigned device {device['device_serial']} from patient"
    )

    # AWS-SCALABLE VALIDATION: Clear the Valkey routing cache immediately so next packets hit DB properly
    await invalidate_device_cache(device["device_serial"])

    if isinstance(updated.get("created_at"), str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    updated["updated_at"] = now
    return Device(**updated)


# ─── Delete Registered Device Endpoint (SuperAdmin Only) ──────────────────────
@api_router.delete("/devices/{device_id}")
async def delete_device(
    device_id: str,
    current_user: User = Depends(RoleChecker([UserRole.SUPERADMIN]))
):
    """Delete a registered device. SuperAdmin only. Relational sanity check enforced."""
    device = await db.devices.find_one({"device_id": device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Guard: Do not allow deletion if the device is currently active on a patient
    if device.get("assigned_patient_id") is not None:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete device while assigned to a patient. Please unassign it first."
        )

    await db.devices.delete_one({"device_id": device_id})
    await log_activity(
        current_user.user_id, current_user.name,
        "deleted", "device", device["device_serial"],
        f"Deleted registered device serial: {device['device_serial']}"
    )
    return {"message": f"Device '{device['device_serial']}' deleted successfully"}


@api_router.get("/patient/device")
async def get_patient_device(
    request: Request,
    patient_id: Optional[str] = None
):
    """Get the device assigned to a patient. Any authenticated user."""
    current_user = await get_current_user(request)

    # Patients always see their own device; privileged roles may pass patient_id param
    target_patient_id = (
        current_user.user_id if current_user.role == UserRole.PATIENT
        else (patient_id or current_user.user_id)
    )

    device = await db.devices.find_one(
        {"assigned_patient_id": target_patient_id},
        {"_id": 0}
    )

    if not device:
        return {"device": None}

    if isinstance(device.get("created_at"), str):
        device["created_at"] = datetime.fromisoformat(device["created_at"])
    if isinstance(device.get("updated_at"), str):
        device["updated_at"] = datetime.fromisoformat(device["updated_at"])
    return {"device": Device(**device).model_dump()}


@api_router.patch("/users/{user_id}/device-permissions")
async def update_device_permissions(
    user_id: str,
    data: DevicePermissionUpdate,
    request: Request
):
    """Update can_assign_devices for a user. SuperAdmin + HospitalAdmin (hospital-scoped)."""
    current_user = await get_current_user(request)

    if current_user.role not in [UserRole.SUPERADMIN, UserRole.HOSPITAL_ADMIN]:
        raise HTTPException(status_code=403, detail="Not authorized")

    target_user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    if current_user.role == UserRole.HOSPITAL_ADMIN:
        if target_user.get("hospital_id") != current_user.hospital_id:
            raise HTTPException(status_code=403, detail="User is in a different hospital")

    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"can_assign_devices": data.can_assign_devices}}
    )

    await log_activity(
        current_user.user_id, current_user.name,
        "updated", "user_permissions", target_user.get("name", user_id),
        f"Set can_assign_devices={data.can_assign_devices} for user {user_id}"
    )

    return {"message": "Device permissions updated"}


# ═══════════════════════════════════════════════════════════════════════════════
# INGESTION GATEWAY DIRECT API
# ═══════════════════════════════════════════════════════════════════════════════

class IngestionPayload(BaseModel):
    device_serial: str
    collection: str
    payload: dict

@api_router.post("/telemetry/ingest", status_code=202)
async def ingest_telemetry(data: IngestionPayload):
    """
    Direct high-speed HTTP telemetry ingest endpoint.
    Maintains clean flat format for real-time events.
    """
    if db is None or telemetry_db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
        
    device = await db.devices.find_one(
        {"device_serial": data.device_serial},
        {"_id": 0, "assigned_patient_id": 1, "device_type": 1}
    )
    patient_id = device.get("assigned_patient_id") if device else None

    data.payload["device_id"] = data.device_serial
    server_ts = datetime.now(timezone.utc).isoformat()
    data.payload["server_ts"] = server_ts

    if patient_id:
        event_payload = {
            **data.payload,
            "source": "live",
            "device_type": device.get("device_type", "sleep_monitor")
        }
        event_payload.pop("_id", None)
        await event_bus.publish(patient_id, event_payload)

    # Cache payload flat representation directly to Valkey
    if valkey_manager.client:
        try:
            event_type = data.payload.get("schema") or data.payload.get("event_type") or data.collection
            await valkey_manager.client.setex(
                f"telemetry:{event_type}:{data.device_serial}",
                3600,
                json.dumps(data.payload)
            )
        except Exception as e:
            logger.warning(f"Failed to cache ingest payload to Valkey: {e}")

    # Fire background database inserts to maintain zero blockages on incoming connections
    collection_name = data.collection if data.collection in ["vitals", "sleep", "alerts"] else "vitals"
    asyncio.create_task(telemetry_db[collection_name].insert_one(data.payload))

    if patient_id:
        asyncio.create_task(db.devices.update_one(
            {"device_serial": data.device_serial},
            {"$set": {"last_seen": server_ts, "updated_at": server_ts}}
        ))

    return {"status": "broadcasted" if patient_id else "queued"}


# ══════════════════════════════════════════════════════════════════════════════
# WEBSOCKET STREAM HANDLERS (AUTHENTICATED - PATIENT ROOM BINDINGS)
# ══════════════════════════════════════════════════════════════════════════════

@api_router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(default=None),
    patient_id: Optional[str] = Query(default=None),
):
    """
    WebSocket real-time telemetry pipeline.
    Uses room isolation for patient scoping to avoid multi-device message leakages.
    """
    logger.info(f"WS connection attempt: patient_id={patient_id}")

    if db is None:
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR, reason="Database unavailable")
        return

    await websocket.accept()

    # ── Auth Phase ──
    auth_token = token

    if not auth_token:
        try:
            # Await auth packet from client within 5s frame
            raw_msg = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
            msg = json.loads(raw_msg)
            if msg.get("type") == "auth":
                auth_token = msg.get("token")
            else:
                await websocket.send_json({"type": "auth_fail", "reason": "Expected auth frame"})
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Expected auth frame")
                return
        except asyncio.TimeoutError:
            await websocket.send_json({"type": "auth_fail", "reason": "Authentication timeout"})
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Auth timeout")
            return
        except Exception as e:
            logger.warning(f"WS Auth Exception: {e}")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Auth error")
            return

    if not auth_token:
        await websocket.send_json({"type": "auth_fail", "reason": "Missing token"})
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing token")
        return

    session_doc = await db.user_sessions.find_one({"session_token": auth_token}, {"_id": 0})
    if not session_doc:
        await websocket.send_json({"type": "auth_fail", "reason": "Invalid token"})
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token")
        return

    expires_at = session_doc.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        await websocket.send_json({"type": "auth_fail", "reason": "Token expired"})
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Token expired")
        return

    await websocket.send_json({"type": "auth_ok"})
    target_patient_id = patient_id or session_doc.get("user_id")

    # Connect client websocket room safely using the robust patient connection method
    await manager.connect_patient(target_patient_id, websocket)

    # DIRECT EVENT -> WS PUSH: Seed the workspace instantly with latest snapshots on mount
    try:
        initial_snapshot = await resolve_telemetry(target_patient_id)
        await websocket.send_json(initial_snapshot)

        # Heartbeat verification loop to protect backend thread allocations
        while True:
            # Blocks waiting for client frames (like ping or dashboard requests)
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
                if msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        logger.info(f"WS Client disconnected cleanly from patient room {target_patient_id}.")
    except Exception as e:
        logger.error(f"WS Exception in patient room {target_patient_id}: {e}")
    finally:
        manager.disconnect_patient(target_patient_id, websocket)


# ══════════════════════════════════════════════════════════════════════════════
# DASHBOARD & HTTP BOOTSTRAP ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@api_router.get("/")
async def root():
    return {"message": "VitalSync Health Monitoring API"}

@api_router.get("/dashboard", response_model=DashboardData)
async def get_dashboard(request: Request):
    """
    HTTP GET /api/dashboard endpoint populated 100% dynamically from the database.
    Used for dashboard bootstrap, SSR hydration, and initial mount renders.
    """
    current_user = await get_current_user(request)
    
    # Resolve metrics from the multi-collection live IoT databases
    # This automatically determines precise "is_online" metrics via Epoch age
    telemetry = await resolve_telemetry(current_user.user_id)
    
    # Base patient profile mapping
    patient_info = Patient(
        id=current_user.user_id,
        name=current_user.name,
        room="Room N/A",
        age=0,
        status="Online" if telemetry.get("is_online") else "Offline"
    )
    
    # Query database User profile to fetch room, age, and admission details
    user_doc = await db.users.find_one({"user_id": current_user.user_id})
    if user_doc:
        patient_info.room = user_doc.get("room") or "Room N/A"
        patient_info.age = user_doc.get("age") or 0
        # If user explicitly had a status like "Discharged", maintain it, else override with Telemetry network state
        user_status = user_doc.get("status")
        if user_status not in ["Admitted", "Online", "Offline"]:
            patient_info.status = user_status or patient_info.status

    # If no device assigned or data streams are fully unpopulated, output empty schema fallback
    if telemetry.get("source") == "empty":
        return DashboardData(
            patient=patient_info,
            vitals=Vitals(
                heart_rate=0,
                heart_rate_status="Unknown",
                respiration_rate=0,
                respiration_status="Unknown",
                sleep_status="Unknown",
                sleep_quality="Unknown",
                fall_detected=False,
                fall_status="Safe"
            ),
            room_status=RoomStatus(
                presence_detected=False,
                distance=0.0,
                light=0,
                temperature=0.0,
                motion="None"
            ),
            device_status=DeviceStatus(
                radar_sensor="Disconnected",
                signal="Offline",
                battery=0
            ),
            alerts=[],
            sleep_quality=SleepQuality(
                total_hours=0.0,
                total_minutes=0,
                deep_sleep_hours=0.0,
                deep_sleep_minutes=0,
                quality_percentage=0,
                quality_label="Unknown"
            ),
            activity_level=ActivityLevel(
                movement="None",
                steps=0
            ),
            heart_rate_history=[],
            respiration_history=[],
            timestamp=datetime.now(timezone.utc).isoformat()
        )
    
    # Query historical vitals collection to construct chart metrics natively
    hr_history = []
    rr_history = []
    device = await db.devices.find_one({"assigned_patient_id": current_user.user_id})
    if device:
        # OPTIMIZATION: Leverages compound index [device_id, epoch] to prevent in-memory sort blocking
        cursor = telemetry_db.vitals.find(
            {"device_id": device["device_serial"]},
            projection={"_id": 0, "epoch": 1, "hr": 1, "br": 1, "payload": 1}
        ).sort("epoch", -1).limit(24)
        history_logs = await cursor.to_list(24)
        history_logs.reverse()
        for log in history_logs:
            # Unwrap history document if enveloped
            target_log = log["payload"] if "payload" in log else log
            epoch = target_log.get("epoch") or log.get("epoch") or 0
            time_label = datetime.fromtimestamp(epoch, tz=timezone.utc).strftime("%H:%M")
            hr_history.append({"time": time_label, "value": target_log.get("hr") or 0})
            rr_history.append({"time": time_label, "value": target_log.get("br") or target_log.get("rr") or 0})
    
    # Return genuine consolidated data payload mapped directly from database documents
    return DashboardData(
        patient=patient_info,
        vitals=Vitals(
            heart_rate=telemetry.get("hr") or 0,
            heart_rate_status="Normal" if 60 <= (telemetry.get("hr") or 0) <= 90 else "Warning",
            respiration_rate=telemetry.get("br") or telemetry.get("rr") or 0,
            respiration_status="Steady" if 12 <= (telemetry.get("br") or telemetry.get("rr") or 0) <= 20 else "Warning",
            sleep_status="Deep Sleep" if telemetry.get("sleeping") else "Awake",
            sleep_quality=telemetry.get("sleep_quality_label") or "Stable",
            fall_detected=telemetry.get("fl") or False,
            fall_status="Fall Detected" if telemetry.get("fl") else "Safe"
        ),
        room_status=RoomStatus(
            presence_detected=telemetry.get("human_detected") or False,
            distance=telemetry.get("distance") or 0.0,
            light=int(telemetry.get("lux") or 0),
            temperature=telemetry.get("temp") or 0.0,
            motion="Active" if telemetry.get("human_detected") else "None"
        ),
        device_status=DeviceStatus(
            radar_sensor="Connected",
            signal="Online" if telemetry.get("is_online") else "Offline",
            battery=int(telemetry.get("bb") or 100)
        ),
        alerts=[],
        sleep_quality=SleepQuality(
            total_hours=0.0,
            total_minutes=0,
            deep_sleep_hours=0.0,
            deep_sleep_minutes=0,
            quality_percentage=int((telemetry.get("sleep_quality") or telemetry.get("qq") or 0.0)),
            quality_label="Good" if (telemetry.get("sleep_quality") or telemetry.get("qq") or 0.0) > 70.0 else "Fair"
        ),
        activity_level=ActivityLevel(
            movement="Low" if telemetry.get("sleeping") else "Moderate",
            steps=0
        ),
        heart_rate_history=hr_history,
        respiration_history=rr_history,
        timestamp=telemetry.get("iso_timestamp") or datetime.now(timezone.utc).isoformat()
    )


@api_router.get("/patients")
async def get_patients(request: Request):
    current_user = await get_current_user(request)
    # Patients can only see their own record; others see hospital-scoped list
    if current_user.role == UserRole.PATIENT:
        patients = await db.users.find(
            {"user_id": current_user.user_id, "role": UserRole.PATIENT.value},
            {"_id": 0, "password": 0}
        ).to_list(1)
    elif current_user.role == UserRole.SUPERADMIN:
        patients = await db.users.find(
            {"role": UserRole.PATIENT.value},
            {"_id": 0, "password": 0}
        ).to_list(1000)
    else:
        # hospital_admin / staff — scoped to their hospital
        patients = await db.users.find(
            {"role": UserRole.PATIENT.value, "hospital_id": current_user.hospital_id},
            {"_id": 0, "password": 0}
        ).to_list(1000)
    # Normalise created_at before returning
    for p in patients:
        if isinstance(p.get("created_at"), str):
            p["created_at"] = datetime.fromisoformat(p["created_at"])
    return patients


# ─── HTTP Polling Endpoint ─── FALLBACK: real telemetry only, no mock ────────────
@api_router.get("/dashboard-stream")
async def get_dashboard_stream(
    request: Request,
    patient_id: Optional[str] = Query(default=None)
):
    """
    Polling fallback: returns real telemetry from vitals_monitoring via resolve_telemetry().
    """
    current_user = await get_current_user(request)  # raises 401/403 if invalid
    # Patients always get their own data; privileged roles may specify a patient_id
    target_patient_id = (
        patient_id
        if patient_id and current_user.role != UserRole.PATIENT
        else current_user.user_id
    )
    return await resolve_telemetry(target_patient_id)


# ═════════════════════════════════════════════════════════════════════════
# INFINITE REALTIME CHART HISTORY ENDPOINT (OPTIMIZED FOR ZERO-STATE & HISTORY)
# ═════════════════════════════════════════════════════════════════════════

WINDOW_MAP = {
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "3h": 10800,
    "6h": 21600,
    "12h": 43200,
    "24h": 86400
}

def normalize_telemetry_point(doc: dict) -> dict:
    """Standardizes disparate hardware shortcodes into clean output formats including Zeros."""
    iso_val = doc.get("iso_timestamp") or doc.get("iso")
    if not iso_val and doc.get("ts"):
        ts_val = doc["ts"]
        if isinstance(ts_val, dict) and "$numberLong" in ts_val:
            ts_val = int(ts_val["$numberLong"])
        iso_val = datetime.fromtimestamp(ts_val / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    return {
        "event_id": doc.get("event_id"),
        "epoch": doc.get("epoch"),
        "timestamp": iso_val or datetime.now(timezone.utc).isoformat(),
        "iso_timestamp": iso_val,
        "hr": doc.get("hr") or doc.get("heart_rate") or doc.get("pulse") or 0,
        "spo2": doc.get("spo2") or doc.get("oxygen") or 0,
        "br": doc.get("br") or doc.get("rr") or doc.get("resp_rate") or 0,
        "temp": doc.get("temp") or doc.get("temperature") or 0,
        "al": doc.get("al") or "OK",
        "heartbeat_confidence": doc.get("heartbeat_confidence") or 0,
        "breath_confidence": doc.get("breath_confidence") or 0,
        "sleep_quality": doc.get("sleep_quality") or 0
    }

@api_router.get("/patients/{patient_id}/telemetry-history")
@api_router.get("/patients/{patient_id}/chart-history")
async def get_patient_telemetry_history(
    patient_id: str, 
    request: Request, 
    limit: int = Query(default=200, le=1000),
    window: Optional[str] = Query(default=None)
):
    """
    Fetches the historical telemetry logs for a patient's assigned device.
    Supports Infinite Realtime Chart architecture mapping seamlessly backwards and forwards.
    """
    current_user = await get_current_user(request)
    # Check hospital scoping for non-superadmin users
    if current_user.role != UserRole.SUPERADMIN:
        target_patient = await db.users.find_one({"user_id": patient_id})
        if target_patient and target_patient.get("hospital_id") != current_user.hospital_id:
            raise HTTPException(status_code=403, detail="Unauthorized access to patient history")
            
    # Resolve patient's assigned device
    device = await db.devices.find_one({"assigned_patient_id": patient_id})
    if not device:
        # Ensures chart frontend mounts instantly with clean array even if device doesn't exist
        return {"success": True, "count": 0, "history": []}
        
    device_serial = device["device_serial"]
    query = {"device_id": device_serial}
    current_epoch = int(datetime.now(timezone.utc).timestamp())

    # OPTIMIZATION: Process Time Window Truncation (5m - 24h)
    if window:
        if window not in WINDOW_MAP:
            return Response(
                content=json.dumps({"success": False, "message": "Invalid window parameter"}), 
                status_code=400, media_type="application/json"
            )
        cutoff_epoch = current_epoch - WINDOW_MAP[window]
        query["epoch"] = {"$gte": cutoff_epoch}
        limit = 5000  # Expand limits safely if fetching deep chronological windows
    
    # OPTIMIZATION: Uses compound index on [device_id, epoch] to avoid in-memory memory sorting
    cursor = telemetry_db.vitals.find(
        query,
        projection={"_id": 0, "event_id": 1, "iso_timestamp": 1, "iso": 1, "ts": 1, "epoch": 1, "hr": 1, "br": 1, "spo2": 1, "heartbeat_confidence": 1, "breath_confidence": 1, "sleep_quality": 1, "payload": 1}
    ).sort("epoch", -1).limit(limit)
    
    logs = await cursor.to_list(limit)
    
    # Format, unwrap and reverse list so records run chronologically (oldest to newest) required for Charts
    history_points = []
    for log in logs:
        # Resolve dynamic envelope unwrap
        target_doc = log["payload"] if "payload" in log else log
        if "epoch" not in target_doc and "epoch" in log:
            target_point = {**target_doc, "epoch": log["epoch"], "event_id": log.get("event_id")}
        else:
            target_point = target_doc
        history_points.append(normalize_telemetry_point(target_point))
        
    history_points.reverse()
    
    return {
        "success": True,
        "count": len(history_points),
        "history": history_points
    }

# ══════════════════════════════════════════════════════════════════════════════
# LIFECYCLE BACKGROUND LOOPS AND SHUTDOWN LOGIC
# ══════════════════════════════════════════════════════════════════════════════

_ALWAYS_ALLOWED: list[str] = [
    "https://sleep-monitoring-frontend.vercel.app",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8001",
]

_env_origins_raw = os.environ.get("CORS_ORIGINS", "")
_env_origins: list[str] = [
    o.strip() for o in _env_origins_raw.split(",") if o.strip()
] if _env_origins_raw.strip() else []

_allowed_origins: list[str] = list({
    o for o in (_ALWAYS_ALLOWED + _env_origins)
    if o and o != "*"
})

logger.info(f"CORS allowed_origins={_allowed_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(api_router)


async def valkey_telemetry_subscriber():
    """
    AWS-SCALABLE: Uses an isolated Valkey client for Pub/Sub wire listening, 
    and the global valkey_manager.client for ultra-fast distributed caching.
    Includes memory caching for `/dashboard` hydration and robust retry-sentinel looping.
    """
    logger.info("Starting Valkey Telemetry Subscriber...")
    channel = os.environ.get("VALKEY_CHANNEL", "hospital.telemetry.events")
    
    valkey_kwargs = {
        "host": os.environ.get("VALKEY_HOST", "localhost"),
        "port": int(os.environ.get("VALKEY_PORT", 6379)),
        "decode_responses": True,
        "health_check_interval": 30,
        "retry_on_timeout": True
    }
    
    # Secure Password Checking: Bypasses blank/null AUTH attempts
    raw_pwd = os.environ.get("VALKEY_PASSWORD")
    if raw_pwd and isinstance(raw_pwd, str):
        clean_pwd = raw_pwd.strip()
        if clean_pwd and clean_pwd.lower() not in ["none", "null"]:
            valkey_kwargs["password"] = clean_pwd
            
    while True:
        pubsub_client = None
        try:
            pubsub_client = valkey.Valkey(**valkey_kwargs)
            pubsub = pubsub_client.pubsub()
            await pubsub.subscribe(channel)
            
            logger.info(f"Successfully subscribed to Valkey channel: {channel}")
            
            async for message in pubsub.listen():
                if message["type"] == "message":
                    try:
                        payload = json.loads(message["data"])
                        
                        # ──────────────────────────────────────────────────────────
                        # CRITICAL DEPENDENCY: DYNAMIC IN-MEMORY TELEMETRY UNWRAPPING
                        # If this message is wrapped in an event envelope, extract the flat inner payload
                        # immediately so React elements do not experience key dropouts.
                        # ──────────────────────────────────────────────────────────
                        is_enveloped = "payload" in payload and "event_type" in payload
                        if is_enveloped:
                            envelope = payload
                            payload = envelope["payload"]
                            
                            # Preserve essential event descriptors and routing parameters
                            payload["event_type"] = envelope.get("event_type")
                            payload["timestamp"] = envelope.get("timestamp")
                            
                            # CRITICAL LOGIC CORRECTION: Device Serial matches our primary database mappings.
                            # Ensure we prioritize the true hardware MAC (e.g. BM-...) from the inner payload
                            inner_id = payload.get("device_id") or payload.get("did")
                            outer_id = envelope.get("device_id")
                            
                            if inner_id and "esp" not in str(inner_id).lower():
                                device_serial = inner_id
                            elif outer_id and "esp" not in str(outer_id).lower():
                                device_serial = outer_id
                            else:
                                device_serial = inner_id or outer_id
                                
                            payload["device_id"] = device_serial
                        else:
                            device_serial = payload.get("device_id") or payload.get("did")
                        
                        if not device_serial:
                            continue
                            
                        # ─── OPTIMIZATION: DYNAMIC RAM CACHE FOR DASHBOARD/CHART HYDRATION ───
                        # Instantly stores flat parsed telemetry representation inside Valkey RAM
                        event_type = payload.get("schema") or payload.get("event_type") or "vitals"
                        if valkey_manager.client:
                            try:
                                await valkey_manager.client.setex(
                                    f"telemetry:{event_type}:{device_serial}", 
                                    3600, # Cache TTL ensures history endpoints fetch real status dynamically
                                    json.dumps(payload)
                                )
                            except Exception as ce:
                                logger.debug(f"Failed to cache payload in Valkey RAM: {ce}")
                            
                        # ─── ENTERPRISE DISTRIBUTED CACHE LOOKUP ───
                        cache_key = f"route:{device_serial}"
                        routing_info = None
                        
                        # 1. Ask Valkey Global Client for the routing map (Ultra-fast, shared across AWS)
                        if valkey_manager.client:
                            cached_route_str = await valkey_manager.client.get(cache_key)
                            if cached_route_str:
                                routing_info = json.loads(cached_route_str)
                        
                        # 2. Cache Miss: Query MongoDB ONCE using the resolved true unique hardware serial
                        if not routing_info:
                            device_doc = await db.devices.find_one(
                                {"device_serial": device_serial}, 
                                {"assigned_patient_id": 1, "device_type": 1}
                            )
                            
                            if device_doc and device_doc.get("assigned_patient_id"):
                                routing_info = {
                                    "patient_id": device_doc["assigned_patient_id"],
                                    "device_type": device_doc.get("device_type", "sleep_monitor")
                                }
                                # 3. Save to Valkey with a Time-To-Live (TTL) of 24 hours
                                if valkey_manager.client:
                                    await valkey_manager.client.set(
                                        cache_key, 
                                        json.dumps(routing_info), 
                                        ex=86400 
                                    )
                        
                        # 4. Route instantly to WebSocket memory
                        if routing_info:
                            patient_id = routing_info["patient_id"]
                            
                            # Fetch the completely normalized, mapped, and epoch-injected state
                            resolved_payload = await resolve_telemetry(patient_id)
                            
                            # Publish the fully integrated UI-ready document instead of the raw MQTT tuple
                            await event_bus.publish(patient_id, resolved_payload)
                    except Exception as e:
                        logger.error(f"Error processing Valkey message payload: {e}")
                        
        except TimeoutError:
            # Idle channels trigger timeout in python drivers. Loop back to prevent listener death.
            logger.debug("Valkey subscription channel idle. Resuming...")
            await asyncio.sleep(0.5)
            continue
        except asyncio.CancelledError:
            logger.info("Valkey subscriber task cancelled cleanly.")
            break
        except Exception as e:
            logger.error(f"Valkey Subscriber Connection Interrupted. Retrying in 5s... {e}")
            await asyncio.sleep(5)
        finally:
            if pubsub_client:
                try:
                    await pubsub_client.aclose()
                except Exception:
                    pass


@app.on_event("startup")
async def create_indexes():
    """Create MongoDB Indexes for peak query performance."""
    if db is None:
        return

    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index([("hospital_id", 1), ("role", 1)])
        await db.user_sessions.create_index("session_token", unique=True)
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)  # TTL index
        await db.hospitals.create_index("hospital_id", unique=True)
        await db.devices.create_index("device_id", unique=True)
        await db.devices.create_index("device_serial", unique=True)
        await db.devices.create_index(
            [("assigned_patient_id", 1)], sparse=True, unique=True
        )
        await db.devices.create_index([("hospital_id", 1)])
        await db.devices.create_index([("status", 1)])
        
        if telemetry_db is not None:
            await telemetry_db.vitals.create_index([("device_id", 1), ("ts", -1)])
            await telemetry_db.sleep.create_index([("device_id", 1), ("ts", -1)])
            await telemetry_db.alerts.create_index([("device_id", 1), ("ts", -1)])
            
            # OPTIMIZATION: Compound index to completely eliminate in-memory memory sorting on history queries
            await telemetry_db.vitals.create_index([("device_id", 1), ("epoch", -1)])
            await telemetry_db.sleep.create_index([("device_id", 1), ("epoch", -1)])
            await telemetry_db.alerts.create_index([("device_id", 1), ("epoch", -1)])
            
        logger.info("MongoDB indexes created")
    except Exception as e:
        logger.error(f"Error creating indexes: {e}")


@app.on_event("startup")
async def start_background_tasks():
    if db is None:
        logger.warning("start_background_tasks: db not ready, skipping")
        return
        
    try:
        # Initialize the global Valkey Client pool for fast operations and distributed caching
        if not valkey_manager.client:
            valkey_kwargs = {
                "host": os.environ.get("VALKEY_HOST", "localhost"),
                "port": int(os.environ.get("VALKEY_PORT", 6379)),
                "decode_responses": True,
                "health_check_interval": 30,
                "retry_on_timeout": True
            }
            # Secure Password Checking: Bypasses blank/null AUTH attempts
            raw_pwd = os.environ.get("VALKEY_PASSWORD")
            if raw_pwd and isinstance(raw_pwd, str):
                clean_pwd = raw_pwd.strip()
                if clean_pwd and clean_pwd.lower() not in ["none", "null"]:
                    valkey_kwargs["password"] = clean_pwd
                    
            valkey_manager.client = valkey.Valkey(**valkey_kwargs)
        
        asyncio.create_task(sync_last_seen())
        logger.info("sync_last_seen background task started")

        # Start the AWS-scalable Valkey Subscriber Background Task
        asyncio.create_task(valkey_telemetry_subscriber())
        logger.info("Valkey Telemetry Subscriber background task started successfully.")

    except Exception as e:
        logger.error(f"Error starting background tasks: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    if client:
        client.close()