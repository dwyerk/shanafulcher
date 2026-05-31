@echo off
title Shana Fulcher Website - Local Server
echo =======================================================
echo Starting local web server for shanafulcherdotcom...
echo =======================================================
echo.
echo Opening browser to http://localhost:8000 ...
start http://localhost:8000
echo.
echo Running server. Press Ctrl+C in this window to stop.
echo.
node serve-locally.js
