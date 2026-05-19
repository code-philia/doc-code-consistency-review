@echo off
@setlocal ENABLEDELAYEDEXPANSION
REM Simplified batch file to convert DOCX to XML only, then run MML to TeX conversion
REM Based on d2t.bat but stripped down to essentials

REM The percent sign needs to be escaped in the first place, therefore %%20
REM But when the arguments are passed to Calabash, each percent sign that they
REM contain needs to be escaped again. Therefore %%%%20.
@set escapedspace=%%%%20

REM command line parameters
@set FILE=%~dpnx1
@set CONF=%~dpnx2
@set OUT_DIR=%~dpnx3

IF ["%FILE%"] == [""] GOTO usage

REM get basename
@set BASENAME=%~n1
@set BASENAME_FOR_URI=%BASENAME: =!escapedspace!%

REM script directory
@set sd=%~dp0
@set DIR=!sd:\=/!
@set DIR_URI=file:///%DIR: =!escapedspace!%

IF [%CONF%] == [] @set CONF=!DIR!/conf/conf.xml

REM output directory
IF [%OUT_DIR%] == [] @set OUT_DIR=%~dp1

REM ========== create unique temp folder for intermediate artifacts ==========
REM Use basename + random to ensure uniqueness; create inside OUT_DIR
set TMPDIR=%OUT_DIR%%BASENAME%_temp_%RANDOM%
if not exist "%TMPDIR%" mkdir "%TMPDIR%"

REM log will be placed in TMPDIR
@set LOG=%TMPDIR%\%BASENAME%.log
set TMPDIR_URI=file:///%TMPDIR:\=/%

REM copy input DOCX into TMPDIR so Calabash unzips into TMPDIR (prevents .docx.tmp elsewhere)
copy "%~1" "%TMPDIR%\%BASENAME%%~x1" >nul
if errorlevel 1 echo Warning: failed to copy %~1 to %TMPDIR%\%BASENAME%%~x1
set FILE=%TMPDIR%\%BASENAME%%~x1
REM Ensure the original input DOCX is explicitly stored in OUT_DIR root (do not remove it)
if /I not exist "%OUT_DIR%\%BASENAME%%~x1" (
	copy "%~1" "%OUT_DIR%\%BASENAME%%~x1" >nul 2>&1 || echo Warning: failed to copy original %~1 to %OUT_DIR%
)

REM script parameters
@set JAVA=java
@set CALABASH=%DIR%/calabash/calabash.bat

REM convert backward slash to slash for URI
@set FILE=%FILE:\=/%
@set FILE_URI=file:///%FILE: =!escapedspace!%
@set CONF=%CONF:\=/%
@set CONF_URI=file:///%CONF: =!escapedspace!%
@set OUT_DIR=%OUT_DIR:\=/%
@set OUT_DIR_URI=file:///%OUT_DIR: =!escapedspace!%

REM path to fontmaps dir
@set FONTMAPS=%DIR_URI%/fontmaps/

REM debugging
@set DEBUGDIR_URI=%TMPDIR_URI%/%BASENAME_FOR_URI%.debug

REM start - convert DOCX to XML only
@REM echo Starting DOCX to XML conversion... (intermediates -> %TMPDIR%)
echo FILE_URI: %FILE_URI%
echo CONF_URI: %CONF_URI%
echo TMPDIR_URI: %TMPDIR_URI%
echo DEBUGDIR_URI: %DEBUGDIR_URI%

pushd "%TMPDIR%"
call "%CALABASH%" -o hub=%BASENAME_FOR_URI%.xml %DIR_URI%/xpl/docx2tex.xpl docx=%FILE_URI% conf=%CONF_URI% custom-font-maps-dir=%FONTMAPS% debug=yes debug-dir-uri=%DEBUGDIR_URI% 2>&1 2>"%LOG%" || (popd & GOTO exitonerror)

REM --- list intermediate artifacts created in TMPDIR (newest first) ---
echo.
echo Intermediates created in %TMPDIR%:
echo Files:
dir /b /o:-d
echo.
echo Directories:
for /d %%D in (*) do echo %%D
echo.
popd

REM --- move the hub XML from TMPDIR to OUT_DIR root, keep other intermediates in TMPDIR ---
if exist "%TMPDIR%\%BASENAME%.xml" (
	echo Moving hub XML to %OUT_DIR% ...
	move /Y "%TMPDIR%\%BASENAME%.xml" "%OUT_DIR%" >nul 2>&1 || echo Failed to move "%TMPDIR%\%BASENAME%.xml" to %OUT_DIR%
)

REM === move any leftover matching artifacts from OUT_DIR and repo root into TMPDIR ===
echo Moving any leftover artifacts matching "%BASENAME%" into %TMPDIR% ...

REM Use cmd native loops to avoid PowerShell quoting issues on Windows with non-ASCII paths.
REM Skip moving files that are already in the TMPDIR and skip the original input file (%~f1).

REM Move matches found under OUT_DIR
for /r "%OUT_DIR%" %%F in (*%BASENAME%*) do (
	if /I not "%%~fF"=="%~f1" (
		if /I not "%%~nxF"=="%BASENAME%.xml" (
			if /I not "%%~nxF"=="%BASENAME%%~x1" (
				if /I not "%%~dpfF"=="%TMPDIR%\" (
					move /Y "%%~fF" "%TMPDIR%" >nul 2>&1 || echo Failed to move "%%~fF"
				)
			)
		)
	)
)

REM Move matches found under the current repo tree (CD)
for /r "%CD%" %%F in (*%BASENAME%*) do (
	if /I not "%%~fF"=="%~f1" (
		if /I not "%%~nxF"=="%BASENAME%.xml" (
			if /I not "%%~nxF"=="%BASENAME%%~x1" (
				if /I not "%%~dpfF"=="%TMPDIR%\" (
					move /Y "%%~fF" "%TMPDIR%" >nul 2>&1 || echo Failed to move "%%~fF"
				)
			)
		)
	)
)

REM list TMPDIR again after moving leftovers
echo.
echo Final TMPDIR contents:
dir "%TMPDIR%"

goto finish

REM exit with errors
:exitonerror
echo Errors encountered while running conversion. Please see %LOG% for details.
exit /b 1

REM exit
:finish
echo Conversion finished. XML output: %OUT_DIR%\%BASENAME%.xml
echo All intermediate artifacts (except the XML) are in: %TMPDIR%
exit /b 0

REM Sample invocation:
:usage
echo docx2xml_and_mml2tex
echo Usage: docx2xml_and_mml2tex.bat DOCX [CONFIG] [OUT_DIR]