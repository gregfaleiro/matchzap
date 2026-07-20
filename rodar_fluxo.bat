@echo off
cd /d C:\Users\User\matchzap

:: Cria pasta de logs se não existir
if not exist logs mkdir logs

:: Log com timestamp
set LOGFILE=logs\fluxo_%date:~6,4%-%date:~3,2%-%date:~0,2%.log

echo. >> %LOGFILE%
echo ============================================ >> %LOGFILE%
echo  MatchZap - %date% %time% >> %LOGFILE%
echo ============================================ >> %LOGFILE%

:: Etapa 1: Coletar mensagens do WhatsApp
echo [%time%] Iniciando coleta... >> %LOGFILE%
node coletar.js >> %LOGFILE% 2>&1
if errorlevel 1 (
  echo [%time%] ERRO na coleta >> %LOGFILE%
  exit /b 1
)

:: Etapa 2: Exportar
echo [%time%] Exportando... >> %LOGFILE%
node exportar.js >> %LOGFILE% 2>&1

:: Etapa 3: Filtrar (classificar ofertas/buscas)
echo [%time%] Classificando... >> %LOGFILE%
node filtrar.js >> %LOGFILE% 2>&1

:: Etapa 4: Atualizar inventario
echo [%time%] Atualizando inventario... >> %LOGFILE%
node atualizar_inventario.js >> %LOGFILE% 2>&1

:: Etapa 5: Gerar relatorio
echo [%time%] Gerando relatorio... >> %LOGFILE%
node gerar_relatorio.js >> %LOGFILE% 2>&1

:: Etapa 6: Publicar
echo [%time%] Publicando... >> %LOGFILE%
node publicar.js >> %LOGFILE% 2>&1

echo [%time%] Fluxo concluido com sucesso >> %LOGFILE%
