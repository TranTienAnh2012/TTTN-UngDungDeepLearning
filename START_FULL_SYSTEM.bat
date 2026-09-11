@echo off
title TRUNG TAM DIEU KHIEN HE THONG DIEM DANH DEEP LEARNING

:MENU
cls
echo =====================================================================
echo       TRUNG TAM DIEU KHIEN HE THONG DIEM DANH DEEP LEARNING
echo =====================================================================
echo.
echo   1. Khoi chay TOAN BO He thong Web (AI Service + Backend + Web UI)
echo   2. Khoi chay Module OpenCV Diem danh va Dang ky (OPENCV-SCAN)
echo   3. Chi khoi chay AI Microservice (Flask Port 5000)
echo   4. Chi khoi chay Core Backend (Spring Boot Port 8080)
echo   5. Cai dat thu vien Python va Kiem tra moi truong
echo   0. Thoat
echo.
echo =====================================================================
set /p opt="> Vui long chon chuc nang [0-5]: "

if "%opt%"=="1" goto START_ALL
if "%opt%"=="2" goto START_OPENCV
if "%opt%"=="3" goto START_AI
if "%opt%"=="4" goto START_BACKEND
if "%opt%"=="5" goto SETUP_ENV
if "%opt%"=="0" goto EXIT_PROG
goto MENU

:START_ALL
cls
echo =====================================================================
echo          DANG KHOI DONG TOAN BO HE THONG...
echo =====================================================================
echo.
echo 1. Dang khoi chay AI Microservice (Flask Port 5000)...
start "AI Service Flask - 5000" cmd /c "call "%~dp0TTTN\run_ai_service.bat""

echo.
echo 2. Dang khoi chay Spring Boot Core Backend (Port 8080)...
start "Spring Boot Backend - 8080" cmd /c "call "%~dp0TTTN\run_backend.bat""

echo.
echo 3. Dang mo trinh duyet Web Dashboard...
timeout /t 6 >nul
start http://localhost:8080

echo.
echo [OK] Da khoi chay cac tien trinh tren cua so rieng!
echo - Web Dashboard: http://localhost:8080
echo - AI Service:    http://localhost:5000
echo.
pause
goto MENU

:START_OPENCV
cls
cd /d "%~dp0OPENCV-SCAN"
call run.bat
cd /d "%~dp0"
goto MENU

:START_AI
cls
start "AI Service Flask - 5000" cmd /c "call "%~dp0TTTN\run_ai_service.bat""
goto MENU

:START_BACKEND
cls
start "Spring Boot Backend - 8080" cmd /c "call "%~dp0TTTN\run_backend.bat""
goto MENU

:SETUP_ENV
cls
echo =====================================================================
echo          CAI DAT THU VIEN VA KIEM TRA MOI TRUONG
echo =====================================================================
echo.
set "PYTHON_EXE=C:\Users\admin\AppData\Local\Programs\Python\Python310\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=python"

"%PYTHON_EXE%" -m pip install --upgrade pip
"%PYTHON_EXE%" -m pip install opencv-python insightface onnxruntime mysql-connector-python numpy flask flask-cors torch torchvision facenet-pytorch Pillow
echo.
echo Kiem tra ket noi CSDL MySQL (Port 3306)...
"%PYTHON_EXE%" -c "import mysql.connector; conn = mysql.connector.connect(host='127.0.0.1', user='root', password='123456', database='face_attendance_db', port=3306); print('[OK] Ket noi MySQL 3306 thanh cong!'); conn.close()"
echo.
pause
goto MENU

:EXIT_PROG
exit /b
