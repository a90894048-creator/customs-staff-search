@echo off
cd /d "%~dp0"
echo ==== %date% %time% ==== >> collect.log
node collect.js --push >> collect.log 2>&1
