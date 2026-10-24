<#
.SYNOPSIS
  PayCenter local runner: inject secrets from .apt/local/*.env into environment variables and start jeecg-system-start.

.DESCRIPTION
  -EnvOnly : only inject environment variables into the current process (dot-source it for tests):
             . scripts/paycenter/run-local.ps1 -EnvOnly
  (default): inject, then start the jeecg-system-start jar in background (profile dev),
             stdout -> .apt/paycenter-run.log, stderr -> .apt/paycenter-run.err.log, PID -> .apt/paycenter-run.pid,
             and poll http://127.0.0.1:8080/jeecg-boot/v1/ping until HTTP 200 or 180s timeout.
  -Stop    : stop the process recorded in .apt/paycenter-run.pid.

  Security: secret values are NEVER printed. Only variable names and counts are written to the console.
  Compatible with Windows PowerShell 5.
#>
param(
    [switch]$EnvOnly,
    [switch]$Stop,
    [int]$TimeoutSeconds = 180
)

$PcRepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$PcLocalDir = Join-Path $PcRepoRoot '.apt\local'
$PcDbEnvFile = Join-Path $PcLocalDir 'paycenter-db.env'
$PcAppEnvFile = Join-Path $PcLocalDir 'paycenter-app.env'
$PcPidFile = Join-Path $PcRepoRoot '.apt\paycenter-run.pid'
$PcLogFile = Join-Path $PcRepoRoot '.apt\paycenter-run.log'
$PcErrLogFile = Join-Path $PcRepoRoot '.apt\paycenter-run.err.log'

function Read-PcEnvFile {
    param([string]$Path)
    # Parse KEY=VALUE lines; split on the first '=' only because Base64 values may end with '='.
    $result = [ordered]@{}
    foreach ($line in (Get-Content -LiteralPath $Path -Encoding UTF8)) {
        $trimmed = $line.Trim()
        if ($trimmed.Length -eq 0 -or $trimmed.StartsWith('#')) { continue }
        $idx = $trimmed.IndexOf('=')
        if ($idx -lt 1) { continue }
        $key = $trimmed.Substring(0, $idx).Trim()
        $value = $trimmed.Substring($idx + 1).Trim()
        if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $result[$key] = $value
    }
    return $result
}

function New-PcAppEnvFile {
    param([string]$Path)
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $lines = @(
        '# PayCenter local app secrets (generated, local only, gitignored). Do not commit.',
        ('PAY_MASTER_KEY=' + [Convert]::ToBase64String($bytes)),
        'PAY_MASTER_KEY_VERSION=1',
        '# PAY_UNIONPAY_MSG_SRC_ID=<fill in 4-char source id>',
        '# PAY_UNIONPAY_APP_ID=<fill>',
        '# PAY_UNIONPAY_APP_KEY=<fill>',
        '# PAY_UNIONPAY_COMM_KEY=<fill>',
        '# PAY_UNIONPAY_BASE_URL=https://test-api-open.chinaums.com',
        '# PAY_UNIONPAY_ENV=TEST',
        '# PAY_UNIONPAY_MID=<fill>',
        '# PAY_UNIONPAY_TID=<fill>',
        '# PAY_UNIONPAY_SUB_APP_ID=<fill, PROD only>',
        '# PAY_UNIONPAY_NOTIFY_URL=<public https url>',
        '# PAY_UNIONPAY_NOTIFY_IP_WHITELIST=<comma separated ips>',
        '# PAY_UNIONPAY_LIVE_PAID_ORDER_ID=<optional, paid mchntOrderId for refund live test>'
    )
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Set-Content -LiteralPath $Path -Value $lines -Encoding ASCII
    Write-Host '[paycenter] generated new local app env file with a random 32-byte PAY_MASTER_KEY'
}

function Invoke-PcEnvInject {
    if (-not (Test-Path -LiteralPath $PcDbEnvFile)) {
        throw "[paycenter] missing $PcDbEnvFile"
    }
    $names = New-Object System.Collections.Generic.List[string]

    $db = Read-PcEnvFile -Path $PcDbEnvFile
    if (-not $db.Contains('MYSQL_ROOT_PASSWORD') -or [string]::IsNullOrEmpty($db['MYSQL_ROOT_PASSWORD'])) {
        throw '[paycenter] MYSQL_ROOT_PASSWORD not found in paycenter-db.env'
    }
    $env:PAY_DB_PASSWORD = $db['MYSQL_ROOT_PASSWORD']
    $env:PAY_DB_PORT = '3307'
    $env:PAY_DB_USER = 'root'
    $names.Add('PAY_DB_PASSWORD'); $names.Add('PAY_DB_PORT'); $names.Add('PAY_DB_USER')

    if (-not (Test-Path -LiteralPath $PcAppEnvFile)) {
        New-PcAppEnvFile -Path $PcAppEnvFile
    }
    $app = Read-PcEnvFile -Path $PcAppEnvFile
    foreach ($key in $app.Keys) {
        [System.Environment]::SetEnvironmentVariable($key, $app[$key], 'Process')
        $names.Add($key)
    }
    Write-Host ('[paycenter] injected ' + $names.Count + ' variables: ' + ($names -join ', '))
}

function Stop-PcProcess {
    if (-not (Test-Path -LiteralPath $PcPidFile)) {
        Write-Host '[paycenter] no pid file, nothing to stop'
        return
    }
    $procId = [int]((Get-Content -LiteralPath $PcPidFile | Select-Object -First 1).Trim())
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($null -ne $proc) {
        Stop-Process -Id $procId -Force
        Write-Host ('[paycenter] stopped pid ' + $procId)
    } else {
        Write-Host ('[paycenter] pid ' + $procId + ' not running')
    }
    Remove-Item -LiteralPath $PcPidFile -Force
}

function Find-PcStartJar {
    $targetDir = Join-Path $PcRepoRoot 'backend\jeecg-boot\jeecg-module-system\jeecg-system-start\target'
    $jar = Get-ChildItem -LiteralPath $targetDir -Filter 'jeecg-system-start-*.jar' -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notmatch 'sources|javadoc|original' } |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($null -eq $jar) {
        throw "[paycenter] start jar not found under $targetDir, run mvn package first"
    }
    return $jar.FullName
}

function Wait-PcPing {
    param([System.Diagnostics.Process]$Process)
    $port = if ([string]::IsNullOrEmpty($env:SERVER_PORT)) { '8080' } else { $env:SERVER_PORT }
    $pingUrl = 'http://127.0.0.1:' + $port + '/jeecg-boot/v1/ping'
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if ($Process.HasExited) {
            throw ('[paycenter] process exited early with code ' + $Process.ExitCode + ', see ' + $PcLogFile)
        }
        try {
            $resp = Invoke-WebRequest -Uri $pingUrl -UseBasicParsing -TimeoutSec 5
            if ($resp.StatusCode -eq 200) {
                Write-Host '[paycenter] /v1/ping returned 200'
                return
            }
        } catch {
            # Not ready yet (connection refused / 5xx while starting); keep polling until the deadline.
            $null = $_
        }
        Start-Sleep -Seconds 3
    }
    throw ('[paycenter] /v1/ping not 200 within ' + $TimeoutSeconds + 's, see ' + $PcLogFile)
}

function Start-PcProcess {
    $jar = Find-PcStartJar
    $proc = Start-Process -FilePath 'java' `
        -ArgumentList @('-jar', ('"' + $jar + '"'), '--spring.profiles.active=dev') `
        -WorkingDirectory $PcRepoRoot `
        -RedirectStandardOutput $PcLogFile -RedirectStandardError $PcErrLogFile `
        -WindowStyle Hidden -PassThru
    Set-Content -LiteralPath $PcPidFile -Value $proc.Id -Encoding ASCII
    Write-Host ('[paycenter] started pid ' + $proc.Id + ', log: ' + $PcLogFile)
    Wait-PcPing -Process $proc
}

if ($Stop) {
    Stop-PcProcess
} else {
    Invoke-PcEnvInject
    if (-not $EnvOnly) {
        Start-PcProcess
    }
}
