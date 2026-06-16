param(
  [string]$Output = "$PSScriptRoot\..\data\search-index.json"
)

$ErrorActionPreference = "Stop"
$base = "https://mhwilds.kiranico.com/zh-Hant"
$pages = @(
  @{ Type = "skill"; Url = "$base/data/skills"; Group = "Skill" },
  @{ Type = "decoration"; Url = "$base/data/decorations"; Group = "Decoration" },
  @{ Type = "armor"; Url = "$base/data/armor-series"; Group = "Armor" }
)

function ConvertFrom-KiranicoList {
  param(
    [string]$Html,
    [string]$Type,
    [string]$DefaultGroup
  )

  $items = [System.Collections.Generic.List[object]]::new()
  $matches = [regex]::Matches(
    $Html,
    '<a[^>]+href="(?<href>/zh-Hant/data/[^"]+)"[^>]*>(?<name>[^<]+)</a>(?<summary>[^<\r\n]*)',
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
  )

  foreach ($match in $matches) {
    $name = [System.Net.WebUtility]::HtmlDecode($match.Groups["name"].Value).Trim()
    $summary = [System.Net.WebUtility]::HtmlDecode($match.Groups["summary"].Value).Trim()
    $href = $match.Groups["href"].Value.Trim()

    if ($name.Length -gt 1 -and $name.Length -lt 60) {
      $items.Add([ordered]@{
        type = $Type
        name = $name
        summary = $summary
        group = $DefaultGroup
        url = "https://mhwilds.kiranico.com$href"
      })
    }
  }

  return $items
}

$all = [System.Collections.Generic.List[object]]::new()
foreach ($page in $pages) {
  Write-Host "Fetching $($page.Url)"
  $html = (Invoke-WebRequest -Uri $page.Url -UseBasicParsing).Content
  $items = ConvertFrom-KiranicoList -Html $html -Type $page.Type -DefaultGroup $page.Group
  foreach ($item in $items) { $all.Add($item) }
}

$json = $all | ConvertTo-Json -Depth 5
if ($all.Count -lt 100) {
  Write-Warning "Only $($all.Count) records were found. The output was not overwritten."
  Write-Warning "Kiranico may require a rendered-page extractor for the full lists."
  exit 2
}
Set-Content -LiteralPath $Output -Value $json -Encoding UTF8
Write-Host "Wrote $($all.Count) records to $Output"
