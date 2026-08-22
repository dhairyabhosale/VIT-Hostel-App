import os
import re
import secrets
import uuid
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional
from zoneinfo import ZoneInfo

import jwt
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, Depends, HTTPException, UploadFile, File, Request
from fastapi.responses import Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
from pwdlib import PasswordHash
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from emailer import send_email  # noqa: E402
from object_storage import init_storage, put_object, get_object  # noqa: E402

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
ALGO = "HS256"
TOKEN_HOURS = 24 * 7
IST = ZoneInfo("Asia/Kolkata")

pwd = PasswordHash.recommended()
bearer = HTTPBearer()

app = FastAPI(title="VIT Hostel Connect API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vit-hostel")


def now():
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def uid() -> str:
    return str(uuid.uuid4())


# ---------- auth helpers ----------

def create_token(user: dict) -> str:
    payload = {
        "sub": user["id"],
        "role": user["role"],
        "exp": now() + timedelta(hours=TOKEN_HOURS),
        "iat": now(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGO)


def public_user(u: dict) -> dict:
    return {k: u.get(k) for k in ("id", "role", "name", "registration_number", "email", "phone", "active_status", "block_ids", "share_phone")}


async def current_user(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    err = HTTPException(401, "Invalid or expired token")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[ALGO])
    except jwt.InvalidTokenError:
        raise err
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user or not user.get("active_status"):
        raise err
    return user


def require_roles(*roles):
    async def dep(user=Depends(current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, "Insufficient permissions")
        return user
    return dep


student_only = require_roles("student")
warden_only = require_roles("warden")
admin_only = require_roles("admin")
warden_or_admin = require_roles("warden", "admin")


async def warden_block_ids(user: dict) -> Optional[List[str]]:
    """None means all blocks (admin)."""
    if user["role"] == "admin":
        return None
    return user.get("block_ids", [])


def block_scope_query(block_ids: Optional[List[str]], field="block_id"):
    return {} if block_ids is None else {field: {"$in": block_ids}}


async def notify(user_id: str, title: str, body: str, ntype: str):
    await db.notifications.insert_one({
        "id": uid(), "user_id": user_id, "title": title, "body": body,
        "type": ntype, "read": False, "created_at": iso(now()),
    })


async def audit(actor: dict, action: str, entity: str, entity_id: str, details: dict):
    await db.audit_logs.insert_one({
        "id": uid(), "actor_id": actor["id"], "actor_name": actor["name"],
        "actor_role": actor["role"], "action": action, "entity": entity,
        "entity_id": entity_id, "details": details, "timestamp": iso(now()),
    })


# ---------- schemas ----------

class LoginIn(BaseModel):
    identifier: str  # reg no (students) or email (warden/admin)
    password: str


class InitiateIn(BaseModel):
    registration_number: str


class ActivateIn(BaseModel):
    registration_number: str
    otp: str
    password: str = Field(min_length=6, max_length=128)


class QuickSetupIn(BaseModel):
    device_id: str = Field(min_length=6)
    mpin: Optional[str] = Field(default=None, pattern=r"^\d{4,6}$")
    biometric_enrolled: Optional[bool] = None


class MpinUnlockIn(BaseModel):
    device_id: str
    mpin: str


class ProfileIn(BaseModel):
    share_phone: bool


class ChangeRequestIn(BaseModel):
    request_type: str  # block_change / mess_change / room_change
    requested_value: str
    reason: str


class CleaningIn(BaseModel):
    preferred_time_slot: str
    notes: Optional[str] = ""


class ComplaintIn(BaseModel):
    category: str
    description: str
    urgency: str = "medium"
    photo_attachments: List[str] = []


class RateIn(BaseModel):
    rating: int = Field(ge=1, le=5)


class ThreadIn(BaseModel):
    subject: str
    message: str


class MessageIn(BaseModel):
    text: str


class AttendanceEntry(BaseModel):
    student_id: str
    status: str  # present/absent/on-leave


class AttendanceIn(BaseModel):
    block_id: str
    date: str  # YYYY-MM-DD
    entries: List[AttendanceEntry]


class ScheduleIn(BaseModel):
    scheduled_note: Optional[str] = ""
    assigned_staff_name: Optional[str] = ""


class ComplaintUpdateIn(BaseModel):
    status: Optional[str] = None
    note: Optional[str] = ""
    assigned_to: Optional[str] = None
    resolution_note: Optional[str] = None


class ReviewIn(BaseModel):
    action: str  # approve / reject
    admin_notes: Optional[str] = ""


class AnnouncementIn(BaseModel):
    scope: str  # block / all
    block_id: Optional[str] = None
    title: str
    body: str
    pinned: bool = False


class BlockIn(BaseModel):
    name: str
    code: str
    total_rooms: int = 0
    gender: Optional[str] = None


class RoomIn(BaseModel):
    block_id: str
    room_number: str
    room_type: str = "double"
    ac_status: str = "Non-AC"
    capacity: int = 2


class RoomBulkIn(BaseModel):
    block_id: str
    prefix: str
    start: int
    count: int = Field(le=200)
    room_type: str = "double"
    ac_status: str = "Non-AC"
    capacity: int = 2


class MessPlanIn(BaseModel):
    name: str
    mess_hall_location: str


class RosterImportIn(BaseModel):
    csv_text: str


class WardenCreateIn(BaseModel):
    name: str
    email: str
    phone: str
    password: str = Field(min_length=6)
    block_ids: List[str] = []


class UserUpdateIn(BaseModel):
    active_status: Optional[bool] = None
    block_ids: Optional[List[str]] = None


class AllocateIn(BaseModel):
    registration_number: str
    block_id: str
    room_id: str
    mess_plan_id: str


# ---------- AUTH ----------

@api.post("/auth/login")
async def login(data: LoginIn):
    ident = data.identifier.strip()
    q = {"email": ident.lower()} if "@" in ident else {"registration_number": ident.upper()}
    user = await db.users.find_one(q, {"_id": 0})
    if not user or not user.get("password_hash") or not pwd.verify(data.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    if not user.get("active_status"):
        raise HTTPException(403, "Account is deactivated. Contact admin.")
    if user["role"] == "student" and not user.get("activated"):
        raise HTTPException(403, "First-time setup required")
    return {"access_token": create_token(user), "user": public_user(user)}


@api.post("/auth/student/initiate")
async def student_initiate(data: InitiateIn):
    reg = data.registration_number.strip().upper()
    user = await db.users.find_one({"registration_number": reg, "role": "student"}, {"_id": 0})
    if not user:
        raise HTTPException(404, "Registration number not found. Contact hostel admin.")
    if user.get("activated"):
        raise HTTPException(400, "Account already activated. Please log in with your password.")
    otp = f"{secrets.randbelow(900000) + 100000}"
    await db.users.update_one({"id": user["id"]}, {"$set": {
        "otp_hash": pwd.hash(otp),
        "otp_expires_at": iso(now() + timedelta(minutes=10)),
    }})
    logger.info(f"Activation OTP generated for {reg} ({user['email']})")
    otp_html = (
        '<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif">'
        f'<h2 style="color:#0B2447;margin:0 0 12px">VIT Hostel Connect</h2>'
        f'<p>Hi {user["name"]},</p>'
        f'<p>Your one-time password (OTP) to activate your hostel account ({reg}) is:</p>'
        f'<p style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#0B2447;margin:16px 0">{otp}</p>'
        '<p>This OTP expires in 10 minutes. If you did not request this, you can ignore this email.</p>'
        '<p style="font-size:12px;color:#888">Sent by VIT Hostel Connect. We will never ask you to share this code back with anyone.</p>'
        '</td></tr></table>'
    )
    try:
        await send_email(to=user["email"], subject="Your VIT Hostel Connect activation OTP", html=otp_html)
        return {"message": f"OTP sent to {user['email']}", "email": user["email"]}
    except Exception as e:
        logger.error(f"OTP email delivery failed for {reg}: {e}")
        # Fallback so the student is never locked out if email delivery fails
        return {
            "message": f"Email delivery failed — demo OTP shown below (registered email: {user['email']})",
            "email": user["email"],
            "mock_otp": otp,
        }


@api.post("/auth/student/activate")
async def student_activate(data: ActivateIn):
    reg = data.registration_number.strip().upper()
    user = await db.users.find_one({"registration_number": reg, "role": "student"}, {"_id": 0})
    if not user or user.get("activated"):
        raise HTTPException(400, "Invalid request")
    if not user.get("otp_hash") or not user.get("otp_expires_at"):
        raise HTTPException(400, "No OTP requested. Start again.")
    if datetime.fromisoformat(user["otp_expires_at"]) < now():
        raise HTTPException(400, "OTP expired. Request a new one.")
    if not pwd.verify(data.otp, user["otp_hash"]):
        raise HTTPException(400, "Incorrect OTP")
    await db.users.update_one({"id": user["id"]}, {
        "$set": {"password_hash": pwd.hash(data.password), "activated": True, "active_status": True},
        "$unset": {"otp_hash": "", "otp_expires_at": ""},
    })
    user = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"access_token": create_token(user), "user": public_user(user)}


@api.post("/auth/quick/setup")
async def quick_setup(data: QuickSetupIn, user=Depends(current_user)):
    update = {"user_id": user["id"], "device_id": data.device_id, "last_used_at": iso(now())}
    if data.mpin:
        update["mpin_hash"] = pwd.hash(data.mpin)
    if data.biometric_enrolled is not None:
        update["biometric_enrolled"] = data.biometric_enrolled
    existing = await db.quick_auth.find_one({"user_id": user["id"], "device_id": data.device_id})
    if existing:
        await db.quick_auth.update_one({"id": existing["id"]}, {"$set": update})
    else:
        update.update({"id": uid(), "created_at": iso(now()),
                       "biometric_enrolled": update.get("biometric_enrolled", False)})
        await db.quick_auth.insert_one(update)
    return {"message": "Quick login configured"}


@api.post("/auth/quick/mpin-unlock")
async def mpin_unlock(data: MpinUnlockIn):
    recs = await db.quick_auth.find({"device_id": data.device_id, "mpin_hash": {"$exists": True}}, {"_id": 0}).to_list(10)
    for rec in recs:
        if pwd.verify(data.mpin, rec["mpin_hash"]):
            user = await db.users.find_one({"id": rec["user_id"]}, {"_id": 0})
            if not user or not user.get("active_status"):
                raise HTTPException(401, "Account deactivated")
            await db.quick_auth.update_one({"id": rec["id"]}, {"$set": {"last_used_at": iso(now())}})
            return {"access_token": create_token(user), "user": public_user(user)}
    raise HTTPException(401, "Invalid MPIN")


@api.get("/auth/me")
async def me(user=Depends(current_user)):
    return public_user(user)


# ---------- STUDENT ----------

async def get_allocation(student_id: str) -> Optional[dict]:
    return await db.allocations.find_one({"student_id": student_id, "allocation_status": {"$in": ["active", "pending-change"]}}, {"_id": 0})


@api.get("/student/dashboard")
async def student_dashboard(user=Depends(student_only)):
    alloc = await get_allocation(user["id"])
    result = {"user": public_user(user), "allocation": None, "roommates": [], "block": None, "room": None, "mess_plan": None}
    if alloc:
        block = await db.blocks.find_one({"id": alloc["block_id"]}, {"_id": 0})
        room = await db.rooms.find_one({"id": alloc["room_id"]}, {"_id": 0})
        mess = await db.mess_plans.find_one({"id": alloc["mess_plan_id"]}, {"_id": 0})
        roommates = []
        if room:
            for occ_id in room.get("current_occupant_ids", []):
                if occ_id == user["id"]:
                    continue
                rm = await db.users.find_one({"id": occ_id}, {"_id": 0})
                if rm:
                    roommates.append({
                        "name": rm["name"],
                        "registration_number": rm.get("registration_number"),
                        "phone": rm.get("phone") if rm.get("share_phone") else None,
                        "share_phone": bool(rm.get("share_phone")),
                    })
        result.update({"allocation": alloc, "block": block, "room": room, "mess_plan": mess, "roommates": roommates})
    # summary counts
    result["open_complaints"] = await db.complaints.count_documents({"student_id": user["id"], "status": {"$nin": ["resolved", "closed", "cancelled"]}})
    result["pending_cleaning"] = await db.cleaning_requests.count_documents({"student_id": user["id"], "status": {"$in": ["requested", "scheduled"]}})
    result["pending_changes"] = await db.change_requests.count_documents({"student_id": user["id"], "status": "pending"})
    result["recent_complaints"] = await db.complaints.find({"student_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(3)
    result["unread_notifications"] = await db.notifications.count_documents({"user_id": user["id"], "read": False})
    return result


@api.patch("/student/profile")
async def update_profile(data: ProfileIn, user=Depends(student_only)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"share_phone": data.share_phone}})
    return {"share_phone": data.share_phone}


@api.post("/student/change-requests")
async def create_change_request(data: ChangeRequestIn, user=Depends(student_only)):
    if data.request_type not in ("block_change", "mess_change", "room_change"):
        raise HTTPException(400, "Invalid request type")
    alloc = await get_allocation(user["id"])
    if not alloc:
        raise HTTPException(400, "No active allocation found")
    current_value = ""
    if data.request_type == "block_change":
        b = await db.blocks.find_one({"id": alloc["block_id"]}, {"_id": 0})
        current_value = b["code"] if b else ""
    elif data.request_type == "room_change":
        r = await db.rooms.find_one({"id": alloc["room_id"]}, {"_id": 0})
        current_value = r["room_number"] if r else ""
    else:
        m = await db.mess_plans.find_one({"id": alloc["mess_plan_id"]}, {"_id": 0})
        current_value = m["name"] if m else ""
    doc = {
        "id": uid(), "student_id": user["id"], "student_name": user["name"],
        "registration_number": user.get("registration_number"),
        "block_id": alloc["block_id"], "request_type": data.request_type,
        "current_value": current_value, "requested_value": data.requested_value,
        "reason": data.reason, "status": "pending", "reviewed_by": None,
        "reviewed_at": None, "admin_notes": "", "created_at": iso(now()),
    }
    await db.change_requests.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/student/change-requests")
async def list_change_requests(user=Depends(student_only)):
    return await db.change_requests.find({"student_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)


CLEANING_OPEN_HOUR, CLEANING_CLOSE_HOUR = 8, 23


def cleaning_window_open() -> bool:
    h = datetime.now(IST).hour
    return CLEANING_OPEN_HOUR <= h < CLEANING_CLOSE_HOUR


async def cleaning_rate_info(student_id: str) -> dict:
    cutoff = iso(now() - timedelta(hours=12))
    recent = await db.cleaning_requests.find(
        {"student_id": student_id, "created_at": {"$gte": cutoff}}, {"_id": 0, "created_at": 1}
    ).sort("created_at", 1).to_list(10)
    if len(recent) >= 2:
        next_at = datetime.fromisoformat(recent[0]["created_at"]) + timedelta(hours=12)
        return {"allowed": False, "next_available_at": iso(next_at), "used": len(recent)}
    return {"allowed": True, "next_available_at": None, "used": len(recent)}


@api.get("/student/cleaning/availability")
async def cleaning_availability(user=Depends(student_only)):
    rate = await cleaning_rate_info(user["id"])
    window = cleaning_window_open()
    reason = None
    if not window:
        reason = "Cleaning requests can only be made between 8:00 AM and 11:00 PM"
    elif not rate["allowed"]:
        local = datetime.fromisoformat(rate["next_available_at"]).astimezone(IST)
        reason = f"Limit of 2 requests per 12 hours reached. You can request again after {local.strftime('%I:%M %p, %d %b')}"
    return {
        "can_request": window and rate["allowed"], "window_open": window,
        "allowed_hours": "8:00 AM – 11:00 PM", "rate": rate, "reason": reason,
        "server_time_ist": datetime.now(IST).strftime("%I:%M %p"),
    }


@api.post("/student/cleaning")
async def create_cleaning(data: CleaningIn, user=Depends(student_only)):
    if not cleaning_window_open():
        raise HTTPException(403, "Cleaning requests are only allowed between 8:00 AM and 11:00 PM (server time)")
    rate = await cleaning_rate_info(user["id"])
    if not rate["allowed"]:
        local = datetime.fromisoformat(rate["next_available_at"]).astimezone(IST)
        raise HTTPException(429, f"You've reached the limit of 2 cleaning requests in 12 hours. You can request again after {local.strftime('%I:%M %p on %d %b')}.")
    alloc = await get_allocation(user["id"])
    if not alloc:
        raise HTTPException(400, "No active room allocation")
    room = await db.rooms.find_one({"id": alloc["room_id"]}, {"_id": 0})
    doc = {
        "id": uid(), "student_id": user["id"], "student_name": user["name"],
        "registration_number": user.get("registration_number"),
        "room_id": alloc["room_id"], "room_number": room["room_number"] if room else "",
        "block_id": alloc["block_id"], "preferred_time_slot": data.preferred_time_slot,
        "notes": data.notes or "", "status": "requested", "assigned_staff_name": "",
        "scheduled_note": "", "created_at": iso(now()), "scheduled_at": None,
        "student_marked_done_at": None, "completed_at": None,
    }
    await db.cleaning_requests.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/student/cleaning")
async def list_cleaning(view: str = "active", user=Depends(student_only)):
    q = {"student_id": user["id"]}
    if view == "history":
        q["status"] = {"$in": ["completed", "cancelled"]}
    else:
        q["status"] = {"$in": ["requested", "scheduled"]}
    return await db.cleaning_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)


@api.post("/student/cleaning/{req_id}/done")
async def mark_cleaning_done(req_id: str, user=Depends(student_only)):
    req = await db.cleaning_requests.find_one({"id": req_id}, {"_id": 0})
    if not req or req["student_id"] != user["id"]:
        raise HTTPException(404, "Request not found")
    if req["status"] != "scheduled":
        raise HTTPException(400, "Only scheduled requests can be marked as done")
    t = iso(now())
    await db.cleaning_requests.update_one({"id": req_id}, {"$set": {"status": "completed", "student_marked_done_at": t, "completed_at": t}})
    return {"status": "completed"}


@api.post("/student/cleaning/{req_id}/cancel")
async def cancel_cleaning(req_id: str, user=Depends(student_only)):
    req = await db.cleaning_requests.find_one({"id": req_id}, {"_id": 0})
    if not req or req["student_id"] != user["id"]:
        raise HTTPException(404, "Request not found")
    if req["status"] not in ("requested", "scheduled"):
        raise HTTPException(400, "Cannot cancel this request")
    await db.cleaning_requests.update_one({"id": req_id}, {"$set": {"status": "cancelled", "completed_at": iso(now())}})
    return {"status": "cancelled"}


COMPLAINT_CATEGORIES = ["electrical", "plumbing", "carpentry", "wifi-network", "furniture", "pest-control", "other"]


@api.post("/student/complaints")
async def create_complaint(data: ComplaintIn, user=Depends(student_only)):
    if data.category not in COMPLAINT_CATEGORIES:
        raise HTTPException(400, "Invalid category")
    alloc = await get_allocation(user["id"])
    if not alloc:
        raise HTTPException(400, "No active room allocation")
    room = await db.rooms.find_one({"id": alloc["room_id"]}, {"_id": 0})
    # only attach photos this student actually uploaded
    photos = []
    for fid in data.photo_attachments[:3]:
        f = await db.files.find_one({"id": fid, "owner_id": user["id"]}, {"_id": 0})
        if f:
            photos.append(fid)
    t = iso(now())
    doc = {
        "id": uid(), "student_id": user["id"], "student_name": user["name"],
        "registration_number": user.get("registration_number"),
        "room_id": alloc["room_id"], "room_number": room["room_number"] if room else "",
        "block_id": alloc["block_id"], "category": data.category,
        "description": data.description, "photo_attachments": photos,
        "urgency": data.urgency, "status": "submitted", "assigned_to": "",
        "created_at": t, "resolution_note": "", "student_feedback_rating": None,
        "status_history": [{"status": "submitted", "timestamp": t, "note": "Complaint submitted"}],
    }
    await db.complaints.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/student/complaints")
async def list_complaints(view: str = "active", user=Depends(student_only)):
    q = {"student_id": user["id"]}
    if view == "history":
        q["status"] = {"$in": ["resolved", "closed", "cancelled"]}
    else:
        q["status"] = {"$nin": ["resolved", "closed", "cancelled"]}
    return await db.complaints.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)


@api.get("/student/complaints/{cid}")
async def get_complaint(cid: str, user=Depends(current_user)):
    c = await db.complaints.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Complaint not found")
    if user["role"] == "student" and c["student_id"] != user["id"]:
        raise HTTPException(403, "Access denied")
    if user["role"] == "warden" and c["block_id"] not in user.get("block_ids", []):
        raise HTTPException(403, "Access denied")
    return c


@api.post("/student/complaints/{cid}/rate")
async def rate_complaint(cid: str, data: RateIn, user=Depends(student_only)):
    c = await db.complaints.find_one({"id": cid}, {"_id": 0})
    if not c or c["student_id"] != user["id"]:
        raise HTTPException(404, "Complaint not found")
    if c["status"] != "resolved":
        raise HTTPException(400, "Can only rate resolved complaints")
    await db.complaints.update_one({"id": cid}, {"$set": {"student_feedback_rating": data.rating}})
    return {"rating": data.rating}


@api.get("/student/attendance")
async def student_attendance(user=Depends(student_only)):
    return await db.attendance.find({"student_id": user["id"]}, {"_id": 0}).sort("date", -1).to_list(120)


@api.get("/student/warden-contact")
async def warden_contact(user=Depends(student_only)):
    alloc = await get_allocation(user["id"])
    if not alloc:
        raise HTTPException(400, "No active allocation")
    wardens = await db.users.find({"role": "warden", "block_ids": alloc["block_id"], "active_status": True}, {"_id": 0}).to_list(10)
    return [{"id": w["id"], "name": w["name"], "phone": w.get("phone"), "email": w.get("email")} for w in wardens]


# ---------- THREADS (student <-> warden) ----------

@api.post("/threads")
async def create_thread(data: ThreadIn, user=Depends(student_only)):
    alloc = await get_allocation(user["id"])
    if not alloc:
        raise HTTPException(400, "No active allocation")
    warden = await db.users.find_one({"role": "warden", "block_ids": alloc["block_id"], "active_status": True}, {"_id": 0})
    t = iso(now())
    doc = {
        "id": uid(), "student_id": user["id"], "student_name": user["name"],
        "warden_id": warden["id"] if warden else None,
        "block_id": alloc["block_id"], "subject": data.subject, "status": "open",
        "created_at": t, "updated_at": t,
        "messages": [{"sender_id": user["id"], "sender_name": user["name"], "sender_role": "student", "text": data.message, "timestamp": t}],
    }
    await db.threads.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/threads")
async def list_threads(user=Depends(current_user)):
    if user["role"] == "student":
        q = {"student_id": user["id"]}
    elif user["role"] == "warden":
        q = {"block_id": {"$in": user.get("block_ids", [])}}
    else:
        q = {}
    return await db.threads.find(q, {"_id": 0}).sort("updated_at", -1).to_list(200)


async def thread_access(tid: str, user: dict) -> dict:
    t = await db.threads.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Thread not found")
    if user["role"] == "student" and t["student_id"] != user["id"]:
        raise HTTPException(403, "Access denied")
    if user["role"] == "warden" and t["block_id"] not in user.get("block_ids", []):
        raise HTTPException(403, "Access denied")
    return t


@api.get("/threads/{tid}")
async def get_thread(tid: str, user=Depends(current_user)):
    return await thread_access(tid, user)


@api.post("/threads/{tid}/messages")
async def post_message(tid: str, data: MessageIn, user=Depends(current_user)):
    t = await thread_access(tid, user)
    if t["status"] == "closed":
        raise HTTPException(400, "Thread is closed")
    ts = iso(now())
    msg = {"sender_id": user["id"], "sender_name": user["name"], "sender_role": user["role"], "text": data.text, "timestamp": ts}
    await db.threads.update_one({"id": tid}, {"$push": {"messages": msg}, "$set": {"updated_at": ts}})
    return msg


@api.post("/threads/{tid}/close")
async def close_thread(tid: str, user=Depends(warden_or_admin)):
    await thread_access(tid, user)
    await db.threads.update_one({"id": tid}, {"$set": {"status": "closed", "updated_at": iso(now())}})
    return {"status": "closed"}


# ---------- ANNOUNCEMENTS & NOTIFICATIONS ----------

@api.get("/announcements")
async def list_announcements(user=Depends(current_user)):
    if user["role"] == "student":
        alloc = await get_allocation(user["id"])
        block_id = alloc["block_id"] if alloc else None
        q = {"$or": [{"scope": "all"}, {"block_id": block_id}]}
    elif user["role"] == "warden":
        q = {"$or": [{"scope": "all"}, {"block_id": {"$in": user.get("block_ids", [])}}]}
    else:
        q = {}
    items = await db.announcements.find(q, {"_id": 0}).sort("created_at", -1).to_list(100)
    items.sort(key=lambda a: 0 if a.get("pinned") else 1)
    return items


@api.post("/announcements")
async def create_announcement(data: AnnouncementIn, user=Depends(warden_or_admin)):
    if data.scope == "block":
        if not data.block_id:
            raise HTTPException(400, "block_id required for block scope")
        if user["role"] == "warden" and data.block_id not in user.get("block_ids", []):
            raise HTTPException(403, "Not your block")
    elif data.scope == "all" and user["role"] != "admin":
        raise HTTPException(403, "Only admin can post hostel-wide announcements")
    block_name = None
    if data.block_id:
        b = await db.blocks.find_one({"id": data.block_id}, {"_id": 0})
        block_name = b["code"] if b else None
    doc = {
        "id": uid(), "posted_by": user["id"], "posted_by_name": user["name"],
        "posted_by_role": user["role"], "scope": data.scope, "block_id": data.block_id,
        "block_name": block_name, "title": data.title, "body": data.body,
        "pinned": data.pinned, "created_at": iso(now()),
    }
    await db.announcements.insert_one(doc)
    # notify students in scope
    if data.scope == "all":
        students = await db.users.find({"role": "student", "activated": True}, {"_id": 0, "id": 1}).to_list(2000)
    else:
        allocs = await db.allocations.find({"block_id": data.block_id}, {"_id": 0, "student_id": 1}).to_list(2000)
        students = [{"id": a["student_id"]} for a in allocs]
    for s in students:
        await notify(s["id"], "New announcement", data.title, "announcement")
    doc.pop("_id", None)
    return doc


@api.get("/notifications")
async def list_notifications(user=Depends(current_user)):
    return await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)


@api.post("/notifications/mark-read")
async def mark_notifications_read(user=Depends(current_user)):
    await db.notifications.update_many({"user_id": user["id"], "read": False}, {"$set": {"read": True}})
    return {"ok": True}


# ---------- WARDEN ----------

@api.get("/warden/blocks")
async def warden_blocks(user=Depends(warden_or_admin)):
    bids = await warden_block_ids(user)
    q = {} if bids is None else {"id": {"$in": bids}}
    return await db.blocks.find(q, {"_id": 0}).to_list(100)


@api.get("/warden/dashboard")
async def warden_dashboard(user=Depends(warden_or_admin)):
    bids = await warden_block_ids(user)
    bq = block_scope_query(bids)
    blocks = await db.blocks.find({} if bids is None else {"id": {"$in": bids}}, {"_id": 0}).to_list(50)
    occupancy = []
    for b in blocks:
        rooms = await db.rooms.find({"block_id": b["id"]}, {"_id": 0}).to_list(1000)
        cap = sum(r.get("capacity", 0) for r in rooms)
        occ = sum(len(r.get("current_occupant_ids", [])) for r in rooms)
        occupancy.append({"block": b["code"], "block_id": b["id"], "capacity": cap, "occupied": occ, "rooms": len(rooms)})
    today = datetime.now(IST).strftime("%Y-%m-%d")
    marked_today = await db.attendance.count_documents({**bq, "date": today})
    total_students = await db.allocations.count_documents({**bq, "allocation_status": {"$in": ["active", "pending-change"]}})
    return {
        "occupancy": occupancy,
        "open_complaints": await db.complaints.count_documents({**bq, "status": {"$nin": ["resolved", "closed", "cancelled"]}}),
        "pending_cleaning": await db.cleaning_requests.count_documents({**bq, "status": "requested"}),
        "awaiting_confirmation": await db.cleaning_requests.count_documents({**bq, "status": "scheduled"}),
        "pending_changes": await db.change_requests.count_documents({**bq, "status": "pending"}),
        "open_threads": await db.threads.count_documents({**bq, "status": "open"}),
        "attendance_today": {"date": today, "marked": marked_today, "total": total_students},
    }


@api.get("/warden/roster")
async def warden_roster(block_id: str, date: Optional[str] = None, user=Depends(warden_or_admin)):
    bids = await warden_block_ids(user)
    if bids is not None and block_id not in bids:
        raise HTTPException(403, "Not your block")
    date = date or datetime.now(IST).strftime("%Y-%m-%d")
    allocs = await db.allocations.find({"block_id": block_id, "allocation_status": {"$in": ["active", "pending-change"]}}, {"_id": 0}).to_list(1000)
    marks = await db.attendance.find({"block_id": block_id, "date": date}, {"_id": 0}).to_list(2000)
    mark_map = {m["student_id"]: m["status"] for m in marks}
    roster = []
    for a in allocs:
        s = await db.users.find_one({"id": a["student_id"]}, {"_id": 0})
        room = await db.rooms.find_one({"id": a["room_id"]}, {"_id": 0})
        if s:
            roster.append({
                "student_id": s["id"], "name": s["name"],
                "registration_number": s.get("registration_number"),
                "room_number": room["room_number"] if room else "",
                "attendance_status": mark_map.get(s["id"]),
            })
    roster.sort(key=lambda r: (r["room_number"], r["name"]))
    return {"date": date, "roster": roster}


@api.post("/warden/attendance")
async def mark_attendance(data: AttendanceIn, user=Depends(warden_or_admin)):
    bids = await warden_block_ids(user)
    if bids is not None and data.block_id not in bids:
        raise HTTPException(403, "Not your block")
    t = iso(now())
    marked = 0
    for e in data.entries:
        if e.status not in ("present", "absent", "on-leave"):
            continue
        existing = await db.attendance.find_one({"student_id": e.student_id, "date": data.date}, {"_id": 0})
        rec = {
            "student_id": e.student_id, "block_id": data.block_id, "date": data.date,
            "status": e.status, "marked_by": user["id"], "marked_by_name": user["name"],
            "marked_at": t, "notification_sent": False,
        }
        if existing:
            if existing["status"] != e.status:
                await db.attendance.update_one({"id": existing["id"]}, {"$set": {"status": e.status, "marked_by": user["id"], "marked_by_name": user["name"], "marked_at": t}})
                await audit(user, "attendance_updated", "attendance", existing["id"], {"student_id": e.student_id, "date": data.date, "from": existing["status"], "to": e.status})
        else:
            rec["id"] = uid()
            await db.attendance.insert_one(rec)
            await audit(user, "attendance_marked", "attendance", rec["id"], {"student_id": e.student_id, "date": data.date, "status": e.status})
        if e.status == "absent":
            await notify(e.student_id, "Marked absent", f"You were marked ABSENT for hostel attendance on {data.date}. Contact your warden if this is incorrect.", "attendance")
            await db.attendance.update_one({"student_id": e.student_id, "date": data.date}, {"$set": {"notification_sent": True}})
            # Parent alert email (if a parent contact is on record)
            sdoc = await db.users.find_one({"id": e.student_id}, {"_id": 0})
            already_absent = existing and existing["status"] == "absent"
            if sdoc and sdoc.get("parent_email") and not already_absent:
                alert_html = (
                    '<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif">'
                    f'<h2 style="color:#0B2447;margin:0 0 12px">VIT Hostel Connect</h2>'
                    f'<p>Dear Parent/Guardian,</p>'
                    f'<p>This is to inform you that <strong>{sdoc["name"]}</strong> '
                    f'({sdoc.get("registration_number", "")}) was marked <strong>ABSENT</strong> during the hostel '
                    f'night attendance on <strong>{data.date}</strong>.</p>'
                    '<p>If this is unexpected, please contact your ward or the hostel warden office.</p>'
                    '<p style="font-size:12px;color:#888">Automated alert sent by VIT Hostel Connect hostel administration.</p>'
                    '</td></tr></table>'
                )
                try:
                    await send_email(to=sdoc["parent_email"], subject=f"Hostel attendance alert — {sdoc['name']} marked absent ({data.date})", html=alert_html)
                    logger.info(f"Parent absence alert emailed for {sdoc.get('registration_number')}")
                except Exception as ex:
                    logger.error(f"Parent alert email failed for {sdoc.get('registration_number')}: {ex}")
        marked += 1
    return {"marked": marked, "date": data.date}


@api.get("/warden/cleaning")
async def warden_cleaning(status: Optional[str] = None, user=Depends(warden_or_admin)):
    bids = await warden_block_ids(user)
    q = block_scope_query(bids)
    if status:
        q["status"] = status
    else:
        q["status"] = {"$in": ["requested", "scheduled"]}
    return await db.cleaning_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(300)


@api.post("/warden/cleaning/{req_id}/schedule")
async def schedule_cleaning(req_id: str, data: ScheduleIn, user=Depends(warden_or_admin)):
    req = await db.cleaning_requests.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Request not found")
    bids = await warden_block_ids(user)
    if bids is not None and req["block_id"] not in bids:
        raise HTTPException(403, "Not your block")
    if req["status"] != "requested":
        raise HTTPException(400, "Only requested items can be scheduled. Completion is confirmed by the student.")
    await db.cleaning_requests.update_one({"id": req_id}, {"$set": {
        "status": "scheduled", "scheduled_at": iso(now()),
        "scheduled_note": data.scheduled_note or "", "assigned_staff_name": data.assigned_staff_name or "",
    }})
    await notify(req["student_id"], "Cleaning scheduled", f"Your cleaning request for room {req['room_number']} has been scheduled. {data.scheduled_note or ''} Tap 'Mark as Done' once completed.", "cleaning")
    return {"status": "scheduled"}


@api.get("/warden/complaints")
async def warden_complaints(status: Optional[str] = None, urgency: Optional[str] = None, category: Optional[str] = None, user=Depends(warden_or_admin)):
    bids = await warden_block_ids(user)
    q = block_scope_query(bids)
    if status:
        q["status"] = status
    if urgency:
        q["urgency"] = urgency
    if category:
        q["category"] = category
    return await db.complaints.find(q, {"_id": 0}).sort("created_at", -1).to_list(300)


COMPLAINT_STATUSES = ["submitted", "acknowledged", "in-progress", "resolved", "escalated"]


@api.patch("/warden/complaints/{cid}")
async def update_complaint(cid: str, data: ComplaintUpdateIn, user=Depends(warden_or_admin)):
    c = await db.complaints.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Complaint not found")
    bids = await warden_block_ids(user)
    if bids is not None and c["block_id"] not in bids:
        raise HTTPException(403, "Not your block")
    update, t = {}, iso(now())
    if data.status:
        if data.status not in COMPLAINT_STATUSES:
            raise HTTPException(400, "Invalid status")
        update["status"] = data.status
        await db.complaints.update_one({"id": cid}, {"$push": {"status_history": {"status": data.status, "timestamp": t, "note": data.note or ""}}})
        await notify(c["student_id"], "Complaint update", f"Your {c['category']} complaint is now: {data.status.replace('-', ' ').title()}", "complaint")
    if data.assigned_to is not None:
        update["assigned_to"] = data.assigned_to
    if data.resolution_note is not None:
        update["resolution_note"] = data.resolution_note
    if update:
        await db.complaints.update_one({"id": cid}, {"$set": update})
    return await db.complaints.find_one({"id": cid}, {"_id": 0})


@api.get("/warden/change-requests")
async def warden_change_requests(status: Optional[str] = "pending", user=Depends(warden_or_admin)):
    bids = await warden_block_ids(user)
    q = block_scope_query(bids)
    if status:
        q["status"] = status
    return await db.change_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(300)


async def apply_change_request(req: dict) -> Optional[str]:
    """Apply approved change to allocation. Returns error message or None."""
    alloc = await get_allocation(req["student_id"])
    if not alloc:
        return "Student has no active allocation"
    if req["request_type"] == "mess_change":
        plan = await db.mess_plans.find_one({"name": {"$regex": f"^{re.escape(req['requested_value'])}$", "$options": "i"}}, {"_id": 0})
        if not plan:
            return f"Mess plan '{req['requested_value']}' not found"
        await db.allocations.update_one({"id": alloc["id"]}, {"$set": {"mess_plan_id": plan["id"], "effective_date": iso(now())}})
        return None
    # room/block change: find target room
    if req["request_type"] == "room_change":
        target_room = await db.rooms.find_one({"block_id": alloc["block_id"], "room_number": req["requested_value"]}, {"_id": 0})
        if not target_room:
            return f"Room '{req['requested_value']}' not found in student's block"
        target_block_id = alloc["block_id"]
    else:  # block_change
        block = await db.blocks.find_one({"code": {"$regex": f"^{re.escape(req['requested_value'])}$", "$options": "i"}}, {"_id": 0})
        if not block:
            return f"Block '{req['requested_value']}' not found"
        target_block_id = block["id"]
        target_room = await db.rooms.find_one({"block_id": block["id"], "$expr": {"$lt": [{"$size": {"$ifNull": ["$current_occupant_ids", []]}}, "$capacity"]}}, {"_id": 0})
        if not target_room:
            return f"No rooms with space available in {req['requested_value']}"
    if len(target_room.get("current_occupant_ids", [])) >= target_room["capacity"]:
        return f"Room {target_room['room_number']} is full"
    await db.rooms.update_one({"id": alloc["room_id"]}, {"$pull": {"current_occupant_ids": req["student_id"]}})
    await db.rooms.update_one({"id": target_room["id"]}, {"$addToSet": {"current_occupant_ids": req["student_id"]}})
    await db.allocations.update_one({"id": alloc["id"]}, {"$set": {"room_id": target_room["id"], "block_id": target_block_id, "effective_date": iso(now()), "allocation_status": "active"}})
    return None


@api.post("/warden/change-requests/{rid}/review")
async def review_change_request(rid: str, data: ReviewIn, user=Depends(warden_or_admin)):
    req = await db.change_requests.find_one({"id": rid}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Request not found")
    bids = await warden_block_ids(user)
    if bids is not None and req["block_id"] not in bids:
        raise HTTPException(403, "Not your block")
    if req["status"] != "pending":
        raise HTTPException(400, "Request already reviewed")
    if data.action not in ("approve", "reject"):
        raise HTTPException(400, "Invalid action")
    if data.action == "reject" and not (data.admin_notes or "").strip():
        raise HTTPException(400, "Notes are required when rejecting a request")
    if data.action == "approve":
        err = await apply_change_request(req)
        if err:
            raise HTTPException(400, err)
    new_status = "approved" if data.action == "approve" else "rejected"
    await db.change_requests.update_one({"id": rid}, {"$set": {
        "status": new_status, "reviewed_by": user["id"], "reviewed_by_name": user["name"],
        "reviewed_at": iso(now()), "admin_notes": data.admin_notes or "",
    }})
    await audit(user, f"change_request_{new_status}", "change_request", rid, {"student_id": req["student_id"], "type": req["request_type"], "requested_value": req["requested_value"], "notes": data.admin_notes or ""})
    await notify(req["student_id"], f"Request {new_status}", f"Your {req['request_type'].replace('_', ' ')} request was {new_status}." + (f" Note: {data.admin_notes}" if data.admin_notes else ""), "change_request")
    return {"status": new_status}


# ---------- ADMIN ----------

@api.get("/admin/blocks")
async def admin_blocks(user=Depends(admin_only)):
    blocks = await db.blocks.find({}, {"_id": 0}).to_list(100)
    for b in blocks:
        rooms = await db.rooms.find({"block_id": b["id"]}, {"_id": 0, "capacity": 1, "current_occupant_ids": 1}).to_list(2000)
        b["room_count"] = len(rooms)
        b["capacity"] = sum(r.get("capacity", 0) for r in rooms)
        b["occupied"] = sum(len(r.get("current_occupant_ids", [])) for r in rooms)
        wardens = await db.users.find({"role": "warden", "block_ids": b["id"]}, {"_id": 0, "name": 1}).to_list(10)
        b["wardens"] = [w["name"] for w in wardens]
    return blocks


@api.post("/admin/blocks")
async def create_block(data: BlockIn, user=Depends(admin_only)):
    doc = {"id": uid(), "name": data.name, "code": data.code, "total_rooms": data.total_rooms, "gender": data.gender, "warden_ids": [], "created_at": iso(now())}
    await db.blocks.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/admin/rooms")
async def admin_rooms(block_id: str, user=Depends(warden_or_admin)):
    rooms = await db.rooms.find({"block_id": block_id}, {"_id": 0}).to_list(2000)
    rooms.sort(key=lambda r: r["room_number"])
    return rooms


@api.post("/admin/rooms")
async def create_room(data: RoomIn, user=Depends(admin_only)):
    doc = {"id": uid(), "block_id": data.block_id, "room_number": data.room_number, "room_type": data.room_type, "ac_status": data.ac_status, "capacity": data.capacity, "current_occupant_ids": []}
    await db.rooms.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.post("/admin/rooms/bulk")
async def bulk_rooms(data: RoomBulkIn, user=Depends(admin_only)):
    docs = []
    for i in range(data.count):
        docs.append({"id": uid(), "block_id": data.block_id, "room_number": f"{data.prefix}{data.start + i}", "room_type": data.room_type, "ac_status": data.ac_status, "capacity": data.capacity, "current_occupant_ids": []})
    if docs:
        await db.rooms.insert_many(docs)
    return {"created": len(docs)}


@api.get("/admin/mess-plans")
async def admin_mess_plans(user=Depends(current_user)):
    return await db.mess_plans.find({}, {"_id": 0}).to_list(50)


@api.post("/admin/mess-plans")
async def create_mess_plan(data: MessPlanIn, user=Depends(admin_only)):
    doc = {"id": uid(), "name": data.name, "mess_hall_location": data.mess_hall_location}
    await db.mess_plans.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.post("/admin/roster/import")
async def roster_import(data: RosterImportIn, user=Depends(admin_only)):
    lines = [ln.strip() for ln in data.csv_text.strip().splitlines() if ln.strip()]
    created, skipped, errors = 0, 0, []
    for i, line in enumerate(lines):
        parts = [p.strip() for p in line.split(",")]
        if i == 0 and ("registration" in line.lower() or "name" in line.lower()):
            continue
        if len(parts) < 4:
            errors.append(f"Line {i + 1}: expected at least 4 fields (reg no, name, email, phone, parent email optional)")
            continue
        reg, name, email, phone = parts[0].upper(), parts[1], parts[2].lower(), parts[3]
        parent_email = parts[4].lower() if len(parts) > 4 and parts[4] else None
        existing = await db.users.find_one({"registration_number": reg}, {"_id": 0})
        if existing:
            if parent_email and not existing.get("parent_email"):
                await db.users.update_one({"id": existing["id"]}, {"$set": {"parent_email": parent_email}})
            skipped += 1
            continue
        await db.users.insert_one({
            "id": uid(), "role": "student", "name": name, "registration_number": reg,
            "email": email, "phone": phone, "parent_email": parent_email,
            "password_hash": None, "activated": False,
            "active_status": True, "share_phone": False, "created_at": iso(now()),
        })
        created += 1
    await audit(user, "roster_import", "users", "bulk", {"created": created, "skipped": skipped})
    return {"created": created, "skipped": skipped, "errors": errors}


@api.post("/admin/wardens")
async def create_warden(data: WardenCreateIn, user=Depends(admin_only)):
    if await db.users.find_one({"email": data.email.lower()}):
        raise HTTPException(409, "Email already exists")
    doc = {
        "id": uid(), "role": "warden", "name": data.name, "email": data.email.lower(),
        "phone": data.phone, "password_hash": pwd.hash(data.password),
        "block_ids": data.block_ids, "activated": True, "active_status": True, "created_at": iso(now()),
    }
    await db.users.insert_one(doc)
    await audit(user, "warden_created", "user", doc["id"], {"email": data.email, "block_ids": data.block_ids})
    return public_user(doc)


@api.get("/admin/users")
async def admin_users(role: Optional[str] = None, q: Optional[str] = None, user=Depends(admin_only)):
    query = {}
    if role:
        query["role"] = role
    if q:
        query["$or"] = [
            {"name": {"$regex": re.escape(q), "$options": "i"}},
            {"registration_number": {"$regex": re.escape(q), "$options": "i"}},
            {"email": {"$regex": re.escape(q), "$options": "i"}},
        ]
    users = await db.users.find(query, {"_id": 0, "password_hash": 0, "otp_hash": 0}).sort("created_at", -1).to_list(500)
    return users


@api.patch("/admin/users/{uid_}")
async def update_user(uid_: str, data: UserUpdateIn, user=Depends(admin_only)):
    target = await db.users.find_one({"id": uid_}, {"_id": 0})
    if not target:
        raise HTTPException(404, "User not found")
    update = {}
    if data.active_status is not None:
        update["active_status"] = data.active_status
    if data.block_ids is not None and target["role"] == "warden":
        update["block_ids"] = data.block_ids
    if update:
        await db.users.update_one({"id": uid_}, {"$set": update})
        await audit(user, "user_updated", "user", uid_, update)
    return {"ok": True}


@api.post("/admin/users/{uid_}/reset-access")
async def reset_access(uid_: str, user=Depends(admin_only)):
    target = await db.users.find_one({"id": uid_}, {"_id": 0})
    if not target:
        raise HTTPException(404, "User not found")
    if target["role"] != "student":
        raise HTTPException(400, "Reset access is for student accounts; recreate warden accounts instead")
    await db.users.update_one({"id": uid_}, {"$set": {"activated": False, "password_hash": None}})
    await db.quick_auth.delete_many({"user_id": uid_})
    await audit(user, "access_reset", "user", uid_, {"registration_number": target.get("registration_number")})
    return {"message": "Access reset. Student must re-activate via OTP."}


@api.post("/admin/allocate")
async def allocate_student(data: AllocateIn, user=Depends(admin_only)):
    student = await db.users.find_one({"registration_number": data.registration_number.strip().upper(), "role": "student"}, {"_id": 0})
    if not student:
        raise HTTPException(404, "Student not found")
    room = await db.rooms.find_one({"id": data.room_id}, {"_id": 0})
    if not room or room["block_id"] != data.block_id:
        raise HTTPException(400, "Room not found in that block")
    existing = await get_allocation(student["id"])
    if len([o for o in room.get("current_occupant_ids", []) if o != student["id"]]) >= room["capacity"]:
        raise HTTPException(400, f"Room {room['room_number']} is full")
    if existing:
        await db.rooms.update_one({"id": existing["room_id"]}, {"$pull": {"current_occupant_ids": student["id"]}})
        await db.allocations.update_one({"id": existing["id"]}, {"$set": {"allocation_status": "inactive"}})
    doc = {
        "id": uid(), "student_id": student["id"], "block_id": data.block_id,
        "room_id": data.room_id, "mess_plan_id": data.mess_plan_id,
        "allocation_status": "active", "effective_date": iso(now()),
    }
    await db.allocations.insert_one(doc)
    await db.rooms.update_one({"id": data.room_id}, {"$addToSet": {"current_occupant_ids": student["id"]}})
    await audit(user, "allocation_created", "allocation", doc["id"], {"student": data.registration_number, "room": room["room_number"]})
    doc.pop("_id", None)
    return doc


@api.get("/admin/analytics")
async def admin_analytics(user=Depends(admin_only)):
    blocks = await db.blocks.find({}, {"_id": 0}).to_list(100)
    occupancy = []
    for b in blocks:
        rooms = await db.rooms.find({"block_id": b["id"]}, {"_id": 0, "capacity": 1, "current_occupant_ids": 1}).to_list(2000)
        cap = sum(r.get("capacity", 0) for r in rooms)
        occ = sum(len(r.get("current_occupant_ids", [])) for r in rooms)
        occupancy.append({"block": b["code"], "capacity": cap, "occupied": occ, "pct": round(occ / cap * 100) if cap else 0})
    # complaints
    complaints = await db.complaints.find({}, {"_id": 0}).to_list(5000)
    by_category, by_status = {}, {}
    resolution_hours = []
    for c in complaints:
        by_category[c["category"]] = by_category.get(c["category"], 0) + 1
        by_status[c["status"]] = by_status.get(c["status"], 0) + 1
        if c["status"] == "resolved":
            resolved = next((h["timestamp"] for h in reversed(c.get("status_history", [])) if h["status"] == "resolved"), None)
            if resolved:
                hrs = (datetime.fromisoformat(resolved) - datetime.fromisoformat(c["created_at"])).total_seconds() / 3600
                resolution_hours.append(hrs)
    # attendance last 14 days
    cutoff = (datetime.now(IST) - timedelta(days=14)).strftime("%Y-%m-%d")
    absents = await db.attendance.find({"status": "absent", "date": {"$gte": cutoff}}, {"_id": 0}).to_list(5000)
    absent_by_date, absent_by_student = {}, {}
    for a in absents:
        absent_by_date[a["date"]] = absent_by_date.get(a["date"], 0) + 1
        absent_by_student[a["student_id"]] = absent_by_student.get(a["student_id"], 0) + 1
    repeat_absentees = []
    for sid, cnt in absent_by_student.items():
        if cnt >= 2:
            s = await db.users.find_one({"id": sid}, {"_id": 0})
            if s:
                repeat_absentees.append({"name": s["name"], "registration_number": s.get("registration_number"), "absences": cnt})
    repeat_absentees.sort(key=lambda x: -x["absences"])
    # cleaning turnaround
    cleanings = await db.cleaning_requests.find({"status": "completed"}, {"_id": 0}).to_list(5000)
    turnaround = [(datetime.fromisoformat(c["completed_at"]) - datetime.fromisoformat(c["created_at"])).total_seconds() / 3600 for c in cleanings if c.get("completed_at")]
    return {
        "occupancy": occupancy,
        "complaints": {
            "total": len(complaints), "by_category": by_category, "by_status": by_status,
            "avg_resolution_hours": round(sum(resolution_hours) / len(resolution_hours), 1) if resolution_hours else None,
        },
        "attendance": {"absent_by_date": dict(sorted(absent_by_date.items())), "repeat_absentees": repeat_absentees[:10]},
        "cleaning": {
            "total_completed": len(cleanings),
            "avg_turnaround_hours": round(sum(turnaround) / len(turnaround), 1) if turnaround else None,
            "pending": await db.cleaning_requests.count_documents({"status": "requested"}),
        },
        "users": {
            "students": await db.users.count_documents({"role": "student"}),
            "activated_students": await db.users.count_documents({"role": "student", "activated": True}),
            "wardens": await db.users.count_documents({"role": "warden"}),
        },
    }


# ---------- FILE UPLOADS (complaint photos via Emergent Object Storage) ----------

ALLOWED_IMAGE_EXT = ("jpg", "jpeg", "png", "webp", "heic")


@api.post("/uploads/complaint-photo")
async def upload_complaint_photo(file: UploadFile = File(...), user=Depends(student_only)):
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "Only image files are allowed")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(400, "Image must be under 5 MB")
    ext = (file.filename or "photo.jpg").rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_IMAGE_EXT:
        ext = "jpg"
    path = f"vit-hostel-connect/uploads/{user['id']}/{uid()}.{ext}"
    try:
        result = await run_in_threadpool(put_object, path, data, file.content_type or "image/jpeg")
    except Exception as e:
        status = getattr(getattr(e, "response", None), "status_code", None)
        logger.error(f"Photo upload failed ({status}): {e}")
        if status == 402:
            raise HTTPException(402, "Storage credits exhausted. Photo uploads are temporarily unavailable.")
        raise HTTPException(502, "Photo upload failed. Please try again.")
    doc = {
        "id": uid(), "owner_id": user["id"], "storage_path": result["path"],
        "content_type": file.content_type or "image/jpeg", "name": file.filename or "",
        "created_at": iso(now()),
    }
    await db.files.insert_one(doc)
    return {"file_id": doc["id"]}


@api.get("/files/{file_id}")
async def serve_file(file_id: str, request: Request, token: Optional[str] = None):
    # Auth via Bearer header (native) or short-lived JWT in query (web <img> cannot send headers)
    raw = token
    if not raw:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            raw = auth[7:]
    unauthorized = HTTPException(401, "Unauthorized")
    if not raw:
        raise unauthorized
    try:
        payload = jwt.decode(raw, JWT_SECRET, algorithms=[ALGO])
    except jwt.InvalidTokenError:
        raise unauthorized
    viewer = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not viewer or not viewer.get("active_status"):
        raise unauthorized
    f = await db.files.find_one({"id": file_id}, {"_id": 0})
    if not f:
        raise HTTPException(404, "File not found")
    if viewer["role"] == "student" and f["owner_id"] != viewer["id"]:
        raise HTTPException(403, "Access denied")
    try:
        content, ctype = await run_in_threadpool(get_object, f["storage_path"])
    except Exception as e:
        logger.error(f"File fetch failed: {e}")
        raise HTTPException(502, "Could not fetch file")
    return Response(content=content, media_type=f.get("content_type") or ctype,
                    headers={"Cache-Control": "private, max-age=3600"})


@api.get("/")
async def root():
    return {"message": "VIT Hostel Connect API"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_init():
    try:
        await run_in_threadpool(init_storage)
        logger.info("Object storage initialized")
    except Exception as e:
        logger.error(f"Object storage init failed (photo uploads may not work): {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
