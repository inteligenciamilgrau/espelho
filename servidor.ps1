# Servidor do jogo: MCP pela rede (Streamable HTTP), sem instalar nada.
#
#   http://localhost:8765/      a pagina do jogo (tem de ficar aberta num navegador)
#   http://localhost:8765/mcp   o endereco MCP que a iA usa
#
# O jogo roda no navegador. Este servidor so faz a ponte: cada botao que a iA aperta vira um
# comando para a pagina (/ponte), que aperta o mesmo botao em window.jogo e avisa quando acabou.
# A iA so fica sabendo quais botoes existem, nao o que fazem, e nao recebe o resultado de
# nenhum deles; so o botao do frame devolve algo (a imagem).
# A excecao e a vitoria: com o jogo vencido, os comandos passam a devolver os parabens.
#
# Tudo o que a iA le (nomes e descricoes das ferramentas, textos de resposta) esta em
# ferramentas.json. Este arquivo e ASCII puro de proposito: o PowerShell 5.1 le scripts
# sem BOM como ANSI e estragaria os acentos.

param(
  [int]$Porta = 8765,
  [switch]$SemNavegador      # nao abre a pagina do jogo sozinho
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object Text.UTF8Encoding $false
$pasta = $PSScriptRoot

$config = [IO.File]::ReadAllText((Join-Path $pasta 'ferramentas.json'), $utf8) | ConvertFrom-Json
$ferramentasJson = ConvertTo-Json -InputObject @($config.ferramentas) -Depth 20 -Compress

$VERSOES = '2025-06-18', '2025-03-26', '2024-11-05'      # versoes do protocolo MCP aceitas
$BOTOES = @(($config.ferramentas | Where-Object { $_.name -eq 'apertar_botao' }).inputSchema.properties.botao.enum)   # os botoes que existem
$ARQUIVOS = @{
  '/'                    = 'index.html', 'text/html; charset=utf-8'
  '/index.html'          = 'index.html', 'text/html; charset=utf-8'
  '/jogo.js'             = 'jogo.js', 'text/javascript; charset=utf-8'
  '/ponte.js'            = 'ponte.js', 'text/javascript; charset=utf-8'
  '/vendor/three.min.js' = 'vendor\three.min.js', 'text/javascript; charset=utf-8'
}
$HOSTS = "localhost:$Porta", "127.0.0.1:$Porta"      # os unicos nomes pelos quais o servidor atende
$LIMITE_CORPO = 8MB       # maior pedido aceito (um frame em PNG tem menos de 1 MB)
$ESPERA_COMANDO = 10      # segundos que uma chamada da iA espera a pagina executar
$ESPERA_SONDAGEM = 20     # segundos que a pagina fica pendurada esperando um comando

# ---------- estado ----------
$script:fila = New-Object System.Collections.Queue   # chamadas da iA ainda nao enviadas a pagina
$script:atual = $null       # chamada em andamento: ctx, rpcId, ferramenta, comando, argumentos, cmdId, enviado, prazo
$script:sondagem = $null    # pedido da pagina pendurado, esperando comando: ctx, desde
$script:dona = $null        # a aba do navegador que esta com o jogo: aba, desde (quando foi carregada)
$script:proximoId = 0

# ---------- respostas HTTP ----------
function Enviar($ctx, [int]$status, [string]$tipo, [byte[]]$bytes) {
  try {
    $r = $ctx.Response
    $r.StatusCode = $status
    $r.Headers['Cache-Control'] = 'no-store'
    if ($tipo) { $r.ContentType = $tipo }
    if ($bytes -and $bytes.Length) {
      $r.ContentLength64 = $bytes.Length
      $r.OutputStream.Write($bytes, 0, $bytes.Length)
    }
    $r.Close()
    return $true
  } catch { return $false }     # quem pediu ja foi embora
}
function EnviarJson($ctx, [int]$status, [string]$json) {
  return (Enviar $ctx $status 'application/json; charset=utf-8' ($utf8.GetBytes($json)))
}
# Le o corpo do pedido. Devolve $null se passar de $LIMITE_CORPO: sem esse teto, um pedido
# gigante encheria a memoria do servidor.
function LerCorpo($req) {
  if ($req.ContentLength64 -gt $LIMITE_CORPO) { return $null }
  $m = New-Object IO.MemoryStream
  $buf = New-Object byte[] 65536
  while (($lidos = $req.InputStream.Read($buf, 0, $buf.Length)) -gt 0) {
    $m.Write($buf, 0, $lidos)
    if ($m.Length -gt $LIMITE_CORPO) { return $null }
  }
  return , $m.ToArray()
}

# ---------- JSON-RPC ----------
function IdJson($id) {
  if ($null -eq $id) { return 'null' }
  if ($id -is [string]) { return (ConvertTo-Json -InputObject $id -Compress) }
  return [string]$id
}
function Resultado($id, [string]$resultadoJson) { return '{"jsonrpc":"2.0","id":' + (IdJson $id) + ',"result":' + $resultadoJson + '}' }
function Erro($id, [int]$codigo, [string]$mensagem) {
  return '{"jsonrpc":"2.0","id":' + (IdJson $id) + ',"error":{"code":' + $codigo + ',"message":' + (ConvertTo-Json -InputObject $mensagem -Compress) + '}}'
}
function Texto([string]$texto, [bool]$erro) {
  return '{"content":[{"type":"text","text":' + (ConvertTo-Json -InputObject $texto -Compress) + '}],"isError":' + $(if ($erro) { 'true' } else { 'false' }) + '}'
}
# Escreve uma linha na janela do servidor. O texto pode vir da iA, entao sai sem caracteres
# de controle (que poderiam mexer no terminal) e cortado em 100 caracteres.
function Registrar([string]$linha) {
  $linha = $linha -replace '[\x00-\x1f\x7f]', ' '
  if ($linha.Length -gt 100) { $linha = $linha.Substring(0, 100) + '...' }
  Write-Host ("{0}  {1}" -f (Get-Date -Format 'HH:mm:ss'), $linha)
}

# ---------- ponte com a pagina ----------
# Manda a proxima chamada da fila para a pagina, se ela estiver esperando.
function Despachar {
  if ($null -eq $script:atual -and $script:fila.Count -gt 0) {
    $script:atual = $script:fila.Dequeue()
    $script:proximoId++
    $script:atual.cmdId = $script:proximoId
    $script:atual.enviado = $false
    $script:atual.prazo = (Get-Date).AddSeconds($ESPERA_COMANDO)
  }
  if ($script:atual -and -not $script:atual.enviado -and $script:sondagem) {
    $json = ConvertTo-Json -InputObject @{ id = $script:atual.cmdId; comando = $script:atual.comando; args = @($script:atual.argumentos) } -Compress
    $ctx = $script:sondagem.ctx
    $script:sondagem = $null
    $script:atual.enviado = (EnviarJson $ctx 200 $json)
  }
}

# A pagina terminou o comando em andamento: agora sim a iA recebe a resposta.
function Concluir([byte[]]$corpo, [bool]$ganhou) {
  $a = $script:atual
  $script:atual = $null
  if ($a.ferramenta -eq 'comecar') {
    $r = Texto $config.respostaComecar $false
  } elseif ($corpo -and $corpo.Length) {      # o botao devolveu uma imagem (o frame)
    $r = '{"content":[{"type":"image","data":"' + [Convert]::ToBase64String($corpo) + '","mimeType":"image/png"}],"isError":false}'
  } elseif ($ganhou) {                        # jogo vencido: daqui em diante todo comando recebe os parabens
    if (-not $script:avisouVitoria) { Registrar 'a iA venceu o jogo'; $script:avisouVitoria = $true }
    $r = Texto $config.respostaVitoria $false
  } else {
    $script:avisouVitoria = $false
    $r = Texto $config.respostaComando $false
  }
  [void](EnviarJson $a.ctx 200 (Resultado $a.rpcId $r))
}

function TratarPonte($ctx) {
  $req = $ctx.Request

  # So uma aba joga por vez: a que foi carregada por ultimo. Cada aba diz quem e (aba) e
  # quando foi carregada (desde). Uma aba mais antiga que a dona atual recebe 409 e para --
  # assim uma aba esquecida em segundo plano, que se religa sozinha depois que o servidor
  # reinicia, nao rouba o jogo da aba nova que esta na frente do usuario.
  $aba = [string]$req.QueryString['aba']
  $desde = [long]0
  [void][long]::TryParse([string]$req.QueryString['desde'], [ref]$desde)
  if ($script:dona -and $aba -ne $script:dona.aba) {
    if ($desde -lt $script:dona.desde) { [void](Enviar $ctx 409 $null $null); return }
    if ($script:sondagem) { [void](Enviar $script:sondagem.ctx 409 $null $null); $script:sondagem = $null }   # avisa a antiga na hora
    $script:dona = $null
  }
  if (-not $script:dona) {
    $script:dona = @{ aba = $aba; desde = $desde }
    Registrar 'pagina do jogo ligada'
  }

  $corpo = LerCorpo $req
  if ($null -eq $corpo) { [void](Enviar $ctx 413 $null $null); return }
  $feito = $req.QueryString['id']
  if ($feito -and $script:atual -and $script:atual.enviado -and ([string]$script:atual.cmdId -eq $feito)) { Concluir $corpo ([bool]$req.QueryString['ganhou']) }
  if ($req.QueryString['fim']) { [void](Enviar $ctx 204 $null $null); Despachar; return }   # pedido rapido: nao fica pendurado
  if ($script:sondagem) { [void](Enviar $script:sondagem.ctx 204 $null $null) }               # pedido anterior da mesma aba
  $script:sondagem = @{ ctx = $ctx; desde = Get-Date }
  Despachar
}

# ---------- MCP ----------
function TratarMcp($ctx) {
  $req = $ctx.Request
  if ($req.HttpMethod -ne 'POST') {           # sem fluxo SSE: so POST com resposta JSON
    $ctx.Response.Headers['Allow'] = 'POST'
    [void](Enviar $ctx 405 $null $null)
    return
  }
  $corpo = LerCorpo $req
  if ($null -eq $corpo) { [void](Enviar $ctx 413 $null $null); return }
  try { $msg = $utf8.GetString($corpo) | ConvertFrom-Json } catch { $msg = $null }
  if ($null -eq $msg) { [void](EnviarJson $ctx 400 (Erro $null -32700 'Parse error')); return }
  if ($msg -is [array]) { [void](EnviarJson $ctx 400 (Erro $null -32600 'Lotes nao sao aceitos')); return }

  $temId = $msg.PSObject.Properties.Name -contains 'id'
  if (-not $temId -or -not $msg.method) { [void](Enviar $ctx 202 $null $null); return }      # notificacao ou resposta: nada a devolver
  $id = $msg.id

  switch -CaseSensitive ([string]$msg.method) {
    'initialize' {
      $v = [string]$msg.params.protocolVersion
      if ($VERSOES -cnotcontains $v) { $v = $VERSOES[0] }
      Registrar "iA conectou (MCP $v)"
      [void](EnviarJson $ctx 200 (Resultado $id ('{"protocolVersion":"' + $v + '","capabilities":{"tools":{}},"serverInfo":{"name":"jogo","version":"1.0.0"}}')))
    }
    'ping' { [void](EnviarJson $ctx 200 (Resultado $id '{}')) }
    'tools/list' { [void](EnviarJson $ctx 200 (Resultado $id ('{"tools":' + $ferramentasJson + '}'))) }
    'tools/call' {
      $nome = [string]$msg.params.name
      $a = $msg.params.arguments
      $comando = $nome
      $argumentos = @()
      $invalido = $null
      switch -CaseSensitive ($nome) {
        'comecar' { }
        'apertar_botao' {                       # a pagina e quem sabe o que cada botao faz
          $comando = 'apertar'
          $texto = [string]$a.texto
          if ($texto.Length -gt 10) { $texto = $texto.Substring(0, 10) }    # o mesmo limite que a ferramenta declara
          $argumentos = @([string]$a.botao, $texto)
          if ($BOTOES -cnotcontains $argumentos[0]) { $invalido = 'botao inexistente' }
        }
        default { [void](EnviarJson $ctx 200 (Erro $id -32602 "Ferramenta desconhecida: $nome")); return }
      }
      if ($invalido) { [void](EnviarJson $ctx 200 (Resultado $id (Texto $invalido $true))); return }
      Registrar ("{0} {1}" -f $nome, ($argumentos -join ' '))
      $script:fila.Enqueue(@{ ctx = $ctx; rpcId = $id; ferramenta = $nome; comando = $comando; argumentos = $argumentos })
      Despachar                               # a resposta sai em Concluir, quando a pagina avisar
    }
    default { [void](EnviarJson $ctx 200 (Erro $id -32601 'Method not found')) }
  }
}

# ---------- pedidos ----------
function Tratar($ctx) {
  $req = $ctx.Request
  $caminho = $req.Url.AbsolutePath

  # So atende a quem chamou este computador pelo nome certo. Um site de fora pode apontar o
  # proprio endereco para 127.0.0.1 (DNS rebinding) e fazer o navegador da vitima bater aqui;
  # nesse caso o pedido chega com o nome do site no Host, e e recusado.
  if ($HOSTS -notcontains $req.UserHostName) { [void](Enviar $ctx 403 $null $null); return }

  # So paginas deste computador podem falar com o servidor (protecao contra sites de fora).
  $origem = $req.Headers['Origin']
  if ($origem) {
    $ok = $false
    try { $ok = 'localhost', '127.0.0.1' -contains ([Uri]$origem).Host } catch { }
    if (-not $ok) { [void](Enviar $ctx 403 $null $null); return }
    $ctx.Response.Headers['Access-Control-Allow-Origin'] = $origem
    $ctx.Response.Headers['Access-Control-Allow-Headers'] = 'content-type, accept, authorization, mcp-protocol-version, mcp-session-id'
    $ctx.Response.Headers['Access-Control-Allow-Methods'] = 'POST, GET, OPTIONS'
  }
  if ($req.HttpMethod -eq 'OPTIONS') { [void](Enviar $ctx 204 $null $null); return }

  if ($caminho -eq '/mcp') { TratarMcp $ctx; return }
  if ($caminho -eq '/ponte' -and $req.HttpMethod -eq 'POST') { TratarPonte $ctx; return }
  $arq = $ARQUIVOS[$caminho]
  if ($arq -and $req.HttpMethod -eq 'GET') {
    [void](Enviar $ctx 200 $arq[1] ([IO.File]::ReadAllBytes((Join-Path $pasta $arq[0]))))
    return
  }
  [void](Enviar $ctx 404 $null $null)
}

# O que depende do relogio: pedidos pendurados ha tempo demais.
function Tique {
  $agora = Get-Date
  if ($script:sondagem -and ($agora - $script:sondagem.desde).TotalSeconds -gt $ESPERA_SONDAGEM) {
    $ctx = $script:sondagem.ctx
    $script:sondagem = $null
    [void](Enviar $ctx 204 $null $null)       # a pagina pede de novo em seguida
  }
  if ($script:atual -and $agora -gt $script:atual.prazo) {
    $a = $script:atual
    $script:atual = $null
    Registrar "sem resposta da pagina do jogo para '$($a.ferramenta)'"
    [void](EnviarJson $a.ctx 200 (Resultado $a.rpcId (Texto "sem resposta do jogo: a pagina http://localhost:$Porta/ precisa estar aberta" $true)))
    Despachar
  }
}

# ---------- inicio ----------
$ouvinte = New-Object System.Net.HttpListener
$ouvinte.Prefixes.Add("http://localhost:$Porta/")
$ouvinte.Prefixes.Add("http://127.0.0.1:$Porta/")
# Quem comeca um pedido e nao termina de mandar nao pode travar o servidor (ele atende um por vez).
$ouvinte.TimeoutManager.HeaderWait = [TimeSpan]::FromSeconds(10)
$ouvinte.TimeoutManager.EntityBody = [TimeSpan]::FromSeconds(10)
try { $ouvinte.Start() } catch {
  Write-Host "Nao consegui abrir a porta $Porta ($($_.Exception.Message)). Tente outra: servidor.ps1 -Porta 8766"
  exit 1
}

Write-Host ""
Write-Host "  Jogo:  http://localhost:$Porta/      (deixe esta pagina aberta no navegador)"
Write-Host "  MCP:   http://localhost:$Porta/mcp   (Streamable HTTP)"
Write-Host "  Ctrl+C encerra."
Write-Host ""
if (-not $SemNavegador) { Start-Process "http://localhost:$Porta/" }

try {
  $tarefa = $ouvinte.GetContextAsync()
  while ($true) {
    if ($tarefa.Wait(100)) {
      $ctx = $tarefa.Result
      $tarefa = $ouvinte.GetContextAsync()
      try { Tratar $ctx } catch {
        Registrar "erro: $($_.Exception.Message)"
        [void](Enviar $ctx 500 $null $null)
      }
    }
    Tique
  }
} finally {
  $ouvinte.Stop()
}
