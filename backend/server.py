# Change this line at the top:
from fastapi import Query
from fastapi import Depends
from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect, Request, Response, HTTPException
from datetime import datetime, timezone, timedelta
import bcrypt
import httpx
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
import asyncio
import random
import json
from enum import Enum


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# MongoDB connection
try:
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME')

    if not mongo_url or not db_name:
        raise ValueError("MONGO_URL and DB_NAME must be set in .env file")

    client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=2000)
    db = client[db_name]
    logger.info("Attempting to connect to MongoDB...")
except Exception as e:
    logger.warning(f"Failed to connect to MongoDB: {e}. Running with mock functionality.")
    db = None

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        logger.info(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error broadcasting: {e}")

manager = ConnectionManager()

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

# What each role is allowed to create
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



# # ─── Client Models ─────────────────────────────────────────────────────────────

# class Client(BaseModel):
#     model_config = ConfigDict(extra="ignore")
#     client_id: str
#     company_name: str
#     contact_person: str
#     email: str
#     phone: Optional[str] = None
#     address: Optional[str] = None
#     status: str = "active"  # active, inactive
#     created_at: datetime

# class ClientCreate(BaseModel):
#     company_name: str
#     contact_person: str
#     email: str
#     phone: Optional[str] = None
#     address: Optional[str] = None

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

# ─── Mock Data Generators ──────────────────────────────────────────────────────

def generate_vitals():
    heart_rate = random.randint(65, 85)
    respiration_rate = random.randint(14, 20)
    return Vitals(
        heart_rate=heart_rate,
        heart_rate_status="Normal" if 60 <= heart_rate <= 90 else "Warning",
        respiration_rate=respiration_rate,
        respiration_status="Steady" if 12 <= respiration_rate <= 20 else "Warning",
        sleep_status="Deep Sleep" if random.random() > 0.3 else "Light Sleep",
        sleep_quality="Stable" if random.random() > 0.2 else "Restless",
        fall_detected=random.random() < 0.02,
        fall_status="Safe"
    )

def generate_room_status():
    return RoomStatus(
        presence_detected=True,
        distance=round(random.uniform(0.8, 2.0), 1),
        light=random.randint(8, 20),
        temperature=round(random.uniform(21.5, 24.0), 1),
        motion="None" if random.random() > 0.3 else "Minimal"
    )

def generate_device_status():
    return DeviceStatus(
        radar_sensor="Connected",
        signal="Strong" if random.random() > 0.1 else "Good",
        battery=random.randint(85, 100)
    )

def generate_alerts():
    alerts = []
    if random.random() < 0.3:
        alerts.append(Alert(
            type="warning",
            message="Irregular Heart Rate Detected!",
            time=datetime.now(timezone.utc).strftime("%I:%M %p"),
            severity="high"
        ))
    if random.random() < 0.2:
        alerts.append(Alert(
            type="info",
            message=f"Heart Rate Spike: {random.randint(110, 130)} bpm",
            time=datetime.now(timezone.utc).strftime("%I:%M %p"),
            severity="medium"
        ))
    if random.random() < 0.2:
        alerts.append(Alert(
            type="info",
            message=f"Low Respiration Rate: {random.randint(6, 10)} breaths/min",
            time=datetime.now(timezone.utc).strftime("%I:%M %p"),
            severity="medium"
        ))
    return alerts

def generate_sleep_quality():
    total_hours = random.randint(5, 8)
    total_minutes = random.randint(0, 59)
    deep_hours = int(total_hours * 0.4)
    deep_minutes = random.randint(10, 40)
    quality = random.randint(65, 90)
    return SleepQuality(
        total_hours=total_hours,
        total_minutes=total_minutes,
        deep_sleep_hours=deep_hours,
        deep_sleep_minutes=deep_minutes,
        quality_percentage=quality,
        quality_label="Good" if quality >= 70 else "Fair"
    )

def generate_activity_level():
    return ActivityLevel(
        movement="Low Movement" if random.random() > 0.3 else "Moderate",
        steps=random.randint(50, 300)
    )

def generate_chart_data():
    now = datetime.now(timezone.utc)
    heart_rate_history = []
    respiration_history = []

    for i in range(24):
        hour = (now.hour - 23 + i) % 24
        time_label = f"{hour:02d}:00"
        heart_rate_history.append({
            "time": time_label,
            "value": random.randint(65, 120)
        })
        respiration_history.append({
            "time": time_label,
            "value": random.randint(10, 24)
        })

    return heart_rate_history, respiration_history

def generate_dashboard_data():
    heart_rate_history, respiration_history = generate_chart_data()

    return DashboardData(
        patient=Patient(
            id="patient-001",
            name="Mary Johnson",
            room="Room 102",
            age=72,
            status="Sleeping",
            avatar_url="https://images.unsplash.com/photo-1758691461884-ff702418afde?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzR8MHwxfHNlYXJjaHwxfHxlbGRlcmx5JTIwcGF0aWVudCUyMHBvcnRyYWl0fGVufDB8fHx8MTc3MzA1NDY1MXww&ixlib=rb-4.1.0&q=85&w=100"
        ),
        vitals=generate_vitals(),
        room_status=generate_room_status(),
        device_status=generate_device_status(),
        alerts=generate_alerts(),
        sleep_quality=generate_sleep_quality(),
        activity_level=generate_activity_level(),
        heart_rate_history=heart_rate_history,
        respiration_history=respiration_history,
        timestamp=datetime.now(timezone.utc).isoformat()
    )


#─── Helper function to hash password───────────────────────────────────────────
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
    # Check if any admin exists
    existing_admin = await db.users.find_one({"role": UserRole.SUPERADMIN.value}, {"_id": 0})
    # if existing_admin:
    #     raise HTTPException(status_code=400, detail="Admin already exists")
    
    # Check if username exists
    existing_user = await db.users.find_one({"username": admin_data.username}, {"_id": 0})
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already taken")
    
    # Create admin user
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    existing_admin = await db.users.find_one(
    {"role": UserRole.SUPERADMIN.value}
)

    user_doc = {
        "user_id": user_id,
        "username": admin_data.username,
        "password": hash_password(admin_data.password),
        "email": admin_data.email,
        "name": admin_data.name,
        "picture": None,
        "role": UserRole.SUPERADMIN.value,
        "created_at": now.isoformat(),
        "is_default": True if not existing_admin else False
    }
    
    await db.users.insert_one(user_doc)
    
    # Create session
    session_token = f"session_{uuid.uuid4().hex}"
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": now + timedelta(days=7),
        "created_at": now
    })
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60
    )
    
    # Store company name
    await db.company_settings.insert_one({
        "company_name": admin_data.company_name,
        "created_at": now.isoformat()
    })
    
    user_doc['created_at'] = now
    del user_doc['password']
    return User(**user_doc)


# ───────────── Auth Routes/Login ───────────────────────────────────────────
@api_router.post("/auth/login")
async def login(login_data: LoginRequest, response: Response):
    # Find user by username OR email
    user_doc = await db.users.find_one({"username": login_data.username}, {"_id": 0})
    
    # If not found by username, try email
    if not user_doc:
        user_doc = await db.users.find_one({"email": login_data.username}, {"_id": 0})
    
    if not user_doc:

        raise HTTPException(status_code=401, detail="Invalid email/username or password")
    
    # Verify password
    if not verify_password(login_data.password, user_doc["password"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    # Create session
    session_token = f"session_{uuid.uuid4().hex}"
    now = datetime.now(timezone.utc)
    
    await db.user_sessions.insert_one({
        "user_id": user_doc["user_id"],
        "session_token": session_token,
        "expires_at": now + timedelta(days=7),
        "created_at": now
    })
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60
    )
    
    if isinstance(user_doc['created_at'], str):
        user_doc['created_at'] = datetime.fromisoformat(user_doc['created_at'])
    
    del user_doc['password']
    user_response = User(**user_doc).model_dump()
    user_response['session_token'] = session_token
    return user_response
# ────── Auth Routes/Create User ───────────────────────────────────────────
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
# Password Reset Request - generates token for self-service reset
class PasswordResetRequest(BaseModel):
    username: str


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str


@api_router.post("/auth/request-password-reset")
async def request_password_reset(reset_request: PasswordResetRequest):
    # Find user by username OR email
    user = await db.users.find_one({"username": reset_request.username}, {"_id": 0})
    
    if not user:
        user = await db.users.find_one({"email": reset_request.username}, {"_id": 0})
    
    if not user:
        # Return success even if user not found (security - don't reveal if username exists)
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
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60
    )
    
    # Get full user data
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password": 0})
    if isinstance(user_doc['created_at'], str):
        user_doc['created_at'] = datetime.fromisoformat(user_doc['created_at'])
    
    return User(**user_doc)


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
        hospital["created_at"] = datetime.fromisoformat(hospital["created_at"])
    return hospital
 

# ═══════════════════════════════════════════════════════════════════════════════
# USER MANAGEMENT ROUTES
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

 
# ─────── User Management delete user ─────────────
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

# ═══════════════════════════════════════════════════════════════════════════════
# DASHBOARD & REST ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════
 

@api_router.get("/")
async def root():
    return {"message": "VitalSync Health Monitoring API"}

@api_router.get("/dashboard")
async def get_dashboard(request: Request):

    await get_current_user(request)
    data = generate_dashboard_data()
    return data.model_dump()

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


# ─── WebSocket Endpoint ────────────────────────────────────────────────────────

@api_router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: Optional[str] = Query(default=None)):
    if not token:
        await websocket.close(code=4001, reason="Missing auth token")
        return
    
    if db is None:
        await websocket.close(code=4001, reason="Database unavailable")
        return

    session_doc = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session_doc:
        await websocket.close(code=4001, reason="Invalid token")
        return
 
    expires_at = session_doc.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        await websocket.close(code=4001, reason="Token expired")
        return

    # Auth passed — accept and stream
    await manager.connect(websocket)
    try:
        initial_data = generate_dashboard_data()
        await websocket.send_json(initial_data.model_dump())

        while True:
            await asyncio.sleep(3)
            data = generate_dashboard_data()
            await websocket.send_json(data.model_dump())
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)

# ═════════════════════════════════════════════════════════════════════════
# MIDDLEWARE & STARTUP
# ═════════════════════════════════════════════════════════════════════════
 

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

@app.on_event("startup")
async def create_indexes():
    """Create MongoDB Indexes for performance. """
    if db is None:
        return

    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index([("hospital_id", 1), ("role", 1)])
        await db.user_sessions.create_index("session_token", unique=True)
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)  # TTL index
        await db.hospitals.create_index("hospital_id", unique=True)
        logger.info("MongoDB indexes created")
    except Exception as e:
        logger.error(f"Error creating indexes: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    if client:
        client.close()
      