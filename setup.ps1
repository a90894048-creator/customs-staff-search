# =============================================
# 관세청 직원 검색 - 서버 PC 자동 수집 설치 스크립트
# 실행: PowerShell에서 아래 한 줄 실행
#   irm https://raw.githubusercontent.com/a90894048-creator/customs-staff-search/main/setup.ps1 | iex
# 매일 07:00 에 전국 세관 직원 목록을 수집해 GitHub(data.json)에 게시한다.
# =============================================

$ErrorActionPreference = "Stop"
$AppDir = Join-Path ([Environment]::GetFolderPath("Desktop")) "관세청 직원검색"
$Raw = "https://raw.githubusercontent.com/a90894048-creator/customs-staff-search/main"
$TaskName = "관세청 직원검색 자동수집"

Write-Host ""
Write-Host "=== 관세청 직원 검색 자동수집 설치 ===" -ForegroundColor Cyan
Write-Host "설치 위치: $AppDir"

# 1. Node.js 확인
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js가 없습니다. https://nodejs.org 에서 설치 후 다시 실행해주세요." -ForegroundColor Red
    return
}
Write-Host "[1/4] Node.js 확인됨: $(node --version)" -ForegroundColor Green

# 2. 파일 다운로드 (config.json, data.json 은 보존)
Write-Host "[2/4] 최신 파일 다운로드 중..." -ForegroundColor Cyan
if (-not (Test-Path $AppDir)) { New-Item -ItemType Directory -Path $AppDir | Out-Null }
foreach ($f in @("collect.js", "run.bat")) {
    Invoke-WebRequest -Uri "$Raw/$f" -OutFile (Join-Path $AppDir $f) -UseBasicParsing
}

# 3. GitHub 토큰 설정 (최초 1회)
$cfgPath = Join-Path $AppDir "config.json"
if (-not (Test-Path $cfgPath)) {
    Write-Host "[3/4] GitHub 토큰을 입력하세요 (customs-staff-search 레포 쓰기 권한 필요)" -ForegroundColor Yellow
    $token = Read-Host "토큰"
    $cfg = @{ repo = "a90894048-creator/customs-staff-search"; branch = "main"; token = $token.Trim() } | ConvertTo-Json
    [IO.File]::WriteAllText($cfgPath, $cfg, (New-Object Text.UTF8Encoding $false))
} else {
    Write-Host "[3/4] 기존 config.json 사용" -ForegroundColor Green
}

# 4. 작업 스케줄러 등록 (매일 07:00, 놓친 경우 PC 켜지면 실행)
Write-Host "[4/4] 작업 스케줄러 등록 중..." -ForegroundColor Cyan
$action = New-ScheduledTaskAction -Execute (Join-Path $AppDir "run.bat") -WorkingDirectory $AppDir
$trigger = New-ScheduledTaskTrigger -Daily -At 7:00
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null

# 바로 한 번 실행해서 확인
Write-Host ""
Write-Host "지금 한 번 수집·게시합니다..." -ForegroundColor Cyan
Push-Location $AppDir
node collect.js --push
Pop-Location

Write-Host ""
Write-Host "=== 설치 완료 ===" -ForegroundColor Green
Write-Host "매일 07:00 자동 수집. 로그: $AppDir\collect.log"
