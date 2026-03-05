@echo off
chcp 65001
cd /d %~dp0
node dist/cli.js
pause
