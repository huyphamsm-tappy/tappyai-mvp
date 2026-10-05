#!/usr/bin/env python3
"""Compare the iOS Scam Shield strings with the CURRENT Web reference (needs no macOS).

    git fetch origin && python ios/scripts/web_parity_check.py [git-ref]      # default: the Web final SHA pinned below

Reads `src/lib/i18n/scamVerdict.ts` from the Web ref with `git show` and compares every verdict string that iOS
mirrors with the value in `ios/TappyAI/Resources/Localizable.xcstrings`, in Vietnamese and English.
It proves wording parity ONLY for these strings. It does not say the Web is final, and it does not compare
behaviour (the on-device message matcher, the layout, the API fields).
Exit status 1 when any string differs.
"""
import json
import os
import re
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
os.chdir(ROOT)
# The Web final: branch `p7/web-subscription`, commit adds docs/audit/CONSULTATIVE-FINAL-HANDOFF.md, code identical to 2a276ad.
WEB_FINAL_SHA = "a43948d41684386a46857077b02b6f413e025d1f"
ref = sys.argv[1] if len(sys.argv) > 1 else WEB_FINAL_SHA

# iOS key -> Web key
PAIRS = {
    "scam.msg.matched.title": "scamVerdict.familiar.title",
    "scam.msg.matched.body": "scamVerdict.familiar.body",
    "scam.msg.unsure.title": "scamVerdict.suspicious.title",
    "scam.msg.unsure.body": "scamVerdict.suspicious.body",
    "scam.msg.nosigns.title": "scamVerdict.unrecognized.title",
    "scam.msg.nosigns.body": "scamVerdict.unrecognized.body",
    "scamVerdict.link.familiar.title": "scamVerdict.link.familiar.title",
    "scamVerdict.link.familiar.body": "scamVerdict.link.familiar.body",
    "scamVerdict.link.suspicious.title": "scamVerdict.link.suspicious.title",
    "scamVerdict.link.suspicious.body": "scamVerdict.link.suspicious.body",
    "scamVerdict.link.unrecognized.title": "scamVerdict.link.unrecognized.title",
    "scamVerdict.link.unrecognized.body": "scamVerdict.link.unrecognized.body",
    "scamVerdict.disclaimer": "scamVerdict.disclaimer",
    "scamVerdict.scenario.report": "scamVerdict.scenario.report",
    "scamVerdict.link.reasons": "scamVerdict.link.reasons",
    "scamVerdict.qr.noVerdict": "scamVerdict.qr.noVerdict",
    "scam.msg.privacy": "scamVerdict.msg.privacy",
}

LINE = re.compile(r"\s*'([^']+)':\s*'(.*)',?\s*$")
# A template literal that only interpolates the scam-reporting hotline: `... ${SCAM_REPORT_HOTLINE.display} ...`
TEMPLATE_LINE = re.compile(r"\s*'([^']+)':\s*`(.*)`,?\s*$")


def hotline_display():
    out = subprocess.run(["git", "show", ref + ":src/lib/scam-shield/hotline.ts"], capture_output=True, text=True, encoding="utf-8")
    m = re.search(r"display:\s*'([^']+)'", out.stdout) if out.returncode == 0 else None
    return m.group(1) if m else None


def web_strings():
    out = subprocess.run(["git", "show", ref + ":src/lib/i18n/scamVerdict.ts"], capture_output=True, text=True, encoding="utf-8")
    if out.returncode != 0:
        sys.exit("cannot read scamVerdict.ts from %s: %s" % (ref, out.stderr.strip()))
    tables, current = {}, None
    for line in out.stdout.splitlines():
        head = re.match(r"export const (vi|en)\b", line)
        if head:
            current = head.group(1)
            tables[current] = {}
            continue
        m = LINE.match(line)
        if current and m:
            tables[current][m.group(1)] = m.group(2).replace("\\'", "'")
            continue
        t = TEMPLATE_LINE.match(line)
        if current and t and "${SCAM_REPORT_HOTLINE.display}" in t.group(2) and hotline_display():
            tables[current][t.group(1)] = t.group(2).replace("${SCAM_REPORT_HOTLINE.display}", hotline_display())
    return tables


def brand_assets():
    """The logo files in the iOS catalog are byte-identical to the Web's `public/brands/` files (the Web registry's `logo`)."""
    src = open("ios/TappyAI/Features/Deals/Model/BrandRegistry.swift", encoding="utf-8").read()
    ids = re.findall(r'BrandDefinition\(id: "([a-z-]+)"', src)
    diffs = 0
    for bid in ids:
        folder = "ios/TappyAI/Resources/Assets.xcassets/brand-%s.imageset" % bid
        files = [f for f in os.listdir(folder) if f != "Contents.json"]
        ours = open(os.path.join(folder, files[0]), "rb").read() if files else b""
        ext = files[0].rsplit(".", 1)[-1] if files else "svg"
        web = subprocess.run(["git", "show", "%s:public/brands/%s.%s" % (ref, bid, ext)], capture_output=True).stdout
        if ours != web or not web:
            diffs += 1
            print("DIFF logo %s: iOS %d bytes, Web %d bytes" % (bid, len(ours), len(web)))
    print("compared %d brand logos against %s, %d differences" % (len(ids), ref, diffs))
    return diffs


def main():
    tables = web_strings()
    with open("ios/TappyAI/Resources/Localizable.xcstrings", encoding="utf-8") as fh:
        cat = json.load(fh)["strings"]
    print("Web ref %s: %d vi / %d en strings parsed" % (ref, len(tables.get("vi", {})), len(tables.get("en", {}))))
    diffs = 0
    for ios_key, web_key in PAIRS.items():
        for lang in ("vi", "en"):
            ios = cat.get(ios_key, {}).get("localizations", {}).get(lang, {}).get("stringUnit", {}).get("value")
            web = tables.get(lang, {}).get(web_key)
            if ios != web:
                diffs += 1
                print("DIFF %s [%s]\n  ios: %s\n  web: %s" % (ios_key, lang, ios, web))
    print("compared %d strings, %d differences" % (len(PAIRS) * 2, diffs))
    diffs += brand_assets()
    sys.exit(1 if diffs else 0)


if __name__ == "__main__":
    main()
