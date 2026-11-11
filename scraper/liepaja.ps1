# ======================================================
# Nakts ielade: kalendars.liepaja.lv -> Supabase
#
# Ka darbojas:
#   1. Katrai kalendara kategorijai (Sports, Koncerti ...) nolasa
#      pasakumu sarakstu uz DAYS_AHEAD dienam uz prieksu.
#   2. Kalendara kategoriju parvers par musejam 4:
#      sports / kultura / berniem / citi.
#   3. Ieraksta Supabase tabula "events" (ja jau ir - atjauno).
#
# Palaist pasam (tikai paskatities, NEKO neraksta):
#   powershell -ExecutionPolicy Bypass -File scraper\liepaja.ps1
# Rakstit datubaze var tikai, ja ir iestatiti SUPABASE_URL un
# SUPABASE_SECRET_KEY (to dara GitHub Actions no "Secrets").
#
# Fails ir bez garumzimem, lai Windows PowerShell 5.1 to nolasa pareizi.
# =========================================================
param(
  [int]$DaysAhead = 60,
  [string]$OutFile = ""
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$SITE = "https://kalendars.liepaja.lv"
$AJAX = "$SITE/ajax.php?route=/post/get/events/"

# Kalendara kategorija (ID) -> musu kategorija.
# SECIBA SVARIGA: ja pasakums ir vairakas kategorijas, uzvar pirma.
# Sports pirmais (lietotajam svarigakais), tad Berniem, Kultura, Citi.
# 7 = Izstades - pagaidam NELADEJAM (ta katra izstades diena ir atseviska
#     rinda, un dienas saraksts butu parpludinats; kalendars tas pec
#     noklusejuma ari nerada).
$CATEGORIES = @(
  @{ id = 15;  ours = "sports"  },  # Sports
  @{ id = 104; ours = "sports"  },  # Aktiva atputa
  @{ id = 88;  ours = "berniem" },  # Gimenem un berniem
  @{ id = 6;   ours = "kultura" },  # Izrades
  @{ id = 9;   ours = "kultura" },  # Koncerti
  @{ id = 105; ours = "kultura" },  # Kino
  @{ id = 108; ours = "kultura" },  # Liepaja 2027
  @{ id = 100; ours = "citi"    },  # Svetki un brivdabas pasakumi
  @{ id = 99;  ours = "citi"    },  # Turisms
  @{ id = 103; ours = "citi"    },  # Pasizaugsmei
  @{ id = 106; ours = "citi"    },  # Uznemejdarbiba
  @{ id = 49;  ours = "citi"    },  # Citi pasakumi
  @{ id = 107; ours = "citi"    }   # (nezinams nosaukums, ir noklusejuma saraksta)
)

function Get-Text($resp) {
  return [Text.Encoding]::UTF8.GetString($resp.RawContentStream.ToArray())
}

function Clean($s) {
  if ($null -eq $s) { return "" }
  $s = [Net.WebUtility]::HtmlDecode($s)
  $s = $s -replace "<[^>]+>", " "
  return ($s -replace "\s+", " ").Trim()
}

# Sodiena pec Latvijas laika (GitHub serveris dzivo UTC)
function Get-RigaToday {
  try {
    $tz = [TimeZoneInfo]::FindSystemTimeZoneById("FLE Standard Time")
    return [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $tz).Date
  } catch { return (Get-Date).Date }
}

# Izvelk pasakumus no saraksta HTML gabala
function Parse-Items($html, $category) {
  $result = @()
  $blocks = [regex]::Split($html, "<li[\s>]")
  foreach ($b in $blocks) {
    $m = [regex]::Match($b, 'class="title" href="(?<url>[^"]*/lv/(?<date>\d{4}-\d{2}-\d{2}):(?<id>\d+)(?::(?<occ>\d+))?/?)"')
    if (-not $m.Success) { continue }
    $title = Clean ([regex]::Match($b, "<h3>(.*?)</h3>", "Singleline").Groups[1].Value)
    if (-not $title) { continue }
    $when  = Clean ([regex]::Match($b, '<div class="event-date">(.*?)</div>', "Singleline").Groups[1].Value)
    $place = Clean ([regex]::Match($b, '<div class="event-place">(.*?)</div>', "Singleline").Groups[1].Value)
    $fee   = Clean ([regex]::Match($b, '<div class="event-fee">(.*?)</div>', "Singleline").Groups[1].Value)
    $img   = [regex]::Match($b, "url\('(?<u>[^']+)'\)").Groups["u"].Value

    # Laiks: "Ceturtdiena, 12. novembris, 11.00" -> "11:00"
    $time = $null
    $tm = [regex]::Match($when, "(\d{1,2})[.:](\d{2})\s*$")
    if ($tm.Success) { $time = "{0:D2}:{1}" -f [int]$tm.Groups[1].Value, $tm.Groups[2].Value }

    # Bilde: lielaka versija, ja saraksta ir maza
    if ($img) { $img = $img -replace "/small_", "/large_" } else { $img = $null }

    $occ = $m.Groups["occ"].Value
    if (-not $occ) { $occ = $m.Groups["date"].Value }

    $result += [ordered]@{
      source_id   = "liepaja"
      external_id = $m.Groups["id"].Value + ":" + $occ
      title       = $title
      date        = $m.Groups["date"].Value
      time        = $time
      place       = $place
      category    = $category
      image       = $img
      url         = $m.Groups["url"].Value
      price       = $(if ($fee) { $fee } else { $null })
    }
  }
  return $result
}

# Nolasa vienas kategorijas visas lapas
function Get-Category($catId, $ours, $from, $until) {
  $null = Invoke-WebRequest -UseBasicParsing "$SITE/lv" -SessionVariable s
  $null = Invoke-WebRequest -UseBasicParsing -WebSession $s -Method Post `
            -Body @{ cat = "$catId"; replace = "true" } ($AJAX + "setCategory")
  $items = @()
  $page = 1
  $url = "/lv/page:1,date_from:$from,date_until:$until,categories:$catId,a:f"
  while ($url -and $page -le 80) {
    $r = Invoke-WebRequest -UseBasicParsing -WebSession $s -Method Post `
           -Body @{ url = $url; loadmore = "true" } ($AJAX + "loadmore")
    $o = (Get-Text $r) | ConvertFrom-Json
    if ($o.html) { $items += Parse-Items $o.html $ours }
    if ($o.next -and $o.next -ne $false) { $url = [string]$o.next } else { $url = $null }
    $page++
    Start-Sleep -Milliseconds 300   # pieklajigi pret serveri
  }
  return ,$items
}

# ---------- Galvena dala ----------
$today = Get-RigaToday
$from  = $today.ToString("yyyy-MM-dd")
$until = $today.AddDays($DaysAhead).ToString("yyyy-MM-dd")
Write-Host "Ielade no $from lidz $until"

$all = [ordered]@{}   # external_id -> pasakums (bez dublikatiem)
foreach ($c in $CATEGORIES) {
  try {
    $items = Get-Category $c.id $c.ours $from $until
  } catch {
    Write-Warning ("Kategorija {0}: kluda {1}" -f $c.id, $_.Exception.Message)
    continue
  }
  $new = 0
  foreach ($it in $items) {
    if ($it.date -gt $until) { continue }
    if (-not $all.Contains($it.external_id)) { $all[$it.external_id] = $it; $new++ }
  }
  Write-Host ("Kategorija {0,3} -> {1,-8}: {2,4} atrasti, {3,4} jauni" -f $c.id, $c.ours, $items.Count, $new)
}
$events = @($all.Values)
Write-Host "Kopa (bez dublikatiem): $($events.Count)"

if ($OutFile) {
  $json = ConvertTo-Json -InputObject $events -Depth 4
  [IO.File]::WriteAllText($OutFile, $json, (New-Object Text.UTF8Encoding $false))
  Write-Host "Saglabats: $OutFile"
}

# ---------- Ierakstisana Supabase ----------
$sbUrl = $env:SUPABASE_URL
$sbKey = $env:SUPABASE_SECRET_KEY
if (-not $sbUrl -or -not $sbKey) {
  Write-Host "SUPABASE_URL / SUPABASE_SECRET_KEY nav iestatiti - datubaze NEKO nerakstu."
  exit 0
}
if ($events.Count -lt 5) {
  # Drosibai: ja kalendars pekspeki neko neatdod, neko nemainam
  throw "Atrasti tikai $($events.Count) pasakumi - kaut kas nav kartiba, neko nerakstu."
}

$headers = @{
  apikey          = $sbKey
  Authorization   = "Bearer $sbKey"
  Prefer          = "resolution=merge-duplicates,return=minimal"
}
$endpoint = "$sbUrl/rest/v1/events?on_conflict=source_id,external_id"
for ($i = 0; $i -lt $events.Count; $i += 200) {
  $chunk = $events[$i..([Math]::Min($i + 199, $events.Count - 1))]
  $body = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject @($chunk) -Depth 4))
  $null = Invoke-WebRequest -UseBasicParsing -Method Post -Uri $endpoint -Headers $headers `
            -ContentType "application/json; charset=utf-8" -Body $body
  Write-Host "Ierakstiti $($i + $chunk.Count) no $($events.Count)"
}
Write-Host "Gatavs."
