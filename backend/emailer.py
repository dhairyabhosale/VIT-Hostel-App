"""Provider-neutral transactional email sender.

Uses Brevo's transactional email API so the backend is independent of Emergent.
Required environment variables:
  BREVO_API_KEY
  EMAIL_FROM_ADDRESS
  EMAIL_FROM_NAME
Optional:
  EMAIL_REPLY_TO
"""
import ipaddress
import logging
import os
import re
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"
BREVO_API_KEY = os.environ.get("BREVO_API_KEY", "").strip()
EMAIL_FROM_ADDRESS = os.environ.get("EMAIL_FROM_ADDRESS", "").strip()
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "VIT Hostel Connect").strip()
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO", "").strip() or None

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = (
    "reply with your password", "reply with the code", "send your password", "cvv",
    "send us your password", "enter your password below", "confirm your card number",
    "your full card number", "seed phrase", "recovery phrase", "verify your card",
    "social security number", "confirm your bank details",
)
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email")
    body = f"{subject}\n{html}".lower()
    for phrase in _CRED_ASK:
        if phrase in body:
            raise ValueError(f"Email asks the recipient for credentials: {phrase!r}")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r}")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Unsafe URL in email: {url!r}")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for match in _HOSTISH.finditer(text):
            if not _same_site(match.group(1).lower(), real):
                raise ValueError(f"Anchor text does not match link host: {match.group(1)!r}")


async def send_email(*, to: str, subject: str, html: str, reply_to: str | None = None) -> str | None:
    """Send a transactional email through Brevo's public HTTPS API."""
    _assert_safe_email(subject, html)
    if not BREVO_API_KEY:
        raise RuntimeError("BREVO_API_KEY is not configured")
    if not EMAIL_FROM_ADDRESS:
        raise RuntimeError("EMAIL_FROM_ADDRESS is not configured")

    payload = {
        "sender": {"name": EMAIL_FROM_NAME, "email": EMAIL_FROM_ADDRESS},
        "to": [{"email": to}],
        "subject": subject,
        "htmlContent": html,
    }
    reply = reply_to or EMAIL_REPLY_TO
    if reply:
        payload["replyTo"] = {"email": reply}

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                BREVO_API_URL,
                headers={
                    "accept": "application/json",
                    "api-key": BREVO_API_KEY,
                    "content-type": "application/json",
                },
                json=payload,
            )
        response.raise_for_status()
        return response.json().get("messageId")
    except httpx.HTTPStatusError as exc:
        logger.error("Brevo email send failed: %s %s", exc.response.status_code, exc.response.text)
        raise RuntimeError("Transactional email delivery failed") from exc
    except Exception as exc:
        logger.error("Email send error: %s", exc)
        raise RuntimeError("Transactional email delivery failed") from exc
