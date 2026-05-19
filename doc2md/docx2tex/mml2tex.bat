@echo off
setlocal
set REPO_ROOT=%~dp0

:: 简化 CLASSPATH，仅保留 Saxon 核心和依赖
set LIB_DIR=%REPO_ROOT%calabash\distro\lib
set CLASSPATH=%LIB_DIR%\Saxon-HE-10.8.jar;%LIB_DIR%\*

set MML_FILE=%~1
set OUT_FILE=%~2

if "%MML_FILE%"=="" exit /b 1

:: 移除 -init 和 -catalog 参数，直接转换
java -Xmx512m -cp "%CLASSPATH%" net.sf.saxon.Transform ^
    -s:"%MML_FILE%" ^
    -xsl:"%REPO_ROOT%mml2tex\xsl\invoke-mml2tex.xsl" ^
    -o:"%OUT_FILE%"

endlocal