#!/usr/bin/env python3
"""Fixture backend for the CI screenshot tests (ios/TappyAIUITests/ScreenshotTests.swift).

The Debug build talks to http://localhost:3000 (Config/Debug.xcconfig; ATS allows it). This serves
just enough of the real API contract for the screens under test to render REAL data instead of
their error state. It is not a mock of business logic: every body below is the wire shape the
server documents (docs/ios/04_API_CONTRACT.md) with made-up content.

State is switched by the test itself:  POST /__stub/mode  {"saved": "empty" | "full"}
Usage: python3 ios/scripts/ui_stub_server.py [port]
"""
import copy
import json
import struct
import sys
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODE = {"saved": "full"}
# Whom the fixture account has blocked (Phase 8 safety contract): ids, newest first.
BLOCKED = []


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


import math

SCENES = {
    # name: (sky top, sky bottom, sun colour, sun x, sun y, sun radius, hill colours back->front)
    "scene-dalat": ((255, 183, 120), (255, 120, 140), (255, 236, 179), 0.68, 0.40, 0.11,
                    [(120, 98, 190), (74, 80, 160), (36, 52, 120)]),
    "scene-sea": ((86, 166, 255), (180, 226, 255), (255, 244, 200), 0.30, 0.30, 0.09,
                  [(60, 150, 210), (30, 110, 190), (16, 70, 150)]),
}
_SCENE_CACHE = {}


def scene_png(name, w=540, h=960):
    """An illustration drawn in code (sky, sun, layered hills): no third-party picture, no person. Cached."""
    if name in _SCENE_CACHE:
        return _SCENE_CACHE[name]
    top, bottom, sun, sx, sy, sr, hills = SCENES[name]
    rows = []
    for y in range(h):
        row = bytearray([0])
        ty = y / (h - 1)
        sky = [top[i] + (bottom[i] - top[i]) * ty for i in range(3)]
        for x in range(w):
            px = list(sky)
            dx, dy = x / w - sx, (y / h - sy) * (h / w)
            d = math.hypot(dx, dy)
            if d < sr:
                px = list(sun)
            elif d < sr * 1.7:
                k = 1 - (d - sr) / (sr * 0.7)
                px = [px[i] + (sun[i] - px[i]) * 0.35 * k for i in range(3)]
            for layer, colour in enumerate(hills):
                base = 0.58 + layer * 0.12
                amp = 0.05 - layer * 0.008
                edge = base + amp * math.sin(x / w * (3.2 + layer * 1.3) * math.pi + layer * 1.7)
                if y / h > edge:
                    shade = 1 - 0.25 * ((y / h - edge) / (1 - edge))
                    px = [colour[i] * shade for i in range(3)]
            row += bytes(max(0, min(255, int(v))) for v in px)
        rows.append(bytes(row))

    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    data = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"".join(rows))) + chunk(b"IEND", b""))
    _SCENE_CACHE[name] = data
    return data


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

# The EXACT body production (www.tappyai.com, main f42ae4b) served on 30/09 — the one TestFlight
# build 50 could not decode (`anonDailyLimit`, interests with `key`/`emoji` and no labels).
PROD_CONFIG = {
    "freemium": {"freeDailyLimit": 15, "anonDailyLimit": 5},
    "flags": {"showProUpgrade": False, "showAppConnections": False, "showScamShield": True},
    "upload": {"maxPhotosPerReview": 6, "maxVideoSizeMb": 150, "maxVideoDurationSec": 300, "maxVideoDurationAcceptSec": 305},
    "scamShield": {"dailyLimitAuth": 30, "dailyLimitAnon": 10},
    "video": {"linkProviders": ["youtube"]},
    "auth": {"providers": [{"id": "google", "enabled": True}, {"id": "zalo", "enabled": True}, {"id": "email", "enabled": True}]},
    "onboarding": {"interests": [{"id": "food", "emoji": "🍜", "key": "tag.food"}, {"id": "spa", "emoji": "💆", "key": "tag.spa"}],
                   "cities": ["TP. Hồ Chí Minh", "Hà Nội"]},
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
def _review(i, name, img, likes, **extra):
    row = {"id": f"m{i}", "place_name": name, "body": f"Bài {i}", "photos": [f"http://127.0.0.1:3000/img/{img}.png"],
           "like_count": likes, "comment_count": 0, "save_count": 0, "created_at": "2026-09-2%dT08:00:00.000Z" % i,
           "liked_by_me": False, "saved_by_me": False, "content_type": "photo"}
    row.update(extra)
    return row


# A saved chat as the server stores it: only {role, content}, the cards live INSIDE `content` as marker blocks
# (what web and iOS both PUT back). One durable place card carries its photo; one markdown image rides in the prose.
_OLD_PLACES = json.dumps({"v": 1, "items": [
    {"id": "place:osm:10.77,106.70", "domain": "food", "kind": "place", "rank": 0, "name": "Bún Bò Huế Đông Ba",
     "address": "110 Nguyễn Du, Quận 1", "rating": 4.6, "ratingCount": 1284, "image": "http://127.0.0.1:3000/img/a.png",
     "actions": [{"kind": "maps", "urlKind": "direct", "url": "https://maps.example/a", "labelKey": "v3.action.maps"},
                 {"kind": "review", "urlKind": "search", "url": "https://www.google.com/search?q=dong+ba+review", "labelKey": "v3.action.reviewSearch"}]},
    {"id": "place:osm:10.78,106.69", "domain": "food", "kind": "place", "rank": 1, "name": "Quán Vỉa Hè", "actions": []},
], "mapsSearchUrl": "https://maps.example/q"}, ensure_ascii=False)
_ASK = json.dumps({"v": 1, "questions": [
    {"id": "dish", "q": "Món gì / kiểu quán?", "options": ["Món Việt", "Nhật/Hàn", "Lẩu/nướng", "Chưa biết"]},
    {"id": "mode", "q": "Ăn tại quán hay giao?", "options": ["Ăn tại quán", "Giao tận nơi"]},
    {"id": "area", "q": "Khu vực nào?", "options": ["Gần mình", "Quận 1", "Quận 3", "Quận 7"]},
]}, ensure_ascii=False)
_PLAN = json.dumps({"type": "evening", "domain": "food", "title": "Tối nay ăn gì ở Hà Nội", "people": 3, "budget_total": "650.000đ",
    "tagline": "Ba quán, một buổi tối no nê.", "duration": "Tối nay · 18:00–21:30", "destination": "Hoàn Kiếm, Hà Nội",
    "days": [{"label": "Tối nay", "title": "Ăn theo khẩu vị nhóm", "items": [
        {"time": "18:00", "emoji": "🍜", "name": "Phở Thìn Bờ Hồ", "description": "Phở bò tái lăn, nước dùng ngọt xương", "price": "70.000đ/tô", "address": "13 Lò Đúc, Hai Bà Trưng"},
        {"time": "19:30", "emoji": "🥢", "name": "Bún chả Hương Liên", "description": "Bún chả nướng than hoa", "price": "chưa có giá", "address": "24 Lê Văn Hưu"},
        {"time": "21:00", "emoji": "☕", "name": "The Note Coffee", "description": "Cà phê ngắm hồ", "price": "45.000đ", "address": "64 Lương Văn Can"}]}],
    "highlights": [{"label": "Phở bò tái lăn"}, {"label": "Bún chả than hoa"}]}, ensure_ascii=False)
OLD_CONVERSATIONS = [
    {"id": "c-old", "title": "Tối nay ăn gì ở Quận 1", "category": "food", "updated_at": "2026-09-29T10:00:00.000Z",
     "messages": [
         {"role": "user", "content": "Tối nay ăn gì ở Quận 1?"},
         {"role": "assistant", "content": "Mình gợi ý bún bò nhé.\n\n![Bún bò](http://127.0.0.1:3000/img/c.png)\n\nNguồn: https://example.vn/bun-bo\n\n[TAPPY_PLACES]" + _OLD_PLACES + "[/TAPPY_PLACES]"},
     ]},
    {"id": "c-ask", "title": "Hôm nay ăn gì nhỉ", "category": "food", "updated_at": "2026-09-29T09:00:00.000Z",
     "messages": [
         {"role": "user", "content": "Hôm nay ăn gì nhỉ?"},
         {"role": "assistant", "content": "Để mình chọn đúng quán cho bạn:\n[TAPPY_ASK]" + _ASK + "[/TAPPY_ASK]"},
     ]},
    {"id": "c-plan", "title": "Tối nay ăn gì ở Hà Nội", "category": "food", "updated_at": "2026-09-29T08:00:00.000Z",
     "messages": [
         {"role": "user", "content": "Lên kế hoạch ăn tối cho 3 người ở Hoàn Kiếm"},
         {"role": "assistant", "content": "Mình đã xếp một buổi tối cho nhóm 3 người.\n[TAPPY_PLAN]" + _PLAN + "[/TAPPY_PLAN]"},
     ]},
]

MINE = [
    _review(1, "Phở Thìn Bờ Hồ", "a", 12),
    _review(2, "The Note Coffee", "c", 7),
    _review(3, "Bún chả Hương Liên", "d", 3),
    _review(4, "Chia sẻ", "b", 0, is_hidden=True),
    _review(5, "Quán mới", "a", 0, moderation={"state": "UNDER_REVIEW", "title": "Đang được xem xét",
                                              "detail": "Bài của bạn sẽ hiện công khai sau khi được duyệt."}),
]

# Home's community-video rail: the trending feed, only video rows with a thumbnail are drawn.
FEED = [
    _review(11, "Cuối tuần ở Đà Lạt", "scene-dalat", 12400, content_type="video", thumbnail="http://127.0.0.1:3000/img/scene-dalat.png",
            profiles={"full_name": "Minh Anh"}),
    _review(12, "Chia sẻ", "scene-sea", 830, content_type="video", thumbnail="http://127.0.0.1:3000/img/scene-sea.png",
            body="Săn mây Cầu Đất lúc 5h sáng", profiles={"full_name": "Quốc Bảo"}),
    _review(13, "Phở Thìn Bờ Hồ", "a", 57),
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


# Unsigned JWT for an account that is not the tester's (sub "attacker").
ATTACKER_JWT = "eyJhbGciOiJub25lIn0.eyJzdWIiOiJhdHRhY2tlciIsImV4cCI6NDEwMjQ0NDgwMH0.x"


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
            if name in IMAGES or name in SCENES:
                data = scene_png(name) if name in SCENES else gradient_png(360, 240, *IMAGES[name])
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
        if path == "/api/auth/zalo":
            # MOB-1 attack shape: someone else's session handed to the app's callback, with no
            # state ("nostate", default) or a state the app never made ("wrongstate").
            fragment = "access_token=" + ATTACKER_JWT + "&refresh_token=attacker-refresh&expires_at=4102444800"
            if MODE.get("zalo") == "wrongstate":
                fragment += "&state=attacker-state"
            self.send_response(302)
            self.send_header("Location", "tappyai://auth/callback#" + fragment)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if path == "/api/config":
            mode = MODE.get("config", "ok")
            if mode == "down":
                return self._send(503, {"error": "unavailable"})
            if mode == "prod":
                return self._send(200, PROD_CONFIG)
            cfg = copy.deepcopy(CONFIG)
            # Server-side switches a test can flip: in-app account deletion, Sign in with Apple,
            # and the Phase 8 safety block (`p8`) — all OFF in the default fixture, like production.
            if MODE.get("selfdelete") == "on":
                cfg["flags"]["accountSelfDelete"] = True
            if MODE.get("apple") == "on":
                cfg["flags"]["appleSignIn"] = True
            if MODE.get("p8") == "on":
                cfg["p8"] = {"userBlocks": True, "reports": True, "commentModeration": True, "accountDeletion": False}
            return self._send(200, cfg)
        if path == "/api/plan-images/manifest":
            # R22: key -> { status, url }. Fixture "photos" are the gradient PNGs, so a screenshot proves the
            # KEY -> URL path without shipping artwork; a key not listed here draws its area placeholder.
            img = "http://127.0.0.1:3000/img/"
            entries = {"du-lich-bien-1": "a", "diem-bai-bien": "b", "diem-hai-san": "c", "diem-quang-truong": "d",
                       "diem-di-san": "a", "diem-karaoke": "b", "diem-rap-phim": "c", "diem-bar-rooftop": "d"}
            return self._send(200, {"version": "ci.1", "images": {
                k: {"status": "active", "url": img + v + ".png"} for k, v in entries.items()}})
        if path == "/api/favorites":
            return self._send(200, {"favorites": [] if MODE["saved"] == "empty" else FAVORITES})
        if path == "/api/reviews/saved":
            return self._send(200, {"reviews": [] if MODE["saved"] == "empty" else SAVED})
        if path == "/api/recommendations":
            return self._send(200, RECS)
        if path == "/api/reviews/feed":
            return self._send(200, {"reviews": FEED, "page": 0, "limit": 12})
        if path in ("/api/memory",):
            return self._send(200, {"memory": None})
        if path == "/api/preferences":
            # No `preferences` key = "never asked": the app does not open its onboarding sheet.
            return self._send(200, {})
        # ── Signed-in hub (UI test launches with -uitest-signed-in; sub = uitest-user) ──
        if path == "/api/profile":
            return self._send(200, {"full_name": "Minh Anh", "avatar_url": "", "email": "minh.anh@example.com",
                                    "bio": "Mê phở và cà phê sáng.", "cover_url": "http://127.0.0.1:3000/img/b.png"})
        if path == "/api/users/uitest-user":
            return self._send(200, {"id": "uitest-user", "full_name": "Minh Anh", "follower_count": 128,
                                    "following_count": 36, "review_count": 3, "is_self": True})
        # ── Phase 8 safety: the block list and someone else's profile / post / comments ──
        if path == "/api/users/blocks":
            return self._send(200, {"blocks": [{"blocked_id": b, "created_at": "2026-09-30T08:00:00.000Z"} for b in BLOCKED]})
        if path in ("/api/users/u2", "/api/users/u9"):
            people = {"u2": "Lan Phương", "u9": "Quốc Bảo"}
            uid = path.rsplit("/", 1)[1]
            return self._send(200, {"id": uid, "full_name": people[uid], "follower_count": 41, "following_count": 12,
                                    "review_count": 3, "is_following": False, "is_self": False})
        if path == "/api/reviews/r-safety":
            return self._send(200, _review(21, "Phở Thìn Bờ Hồ", "a", 12, id="r-safety", user_id="u2",
                                           body="Nước dùng ngọt xương, thịt bò tái lăn thơm.",
                                           profiles={"full_name": "Lan Phương"}))
        if path == "/api/reviews/r-safety/comments":
            return self._send(200, {"count": 2, "comments": [
                {"id": "c1", "body": "Quán này đông lắm, đi sớm nhé!", "created_at": "2026-09-30T07:00:00.000Z",
                 "user_id": "u9", "profiles": {"full_name": "Quốc Bảo"}},
                {"id": "c2", "body": "Cảm ơn bạn đã chia sẻ.", "created_at": "2026-09-30T07:30:00.000Z",
                 "user_id": "u2", "profiles": {"full_name": "Lan Phương"}}]})
        if path == "/api/reviews/mine":
            return self._send(200, {"reviews": MINE})
        if path == "/api/reviews/shared":
            return self._send(200, {"reviews": SAVED[:1]})
        if path == "/api/social/connections":
            return self._send(200, {"users": [{"id": "u2", "full_name": "Lan Phương"}, {"id": "u3", "full_name": "Quốc Bảo"}]})
        if path == "/api/subscription":
            pro = MODE.get("pro") == "on"
            return self._send(200, {"isPro": pro, "status": "active" if pro else None, "currentPeriodEnd": None,
                                    "freeDailyLimit": 20, "todayMessageCount": 3, "remaining": 17})
        if path == "/api/conversations":
            return self._send(200, OLD_CONVERSATIONS if MODE.get("history") == "on" else [])
        if path == "/api/deals":
            # The audit DB has no deals either: the page must still show the ask-Tappy card.
            return self._send(200, {"deals": []})
        return self._send(200, {})

    def do_POST(self):
        path = self.path.split("?")[0]
        raw = self._body()
        if path == "/__stub/mode":
            body = json.loads(raw or b"{}")
            # "blocked": [...] presets the fixture account's block list.
            if "blocked" in body:
                BLOCKED[:] = list(body.pop("blocked"))
            MODE.update(body)
            return self._send(200, MODE)
        if path == "/api/auth/anonymous":
            # No token minting in CI: the app continues as a plain guest.
            return self._send(503, {"error": "unavailable"})
        # ── Phase 8 safety (POST /api/reports; POST/DELETE /api/users/{id}/block) ──
        if path == "/api/reports":
            return self._send(200, {"ok": True})
        if path.startswith("/api/users/") and path.endswith("/block"):
            uid = path.split("/")[3]
            if self.command == "DELETE":
                if uid in BLOCKED:
                    BLOCKED.remove(uid)
                return self._send(200, {"ok": True, "blocked": False})
            if uid not in BLOCKED:
                BLOCKED.insert(0, uid)
            return self._send(200, {"ok": True, "blocked": True})
        # ── In-app account deletion (`flags.accountSelfDelete` on): the server accepts the confirm word ──
        if path == "/api/account/delete":
            return self._send(200, {"ok": True})
        if path == "/api/chat" and MODE.get("chat") == "auth":
            # No usable session: the «sign in to continue» card (not the 18+ gate).
            return self._send(401, {"error": "unauthorized"})
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
