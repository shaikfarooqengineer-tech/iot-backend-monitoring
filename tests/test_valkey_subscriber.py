#  ══════════════════════════════════════════════════════════════════════════════
# FILE: backend/app/tests/test_valkey_subscriber.py
#  ══════════════════════════════════════════════════════════════════════════════

import asyncio
import json
import valkey.asyncio as valkey
from datetime import datetime

VALKEY_HOST = "localhost"
VALKEY_PORT = 6379
VALKEY_CHANNEL = "telemetry_events"

async def main():
    print(f"[{datetime.now()}] Initializing Asynchronous Valkey Event Monitor...")
    client = valkey.Valkey(
        host=VALKEY_HOST,
        port=VALKEY_PORT,
        decode_responses=True,
        socket_timeout=None,
        socket_connect_timeout=None
    )
    pubsub = client.pubsub()
    
    await pubsub.subscribe(VALKEY_CHANNEL)
    print(f"[{datetime.now()}] Subscribed to stream: '{VALKEY_CHANNEL}'. Waiting for events...")
    
    try:
        async for message in pubsub.listen():
            if message['type'] == 'message':
                data = json.loads(message['data'])
                event_type = data.get("event_type", "unknown").upper()
                device_id = data.get("device_id")
                payload = data.get("payload", {})
                
                print(f"\n--- [EVENT DISPATCHED: {event_type}] ---")
                print(f"Device: {device_id} | Timestamp: {data.get('timestamp')}")
                
                if event_type == "ALERT":
                    alert_level = payload.get("al", "OK")
                    fall_detected = payload.get("fl", False)
                    print(f"!!! [ALERT PACKET] Level: {alert_level} | Fall: {fall_detected}")
                    print(f"Payload Specs: {json.dumps(payload, indent=2)}")
                
                elif event_type == "SLEEP":
                    sleep_stage = payload.get("sg", "UNKNOWN")
                    quality = payload.get("qq", 0)
                    print(f"*** [SLEEP PACKET] Stage: {sleep_stage} | Quality Score: {quality}/100")
                    print(f"Payload Specs: {json.dumps(payload, indent=2)}")
                
                else:
                    print(f"Data Payload: {json.dumps(payload, indent=2)}")
                    
    except KeyboardInterrupt:
        print("\nStopping subscription monitor...")
    finally:
        await pubsub.unsubscribe(VALKEY_CHANNEL)
        await client.close()
        print("Valkey connection closed.")

if __name__ == "__main__":
    asyncio.run(main())
