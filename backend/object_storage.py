"""Cloudinary-backed object storage helpers.

Keeps the same put_object/get_object interface used by the API while removing
Emergent's object-storage dependency.

Required environment variables:
  CLOUDINARY_CLOUD_NAME
  CLOUDINARY_API_KEY
  CLOUDINARY_API_SECRET
"""
import io
import logging
import os

import cloudinary
import cloudinary.uploader
import cloudinary.api
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

APP_NAME = "vit-hostel-connect"


def init_storage():
    """Validate Cloudinary configuration. Safe to call repeatedly."""
    cloudinary.config(
        cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME"),
        api_key=os.environ.get("CLOUDINARY_API_KEY"),
        api_secret=os.environ.get("CLOUDINARY_API_SECRET"),
        secure=True,
    )
    if not all([
        os.environ.get("CLOUDINARY_CLOUD_NAME"),
        os.environ.get("CLOUDINARY_API_KEY"),
        os.environ.get("CLOUDINARY_API_SECRET"),
    ]):
        raise RuntimeError("Cloudinary storage is not configured")
    return True


def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Upload bytes to Cloudinary and return a storage descriptor."""
    init_storage()
    public_id = path.rsplit(".", 1)[0]
    result = cloudinary.uploader.upload(
        io.BytesIO(data),
        public_id=public_id,
        resource_type="image",
        overwrite=True,
        invalidate=True,
    )
    return {
        "path": result["public_id"],
        "size": len(data),
        "etag": result.get("etag"),
        "secure_url": result.get("secure_url"),
        "resource_type": result.get("resource_type", "image"),
        "format": result.get("format"),
    }


def get_object(path: str):
    """Download an image from Cloudinary by public ID."""
    init_storage()
    # Cloudinary's authenticated download endpoint returns the original bytes.
    result = cloudinary.utils.cloudinary_url(path, secure=True, resource_type="image")
    url = result[0]
    import requests
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    content_type = response.headers.get("Content-Type", "image/jpeg")
    return response.content, content_type
