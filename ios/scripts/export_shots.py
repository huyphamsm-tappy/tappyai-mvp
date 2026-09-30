#!/usr/bin/env python3
"""Copies the screenshots out of `xcresulttool export attachments` under their attachment names.

usage: export_shots.py <attachments-dir> <out-dir>

`xcresulttool export attachments` writes the files under generated names plus a manifest.json that
maps each back to the test and to the attachment's suggestedHumanReadableName
("01-login_0_<UUID>.png"). We keep the leading name so the CI artifact reads 01-login.png,
02-age-gate.png, ... The same test may be retried; the last attachment of a name wins.
"""
import json
import os
import re
import shutil
import sys


def main(src, out):
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(src, "manifest.json"), encoding="utf-8") as f:
        manifest = json.load(f)
    n = 0
    for test in manifest:
        for att in test.get("attachments", []):
            human = att.get("suggestedHumanReadableName") or att["exportedFileName"]
            base = re.sub(r"_\d+_[0-9A-Fa-f-]{36}(\.\w+)?$", "", human)
            base = os.path.splitext(base)[0]
            ext = os.path.splitext(att["exportedFileName"])[1] or ".png"
            if ext.lower() != ".png":
                continue
            # Only our own "NN-name" attachments; Xcode also attaches "UI Snapshot"/"Synthesized Event"
            # files (hierarchy dumps saved with a .png name) for failed steps.
            if not re.match(r"^\d\d-", base):
                continue
            shutil.copyfile(os.path.join(src, att["exportedFileName"]), os.path.join(out, base + ".png"))
            n += 1
    print(f"exported {n} screenshots to {out}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
