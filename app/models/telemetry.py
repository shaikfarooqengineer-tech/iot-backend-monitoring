#  ══════════════════════════════════════════════════════════════════════════════
# FILE: backend/app/models/telemetry.py
#  ══════════════════════════════════════════════════════════════════════════════

from typing import Optional, Literal
from pydantic import BaseModel, Field, field_validator, ConfigDict
from datetime import datetime

class BaseTelemetry(BaseModel):
    """Common telemetry fields shared across all telemetry packets."""

    model_config = ConfigDict(
        populate_by_name=True,
        extra="allow"
    )

    # Core identifiers
    event_id: Optional[str] = None

    device_type: Optional[str] = Field(
        None,
        alias="dv"
    )

    device_id: str = Field(
        ...,
        alias="did"
    )

    firmware: str = Field(
        ...,
        alias="fw"
    )

    client_id: Optional[str] = Field(
        None,
        alias="cid"
    )

    # Device state
    status: Optional[str] = None

    # Timing
    uptime_ms: Optional[int] = Field(
        None,
        alias="ms"
    )

    ts: int

    epoch: Optional[int] = Field(
        None,
        alias="ep"
    )

    iso_timestamp: Optional[str] = Field(
        None,
        alias="iso"
    )

    # Enriched payload fields injected during MQTT ingestion
    event_type: Optional[str] = None
    timestamp: Optional[str] = None
    patient_id: Optional[str] = None
    
class StatusTelemetry(BaseTelemetry):
    """Device online/offline lifecycle telemetry."""
    status: Literal["online", "offline"]
    battery_level: Optional[float] = Field(None, ge=0.0, le=100.0)

class HeartbeatTelemetry(BaseTelemetry):
    """Lightweight periodic heartbeat telemetry."""
    interval_ms: int = Field(..., gt=0, description="Interval in ms since last heartbeat")
    fw_version: str = Field(..., min_length=1, description="Installed device firmware version")

class VitalsTelemetry(BaseTelemetry):
    """Physiological vitals telemetry."""
    hr: Optional[float] = Field(None, ge=0.0, le=300.0, description="Heart Rate in bpm")
    rr: Optional[float] = Field(None, ge=0.0, le=100.0, description="Respiratory Rate in rpm")
    sys: Optional[float] = Field(None, ge=0.0, le=300.0, description="Systolic Blood Pressure in mmHg")
    dia: Optional[float] = Field(None, ge=0.0, le=200.0, description="Diastolic Blood Pressure in mmHg")
    spo2: Optional[float] = Field(None, ge=0.0, le=100.0, description="Oxygen Saturation percentage")
    temp: Optional[float] = Field(None, ge=10.0, le=50.0, description="Body Temperature in Celsius")

class SleepTelemetry(BaseTelemetry):
    """Sleep analytics telemetry."""
    sa: bool = Field(..., description="Active sleep session indicator")
    sg: Literal["AWAKE", "LIGHT", "DEEP", "REM", "DISTURBED", "UNKNOWN"] = Field(..., description="Sleep Stage")
    qq: float = Field(..., ge=0.0, le=100.0, description="Sleep Quality Score from 0 to 100")
    di: bool = Field(..., description="Indicates environmental disturbances")
    sr: bool = Field(..., description="Indicates persistent physical struggling movements")

class AlertTelemetry(BaseTelemetry):
    """Alert / anomaly telemetry."""
    al: Literal["OK", "LOW", "MEDIUM", "HIGH", "CRITICAL"] = Field(..., description="Alert Severity Level")
    fl: bool = Field(..., description="Fall Event Detected indicator")
    fs: Literal["NONE", "POSSIBLE", "MEDIUM", "HIGH"] = Field(..., description="Fall Severity Confidence classification")
    bx: bool = Field(..., description="Bed Exit event indicator")
    im: bool = Field(..., description="Prolonged Immobility detected indicator")
    po: bool = Field(..., description="Extended Static Posture warning indicator")
    dt: bool = Field(..., description="Physiological Trend Deterioration alert indicator")
    rl: bool = Field(..., description="Agitation / Restlessness warning indicator")
    mp: bool = Field(..., description="Multiple occupants detected in zone indicator")