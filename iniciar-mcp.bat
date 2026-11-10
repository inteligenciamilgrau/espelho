@echo off
rem Liga o servidor MCP do jogo e abre a pagina do jogo no navegador.
rem Para usar outra porta: iniciar-mcp.bat -Porta 8766
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1" %*
pause
