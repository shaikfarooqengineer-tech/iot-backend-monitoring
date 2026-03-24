import requests
import sys
import json
import time
import websocket
import threading
from datetime import datetime

class HealthDashboardTester:
    def __init__(self, base_url="http://localhost:8000"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.ws_messages_received = 0
        self.ws_data = None
        
    def run_test(self, name, method, endpoint, expected_status, data=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    json_response = response.json()
                    return True, json_response
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"Response: {response.text[:200]}...")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_api_root(self):
        """Test API root endpoint"""
        return self.run_test("API Root", "GET", "api/", 200)

    def test_dashboard_endpoint(self):
        """Test dashboard data endpoint"""
        success, response = self.run_test("Dashboard Data", "GET", "api/dashboard", 200)
        
        if success:
            # Validate dashboard data structure
            required_fields = ['patient', 'vitals', 'room_status', 'device_status', 'alerts', 
                             'sleep_quality', 'activity_level', 'heart_rate_history', 'respiration_history']
            
            missing_fields = [field for field in required_fields if field not in response]
            if missing_fields:
                print(f"⚠️  Warning: Missing fields in dashboard response: {missing_fields}")
                return False, response
            
            # Validate vitals structure
            vitals = response.get('vitals', {})
            vital_fields = ['heart_rate', 'heart_rate_status', 'respiration_rate', 'respiration_status']
            missing_vitals = [field for field in vital_fields if field not in vitals]
            if missing_vitals:
                print(f"⚠️  Warning: Missing vital fields: {missing_vitals}")
                return False, response
                
            print(f"✅ Dashboard data structure validated")
            print(f"📊 Sample data - Heart Rate: {vitals.get('heart_rate')} bpm, Status: {vitals.get('heart_rate_status')}")
            
        return success, response

    def test_patients_endpoint(self):
        """Test patients list endpoint"""
        return self.run_test("Patients List", "GET", "api/patients", 200)

    def on_websocket_message(self, ws, message):
        """WebSocket message handler"""
        try:
            data = json.loads(message)
            self.ws_messages_received += 1
            self.ws_data = data
            print(f"📡 WebSocket message {self.ws_messages_received} received")
            
            # Validate message structure
            if 'patient' in data and 'vitals' in data:
                vitals = data['vitals']
                print(f"💓 Heart Rate: {vitals.get('heart_rate')} bpm ({vitals.get('heart_rate_status')})")
                print(f"🫁 Respiration: {vitals.get('respiration_rate')} breaths/min ({vitals.get('respiration_status')})")
                
        except Exception as e:
            print(f"❌ Error parsing WebSocket message: {e}")

    def on_websocket_error(self, ws, error):
        """WebSocket error handler"""
        print(f"❌ WebSocket error: {error}")

    def on_websocket_close(self, ws, close_status_code, close_msg):
        """WebSocket close handler"""
        print(f"🔌 WebSocket connection closed")

    def on_websocket_open(self, ws):
        """WebSocket open handler"""
        print(f"✅ WebSocket connection established")

    def test_websocket_connection(self):
        """Test WebSocket real-time updates"""
        print(f"\n🔗 Testing WebSocket connection...")
        
        ws_url = self.base_url.replace('http://', 'ws://').replace('https://', 'ws://') + '/api/ws'
        print(f"WebSocket URL: {ws_url}")
        
        try:
            ws = websocket.WebSocketApp(ws_url,
                                      on_open=self.on_websocket_open,
                                      on_message=self.on_websocket_message,
                                      on_error=self.on_websocket_error,
                                      on_close=self.on_websocket_close)
            
            # Run WebSocket in a separate thread
            ws_thread = threading.Thread(target=ws.run_forever)
            ws_thread.daemon = True
            ws_thread.start()
            
            # Wait for 10 seconds to receive messages (should get ~3 messages with 3-second intervals)
            time.sleep(10)
            ws.close()
            
            self.tests_run += 1
            if self.ws_messages_received > 0:
                self.tests_passed += 1
                print(f"✅ WebSocket test passed - Received {self.ws_messages_received} messages")
                return True
            else:
                print(f"❌ WebSocket test failed - No messages received")
                return False
                
        except Exception as e:
            print(f"❌ WebSocket test failed - Error: {str(e)}")
            self.tests_run += 1
            return False

def main():
    print("🏥 Health Monitoring Dashboard Backend Testing")
    print("=" * 50)
    
    tester = HealthDashboardTester()
    
    # Test API endpoints
    print("\n📋 Testing REST API endpoints...")
    
    # Test API root
    tester.test_api_root()
    
    # Test dashboard endpoint (most critical)
    dashboard_success, dashboard_data = tester.test_dashboard_endpoint()
    
    # Test patients endpoint
    tester.test_patients_endpoint()
    
    # Test WebSocket connection
    print("\n📡 Testing WebSocket functionality...")
    ws_success = tester.test_websocket_connection()
    
    # Print final results
    print("\n" + "=" * 50)
    print(f"📊 TEST RESULTS")
    print(f"Tests passed: {tester.tests_passed}/{tester.tests_run}")
    print(f"Success rate: {(tester.tests_passed/tester.tests_run)*100:.1f}%")
    
    critical_tests = {
        "Dashboard API": dashboard_success,
        "WebSocket Real-time": ws_success
    }
    
    print(f"\n🔑 Critical Functionality:")
    for test_name, status in critical_tests.items():
        status_icon = "✅" if status else "❌"
        print(f"{status_icon} {test_name}: {'WORKING' if status else 'FAILED'}")
    
    # Overall status
    if all(critical_tests.values()):
        print(f"\n🎉 OVERALL STATUS: HEALTHY - Backend is fully functional")
        return 0
    else:
        print(f"\n⚠️  OVERALL STATUS: ISSUES DETECTED - Some critical functionality failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())