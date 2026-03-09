from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import asyncio
import random
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

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

# Define Models
class Patient(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    room: str
    age: int
    status: str
    avatar_url: Optional[str] = None

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

# Generate realistic mock data
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

# REST API endpoints
@api_router.get("/")
async def root():
    return {"message": "VitalSync Health Monitoring API"}

@api_router.get("/dashboard")
async def get_dashboard():
    data = generate_dashboard_data()
    return data.model_dump()

@api_router.get("/patients")
async def get_patients():
    return [
        {
            "id": "patient-001",
            "name": "Mary Johnson",
            "room": "Room 102",
            "age": 72,
            "status": "Sleeping"
        }
    ]

# WebSocket endpoint for real-time updates
@api_router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Send initial data
        initial_data = generate_dashboard_data()
        await websocket.send_json(initial_data.model_dump())
        
        # Keep connection alive and send updates
        while True:
            # Wait for 3 seconds before sending next update
            await asyncio.sleep(3)
            data = generate_dashboard_data()
            await websocket.send_json(data.model_dump())
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
