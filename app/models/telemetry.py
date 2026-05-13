from typing import Optional

from pydantic import BaseModel, Field, ConfigDict


class BaseTelemetry(BaseModel):
    """
    Common telemetry fields.
    """
    model_config = ConfigDict(
        populate_by_name=True,
        extra="allow"
    )

     device_type: Optional[str] = Field(None, alias="dv")

    device_id: str = Field(..., alias="did")

    firmware: str = Field(..., alias="fw")

    client_id: Optional[str] = Field(None, alias="cid")

    status: Optional[str] = None

    uptime_ms: int = Field(..., alias="ms")

    ts: int

    epoch: Optional[int] = Field(None, alias="ep")

    iso_timestamp: Optional[str] = Field(None, alias="iso")

class VitalsTelemetry(BaseTelemetry):
    """
    Vitals telemetry payload.
    """

    hr: Optional[float] = None
    br: Optional[float] = None

    alert_level: Optional[str] = None


class SleepTelemetry(BaseTelemetry):
    """
    Sleep telemetry payload.
    """

    sleep_stage: Optional[str] = None

    sleep_score: Optional[float] = None

    movement_count: Optional[int] = None


class AlertTelemetry(BaseTelemetry):
    """
    Alerts telemetry payload.
    """

    alert_type: Optional[str] = None

    severity: Optional[str] = None

    message: Optional[str] = None