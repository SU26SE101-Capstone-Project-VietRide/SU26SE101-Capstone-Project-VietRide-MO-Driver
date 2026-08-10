@echo off
rem Build release APK — dung: .\build-release.bat (chay tu bat ky dau)
rem JDK 17 portable bat buoc cho RN 0.85 (xem AGENTS.md / memory android-build-env)
set "JAVA_HOME=%USERPROFILE%\.jdks\jdk-17.0.19+10"
cd /d "%~dp0android"
call gradlew.bat assembleRelease
if errorlevel 1 (
  echo.
  echo *** BUILD LOI - thu don cache: xoa android\build android\.gradle android\app\build android\.cxx roi chay lai
  exit /b 1
)
echo.
echo *** XONG! APK: %~dp0android\app\build\outputs\apk\release\app-release.apk
