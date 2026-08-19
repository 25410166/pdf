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

Write-Host "Registered $scheme scheme:"
Get-ItemProperty -Path "$regBase\shell\open\command"
