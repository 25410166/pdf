$exePath = 'F:\Projects\OFFICE\pdf\target\release\cpdf.exe'
$scheme = 'cookapps-cpdf'
$regBase = "HKCU:\Software\Classes\$scheme"

New-Item -Path $regBase -Force | Out-Null
Set-ItemProperty -Path $regBase -Name '(Default)' -Value 'URL:CookApps CPDF Protocol'
New-ItemProperty -Path $regBase -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null

New-Item -Path "$regBase\shell" -Force | Out-Null
New-Item -Path "$regBase\shell\open" -Force | Out-Null
New-Item -Path "$regBase\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "$regBase\shell\open\command" -Name '(Default)' -Value "`"$exePath`" `"%1`""

# Register .pdf file association for Windows Explorer
$pdfReg = "HKCU:\Software\Classes\.pdf\OpenWithProgids"
New-Item -Path $pdfReg -Force | Out-Null
New-ItemProperty -Path $pdfReg -Name "CPDF.Document" -Value "" -PropertyType String -Force | Out-Null

$progId = "HKCU:\Software\Classes\CPDF.Document"
New-Item -Path "$progId\shell\open" -Force | Out-Null
New-Item -Path "$progId\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "$progId\shell\open\command" -Name '(Default)' -Value "`"$exePath`" `"%1`""

Write-Host "Registered $scheme scheme and .pdf file association for $exePath"
