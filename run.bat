@echo off
cd /d "%~dp0"
echo ==== %date% %time% ==== >> collect.log
rem Get latest collect.js from GitHub (keep current file if download fails)
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -Uri https://raw.githubusercontent.com/a90894048-creator/customs-staff-search/main/collect.js -OutFile collect.new.js; node --check collect.new.js; if ($LASTEXITCODE -eq 0) { Move-Item -Force collect.new.js collect.js } } catch { }" >> collect.log 2>&1
if exist collect.new.js del collect.new.js
node collect.js --push >> collect.log 2>&1
