@echo off
REM Jobvexa - publish this folder to GitHub (https://github.com/<you>/jobvexa).
REM First create an EMPTY PUBLIC repository named "jobvexa" on github.com.
cd /d "%~dp0"
where git >nul 2>nul || (echo Git is not installed. Install it from https://git-scm.com/download/win and run this again. & pause & exit /b 1)

REM Always refresh GitHub settings files from setup\ (the copies kept up to date).
echo Installing workflow files from setup\ into .github\
mkdir ".github\workflows" 2>nul
copy /y "setup\deploy.yml" ".github\workflows\deploy.yml" >nul
if exist "setup\screenshots.yml" copy /y "setup\screenshots.yml" ".github\workflows\screenshots.yml" >nul
if exist "setup\dependabot.yml" copy /y "setup\dependabot.yml" ".github\dependabot.yml" >nul

if not exist ".git" git init -b main
git config user.name >nul 2>nul
if errorlevel 1 goto askname
goto named
:askname
set /p GNAME=Your name for the commit history: 
git config user.name "%GNAME%"
set /p GMAIL=Your GitHub email: 
git config user.email "%GMAIL%"
:named

git add -A
git commit -m "Update Jobvexa" >nul 2>nul && echo Committed your files. || echo No new changes to commit.

set GHUSER=Karthic71
set /p GHUSER=Your GitHub username [press Enter for Karthic71]: 
git remote remove origin 2>nul
git remote add origin https://github.com/%GHUSER%/jobvexa.git
git branch -M main
echo Getting any newer changes from GitHub first...
git pull --rebase origin main 2>nul
echo Uploading... (a GitHub sign-in window may open)
git push -u origin main
if errorlevel 1 (echo. & echo Upload failed. Check the repo exists at https://github.com/%GHUSER%/jobvexa and is empty, then run this again. & pause & exit /b 1)

echo.
echo Done! Now on GitHub:
echo   1. Settings - Pages - Source: GitHub Actions
echo   2. Actions - "Collect jobs & deploy" - Run workflow
echo   Your site will be at https://%GHUSER%.github.io/jobvexa/
pause
