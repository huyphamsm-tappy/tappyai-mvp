@echo off
cd /d "%~dp0"
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul
git add src/app/api/chat/route.ts
git commit -m "fix: restore truncated file ending (applyLuxuryStreamFilter missing)"
git push origin main
echo.
echo === DONE ===
pause
