@echo off
cd /d "%~dp0"
echo Removing stale git lock files...
del /f /q .git\index.lock 2>nul
del /f /q .git\HEAD.lock 2>nul
echo.
echo Staging all local changes...
git add -A
echo.
echo Committing local changes (if any)...
git diff --cached --quiet
if %errorlevel% neq 0 (
  git commit -m "wip: sync local changes before pull"
)
echo.
echo Pulling latest from GitHub...
git pull --rebase origin main
if %errorlevel% neq 0 (
  echo ERROR: git pull failed!
  pause
  exit /b 1
)
echo.
echo Pushing to GitHub...
git push origin main
if %errorlevel% neq 0 (
  echo ERROR: git push failed!
  pause
  exit /b 1
)
echo.
echo === XONG! Vercel se tu deploy sau 1-2 phut ===
pause
