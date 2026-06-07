import asyncio
import json
from app.db.mongo import mongo_manager
from app.db.valkey_client import valkey_manager
from app.services.writer import writer_service

async def test_writer_service():
    print("Initializing connection pools...")
    mongo_manager.connect()
    valkey_manager.connect()
    
    # Verify connections (wait a moment)
    await asyncio.sleep(0.5)

    test_cases = [
        # Test 1: Valid float payload on standard topic format
        {
            "desc": "Test 1: Valid Float Payload (vitals category, decimal values)",
            "topic": "hospital/telemetry/vitals/device-001",
            "data": {
                "hr": 102.5,
                "spo2": 98.2,
                "temp": 36.7,
                "patient_id": "patient-123"
            }
        },
        # Test 2: Valid integer payload on aliased vital topic format
        {
            "desc": "Test 2: Valid Integer Payload (vital alias, integer values, br Breath Rate alias)",
            "topic": "hospital/device/vital",
            "data": {
                "hr": "98",
                "spo2": "99",
                "br": 16.5, # Breath Rate alias -> rr
                "did": "device-002" # did alias -> device_id
            }
        },
        # Test 3: Invalid payload (value exceeds range)
        {
            "desc": "Test 3: Invalid Payload (hr exceeds range constraint)",
            "topic": "hospital/telemetry/vitals/device-003",
            "data": {
                "hr": 9999,
                "spo2": 95
            }
        },
        # Test 4: Dynamic topic parsing with alert alias
        {
            "desc": "Test 4: Dynamic Topic Parser with Alert Alias",
            "topic": "test/olt/esp32/alert",
            "data": {
                "al": "CRITICAL",
                "fl": True,
                "fs": "HIGH",
                "bx": False,
                "im": True,
                "po": False,
                "dt": True,
                "rl": False,
                "mp": False,
                "device_id": "device-004"
            }
        }
    ]

    print("\n--- RUNNING TELEMETRY ROUTING & VALIDATION TESTS ---")
    for case in test_cases:
        print(f"\nRunning: {case['desc']}")
        print(f"Topic: {case['topic']}")
        print(f"Payload: {json.dumps(case['data'])}")
        
        # Call process_packet directly
        await writer_service.process_packet(case)
        
    print("\nTests completed.")
    await valkey_manager.close()
    await mongo_manager.close()

if __name__ == "__main__":
    asyncio.run(test_writer_service())
