@echo off
title OpenAlien
chcp 65001 >nul 2>&1
node "%~dp0dist\cli.js"
pause
