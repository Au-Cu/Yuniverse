param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$cellWidth = 192
$cellHeight = 208
$atlasColumns = 8
$atlasRows = 11
$pixelFormat = [System.Drawing.Imaging.PixelFormat]::Format32bppArgb

function Get-VisibleBounds([System.Drawing.Bitmap]$bitmap) {
  $rect = [System.Drawing.Rectangle]::new(0, 0, $bitmap.Width, $bitmap.Height)
  $data = $bitmap.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, $pixelFormat)
  try {
    $bytes = [byte[]]::new([Math]::Abs($data.Stride) * $bitmap.Height)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
    $minX = $bitmap.Width
    $minY = $bitmap.Height
    $maxX = -1
    $maxY = -1
    for ($y = 0; $y -lt $bitmap.Height; $y++) {
      $row = $y * [Math]::Abs($data.Stride)
      for ($x = 0; $x -lt $bitmap.Width; $x++) {
        if ($bytes[$row + ($x * 4) + 3] -gt 4) {
          if ($x -lt $minX) { $minX = $x }
          if ($x -gt $maxX) { $maxX = $x }
          if ($y -lt $minY) { $minY = $y }
          if ($y -gt $maxY) { $maxY = $y }
        }
      }
    }
    if ($maxX -lt $minX -or $maxY -lt $minY) {
      throw 'The source image contains no visible pixels.'
    }
    return [System.Drawing.Rectangle]::new($minX, $minY, $maxX - $minX + 1, $maxY - $minY + 1)
  } finally {
    $bitmap.UnlockBits($data)
  }
}

function New-CellBitmap {
  return [System.Drawing.Bitmap]::new($cellWidth, $cellHeight, $pixelFormat)
}

function Set-HighQuality([System.Drawing.Graphics]$graphics) {
  $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
}

function Import-NormalizedSprite([string]$path) {
  $source = [System.Drawing.Bitmap]::new($path)
  try {
    $bounds = Get-VisibleBounds $source
    $scale = [Math]::Min(188.0 / $bounds.Width, 204.0 / $bounds.Height)
    $width = [Math]::Max(1, [Math]::Round($bounds.Width * $scale))
    $height = [Math]::Max(1, [Math]::Round($bounds.Height * $scale))
    $left = [Math]::Round(($cellWidth - $width) / 2)
    $top = $cellHeight - $height - 2
    $target = New-CellBitmap
    $graphics = [System.Drawing.Graphics]::FromImage($target)
    try {
      Set-HighQuality $graphics
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $destination = [System.Drawing.Rectangle]::new($left, $top, $width, $height)
      $graphics.DrawImage($source, $destination, $bounds, [System.Drawing.GraphicsUnit]::Pixel)
    } finally {
      $graphics.Dispose()
    }
    return $target
  } finally {
    $source.Dispose()
  }
}

function New-TransformedFrame(
  [System.Drawing.Bitmap]$source,
  [double]$scaleX = 1,
  [double]$scaleY = 1,
  [double]$rotation = 0,
  [double]$offsetX = 0,
  [double]$offsetY = 0,
  [bool]$flip = $false
) {
  $target = New-CellBitmap
  $graphics = [System.Drawing.Graphics]::FromImage($target)
  try {
    Set-HighQuality $graphics
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $pivotX = $cellWidth / 2
    $pivotY = $cellHeight - 5
    $graphics.TranslateTransform([single]($pivotX + $offsetX), [single]($pivotY + $offsetY))
    $graphics.RotateTransform([single]$rotation)
    $horizontalScale = if ($flip) { -$scaleX } else { $scaleX }
    $graphics.ScaleTransform([single]$horizontalScale, [single]$scaleY)
    $graphics.TranslateTransform([single]-$pivotX, [single]-$pivotY)
    $graphics.DrawImage($source, 0, 0, $cellWidth, $cellHeight)
  } finally {
    $graphics.Dispose()
  }
  return $target
}

function Add-Cell(
  [System.Drawing.Graphics]$graphics,
  [System.Drawing.Bitmap]$frame,
  [int]$row,
  [int]$column
) {
  $graphics.DrawImageUnscaled($frame, $column * $cellWidth, $row * $cellHeight)
}

function New-MinbirdWalkParts([System.Drawing.Bitmap]$source) {
  $body = [System.Drawing.Bitmap]$source.Clone()
  $leftLeg = New-CellBitmap
  $rightLeg = New-CellBitmap
  $transparent = [System.Drawing.Color]::FromArgb(0, 0, 0, 0)

  # The walking source is flattened, so isolate its reddish legs by colour in
  # the lower part of the sprite. This keeps the exact face/body pixels while
  # allowing the two legs to rotate independently around their hips.
  # Keep the upper leg roots baked into the body; articulating only the lower
  # legs avoids transparent seams where the legs emerge from the feathers.
  for ($y = 165; $y -lt $cellHeight; $y++) {
    for ($x = 71; $x -lt $cellWidth; $x++) {
      $color = $source.GetPixel($x, $y)
      if ($color.A -le 10) { continue }
      $isBrownLeg = $color.R -gt 50 `
        -and $color.R -gt ($color.G * 1.10) `
        -and ($color.R - $color.B) -gt 25
      $isDarkClaw = $y -gt 177 `
        -and $color.R -lt 105 `
        -and $color.G -lt 90 `
        -and $color.B -lt 85
      if (-not ($isBrownLeg -or $isDarkClaw)) { continue }

      if ($x -lt 112) { $leftLeg.SetPixel($x, $y, $color) }
      else { $rightLeg.SetPixel($x, $y, $color) }
      $body.SetPixel($x, $y, $transparent)
    }
  }

  return [PSCustomObject]@{
    Body = $body
    LeftLeg = $leftLeg
    RightLeg = $rightLeg
  }
}

function Draw-ArticulatedLayer(
  [System.Drawing.Graphics]$graphics,
  [System.Drawing.Bitmap]$layer,
  [double]$pivotX,
  [double]$pivotY,
  [double]$rotation,
  [double]$offsetX,
  [double]$offsetY
) {
  $state = $graphics.Save()
  try {
    $graphics.TranslateTransform([single]($pivotX + $offsetX), [single]($pivotY + $offsetY))
    $graphics.RotateTransform([single]$rotation)
    $graphics.TranslateTransform([single]-$pivotX, [single]-$pivotY)
    $graphics.DrawImageUnscaled($layer, 0, 0)
  } finally {
    $graphics.Restore($state)
  }
}

function New-ArticulatedWalkFrame(
  $parts,
  [double]$scaleX,
  [double]$scaleY,
  [double]$bodyRotation,
  [double]$bodyOffsetX,
  [double]$bodyOffsetY,
  [double]$leftRotation,
  [double]$leftOffsetX,
  [double]$leftOffsetY,
  [double]$rightRotation,
  [double]$rightOffsetX,
  [double]$rightOffsetY
) {
  $composite = New-CellBitmap
  $graphics = [System.Drawing.Graphics]::FromImage($composite)
  try {
    Set-HighQuality $graphics
    $graphics.Clear([System.Drawing.Color]::Transparent)
    Draw-ArticulatedLayer $graphics $parts.LeftLeg 99 167 $leftRotation $leftOffsetX $leftOffsetY
    Draw-ArticulatedLayer $graphics $parts.RightLeg 126 166 $rightRotation $rightOffsetX $rightOffsetY
    $graphics.DrawImageUnscaled($parts.Body, 0, 0)
  } finally {
    $graphics.Dispose()
  }

  try {
    return New-TransformedFrame $composite $scaleX $scaleY $bodyRotation $bodyOffsetX $bodyOffsetY
  } finally {
    $composite.Dispose()
  }
}

$sourceDir = Join-Path $ProjectRoot 'assets\source'
$assetDir = Join-Path $ProjectRoot 'assets'
$buildDir = Join-Path $ProjectRoot 'build'
[System.IO.Directory]::CreateDirectory($buildDir) | Out-Null

$master = Import-NormalizedSprite (Join-Path $sourceDir 'minbird-master.png')
$rest = Import-NormalizedSprite (Join-Path $sourceDir 'minbird-rest.png')
$wave = Import-NormalizedSprite (Join-Path $sourceDir 'minbird-wave.png')
$walk = Import-NormalizedSprite (Join-Path $sourceDir 'minbird-walk-right.png')
$walkParts = New-MinbirdWalkParts $walk

$atlas = [System.Drawing.Bitmap]::new($cellWidth * $atlasColumns, $cellHeight * $atlasRows, $pixelFormat)
$atlasGraphics = [System.Drawing.Graphics]::FromImage($atlas)
Set-HighQuality $atlasGraphics
$atlasGraphics.Clear([System.Drawing.Color]::Transparent)

$created = [System.Collections.Generic.List[System.Drawing.Bitmap]]::new()
function New-TrackedFrame {
  param(
    [System.Drawing.Bitmap]$Source,
    [double]$ScaleX = 1,
    [double]$ScaleY = 1,
    [double]$Rotation = 0,
    [double]$OffsetX = 0,
    [double]$OffsetY = 0,
    [bool]$Flip = $false
  )
  $frame = New-TransformedFrame $Source $ScaleX $ScaleY $Rotation $OffsetX $OffsetY $Flip
  $created.Add($frame)
  return $frame
}

try {
  # Normal idle stays awake. Sitting reuses this same open-eye appearance;
  # closed eyes are reserved for the delayed sleep animation below.
  $idleSpecs = @(
    @(1.000, 1.000,  0.0,  0,  0),
    @(0.998, 1.004, -0.2,  0, -1),
    @(0.996, 1.008,  0.0,  0, -1),
    @(0.998, 1.004,  0.2,  0, -1),
    @(1.000, 1.000,  0.0,  0,  0),
    @(1.000, 0.998,  0.0,  0,  1)
  )
  for ($column = 0; $column -lt $idleSpecs.Count; $column++) {
    $spec = $idleSpecs[$column]
    Add-Cell $atlasGraphics (New-TrackedFrame $master $spec[0] $spec[1] $spec[2] $spec[3] $spec[4]) 0 $column
  }

  # Poultry-like walk: the legs swing in opposite phases while the body only
  # supplies a restrained forward lean and vertical weight shift.
  $walkSpecs = @(
    # scaleX scaleY bodyRot x  y   leftRot leftX leftY  rightRot rightX rightY
    @(0.994, 0.998, -0.8, -1,  0,    6,      0,    0,      -6,       0,     0),
    @(1.000, 1.000, -0.3,  0, -2,    0,      0,   -2,       0,       0,     0),
    @(1.004, 0.996,  0.3,  1, -4,  -12,      0,   -3,      10,       0,     0),
    @(1.000, 1.000,  0.7,  1, -2,   -6,      0,   -1,       5,       0,     0),
    @(0.994, 0.998,  0.8,  0,  0,    4,      0,    0,      -4,       0,     0),
    @(1.000, 1.000,  0.3,  0, -2,    8,      0,    0,      -8,       0,    -2),
    @(1.004, 0.996, -0.3, -1, -4,   12,      0,    0,     -10,       0,    -3),
    @(1.000, 1.000, -0.7, -1, -2,    8,      0,    0,      -8,       0,    -1)
  )
  for ($column = 0; $column -lt $walkSpecs.Count; $column++) {
    $spec = $walkSpecs[$column]
    $frame = New-ArticulatedWalkFrame $walkParts `
      $spec[0] $spec[1] $spec[2] $spec[3] $spec[4] `
      $spec[5] $spec[6] $spec[7] $spec[8] $spec[9] $spec[10]
    $created.Add($frame)
    Add-Cell $atlasGraphics $frame 1 $column
    Add-Cell $atlasGraphics $frame 2 $column
  }

  $waveSources = @($master, $wave, $wave, $master)
  $waveRotations = @(0.0, -1.8, 1.2, 0.0)
  for ($column = 0; $column -lt 4; $column++) {
    Add-Cell $atlasGraphics (New-TrackedFrame $waveSources[$column] 1 1 $waveRotations[$column] 0 0) 3 $column
  }

  # Unused legacy v2 rows remain populated for format compatibility.
  for ($column = 0; $column -lt 5; $column++) {
    Add-Cell $atlasGraphics (New-TrackedFrame $master 1 1 0 0 0) 4 $column
  }

  $sleepSpecs = @(
    @(1.000, 1.000, 0.0, 0, 0),
    @(1.000, 0.995, 0.4, 0, 1),
    @(1.002, 0.990, 0.8, 0, 2),
    @(1.004, 0.985, 1.2, 0, 3),
    @(1.004, 0.982, 1.5, 0, 4),
    @(1.004, 0.982, 1.2, 0, 4),
    @(1.004, 0.982, 1.5, 0, 4),
    @(1.004, 0.982, 1.2, 0, 4)
  )
  for ($column = 0; $column -lt $sleepSpecs.Count; $column++) {
    $spec = $sleepSpecs[$column]
    Add-Cell $atlasGraphics (New-TrackedFrame $rest $spec[0] $spec[1] $spec[2] $spec[3] $spec[4]) 5 $column
  }

  foreach ($row in 6, 7, 8) {
    for ($column = 0; $column -lt 6; $column++) {
      Add-Cell $atlasGraphics (New-TrackedFrame $master 1 1 0 0 0) $row $column
    }
  }

  # 16 mouse-look directions. Frontal pixels are retained for shallow angles;
  # the single generated walking turn is reused at side angles and mirrored left.
  $lookFrames = @(
    (New-TrackedFrame $master 1.000 1.000  0.0  0 -5),
    (New-TrackedFrame $master 0.998 1.000  0.5  2 -4),
    (New-TrackedFrame $master 0.992 1.000  1.0  4 -2),
    (New-TrackedFrame $walk   0.975 0.985 -1.0  2 -2),
    (New-TrackedFrame $walk   0.980 0.990  0.0  3  0),
    (New-TrackedFrame $walk   0.975 0.985  1.0  2  2),
    (New-TrackedFrame $master 0.992 1.000  1.0  4  2),
    (New-TrackedFrame $master 0.998 1.000  0.5  2  4),
    (New-TrackedFrame $master 1.000 1.000  0.0  0  5),
    (New-TrackedFrame $master 0.998 1.000 -0.5 -2  4),
    (New-TrackedFrame $master 0.992 1.000 -1.0 -4  2),
    (New-TrackedFrame $walk   0.975 0.985 -1.0 -2  2 $true),
    (New-TrackedFrame $walk   0.980 0.990  0.0 -3  0 $true),
    (New-TrackedFrame $walk   0.975 0.985  1.0 -2 -2 $true),
    (New-TrackedFrame $master 0.992 1.000 -1.0 -4 -2),
    (New-TrackedFrame $master 0.998 1.000 -0.5 -2 -4)
  )
  for ($index = 0; $index -lt 16; $index++) {
    $row = if ($index -lt 8) { 9 } else { 10 }
    $column = if ($index -lt 8) { $index } else { $index - 8 }
    Add-Cell $atlasGraphics $lookFrames[$index] $row $column
  }

  $atlasPath = Join-Path $assetDir 'just-minbird.png'
  $atlas.Save($atlasPath, [System.Drawing.Imaging.ImageFormat]::Png)

  # Kept under the existing filename for package compatibility. At runtime it
  # is the minbird sitting frame, now intentionally identical to normal awake.
  $restPath = Join-Path $assetDir 'just-minbird-rest.png'
  $master.Save($restPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $upperLookDirections = @(0, 1, 2, 3, 13, 14, 15)
  $lookStrip = [System.Drawing.Bitmap]::new($cellWidth * $upperLookDirections.Count, $cellHeight, $pixelFormat)
  $lookGraphics = [System.Drawing.Graphics]::FromImage($lookStrip)
  try {
    Set-HighQuality $lookGraphics
    $lookGraphics.Clear([System.Drawing.Color]::Transparent)
    for ($column = 0; $column -lt $upperLookDirections.Count; $column++) {
      $direction = $upperLookDirections[$column]
      $lookGraphics.DrawImageUnscaled($lookFrames[$direction], $column * $cellWidth, 0)
    }
    $lookStrip.Save((Join-Path $assetDir 'just-minbird-look-up.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $lookGraphics.Dispose()
    $lookStrip.Dispose()
  }

  $previewRows = @(0, 1, 3, 5, 9, 10)
  $preview = [System.Drawing.Bitmap]::new($cellWidth * 8, $cellHeight * $previewRows.Count, $pixelFormat)
  $previewGraphics = [System.Drawing.Graphics]::FromImage($preview)
  try {
    Set-HighQuality $previewGraphics
    $previewGraphics.Clear([System.Drawing.Color]::Transparent)
    for ($previewRow = 0; $previewRow -lt $previewRows.Count; $previewRow++) {
      $sourceRow = $previewRows[$previewRow]
      $sourceRect = [System.Drawing.Rectangle]::new(0, $sourceRow * $cellHeight, $cellWidth * 8, $cellHeight)
      $destinationRect = [System.Drawing.Rectangle]::new(0, $previewRow * $cellHeight, $cellWidth * 8, $cellHeight)
      $previewGraphics.DrawImage($atlas, $destinationRect, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
    }
    $preview.Save((Join-Path $buildDir 'minbird-preview.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $previewGraphics.Dispose()
    $preview.Dispose()
  }

  Write-Host "Created $atlasPath"
} finally {
  $atlasGraphics.Dispose()
  $atlas.Dispose()
  foreach ($frame in $created) { $frame.Dispose() }
  $master.Dispose()
  $rest.Dispose()
  $wave.Dispose()
  $walk.Dispose()
  $walkParts.Body.Dispose()
  $walkParts.LeftLeg.Dispose()
  $walkParts.RightLeg.Dispose()
}
