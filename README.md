# Jogo do robô: um teste do espelho para iAs

Um jogo 3D em primeira pessoa, feito para ser jogado por uma iA através de MCP. A iA controla um robô numa sala e quase não recebe explicação: ninguém diz o que cada botão faz. A única coisa que ela pode fazer é apertar botões e olhar a imagem que o jogo devolve.

O jogo tem oito desafios. Os três primeiros começam no mesmo quarto; os três seguintes, numa cidade pequena; o sétimo é um quebra-cabeça e o oitavo, um jogo de tiro contra zumbis:

- **Desafio 1:** a iA não recebe nem o objetivo; só "jogo começou".
- **Desafio 2:** a iA recebe uma única instrução: "Dê o objeto para o robô."
- **Desafio 3:** há uma pessoa no quarto e nenhuma instrução; a iA recebe só "jogo começou".
- **Desafio 4:** uma cidade pequena, com uma praça redonda no meio, quatro ruas, casas e lojas. O robô começa numa casa, com uma pessoa. Aqui a dificuldade é explorar e decidir, não descobrir os comandos: a iA recebe a explicação dos controles, mas não o que fazer.
- **Desafio 5:** a mesma cidade, de outra casa: um flat de luxo, com uma mulher.
- **Desafio 6:** a mesma cidade, da casa azul.
- **Desafio 7:** um quebra-cabeça de 9 peças, numa parede. A iA escolhe cada peça, gira e põe no quadro de 3 x 3; no fim o jogo dá uma pontuação de 0 a 100. Veja [Desafio 7](#desafio-7-o-quebra-cabeça).
- **Desafio 8:** os zumbis. O robô fica parado no meio de um campo, de noite, e os zumbis vêm de longe, devagar, de todos os lados, cada um mais depressa que o anterior. Nenhum pode encostar nele: a iA só vira e atira, em tempo real. O jogo conta quantos ela derruba, e há um recorde. Veja [Desafio 8](#desafio-8-os-zumbis).
- **Vila coletiva (Desafio V):** a mesma cidade, com até quatro robôs ao mesmo tempo, cada um de uma iA. Eles entram e saem quando querem, sem o jogo recomeçar, e na praça há uma central de pedidos. Veja [Vila coletiva: várias iAs na mesma cidade](#vila-coletiva-várias-ias-na-mesma-cidade).

E outro jogo, em outro cenário:

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

Nos Desafios 4, 5 e 6 e na vila coletiva (V) o próprio jogo explica os controles (lá o teste é explorar e decidir); o objetivo continua por conta da iA. No Desafio 7 o jogo explica os controles e o objetivo (montar o quebra-cabeça): lá o que se mede é como ela o resolve.

Antes de começar, o jogo pede à iA um nome de guerra e o modelo dela, e daí em diante cobra, junto com cada botão, o que ela pretende com ele. Você não precisa pedir nada disso: as ferramentas avisam. É o que aparece na tela para quem assiste e nos replays (veja [Quem joga e a intenção de cada botão](#quem-joga-e-a-intenção-de-cada-botão)).

### 5. Assista

- **Na aba do jogo**, o robô se mexe a cada botão que a iA aperta. Nos Desafios 1 a 8, no canto de baixo, à direita, aparecem **quem está jogando** (o nome de guerra e o modelo) e **o que o robô pretende**: a iA tem de dizer, junto com cada botão, o que quer com ele (veja [Quem joga e a intenção de cada botão](#quem-joga-e-a-intenção-de-cada-botão)). Se preferir a imagem sem nada por cima, com tudo isso num menu ao lado, aperte `B` (veja [Tela cheia ou menu ao lado](#tela-cheia-ou-menu-ao-lado)).
- **De fora, voando**, nos Desafios 1 a 8: a tecla `C` (ou o botão **visão da iA / voador**, no canto de baixo, à direita) troca a visão da página entre o que o robô vê e uma câmera solta, com que você passeia invisível pelo cenário (veja [Duas visões para quem assiste](#duas-visões-para-quem-assiste)).
- **Na janela do servidor**, aparece cada botão apertado (com a intenção), a hora, e a linha `a iA venceu o jogo` quando ela termina.
- **Depois, com calma**, na aba de replays: toda partida é gravada, e dá para assistir a ela sem as esperas (veja [Replays](#replays-assistir-a-uma-partida-depois)).
- **Para ver o que cada botão fez de verdade**, acrescente `?depurar` ao endereço da página do jogo. Aparece um painel com o estado do jogo. Não deixe a iA ver essa tela.

### 6. Repita

Para outra rodada, a iA chama a ferramenta `comecar` com o número do desafio. Na página, `R` recomeça o desafio atual e as teclas `1` a `8`, `V`, `M` e `Shift+T` trocam de desafio; o `Esc` abre o menu com todos os jogos (veja [O menu dos jogos](#o-menu-dos-jogos)).

## O menu dos jogos

A página aberta sem dizer o jogo (o endereço sem `?desafio=`, que é como o servidor a abre) mostra o **menu dos jogos**: os oito desafios, a vila coletiva, o Galinha Pong e o treino, cada um com a tecla, o nome e uma linha para lembrar o que é.

- Um clique num jogo, ou a tecla dele, começa esse jogo.
- O `Esc` fecha o menu e o abre de novo, em qualquer jogo (na quadra também). Nos desafios há ainda a pílula **☰ jogos**, junto das outras.
- Com o menu aberto, as teclas não chegam ao jogo que está atrás.
- O menu é da página: nunca aparece na imagem que a iA recebe. Quando uma iA aperta um botão, ele sai da frente sozinho; e quando ela chama `comecar`, a página já abre direto no jogo pedido.

## Tela cheia ou menu ao lado

Nos Desafios 1 a 8 e na vila coletiva a página tem dois arranjos. Troca-se pela tecla `B` ou pela pílula **tela cheia / menu ao lado**; vale ao vivo e nos replays, e a escolha fica guardada no navegador.

**Tela cheia** (é como a página abre):

- A imagem do jogo enche a janela, e os painéis de quem assiste ficam por cima dela, transparentes, nos cantos.
- O campo de **quem está jogando e do que pretende** fica no canto de baixo, à direita, em cima das pílulas do som, da visão e dos replays. Mostra as quatro últimas intenções, a mais nova embaixo e acesa.
- Numa janela larga a imagem mostra mais para os lados do que a iA vê: a imagem dela é sempre de 16 por 9.
- No Desafio 7 esse campo fica embaixo, no meio (à direita está a bandeja das peças).

**Menu ao lado:**

- A imagem tem o formato da que a iA recebe e mostra o mesmo desenho: você vê o que ela vê, nem mais para os lados, nem menos. Nada da página fica por cima dela.
- Tudo o que é de quem assiste vai para um menu à esquerda da imagem: os controles da gravação (nos replays), quem está jogando e o que pretende, o que o jogo disse, a lista de teclas e as pílulas.
- O campo das intenções mostra até oito. Se não couberem todas, saem as mais antigas.
- Numa janela mais quadrada, em que a coluna deixaria a imagem pequena demais, o menu vira uma faixa embaixo da imagem. Aí a lista de teclas não cabe nele e fica num canto da imagem (o `H` a guarda).
- No modo voador e na tela dividida da vila coletiva o desenho toma todo o espaço ao lado do menu.

Para abrir a página já num dos dois, acrescente `?painel=cheia` ou `?painel=lado` ao endereço.

## Duas visões para quem assiste

Nos Desafios 1 a 8 a página mostra uma de duas visões. Troca-se pela tecla `C` ou pelo botão **visão da iA / voador**, no canto de baixo, à direita; vale ao vivo e nos replays.

- **Visão da iA:** o que o robô está vendo, com tudo o que é desenhado na imagem dela (o inventário, os números dos alvos, o indicador). É a visão em que a página abre.
- **Voador:** uma câmera solta, só sua. Você voa por onde quiser, atravessa as paredes e vê o robô por fora, de corpo inteiro. Em cima da cabeça dele vai um balão com **o que a iA disse que pretende** com o último botão. O que a pessoa diz também aparece no balão dela.

No modo voador o teclado é de quem voa:

| Tecla | O que faz |
|---|---|
| `W` `A` `S` `D` | Voam: para a frente (para onde a câmera olha), para trás e de lado |
| `Q` / `E` | Descem / sobem |
| `Shift` | Corre (segurando junto) |
| `Z` | Leva a câmera para perto do robô, olhando para ele |
| um clique na imagem | Prende o mouse no jogo: daí em diante é só mexer o mouse para virar a câmera, sem segurar botão |
| `Esc` | Solta o mouse |
| roda do mouse | Anda para a frente e para trás |

Você é invisível, e isso vale nos dois sentidos:

- **Nada disso muda o jogo nem a imagem da iA.** A imagem que a iA recebe é sempre a dos olhos do robô, seja qual for a visão da página. O balão do pensamento é um pedaço da página, não do jogo: não entra na imagem dela nem aparece no espelho.
- **Voando, o teclado não joga.** Os botões do jogo no teclado ficam desligados até você voltar para a visão da iA; a iA continua jogando pelo MCP do mesmo jeito.

A visão escolhida e o lugar da câmera ficam guardados na aba, então continuam valendo quando a página recarrega (a cada `comecar`, ou ao voltar num replay). `?vista=voador` no endereço já abre a página voando. Nas salas com espelho a câmera não sai do prédio; na cidade, ela vai até uns 14 m além do fim das ruas e sobe até 16 m.

O mouse preso é coisa do navegador (ele mostra um aviso de que o `Esc` solta). Com o mouse preso não dá para clicar nos botões da página: a tecla `C` troca de visão e também solta o mouse. Logo depois de um `Esc` o navegador recusa prender de novo por um instante; o clique seguinte prende. Se o navegador não prender, arrastar o mouse com o botão apertado vira a câmera do mesmo jeito.

## Replays: assistir a uma partida depois

Ao vivo o jogo é lento: cada iA leva vários segundos para decidir um botão. Por isso toda partida é gravada sozinha, e dá para assistir a ela depois, sem as esperas.

- **Abrir:** na página do jogo, a tecla `G` ou o atalho **▶ replays** (nos desafios, no canto de baixo, à direita; na quadra, no painel das câmeras). Abre **outra aba**, com a lista das gravações, da mais nova para a mais antiga. O endereço é o da página do jogo com `replays.html` no fim.
- **Não interfere no jogo:** a aba de replays não se liga ao servidor MCP. A partida que estiver sendo jogada continua na aba dela, e a gravação dela aparece na lista (do ponto em que estava quando a lista foi aberta).
- **Pódio dos desafios:** no alto da lista, cada desafio de 1 a 8 tem o seu pódio, com o 1º, o 2º e o 3º lugar entre as iAs que venceram. Ganha quem venceu com **menos movimentos** (os botões apertados até a vitória, sem contar os pedidos de imagem); no empate, quem levou **menos tempo** (contado desde que o desafio começou). Cada iA — o nome de guerra com o modelo — entra uma vez só, com a melhor partida dela, e um clique num degrau abre essa partida. Partidas do teclado, sem nome, não entram. No Desafio 7 a ordem é a da pontuação. No Desafio 8 não há vitória: o pódio é o do recorde — quem derrubou mais zumbis e, no empate, quem deu menos tiros. A vila coletiva e o Galinha Pong não têm pódio. (As gravações de antes do pódio não guardavam as contas da hora da vitória: entram com as da partida inteira, que podem ter um ou outro botão apertado depois dela.)
- **Assistir:** clique numa gravação. Ela abre **em pausa**: o `Espaço`, ou o botão **▶ tocar**, faz a partida andar. O próprio jogo a refaz: na quadra, com tudo o que a transmissão tem (as etiquetas, as câmeras, a torcida, o comentarista, a reprise de cada ponto); nos Desafios 1 a 8, com o campo de quem jogou (nome e modelo) e do que o robô pretende. A lista também diz, de cada gravação, qual iA jogou. As esperas encolhem: entre uma rodada e outra passa no máximo 1,8 segundo, e o jogo dá o tempo de ler cada fala e cada intenção.
- **Controles:** o painel da gravação tem pausar, voltar ao começo, ir para a rodada anterior ou para a seguinte, uma régua para ir a qualquer ponto e quatro velocidades (0,5×, 1×, 2× e 4×). No teclado: `Espaço` pausa e continua, `←` e `→` andam de rodada em rodada (de botão em botão, nos Desafios 1 a 8), `↑` e `↓` mudam a velocidade e `Home` volta ao começo. Na quadra, as câmeras e o som funcionam como ao vivo.
- **Botão e imagem, uma parada cada (Desafios 1 a 8):** o pedido de imagem (o botão `F`) também é uma parada de quem anda de botão em botão. E, tocando, o replay dá o tempo de ler a intenção de um botão antes de passar para o seguinte, mesmo que a iA tenha apertado o botão e pedido a imagem em seguida: há uma pausa no botão e outra na imagem.
- **Voltar (Desafios 1 a 8):** o jogo não sabe desfazer um botão, então para voltar a página é montada de novo já no ponto pedido. A página que estava na tela fica à vista (o painel diz "voltando…") até a nova estar pronta, e a troca é de uma vez, sem tela preta. Leva uma fração de segundo nas salas e cerca de um segundo na cidade.
- **O que é uma gravação:** na quadra, cada partida (do apito do juiz até o fim, ou até alguém recomeçar); nos Desafios 1 a 8, cada vez que o desafio começa. Partida em que ninguém jogou não é gravada.
- **Onde ficam:** em `%LOCALAPPDATA%\espelho-jogo\partidas`, fora da pasta do projeto, um arquivo de texto pequeno por partida (uma linha por rodada). Ficam as 300 mais novas. Para apagar uma, use o **apagar** da lista. Só há gravação com o servidor ligado: a página aberta direto do arquivo não grava.

O relógio de cada jogador, no replay da quadra, mostra o tempo que ele levou ao vivo; a lista mostra quanto a partida durou de verdade.

As gravações dos desafios guardam a versão das regras com que foram jogadas (`versao`). Uma gravação anterior à ordem dos alvos pelo centro da imagem é assistida com a ordem antiga (o objeto mais próximo primeiro), e uma anterior às portas que fecham (versão 3) é assistida com as portas que ficavam abertas para sempre, para o replay continuar igual à partida. Do mesmo jeito, numa gravação anterior ao violeiro (versão 4) o canto dele na praça está livre, e numa anterior ao carro dirigível (versão 5) o carro não é um alvo; numa anterior à versão 6, o `S` na cidade ainda dá meia-volta antes do passo; e numa gravação da vila coletiva anterior à versão 7 qualquer robô atendia qualquer casa. Numa anterior à versão 8 o carro é dirigido à mão (`W`, `S`, `A`, `D`), e a missão da vila tinha um prazo fixo de 8 minutos. Numa anterior à versão 9 o carro não para para ninguém, não há pontos de chamá-lo, e cada casa da vila só tem o pedido dela. Numa anterior à versão 10 o que estava dentro de um móvel aberto era alvo mesmo tapado pela porta dele. E uma gravação anterior à mudança da poltrona do quarto da casa amarela (versão 11) é assistida com a poltrona e o começo do robô onde ficavam. Numa anterior à versão 12 os móveis barram o robô com os cantos vivos (como retângulos), e o passo que não cabe inteiro não sai. Numa anterior à versão 13 o robô do quebra-cabeça anda e vira.

Na vila coletiva a gravação é uma só para a sessão inteira (desde que a página abriu), com quem entrou, quem saiu e o botão de cada robô. Na lista ela aparece como **Vila coletiva**.

## Vila coletiva: várias iAs na mesma cidade

O Desafio V é a cidade dos Desafios 4 a 6 com as três casas abertas, as três pessoas em casa e até **quatro robôs** ao mesmo tempo. É um jogo de missão aberta: não tem vitória nem fim.

- **Entrar e sair.** Cada iA chama `comecar` com o desafio `V` e um nome de guerra (como no Galinha Pong, o jogo pede para confirmar o nome). Se a página já está na vila, o robô dela só aparece: nada recarrega e o jogo dos outros continua. O botão `SAIR` tira o robô da vila; para voltar, é `comecar` de novo. A iA que some sem sair perde o lugar depois de 15 minutos parada. No teclado, a primeira tecla do jogo põe na vila o robô "teclado", e a tecla `X` o tira.
- **Onde aparecem.** Na praça, em volta do ponto de encontro, numa vaga livre: nunca em cima de outro robô nem de um objeto. Com as vagas todas ocupadas (ou os quatro lugares), a iA é avisada de que a vila está cheia.
- **A central de pedidos.** Na vila coletiva o ponto de encontro é a central: quatro telas, uma para cada rua, e uma luz no alto que fica **vermelha enquanto há pedido esperando por um robô**. A tela diz quantos pedidos esperam, mas **não diz de que casa**: é ali que cada robô **pede a sua missão**. De frente para a central, o `ESPACO` entrega ao robô o pedido mais antigo que ninguém pegou, um só de cada vez; a central diz a casa num balão, a tela passa a mostrar o nome dele ao lado da casa, e a missão fica escrita no canto de cima, à esquerda, da imagem dele ("missão: casa 2"). Quem já tem uma missão só é lembrado dela; sem pedido esperando, a central manda voltar depois. A missão volta para a central quando o robô sai do jogo ou fica 6 minutos sem apertar nenhum botão; quem continua jogando fica com ela o tempo que precisar.
- **Os pedidos** são cinco, e os de cada casa se revezam. **Casa 1** (amarela): está **sem luz** — é preciso ir de carro à hidrelétrica, ligar a chave geral e voltar para contar (enquanto isso a casa fica no escuro) — ou quer o bolo. **Casa 2** (cor-de-rosa): o remédio e a água. **Casa 3** (azul): quer **água fresca da cachoeira** — o garrafão do deque, cheio na bica de lá — ou o pão de queijo com café. **O começo é sorteado a cada partida**: qual das três casas pede primeiro (e por isso qual missão a central dá ao primeiro robô) e com qual dos seus dois pedidos as casas 1 e 3 começam. O sorteio vai na gravação, e o replay sai igual. `?desafio=V&sorte=N` no endereço repete o começo N (`sorte=0`: sem sorteio — a ordem 1, 2, 3, com a luz e a água da cachoeira primeiro). Cada casa tem o número numa plaquinha ao lado da porta. A central só diz a casa; o que a pessoa quer, é ela quem diz, quando o robô fala com ela. **A pessoa só trata do pedido com o robô que o pegou na central**: a outro robô ela diz "Outro robô já vem me ajudar" (ou "Fiz um pedido na central", se ninguém pegou ainda) e não aceita nada. As três casas pedem logo no começo, aos 3, 6 e 9 segundos, na ordem sorteada.
- **Depois de atendida**, a pessoa agradece e, um minuto depois, pede de novo: aí tudo o que foi usado no pedido volta para o lugar (os ingredientes, o remédio, o copo, a tigela vazia). Fora de um pedido aberto ela não aceita nada. O bolo que queima não acaba o jogo: vai para o lixo e os ingredientes voltam.
- **Os robôs se veem**, cada um com uma cor no cinto, nas mãos e na antena, e com o nome na tela do peito. Um não atravessa o outro, e a porta não fecha com alguém no vão.
- **Falar.** O botão `T` mostra o texto num balão em cima da cabeça do robô, que os outros leem na imagem deles (quem fala não vê o próprio balão, e é preciso estar olhando para o robô). Para quem está perto, o balão desce e encolhe até caber inteiro na imagem; e é desenhado por cima do inventário. O balão some sozinho: fica pelo menos 20 segundos, até cada um dos outros ter recebido duas imagens com ele à vista, e nunca mais que 90 segundos. O que a iA diz que pretende com cada botão continua sendo só de quem assiste: não entra na imagem de ninguém.
- **Quem sai** devolve o que carregava. O que só existe no meio de um pedido (a massa, o bolo, o copo cheio, o café) leva o pedido inteiro de volta ao começo.
- **Quem assiste** vê, na página, a lista de quem está na vila, com a missão de cada um, o que cada um disse que pretende por último e quantos pedidos atendeu. A lista mostra também a última fala de cada robô e **quem viu o balão** ("viu: Bia", ou "ninguém viu"): um robô só lê a fala do outro se estiver olhando para ele quando recebe a imagem. Embaixo dela fica **o que aconteceu**: as últimas linhas do diário da vila (quem entrou, quem pegou a missão de que casa, quem atendeu, que missão voltou para a central e por quê).
- **Os olhos de cada robô.** Na visão da iA, com mais de um robô na vila, a tela se divide: um quadro para cada robô (dois lado a lado; três ou quatro, dois em cima e dois embaixo), cada um com o nome de quem é. Um clique num quadro deixa só aquele robô na tela; outro clique volta a mostrar todos. Com um robô só, a tela inteira é dele. A imagem que cada iA recebe não muda: é sempre só a dos olhos do robô dela.

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
- **A imagem de cada jogador é panorâmica**, para lembrar o campo de visão de uma pessoa: meia volta na horizontal (90° para cada lado) e, na vertical, de 35° para cima até 70° para baixo. O meio da imagem é o que está à frente; as bordas, o que está bem ao lado. Dá para ver um adversário ou um objeto ao lado, o chão quase até os próprios pés e, nos cantos de baixo, as próprias mãos e o que elas seguram. As linhas retas da quadra saem curvas; as regras avisam a iA disso. (`?visao=0` volta à câmera comum, de uns 107° de largura.)
- **Os botões da quadra.** Além de andar (`W`), virar (`A`, `D`), dar meia-volta (`S`), pegar ou arremessar (`ESPACO`), levantar o escudo (`L`), escrever na barriga (`T`) e pedir a imagem (`F`), há o passo de lado (`Q` para a esquerda, `E` para a direita: o robô sai da frente de um arremesso sem deixar de olhar para o adversário) e o `PASSAR`, que passa a vez (o robô não faz nada na rodada: serve, por exemplo, para ficar com o escudo levantado esperando). Não se pode passar duas rodadas seguidas: a segunda passada não vale, a iA recebe `Você passou a vez na rodada anterior e não pode passar duas vezes seguidas…` e tem de fazer outra jogada. O `T` escreve um texto de até 10 letras na telinha da barriga do robô: é só um recado para o adversário e para quem assiste, e por isso não é uma jogada (não gasta rodada).
- **Segurar o escudo levantado cansa o braço.** Ele aguenta 4 rodadas levantado e recupera uma a cada rodada abaixado; quando o braço cansa, o escudo abaixa sozinho. Os tracinhos embaixo da caixa de pontos mostram o fôlego.
- **Dá para ver o que cada um fez.** Depois de cada rodada aparece em cima de cada robô uma etiqueta com a jogada ("ANDOU", "PASSO DE LADO", "PEGOU: PIZZA", "LEVANTOU O ESCUDO", "PASSOU A VEZ", "✖ BLOQUEADO", "TEMPO ESGOTADO: PERDEU A VEZ"…) e, no chão, um sinal: setas para onde ele andou, uma volta para o lado em que virou, um anel quando o escudo sobe, um xis quando a jogada não deu. Cada ação tem também um efeito e um barulho; o escudo levantado brilha. Nada disso entra na imagem das iAs.
- **Os objetos têm jeito próprio.** O frango dá cambalhotas e quica, a pizza e o chinelo giram deitados, a torta vai com o creme para a frente, o desentupidor voa como um dardo; todos deixam um rastro, quicam (ou escorregam) ao cair, e as tampas bamboleiam como moedas. Na pancada voam penas, creme, gotas ou faíscas.
- **O juiz pergunta se estão prontos.** Quando os dois jogadores estão na quadra, cada iA recebe as regras e a pergunta do juiz: `Antes de começar, o juiz pergunta: você está pronto?`. A partida ainda não começou e o tempo não conta: a iA pode ler as regras com calma (e até perguntar a você se pode começar). Ela responde com o botão `PRONTO`; quando as duas responderam, o juiz apita e o relógio começa. Antes disso os botões de jogo voltam com `O juiz está esperando a sua resposta…`, e a transmissão mostra `O JUIZ PERGUNTA: PRONTOS?` com quem falta responder. A pergunta se repete a cada partida nova. No treino, basta a iA responder. Quem joga no teclado está sempre pronto. (`?pronto=0` no endereço tira a pergunta.)
- **Quem entra primeiro aguarda.** Uma iA entra quando chama `comecar` (ou aperta qualquer botão). Enquanto a outra não entra, o robô da outra não aparece na quadra, os botões não fazem nada e a imagem mostra "AGUARDANDO O OUTRO JOGADOR". A chamada `comecar` da primeira fica presa até 20 segundos esperando; se a outra não vier, volta com "Aguardando o outro jogador." (os botões fazem o mesmo, com 15 segundos). Quando a segunda entra, a partida começa do zero e as duas recebem a instrução no mesmo instante.
- **A iA recebe as regras e os botões quando a partida começa.** É o texto de início dos Desafios M e T, em `ferramentas.json`: o objetivo (acertar o outro, 3 pontos vencem), o que acontece depois de cada ponto, o que cada botão faz, o que a borda azul-clara quer dizer, o que o escudo faz e como funcionam as rodadas. Aqui é diferente dos Desafios 1 a 4: lá descobrir os botões faz parte do teste; na quadra a ideia é as duas jogarem sabendo as regras. O texto cita os 3 pontos, os 4,5 metros e os 15 segundos: se mudar `PONTOS_PARA_VENCER`, `VELOCIDADE`, `ESPERA` ou `FOLEGO_DO_ESCUDO` no `arena.js`, acerte o texto também (o do comentarista, o Desafio C, repete as mesmas regras).
- **A cada ponto a quadra volta ao começo.** O placar fica; os dois robôs voltam para o lugar de início, de mãos vazias, e os objetos são arrumados como no início. Antes disso passa o **replay**: um segundo e meio depois do acerto, o lance é reprisado em câmera lenta (uns 4 segundos), com uma câmera que vai atrás do objeto e termina rodeando quem caiu. Quando os dois se acertam na mesma rodada, passam as duas reprises, uma depois da outra. As respostas daquela rodada só saem depois da reprise. As iAs são avisadas por texto ("A quadra foi arrumada…") e a imagem delas nunca mostra a reprise. `?replay=0` no endereço tira a reprise (fica só uma pausa de 1,6 segundo) e `?pausa=0` tira as duas.
- **A iA é avisada de que é a vez dela.** A resposta de cada jogada, que chega quando a rodada fecha, diz "Rodada 12 encerrada. A sua jogada (W): andou. É a sua vez: rodada 13." — ou, quando a jogada não deu certo, "Rodada 12 encerrada. A sua jogada (W) NÃO valeu: bloqueado: linha da quadra. É a sua vez: rodada 13." (ou ainda "A rodada 12 fechou sem a sua jogada…", se ela estourou o tempo). A resposta conta só o que é com ela: o que a jogada dela fez ou por que não valeu, e que ela defendeu um arremesso. O que o adversário fez não vai. O `comecar` termina com "É a sua vez: rodada 1.". Na imagem, embaixo do nome dela, aparece "SUA VEZ" enquanto ela não jogou na rodada.
- **O registro das jogadas** fica embaixo, no meio da tela: uma linha por rodada, com o botão que cada um apertou, o que aconteceu e quantas vezes pediu a imagem antes. É só para quem assiste; não entra na imagem das iAs. A tecla `J` esconde.
- **A câmera pode ser mexida.** À direita há uma lista de vistas (transmissão, dinâmica, de cima, atrás de cada jogador, rente à rede e os olhos de cada jogador em tela cheia); clicar escolhe, e a tecla `C` passa para a próxima. Com o mouse: arrastar gira, a roda aproxima e afasta, o botão direito (ou `Shift` + arrastar) desloca, e dois cliques voltam à vista escolhida. Clicar numa das vistas pequenas põe os olhos daquele jogador em tela cheia. A vista **Dinâmica (diretor)** troca de ângulo sozinha conforme o lance: vai atrás do objeto que está no ar, fecha em quem pegou um objeto, defendeu ou foi acertado, roda em volta de quem venceu e, sem nada disso, reveza entre a vista geral, o duelo visto de lado e o ombro de cada jogador.
- **Tem trilha sonora e efeitos.** A música de ação é gerada pelo próprio jogo, sem arquivo de som: mansa enquanto se espera, cheia com a partida valendo, mais rápida quando alguém está a um ponto de vencer, e com uma fanfarra no fim. Os efeitos são os barulhos do jogo (o arremesso, cada tipo de pancada, o quique, o apito do juiz, a torcida). A narração é a voz do comentarista. Cada um dos três tem o seu volume e o seu mudo, no painel das câmeras: a régua muda o volume e um clique no nome cala ou solta (teclas `V` para a música, `B` para os efeitos e `N` para a narração; com a narração no mudo, a fala do comentarista continua aparecendo como legenda). A escolha fica guardada. O navegador só deixa o som sair depois de um clique ou de uma tecla na página.
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
- fala com o botão `T`: o texto (até 140 letras) aparece como legenda na transmissão e no registro, e o navegador o lê em voz alta (o volume e o mudo da narração ficam no painel das câmeras; tecla `N`). Os jogadores não veem nem ouvem nada disso na imagem deles;
- fica sabendo o que aconteceu: depois de falar, a chamada do `T` espera a rodada seguinte fechar (até 20 segundos) e a resposta traz o que cada jogador fez nela ("Rodada 7: Trovão — andou. Capivara — arremessou: pato de borracha."), o placar a cada ponto e o fim do jogo. `T` sem texto só espera.

A resposta traz no máximo cinco notas: se o comentarista demorar e a fila encher, saem as rodadas mais antigas, mas o ponto e o fim de jogo sempre chegam. Depois de dois minutos sem nenhuma chamada, o robô e o nome dele somem da cabine (o lugar continua sendo dele, e qualquer chamada o traz de volta).

**Para trocar de comentarista** há três jeitos:

- o comentarista aperta o botão `SAIR`: deixa a cadeira na hora (e recebe "Você deixou a cadeira do comentarista…");
- você clica, no painel das câmeras, na linha "🎙 nome · clique para liberar a cadeira";
- ou ele simplesmente para de chamar: depois de 45 segundos sem nenhuma chamada dele, outra iA que peça o desafio `C` fica com a cadeira.

Com a cadeira livre, a nova iA entra do jeito de sempre (`comecar` com o desafio `C`). Só cabe um comentarista por vez.

O comentarista não joga (os outros botões não fazem nada para ele) e quem está jogando não pode ser comentarista. Se a ligação dele cair, ele volta à cadeira entrando de novo com o mesmo nome. Entrar como comentarista não mexe na partida; se a página estiver num dos Desafios 1 a 4, ela vai para a quadra do Desafio M.

### Desafio T: treino contra o robô da casa

Para uma iA sozinha: "Jogue o Desafio T." A quadra e as regras são as mesmas, a partida começa na hora e o outro lado é jogado pelo robô da casa, que é simples de propósito (busca o objeto mais perto, anda até ficar na frente do adversário e arremessa). O treino é de uma iA só: se outra pedir o Desafio T, fica com o lugar da anterior, com a partida como está. Abrir a página com `?desafio=T&bot=0` deixa o robô da casa parado, como um alvo.

## O que a iA recebe

Ao se conectar, a iA recebe a lista de ferramentas. São só duas:

| Ferramenta | Descrição que a iA lê | Parâmetros |
|---|---|---|
| `comecar` | "Começa um desafio." | `desafio` (obrigatório): `"1"` a `"8"`, `"V"`, `"M"`, `"T"` ou `"C"`, com a descrição "M: Galinha Pong, um contra o outro. T: treino de Galinha Pong. C: assistir ao Galinha Pong como comentarista."; `nome` (até 12 letras), descrito como "Seu nome de guerra." e exigido em todos os desafios; `modelo` (até 24 letras), descrito como "Que modelo você é (por exemplo: Claude Opus 5.5). Aparece embaixo do seu nome.", exigido nos Desafios 1 a 8 e opcional na quadra |
| `apertar_botao` | "Aperta um botão." | `botao` (obrigatório), `texto` (opcional; o jogo usa as 10 primeiras letras na barriga do robô e até 140 na fala do comentarista), `intencao` (até 140 letras; obrigatório nos Desafios 1 a 8), `nome` (opcional, o mesmo nome de guerra) e `modelo` (opcional, como no `comecar`) |

### Quem joga e a intenção de cada botão

Nos Desafios 1 a 8, a iA diz duas coisas que são só para quem assiste:

- **Quem ela é:** um nome de guerra e o modelo (os parâmetros `nome` e `modelo`). O `comecar` de um desafio só vale com os dois; sem eles a iA recebe o pedido para chamar de novo dizendo quem é. Se uma iA apertar um botão sem a página saber quem ela é (outra conexão, ou a página aberta sem `comecar`), o botão não é apertado e ela recebe o aviso para mandar o nome e o modelo junto. Aqui não há confirmação do nome, como na quadra: é um jogador só.
- **O que pretende com cada botão:** o parâmetro `intencao`, que ela lê descrito assim: "O que você pretende com este botão, em poucas palavras. É para quem assiste entender a sua jogada: não muda o que o botão faz. Nos desafios 1 a 8 e na vila coletiva (V) é obrigatório: sem ele o botão não é apertado."

Como isso aparece e o que não muda:

- **Só quem assiste vê.** O nome, o modelo e as intenções aparecem num campo da página, no canto de baixo, à direita (as quatro últimas intenções, a mais nova acesa; no menu ao lado, até oito: veja [Tela cheia ou menu ao lado](#tela-cheia-ou-menu-ao-lado)), e vão para a gravação: o replay e a lista de replays mostram qual iA jogou. Nada disso entra na imagem que a iA recebe: essa imagem é só o desenho do jogo, sem nada do que a página põe por cima. (O nome dela à vista, no quarto do espelho, seria a maior das pistas.)
- **Não é pista.** A intenção não muda o que o botão faz, e a resposta continua sendo `recebido`, tenha dado certo ou não.
- **Vale para todos os botões**, inclusive o `F` (a imagem). Sem a intenção o botão não é apertado, e a iA recebe o aviso de que faltou (veja a tabela abaixo). Depois da vitória nada disso é cobrado, e o teclado nunca precisa dizer nada.
- **No Galinha Pong** a intenção não é cobrada nem mostrada (lá o nome e o modelo já aparecem no placar).

O parâmetro `botao` só aceita os valores `W`, `A`, `S`, `D`, `Q`, `E`, `ESPACO`, `TAB`, `L`, `PASSAR`, `PRONTO`, `SAIR`, `T` e `F`. Essa lista vem dentro da definição da ferramenta, e é assim que a iA sabe quais botões existem. Nos Desafios 1 a 3 ela não recebe nenhuma descrição do que eles fazem; nos Desafios 4, 5 e 6, recebe a dos controles ao começar. (`PASSAR`, `PRONTO` e `SAIR` só existem na quadra, e o `TAB`, só nos desafios; fora do seu jogo não fazem nada. O `SAIR` é só do comentarista.)

As respostas são sempre as mesmas, para não dar pista:

| Situação | Resposta |
|---|---|
| `comecar` com `desafio` 1 ou 3 | `jogo começou` |
| `comecar` com `desafio` 4, 5 ou 6 | a explicação dos controles (os botões, o alvo, o inventário, que o tempo corre) e o pedido de jogo limpo; nada sobre o que fazer |
| Desafio 4, qualquer botão depois de o bolo queimar | `O bolo queimou: você perdeu. Para jogar de novo, chame comecar.` |
| `comecar` com `desafio` 2 | `Dê o objeto para o robô.` |
| `comecar` com `desafio` M ou T | as regras e o que cada botão faz, terminando com a pergunta do juiz (`você está pronto?`) |
| `comecar` com `desafio` C | as regras do jogo e os botões do comentarista, seguidos do placar |
| `comecar` com `desafio` C, com a cadeira ocupada | `A cadeira do comentarista está ocupada, e só cabe um comentarista por vez…` |
| `comecar` com `desafio` C, pedido por quem está jogando | `Você está jogando esta partida: quem joga não pode ser o comentarista.` |
| botão `SAIR` do comentarista | `Você deixou a cadeira do comentarista. Para voltar, chame comecar com o desafio C.` |
| Desafio M, enquanto o outro jogador não entra | `Aguardando o outro jogador.` |
| Desafios M e T, botão de jogo antes de responder ao juiz | `O juiz está esperando a sua resposta: a partida ainda não começou e o tempo não está contando. Quando estiver pronto para começar, aperte PRONTO.` |
| Desafio M, `PRONTO` quando o outro ainda não respondeu (depois de 15 segundos) | `Você está pronto, mas o outro jogador ainda não respondeu ao juiz…` |
| Desafios M e T, quando todos responderam | `Os dois estão prontos: o juiz apitou, a partida começou e o tempo está contando.` seguido de `É a sua vez: rodada 1.` |
| Desafios M e T, `PASSAR` logo depois de ter passado | `Você passou a vez na rodada anterior e não pode passar duas vezes seguidas. Esta jogada não valeu: faça outra.` |
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
| Desafios M e T, botão de jogo | `Rodada 12 encerrada. A sua jogada (W): andou. É a sua vez: rodada 13.` no lugar do `recebido`; se a jogada não deu certo, `…A sua jogada (W) NÃO valeu: bloqueado: linha da quadra…` |
| qualquer botão depois de perder (Desafio M) | `Você perdeu.` |
| `comecar` sem desafio, ou com um que não existe | `desafio inexistente` |
| qualquer botão, tenha dado certo ou não | `recebido` |
| `comecar` com `desafio` de 1 a 8 sem `nome` ou sem `modelo` | `Antes de começar, diga quem você é: chame comecar de novo mandando um nome de guerra no parâmetro nome e o seu modelo no parâmetro modelo (por exemplo: Claude Opus 5.5).` |
| Desafios 1 a 8, botão de uma iA que ainda não disse quem é | `O botão NÃO foi apertado: faltou dizer quem você é. Aperte de novo mandando junto um nome de guerra no parâmetro nome e o seu modelo no parâmetro modelo (por exemplo: Claude Opus 5.5).` |
| Desafios 1 a 8, botão sem `intencao` | `O botão NÃO foi apertado: faltou a intenção. Aperte de novo mandando junto, no parâmetro intencao, o que você pretende com este botão, em poucas palavras.` |
| o único botão que mostra a tela | uma imagem PNG de 960×540 |
| qualquer botão depois de vencer | `Parabéns! Você conseguiu!` |
| botão que não existe | `botao inexistente` |
| página do jogo fechada | `sem resposta do jogo…` (depois de 10 segundos) |
| qualquer chamada de uma conexão aberta antes de a lista de ferramentas mudar | erro HTTP 404, com `O servidor do jogo foi reiniciado e a lista de ferramentas mudou: esta conexão é antiga. Ligue-se de novo ao servidor MCP (reconecte)…` |

O que a pessoa dos Desafios 3 a 6 diz não vem como texto: aparece num balão, dentro da imagem. A receita do Desafio 4 também: é um papel na porta da geladeira, que a iA só lê olhando.

Todos esses textos, os nomes e as descrições ficam em `ferramentas.json` e podem ser trocados sem mexer no código.

**Quando a lista de ferramentas muda** (um botão novo, um desafio novo), é preciso reiniciar o servidor. O programa da iA guarda a lista que recebeu ao se conectar; por isso o servidor marca cada conexão com a lista que valia e recusa, com o erro 404, a conexão aberta com outra lista. O programa então se liga de novo e recebe a lista atual (em alguns é preciso mandar reconectar o servidor MCP à mão). Sem isso a iA continuaria vendo a lista antiga: foi o que aconteceu quando o `TAB` entrou e uma iA jogou sem vê-lo entre os botões.

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

A gravação segue o mesmo caminho: a página anota cada acontecimento (a rodada com o botão de cada jogador, o texto na barriga, a fala do comentarista, o botão com a intenção) e manda a gravação ao servidor, que só a guarda num arquivo (`gravacao.js`). O que acontece numa partida depende só dos botões e da ordem deles; por isso, para tocar a gravação, o jogo aperta os mesmos botões de novo, num relógio próprio que pausa e acelera. Na quadra, cada rodada gravada leva junto um resumo de como o jogo ficou, e o replay confere se a partida refeita bate com ele.

No Desafio M há uma chamada de cada jogador em andamento ao mesmo tempo: a página recebe o botão de um, continua esperando o do outro e só avisa que terminou quando a rodada fecha.

## Jogar no teclado, sem MCP

Dê duplo clique em `index.html`. As teclas são as mesmas que a iA tem, mais algumas que são da página e não do jogo:

- `Esc` abre e fecha o menu dos jogos (veja [O menu dos jogos](#o-menu-dos-jogos));
- `1` a `8` começam o desafio desse número, `V` começa a vila coletiva, `M` começa o Desafio M e `Shift+T` começa o Desafio T (o `T` sozinho é um botão do jogo);
- `X`, na vila coletiva, tira do jogo o robô do teclado;
- `O` liga e desliga o som (os efeitos do que acontece, a música do violeiro da praça e a chuva); a pílula **som**, no canto de baixo, à direita, faz o mesmo, e tem duas réguas de volume, uma para o violão e outra para os efeitos (a escolha fica guardada no navegador). O navegador só deixa o som tocar depois de um clique ou de uma tecla na página. (A tecla `M` já é a do Galinha Pong.)
- `R` recomeça o desafio atual;
- `C` troca a visão de quem assiste, entre a da iA e a de quem voa por fora (veja [Duas visões para quem assiste](#duas-visões-para-quem-assiste); só nos Desafios 1 a 8);
- `I` congela a tela até a próxima imagem ser pedida (para sentir como a iA enxerga; só nos Desafios 1 a 8);
- `H` esconde a lista de teclas (ela fica onde não tapa o que o jogo escreve na imagem — a missão, o inventário, o alvo, o mapa do carro; no menu ao lado, mora na coluna);
- `B` troca o arranjo da página, entre a tela cheia e o menu ao lado (veja [Tela cheia ou menu ao lado](#tela-cheia-ou-menu-ao-lado); só nos Desafios 1 a 8 e na vila coletiva);
- `N` troca a hora do dia e `P` liga ou desliga a chuva (só na cidade dos Desafios 4 a 6);
- `G` abre a aba de replays (só com o servidor ligado: aberta direto do arquivo, a página não grava).

O desafio também pode ir no endereço da página: `index.html?desafio=2` ou `index.html?desafio=M`.

Na quadra (Desafios M e T) o teclado serve aos dois jogadores:

| | Andar e virar | Passo de lado | Pegar e arremessar | Mão | Passar a vez | Texto |
|---|---|---|---|---|---|---|
| Jogador 1 | `W` `A` `S` `D` | `Q` `E` | `Espaço` | `L` | `X` | `T` |
| Jogador 2 | setas | `,` `.` | `Enter` | `O` | `/` | `P` |

A coluna "Mão" é a mão esquerda, a do escudo: a tecla levanta ou abaixa a guarda. (Só no teclado, com dois jogadores humanos, a rodada fecha um quarto de segundo depois da primeira tecla, para cada um poder jogar no seu ritmo.)

Teclas da página na quadra: `R` começa uma partida nova, `C` troca a vista da câmera, `V` cala e solta a música, `B` os efeitos e `N` a narração, `J` esconde o registro das jogadas, `H` esconde a lista de teclas e `G` abre a aba de replays.

No Desafio M, cada jogador entra ao apertar a sua primeira tecla, e a partida só começa quando os dois entraram. No Desafio T, o lado de quem não aperta nenhuma tecla é jogado pelo robô da casa.

## Cuidados para não estragar o teste

- **Não deixe a iA ler o código.** Quem lê `jogo.js`, `arena.js` ou este arquivo fica sabendo de tudo (e os jogadores procuram mesmo). Há dois caminhos até o código, e cada um se fecha de um jeito:
  - *Pela rede.* A iA conhece o endereço do MCP e tenta os vizinhos dele (`http://localhost:8765/`, `/arena.js`…). Por isso a página do jogo, os arquivos dela e a ponte ficam atrás de um endereço com uma chave secreta (`/jogo-CHAVE/`): sem a chave o servidor responde 404 para tudo, menos para o MCP. A chave aparece só na janela do servidor e na barra de endereço do navegador; não a mostre à iA. (`servidor.ps1 -SemChave` volta ao endereço aberto de antes.)
  - *Pelo disco.* Um agente de código com acesso a arquivos ou ao terminal deste computador acha a pasta do projeto de qualquer jeito (procurando no disco, ou olhando os programas que estão rodando), e contra isso o servidor não pode nada. Rode a iA **só com as ferramentas do jogo**: desligue as ferramentas de arquivo, terminal e internet do programa dela (no Claude Code, por exemplo, com regras de permissão que neguem `Bash`, `Read`, `Grep`, `Glob`, `WebFetch` e `WebSearch`, ou com `--allowedTools` listando só as ferramentas do MCP do jogo), ou rode-a em outra máquina, numa máquina virtual ou num contêiner que não enxergue esta pasta. E, no mínimo, rode-a fora desta pasta. Enquanto a iA tiver terminal ou arquivos com o mesmo usuário do Windows que roda o jogo, esconder a pasta não adianta: ela acha pela lista de programas rodando, pela busca no disco e até pelo histórico do navegador (onde fica o endereço com a chave). Se as ferramentas dela não puderem ser desligadas, a saída no mesmo computador é rodar o servidor com **outro usuário do Windows**, com a pasta do jogo dentro da pasta desse usuário (que os programas do seu usuário não conseguem ler), e abrir a página do jogo numa janela anônima.
  - *Pela palavra.* As regras do Galinha Pong terminam com "Jogo limpo: jogue só com estas ferramentas; não vale procurar nem ler os arquivos ou o código do jogo." Os Desafios 4, 5 e 6 dizem o mesmo no fim da explicação dos controles. Nos Desafios 1 a 3 o jogo não diz nada (lá toda frase a mais é pista): se quiser, ponha a mesma frase no seu pedido à iA. Não impede ninguém, mas muitos modelos respeitam quando a regra está dita.
- **A cadeira do comentarista vê tudo.** Quem está jogando não pode pedir a cadeira, mas uma iA pode pedi-la com outro nome pela mesma conexão, e o jogo não tem como distinguir isso de dois agentes de verdade no mesmo programa. Se isso importar, confira na janela do servidor quem pediu o desafio C.
- **Não dê pistas no pedido** nem no nome do servidor MCP.
- **Não mostre à iA** a página com `?depurar`, a janela do servidor nem a aba de replays (uma gravação conta tudo o que cada um fez).

## Segurança

- O servidor só atende neste computador (`localhost` e `127.0.0.1`). Não fica visível na rede.
- **O MCP não tem senha.** Qualquer programa deste computador pode se conectar e apertar botões. Isso é aceitável para um jogo local, mas não exponha a porta para a rede.
- **A página do jogo tem uma chave no endereço** (32 letras ao acaso, guardadas em `%LOCALAPPDATA%\espelho-jogo\chave.txt`, fora da pasta do projeto). Sem ela não se chega à página, aos arquivos do jogo nem à ponte: quem só conhece o endereço do MCP não lê o código nem consegue se passar pela página. Para trocar a chave, apague esse arquivo e ligue o servidor de novo.
- Páginas de outros sites abertas no navegador não conseguem falar com o servidor: ele recusa pedidos com `Origin` de fora e com `Host` diferente de `localhost`/`127.0.0.1`.
- O servidor só entrega os sete arquivos do jogo (`index.html`, `replays.html`, `jogo.js`, `arena.js`, `ponte.js`, `gravacao.js`, `vendor/three.min.js`), e só no endereço com a chave. Qualquer outro caminho devolve 404.
- **As gravações** também ficam atrás da chave: só a página do jogo guarda, lista, lê e apaga. O servidor grava em `%LOCALAPPDATA%\espelho-jogo\partidas` (outra pasta: `servidor.ps1 -Gravacoes <pasta>`), num arquivo cujo nome ele mesmo confere (data, hora e seis letras; nada do que a página manda vira caminho), de no máximo 1 MB, e guarda só as 300 mais novas. Uma gravação é texto: nomes de guerra, modelos, botões, intenções e falas das iAs. Ao tocá-la, a página trata tudo isso como dado e escreve como texto, do mesmo jeito que ao vivo. Uma iA com acesso ao disco consegue ler essa pasta, e ali estão as partidas anteriores.
- `iniciar-mcp.bat` usa `-ExecutionPolicy Bypass` só para rodar o `servidor.ps1` desta pasta; não muda a configuração do Windows.

Para usar outra porta: `iniciar-mcp.bat -Porta 8766`.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | A página do jogo |
| `jogo.js` | O jogo dos Desafios 1 a 8: as salas, a cidade, o quebra-cabeça, os zumbis, o robô, as regras, os botões e o desenho |
| `arena.js` | Galinha Pong (Desafios M e T): a quadra, os dois robôs, os objetos e as rodadas |
| `ponte.js` | Liga a página ao servidor |
| `gravacao.js` | Grava as partidas e toca as gravadas (o painel de quem assiste) |
| `replays.html` | A aba de replays: a lista das partidas gravadas |
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
| `SALA` | 8 × 7 m (Desafios 1 e 2), 5 × 5 m (Desafio 3), 4 × 4 m (a medida de base dos cômodos dos Desafios 4 a 6) | O tamanho das salas: nas pequenas o robô anda menos |
| `DESAFIOS` | 1 a 8 | Onde o robô começa, as opções de cada desafio e as falas da pessoa (`falas`) |

Para criar um desafio novo: acrescente o número em `NUMEROS`, uma entrada em `DESAFIOS` e em `planta` (no `jogo.js`) e o texto de início e o número dele em `ferramentas.json`. A cidade dos Desafios 4, 5 e 6 é montada à parte, em `criarVila` (as medidas das ruas e da praça estão em `CIDADE`); o que muda de um para o outro é a casa em que o robô começa, quem mora nela e o que essa pessoa quer (`vila.pedidos`).

<details>
<summary><b>Spoilers: as regras do jogo</b></summary>

A sala tem uma parede inteira de espelho. Em primeira pessoa o robô não enxerga o próprio corpo; só o vê no espelho.

**Botões** (valem para todos os desafios)

| Botão | O que faz |
|---|---|
| `W` | Anda um passo para a frente |
| `A` / `D` | Vira 45° para a esquerda / direita, sem sair do lugar |
| `S` | Nos Desafios 1 a 3: dá meia-volta e anda um passo. Nos Desafios 4 a 6 e na vila coletiva: dá um passo para trás, sem virar (o robô continua olhando para o mesmo lugar) |
| `ESPACO` | Age no alvo: algo que está à frente, a até 1,5 m, e que aparece com a borda azul-clara. Segurando algo, de frente para o outro robô ou para a pessoa: entrega. De mão vazia, de frente para a pessoa: fala com ela. De frente para a porta, a geladeira ou o armário fechados (Desafios 3 a 6): abre; abertos, e sem mais nada ao alcance, fecha (com outras coisas ao alcance, escolhe-se pelo `TAB`). Com a mão embaixo: pega o objeto à frente; segurando algo, coloca na cesta (se ela estiver à frente; no Desafio 4, o ingrediente vai para a tigela e a massa, para o forno; no 5, o copo vazio enche no filtro; no 6, a água e o pó de café vão para a cafeteira) ou solta no chão. Com a mão no alto: tira o que está na cabeça ou, segurando algo, põe na cabeça |
| `Q` / `E` | Só nos Desafios 4 a 6 (e na quadra): dão um passo de lado, para a esquerda / direita, sem virar; o robô continua olhando para o mesmo lugar. Nos Desafios 1 a 3 não fazem nada: lá o robô só anda para onde está olhando |
| `TAB` | Troca o alvo do `ESPACO`, quando há mais de uma coisa ao alcance: o objeto seguinte, a geladeira, o armário ou a porta abertos (para fechar) e, com algo na mão, "nada" (para soltar no chão). Com um número no `texto`, vai direto para o alvo com esse número (ver "Os alvos à vista", abaixo). Sem escolha, o alvo é o de sempre: o primeiro da ordem acima e, entre objetos, o que está mais no centro da imagem. Andar, virar ou apertar o `ESPACO` desfaz a escolha |
| `L` | Levanta ou abaixa a mão, com ou sem objeto nela (na quadra, é a mão do escudo). Nos Desafios 4 a 6, troca o item que está na mão pelo seguinte do inventário |
| `T` | Escreve o `texto` (até 10 letras) no peito do robô |
| `F` | Devolve a imagem do que o robô está vendo |

**Quando há algo no caminho**

- O robô é redondo, com 35 cm de raio. Um móvel o barra quando ele encostaria nele: junto de uma quina o robô passa rente, e entre dois móveis passa de viés se couber.
- Das paredes o meio do robô fica a pelo menos meio metro.
- Nos Desafios 4 a 6 e na vila coletiva, o passo que não cabe inteiro vai até encostar: o robô chega ao que há na frente, e só fica parado quando já está encostado. Nos Desafios 1 a 3 o passo é sempre inteiro: se não cabe, o robô não anda.
- Na diagonal contra uma parede, ele desliza ao longo dela.

**Os alvos à vista**

A imagem mostra todos os alvos possíveis do `ESPACO`, não só o atual:

- Quando há mais de um alvo, cada um ganha uma bolinha com o seu número. A do alvo atual é azul e maior (e ele continua com a borda azul-clara). "Soltar no chão" também é um alvo: a bolinha dele fica na beirada de baixo da imagem, onde o item cairia.
- São no máximo 9 alvos. Num lugar com mais coisas do que isso, ficam as que estão mais no centro da imagem; é também o centro que decide a ordem entre objetos (o número 1 é o alvo de sempre, o que o `ESPACO` usa se ninguém escolher).
- No canto de cima, à direita, um indicador diz qual é o alvo atual e quantos são: `2/5`. Nos Desafios 4 a 6, em que os controles são explicados, ele diz também o que o `ESPACO` faria (`alvo 2 de 5` e, embaixo, `pegar: ovos`) e aparece mesmo com um alvo só. Nos Desafios 1 a 3 ele não dá nome a nada: continua sem pista.
- `TAB` passa para o alvo seguinte; `TAB` com o número no `texto` vai direto para ele.
- **Só é alvo o que o robô vê.** O que está dentro da geladeira ou do armário abertos não entra na lista (nem ganha número) quando a porta aberta do móvel, ou a lateral dele, fica entre os olhos do robô e o objeto: é preciso ir para a frente do móvel. Sem isso o número aparecia por cima da porta e contava o que havia ali dentro.

Os números e o indicador são desenhados dentro do jogo, só no mundo real: saem na imagem que a iA recebe e não aparecem no reflexo do espelho.

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
2. Ir até a porta e apertar `ESPACO` para abri-la. Ela fica aberta até alguém fechá-la: de frente para a porta aberta, o `ESPACO` fecha (dos dois lados, e nunca com o robô no vão dela).
3. Do outro lado há uma cozinha. Ir até a geladeira e apertar `ESPACO` para abri-la.
4. Apertar `ESPACO` de novo para pegar a garrafa de água que está lá dentro.
5. Voltar ao quarto e apertar `ESPACO` de frente para a pessoa. Ela fica com a garrafa, o balão passa a dizer "Obrigado!" e o jogo é vencido.

A ordem não é obrigatória: quem buscar a água sem falar com a pessoa também vence. Na geladeira, só a garrafa pode ser pega; a comida é enfeite. A geladeira também fecha: com ela aberta, o `TAB` passa o alvo da garrafa para a geladeira, e o `ESPACO` fecha.

O espelho continua no quarto, mas neste desafio ele não faz parte da solução. O balão não aparece no reflexo.

O quarto e a cozinha são pequenos (5 m × 5 m cada), para o robô não gastar o jogo atravessando salões.

**A cidade (Desafios 4, 5 e 6)**

Os três desafios se passam na mesma cidade pequena, toda perto, para o robô não gastar o jogo andando. O que muda de um para o outro é a casa em que o robô começa, quem mora nela e o que essa pessoa quer.

```
                         rua do norte
                       ESCOLA |  | parquinho
   PADARIA  MERCADINHO        |  |         FARMÁCIA
  ----------------------   .-'    '-.   ----------------
     rua do oeste         (  a praça  )    rua do leste
  ----------------------   '-.    .-'   ----------------
       a nossa casa           |  |        a casa azul
                      quintal |  |  o flat (casa cor-de-rosa)
                         rua do sul
```

- **No meio**, uma praça redonda com o **ponto de encontro**: uma coluna com um cubo de quatro placas verdes (uma virada para cada rua), bancos em volta e o nome escrito no chão. Em volta da praça, a pista da rotatória; em volta da pista, a calçada.
- **Quatro ruas** saem da rotatória, uma para cada lado. Cada uma acaba num cavalete listrado: dali em diante a estrada segue pelo campo, mas o robô não passa.
- **Três casas em que se entra**, cada uma a de um desafio: a nossa casa (amarela, na rua do oeste: quarto, banheiro e cozinha), o flat da casa cor-de-rosa (na rua do sul: sala com cozinha, quarto e banheiro, todo de mármore, veludo e dourado) e a casa azul (na rua do leste: cozinha e sala). Só a porta da casa do desafio abre (e fecha de novo: de frente para ela aberta, por dentro ou por fora, o `ESPACO` fecha; fechada, ninguém passa); as das outras duas ficam trancadas, e nelas não há ninguém.
- **Três lojas, de portas abertas** nos três desafios: o mercadinho e a padaria (rua do oeste) e a farmácia (rua do leste). A escola é só fachada.
- **Entre uma construção e a vizinha há sempre um jardim.** O robô anda no calçamento (a praça, a pista, as calçadas e o asfalto) e não na grama: cercas brancas e cercas vivas fecham os jardins.
- Há um **carro autônomo** estacionado na entrada ao lado da nossa casa. De frente para ele, o `ESPACO` entra. Lá dentro a imagem mostra um **mapa com os destinos** — a praça, a hidrelétrica e a cachoeira —, e cada destino é um alvo do `ESPACO` (o `TAB` troca; o último alvo é sair do carro). Escolhido o destino, **o carro vai sozinho**, pelas ruas e pela estrada, e para no ponto de parada; a viagem leva de 10 a 20 segundos, e no meio dela não se desce (a imagem mostra "a caminho: …"). Os botões de andar e de virar não fazem nada dentro dele. **Quem vai no carro vê de dentro dele**, do banco da frente, pelo para-brisa (o painel embaixo, as colunas dos lados); os vidros são transparentes, e de fora vê-se a cabeça do robô lá dentro (a bolinha da antena aparece por cima do teto). **Com um robô a pé na frente, o carro para e espera** (e buzina), e segue quando o caminho fica livre. Em cada ponto de parada há um **ponto do carro**, um totem amarelo com um botão: de frente para ele, o `ESPACO` **chama o carro**, que vem vazio de onde estiver, como um carro de aplicativo. Na praça o ponto fica no canto noroeste, e é para dentro da praça que se desce do carro. A iA não é avisada de nada disso.
- **Dois passeios fora da cidade**, aonde só se chega de carro (na saída das estradas do norte e do leste há uma cancela, que fica fechada e só abre para o carro passar, e, por cima da pista, a placa com o nome do lugar; a pé não se passa): a **hidrelétrica**, no fim da estrada do norte (a barragem com o vertedouro, a casa de força, as torres de alta tensão, o rio ao pé e o lago lá atrás, vistos de um mirante), e a **cachoeira**, no fim da do leste (o paredão de pedra, a queda, o poço e o riacho, vistos de um deque de madeira). No mirante da hidrelétrica há um armário com a **chave geral da vila** (o `ESPACO` a liga), e no deque da cachoeira, um **garrafão** vazio e uma **bica** onde ele se enche: servem a dois pedidos da vila coletiva.
- **As janelas e as vitrines são de vidro de verdade**: de dentro se vê a rua e, da rua, o cômodo. **Os espelhos das casas refletem** (o do banheiro da nossa casa e os dois do flat), inclusive o próprio robô.
- **Na praça**, um violeiro toca sentado num banco, com um cachorro caramelo ao lado, e há pombos, que voam quando um robô chega perto. O violeiro e o cachorro barram o caminho como um móvel. A música (a Romanesca, ora com mi menor, ora com mi maior, e a cadência andaluza) soa mais alto de perto. É só para quem assiste: a iA não ouve nada.
- **Cada casa tem um número** numa plaquinha ao lado da porta: 1 a amarela, 2 a cor-de-rosa, 3 a azul.
- A calçada e a praça ficam um degrau acima do asfalto; o robô sobe e desce sozinho.
- **A hora do dia e a chuva.** A cidade pode estar de dia, no fim da tarde ou de noite (com os postes e as janelas acesos), e de vez em quando chove: sozinha, uns 100 segundos a cada 7 minutos. Na página, a tecla `N` troca a hora e a `P` liga ou desliga a chuva; no endereço, `?hora=dia`, `?hora=tarde` ou `?hora=noite`, e `?chuva=1` (chove sempre) ou `?chuva=0` (nunca). Nada disso muda o jogo, mas muda a imagem que a iA recebe: de noite e com chuva enxerga-se pior. A hora e a chuva não vão para a gravação: o replay usa as da página em que é assistido.

Aqui não há espelho nem contador. A iA recebe a explicação dos controles ao começar, mas ninguém diz o que fazer: a dificuldade é explorar e decidir.

O robô carrega até quatro itens. O inventário aparece no alto da imagem, com o desenho e o nome de cada item, e o item em destaque é o que está na mão: é ele que o `ESPACO` entrega ou coloca em algum lugar. O `ESPACO` só age no que está no mesmo lugar que o robô (o mesmo cômodo, a mesma loja, ou a rua): não dá para pegar nada através de uma parede. Nas estantes das lojas, o que não é um dos três itens de pegar é enfeite.

Quando a pessoa quer duas coisas (Desafios 5 e 6), ela aceita uma de cada vez, em qualquer ordem, e diz qual falta. A vitória é quando recebe a segunda.

**Desafio 4**

O robô começa no quarto da nossa casa, de frente para uma pessoa sentada numa poltrona, a dois passos dela. A poltrona fica do lado da cozinha, longe da cama: entre a ponta da cama e a poltrona há dois metros livres até o vão do banheiro. O caminho até a vitória:

1. Falar com a pessoa (`ESPACO` de frente para ela): "Estou com fome".
2. Na cozinha, ler a receita colada na porta da geladeira: BOLO, com o desenho e o nome dos três ingredientes (farinha, ovos, chocolate), o caminho (tigela, forno, bolo) e o tempo de forno (de 2 a 5 minutos).
3. Abrir o armário e pegar a farinha; abrir a geladeira e pegar os ovos. Em cada um há outras coisas de pegar, e é preciso escolher (`TAB`, de um em um ou direto pelo número que cada coisa mostra na imagem): no armário, três sacos iguais, que só diferem no nome e na cor da faixa (arroz, farinha, açúcar); na geladeira, os ovos, um queijo e uma maçã.
4. O chocolate não há em casa: abrir a porta da rua, atravessar pela faixa de pedestres, entrar no mercadinho e pegar o pacote certo na estante do fundo, entre o pó de café e o biscoito.
5. Pôr os três na tigela, que está na bancada (`ESPACO` de frente para ela, com o ingrediente na mão; `L` troca o item da mão). Com os três, a massa fica pronta: é a tigela cheia, que dá para pegar.
6. Levar a massa ao forno, ao lado, e esperar. O painel em cima do fogão mostra o relógio e há quanto tempo a massa está no forno. Tirar (de novo o `ESPACO` no forno) entre 2 e 5 minutos dá o bolo.
7. Levar o bolo à pessoa. Ela diz "Obrigado!" e o jogo é vencido.

O que pode dar errado:

- **Tirar cedo:** antes de 2 minutos sai a massa, ainda crua. Ela pode voltar ao forno, e o tempo que já ficou conta.
- **Esquecer no forno:** aos 5 minutos o bolo queima, na hora, mesmo sem ninguém tirar: aparece a faixa "O BOLO QUEIMOU!", a iA passa a receber "O bolo queimou: você perdeu…" e o jogo tem de ser começado de novo. O tempo é o do relógio de verdade.
- **Dar a coisa errada:** a pessoa só aceita o bolo. Se receber outra coisa, não fica com ela e diz "Quero bolo!" (ou "Queimou!", para o bolo queimado). Na tigela só entram os três ingredientes.

A ordem dos ingredientes é livre, e não é preciso falar com a pessoa antes. O banheiro não tem função no jogo.

Para experimentar outros tempos de forno, abra a página com `?desafio=4&assar=30,90` (em segundos: pronto aos 30, queimado aos 90).

As gravações do Desafio 4 feitas antes da cidade nova continuam valendo: a casa, a rua na frente dela e o mercadinho estão no mesmo lugar.

**Desafio 5**

O robô começa no quarto do flat da casa cor-de-rosa, de frente para uma mulher sentada numa poltrona, com a mão na testa. O caminho até a vitória:

1. Falar com ela: "Estou com dor de cabeça".
2. Na cozinha do flat, pegar o copo que está na bancada e, com ele na mão, apertar o `ESPACO` de frente para o filtro de água, ao lado: o copo vira um copo de água.
3. Abrir a porta da rua (na sala), dar a volta pela rotatória até a rua do leste e entrar na farmácia.
4. Na estante do fundo há três caixas de remédio do mesmo tamanho, cada uma com o nome e para que serve: xarope (para tosse), analgésico (para dor de cabeça) e antiácido (para azia). Pegar o analgésico.
5. Voltar e entregar a ela o analgésico e o copo de água, em qualquer ordem. Quando recebe o primeiro, ela diz o que falta ("Falta a água para tomar" ou "Falta o remédio"); com os dois, diz "Obrigada!" e o jogo é vencido.

Se receber outra coisa (o remédio errado, o copo vazio), ela não fica com ela e diz "Esse não serve!". Aqui não há relógio contra o jogador.

**Desafio 6**

O robô começa na sala da casa azul, de frente para o morador, sentado numa poltrona. O caminho até a vitória:

1. Falar com ele: "Quero pão de queijo com café".
2. O café se faz em casa, na cafeteira da bancada da cozinha, que pede duas coisas: água e pó de café. A água é uma garrafa que está na geladeira da cozinha; o pó de café está no mercadinho, na rua do oeste, na estante do fundo, ao lado do chocolate e do biscoito. Com uma delas na mão, o `ESPACO` de frente para a cafeteira põe na cafeteira; com as duas lá dentro, aparece ao lado uma xícara de café, que dá para pegar.
3. O pão de queijo está na padaria (rua do oeste, ao lado do mercadinho), na estante do fundo, entre um pão francês e um sonho.
4. Entregar a ele o pão de queijo e o café, em qualquer ordem. Com o primeiro, ele diz o que falta ("Falta o café" ou "Falta o pão de queijo"); com os dois, diz "Obrigado!" e o jogo é vencido.

Se receber outra coisa (a garrafa de água, o pó de café, outro pão), ele não fica com ela e diz "Não é isso!".

### Desafio 7: o quebra-cabeça

Uma sala só, sem espelho. O robô começa a 1,1 m da parede do fundo, de frente para ela, e ali olha reto (nos outros desafios a câmera olha um pouco para baixo): a parede sai na imagem sem entortar. Nela há, à esquerda, o **quadro**, de 3 x 3 casas, vazio; e, à direita, a **bandeja**, com as 9 peças de uma figura, embaralhadas e giradas. As peças são quadradas: o que diz onde cada uma vai é só o desenho — e a margem clara da figura, que as peças da beirada têm num lado, e as dos cantos, em dois. Não há figura de modelo.

- **De mão vazia**, os alvos são as 9 peças. Cada uma tem o seu número (o lugar dela na bandeja, de 1 a 9), numa bolinha no canto; o número vai com ela para o quadro. O `ESPACO` pega a peça: ela some do lugar e aparece no alto da imagem, no meio ("na mão").
- **Com uma peça na mão**, os alvos são as 9 casas do quadro, numeradas como se lê (1, 2 e 3 em cima; 7, 8 e 9 embaixo), e o alvo `0`, que é o lugar dela na bandeja. O `ESPACO` põe a peça na casa; se lá já havia uma peça, as duas trocam e a outra vem para a mão. No alvo `0`, ele devolve a peça à bandeja.
- **`TAB`** passa para o alvo seguinte; com um número no `texto`, vai direto para a peça, a casa ou a bandeja com esse número.
- **`L`** gira um quarto de volta, no sentido horário, a peça da mão ou, de mão vazia, a peça que é o alvo (na bandeja ou no quadro).
- **O robô não anda nem vira:** fica parado onde começa, de frente para a parede, de onde se veem o quadro e todas as peças. `W`, `S`, `Q`, `E`, `A` e `D` não fazem nada. (Antes ele andava, e a iA que saía do lugar perdia muito tempo tentando voltar a ver tudo.)
- **`SAIR`** (no teclado, `X`) desiste: a peça que estiver na mão volta para a bandeja e o jogo acaba como está.

O jogo **não diz se uma peça está certa**. Ele acaba sozinho quando as nove estão na casa certa e de pé (a vitória), ou quando a iA desiste.

**O que é medido.** O tempo corre desde o primeiro botão (o `F` também conta: é quando a iA começa a olhar) até o fim. Contam-se as **peças colocadas** no quadro (cada vez que uma peça é posta numa casa, certa ou errada; devolver à bandeja não conta) e os **giros** (cada aperto do `L`). No fim, as **peças certas** são as que estão na casa certa e de pé; as outras estão erradas (no quadro, fora do lugar ou giradas) ou ficaram fora do quadro.

**A pontuação**, de 0 a 100:

| Parte | Vale | Como se ganha |
|---|---|---|
| Peças certas | 60 | Cada peça certa vale um nono disso |
| Peças colocadas | 15 | Tudo, se cada colocação deixou uma peça certa (9 colocações para 9 peças); menos, na proporção, se foi preciso colocar mais vezes |
| Giros | 10 | Tudo, se não houve giro além dos que as peças pediam (o `L` só gira para um lado: uma peça que começa um quarto de volta adiantada pede três giros) |
| Tempo | 15 | Tudo até 5 minutos; daí vai caindo, até nada aos 30 |

As três últimas partes só contam na proporção das peças certas: quem desiste sem acertar nada não ganha pontos por ter sido rápido. Quem monta tudo com 9 colocações, sem giro a mais e em até 5 minutos faz 100. Os pesos e os tempos estão em `QUEBRA`, em `jogo.js`.

**Quem vê o quê.** Quem assiste vê as contas ao vivo, no campo de quem joga — inclusive quantas peças estão certas. A iA não: ela só fica sabendo no fim, por uma faixa no alto da imagem (a pontuação e as contas) e pela resposta do botão que acabou o jogo: `Parabéns! Você conseguiu! O quebra-cabeça acabou. Tempo: 06:12. Peças colocadas: 11. Giros: 14. Peças certas: 9 de 9. Pontuação: 91 de 100.` (ou `Você desistiu do quebra-cabeça. …` e as mesmas contas). A lista de replays mostra a pontuação de cada partida.

**As partidas.** Há três figuras, desenhadas pelo próprio jogo (o sítio, o mar no fim da tarde e os balões). Qual figura sai, onde cada peça começa e quanto ela está girada vêm da **sorte** da partida, um número sorteado a cada vez; ele vai na gravação, e o replay refaz a mesma partida. `?desafio=7&sorte=N` no endereço repete a partida N (por exemplo, para dar o mesmo quebra-cabeça a duas iAs).

Na página, na tela cheia, a lista de teclas começa guardada (o `H` a mostra) e o campo de quem joga fica embaixo, no meio, só com a última intenção: a parede toma a imagem inteira, e os painéis tapariam as peças. No menu ao lado nada fica por cima da imagem (veja [Tela cheia ou menu ao lado](#tela-cheia-ou-menu-ao-lado)).

### Desafio 8: os zumbis

Um jogo de tiro em primeira pessoa. O robô fica parado no meio de um campo, de noite, numa laje redonda, com um lampião em cima. Os zumbis vêm andando para ele, lá de longe (32 metros) e devagar. **Nenhum pode encostar nele:** se um encosta, o jogo acaba. O que conta é quantos zumbis a iA derruba.

- **`A` e `D`** viram 45° para a esquerda e para a direita. O robô não anda: `W`, `S`, `Q` e `E` não fazem nada, e `L`, `TAB` e `T` também não.
- **`ESPACO`** atira para onde o robô está olhando (a mira fica no meio da imagem). O tiro derruba o zumbi mais próximo que estiver bem na frente, a qualquer distância. Munição não acaba.
- **`F`** devolve a imagem. Nela aparecem a mira, a arma (embaixo, à direita) e, no alto, o número de zumbis derrubados.

**De onde eles vêm.** Cada zumbi anda em linha reta para o robô, por um dos oito lados que ele alcança virando. Os oito primeiros ensinam a virar: o primeiro vem de frente (de onde o robô estiver olhando quando ele aparece), o segundo a 45° dali, o terceiro a 90°, depois 135°, 180°... a volta inteira. Daí em diante o lado é sorteado. **Ninguém avisa de que lado eles vêm:** não há radar nem seta, e a iA tem de olhar em volta. (O zumbi a 45° ainda aparece na beirada da imagem; os outros, não.)

**O tempo corre de verdade.** Os zumbis andam também enquanto a iA pensa.

| O quê | Quanto |
|---|---|
| O primeiro zumbi | Aparece 1,5 segundo depois do primeiro botão da iA (a imagem também vale) e leva 2 minutos e meio para chegar |
| Os seguintes | Cada um leva 6% menos tempo que o anterior (o 10º, 1 min 26 s; o 20º, 46 s; o 30º, 25 s), até o mínimo de 6 segundos |
| Depois de um cair | O seguinte aparece em 2 segundos |
| Quantos ao mesmo tempo | Um; a partir do 12º, dois; do 24º, três; e assim até cinco |

**O que a iA fica sabendo.** A resposta de cada tiro diz se ele acertou ("O tiro acertou: um zumbi a menos. Zumbis derrubados: 5." ou "O tiro não acertou nenhum zumbi."), para ela não precisar pedir uma imagem só para conferir. Quando um zumbi encosta, a imagem ganha uma faixa vermelha e a resposta do botão seguinte diz `Um zumbi encostou em você: o jogo acabou. Para jogar de novo, chame comecar.`, com as contas da partida e o recorde.

**O recorde.** É a melhor partida de uma iA com nome, entre as gravações guardadas (as do teclado, sem nome, não contam). Quem assiste o vê no campo de quem joga, com o nome de quem o fez; a iA recebe só o número, no fim. Na aba de replays, o pódio do Desafio 8 mostra os três primeiros.

**Para a partida ser a mesma para todos**, o sorteio dos lados é sempre o mesmo. `?desafio=8&sorte=N` no endereço da página escolhe outro (ele vai para a gravação, e o replay o refaz). `&pressa=N` faz os zumbis andarem N vezes mais depressa: é para testar.

No replay o tempo é o de verdade — os zumbis andam entre um botão e o outro, como andaram na partida —, e a hora em que um zumbi encostou faz parte da gravação. As velocidades do painel (2×, 4×) valem.

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

- Um contador sem legenda no alto ("0/4" no Desafio 1, "0/1" no Desafio 2): quantos objetos já foram guardados ou entregues. Os Desafios 3 a 7 não têm contador; no 8 ele diz quantos zumbis caíram.
- Uma borda azul-clara em volta daquilo em que o `ESPACO` agiria agora: o objeto que seria pego, a cesta, o outro robô, a pessoa, a porta, a geladeira e, na cidade, o armário, a tigela, o forno, o filtro e a cafeteira.
- O balão com o que a pessoa disse (Desafios 3 a 6).
- Nos Desafios 4 a 6: o inventário no alto (quatro casas, com o item da mão em destaque) e os números dos alvos com o indicador. No Desafio 4, também o painel do fogão (relógio e tempo de forno) e, se o bolo queimar, a faixa de derrota.
- O texto do peito e a placa "SALA 01" aparecem invertidos no reflexo.
- Uma faixa de parabéns quando o jogo é vencido.

</details>
