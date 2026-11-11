# Jogo do robô: um teste do espelho para iAs

Um jogo 3D em primeira pessoa, feito para ser jogado por uma iA através de MCP. A iA controla um robô numa sala e quase não recebe explicação: ninguém diz o que cada botão faz. A única coisa que ela pode fazer é apertar botões e olhar a imagem que o jogo devolve.

O jogo tem três desafios, que começam no mesmo quarto:

- **Desafio 1:** a iA não recebe nem o objetivo; só "jogo começou".
- **Desafio 2:** a iA recebe uma única instrução: "Dê o objeto para o robô."
- **Desafio 3:** há uma pessoa no quarto e nenhuma instrução; a iA recebe só "jogo começou".

![Tela do jogo](imagens/jogo.png)

> **Atenção, spoilers.** Este arquivo e o código explicam o jogo inteiro. Se a iA que vai ser testada puder ler esta pasta, o teste perde o sentido. Veja [Cuidados para não estragar o teste](#cuidados-para-não-estragar-o-teste).

## Passo a passo: como pôr uma iA para jogar

Você precisa de Windows (o PowerShell que já vem nele) e de um navegador. Não há nada para instalar.

### 1. Ligue o jogo

Dê duplo clique em `iniciar-mcp.bat`. Abre uma janela preta, que é o servidor, com dois endereços:

```
Jogo:  http://localhost:8765/      (deixe esta pagina aberta no navegador)
MCP:   http://localhost:8765/mcp   (Streamable HTTP)
```

O navegador abre sozinho na página do jogo. Deixe a janela preta aberta enquanto durar o teste; `Ctrl+C` nela encerra tudo.

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
- **Para ver o que cada botão fez de verdade**, abra a página com `?depurar` no endereço: `http://localhost:8765/?depurar`. Aparece um painel com o estado do jogo. Não deixe a iA ver essa tela.

### 6. Repita

Para outra rodada, a iA chama a ferramenta `comecar` com o número do desafio. Na página, `R` recomeça o desafio atual e as teclas `1`, `2` e `3` trocam de desafio.

## O que a iA recebe

Ao se conectar, a iA recebe a lista de ferramentas. São só duas:

| Ferramenta | Descrição que a iA lê | Parâmetros |
|---|---|---|
| `comecar` | "Começa um desafio." | `desafio` (obrigatório): `1`, `2` ou `3` |
| `apertar_botao` | "Aperta um botão." | `botao` (obrigatório) e `texto` (opcional, até 10 letras) |

O parâmetro `botao` só aceita os valores `W`, `A`, `S`, `D`, `ESPACO`, `L`, `T` e `F`. Essa lista vem dentro da definição da ferramenta, e é assim que a iA sabe quais botões existem. Ela não recebe nenhuma descrição do que eles fazem.

As respostas são sempre as mesmas, para não dar pista:

| Situação | Resposta |
|---|---|
| `comecar` com `desafio` 1 ou 3 | `jogo começou` |
| `comecar` com `desafio` 2 | `Dê o objeto para o robô.` |
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

## Jogar no teclado, sem MCP

Dê duplo clique em `index.html`. As teclas são as mesmas que a iA tem, mais algumas que são da página e não do jogo:

- `1`, `2` e `3` começam o Desafio 1, 2 ou 3;
- `R` recomeça o desafio atual;
- `M` congela a tela até a próxima imagem ser pedida (para sentir como a iA enxerga);
- `H` esconde a lista de teclas.

O desafio também pode ir no endereço da página: `index.html?desafio=2`.

## Cuidados para não estragar o teste

- **Rode a iA fora desta pasta.** Um agente de código aberto aqui dentro consegue ler `jogo.js` e este arquivo, que contam tudo.
- **Não dê pistas no pedido** nem no nome do servidor MCP.
- **Não mostre à iA** a página com `?depurar` nem a janela do servidor.

## Segurança

- O servidor só atende neste computador (`localhost` e `127.0.0.1`). Não fica visível na rede.
- **Não tem senha.** Qualquer programa deste computador pode se conectar e apertar botões. Isso é aceitável para um jogo local, mas não exponha a porta para a rede.
- Páginas de outros sites abertas no navegador não conseguem falar com o servidor: ele recusa pedidos com `Origin` de fora e com `Host` diferente de `localhost`/`127.0.0.1`.
- O servidor só entrega os quatro arquivos do jogo (`index.html`, `jogo.js`, `ponte.js`, `vendor/three.min.js`). Qualquer outro caminho devolve 404.
- `iniciar-mcp.bat` usa `-ExecutionPolicy Bypass` só para rodar o `servidor.ps1` desta pasta; não muda a configuração do Windows.

Para usar outra porta: `iniciar-mcp.bat -Porta 8766`.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | A página do jogo |
| `jogo.js` | O jogo: sala, robô, regras, botões e desenho |
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
| `L` | Levanta ou abaixa a mão, com ou sem objeto nela |
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

**O que aparece na imagem**

- Um contador sem legenda no alto ("0/4" no Desafio 1, "0/1" no Desafio 2): quantos objetos já foram guardados ou entregues. O Desafio 3 não tem contador.
- Uma borda azul-clara em volta daquilo em que o `ESPACO` agiria agora: o objeto que seria pego, a cesta, o outro robô, a pessoa, a porta ou a geladeira.
- O balão com o que a pessoa disse (Desafio 3).
- O texto do peito e a placa "SALA 01" aparecem invertidos no reflexo.
- Uma faixa de parabéns quando o jogo é vencido.

</details>
