# 从项目原创文本离线合成示例听力，无外部服务或付费调用。
$ErrorActionPreference = 'Stop'
$scenes = Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot '../src/data/sample-listening.json') | ConvertFrom-Json
$targetDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../public/examples'))
New-Item -ItemType Directory -Force -Path $targetDirectory | Out-Null
$speaker = New-Object -ComObject SAPI.SpVoice
$stream = New-Object -ComObject SAPI.SpFileStream
try {
  $voices = $speaker.GetVoices('Language=409')
  if ($voices.Count -eq 0) { throw 'No local English speech voice installed.' }
  $speaker.Voice = $voices.Item(0)
  $speaker.Rate = -1
  $stream.Open((Join-Path $targetDirectory 'listening.wav'), 3, $false)
  $speaker.AudioOutputStream = $stream
  foreach ($scene in $scenes) { [void]$speaker.Speak($scene.text) }
} finally { $stream.Close() }
Get-Item (Join-Path $targetDirectory 'listening.wav') | Select-Object Name, Length
