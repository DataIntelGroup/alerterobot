# Teste les migrations sur une base PostgreSQL jetable (PostgreSQL 18 installé sur le poste).
# Usage : powershell -File scripts/test-sql.ps1
$ErrorActionPreference = 'Stop'
$bin = 'C:\Program Files\PostgreSQL\18\bin'
$racine = Split-Path $PSScriptRoot -Parent
$donnees = Join-Path $env:TEMP "alerterobot-pg-$(Get-Random)"
$port = 54329

& "$bin\initdb.exe" -D $donnees -U postgres -A trust -E UTF8 --locale=C | Out-Null
# Serveur lancé dans son propre processus caché : sous Windows, pg_ctl start
# transmet sa sortie au serveur, qui la garde ouverte, et l'appelant ne rend jamais la main.
Start-Process -FilePath "$bin\postgres.exe" -ArgumentList @("-D", "`"$donnees`"", "-p", "$port") -WindowStyle Hidden -RedirectStandardError "$donnees\journal.txt"
for ($i = 0; $i -lt 30; $i++) {
  & "$bin\pg_isready.exe" -h localhost -p $port -q
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Milliseconds 500
}
try {
  $psql = @("-h", "localhost", "-p", "$port", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q")
  & "$bin\createdb.exe" -h localhost -p $port -U postgres alerterobot
  & "$bin\psql.exe" @psql -d alerterobot -f "$racine\supabase\tests\prelude-local.sql"
  if ($LASTEXITCODE -ne 0) { throw "prélude" }
  Get-ChildItem "$racine\supabase\migrations\*.sql" | Sort-Object Name | ForEach-Object {
    & "$bin\psql.exe" @psql -d alerterobot -1 -f $_.FullName
    if ($LASTEXITCODE -ne 0) { throw "migration $($_.Name)" }
  }
  & "$bin\psql.exe" @psql -d alerterobot -f "$racine\supabase\tests\moteur.test.sql"
  if ($LASTEXITCODE -ne 0) {
    # Diagnostic facultatif : un fichier SQL passé en argument est exécuté sur la base en échec.
    if ($args.Count -gt 0) { & "$bin\psql.exe" -h localhost -p $port -U postgres -d alerterobot -f $args[0] }
    throw "tests"
  }
} finally {
  & "$bin\pg_ctl.exe" -D $donnees -m fast stop | Out-Null
  Remove-Item -Recurse -Force $donnees
}
