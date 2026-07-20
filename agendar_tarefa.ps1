# agendar_tarefa.ps1
# Cria uma tarefa agendada no Windows para rodar o MatchZap todo dia às 08:00
# Execute uma vez como Administrador: powershell -ExecutionPolicy Bypass -File agendar_tarefa.ps1

$taskName   = "MatchZap Diario"
$scriptPath = "C:\Users\User\matchzap\rodar_fluxo.bat"
$horario    = "08:00"

# Remove tarefa existente com o mesmo nome (se houver)
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

# Define a ação: rodar o batch em janela minimizada
$action = New-ScheduledTaskAction `
  -Execute "cmd.exe" `
  -Argument "/c `"$scriptPath`"" `
  -WorkingDirectory "C:\Users\User\matchzap"

# Define o gatilho: diariamente às 08:00
$trigger = New-ScheduledTaskTrigger -Daily -At $horario

# Define configurações: rodar mesmo com bateria, não parar se demorar
$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
  -DisallowStartIfOnBatteries $false `
  -StopIfGoingOnBatteries $false `
  -StartWhenAvailable $true

# Registra a tarefa para o usuário atual
Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -RunLevel Highest `
  -Force

Write-Host ""
Write-Host "Tarefa '$taskName' criada com sucesso!" -ForegroundColor Green
Write-Host "Horario: todos os dias as $horario" -ForegroundColor Cyan
Write-Host ""
Write-Host "Para verificar: Agendador de Tarefas > Biblioteca > $taskName"
Write-Host "Para testar agora: schtasks /run /tn `"$taskName`""
Write-Host "Para remover: schtasks /delete /tn `"$taskName`" /f"
