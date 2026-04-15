@echo off
setlocal
echo ================================================
echo   MinewSensorApp - Build Release APK
echo ================================================
echo.

REM ── Auto-detect ANDROID_HOME if not set ─────────────────────────────────
if "%ANDROID_HOME%"=="" (
    if exist "C:\Android\platform-tools\adb.exe" (
        set ANDROID_HOME=C:\Android
        echo Auto-detected ANDROID_HOME=C:\Android
    ) else (
        echo ERROR: ANDROID_HOME is not set and SDK not found at C:\Android
        echo Please run setup-sdk.bat first.
        pause & exit /b 1
    )
)

echo ANDROID_HOME = %ANDROID_HOME%
echo.

cd /d "%~dp0"

REM ── npm install ──────────────────────────────────────────────────────────
echo [1/4] Installing JS dependencies...
call npm install
if errorlevel 1 ( echo FAILED: npm install & pause & exit /b 1 )

REM ── Bundle JS ────────────────────────────────────────────────────────────
echo.
echo [2/4] Bundling JavaScript...
if not exist "android\app\src\main\assets" mkdir "android\app\src\main\assets"

call npx react-native bundle ^
    --platform android ^
    --dev false ^
    --entry-file index.js ^
    --bundle-output android\app\src\main\assets\index.android.bundle ^
    --assets-dest android\app\src\main\res

if errorlevel 1 ( echo FAILED: JS bundle & pause & exit /b 1 )

REM ── Gradle build ─────────────────────────────────────────────────────────
echo.
echo [3/4] Building release APK...
echo (First build downloads dependencies - needs internet / phone hotspot)
echo.
cd android
call gradlew.bat assembleRelease
if errorlevel 1 ( echo FAILED: Gradle build & cd .. & pause & exit /b 1 )
cd ..

REM ── Copy to Desktop ──────────────────────────────────────────────────────
echo.
echo [4/4] Copying APK to Desktop...
set SRC=android\app\build\outputs\apk\release\app-release.apk
set DST=%USERPROFILE%\Desktop\MinewSensorApp.apk

if exist "%SRC%" (
    copy /Y "%SRC%" "%DST%"
    echo.
    echo ================================================
    echo   APK ready: Desktop\MinewSensorApp.apk
    echo ================================================
    echo.
    echo Share via WhatsApp as a DOCUMENT (not photo).
    echo Receiver: Settings > Install unknown apps > Allow
    echo.
) else (
    echo APK not found. Check android\app\build\outputs\apk\release\
)

pause
endlocal
