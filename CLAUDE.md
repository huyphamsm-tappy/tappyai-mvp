# TappyAI — working rules for Claude Code

## Editing source
- Edit code **only** through the Edit / Write tools (or a `.py` patch script written with the Write tool and then executed).
- **Never** author or modify source through the shell: no heredocs (`cat <<EOF`), no `sed -i`, no inline `python -c` / `python - <<EOF`, no `echo … >`.
  Measured repeatedly in this repo: the shell layer mangles `\n`, `\p{L}`, backticks and quotes, and a silent mangle either corrupts the file or makes a patch "apply" to the wrong text.
- Shell is for running things (tests, git, scripts), reading (`cat`, `grep`, `sed -n`), and for scratch files under the session scratchpad — not for writing project files.

## Line endings
- The repository is LF (`.gitattributes`: `* text=auto eol=lf`). Write files as LF; never commit a CRLF conversion of an existing file.
