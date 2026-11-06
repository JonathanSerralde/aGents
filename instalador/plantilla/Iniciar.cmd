@echo off
rem Oficina Multiagente: inicia el servidor local y abre el navegador.
rem Todo corre en este equipo (127.0.0.1). No se envía nada a internet.
setlocal
cd /d "%~dp0"
set "ABRIR_NAVEGADOR=1"
title Oficina Multiagente
echo.
echo   Oficina Multiagente
echo   ------------------------------------------------------------
echo   Se abrira tu navegador en http://127.0.0.1:4791
echo   Deja esta ventana abierta mientras uses la aplicacion.
echo   Para cerrar: ejecuta Detener.cmd o cierra esta ventana.
echo.
"%~dp0node\node.exe" "%~dp0src\server.js"
if errorlevel 1 (
  echo.
  echo   No se pudo iniciar. Revisa LEEME.txt o abre http://127.0.0.1:4791 a mano.
  pause
)
endlocal
