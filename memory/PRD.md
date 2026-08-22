# VIT Hostel Connect — PRD

## Original Problem Statement
Full-stack, mobile-first hostel management app for a university hostel system with three roles — Student, Warden, Admin — each with distinct login and dashboard. Self-contained auth & data model (not integrated with any external university DB). Core modules: OTP-based student activation + regno/password login + optional per-device MPIN/biometric quick login, room/mess allocation with change-request workflow, cleaning requests (2 per rolling 12h, 8AM–11PM IST, student-confirmed completion), maintenance complaints with status timelines + history tab + 1–5 rating, warden contact threads + urgent-call button, nightly attendance roll-call with instant absent notification, announcements (block + global), cross-block admin analytics, CSV roster import, RBAC on every endpoint, audit trail for attendance/allocation changes.

## User Choices
- Mock OTP (shown in-app / API response) — swap for real email provider later
- No push notifications for MVP — in-app notification feed instead
- No photo uploads for MVP
- Seed demo data (admin, 2 wardens, 2 blocks, 20 rooms, 8 students, sample complaints/cleaning/attendance/announcements)
- Navy/deep-blue institutional theme (per reference image)

## Tech Stack & Architecture
- Frontend: Expo (React Native) + expo-router, tab navigation per role, react-native-keyboard-controller, expo-local-authentication (biometric)
- Backend: FastAPI (/app/backend/server.py), JWT (PyJWT HS256), Argon2 hashing (pwdlib), Motor/MongoDB, UUID string ids, `_id` always excluded
- DB collections: users, blocks, rooms, mess_plans, allocations, change_requests, cleaning_requests, complaints, threads, attendance, announcements, notifications, audit_logs, quick_auth
- Seed script: /app/backend/seed.py (idempotent). Credentials in /app/memory/test_credentials.md

## User Personas
- Student: sees own allocation/roommates (consent-gated phones), raises cleaning/maintenance/change requests, views attendance, messages warden, gets in-app notifications
- Warden: block-scoped dashboard, nightly roll-call (bulk mark-all-present + overrides), complaint/cleaning/change queues, threads, block announcements
- Admin: analytics, blocks/rooms/mess management, CSV roster import, allocations, warden accounts, user activate/deactivate/reset-access, global announcements

## Implemented (June 2026 — MVP)
- Auth: 3-role login, mock-OTP student activation + set password, MPIN + biometric quick login per device (native only), JWT + RBAC on all endpoints
- Business rules server-side: 2 cleaning req / rolling 12h (429 with next-available time), 8AM–11PM IST window (403 + UI disable), student-only "Mark as Done", rejection requires notes, approval auto-updates allocation + room occupants
- Complaints: category/urgency, status badges everywhere, full status_history timeline, resolution note, 1–5 rating, separate History view
- Cleaning: request → warden schedules (staff/note) → student marks done; Active/History separation; availability banner
- Attendance: warden roll-call (search, block chips, mark-all-present, overrides), instant in-app notification on absent, audit logs; student calendar/list view with stats
- Threads: subject-based 1:1 tickets, warden close, urgent "Call Warden Now" (tel: link)
- Announcements: block (warden) + global (admin), pinned-first, notifications to scoped students
- Admin: analytics (occupancy, complaints by category/status, avg resolution hrs, absences trend, repeat absentees, cleaning turnaround), CSV import, bulk room create, warden creation with block assignment, allocate student, activate/deactivate, reset-access
- Testing: iteration_1 — backend 28/28 passed, frontend all critical flows passed

## Backlog / Next (priority)
- P0: none outstanding (MVP tested green)
- P1: Real email OTP (Emergent-managed Resend), push notifications (Emergent-managed; needs deployment build), parent/guardian contact for absence alerts
- P2: Complaint photo uploads (Emergent Object Storage), room-change room picker (list free rooms instead of free text), attendance calendar grid view, thread unread counts, warden reassignment UI, export analytics CSV
