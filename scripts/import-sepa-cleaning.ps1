param(
  [Parameter(Mandatory = $true)]
  [string]$ArchivePath,
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\public\data\sepa-cleaning')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName Microsoft.VisualBasic

$archivePath = (Resolve-Path -LiteralPath $ArchivePath).Path
$outputPath = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null
$workingPath = Join-Path ([System.IO.Path]::GetTempPath()) ("sepa-import-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $workingPath | Out-Null

$brandPattern = '(?i)\b(CIF|MAGISTRAL|BLEM|ARIEL|ALA|SKIP|COMFORT|SCOTCH.?BRITE|AYUD[IÍ]N|POETT|SUIS?A|HERO[EÉ])\b'
$cleanPattern = '(?i)\b(lavandina|lej[ií]a|cloro|detergente|deterg|jab[oó]n|suavizante|limpiador|limpieza|multiuso|piso|pisos|ba[nñ]o|cocina|vidrio|desengrasante|desinfectante|lustra|cera|quitamanchas|quitamanchas|esponja|virulana|fibra|trapo|rejilla|escoba|escobill[oó]n|mopa|secador|balde|guantes?|bolsa(s)? (de )?(residuo|basura)|plumero|cepillo|aromatizante|desodorante de ambiente|limpia)\b'
$stats = [ordered]@{ nestedArchives = 0; productFiles = 0; rows = 0; eanRows = 0; matchingRows = 0 }
$products = @{}

try {
  $outer = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
  $snapshotDate = (($outer.Entries | Select-Object -First 1 -ExpandProperty FullName) -split '/')[0]
  try {
    $nestedEntries = @($outer.Entries | Where-Object { $_.FullName -match '\.zip$' -and $_.Length -gt 0 })
    foreach ($nestedEntry in $nestedEntries) {
      $stats.nestedArchives++
      $nestedPath = Join-Path $workingPath ([guid]::NewGuid().ToString('N') + '.zip')
      $entryStream = $nestedEntry.Open()
      $fileStream = [System.IO.File]::Create($nestedPath)
      try { $entryStream.CopyTo($fileStream) } finally { $fileStream.Dispose(); $entryStream.Dispose() }

      $inner = [System.IO.Compression.ZipFile]::OpenRead($nestedPath)
      try {
        $csvEntry = $inner.Entries | Where-Object { [System.IO.Path]::GetFileName($_.FullName) -ieq 'productos.csv' } | Select-Object -First 1
        if (-not $csvEntry) { continue }
        $stats.productFiles++
        $csvStream = $csvEntry.Open()
        $parser = [Microsoft.VisualBasic.FileIO.TextFieldParser]::new($csvStream, [System.Text.Encoding]::UTF8, $true)
        try {
          $parser.TextFieldType = [Microsoft.VisualBasic.FileIO.FieldType]::Delimited
          $parser.SetDelimiters('|')
          $parser.HasFieldsEnclosedInQuotes = $true
          $header = $parser.ReadFields()
          $columns = @{}
          for ($i = 0; $i -lt $header.Length; $i++) { $columns[$header[$i]] = $i }
          $eanIndex = $columns['productos_ean']; $codeIndex = $columns['id_producto']
          $nameIndex = $columns['productos_descripcion']; $brandIndex = $columns['productos_marca']
          $quantityIndex = $columns['productos_cantidad_presentacion']; $unitIndex = $columns['productos_unidad_medida_presentacion']
          $referenceQuantityIndex = $columns['productos_cantidad_referencia']; $referenceUnitIndex = $columns['productos_unidad_medida_referencia']
          while (-not $parser.EndOfData) {
            $fields = $parser.ReadFields()
            if (-not $fields) { continue }
            $stats.rows++
            if ($fields.Length -le $codeIndex -or $fields[$eanIndex] -ne '1') { continue }
            $stats.eanRows++
            $code = $fields[$codeIndex].Trim()
            if ($code -notmatch '^\d{8,14}$') { continue }
            $name = if ($fields.Length -gt $nameIndex) { $fields[$nameIndex].Trim() } else { '' }
            $brand = if ($fields.Length -gt $brandIndex) { $fields[$brandIndex].Trim() } else { '' }
            $quantity = if ($fields.Length -gt $referenceQuantityIndex) { $fields[$referenceQuantityIndex].Trim() } else { '' }
            $unit = if ($fields.Length -gt $referenceUnitIndex) { $fields[$referenceUnitIndex].Trim() } else { '' }
            if (-not $quantity -or -not $unit -or $unit -match '(?i)^unidad(es)?$') {
              if ($name -match '(?i)(\d+(?:[.,]\d+)?\s*(?:ML|LTS?|LT|CC|GR?|KG|G|CM|MT|M))\b') { $quantity = $Matches[1]; $unit = '' }
              else { $quantity = ''; $unit = '' }
            }
            $text = "$brand $name"
            if ($text -notmatch $cleanPattern -and $text -notmatch $brandPattern) { continue }
            $stats.matchingRows++
            $category = 'Limpieza'
            if ($text -match '(?i)lavandina|lej[ií]a|cloro') { $category = 'Lavandina y cloro' }
            elseif ($text -match '(?i)deterg|magistral|ala|cif') { $category = 'Detergentes y limpiadores' }
            elseif ($text -match '(?i)ariel|skip|comfort|suavizante|jab[oó]n.*ropa') { $category = 'Lavado de ropa' }
            elseif ($text -match '(?i)trapo|rejilla|escoba|mopa|balde|esponja|virulana|fibra|cepillo|plumero|guante|bolsa') { $category = 'Accesorios de limpieza' }
            $candidate = [ordered]@{
              barcode = $code; name = $name; brand = $brand; quantity = (@($quantity, $unit) | Where-Object { $_ }) -join ' '
              category = $category; observations = 1
            }
            if (-not $products.ContainsKey($code)) { $products[$code] = $candidate }
            else {
              $old = $products[$code]
              $old.observations++
              if ($name.Length -gt $old.name.Length -and $name -notmatch '^\d+$') { $old.name = $name; $old.brand = $brand; $old.quantity = $candidate.quantity; $old.category = $category }
            }
          }
        } finally { $parser.Dispose(); $csvStream.Dispose() }
      } finally { $inner.Dispose(); Remove-Item -LiteralPath $nestedPath -Force -ErrorAction SilentlyContinue }
      if (($stats.nestedArchives % 10) -eq 0) { Write-Host "Procesados $($stats.nestedArchives)/$($nestedEntries.Count) comercios; $($products.Count) EAN únicos" }
    }
  } finally { $outer.Dispose() }

  $shards = @{}
  foreach ($product in $products.Values) {
    $shard = $product.barcode.Substring($product.barcode.Length - 2)
    if (-not $shards.ContainsKey($shard)) { $shards[$shard] = [System.Collections.Generic.List[object]]::new() }
    $shards[$shard].Add($product)
  }
  Get-ChildItem -LiteralPath $outputPath -Filter '*.json' -File -ErrorAction SilentlyContinue | Remove-Item -Force
  foreach ($shard in $shards.Keys) {
    $json = ConvertTo-Json -InputObject @($shards[$shard]) -Depth 5 -Compress
    [System.IO.File]::WriteAllText((Join-Path $outputPath "$shard.json"), $json, [System.Text.UTF8Encoding]::new($false))
  }
  $metadata = [ordered]@{
    source = 'SEPA / Precios Claros, datos.gob.ar';
    sourceUrl = 'https://datos.produccion.gob.ar/dataset/sepa-precios';
    snapshotDate = $snapshotDate;
    products = $products.Count; shards = $shards.Count; stats = $stats
    license = 'CC BY 4.0; atribuir a Precios Claros / Secretaría de Industria y Comercio.'
  }
  [System.IO.File]::WriteAllText((Join-Path $outputPath 'manifest.json'), (ConvertTo-Json $metadata -Depth 5), [System.Text.UTF8Encoding]::new($false))
  Write-Host (ConvertTo-Json $metadata -Depth 5)
} finally { Remove-Item -LiteralPath $workingPath -Recurse -Force -ErrorAction SilentlyContinue }
