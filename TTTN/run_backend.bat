@echo off
title Spring Boot Backend - Port 8080

set "JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot"
set "PATH=%JAVA_HOME%\bin;%PATH%"

set "MVN_CMD=C:\Users\admin\.m2\wrapper\dists\apache-maven-3.9.16\0daed3be3ebd1c706f0e69e8b07c6b73f5cc4ea3dfce72a8d0ec2e849ca2ddb0\bin\mvn.cmd"
if not exist "%MVN_CMD%" set "MVN_CMD=mvn"

cd /d "%~dp0backend"
echo =====================================================================
echo         DANG KHOI CHAY SPRING BOOT CORE BACKEND (PORT 8080)
echo =====================================================================
echo.
"%MVN_CMD%" spring-boot:run
if %errorlevel% neq 0 (
    echo.
    echo [LOI] Backend bi dung voi ma loi %errorlevel%!
)
pause
