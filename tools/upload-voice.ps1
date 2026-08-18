# 上传台词语音到 Cloudflare R2
#
# 前提：
#   1. 安装 rclone：winget install rclone.rclone
#   2. 在 Cloudflare R2 创建桶和 API Token
#   3. 在运行本脚本的终端设置环境变量：
#      $env:R2_ACCOUNT_ID = "你的账户ID"
#      $env:R2_ACCESS_KEY_ID = "R2 API Token 的 Access Key"
#      $env:R2_SECRET_ACCESS_KEY = "R2 API Token 的 Secret"
#      $env:R2_BUCKET = "voice"   # 可选，默认 voice
#
# 然后执行：
#   .\tools\upload-voice.ps1

$ErrorActionPreference = "Stop"

$accountId = $env:R2_ACCOUNT_ID
$accessKey = $env:R2_ACCESS_KEY_ID
$secretKey = $env:R2_SECRET_ACCESS_KEY
$bucket = if ($env:R2_BUCKET) { $env:R2_BUCKET } else { "voice" }
$remote = "r2"

if (-not $accountId -or -not $accessKey -or -not $secretKey) {
  Write-Host "缺少 R2 凭据，请先设置以下环境变量：" -ForegroundColor Yellow
  Write-Host "  R2_ACCOUNT_ID"
  Write-Host "  R2_ACCESS_KEY_ID"
  Write-Host "  R2_SECRET_ACCESS_KEY"
  exit 1
}

if (-not (Get-Command rclone -ErrorAction SilentlyContinue)) {
  Write-Host "未安装 rclone，请先执行：winget install rclone.rclone" -ForegroundColor Yellow
  exit 1
}

$voiceRoot = "D:\魔裁解包密码0721\魔裁\人物语音（已按人物分类过了"
if (-not (Test-Path -LiteralPath $voiceRoot)) {
  Write-Host "语音目录不存在：$voiceRoot" -ForegroundColor Red
  exit 1
}

$manifest = Join-Path $PSScriptRoot "..\data\audio-manifest.txt"
if (-not (Test-Path -LiteralPath $manifest)) {
  Write-Host "缺少上传清单：$manifest" -ForegroundColor Red
  exit 1
}

Write-Host "配置 rclone remote: $remote"
rclone config create $remote s3 provider Cloudflare access_key_id $accessKey secret_access_key $secretKey endpoint "https://${accountId}.r2.cloudflarestorage.com" --non-interactive

Write-Host "开始上传语音到 ${remote}:${bucket}"
rclone copy $voiceRoot "${remote}:${bucket}" --files-from $manifest --progress

Write-Host "上传完成。请把 js/config.js 的 audioBaseUrl 改为桶的公共 URL。"
