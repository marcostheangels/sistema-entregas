param([string]$Src, [string]$OutDir)
Add-Type -AssemblyName System.Drawing

function Resize-To([string]$inPath, [int]$size, [string]$outPath, [double]$scale = 1.0, [bool]$whiteBg = $false) {
  $srcImg = [System.Drawing.Image]::FromFile($inPath)
  $canvas = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($canvas)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  if ($whiteBg) { $g.Clear([System.Drawing.Color]::White) } else { $g.Clear([System.Drawing.Color]::Transparent) }
  $inner = [int]([double]$size * $scale)
  $off = [int](($size - $inner) / 2)
  $g.DrawImage($srcImg, $off, $off, $inner, $inner)
  $g.Dispose()
  $canvas.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $canvas.Dispose()
  $srcImg.Dispose()
  Write-Host "OK $outPath ($size x $size, scale $scale)"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# Web / PWA / Desktop
Resize-To $Src 512  "$OutDir\logo-512.png"
Resize-To $Src 256  "$OutDir\logo-256.png"
Resize-To $Src 192  "$OutDir\logo-192.png"

# Android launcher (arte cheia)
Resize-To $Src 48   "$OutDir\launcher-48.png"
Resize-To $Src 72   "$OutDir\launcher-72.png"
Resize-To $Src 96   "$OutDir\launcher-96.png"
Resize-To $Src 144  "$OutDir\launcher-144.png"
Resize-To $Src 192  "$OutDir\launcher-192.png"

# Android adaptive foreground (logo a 66% no centro, fundo branco)
Resize-To $Src 108  "$OutDir\fg-108.png" 0.66 $true
Resize-To $Src 162  "$OutDir\fg-162.png" 0.66 $true
Resize-To $Src 216  "$OutDir\fg-216.png" 0.66 $true
Resize-To $Src 324  "$OutDir\fg-324.png" 0.66 $true
Resize-To $Src 432  "$OutDir\fg-432.png" 0.66 $true
