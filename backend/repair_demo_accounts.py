"""Repair/create demo accounts without reseeding the whole database."""
import asyncio
import os
import uuid
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pwdlib import PasswordHash

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")
pwd = PasswordHash.recommended()

DEMO_ACCOUNTS = [
    {"registration_number": "23BCE1001", "password": "Student@123", "role": "student", "name": "Arjun Mehta", "email": "23bce1001@vitstudent.ac.in", "phone": "9840000000", "share_phone": True},
    {"registration_number": "23BCE1002", "password": "Student@123", "role": "student", "name": "Rahul Sharma", "email": "23bce1002@vitstudent.ac.in", "phone": "9840000001", "share_phone": True},
    {"registration_number": "23BCE1003", "password": "Student@123", "role": "student", "name": "Karthik Iyer", "email": "23bce1003@vitstudent.ac.in", "phone": "9840000002", "share_phone": False},
    {"registration_number": "23BCE1004", "password": "Student@123", "role": "student", "name": "Vivek Reddy", "email": "23bce1004@vitstudent.ac.in", "phone": "9840000003", "share_phone": False},
    {"registration_number": "23BCE1005", "password": "Student@123", "role": "student", "name": "Sanjay Pillai", "email": "23bce1005@vitstudent.ac.in", "phone": "9840000004", "share_phone": False},
    {"registration_number": "23BCS2001", "password": "Student@123", "role": "student", "name": "Ananya Rao", "email": "23bcs2001@vitstudent.ac.in", "phone": "9840000005", "share_phone": True},
    {"registration_number": "23BCS2002", "password": "Student@123", "role": "student", "name": "Divya Menon", "email": "23bcs2002@vitstudent.ac.in", "phone": "9840000006", "share_phone": False},
    {"registration_number": "23BCS2003", "password": "Student@123", "role": "student", "name": "Sneha Gupta", "email": "23bcs2003@vitstudent.ac.in", "phone": "9840000007", "share_phone": False},
    {"email": "warden.h@vit.ac.in", "password": "Warden@123", "role": "warden", "name": "Dr. Suresh Kumar", "phone": "9000000002", "block_code": "H Block"},
    {"email": "warden.k@vit.ac.in", "password": "Warden@123", "role": "warden", "name": "Dr. Priya Nair", "phone": "9000000003", "block_code": "K Block"},
    {"email": "admin@vit.ac.in", "password": "Admin@123", "role": "admin", "name": "Hostel Admin", "phone": "9000000001"},
]


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    try:
        db = client[os.environ["DB_NAME"]]
        repaired = 0
        created = 0

        for account in DEMO_ACCOUNTS:
            lookup = (
                {"registration_number": account["registration_number"]}
                if "registration_number" in account
                else {"email": account["email"]}
            )
            existing = await db.users.find_one(lookup, {"_id": 0})
            user_id = existing.get("id") if existing else str(uuid.uuid4())

            fields = {
                "id": user_id,
                "role": account["role"],
                "name": account["name"],
                "password_hash": pwd.hash(account["password"]),
                "activated": True,
                "active_status": True,
                "phone": account.get("phone", ""),
            }

            if "registration_number" in account:
                fields.update({
                    "registration_number": account["registration_number"],
                    "email": account["email"],
                    "share_phone": account.get("share_phone", False),
                })
            elif account["role"] == "warden":
                block = await db.blocks.find_one(
                    {"$or": [{"code": account["block_code"]}, {"name": account["block_code"]}]},
                    {"_id": 0, "id": 1},
                )
                fields["block_ids"] = [block["id"]] if block else []
            else:
                fields["email"] = account["email"]

            await db.users.update_one(lookup, {"$set": fields}, upsert=True)
            if existing:
                repaired += 1
            else:
                created += 1

        print(f"Demo credential repair complete: {repaired} existing accounts repaired; {created} missing accounts created.")
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(main())
