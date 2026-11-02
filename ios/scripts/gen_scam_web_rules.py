#!/usr/bin/env python3
"""Regenerate ios/TappyAI/Features/UtilityTools/Model/ScamWebRules.swift from the Web's message rules.

    python ios/scripts/gen_scam_web_rules.py [git-ref]      # default: origin/p7/web-subscription

The Web's deterministic social-engineering rules (`src/lib/scam-shield/message/rules.ts`) decide, with the AI switched off,
whether a message is «familiar» (level HIGH+) or «suspicious» (MEDIUM). The phone runs the same patterns on the same
normalised text, so the verdict is the Web's. The patterns are copied verbatim, never retyped.
"""
import os
import re
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
os.chdir(ROOT)
ref = sys.argv[1] if len(sys.argv) > 1 else "origin/p7/web-subscription"
src = subprocess.run(["git", "show", ref + ":src/lib/scam-shield/message/rules.ts"], capture_output=True, text=True, encoding="utf-8").stdout
if not src:
    sys.exit("cannot read rules.ts from " + ref)
BACKSLASH = chr(92)


def read_regex(s, i):
    """The JS regex literal that starts at s[i] == '/': (pattern, flags, index after it)."""
    j = i + 1
    in_class = False
    while True:
        c = s[j]
        if c == BACKSLASH:
            j += 2
            continue
        if c == "[":
            in_class = True
        elif c == "]":
            in_class = False
        elif c == "/" and not in_class:
            break
        j += 1
    k = j + 1
    flags = ""
    while s[k].isalpha():
        flags += s[k]
        k += 1
    return s[i + 1:j], flags, k


def raw(p):
    h = "#"
    while '"' + h in p:
        h += "#"
    return h + '"' + p + '"' + h


body = src[src.index("const RULES: Rule[] = ["):src.index("/** Brand / institution names")]
rules = []
head = re.compile(r"type: '(\w+)', severity: '(\w+)', weight: (\d+)(, negatable: true)?,\s*patterns: \[")
for m in head.finditer(body):
    i = m.end()
    pats = []
    while True:
        while body[i] in " \n\t,":
            i += 1
        if body.startswith("//", i):
            i = body.index("\n", i)
            continue
        if body[i] == "]":
            break
        p, fl, i = read_regex(body, i)
        pats.append(p)
    rules.append((m.group(1), m.group(2), int(m.group(3)), bool(m.group(4)), pats))

imp = re.search(r"const IMPERSONATION_TARGETS =\s*/(.*)/(\w*)\n", src)
neg = re.search(r"const NEGATION_WORDS = /(.*)/g", src).group(1)
cond = re.search(r"const CONDITIONAL_BEFORE = /(.*)/\n", src).group(1)

out = [
    "// GENERATED from the Web `src/lib/scam-shield/message/rules.ts` (%s) by ios/scripts/gen_scam_web_rules.py." % ref,
    "// Do not edit by hand: regenerate. Patterns run on the lower-cased, diacritic-stripped message.",
    "import Foundation",
    "",
    "enum ScamWebRules {",
    "    struct Rule { let type: String; let severity: String; let weight: Int; let negatable: Bool; let patterns: [String] }",
    "",
    "    static let rules: [Rule] = [",
]
for t, sv, w, ng, pats in rules:
    out.append('        Rule(type: "%s", severity: "%s", weight: %d, negatable: %s, patterns: [' % (t, sv, w, "true" if ng else "false"))
    for p in pats:
        out.append("            " + raw(p) + ",")
    out.append("        ]),")
out.append("    ]")
out.append("")
out.append("    static let impersonationTargets = " + raw(imp.group(1)))
out.append("    static let negationWords = " + raw(neg))
out.append("    static let conditionalBefore = " + raw(cond))
out.append("}")
dest = "ios/TappyAI/Features/UtilityTools/Model/ScamWebRules.swift"
open(dest, "w", encoding="utf-8", newline="\n").write("\n".join(out) + "\n")
print("wrote %s: %d rules, %d patterns" % (dest, len(rules), sum(len(r[4]) for r in rules)))
