@echo off
REM run-dev-with-worker.bat
REM Start both API server and worker process for Windows local development

echo.
echo 🚀 Starting Impact Bridge with workers...
echo.
echo This script will start:
echo   1. API Server (port 5000) - Terminal 1
echo   2. BullMQ Workers (Redis) - Terminal 2
echo.
echo Instructions:
echo   - Window 1: API Server
echo   - Window 2: BullMQ Workers
echo   - Press Ctrl+C in each window to stop
echo.
pause

REM Start API in new terminal
start "Impact Bridge API" cmd /k "npm run dev"

REM Wait a bit for API to start
timeout /t 3 /nobreak

REM Start worker in new terminal
start "Impact Bridge Workers" cmd /k "npm run worker"

echo.
echo ✅ Both processes started!
echo   - API: http://localhost:5000
echo   - Swagger: http://localhost:5000/api/docs
echo.
pause
