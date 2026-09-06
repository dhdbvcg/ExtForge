@echo off
REM =============================================================
REM  Deploy scratchextensioneditor to Cloudflare Pages
REM  (static site + Functions + KV + Resend email verification)
REM
REM  IMPORTANT: This file must stay pure ASCII with CRLF line
REM  endings. Chinese comments here would be misread by cmd.exe
REM  as GBK and break the script.
REM
REM  Double-click to run. Requires: Cloudflare login (first run
REM  opens browser for OAuth).
REM =============================================================
cd /d "%~dp0"

SETLOCAL ENABLEDELAYEDEXPANSION
SET "PROJ=scratchextensioneditor"
SET "PLACEHOLDER=669f15cdb6a04e6d9c7a1a3f2b8e5c41"

REM ---- Production branch of your Pages project ----
REM Without --branch, wrangler deploys to a PREVIEW url and your
REM live domain keeps serving the OLD build. Set this to the real
REM production branch name (usually "main" or "master").
REM Check it with:  npx wrangler pages project list
SET "BRANCH=main"

REM ---- Optional overrides from command line ----
REM   deploy-pages.bat                      (defaults)
REM   deploy-pages.bat master               (branch = master)
REM   deploy-pages.bat main rapid-fog-ed26  (branch + project)
if not "%~1"=="" SET "BRANCH=%~1"
if not "%~2"=="" SET "PROJ=%~2"

echo.
echo ============================================
echo   Project : %PROJ%
echo   Branch  : %BRANCH%
echo ============================================
echo.

REM ---- Step 0: make sure npx is reachable ----
where npx >nul 2>nul
if %errorlevel% neq 0 (
    if exist "C:\Program Files\nodejs\npx.cmd" (
        echo [0/5] npx not in PATH - adding C:\Program Files\nodejs
        set "PATH=!PATH!;C:\Program Files\nodejs"
    ) else (
        echo.
        echo [ERROR] npx not found.
        echo Node.js is not installed or not in PATH.
        echo Install Node.js from https://nodejs.org then run again.
        echo.
        goto :fail
    )
)

REM ---- Step 1: Cloudflare login ----
echo [1/5] Checking Cloudflare login...

REM 1a. Already have a token in the environment?
if defined CLOUDFLARE_API_TOKEN (
    echo Found CLOUDFLARE_API_TOKEN in environment.
    npx -y wrangler whoami
    if !errorlevel! neq 0 (
        echo.
        echo [ERROR] Token was rejected.
        echo   - wrong/expired token, or
        echo   - token has an IP allowlist that excludes you (error 9109)
        echo.
        goto :fail
    )
    goto :step2
)

REM 1b. Maybe already logged in from a previous run
npx -y wrangler whoami >nul 2>nul
if %errorlevel%==0 (
    echo Already logged in via stored OAuth session.
    goto :step2
)

REM 1c. Not logged in - offer a choice.
echo Not logged in.
echo.
echo ============================================
echo   Choose login method
echo ============================================
echo.
echo   [1] API token   (RECOMMENDED - no browser needed)
echo   [2] Browser OAuth (often fails on this PC:
echo       the browser does not auto-open and the
echo       link expires in ~60s)
echo.
echo   To make an API token:
echo   dash.cloudflare.com - My Profile - API Tokens
echo   - Create Token - Custom token, add THREE permissions:
echo     Account / Cloudflare Pages / Edit
echo     Account / Workers KV Storage / Edit
echo     Account / Account Settings / Read
echo   (In the Chinese UI search "Pages", "KV",
echo    and "Settings" - NOT "Workers Scripts")
echo   Leave the IP address filter EMPTY.
echo ============================================
echo.
set "CHOICE="
set /p CHOICE="Enter 1 or 2, then press Enter: "
if "!CHOICE!"=="2" goto :oauthlogin
if "!CHOICE!"=="1" goto :tokenlogin

echo.
echo [ERROR] Invalid choice "!CHOICE!" - please enter 1 or 2.
goto :fail

:tokenlogin
echo.
set "TOKENIN="
set /p TOKENIN="Paste your API token (cfut_...) here: "
if "!TOKENIN!"=="" (
    echo [ERROR] No token entered.
    goto :fail
)
set "CLOUDFLARE_API_TOKEN=!TOKENIN!"
echo.
echo Verifying token...
npx -y wrangler whoami
if !errorlevel! neq 0 (
    echo.
    echo [ERROR] Token rejected.
    echo   If you see error 9109, the token has an IP
    echo   allowlist and your current IP is not in it.
    echo   Edit the token and remove the IP filter,
    echo   or add your current public IP to it.
    echo.
    goto :fail
)
echo Token accepted.
goto :step2

:oauthlogin
echo.
echo ============================================
echo   A URL starting with:
echo     https://dash.cloudflare.com/oauth2/auth
echo   will appear below. Copy it into your browser
echo   FAST and click Allow. You have ~60 seconds.
echo ============================================
echo.
pause
echo.
npx -y wrangler login
if !errorlevel! neq 0 (
    echo.
    echo [ERROR] Browser OAuth failed or timed out.
    echo   Re-run this script and choose option [1]
    echo   (API token) instead.
    echo.
    goto :fail
)
goto :step2

:step2

REM ---- Step 2: KV namespace (skip if already configured) ----
echo.
echo [2/5] Checking KV namespace...

REM If the real namespace id is already written into wrangler.toml,
REM skip creation entirely - otherwise "kv namespace create" fails
REM with: "A KV namespace with the title 'AUTH_KV' already exists".
findstr /C:"669f15cd7b66499fa5e8e5f6f8227b5c" wrangler.toml >nul
if %errorlevel%==0 (
    echo KV namespace already configured (id 669f15cd...) - skipping.
) else (
    echo Creating / reusing KV namespace "AUTH_KV"...
    npx -y wrangler kv namespace create AUTH_KV --update-config
    if !errorlevel! neq 0 (
        echo.
        echo [WARN] Create returned an error - the namespace may
        echo already exist. The id configured in wrangler.toml is:
        echo   id = "669f15cd7b66499fa5e8e5f6f8227b5c"
        echo Continuing with that existing namespace.
        echo.
    ) else (
        echo KV namespace created and written to wrangler.toml.
    )
)

REM ---- Step 3: Resend API key (interactive) ----
echo.
echo [3/5] Setting RESEND_API_KEY secret...
echo.
echo   >>> Paste your Resend API key below and press Enter. <<<
echo   >>> Input is hidden for security.                   <<<
echo   >>> Already set and unchanged? Just press Ctrl+C    <<<
echo   >>> and re-run without this step if needed.         <<<
echo.
npx -y wrangler pages secret put RESEND_API_KEY --project-name %PROJ%
if !errorlevel! neq 0 (
    echo.
    echo [ERROR] Failed to set secret.
    echo You can also set it in the dashboard:
    echo   Pages - %PROJ% - Settings - Environment variables
    echo.
    goto :fail
)

REM ---- Step 4: Confirm which project owns the live domain ----
echo.
echo [4/5] Checking your Pages projects...
echo.
echo   >>> VERIFY the project that owns scratchextensioneditor.cc.cd
echo   >>> matches "Project" shown at the top of this window.
echo   >>> If it does NOT, press Ctrl+C and re-run with:
echo   >>>     deploy-pages.bat %BRANCH% <correct-project-name>
echo.
npx -y wrangler pages project list
echo.
pause

REM ---- Step 5: Deploy ----
echo.
echo [5/5] Deploying to Cloudflare Pages...
echo Target: %PROJ% / branch %BRANCH%
echo.
npx -y wrangler pages deploy --project-name %PROJ% --branch %BRANCH%
if !errorlevel! neq 0 (
    echo.
    echo [ERROR] Deployment failed.
    echo.
    echo Common fixes:
    echo   1. KV ID in wrangler.toml belongs to a different
    echo      account - delete the id line and re-run so a
    echo      fresh namespace is created.
    echo   2. Project was first created by dashboard
    echo      drag-upload - CLI deploy may conflict.
    echo   3. Token lacks Pages:Edit - create a new API token.
    echo.
    goto :fail
)

echo.
echo ============================================
echo   Deployment finished.
echo   https://%PROJ%.pages.dev
echo.
echo   Verify with a POST (avoids browser cache):
echo.
echo   curl -s -X POST https://scratchextensioneditor.cc.cd/api/code -H "Content-Type: application/json" -d "{\"action\":\"ping\"}"
echo.
echo   Read the FIRST field name to tell which build is live:
echo.
echo     {"success":false,...}   = NEW code  (correct)
echo     {"ok":false,...}        = OLD code still live.
echo                               The domain is probably owned
echo                               by a DIFFERENT Pages project.
echo                               Re-run:
echo                                 deploy-pages.bat %BRANCH% <project>
echo     404                      = Functions did not deploy
echo ============================================
echo.
ENDLOCAL
pause
exit /b 0

:fail
echo.
echo ============================================
echo   FAILED - see error message above.
echo ============================================
echo.
ENDLOCAL
pause
exit /b 1
