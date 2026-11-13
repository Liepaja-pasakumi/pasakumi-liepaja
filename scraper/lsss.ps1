# =========================================================
# Nakts ielade: LSSS kalendars (www.lsss.lv/lv/kalendars/) -> Supabase
#
# Ka darbojas:
#   1. Nolasa menesa lapas (sis + 2 nakamie menesi). Katras dienas
#      pasakumi ir ielikti lapa ka "data-info" (URL kodets HTML).
#   2. Nem TIKAI pasakumus Liepaja (izbraukuma speles neliek) un
#      izlaiz iekselas lietas (sapulces, sedes).
#   3. Ieraksta Supabase (source_id = "lsss"), visi ir "sports".
#   4. Izsauc mark_duplicates() - ja ta pati spele jau ir no
#      kalendars.liepaja.lv, LSSS ierakstu paslepj ka dublikatu.
#
# Palaist pasam (tikai paskatities, NEKO neraksta):
#   powershell -ExecutionPolicy Bypass -File scraper\lsss.ps1
# Fails ir bez garumzimem (Windows PowerShell 5.1).
# =========================================================
param(
  [int]$Months = 3,
  [string]$OutFile = ""
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Web

$BASE = "https://www.lsss.lv/lv/kalendars/"
$RIGA = $null
try { $RIGA = [TimeZoneInfo]::FindSystemTimeZoneById("FLE Standard Time") } catch {}

# Liepaja (ar garumzimi: [char]0x0101 = a ar svitru) - nosaukuma vai vieta
$IN_LIEPAJA = "Liep" + [char]0x0101 + "j"
# Iekselie notikumi, ko apmekletajiem nerada
$SKIP = "sapulce|s" + [char]0x0113 + "de|apspriede|tren" + [char]0x0113 + "ri|treneru"

function Get-Text($resp) {
  return [Text.Encoding]::UTF8.GetString($resp.RawContentStream.ToArray())
}
function Clean($s) {
  if ($null -eq $s) { return "" }
  $s = [Net.WebUtility]::HtmlDecode($s)
  $s = $s -replace "<[^>]+>", " "
  return ($s -replace "\s+", " ").Trim()
}

# Menesa 1. datums pusnakti pec Latvijas laika -> unix laiks
function Get-MonthUnix([datetime]$first) {
  $offset = [TimeSpan]::FromHours(2)
  if ($RIGA) { $offset = $RIGA.GetUtcOffset($first) }
  # Menesa vidus (15. datums 12:00), lai laika josla nevar "parlekt" uz citu menesi
  return ([DateTimeOffset]::new($first.Year, $first.Month, 15, 12, 0, 0, $offset)).ToUnixTimeSeconds()
}

$today = if ($RIGA) { [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $RIGA).Date } else { (Get-Date).Date }
$todayKey = $today.ToString("yyyy-MM-dd")
$first = New-Object DateTime ($today.Year, $today.Month, 1)

$all = [ordered]@{}
for ($k = 0; $k -lt $Months; $k++) {
  $month = $first.AddMonths($k)
  $url = $BASE + "?date=" + (Get-MonthUnix $month)
  $html = Get-Text (Invoke-WebRequest -UseBasicParsing $url)
  $days = [regex]::Matches($html, 'data-date="(\d\d)\.(\d\d)\.(\d{4})" data-info="([^"]*)"')
  $found = 0
  foreach ($d in $days) {
    $date = "{0}-{1}-{2}" -f $d.Groups[3].Value, $d.Groups[2].Value, $d.Groups[1].Value
    if ($date -lt $todayKey) { continue }
    $info = [Web.HttpUtility]::UrlDecode($d.Groups[4].Value)
    # Katru pasakumu apstrada atseviski (lai viens nesalip ar nakamo)
    $blocks = [regex]::Split($info, '<div class="event')
    foreach ($block in $blocks) {
      $e = [regex]::Match($block, '<h5><a href="(?<url>[^"]*/(?<id>\d+)/)">(?<title>.*?)</a></h5>\s*<span class="time">(?<time>.*?)</span>(?<teams>[^<]*)', "Singleline")
      if (-not $e.Success) { continue }
      $id = $e.Groups["id"].Value
      if ($all.Contains($id)) { continue }
      $full  = Clean $e.Groups["title"].Value      # "Liga ..., Liepaja, LOC 1.zale"
      $teams = Clean $e.Groups["teams"].Value      # "LSSS U15 - RBS Jugla"
      if ($full -notmatch $IN_LIEPAJA) { continue }   # izbraukuma spele
      if ($full -match $SKIP) { continue }            # iekseja sapulce

      # Vieta = viss sakot ar "Liepaja..." ; sacensibas = pirms tam
      $m = [regex]::Match($full, "^(?<league>.*?),?\s*(?<place>[^,]*$IN_LIEPAJA.*)$")
      if ($m.Success) { $league = $m.Groups["league"].Value.Trim(" ,"); $place = $m.Groups["place"].Value.Trim() }
      else { $league = $full; $place = "Liep" + [char]0x0101 + "ja" }
      if (-not $league) { $league = $full }

      $time = $null
      $tm = [regex]::Match((Clean $e.Groups["time"].Value), "(\d{1,2})[.:](\d{2})")
      if ($tm.Success) { $time = "{0:D2}:{1}" -f [int]$tm.Groups[1].Value, $tm.Groups[2].Value }

      $title = if ($teams) { "$teams ($league)" } else { $league }
      if ($title.Length -gt 200) { $title = $title.Substring(0, 197) + "..." }

      $all[$id] = [ordered]@{
        source_id   = "lsss"
        external_id = $id
        title       = $title
        date        = $date
        time        = $time
        place       = $place
        category    = "sports"
        description = $league
        url         = $e.Groups["url"].Value
      }
      $found++
    }
  }
  Write-Host ("Menesis {0:yyyy-MM}: {1} pasakumi Liepaja" -f $month, $found)
  Start-Sleep -Milliseconds 300
}
$events = @($all.Values)
Write-Host "Kopa: $($events.Count)"

if ($OutFile) {
  [IO.File]::WriteAllText($OutFile, (ConvertTo-Json -InputObject $events -Depth 4), (New-Object Text.UTF8Encoding $false))
  Write-Host "Saglabats: $OutFile"
}

# ---------- Ierakstisana Supabase ----------
$sbUrl = $env:SUPABASE_URL
$sbKey = $env:SUPABASE_SECRET_KEY
if (-not $sbUrl -or -not $sbKey) {
  Write-Host "SUPABASE_URL / SUPABASE_SECRET_KEY nav iestatiti - datubaze NEKO nerakstu."
  exit 0
}
if ($events.Count -eq 0) {
  Write-Host "LSSS pasakumu Liepaja nav - neko nerakstu."
  exit 0
}

# Supabase slepeno atslegu nepienem no "parlukiem" - dodam savu nosaukumu
$headers = @{ apikey = $sbKey; Prefer = "resolution=merge-duplicates,return=minimal" }
$runStart = [DateTime]::UtcNow.AddMinutes(-2).ToString("yyyy-MM-ddTHH:mm:ssZ")
$agent = "pasakumi-liepaja-nakts-ielade"
$body = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $events -Depth 4))
$null = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$sbUrl/rest/v1/events?on_conflict=source_id,external_id" `
          -Headers $headers -UserAgent $agent -ContentType "application/json; charset=utf-8" -Body $body
Write-Host "Ierakstiti $($events.Count)"

# Dublikati: ta pati spele no kalendars.liepaja.lv -> LSSS ierakstu paslepj
$r = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$sbUrl/rest/v1/rpc/mark_duplicates" `
       -Headers @{ apikey = $sbKey } -UserAgent $agent -ContentType "application/json" -Body "{}"
Write-Host "Atzimeti dublikati: $(Get-Text $r)"

# Speles, kas LSSS kalendara vairs nav (atceltas/parceltas) -> iznem no lapas
$lastDay = $first.AddMonths($Months).AddDays(-1).ToString("yyyy-MM-dd")
$rm = @{ src = "lsss"; run_started = $runStart; from_date = $todayKey; to_date = $lastDay } | ConvertTo-Json
$r = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$sbUrl/rest/v1/rpc/remove_missing" `
       -Headers @{ apikey = $sbKey } -UserAgent $agent -ContentType "application/json" -Body $rm
Write-Host "Iznemti avota pazudusie: $(Get-Text $r)"
Write-Host "Gatavs."
