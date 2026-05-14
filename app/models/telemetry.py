from typing import Optional

from pydantic import BaseModel, Field, ConfigDict


class BaseTelemetry(BaseModel):
    """
    Common telemetry fields shared across all telemetry packets.
    """

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


class StatusTelemetry(BaseTelemetry):
    """
    Device online/offline lifecycle telemetry.
    """

    status: str


class HeartbeatTelemetry(BaseTelemetry):
    """
    Lightweight periodic heartbeat telemetry.
    """

    pass


class VitalsTelemetry(BaseTelemetry):
    """
    Physiological vitals telemetry.
    """

    # Human detection
    human_detected: Optional[bool] = Field(
        None,
        alias="hu"
    )

    # Distance / environment
    distance: Optional[float] = Field(
        None,
        alias="di"
    )

    lux: Optional[float] = Field(
        None,
        alias="lx"
    )

    # Core vitals
    hr: Optional[float] = None

    br: Optional[float] = None

    # Heartbeat/Breath confidence
    heartbeat_confidence: Optional[float] = Field(
        None,
        alias="bh"
    )

    breath_confidence: Optional[float] = Field(
        None,
        alias="bb"
    )

    # Sleep quality
    sleep_quality: Optional[float] = Field(
        None,
        alias="sq"
    )

    confidence: Optional[float] = Field(
        None,
        alias="cf"
    )

    # States
    sleeping: Optional[bool] = Field(
        None,
        alias="st"
    )

    high_load: Optional[bool] = Field(
        None,
        alias="hl"
    )

    # Alert metadata
    alert_level: Optional[str] = None


class SleepTelemetry(BaseTelemetry):
    """
    Sleep analytics telemetry.
    """

    sleep_stage: Optional[str] = None

    sleep_score: Optional[float] = None

    movement_count: Optional[int] = None


class AlertTelemetry(BaseTelemetry):
    """
    Alert / anomaly telemetry.
    """

    alert_type: Optional[str] = None

    severity: Optional[str] = None

    message: Optional[str] = None