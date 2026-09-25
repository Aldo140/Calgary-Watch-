# Limits the "CalgaryWatch Ops" Entra app to the aldo@calgarywatch.ca mailbox.
# Without this, an app with Mail.Send application permission can send as any
# mailbox in the tenant.
#
# Run once, from the repo folder, after creating the app:
#   powershell -ExecutionPolicy Bypass -File scripts\ops\restrict-outlook-app.ps1 -AppId <Application (client) ID>
# A Microsoft sign-in window opens; sign in as aldo@calgarywatch.ca.

param([Parameter(Mandatory = $true)][string]$AppId)

$ErrorActionPreference = 'Stop'
$mailbox = 'aldo@calgarywatch.ca'
$group = 'cw-ops-mailboxes@calgarywatch.ca'

if (-not (Get-Module -ListAvailable -Name ExchangeOnlineManagement)) {
  Write-Host 'Installing the Exchange Online module (one time)...'
  Install-Module ExchangeOnlineManagement -Scope CurrentUser -Force -AllowClobber
}
Import-Module ExchangeOnlineManagement
Connect-ExchangeOnline -UserPrincipalName $mailbox -ShowBanner:$false

if (-not (Get-DistributionGroup -Identity $group -ErrorAction SilentlyContinue)) {
  New-DistributionGroup -Name 'CW Ops Mailboxes' -Alias 'cw-ops-mailboxes' -PrimarySmtpAddress $group -Type Security -Members $mailbox | Out-Null
  Write-Host "Created security group $group containing $mailbox."
}

$existing = Get-ApplicationAccessPolicy -ErrorAction SilentlyContinue | Where-Object { $_.AppId -eq $AppId }
if (-not $existing) {
  New-ApplicationAccessPolicy -AppId $AppId -PolicyScopeGroupId $group -AccessRight RestrictAccess -Description 'CalgaryWatch ops agent: aldo@ only' | Out-Null
  Write-Host 'Access policy created.'
} else {
  Write-Host 'Access policy already exists.'
}

$result = Test-ApplicationAccessPolicy -Identity $mailbox -AppId $AppId
Write-Host "Access to $mailbox : $($result.AccessCheckResult)  (should be Granted)"
Write-Host 'Microsoft can take up to an hour to apply the policy everywhere.'
Disconnect-ExchangeOnline -Confirm:$false
