#!/usr/bin/env python3
"""Fixture backend for the CI screenshot tests (ios/TappyAIUITests/ScreenshotTests.swift).

The Debug build talks to http://localhost:3000 (Config/Debug.xcconfig; ATS allows it). This serves
just enough of the real API contract for the screens under test to render REAL data instead of
their error state. It is not a mock of business logic: every body below is the wire shape the
server documents (docs/ios/04_API_CONTRACT.md) with made-up content.

State is switched by the test itself:  POST /__stub/mode  {"saved": "empty" | "full"}
Usage: python3 ios/scripts/ui_stub_server.py [port]
"""
import json
import struct
import sys
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODE = {"saved": "full"}


def gradient_png(w, h, c1, c2):
    """A w x h diagonal-gradient PNG (no imaging library: zlib + struct only)."""
    rows = []
    for y in range(h):
        row = bytearray([0])
        for x in range(w):
            t = (x / max(1, w - 1) + y / max(1, h - 1)) / 2
            row += bytes(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
        rows.append(bytes(row))

    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"".join(rows))) + chunk(b"IEND", b""))


IMAGES = {"a": ((255, 176, 32), (240, 69, 122)), "b": ((30, 107, 255), (139, 92, 246)),
          "c": ((16, 185, 129), (59, 130, 246)), "d": ((245, 158, 11), (239, 68, 68))}

CONFIG = {
    "freemium": {"freeDailyLimit": 20, "anonLifetimeLimit": 5},
    "flags": {"showProUpgrade": False, "showAppConnections": False, "showMusic": False,
              "accountSelfDelete": False, "appleSignIn": False},
    "upload": {"maxPhotosPerReview": 5, "maxVideoSizeMb": 150, "maxVideoDurationSec": 300,
               "maxVideoDurationAcceptSec": 305, "maxPhotoSizeMb": 5},
    "auth": {"providers": [{"id": "google", "enabled": True}, {"id": "zalo", "enabled": True},
                            {"id": "email", "enabled": True}]},
    "onboarding": {
        "interests": [{"id": "food", "labelVi": "Ăn uống", "labelEn": "Food"},
                      {"id": "travel", "labelVi": "Du lịch", "labelEn": "Travel"},
                      {"id": "spa", "labelVi": "Spa & Làm đẹp", "labelEn": "Spa & Beauty"}],
        "cities": ["Hà Nội", "TP. Hồ Chí Minh", "Đà Nẵng"],
    },
    "video": {"linkProviders": ["youtube"]},
}

FAVORITES = [
    {"id": "f1", "place_id": "p1", "place_name": "Phở Thìn Bờ Hồ", "place_address": "13 Lò Đúc, Hai Bà Trưng, Hà Nội",
     "place_type": "food", "created_at": "2026-09-20T08:00:00.000Z"},
    {"id": "f2", "place_id": "p2", "place_name": "The Note Coffee", "place_address": "64 Lương Văn Can, Hoàn Kiếm, Hà Nội",
     "place_type": "cafe", "created_at": "2026-09-22T10:30:00.000Z"},
]
SAVED = [
    {"id": "r1", "place_name": "Bún chả Hương Liên", "body": "Bún chả nướng thơm, nước chấm vừa miệng.",
     "photos": [], "thumbnail": None, "content_type": "photo", "saved_at": "2026-09-25T09:00:00.000Z"},
    {"id": "r2", "place_name": "Chia sẻ", "body": "Clip cuối tuần ở Đà Lạt.",
     "photos": [], "thumbnail": None, "content_type": "video", "saved_at": "2026-09-26T09:00:00.000Z"},
]
RECS = {
    "recommendations": [
        {"placeId": "p1", "placeName": "Phở Thìn Bờ Hồ", "finalScore": 0.91, "matchedSignals": ["food"],
         "address": "13 Lò Đúc, Hai Bà Trưng, Hà Nội", "averageRating": 4.6, "reviewCount": 128,
         "latestReviewAt": "2999-01-01T00:00:00.000Z"},
        {"placeId": "p2", "placeName": "The Note Coffee", "finalScore": 0.84, "matchedSignals": ["cafe"],
         "address": "64 Lương Văn Can, Hoàn Kiếm, Hà Nội", "averageRating": 4.4, "reviewCount": 57},
    ],
    "explanation": ["Gần bạn", "Được đánh giá cao"],
    "personalized": False,
}


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    def do_GET(self):
        path = self.path.split("?")[0]
        if path.startswith("/img/") and path.endswith(".png"):
            name = path[5:-4]
            if name in IMAGES:
                data = gradient_png(360, 240, *IMAGES[name])
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
        if path == "/api/config":
            return self._send(200, CONFIG)
        if path == "/api/favorites":
            return self._send(200, {"favorites": [] if MODE["saved"] == "empty" else FAVORITES})
        if path == "/api/reviews/saved":
            return self._send(200, {"reviews": [] if MODE["saved"] == "empty" else SAVED})
        if path == "/api/recommendations":
            return self._send(200, RECS)
        if path in ("/api/memory",):
            return self._send(200, {"memory": None})
        if path == "/api/preferences":
            # No `preferences` key = "never asked": the app does not open its onboarding sheet.
            return self._send(200, {})
        return self._send(200, {})

    def do_POST(self):
        path = self.path.split("?")[0]
        raw = self._body()
        if path == "/__stub/mode":
            MODE.update(json.loads(raw or b"{}"))
            return self._send(200, MODE)
        if path == "/api/auth/anonymous":
            # No token minting in CI: the app continues as a plain guest.
            return self._send(503, {"error": "unavailable"})
        if path == "/api/chat":
            # A guest with no age declaration — the 18+ gate (docs/ios/04_API_CONTRACT.md).
            return self._send(403, {"error": "age_declaration_required",
                                     "message": "Vui lòng xác nhận bạn đủ 18 tuổi để tiếp tục."})
        return self._send(200, {})

    do_PUT = do_PATCH = do_DELETE = do_POST

    def log_message(self, fmt, *args):
        sys.stderr.write("stub: " + (fmt % args) + "\n")


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
