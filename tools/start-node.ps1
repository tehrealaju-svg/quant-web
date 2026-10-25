# Runs the Quant node for the websites:
#   1. quantd with the public website API on localhost:17340
#   2. a free Cloudflare quick tunnel to it (no account, no domain)
#   3. publishes the tunnel's https URL to Supabase so the sites find it
# Settings come from tools\node.env (copy node.env.example). Run:  powershell -File tools\start-node.ps1
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $here "node.env"
if (-not (Test-Path $envFile)) { throw "Missing $envFile (copy node.env.example and fill it in)" }
$cfg = @{}
Get-Content $envFile | Where-Object { $_ -match '^\s*([A-Z_]+)\s*=\s*(.*)$' } | ForEach-Object { $cfg[$Matches[1]] = $Matches[2].Trim() }

$quantd = $cfg["QUANTD"]; if (-not $quantd) { $quantd = "D:\Claude\Quant\quant-core\build\quantd.exe" }
$network = $cfg["NETWORK"]; if (-not $network) { $network = "test" }
$port = $cfg["PUBLIC_PORT"]; if (-not $port) { $port = "17340" }
# Own data folder + P2P port so it never shares files with the Windows app running on the same PC.
$datadir = $cfg["DATADIR"]; if (-not $datadir) { $datadir = Join-Path $env:APPDATA "Quant-site" }
$p2pPort = $cfg["P2P_PORT"]; if (-not $p2pPort) { $p2pPort = "17347" }

$netFlag = @{ test = "-testnet"; main = "-mainnet"; regtest = "-regtest" }[$network]
Write-Host "Starting quantd ($network) with the public API on port $port..."
# Reuse a node that is already serving the public API (e.g. only the tunnel died).
$running = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($running) { $node = Get-Process -Id $running.OwningProcess; Write-Host "quantd already running (pid $($node.Id))" }
else { $node = Start-Process -FilePath $quantd -ArgumentList @($netFlag, "-publicapi=$port", "-datadir=$datadir", "-port=$p2pPort", "-addnode=127.0.0.1:17337") -PassThru -WindowStyle Minimized }

$log = Join-Path $env:TEMP "quant-tunnel.log"
Remove-Item $log -ErrorAction SilentlyContinue
Write-Host "Starting Cloudflare quick tunnel..."
$tunnel = Start-Process -FilePath "cloudflared" -ArgumentList @("tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:$port") `
  -PassThru -WindowStyle Hidden -RedirectStandardError $log

$url = $null
for ($i = 0; $i -lt 60 -and -not $url; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Path $log) {
    $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
    if ($m) { $url = $m.Matches[0].Value + "/" }
  }
}
if (-not $url) { throw "Tunnel did not start; see $log" }
Write-Host "Tunnel: $url"

$body = @{ p_network = $network; p_url = $url; p_secret = $cfg["PUBLISH_SECRET"] } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$($cfg['SUPABASE_URL'])/rest/v1/rpc/publish_node" -Body $body -ContentType "application/json" `
  -Headers @{ apikey = $cfg["SUPABASE_ANON_KEY"]; Authorization = "Bearer $($cfg['SUPABASE_ANON_KEY'])" } | Out-Null
Write-Host "Published to Supabase. Websites will now use this node. Press Ctrl+C to stop."

try { Wait-Process -Id $node.Id } finally {
  Stop-Process -Id $tunnel.Id -ErrorAction SilentlyContinue
}
