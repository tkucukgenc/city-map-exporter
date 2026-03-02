@echo off
title City Map Exporter - Setup
echo ===================================================
echo   CITY MAP EXPORTER - STARTING
echo ===================================================
echo.
echo Preparing Docker containers...
echo This may take a few minutes on the first run depending on your internet speed.
echo.

docker-compose up --build -d

echo.
echo ===================================================
echo   SETUP COMPLETE!
echo ===================================================
echo.
echo Application is running at:
echo      http://localhost:8080
echo.
echo Opening browser...
start http://localhost:8080
echo.
echo To stop: use Docker Desktop or run 'docker-compose down' in terminal.
echo.
echo Press any key to close this window...
pause >nul
