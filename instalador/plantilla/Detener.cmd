@echo off
rem Cierra el servidor de aGents iniciado con Iniciar.cmd.
setlocal
cd /d "%~dp0"
if not exist "data\servidor.pid" (
  echo aGents no parece estar en ejecucion.
  goto :fin
)
set /p PID=<"data\servidor.pid"
taskkill /PID %PID% >nul 2>&1
if errorlevel 1 (
  echo No se encontro el proceso %PID%. Si la ventana sigue abierta, cierrala a mano.
) else (
  echo aGents se cerro.
)
del /q "data\servidor.pid" >nul 2>&1
:fin
endlocal
timeout /t 3 >nul
