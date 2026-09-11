@echo off
title AI Service Flask - Port 5000

set "PYTHON_EXE=C:\Users\admin\AppData\Local\Programs\Python\Python310\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=python"

cd /d "%~dp0ai_service"
echo =====================================================================
echo              DANG KHOI CHAY AI SERVICE (FLASK PORT 5000)
echo =====================================================================
echo.
"%PYTHON_EXE%" app.py
if %errorlevel% neq 0 (
    echo.
    echo [LOI] AI Service bi dung voi ma loi %errorlevel%!
)
pause
