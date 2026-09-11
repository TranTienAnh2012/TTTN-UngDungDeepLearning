@echo off
title HE THONG DIEM DANH KHUON MAT - OPENCV

set "PYTHON_EXE=C:\Users\admin\AppData\Local\Programs\Python\Python310\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=python"

:MENU
cls
echo =====================================================================
echo         HE THONG DIEM DANH KHUON MAT (OPENCV + INSIGHTFACE)
echo =====================================================================
echo.
echo   1. Dang ky Sinh vien va Khuon mat moi (enroll.py)
echo   2. Khoi dong Nhan dien va Diem danh Real-time (main.py)
echo   3. Cai dat thu vien Python can thiet
echo   4. Kiem tra ket noi CSDL MySQL (Port 3306)
echo   0. Thoat
echo.
echo =====================================================================
set /p opt="> Chon chuc nang [0-4]: "

if "%opt%"=="1" goto ENROLL
if "%opt%"=="2" goto SCAN
if "%opt%"=="3" goto INSTALL_DEPS
if "%opt%"=="4" goto TEST_DB
if "%opt%"=="0" goto EXIT_PROG
goto MENU

:ENROLL
cls
echo Dang khoi dong enroll.py...
echo.
"%PYTHON_EXE%" enroll.py
echo.
pause
goto MENU

:SCAN
cls
echo Dang khoi dong main.py (Nhan phim 'q' de thoat camera)...
echo.
"%PYTHON_EXE%" main.py
echo.
pause
goto MENU

:INSTALL_DEPS
cls
echo Dang cai dat thu vien Python...
echo.
"%PYTHON_EXE%" -m pip install --upgrade pip
"%PYTHON_EXE%" -m pip install opencv-python insightface onnxruntime mysql-connector-python numpy
echo.
echo Da cai dat xong!
pause
goto MENU

:TEST_DB
cls
echo Dang kiem tra ket noi MySQL...
"%PYTHON_EXE%" -c "import mysql.connector; conn = mysql.connector.connect(host='127.0.0.1', user='root', password='123456', database='face_attendance_db', port=3306); cur = conn.cursor(); cur.execute('SELECT COUNT(*) FROM students'); total = cur.fetchone()[0]; print('[OK] Ket noi MySQL thanh cong! Tong so SV:', total); conn.close()"
if %errorlevel% neq 0 (
    echo [LOI] Khong the ket noi den MySQL port 3306!
)
echo.
pause
goto MENU

:EXIT_PROG
exit /b
