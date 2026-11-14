@echo off
rem ============================================================
rem  AltServer + Apple Mobile Device Service neu starten
rem  Hilft, wenn AltStore meldet: "Could not find AltServer"
rem  oder "AltServer could not find this device".
rem  Doppelklick genuegt. Windows fragt einmal nach Admin-Rechten
rem  fuer den Apple-Dienst - mit "Ja" bestaetigen.
rem ============================================================
setlocal
set "ALTSERVER=C:\Program Files (x86)\AltServer\AltServer.exe"

if not exist "%ALTSERVER%" goto notfound

echo [1/4] AltServer beenden ...
taskkill /IM AltServer.exe /F >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/4] AltServer starten ...
start "" "%ALTSERVER%"

echo [3/4] Warte, bis AltServer laeuft ...
set /a TRIES=0
:wait
timeout /t 2 /nobreak >nul
tasklist /FI "IMAGENAME eq AltServer.exe" | find /I "AltServer.exe" >nul
if not errorlevel 1 goto running
set /a TRIES+=1
if %TRIES% GEQ 15 goto notstarted
goto wait

:running
rem kurz warten, bis sich AltServer im Netzwerk angemeldet hat
timeout /t 5 /nobreak >nul

echo [4/4] Apple Mobile Device Service neu starten ...
echo       Admin-Abfrage von Windows bitte mit "Ja" bestaetigen.
powershell -NoProfile -Command "try { $p = Start-Process powershell -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ErrorAction Stop -ArgumentList '-NoProfile','-Command','Restart-Service -DisplayName ''Apple Mobile Device Service'' -Force -ErrorAction Stop'; exit $p.ExitCode } catch { exit 1 }"
if errorlevel 1 goto servicefailed

echo.
echo Fertig! Jetzt auf dem iPhone AltStore oeffnen und erneut versuchen.
timeout /t 5 >nul
exit /b 0

:notfound
echo AltServer wurde nicht gefunden unter:
echo   %ALTSERVER%
echo Bitte den Pfad oben in dieser Datei anpassen.
pause
exit /b 1

:notstarted
echo AltServer ist nach 30 Sekunden nicht gestartet. Bitte manuell pruefen.
pause
exit /b 1

:servicefailed
echo Der Apple-Dienst konnte nicht neu gestartet werden.
echo Wurde die Admin-Abfrage abgelehnt? Dann die Datei erneut starten.
pause
exit /b 1
