Add-Type -AssemblyName PresentationCore, PresentationFramework, WindowsBase

function Render-WB-Favicon([int]$targetSize, [string]$outputPath) {
    $visual = New-Object System.Windows.Media.DrawingVisual
    $ctx = $visual.RenderOpen()

    $scale = $targetSize / 64.0
    $transform = New-Object System.Windows.Media.ScaleTransform($scale, $scale)
    $ctx.PushTransform($transform)

    # Background gradient
    $startPt = New-Object System.Windows.Point(0, 0)
    $endPt = New-Object System.Windows.Point(1, 1)
    $grad = New-Object System.Windows.Media.LinearGradientBrush(
        [System.Windows.Media.ColorConverter]::ConvertFromString("#2563EB"),
        [System.Windows.Media.ColorConverter]::ConvertFromString("#0F172A"),
        $startPt,
        $endPt
    )

    $rect = New-Object System.Windows.Rect(0, 0, 64, 64)
    $ctx.DrawRoundedRectangle($grad, $null, $rect, 15, 15)

    # White brush for W and B
    $whiteBrush = [System.Windows.Media.Brushes]::White

    $wPath = [System.Windows.Media.Geometry]::Parse("M9 22L13.5 42H18L22 30L26 42H30.5L35 22H29.5L27.5 34L24 22H20L16.5 34L14.5 22H9Z")
    $ctx.DrawGeometry($whiteBrush, $null, $wPath)

    $bPath = [System.Windows.Media.Geometry]::Parse("M38 22H46C51 22 54 24 54 27.5C54 29.5 53 31 51 31.8C53.5 32.5 55 34 55 36.5C55 40 52 42 47 42H38V22ZM43 26V30H46C48 30 49 29.3 49 28C49 26.7 48 26 46 26H43ZM43 34V38H47C49 38 50 37.3 50 36C50 34.7 49 34 47 34H43Z")
    $ctx.DrawGeometry($whiteBrush, $null, $bPath)

    $ctx.Pop()
    $ctx.Close()

    $rtb = New-Object System.Windows.Media.Imaging.RenderTargetBitmap($targetSize, $targetSize, 96, 96, [System.Windows.Media.PixelFormats]::Pbgra32)
    $rtb.Render($visual)

    $encoder = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
    $encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($rtb))

    $fs = [System.IO.File]::OpenWrite($outputPath)
    $encoder.Save($fs)
    $fs.Close()
    Write-Output "Generated $outputPath ($targetSize x $targetSize)"
}

$sizes = @(16, 32, 48, 64, 180, 192, 512)
foreach ($s in $sizes) {
    Render-WB-Favicon -targetSize $s -outputPath "public/favicon-$s.png"
}
Copy-Item "public/favicon-180.png" "public/apple-touch-icon.png"
