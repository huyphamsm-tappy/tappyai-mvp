#!/usr/bin/env python3
"""Pairs each iOS screenshot with the matching Android reference image for the CI artifact.

usage: pair_evidence.py <ios-shots-dir> <repo-root> <out-dir>

Android references are the committed evidence under docs/uat/evidence/android-parity (a web|Android
composite per screen, captured 28/09 on the emulator BEFORE the parity work — the latest Android
shots are kept outside git). The pair is labelled with what the right-hand image is, so nobody
mistakes a baseline for a final. A screen with no Android reference is still written (iOS alone)
and listed in pairs.md as "no Android reference".
"""
import os
import sys

from PIL import Image, ImageDraw

# iOS shot name -> Android reference (relative to docs/uat/evidence/android-parity)
REFERENCES = {
    # Post-parity Android shots where they are committed (web | Android composites), else the 28/09 baseline.
    "01-login": "login/after-web-vs-android.png",
    "02-age-gate": "step1-hientrang/03-age-gate-18.png",
    "03-hub-guest": "profile-hub/after-web-vs-android.png",
    "15-login-prod-config": "login/after-web-vs-android.png",
    "16-hub-signed-in": "profile-owner/03-tab-Đã đăng.png",
    "17-hub-restricted": "profile-owner/06-tab-Bị hạn chế.png",
    "04-saved": "step1-hientrang/11-saved.png",
    "05-saved-empty": "step1-hientrang/11-saved.png",
    "06-saved-places": "step1-hientrang/11-saved.png",
    "07-viet-content": "step1-hientrang/10-viet-content.png",
    "08-recommendations": "step1-hientrang/09-recommendations.png",
    "33-settings": "step1-hientrang/12-settings.png",
    "34-settings-guest": "step1-hientrang/12-settings.png",
    "35-settings-bottom": "step1-hientrang/12-settings.png",
    "36-settings-guest-top": "step1-hientrang/12-settings.png",
    "47-login-apple": "login/after-web-vs-android.png",
    "23-home": "step1-hientrang/01-home.png",
    "24-home-2": "step1-hientrang/01-home.png",
    "25-home-3": "step1-hientrang/01-home.png",
    "26-home-4": "step1-hientrang/01-home.png",
    "27-home-5": "step1-hientrang/14-tools.png",
    "20-mob1-zalo-no-state": "login/after-web-vs-android.png",
    "21-mob1-zalo-wrong-state": "login/after-web-vs-android.png",
}
# Share cards have no committed Android render (kept outside git); pair them with the owner's
# APPROVED layout samples (docs/design/share-layouts) — root-relative paths, labelled as such.
DESIGN = {
    "09-card-review": "docs/design/share-layouts/profile-qr.png",
    "10-card-clip": "docs/design/share-layouts/profile-qr.png",
    "11-card-suggestion": "docs/design/share-layouts/profile-qr.png",
    "12-card-plan": "docs/design/share-layouts/plan-share.png",
    "13-card-qr": "docs/design/share-layouts/profile-qr.png",
    "48-plan-travel": "docs/design/share-layouts/plan-share.png",
    "49-plan-travel-bottom": "docs/design/share-layouts/plan-share.png",
    "50-plan-food": "docs/design/share-layouts/plan-share.png",
    "51-plan-entertainment": "docs/design/share-layouts/plan-share.png",
    "52-plan-shopping": "docs/design/share-layouts/plan-share.png",
    "53-plan-spa": "docs/design/share-layouts/plan-share.png",
    "28-ask-entertainment": "docs/design/ask-card/ask-card-mockup.png",
    "29-ask-food": "docs/design/ask-card/ask-card-mockup.png",
    "30-ask-shopping": "docs/design/ask-card/ask-card-mockup.png",
    "31-ask-travel": "docs/design/ask-card/ask-card-mockup.png",
    "32-ask-spa": "docs/design/ask-card/ask-card-mockup.png",
    "61-ask-flight": "docs/design/ask-card/ask-card-mockup.png",
    "63-voice-idle": "docs/design/voice/voice-mockup.png",
    "64-voice-text": "docs/design/voice/voice-mockup.png",
    "65-voice-error": "docs/design/voice/voice-mockup.png",
}
HEIGHT = 1400


def fit(img, height):
    w = round(img.width * height / img.height)
    return img.resize((w, height))


def main(shots_dir, repo, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    rows = []
    for fn in sorted(os.listdir(shots_dir)):
        if not fn.lower().endswith(".png"):
            continue
        name = os.path.splitext(fn)[0]
        ios = fit(Image.open(os.path.join(shots_dir, fn)).convert("RGB"), HEIGHT)
        design_rel = DESIGN.get(name)
        ref_rel = design_rel or REFERENCES.get(name)
        if design_rel:
            ref_path = os.path.join(repo, design_rel)
            ref_label = ("Ask card v2 mockup (owner 30/09)" if "ask-card" in design_rel
                         else "Voice mockup (03. Voice / Chat Input Active)" if "voice" in design_rel
                         else "Approved layout sample (owner pick 29/09)")
        else:
            ref_path = os.path.join(repo, "docs/uat/evidence/android-parity", ref_rel) if ref_rel else None
            ref_label = "Android reference: web | Android | mockup, baseline 28/09"
        if ref_path and os.path.exists(ref_path):
            ref = fit(Image.open(ref_path).convert("RGB"), HEIGHT)
            canvas = Image.new("RGB", (ios.width + ref.width + 30, HEIGHT + 60), "white")
            canvas.paste(ios, (0, 60))
            canvas.paste(ref, (ios.width + 30, 60))
            d = ImageDraw.Draw(canvas)
            d.text((10, 20), f"iOS (this build) - {name}", fill="black")
            d.text((ios.width + 40, 20), ref_label, fill="black")
            rows.append((name, ref_rel))
        else:
            canvas = Image.new("RGB", (ios.width, HEIGHT + 60), "white")
            canvas.paste(ios, (0, 60))
            ImageDraw.Draw(canvas).text((10, 20), f"iOS (this build) - {name} - no Android reference", fill="black")
            rows.append((name, None))
        canvas.save(os.path.join(out_dir, f"{name}-pair.png"))
    with open(os.path.join(out_dir, "pairs.md"), "w", encoding="utf-8") as f:
        f.write("| iOS screenshot | Android reference |\n|---|---|\n")
        for name, ref in rows:
            f.write(f"| {name}.png | {ref or 'no Android reference'} |\n")
    print(f"paired {len(rows)} screenshots")


if __name__ == "__main__":
    main(*sys.argv[1:4])
