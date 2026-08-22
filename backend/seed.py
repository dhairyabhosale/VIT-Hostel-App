"""Seed demo data for VIT Hostel Connect. Run: python seed.py"""
import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pwdlib import PasswordHash

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")
pwd = PasswordHash.recommended()
IST = ZoneInfo("Asia/Kolkata")


def uid():
    return str(uuid.uuid4())


def now():
    return datetime.now(timezone.utc)


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat()


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    if await db.users.find_one({"email": "admin@vit.ac.in"}):
        print("Already seeded, skipping.")
        return

    # Blocks
    h_block = {"id": uid(), "name": "H Block", "code": "H Block", "total_rooms": 10, "gender": "Men", "warden_ids": [], "created_at": iso(now())}
    k_block = {"id": uid(), "name": "K Block", "code": "K Block", "total_rooms": 10, "gender": "Women", "warden_ids": [], "created_at": iso(now())}
    await db.blocks.insert_many([dict(h_block), dict(k_block)])

    # Rooms
    rooms = []
    for i in range(1, 11):
        rooms.append({"id": uid(), "block_id": h_block["id"], "room_number": f"H-{100 + i}", "room_type": "double" if i <= 6 else "triple", "ac_status": "AC" if i <= 4 else "Non-AC", "capacity": 2 if i <= 6 else 3, "current_occupant_ids": []})
    for i in range(1, 11):
        rooms.append({"id": uid(), "block_id": k_block["id"], "room_number": f"K-{100 + i}", "room_type": "double", "ac_status": "AC" if i <= 5 else "Non-AC", "capacity": 2, "current_occupant_ids": []})
    await db.rooms.insert_many([dict(r) for r in rooms])

    # Mess plans
    mess = [
        {"id": uid(), "name": "Veg", "mess_hall_location": "Main Mess Hall A"},
        {"id": uid(), "name": "Non-Veg", "mess_hall_location": "Main Mess Hall B"},
        {"id": uid(), "name": "Special", "mess_hall_location": "Food Court Annex"},
        {"id": uid(), "name": "Jain", "mess_hall_location": "Main Mess Hall A (Jain Counter)"},
    ]
    await db.mess_plans.insert_many([dict(m) for m in mess])

    # Admin + wardens
    admin = {"id": uid(), "role": "admin", "name": "Hostel Admin", "email": "admin@vit.ac.in", "phone": "9000000001", "password_hash": pwd.hash("Admin@123"), "activated": True, "active_status": True, "created_at": iso(now())}
    warden_h = {"id": uid(), "role": "warden", "name": "Dr. Suresh Kumar", "email": "warden.h@vit.ac.in", "phone": "9000000002", "password_hash": pwd.hash("Warden@123"), "block_ids": [h_block["id"]], "activated": True, "active_status": True, "created_at": iso(now())}
    warden_k = {"id": uid(), "role": "warden", "name": "Dr. Priya Nair", "email": "warden.k@vit.ac.in", "phone": "9000000003", "password_hash": pwd.hash("Warden@123"), "block_ids": [k_block["id"]], "activated": True, "active_status": True, "created_at": iso(now())}
    await db.users.insert_many([dict(admin), dict(warden_h), dict(warden_k)])

    # Students
    students_spec = [
        ("23BCE1001", "Arjun Mehta", True, True),
        ("23BCE1002", "Rahul Sharma", True, True),
        ("23BCE1003", "Karthik Iyer", False, False),
        ("23BCE1004", "Vivek Reddy", False, False),
        ("23BCE1005", "Sanjay Pillai", False, False),
        ("23BCS2001", "Ananya Rao", True, False),
        ("23BCS2002", "Divya Menon", False, False),
        ("23BCS2003", "Sneha Gupta", False, False),
    ]
    students = []
    for i, (reg, name, activated, share) in enumerate(students_spec):
        students.append({
            "id": uid(), "role": "student", "name": name, "registration_number": reg,
            "email": f"{reg.lower()}@vitstudent.ac.in", "phone": f"98{40000000 + i}",
            "password_hash": pwd.hash("Student@123") if activated else None,
            "activated": activated, "active_status": True, "share_phone": share,
            "created_at": iso(now()),
        })
    await db.users.insert_many([dict(s) for s in students])

    # Allocations: first 5 in H Block, last 3 in K Block
    h_rooms = [r for r in rooms if r["block_id"] == h_block["id"]]
    k_rooms = [r for r in rooms if r["block_id"] == k_block["id"]]
    placements = [
        (students[0], h_block, h_rooms[0], mess[0]),  # Arjun H-101
        (students[1], h_block, h_rooms[0], mess[1]),  # Rahul H-101 (roommate)
        (students[2], h_block, h_rooms[1], mess[0]),
        (students[3], h_block, h_rooms[1], mess[1]),
        (students[4], h_block, h_rooms[2], mess[3]),
        (students[5], k_block, k_rooms[0], mess[0]),  # Ananya K-101
        (students[6], k_block, k_rooms[0], mess[2]),
        (students[7], k_block, k_rooms[1], mess[0]),
    ]
    for s, b, r, m in placements:
        await db.allocations.insert_one({"id": uid(), "student_id": s["id"], "block_id": b["id"], "room_id": r["id"], "mess_plan_id": m["id"], "allocation_status": "active", "effective_date": iso(now() - timedelta(days=30))})
        await db.rooms.update_one({"id": r["id"]}, {"$addToSet": {"current_occupant_ids": s["id"]}})

    arjun = students[0]

    # Sample complaints for Arjun
    t0 = now() - timedelta(days=3)
    await db.complaints.insert_one({
        "id": uid(), "student_id": arjun["id"], "student_name": arjun["name"], "registration_number": arjun["registration_number"],
        "room_id": h_rooms[0]["id"], "room_number": "H-101", "block_id": h_block["id"],
        "category": "wifi-network", "description": "WiFi keeps disconnecting every few minutes in the evening.",
        "photo_attachments": [], "urgency": "high", "status": "in-progress", "assigned_to": "Network Team",
        "created_at": iso(t0), "resolution_note": "", "student_feedback_rating": None,
        "status_history": [
            {"status": "submitted", "timestamp": iso(t0), "note": "Complaint submitted"},
            {"status": "acknowledged", "timestamp": iso(t0 + timedelta(hours=5)), "note": "Reviewed by warden"},
            {"status": "in-progress", "timestamp": iso(t0 + timedelta(days=1)), "note": "Network team assigned"},
        ],
    })
    t1 = now() - timedelta(days=10)
    await db.complaints.insert_one({
        "id": uid(), "student_id": arjun["id"], "student_name": arjun["name"], "registration_number": arjun["registration_number"],
        "room_id": h_rooms[0]["id"], "room_number": "H-101", "block_id": h_block["id"],
        "category": "electrical", "description": "Ceiling fan making loud noise.",
        "photo_attachments": [], "urgency": "medium", "status": "resolved", "assigned_to": "Electrician Ravi",
        "created_at": iso(t1), "resolution_note": "Fan bearing replaced.", "student_feedback_rating": 4,
        "status_history": [
            {"status": "submitted", "timestamp": iso(t1), "note": "Complaint submitted"},
            {"status": "acknowledged", "timestamp": iso(t1 + timedelta(hours=3)), "note": ""},
            {"status": "in-progress", "timestamp": iso(t1 + timedelta(days=1)), "note": "Electrician assigned"},
            {"status": "resolved", "timestamp": iso(t1 + timedelta(days=2)), "note": "Fan bearing replaced"},
        ],
    })

    # Cleaning: one scheduled for Arjun, one completed in history
    await db.cleaning_requests.insert_one({
        "id": uid(), "student_id": arjun["id"], "student_name": arjun["name"], "registration_number": arjun["registration_number"],
        "room_id": h_rooms[0]["id"], "room_number": "H-101", "block_id": h_block["id"],
        "preferred_time_slot": "4:00 PM – 6:00 PM", "notes": "Please clean the balcony too.",
        "status": "scheduled", "assigned_staff_name": "Muthu", "scheduled_note": "Staff will arrive around 4:30 PM",
        "created_at": iso(now() - timedelta(days=1)), "scheduled_at": iso(now() - timedelta(hours=20)),
        "student_marked_done_at": None, "completed_at": None,
    })
    tc = now() - timedelta(days=5)
    await db.cleaning_requests.insert_one({
        "id": uid(), "student_id": arjun["id"], "student_name": arjun["name"], "registration_number": arjun["registration_number"],
        "room_id": h_rooms[0]["id"], "room_number": "H-101", "block_id": h_block["id"],
        "preferred_time_slot": "10:00 AM – 12:00 PM", "notes": "",
        "status": "completed", "assigned_staff_name": "Muthu", "scheduled_note": "",
        "created_at": iso(tc), "scheduled_at": iso(tc + timedelta(hours=2)),
        "student_marked_done_at": iso(tc + timedelta(hours=6)), "completed_at": iso(tc + timedelta(hours=6)),
    })

    # Attendance for last 3 nights for all allocated students
    for d in range(1, 4):
        date = (datetime.now(IST) - timedelta(days=d)).strftime("%Y-%m-%d")
        for s, b, _, _ in placements:
            status = "absent" if (s["registration_number"] == "23BCE1003" and d in (1, 2)) else "present"
            w = warden_h if b["id"] == h_block["id"] else warden_k
            await db.attendance.insert_one({
                "id": uid(), "student_id": s["id"], "block_id": b["id"], "date": date,
                "status": status, "marked_by": w["id"], "marked_by_name": w["name"],
                "marked_at": iso(now() - timedelta(days=d)), "notification_sent": status == "absent",
            })

    # Announcements
    await db.announcements.insert_many([
        {"id": uid(), "posted_by": admin["id"], "posted_by_name": "Hostel Admin", "posted_by_role": "admin", "scope": "all", "block_id": None, "block_name": None, "title": "Hostel Day celebrations on Saturday", "body": "All students are invited to the Hostel Day celebrations at the main quadrangle, 6 PM onwards. Dinner will be served at the mess after the event.", "pinned": True, "created_at": iso(now() - timedelta(days=2))},
        {"id": uid(), "posted_by": warden_h["id"], "posted_by_name": "Dr. Suresh Kumar", "posted_by_role": "warden", "scope": "block", "block_id": h_block["id"], "block_name": "H Block", "title": "Water supply maintenance — H Block", "body": "Water supply will be interrupted on Friday 10 AM – 1 PM for tank cleaning. Please store water in advance.", "pinned": False, "created_at": iso(now() - timedelta(days=1))},
    ])

    # A pending change request from Rahul
    await db.change_requests.insert_one({
        "id": uid(), "student_id": students[1]["id"], "student_name": students[1]["name"],
        "registration_number": students[1]["registration_number"], "block_id": h_block["id"],
        "request_type": "mess_change", "current_value": "Non-Veg", "requested_value": "Veg",
        "reason": "Switching to vegetarian diet.", "status": "pending", "reviewed_by": None,
        "reviewed_at": None, "admin_notes": "", "created_at": iso(now() - timedelta(hours=8)),
    })

    print("Seeded successfully.")


if __name__ == "__main__":
    asyncio.run(main())
