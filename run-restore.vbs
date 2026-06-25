Set oShell = CreateObject("WScript.Shell")
oShell.Run "cmd /k ""cd /d C:\Users\Admin\Claude\Projects\TappyAI\tappyai-mvp && git add src/components/ChatInterface.tsx && git commit -m ""feat: TTS doc to tin nhan AI bang browser SpeechSynthesis (vi-VN)"" && git push origin main && echo === PUSH THANH CONG ======"""
WScript.Sleep 1000
