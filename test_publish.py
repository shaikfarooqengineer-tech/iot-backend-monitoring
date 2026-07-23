import asyncio
import json

from gmqtt import Client as MQTTClient


TOPIC = "hospital/apollo/room/icu_2/device/BM_001/vitals"


PAYLOAD = {
    "schema": "bedmonitor.telemetry.v1",
    "event_id": "BM_001_1",
    "device_id": "BM_001",
    "site_id": "apollo",
    "room_id": "icu_2",
    "firmware": "11.0",
    "ts": 1778129912000,
    "uptime_ms": 123456,
    "hr": 74.1,
    "br": 16.3,
    "alert_level": "OK"
}


async def main():
    client = MQTTClient("test-publisher")

    await client.connect(
        host="localhost",
        port=1883,
        keepalive=60
    )

    payload_json = json.dumps(PAYLOAD)

    client.publish(
        TOPIC,
        payload_json,
        qos=1
    )

    print("Message published successfully")

    await asyncio.sleep(1)

    await client.disconnect()


asyncio.run(main())