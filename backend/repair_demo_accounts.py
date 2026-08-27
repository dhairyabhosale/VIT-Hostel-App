"""Repair/reset the demo account credentials without reseeding the whole database."""
import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pwdlib import PasswordHash

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")
pwd = PasswordHash.recommended()

DEMO_ACCOUNTS = [
    {"registration_number": "23BCE1001", "password": "Student@123", "role": "student"},
    {"registration_number": "23BCE1002", "password": "Student@123", "role": "student"},
    {"registration_number": "23BCE1003", "password": "Student@123", "role": "student"},
    {"registration_number": "23BCE1004", "password": "Student@123", "role": "student"},
    {"registration_number": "23BCE1005", "password": "Student@123", "role": "student"},
    {"registration_number": "23BCS2001", "password": "Student@123", "role": "student"},
    {"registration_number": "23BCS2002", "password": "Student@123", "role": "student"},
    {"registration_number": "23BCS2003", "password": "Student@123", "role": "student"},
    {"email": "warden.h@vit.ac.in", "password": "Warden@123", "role": "warden"},
    {"email": "warden.k@vit.ac.in", "password": "Warden@123", "role": "warden"},
    {"email": "admin@vit.ac.in", "password": "Admin@123", "role": "admin"},
]


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    repaired = 0
    missing = []

    for account in DEMO_ACCOUNTS:
        lookup = {"registration_number": account["registration_number"]} if "registration_number" in account else {"email": account["email"]}
        result = await db.users.update_one(
            lookup,
            {"$set": {
                "password_hash": pwd.hash(account["password"]),
                "activated": True,
                "active_status": True,
            }},
        )
        if result.matched_count:
            repaired += 1
        else:
            missing.append(lookup)

    print(f"Demo credential repair complete: {repaired} accounts repaired; {len(missing)} missing.")
    if missing:
        print(f"Missing demo accounts: {missing}")
    await client.close()


if __name__ == "__main__":
    asyncio.run(main())
