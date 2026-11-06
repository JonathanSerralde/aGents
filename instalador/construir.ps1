# Construye la versión portátil de Oficina Multiagente para Windows.
# Resultado: dist\OficinaMultiagente\ (carpeta lista para usar) y dist\OficinaMultiagente-<versión>-windows.zip
#
# Uso:  powershell -ExecutionPolicy Bypass -File instalador\construir.ps1 [-NodeExe ruta\a\node.exe]
# Node: se copia un node.exe de 64 bits. Por defecto se busca en B:\REA\node\node.exe y, si no existe, el del sistema.

param(
  [string]$NodeExe = 'B:\REA\node\node.exe'
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$paquete = Get-Content (Join-Path $raiz 'package.json') -Raw | ConvertFrom-Json
$version = $paquete.version
$dist = Join-Path $raiz 'dist'
$salida = Join-Path $dist 'OficinaMultiagente'
$zip = Join-Path $dist "OficinaMultiagente-$version-windows.zip"

if (-not (Test-Path $NodeExe)) {
  $sistema = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $sistema) { throw "No se encontró node.exe en '$NodeExe' ni en el sistema. Indica la ruta con -NodeExe." }
  Write-Host "Aviso: no existe $NodeExe; se usará el Node del sistema: $sistema"
  $NodeExe = $sistema
}
$versionNode = (& $NodeExe --version 2>&1 | Out-String).Trim()
$archNode = (& $NodeExe -p process.arch 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $archNode -ne 'x64') { throw "Se requiere un node.exe de 64 bits que funcione. Encontrado: '$versionNode' '$archNode'" }
$versionNode = "$versionNode $archNode"

Write-Host "Construyendo Oficina Multiagente $version con Node $versionNode"
if (Test-Path $salida) { Remove-Item -Recurse -Force $salida }
if (Test-Path $zip) { Remove-Item -Force $zip }
New-Item -ItemType Directory -Force -Path $salida, (Join-Path $salida 'node'), (Join-Path $salida 'data') | Out-Null

# Código y recursos de la aplicación. No se copian data/, IMagenes/, dist/ ni pruebas.
foreach ($carpeta in 'src', 'public', 'docs') {
  Copy-Item -Recurse -Force (Join-Path $raiz $carpeta) (Join-Path $salida $carpeta)
}
foreach ($archivo in 'package.json', 'README.md', '.env.example') {
  Copy-Item -Force (Join-Path $raiz $archivo) $salida
}

# Imágenes que el código no usa quedan fuera del paquete.
$assetsJs = Get-Content (Join-Path $raiz 'public\assets.js') -Raw
$usadas = [regex]::Matches($assetsJs, 'assets/[a-z]+/[a-z]+-\d+\.png') | ForEach-Object { $_.Value } | Sort-Object -Unique
Get-ChildItem -Recurse -File (Join-Path $salida 'public\assets') -Filter '*.png' | ForEach-Object {
  $relativa = 'assets/' + ($_.FullName.Substring((Join-Path $salida 'public\assets\').Length) -replace '\\', '/')
  if ($usadas -notcontains $relativa) { Remove-Item -Force $_.FullName }
}

# Motor y lanzadores
Copy-Item -Force $NodeExe (Join-Path $salida 'node\node.exe')
Copy-Item -Force (Join-Path $PSScriptRoot 'plantilla\*') $salida
Set-Content -Path (Join-Path $salida 'data\LEEME-data.txt') -Encoding UTF8 -Value 'Aquí se guardan tus diagnósticos, tu borrador y tu marca. Copia esta carpeta para respaldarla.'

Compress-Archive -Path (Join-Path $salida '*') -DestinationPath $zip -CompressionLevel Optimal

$tamCarpeta = [math]::Round((Get-ChildItem -Recurse -File $salida | Measure-Object Length -Sum).Sum / 1MB, 1)
$tamZip = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host "Listo."
Write-Host "  Carpeta: $salida ($tamCarpeta MB)"
Write-Host "  ZIP:     $zip ($tamZip MB)"
