# VitalSync - Health Monitoring Dashboard PRD

## Original Problem Statement
Build a Health Monitoring Dashboard landing page with real-time patient monitoring. Values update from backend every few seconds. User wants to integrate Firebase or Google Cloud for data persistence later.

## Architecture
- **Frontend**: React with Tailwind CSS, Recharts for visualizations, WebSocket for real-time updates
- **Backend**: FastAPI with WebSocket support, MongoDB-ready structure
- **Real-time**: WebSocket connection with 3-second update intervals
- **Design System**: Clinical Clarity theme with Manrope/Inter fonts

## User Personas
1. **Healthcare Providers**: Monitor patient vitals remotely
2. **Caregivers**: Track elderly patient status in real-time
3. **Medical Staff**: Receive alerts for critical health events

## Core Requirements (Static)
- Real-time vital signs display (Heart Rate, Respiration, Sleep, Fall Detection)
- Historical trend charts for vitals
- Alert system for critical events
- Room environment monitoring
- Device status tracking

## What's Been Implemented (March 9, 2026)
- [x] Dashboard with Bento Grid layout
- [x] Real-time WebSocket updates every 3 seconds
- [x] Heart Rate card with status badge
- [x] Respiration Rate card with status badge
- [x] Sleep Status card with quality indicator
- [x] Fall Detection card with safety status
- [x] Live Room Status (presence, distance, light, temp, motion)
- [x] Alerts panel with severity indicators
- [x] Heart Rate Trend chart (AreaChart)
- [x] Respiration Trend chart (AreaChart)
- [x] Sleep Quality with circular progress
- [x] Activity Level with steps counter
- [x] Device Status (radar, signal, battery)
- [x] Patient info bar
- [x] Caregiver profile header
- [x] Toast notifications for critical alerts

## Prioritized Backlog

### P0 (Critical - Future)
- Firebase/Google Cloud integration for data persistence
- User authentication (caregivers/patients)

### P1 (High Priority)
- Multiple patient support
- Historical data storage in MongoDB
- Alert configuration settings
- Patient search/selection

### P2 (Medium Priority)
- Dashboard customization
- Export reports (PDF)
- Mobile responsive optimization
- Notification preferences

## Next Action Items
1. Connect Firebase Realtime Database or Google Cloud Firestore for live data
2. Add patient selection dropdown for multiple patients
3. Implement authentication for caregivers
4. Add alert threshold configuration
