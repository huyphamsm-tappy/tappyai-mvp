Set oShell = CreateObject("WScript.Shell")
oShell.Run "cmd /k ""cd /d C:\Users\Admin\Claude\Projects\TappyAI\tappyai-mvp && git add src/app/error.tsx src/app/not-found.tsx && git commit -m ""feat: Phase 7 - global error boundary + 404 page"" && git push origin main && echo === PUSH THANH CONG ======"""
