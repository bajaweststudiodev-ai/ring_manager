# download_face_models.ps1  —  ejecutar desde CUALQUIER directorio
# Descarga los pesos de face-api.js (~6 MB) al directorio public/models/

$ErrorActionPreference = "Stop"

# Ruta absoluta al frontend (el script vive en frontend/)
$frontendDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$dest = Join-Path $frontendDir "public\models"

New-Item -ItemType Directory -Force -Path $dest | Out-Null
Write-Host "Destino: $dest`n"

$base = "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights"

$files = @(
  "ssd_mobilenetv1_model-weights_manifest.json",
  "ssd_mobilenetv1_model-shard1",
  "face_landmark_68_model-weights_manifest.json",
  "face_landmark_68_model-shard1",
  "face_recognition_model-weights_manifest.json",
  "face_recognition_model-shard1",
  "face_recognition_model-shard2"
)

$ErrorActionPreference = "Continue"   # seguir aunque falle una descarga

foreach ($file in $files) {
  $url      = "$base/$file"
  $outFile  = Join-Path $dest $file
  Write-Host "Descargando $file ..." -NoNewline
  try {
    Invoke-WebRequest -Uri $url -OutFile $outFile -UseBasicParsing
    $kb = [math]::Round((Get-Item $outFile).Length / 1KB, 1)
    Write-Host " OK ($kb KB)"
  } catch {
    Write-Host " ERROR: $_"
  }
}

Write-Host ""
$total = (Get-ChildItem $dest -File | Measure-Object Length -Sum).Sum
Write-Host "Total descargado: $([math]::Round($total/1KB, 0)) KB en $dest"
