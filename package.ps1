# Script to package the Chrome extension for distribution
Write-Host "Packaging BigCommerce WYSIWYG Editor v4.3..." -ForegroundColor Cyan

$zipFileName = "bigcommerce-wysiwyg-editor-v4.3.zip"

# Remove existing zip if it exists
if (Test-Path $zipFileName) {
    Remove-Item $zipFileName -Force
    Write-Host "Previous zip file removed." -ForegroundColor Yellow
}

# Define files to include in the package
$filesToInclude = @(
    "manifest.json",
    "content.js",
    "popup.js",
    "popup.html",
    "background.js",
    "README.md",
    "PRIVACY_POLICY.md",
    "img/icon16.png",
    "img/icon48.png",
    "img/icon128.png"
)

# Verify that all files exist
$allFilesExist = $true
foreach ($file in $filesToInclude) {
    if (-not (Test-Path $file)) {
        Write-Host "Warning! File not found: $file" -ForegroundColor Red
        $allFilesExist = $false
    }
}

if (-not $allFilesExist) {
    Write-Host "Some required files are missing. Please check the file list." -ForegroundColor Red
    exit 1
}

# Create temporary directory for packaging
$tempDir = ".\temp_package"
if (Test-Path $tempDir) {
    Remove-Item -Recurse -Force $tempDir
}
New-Item -ItemType Directory -Path $tempDir | Out-Null

# Copy files to temporary directory
foreach ($file in $filesToInclude) {
    $destFile = Join-Path -Path $tempDir -ChildPath $file
    $destDir = Split-Path -Path $destFile -Parent
    
    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir | Out-Null
    }
    
    Copy-Item -Path $file -Destination $destFile
    Write-Host "Copied: $file" -ForegroundColor Green
}

# Compress files
try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $compressionLevel = [System.IO.Compression.CompressionLevel]::Optimal
    
    [System.IO.Compression.ZipFile]::CreateFromDirectory($tempDir, $zipFileName, $compressionLevel, $false)
    
    Write-Host "Package created: $zipFileName" -ForegroundColor Green
    $fileSize = (Get-Item $zipFileName).Length / 1KB
    Write-Host "Size: $([Math]::Round($fileSize, 2)) KB" -ForegroundColor Cyan
    
    # Clean up temporary directory
    Remove-Item -Recurse -Force $tempDir
} catch {
    Write-Host "Error creating package: $_" -ForegroundColor Red
}

Write-Host @"

=================================
NEXT STEPS FOR PUBLICATION:
=================================

1. Log in to the Chrome Web Store Developer Dashboard:
   https://chrome.google.com/webstore/devconsole/

2. Click "Add new item" and upload the generated zip file.

3. Complete the following details:
   - Name: BigCommerce WYSIWYG Editor
   - Brief description: Lightweight HTML editor for text fields in BigCommerce
   - Detailed description: [See README.md]
   - Screenshots: Add at least 1-3 screenshots of 1280x800px
   - Promotion: Add a promotional image of 440x280px (optional)
   - Category: Developer Tools
   - Languages: Spanish, English
   - Privacy policy: Use the PRIVACY_POLICY.md file

4. Price and distribution: Configure where the extension will be available.

5. Submit for review.

"@ -ForegroundColor Yellow