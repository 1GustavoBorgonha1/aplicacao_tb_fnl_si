$ErrorActionPreference = 'Stop'
$env:AWS_PAGER = ''
$awsArgs = @('--region', $env:DEPLOY_REGION)
if ($env:DEPLOY_PROFILE) { $awsArgs += @('--profile', $env:DEPLOY_PROFILE) }
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    throw 'Instale AWS CLI v2 e autentique-se antes de terraform apply.'
}
$instanceReady = $false
for ($attempt = 0; $attempt -lt 90; $attempt++) {
    $status = & aws @awsArgs ssm describe-instance-information --filters "Key=InstanceIds,Values=$env:DEPLOY_INSTANCE" --query 'InstanceInformationList[0].PingStatus' --output text
    if ($LASTEXITCODE -eq 0 -and $status -eq 'Online') { $instanceReady = $true; break }
    Start-Sleep -Seconds 10
}
if (-not $instanceReady) { throw 'Master nao ficou Online no SSM em 15 minutos. Verifique IAM, NAT e cloud-init.' }
$commandId = & aws @awsArgs ssm send-command --instance-ids $env:DEPLOY_INSTANCE --document-name $env:DEPLOY_DOCUMENT --document-version $env:DEPLOY_VERSION --timeout-seconds 600 --query 'Command.CommandId' --output text
if ($LASTEXITCODE -ne 0 -or -not $commandId) { throw 'Falha ao iniciar comando SSM.' }
Write-Host "Comando SSM: $commandId"
$deadline = (Get-Date).AddMinutes(70)
while ((Get-Date) -lt $deadline) {
    $ErrorActionPreference = 'Continue'
    $raw = & aws @awsArgs ssm get-command-invocation --command-id $commandId --instance-id $env:DEPLOY_INSTANCE --output json 2>$null
    $invocationExitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($invocationExitCode -eq 0) {
        $result = ($raw -join "`n") | ConvertFrom-Json
        if ($result.Status -eq 'Success') {
            Write-Host $result.StandardOutputContent
            exit 0
        }
        if ($result.Status -notin @('Pending', 'InProgress', 'Delayed', 'Cancelling')) {
            Write-Host $result.StandardOutputContent
            Write-Host $result.StandardErrorContent
            throw "Deploy falhou: $($result.Status). Comando SSM: $commandId. Corrija e execute terraform apply novamente."
        }
    }
    Start-Sleep -Seconds 10
}
throw "Timeout aguardando SSM. Verifique o comando $commandId antes de repetir o apply."
