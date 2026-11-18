# Windows PowerShell 5.1 / PowerShell 7. Starts the local EWork dev server.
[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 8081,
    [ValidateRange(1024, 65535)]
    [int]$RainbowPort = 18080,
    [string]$EnvironmentKey,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$rainbowOrigin = "http://127.0.0.1:$RainbowPort"
$rainbowBase = '/rainbow-bridge'

try {
    foreach ($command in @('node', 'npm.cmd')) {
        if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
            throw "Missing $command. Install Node.js, then reopen this window."
        }
    }

    $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $Port)
    try { $listener.Start() }
    catch { throw "EWork port $Port is occupied. Close its startup window or choose another -Port." }
    finally { $listener.Stop() }

    try {
        $overview = Invoke-RestMethod -Uri "$rainbowOrigin$rainbowBase/api/v1/runtime/overview" -TimeoutSec 5
        if ($overview.code -ne 200 -or -not $overview.data.list) { throw 'No environments returned.' }
    } catch {
        throw "Rainbow Bridge is unavailable at $rainbowOrigin$rainbowBase. Start it with start-rainbow.cmd or select its port with -RainbowPort. $($_.Exception.Message)"
    }

    $environmentKeys = @($overview.data.list | ForEach-Object { $_.environment_key })
    if (-not $EnvironmentKey) {
        $EnvironmentKey = if ($environmentKeys -ccontains 'ework-pilot') { 'ework-pilot' } else { 'default' }
    }
    if ($environmentKeys -cnotcontains $EnvironmentKey) {
        throw "Environment '$EnvironmentKey' was not found. Use -EnvironmentKey with one of: $($environmentKeys -join ', ')."
    }

    $env:RB_PROXY_TARGET = $rainbowOrigin
    $env:VUE_APP_ENABLE_RB = 'true'
    $env:VUE_APP_DATA_MODE = 'remote'
    $env:VUE_APP_CONFIG_TYPE = 'rainbow-bridge'
    $env:VUE_APP_RB_BASE_URL = $rainbowBase
    $env:VUE_APP_RB_ENVIRONMENT = $EnvironmentKey

    Push-Location $PSScriptRoot
    try {
        if (-not (Test-Path -LiteralPath 'node_modules/.bin/vue-cli-service.cmd')) {
            & npm.cmd install --no-package-lock
            if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed (exit $LASTEXITCODE)." }
        }
        [Console]::WriteLine("EWork: http://127.0.0.1:$Port/ | Rainbow Bridge: $rainbowOrigin | Environment: $EnvironmentKey")
        [Console]::WriteLine('If saved browser settings point elsewhere, restore defaults in EWork or use a private window.')
        [Console]::WriteLine('Keep this window open. Press Ctrl+C to stop EWork.')
        $serveArgs = @('run', 'serve', '--', '--host', '127.0.0.1', '--port', "$Port")
        if (-not $NoBrowser) { $serveArgs += '--open' }
        & npm.cmd @serveArgs
        if ($LASTEXITCODE -ne 0) { throw "EWork exited (exit $LASTEXITCODE)." }
    } finally { Pop-Location }
} catch {
    [Console]::Error.WriteLine("ERROR: $($_.Exception.Message)")
    exit 1
}
