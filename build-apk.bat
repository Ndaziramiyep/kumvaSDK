@echo off
echo ============================================
echo  MinewSensorApp - Build Standalone Debug APK
echo ============================================
echo.

REM Check ANDROID_HOME
if "%ANDROID_HOME%"=="" (
    echo ERROR: ANDROID_HOME is not set.
    echo.
    echo Fix:
    echo  1. Open Windows Start, search "Environment Variables"
    echo  2. Add User variable:
    echo       Name:  ANDROID_HOME
    echo       Value: C:\Users\HP\AppData\Local\Android\Sdk
    echo  3. Add to Path:
    echo       C:\Users\HP\AppData\Local\Android\Sdk\platform-tools
    echo  4. Close this window and reopen it, then run again.
    pause
    exit /b 1
)

echo ANDROID_HOME = %ANDROID_HOME%
echo.

cd /d "%~dp0"

echo [1/4] Installing npm dependencies...
call npm install
if errorlevel 1 ( echo FAILED: npm install & pause & exit /b 1 )

echo.
echo [2/4] Bundling JavaScript into APK assets...
if not exist "android\app\src\main\assets" mkdir "android\app\src\main\assets"
call node node_modules/react-native/local-cli/cli.js bundle ^
    --platform android ^
    --dev false ^
    --reset-cache ^
    --entry-file index.js ^
    --bundle-output android/app/src/main/assets/index.android.bundle ^
    --assets-dest android/app/src/main/res 2>nul

REM Newer RN uses the react-native binary directly
if errorlevel 1 (
    call npx react-native bundle ^
        --platform android ^
        --dev false ^
        --reset-cache ^
        --entry-file index.js ^
        --bundle-output android/app/src/main/assets/index.android.bundle ^
        --assets-dest android/app/src/main/res
    if errorlevel 1 ( echo FAILED: JS bundle & pause & exit /b 1 )
)

echo.
echo [3/4] Building debug APK with Gradle...
cd android
call gradlew.bat assembleDebug --stacktrace
if errorlevel 1 ( echo FAILED: Gradle build & pause & exit /b 1 )
cd ..

echo.
echo [4/4] Build complete!
echo.
echo APK is at:
echo   android\app\build\outputs\apk\debug\app-debug.apk
echo.
echo Next step: run install-phone.bat with your phone connected via USB.
echo.
pause
