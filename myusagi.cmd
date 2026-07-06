@echo off
setlocal
set ROOT=%~dp0
set BIN=%ROOT%target\release\myusagi.exe
if not exist "%BIN%" set BIN=%ROOT%target\debug\myusagi.exe
if not exist "%BIN%" (
  echo myusagi binary not found. Run: cargo build --release
  exit /b 1
)
"%BIN%" %*
