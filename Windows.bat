@echo off
chcp 65001
cd /d "%~dp0"

call .venv\Scripts\activate

start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\chrome-tmp"
timeout /t 6

python bat_pepiteer_Clik\macro_script.py

timeout /t 30

node parsers\puppeteer_upwork.js

echo === Всё завершено ===
pause
