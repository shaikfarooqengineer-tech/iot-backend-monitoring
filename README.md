# Health Check-Up Monitoring System

A comprehensive real-time health monitoring dashboard designed for elderly care and patient tracking.

## Project Overview
This system provides a live dashboard for monitoring patient vitals (heart rate, respiration), room status, and device health. It includes real-time alerts and historical data visualization.

## Tech Stack
- **Frontend**: React, Tailwind CSS, Radix UI, Lucide Icons, Recharts.
- **Backend**: FastAPI, Uvicorn, Motor (MongoDB Async Driver).
- **Database**: MongoDB (Required for persistent storage; system handles connection failures gracefully for demo purposes).

## Prerequisites
- Node.js & Yarn
- Python 3.11+
- MongoDB (optional for local demo)

## Running the Project Locally

### 1. Backend Setup
1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   .\venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Create a `.env` file (see [Environment Variables](#environment-variables-setup)).
5. Start the server:
   ```bash
   python -m uvicorn server:app --host 0.0.0.0 --port 8000
   ```

### 2. Frontend Setup
1. Navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   yarn install
   ```
3. Start the development server:
   ```bash
   yarn start
   ```
4. Access the dashboard at `http://localhost:3000`.

## Environment Variables Setup
Create a `.env` file in the `backend` directory with the following variables:
```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=health_monitoring
CORS_ORIGINS=http://localhost:3000
```

## Running Tests
To verify the backend API and WebSocket functionality:
1. Ensure the backend server is running.
2. Run the test script from the project root:
   ```bash
   python backend_test.py
   ```

## Known Issues
- Currently uses mock data if MongoDB connection fails.
- Node.js v19+ recommended for the frontend.
