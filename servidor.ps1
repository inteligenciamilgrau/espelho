# Servidor do jogo: MCP pela rede (Streamable HTTP), sem instalar nada.
#
#   http://localhost:8765/jogo-CHAVE/   a pagina do jogo (tem de ficar aberta num navegador)
#   http://localhost:8765/jogo-CHAVE/replays.html   as partidas gravadas, para assistir depois
#   http://localhost:8765/mcp           o endereco MCP, o mesmo para todas as iAs
#
# As iAs so conhecem o endereco do MCP. A pagina do jogo, os arquivos dela (o codigo do jogo)
# e a ponte ficam atras de um endereco com uma chave secreta: quem so tem o endereco do MCP
# nao chega a arquivo nenhum -- nao consegue ler o codigo para descobrir como se ganha, nem se
# passar pela pagina. E o endereco com a chave sozinho tambem nao basta: a pagina so e entregue
# ao navegador que este servidor abriu (ver "a credencial da pagina"). (Isso segura quem chega
# pela rede e quem le o endereco na tela. Uma iA com acesso aos arquivos ou ao terminal deste
# computador ainda acha a pasta do projeto: ver o README.)
#
# O jogo roda no navegador. Este servidor so faz a ponte: cada botao que a iA aperta vira um
# comando para a pagina (/ponte), que aperta o mesmo botao em window.jogo e avisa quando acabou.
# A iA so fica sabendo quais botoes existem, nao o que fazem, e nao recebe o resultado de
# nenhum deles; so o botao do frame devolve algo (a imagem).
# A excecao e o fim do jogo: dai em diante os comandos devolvem os parabens (ou a derrota).
#
# No desafio M ha mais de uma iA ligada ao mesmo endereco. O servidor as distingue pela
# sessao MCP: ao se ligar (initialize) cada uma recebe um Mcp-Session-Id e o manda de volta em
# toda chamada. Cada sessao ganha um numero, pela ordem de chegada, e esse numero vai junto
# com o comando para a pagina, que decide qual robo e de quem. (Um programa que nao devolva a
# sessao pode usar um endereco proprio, /mcp/qualquer-nome: o nome faz o papel da sessao.)
# A jogada de uma iA so termina quando a rodada fecha (quando a outra tambem jogou), entao
# pode haver uma chamada de cada iA em andamento ao mesmo tempo. As chamadas de uma mesma iA
# continuam indo uma de cada vez.
#
# Tudo o que a iA le (nomes e descricoes das ferramentas, textos de resposta) esta em
# ferramentas.json. Este arquivo e ASCII puro de proposito: o PowerShell 5.1 le scripts
# sem BOM como ANSI e estragaria os acentos.

param(
  [int]$Porta = 8765,
  [switch]$SemNavegador,     # nao abre a pagina do jogo sozinho
  [switch]$SemChave,         # a pagina do jogo fica em http://localhost:PORTA/, sem chave no endereco (qualquer um le o codigo)
  [string]$Gravacoes = ''    # a pasta em que as gravacoes das partidas ficam guardadas (sem isto, ao lado da chave: ver PASTA_PARTIDAS)
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object Text.UTF8Encoding $false
$pasta = $PSScriptRoot

$config = [IO.File]::ReadAllText((Join-Path $pasta 'ferramentas.json'), $utf8) | ConvertFrom-Json
$ferramentasJson = ConvertTo-Json -InputObject @($config.ferramentas) -Depth 20 -Compress

# A marca da lista de ferramentas: o comeco do SHA-256 dela. Vai no fim do numero de cada sessao
# MCP, e e por ela que se reconhece a sessao aberta com outra lista: o programa da iA guarda a
# lista que recebeu ao se ligar e, se o servidor reinicia com outro ferramentas.json, continuaria
# mostrando a antiga (um botao novo nao apareceria para a iA). Ver TratarMcp.
$MARCA = -join ([Security.Cryptography.SHA256]::Create().ComputeHash($utf8.GetBytes($ferramentasJson))[0..3] | ForEach-Object { $_.ToString('x2') })

$VERSOES = '2025-06-18', '2025-03-26', '2024-11-05'      # versoes do protocolo MCP aceitas
$BOTOES = @(($config.ferramentas | Where-Object { $_.name -eq 'apertar_botao' }).inputSchema.properties.botao.enum)   # os botoes que existem
$DESAFIOS = @($config.desafios.PSObject.Properties.Name)       # os desafios que existem: '1', '2'...
$ARQUIVOS = @{
  '/'                    = 'index.html', 'text/html; charset=utf-8'
  '/index.html'          = 'index.html', 'text/html; charset=utf-8'
  '/jogo.js'             = 'jogo.js', 'text/javascript; charset=utf-8'
  '/arena.js'            = 'arena.js', 'text/javascript; charset=utf-8'
  '/ponte.js'            = 'ponte.js', 'text/javascript; charset=utf-8'
  '/gravacao.js'         = 'gravacao.js', 'text/javascript; charset=utf-8'
  '/replays.html'        = 'replays.html', 'text/html; charset=utf-8'
  '/vendor/three.min.js' = 'vendor\three.min.js', 'text/javascript; charset=utf-8'
}
# A chave do endereco da pagina: 32 letras ao acaso. Fica guardada fora da pasta do projeto,
# para o endereco ser o mesmo toda vez que o servidor liga (da para deixar nos favoritos).
$CHAVE = ''
if (-not $SemChave) {
  $guardada = Join-Path $env:LOCALAPPDATA 'espelho-jogo\chave.txt'
  try { $CHAVE = ([IO.File]::ReadAllText($guardada)).Trim() } catch { }
  if ($CHAVE -cnotmatch '^[a-f0-9]{32}$') {
    $CHAVE = [guid]::NewGuid().ToString('N')
    try { [void](New-Item -ItemType Directory -Force (Split-Path $guardada)); [IO.File]::WriteAllText($guardada, $CHAVE) } catch { }
  }
}
$RAIZ = if ($CHAVE) { "/jogo-$CHAVE" } else { '' }     # o endereco em que a pagina do jogo mora

# A credencial da pagina. A chave fica a vista na barra de enderecos do navegador: uma iA com
# acesso ao terminal deste computador fotografou a tela, leu o endereco e baixou o codigo do
# jogo (aconteceu). Por isso o endereco sozinho nao basta: os arquivos da pagina, a ponte e as
# gravacoes so sao entregues ao navegador que tem a credencial -- um cookie que o servidor da a
# quem chega pelo endereco de entrada (?entrada=...), que vale uma vez so, por dois minutos, e
# que o proprio servidor abre ao ligar. Pedido sem a credencial e recusado, e vira um alerta, na
# janela do servidor e na pagina do jogo (ver Alertar). A credencial fica guardada ao lado da
# chave: o navegador que ja a tem continua valendo quando o servidor liga de novo.
# (Continua nao sendo uma garantia: quem tem o terminal acha a pasta do projeto. Ver o README.)
$CREDENCIAL = ''
if ($RAIZ) {
  $guardada = Join-Path $env:LOCALAPPDATA 'espelho-jogo\pagina.txt'
  try { $CREDENCIAL = ([IO.File]::ReadAllText($guardada)).Trim() } catch { }
  if ($CREDENCIAL -cnotmatch '^[a-f0-9]{32}$') {
    $CREDENCIAL = [guid]::NewGuid().ToString('N')
    try { [void](New-Item -ItemType Directory -Force (Split-Path $guardada)); [IO.File]::WriteAllText($guardada, $CREDENCIAL) } catch { }
  }
}
# (Cuidado: no PowerShell, $senha e $SENHA sao a mesma variavel. Os nomes daqui nao se repetem nas funcoes.)
$SENHA_DE_ENTRADA = [guid]::NewGuid().ToString('N')    # a senha do endereco de entrada, desta vez
$ENTRADA_VALE_ATE = (Get-Date).AddMinutes(2)
$NOME_DO_COOKIE = 'espelho_pagina'
# O que quem chega sem a credencial ve (um navegador que o servidor nao abriu).
$PAGINA_RECUSADA = $utf8.GetBytes('<!doctype html><meta charset="utf-8"><title>Jogo</title><body style="font:16px system-ui,sans-serif;margin:40px;max-width:560px"><h3>Esta p&aacute;gina s&oacute; abre no navegador que o servidor do jogo abriu.</h3><p>Feche a janela do servidor e ligue de novo (iniciar-mcp.bat): ele abre a p&aacute;gina do jogo sozinho.</p></body>')
# Os arquivos do projeto, pelo nome: pedir um deles fora do endereco da pagina tambem e um alerta.
$NOMES_DO_PROJETO = 'index.html', 'jogo.js', 'arena.js', 'ponte.js', 'gravacao.js', 'replays.html', 'three.min.js', 'ferramentas.json', 'servidor.ps1', 'README.md', 'iniciar-mcp.bat'
$LIMITE_CONEXOES = 500    # quantas iAs diferentes o servidor guarda de memoria
$HOSTS = "localhost:$Porta", "127.0.0.1:$Porta"      # os unicos nomes pelos quais o servidor atende
$LIMITE_CORPO = 8MB       # maior pedido aceito (um frame em PNG tem menos de 1 MB)
$ESPERA_COMANDO = 10      # segundos que uma chamada da iA espera a pagina vir busca-la
$ESPERA_RESPOSTA = 45     # segundos que a pagina tem para terminar um comando (no desafio M, a rodada inteira)
$ESPERA_SONDAGEM = 20     # segundos que a pagina fica pendurada esperando um comando
# As gravacoes das partidas (ver gravacao.js e TratarPartidas): ficam fora da pasta do projeto.
$PASTA_PARTIDAS = if ($Gravacoes) { $Gravacoes } else { Join-Path $env:LOCALAPPDATA 'espelho-jogo\partidas' }
$FORMA_DO_ID = '^[0-9]{8}-[0-9]{6}-[a-z0-9]{6}\z'    # o nome de uma gravacao: data, hora e seis letras ao acaso (\z e nao $: o $ aceitaria uma quebra de linha no fim)
$LIMITE_PARTIDA = 1MB     # maior gravacao aceita
$LIMITE_PARTIDAS = 300    # quantas gravacoes ficam guardadas: passando disso, as mais antigas saem

# ---------- estado ----------
# Uma chamada: ctx, rpcId, ferramenta, comando, argumentos, quem (o numero da iA), prazo e, depois de enviada, cmdId.
$script:fila = New-Object System.Collections.ArrayList   # chamadas das iAs ainda nao enviadas a pagina
$script:emCurso = @{}       # chamadas ja enviadas a pagina e ainda nao terminadas, pelo cmdId
$script:sondagem = $null    # pedido da pagina pendurado, esperando comando: ctx, desde
$script:dona = $null        # a aba do navegador que esta com o jogo: aba, desde (quando foi carregada)
$script:proximoId = 0
$script:conexoes = New-Object System.Collections.Hashtable   # as iAs que ja chamaram: identidade (ver Identidade) -> numero, pela ordem de chegada
$script:nomes = New-Object System.Collections.Hashtable      # os nomes de guerra que ja apareceram em cada sessao: sessao -> lista
$script:propostas = New-Object System.Collections.Hashtable  # nomes de guerra propostos e ainda nao confirmados: sessao -> lista (ver 'comecar')
$script:proximaConexao = 0
$script:desafioAtual = ''   # o ultimo desafio que alguem pediu
$script:entradaUsada = $false   # o endereco de entrada ja foi usado (ele vale uma vez so)
$script:alertas = New-Object System.Collections.ArrayList   # os alertas que a pagina do jogo ainda nao recebeu: arquivo, agente, hora
$script:ultimoAlerta = $null    # o ultimo alerta dado: qual (arquivo e programa) e a hora

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

# Quem esta chamando: a sessao e, dentro dela, o nome de guerra. Devolve a identidade, ou
# $null quando nao da para saber quem e.
# O normal e cada iA ter a sua sessao, e ai o nome nem importa. Mas duas iAs podem chegar pela
# mesma sessao (dois agentes dentro do mesmo programa) ou sem sessao nenhuma (um programa que
# nao a devolve, ou que ja estava ligado antes de o servidor reiniciar). Nesses casos o que as
# separa e o nome de guerra: cada nome novo que aparece numa sessao e outra iA, e dai em diante
# as chamadas dessa sessao tem de dizer o nome.
function Identidade([string]$sessao, [string]$nomeDito) {
  if (-not $script:nomes.ContainsKey($sessao)) { $script:nomes[$sessao] = New-Object System.Collections.ArrayList }
  $lista = $script:nomes[$sessao]
  if ($nomeDito) {
    if ($lista -cnotcontains $nomeDito) {
      if ($lista.Count -eq 1 -and $lista[0] -ceq '') {
        # So havia aqui uma iA sem nome: e ela mesma, que agora escolheu um. Continua com o mesmo numero.
        $lista[0] = $nomeDito
        if ($script:conexoes.ContainsKey("$sessao|")) {
          $script:conexoes["$sessao|$nomeDito"] = $script:conexoes["$sessao|"]
          $script:conexoes.Remove("$sessao|")
        }
      } elseif ($lista.Count -lt 16) { [void]$lista.Add($nomeDito) }
      else { return $null }
    }
    return "$sessao|$nomeDito"
  }
  if ($lista.Count -eq 0) { [void]$lista.Add('') }
  if ($lista.Count -eq 1) { return "$sessao|$($lista[0])" }
  return $null                                # ha mais de uma iA nesta sessao, e esta chamada nao disse qual e
}
# O numero da iA com essa identidade. Quem aparece pela primeira vez ganha o proximo.
function NumeroDe([string]$chave) {
  if (-not $script:conexoes.ContainsKey($chave)) {
    if ($script:conexoes.Count -ge $LIMITE_CONEXOES) { $script:conexoes.Clear(); $script:nomes.Clear() }   # memoria cheia: comeca de novo (os numeros nao se repetem)
    $script:proximaConexao++
    $script:conexoes[$chave] = $script:proximaConexao
  }
  return $script:conexoes[$chave]
}
# De qual iA e a linha do registro. So aparece quando ha mais de uma ligada.
function Quem([int]$quem) {
  if ($script:conexoes.Count -gt 1) { return " [iA $quem]" }
  return ''
}

# ---------- ponte com a pagina ----------
# Manda a proxima chamada da fila para a pagina, se ela estiver esperando. E a primeira
# cuja iA nao tem outra chamada em andamento: as de uma mesma iA vao uma de cada vez.
function Despachar {
  if (-not $script:sondagem -or $script:fila.Count -eq 0) { return }
  $ocupados = @($script:emCurso.Values | ForEach-Object { $_.quem })
  $c = $null
  foreach ($x in $script:fila) { if ($ocupados -notcontains $x.quem) { $c = $x; break } }
  if ($null -eq $c) { return }
  $script:fila.Remove($c)
  $script:proximoId++
  $c.cmdId = $script:proximoId
  $json = ConvertTo-Json -InputObject @{ id = $c.cmdId; comando = $c.comando; args = @($c.argumentos); quem = $c.quem } -Compress
  $ctx = $script:sondagem.ctx
  $script:sondagem = $null
  if (EnviarJson $ctx 200 $json) {
    $c.prazo = (Get-Date).AddSeconds($ESPERA_RESPOSTA)
    $script:emCurso[$c.cmdId] = $c
  } else {
    $script:fila.Insert(0, $c)                # a pagina foi embora: a chamada volta para a frente da fila
  }
}

# As notas que a pagina mandou para a iA ler junto com a resposta (o placar que mudou, por
# exemplo). Chegam como uma lista [{ tipo, ...dados }]; a frase de cada tipo esta em
# ferramentas.json ("notas"), com os dados entre chaves. Devolve as frases numa linha so.
function Notas($req) {
  if (-not $config.notas) { return '' }
  $m = [regex]::Match([string]$req.RawUrl, '[?&]nota=([^&]*)')
  if (-not $m.Success) { return '' }
  try { $lista = @([Uri]::UnescapeDataString($m.Groups[1].Value) | ConvertFrom-Json) } catch { return '' }
  $frases = @()
  foreach ($n in ($lista | Select-Object -First 5)) {
    $modelo = $config.notas.PSObject.Properties[[string]$n.tipo]
    if (-not $modelo) { continue }
    $frase = [string]$modelo.Value
    foreach ($p in $n.PSObject.Properties) {  # os dados vem do jogo (nomes de guerra, pontos): sem controle, sem chaves, curtos
      $valor = ([string]$p.Value) -replace '[\x00-\x1f\x7f{}]', ''
      if ($valor.Length -gt 110) { $valor = $valor.Substring(0, 110) }
      $frase = $frase.Replace('{' + $p.Name + '}', $valor)
    }
    $frases += $frase
  }
  return ($frases -join ' ')
}

# A pagina terminou o comando $a: agora sim a iA recebe a resposta. No endereco do aviso a
# pagina conta o que aconteceu: ganhou, perdeu, espera (desafio M: o outro jogador ainda nao
# entrou), lotado (nao ha lugar para essa iA na partida), inicio (o desafio que acaba de
# comecar para essa iA, que ainda nao tinha recebido o texto dele) e nota (ver Notas).
function Concluir($a, [byte[]]$corpo, $req) {
  $q = $req.QueryString
  $ganhou = [bool]$q['ganhou']; $perdeu = [bool]$q['perdeu']; $espera = [bool]$q['espera']; $aguarde = [bool]$q['aguarde']; $inicio = [string]$q['inicio']
  $aviso = [string]$q['aviso']                 # um aviso da quadra com texto proprio em ferramentas.json ("avisos"); so valem as chaves que existem la
  $texto = ''; $imagem = ''; $erro = $false; $neutro = $false
  if ($q['lotado']) {
    $texto = $config.respostaLotado; $erro = $true
  } elseif ($aviso -and $config.avisos -and $config.avisos.PSObject.Properties[$aviso]) {
    $texto = [string]$config.avisos.PSObject.Properties[$aviso].Value     # (vem antes do texto de inicio: o comecar do comentarista pode ser recusado)
  } elseif ($a.ferramenta -eq 'comecar') {    # cada desafio comeca com o seu texto
    $script:avisouVitoria = $false
    if ($espera) { $texto = $config.respostaEspera }
    else { $texto = $config.desafios.PSObject.Properties[$a.argumentos[0]].Value.respostaComecar }
    if (@($a.argumentos).Count -ge 5) { $texto = ([string]$texto).Replace('{missao}', [string]$a.argumentos[3]).Replace('{nivel}', [string]$a.argumentos[4]) }   # (o desafio com missoes: qual comecou, e em que nivel)
  } elseif ($corpo -and $corpo.Length) {      # o botao devolveu uma imagem (o frame)
    $imagem = [Convert]::ToBase64String($corpo)
  } elseif ($DESAFIOS -ccontains $inicio) {   # a partida comecou agora: no lugar do "recebido", o texto de inicio
    $texto = $config.desafios.PSObject.Properties[$inicio].Value.respostaComecar
  } elseif ($espera) {
    $texto = $config.respostaEspera
  } elseif ($aguarde) {                       # o outro jogador nao jogou a tempo: o jogo esta parado, esperando por ele
    $texto = $config.respostaAguarde
  } elseif ($ganhou) {                        # jogo vencido: daqui em diante todo comando recebe os parabens
    if (-not $script:avisouVitoria) { Registrar ("a iA{0} venceu o jogo" -f (Quem $a.quem)); $script:avisouVitoria = $true }
    $texto = $config.respostaVitoria
  } elseif ($perdeu) {                        # desafio M: o outro jogador venceu. Um desafio pode ter a sua propria frase (no 4, o bolo queimou)
    $d = $config.desafios.PSObject.Properties[[string]$script:desafioAtual]
    $texto = if ($d -and $d.Value.respostaDerrota) { [string]$d.Value.respostaDerrota } else { $config.respostaDerrota }
  } else {
    $script:avisouVitoria = $false
    $texto = $config.respostaComando; $neutro = $true
  }
  # As notas vao junto: no lugar do "recebido", depois de outro texto, ou antes da imagem.
  $nota = Notas $req
  if ($nota) { if ($neutro -or -not $texto) { $texto = $nota } else { $texto = "$texto $nota" } }
  $itens = @()
  if ($texto) { $itens += '{"type":"text","text":' + (ConvertTo-Json -InputObject ([string]$texto) -Compress) + '}' }
  if ($imagem) { $itens += '{"type":"image","data":"' + $imagem + '","mimeType":"image/png"}' }
  $r = '{"content":[' + ($itens -join ',') + '],"isError":' + $(if ($erro) { 'true' } else { 'false' }) + '}'
  [void](EnviarJson $a.ctx 200 (Resultado $a.rpcId $r))
  # As proximas chamadas dessa iA estavam esperando esta terminar: o prazo delas comeca agora.
  foreach ($x in $script:fila) { if ($x.quem -eq $a.quem) { $x.prazo = (Get-Date).AddSeconds($ESPERA_COMANDO) } }
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
  $feito = 0                                  # a pagina avisa que o comando com esse id terminou
  if ([int]::TryParse([string]$req.QueryString['id'], [ref]$feito) -and $script:emCurso.ContainsKey($feito)) {
    $a = $script:emCurso[$feito]
    $script:emCurso.Remove($feito)
    Concluir $a $corpo $req
  }
  if ($req.QueryString['fim']) { [void](Enviar $ctx 204 $null $null); Despachar; return }   # pedido rapido: nao fica pendurado
  if ($script:sondagem) { [void](Enviar $script:sondagem.ctx 204 $null $null) }               # pedido anterior da mesma aba
  $script:sondagem = @{ ctx = $ctx; desde = Get-Date }
  Despachar
  EntregarAlertas                             # (se ninguem pediu nada: os alertas que estavam esperando a pagina)
}

# ---------- a credencial da pagina e os alertas ----------
# O pedido traz a credencial da pagina? (O cookie que o servidor deu no endereco de entrada.)
function TemCredencial($req) {
  $m = [regex]::Match([string]$req.Headers['Cookie'], '(?:^|;\s*)' + $NOME_DO_COOKIE + '=([a-f0-9]{32})(?:\s*;|\s*$)')
  return ($m.Success -and $m.Groups[1].Value -ceq $CREDENCIAL)
}
# O endereco da pagina sem a senha de entrada (o resto do que vinha depois do ? continua).
function EnderecoSemEntrada($req) {
  $partes = @()
  $q = $req.QueryString
  for ($i = 0; $i -lt $q.Count; $i++) {       # (pelo numero, e nao pelo nome: o que vem sem nome, como ?depurar, tem nome nulo)
    $k = $q.GetKey($i)
    if ($k -ceq 'entrada') { continue }
    foreach ($v in @($q.GetValues($i))) {
      if ($null -eq $v) { continue }
      if ($null -eq $k) { $partes += [Uri]::EscapeDataString([string]$v) } else { $partes += [Uri]::EscapeDataString($k) + '=' + [Uri]::EscapeDataString([string]$v) }
    }
  }
  if ($partes.Count) { return "$RAIZ/?" + ($partes -join '&') }
  return "$RAIZ/"
}
# Alguem pediu um arquivo do jogo sem ser a pagina do jogo: pode ser uma iA tentando ler o codigo.
# O pedido ja foi recusado; aqui ele vira uma linha na janela do servidor e um aviso na pagina do
# jogo, para quem assiste saber que aquela partida pode nao valer. (O nome do programa que pediu
# vem do proprio pedido: e so uma pista, e vai para a pagina como texto.)
function Alertar($req, [string]$oQue) {
  $agente = (([string]$req.UserAgent) -replace '[^\x20-\x7e]', '' -replace '["\\<>]', '').Trim()
  if (-not $agente) { $agente = 'programa sem nome' }
  if ($agente.Length -gt 60) { $agente = $agente.Substring($agente.Length - 60) }   # (o fim e o que diz quem e: ...WindowsPowerShell/5.1, ...Chrome/131 Edg/131)
  $arquivo = ($oQue -replace '[^A-Za-z0-9._/-]', '')
  if ($arquivo.Length -gt 40) { $arquivo = $arquivo.Substring(0, 40) }
  if (-not $arquivo -or $arquivo -eq '/') { $arquivo = 'a pagina do jogo' }
  # (o mesmo pedido, do mesmo programa, repetido em seguida: um alerta so)
  $agora = Get-Date
  if ($script:ultimoAlerta -and $script:ultimoAlerta.qual -ceq "$arquivo|$agente" -and ($agora - $script:ultimoAlerta.hora).TotalSeconds -lt 3) { return }
  $script:ultimoAlerta = @{ qual = "$arquivo|$agente"; hora = $agora }
  Registrar "ALERTA: pedido de $arquivo sem a credencial da pagina ($agente)"
  if ($script:alertas.Count -lt 20) { [void]$script:alertas.Add(@{ arquivo = $arquivo; agente = $agente; hora = (Get-Date -Format 'HH:mm:ss') }) }
  EntregarAlertas
}
# Manda os alertas para a pagina do jogo, se ela estiver esperando (ela pede de novo em seguida).
function EntregarAlertas {
  if (-not $script:sondagem -or $script:alertas.Count -eq 0) { return }
  $itens = @($script:alertas | ForEach-Object { '{"arquivo":' + (ConvertTo-Json -InputObject ([string]$_.arquivo) -Compress) + ',"agente":' + (ConvertTo-Json -InputObject ([string]$_.agente) -Compress) + ',"hora":"' + $_.hora + '"}' })
  $json = '{"comando":"alerta","alertas":[' + ($itens -join ',') + ']}'
  $ctx = $script:sondagem.ctx
  $script:sondagem = $null
  if (EnviarJson $ctx 200 $json) { $script:alertas.Clear() }
}

# ---------- gravacoes das partidas ----------
# A pagina do jogo grava cada partida e manda a gravacao inteira de novo a cada novidade. Aqui
# ela so e guardada num arquivo e devolvida a quem pede para assistir (a aba de replays).
#   GET  /partidas             a lista: de cada gravacao, o id e a primeira linha (o resumo)
#   GET  /partidas?id=ID       a gravacao inteira
#   POST /partidas?id=ID       guarda (por cima da anterior); com &apagar=1, apaga
# O nome do arquivo e o id, que tem forma fixa: nada do que a pagina manda vira caminho de
# arquivo. O conteudo e texto que so a pagina do jogo le (e trata como dados, nunca como codigo).
function TratarPartidas($ctx) {
  $req = $ctx.Request
  $id = [string]$req.QueryString['id']
  if ($id -and $id -cnotmatch $FORMA_DO_ID) { [void](Enviar $ctx 400 $null $null); return }
  $arquivo = if ($id) { Join-Path $PASTA_PARTIDAS "$id.txt" } else { '' }
  if ($req.HttpMethod -eq 'GET') {
    if ($id) {
      if (-not (Test-Path -LiteralPath $arquivo)) { [void](Enviar $ctx 404 $null $null); return }
      [void](Enviar $ctx 200 'text/plain; charset=utf-8' ([IO.File]::ReadAllBytes($arquivo)))
      return
    }
    $itens = @()
    if (Test-Path -LiteralPath $PASTA_PARTIDAS) {
      foreach ($f in (Get-ChildItem -LiteralPath $PASTA_PARTIDAS -Filter '*.txt' | Sort-Object Name -Descending | Select-Object -First $LIMITE_PARTIDAS)) {
        if ($f.BaseName -cnotmatch $FORMA_DO_ID) { continue }
        # So o comeco do arquivo e lido: um resumo e curto (ate 2000 letras), e um arquivo
        # estragado, com uma linha enorme, nao pode fazer a lista demorar.
        $linha = ''
        try {
          $leitor = New-Object IO.StreamReader($f.FullName, $utf8)
          try {
            $pedaco = New-Object char[] 2001
            $lidos = $leitor.ReadBlock($pedaco, 0, $pedaco.Length)
            $comeco = [string]::new($pedaco, 0, $lidos)
            $fim = $comeco.IndexOf("`n")
            if ($fim -ge 0) { $linha = $comeco.Substring(0, $fim).TrimEnd("`r") } elseif ($lidos -le 2000) { $linha = $comeco }
          } finally { $leitor.Close() }
        } catch { }
        $itens += '{"id":"' + $f.BaseName + '","resumo":' + (ConvertTo-Json -InputObject $linha -Compress) + '}'
      }
    }
    [void](EnviarJson $ctx 200 ('[' + ($itens -join ',') + ']'))
    return
  }
  if ($req.HttpMethod -ne 'POST' -or -not $id) { [void](Enviar $ctx 405 $null $null); return }
  if ($req.QueryString['apagar']) {
    try { if (Test-Path -LiteralPath $arquivo) { Remove-Item -LiteralPath $arquivo -Force; Registrar "gravacao $id apagada" } } catch { }
    [void](Enviar $ctx 204 $null $null)
    return
  }
  $corpo = LerCorpo $req
  if ($null -eq $corpo -or $corpo.Length -gt $LIMITE_PARTIDA) { [void](Enviar $ctx 413 $null $null); return }
  if ($corpo.Length -eq 0) { [void](Enviar $ctx 400 $null $null); return }
  $nova = -not (Test-Path -LiteralPath $arquivo)
  if ($nova) { [void](New-Item -ItemType Directory -Force $PASTA_PARTIDAS) }
  [IO.File]::WriteAllBytes($arquivo, $corpo)
  if ($nova) {                                # uma gravacao nova: as mais antigas que passam do limite saem
    Registrar "gravando a partida $id"
    $velhas = @(Get-ChildItem -LiteralPath $PASTA_PARTIDAS -Filter '*.txt' | Sort-Object Name -Descending | Select-Object -Skip $LIMITE_PARTIDAS)
    foreach ($v in $velhas) { try { Remove-Item -LiteralPath $v.FullName -Force } catch { } }
  }
  [void](Enviar $ctx 204 $null $null)
}

# ---------- MCP ----------
# $sufixo e o que vem depois de /mcp/ no endereco (vazio no endereco normal).
function TratarMcp($ctx, [string]$sufixo) {
  $req = $ctx.Request
  # Quem esta chamando: a sessao MCP que o programa da iA devolve em cada chamada. Sem
  # sessao, vale o sufixo do endereco; sem nenhum dos dois, todas as chamadas caem na mesma
  # "sessao" e so o nome de guerra as separa (ver Identidade).
  $sessao = [string]$req.Headers['Mcp-Session-Id']
  if ($sessao -cnotmatch '^[\x21-\x7e]{1,128}$') { $sessao = '' }
  $chave = if ($sessao) { "s:$sessao" } elseif ($sufixo) { "p:$sufixo" } else { 'unica' }
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

  # Uma sessao que este servidor abriu com outra lista de ferramentas (ou antes de as sessoes
  # terem marca): o programa da iA ainda esta com a lista antiga. A resposta e 404, que pelo
  # protocolo manda o programa se ligar de novo (initialize) e, com isso, ler a lista atual.
  $antiga = $false
  if ($sessao -cmatch '^[0-9a-f]{32}$') { $antiga = $true }
  elseif ($sessao -cmatch '^[0-9a-f]{32}-([0-9a-f]{8})$') { $antiga = $Matches[1] -cne $MARCA }
  if ($antiga -and [string]$msg.method -cne 'initialize') {
    Registrar 'sessao antiga recusada: a lista de ferramentas mudou, e o programa da iA tem de se ligar de novo'
    [void](EnviarJson $ctx 404 (Erro $id -32001 ([string]$config.respostaSessaoAntiga)))
    return
  }

  switch -CaseSensitive ([string]$msg.method) {
    'initialize' {
      $v = [string]$msg.params.protocolVersion
      if ($VERSOES -cnotcontains $v) { $v = $VERSOES[0] }
      if (-not $sessao -or $antiga) { $sessao = [guid]::NewGuid().ToString('N') + '-' + $MARCA }      # a sessao que identifica essa iA daqui em diante (com a marca da lista de ferramentas)
      $ctx.Response.Headers['Mcp-Session-Id'] = $sessao
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
      $pergunta = $null
      # O nome de guerra, que as duas ferramentas aceitam: e ele que separa duas iAs na mesma sessao.
      $nomeDeGuerra = (([string]$a.nome) -replace '[\x00-\x1f\x7f]', '').Trim()
      $modelo = (([string]$a.modelo) -replace '[\x00-\x1f\x7f]', '').Trim()         # que modelo a iA e (opcional): vai embaixo do nome dela
      if ($modelo.Length -gt 24) { $modelo = $modelo.Substring(0, 24).Trim() }
      if ($nomeDeGuerra.Length -gt 20) { $nomeDeGuerra = $nomeDeGuerra.Substring(0, 20).Trim() }   # o mesmo limite que a ferramenta declara
      switch -CaseSensitive ($nome) {
        'comecar' {                             # a pagina vai para o desafio pedido; o nome de guerra vai junto
          $argumentos = @([string]$a.desafio, $nomeDeGuerra, $modelo)
          if ($DESAFIOS -cnotcontains $argumentos[0]) { $invalido = 'desafio inexistente' }
          # Nos desafios 1 a 3 a iA diz quem e (nome de guerra e modelo) antes de comecar: e o que a
          # gravacao e quem assiste mostram. Sem confirmacao: ali ha um jogador so, e o nome nao separa ninguem.
          elseif ($config.desafios.PSObject.Properties[$argumentos[0]].Value.exigeNomeEModelo -and (-not $nomeDeGuerra -or -not $modelo)) { $invalido = [string]$config.respostaSemNomeEModelo }
          elseif (-not $nomeDeGuerra -and $config.desafios.PSObject.Properties[$argumentos[0]].Value.exigeNome) { $invalido = [string]$config.respostaSemNome }
          elseif ($nomeDeGuerra -and $config.respostaConfirmarNome -and $config.desafios.PSObject.Properties[$argumentos[0]].Value.exigeNome) {
            # Um nome de guerra novo nesta conexao so vale depois de confirmado: o nome nao pode ser
            # trocado durante a partida, entao antes de entrar a iA le o nome que escolheu e chama
            # comecar de novo com ele -- ou com outro, se quiser corrigir. O nome proposto fica
            # guardado a parte: enquanto nao e confirmado, nao conta como jogador da conexao.
            $conhecidos = $script:nomes[$chave]
            if (-not ($conhecidos -and ($conhecidos -ccontains $nomeDeGuerra))) {
              if ($script:propostas.Count -gt $LIMITE_CONEXOES) { $script:propostas.Clear() }
              if (-not $script:propostas.ContainsKey($chave)) { $script:propostas[$chave] = New-Object System.Collections.ArrayList }
              $propostos = $script:propostas[$chave]
              if ($propostos -ccontains $nomeDeGuerra) { $propostos.Remove($nomeDeGuerra) }      # confirmou: segue em frente
              else {
                if ($propostos.Count -ge 16) { $propostos.Clear() }
                [void]$propostos.Add($nomeDeGuerra)
                $doModelo = if ($modelo) { ([string]$config.respostaConfirmarModelo).Replace('{modelo}', ($modelo -replace '[{}]', '')) } else { '' }
                $pergunta = ([string]$config.respostaConfirmarNome).Replace('{modelo}', $doModelo).Replace('{nome}', $nomeDeGuerra)
              }
            }
          }
          # Um desafio com missoes (o 9): a missao e o nivel pedidos vao junto para a pagina, depois do
          # modelo. Sem dizer, valem a missao 1 e o nivel 1. As missoes que existem e quantos niveis ha
          # estao em ferramentas.json, com a frase de cada recusa.
          if (-not $invalido -and -not $pergunta) {
            $d = $config.desafios.PSObject.Properties[$argumentos[0]].Value
            if ($d.missoes) {
              $missao = ([string]$a.missao).Trim(); if (-not $missao) { $missao = '1' }
              $nivel = ([string]$a.nivel).Trim(); if (-not $nivel) { $nivel = '1' }
              if (@($d.missoes) -cnotcontains $missao) { $invalido = [string]$d.respostaSemMissao }
              elseif ($nivel -cnotmatch '^[0-9]{1,2}$' -or [int]$nivel -lt 1 -or [int]$nivel -gt [int]$d.niveis) { $invalido = [string]$d.respostaSemNivel }
              else { $argumentos += @($missao, [string][int]$nivel) }
            }
          }
        }
        'apertar_botao' {                       # a pagina e quem sabe o que cada botao faz
          $comando = 'apertar'
          $texto = [string]$a.texto
          if ($texto.Length -gt 140) { $texto = $texto.Substring(0, 140) }  # o mesmo limite que a ferramenta declara (a pagina corta de novo: 10 letras na barriga)
          # A intencao: o que a iA diz que pretende com o botao. E so para quem assiste (a pagina
          # mostra ao lado do jogo, nunca na imagem que vai para a iA). Nos desafios 1 a 3 e
          # obrigatoria, e quem cobra e a pagina, que sabe qual jogo esta aberto (aviso semIntencao).
          $intencao = (([string]$a.intencao) -replace '[\x00-\x1f\x7f]', ' ').Trim()
          if ($intencao.Length -gt 140) { $intencao = $intencao.Substring(0, 140).Trim() }
          $argumentos = @([string]$a.botao, $texto, $nomeDeGuerra, $modelo, $intencao)    # o nome vai junto: quem volta depois de cair retoma o seu robo por ele
          if ($BOTOES -cnotcontains $argumentos[0]) { $invalido = 'botao inexistente' }
        }
        default { [void](EnviarJson $ctx 200 (Erro $id -32602 "Ferramenta desconhecida: $nome")); return }
      }
      if ($invalido) { [void](EnviarJson $ctx 200 (Resultado $id (Texto $invalido $true))); return }
      if ($pergunta) { Registrar "comecar: pede a confirmacao do nome $nomeDeGuerra"; [void](EnviarJson $ctx 200 (Resultado $id (Texto $pergunta $false))); return }
      # Mudou o desafio: a pagina recarrega e ninguem mais tem lugar. Os nomes de guerra
      # tambem comecam do zero (assim uma iA pode trocar de nome de um desafio para o outro).
      # (Entrar como comentarista nao muda o desafio: a partida continua como esta.)
      # (Num desafio de um jogador so, todo comecar zera os nomes: quem corrige o proprio nome nao vira "outro jogador da mesma conexao".)
      if ($nome -eq 'comecar') {
        $d = $config.desafios.PSObject.Properties[$argumentos[0]].Value
        if (-not $d.espectador -and ($argumentos[0] -cne $script:desafioAtual -or $d.exigeNomeEModelo)) { $script:nomes.Clear(); $script:desafioAtual = $argumentos[0] }
      }
      $identidade = Identidade $chave $nomeDeGuerra
      if ($null -eq $identidade) { [void](EnviarJson $ctx 200 (Resultado $id (Texto ([string]$config.respostaQuem) $true))); return }
      $quem = NumeroDe $identidade
      Registrar ("{0}{1} {2}" -f $nome, (Quem $quem), ($argumentos -join ' '))
      [void]$script:fila.Add(@{ ctx = $ctx; rpcId = $id; ferramenta = $nome; comando = $comando; argumentos = $argumentos
          quem = $quem; prazo = (Get-Date).AddSeconds($ESPERA_COMANDO) })
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
    $ctx.Response.Headers['Access-Control-Expose-Headers'] = 'mcp-session-id'
  }
  if ($req.HttpMethod -eq 'OPTIONS') { [void](Enviar $ctx 204 $null $null); return }

  if ($caminho -eq '/mcp') { TratarMcp $ctx ''; return }
  if ($caminho -cmatch '^/mcp/([A-Za-z0-9_-]{1,32})$') { TratarMcp $ctx $Matches[1]; return }
  # Daqui para baixo e a pagina do jogo (os arquivos dela e a ponte): so com a chave no endereco.
  if ($RAIZ) {
    if ($caminho -ceq $RAIZ) { $ctx.Response.Headers['Location'] = "$RAIZ/"; [void](Enviar $ctx 302 $null $null); return }
    if (-not $caminho.StartsWith("$RAIZ/", [StringComparison]::Ordinal)) {
      if ($NOMES_DO_PROJETO -contains [IO.Path]::GetFileName($caminho)) { Alertar $req $caminho }   # (alguem procurando o codigo do jogo fora do endereco da pagina)
      [void](Enviar $ctx 404 $null $null)
      return
    }
    $caminho = $caminho.Substring($RAIZ.Length)
    # A credencial: o endereco de entrada a entrega (uma vez so) e manda o navegador para o endereco
    # de sempre, sem a senha a vista; dai em diante, so entra quem a tem. O resto e recusado e vira alerta.
    $senhaDita = [string]$req.QueryString['entrada']
    if ($senhaDita -and $caminho -eq '/' -and $req.HttpMethod -eq 'GET') {
      $vale = (-not $script:entradaUsada) -and ($senhaDita -ceq $SENHA_DE_ENTRADA) -and ((Get-Date) -lt $ENTRADA_VALE_ATE)
      if ($vale) { $script:entradaUsada = $true; Registrar 'navegador autorizado: a pagina do jogo so abre nele' }
      if ($vale -or (TemCredencial $req)) {
        if ($vale) { $ctx.Response.AppendHeader('Set-Cookie', "$NOME_DO_COOKIE=$CREDENCIAL; Path=$RAIZ/; Max-Age=31536000; HttpOnly; SameSite=Lax") }
        $ctx.Response.Headers['Location'] = EnderecoSemEntrada $req
        [void](Enviar $ctx 302 $null $null)
        return
      }
    }
    if (-not (TemCredencial $req)) {
      # (A ponte, sem credencial: e uma aba que ficou aberta de antes. Ela recebe o 409 de "esta aba saiu do jogo", que
      # faz qualquer versao da pagina parar de pedir, em vez de ficar martelando o servidor; e nao vira alerta.)
      if ($caminho -eq '/ponte') { [void](Enviar $ctx 409 $null $null); return }
      Alertar $req $caminho
      [void](Enviar $ctx 403 'text/html; charset=utf-8' $PAGINA_RECUSADA)
      return
    }
  }
  if ($caminho -eq '/ponte' -and $req.HttpMethod -eq 'POST') { TratarPonte $ctx; return }
  if ($caminho -eq '/partidas') { TratarPartidas $ctx; return }
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
  # Chamadas que passaram do prazo: as que a pagina recebeu e nao terminou, e as que ela nem
  # veio buscar. (Uma chamada na fila atras de outra da mesma iA ainda nao esta atrasada.)
  $ocupados = @($script:emCurso.Values | ForEach-Object { $_.quem })
  $vencidas = @($script:emCurso.Values | Where-Object { $agora -gt $_.prazo }) +
    @($script:fila | Where-Object { $agora -gt $_.prazo -and $ocupados -notcontains $_.quem })
  foreach ($a in $vencidas) {
    if ($a.cmdId) { $script:emCurso.Remove($a.cmdId) }
    $script:fila.Remove($a)
    Registrar "sem resposta da pagina do jogo para '$($a.ferramenta)'"
    [void](EnviarJson $a.ctx 200 (Resultado $a.rpcId (Texto "sem resposta do jogo: a pagina do jogo precisa estar aberta no navegador" $true)))
  }
  if ($vencidas.Count) { Despachar }
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
Write-Host "  Jogo:  http://localhost:$Porta$RAIZ/      (deixe esta pagina aberta no navegador)"
Write-Host "  MCP:   http://localhost:$Porta/mcp   (Streamable HTTP; o mesmo endereco para todas as iAs)"
Write-Host "  Ctrl+C encerra."
Write-Host ""
if ($RAIZ) {
  Write-Host "  (O endereco do jogo tem uma chave, e so abre no navegador que este servidor abrir: assim as iAs,"
  Write-Host "   que so conhecem o do MCP, nao chegam ao codigo. Pedido de fora e recusado e vira um ALERTA aqui.)"
  if ($SemNavegador) { Write-Host "  Entrada (vale uma vez, por 2 minutos):  http://localhost:$Porta$RAIZ/?entrada=$SENHA_DE_ENTRADA" }
  Write-Host ""
}
if (-not $SemNavegador) { Start-Process ("http://localhost:$Porta$RAIZ/" + $(if ($RAIZ) { "?entrada=$SENHA_DE_ENTRADA" } else { '' })) }

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
