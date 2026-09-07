#!/usr/bin/env python3
"""PawAlert email and OTP service, intended to run separately on port 8081."""

import json
import os
import random
import smtplib
import time
from email.mime.text import MIMEText
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock


def load_local_env_file():
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.exists(env_path):
        return
    with open(env_path, encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_local_env_file()
SENDER_EMAIL = os.getenv("PAWALERT_SENDER_EMAIL", "").strip()
APP_PASSWORD = "".join(os.getenv("PAWALERT_APP_PASSWORD", "").split())
SUPPORT_EMAIL = os.getenv("PAWALERT_SUPPORT_EMAIL", SENDER_EMAIL).strip()
SMTP_SERVER = os.getenv("PAWALERT_SMTP_SERVER", "smtp.gmail.com").strip()
SMTP_PORT = int(os.getenv("PAWALERT_SMTP_PORT", "465"))
OTP_TTL_SECONDS = int(os.getenv("PAWALERT_OTP_TTL_SECONDS", "600"))
CORS_ORIGIN = os.getenv("PAWALERT_CORS_ORIGIN", "*").strip() or "*"
DEMO_OTP_FALLBACK = os.getenv("PAWALERT_ENABLE_DEMO_OTP_FALLBACK", "false").lower() in {"1", "true", "yes"}

otp_store = {}
otp_lock = Lock()


def send_email(to_email, subject, body, reply_to=None):
    if not SENDER_EMAIL or not APP_PASSWORD:
        print("Email skipped: PAWALERT_SENDER_EMAIL or PAWALERT_APP_PASSWORD is not configured.")
        return False
    try:
        message = MIMEText(body)
        message["Subject"] = subject
        message["From"] = SENDER_EMAIL
        message["To"] = to_email
        if reply_to:
            message["Reply-To"] = reply_to
        with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT) as smtp:
            smtp.login(SENDER_EMAIL, APP_PASSWORD)
            smtp.send_message(message)
        return True
    except Exception as error:
        print(f"Email delivery failed: {error}")
        return False


def json_body(handler):
    length = int(handler.headers.get("Content-Length", 0))
    return json.loads(handler.rfile.read(length).decode("utf-8"))


class PawAlertEmailHandler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", CORS_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_json(200, {"ok": True})

    def do_POST(self):
        routes = {
            "/send_otp": self.send_otp,
            "/verify_otp": self.verify_otp,
            "/send_report_confirmation": self.send_report_confirmation,
            "/send_report_status": self.send_report_status,
            "/send_help_message": self.send_help_message,
        }
        handler = routes.get(self.path)
        if handler:
            handler()
        else:
            self.send_json(404, {"ok": False, "error": "Route not found"})

    def send_otp(self):
        try:
            data = json_body(self)
            email = data.get("email", "").strip()
            purpose = data.get("purpose", "signup").strip().lower()
            if not email:
                self.send_json(400, {"ok": False, "error": "Email is required"})
                return
            otp = random.randint(100000, 999999)
            with otp_lock:
                otp_store[email] = {"otp": otp, "expires_at": time.time() + OTP_TTL_SECONDS}
            title = "Password reset" if purpose == "password_reset" else "Email verification"
            delivered = send_email(email, f"PawAlert {title} code", f"Your PawAlert {title.lower()} code is: {otp}\n\nThis code expires in 10 minutes. Do not share it with anyone.")
            if delivered:
                self.send_json(200, {"ok": True, "message": "Verification code sent"})
            elif DEMO_OTP_FALLBACK:
                self.send_json(200, {"ok": True, "message": "Demo verification code created", "fallback_otp": str(otp)})
            else:
                self.send_json(500, {"ok": False, "error": "Could not deliver the verification email"})
        except Exception as error:
            self.send_json(500, {"ok": False, "error": str(error)})

    def verify_otp(self):
        try:
            data = json_body(self)
            email = data.get("email", "").strip()
            otp = str(data.get("otp", "")).strip()
            with otp_lock:
                entry = otp_store.get(email)
                if entry and entry["expires_at"] >= time.time() and str(entry["otp"]) == otp:
                    otp_store.pop(email, None)
                    self.send_json(200, {"ok": True, "message": "Email verified"})
                    return
            self.send_json(400, {"ok": False, "error": "Invalid or expired verification code"})
        except Exception as error:
            self.send_json(500, {"ok": False, "error": str(error)})

    def send_report_confirmation(self):
        try:
            data = json_body(self)
            email = data.get("email", "").strip()
            if not email:
                self.send_json(400, {"ok": False, "error": "Recipient email is required"})
                return
            report_id = data.get("report_id", "pending")
            body = f"Your PawAlert report #{report_id} has been received.\n\nAnimal: {data.get('animal_type', 'Not provided')}\nCondition: {data.get('condition', 'Not provided')}\nLocation: {data.get('location', 'Not provided')}\n\nA local moderator will review it. Thank you for helping an animal in need."
            if send_email(email, f"PawAlert report #{report_id} received", body):
                self.send_json(200, {"ok": True, "message": "Report confirmation sent"})
            else:
                self.send_json(500, {"ok": False, "error": "Could not send the report confirmation"})
        except Exception as error:
            self.send_json(500, {"ok": False, "error": str(error)})

    def send_report_status(self):
        try:
            data = json_body(self)
            email = data.get("email", "").strip()
            if not email:
                self.send_json(400, {"ok": False, "error": "Recipient email is required"})
                return
            report_id = data.get("report_id", "your")
            status = data.get("status", "updated")
            note = data.get("moderator_note", "A moderator has updated your case.")
            body = f"There is an update on PawAlert report #{report_id}.\n\nStatus: {status}\n\n{note}\n\nThank you for caring."
            if send_email(email, f"PawAlert report #{report_id} update", body):
                self.send_json(200, {"ok": True, "message": "Status update sent"})
            else:
                self.send_json(500, {"ok": False, "error": "Could not send the status update"})
        except Exception as error:
            self.send_json(500, {"ok": False, "error": str(error)})

    def send_help_message(self):
        try:
            data = json_body(self)
            email = data.get("from_email", "").strip()
            subject = data.get("subject", "PawAlert help request").strip()
            message = data.get("message", "").strip()
            if not email or not message:
                self.send_json(400, {"ok": False, "error": "Email and message are required"})
                return
            received = send_email(SUPPORT_EMAIL, f"PawAlert Help: {subject}", f"From: {email}\n\n{message}", email)
            acknowledgement = send_email(email, "We received your PawAlert help request", "Thank you for contacting PawAlert. Our team has received your message and will respond as soon as possible.")
            self.send_json(200 if received else 500, {"ok": received, "message": "Help request received" if received else "Could not deliver your help request", "acknowledgement_sent": acknowledgement})
        except Exception as error:
            self.send_json(500, {"ok": False, "error": str(error)})

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8081"))
    print(f"PawAlert email service running on http://127.0.0.1:{port}")
    ThreadingHTTPServer(("", port), PawAlertEmailHandler).serve_forever()
