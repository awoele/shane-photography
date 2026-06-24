param(
  [string]$ProjectId = "",
  [string]$Region = "asia-east1",
  [string]$IncomingBucket = "shane-photos-incoming",
  [string]$PublicBucket = "shane-photos",
  [int]$MaxItemsPerRun = 20,
  [string]$UploadFunctionSecret = "",
  [string]$ProcessFunctionSecret = "",
  [string]$GcloudPath = ""
)

$ErrorActionPreference = "Stop"

function Resolve-GcloudPath {
  if ($GcloudPath) {
    return $GcloudPath
  }

  $command = Get-Command gcloud -ErrorAction SilentlyContinue

  if ($command) {
    return $command.Source
  }

  $defaultPath = "C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"

  if (Test-Path -LiteralPath $defaultPath) {
    return $defaultPath
  }

  throw "gcloud was not found. Install Google Cloud SDK or pass -GcloudPath."
}

function Invoke-Gcloud {
  param(
    [string[]]$GcloudArgs,
    [string]$WorkDir
  )

  Push-Location -LiteralPath $WorkDir

  try {
    & $script:Gcloud @GcloudArgs

    if ($LASTEXITCODE -ne 0) {
      throw "gcloud failed with exit code $LASTEXITCODE."
    }
  }
  finally {
    Pop-Location
  }
}

function Get-GcloudValue {
  param([string[]]$GcloudArgs)

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"

  try {
    $output = & $script:Gcloud @GcloudArgs 2>$null

    if ($LASTEXITCODE -ne 0) {
      return ""
    }

    return (($output | Select-Object -First 1) -as [string]).Trim()
  }
  finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
}

$script:Gcloud = Resolve-GcloudPath
$root = Split-Path -Parent $PSScriptRoot
$uploadSource = Join-Path $root "cloud-functions\create-upload-url"
$processSource = Join-Path $root "cloud-functions\process-incoming"

if ($ProjectId) {
  & $script:Gcloud config set project $ProjectId | Out-Host
}

$activeProject = if ($ProjectId) {
  $ProjectId
}
else {
  Get-GcloudValue -GcloudArgs @("config", "get-value", "project")
}

if ($activeProject -eq "(unset)") {
  $activeProject = ""
}

if (-not $activeProject) {
  throw "No active Google Cloud project. Run gcloud auth login and gcloud config set project <project-id>, or pass -ProjectId."
}

$uploadEnv = @("INCOMING_BUCKET=$IncomingBucket")

if ($UploadFunctionSecret) {
  $uploadEnv += "UPLOAD_FUNCTION_SECRET=$UploadFunctionSecret"
}
else {
  Write-Host "UPLOAD_FUNCTION_SECRET not supplied; preserving existing value if the function already has one."
}

$processEnv = @(
  "INCOMING_BUCKET=$IncomingBucket",
  "PUBLIC_BUCKET=$PublicBucket",
  "MAX_ITEMS_PER_RUN=$MaxItemsPerRun"
)

if ($ProcessFunctionSecret) {
  $processEnv += "PROCESS_FUNCTION_SECRET=$ProcessFunctionSecret"
}
else {
  Write-Host "PROCESS_FUNCTION_SECRET not supplied; preserving existing value if the function already has one."
}

Write-Host "Deploying create-upload-url to project $activeProject in $Region..."
Invoke-Gcloud `
  -WorkDir $uploadSource `
  -GcloudArgs @(
    "functions", "deploy", "create-upload-url",
    "--quiet",
    "--project=$activeProject",
    "--gen2",
    "--runtime=nodejs20",
    "--region=$Region",
    "--source=.",
    "--entry-point=createUploadUrl",
    "--trigger-http",
    "--allow-unauthenticated",
    "--update-env-vars=$($uploadEnv -join ',')"
  )

Write-Host "Deploying process-incoming-photos to project $activeProject in $Region..."
Invoke-Gcloud `
  -WorkDir $processSource `
  -GcloudArgs @(
    "functions", "deploy", "process-incoming-photos",
    "--quiet",
    "--project=$activeProject",
    "--gen2",
    "--runtime=nodejs20",
    "--region=$Region",
    "--source=.",
    "--entry-point=processIncoming",
    "--trigger-http",
    "--allow-unauthenticated",
    "--memory=1GiB",
    "--timeout=540s",
    "--max-instances=1",
    "--update-env-vars=$($processEnv -join ',')"
  )

Write-Host "Function URLs:"
& $script:Gcloud functions describe create-upload-url `
  --project=$activeProject `
  --region=$Region `
  --gen2 `
  --format="value(serviceConfig.uri)"

& $script:Gcloud functions describe process-incoming-photos `
  --project=$activeProject `
  --region=$Region `
  --gen2 `
  --format="value(serviceConfig.uri)"
