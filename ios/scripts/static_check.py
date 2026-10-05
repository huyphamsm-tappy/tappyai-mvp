#!/usr/bin/env python3
"""Static checks for the iOS tree that need no macOS and no Xcode (run from the repo root or from ios/).

    python ios/scripts/static_check.py

What it proves (and what it does NOT):
  - Localizable.xcstrings is valid JSON, every key has en + vi, printf specifiers match between the two languages.
  - Every string key the Swift code references literally (NSLocalizedString("…"), Text("a.b"), titleKey: "a.b") exists.
  - Info.plist, entitlements and the privacy manifest parse as property lists.
  - The helper scripts (Python, shell, Node) have valid syntax.
  - No certificate, key, provisioning profile or Firebase plist is tracked by git; no PEM private key sits in ios/ or docs/ios/.
It does NOT compile Swift, resolve packages, run a test or sign anything: those are MAC-ONLY.
"""
import ast
import glob
import json
import os
import plistlib
import re
import shutil
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
os.chdir(ROOT)
failures = []


def check(name, ok, detail=""):
    print(("PASS  " if ok else "FAIL  ") + name + (": " + detail if detail else ""))
    if not ok:
        failures.append(name)


def strings_catalog():
    path = "ios/TappyAI/Resources/Localizable.xcstrings"
    with open(path, encoding="utf-8") as fh:
        cat = json.load(fh)["strings"]
    check("xcstrings is valid JSON", True, "%d keys" % len(cat))
    lacking = [k for k, v in cat.items() if not {"en", "vi"} <= set(v.get("localizations", {}))]
    check("every key has en and vi", not lacking, ", ".join(lacking[:8]))

    def specs(s):
        return sorted(re.findall(r"%(?:\d+\$)?[@dfsl]+", s))

    mismatch = [k for k, v in cat.items()
                if {"en", "vi"} <= set(v.get("localizations", {}))
                and specs(v["localizations"]["en"]["stringUnit"]["value"]) != specs(v["localizations"]["vi"]["stringUnit"]["value"])]
    check("printf specifiers match between en and vi", not mismatch, ", ".join(mismatch[:8]))

    used = set()
    for f in glob.glob("ios/TappyAI/**/*.swift", recursive=True):
        text = open(f, encoding="utf-8", errors="ignore").read()
        used |= set(re.findall(r'NSLocalizedString\("([^"]+)"', text))
        used |= set(re.findall(r'(?:Text|Label|Button)\("([A-Za-z0-9]+(?:\.[A-Za-z0-9]+)+)"', text))
        used |= set(re.findall(r'(?:titleKey|messageKey)\s*:\s*"([A-Za-z0-9]+(?:\.[A-Za-z0-9]+)+)"', text))
    missing = sorted(k for k in used if k not in cat and not k.endswith(".") and "%" not in k)
    check("every literal string key used in Swift exists", not missing, "%d used; missing: %s" % (len(used), ", ".join(missing[:10])))


def plists():
    files = (glob.glob("ios/TappyAI/**/*.plist", recursive=True) + glob.glob("ios/TappyAI/**/*.entitlements", recursive=True)
             + glob.glob("ios/TappyAI/**/*.xcprivacy", recursive=True))
    for p in files:
        try:
            with open(p, "rb") as fh:
                plistlib.load(fh)
            check("plist parses: " + p, True)
        except Exception as e:  # noqa: BLE001
            check("plist parses: " + p, False, str(e))


def scripts():
    for f in glob.glob("ios/scripts/*.py") + glob.glob("ios/ci_scripts/*.py"):
        try:
            ast.parse(open(f, encoding="utf-8").read())
            check("python syntax: " + f, True)
        except SyntaxError as e:
            check("python syntax: " + f, False, str(e))
    bash = shutil.which("bash")
    for f in glob.glob("ios/ci_scripts/*.sh"):
        if bash:
            ok = subprocess.run([bash, "-n", f], capture_output=True).returncode == 0
            check("shell syntax: " + f, ok)
    node = shutil.which("node")
    for f in glob.glob("ios/scripts/*.mjs"):
        if node:
            ok = subprocess.run([node, "--check", f], capture_output=True).returncode == 0
            check("node syntax: " + f, ok)


def secrets():
    tracked = subprocess.run(["git", "ls-files"], capture_output=True, text=True).stdout.splitlines()
    bad = [t for t in tracked if re.search(r"\.(p8|p12|cer|mobileprovision|pem)$", t, re.I)
           or t.endswith("GoogleService-Info.plist") or t.endswith("Secrets.xcconfig")]
    check("no certificate / key / profile / Firebase plist / Secrets.xcconfig is tracked", not bad, ", ".join(bad))
    hits = []
    for t in tracked:
        if t.startswith(("ios/", "docs/ios/")) and os.path.isfile(t):
            try:
                body = open(t, encoding="utf-8", errors="ignore").read()
            except OSError:
                continue
            if re.search(r"-----BEGIN [A-Z ]*PRIVATE KEY-----\s*[A-Za-z0-9+/=]{40,}", body):
                hits.append(t)
    check("no PEM private key body in ios/ or docs/ios/", not hits, ", ".join(hits))


def brands():
    """Every partner brand in BrandRegistry.swift has its imageset with the logo file."""
    src = open("ios/TappyAI/Features/Deals/Model/BrandRegistry.swift", encoding="utf-8").read()
    ids = re.findall(r'BrandDefinition\(id: "([a-z-]+)"', src)
    check("BrandRegistry lists the partner brands", len(ids) >= 1, "%d brands" % len(ids))
    for bid in ids:
        folder = "ios/TappyAI/Resources/Assets.xcassets/brand-%s.imageset" % bid
        files = [f for f in glob.glob(folder + "/*") if not f.endswith("Contents.json")]
        check("logo asset for brand " + bid, len(files) == 1 and os.path.getsize(files[0]) > 0, folder)


def home_sections():
    """The Web final Home has no «Gợi ý nhanh» cards and no «Ưu đãi hôm nay» rail (HomeV3.tsx): nothing in the app may render them."""
    banned = ["HomeDealsSection", "HomeSuggestedPromptsSection", "HomeQuickAction(", "home.v3.quickTitle", "home.v3.dealsTitle"]
    hits = []
    for path in glob.glob("ios/TappyAI/**/*.swift", recursive=True):
        body = open(path, encoding="utf-8").read()
        hits += [os.path.basename(path) + ": " + w for w in banned if w in body]
    check("Home does not reference the removed quick-suggestion / deals sections", not hits, ", ".join(hits))


if __name__ == "__main__":
    home_sections()
    strings_catalog()
    plists()
    scripts()
    secrets()
    brands()
    print("\n%s" % ("ALL STATIC CHECKS PASSED" if not failures else "FAILED: " + "; ".join(failures)))
    sys.exit(1 if failures else 0)
