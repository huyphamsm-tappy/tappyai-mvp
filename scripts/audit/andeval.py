"""Android eval driver (emulator-5558, debug guest). usage: python andeval.py <id> "<unaccented question>" [--same-thread]
Starts a fresh thread (BACK -> Home -> Chat) unless --same-thread, types the question, waits, captures
bottom / middle / top screenshots into docs/audit/eval/android/<id>-*.png. ASCII only (adb input text)."""
import os, subprocess, sys, time
ADB = os.path.expandvars(r'%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe')
DEV = ['-s', 'emulator-5558']
OUT = r'D:\Claude\Projects\TappyAI\tappyai-mvp\.claude\worktrees\g1-place-guard\docs\audit\eval\android'
os.makedirs(OUT, exist_ok=True)

def adb(*a, capture=False):
    r = subprocess.run([ADB, *DEV, *a], capture_output=capture, text=False)
    return r.stdout if capture else None

def shot(name):
    png = adb('exec-out', 'screencap', '-p', capture=True)
    with open(os.path.join(OUT, name), 'wb') as f: f.write(png)

def tap(x, y): adb('shell', 'input', 'tap', str(x), str(y))
def swipe(x1, y1, x2, y2, ms=300): adb('shell', 'input', 'swipe', str(x1), str(y1), str(x2), str(y2), str(ms))

qid, text = sys.argv[1], sys.argv[2]
same = '--same-thread' in sys.argv
wait = int(next((sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == '--wait'), '45'))
if not same:
    adb('shell', 'input', 'keyevent', '4'); time.sleep(1.5)      # BACK -> Home (transcript dropped)
    tap(319, 2220); time.sleep(2.5)                              # Chat tab
tap(330, 2035); time.sleep(0.8)                                   # composer
adb('shell', 'input', 'text', text.replace(' ', '%s'))
time.sleep(0.8)
tap(996, 1374)                                                    # composer send (keyboard open)
time.sleep(1.0)
adb('shell', 'input', 'keyevent', '4'); time.sleep(0.5)           # close the keyboard only
time.sleep(wait)
shot(f'{qid}-1-bottom.png')
for _ in range(3): swipe(540, 700, 540, 1900, 250); time.sleep(0.4)
shot(f'{qid}-2-top.png')
swipe(540, 1900, 540, 700, 250); time.sleep(0.5)
shot(f'{qid}-3-mid.png')
print('captured', qid)
