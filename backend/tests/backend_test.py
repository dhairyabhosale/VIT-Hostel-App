"""VIT Hostel Connect backend tests - full flow coverage."""
import os
import time
import pytest
import requests
from datetime import datetime
from zoneinfo import ZoneInfo

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://vit-hostel-connect.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

STUDENT1 = ("23BCE1001", "Student@123")  # H-101, share_phone true
STUDENT2 = ("23BCS2001", "Student@123")  # K-101
INACTIVE_STUDENT = "23BCE1003"
INACTIVE_STUDENT_B = "23BCE1004"
WARDEN_H = ("warden.h@vit.ac.in", "Warden@123")
WARDEN_K = ("warden.k@vit.ac.in", "Warden@123")
ADMIN = ("admin@vit.ac.in", "Admin@123")

TOKENS = {}


def _login(ident, pw):
    r = requests.post(f"{API}/auth/login", json={"identifier": ident, "password": pw}, timeout=15)
    assert r.status_code == 200, f"login {ident} failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- AUTH ----------
class TestAuth:
    def test_login_student(self):
        tok = _login(*STUDENT1)
        TOKENS["s1"] = tok
        assert tok

    def test_login_warden_h(self):
        TOKENS["wh"] = _login(*WARDEN_H)

    def test_login_warden_k(self):
        TOKENS["wk"] = _login(*WARDEN_K)

    def test_login_admin(self):
        TOKENS["admin"] = _login(*ADMIN)

    def test_login_student2(self):
        TOKENS["s2"] = _login(*STUDENT2)

    def test_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"identifier": STUDENT1[0], "password": "wrong"})
        assert r.status_code == 401

    def test_inactive_student_first_time_setup(self):
        # 23BCE1003 has no password so login should return 401 (invalid creds) or 403.
        r = requests.post(f"{API}/auth/login", json={"identifier": INACTIVE_STUDENT, "password": "anything"})
        assert r.status_code in (401, 403)


class TestStudentActivation:
    @pytest.fixture(scope="class")
    def activated(self):
        # Try multiple candidate inactive students; skip if all are activated
        candidates = ["23BCE1003", "23BCE1004", "23BCE1005", "23BCS2002", "23BCS2003"]
        reg, r = None, None
        for c in candidates:
            r = requests.post(f"{API}/auth/student/initiate", json={"registration_number": c})
            if r.status_code == 200:
                reg = c
                break
        if reg is None:
            # Reset one via admin
            atok = _login(*ADMIN)
            users = requests.get(f"{API}/admin/users?role=student", headers=_hdr(atok)).json()
            target = next((u for u in users if u.get("registration_number") == "23BCE1005"), None)
            if target:
                requests.post(f"{API}/admin/users/{target['id']}/reset-access", headers=_hdr(atok))
                reg = "23BCE1005"
                r = requests.post(f"{API}/auth/student/initiate", json={"registration_number": reg})
        assert r is not None and r.status_code == 200, f"No inactive student available: {r.text if r else 'none'}"
        data = r.json()
        assert "mock_otp" in data
        otp = data["mock_otp"]
        pw = "TestPass@123"
        r2 = requests.post(f"{API}/auth/student/activate", json={"registration_number": reg, "otp": otp, "password": pw})
        assert r2.status_code == 200, r2.text
        token = r2.json()["access_token"]
        TOKENS["fresh"] = token
        return {"reg": reg, "token": token, "password": pw}

    def test_activate_flow(self, activated):
        assert activated["token"]

    def test_reinitiate_already_activated(self, activated):
        r = requests.post(f"{API}/auth/student/initiate", json={"registration_number": activated["reg"]})
        assert r.status_code == 400


# ---------- RBAC ----------
class TestRBAC:
    def test_student_forbidden_from_warden(self):
        r = requests.get(f"{API}/warden/dashboard", headers=_hdr(TOKENS["s1"]))
        assert r.status_code == 403

    def test_student_forbidden_from_admin(self):
        r = requests.get(f"{API}/admin/analytics", headers=_hdr(TOKENS["s1"]))
        assert r.status_code == 403

    def test_warden_forbidden_from_admin_analytics(self):
        r = requests.get(f"{API}/admin/analytics", headers=_hdr(TOKENS["wh"]))
        assert r.status_code == 403

    def test_student_cannot_read_others_complaint(self):
        # Create complaint as s1, try to fetch as s2
        c = requests.post(f"{API}/student/complaints", headers=_hdr(TOKENS["s1"]),
                          json={"category": "electrical", "description": "TEST cross-access", "urgency": "low"})
        assert c.status_code == 200, c.text
        cid = c.json()["id"]
        r = requests.get(f"{API}/student/complaints/{cid}", headers=_hdr(TOKENS["s2"]))
        assert r.status_code == 403


# ---------- STUDENT DASHBOARD ----------
class TestDashboard:
    def test_dashboard_roommate_phone_visible(self):
        r = requests.get(f"{API}/student/dashboard", headers=_hdr(TOKENS["s1"]))
        assert r.status_code == 200
        data = r.json()
        assert data["room"]["room_number"] == "H-101"
        rmates = data.get("roommates", [])
        assert len(rmates) >= 1
        rahul = next((r for r in rmates if "Rahul" in r["name"]), None)
        assert rahul is not None, f"Rahul not in roommates: {rmates}"
        assert rahul["phone"] is not None and rahul["share_phone"] is True

    def test_dashboard_roommate_phone_private(self):
        r = requests.get(f"{API}/student/dashboard", headers=_hdr(TOKENS["s2"]))
        assert r.status_code == 200
        rmates = r.json().get("roommates", [])
        # 23BCS2001 -> Ananya. Roommate Divya with share_phone false
        divya = next((rm for rm in rmates if "Divya" in rm["name"]), None)
        if divya:
            assert divya["phone"] is None
            assert divya["share_phone"] is False


# ---------- CLEANING ----------
class TestCleaning:
    def test_availability_endpoint(self):
        r = requests.get(f"{API}/student/cleaning/availability", headers=_hdr(TOKENS["fresh"]))
        assert r.status_code == 200
        data = r.json()
        assert "can_request" in data and "window_open" in data

    def test_cleaning_flow_and_rate_limit(self):
        tok = TOKENS["fresh"]
        # Check window first
        avail = requests.get(f"{API}/student/cleaning/availability", headers=_hdr(tok)).json()
        if not avail["window_open"]:
            pytest.skip("Cleaning window closed outside 8AM-11PM IST")
        # Create 2 requests
        for i in range(2):
            r = requests.post(f"{API}/student/cleaning", headers=_hdr(tok),
                              json={"preferred_time_slot": "morning", "notes": f"TEST {i}"})
            if r.status_code == 429:
                # already had prior requests
                break
            assert r.status_code == 200, r.text
        # 3rd should hit 429
        r3 = requests.post(f"{API}/student/cleaning", headers=_hdr(tok),
                           json={"preferred_time_slot": "morning", "notes": "TEST 3"})
        assert r3.status_code == 429, f"expected 429 got {r3.status_code}: {r3.text}"
        assert "12 hours" in r3.text or "request again" in r3.text.lower()
        # availability reflects can_request false
        avail2 = requests.get(f"{API}/student/cleaning/availability", headers=_hdr(tok)).json()
        assert avail2["can_request"] is False

    def test_warden_schedule_then_student_completes(self):
        # Create a fresh cleaning as student 23BCS2001 (K block, hopefully hasn't rate-limited)
        s2 = TOKENS["s2"]
        avail = requests.get(f"{API}/student/cleaning/availability", headers=_hdr(s2)).json()
        if not avail["window_open"]:
            pytest.skip("Window closed")
        # Cancel any existing active first
        actives = requests.get(f"{API}/student/cleaning?view=active", headers=_hdr(s2)).json()
        # If rate-limited we can't create; use existing scheduled if any
        req_id = None
        for a in actives:
            if a["status"] == "requested":
                req_id = a["id"]
                break
        if not req_id and avail["can_request"]:
            r = requests.post(f"{API}/student/cleaning", headers=_hdr(s2),
                              json={"preferred_time_slot": "morning", "notes": "TEST schedule-flow"})
            if r.status_code == 200:
                req_id = r.json()["id"]
        if not req_id:
            pytest.skip("No requested cleaning available to schedule")
        # Warden K schedules
        r = requests.post(f"{API}/warden/cleaning/{req_id}/schedule", headers=_hdr(TOKENS["wk"]),
                          json={"scheduled_note": "TEST 10AM", "assigned_staff_name": "Staff A"})
        assert r.status_code == 200, r.text
        # Warden re-scheduling scheduled -> 400
        r2 = requests.post(f"{API}/warden/cleaning/{req_id}/schedule", headers=_hdr(TOKENS["wk"]),
                           json={"scheduled_note": "again"})
        assert r2.status_code == 400
        # Student marks done
        r3 = requests.post(f"{API}/student/cleaning/{req_id}/done", headers=_hdr(s2))
        assert r3.status_code == 200
        # Confirm in history
        hist = requests.get(f"{API}/student/cleaning?view=history", headers=_hdr(s2)).json()
        assert any(c["id"] == req_id and c["status"] == "completed" for c in hist)


# ---------- COMPLAINTS ----------
class TestComplaints:
    def test_complaint_lifecycle_and_notification(self):
        # Create as student 1
        c = requests.post(f"{API}/student/complaints", headers=_hdr(TOKENS["s1"]),
                          json={"category": "plumbing", "description": "TEST leak", "urgency": "high"})
        assert c.status_code == 200
        cid = c.json()["id"]
        # Warden H updates status
        for s in ["acknowledged", "in-progress", "resolved"]:
            r = requests.patch(f"{API}/warden/complaints/{cid}", headers=_hdr(TOKENS["wh"]),
                               json={"status": s, "note": f"TEST {s}"})
            assert r.status_code == 200, r.text
        # Verify status_history
        detail = requests.get(f"{API}/student/complaints/{cid}", headers=_hdr(TOKENS["s1"])).json()
        statuses = [h["status"] for h in detail["status_history"]]
        assert "acknowledged" in statuses and "resolved" in statuses
        # Rate
        r = requests.post(f"{API}/student/complaints/{cid}/rate", headers=_hdr(TOKENS["s1"]), json={"rating": 5})
        assert r.status_code == 200

    def test_rate_non_resolved_fails(self):
        c = requests.post(f"{API}/student/complaints", headers=_hdr(TOKENS["s1"]),
                          json={"category": "electrical", "description": "TEST no-rate", "urgency": "low"})
        cid = c.json()["id"]
        r = requests.post(f"{API}/student/complaints/{cid}/rate", headers=_hdr(TOKENS["s1"]), json={"rating": 4})
        assert r.status_code == 400


# ---------- CHANGE REQUESTS ----------
class TestChangeRequests:
    def test_mess_change_approve_updates_allocation(self):
        # Student 2 requests mess_change to Jain
        r = requests.post(f"{API}/student/change-requests", headers=_hdr(TOKENS["s2"]),
                          json={"request_type": "mess_change", "requested_value": "Jain", "reason": "TEST diet"})
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        # Warden K approves
        rev = requests.post(f"{API}/warden/change-requests/{rid}/review", headers=_hdr(TOKENS["wk"]),
                            json={"action": "approve"})
        assert rev.status_code == 200, rev.text
        # Verify allocation.mess_plan.name == Jain
        dash = requests.get(f"{API}/student/dashboard", headers=_hdr(TOKENS["s2"])).json()
        assert dash["mess_plan"]["name"].lower() == "jain"

    def test_reject_without_notes_fails(self):
        r = requests.post(f"{API}/student/change-requests", headers=_hdr(TOKENS["s2"]),
                          json={"request_type": "mess_change", "requested_value": "Veg", "reason": "TEST"})
        rid = r.json()["id"]
        rev = requests.post(f"{API}/warden/change-requests/{rid}/review", headers=_hdr(TOKENS["wk"]),
                            json={"action": "reject", "admin_notes": ""})
        assert rev.status_code == 400
        # cleanup
        requests.post(f"{API}/warden/change-requests/{rid}/review", headers=_hdr(TOKENS["wk"]),
                      json={"action": "reject", "admin_notes": "TEST cleanup"})


# ---------- WARDEN BLOCK SCOPING ----------
class TestWardenScoping:
    def test_warden_k_cannot_access_h_roster(self):
        blocks = requests.get(f"{API}/admin/blocks", headers=_hdr(TOKENS["admin"])).json()
        h_id = next(b["id"] for b in blocks if b["code"].startswith("H"))
        r = requests.get(f"{API}/warden/roster?block_id={h_id}", headers=_hdr(TOKENS["wk"]))
        assert r.status_code == 403


# ---------- ATTENDANCE ----------
class TestAttendance:
    def test_mark_and_read(self):
        blocks = requests.get(f"{API}/admin/blocks", headers=_hdr(TOKENS["admin"])).json()
        h_id = next(b["id"] for b in blocks if b["code"].startswith("H"))
        roster = requests.get(f"{API}/warden/roster?block_id={h_id}", headers=_hdr(TOKENS["wh"])).json()
        entries = [{"student_id": r["student_id"], "status": "present"} for r in roster["roster"][:2]]
        today = datetime.now(ZoneInfo("Asia/Kolkata")).strftime("%Y-%m-%d")
        r = requests.post(f"{API}/warden/attendance", headers=_hdr(TOKENS["wh"]),
                          json={"block_id": h_id, "date": today, "entries": entries})
        assert r.status_code == 200
        att = requests.get(f"{API}/student/attendance", headers=_hdr(TOKENS["s1"])).json()
        assert isinstance(att, list)


# ---------- ADMIN ----------
class TestAdmin:
    def test_analytics(self):
        r = requests.get(f"{API}/admin/analytics", headers=_hdr(TOKENS["admin"]))
        assert r.status_code == 200
        d = r.json()
        for k in ("occupancy", "complaints", "attendance", "cleaning", "users"):
            assert k in d

    def test_roster_import_and_skip(self):
        reg = f"TEST{int(time.time()) % 100000}"
        csv = f"registration_number,name,email,phone\n{reg},TEST User,{reg.lower()}@vit.ac.in,9999999999\n"
        r = requests.post(f"{API}/admin/roster/import", headers=_hdr(TOKENS["admin"]), json={"csv_text": csv})
        assert r.status_code == 200
        d = r.json()
        assert d["created"] == 1
        # Reimport skips duplicates
        r2 = requests.post(f"{API}/admin/roster/import", headers=_hdr(TOKENS["admin"]), json={"csv_text": csv})
        assert r2.json()["skipped"] == 1


# ---------- ANNOUNCEMENTS ----------
class TestAnnouncements:
    def test_warden_cannot_post_global(self):
        r = requests.post(f"{API}/announcements", headers=_hdr(TOKENS["wh"]),
                          json={"scope": "all", "title": "TEST", "body": "no"})
        assert r.status_code == 403

    def test_block_announcement(self):
        blocks = requests.get(f"{API}/admin/blocks", headers=_hdr(TOKENS["admin"])).json()
        h_id = next(b["id"] for b in blocks if b["code"].startswith("H"))
        r = requests.post(f"{API}/announcements", headers=_hdr(TOKENS["wh"]),
                          json={"scope": "block", "block_id": h_id, "title": "TEST block", "body": "hi", "pinned": True})
        assert r.status_code == 200

    def test_admin_global_announcement(self):
        r = requests.post(f"{API}/announcements", headers=_hdr(TOKENS["admin"]),
                          json={"scope": "all", "title": "TEST all", "body": "hi"})
        assert r.status_code == 200


# ---------- THREADS ----------
class TestThreads:
    def test_thread_create_close_and_locked_message(self):
        t = requests.post(f"{API}/threads", headers=_hdr(TOKENS["s1"]),
                          json={"subject": "TEST subj", "message": "hi"})
        assert t.status_code == 200
        tid = t.json()["id"]
        # warden replies
        m = requests.post(f"{API}/threads/{tid}/messages", headers=_hdr(TOKENS["wh"]),
                          json={"text": "TEST reply"})
        assert m.status_code == 200
        # close
        c = requests.post(f"{API}/threads/{tid}/close", headers=_hdr(TOKENS["wh"]))
        assert c.status_code == 200
        # posting closed -> 400
        m2 = requests.post(f"{API}/threads/{tid}/messages", headers=_hdr(TOKENS["s1"]),
                           json={"text": "again"})
        assert m2.status_code == 400
