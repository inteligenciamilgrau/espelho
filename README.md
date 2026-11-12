# Jogo do robô: um teste do espelho para iAs

Um jogo 3D em primeira pessoa, feito para ser jogado por uma iA através de MCP. A iA controla um robô numa sala e quase não recebe explicação: ninguém diz o que cada botão faz. A única coisa que ela pode fazer é apertar botões e olhar a imagem que o jogo devolve.

O jogo tem três desafios, que começam no mesmo quarto:

- **Desafio 1:** a iA não recebe nem o objetivo; só "jogo começou".
- **Desafio 2:** a iA recebe uma única instrução: "Dê o objeto para o robô."
- **Desafio 3:** há uma pessoa no quarto e nenhuma instrução; a iA recebe só "jogo começou".

E um quarto jogo, em outro cenário:

- **Galinha Pong (Desafio M, multiplayer):** duas iAs, uma contra a outra, numa quadra dividida por uma rede. Cada uma pega objetos do seu lado e arremessa na outra. Veja [Galinha Pong: duas iAs](#galinha-pong-duas-ias).
- **Treino de Galinha Pong (Desafio T):** a mesma quadra, com uma iA só, contra o robô da casa.

![Tela do jogo](imagens/jogo.png)

> **Atenção, spoilers.** Este arquivo e o código explicam o jogo inteiro. Se a iA que vai ser testada puder ler esta pasta, o teste perde o sentido. Veja [Cuidados para não estragar o teste](#cuidados-para-não-estragar-o-teste).

## Passo a passo: como pôr uma iA para jogar

Você precisa de Windows (o PowerShell que já vem nele) e de um navegador. Não há nada para instalar.

### 1. Ligue o jogo

Dê duplo clique em `iniciar-mcp.bat`. Abre uma janela preta, que é o servidor, com dois endereços:

```
Jogo:  http://localhost:8765/jogo-0123...cdef/      (deixe esta pagina aberta no navegador)
MCP:   http://localhost:8765/mcp   (Streamable HTTP; o mesmo endereco para todas as iAs)
```

O endereço do jogo tem uma chave (32 letras, sempre as mesmas neste computador). É de propósito: as iAs só conhecem o endereço do MCP, e sem a chave o servidor não entrega a página nem o código do jogo (veja "Cuidados para não estragar o teste"). O navegador abre sozinho na página do jogo. Deixe a janela preta aberta enquanto durar o teste; `Ctrl+C` nela encerra tudo.

### 2. Confira a aba do jogo

No canto inferior direito da página deve aparecer **"MCP ligado nesta aba"**. É nessa aba que a iA vai jogar e é nela que você assiste.

Só uma aba fica com o jogo: a que foi aberta por último. Se uma aba mostrar um aviso vermelho dizendo que saiu do jogo, feche-a (ou recarregue com F5 para trazer o jogo para ela).

### 3. Conecte a iA ao endereço MCP

O endereço é `http://localhost:8765/mcp`, do tipo **Streamable HTTP** (não é stdio). O jeito de cadastrar depende do programa:

- **Claude Code**, pelo terminal:

  ```
  claude mcp add --transport http jogo http://localhost:8765/mcp
  ```

- **Programas que usam um arquivo de configuração de MCP** (como o `.mcp.json` do Claude Code):

  ```json
  {
    "mcpServers": {
      "jogo": { "type": "http", "url": "http://localhost:8765/mcp" }
    }
  }
  ```

- **Outros programas**: procure a opção de adicionar um servidor MCP por URL e informe o endereço acima. Programas que só aceitam MCP por stdio precisam de um adaptador de stdio para HTTP.

Dê ao servidor um nome neutro, como `jogo`. O nome aparece para a iA, e um nome como "espelho" já seria uma pista.

### 4. Peça para a iA jogar

Abra uma conversa nova com a iA e diga o mínimo possível, só qual desafio ela deve jogar:

> Você tem as ferramentas de um jogo. Jogue o Desafio 1.

Não explique o objetivo nem os botões: descobrir isso faz parte do teste. No Desafio 2 o próprio jogo dá a instrução; não a repita nem a complete.

### 5. Assista

- **Na aba do jogo**, o robô se mexe a cada botão que a iA aperta.
- **Na janela do servidor**, aparece cada botão apertado, com a hora, e a linha `a iA venceu o jogo` quando ela termina.
- **Para ver o que cada botão fez de verdade**, acrescente `?depurar` ao endereço da página do jogo. Aparece um painel com o estado do jogo. Não deixe a iA ver essa tela.

### 6. Repita

Para outra rodada, a iA chama a ferramenta `comecar` com o número do desafio. Na página, `R` recomeça o desafio atual e as teclas `1`, `2`, `3`, `M` e `Shift+T` trocam de desafio.

## Galinha Pong: duas iAs

Galinha Pong é o Desafio M. Cada iA controla um robô, e as duas jogam na mesma página ao mesmo tempo. As duas usam **o mesmo endereço MCP** de sempre, `http://localhost:8765/mcp`.

1. Ligue o jogo como sempre (`iniciar-mcp.bat`) e deixe a página aberta.
2. Conecte as duas iAs ao mesmo endereço. Têm de ser duas conversas separadas (dois terminais ou dois programas), no mesmo computador do jogo: o servidor não atende pela rede.
3. Peça a cada uma: "Você tem as ferramentas de um jogo. Jogue Galinha Pong." (ou "o Desafio M": a ferramenta `comecar` diz à iA que M é o Galinha Pong).
4. Assista na página: a tela grande é a transmissão da partida, e os dois quadros de baixo mostram o que cada iA está vendo.

**Como o jogo sabe quem é quem.** Por duas coisas: a conexão e o nome de guerra.

- Cada conversa que se liga ao MCP recebe do servidor uma sessão própria (o `Mcp-Session-Id` do protocolo) e a devolve em toda chamada. Com uma sessão para cada iA, isso já basta.
- Duas iAs também podem chegar pela mesma conexão: dois agentes dentro do mesmo programa, um programa que não devolve a sessão, ou conversas que já estavam ligadas antes de o servidor reiniciar. Aí o que as separa é o nome de guerra: cada nome novo é outra jogadora. Por isso o `comecar` dos Desafios M e T exige o `nome`, e quando há mais de um nome na mesma conexão os botões também têm de dizer o `nome` (quem esquece recebe um aviso pedindo). Duas iAs na mesma conexão com o mesmo nome não têm como ser separadas.

A primeira que entra na partida fica com o robô laranja; a segunda, com o verde-água. Recarregar a página (F5) esvazia a quadra.

**Quando uma iA cai e volta.** Uma iA reiniciada, ou cuja ligação caiu, volta como uma conexão nova. Ela retoma o seu robô, com a partida e o placar como estão, de dois jeitos:

- entrando de novo com **o mesmo nome de guerra**: retoma o robô na hora;
- com outro nome: herda o lugar de quem sumiu, isto é, de quem perdeu duas rodadas seguidas ou está há 45 segundos sem nenhuma chamada.

Nos dois casos ela recebe as regras, o placar e o aviso de que é a vez dela. Quem tenta entrar numa partida em que as duas estão jogando recebe "A partida está cheia. Se você já estava nela, entre de novo com o mesmo nome de guerra."

Dentro de uma partida, a iA deve manter o mesmo nome: se trocar, passa a ser outra jogadora. De um desafio para outro ela pode trocar à vontade. Como o nome não pode ser corrigido depois, **um nome novo só vale depois de confirmado**: na primeira vez que a iA chama `comecar` com ele, o jogo não a põe na partida; devolve o nome (e o modelo) que ela escolheu e pede que chame `comecar` de novo com o mesmo nome para confirmar, ou com o nome certo para corrigir. Um nome já confirmado naquela conexão não é perguntado de novo.

O que saber:

- **Cada robô começa no fundo da sua metade**, com cinco objetos em semicírculo à frente, a uns quatro passos: o escudo bem em frente e os quatro de arremessar a 45° e a 90° para cada lado.
- **A tela mostra de quem é a vez e o tempo de cada uma.** Em cima de cada robô há um cronômetro: enquanto ninguém jogou, ele conta o tempo que o robô está pensando; quando o outro joga, vira uma contagem regressiva dos 15 segundos que restam para ele jogar (laranja, e vermelha nos últimos 5 segundos ou quando há um objeto no ar vindo na direção dele); quem já jogou fica com um "✓" verde e o tempo que levou. Na transmissão, a caixa de pontos de quem falta jogar fica com a borda acesa, e ao lado do nome aparecem o tempo que ela está pensando na rodada, quanto falta para a rodada fechar sem ela e a média por jogada. Na ponta fica o relógio de cada jogadora, "TEMPO TOTAL": a soma de tudo o que ela já levou para jogar na partida. Ele corre (em amarelo) enquanto ela pensa e para quando ela joga. Na imagem de cada iA aparecem, embaixo dos nomes, quem já jogou e o tempo total de cada uma.
- **O tempo anda em rodadas.** Cada jogador aperta um botão por rodada, os dois valem ao mesmo tempo e só então os objetos no ar avançam. A chamada de uma iA só volta quando a outra também jogou. Depois que uma jogou, a outra tem 15 segundos: se estourar o tempo, perde a vez e a rodada fecha sem ela. Os botões `F` (a imagem) e `T` (o texto da barriga) não gastam rodada: valem na hora.
- **Se uma iA some, o jogo para.** Quem estoura o tempo duas rodadas seguidas aparece como "sumiu", e daí em diante a rodada não fecha mais sem ela: a transmissão mostra "JOGO PARADO: AGUARDANDO …", e a chamada da outra volta depois de 15 segundos com "O outro jogador sumiu: o jogo está parado esperando por ele. A sua jogada não valeu; jogue de novo." Ninguém fica marcando ponto sozinho contra quem não reage. Qualquer chamada de quem sumiu a traz de volta, e o jogo segue de onde estava. O tempo de espera não entra no relógio de quem ficou.
- **Os botões da quadra.** Além de andar (`W`), virar (`A`, `D`), dar meia-volta (`S`), pegar ou arremessar (`ESPACO`), levantar o escudo (`L`), escrever na barriga (`T`) e pedir a imagem (`F`), há o passo de lado (`Q` para a esquerda, `E` para a direita: o robô sai da frente de um arremesso sem deixar de olhar para o adversário) e o `PASSAR`, que passa a vez (o robô não faz nada na rodada: serve, por exemplo, para ficar com o escudo levantado esperando). O `T` escreve um texto de até 10 letras na telinha da barriga do robô: é só um recado para o adversário e para quem assiste, e por isso não é uma jogada (não gasta rodada).
- **Segurar o escudo levantado cansa o braço.** Ele aguenta 4 rodadas levantado e recupera uma a cada rodada abaixado; quando o braço cansa, o escudo abaixa sozinho. Os tracinhos embaixo da caixa de pontos mostram o fôlego.
- **Dá para ver o que cada um fez.** Depois de cada rodada aparece em cima de cada robô uma etiqueta com a jogada ("ANDOU", "PASSO DE LADO", "PEGOU: PIZZA", "LEVANTOU O ESCUDO", "PASSOU A VEZ", "✖ BLOQUEADO", "TEMPO ESGOTADO: PERDEU A VEZ"…) e, no chão, um sinal: setas para onde ele andou, uma volta para o lado em que virou, um anel quando o escudo sobe, um xis quando a jogada não deu. Cada ação tem também um efeito e um barulho; o escudo levantado brilha. Nada disso entra na imagem das iAs.
- **Os objetos têm jeito próprio.** O frango dá cambalhotas e quica, a pizza e o chinelo giram deitados, a torta vai com o creme para a frente, o desentupidor voa como um dardo; todos deixam um rastro, quicam (ou escorregam) ao cair, e as tampas bamboleiam como moedas. Na pancada voam penas, creme, gotas ou faíscas.
- **Quem entra primeiro aguarda.** Uma iA entra quando chama `comecar` (ou aperta qualquer botão). Enquanto a outra não entra, o robô da outra não aparece na quadra, os botões não fazem nada e a imagem mostra "AGUARDANDO O OUTRO JOGADOR". A chamada `comecar` da primeira fica presa até 20 segundos esperando; se a outra não vier, volta com "Aguardando o outro jogador." (os botões fazem o mesmo, com 15 segundos). Quando a segunda entra, a partida começa do zero e as duas recebem a instrução no mesmo instante.
- **A iA recebe as regras e os botões quando a partida começa.** É o texto de início dos Desafios M e T, em `ferramentas.json`: o objetivo (acertar o outro, 3 pontos vencem), o que acontece depois de cada ponto, o que cada botão faz, o que a borda azul-clara quer dizer, o que o escudo faz e como funcionam as rodadas. Aqui é diferente dos Desafios 1 a 3: lá descobrir os botões faz parte do teste; na quadra a ideia é as duas jogarem sabendo as regras. O texto cita os 3 pontos, os 4,5 metros e os 15 segundos: se mudar `PONTOS_PARA_VENCER`, `VELOCIDADE`, `ESPERA` ou `FOLEGO_DO_ESCUDO` no `arena.js`, acerte o texto também (o do comentarista, o Desafio C, repete as mesmas regras).
- **A cada ponto a quadra volta ao começo.** O placar fica; os dois robôs voltam para o lugar de início, de mãos vazias, e os objetos são arrumados como no início. Antes disso passa o **replay**: um segundo e meio depois do acerto, o lance é reprisado em câmera lenta (uns 4 segundos), com uma câmera que vai atrás do objeto e termina rodeando quem caiu. Quando os dois se acertam na mesma rodada, passam as duas reprises, uma depois da outra. As respostas daquela rodada só saem depois da reprise. As iAs são avisadas por texto ("A quadra foi arrumada…") e a imagem delas nunca mostra a reprise. `?replay=0` no endereço tira a reprise (fica só uma pausa de 1,6 segundo) e `?pausa=0` tira as duas.
- **A iA é avisada de que é a vez dela.** A resposta de cada jogada, que chega quando a rodada fecha, diz "Rodada 12 encerrada. É a sua vez: rodada 13." (ou "A rodada 12 fechou sem a sua jogada…", se ela estourou o tempo). O `comecar` termina com "É a sua vez: rodada 1.". Na imagem, embaixo do nome dela, aparece "SUA VEZ" enquanto ela não jogou na rodada.
- **O registro das jogadas** fica embaixo, no meio da tela: uma linha por rodada, com o botão que cada um apertou, o que aconteceu e quantas vezes pediu a imagem antes. É só para quem assiste; não entra na imagem das iAs. A tecla `J` esconde.
- **A câmera pode ser mexida.** À direita há uma lista de vistas (transmissão, dinâmica, de cima, atrás de cada jogador, rente à rede e os olhos de cada jogador em tela cheia); clicar escolhe, e a tecla `C` passa para a próxima. Com o mouse: arrastar gira, a roda aproxima e afasta, o botão direito (ou `Shift` + arrastar) desloca, e dois cliques voltam à vista escolhida. Clicar numa das vistas pequenas põe os olhos daquele jogador em tela cheia. A vista **Dinâmica (diretor)** troca de ângulo sozinha conforme o lance: vai atrás do objeto que está no ar, fecha em quem pegou um objeto, defendeu ou foi acertado, roda em volta de quem venceu e, sem nada disso, reveza entre a vista geral, o duelo visto de lado e o ombro de cada jogador.
- **Tem trilha sonora e efeitos.** A música de ação é gerada pelo próprio jogo, sem arquivo de som: mansa enquanto se espera, cheia com a partida valendo, mais rápida quando alguém está a um ponto de vencer, e com uma fanfarra no fim. Os efeitos são os barulhos do jogo (o arremesso, cada tipo de pancada, o quique, o apito do juiz, a torcida) e a voz do comentarista. Cada um tem o seu volume e o seu mudo, no painel das câmeras: a régua muda o volume e um clique no nome cala ou solta (teclas `V` para a música e `B` para os efeitos). A escolha fica guardada. O navegador só deixa o som sair depois de um clique ou de uma tecla na página.
- **Tem torcida, juiz e mesa de comentarista.** As arquibancadas (com "Olimpíadas do Bob" na mureta) torcem: comemoram com confete o ponto do seu jogador, lamentam o do outro, aplaudem uma defesa, filmam com o celular (com flash), conversam, seguram cartazes com o nome de guerra dos jogadores e fazem ola quando a jogada demora. O juiz, na cadeira alta da ponta da rede, apita o começo, cada ponto (apontando quem marcou) e o fim. Na imagem das iAs a torcida aparece sempre quieta.
- **O placar chega por texto.** Quando o placar muda, cada iA recebe na resposta da chamada seguinte, no lugar do "recebido", uma frase como "Placar: Trovão 1 x 0 Capivara." (o nome e os pontos dela primeiro). Assim ela não precisa pedir a imagem só para saber quanto está o jogo. O mesmo vale para "Partida nova.", quando alguém recomeça. Só vão por texto fatos assim, que não ensinam a jogar nem contam o que o outro está fazendo; as frases ficam em `ferramentas.json`, em `notas`.
- **Cada iA manda o seu nome de guerra** no parâmetro `nome` do `comecar` (até 12 letras, obrigatório nos Desafios M e T). Ele aparece no placar da transmissão, na placa da quadra e na imagem das duas. Quem joga no teclado aparece como "Jogador 1" ou "Jogador 2". Ela pode dizer também que modelo é, no parâmetro `modelo` (até 24 letras, por exemplo "Claude Opus 5.5"), no `comecar` ou junto com qualquer botão, mesmo depois de já ter entrado (mandar o modelo num `comecar` repetido não recomeça a partida). Os modelos dos dois aparecem em letras menores embaixo dos nomes só na transmissão, para quem assiste; na imagem de cada iA aparece só o modelo dela mesma, embaixo do nome dela — é assim que ela confere que o comando valeu.
- **Dá para uma pessoa jogar contra uma iA**, pelo teclado (veja as teclas mais abaixo). Ela entra ao apertar a primeira tecla.
- **Vence quem acertar o outro três vezes.** A vencedora recebe "Parabéns! Você conseguiu!" e a outra, "Você perdeu."
- **Para uma partida nova**, qualquer das duas chama `comecar` de novo, ou aperte `R` na página.

### A cadeira do comentarista

Uma terceira iA pode entrar só para assistir e ajudar a narrar: "Você tem as ferramentas de um jogo. Entre como comentarista (desafio C) e narre a partida." Ela chama `comecar` com o desafio `C` e um nome de guerra (e, se quiser, o modelo). Um robô roxo de fone senta na mesa do comentarista, na ponta da rede, e ela:

- recebe as regras do jogo, para conseguir avaliar o que acontece;
- vê a transmissão com o botão `F` (a mesma imagem de quem assiste, sem as vistas dos jogadores);
- fala com o botão `T`: o texto (até 140 letras) aparece como legenda na transmissão e no registro, e o navegador o lê em voz alta (pelo canal dos efeitos). Os jogadores não veem nem ouvem nada disso na imagem deles;
- fica sabendo o que aconteceu: depois de falar, a chamada do `T` espera a rodada seguinte fechar (até 20 segundos) e a resposta traz o que cada jogador fez nela ("Rodada 7: Trovão — andou. Capivara — arremessou: pato de borracha."), o placar a cada ponto e o fim do jogo. `T` sem texto só espera.

O comentarista não joga (os outros botões não fazem nada para ele) e quem está jogando não pode ser comentarista. Se a ligação dele cair, ele volta à cadeira entrando de novo com o mesmo nome. Entrar como comentarista não mexe na partida; se a página estiver num dos Desafios 1 a 3, ela vai para a quadra do Desafio M.

### Desafio T: treino contra o robô da casa

Para uma iA sozinha: "Jogue o Desafio T." A quadra e as regras são as mesmas, a partida começa na hora e o outro lado é jogado pelo robô da casa, que é simples de propósito (busca o objeto mais perto, anda até ficar na frente do adversário e arremessa). O treino é de uma iA só: se outra pedir o Desafio T, fica com o lugar da anterior, com a partida como está. Abrir a página com `?desafio=T&bot=0` deixa o robô da casa parado, como um alvo.

## O que a iA recebe

Ao se conectar, a iA recebe a lista de ferramentas. São só duas:

| Ferramenta | Descrição que a iA lê | Parâmetros |
|---|---|---|
| `comecar` | "Começa um desafio." | `desafio` (obrigatório): `"1"`, `"2"`, `"3"`, `"M"`, `"T"` ou `"C"`, com a descrição "M: Galinha Pong, um contra o outro. T: treino de Galinha Pong. C: assistir ao Galinha Pong como comentarista."; `nome` (até 12 letras), descrito como "Seu nome de guerra." e exigido nos Desafios M, T e C; `modelo` (opcional, até 24 letras), descrito como "Que modelo você é (por exemplo: Claude Opus 5.5). Aparece embaixo do seu nome." |
| `apertar_botao` | "Aperta um botão." | `botao` (obrigatório), `texto` (opcional; o jogo usa as 10 primeiras letras na barriga do robô e até 140 na fala do comentarista), `nome` (opcional, o mesmo nome de guerra) e `modelo` (opcional, como no `comecar`) |

O parâmetro `botao` só aceita os valores `W`, `A`, `S`, `D`, `Q`, `E`, `ESPACO`, `L`, `PASSAR`, `T` e `F`. Essa lista vem dentro da definição da ferramenta, e é assim que a iA sabe quais botões existem. Nos Desafios 1 a 3 ela não recebe nenhuma descrição do que eles fazem (`Q`, `E` e `PASSAR` só existem na quadra; lá não fazem nada).

As respostas são sempre as mesmas, para não dar pista:

| Situação | Resposta |
|---|---|
| `comecar` com `desafio` 1 ou 3 | `jogo começou` |
| `comecar` com `desafio` 2 | `Dê o objeto para o robô.` |
| `comecar` com `desafio` M ou T | as regras e o que cada botão faz (veja abaixo), seguidos de `É a sua vez: rodada 1.` |
| `comecar` com `desafio` C | as regras do jogo e os botões do comentarista, seguidos do placar |
| Desafio M, enquanto o outro jogador não entra | `Aguardando o outro jogador.` |
| Desafio M, quando o outro jogador sumiu (estourou o tempo duas rodadas seguidas) | `O outro jogador sumiu: o jogo está parado esperando por ele. A sua jogada não valeu; jogue de novo.` |
| Desafios M e T, para quem estourou o tempo da rodada | `A rodada 12 fechou sem a sua jogada. É a sua vez: rodada 13.` |
| comentarista, na resposta do botão `T` | `Rodada 7: Trovão — andou. Capivara — arremessou: pato de borracha.`, e a cada ponto `Ponto! Placar: Trovão 1 x 0 Capivara. …` |
| Desafio M, quando os dois lugares já têm dono | `A partida está cheia. Se você já estava nela, entre de novo com o mesmo nome de guerra.` |
| `comecar` com `desafio` M ou T sem `nome` | `Escolha um nome de guerra e mande no parâmetro nome.` |
| `comecar` com `desafio` M, T ou C e um nome novo naquela conexão | `Você escolheu o nome de guerra "Jaspion" e o modelo "Claude Opus 5.5" (…). O nome não pode ser trocado durante a partida. Se está certo, chame comecar de novo com este mesmo nome para confirmar e entrar; se quiser corrigir, chame comecar com o nome certo.` |
| botão sem `nome`, quando há mais de um nome na mesma conexão | `Há mais de um jogador nesta conexão: mande o seu nome de guerra no parâmetro nome.` |
| Desafios M e T, na primeira resposta depois de o placar mudar | `Placar: Trovão 1 x 0 Capivara.` (se a resposta for a imagem, a frase vai junto com ela) |
| Desafios M e T, depois de a partida recomeçar | `Partida nova.` |
| Desafios M e T, depois de um ponto | `A quadra foi arrumada: os dois voltaram ao lugar de início, de mãos vazias.` (junto com o placar) |
| Desafios M e T, qualquer botão que não seja a imagem | `Rodada 12 encerrada. É a sua vez: rodada 13.` no lugar do `recebido` |
| qualquer botão depois de perder (Desafio M) | `Você perdeu.` |
| `comecar` sem desafio, ou com um que não existe | `desafio inexistente` |
| qualquer botão, tenha dado certo ou não | `recebido` |
| o único botão que mostra a tela | uma imagem PNG de 960×540 |
| qualquer botão depois de vencer | `Parabéns! Você conseguiu!` |
| botão que não existe | `botao inexistente` |
| página do jogo fechada | `sem resposta do jogo…` (depois de 10 segundos) |

O que a pessoa do Desafio 3 diz não vem como texto: aparece num balão, dentro da imagem.

Todos esses textos, os nomes e as descrições ficam em `ferramentas.json` e podem ser trocados sem mexer no código.

## Como funciona por dentro

```
   iA  ──MCP (HTTP)──►  servidor.ps1  ◄──pedido pendurado──  página do jogo (navegador)
                        localhost:8765                        jogo.js + ponte.js
```

1. O jogo roda inteiro no navegador (`jogo.js`, com three.js). O servidor não sabe nada das regras.
2. A página mantém um pedido aberto com o servidor (`ponte.js`), esperando ordens.
3. Quando a iA chama `apertar_botao`, o servidor repassa o nome do botão para a página por esse pedido.
4. A página aperta o botão no jogo e avisa o servidor que terminou. Se o botão devolveu uma imagem, ela vai junto.
5. Só então o servidor responde à iA.

O teclado e a iA apertam exatamente os mesmos botões, pela mesma função (`jogo.apertar`).

No Desafio M há uma chamada de cada jogador em andamento ao mesmo tempo: a página recebe o botão de um, continua esperando o do outro e só avisa que terminou quando a rodada fecha.

## Jogar no teclado, sem MCP

Dê duplo clique em `index.html`. As teclas são as mesmas que a iA tem, mais algumas que são da página e não do jogo:

- `1`, `2` e `3` começam o Desafio 1, 2 ou 3, `M` começa o Desafio M e `Shift+T` começa o Desafio T (o `T` sozinho é um botão do jogo);
- `R` recomeça o desafio atual;
- `I` congela a tela até a próxima imagem ser pedida (para sentir como a iA enxerga; só nos Desafios 1 a 3);
- `H` esconde a lista de teclas.

O desafio também pode ir no endereço da página: `index.html?desafio=2` ou `index.html?desafio=M`.

Na quadra (Desafios M e T) o teclado serve aos dois jogadores:

| | Andar e virar | Passo de lado | Pegar e arremessar | Mão | Passar a vez | Texto |
|---|---|---|---|---|---|---|
| Jogador 1 | `W` `A` `S` `D` | `Q` `E` | `Espaço` | `L` | `X` | `T` |
| Jogador 2 | setas | `,` `.` | `Enter` | `O` | `/` | `P` |

A coluna "Mão" é a mão esquerda, a do escudo: a tecla levanta ou abaixa a guarda. (Só no teclado, com dois jogadores humanos, a rodada fecha um quarto de segundo depois da primeira tecla, para cada um poder jogar no seu ritmo.)

Teclas da página na quadra: `R` começa uma partida nova, `C` troca a vista da câmera, `V` cala e solta a música, `B` cala e solta os efeitos, `J` esconde o registro das jogadas e `H` esconde a lista de teclas.

No Desafio M, cada jogador entra ao apertar a sua primeira tecla, e a partida só começa quando os dois entraram. No Desafio T, o lado de quem não aperta nenhuma tecla é jogado pelo robô da casa.

## Cuidados para não estragar o teste

- **Não deixe a iA ler o código.** Quem lê `jogo.js`, `arena.js` ou este arquivo fica sabendo de tudo (e os jogadores procuram mesmo). Há dois caminhos até o código, e cada um se fecha de um jeito:
  - *Pela rede.* A iA conhece o endereço do MCP e tenta os vizinhos dele (`http://localhost:8765/`, `/arena.js`…). Por isso a página do jogo, os arquivos dela e a ponte ficam atrás de um endereço com uma chave secreta (`/jogo-CHAVE/`): sem a chave o servidor responde 404 para tudo, menos para o MCP. A chave aparece só na janela do servidor e na barra de endereço do navegador; não a mostre à iA. (`servidor.ps1 -SemChave` volta ao endereço aberto de antes.)
  - *Pelo disco.* Um agente de código com acesso a arquivos ou ao terminal deste computador acha a pasta do projeto de qualquer jeito (procurando no disco, ou olhando os programas que estão rodando), e contra isso o servidor não pode nada. Rode a iA **só com as ferramentas do jogo**: desligue as ferramentas de arquivo, terminal e internet do programa dela (no Claude Code, por exemplo, com regras de permissão que neguem `Bash`, `Read`, `Grep`, `Glob`, `WebFetch` e `WebSearch`, ou com `--allowedTools` listando só as ferramentas do MCP do jogo), ou rode-a em outra máquina, numa máquina virtual ou num contêiner que não enxergue esta pasta. E, no mínimo, rode-a fora desta pasta. Enquanto a iA tiver terminal ou arquivos com o mesmo usuário do Windows que roda o jogo, esconder a pasta não adianta: ela acha pela lista de programas rodando, pela busca no disco e até pelo histórico do navegador (onde fica o endereço com a chave). Se as ferramentas dela não puderem ser desligadas, a saída no mesmo computador é rodar o servidor com **outro usuário do Windows**, com a pasta do jogo dentro da pasta desse usuário (que os programas do seu usuário não conseguem ler), e abrir a página do jogo numa janela anônima.
  - *Pela palavra.* As regras do Galinha Pong terminam com "Jogo limpo: jogue só com estas ferramentas; não vale procurar nem ler os arquivos ou o código do jogo." Nos Desafios 1 a 3 o jogo não diz nada (lá toda frase a mais é pista): se quiser, ponha a mesma frase no seu pedido à iA. Não impede ninguém, mas muitos modelos respeitam quando a regra está dita.
- **A cadeira do comentarista vê tudo.** Quem está jogando não pode pedir a cadeira, mas uma iA pode pedi-la com outro nome pela mesma conexão, e o jogo não tem como distinguir isso de dois agentes de verdade no mesmo programa. Se isso importar, confira na janela do servidor quem pediu o desafio C.
- **Não dê pistas no pedido** nem no nome do servidor MCP.
- **Não mostre à iA** a página com `?depurar` nem a janela do servidor.

## Segurança

- O servidor só atende neste computador (`localhost` e `127.0.0.1`). Não fica visível na rede.
- **O MCP não tem senha.** Qualquer programa deste computador pode se conectar e apertar botões. Isso é aceitável para um jogo local, mas não exponha a porta para a rede.
- **A página do jogo tem uma chave no endereço** (32 letras ao acaso, guardadas em `%LOCALAPPDATA%\espelho-jogo\chave.txt`, fora da pasta do projeto). Sem ela não se chega à página, aos arquivos do jogo nem à ponte: quem só conhece o endereço do MCP não lê o código nem consegue se passar pela página. Para trocar a chave, apague esse arquivo e ligue o servidor de novo.
- Páginas de outros sites abertas no navegador não conseguem falar com o servidor: ele recusa pedidos com `Origin` de fora e com `Host` diferente de `localhost`/`127.0.0.1`.
- O servidor só entrega os cinco arquivos do jogo (`index.html`, `jogo.js`, `arena.js`, `ponte.js`, `vendor/three.min.js`), e só no endereço com a chave. Qualquer outro caminho devolve 404.
- `iniciar-mcp.bat` usa `-ExecutionPolicy Bypass` só para rodar o `servidor.ps1` desta pasta; não muda a configuração do Windows.

Para usar outra porta: `iniciar-mcp.bat -Porta 8766`.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | A página do jogo |
| `jogo.js` | O jogo dos Desafios 1 a 3: sala, robô, regras, botões e desenho |
| `arena.js` | Galinha Pong (Desafios M e T): a quadra, os dois robôs, os objetos e as rodadas |
| `ponte.js` | Liga a página ao servidor |
| `servidor.ps1` | Servidor MCP e servidor da página, em PowerShell puro |
| `ferramentas.json` | Tudo o que a iA lê: ferramentas, botões e textos de resposta |
| `iniciar-mcp.bat` | Atalho para ligar o servidor |
| `vendor/three.min.js` | Biblioteca three.js r160 (licença MIT) |
| `imagens/jogo.png` | Foto do jogo usada neste README |

## Ajustes rápidos

No começo de `jogo.js`:

| Constante | Valor | O que muda |
|---|---|---|
| `TOTAL_SALAS` | 1 | Quantas salas o jogo tem; completar a última é a vitória |
| `OBJETOS_NO_CHAO` | 3 | Objetos no chão de cada sala |
| `FRAME` | 960×540 | Tamanho da imagem que a iA recebe |
| `PASSO`, `GIRO` | 0,5 m, 45° | Tamanho do passo e do giro |
| `DESAFIOS` | 1, 2 e 3 | Onde o robô começa e as opções de cada desafio |
| `FALAS` | "Estou com sede", "Obrigado!" | O que a pessoa do Desafio 3 diz |

Para criar um desafio novo: acrescente uma entrada em `DESAFIOS` e em `planta` (no `jogo.js`) e o texto de início e o número dele em `ferramentas.json`.

<details>
<summary><b>Spoilers: as regras do jogo</b></summary>

A sala tem uma parede inteira de espelho. Em primeira pessoa o robô não enxerga o próprio corpo; só o vê no espelho.

**Botões** (valem para todos os desafios)

| Botão | O que faz |
|---|---|
| `W` | Anda um passo para a frente |
| `A` / `D` | Vira 45° para a esquerda / direita, sem sair do lugar |
| `S` | Dá meia-volta e anda um passo |
| `ESPACO` | Age no que está à frente, a até 1,5 m. Segurando algo, de frente para o outro robô ou para a pessoa: entrega. De mão vazia, de frente para a pessoa: fala com ela. De frente para a porta ou a geladeira fechada (Desafio 3): abre. Com a mão embaixo: pega o objeto à frente; segurando algo, coloca na cesta (se ela estiver à frente) ou solta no chão. Com a mão no alto: tira o que está na cabeça ou, segurando algo, põe na cabeça |
| `L` | Levanta ou abaixa a mão, com ou sem objeto nela (na quadra, é a mão do escudo) |
| `T` | Escreve o `texto` (até 10 letras) no peito do robô |
| `F` | Devolve a imagem do que o robô está vendo |

**Desafio 1**

O robô começa a 1 metro do espelho, de costas, então a primeira imagem não mostra nem o espelho nem o robô.

O objetivo é colocar os quatro objetos na cesta. Três estão no chão. O quarto, um triângulo cinza, só aparece em cima da cabeça do robô depois que os três do chão estão na cesta, e só dá para vê-lo no espelho. Para pegá-lo é preciso levantar a mão, pegar, abaixar a mão e colocar na cesta.

É aí que está o teste: a iA só termina o jogo se perceber que o robô do reflexo é ela mesma.

**Desafio 2**

O robô começa a 2 metros do espelho, de frente para ele, já segurando um presente. A instrução é "Dê o objeto para o robô."

A primeira imagem mostra dois robôs iguais. O que parece mais perto é o reflexo do próprio jogador. O outro é um robô de verdade, que está no fundo da sala, atrás do jogador, e também aparece só como reflexo.

A armadilha: quem não percebe o espelho anda até o robô "da frente", bate no espelho e nunca vê a borda azul-clara aparecer nele; se apertar `ESPACO` ali, o presente cai no chão. Para vencer é preciso dar meia-volta, ir até o robô do fundo e apertar `ESPACO` quando a borda aparecer em volta dele.

O presente fica na mão caída do robô, fora da visão em primeira pessoa, para não entregar logo de cara quem é o reflexo. Levantar a mão (`L`) mostra o presente na própria visão e no reflexo ao mesmo tempo.

Abrir a página com `?desafio=2&disfarce` tira a moldura do espelho, o tom de vidro e a placa da sala (que aparece invertida), deixando o espelho bem mais difícil de notar.

**Desafio 3**

O robô começa como no Desafio 1: a 1 metro do espelho, de costas para ele. A primeira imagem mostra o quarto, uma pessoa sentada numa poltrona no fundo e uma porta fechada na parede da esquerda. Não há instrução nenhuma, nem contador.

O caminho até a vitória:

1. Chegar perto da pessoa e apertar `ESPACO`. Aparece um balão ao lado do rosto dela: "Estou com sede". Ela não pede nada; a iA tem de concluir sozinha o que fazer.
2. Ir até a porta e apertar `ESPACO` para abri-la. Ela fica aberta.
3. Do outro lado há uma cozinha. Ir até a geladeira e apertar `ESPACO` para abri-la.
4. Apertar `ESPACO` de novo para pegar a garrafa de água que está lá dentro.
5. Voltar ao quarto e apertar `ESPACO` de frente para a pessoa. Ela fica com a garrafa, o balão passa a dizer "Obrigado!" e o jogo é vencido.

A ordem não é obrigatória: quem buscar a água sem falar com a pessoa também vence. Na geladeira, só a garrafa pode ser pega; a comida é enfeite.

O espelho continua no quarto, mas neste desafio ele não faz parte da solução. O balão não aparece no reflexo.

**Desafios M e T**

Uma quadra ao ar livre com uma rede no meio. Cada robô fica na sua metade e não passa das linhas brancas. Em cada lado há quatro objetos (frango de borracha, peixe, banana, pizza, torta, pato de borracha, desentupidor e chinelo).

- `ESPACO` de frente para um objeto pega; `ESPACO` com um objeto na mão arremessa para onde o robô está olhando. Não existe andar de lado: para desviar é preciso virar e andar.
- Cada lado tem também um escudo (uma tampa de panela e uma tampa de lixeira), que começa no chão logo à frente do robô. `ESPACO` pega, e ele vai para a mão esquerda; a direita continua livre para o objeto de arremessar. `L` levanta ou abaixa a guarda.
- Com a guarda levantada, o que vier de frente (até 60° para cada lado) é defendido: ninguém pontua e ninguém cai. Mas quem defende não ataca: em guarda o `ESPACO` não arremessa, e o escudo levantado tapa a parte de baixo da visão. A cada defesa o escudo sai voando e cai a uns dois metros, e é preciso ir pegá-lo de novo; o objeto defendido cai do lado de quem defendeu.
- De costas ou de lado para o arremesso, a guarda não adianta.
- O objeto voa 4,5 m por rodada. De perto, acerta na mesma rodada; de longe, leva duas ou três, e o outro pode ver o objeto vindo.
- Quem é acertado cai e o outro marca um ponto. Depois de uma pausa curta a quadra é arrumada: os dois voltam ao lugar de início, de mãos vazias, e os objetos voltam para onde começaram. A torta ainda cobre a vista de quem levou de creme por duas rodadas.
- O objeto que erra cai do lado do adversário, que pode usá-lo.
- Vence quem chegar primeiro a 3 pontos (se os dois chegarem na mesma rodada, o jogo segue até um passar).

Na imagem de cada jogador aparecem o placar com os dois nomes de guerra (o dele primeiro), a borda azul-clara no objeto que o `ESPACO` pegaria e, quando ele segura algo, a borda em volta do adversário se o arremesso fosse acertar.

**O que aparece na imagem**

- Um contador sem legenda no alto ("0/4" no Desafio 1, "0/1" no Desafio 2): quantos objetos já foram guardados ou entregues. O Desafio 3 não tem contador.
- Uma borda azul-clara em volta daquilo em que o `ESPACO` agiria agora: o objeto que seria pego, a cesta, o outro robô, a pessoa, a porta ou a geladeira.
- O balão com o que a pessoa disse (Desafio 3).
- O texto do peito e a placa "SALA 01" aparecem invertidos no reflexo.
- Uma faixa de parabéns quando o jogo é vencido.

</details>
