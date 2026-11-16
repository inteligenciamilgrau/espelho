/* Teste do Espelho — protótipo jogável no teclado.
 *
 * Tudo que o jogador faz é apertar um botão: window.jogo.apertar(botao, texto). O teclado
 * e o MCP apertam os mesmos botões (ver BOTOES).
 *
 * O jogo não explica nada: o jogador recebe "jogo começou", fica sabendo quais botões
 * existem e mais nenhuma palavra — nem o que cada botão faz. Os botões não devolvem
 * resultado (nem se deram certo); o único jeito de saber o que aconteceu é olhar um frame.
 * O que cada comando fez fica só no painel de depuração e em jogo.diagnostico(), que são
 * para quem pesquisa e para os testes — nunca para quem joga. O painel não tem tecla: só
 * aparece se a página for aberta com ?depurar no endereço.
 *
 * São vários desafios (ver DESAFIOS). Os três primeiros começam no mesmo quarto; o 4, o 5 e o 6
 * se passam numa cidade pequena, com casas, ruas, praça e lojas (ver "a vila"). No desafio 1 o jogo tem
 * TOTAL_SALAS salas (hoje, uma só): pôr todos os objetos de uma sala na cesta abre a porta
 * para a seguinte, e completar a última é a vitória. No desafio 3 a sala ao lado é uma
 * cozinha, e a porta é o próprio jogador que abre.
 *
 * As salas ficam enfileiradas ao longo do eixo x, ligadas por portas, e a parede-espelho
 * de todas elas está no mesmo plano (z = Z_ESPELHO). Por isso um único truque serve para
 * todas: a cada frame o mundo é desenhado duas vezes — primeiro refletido nesse plano
 * (com o robô inteiro visível), depois o mundo real por cima. Como as salas são fechadas,
 * o único lugar onde o mundo refletido aparece é o vão das paredes-espelho.
 */
(() => {
  'use strict';
  if (/^[MT]$/.test(new URLSearchParams(location.search).get('desafio') || '')) return;   // os desafios M (multiplayer) e T (treino) são outro jogo: ver arena.js
  const T = THREE;
  // As partidas são gravadas para assistir depois (ver gravacao.js e, aqui, "a intenção e a
  // gravação"). Com ?assistir=<id> a página não aceita jogadas: só toca a gravação pedida.
  const GRAVACAO = window.gravacao || null;
  const ASSISTINDO = !!(GRAVACAO && GRAVACAO.assistindo);

  // ---------- configuração ----------
  // Qual desafio roda vem do endereço da página (?desafio=2); sem isso, é o 1. Só valem os
  // números desta lista: assim ?desafio=constructor (ou outro nome que todo objeto herda) não
  // passa por desafio.
  const ENDERECO = new URLSearchParams(location.search);
  const NUMEROS = ['1', '2', '3', '4', '5', '6', '7'];
  const existeDesafio = n => NUMEROS.includes(String(n));
  const COLETIVO = ENDERECO.get('desafio') === 'V';   // a vila coletiva, com vários robôs (ver "o coletivo"): por dentro, é o desafio 'V'
  const DESAFIO = COLETIVO ? 'V' : existeDesafio(ENDERECO.get('desafio')) ? Number(ENDERECO.get('desafio')) : 1;
  const TOTAL_SALAS = 1;                       // quantas salas tem o desafio 1; completar a última é a vitória
  const OBJETOS_NO_CHAO = 3;                    // por sala; com o da cabeça do robô, o contador vai até 4
  // O tamanho de uma sala: largura (x), profundidade (z), altura (y), em metros. Nos desafios 3
  // e 4 as salas são pequenas, para o robô não gastar o jogo atravessando salões: no 3, o
  // quarto e a cozinha têm 5 m x 5 m; no 4 (a vila), cada cômodo da casa tem 4 m x 4 m. A sala
  // do quebra-cabeça (desafio 7) é do tamanho das do 3.
  const SALA = DESAFIO === 3 || DESAFIO === 7 ? { L: 5, P: 5, A: 3 } : COLETIVO || DESAFIO >= 4 ? { L: 4, P: 4, A: 2.6 } : { L: 8, P: 7, A: 3 };
  const PEQUENA = SALA.L < 8;
  const Z_ESPELHO = -SALA.P / 2;                // a parede-espelho inteira fica nesse z (-3.5 na sala grande)
  const Z_PORTA = PEQUENA ? 1.0 : 1.7, LARGURA_PORTA = 1.4, ALTURA_PORTA = 2.1;
  const ESPESSURA = 0.12;                       // da parede entre duas salas
  const PASSO = 0.5;                            // metros por comando de mover
  const GIRO = Math.PI / 4;                     // 45° por comando de virar
  const RAIO_ROBO = 0.35;
  const MARGEM_PAREDE = 0.6;                    // o braço estendido não pode atravessar o espelho
  const ALTURA_OLHOS = 1.02;
  const INCLINACAO = -0.14;                     // câmera levemente para baixo, para ver o chão perto
  const ALCANCE = 1.5;                          // distância máxima para pegar
  const INTERVALO_TECLA = 150;                  // ms entre passos com a tecla segurada
  const FRAME = { l: 960, a: 540 };             // tamanho da imagem que o comando frame devolve
  const VERMELHO = 0xff3b30, VERDE = 0x34e36a;  // luz em cima da porta: trancada / aberta

  // ---------- desafios ----------
  // Cada desafio é um jogo diferente. Os três primeiros começam na mesma sala; o 4, o 5 e o 6, numa
  // cidade pequena (a mesma nos três), cada um numa casa.
  //   1: guardar na cesta os objetos do chão e mais o que aparece na cabeça do próprio robô.
  //   2: entregar um presente a outro robô. O jogador começa de frente para o espelho e vê
  //      dois robôs: o mais próximo é o próprio reflexo; o outro está atrás dele, no fundo.
  //   3: há uma pessoa no quarto e nenhuma regra. Quem fala com ela ouve "Estou com sede".
  //      Atrás de uma porta há uma cozinha, e na geladeira há água: levá-la à pessoa é a vitória.
  //   4: uma vila pequena (ver "a vila"). O robô começa em casa, e a pessoa diz "Estou com
  //      fome". Na porta da geladeira há uma receita de bolo: um ingrediente está no armário,
  //      outro na geladeira e o terceiro tem de ser buscado no mercadinho, do outro lado da
  //      rua. Com os três na tigela a massa fica pronta; a massa vai ao forno e vira bolo;
  //      levar o bolo à pessoa é a vitória.
  //   5: a mesma cidade, vista de outra casa. O robô começa no flat da casa cor-de-rosa, onde
  //      mora uma mulher, e ela diz "Estou com dor de cabeça". O remédio está na farmácia, entre
  //      outros dois, e ela precisa também de um copo de água, que se enche no filtro da cozinha:
  //      levar a ela o remédio certo e a água é a vitória.
  //   6: a mesma cidade, da casa azul. O morador diz "Quero pão de queijo com café": o pão de
  //      queijo está na padaria, e o café se faz em casa, na cafeteira, com a água da geladeira e
  //      o pó de café do mercadinho. Levar a ele os dois é a vitória.
  //   7: um quebra-cabeça de 9 peças, numa parede: montar a figura no quadro de 3 x 3 é a vitória,
  //      e o jogo dá uma pontuação (ver "o quebra-cabeça").
  // `mensagem` é o que o jogador humano lê na tela; o que a iA recebe está em ferramentas.json.
  const DESAFIOS = {
    1: {
      mensagem: 'jogo começou',
      inicio: { z: Z_ESPELHO + 1, rumo: 4 },    // a 1 m do espelho, de costas para ele
      bracoCaido: false,                        // carrega os objetos com o braço estendido, bem à vista
      espelhoDisfarcado: false,
      salas: TOTAL_SALAS,
    },
    2: {
      mensagem: 'Dê o objeto para o robô.',
      inicio: { z: Z_ESPELHO + 2, rumo: 0 },    // a 2 m do espelho, de frente para ele
      // Carrega o presente com o braço caído: fica fora da própria visão e, no reflexo, é só
      // uma coisa pequena na mão. Assim o objeto não entrega logo de cara quem é o reflexo.
      bracoCaido: true,
      // true = espelho sem moldura, sem tom de vidro e sem a placa da sala (que aparece
      // invertida): o reflexo passa a parecer a continuação da sala.
      espelhoDisfarcado: false,
      salas: 1,
    },
    3: {
      mensagem: 'jogo começou',
      inicio: { z: Z_ESPELHO + 1, rumo: 4 },    // a 1 m do espelho, de costas para ele: vê o quarto, a pessoa e a porta
      bracoCaido: false,
      espelhoDisfarcado: false,
      salas: 2,                                 // o quarto e a cozinha, que existem as duas desde o começo
      // A porta entre as salas não depende de completar nada: é o jogador que a abre
      // (ESPACO de frente para ela), com passagem livre nos dois sentidos; e é ele que a fecha, do mesmo jeito.
      portaManual: true,
      contador: false,                          // sem contador: nada na tela sugere que exista algo a cumprir
      falas: { pedido: 'Estou com sede', agradecimento: 'Obrigado!' },
    },
    4: {
      // Aqui a dificuldade é explorar e decidir o que fazer, não descobrir os comandos: a iA
      // recebe a explicação dos botões ao começar (o texto está em ferramentas.json).
      mensagem: 'Explore a vila e decida o que fazer.',
      inicio: { x: 2, z: 1, rumo: 4, sala: 1 }, // no quarto, de frente para a pessoa, que está a dois passos
      bracoCaido: false,
      espelhoDisfarcado: false,
      salas: 5,
      vila: true,                               // o mundo é a vila (ver "a vila"), e não uma fileira de salas
      semEspelho: true,                         // na vila não há parede-espelho
      portaManual: true,                        // as portas são abertas e fechadas pelo jogador
      contador: false,
      inventario: 4,                            // quantos itens o robô carrega (ver "o inventário")
      passoDeLado: true,                        // os botões Q e E andam de lado, sem virar (como no Galinha Pong)
      falas: { pedido: 'Estou com fome', agradecimento: 'Obrigado!', recusa: 'Quero bolo!', queimado: 'Queimou!' },
    },
    5: {
      // A mesma cidade do desafio 4, vista de outra casa: o robô começa no flat da casa cor-de-rosa,
      // na rua do sul, onde mora uma mulher. Ela diz "Estou com dor de cabeça": o remédio está na
      // farmácia, na rua do leste, no meio de outros dois, e a água se pega em casa: um copo, cheio
      // no filtro da cozinha. Levar a ela o remédio certo e o copo de água é a vitória.
      // Como no 4, a iA recebe a explicação dos botões, e não o que fazer.
      mensagem: 'Explore a vila e decida o que fazer.',
      inicio: { x: 21.5, z: -4, rumo: 4, sala: 7 },   // no quarto do flat, de frente para a mulher
      bracoCaido: false,
      espelhoDisfarcado: false,
      salas: 9,
      vila: true,
      semEspelho: true,
      portaManual: true,
      contador: false,
      inventario: 4,
      passoDeLado: true,
      // (falta: o que ela diz quando já recebeu uma das duas coisas e falta a outra — o remédio ou a água)
      falas: { pedido: 'Estou com dor de cabeça', agradecimento: 'Obrigada!', recusa: 'Esse não serve!', queimado: 'Esse não serve!', falta: ['Falta o remédio', 'Falta a água para tomar'] },
    },
    6: {
      // A mesma cidade, da casa azul, na rua do leste. O morador diz "Quero pão de queijo com
      // café". O pão de queijo está na padaria; o café é feito em casa, na cafeteira, com a água
      // da geladeira e o pó de café do mercadinho. Levar a ele o pão de queijo e o café é a vitória.
      mensagem: 'Explore a vila e decida o que fazer.',
      inicio: { x: 24, z: 1, rumo: 4, sala: 11 },   // na sala da casa azul, de frente para o morador
      bracoCaido: false,
      espelhoDisfarcado: false,
      salas: 12,
      vila: true,
      semEspelho: true,
      portaManual: true,
      contador: false,
      inventario: 4,
      passoDeLado: true,
      falas: { pedido: 'Quero pão de queijo com café', agradecimento: 'Obrigado!', recusa: 'Não é isso!', queimado: 'Não é isso!', falta: ['Falta o pão de queijo', 'Falta o café'] },
    },
    7: {
      // Um quebra-cabeça: uma sala só, sem espelho à vista, com o quadro e as peças numa parede (ver
      // "o quebra-cabeça"). Como nos desafios da cidade, a iA recebe a explicação dos botões.
      mensagem: 'Monte o quebra-cabeça. (H mostra as teclas.)',
      inicio: { z: SALA.P / 2 - 1.1, rumo: 4 }, // a 1,1 m da parede do quebra-cabeça, de frente para ela: o quadro e as peças cabem inteiros na imagem
      bracoCaido: false,
      espelhoDisfarcado: false,
      salas: 1,
      contador: false,
      quebraCabeca: true,
      passoDeLado: true,                        // Q e E andam de lado e o S recua, sem virar: para chegar perto ou longe sem perder a parede de vista
    },
  };
  // A vila coletiva (V): a cidade dos desafios 4 a 6, com as três casas abertas, as três pessoas e até quatro robôs, que começam na praça.
  DESAFIOS.V = Object.assign({}, DESAFIOS[4], { coletivo: true, mensagem: 'A vila é de todos. Na praça fica a central de pedidos.', inicio: { x: 14, z: 8, rumo: 0, sala: 4 } });
  const REGRAS = Object.assign({ portaManual: false, contador: true, falas: { pedido: '', agradecimento: '' } }, DESAFIOS[DESAFIO]);
  const FALAS = REGRAS.falas;                   // o que a pessoa diz (desafios 3 e 4)
  // Variante para experimentar sem mexer no código: ...?desafio=2&disfarce
  if (ENDERECO.has('disfarce')) REGRAS.espelhoDisfarcado = true;

  // Nos desafios 1 a 3 o robô só anda para onde está olhando: ir para trás é dar meia-volta e então o passo.
  // (Na cidade — desafios 4 a 6 e a vila coletiva — é diferente: para os lados e para trás ele dá o passo
  // sem virar, e continua olhando para onde olhava. Ver mover.)
  // Valor = quantos giros de 45° antes do passo. (Virar para os lados é outro comando.)
  const GIRO_DA_DIRECAO = { 'frente': 0, 'tras': 4 };

  const centro = n => (n - 1) * SALA.L;                               // x do meio da sala n
  const salaDe = x => Math.floor((x + SALA.L / 2) / SALA.L) + 1;      // em que sala fica esse x
  const numero = n => String(n).padStart(2, '0');

  // ---------- cena ----------
  const canvas = document.getElementById('tela');
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.debug.checkShaderErrors = false;     // (não confere cada programa da placa de vídeo ao montá-lo: a conferência é só para achar erro de programa, e segura o primeiro desenho da página)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.autoClear = false;
  renderer.setClearColor(0x000000);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;        // as sombras são refeitas à mão, em desenhar()

  const cena = new T.Scene();
  const raiz = new T.Group();                   // tudo que existe no mundo (é o que se reflete)
  cena.add(raiz);
  const camera = new T.PerspectiveCamera(75, 1, 0.05, 60);
  camera.rotation.order = 'YXZ';
  const olhos = camera;                         // (outro nome para a câmera do robô, onde `camera` quer dizer a de quem olha: ver atualizarBalao)

  // Brilho e reflexos suaves nos materiais vêm de um "ambiente" simples: uma caixa do
  // tamanho da sala, com um painel de luz no teto e um chão cor de madeira.
  cena.environment = (() => {
    const amb = new T.Scene();
    const plano = (l, p, cor, y, giro) => {
      const m = new T.Mesh(new T.PlaneGeometry(l, p), new T.MeshBasicMaterial({ color: cor }));
      m.position.y = y; m.rotation.x = giro;
      amb.add(m);
    };
    amb.add(new T.Mesh(new T.BoxGeometry(8, 3, 7), new T.MeshBasicMaterial({ color: 0x4a4742, side: T.BackSide })));
    plano(3, 3, new T.Color(2.0, 1.8, 1.5), 1.45, Math.PI / 2);
    plano(8, 7, 0x5e574c, -1.49, -Math.PI / 2);
    const gerador = new T.PMREMGenerator(renderer);
    const textura = gerador.fromScene(amb, 0.04).texture;
    gerador.dispose();
    return textura;
  })();

  // Luz baixa e quente: a lâmpada do teto é fraca e as arandelas fazem poças de luz nas paredes.
  const luzGeral = new T.HemisphereLight(0xfff1e0, 0xcfc4b4, 0.38);
  raiz.add(luzGeral);
  const lampada = new T.PointLight(0xffe0b8, 2.1, 0, 0.7);   // uma só: acompanha a sala em que o robô está
  lampada.position.set(0, SALA.A - 0.35, 0);
  lampada.castShadow = true;
  lampada.shadow.mapSize.set(1024, 1024);
  lampada.shadow.camera.near = 0.1; lampada.shadow.camera.far = 14;
  lampada.shadow.bias = -0.003; lampada.shadow.normalBias = 0.03; lampada.shadow.radius = 3;
  raiz.add(lampada);

  const mat = (cor, extra) => new T.MeshStandardMaterial(Object.assign({ color: cor, roughness: 0.75, metalness: 0 }, extra));
  const luminoso = opcoes => new T.MeshBasicMaterial(Object.assign({ toneMapped: false }, opcoes));   // cor exata, sem luz nem sombra
  function malha(pai, geo, material, x, y, z) {
    const m = new T.Mesh(geo, material);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    pai.add(m);
    return m;
  }
  // Marca tudo o que for sólido e iluminado dentro de `obj` para fazer sombra.
  const fazSombra = obj => obj.traverse(m => { if (m.isMesh && m.material.isMeshStandardMaterial) m.castShadow = true; });
  // Estica o u da textura para ela se repetir uma vez por metro ao longo de `comprimento`.
  // ---------- sons ----------
  // Os efeitos sonoros do que acontece no jogo, a música do violeiro da praça e a chuva. Tudo é
  // feito na hora, com osciladores e ruído: não há arquivo de som. É só para quem assiste (a iA
  // não ouve nada, e nenhum som diz o que fazer). O navegador só deixa tocar depois de um clique
  // ou de uma tecla na página; a tecla O liga e desliga, e a escolha fica guardada.
  // São dois volumes, cada um com a sua régua na página: o da música do violeiro e o dos efeitos
  // (o que acontece no jogo, os bichos e a chuva).
  const som = (() => {
    const CHAVE = 'espelho.som', ouvinte = { x: 0, z: 0 }, ultimo = {}, cordas = {};
    const NIVEIS = 'espelho.volumes', nivel = { musica: 0.5, efeitos: 1 }, MUSICA_NO_MAXIMO = 0.3;   // (de 0 a 1, o que as réguas da página dizem; e quanto vale a música com a régua no fim)
    let ctx = null, saida = null, efeitos = null, ruidoBase = null, ligado = true, violao = null, chuva = null, proxima = 0, batida = 0;
    try { ligado = localStorage.getItem(CHAVE) !== 'desligado'; } catch (e) { }
    try {
      const guardados = JSON.parse(localStorage.getItem(NIVEIS)) || {};
      for (const qual of Object.keys(nivel)) if (Number.isFinite(guardados[qual])) nivel[qual] = Math.max(0, Math.min(1, guardados[qual]));
    } catch (e) { }
    function acordar() {
      if (!ligado) return;
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      const Contexto = window.AudioContext || window.webkitAudioContext;
      if (!Contexto) return;
      try {
        ctx = new Contexto();
        saida = ctx.createGain(); saida.gain.value = 0.5; saida.connect(ctx.destination);
        efeitos = ctx.createGain(); efeitos.gain.value = nivel.efeitos; efeitos.connect(saida);   // (os efeitos e a chuva passam por aqui; a música vai direto, com o volume dela)
        ruidoBase = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = ruidoBase.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { ctx = null; }
    }
    for (const tipo of ['pointerdown', 'keydown']) window.addEventListener(tipo, acordar, { capture: true, passive: true });
    const tocando = () => ligado && ctx && ctx.state === 'running';
    // quanto se ouve, de onde está quem ouve, de um som que acontece em `onde`
    const perto = (onde, alcance) => onde ? Math.max(0, 1 - Math.hypot(onde.x - ouvinte.x, onde.z - ouvinte.z) / alcance) ** 2 : 1;
    const envelope = (vol, t, dur) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(Math.max(0.0002, vol), t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(efeitos);
      return g;
    };
    function nota(freq, dur, vol, t, tipo, ate) {
      const o = ctx.createOscillator();
      o.type = tipo || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (ate) o.frequency.exponentialRampToValueAtTime(ate, t + dur);
      o.connect(envelope(vol, t, dur));
      o.start(t); o.stop(t + dur + 0.03);
    }
    function chiado(dur, vol, t, freq, ate, q) {
      const f = ctx.createBufferSource(), filtro = ctx.createBiquadFilter();
      f.buffer = ruidoBase; f.loop = true;
      filtro.type = 'bandpass'; filtro.Q.value = q || 1;
      filtro.frequency.setValueAtTime(freq, t);
      if (ate) filtro.frequency.exponentialRampToValueAtTime(ate, t + dur);
      f.connect(filtro); filtro.connect(envelope(vol, t, dur));
      f.start(t, Math.random()); f.stop(t + dur + 0.03);
    }
    const EFEITOS = {
      passo: (t, v) => chiado(0.07, 0.5 * v, t, 190, 110, 1.2),
      giro: (t, v) => nota(300, 0.07, 0.07 * v, t, 'triangle', 380),
      batida: (t, v) => { nota(110, 0.14, 0.5 * v, t, 'sine', 55); chiado(0.08, 0.25 * v, t, 300, 150); },
      tique: (t, v) => nota(1250, 0.03, 0.1 * v, t, 'square'),
      pegar: (t, v) => { nota(620, 0.07, 0.22 * v, t, 'triangle'); nota(930, 0.09, 0.22 * v, t + 0.06, 'triangle'); },
      soltar: (t, v) => { nota(560, 0.07, 0.2 * v, t, 'triangle'); nota(370, 0.1, 0.2 * v, t + 0.06, 'triangle'); },
      abrir: (t, v) => { chiado(0.28, 0.3 * v, t, 380, 1100, 2); nota(190, 0.06, 0.2 * v, t + 0.26, 'sine', 120); },
      fechar: (t, v) => { chiado(0.24, 0.3 * v, t, 1000, 380, 2); nota(130, 0.1, 0.4 * v, t + 0.22, 'sine', 70); },
      fala: (t, v) => { for (let i = 0; i < 5; i++) nota(210 + Math.random() * 150, 0.07, 0.16 * v, t + i * 0.085, 'triangle'); },
      recusa: (t, v) => { nota(230, 0.14, 0.12 * v, t, 'sawtooth'); nota(185, 0.2, 0.12 * v, t + 0.15, 'sawtooth'); },
      entrega: (t, v) => [523, 659, 784].forEach((f, i) => nota(f, 0.35, 0.2 * v, t + i * 0.09)),
      vitoria: (t, v) => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => nota(f, i === 5 ? 0.7 : 0.16, 0.24 * v, t + i * 0.13, 'triangle')),
      derrota: (t, v) => [392, 349, 311, 262].forEach((f, i) => nota(f, i === 3 ? 0.7 : 0.22, 0.16 * v, t + i * 0.2, 'sawtooth')),
      agua: (t, v) => { for (let i = 0; i < 9; i++) nota(500 + Math.random() * 900, 0.06, 0.1 * v, t + i * 0.06 + Math.random() * 0.03, 'sine', 300 + Math.random() * 400); },
      mistura: (t, v) => { for (let i = 0; i < 3; i++) chiado(0.12, 0.25 * v, t + i * 0.14, 500, 900, 3); },
      forno: (t, v) => { nota(150, 0.08, 0.3 * v, t, 'square', 90); nota(70, 0.6, 0.1 * v, t + 0.08, 'sawtooth'); },
      sino: (t, v) => { nota(1320, 1.1, 0.3 * v, t); nota(2640, 0.6, 0.08 * v, t); },
      cafe: (t, v) => { chiado(0.9, 0.2 * v, t, 2500, 900, 0.8); for (let i = 0; i < 6; i++) nota(260 + Math.random() * 200, 0.05, 0.08 * v, t + 0.2 + i * 0.1); },
      entrou: (t, v) => { nota(440, 0.12, 0.2 * v, t, 'triangle'); nota(660, 0.2, 0.2 * v, t + 0.1, 'triangle'); },
      saiu: (t, v) => { nota(660, 0.12, 0.2 * v, t, 'triangle'); nota(440, 0.2, 0.2 * v, t + 0.1, 'triangle'); },
      pedido: (t, v) => { nota(880, 0.12, 0.16 * v, t, 'square'); nota(880, 0.12, 0.16 * v, t + 0.2, 'square'); },
      balao: (t, v) => { nota(700, 0.05, 0.14 * v, t, 'triangle'); nota(900, 0.06, 0.14 * v, t + 0.05, 'triangle'); },
      latido: (t, v) => { for (const d of [0, 0.19]) { nota(420, 0.1, 0.3 * v, t + d, 'sawtooth', 210); chiado(0.08, 0.2 * v, t + d, 900, 500, 1.5); } },
      arrulho: (t, v) => { for (let i = 0; i < 3; i++) nota(330 - i * 12, 0.22, 0.09 * v, t + i * 0.27, 'sine', 290); },
      buzina: (t, v) => { for (const d of [0, 0.22]) { nota(440, 0.16, 0.2 * v, t + d, 'square'); nota(554, 0.16, 0.16 * v, t + d, 'square'); } },
      motor: (t, v) => { nota(62, 0.3, 0.22 * v, t, 'sawtooth', 96); chiado(0.3, 0.12 * v, t, 220, 320, 0.8); },
      cancela: (t, v) => { nota(150, 0.42, 0.1 * v, t, 'sawtooth', 250); nota(990, 0.05, 0.1 * v, t + 0.44, 'square'); },          // o motorzinho que levanta o braço, e o clique lá em cima
      cancelaFecha: (t, v) => { nota(250, 0.42, 0.1 * v, t, 'sawtooth', 150); nota(120, 0.08, 0.3 * v, t + 0.44, 'sine', 70); },   // ...e o que o desce, e a batida no apoio
      asas: (t, v) => { for (let i = 0; i < 7; i++) chiado(0.05, 0.22 * v, t + i * 0.07, 1400, 700, 1); },
    };
    // Toca um efeito. `onde` ({ x, z }): o lugar em que ele acontece, para soar mais baixo de longe.
    function efeito(nome, onde, alcance) {
      if (!tocando() || !EFEITOS[nome]) return;
      const v = perto(onde, alcance || 16), t = ctx.currentTime;
      if (v < 0.01 || t - (ultimo[nome] || -1) < 0.06) return;   // (longe demais; ou o mesmo som em seguida: uma gravação que avança de uma vez não vira uma rajada)
      ultimo[nome] = t;
      EFEITOS[nome](t + 0.005, v);
    }
    // O som de cada coisa que o jogo registra (ver resposta).
    function doQueAconteceu(comando, ok, mensagem, onde) {
      const m = String(mensagem);
      const nome = comando.startsWith('dirigir') ? (ok ? 'motor' : 'batida')
        : /^(entrou no|saiu do) carro/.test(m) ? 'fechar'
        : m.startsWith('o carro vai sozinho') ? 'motor'
        : m.startsWith('chamou o carro') ? 'pedido'
        : m.startsWith('ligou a chave') ? 'sino'
        : comando.startsWith('mover') ? (ok ? 'passo' : m.startsWith('bloqueado') ? 'batida' : '')
        : comando.startsWith('virar') || comando === 'levantar' ? (ok ? 'giro' : '')
        : comando === 'trocar' || comando === 'escolher' || comando.startsWith('escrever') ? (ok ? 'tique' : '')
        : comando !== 'pegar' ? ''
        : m.includes('venceu') ? 'vitoria'
        : m.startsWith('entregou') ? 'entrega'
        : m.startsWith('a pessoa não quis') ? 'recusa'
        : m.startsWith('a pessoa disse') || m.startsWith('a central') ? 'fala'
        : m.startsWith('pegou') || m.startsWith('tirou') ? 'pegar'
        : m.startsWith('soltou') || m.startsWith('colocou') ? 'soltar'
        : m.startsWith('abriu') ? 'abrir'
        : m.startsWith('fechou') ? 'fechar'
        : m.startsWith('encheu') ? 'agua'
        : m.includes('forno') ? 'forno'
        : /tigela|massa/.test(m) ? 'mistura'
        : /café|cafeteira/.test(m) ? 'cafe'
        : ok ? 'tique' : '';
      if (nome) efeito(nome, onde);
    }
    // Uma corda dedilhada (Karplus-Strong): um punhado de ruído que roda em círculo e vai amaciando.
    function corda(freq) {
      if (cordas[freq]) return cordas[freq];
      const sr = ctx.sampleRate, n = Math.round(sr / freq), total = Math.round(sr * 1.7), b = ctx.createBuffer(1, total, sr), d = b.getChannelData(0), linha = new Float32Array(n);
      for (let i = 0; i < n; i++) linha[i] = Math.random() * 2 - 1;
      for (let i = 1; i < n; i++) linha[i] = 0.5 * linha[i] + 0.5 * linha[i - 1];      // (menos brilho: corda de náilon)
      for (let i = 0, p = 0; i < total; i++) {
        const q = (p + 1) % n;
        d[i] = linha[p] * Math.min(1, (total - i) / (sr * 0.25));
        linha[p] = (linha[p] + linha[q]) * 0.4985;
        p = q;
      }
      return cordas[freq] = b;
    }
    // A música do violeiro, dedilhada, sem fim, em lá menor. Ele alterna duas progressões: a
    // Romanesca (dó, sol, lá menor e mi: uma volta com o mi menor, a outra com o mi maior) e a
    // cadência andaluza (lá menor, sol, fá, mi), duas voltas de cada. `volume` (0 a 1): quanto se
    // ouve dela de onde está quem ouve; com 0 ela para, e continua quando alguém chega perto.
    const DO = [131, 165, 196, 262, 330], SOL = [98, 147, 196, 247, 392], LA_MENOR = [110, 165, 220, 262, 330], MI_MENOR = [82, 165, 196, 247, 330], MI = [82, 165, 208, 247, 330], FA = [87, 175, 220, 262, 349];   // (as cordas de cada acorde, da mais grave para a mais aguda)
    const VOLTAS = [[DO, SOL, LA_MENOR, MI_MENOR], [DO, SOL, LA_MENOR, MI], [LA_MENOR, SOL, FA, MI], [LA_MENOR, SOL, FA, MI]];
    const DEDILHADO = [0, 2, 3, 4, 1, 3, 4, 3], TEMPO = 0.2;
    function musica(volume) {
      if (!ctx || ctx.state !== 'running') return;
      if (!violao) { violao = ctx.createGain(); violao.gain.value = 0; violao.connect(saida); }
      const v = ligado ? volume : 0, agora = ctx.currentTime;
      violao.gain.setTargetAtTime(v * MUSICA_NO_MAXIMO * nivel.musica, agora, 0.25);
      if (v <= 0.001) return;
      if (proxima < agora) proxima = agora + 0.05;
      while (proxima < agora + 0.25) {
        const acorde = VOLTAS[Math.floor(batida / 64) % VOLTAS.length][Math.floor(batida / 16) % 4], i = batida % 8;   // (16 notas em cada acorde, 4 acordes em cada volta)
        const f = ctx.createBufferSource(), g = ctx.createGain();
        f.buffer = corda(acorde[DEDILHADO[i]]);
        g.gain.value = i % 4 === 0 ? 0.95 : 0.55;
        f.connect(g); g.connect(violao);
        f.start(proxima);
        proxima += TEMPO * (0.97 + Math.random() * 0.06);
        batida++;
      }
    }
    // O chiado da chuva. `volume` (0 a 1): quanto chove, já descontado o telhado de quem ouve de dentro de casa.
    function chover(volume) {
      if (!ctx || ctx.state !== 'running') return;
      if (!chuva) {
        if (!ligado || volume <= 0.001) return;
        const f = ctx.createBufferSource(), filtro = ctx.createBiquadFilter();
        chuva = ctx.createGain(); chuva.gain.value = 0;
        f.buffer = ruidoBase; f.loop = true;
        filtro.type = 'highpass'; filtro.frequency.value = 1700;
        f.connect(filtro); filtro.connect(chuva); chuva.connect(efeitos);
        f.start();
      }
      chuva.gain.setTargetAtTime(ligado ? volume * 0.11 : 0, ctx.currentTime, 0.4);
    }
    // Muda um dos dois volumes ('musica' ou 'efeitos'), de 0 a 1, e guarda a escolha.
    function ajustar(qual, valor) {
      if (!(qual in nivel) || !Number.isFinite(valor)) return;
      nivel[qual] = Math.max(0, Math.min(1, valor));
      try { localStorage.setItem(NIVEIS, JSON.stringify(nivel)); } catch (e) { }
      if (qual === 'efeitos' && efeitos) efeitos.gain.setTargetAtTime(nivel.efeitos, ctx.currentTime, 0.05);
    }
    // Um som de fundo que não para (a cachoeira, a água da usina, o motor do carro): um chiado filtrado, no
    // volume dado (de 0 a 1: quanto se ouve dele de onde está quem ouve). Vai com os efeitos.
    const FUNDOS = { cachoeira: { tipo: 'bandpass', freq: 850, q: 0.35, ganho: 0.55 }, usina: { tipo: 'lowpass', freq: 300, q: 0.7, ganho: 0.6 }, motor: { tipo: 'lowpass', freq: 150, q: 3, ganho: 0.55 } }, fundos = {};
    function fundo(nome, volume) {
      if (!ctx || ctx.state !== 'running' || !FUNDOS[nome]) return;
      if (!fundos[nome]) {
        if (!ligado || volume <= 0.001) return;
        const fonte = ctx.createBufferSource(), filtro = ctx.createBiquadFilter(), g = ctx.createGain();
        fonte.buffer = ruidoBase; fonte.loop = true;
        filtro.type = FUNDOS[nome].tipo; filtro.frequency.value = FUNDOS[nome].freq; filtro.Q.value = FUNDOS[nome].q;
        g.gain.value = 0;
        fonte.connect(filtro); filtro.connect(g); g.connect(efeitos);
        fonte.start(0, Math.random());
        fundos[nome] = g;
      }
      fundos[nome].gain.setTargetAtTime(ligado ? volume * FUNDOS[nome].ganho : 0, ctx.currentTime, 0.3);
    }
    function alternar() {
      ligado = !ligado;
      try { localStorage.setItem(CHAVE, ligado ? 'ligado' : 'desligado'); } catch (e) { }
      if (ligado) acordar();
      return ligado;
    }
    return { efeito, doQueAconteceu, musica, chover, fundo, alternar, ajustar, get niveis() { return nivel; }, ouvir(x, z) { ouvinte.x = x; ouvinte.z = z; }, get ligado() { return ligado; }, get batida() { return batida; } };
  })();

  // ---------- os espelhos das casas da cidade ----------
  // Um espelho de verdade: antes de cada desenho, a cena é desenhada numa textura por uma câmera
  // posta do outro lado do vidro (a de quem olha, refletida no plano dele), e o espelho mostra
  // essa textura. Só é refeito o espelho que está perto e à vista. (Os desafios 1 a 3 têm o seu
  // próprio espelho, que é a parede inteira: ver desenhar.)
  const espelhos = [];
  function espelhar(vidroDoEspelho) {
    const alvo = new T.WebGLRenderTarget(512, 512, { type: T.HalfFloatType });
    const material = new T.ShaderMaterial({
      uniforms: { mapa: { value: alvo.texture }, matriz: { value: new T.Matrix4() }, cor: { value: new T.Color(0xe4ecef) } },
      vertexShader: 'uniform mat4 matriz; varying vec4 vOnde; void main() { vOnde = matriz * vec4(position, 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D mapa; uniform vec3 cor; varying vec4 vOnde;\nvoid main() {\n  gl_FragColor = vec4(texture2DProj(mapa, vOnde).rgb * cor, 1.0);\n  #include <tonemapping_fragment>\n  #include <colorspace_fragment>\n}',
    });
    vidroDoEspelho.material = material;
    const camera = new T.PerspectiveCamera();
    for (const c of [1, 11, 12, 13]) camera.layers.enable(c);   // (os corpos dos robôs aparecem no espelho, como em qualquer reflexo)
    espelhos.push({ malha: vidroDoEspelho, alvo, material, camera });
    return vidroDoEspelho;
  }
  const refletirEspelhos = (() => {
    const lugar = new T.Vector3(), olho = new T.Vector3(), normal = new T.Vector3(), giro = new T.Matrix4(), vista = new T.Vector3(), mira = new T.Vector3(), alvoDaMira = new T.Vector3();
    const plano = new T.Plane(), corte = new T.Vector4(), q = new T.Vector4(), campo = new T.Frustum(), junta = new T.Matrix4();
    return cam => {
      if (!espelhos.length) return;
      cam.updateMatrixWorld();
      campo.setFromProjectionMatrix(junta.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      for (const e of espelhos) {
        const m = e.malha, v = e.camera;
        lugar.setFromMatrixPosition(m.matrixWorld); olho.setFromMatrixPosition(cam.matrixWorld);
        if (lugar.distanceTo(olho) > 8 || !campo.intersectsObject(m)) continue;
        normal.set(0, 0, 1).applyMatrix4(giro.extractRotation(m.matrixWorld));
        vista.subVectors(lugar, olho);
        if (vista.dot(normal) > 0) continue;    // a câmera está atrás do espelho
        vista.reflect(normal).negate().add(lugar);
        giro.extractRotation(cam.matrixWorld);
        mira.set(0, 0, -1).applyMatrix4(giro).add(olho);
        alvoDaMira.subVectors(lugar, mira).reflect(normal).negate().add(lugar);
        v.position.copy(vista);
        v.up.set(0, 1, 0).applyMatrix4(giro).reflect(normal);
        v.lookAt(alvoDaMira);
        v.far = cam.far;
        v.updateMatrixWorld();
        v.projectionMatrix.copy(cam.projectionMatrix);
        e.material.uniforms.matriz.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(v.projectionMatrix).multiply(v.matrixWorldInverse).multiply(m.matrixWorld);
        // O plano do espelho vira o plano de corte de perto dessa câmera: o que está atrás do vidro não entra no reflexo.
        plano.setFromNormalAndCoplanarPoint(normal, lugar).applyMatrix4(v.matrixWorldInverse);
        corte.set(plano.normal.x, plano.normal.y, plano.normal.z, plano.constant);
        const p = v.projectionMatrix.elements;
        q.set((Math.sign(corte.x) + p[8]) / p[0], (Math.sign(corte.y) + p[9]) / p[5], -1, (1 + p[10]) / p[14]);
        corte.multiplyScalar(2 / corte.dot(q));
        p[2] = corte.x; p[6] = corte.y; p[10] = corte.z + 1 - 0.003; p[14] = corte.w;
        const antes = renderer.getRenderTarget();
        m.visible = false;
        renderer.setRenderTarget(e.alvo);
        renderer.clear();
        renderer.render(cena, v);
        renderer.setRenderTarget(antes);
        m.visible = true;
      }
    };
  })();

  const porMetro = (geo, comprimento) => {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * comprimento);
    return geo;
  };
  // Escurece a superfície perto das bordas, nos dois eixos dados: os cantos de uma sala
  // recebem menos luz. Vai nas cores dos vértices, então a geometria precisa de subdivisões.
  function cantosEscuros(geo, eixoU, eixoV, forca, alcance) {
    geo.computeBoundingBox();
    const p = geo.attributes.position, caixa = geo.boundingBox, cores = [];
    const claridade = (i, eixo) => {
      const v = p['get' + eixo.toUpperCase()](i);
      const falta = 1 - Math.min(1, Math.min(v - caixa.min[eixo], caixa.max[eixo] - v) / alcance);
      return 1 - forca * falta * falta;
    };
    for (let i = 0; i < p.count; i++) {
      const c = claridade(i, eixoU) * claridade(i, eixoV);
      cores.push(c, c, c);
    }
    geo.setAttribute('color', new T.Float32BufferAttribute(cores, 3));
    return geo;
  }
  // Caixa com as quinas arredondadas (raio r), que pegam um fio de luz como num objeto de verdade.
  function caixaSuave(l, a, p, r) {
    const x = l / 2 - r, y = a / 2 - r, c = r * 0.6, forma = new T.Shape();
    forma.moveTo(-x + c, -y);
    forma.lineTo(x - c, -y); forma.quadraticCurveTo(x, -y, x, -y + c);
    forma.lineTo(x, y - c); forma.quadraticCurveTo(x, y, x - c, y);
    forma.lineTo(-x + c, y); forma.quadraticCurveTo(-x, y, -x, y - c);
    forma.lineTo(-x, -y + c); forma.quadraticCurveTo(-x, -y, -x + c, -y);
    const geo = new T.ExtrudeGeometry(forma, { depth: p - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 4 });
    return geo.center();
  }
  function texturaCanvas(l, a, desenhar) {
    const c = document.createElement('canvas');
    c.width = l; c.height = a;
    desenhar(c.getContext('2d'), l, a);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  function aleatorio(semente) {                 // mulberry32: a mesma semente dá sempre a mesma sequência
    let a = semente >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Sombra de contato: uma mancha escura e difusa debaixo das coisas, que as "assenta" no
  // chão. A sombra propriamente dita vem da lâmpada.
  const texSombra = texturaCanvas(128, 128, (g, l) => {
    const r = g.createRadialGradient(l / 2, l / 2, 0, l / 2, l / 2, l / 2);
    r.addColorStop(0, 'rgba(0,0,0,0.5)'); r.addColorStop(0.55, 'rgba(0,0,0,0.28)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, l, l);
  });
  const sombraNoChao = (pai, raio, y) => {
    const s = malha(pai, new T.CircleGeometry(raio * 1.25, 32),
      new T.MeshBasicMaterial({ map: texSombra, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 0, y, 0);   // sempre por cima do piso e do tapete
    s.rotation.x = -Math.PI / 2;
    return s;
  };

  // ---------- texturas e materiais das salas (tudo desenhado aqui, sem arquivos de imagem) ----------
  // Piso: tábuas de carvalho de 17 cm x 1 m. A textura cobre 2 m x 2 m e se repete sem emenda.
  const texPiso = texturaCanvas(1024, 1024, (g, l) => {
    const fileiras = 12, alt = l / fileiras, comp = l / 2;
    const tabua = (x, y, semente) => {
      const rnd = aleatorio(semente);
      g.save();
      g.beginPath(); g.rect(x, y, comp, alt); g.clip();
      g.fillStyle = `hsl(${29 + rnd() * 7}, ${30 + rnd() * 9}%, ${34 + rnd() * 11}%)`;
      g.fillRect(x, y, comp, alt);
      for (let v = 0; v < 30; v++) {             // veios: linhas finas e onduladas, claras e escuras
        const yy = y + rnd() * alt, amp = 1 + rnd() * 3, fase = rnd() * 6.28, periodo = 120 + rnd() * 280;
        g.strokeStyle = `rgba(${rnd() < 0.6 ? '70,42,18' : '255,238,205'},${0.05 + rnd() * 0.1})`;
        g.lineWidth = 0.6 + rnd() * 1.6;
        g.beginPath();
        for (let px = 0; px <= comp; px += 16) g.lineTo(x + px, yy + Math.sin(px / periodo * 6.28 + fase) * amp);
        g.stroke();
      }
      g.fillStyle = 'rgba(40,22,8,0.55)';
      g.fillRect(x, y, 2, alt);                  // topo da tábua
      g.fillRect(x, y, comp, 2);                 // junta com a fileira de cima
      g.restore();
    };
    const rnd = aleatorio(11);
    for (let f = 0; f < fileiras; f++) {
      const x = Math.floor(rnd() * comp), y = f * alt;
      tabua(x, y, f * 2 + 100);
      tabua(x + comp, y, f * 2 + 101);
      tabua(x - comp, y, f * 2 + 101);           // a mesma tábua, do outro lado da emenda da textura
    }
  });
  // Relevo do piso: as juntas entre as tábuas são sulcos (mesma disposição da textura acima).
  const texRelevoPiso = texturaCanvas(1024, 1024, (g, l) => {
    const fileiras = 12, alt = l / fileiras, comp = l / 2, rnd = aleatorio(11);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, l, l);
    g.fillStyle = '#4a4a4a';
    for (let f = 0; f < fileiras; f++) {
      const x = Math.floor(rnd() * comp), y = f * alt;
      g.fillRect(0, y, l, 3);
      g.fillRect(x, y, 3, alt); g.fillRect(x + comp, y, 3, alt);
    }
  });
  texRelevoPiso.colorSpace = T.NoColorSpace;
  for (const t of [texPiso, texRelevoPiso]) {
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(SALA.L / 2, SALA.P / 2);
  }

  // Tapete: claro e discreto, para os objetos coloridos continuarem se destacando.
  const texTapete = texturaCanvas(900, 650, (g, l, a) => {
    const rnd = aleatorio(9);
    g.fillStyle = '#d6cebd'; g.fillRect(0, 0, l, a);
    for (let i = 0; i < 9000; i++) {             // trama do tecido
      g.fillStyle = `rgba(${rnd() < 0.5 ? '90,80,62' : '255,250,240'},${0.04 + rnd() * 0.06})`;
      g.fillRect(rnd() * l, rnd() * a, 1 + rnd() * 3, 6 + rnd() * 10);
    }
    const quadro = (m, cor, largura) => { g.strokeStyle = cor; g.lineWidth = largura; g.strokeRect(m, m, l - 2 * m, a - 2 * m); };
    quadro(34, '#8c836f', 14); quadro(62, '#b1a78f', 4); quadro(78, '#8c836f', 3);
    const losango = (rx, ry, cor, largura) => {
      g.strokeStyle = cor; g.lineWidth = largura;
      g.beginPath(); g.moveTo(l / 2, a / 2 - ry); g.lineTo(l / 2 + rx, a / 2); g.lineTo(l / 2, a / 2 + ry); g.lineTo(l / 2 - rx, a / 2); g.closePath(); g.stroke();
    };
    losango(250, 165, '#8c836f', 5); losango(205, 132, '#b1a78f', 3); losango(90, 58, '#8c836f', 3);
  });

  // Parede: 1 m de largura (repete a cada metro) por 3 m de altura. De baixo para cima:
  // lambri branco com uma almofada por metro, friso, pintura verde-sálvia e sanca branca.
  const COR_PAREDE = '#a9b6a4';
  const texParede = texturaCanvas(512, 1536, (g, l, a) => {
    const Y = h => a * (1 - h / SALA.A);         // altura em metros → y no desenho
    const rnd = aleatorio(5);
    g.fillStyle = COR_PAREDE; g.fillRect(0, 0, l, a);
    for (let i = 0; i < 4000; i++) {             // granulado leve de tinta
      g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${0.01 + rnd() * 0.02})`;
      g.fillRect(rnd() * l, rnd() * a, 2 + rnd() * 6, 2 + rnd() * 6);
    }
    g.fillStyle = '#f1eee7'; g.fillRect(0, 0, l, Y(2.9));                 // sanca
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, Y(2.9), l, 4);
    g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(0, Y(2.9) + 4, l, 10);
    const topo = Y(1.0);                                                   // lambri
    g.fillStyle = '#efece4'; g.fillRect(0, topo, l, a - topo);
    g.fillStyle = '#fbf9f4'; g.fillRect(0, topo, l, 12);                   // friso: face de cima clara...
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, topo + 24, l, 4);       // ...e sombra embaixo
    g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(0, topo + 28, l, 8);
    const x0 = 44, x1 = l - 44, y0 = Y(0.84), y1 = Y(0.2);                // almofada rebaixada
    const borda = (i, cimaEsquerda, baixoDireita) => {
      g.lineWidth = 5;
      g.strokeStyle = cimaEsquerda;
      g.beginPath(); g.moveTo(x0 + i, y1 - i); g.lineTo(x0 + i, y0 + i); g.lineTo(x1 - i, y0 + i); g.stroke();
      g.strokeStyle = baixoDireita;
      g.beginPath(); g.moveTo(x1 - i, y0 + i); g.lineTo(x1 - i, y1 - i); g.lineTo(x0 + i, y1 - i); g.stroke();
    };
    borda(0, 'rgba(0,0,0,0.2)', 'rgba(255,255,255,0.95)');
    borda(14, 'rgba(255,255,255,0.95)', 'rgba(0,0,0,0.15)');
    g.fillStyle = 'rgba(0,0,0,0.025)'; g.fillRect(x0 + 16, y0 + 16, x1 - x0 - 32, y1 - y0 - 32);
  });
  texParede.wrapS = T.RepeatWrapping;

  // Cesta: trançado de palha, que se repete em volta dela.
  const texPalha = texturaCanvas(256, 128, (g, l, a) => {
    const rnd = aleatorio(3), ch = 16, cw = 32;
    g.fillStyle = '#5f3f1c'; g.fillRect(0, 0, l, a);
    for (let r = 0; r < a / ch; r++) for (let c = -1; c <= l / cw; c++) {
      const x = c * cw + (r % 2 ? cw / 2 : 0) + 1, y = r * ch + 1;
      const tom = g.createLinearGradient(0, y, 0, y + ch - 2);
      const luz = 50 + rnd() * 10;
      tom.addColorStop(0, `hsl(33, 48%, ${luz + 12}%)`); tom.addColorStop(0.5, `hsl(32, 50%, ${luz}%)`); tom.addColorStop(1, `hsl(30, 52%, ${luz - 16}%)`);
      g.fillStyle = tom;
      g.fillRect(x, y, cw - 2, ch - 2);
    }
  });
  texPalha.wrapS = T.RepeatWrapping;
  texPalha.repeat.set(12, 1);

  // Piso da cozinha: ladrilhos de 50 cm em xadrez suave. A textura cobre 1 m x 1 m.
  const texLadrilho = texturaCanvas(512, 512, (g, l) => {
    const rnd = aleatorio(21), m = l / 2;
    for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) {
      g.fillStyle = (i + k) % 2 ? '#ddd8cc' : '#a3aca6';
      g.fillRect(i * m, k * m, m, m);
    }
    for (let i = 0; i < 2500; i++) {             // manchas leves da cerâmica
      g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${0.015 + rnd() * 0.03})`;
      g.fillRect(rnd() * l, rnd() * l, 3 + rnd() * 10, 3 + rnd() * 10);
    }
    g.fillStyle = '#86847d';                     // rejunte (metade em cada borda, para emendar ao repetir)
    g.fillRect(m - 2, 0, 4, l); g.fillRect(0, m - 2, l, 4);
    g.fillRect(0, 0, 2, l); g.fillRect(l - 2, 0, 2, l); g.fillRect(0, 0, l, 2); g.fillRect(0, l - 2, l, 2);
  });
  texLadrilho.wrapS = texLadrilho.wrapT = T.RepeatWrapping;
  texLadrilho.repeat.set(SALA.L, SALA.P);

  // Azulejos brancos da parede da bancada: a textura cobre 30 cm x 30 cm (quatro azulejos).
  const texAzulejo = texturaCanvas(256, 256, (g, l) => {
    g.fillStyle = '#f3f1ea'; g.fillRect(0, 0, l, l);
    g.fillStyle = '#c9c5ba';
    g.fillRect(l / 2 - 2, 0, 4, l); g.fillRect(0, l / 2 - 2, l, 4);
    g.fillRect(0, 0, 2, l); g.fillRect(l - 2, 0, 2, l); g.fillRect(0, 0, l, 2); g.fillRect(0, l - 2, l, 2);
  });
  texAzulejo.wrapS = texAzulejo.wrapT = T.RepeatWrapping;

  const M = {
    // parede, piso e teto usam cores de vértice (ver cantosEscuros): toda geometria com eles precisa tê-las
    parede: mat(0xffffff, { map: texParede, roughness: 0.9, vertexColors: true }),
    paredeLisa: mat(COR_PAREDE, { roughness: 0.9 }),
    piso: mat(0xffffff, { map: texPiso, bumpMap: texRelevoPiso, bumpScale: 1, roughness: 0.45, envMapIntensity: 0.7, vertexColors: true }),
    teto: mat(0xf6f4ee, { roughness: 0.95, emissive: 0xf6f4ee, emissiveIntensity: 0.1, vertexColors: true }),   // emissivo: a luz rebatida que o teto receberia
    tapete: mat(0xb9b2a4, { map: texTapete, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    globo: luminoso({ color: 0xffe6bd }),       // vidro aceso das arandelas
    arte: mat(0xffffff, { roughness: 0.8, map: texturaCanvas(480, 600, (g, l, a) => {
      g.fillStyle = '#efe6d5'; g.fillRect(0, 0, l, a);
      g.fillStyle = '#e4d8c2'; g.fillRect(36, 36, l - 72, a - 72);
      ['#28456b', '#c8553d', '#d9a441', '#ecd9b0'].forEach((cor, i) => {     // arcos: um sol se pondo
        g.fillStyle = cor; g.beginPath(); g.arc(l / 2, 380, 172 - i * 42, Math.PI, 0); g.fill();
      });
      g.fillStyle = '#28456b'; g.fillRect(68, 380, l - 136, 14);
      g.fillStyle = '#c8553d'; g.fillRect(112, 422, l - 224, 10);
      g.fillStyle = '#d9a441'; g.fillRect(156, 458, l - 312, 8);
    }) }),
    rodape: mat(0xf3f0e8, { roughness: 0.55 }),
    latao: mat(0xb9945a, { metalness: 1, roughness: 0.3 }),
    nogueira: mat(0x4b3323, { roughness: 0.45 }),
    porta: mat(0x7a5236, { roughness: 0.5 }),
    luminaria: luminoso({ color: 0xf3dcb2 }),
    palha: mat(0xffffff, { map: texPalha, side: T.DoubleSide, roughness: 0.85 }),
    palhaEscura: mat(0x7a4f24, { roughness: 0.8 }),
    fundoCesta: mat(0x8a5c2a, { roughness: 0.9 }),
    // Borda de destaque: uma casca um pouco maior que o objeto, da qual só se vê o lado de dentro.
    contorno: luminoso({ color: 0x00e5ff, side: T.BackSide }),
    // A mesma borda para o que está embutido na parede ou encostado nela (porta, geladeira),
    // onde uma casca ficaria escondida: aqui ela é uma moldura de barras acesas.
    destaque: luminoso({ color: 0x00e5ff }),
    // cozinha
    ladrilho: mat(0xffffff, { map: texLadrilho, roughness: 0.3, envMapIntensity: 0.6, vertexColors: true }),
    azulejo: mat(0xffffff, { map: texAzulejo, roughness: 0.2 }),
    inox: mat(0xc3c9ce, { metalness: 0.75, roughness: 0.38 }),
    inoxEscuro: mat(0x555b61, { metalness: 0.8, roughness: 0.35 }),
    forro: mat(0xf4f8fa, { side: T.BackSide, roughness: 0.5, emissive: 0xe6f1f8, emissiveIntensity: 0.6 }),   // o lado de dentro da geladeira, aceso
    quadro: mat(0xffffff, { roughness: 0.8, map: texturaCanvas(560, 400, (g, l, a) => {
      g.fillStyle = '#efe6d5'; g.fillRect(0, 0, l, a);                    // passe-partout creme
      g.fillStyle = '#e4d8c2'; g.fillRect(40, 40, l - 80, a - 80);
      g.fillStyle = '#c8553d'; g.beginPath(); g.arc(185, 165, 78, 0, 7); g.fill();
      g.fillStyle = '#28456b'; g.fillRect(300, 95, 170, 115);
      g.fillStyle = '#d9a441'; g.beginPath(); g.moveTo(250, 335); g.lineTo(400, 335); g.lineTo(325, 215); g.fill();
      g.strokeStyle = '#2a2622'; g.lineWidth = 6; g.beginPath(); g.moveTo(80, 320); g.lineTo(240, 262); g.stroke();
    }) }),
  };
  const contorno = (pai, geo, y, escala) => {
    const c = malha(pai, geo, M.contorno, 0, y, 0);
    c.scale.setScalar(escala);
    c.visible = false;
    return c;
  };

  // ---------- objetos pegáveis ----------
  const FORMAS = [
    { nome: 'cubo', alt: 0.24, raio: 0.17, geo: caixaSuave(0.24, 0.24, 0.24, 0.02) },
    { nome: 'bola', fem: true, alt: 0.26, raio: 0.13, geo: new T.SphereGeometry(0.13, 32, 20) },
    { nome: 'cone', alt: 0.28, raio: 0.12, geo: new T.ConeGeometry(0.12, 0.28, 32) },
    { nome: 'cilindro', alt: 0.26, raio: 0.11, geo: new T.CylinderGeometry(0.11, 0.11, 0.26, 32) },
    { nome: 'rosquinha', fem: true, alt: 0.10, raio: 0.16, geo: new T.TorusGeometry(0.11, 0.05, 16, 40).rotateX(Math.PI / 2) },
  ];
  const CORES = [
    { m: 'vermelho', f: 'vermelha', cor: 0xd8433b }, { m: 'azul', cor: 0x2f7de1 },
    { m: 'amarelo', f: 'amarela', cor: 0xf2c230 }, { m: 'verde', cor: 0x35a853 },
    { m: 'roxo', f: 'roxa', cor: 0x9b51e0 }, { m: 'laranja', cor: 0xf2801f },
    { m: 'rosa', cor: 0xf06aa8 }, { m: 'branco', f: 'branca', cor: 0xf4f4f4 },
  ];

  // O objeto que aparece em cima da cabeça do robô, em toda sala, depois que o chão fica
  // vazio: uma pirâmide cinza, que de frente (e no reflexo) aparece como um triângulo.
  const CHAPEU = { nome: 'triângulo cinza', alt: 0.26, raio: 0.15, cor: 0x8a9099,
    geo: new T.ConeGeometry(0.15, 0.26, 4).rotateY(Math.PI / 4).toNonIndexed() };
  CHAPEU.geo.computeVertexNormals();            // faces planas, sem sombreado arredondado

  // O objeto do desafio 2: uma caixinha de presente, vermelha com fita dourada.
  const PRESENTE = { nome: 'presente', alt: 0.15, raio: 0.11, geo: new T.BoxGeometry(0.15, 0.15, 0.15) };
  M.presente = mat(0xffffff, { roughness: 0.45, map: texturaCanvas(128, 128, (g, l) => {
    g.fillStyle = '#c4303a'; g.fillRect(0, 0, l, l);
    g.fillStyle = '#f0c24a'; g.fillRect(l * 0.39, 0, l * 0.22, l); g.fillRect(0, l * 0.39, l, l * 0.22);
  }) });

  // O objeto do desafio 3: uma garrafa de água. O rótulo e a tampa são peças à parte (ver
  // mobiliarCozinha). `casca` é a geometria da borda de destaque: aumentar a própria garrafa,
  // que é fina, daria uma borda quase invisível dos lados.
  const AGUA = { nome: 'água', alt: 0.30, raio: 0.06,
    geo: new T.LatheGeometry([[0, -0.15], [0.048, -0.15], [0.052, -0.14], [0.052, 0.03], [0.046, 0.06], [0.023, 0.105], [0.02, 0.115], [0.02, 0.13]]
      .map(([r, y]) => new T.Vector2(r, y)), 32),
    casca: new T.CylinderGeometry(0.08, 0.08, 0.35, 24) };

  // O que há na sala n, em coordenadas da própria sala.
  //   cesta:     onde ela fica (desafio 1)
  //   itens:     objetos do chão, cada um [forma, cor, x, z]; são OBJETOS_NO_CHAO por sala
  //   chapeu:    a sala tem o objeto que aparece na cabeça do robô (desafio 1)
  //   outroRobo: onde fica o robô que recebe o presente (desafio 2)
  //   pessoa:    onde fica a pessoa, sentada numa poltrona (desafio 3)
  //   cozinha:   a sala é a cozinha, com a geladeira e a água (desafio 3)
  // No desafio 1 a sala 1 é fixa e as seguintes são sorteadas.
  function planta(n) {
    if (DESAFIO === 2) return { itens: [], outroRobo: [1.8, 2.3] };   // no fundo, fora da linha entre o jogador e o espelho
    if (DESAFIO === 3) return n === 1 ? { itens: [], pessoa: [-1.2, SALA.P / 2 - 0.5] }   // encostada na parede do fundo
      : { itens: [], cozinha: true };
    if (DESAFIO === 7) return { itens: [], atelie: true };   // a sala do quebra-cabeça: sem espelho, com o quadro e as peças na parede do fundo
    if (n === 1) return {
      cesta: [-1.6, 2.5],                       // no fundo da sala, do lado oposto ao espelho
      itens: [[0, 0, -1.5, -1.0], [1, 1, 1.6, -1.6], [2, 2, 2.4, 1.0]],   // cubo vermelho, bola azul, cone amarelo
      chapeu: true,
    };
    const rnd = aleatorio(n * 7919);
    const pertoDaPorta = (x, z) => Math.abs(z - Z_PORTA) < 1.2 && Math.abs(x) > SALA.L / 2 - 1.8;
    const sortear = (margem, serve) => {
      for (;;) {
        const x = (rnd() - 0.5) * (SALA.L - 2 * margem), z = (rnd() - 0.5) * (SALA.P - 2 * margem);
        if (!pertoDaPorta(x, z) && serve(x, z)) return [x, z];
      }
    };
    const cesta = sortear(1.2, () => true);
    const pares = [];
    FORMAS.forEach((_, f) => CORES.forEach((_, c) => pares.push([f, c])));
    for (let i = pares.length - 1; i > 0; i--) {
      const k = Math.floor(rnd() * (i + 1));
      [pares[i], pares[k]] = [pares[k], pares[i]];
    }
    const itens = [];
    for (let i = 0; i < OBJETOS_NO_CHAO; i++) {
      const [x, z] = sortear(0.9, (x, z) => Math.hypot(x - cesta[0], z - cesta[1]) > 1.1 &&
        !itens.some(it => Math.hypot(x - it[2], z - it[3]) < 0.7));
      itens.push([pares[i][0], pares[i][1], x, z]);
    }
    return { cesta, itens, chapeu: true };
  }

  // ---------- salas ----------
  const salas = {};                             // salas que existem agora, pelo número
  let portaAberta = 0;                          // número da sala cuja porta de saída está aberta (0 = nenhuma)
  let pessoa = null;                            // a pessoa do desafio 3, quando existe
  // Móveis: retângulos no chão (x1..x2, z1..z2, absolutos) em que o robô não entra nem solta objetos.
  const blocos = [];
  // Os móveis de duas portas que o jogador abre (a geladeira; na vila, também o armário): cada
  // um tem nome, lugar (x, z: a frente dele), aberta, vis (quanto as portas já abriram, de 0 a
  // 1), folhas (as portas), contorno e dentro (os objetos que só dá para pegar com ele aberto).
  const abrem = [];
  // (um bloco com `r` é redondo, em volta de cx, cz: o ponto de encontro e os bancos da praça, por onde se passa rente)
  const noMovel = (x, z, raio) => blocos.find(b => b.r ? Math.hypot(x - b.cx, z - b.cz) < b.r + raio - 1e-9
    : x > b.x1 - raio + 1e-9 && x < b.x2 + raio - 1e-9 && z > b.z1 - raio + 1e-9 && z < b.z2 + raio - 1e-9);

  // Põe um objeto parado no mundo (x, z absolutos), como parte da sala `s`.
  function assentar(s, o, x, z, y) {
    o.x = x; o.z = z;
    s.grupo.add(o.malha);
    o.malha.position.set(x - s.cx, y, z);
  }

  function criarSala(n) {
    const { L, P, A } = SALA, cx = centro(n);
    const pl = planta(n), cozinha = !!pl.cozinha, semEspelho = cozinha || !!pl.atelie;   // (a cozinha e a sala do quebra-cabeça têm uma parede comum no lugar do espelho)
    const g = new T.Group();
    g.position.x = cx;
    raiz.add(g);

    const RODAPE = 0.12;
    // comprimento → geometria de parede (plana ou com espessura), subdividida para os cantos escuros
    const paredePlana = c => cantosEscuros(porMetro(new T.PlaneGeometry(c, A, Math.ceil(c * 3), 9), c), 'x', 'y', 0.26, 0.8);
    const paredeGrossa = c => cantosEscuros(porMetro(new T.BoxGeometry(ESPESSURA, A, c, 1, 9, Math.ceil(c * 3)), c), 'z', 'y', 0.26, 0.8);
    malha(g, cantosEscuros(new T.PlaneGeometry(L, P, 24, 21), 'x', 'y', 0.32, 1.1), cozinha ? M.ladrilho : M.piso, 0, 0, 0).rotation.x = -Math.PI / 2;
    malha(g, cantosEscuros(new T.PlaneGeometry(L, P, 24, 21), 'x', 'y', 0.22, 1.0), M.teto, 0, A, 0).rotation.x = Math.PI / 2;
    if (!cozinha) malha(g, PEQUENA ? new T.PlaneGeometry(2.6, 2.0) : new T.PlaneGeometry(3.6, 2.6), M.tapete, 0, 0.002, PEQUENA ? 0.1 : 0.2).rotation.x = -Math.PI / 2;
    malha(g, paredePlana(L), M.parede, 0, A / 2, P / 2).rotation.y = Math.PI;   // fundo
    malha(g, new T.BoxGeometry(L, RODAPE, 0.03), M.rodape, 0, RODAPE / 2, P / 2 - 0.015);
    if (semEspelho) {
      // A cozinha não tem espelho: desse lado há uma parede comum, um pouco à frente do
      // plano do espelho (assim o tom de vidro, que fica nesse plano, some atrás dela).
      malha(g, paredePlana(L), M.parede, 0, A / 2, -P / 2 + 0.012);
      malha(g, new T.BoxGeometry(L, RODAPE, 0.03), M.rodape, 0, RODAPE / 2, -P / 2 + 0.027);
    }
    if (n === 1) {                              // só a primeira sala tem parede esquerda própria
      malha(g, paredePlana(P), M.parede, -L / 2, A / 2, 0).rotation.y = Math.PI / 2;
      malha(g, new T.BoxGeometry(0.03, RODAPE, P), M.rodape, -L / 2 + 0.015, RODAPE / 2, 0);
    }
    const faceEsquerda = -L / 2 + (n === 1 ? 0 : ESPESSURA / 2), faceDireita = L / 2 - ESPESSURA / 2;

    // luminária embutida no teto: aro branco e painel aceso
    malha(g, new T.BoxGeometry(1.34, 0.03, 1.34), M.rodape, 0, A - 0.015, 0);
    malha(g, new T.PlaneGeometry(1.2, 1.2), M.luminaria, 0, A - 0.032, 0).rotation.x = Math.PI / 2;

    // O que denuncia o espelho: a moldura dele e a placa da sala, que aparece invertida.
    if (!REGRAS.espelhoDisfarcado && !semEspelho) {
      const ze = Z_ESPELHO + 0.02, mo = 0.06;   // moldura de latão em volta do espelho
      malha(g, new T.BoxGeometry(L, mo, 0.04), M.latao, 0, mo / 2, ze);
      malha(g, new T.BoxGeometry(L, mo, 0.04), M.latao, 0, A - mo / 2, ze);
      malha(g, new T.BoxGeometry(mo, A, 0.04), M.latao, faceEsquerda + mo / 2, A / 2, ze);
      malha(g, new T.BoxGeometry(mo, A, 0.04), M.latao, faceDireita - mo / 2, A / 2, ze);

      const placa = texturaCanvas(512, 160, (c, l, a) => {   // placa com o número da sala (parede do fundo)
        c.fillStyle = '#1b2c47'; c.fillRect(0, 0, l, a);
        c.strokeStyle = '#c9a45c'; c.lineWidth = 7; c.strokeRect(12, 12, l - 24, a - 24);
        c.fillStyle = '#ecdcb4'; c.font = 'bold 92px Georgia, "Times New Roman", serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('SALA ' + numero(n), l / 2, a / 2 + 6);
      });
      const xPlaca = PEQUENA ? 1.3 : 1.8;
      malha(g, new T.BoxGeometry(0.94, 0.32, 0.02), M.latao, xPlaca, 2.3, P / 2 - 0.01);
      malha(g, new T.PlaneGeometry(0.9, 0.28), mat(0xffffff, { map: placa, roughness: 0.45 }), xPlaca, 2.3, P / 2 - 0.022).rotation.y = Math.PI;
    }

    // Enfeites de uma parede lateral: um quadro com moldura de nogueira entre duas arandelas
    // de latão. `lado` é +1 na parede esquerda (olha para +x) e -1 na direita. (Na sala
    // pequena ficam mais juntos, para caberem antes do vão da porta.)
    const zQuadro = PEQUENA ? -0.75 : -1.2, zArandelas = PEQUENA ? [-1.7, 0.05] : [-2.65, 0.25];
    const enfeitar = (x, lado, tela, largura, altura) => {
      if (PEQUENA) { altura *= 1.1 / largura; largura = 1.1; }
      fazSombra(malha(g, new T.BoxGeometry(0.04, altura + 0.12, largura + 0.12), M.nogueira, x + lado * 0.02, 1.7, zQuadro));
      malha(g, new T.PlaneGeometry(largura, altura), tela, x + lado * 0.042, 1.7, zQuadro).rotation.y = lado * Math.PI / 2;
      for (const z of zArandelas) {
        const a = new T.Group();
        a.position.set(x, 1.9, z);
        g.add(a);
        malha(a, new T.CylinderGeometry(0.07, 0.07, 0.02, 24), M.latao, lado * 0.01, 0, 0).rotation.z = Math.PI / 2;
        malha(a, new T.BoxGeometry(0.13, 0.02, 0.02), M.latao, lado * 0.075, -0.01, 0);
        malha(a, new T.CylinderGeometry(0.035, 0.025, 0.05, 16), M.latao, lado * 0.14, 0.015, 0);
        malha(a, new T.SphereGeometry(0.085, 24, 16), M.globo, lado * 0.14, 0.12, 0);
        fazSombra(a);
        const luz = new T.PointLight(0xffc88a, 0.45, 4.5, 2);
        luz.position.set(lado * 0.14, 0.12, 0);
        a.add(luz);
      }
    };
    enfeitar(faceEsquerda, 1, M.quadro, 1.4, 1.0);
    if (n === REGRAS.salas) enfeitar(faceDireita, -1, M.arte, 1.1, 1.4);   // nas outras salas essa parede tem a porta

    // parede direita: lisa na última sala; nas outras, com a porta de correr que leva à sala n + 1
    const w = new T.Group();
    w.position.x = cx + L / 2;
    raiz.add(w);
    let porta = null;
    if (n === REGRAS.salas) {
      malha(w, paredeGrossa(P), M.parede, 0, A / 2, 0);
      malha(w, new T.BoxGeometry(ESPESSURA + 0.06, RODAPE, P), M.rodape, 0, RODAPE / 2, 0);
    } else {
      const z1 = Z_PORTA - LARGURA_PORTA / 2, z2 = Z_PORTA + LARGURA_PORTA / 2;
      // O rodapé para 4 mm antes do vão da porta: se a ponta dele ficasse no mesmo plano
      // que o batente, as duas superfícies disputariam os mesmos pixels e o canto piscaria.
      for (const [za, zb, ra, rb] of [[-P / 2, z1, -P / 2, z1 - 0.004], [z2, P / 2, z2 + 0.004, P / 2]]) {
        malha(w, paredeGrossa(zb - za), M.parede, 0, A / 2, (za + zb) / 2);
        malha(w, new T.BoxGeometry(ESPESSURA + 0.06, RODAPE, rb - ra), M.rodape, 0, RODAPE / 2, (ra + rb) / 2);
      }
      malha(w, new T.BoxGeometry(ESPESSURA, A - ALTURA_PORTA, LARGURA_PORTA), M.paredeLisa, 0, (A + ALTURA_PORTA) / 2, Z_PORTA);
      const folha = malha(w, new T.BoxGeometry(0.05, ALTURA_PORTA, LARGURA_PORTA), M.porta, 0, ALTURA_PORTA / 2, Z_PORTA);
      const luz = luminoso({ color: VERMELHO });   // luz em cima da porta: trancada / aberta
      for (const lado of [-1, 1]) {
        malha(folha, new T.BoxGeometry(0.02, 0.3, 0.05), M.latao, lado * 0.03, 0, 0.5);
        if (!REGRAS.portaManual) malha(w, new T.BoxGeometry(0.02, 0.09, 0.32), luz, lado * (ESPESSURA / 2 + 0.01), ALTURA_PORTA + 0.2, Z_PORTA);
      }
      porta = { folha, luz, aberta: false, vis: 0 };
      if (REGRAS.portaManual) {
        // Quem abre é o jogador: a porta passa a ser um alvo do ESPACO (nome, lugar e borda de
        // destaque, como os objetos). A borda é uma moldura fina por dentro do vão (dois montantes e a
        // travessa), no meio da parede e com uma folga dela, como a das portas da cidade (ver
        // portaDaRua). Em volta do vão, por fora, os lados dela ficavam no mesmo plano do batente: com a
        // porta aberta, o batente inteiro aparecia azul, e rasgado, porque as duas superfícies disputavam os mesmos pixels.
        const borda = new T.Group(), e = 0.07, b = 0.05, folga = 0.004, meio = LARGURA_PORTA / 2 - b / 2 - folga;
        w.add(borda);
        for (const lado of [-1, 1]) malha(borda, new T.BoxGeometry(e, ALTURA_PORTA - folga, b), M.destaque, 0, (ALTURA_PORTA - folga) / 2, Z_PORTA + lado * meio);
        malha(borda, new T.BoxGeometry(e, b, 2 * meio - b), M.destaque, 0, ALTURA_PORTA - b / 2 - folga, Z_PORTA);
        borda.visible = false;
        Object.assign(porta, { nome: 'porta', x: cx + L / 2, z: Z_PORTA, contorno: borda });
      }
    }

    // O que varia de um desafio para outro: tudo o que está em null pode não existir.
    const s = { n, cx, grupo: g, parede: w, objetos: [], porta, cesta: null, chapeu: null, outroRobo: null, presente: null,
      pessoa: null, geladeira: null, agua: null };

    if (pl.cesta) {
      s.cesta = { nome: 'cesta', x: cx + pl.cesta[0], z: pl.cesta[1], raio: 0.48, itens: [] };
      const c = new T.Group();
      c.position.set(pl.cesta[0], 0, pl.cesta[1]);
      g.add(c);
      malha(c, new T.CylinderGeometry(0.48, 0.42, 0.24, 40, 1, true), M.palha, 0, 0.12, 0);
      malha(c, new T.CircleGeometry(0.42, 40), M.fundoCesta, 0, 0.012, 0).rotation.x = -Math.PI / 2;
      malha(c, new T.TorusGeometry(0.48, 0.022, 10, 48), M.palhaEscura, 0, 0.24, 0).rotation.x = Math.PI / 2;
      for (const y of [0.08, 0.16])
        malha(c, new T.TorusGeometry(0.44 + y * 0.25, 0.008, 6, 48), M.palhaEscura, 0, y, 0).rotation.x = Math.PI / 2;
      fazSombra(c);
      sombraNoChao(c, 0.56, 0.005);
      s.cesta.contorno = contorno(c, new T.CylinderGeometry(0.525, 0.465, 0.31, 40, 1, true), 0.125, 1);
    }

    // objetos da sala; todos entram na conta do contador
    const novo = (forma, nome, material) => novoObjeto(s, forma, nome, material);
    for (const [f, k, x, z] of pl.itens) {
      const forma = FORMAS[f], cor = CORES[k];
      const o = novo(forma, `${forma.nome} ${forma.fem && cor.f || cor.m}`, mat(cor.cor, { roughness: 0.35 }));   // plástico liso
      assentar(s, o, cx + x, z, o.alt / 2);
    }
    if (pl.chapeu) {
      // O chapéu conta como objeto da sala desde o começo (o contador já o inclui), mas só
      // aparece na cabeça do robô quando todos os objetos do chão estiverem na cesta.
      s.chapeu = novo(CHAPEU, CHAPEU.nome, mat(CHAPEU.cor, { roughness: 0.35 }));
      s.chapeu.naCabeca = true;                 // fora do chão: não bloqueia o caminho nem pode ser pego ainda
      s.chapeu.apareceu = false;
    }
    if (pl.outroRobo) {
      // O robô que recebe o presente: igual ao do jogador, parado, de frente para o espelho.
      const corpo = montarRobo(true);
      corpo.grupo.position.set(pl.outroRobo[0], 0, pl.outroRobo[1]);
      g.add(corpo.grupo);
      s.outroRobo = { nome: 'outro robô', x: cx + pl.outroRobo[0], z: pl.outroRobo[1], raio: RAIO_ROBO,
        corpo, contorno: corpo.contorno, braco: 0, recebeu: null,
        receber(o) {                            // segura o presente na mão direita e agradece no peito
          corpo.grupo.add(o.malha);
          o.malha.position.set(0.31, 0.6, -0.44);
          corpo.escrever('OBRIGADO!');
        } };
      s.presente = novo(PRESENTE, PRESENTE.nome, M.presente);   // começa na mão do jogador (ver o fim do arquivo)
    }
    if (pl.pessoa) {
      // A pessoa: sentada numa poltrona, de frente para o espelho. Não diz nada até falarem com ela.
      const corpo = montarPessoa(), [x, z] = pl.pessoa;
      corpo.grupo.position.set(x, 0, z);
      g.add(corpo.grupo);
      // O alvo (x, z) fica nos joelhos, não no meio da poltrona: como o robô não chega a menos
      // de 1 m do encosto, medir daí deixaria uma faixa de alcance estreita demais. Quem não
      // deixa o robô passar é o bloco da poltrona, logo abaixo.
      s.pessoa = pessoa = { nome: 'pessoa', x: cx + x, z: z - 0.45, rosto: { x: cx + x, z: z + 0.04 }, sala: n,
        corpo, contorno: corpo.contorno, fala: '', recebeu: null,
        receber(o) {                            // fica com o objeto ao lado da mão direita, no braço da poltrona
          corpo.grupo.add(o.malha);
          o.malha.position.set(0.3, 0.64 + o.alt / 2, -0.29);
          this.fala = FALAS.agradecimento;
        } };
      blocos.push({ nome: 'poltrona', x1: cx + x - 0.42, x2: cx + x + 0.42, z1: z - 0.65, z2: P / 2 });   // inclui as pernas da pessoa
    }
    if (cozinha) mobiliarCozinha(s);
    if (pl.atelie) montarQuebraCabeca(s);
    return salas[n] = s;
  }

  // Cria um objeto pegável da sala `s` (ainda sem lugar: ver assentar, segurar e porNaCabeca).
  function novoObjeto(s, forma, nome, material) {
    const o = { nome, alt: forma.alt, raio: forma.raio };
    o.malha = new T.Mesh(forma.geo, material);
    o.malha.castShadow = o.malha.receiveShadow = true;
    o.sombra = sombraNoChao(o.malha, o.raio * 1.15, -o.alt / 2 + 0.005);
    o.contorno = forma.casca ? contorno(o.malha, forma.casca, 0, 1) : contorno(o.malha, forma.geo, 0, 1.22);
    s.objetos.push(o);
    return o;
  }

  // Um móvel de duas portas que abrem para os lados. Sem nada, é a geladeira: a gaveta do
  // congelador embaixo e o lado de dentro aceso. Com `armario` ({ corpo, porta, forro }: os
  // materiais), é um armário de despensa. A frente olha para +z e a origem é o chão, no meio do
  // móvel. Devolve o grupo, as portas (cada uma gira em torno da sua borda de fora), a borda de
  // destaque, as medidas e a altura das duas prateleiras.
  function montarMovel(armario) {
    const larg = 0.8, prof = armario ? 0.5 : 0.65, alt = 1.85, base = armario ? 0.1 : 0.62, ap = alt - base, frente = prof / 2;
    const corpo = armario ? armario.corpo : M.inox, puxador = armario ? M.latao : M.inoxEscuro;
    const f = new T.Group();
    const meio = base + (ap - 0.04) / 2;         // altura do meio do vão de dentro
    malha(f, new T.BoxGeometry(larg, base, prof - 0.05), corpo, 0, base / 2, -0.025);                      // a base (na geladeira, o corpo do congelador)
    if (!armario) {
      malha(f, caixaSuave(larg - 0.01, base - 0.08, 0.05, 0.012), M.inox, 0, base / 2 + 0.02, frente - 0.025);   // frente da gaveta
      malha(f, new T.BoxGeometry(0.5, 0.022, 0.03), M.inoxEscuro, 0, base - 0.1, frente + 0.02);           // puxador da gaveta
    }
    malha(f, new T.BoxGeometry(larg, 0.04, prof - 0.05), corpo, 0, alt - 0.02, -0.025);                    // teto
    for (const lado of [-1, 1]) malha(f, new T.BoxGeometry(0.04, ap - 0.04, prof - 0.05), corpo, lado * (larg / 2 - 0.02), meio, -0.025);
    malha(f, new T.BoxGeometry(larg - 0.08, ap - 0.04, 0.04), corpo, 0, meio, -prof / 2 + 0.02);           // fundo
    malha(f, new T.BoxGeometry(larg - 0.084, ap - 0.044, prof - 0.088), armario ? armario.forro : M.forro, 0, meio, -0.002).receiveShadow = false;   // o lado de dentro (na geladeira, branco e aceso: sem sombras)
    const prateleira = armario ? armario.corpo : mat(0xe9f1f5, { roughness: 0.2, emissive: 0xe9f1f5, emissiveIntensity: 0.25 });
    const Y1 = 1.02, Y2 = 1.42;                  // as duas prateleiras
    for (const y of [Y1, Y2]) malha(f, new T.BoxGeometry(larg - 0.09, 0.014, prof - 0.17), prateleira, 0, y, -0.03);
    const folhas = [-1, 1].map(lado => {         // cada porta gira em torno da sua borda de fora
      const eixo = new T.Group();
      eixo.position.set(lado * larg / 2, 0, frente - 0.025);
      f.add(eixo);
      malha(eixo, caixaSuave(larg / 2 - 0.006, ap - 0.012, 0.05, 0.012), armario ? armario.porta : M.inox, -lado * larg / 4, base + ap / 2, 0);
      malha(eixo, new T.BoxGeometry(0.022, 0.6, 0.03), puxador, -lado * (larg / 2 - 0.045), base + 0.5, 0.045);   // puxador
      malha(eixo, new T.BoxGeometry(larg / 2 - 0.07, ap - 0.12, 0.012), prateleira, -lado * larg / 4, base + ap / 2, -0.031);   // lado de dentro
      return eixo;
    });
    // borda de destaque: uma moldura na frente do móvel (ver M.destaque)
    const borda = new T.Group(), b = 0.035;
    f.add(borda);
    for (const lado of [-1, 1]) malha(borda, new T.BoxGeometry(b, alt, 0.02), M.destaque, lado * (larg / 2 - b / 2), alt / 2, frente + 0.005);
    for (const y of [b / 2, base, alt - b / 2]) malha(borda, new T.BoxGeometry(larg, b, 0.02), M.destaque, 0, y, frente + 0.005);
    borda.visible = false;
    return { grupo: f, folhas, borda, larg, prof, alt, base, Y1, Y2 };
  }
  // A comida que enfeita a geladeira (não dá para pegar): maçãs, uma panela, queijo e alface.
  // `semPegaveis`: sem o queijo e sem a maçã da frente, que na vila são objetos de pegar.
  function rechearGeladeira({ grupo: f, base, Y1, Y2 }, semPegaveis) {
    const comida = (geo, cor, x, y, z) => malha(f, geo, mat(cor, { roughness: 0.5 }), x, y, z);
    for (const [x, z, cor] of [[0.14, 0.1, 0xc8372d], [0.25, 0.02, 0xc8372d], [0.05, 0.0, 0x7fae3c]].slice(semPegaveis ? 1 : 0))
      comida(new T.SphereGeometry(0.042, 16, 12), cor, x, base + 0.042, z);                                // maçãs
    comida(new T.CylinderGeometry(0.09, 0.08, 0.09, 24), 0x8f989f, 0.17, Y1 + 0.052, 0.02);                // panela...
    comida(new T.CylinderGeometry(0.095, 0.095, 0.012, 24), 0x70787f, 0.17, Y1 + 0.103, 0.02);             // ...com tampa
    if (!semPegaveis) comida(new T.BoxGeometry(0.16, 0.07, 0.11), 0xf0c94a, -0.17, Y2 + 0.042, 0.03);      // queijo
    comida(new T.SphereGeometry(0.075, 16, 12), 0x5f9e45, 0.16, Y2 + 0.075, 0.0);                          // alface
  }

  // ---------- cozinha (desafio 3) ----------
  // Os móveis ficam na parede do lado do espelho (que aqui é uma parede comum): bancada com
  // pia e fogão, armário de cima e a geladeira. No fundo, uma mesa com dois bancos.
  // Coordenadas da própria sala; a frente dos móveis da bancada olha para +z.
  function mobiliarCozinha(s) {
    const { P } = SALA, zf = -P / 2, m = new T.Group();
    s.grupo.add(m);
    const armario = mat(0x4f6a72, { roughness: 0.55 }), portinha = mat(0x5d7c85, { roughness: 0.5 });
    const tampo = mat(0xe6dfd2, { roughness: 0.25 }), preto = mat(0x1d1f22, { roughness: 0.25 }), madeira = mat(0x9c7448, { roughness: 0.5 });

    // bancada, de X1 a X2
    const X1 = PEQUENA ? -2.38 : -2.9, X2 = PEQUENA ? 1.22 : 1.3, comp = X2 - X1, xm = (X1 + X2) / 2;
    malha(m, new T.BoxGeometry(comp, 0.1, 0.5), preto, xm, 0.05, zf + 0.27);              // rodapé recuado
    malha(m, new T.BoxGeometry(comp, 0.78, 0.6), armario, xm, 0.49, zf + 0.3);            // armário de baixo
    malha(m, caixaSuave(comp + 0.04, 0.04, 0.64, 0.012), tampo, xm, 0.9, zf + 0.32);      // tampo
    texAzulejo.repeat.set(comp / 0.3, 2);
    malha(m, new T.BoxGeometry(comp, 0.6, 0.02), M.azulejo, xm, 1.22, zf + 0.024);        // azulejos entre o tampo e o armário de cima
    malha(m, new T.BoxGeometry(comp, 0.7, 0.35), armario, xm, 1.9, zf + 0.175);           // armário de cima
    const portas = Math.round(comp / 0.6), lp = comp / portas;
    for (let i = 0; i < portas; i++) {
      const x = X1 + lp * (i + 0.5);
      malha(m, caixaSuave(lp - 0.03, 0.72, 0.02, 0.008), portinha, x, 0.49, zf + 0.605);
      malha(m, new T.BoxGeometry(0.12, 0.014, 0.02), M.latao, x, 0.79, zf + 0.625);
      malha(m, caixaSuave(lp - 0.03, 0.64, 0.02, 0.008), portinha, x, 1.9, zf + 0.355);
      malha(m, new T.BoxGeometry(0.014, 0.12, 0.02), M.latao, x + lp / 2 - 0.07, 1.67, zf + 0.375);
    }
    const pia = X1 + 1.0;                        // pia: cuba de inox e torneira
    malha(m, new T.BoxGeometry(0.66, 0.012, 0.44), M.inox, pia, 0.921, zf + 0.33);
    malha(m, new T.BoxGeometry(0.54, 0.012, 0.32), M.inoxEscuro, pia, 0.924, zf + 0.35);
    malha(m, new T.CylinderGeometry(0.014, 0.014, 0.26, 12), M.inox, pia, 1.05, zf + 0.12);
    malha(m, new T.CylinderGeometry(0.012, 0.012, 0.16, 12), M.inox, pia, 1.17, zf + 0.19).rotation.x = Math.PI / 2;
    const fogao = X2 - 1.1;                      // fogão: placa de vidro preto com quatro bocas
    malha(m, new T.BoxGeometry(0.62, 0.012, 0.5), preto, fogao, 0.926, zf + 0.32);
    const boca = mat(0x4a4e53, { roughness: 0.6 });
    for (const dx of [-0.15, 0.15]) for (const dz of [-0.11, 0.11])
      malha(m, new T.CylinderGeometry(0.075, 0.075, 0.006, 24), boca, fogao + dx, 0.934, zf + 0.32 + dz);
    blocos.push({ nome: 'bancada', x1: s.cx + X1, x2: s.cx + X2, z1: zf, z2: zf + 0.64 });

    // mesa no fundo, com dois bancos e uma fruteira (menor na cozinha pequena)
    const ML = PEQUENA ? 1.2 : 1.6, MP = PEQUENA ? 0.7 : 0.8;     // o tampo: largura e profundidade
    const MX = PEQUENA ? 1.45 : 1.8, MZ = P / 2 - MP / 2 - 0.05, zBancos = MZ - MP / 2 - 0.22;
    malha(m, caixaSuave(ML, 0.05, MP, 0.015), madeira, MX, 0.755, MZ);
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) malha(m, new T.BoxGeometry(0.06, 0.73, 0.06), madeira, MX + dx * (ML / 2 - 0.08), 0.365, MZ + dz * (MP / 2 - 0.08));
    for (const dx of [-ML / 4, ML / 4]) {
      malha(m, new T.CylinderGeometry(0.17, 0.17, 0.04, 24), madeira, MX + dx, 0.47, zBancos);
      malha(m, new T.CylinderGeometry(0.03, 0.03, 0.45, 12), preto, MX + dx, 0.225, zBancos);
      malha(m, new T.CylinderGeometry(0.14, 0.14, 0.02, 24), preto, MX + dx, 0.01, zBancos);
    }
    malha(m, new T.CylinderGeometry(0.17, 0.1, 0.08, 24), mat(0xf1eee6, { roughness: 0.3 }), MX, 0.82, MZ);
    const laranja = mat(0xf08a1c, { roughness: 0.6 });
    for (const [dx, dz] of [[-0.06, 0.03], [0.06, 0.03], [0, -0.06]]) malha(m, new T.SphereGeometry(0.05, 16, 12), laranja, MX + dx, 0.89, MZ + dz);
    blocos.push({ nome: 'mesa', x1: s.cx + MX - ML / 2, x2: s.cx + MX + ML / 2, z1: MZ - MP / 2 - 0.39, z2: P / 2 });

    // geladeira (ver montarMovel), com alguma comida dentro
    const GX = PEQUENA ? 1.9 : 1.8, gel = montarMovel(), f = gel.grupo, { larg, prof, Y1 } = gel;
    f.position.set(GX, 0, zf + prof / 2);
    m.add(f);
    rechearGeladeira(gel);
    // O alvo é a frente da geladeira. O bloco é mais fundo que ela, para o robô ficar fora
    // do caminho das portas quando elas abrem.
    // (olha: para que lado fica a frente, +1 = +z; e as medidas do móvel: é com elas que se confere se o robô vê o que há dentro — ver aVista)
    s.geladeira = { nome: 'geladeira', x: s.cx + GX, z: zf + prof, aberta: false, vis: 0, folhas: gel.folhas, contorno: gel.borda, dentro: [], olha: 1, larg, base: gel.base, alt: gel.alt };
    abrem.push(s.geladeira);
    blocos.push({ nome: 'geladeira', x1: s.cx + GX - larg / 2 - 0.14, x2: s.cx + GX + larg / 2 + 0.14, z1: zf, z2: zf + prof + 0.3 });

    // a água: uma garrafa na primeira prateleira, que só dá para pegar com a geladeira aberta
    const o = s.agua = novoObjeto(s, AGUA, AGUA.nome, mat(0xa9d6ff, { roughness: 0.06, envMapIntensity: 1.3 }));
    const rotulo = texturaCanvas(512, 128, (c, l, a) => {   // o mesmo desenho duas vezes: um na frente, outro atrás
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, l, a);
      c.fillStyle = '#1f6fd1'; c.fillRect(0, 0, l, 14); c.fillRect(0, a - 14, l, 14);
      c.font = 'bold 62px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (const x of [l / 4, 3 * l / 4]) c.fillText('ÁGUA', x, a / 2 + 4);
    });
    const etiqueta = malha(o.malha, new T.CylinderGeometry(0.0535, 0.0535, 0.085, 32, 1, true), mat(0xffffff, { map: rotulo, roughness: 0.6 }), 0, -0.055, 0);
    etiqueta.rotation.y = -Math.PI / 2;          // a emenda do desenho fica de lado, e a palavra, de frente
    etiqueta.castShadow = true;
    malha(o.malha, new T.CylinderGeometry(0.024, 0.024, 0.03, 20), mat(0x1f6fd1, { roughness: 0.4 }), 0, 0.135, 0).castShadow = true;
    assentar(s, o, s.cx + GX - 0.15, zf + prof - 0.2, Y1 + 0.007 + o.alt / 2);
    o.fechado = true;                            // dentro da geladeira fechada: não dá para pegar nem está no caminho
    s.geladeira.dentro.push(o);

    fazSombra(m);
  }

  // ---------- a vila (desafios 4, 5 e 6) ----------
  // Uma cidade pequena, para o robô não gastar o jogo andando. No meio, uma praça redonda com
  // o ponto de encontro e, em volta dela, a rotatória; da rotatória saem quatro ruas. Há três
  // casas em que se entra — a nossa (quarto, banheiro e cozinha), o flat da casa cor-de-rosa
  // (sala com cozinha, quarto e banheiro) e a casa azul (cozinha e sala) — e três lojas, de
  // portas abertas: o mercadinho, a farmácia e a padaria. A escola é só fachada.
  //
  //    z                               rua do norte
  //   18                           ESCOLA |  | parquinho
  //   12,5   +----------+---------+       |  |      +---------+
  //          |12 padaria|5 mercad.|       |  |      |9 farmác.|
  //    8,5   +--     ---+--     --+--  .-'    '-.  -+--     --+----
  //            rua do oeste (4)      (  a praça  )   rua do leste (4)
  //    4     -+-----+------+--===--+  '-.    .-'  -+---===---+--------+
  //           |  2  |  1   |   3   |     |  |      |10 cozinha|11 sala |   (a casa azul)
  //    0      +-----+------+-------+     |  |      +----------+--------+
  //   -1                         quintal |  = 6 sala | 7 quarto | 8 banh. |   (o flat)
  //   -5                                 |  +--------+----------+---------+
  //                                    rua do sul
  //          -2,6   0      4       8     14  16,25  19,6  22,4   25,2  26,65   x
  //   1 quarto, 2 banheiro e 3 cozinha da nossa casa; 4 a rua (as quatro ruas, a rotatória e a
  //   praça: ver CIDADE); 5 mercadinho; 6, 7 e 8 o flat; 9 farmácia; 10 e 11 a casa azul; 12
  //   padaria. Os vãos entre os cômodos e os das lojas não têm porta; a porta da rua de cada
  //   casa (= e ===) é o jogador que abre — só a da casa do desafio; as das outras ficam trancadas.
  //
  // Aqui o mundo não é uma fileira de salas iguais. Cada lugar é um retângulo (a rua, a soma de
  // vários pedaços: ver areas); o robô pode estar em qualquer ponto a mais de MARGEM_DA_VILA da
  // beirada, ou dentro de um vão aberto (livreNaVila); e o ESPACO só age no que está ao alcance
  // DENTRO do lugar em que o robô está (ver candidatos): sem isso ele pegaria coisas através
  // das paredes.
  //
  // O que há para fazer no desafio 4: o robô começa no quarto da nossa casa, e a pessoa diz
  // "Estou com fome"; a receita, na porta da geladeira, mostra os três ingredientes (farinha,
  // ovos, chocolate) e o caminho (tigela, forno, bolo). A farinha está no armário, os ovos na
  // geladeira e o chocolate, no mercadinho. Com os três na tigela a massa fica pronta; a massa,
  // levada ao forno, vira o bolo; o bolo vai para a pessoa.
  // No desafio 5: o robô começa no quarto do flat, e a mulher diz "Estou com dor de cabeça". Na
  // estante da farmácia há três remédios (xarope, analgésico, antiácido), cada um com o nome e
  // para que serve: ela quer o analgésico — e um copo de água para tomar, que se enche no
  // filtro da cozinha do flat. A vitória é quando ela recebe os dois, em qualquer ordem.
  // No desafio 6: o robô começa na sala da casa azul, e o morador diz "Quero pão de queijo com
  // café". O pão de queijo está na padaria, entre outros dois pães; o café se faz na cafeteira
  // da cozinha, com a água da geladeira e o pó de café do mercadinho. A vitória é quando ele
  // recebe o pão de queijo e o café.
  const MARGEM_DA_VILA = 0.5;
  // A cidade, do lado de fora: a praça redonda (o meio dela é x, z), a pista da rotatória em volta,
  // a calçada em volta da pista e as quatro ruas que saem dali, uma para cada lado. As medidas
  // são raios a partir do meio da praça; meiaPista e meiaRua, a metade da largura do asfalto e a
  // da rua inteira (com as calçadas); oeste, leste, sul e norte, até onde vai cada rua; alto, a
  // altura da calçada (e da praça) acima do asfalto. A rua do oeste é a da casa e do mercadinho.
  const CIDADE = { x: 14, z: 6.25, praca: 3.1, pista: 4.8, calcada: 5.7, meiaPista: 1.15, meiaRua: 2.25, oeste: -5, leste: 24.5, sul: -5.5, norte: 18, alto: 0.035 };
  // Os lugares, pelo número: { n, nome, partes, x1, x2, z1, z2, luz }. Cada cômodo é um retângulo;
  // a rua é a soma de vários pedaços (`partes`): dois retângulos, que são as ruas em cruz, e o
  // disco da rotatória ({ cx, cz, r }). x1..z2 é o retângulo que contém o lugar inteiro. `luz`:
  // onde fica a lâmpada quando o robô está ali (ou uma função que o diz: ver luzDaqui).
  const areas = {};
  // Os vãos: { nome, x, z (o meio do vão), eixo ('x': a parede fica em x = p.x; 'z': em z = p.z),
  // salas (os dois lugares que ele liga), aberta, vis, folha (a porta, se houver) e contorno }.
  const portasDaVila = [];
  // (pedidos: o que a pessoa quer — entregar tudo a ela é a vitória; filtro, copo e copoCheio: a água do desafio 5; cafeteira e cafe: o café do 6)
  const vila = { diario: [], pontos: [], cancelas: [], chave: null, bica: null, jarro: null, jarroCheio: null, carro: null, aguas: { caem: [], espumas: [], nevoas: [], parada: null }, focarSol: null, clima: null, vida: null, pessoas: [], central: null, missoes: null, pessoa: null, tigela: null, forno: null, massa: null, bolo: null, encontro: null, pedidos: [], filtro: null, copo: null, copoCheio: null, cafeteira: null, cafe: null };
  // O ponto cabe nesse pedaço, a pelo menos `m` da beirada dele?
  const cabeNaParte = (p, x, z, m) => p.r ? Math.hypot(x - p.cx, z - p.cz) <= p.r - m : x >= p.x1 + m && x <= p.x2 - m && z >= p.z1 + m && z <= p.z2 - m;
  const cabeNoLugar = (a, x, z, m) => a.partes.some(p => cabeNaParte(p, x, z, m));
  const areaEm = (x, z) => {
    for (const a of Object.values(areas)) if (cabeNoLugar(a, x, z, 0)) return a.n;
    return estado.sala;
  };
  // O ponto do lugar mais perto de (x, z) que fica a pelo menos `folga` da beirada (o próprio ponto, se já estiver dentro).
  function pontoNoLugar(a, x, z, folga) {
    let melhor = null;
    for (const p of a.partes) {
      let px, pz;
      if (p.r) { const d = Math.hypot(x - p.cx, z - p.cz), k = Math.min(1, (p.r - folga) / (d || 1)); px = p.cx + (x - p.cx) * k; pz = p.cz + (z - p.cz) * k; }
      else { px = Math.max(p.x1 + folga, Math.min(p.x2 - folga, x)); pz = Math.max(p.z1 + folga, Math.min(p.z2 - folga, z)); }
      const d = Math.hypot(px - x, pz - z);
      if (!melhor || d < melhor.d - 1e-9) melhor = { x: px, z: pz, d };
    }
    return melhor;
  }
  // A altura do chão nesse ponto: a calçada e a praça ficam um degrau acima do asfalto (e do chão das casas).
  function alturaDoChao(x, z) {
    if (!REGRAS.vila || !areas[4] || areaEm(x, z) !== 4) return 0;
    const dx = Math.abs(x - CIDADE.x), dz = Math.abs(z - CIDADE.z), r = Math.hypot(dx, dz);
    if (r < CIDADE.praca) return CIDADE.alto;
    return r < CIDADE.pista || dx < CIDADE.meiaPista || dz < CIDADE.meiaPista ? 0 : CIDADE.alto;
  }
  // O ponto está na faixa em que o robô atravessa a parede por esse vão?
  const noVaoDe = (p, x, z) => p.eixo === 'x'
    ? Math.abs(x - p.x) <= MARGEM_DA_VILA + 1e-9 && Math.abs(z - p.z) <= 0.5 + 1e-9
    : Math.abs(z - p.z) <= MARGEM_DA_VILA + 1e-9 && Math.abs(x - p.x) <= 0.5 + 1e-9;
  function livreNaVila(x, z) {
    const m = MARGEM_DA_VILA - 1e-9;
    for (const a of Object.values(areas)) if (cabeNoLugar(a, x, z, m)) return true;
    return portasDaVila.some(p => p.aberta && noVaoDe(p, x, z));
  }
  // O ESPACO, na vila: age no alvo (ver candidatos). O robô carrega até quatro itens (ver "o
  // inventário"); o que ele entrega ou coloca em algum lugar é sempre o que está na mão.
  function usarNaVila() {
    const v = vila, alvo = alvoAtual(), o = estado.segurando;
    escolhido = undefined;
    if (estado.dirigindo && estado.dirigindo.viagem) return resposta('pegar', false, 'o carro está andando');
    if (alvo && alvo.ehDestino) return viajar(alvo);
    if (alvo && alvo.ehPonto) return chamarCarro(alvo);
    if (alvo && alvo === v.chave) {             // a chave geral da vila, na hidrelétrica: só se liga (quem a desliga é a falta de luz: ver o rodízio dos pedidos)
      if (alvo.ligada) return resposta('pegar', false, 'a chave geral já está ligada');
      alvo.ligada = true;
      alvo.mostrar();
      return resposta('pegar', true, 'ligou a chave geral: a luz da vila voltou');
    }
    if (alvo && alvo === v.bica) {              // o garrafão vazio da mão sai da bica cheio de água da cachoeira (é outro objeto, como o copo no filtro)
      const cheio = v.jarroCheio;
      robo.remove(o.malha);
      o.entregue = true;
      itens[itens.indexOf(o)] = cheio;
      estado.segurando = null;
      cheio.fechado = false;
      segurar(cheio);
      return resposta('pegar', true, 'encheu o garrafão na bica');
    }
    if (alvo && alvo.ehCarro) return estado.dirigindo ? sairDoCarro() : entrarNoCarro();
    if (alvo && alvo.ehCentral) return usarACentral();
    if (alvo && alvo.ehPessoa) {
      const FALAS = alvo.falas;                 // (o que esta pessoa diz: no coletivo há três, cada uma com as suas falas)
      // A pessoa quer uma coisa (o bolo, no desafio 4) ou duas (o remédio e a água, no 5; o pão de
      // queijo e o café, no 6): alvo.pedidos. Ela aceita uma de cada vez e, enquanto falta alguma,
      // diz qual. A vitória é quando recebe a última.
      const falta = alvo.pedidos.filter(p => !alvo.recebidos.includes(p));
      if (COLETIVO && !alvo.pedindo) {          // no coletivo, quem não está pedindo nada só conversa, e não aceita nada
        alvo.fala = hora() < alvo.agradeceAte ? FALAS.agradecimento : 'Agora não preciso de nada';
        alvo.falaAte = hora() + PEDIDO.fala;
        return resposta('pegar', !o, o ? `a pessoa não quis: ${o.nome} — disse: "${alvo.fala}"` : `a pessoa disse: "${alvo.fala}"`);
      }
      if (COLETIVO && !pedidosDeTodos && alvo.com !== atual) {   // o pedido é do robô que o pegou na central: aos outros ela só diz isso
        alvo.fala = alvo.com ? 'Outro robô já vem me ajudar' : 'Fiz um pedido na central';
        alvo.falaAte = hora() + PEDIDO.fala;
        return resposta('pegar', !o, o ? `a pessoa não quis: ${o.nome} — disse: "${alvo.fala}"` : `a pessoa disse: "${alvo.fala}"`);
      }
      if (COLETIVO) alvo.falaAte = hora() + PEDIDO.fala;   // (o balão do que ela diz fica um tempo, e some)
      if (COLETIVO && alvo.tarefa) {            // o pedido que não é de trazer coisa nenhuma (a casa sem luz): está atendido quando a tarefa está feita e o robô volta para contar
        if (!alvo.tarefa()) { alvo.fala = FALAS.pedido; return resposta('pegar', true, `a pessoa disse: "${alvo.fala}"`); }
        concluirPedido(alvo);
        alvo.fala = FALAS.agradecimento;
        return resposta('pegar', true, `a pessoa disse: "${alvo.fala}" — pedido da casa ${alvo.casa} atendido`);
      }
      if (!o) {                                 // de mão vazia: fala com ela, e ela diz o que quer (ou o que ainda falta)
        alvo.fala = alvo.recebidos.length ? FALAS.falta[alvo.pedidos.indexOf(falta[0])] : FALAS.pedido;
        return resposta('pegar', true, `a pessoa disse: "${alvo.fala}"`);
      }
      if (!falta.includes(o)) {                 // ela só aceita o que pediu (e não o bolo queimado, nem o remédio errado)
        alvo.fala = o === v.queimado ? FALAS.queimado : FALAS.recusa;
        return resposta('pegar', false, `a pessoa não quis: ${o.nome} — disse: "${alvo.fala}"`);
      }
      if (falta.length > 1) {                   // ainda falta outra coisa: ela fica com esta e diz o que falta
        estado.segurando = null;
        o.entregue = true;
        o.malha.rotation.set(0, 0, 0);
        alvo.receber(o);
        tirarDoInventario(o);
        alvo.fala = FALAS.falta[alvo.pedidos.indexOf(falta.find(p => p !== o))];
        return resposta('pegar', true, `entregou: ${o.nome} à pessoa — ela disse: "${alvo.fala}"`);
      }
      if (COLETIVO) {                           // no coletivo ninguém vence: o pedido fica atendido, e daqui a um tempo ela pede de novo
        estado.segurando = null;
        o.entregue = true;
        o.malha.rotation.set(0, 0, 0);
        alvo.receber(o);
        tirarDoInventario(o);
        concluirPedido(alvo);
        return resposta('pegar', true, `entregou: ${o.nome} à pessoa — pedido da casa ${alvo.casa} atendido`);
      }
      entregar(o, alvo);
      tirarDoInventario(o);
      return resposta('pegar', true, `entregou: ${o.nome} à pessoa — venceu`);
    }
    if (alvo && portasDaVila.includes(alvo)) {  // a porta da rua: abre e fecha (fechada, ninguém passa)
      alvo.aberta = !alvo.aberta;
      return resposta('pegar', true, alvo.aberta ? 'abriu a porta' : 'fechou a porta');
    }
    if (alvo && abrem.includes(alvo)) return resposta('pegar', true, `${abrirOuFechar(alvo) ? 'abriu' : 'fechou'}: ${alvo.nome}`);
    if (alvo && alvo === v.tigela) {            // o ingrediente da mão vai para a tigela
      const t = v.tigela, a = t.itens.length * 2.1;
      tirarDoInventario(o);
      o.naCesta = true;                         // dentro da tigela: não se pega mais nem fica no caminho
      assentar(salas[t.sala], o, t.x + Math.cos(a) * 0.045, t.z + Math.sin(a) * 0.045, t.y + 0.06 + t.itens.length * 0.03);
      o.malha.scale.setScalar(0.5);
      t.itens.push(o);
      let msg = `colocou: ${o.nome} na tigela (${t.itens.length}/3)`;
      if (t.itens.length === 3) {               // os três juntos viram a massa: a tigela cheia, que agora dá para pegar
        t.itens.forEach(x => { x.malha.visible = false; });
        t.pronta = true;
        t.malha.visible = false;
        v.massa.fechado = false;
        v.massa.malha.visible = true;
        msg += ' — a massa ficou pronta';
      }
      return resposta('pegar', true, msg);
    }
    if (alvo && alvo === v.filtro) {            // o copo vazio da mão sai do filtro cheio de água (é outro objeto, que fica no lugar dele)
      const cheio = v.copoCheio;
      robo.remove(o.malha);
      o.entregue = true;
      itens[itens.indexOf(o)] = cheio;
      estado.segurando = null;
      cheio.fechado = false;
      segurar(cheio);
      return resposta('pegar', true, 'encheu o copo de água');
    }
    if (alvo && alvo === v.cafeteira) {         // a água ou o pó de café da mão vai para a cafeteira; com os dois, o café fica pronto
      const c = v.cafeteira;
      tirarDoInventario(o);
      robo.remove(o.malha);
      o.naCesta = true;                         // dentro da cafeteira: não se pega mais
      c.itens.push(o);
      let msg = `pôs: ${o.nome} na cafeteira (${c.itens.length}/2)`;
      if (c.itens.length === 2) {
        c.pronta = true;
        c.jarra.visible = true;
        v.cafe.fechado = false;
        v.cafe.malha.visible = true;
        msg += ' — o café ficou pronto';
      }
      return resposta('pegar', true, msg);
    }
    if (alvo && alvo === v.forno) {
      const f = v.forno;
      if (!f.dentro) {                          // a massa da mão vai para o forno, e o relógio dele começa a contar
        tirarDoInventario(o);
        robo.remove(o.malha);
        o.fechado = true;                       // dentro do forno: não se vê nem se pega
        f.dentro = o;
        f.desde = hora();
        return resposta('pegar', true, 'pôs a massa no forno');
      }
      // Tira do forno o que está lá. Conforme o tempo que passou (somado, se já tinha entrado
      // antes): ainda é massa, virou o bolo, ou queimou — e aí o jogo está perdido.
      if (itens.length >= REGRAS.inventario) return resposta('pegar', false, 'inventário cheio');
      const massa = f.dentro, ponto = pontoDoForno();
      massa.assado = tempoNoForno();
      if (COLETIVO && ponto === 'queimado') {   // no coletivo o bolo queimado não é o fim do jogo: vai para o lixo, e o pedido volta ao começo
        reporMissao(1);
        return resposta('pegar', false, 'o bolo queimou e foi para o lixo — os ingredientes voltaram para os lugares');
      }
      f.dentro = null;
      massa.fechado = false;
      if (ponto === 'cru') { carregar(massa); return resposta('pegar', true, `tirou a massa do forno, ainda crua (${minutos(massa.assado)})`); }
      massa.entregue = true;                    // a massa não existe mais
      const saiu = ponto === 'bom' ? v.bolo : v.queimado;
      saiu.fechado = false;
      carregar(saiu);
      if (ponto === 'queimado') perder();
      return resposta('pegar', ponto === 'bom', ponto === 'bom' ? `tirou do forno o bolo, no ponto (${minutos(massa.assado)})` : `tirou do forno o bolo queimado (${minutos(massa.assado)}) — perdeu`);
    }
    if (alvo) {                                 // um objeto ao alcance: vai para o inventário (e para a mão, se ela estava vazia)
      if (itens.length >= REGRAS.inventario) return resposta('pegar', false, 'inventário cheio');
      carregar(alvo);
      return resposta('pegar', true, `pegou: ${alvo.nome}`);
    }
    if (o) {                                    // sem alvo: solta no chão, à frente, o que está na mão
      const f = vetores(), a = areas[estado.sala], folga = o.raio + 0.1;
      const { x, z } = pontoNoLugar(a, estado.x + f.fx * 0.75, estado.z + f.fz * 0.75, folga);   // à frente, mas dentro do lugar em que o robô está
      if (noMovel(x, z, o.raio) || emJogo().some(r => Math.hypot(r.estado.x - x, r.estado.z - z) < RAIO_ROBO + o.raio) || Object.values(salas).some(q => noCaminho(q).some(p => Math.hypot(p.x - x, p.z - z) < p.raio + o.raio)))
        return resposta('pegar', false, 'sem espaço para soltar aqui');
      tirarDoInventario(o);
      assentar(salas[a.n], o, x, z, alturaDoChao(x, z) + o.alt / 2);
      o.sala = a.n;
      o.sombra.visible = true;
      return resposta('pegar', true, `soltou: ${o.nome}`);
    }
    return resposta('pegar', false, 'nada ao alcance');
  }
  // Põe um objeto no inventário. Se a mão estava vazia, ele fica na mão; senão, fica guardado.
  function carregar(o) {
    for (const m of abrem) if (m.dentro.includes(o)) m.dentro.splice(m.dentro.indexOf(o), 1);
    itens.push(o);
    if (estado.segurando) { o.sombra.visible = false; guardar(o); } else segurar(o);
  }

  // ---------- o carro ----------
  // O carro da vila anda sozinho. Nada no jogo pede que se use: é uma coisa que existe e que um
  // robô curioso pode experimentar. De frente para ele, o ESPACO entra. Lá dentro a imagem mostra
  // um mapa com os destinos — a praça, a hidrelétrica e a cachoeira —, e cada um é um alvo do
  // ESPACO (o TAB troca; o último alvo é sair do carro). Escolhido o destino, o carro vai até lá
  // pelas ruas, sem ninguém dirigir: dá a volta na rotatória, pega a estrada e para no ponto de
  // parada, de onde o robô desce a pé. Os botões de andar e de virar não fazem nada ali dentro.
  //
  // A viagem leva tempo, do relógio do jogo: onde o carro está a cada instante depende só da
  // rota e da hora (ver atualizarCarro) — assistindo à gravação, a viagem é a mesma. Enquanto
  // ele anda não se desce nem se escolhe outro destino. Com um robô a pé na frente, o carro para
  // e espera (e buzina); parado, ele barra o caminho como um móvel. Em cada ponto de parada há um
  // "ponto do carro", um totem com um botão: o ESPACO nele chama o carro, que vem vazio de onde estiver.
  // Quem vai nele vê de dentro, do banco da frente, pelo para-brisa (ver aplicarVisual); os vidros são
  // transparentes, e de fora vê-se a cabeça do robô lá dentro (ver porCorpo).
  //
  // (Nas gravações de antes da versão 8 o carro era dirigido à mão — W e S, A e D —, só no
  // asfalto da cidade: ver carroManual, naPista e dirigir.)
  // (passo: metros por segundo, na viagem; banco: quanto o robô fica acima do chão, sentado lá dentro — a cabeça na altura das
  // janelas, o resto dentro da lataria; assento: onde fica o corpo dele, em metros para a frente do meio do carro; olho: e os olhos)
  const CARRO = { meio: 1.65, lado: 0.73, folga: 0.6, raio: 0.8, saida: 1.55, descida: 1.14, passo: 11, banco: 0.14, assento: -0.03, olho: 0.15 };
  let reComMeiaVolta = false;                   // (assistindo a uma gravação de antes de o S, na cidade, recuar sem virar: ver o fim do arquivo)
  let pedidosDeTodos = false;                   // (assistindo a uma gravação do coletivo de antes de cada robô ter a sua missão: qualquer um atendia qualquer casa)
  let semCarro = false;                         // (assistindo a uma gravação de antes de o carro ser um alvo: ver o fim do arquivo)
  let prazoFixo = false;                        // (assistindo a uma gravação do coletivo da versão 7: a missão tinha um prazo fixo, de 8 minutos)
  let carroManual = false;
  let carroNaoPara = false;                     // (assistindo a uma gravação da versão 8: o carro em viagem não parava para ninguém)
  let semRodizio = false;                       // (assistindo a uma gravação do coletivo de antes da versão 9: cada casa só tinha o pedido dela)                      // (assistindo a uma gravação de antes de o carro andar sozinho)
  // Os pontos de parada. angulo: em que ponto da rotatória fica a boca da estrada de cada um (o
  // carro roda no sentido em que o ângulo cresce, e em todo ponto de parada a esquerda dele é o
  // lado de fora, onde o robô desce); x, z e rumo: onde e como o carro fica parado.
  const R_DA_PISTA = (CIDADE.praca + CIDADE.pista) / 2, QUARTO = Math.PI / 2;
  const DESTINOS = [
    { id: 'praca', nome: 'praça', sala: 4, angulo: 3 * QUARTO / 2, x: CIDADE.x + R_DA_PISTA * Math.cos(3 * QUARTO / 2), z: CIDADE.z + R_DA_PISTA * Math.sin(3 * QUARTO / 2), rumo: 1, desceADireita: true },   // (na praça desce-se para dentro dela, que é a direita do carro)
    { id: 'usina', nome: 'hidrelétrica', sala: 13, angulo: QUARTO, x: CIDADE.x, z: 90, rumo: 2, retorno: { x: CIDADE.x, z: 84, r: 6, entra: 3 * QUARTO } },
    { id: 'cachoeira', nome: 'cachoeira', sala: 14, angulo: 0, x: 106, z: CIDADE.z, rumo: 4, retorno: { x: 100, z: CIDADE.z, r: 6, entra: 2 * QUARTO } },
  ];
  for (const d of DESTINOS) Object.assign(d, { ehDestino: true, contorno: { visible: false } });
  // Um arco de círculo, do ângulo `de` ao `ate` (de < ate), em pontos a menos de um metro um do outro.
  const arco = (cx, cz, r, de, ate) => {
    const n = Math.max(2, Math.ceil((ate - de) * r / 0.8)), pontos = [];
    for (let i = 0; i <= n; i++) { const a = de + (ate - de) * i / n; pontos.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); }
    return pontos;
  };
  // A rota de um lugar ao outro: sai do ponto de parada, vai até a rotatória, roda nela até a boca
  // da outra estrada e segue até o ponto de parada de lá. `de`: 'garagem' ou o id de um destino.
  function rotaDoCarro(de, ate) {
    const C = CIDADE, FOLGA = 0.42, origem = DESTINOS.find(d => d.id === de), destino = DESTINOS.find(d => d.id === ate), pontos = [];
    const boca = a => [C.x + (R_DA_PISTA + 1.7) * Math.cos(a), C.z + (R_DA_PISTA + 1.7) * Math.sin(a)];   // onde a estrada desse ângulo encontra a rotatória
    let sai;                                                                                             // o ângulo em que o carro entra na rotatória
    if (!origem) { pontos.push([-4, 1.95], [-4, 5.2], [-2.6, C.z], boca(Math.PI)); sai = Math.PI; }      // da garagem: sai da entrada de carro e segue a rua do oeste
    else if (origem.retorno) {                                                                           // de um passeio: o resto da volta do retorno, e a estrada de volta
      const r = origem.retorno, para = r.entra - Math.PI;                                                // (o ângulo, no retorno, em que o carro fica parado: do outro lado da boca)
      pontos.push(...arco(r.x, r.z, r.r, para, r.entra - FOLGA));
      pontos.push([r.x + (r.r + 1.7) * Math.cos(r.entra), r.z + (r.r + 1.7) * Math.sin(r.entra)], boca(origem.angulo));
      sai = origem.angulo;
    } else { pontos.push([origem.x, origem.z]); sai = origem.angulo; }                                   // da praça: já está na rotatória
    let chega = destino.angulo;
    while (chega <= sai + 1e-6) chega += 2 * Math.PI;
    pontos.push(...arco(C.x, C.z, R_DA_PISTA, sai + (origem && !origem.retorno ? 0 : FOLGA), chega - (destino.retorno ? FOLGA : 0)));
    if (destino.retorno) {                                                                               // a estrada até o retorno, e meia volta nele até o ponto de parada
      const r = destino.retorno;
      pontos.push(boca(destino.angulo), [r.x + (r.r + 1.7) * Math.cos(r.entra), r.z + (r.r + 1.7) * Math.sin(r.entra)]);
      pontos.push(...arco(r.x, r.z, r.r, r.entra + FOLGA, r.entra + 2 * QUARTO));
    }
    // arredonda as quinas (duas passadas, cortando cada canto) e mede o caminho
    let linha = pontos;
    for (let vez = 0; vez < 2; vez++) {
      const nova = [linha[0]];
      for (let i = 0; i + 1 < linha.length; i++) {
        const [ax, az] = linha[i], [bx, bz] = linha[i + 1];
        nova.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
      }
      nova.push(linha[linha.length - 1]);
      linha = nova;
    }
    const soma = [0];
    for (let i = 1; i < linha.length; i++) soma.push(soma[i - 1] + Math.hypot(linha[i][0] - linha[i - 1][0], linha[i][1] - linha[i - 1][1]));
    return { pontos: linha, soma, total: soma[soma.length - 1] };
  }
  // Onde fica o ponto que está a `s` metros do começo da rota.
  function pontoDaRota(v, s) {
    const d = Math.max(0, Math.min(v.total, s));
    let i = v.ultimo || 1;
    while (i > 1 && v.soma[i - 1] > d) i--;
    while (i < v.soma.length - 1 && v.soma[i] < d) i++;
    v.ultimo = i;
    const u = (d - v.soma[i - 1]) / Math.max(1e-9, v.soma[i] - v.soma[i - 1]), a = v.pontos[i - 1], b = v.pontos[i];
    return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u };
  }
  // A viagem tem o seu relógio (`tau`), que só anda quando o carro anda: ele sai e chega devagar, e
  // PARA se houver um robô a pé na frente (ver atualizarCarro). Onde ele está, com `tau` milissegundos de viagem:
  const caminhoAndado = (v, tau) => { const u = Math.max(0, Math.min(1, tau / v.dura)); return v.total * u * u * (3 - 2 * u); };
  function poseDoCarro(v, tau) {
    const s = caminhoAndado(v, tau), aqui = pontoDaRota(v, s), atras = pontoDaRota(v, s - 1.1), adiante = pontoDaRota(v, s + 1.1);
    let yaw = Math.atan2(-(adiante.x - atras.x), -(adiante.z - atras.z));
    while (yaw - v.yaw > Math.PI) yaw -= 2 * Math.PI;                  // (sem dar a volta ao passar de 180 graus)
    while (v.yaw - yaw > Math.PI) yaw += 2 * Math.PI;
    v.yaw = yaw;
    return { x: aqui.x, z: aqui.z, yaw, chegou: tau >= v.dura };
  }
  // O carro sai para um destino: com quem está nele (ver viajar) ou vazio, chamado de um ponto (ver chamarCarro).
  function partir(c, destino, chamou) {
    const rota = rotaDoCarro(c.onde, destino.id);
    c.viagem = Object.assign(rota, { desde: hora(), ultima: hora(), tau: 0, dura: Math.round((rota.total / CARRO.passo + 1.6) * 1000), destino, yaw: c.rumo * GIRO, ultimo: 1, parado: false, chamou: chamou || null });
    c.onde = destino.id;
  }
  // O ESPACO num destino, dentro do carro parado: a viagem começa.
  function viajar(destino) {
    partir(estado.dirigindo, destino);
    escolhido = undefined;
    return resposta('pegar', true, `o carro vai sozinho para: ${destino.nome}`);
  }
  // O ESPACO num ponto do carro (há um em cada ponto de parada: na praça, na hidrelétrica e na
  // cachoeira): chama o carro, que vem vazio de onde estiver, como um carro de aplicativo.
  function chamarCarro(ponto) {
    const c = vila.carro, d = ponto.destino;
    escolhido = undefined;
    if (c.viagem) return resposta('pegar', false, c.viagem.destino === d ? 'o carro já está vindo' : 'o carro está em viagem: tente daqui a pouco');
    if (c.motorista) return resposta('pegar', false, 'o carro está ocupado');
    if (c.onde === d.id) return resposta('pegar', false, 'o carro já está aqui');
    partir(c, d, estado);
    return resposta('pegar', true, 'chamou o carro: ele está vindo');
  }
  // Põe o carro onde ele está agora, na viagem; e, chegando, no ponto de parada. Depende só do
  // relógio do jogo e de onde os robôs estão (que só muda a cada botão): por isso é conferido antes
  // de cada botão e a cada quadro, e assistindo à gravação a viagem é a mesma.
  // O carro para se tiver robô na frente: de 25 em 25 cm do caminho adiante, confere se há um robô a
  // pé a menos de 1,1 m dali; havendo, ele vai só até 2,4 m antes desse ponto, e espera (e buzina).
  let buzinou = 0;
  function atualizarCarro() {
    const c = vila.carro;
    if (!c || !c.viagem) return;
    const v = c.viagem, agora = hora(), dono = c.motorista, d = v.destino, PASSO_DA_ROTA = 0.25, FRENTE = 2.4;
    let tau = Math.min(v.dura, v.tau + Math.max(0, agora - v.ultima));
    v.ultima = agora;
    const aPe = carroNaoPara ? [] : (COLETIVO ? emJogo().map(r => r.estado) : [estado]).filter(e => e.dirigindo !== c);
    const de = caminhoAndado(v, v.tau), ate = caminhoAndado(v, tau);
    v.parado = false;
    for (let k = Math.ceil((de + 0.9) / PASSO_DA_ROTA); aPe.length && k * PASSO_DA_ROTA <= ate + FRENTE && k * PASSO_DA_ROTA <= v.total; k++) {
      const p = pontoDaRota(v, k * PASSO_DA_ROTA);
      if (!aPe.some(e => Math.hypot(e.x - p.x, e.z - p.z) < 1.1)) continue;
      const limite = Math.max(de, k * PASSO_DA_ROTA - FRENTE);          // até onde dá para ir sem chegar no robô
      if (limite < ate) {                                               // (acha a hora da viagem em que o carro está nesse ponto)
        let a = v.tau, b = tau;
        for (let i = 0; i < 32; i++) { const m = (a + b) / 2; if (caminhoAndado(v, m) <= limite) a = m; else b = m; }
        tau = a;
        v.parado = true;
      }
      break;
    }
    v.tau = tau;
    const p = poseDoCarro(v, tau);
    Object.assign(c, { x: p.x, z: p.z, yaw: p.yaw });
    if (p.chegou) {
      const rumo = d.rumo + 8 * Math.round((p.yaw / GIRO - d.rumo) / 8);   // (o mesmo rumo do ponto de parada, sem o carro girar de volta)
      Object.assign(c, { x: d.x, z: d.z, rumo, yaw: rumo * GIRO, viagem: null, sala: d.sala });   // (sala: o lugar em que ele está parado, para ser alvo de quem está ali)
      if (dono) Object.assign(dono, { rumo, sala: d.sala });
    }
    if (dono) Object.assign(dono, { x: c.x, z: c.z });
    else { c.grupo.position.set(c.x, 0, c.z); c.grupo.rotation.y = c.yaw + Math.PI / 2; }   // (vazio — chamado de um ponto, ou quem ia nele saiu do jogo no caminho —, o carro segue sozinho)
    c.assentar();
    if (v.parado && performance.now() - buzinou > 5000) { buzinou = performance.now(); som.efeito('buzina', c, 30); }
    if ((p.chegou || v.parado !== v.avisado) && (dono === estado || v.chamou === estado)) { v.avisado = v.parado; marcarAlvos(); desenharMissao(); desenharMapa(); }   // (o selo e o mapa de quem vai nele, ou de quem o chamou)
  }
  // O meio do carro pode estar nesse ponto? (dirigido à mão: o asfalto da cidade, com uma folga para as rodas)
  function naPista(x, z) {
    const C = CIDADE, d = Math.hypot(x - C.x, z - C.z), fora = d >= C.praca + 0.4;
    return (fora && Math.abs(z - C.z) <= CARRO.folga && x >= -4.5 && x <= C.leste - 1.8)
      || (fora && Math.abs(x - C.x) <= CARRO.folga && z >= C.sul + 1.8 && z <= C.norte - 1.8)
      || (d >= C.praca + 0.4 && d <= C.pista - 0.4)
      || (x >= -4.5 && x <= -3.5 && z >= 1.9 && z <= C.z);
  }
  // O que não deixa o carro, dirigido à mão, ir para (x, z): '' se nada.
  function barraOCarro(c, x, z) {
    if (!naPista(x, z)) return 'o carro só anda no asfalto';
    const r = CARRO.raio, b = blocos.find(q => !c.barras.includes(q) && (q.r ? Math.hypot(x - q.cx, z - q.cz) < q.r + r : x > q.x1 - r && x < q.x2 + r && z > q.z1 - r && z < q.z2 + r));
    if (b) return `${b.nome} no caminho`;
    if (emJogo().some(q => q.estado !== estado && Math.hypot(q.estado.x - x, q.estado.z - z) < r + RAIO_ROBO + 0.1)) return 'robô no caminho';
    for (const s of Object.values(salas)) for (const o of noCaminho(s)) if (Math.hypot(o.x - x, o.z - z) < r + o.raio) return `${o.nome} no caminho`;
    return '';
  }
  // W e S, dentro do carro dirigido à mão: um passo para a frente ou de ré.
  function dirigir(direcao) {
    const c = estado.dirigindo, sentido = direcao === 'frente' ? 1 : direcao === 'tras' ? -1 : 0;
    if (!sentido) return resposta(`dirigir ${direcao}`, false, 'o carro não anda de lado');
    const a = estado.rumo * GIRO, x = c.x - Math.sin(a) * PASSO * sentido, z = c.z - Math.cos(a) * PASSO * sentido, motivo = barraOCarro(c, x, z);
    escolhido = undefined;
    if (motivo) return resposta(`dirigir ${direcao}`, false, `bloqueado: ${motivo}`);
    Object.assign(c, { x, z });
    Object.assign(estado, { x, z });
    c.assentar();
    return resposta(`dirigir ${direcao}`, true, 'ok');
  }
  function entrarNoCarro() {
    const c = vila.carro;
    if (c.motorista) return resposta('pegar', false, 'o carro já tem motorista');
    Object.assign(estado, { dirigindo: c, x: c.x, z: c.z, rumo: c.rumo });
    Object.assign(visual, { x: c.x, z: c.z, yaw: c.rumo * GIRO });   // (o carro não sai do lugar para buscar o robô)
    c.motorista = estado;                       // (o corpo dele vai sentado lá dentro, à vista pelos vidros: ver porCorpo)
    return resposta('pegar', true, 'entrou no carro');
  }
  function sairDoCarro() {
    const c = estado.dirigindo, a = estado.rumo * GIRO, fx = -Math.sin(a), fz = -Math.cos(a);
    if (c.viagem) return resposta('pegar', false, 'o carro está andando');
    // ao lado da porta do motorista (a esquerda de quem vai nele) ou, se não der, do outro lado; por último, atrás ou na frente do carro
    const lado = carroManual ? CARRO.saida : CARRO.descida, ponta = CARRO.meio + 0.75;
    const mao = (DESTINOS.find(d => d.id === c.onde) || {}).desceADireita ? -1 : 1;   // (o lado de descer, no ponto de parada em que o carro está)
    const vagas = [[fz * lado * mao, -fx * lado * mao], [-fz * lado * mao, fx * lado * mao]].concat(carroManual ? [] : [[-fx * ponta, -fz * ponta], [fx * ponta, fz * ponta]]);
    const vaga = vagas.map(([dx, dz]) => ({ x: c.x + dx, z: c.z + dz }))
      .find(p => livre(p.x, p.z) && !emJogo().some(q => q.estado !== estado && Math.hypot(q.estado.x - p.x, q.estado.z - p.z) < 2 * RAIO_ROBO));
    if (!vaga) return resposta('pegar', false, 'sem espaço para sair do carro aqui');
    largarOCarro(estado);
    Object.assign(estado, { x: vaga.x, z: vaga.z });
    estado.sala = areaEm(vaga.x, vaga.z);
    Object.assign(visual, { x: vaga.x, z: vaga.z });
    return resposta('pegar', true, 'saiu do carro');
  }
  // O carro fica onde está, sem ninguém (quem ia nele desceu, ou saiu do jogo).
  function largarOCarro(dele) {
    const c = dele.dirigindo;
    if (!c) return;
    c.motorista = null;
    if (!c.viagem) Object.assign(c, { rumo: dele.rumo, yaw: dele.rumo * GIRO });
    c.assentar();
    dele.dirigindo = null;
  }
  // As cancelas das duas estradas ficam fechadas. Cada uma abre um pouco antes de o carro passar por
  // ela, e fecha depois que ele passou. É só o que se vê (e se ouve): a pé não se passa delas de jeito
  // nenhum, e o carro não espera por elas. O braço acompanha o relógio da viagem: assistindo à
  // gravação, abre e fecha nas mesmas horas.
  //   aberta: o ângulo do braço em pé (quase a prumo: mais deitado, ele passaria na frente da placa da estrada, que fica logo atrás);
  //   antes: abre quando falta esse tempo, em milissegundos, para o carro chegar; depois: fecha quando a traseira dele está a esses metros;
  //   giro: radianos por segundo, subindo e descendo
  const CANCELA = { aberta: 1.5, antes: 1400, depois: 1.2, giro: 3.4 };
  function animarCancelas(dt) {
    const v = vila.carro && vila.carro.viagem;
    for (const k of vila.cancelas) {
      let abrir = false;
      if (v) {
        if (!v.cancelas) v.cancelas = new Map();
        if (!v.cancelas.has(k)) {                 // a quantos metros do começo da rota fica esta cancela (null: a rota não passa por ela)
          let onde = null;
          for (let i = 1; i < v.pontos.length && onde === null; i++) {
            const [ax, az] = v.pontos[i - 1], [bx, bz] = v.pontos[i], lx = bx - ax, lz = bz - az;
            const u = Math.max(0, Math.min(1, ((k.x - ax) * lx + (k.z - az) * lz) / Math.max(1e-9, lx * lx + lz * lz)));
            if (Math.hypot(ax + lx * u - k.x, az + lz * u - k.z) < 1) onde = v.soma[i - 1] + (v.soma[i] - v.soma[i - 1]) * u;
          }
          v.cancelas.set(k, onde);
        }
        const onde = v.cancelas.get(k);
        abrir = onde !== null && caminhoAndado(v, v.tau + CANCELA.antes) >= onde - CARRO.meio && caminhoAndado(v, v.tau) <= onde + CARRO.meio + CANCELA.depois;
      }
      if (abrir !== k.abrindo) { k.abrindo = abrir; som.efeito(abrir ? 'cancela' : 'cancelaFecha', k, 26); }
      const falta = (abrir ? CANCELA.aberta : 0) - k.aberta;
      if (!falta) continue;
      k.aberta += Math.max(-CANCELA.giro * dt, Math.min(CANCELA.giro * dt, falta));
      k.eixo.rotation.z = k.aberta;
    }
  }
  // As águas dos passeios, que correm (o lago, o rio e o poço, devagar; o vertedouro e a cachoeira, caindo), a espuma e a névoa.
  function animarAguas(t, dt) {
    const a = vila.aguas;
    if (!a.parada) return;
    a.parada.offset.set(t * 0.012 % 1, t * 0.02 % 1);
    for (const q of a.caem) q.textura.offset.y = (q.textura.offset.y + q.quanto * dt) % 1;
    a.espumas.forEach((m, i) => { const s = 1 + 0.28 * Math.sin(t * 5.3 + i * 1.7); m.scale.set(s, 0.55 + 0.2 * Math.sin(t * 6.1 + i), s); });
    for (const n of a.nevoas) {
      const u = (t * 0.16 + n.vez) % 1;
      n.sprite.position.set(127.2 - u * 3.2, 0.8 + u * 5.5, n.z + Math.sin(u * 6 + n.vez * 9) * 0.5);
      n.sprite.scale.setScalar(2.2 + u * 4.5);
      n.sprite.material.opacity = 0.55 * Math.sin(u * Math.PI);
    }
  }

  // ---------- o relógio e o forno (desafio 4) ----------
  // O bolo leva tempo: a massa tem de ficar no forno pelo menos ASSAR.pronto e sai queimada se
  // passar de ASSAR.queima. Esse tempo é o do relógio de verdade (em milissegundos, desde que a
  // página abriu). Para a gravação refazer a mesma partida, cada botão vale na hora em que foi
  // apertado: ao vivo, a hora do aperto é a que vai para a gravação; ao assistir, é a hora
  // gravada (ver horaDaJogada). O painel em cima do fogão mostra o relógio e o tempo de forno.
  const ASSAR = { pronto: 2 * 60000, queima: 5 * 60000 };
  {
    // Para experimentar outros tempos (e para os testes): ?assar=120,300, em segundos. O tempo
    // usado vai no resumo da gravação, e quem assiste a ela usa o mesmo (ver o fim do arquivo).
    const m = /^(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)$/.exec(ENDERECO.get('assar') || '');
    if (m && Number(m[1]) > 0 && Number(m[2]) > Number(m[1])) { ASSAR.pronto = Number(m[1]) * 1000; ASSAR.queima = Number(m[2]) * 1000; }
  }
  const NASCEU = performance.now();
  let horaDaJogada = null, horaGravada = 0;     // a hora do botão que está sendo apertado; e, ao assistir, a hora a que a gravação chegou
  const hora = () => horaDaJogada != null ? horaDaJogada : ASSISTINDO ? horaGravada : performance.now() - NASCEU;
  const minutos = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  // Há quanto tempo a massa está no forno (somando o que ela já tinha ficado antes), e em que ponto ela está.
  const tempoNoForno = () => vila.forno && vila.forno.dentro ? (vila.forno.dentro.assado || 0) + Math.max(0, hora() - vila.forno.desde) : 0;
  const pontoDoForno = () => { const t = tempoNoForno(); return t < ASSAR.pronto ? 'cru' : t < ASSAR.queima ? 'bom' : 'queimado'; };
  // O bolo queimou (passou do tempo dentro do forno, ou saiu de lá queimado): o jogo está perdido, e é preciso começar de novo.
  function perder() {
    if (estado.perdeu || estado.ganhou) return;
    estado.perdeu = true;
    faixaDaDerrota.visible = true;
    som.efeito('derrota', estado);
  }
  // A cada quadro: o painel do fogão (quando o segundo muda) e o bolo que queima sozinho se ficar esquecido no forno.
  function tiqueDoForno() {
    const f = vila.forno;
    if (!f) return;
    const ponto = f.dentro ? pontoDoForno() : '';
    if (ponto !== f.ponto) { if (ponto === 'bom' && f.ponto === 'cru') som.efeito('sino', f); f.ponto = ponto; }   // (o sino do forno: o bolo ficou pronto)
    if (ponto === 'queimado' && !COLETIVO) perder();   // (no coletivo ninguém perde: o bolo queimado vai para o lixo: ver usarNaVila e atualizarPedidos)
    f.aceso.visible = !!f.dentro;
    f.aceso.material.color.set(ponto === 'queimado' ? 0xff3b1f : 0xffa23a);
    const texto = `${minutos(hora())}|${f.dentro ? minutos(tempoNoForno()) : '--:--'}|${ponto}`;
    if (texto === f.mostrando) return;
    f.mostrando = texto;
    const c = f.painel.image, g = c.getContext('2d'), l = c.width, a = c.height;
    g.fillStyle = '#0b0f12'; g.fillRect(0, 0, l, a);
    g.textBaseline = 'middle';
    for (const [nome, valor, y, cor] of [['RELÓGIO', minutos(hora()), a * 0.28, '#e8eef2'], ['FORNO', f.dentro ? minutos(tempoNoForno()) : '--:--', a * 0.73, ponto === 'queimado' ? '#ff5a4d' : ponto === 'bom' ? '#7dffb0' : '#ffb347']]) {
      g.fillStyle = '#9fb0ba'; g.font = 'bold 44px Bahnschrift, Arial, sans-serif'; g.textAlign = 'left'; g.fillText(nome, 26, y + 3);
      g.fillStyle = cor; g.font = 'bold 92px Consolas, "Courier New", monospace'; g.textAlign = 'right'; g.fillText(valor, l - 24, y + 5);
    }
    f.painel.needsUpdate = true;
  }

  // Monta a vila inteira: os lugares, as paredes, os móveis, a rua, as fachadas e os objetos.
  function criarVila() {
    const A = SALA.A, g = new T.Group();
    raiz.add(g);
    luzGeral.intensity = 0.8; luzGeral.color.set(0xeef5ff); luzGeral.groundColor.set(0xd9d3c6);   // a claridade do céu (o sol é uma luz à parte: ver "a cidade")
    const caixa = (l, a, p, material, x, y, z, pai) => malha(pai || g, new T.BoxGeometry(l, a, p), material, x, y, z);
    const liso = (hex, aspereza = 0.8) => mat(hex, { roughness: aspereza });
    const bloco = (nome, x1, x2, z1, z2) => blocos.push({ nome, x1, x2, z1, z2 });
    const redondo = (nome, cx, cz, r) => blocos.push({ nome, cx, cz, r, x1: cx - r, x2: cx + r, z1: cz - r, z2: cz + r });   // um bloco redondo: deixa passar rente, em volta
    const escalarUV = (geo, fu, fv) => { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * fu, uv.getY(i) * fv); return geo; };
    const letras = (c, texto, x, y, tamanho, cor, largura) => {
      c.fillStyle = cor; c.font = `bold ${tamanho}px Bahnschrift, Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(texto, x, y, largura);
    };
    const madeira = liso(0x8f6a45, 0.55), madeiraClara = liso(0xc49a6c, 0.55), branco = liso(0xf4f2ec, 0.5), preto = liso(0x1d1f22, 0.3);
    const armario = liso(0x4f6a72, 0.55), portinha = liso(0x5d7c85, 0.5), tampo = liso(0xe6dfd2, 0.25);

    // --- as texturas da rua e das fachadas (desenhadas aqui, como as das salas) ---
    const repetida = t => { t.wrapS = t.wrapT = T.RepeatWrapping; return t; };
    // pontinhos claros e escuros espalhados: o grão do asfalto, da pedra, do reboco
    const salpicar = (c, l, n, sorte, claro, escuro, tamanho, forca) => {
      for (let i = 0; i < n; i++) {
        c.fillStyle = `rgba(${sorte() < 0.5 ? escuro : claro},${((0.3 + sorte() * 0.7) * forca).toFixed(3)})`;
        c.fillRect(sorte() * l, sorte() * l, 1 + sorte() * tamanho, 1 + sorte() * tamanho);
      }
    };
    const texAsfalto = repetida(texturaCanvas(512, 512, (c, l) => {            // cobre 4 m x 4 m
      const sorte = aleatorio(71);
      c.fillStyle = '#4d5156'; c.fillRect(0, 0, l, l);
      salpicar(c, l, 30000, sorte, '210,213,216', '16,18,20', 1.4, 0.2);
      salpicar(c, l, 700, sorte, '160,160,160', '24,24,24', 10, 0.07);
    }));
    const texCalcada = repetida(texturaCanvas(512, 512, (c, l) => {            // lajotas de 40 cm; cobre 2 m x 2 m
      const sorte = aleatorio(72), n = 5, p = l / n;
      for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) {
        const t = 196 + Math.floor(sorte() * 22);
        c.fillStyle = `rgb(${t},${t - 5},${t - 17})`;
        c.fillRect(i * p, k * p, p, p);
      }
      salpicar(c, l, 9000, sorte, '255,255,255', '70,62,50', 2, 0.14);
      c.fillStyle = 'rgba(98,92,82,0.6)';
      for (let i = 0; i <= n; i++) { c.fillRect(i * p - 1.5, 0, 3, l); c.fillRect(0, i * p - 1.5, l, 3); }
    }));
    const texGrama = repetida(texturaCanvas(512, 512, (c, l) => {              // cobre 5 m x 5 m
      const sorte = aleatorio(73);
      c.fillStyle = '#6ea851'; c.fillRect(0, 0, l, l);
      for (let i = 0; i < 60; i++) {                                           // manchas mais claras e mais escuras
        const x = sorte() * l, y = sorte() * l, r = 30 + sorte() * 60, cor = sorte() < 0.5 ? '70,128,52' : '150,196,96';
        for (const dx of [-l, 0, l]) for (const dy of [-l, 0, l]) {
          const d = c.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
          d.addColorStop(0, `rgba(${cor},0.2)`); d.addColorStop(1, `rgba(${cor},0)`);
          c.fillStyle = d; c.fillRect(x + dx - r, y + dy - r, 2 * r, 2 * r);
        }
      }
      for (let i = 0; i < 14000; i++) {                                        // as folhinhas
        const x = sorte() * l, y = sorte() * l, t = sorte();
        c.strokeStyle = t < 0.4 ? `rgba(48,104,38,${0.25 + sorte() * 0.3})` : t < 0.8 ? `rgba(146,200,100,${0.2 + sorte() * 0.3})` : `rgba(200,208,112,${0.15 + sorte() * 0.25})`;
        c.lineWidth = 1 + sorte();
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + (sorte() - 0.5) * 4, y - 3 - sorte() * 6); c.stroke();
      }
    }));
    const texReboco = repetida(texturaCanvas(256, 256, (c, l) => {             // o grão do reboco, quase branco: a cor vem do material
      const sorte = aleatorio(74);
      c.fillStyle = '#f6f6f6'; c.fillRect(0, 0, l, l);
      salpicar(c, l, 5200, sorte, '255,255,255', '0,0,0', 3, 0.032);
    }));
    const texFolhagem = repetida(texturaCanvas(256, 256, (c, l) => {           // folhas miúdas, para as cercas vivas
      const sorte = aleatorio(76);
      c.fillStyle = '#3f8440'; c.fillRect(0, 0, l, l);
      for (let i = 0; i < 2800; i++) {
        c.fillStyle = ['rgba(30,88,36,0.5)', 'rgba(98,162,76,0.5)', 'rgba(134,190,98,0.4)'][Math.floor(sorte() * 3)];
        c.beginPath(); c.ellipse(sorte() * l, sorte() * l, 3 + sorte() * 5, 2 + sorte() * 3, sorte() * 3.14, 0, 7); c.fill();
      }
    }));
    const texTelha = repetida(texturaCanvas(256, 256, (c, l) => {              // telhas de barro, em tons de cinza (a cor vem do material); cobre 1 m x 1 m
      const sorte = aleatorio(75), colunas = 5, w = l / colunas, fiadas = 3, h = l / fiadas;
      for (let i = 0; i < colunas; i++) {                                      // cada coluna é uma fileira de capas, abauladas: clara no meio, escura nas beiradas
        const d = c.createLinearGradient(i * w, 0, (i + 1) * w, 0);
        d.addColorStop(0, '#858585'); d.addColorStop(0.2, '#dadada'); d.addColorStop(0.5, '#ffffff'); d.addColorStop(0.8, '#d0d0d0'); d.addColorStop(1, '#787878');
        c.fillStyle = d; c.fillRect(i * w, 0, w, l);
      }
      for (let k = 0; k < fiadas; k++) for (let i = 0; i < colunas; i++) {      // cada telha tem o seu tom, e a de cima faz sombra na de baixo
        c.fillStyle = `rgba(${sorte() < 0.5 ? '0,0,0' : '255,255,255'},${(sorte() * 0.13).toFixed(3)})`; c.fillRect(i * w, k * h, w, h);
        c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(i * w, k * h, w, 4);
        c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(i * w, k * h + 4, w, 7);
      }
    }));
    const guardados = {};                        // os materiais que se repetem, pela cor
    const rebocado = hex => guardados['r' + hex] || (guardados['r' + hex] = mat(hex, { map: texReboco, roughness: 0.9 }));
    const telhado = hex => guardados['t' + hex] || (guardados['t' + hex] = mat(hex, { map: texTelha, roughness: 0.8 }));
    const beiral = liso(0xefe8da, 0.8);
    // Junta várias geometrias numa só, cada uma já no seu lugar: uma malha para a cerca inteira (ou para todas as copas das árvores), em vez de uma por peça.
    const juntar = pecas => {
      const pos = [], nor = [], uv = [];
      for (const peca of pecas) {
        const solta = peca.index ? peca.toNonIndexed() : peca;
        for (const v of solta.attributes.position.array) pos.push(v);
        for (const v of solta.attributes.normal.array) nor.push(v);
        for (const v of solta.attributes.uv.array) uv.push(v);
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
      geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      return geo;
    };

    // --- os lugares ---
    // (x1..z2: o retângulo do lugar; `outras`: os outros pedaços dele, quando não é um retângulo só: ver areas)
    const lugar = (n, nome, x1, x2, z1, z2, luz, outras) => {
      const partes = [{ x1, x2, z1, z2 }, ...(outras || [])], cantos = partes.map(p => p.r ? { x1: p.cx - p.r, x2: p.cx + p.r, z1: p.cz - p.r, z2: p.cz + p.r } : p);
      areas[n] = { n, nome, partes, x1: Math.min(...cantos.map(p => p.x1)), x2: Math.max(...cantos.map(p => p.x2)), z1: Math.min(...cantos.map(p => p.z1)), z2: Math.max(...cantos.map(p => p.z2)),
        luz: luz || { x: (x1 + x2) / 2, y: A - 0.35, z: (z1 + z2) / 2, forca: 1.9 } };
      salas[n] = { n, cx: 0, grupo: g, objetos: [], porta: null, cesta: null, chapeu: null, outroRobo: null, presente: null, pessoa: null, geladeira: null, agua: null };
    };
    lugar(1, 'quarto', 0, 4, 0, 4);
    lugar(2, 'banheiro', -2.6, 0, 0, 4);
    lugar(3, 'cozinha', 4, 8, 0, 4);
    // A rua: as duas ruas em cruz e o disco da rotatória (com a praça no meio). Quem ilumina a rua é
    // o sol; a lâmpada fica acesa dentro da casa ou da loja cuja entrada está mais perto do robô.
    const ENTRADAS = [[6, 4, 3], [6, 8.5, 5], [16.25, -2.5, 6], [21.5, 8.5, 9], [21, 4, 10], [0.5, 8.5, 12]];   // cada entrada (x, z) e o lugar a que ela dá
    const maisPerto = () => ENTRADAS.reduce((a, b) => Math.hypot(estado.x - b[0], estado.z - b[1]) < Math.hypot(estado.x - a[0], estado.z - a[1]) ? b : a);
    lugar(4, 'rua', CIDADE.oeste, CIDADE.leste, CIDADE.z - CIDADE.meiaRua, CIDADE.z + CIDADE.meiaRua, () => areas[maisPerto()[2]].luz,
      [{ x1: CIDADE.x - CIDADE.meiaRua, x2: CIDADE.x + CIDADE.meiaRua, z1: CIDADE.sul, z2: CIDADE.norte }, { cx: CIDADE.x, cz: CIDADE.z, r: CIDADE.calcada }]);
    lugar(5, 'mercadinho', 3.5, 8.5, 8.5, 12.5);
    // o flat da casa cor-de-rosa, na rua do sul (a sala com cozinha, o quarto e o banheiro), e a farmácia, na rua do leste
    lugar(6, 'sala do flat', 16.25, 20.25, -5, -1);
    lugar(7, 'quarto do flat', 20.25, 24.25, -5, -1);
    lugar(8, 'banheiro do flat', 24.25, 26.65, -5, -1);
    lugar(9, 'farmácia', 19.6, 23.5, 8.5, 12.5);
    // a casa azul, na rua do leste (a cozinha, por onde se entra, e a sala), e a padaria, na rua do oeste
    lugar(10, 'cozinha da casa azul', 19.6, 22.4, 0, 4);
    lugar(11, 'sala da casa azul', 22.4, 25.2, 0, 4);
    lugar(12, 'padaria', -4.2, 1.9, 8.5, 12.5);

    // --- chão, teto, paredes e telhado ---
    const piso = (x1, x2, z1, z2, material, fu = 1, fv = 1) => {
      const p = malha(g, escalarUV(cantosEscuros(new T.PlaneGeometry(x2 - x1, z2 - z1, 12, 12), 'x', 'y', 0.22, 0.9), fu, fv), material, (x1 + x2) / 2, 0.006, (z1 + z2) / 2);
      p.rotation.x = -Math.PI / 2;
    };
    const teto = (x1, x2, z1, z2) => {
      malha(g, cantosEscuros(new T.PlaneGeometry(x2 - x1, z2 - z1, 10, 10), 'x', 'y', 0.2, 0.9), M.teto, (x1 + x2) / 2, A, (z1 + z2) / 2).rotation.x = Math.PI / 2;
      caixa(0.84, 0.03, 0.84, M.rodape, (x1 + x2) / 2, A - 0.015, (z1 + z2) / 2);          // luminária embutida
      malha(g, new T.PlaneGeometry(0.72, 0.72), M.luminaria, (x1 + x2) / 2, A - 0.032, (z1 + z2) / 2).rotation.x = Math.PI / 2;
    };
    // Uma parede reta de (x1, z1) a (x2, z2), ao longo de x ou de z, com os vãos de porta dados
    // (o meio de cada um, ao longo da parede). `fora`: de que lado fica a rua (+1 ou -1, no
    // sentido em que o outro eixo cresce; 0 = parede entre dois cômodos); `reboco`: a cor desse lado;
    // `barrado`: a da faixa pintada ao pé da parede; `dentro`: os materiais do lado de dentro
    // ({ parede, lisa }: o da parede e o do pedaço liso em cima de um vão), quando não são os de sempre.
    function parede(x1, z1, x2, z2, vaos, fora, reboco, barrado, dentro) {
      const emX = z1 === z2, a = emX ? x1 : z1, b = emX ? x2 : z2, fixo = emX ? z1 : x1, trechos = [];
      let de = a;
      // (cada vão: o meio de uma porta, ou uma janela [meio, largura, de que altura, até que altura]: ver janela)
      const meioDe = v => Array.isArray(v) ? v[0] : v;
      for (const v of (vaos || []).slice().sort((p, q) => meioDe(p) - meioDe(q))) {
        const [c, w, embaixo, emCima] = Array.isArray(v) ? v : [v, LARGURA_PORTA, 0, ALTURA_PORTA];
        trechos.push([de, c - w / 2, 0, A]);
        if (embaixo > 0) trechos.push([c - w / 2, c + w / 2, 0, embaixo]);                               // o peitoril da janela
        trechos.push([c - w / 2, c + w / 2, emCima, A]);
        de = c + w / 2;
      }
      trechos.push([de, b, 0, A]);
      for (const [t1, t2, y1, y2] of trechos) {
        const comp = t2 - t1, meio = (t1 + t2) / 2, alt = y2 - y1, y = (y1 + y2) / 2;
        if (comp < 1e-6) continue;
        const geo = y1 > 0 ? new T.BoxGeometry(emX ? comp : ESPESSURA, alt, emX ? ESPESSURA : comp)        // o pedaço em cima do vão
          : emX ? cantosEscuros(porMetro(new T.BoxGeometry(comp, alt, ESPESSURA, Math.ceil(comp * 3), 9, 1), comp), 'x', 'y', 0.2, 0.7)
            : cantosEscuros(porMetro(new T.BoxGeometry(ESPESSURA, alt, comp, 1, 9, Math.ceil(comp * 3)), comp), 'z', 'y', 0.2, 0.7);
        if (y1 === 0 && y2 < A) escalarUV(geo, 1, y2 / A);                                               // (o peitoril leva só a parte de baixo do desenho da parede)
        malha(g, geo, y1 > 0 ? (dentro || M_DE_DENTRO).lisa : (dentro || M_DE_DENTRO).parede, emX ? meio : fixo, y, emX ? fixo : meio);
        if (!fora) continue;
        // por fora, uma capa de reboco (um pouco mais comprida nas pontas, para fechar as quinas)
        const d = fora * (ESPESSURA / 2 + 0.015), e1 = t1 === a ? 0.09 : 0, e2 = t2 === b ? 0.09 : 0, c2 = comp + e1 + e2, m2 = meio + (e2 - e1) / 2;
        malha(g, escalarUV(new T.BoxGeometry(emX ? c2 : 0.03, alt, emX ? 0.03 : c2), c2 / 2, alt / 2), reboco, emX ? m2 : fixo + d, y, emX ? fixo + d : m2);
        if (barrado && y1 === 0) caixa(emX ? c2 : 0.02, 0.38, emX ? 0.02 : c2, barrado, emX ? m2 : fixo + d + fora * 0.012, 0.19, emX ? fixo + d + fora * 0.012 : m2);
      }
    }
    const M_DE_DENTRO = { parede: M.parede, lisa: M.paredeLisa };
    // O vidro das janelas e das vitrines: transparente (de dentro se vê a rua; da rua, o cômodo).
    // De noite ele ganha um brilho morno (ver "a hora do dia e a chuva"). Não faz sombra.
    const vidroDaRua = new T.MeshStandardMaterial({ color: 0xcfe6f0, transparent: true, opacity: 0.2, roughness: 0.03, metalness: 0.15, emissive: 0xffd9a0, emissiveIntensity: 0, depthWrite: false, side: T.DoubleSide });
    const vidros = [];
    // Uma janela de verdade num buraco que `parede` deixou (com as mesmas medidas): o vidro, no meio
    // da parede, e o caixilho, que forra o buraco e aparece dos dois lados. (x, z): o meio dela;
    // eixo: 'z' se a parede fica em z, 'x' se fica em x; `travessa`: false = só um montante em pé.
    function janela(x, z, eixo, w, y1, y2, caixilho, travessa) {
      const emX = eixo === 'z', h = y2 - y1, y = (y1 + y2) / 2, m = caixilho || branco, b = 0.05, f = ESPESSURA + 0.09;
      const pano = malha(g, new T.PlaneGeometry(w - 2 * b, h - 2 * b), vidroDaRua, x, y, z);
      if (!emX) pano.rotation.y = Math.PI / 2;
      pano.renderOrder = 5;
      vidros.push(pano);
      const peca = (ao, alto, grosso, d, dy) => caixa(emX ? ao : grosso, alto, emX ? grosso : ao, m, emX ? x + d : x, y + dy, emX ? z : z + d);   // ao: ao longo da parede; grosso: atravessado
      peca(w, b, f, 0, h / 2 - b / 2); peca(w, b, f, 0, -h / 2 + b / 2);
      peca(b, h - 2 * b, f, -w / 2 + b / 2, 0); peca(b, h - 2 * b, f, w / 2 - b / 2, 0);
      peca(0.035, h - 2 * b, 0.035, 0, 0);
      if (travessa !== false) peca(w - 2 * b, 0.035, 0.035, 0, 0);
    }
    // Uma porta de correr na parede de fora de uma casa, que o jogador abre (e que fica aberta).
    // (x, z): o meio do vão; eixo: 'z' se a parede fica em z (a porta corre ao longo de x), 'x' se
    // fica em x (corre ao longo de z); salas: os dois lugares que ela liga. Trancada, não abre nem
    // é alvo: é a porta da casa que não é a deste desafio.
    function portaDaRua(x, z, eixo, salas, material, trancada, sentido) {     // (sentido: +1 se ela corre para o lado em que a medida cresce; sem isso, para o outro)
      const emZ = eixo === 'z', folha = caixa(emZ ? LARGURA_PORTA : 0.05, ALTURA_PORTA, emZ ? 0.05 : LARGURA_PORTA, material, x, ALTURA_PORTA / 2, z);
      for (const lado of [-1, 1]) caixa(emZ ? 0.05 : 0.02, 0.3, emZ ? 0.02 : 0.05, M.latao, emZ ? 0.5 : lado * 0.035, 0, emZ ? lado * 0.035 : 0.5, folha);   // os puxadores
      // A borda de destaque: uma moldura fina por dentro do vão (dois montantes e a travessa), no meio da
      // parede e com uma folga dela — por fora do vão ela atravessava a parede e o batente, e aparecia rasgada.
      const borda = new T.Group(), e = 0.07, b = 0.05, folga = 0.004, meio = LARGURA_PORTA / 2 - b / 2 - folga;
      g.add(borda);
      for (const lado of [-1, 1]) caixa(emZ ? b : e, ALTURA_PORTA - folga, emZ ? e : b, M.destaque, emZ ? x + lado * meio : x, (ALTURA_PORTA - folga) / 2, emZ ? z : z + lado * meio, borda);
      caixa(emZ ? 2 * meio - b : e, b, emZ ? e : 2 * meio - b, M.destaque, x, ALTURA_PORTA - b / 2 - folga, z, borda);
      borda.visible = false;
      portasDaVila.push({ nome: 'porta', x, z, eixo, salas, aberta: false, trancada: !!trancada, sentido: sentido || -1, vis: 0, folha, contorno: borda });
    }
    const vao = (x, z, eixo, a, b) => portasDaVila.push({ nome: 'vão', x, z, eixo, salas: [a, b], aberta: true, vis: 1, folha: null, contorno: null });   // um vão sem porta, entre os lugares a e b
    // Cobre um retângulo com uma laje (com beiral) e um telhado de quatro águas, de telhas da cor
    // dada. `pai`: o grupo em que ele fica (as medidas são as desse grupo).
    function cobrir(x1, x2, z1, z2, y, h, cor, pai) {
      const be = 0.28, u1 = x1 - be, u2 = x2 + be, v1 = z1 - be, v2 = z2 + be, onde = pai || g;
      caixa(u2 - u1, 0.08, v2 - v1, beiral, (u1 + u2) / 2, y + 0.07, (v1 + v2) / 2, onde);   // (um pouco acima do teto de dentro, para os dois não disputarem os mesmos pixels)
      // A cinta: fecha a fresta que sobraria entre o alto das paredes e a laje. Vai da face de fora
      // do reboco até pouco antes da face de dentro da parede (para não aparecer no teto do cômodo).
      const fora = ESPESSURA / 2 + 0.03, dentro = ESPESSURA / 2 - 0.01, larga = fora + dentro, desvio = (fora - dentro) / 2;
      for (const [cx, cz, lx, lz] of [[(x1 + x2) / 2, z1 - desvio, x2 - x1 + 2 * fora, larga], [(x1 + x2) / 2, z2 + desvio, x2 - x1 + 2 * fora, larga],
        [x1 - desvio, (z1 + z2) / 2, larga, z2 - z1 - 2 * dentro], [x2 + desvio, (z1 + z2) / 2, larga, z2 - z1 - 2 * dentro]])
        caixa(lx, 0.03, lz, beiral, cx, y + 0.015, cz, onde);
      const emX = u2 - u1 >= v2 - v1, L = emX ? u2 - u1 : v2 - v1, d = (emX ? v2 - v1 : u2 - u1) / 2, Y = y + 0.11, agua = Math.hypot(d, h);
      // (a = ao longo da cumeeira, b = atravessado): os quatro cantos e as duas pontas da cumeeira
      const P = (a, b, alto) => emX ? [u1 + a, Y + alto, v1 + b] : [u1 + b, Y + alto, v1 + a];
      const A0 = [0, 0, 0], B0 = [L, 0, 0], C0 = [L, 2 * d, 0], D0 = [0, 2 * d, 0], c1 = [d, d, h], c2 = [L - d, d, h];
      // As telhas: em cada água, u corre ao longo do beiral e v sobe da beirada para a cumeeira, em metros.
      const telhas = [(a, b) => [a, b * agua / d], (a, b) => [a, (2 * d - b) * agua / d], (a, b) => [b, (L - a) * agua / d], (a, b) => [b, a * agua / d]];
      const pos = [], uv = [];
      for (const [p, q, r, qual] of [[A0, c2, B0, 0], [A0, c1, c2, 0], [C0, c1, D0, 1], [C0, c2, c1, 1], [B0, c2, C0, 2], [D0, c1, A0, 3]])
        for (const [a, b, alto] of emX ? [p, q, r] : [p, r, q]) {      // (trocar x por z vira cada face do avesso: desvira)
          pos.push(...P(a, b, alto)); uv.push(...telhas[qual](a, b));
        }
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      malha(onde, geo, telhado(cor), 0, 0, 0);
    }
    const rebocoCasa = rebocado(0xf0cf7a), rebocoMercado = rebocado(0xf4efe4), barradoCasa = liso(0xc98f4e, 0.9), barradoMercado = liso(0x4f7563, 0.9);
    // a casa: paredes de fora e as duas de dentro (com os vãos para o banheiro e para a cozinha)
    parede(-2.6, 0, 8, 0, [[2.13, 1.06, 1.02, 2.08]], -1, rebocoCasa, barradoCasa);                    // (com a janela do quarto, nos fundos)
    parede(-2.6, 4, 8, 4, [[-1.3, 0.6, 1.62, 2.08], [2.0, 1.0, 1.0, 2.0], 6], 1, rebocoCasa, barradoCasa);   // (com a janela do banheiro e a do quarto, na rua)
    parede(-2.6, 0, -2.6, 4, [], -1, rebocoCasa, barradoCasa);
    parede(8, 0, 8, 4, [], 1, rebocoCasa, barradoCasa);
    parede(0, 0, 0, 4, [3]);
    parede(4, 0, 4, 4, [2]);
    piso(0, 4, 0, 4, M.piso);
    piso(-2.6, 0, 0, 4, M.ladrilho, 2.6 / 4, 1);
    piso(4, 8, 0, 4, M.ladrilho);
    teto(0, 4, 0, 4); teto(-2.6, 0, 0, 4); teto(4, 8, 0, 4);
    cobrir(-2.6, 8, 0, 4, A, 1.25, 0xb5533c);
    // o mercadinho
    parede(3.5, 8.5, 8.5, 8.5, [[4.42, 1.26, 0.55, 2.05], 6, [7.58, 1.26, 0.55, 2.05]], -1, rebocoMercado, barradoMercado);   // (com as duas vitrines)
    parede(3.5, 12.5, 8.5, 12.5, [], 1, rebocoMercado, barradoMercado);
    parede(3.5, 8.5, 3.5, 12.5, [], -1, rebocoMercado, barradoMercado);
    parede(8.5, 8.5, 8.5, 12.5, [], 1, rebocoMercado, barradoMercado);
    piso(3.5, 8.5, 8.5, 12.5, M.ladrilho, 5 / 4, 1);
    teto(3.5, 8.5, 8.5, 12.5);
    cobrir(3.5, 8.5, 8.5, 12.5, A + 0.7, 0.9, 0x3f6b55);
    caixa(5.12, 0.7, 0.14, rebocoMercado, 6, A + 0.35, 8.5);                              // a platibanda, com o letreiro
    caixa(0.14, 0.7, 4, rebocoMercado, 3.5, A + 0.35, 10.5); caixa(0.14, 0.7, 4, rebocoMercado, 8.5, A + 0.35, 10.5); caixa(5.12, 0.7, 0.14, rebocoMercado, 6, A + 0.35, 12.5);
    const letreiro = texturaCanvas(1024, 160, (c, l, a) => {
      c.fillStyle = '#c8372d'; c.fillRect(0, 0, l, a);
      c.strokeStyle = '#ffffff'; c.lineWidth = 8; c.strokeRect(10, 10, l - 20, a - 20);
      letras(c, 'MERCADINHO', l / 2, a / 2 + 6, 112, '#ffffff', l - 80);
    });
    malha(g, new T.PlaneGeometry(4.2, 0.62), mat(0xffffff, { map: letreiro, roughness: 0.6 }), 6, A + 0.36, 8.5 - 0.075).rotation.y = Math.PI;
    const toldo = texturaCanvas(256, 64, (c, l, a) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#c8372d'; c.fillRect(i * l / 8, 0, l / 8, a); } });
    const lona = malha(g, new T.BoxGeometry(2.3, 0.04, 0.85), mat(0xffffff, { map: toldo, roughness: 0.8 }), 6, 2.33, 8.02);
    lona.rotation.x = -0.32;
    for (const x of [4.42, 7.58]) {                                                       // as vitrines, de enfeite
      janela(x, 8.5, 'z', 1.26, 0.55, 2.05, liso(0x3d4a54, 0.5), false);
      caixa(1.3, 0.3, 0.3, liso(0x7a4a2a, 0.8), x, 0.15, 8.2);                            // floreira
      for (let i = 0; i < 5; i++) malha(g, new T.SphereGeometry(0.1, 10, 8), liso([0xe4572e, 0xf2c230, 0xf06aa8][i % 3], 0.7), x - 0.5 + i * 0.25, 0.36, 8.2);
    }

    // --- a cidade: o céu, o sol, o chão, a praça com a rotatória e as quatro ruas ---
    // No meio fica a praça, redonda, com o ponto de encontro; em volta dela, a pista da rotatória;
    // e da rotatória saem quatro ruas, uma para cada lado. A rua do oeste é a da nossa casa e do
    // mercadinho (e da padaria); o flat da casa cor-de-rosa fica na do sul; a farmácia e a casa azul, na do leste.
    // Entre uma construção e a vizinha há sempre um jardim. A escola é só fachada: nela não dá para entrar.
    //
    //    z                           rua do norte
    //   18     . . . . . . . . . . ESCOLA |  | parquinho . . . . .
    //   12,5    PADARIA   MERCADINHO      |  |        FARMÁCIA
    //    8,5   --------- ------------  .-'    '-.  -------------
    //           rua do oeste          (  a praça  )  rua do leste
    //    4     -+---------------+----  '-.    .-'  -------------
    //           | a nossa casa  |         |  |      a casa azul
    //    0      +---------------+ quintal |  | o flat
    //   -5,5                         rua do sul
    //          -5               8        14       19,6    24,5   x
    //
    // O robô anda no calçamento — a praça, a pista e as calçadas (ver o lugar 4) — e não na grama.
    const { x: PX, z: PZ, praca: R_PRACA, pista: R_PISTA, calcada: R_CALCADA, meiaPista: MP, meiaRua: MR, alto: AC } = CIDADE;
    const GUIA = 0.1, CG = AC + 0.012, MEIO = new T.Vector3(10, 0, PZ);   // a largura da guia (o meio-fio) e a altura dela; o meio da cidade
    const FIM = { o: CIDADE.oeste - 0.3, l: CIDADE.leste + 0.3, s: CIDADE.sul - 0.3, n: CIDADE.norte + 0.3 };   // onde as calçadas acabam (um pouco depois de onde o robô chega)
    const semSombra = [];                        // o chão e o que está longe não precisam fazer sombra em nada
    vila.encontro = { x: PX, z: PZ };
    const BAIXA_DA_CENTRAL = COLETIVO ? 0.45 : 0;   // no coletivo o ponto de encontro é a central de pedidos, mais baixa: as telas ficam na altura dos olhos de um robô

    // O sol: uma luz de longe, que faz as sombras da rua. Dentro das casas ele não entra (o
    // telhado faz sombra): lá quem ilumina é a lâmpada, que acompanha o robô.
    const SOL = new T.Vector3(0.5, 1, -0.45).normalize();
    const sol = new T.DirectionalLight(0xfff0d6, 2.8);
    // As sombras do sol cobrem um quadrado de 52 m. Na cidade ele fica sempre no mesmo lugar; quem vai
    // para um dos passeios, longe dali, leva o quadrado junto (ver vila.focarSol, chamada antes de cada desenho).
    const focoDoSol = MEIO.clone();
    sol.position.copy(focoDoSol).addScaledVector(SOL, 70);
    sol.target.position.copy(focoDoSol);
    vila.focarSol = (x, z) => {
      const longe = Math.hypot(x - MEIO.x, z - MEIO.z) > 36, fx = longe ? Math.round(x / 8) * 8 : MEIO.x, fz = longe ? Math.round(z / 8) * 8 : MEIO.z;
      if (fx === focoDoSol.x && fz === focoDoSol.z) return;
      focoDoSol.set(fx, 0, fz);
      sol.position.copy(focoDoSol).addScaledVector(vila.clima && vila.clima.v ? vila.clima.v.sol : SOL, 70);
      sol.target.position.copy(focoDoSol);
      sol.target.updateMatrixWorld();
    };
    sol.castShadow = true;
    sol.shadow.mapSize.set(4096, 4096);
    Object.assign(sol.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 20, far: 130 });
    sol.shadow.camera.updateProjectionMatrix();
    sol.shadow.bias = -0.0003; sol.shadow.normalBias = 0.03;
    g.add(sol, sol.target);
    const rebatida = new T.DirectionalLight(0xdfeaff, 0.4);   // a claridade que chega do lado da sombra
    rebatida.position.set(-0.5, 0.55, 0.8);
    g.add(rebatida);
    // Ao longe tudo vai sumindo numa névoa da cor do horizonte. O céu e a névoa passam pelo mesmo
    // ajuste de tons que o resto do desenho; por isso entram um pouco mais claros (CLARO).
    const CLARO = 1.25, horizonte = new T.Color('#dcedf8');
    cena.fog = new T.Fog(horizonte.clone().multiplyScalar(CLARO), 50, 240);
    camera.far = 330; voador.far = 520;          // (as câmeras são acertadas no início: ver definirTamanho)

    // o céu: um degradê com nuvens e o clarão do sol, por dentro de uma esfera bem grande
    const ceu = texturaCanvas(2048, 1024, (c, l, a) => {
      const d = c.createLinearGradient(0, 0, 0, a / 2), sorte = aleatorio(77);
      d.addColorStop(0, '#1c66c0'); d.addColorStop(0.5, '#4f9ee4'); d.addColorStop(0.86, '#9dcbf0'); d.addColorStop(1, '#dcedf8');
      c.fillStyle = d; c.fillRect(0, 0, l, a / 2);
      c.fillStyle = '#dcedf8'; c.fillRect(0, a / 2, l, a / 2);
      const mancha = (x, y, r, cores) => {       // uma mancha redonda e difusa (repetida na emenda da esfera)
        for (const dx of [-l, 0, l]) {
          const m = c.createRadialGradient(x + dx, y, 0, x + dx, y, r);
          cores.forEach(([onde, cor]) => m.addColorStop(onde, cor));
          c.fillStyle = m; c.fillRect(x + dx - r, y - r, 2 * r, 2 * r);
        }
      };
      const fi = (Math.atan2(SOL.z, -SOL.x) + 2 * Math.PI) % (2 * Math.PI);   // onde o sol fica no desenho (ver SphereGeometry)
      mancha(fi / (2 * Math.PI) * l, Math.acos(SOL.y) / Math.PI * a, 170, [[0, 'rgba(255,253,240,1)'], [0.09, 'rgba(255,251,230,0.96)'], [0.22, 'rgba(255,246,214,0.4)'], [1, 'rgba(255,246,214,0)']]);
      for (let n = 0; n < 22; n++) {             // as nuvens: cada uma, um punhado de manchas brancas, de base reta
        const x0 = sorte() * l, y0 = a * (0.24 + sorte() * 0.2), larg = 70 + sorte() * 130;
        for (let i = 0; i < 14; i++) {
          const dx = (sorte() - 0.5) * larg, r = 12 + sorte() * larg * 0.16 * (1 - Math.abs(dx) / larg);
          mancha(x0 + dx, y0 - r * 0.55, r, [[0, 'rgba(255,255,255,0.95)'], [0.55, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']]);
        }
      }
    });
    const materialDoCeu = new T.MeshBasicMaterial({ side: T.BackSide, map: ceu, fog: false, color: new T.Color(CLARO, CLARO, CLARO) });   // (a cor dele muda com a hora do dia e com a chuva: ver "a hora do dia e a chuva")
    malha(g, new T.SphereGeometry(270, 48, 24), materialDoCeu, MEIO.x, 0, MEIO.z).receiveShadow = false;
    // o que a lataria do carro e os vidros da rua refletem: o céu por cima e o chão por baixo
    const reflexoDaRua = (() => {
      const amb = new T.Scene(), chaoDoReflexo = new T.Mesh(new T.CircleGeometry(40, 24), new T.MeshBasicMaterial({ color: 0x8f9a80 }));
      amb.add(new T.Mesh(new T.SphereGeometry(40, 32, 16), new T.MeshBasicMaterial({ side: T.BackSide, map: ceu })));
      chaoDoReflexo.rotation.x = -Math.PI / 2; chaoDoReflexo.position.y = -1.2;
      amb.add(chaoDoReflexo);
      const gerador = new T.PMREMGenerator(renderer), textura = gerador.fromScene(amb, 0.02).texture;
      gerador.dispose();
      return textura;
    })();
    {
      // os morros ao longe, nos quatro cantos: as ruas seguem pelos vales entre eles
      const sorte = aleatorio(88), morro = mat(0x6e9e58, { roughness: 1 });
      for (let i = 0; i < 12; i++) {
        const a = Math.PI / 4 + Math.floor(i / 3) * Math.PI / 2 + (i % 3 - 1) * 0.33 + (sorte() - 0.5) * 0.1, longe = 130 + sorte() * 55, r = 26 + sorte() * 16;
        const m = malha(g, new T.SphereGeometry(1, 20, 10), morro, MEIO.x + Math.cos(a) * longe, -2, MEIO.z + Math.sin(a) * longe);
        m.scale.set(r, 7 + sorte() * 13, r);
        semSombra.push(m);
      }
    }

    // --- o chão ---
    // O chão é feito de pedaços planos. Cada um usa as coordenadas do mundo como coordenadas da
    // textura (u = x / lado, v = z / lado): assim os pedaços vizinhos emendam sem costura.
    const noMundo = (geo, lado) => {
      if (lado) { const p = geo.attributes.position, uv = geo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / lado, p.getZ(i) / lado); }
      return geo;
    };
    // Deita no chão, na altura y, uma geometria desenhada de cima (x para a direita, -z para cima).
    const deitar = (geo, material, y) => {
      const m = malha(g, noMundo(geo.rotateX(-Math.PI / 2).translate(0, y, 0), material.userData.lado), material, 0, 0, 0);
      semSombra.push(m);
      return m;
    };
    const plano = (x1, x2, z1, z2, material, y) => deitar(new T.PlaneGeometry(x2 - x1, z2 - z1).translate((x1 + x2) / 2, -(z1 + z2) / 2, 0), material, y);
    const forma = pontos => { const s = new T.Shape(); pontos.forEach(([x, z], i) => { if (i) s.lineTo(x, -z); else s.moveTo(x, -z); }); return s; };
    const laje = (pontos, material, alt) => deitar(new T.ExtrudeGeometry(forma(pontos), { depth: alt, bevelEnabled: false }), material, 0);   // um pedaço com espessura: a calçada, a guia
    const ret = (x1, x2, z1, z2) => [[Math.min(x1, x2), Math.min(z1, z2)], [Math.max(x1, x2), Math.min(z1, z2)], [Math.max(x1, x2), Math.max(z1, z2)], [Math.min(x1, x2), Math.max(z1, z2)]];
    // os pontos de um arco de raio r em volta do meio da praça, do ângulo a1 ao a2, no quadrante (sx, sz)
    const arco = (r, a1, a2, sx, sz, n = 18) => Array.from({ length: n + 1 }, (_, i) => { const a = a1 + (a2 - a1) * i / n; return [PX + sx * r * Math.cos(a), PZ + sz * r * Math.sin(a)]; });
    // o pedaço do anel de r1 a r2 que fica nesse quadrante, até `corte` metros do eixo de cada rua
    const setor = (r1, r2, sx, sz, corte) => { const a1 = Math.asin(corte / r1), a2 = Math.asin(corte / r2); return [...arco(r1, a1, Math.PI / 2 - a1, sx, sz), ...arco(r2, Math.PI / 2 - a2, a2, sx, sz)]; };
    const doChao = (textura, lado, aspereza) => { const m = mat(0xffffff, { map: textura, roughness: aspereza }); m.userData.lado = lado; return m; };
    const asfalto = doChao(texAsfalto, 4, 0.95), calcada = doChao(texCalcada, 2, 0.85), grama = doChao(texGrama, 5, 1), granito = liso(0xcfccc3, 0.7);
    const tinta = mat(0xf2f2ee, { roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

    plano(MEIO.x - 300, MEIO.x + 300, MEIO.z - 300, MEIO.z + 300, grama, -0.02);
    // o asfalto: as quatro ruas (que seguem para fora da cidade) e a pista da rotatória
    plano(PX - 300, PX - 3.6, PZ - MP, PZ + MP, asfalto, 0); plano(PX + 3.6, 95.2, PZ - MP, PZ + MP, asfalto, 0);   // (a do leste acaba no retorno da cachoeira)
    plano(PX - MP, PX + MP, PZ - 300, PZ - 3.6, asfalto, 0); plano(PX - MP, PX + MP, PZ + 3.6, 79.2, asfalto, 0);   // (a do norte, no da hidrelétrica)
    deitar(new T.RingGeometry(R_PRACA - 0.1, R_PISTA + 0.02, 96).translate(PX, -PZ, 0), asfalto, 0.002);
    // As calçadas, um degrau acima do asfalto, com a guia de pedra na beirada. As das ruas vão do
    // asfalto até a face das paredes; a da rotatória dá a volta inteira, cortada só pelas pistas.
    const PAREDE = MR - 0.06, BOCA = Math.sqrt(R_PISTA * R_PISTA - MP * MP) + 0.02;   // (BOCA: onde a guia de cada rua encontra a da rotatória)
    for (const lado of [-1, 1]) {
      for (const [de, ate] of [[FIM.o, PX - 5], [PX + 5, FIM.l]]) laje(ret(de, ate, PZ + lado * (MP + GUIA / 2), PZ + lado * PAREDE), calcada, AC);   // ruas do oeste e do leste
      for (const [de, ate] of [[FIM.o, PX - BOCA], [PX + BOCA, FIM.l]]) laje(ret(de, ate, PZ + lado * MP, PZ + lado * (MP + GUIA)), granito, CG);
      for (const [de, ate] of [[FIM.s, PZ - 5], [PZ + 5, FIM.n]]) laje(ret(PX + lado * (MP + GUIA / 2), PX + lado * PAREDE, de, ate), calcada, AC);   // ruas do sul e do norte
      for (const [de, ate] of [[FIM.s, PZ - BOCA], [PZ + BOCA, FIM.n]]) laje(ret(PX + lado * MP, PX + lado * (MP + GUIA), de, ate), granito, CG);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      laje(setor(R_PISTA + GUIA / 2, R_CALCADA, sx, sz, MP + GUIA / 2), calcada, AC);
      laje(setor(R_PISTA, R_PISTA + GUIA, sx, sz, MP), granito, CG);
    }
    // as faixas de pedestres: a que vai da porta de casa à do mercadinho e uma em cada boca de rua, na volta da rotatória
    const zebra = (x, z, aoLongoDeX, comprimento) => {       // aoLongoDeX: a rua corre ao longo de x (e as listras também)
      for (const d of [-0.9, -0.45, 0, 0.45, 0.9]) {
        if (aoLongoDeX) plano(x - comprimento / 2, x + comprimento / 2, z + d - 0.12, z + d + 0.12, tinta, 0.005);
        else plano(x + d - 0.12, x + d + 0.12, z - comprimento / 2, z + comprimento / 2, tinta, 0.005);
      }
    };
    zebra(6, PZ, true, 1.5);
    for (const s of [-1, 1]) { zebra(PX + s * 5.3, PZ, true, 0.9); zebra(PX, PZ + s * 5.3, false, 0.9); }
    caixa(0.9, 0.012, 0.5, liso(0x7a5a3a, 1), 6, AC + 0.006, 4.36);                        // o capacho da porta de casa

    // --- a praça: o calçamento de pedrinhas, o ponto de encontro no meio e os bancos em volta ---
    const texPraca = texturaCanvas(1024, 1024, (c, l) => {
      const sorte = aleatorio(81), m = l / 2, e = m / (R_PRACA - GUIA), escuro = '#3d4248';   // e: pontos do desenho por metro
      c.fillStyle = '#e9e2d0'; c.fillRect(0, 0, l, l);
      for (let i = 0; i < 26000; i++) {          // as pedrinhas claras
        const t = 204 + Math.floor(sorte() * 42);
        c.fillStyle = `rgba(${t},${t - 6},${t - 24},0.55)`;
        c.fillRect(sorte() * l, sorte() * l, 5 + sorte() * 6, 5 + sorte() * 6);
      }
      const anel = (r, largura) => { c.strokeStyle = escuro; c.lineWidth = largura * e; c.beginPath(); c.arc(m, m, r * e, 0, 7); c.stroke(); };
      anel(R_PRACA - GUIA - 0.14, 0.12); anel(2.2, 0.08); anel(1.02, 0.1);
      c.strokeStyle = escuro; c.lineWidth = 0.17 * e; c.lineJoin = 'round';                 // a onda, como a de um calçadão
      c.beginPath();
      for (let i = 0; i <= 720; i++) { const a = i / 720 * 2 * Math.PI, r = (1.86 + 0.13 * Math.sin(a * 12)) * e; if (i) c.lineTo(m + r * Math.cos(a), m + r * Math.sin(a)); else c.moveTo(m + r * Math.cos(a), m + r * Math.sin(a)); }
      c.closePath(); c.stroke();
      // o nome, em volta do meio, duas vezes: lê-se de pé para quem chega de um lado e do outro
      c.fillStyle = escuro; c.font = `bold ${Math.round(0.26 * e)}px Bahnschrift, Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      const nome = 'PONTO DE ENCONTRO', passo = 0.125;
      for (const meio of [Math.PI / 2, -Math.PI / 2]) [...nome].forEach((letra, i) => {
        const fi = meio + ((nome.length - 1) / 2 - i) * passo;
        c.save(); c.translate(m + 1.4 * e * Math.cos(fi), m + 1.4 * e * Math.sin(fi)); c.rotate(fi - Math.PI / 2); c.fillText(letra, 0, 0); c.restore();
      });
      salpicar(c, l, 9000, sorte, '255,255,255', '40,40,40', 3, 0.1);
    });
    malha(g, new T.CylinderGeometry(R_PRACA, R_PRACA, CG, 96), granito, PX, CG / 2, PZ);
    const mosaico = malha(g, new T.CircleGeometry(R_PRACA - GUIA, 96), mat(0xffffff, { map: texPraca, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), PX, CG + 0.002, PZ);
    mosaico.rotation.x = -Math.PI / 2;
    semSombra.push(mosaico);
    const ferro = liso(0x2f3a40, 0.5), tronco = liso(0x6b4a2f, 0.9), sebeMat = mat(0xffffff, { map: texFolhagem, roughness: 1 }), ripa = liso(0xf7f5ee, 0.6);
    const CORES_DAS_FLORES = [0xe4572e, 0xf2c230, 0xf06aa8, 0xffffff, 0x9b6fe0], petalas = {};
    const flor = (x, y, z, r, cor) => (petalas[cor] = petalas[cor] || []).push(new T.SphereGeometry(r, 8, 6).translate(x, y, z));
    {
      // O ponto de encontro: sobre dois degraus de pedra, uma coluna com um cubo de quatro placas
      // verdes, uma virada para cada rua, e um canteiro de flores em volta.
      const pedra = rebocado(0xd9d4c7), verdeFerro = mat(0x1f5a43, { roughness: 0.45, metalness: 0.3 }), B = BAIXA_DA_CENTRAL;
      malha(g, new T.CylinderGeometry(0.62, 0.68, 0.16, 40), pedra, PX, CG + 0.08, PZ);
      malha(g, new T.CylinderGeometry(0.44, 0.48, 0.16, 40), pedra, PX, CG + 0.24, PZ);
      malha(g, new T.CylinderGeometry(0.07, 0.1, 0.72 - B, 16), verdeFerro, PX, CG + 0.68 - B / 2, PZ);
      const placa = mat(0xffffff, { roughness: 0.55, map: texturaCanvas(512, 512, (c, l) => {
        const cx = l / 2, cy = 190;
        c.fillStyle = '#0a8f5b'; c.fillRect(0, 0, l, l);
        c.strokeStyle = '#ffffff'; c.lineWidth = 12; c.strokeRect(18, 18, l - 36, l - 36);
        c.fillStyle = '#ffffff';
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {       // quatro setas, dos cantos para o meio
          c.save(); c.translate(cx + sx * 128, cy + sy * 98); c.rotate(Math.atan2(-sy * 98, -sx * 128));
          c.fillRect(-40, -10, 44, 20);
          c.beginPath(); c.moveTo(2, -28); c.lineTo(40, 0); c.lineTo(2, 28); c.closePath(); c.fill();
          c.restore();
        }
        for (const [dx, s] of [[-36, 0.82], [36, 0.82], [0, 1]]) {           // no meio, três pessoas juntas
          c.beginPath(); c.arc(cx + dx, cy - 22 * s, 13 * s, 0, 7); c.fill();
          c.fillRect(cx + dx - 15 * s, cy - 6 * s, 30 * s, 42 * s);
        }
        letras(c, 'PONTO DE', cx, 378, 68, '#ffffff', l - 70); letras(c, 'ENCONTRO', cx, 448, 68, '#ffffff', l - 70);
      }) });
      malha(g, new T.BoxGeometry(0.92, 0.92, 0.92), [placa, placa, verdeFerro, verdeFerro, placa, placa], PX, CG + 1.5 - B, PZ).castShadow = true;
      malha(g, new T.ConeGeometry(0.8, 0.34, 4), verdeFerro, PX, CG + 2.13 - B, PZ).rotation.y = Math.PI / 4;
      if (!COLETIVO) malha(g, new T.SphereGeometry(0.07, 16, 12), M.latao, PX, CG + 2.34, PZ);
      malha(g, new T.TorusGeometry(0.56, 0.07, 8, 40), sebeMat, PX, CG + 0.2, PZ).rotation.x = Math.PI / 2;
      for (let i = 0; i < 30; i++) flor(PX + Math.cos(i / 30 * 6.283) * 0.56, CG + 0.26, PZ + Math.sin(i / 30 * 6.283) * 0.56, 0.06, CORES_DAS_FLORES[i % 3]);
      redondo('ponto de encontro', PX, PZ, 0.68);
      if (COLETIVO) {
        // No coletivo, o ponto de encontro é a central de pedidos: as quatro placas viram telas, e a
        // bola do alto, uma luz vermelha, acesa enquanto há pedido esperando por um robô.
        const tela = document.createElement('canvas');
        tela.width = tela.height = 512;
        const textura = new T.CanvasTexture(tela);
        textura.colorSpace = T.SRGBColorSpace;
        textura.anisotropy = renderer.capabilities.getMaxAnisotropy();
        Object.assign(placa, { map: textura, emissiveMap: textura, emissiveIntensity: 0.5 });
        placa.emissive.set(0xffffff);
        const farol = luminoso({ color: 0x3a1512 }), luzDoFarol = new T.PointLight(0xff2a1a, 0, 9, 1.6);
        malha(g, new T.SphereGeometry(0.1, 20, 14), farol, PX, CG + 2.36 - B, PZ);
        luzDoFarol.position.set(PX, CG + 2.5 - B, PZ);
        g.add(luzDoFarol);
        const aro = malha(g, new T.TorusGeometry(0.74, 0.035, 8, 48), M.destaque, PX, CG + 0.36, PZ);
        aro.rotation.x = Math.PI / 2;
        aro.visible = false;
        const CASAS = ['amarela', 'rosa', 'azul'];
        vila.central = { nome: 'central de pedidos', ehCentral: true, x: PX, z: PZ, sala: 4, contorno: aro, fala: '', falaAte: 0, balao: null,
          redesenhar() {
            // A tela não diz de que casa é o pedido que ainda espera: cada robô pede a sua missão aqui (ESPACO),
            // e recebe uma só dele. Ela mostra quantos pedidos esperam e quem já está com qual.
            const c = tela.getContext('2d'), esperando = vila.pessoas.filter(p => p.pedindo && !p.com).length, aberto = esperando > 0;
            const emCurso = vila.pessoas.filter(p => p.pedindo && p.com).sort((a, b) => a.pegoEm - b.pegoEm);
            c.fillStyle = '#0b1612'; c.fillRect(0, 0, 512, 512);
            c.strokeStyle = '#2f9e6f'; c.lineWidth = 10; c.strokeRect(12, 12, 488, 488);
            letras(c, 'CENTRAL DE PEDIDOS', 256, 62, 42, '#7dffb0', 450);
            c.fillStyle = aberto ? '#3a1410' : '#12241c'; c.fillRect(30, 124, 452, 128);   // (um pouco abaixo do título: de perto, o alto da tela fica atrás do inventário do robô)
            c.fillStyle = aberto ? '#ff3b2a' : '#3f7a5c'; c.beginPath(); c.arc(92, 188, 38, 0, 7); c.fill();
            letras(c, String(esperando), 92, 191, 52, '#ffffff', 60);
            c.textAlign = 'left'; c.textBaseline = 'middle';
            c.fillStyle = '#ffffff'; c.font = 'bold 38px Bahnschrift, Arial, sans-serif'; c.fillText(esperando === 1 ? 'pedido esperando' : 'pedidos esperando', 150, 172, 320);
            c.fillStyle = aberto ? '#ffd0c8' : '#b9c7c0'; c.font = '25px Bahnschrift, Arial, sans-serif'; c.fillText(aberto ? 'peça aqui a sua missão' : 'volte daqui a pouco', 152, 216, 320);
            c.fillStyle = '#7dffb0'; c.font = 'bold 24px Bahnschrift, Arial, sans-serif'; c.fillText(emCurso.length ? 'MISSÕES EM ANDAMENTO' : 'NENHUMA MISSÃO EM ANDAMENTO', 34, 290, 440);
            emCurso.forEach((p, i) => {
              const y = 338 + i * 56;
              c.fillStyle = '#12241c'; c.fillRect(30, y - 24, 452, 50);
              c.textAlign = 'left'; c.fillStyle = '#ffe9a8'; c.font = 'bold 34px Bahnschrift, Arial, sans-serif'; c.fillText(p.com.nome, 46, y + 2, 250);
              c.textAlign = 'right'; c.fillStyle = '#ffffff'; c.fillText('casa ' + p.casa, 468, y + 2, 150);
            });
            textura.needsUpdate = true;
            farol.color.set(aberto ? 0xff2a1a : 0x3a1512);
            luzDoFarol.intensity = aberto ? 7 : 0;
          } };
      }
    }
    // um banco de praça; sem giro, o encosto fica do lado +z (quem senta olha para -z)
    const banco = (x, z, giro, y, escala) => {
      const b = new T.Group();
      b.position.set(x, y || 0, z); b.rotation.y = giro || 0; b.scale.setScalar(escala || 1);
      g.add(b);
      for (const dz of [-0.15, -0.02, 0.11]) caixa(1.3, 0.035, 0.115, madeira, 0, 0.45, dz, b);       // o assento, de três ripas
      for (const dy of [0.62, 0.78]) caixa(1.3, 0.11, 0.035, madeira, 0, dy, 0.2, b);                  // o encosto, de duas
      for (const dx of [-0.55, 0.55]) { caixa(0.05, 0.44, 0.4, ferro, dx, 0.22, -0.01, b); caixa(0.05, 0.44, 0.05, ferro, dx, 0.64, 0.2, b); }
    };
    const globoDaRua = luminoso({ color: 0xfff4d6 }), luzesDosPostes = [];   // (as luzes dos postes só acendem no fim da tarde e de noite)
    const poste = (x, z) => {
      malha(g, new T.CylinderGeometry(0.1, 0.14, 0.3, 12), ferro, x, 0.15, z);
      malha(g, new T.CylinderGeometry(0.04, 0.06, 2.8, 10), ferro, x, 1.4, z);
      malha(g, new T.CylinderGeometry(0.13, 0.06, 0.1, 12), ferro, x, 2.84, z);
      malha(g, new T.SphereGeometry(0.17, 16, 12), globoDaRua, x, 3.02, z);
      malha(g, new T.ConeGeometry(0.2, 0.12, 12), ferro, x, 3.22, z);
      // (os postes ficam rente às paredes e às cercas, onde o robô não chega: não precisam barrar ninguém)
      const luz = new T.PointLight(0xffd9a0, 0, 10, 1.4);
      luz.position.set(x, 2.95, z);
      g.add(luz);
      luzesDosPostes.push(luz);
    };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      // na praça, um banco em cada canto, de frente para o meio; e, na calçada da volta, um poste
      const a = Math.atan2(sz, sx), x = PX + Math.cos(a) * (R_PRACA - 0.42), z = PZ + Math.sin(a) * (R_PRACA - 0.42);   // na beirada da praça: no meio fica o caminho em volta do ponto de encontro
      if (sx > 0 || sz < 0) {                    // (o canto noroeste não tem banco: é ali que se desce do carro e que fica o ponto de chamá-lo)
        banco(x, z, Math.PI / 2 - a, CG, 0.8);  // (um pouco menores que os da rua, para sobrar passagem)
        redondo('banco', x, z, 0.4);
      }
      poste(PX + sx * 3.96, PZ + sz * 3.96);
    }

    // --- a vida da praça: o violeiro, com o cachorro caramelo do lado, e os pombos ---
    // É só enfeite (e som, para quem assiste): ninguém ali pede nem recebe nada. O violeiro e o
    // cachorro barram o caminho como um móvel; os pombos não, porque voam antes de alguém chegar.
    {
      const aB = Math.atan2(-1, -1), xB = PX + Math.cos(aB) * (R_PRACA - 0.42), zB = PZ + Math.sin(aB) * (R_PRACA - 0.42), giroB = Math.PI / 2 - aB;   // o banco do canto sudoeste
      const noMundo = (lx, lz) => [xB + lx * Math.cos(giroB) + lz * Math.sin(giroB), zB - lx * Math.sin(giroB) + lz * Math.cos(giroB)];              // das medidas do banco para as da cidade
      const noBanco = (q, x, z) => { const dx = q.x - x, dz = q.z - z; return { x: dx * Math.cos(giroB) - dz * Math.sin(giroB), z: dx * Math.sin(giroB) + dz * Math.cos(giroB) }; };
      const violeiro = montarPessoa(false, 0xb5442e, true);
      violeiro.grupo.position.set(xB, CG - 0.017, zB); violeiro.grupo.rotation.y = giroB; violeiro.grupo.scale.setScalar(0.85);
      g.add(violeiro.grupo);
      redondo('violeiro', ...noMundo(0, -0.24), 0.42);
      redondo('violão', ...noMundo(-0.55, -0.2), 0.24);

      // o cachorro caramelo, sentado ao lado do banco, olhando para o meio da praça
      const cao = new T.Group(), caramelo = mat(0xc98a45, { roughness: 0.85 }), creme = mat(0xe7b97a, { roughness: 0.85 }), marrom = mat(0x8f5a28, { roughness: 0.85 }), focinho = mat(0x1d1512, { roughness: 0.4 });
      const [xC, zC] = noMundo(0.95, -0.05);
      cao.position.set(xC, CG, zC); cao.rotation.y = giroB;
      g.add(cao);
      const capsula = (pai, x1, y1, z1, x2, y2, z2, r, material) => {
        const de = new T.Vector3(x1, y1, z1), ate = new T.Vector3(x2, y2, z2), m = malha(pai, new T.CapsuleGeometry(r, de.distanceTo(ate), 5, 12), material, (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
        m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), ate.sub(de).normalize());
        return m;
      };
      capsula(cao, 0, 0.17, 0.1, 0, 0.37, -0.08, 0.105, caramelo);                          // o corpo, sentado
      malha(cao, new T.SphereGeometry(0.085, 16, 12), creme, 0, 0.3, -0.135);               // o peito, mais claro
      for (const lado of [-1, 1]) {
        capsula(cao, lado * 0.06, 0.27, -0.13, lado * 0.06, 0.04, -0.17, 0.03, caramelo);   // as patas da frente
        malha(cao, new T.SphereGeometry(0.036, 12, 8), creme, lado * 0.06, 0.03, -0.185).scale.set(1, 0.6, 1.3);
        malha(cao, new T.SphereGeometry(0.08, 14, 10), caramelo, lado * 0.105, 0.1, 0.09);  // as coxas, dobradas
        malha(cao, new T.SphereGeometry(0.036, 12, 8), creme, lado * 0.12, 0.03, -0.03).scale.set(1, 0.6, 1.5);
      }
      const rabo = new T.Group();
      rabo.position.set(0, 0.1, 0.2);
      cao.add(rabo);
      capsula(rabo, 0, 0, 0, 0, 0.1, 0.14, 0.022, caramelo);
      const cabecaDoCao = new T.Group();
      cabecaDoCao.position.set(0, 0.5, -0.13);
      cao.add(cabecaDoCao);
      malha(cabecaDoCao, new T.SphereGeometry(0.095, 20, 14), caramelo, 0, 0, 0).scale.set(1, 0.95, 1.05);
      capsula(cabecaDoCao, 0, -0.025, -0.06, 0, -0.035, -0.15, 0.045, creme);               // o focinho
      malha(cabecaDoCao, new T.SphereGeometry(0.022, 10, 8), focinho, 0, -0.02, -0.195);
      const lingua = malha(cabecaDoCao, new T.BoxGeometry(0.03, 0.008, 0.05), mat(0xe8788a, { roughness: 0.5 }), 0, -0.072, -0.15);
      for (const lado of [-1, 1]) {
        malha(cabecaDoCao, new T.SphereGeometry(0.015, 10, 8), focinho, lado * 0.042, 0.03, -0.083);
        malha(cabecaDoCao, caixaSuave(0.035, 0.1, 0.07, 0.015), marrom, lado * 0.092, -0.01, 0.01).rotation.z = lado * 0.35;   // as orelhas caídas
      }
      redondo('cachorro', xC, zC, 0.24);

      // os pombos: ciscam na praça e, quando um robô chega perto, voam para o alto de um poste ou do ponto de encontro
      const cinza = mat(0x8d94a3, { roughness: 0.8 }), chumbo = mat(0x5b6474, { roughness: 0.8 }), furtaCor = mat(0x4f8a6b, { roughness: 0.35, metalness: 0.5 }), rosa = liso(0xd9827a, 0.7), olhinho = liso(0xe2702a, 0.4);
      const pombos = [], pousos = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) pousos.push({ x: PX + sx * 3.96, y: 3.27, z: PZ + sz * 3.96, de: null }, { x: PX + sx * 0.29, y: CG + 2.13 - BAIXA_DA_CENTRAL, z: PZ + sz * 0.29, de: null });
      const chaoLivre = robos => {                 // um ponto do chão da praça, fora dos bancos e longe dos robôs
        for (let k = 0; k < 14; k++) {
          const a = Math.random() * 6.283, r = 1.0 + Math.random() * 1.5, x = PX + Math.cos(a) * r, z = PZ + Math.sin(a) * r;
          if (!noMovel(x, z, 0.12) && robos.every(q => Math.hypot(q.x - x, q.z - z) > 2.4)) return { x, y: CG, z };
        }
        return null;
      };
      const dobrar = p => p.asas.forEach((o, i) => { o.rotation.z = (i ? -1 : 1) * 1.2; o.scale.setScalar(0.62); });
      const decolar = (p, destino, depois) => {
        p.de.copy(p.g.position); p.para.set(destino.x, destino.y, destino.z);
        const d = p.de.distanceTo(p.para);
        Object.assign(p, { estado: 'voando', depois, u: 0, dura: Math.max(0.9, d / 3.4), arco: 0.45 + d * 0.08, ate: null });
        p.g.rotation.set(0, Math.atan2(p.de.x - p.para.x, p.de.z - p.para.z), 0);
        p.asas.forEach(o => o.scale.setScalar(1));
      };
      for (let i = 0; i < 6; i++) {
        const p = new T.Group(), asas = [];
        p.rotation.order = 'YXZ';                  // (vira para onde vai e, só depois, abaixa a cabeça para bicar)
        malha(p, new T.SphereGeometry(0.07, 14, 10), cinza, 0, 0.095, 0.01).scale.set(0.82, 0.78, 1.5);
        malha(p, new T.SphereGeometry(0.046, 12, 10), furtaCor, 0, 0.135, -0.07);
        const cab = malha(p, new T.SphereGeometry(0.038, 12, 10), chumbo, 0, 0.17, -0.085);
        malha(p, new T.ConeGeometry(0.011, 0.04, 8), focinho, 0, 0.165, -0.13).rotation.x = -Math.PI / 2;
        malha(p, new T.BoxGeometry(0.05, 0.012, 0.08), chumbo, 0, 0.085, 0.13);
        for (const lado of [-1, 1]) {
          malha(p, new T.SphereGeometry(0.007, 6, 6), olhinho, lado * 0.03, 0.178, -0.1);
          malha(p, new T.CylinderGeometry(0.005, 0.005, 0.05, 6), rosa, lado * 0.022, 0.025, 0.01);
          const ombro = new T.Group();
          ombro.position.set(lado * 0.045, 0.115, 0);
          p.add(ombro);
          malha(ombro, new T.SphereGeometry(0.06, 10, 8), chumbo, lado * 0.06, 0, 0.02).scale.set(1.25, 0.14, 0.75);
          asas.push(ombro);
        }
        const onde = chaoLivre([]) || { x: PX + 1.5, y: CG, z: PZ };
        p.position.set(onde.x, onde.y, onde.z); p.rotation.y = Math.random() * 6.283;
        g.add(p);
        const pombo = { g: p, asas, cab, estado: 'chao', depois: 'chao', ate: null, de: new T.Vector3(), para: new T.Vector3(), u: 0, dura: 1, arco: 0.5, espera: Math.random() * 3, pouso: null, vez: Math.random() * 3, arrulho: 4 + Math.random() * 20 };
        dobrar(pombo);
        pombos.push(pombo);
      }

      let latiu = -99, coladoAntes = false;
      // t: o relógio, em segundos; dt: o tempo deste quadro; robos: onde está cada robô ([{ x, z }])
      vila.vida = { violeiro: { x: xB, z: zB }, passo(t, dt, robos) {
        const maisPerto = (x, z, alcance) => { let quem = null, d = alcance; for (const q of robos) { const dq = Math.hypot(q.x - x, q.z - z); if (dq < d) { d = dq; quem = q; } } return quem; };
        // o violeiro toca sem parar, e olha para quem chega perto
        const v = maisPerto(xB, zB, 4);
        violeiro.animar(t, v && noBanco(v, xB, zB), true);
        // o cachorro olha para quem chega, abana o rabo mais depressa e late uma vez
        const c = maisPerto(xC, zC, 3.5), lc = c && noBanco(c, xC, zC);
        const quer = lc ? Math.max(-1.2, Math.min(1.2, Math.atan2(-lc.x, -lc.z))) : 0.35 * Math.sin(t * 0.31);
        cabecaDoCao.rotation.y += (quer - cabecaDoCao.rotation.y) * Math.min(1, dt * 5);
        cabecaDoCao.rotation.z = 0.12 * Math.sin(t * 0.7);
        rabo.rotation.y = (c ? 0.8 : 0.3) * Math.sin(t * (c ? 16 : 7));
        lingua.position.y = -0.072 - 0.006 * Math.sin(t * 9);
        const colado = !!c && Math.hypot(c.x - xC, c.z - zC) < 2.2;
        if (colado && !coladoAntes && t - latiu > 12) { latiu = t; som.efeito('latido', { x: xC, z: zC }, 14); }
        coladoAntes = colado;
        cabecaDoCao.position.y = 0.5 + (t - latiu < 0.4 ? 0.03 * Math.sin((t - latiu) / 0.4 * Math.PI * 2) ** 2 : 0);
        // os pombos
        for (const p of pombos) {
          const pos = p.g.position;
          if (p.estado === 'voando') {
            p.u = Math.min(1, p.u + dt / p.dura);
            pos.lerpVectors(p.de, p.para, p.u * p.u * (3 - 2 * p.u));
            pos.y += Math.sin(Math.PI * p.u) * p.arco;
            p.asas.forEach((o, i) => { o.rotation.z = (i ? 1 : -1) * 0.75 * Math.sin(t * 26 + p.vez); });
            if (p.u >= 1) { p.estado = p.depois; p.espera = p.depois === 'chao' ? 1 + Math.random() * 2 : 7 + Math.random() * 12; dobrar(p); }
          } else if (p.estado === 'pousado') {     // no alto, até a praça ficar calma
            p.espera -= dt;
            if (p.espera <= 0) {
              const chao = chaoLivre(robos);
              if (chao) { p.pouso.de = null; p.pouso = null; decolar(p, chao, 'chao'); } else p.espera = 3;
            }
          } else {                                 // no chão: anda um pouco, para, bica; e foge de quem chega perto
            if (robos.some(q => Math.hypot(q.x - pos.x, q.z - pos.z) < 1.35)) {
              const livres = pousos.filter(l => !l.de), l = livres[Math.floor(Math.random() * livres.length)];
              if (l) { l.de = p; p.pouso = l; decolar(p, l, 'pousado'); som.efeito('asas', { x: pos.x, z: pos.z }, 12); continue; }
            }
            p.espera -= dt;
            if (p.ate) {
              const dx = p.ate.x - pos.x, dz = p.ate.z - pos.z, d = Math.hypot(dx, dz);
              if (d < 0.05) { p.ate = null; p.espera = 1 + Math.random() * 4; }
              else { pos.x += dx / d * 0.28 * dt; pos.z += dz / d * 0.28 * dt; p.g.rotation.y = Math.atan2(-dx, -dz); }
              p.cab.position.z = -0.085 - 0.012 * Math.sin(t * 16 + p.vez);
            } else if (p.espera <= 0) {
              const a = Math.random() * 6.283, x = pos.x + Math.cos(a) * 0.7, z = pos.z + Math.sin(a) * 0.7, r = Math.hypot(x - PX, z - PZ);
              if (r > 0.95 && r < R_PRACA - 0.5 && !noMovel(x, z, 0.12)) p.ate = { x, z }; else p.espera = 0.5;
            }
            const bica = (t * 0.9 + p.vez) % 3;
            p.g.rotation.x = !p.ate && bica < 0.5 ? -0.55 * Math.sin(bica / 0.5 * Math.PI) : 0;
            p.arrulho -= dt;
            if (p.arrulho < 0) { p.arrulho = 9 + Math.random() * 24; som.efeito('arrulho', { x: pos.x, z: pos.z }, 9); }
          }
        }
      } };
    }

    // --- cercas, cercas vivas e árvores ---
    // uma cerca viva reta, de (x1, z1) a (x2, z2), ao longo de x ou de z
    const sebe = (x1, z1, x2, z2, alt = 0.55, larg = 0.36) => {
      const emX = Math.abs(x2 - x1) >= Math.abs(z2 - z1), comprimento = Math.abs(emX ? x2 - x1 : z2 - z1);
      malha(g, caixaSuave(emX ? comprimento : larg, alt, emX ? larg : comprimento, 0.1), sebeMat, (x1 + x2) / 2, alt / 2, (z1 + z2) / 2);
    };
    // ...e a que acompanha a volta da rotatória, por fora da calçada, entre uma rua e a outra (os ângulos são medidos a partir da rua do leste ou do oeste)
    const sebeCurva = (sx, sz, a1, a2) => {
      const pontos = [...arco(R_CALCADA + 0.1, a1, a2, sx, sz), ...arco(R_CALCADA + 0.4, a2, a1, sx, sz)];
      malha(g, new T.ExtrudeGeometry(forma(pontos), { depth: 0.44, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 2 }).rotateX(-Math.PI / 2), sebeMat, 0, 0.03, 0);
    };
    // uma cerca de ripas brancas, de (x1, z1) a (x2, z2), ao longo de x ou de z (do menor para o maior)
    const cerca = (x1, z1, x2, z2) => {
      const emX = z1 === z2, comprimento = emX ? x2 - x1 : z2 - z1, pecas = [], ripas = Math.max(2, Math.round(comprimento / 0.14)), vaos = Math.max(1, Math.round(comprimento / 1.5));
      const peca = (l, a, p, t, y) => pecas.push(new T.BoxGeometry(emX ? l : p, a, emX ? p : l).translate(emX ? x1 + t : x1, y, emX ? z1 : z1 + t));
      for (let i = 0; i <= ripas; i++) peca(0.075, 0.6, 0.025, comprimento * i / ripas, 0.35);
      for (const y of [0.2, 0.5]) peca(comprimento, 0.05, 0.035, comprimento / 2, y);
      for (let i = 0; i <= vaos; i++) peca(0.09, 0.72, 0.09, comprimento * i / vaos, 0.36);
      malha(g, juntar(pecas), ripa, 0, 0, 0);
    };
    // As árvores: um tronco e uma copa de bolas facetadas. As copas de todas vão para poucas
    // malhas (uma por tom de verde ou de flor), montadas no fim.
    const CORES_DAS_COPAS = { verde: [0x4d9a45, 0x5fae50, 0x3c8640], amarelo: [0xf4c531, 0xe5ab1c], rosa: [0xf29bbd, 0xe277a5] };
    const copas = { verde: [[], [], []], amarelo: [[], []], rosa: [[], []] }, troncos = [], moitas = [];
    const arvore = (x, z, o = {}) => {           // o: { barra: o robô não passa; flor: 'amarelo' ou 'rosa' (um ipê); escala; simples: de longe, com menos bolas }
      const e = o.escala || 1, sorte = aleatorio(Math.round((x + 80) * 97 + (z + 80) * 131)), tons = copas[o.flor || 'verde'];
      troncos.push(new T.CylinderGeometry(0.09 * e, 0.15 * e, 1.8 * e, 8).translate(x, 0.9 * e, z));
      const bolas = o.simples ? [[0, 2.3, 0, 0.82], [0.3, 2.95, 0.1, 0.55]]
        : [[0, 2.25, 0, 0.72], [0.45, 2.05, 0.15, 0.5], [-0.42, 2.1, 0.12, 0.52], [0.05, 2.1, -0.45, 0.5], [0, 2.15, 0.48, 0.46], [0.05, 2.82, 0.02, 0.5]];
      bolas.forEach(([dx, dy, dz, r], i) => tons[i % tons.length].push(new T.IcosahedronGeometry(r * e * (0.92 + sorte() * 0.16), 1).rotateY(sorte() * 6.28).translate(x + dx * e, dy * e, z + dz * e)));
      if (o.barra) bloco('árvore', x - 0.15, x + 0.15, z - 0.15, z + 0.15);
    };
    const moita = (x, z, r, flores) => {         // uma moita baixa; com `flores`, salpicada delas
      const sorte = aleatorio(Math.round((x + 80) * 53 + (z + 80) * 71));
      moitas.push(new T.IcosahedronGeometry(1, 1).scale(r, r * 0.7, r).translate(x, r * 0.45, z));
      for (let i = 0; i < (flores || 0); i++) { const a = sorte() * 6.283, d = sorte() * r * 0.8; flor(x + Math.cos(a) * d, r * 0.95 + sorte() * 0.08 - d * 0.3, z + Math.sin(a) * d, 0.055, CORES_DAS_FLORES[Math.floor(sorte() * CORES_DAS_FLORES.length)]); }
    };
    // o que fecha o calçamento onde não há parede: as cercas dos jardins e a cerca viva da volta da rotatória
    const QUINA = Math.asin(MR / R_CALCADA);     // o ângulo em que a volta da calçada encontra a beirada de cada rua
    sebeCurva(-1, -1, QUINA, Math.PI / 2 - QUINA); sebeCurva(-1, 1, 0.5, Math.PI / 2 - QUINA);   // (do lado do mercadinho, começa depois da quina dele)
    sebeCurva(1, 1, 0.46, Math.PI / 2 - QUINA); sebeCurva(1, -1, 0.46, Math.PI / 2 - QUINA);
    sebe(8.12, 3.86, 8.5, 3.86);                  // da quina da nossa casa até a volta
    // (ao lado da nossa casa não há cerca: é a entrada de carro)
    cerca(FIM.o, 8.6, -4.35, 8.6);                // antes da padaria
    cerca(2.05, 8.6, 3.35, 8.6);                  // entre a padaria e o mercadinho
    cerca(23.65, 8.6, FIM.l, 8.6);                // depois da farmácia
    cerca(11.63, FIM.s, 11.63, 0.85);             // o nosso quintal, na rua do sul
    sebe(16.37, -0.85, 16.37, 0.85); cerca(16.37, FIM.s, 16.37, -5.15);                      // antes e depois do flat da rua do sul
    sebe(11.63, 11.65, 11.63, 13.45); cerca(11.63, 17.95, 11.63, FIM.n);                    // antes e depois da escola
    cerca(16.37, 11.6, 16.37, FIM.n);             // o parquinho
    // onde a cidade acaba: um cavalete listrado fecha a pista, e uma moita alta, cada calçada
    const listras = mat(0xffffff, { roughness: 0.6, map: texturaCanvas(256, 32, (c, l, a) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#d8362b'; c.fillRect(i * l / 8, 0, l / 8, a); } }) });
    // Uma cancela: dois postes, um de cada lado da pista, e o braço listrado, que gira no alto de um deles.
    // Fica fechada, com o braço deitado de um poste ao outro, e só abre para o carro passar (ver animarCancelas).
    const cancela = (x, z, aoLongoDeX) => {
      const b = new T.Group(), eixo = new T.Group();
      b.position.set(x, 0, z); if (!aoLongoDeX) b.rotation.y = Math.PI / 2;
      g.add(b);
      for (const dx of [-1.5, 1.5]) caixa(0.14, 1.1, 0.14, ferro, dx, 0.55, 0, b);
      eixo.position.set(-1.5, 1.05, 0);
      b.add(eixo);
      caixa(2.9, 0.12, 0.05, listras, 1.45, 0, 0, eixo);
      vila.cancelas.push({ x, z, eixo, aberta: 0, abrindo: false });
    };
    const cavalete = (x, z, aoLongoDeX) => {
      const b = new T.Group();
      b.position.set(x, 0, z); if (!aoLongoDeX) b.rotation.y = Math.PI / 2;
      g.add(b);
      for (const y of [0.5, 0.84]) caixa(2.5, 0.16, 0.04, listras, 0, y, 0, b);
      for (const dx of [-1.05, 1.05]) { caixa(0.06, 0.96, 0.06, ferro, dx, 0.48, 0, b); caixa(0.06, 0.05, 0.5, ferro, dx, 0.025, 0, b); }
    };
    for (const s of [-1, 1]) {
      // (as estradas do leste e do norte levam aos passeios: nelas, uma cancela, que só abre para o carro passar. A pé não se passa de nenhuma.)
      (s < 0 ? cavalete : cancela)(s < 0 ? CIDADE.oeste - 0.15 : CIDADE.leste + 0.15, PZ, false);
      (s < 0 ? cavalete : cancela)(PX, s < 0 ? CIDADE.sul - 0.15 : CIDADE.norte + 0.15, true);
      for (const lado of [-1, 1]) {
        malha(g, caixaSuave(0.4, 0.9, 1.0, 0.12), sebeMat, s < 0 ? FIM.o + 0.2 : FIM.l - 0.2, 0.45, PZ + lado * 1.72);
        malha(g, caixaSuave(1.0, 0.9, 0.4, 0.12), sebeMat, PX + lado * 1.72, 0.45, s < 0 ? FIM.s + 0.2 : FIM.n - 0.2);
      }
    }
    // as árvores da cidade: na calçada da nossa rua, nos jardins e nos cantos da praça...
    arvore(-1.6, -2.4);                           // (na calçada não há árvores: ela é estreita, e o robô não passaria)
    arvore(-4.3, -1.7, { flor: 'rosa' }); arvore(2.7, 10.4, { escala: 0.8 }); arvore(9.9, -3.3); arvore(10.3, -0.5, { flor: 'amarelo', escala: 0.9 });
    arvore(10.1, 12.0, { escala: 0.95 }); arvore(17.9, 12.1); arvore(17.9, 0.4, { escala: 0.95 });
    arvore(18.8, 15.0, { flor: 'amarelo', escala: 1.1 }); arvore(20.6, 17.1); arvore(17.7, 17.5, { escala: 0.85 });
    arvore(-3.2, 13.6, { escala: 1.15 }); arvore(5.8, 14.4, { escala: 1.1 }); arvore(22.4, 14.2); arvore(27.9, -2.6, { flor: 'rosa' }); arvore(4.5, -2.2, { escala: 1.1 }); arvore(-0.5, -2.6);
    {
      // ...e as do campo em volta, mais simples, longe das ruas
      const sorte = aleatorio(4711);
      for (let i = 0; i < 46; i++) {
        const a = sorte() * 6.283, longe = 27 + sorte() * 60, x = MEIO.x + Math.cos(a) * longe, z = MEIO.z + Math.sin(a) * longe;
        if (Math.abs(x - PX) < 4 || Math.abs(z - PZ) < 4) continue;
        arvore(x, z, { simples: true, escala: 0.9 + sorte() * 0.7, flor: sorte() < 0.12 ? 'amarelo' : sorte() < 0.1 ? 'rosa' : undefined });
      }
    }
    moita(-2.95, 0.5, 0.3, 4);                    // ao lado da entrada de carro
    moita(2.3, 9.2, 0.36, 6); moita(3.1, 9.4, 0.3, 5);                                          // entre a padaria e o mercadinho
    moita(9.3, 1.5, 0.4, 6); moita(9.6, -0.9, 0.34); moita(8.9, -2.2, 0.45, 8);                 // o quintal
    moita(17.4, 14.0, 0.45, 8); moita(19.6, 13.4, 0.4, 7); moita(21.2, 15.2, 0.5, 9); moita(17.2, 16.2, 0.36, 5);   // o parquinho
    moita(18.7, 10.9, 0.38, 6); moita(9.3, 10.9, 0.38, 6); moita(18.7, 1.6, 0.36, 5);          // os cantos da praça
    banco(20.3, 14.9, Math.PI / 2);               // o banco do parquinho, virado para a rua
    banco(-2.0, 8.14, 0, AC); bloco('banco', -2.7, -1.3, 7.9, 8.35);                            // o banco da frente da padaria, debaixo do toldo
    poste(1.5, 4.13); poste(-4.3, 8.37); poste(23.8, 8.37); poste(11.88, 13.0); poste(11.88, -3.0);   // rente às paredes e às cercas: no meio da calçada atrapalhariam o caminho
    caixa(0.07, 0.95, 0.07, ferro, 7.15, 0.475, 4.28); malha(g, caixaSuave(0.3, 0.2, 0.2, 0.04), liso(0xc8372d, 0.5), 7.15, 1.02, 4.28);   // a caixa de correio

    // --- um carro, estacionado na nossa rua ---
    // (a frente dele olha para +x; `giro` vira)
    function carro(x, z, giro, hex) {
      const c = new T.Group(), LARG = 1.46;
      c.position.set(x, 0, z); c.rotation.y = giro;
      g.add(c);
      const lataria = mat(hex, { roughness: 0.3, metalness: 0.35, envMap: reflexoDaRua, envMapIntensity: 0.9 });
      const latariaDosDoisLados = lataria.clone();                              // (para as chapas da cabine, que se veem por fora e por dentro)
      latariaDosDoisLados.side = T.DoubleSide;
      // os vidros são transparentes: de fora vê-se quem vai no carro, e quem vai nele vê a rua (ver aplicarVisual)
      const vidraca = mat(0xbfdcea, { roughness: 0.03, metalness: 0.2, envMap: reflexoDaRua, envMapIntensity: 1.1, transparent: true, opacity: 0.22, depthWrite: false, side: T.DoubleSide });
      const borracha = liso(0x17181a, 0.9), plastico = liso(0x25282c, 0.6), cromado = mat(0xd0d5da, { metalness: 0.9, roughness: 0.25, envMap: reflexoDaRua });
      const forro = liso(0x23272c, 0.9), tecido = liso(0x4d525b, 0.95);
      const caminho = (traco, pontos) => { pontos.forEach((p, i) => { if (!i) traco.moveTo(p[0], p[1]); else if (p.length === 4) traco.quadraticCurveTo(p[0], p[1], p[2], p[3]); else traco.lineTo(p[0], p[1]); }); return traco; };
      const envidracar = (geo, x, y, z) => { const m = malha(c, geo, vidraca, x, y, z); vidros.push(m); return m; };   // (os vidros não fazem sombra: ver `vidros`)
      // um perfil de lado (x = comprimento, y = altura; um ponto de quatro números é uma curva), esticado na largura do carro
      const perfilado = (pontos, largura, chanfro) => {
        const s = new T.Shape();
        pontos.forEach((p, i) => { if (!i) s.moveTo(p[0], p[1]); else if (p.length === 4) s.quadraticCurveTo(p[0], p[1], p[2], p[3]); else s.lineTo(p[0], p[1]); });
        return new T.ExtrudeGeometry(s, { depth: largura - 2 * chanfro, bevelEnabled: true, bevelThickness: chanfro, bevelSize: chanfro * 0.8, bevelSegments: 3, curveSegments: 8 }).translate(0, 0, chanfro - largura / 2);
      };
      // a carroceria de baixo, de um para-choque ao outro, com o assoalho por baixo, entre as rodas
      malha(c, perfilado([[-1.6, 0.34], [-1.64, 0.62], [-1.64, 0.86, -1.5, 0.9], [0.98, 0.92], [1.5, 0.82], [1.66, 0.78, 1.66, 0.6], [1.62, 0.34]], LARG, 0.06), lataria, 0, 0, 0);
      malha(c, new T.BoxGeometry(2.5, 0.23, 1.06), plastico, 0, 0.245, 0);
      // A cabine, mais estreita, por cima: é oca. O teto, as duas laterais (uma chapa de cada lado, com os
      // furos das janelas) e as colunas da frente e de trás; por dentro, o piso (na altura da cintura
      // da lataria: do banco para baixo não se vê), o painel e os encostos dos dois bancos.
      const JANELAS = [[[-1.36, 0.93], [-1.06, 1.27], [-0.44, 1.29], [-0.44, 0.93]], [[-0.36, 0.93], [-0.36, 1.29], [0.28, 1.29], [0.84, 0.93]]];
      malha(c, perfilado([[-1.1, 1.3], [-1.05, 1.38, -0.9, 1.38], [0.14, 1.38], [0.28, 1.38, 0.36, 1.315], [0.3, 1.3], [0.16, 1.335], [-0.9, 1.335], [-1.04, 1.3]], 1.28, 0.012), lataria, 0, 0, 0);
      const lateral = caminho(new T.Shape(), [[-1.5, 0.86], [-1.08, 1.32], [-1.04, 1.38, -0.9, 1.38], [0.14, 1.38], [0.28, 1.38, 0.34, 1.33], [0.98, 0.9]]);
      for (const pontos of JANELAS) lateral.holes.push(caminho(new T.Path(), pontos));
      for (const lado of [-1, 1]) {
        malha(c, new T.ShapeGeometry(lateral), latariaDosDoisLados, 0, 0, lado * 0.63);
        malha(c, new T.BoxGeometry(0.775, 0.05, 0.05), lataria, 0.66, 1.115, lado * 0.612).rotation.z = -0.592;   // a coluna do para-brisa
        malha(c, new T.BoxGeometry(0.625, 0.05, 0.05), lataria, -1.29, 1.09, lado * 0.612).rotation.z = 0.831;    // a coluna de trás
      }
      malha(c, new T.BoxGeometry(2.41, 0.02, 1.22), forro, -0.255, 0.975, 0);                 // (logo acima do alto da carroceria, que o chanfro deixa em 0,97)
      malha(c, caixaSuave(0.4, 0.03, 1.2, 0.012), plastico, 0.75, 0.99, 0);                    // o painel, baixo, para tapar o mínimo da rua de quem vai dentro
      for (const [x, alt] of [[-0.32, 0.3], [-1.02, 0.27]]) malha(c, caixaSuave(0.1, alt, 1.12, 0.03), tecido, x, 0.975 + alt / 2, 0);
      // os vidros: os dos lados (dois de cada), o para-brisa e o de trás
      for (const pontos of JANELAS) for (const lado of [-1, 1]) envidracar(new T.ShapeGeometry(caminho(new T.Shape(), pontos)), 0, 0, lado * 0.629);
      envidracar(new T.PlaneGeometry(0.775, 1.21).rotateX(Math.PI / 2), 0.66, 1.115, 0).rotation.z = -0.592;
      envidracar(new T.PlaneGeometry(0.625, 1.21).rotateX(Math.PI / 2), -1.29, 1.09, 0).rotation.z = 0.831;
      for (const rx of [-1.02, 1.04]) for (const lado of [-1, 1]) {            // as rodas: o pneu, a calota e, atrás, o vão escuro do para-lama
        const roda = new T.Group();
        roda.position.set(rx, 0.3, lado * 0.66); roda.rotation.x = Math.PI / 2;
        c.add(roda);
        malha(roda, new T.CylinderGeometry(0.3, 0.3, 0.2, 28), borracha, 0, 0, 0);
        malha(roda, new T.CylinderGeometry(0.18, 0.18, 0.21, 20), cromado, 0, 0, 0);
        malha(roda, new T.CylinderGeometry(0.36, 0.36, 0.03, 28), plastico, 0, lado * 0.072, 0);
      }
      const placaDoCarro = mat(0xffffff, { roughness: 0.5, map: texturaCanvas(256, 84, (p, l, a) => {
        p.fillStyle = '#f4f4f0'; p.fillRect(0, 0, l, a);
        p.fillStyle = '#1f4fa3'; p.fillRect(0, 0, l, 20);
        letras(p, 'BRASIL', l / 2, 11, 15, '#ffffff', l); letras(p, 'ESP3L40', l / 2, 54, 50, '#14181c', l - 16);
      }) });
      for (const lado of [-1, 1]) {
        malha(c, caixaSuave(0.14, 0.2, LARG - 0.04, 0.05), plastico, lado > 0 ? 1.67 : -1.66, 0.43, 0);                       // os para-choques, com a placa
        malha(c, new T.PlaneGeometry(0.4, 0.13), placaDoCarro, lado > 0 ? 1.745 : -1.735, 0.43, 0).rotation.y = lado * Math.PI / 2;
        malha(c, caixaSuave(0.06, 0.13, 0.32, 0.025), luminoso({ color: 0xfff6dc }), 1.69, 0.69, lado * 0.47);                // os faróis
        malha(c, caixaSuave(0.06, 0.14, 0.26, 0.025), mat(0xc9261f, { roughness: 0.3, emissive: 0x5a0b08 }), -1.675, 0.73, lado * 0.5);   // as lanternas
        malha(c, caixaSuave(0.1, 0.07, 0.06, 0.02), lataria, 0.74, 0.97, lado * 0.7);                                         // os retrovisores
        for (const lx of [-0.42, 0.5]) malha(c, new T.BoxGeometry(0.012, 0.44, 0.01), plastico, lx, 0.66, lado * 0.731);      // as frestas das portas
        for (const lx of [-0.62, 0.3]) malha(c, new T.BoxGeometry(0.12, 0.025, 0.02), cromado, lx, 0.84, lado * 0.735);       // as maçanetas
      }
      malha(c, new T.BoxGeometry(0.02, 0.1, 0.56), plastico, 1.715, 0.66, 0);                                                 // a grade, entre os faróis
      const mancha = malha(c, new T.PlaneGeometry(3.9, 2.0), new T.MeshBasicMaterial({ map: texSombra, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), 0, 0.012, 0);
      mancha.rotation.x = -Math.PI / 2;
      return c;
    }
    {
      // Na entrada ao lado da nossa casa, de frente para a rua. Dá para entrar nele e dirigir (ver "o carro"):
      // o jogo não pede isso em lugar nenhum. Parado, ele barra o caminho como um móvel.
      const c = carro(-4.0, 1.95, -Math.PI / 2, 0x2f6fb5), aro = new T.Group(), barras = [0, 1, 2].map(() => ({ nome: 'carro', r: 0.01, cx: 1e6, cz: 1e6, x1: 1e6, x2: 1e6, z1: 1e6, z2: 1e6 }));
      for (const [l, p, x, z] of [[3.6, 0.06, 0, 0.84], [3.6, 0.06, 0, -0.84], [0.06, 1.74, 1.8, 0], [0.06, 1.74, -1.8, 0]]) malha(aro, new T.BoxGeometry(l, 0.05, p), M.destaque, x, 0.04, z);
      aro.visible = false;
      c.add(aro);
      blocos.push(...barras);
      // (onde: em que ponto de parada ele está; viagem: a que está fazendo agora, ou null; yaw: para onde aponta, no meio de uma viagem)
      vila.carro = { nome: 'carro', ehCarro: true, grupo: c, x: -4.0, z: 1.95, rumo: 4, yaw: 4 * GIRO, sala: 4, motorista: null, contorno: aro, barras, onde: 'garagem', viagem: null,
        // o ponto da lataria mais perto de (px, pz): é dele que se mede se o carro está ao alcance
        pontoMaisPerto(px, pz) {
          const a = this.rumo * GIRO, fx = -Math.sin(a), fz = -Math.cos(a), dx = px - this.x, dz = pz - this.z;
          const ao = Math.max(-CARRO.meio, Math.min(CARRO.meio, dx * fx + dz * fz)), deLado = Math.max(-CARRO.lado, Math.min(CARRO.lado, dx * fz - dz * fx));
          return { x: this.x + ao * fx + deLado * fz, z: this.z + ao * fz - deLado * fx };
        },
        // Onde ele barra o caminho de quem anda: três círculos, enfileirados ao longo dele. (Numa gravação
        // de quando era dirigido à mão: um retângulo, se está ao longo de uma rua; de viés, um círculo.)
        assentar() {
          const [b, ...resto] = this.barras;
          if (carroManual) {
            const k = ((this.rumo % 8) + 8) % 8, m = CARRO.meio, l = CARRO.lado, r = 1.15;
            delete b.r; delete b.cx; delete b.cz;
            if (k % 2) Object.assign(b, { r, cx: this.x, cz: this.z, x1: this.x - r, x2: this.x + r, z1: this.z - r, z2: this.z + r });
            else Object.assign(b, k % 4 ? { x1: this.x - m, x2: this.x + m, z1: this.z - l, z2: this.z + l } : { x1: this.x - l, x2: this.x + l, z1: this.z - m, z2: this.z + m });
            for (const q of resto) Object.assign(q, { r: 0.01, cx: 1e6, cz: 1e6, x1: 1e6, x2: 1e6, z1: 1e6, z2: 1e6 });
            return;
          }
          const a = this.viagem ? this.yaw : this.rumo * GIRO, fx = -Math.sin(a), fz = -Math.cos(a), r = CARRO.lado;
          this.barras.forEach((q, i) => { const cx = this.x + fx * (i - 1), cz = this.z + fz * (i - 1); Object.assign(q, { r, cx, cz, x1: cx - r, x2: cx + r, z1: cz - r, z2: cz + r }); });
        } };
      vila.carro.assentar();
    }
    laje(ret(-4.95, -3.05, 0.1, 4.06), calcada, 0.02);                                      // a entrada de carro, calçada

    // --- as fachadas (não dá para entrar) ---
    // Cada prédio de enfeite é uma caixa com a fachada pintada na face da frente. No desenho, as
    // medidas são em metros: x a partir da esquerda de quem olha, y a partir do chão.
    const pintar = o => (c, l, a, e) => {
      const sorte = aleatorio(l * 31 + a), larg = l / e, alt = a / e;
      const R = (x, y, w, h) => c.fillRect(x * e, a - (y + h) * e, w * e, h * e), bola = (x, y, r) => { c.beginPath(); c.arc(x * e, a - y * e, r * e, 0, 7); c.fill(); };
      const degrade = (x, y, w, h, emCima, embaixo) => { const d = c.createLinearGradient(0, a - (y + h) * e, 0, a - y * e); d.addColorStop(0, emCima); d.addColorStop(1, embaixo); c.fillStyle = d; R(x, y, w, h); };
      const vidraca = (x, y, w, h) => {          // um vidro: o céu refletido e um brilho atravessado
        degrade(x, y, w, h, '#d6ecf7', '#7fb2cf');
        c.fillStyle = 'rgba(255,255,255,0.35)';
        c.beginPath(); c.moveTo((x + w * 0.12) * e, a - (y + h * 0.08) * e); c.lineTo((x + w * 0.42) * e, a - (y + h * 0.92) * e); c.lineTo((x + w * 0.6) * e, a - (y + h * 0.92) * e); c.lineTo((x + w * 0.3) * e, a - (y + h * 0.08) * e); c.fill();
      };
      c.fillStyle = o.parede; c.fillRect(0, 0, l, a);
      salpicar(c, Math.max(l, a), l * a / 70, sorte, '255,255,255', '0,0,0', 4, 0.03);     // o grão do reboco
      degrade(0, alt - 0.45, larg, 0.45, 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0)');             // a sombra do beiral
      c.fillStyle = o.barrado || 'rgba(0,0,0,0.2)'; R(0, 0, larg, 0.38);                   // o barrado
      c.fillStyle = 'rgba(255,255,255,0.3)'; R(0, 0.38, larg, 0.02);
      for (const [x, w] of o.vitrines || []) {
        c.fillStyle = 'rgba(0,0,0,0.25)'; R(x - 0.1, 0.42, w + 0.2, 1.76);
        c.fillStyle = '#39454e'; R(x - 0.07, 0.46, w + 0.14, 1.7);
        vidraca(x, 0.54, w, 1.54);
        c.fillStyle = 'rgba(40,50,58,0.35)'; R(x, 0.54, w, 0.5);                           // o fundo da vitrine, mais escuro embaixo
        for (let i = 0, n = Math.max(2, Math.floor(w / 0.24)); i < n; i++) { c.fillStyle = (o.exposto || ['#d9a25a', '#c98a3c', '#e8c27a'])[i % 3]; bola(x + 0.14 + i * (w - 0.28) / (n - 1), 0.7, 0.085); }   // o que está exposto
        c.fillStyle = '#39454e'; if (w > 2) R(x + w / 2 - 0.025, 0.54, 0.05, 1.54);
      }
      for (const x of o.janelas || []) {
        if (o.venezianas) for (const vx of [x - 0.32, x + 0.92]) {
          c.fillStyle = o.venezianas; R(vx, 0.98, 0.3, 1.04);
          c.fillStyle = 'rgba(0,0,0,0.22)'; for (let i = 0; i < 9; i++) R(vx + 0.03, 1.02 + i * 0.11, 0.24, 0.03);
        }
        c.fillStyle = 'rgba(0,0,0,0.2)'; R(x - 0.1, 0.9, 1.1, 1.2);
        c.fillStyle = '#ffffff'; R(x - 0.07, 0.94, 1.04, 1.13);
        vidraca(x, 1.0, 0.9, 1.0);
        c.fillStyle = '#ffffff'; R(x + 0.43, 1.0, 0.04, 1.0); R(x, 1.48, 0.9, 0.04);
        c.fillStyle = '#7a4a2a'; R(x - 0.12, 0.76, 1.14, 0.18);                            // a floreira
        c.fillStyle = '#4f9d4a'; R(x - 0.1, 0.92, 1.1, 0.05);
        for (let i = 0; i < 6; i++) { c.fillStyle = ['#e4572e', '#f2c230', '#f06aa8'][i % 3]; bola(x + i * 0.18, 0.99, 0.065); }
      }
      for (const [x, cor] of o.portas || []) {
        c.fillStyle = 'rgba(0,0,0,0.28)'; R(x - 0.1, 0, 1.1, 2.46);
        c.fillStyle = '#f5f2ea'; R(x - 0.07, 0, 1.04, 2.42);                                // o batente
        vidraca(x, 2.14, 0.9, 0.22);                                                        // a bandeira: o vidro de cima da porta
        c.fillStyle = cor; R(x, 0.04, 0.9, 2.06);
        for (const y of [0.22, 1.2]) { c.fillStyle = 'rgba(0,0,0,0.2)'; R(x + 0.12, y, 0.66, 0.76); c.fillStyle = 'rgba(255,255,255,0.14)'; R(x + 0.15, y + 0.03, 0.6, 0.7); }
        c.fillStyle = '#e9c46a'; bola(x + 0.79, 1.06, 0.045);
        c.fillStyle = '#b9b4a8'; R(x - 0.15, 0, 1.2, 0.05);                                 // a soleira
      }
      if (o.toldo) {                             // a barra do toldo (a lona é uma peça à parte: ver predio)
        const [x, w, c1, c2] = o.toldo;
        degrade(x, 1.9, w, 0.3, 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0)');
        for (let i = 0; i * 0.25 < w; i++) { c.fillStyle = i % 2 ? c1 : c2; R(x + i * 0.25, 2.2, Math.min(0.25, w - i * 0.25), 0.26); bola(x + i * 0.25 + 0.125, 2.2, 0.125); }
      }
      if (o.letreiro) {
        const [texto, fundo, letra] = o.letreiro, y = alt - 0.66;
        c.fillStyle = 'rgba(0,0,0,0.25)'; R(0.27, y - 0.04, larg - 0.54, 0.52);
        c.fillStyle = fundo; R(0.3, y, larg - 0.6, 0.48);
        c.strokeStyle = letra; c.lineWidth = 0.02 * e; c.strokeRect(0.35 * e, a - (y + 0.43) * e, (larg - 0.7) * e, 0.38 * e);
        letras(c, texto, l / 2, a - (y + 0.24) * e + 3, 0.3 * e, letra, l - 1.1 * e);
      }
      if (o.cruz) { c.fillStyle = '#ffffff'; bola(o.cruz, 1.5, 0.42); c.fillStyle = '#1f9d55'; R(o.cruz - 0.1, 1.2, 0.2, 0.6); R(o.cruz - 0.3, 1.4, 0.6, 0.2); }
    };
    // (x, z): o meio da frente; giro: para onde a frente olha (0 = +z, π = -z, π/2 = +x, -π/2 = -x); L: a largura da frente
    function predio(x, z, giro, L, altura, corDaTelha, desenho) {
      const p = new T.Group(), fundo = 4, E = 160;
      p.position.set(x, 0, z); p.rotation.y = giro;
      g.add(p);
      malha(p, escalarUV(new T.BoxGeometry(L, altura, fundo), L / 2, altura / 2), rebocado(new T.Color(desenho.parede).getHex()), 0, altura / 2, -fundo / 2);
      const fachada = texturaCanvas(Math.round(L * E), Math.round(altura * E), (c, l, a) => pintar(desenho)(c, l, a, E));
      malha(p, new T.PlaneGeometry(L, altura), mat(0xffffff, { map: fachada, roughness: 0.85 }), 0, altura / 2, 0.012);
      cobrir(-L / 2, L / 2, -fundo, 0, altura, 1.1, corDaTelha, p);
      if (desenho.toldo) {                       // a lona do toldo, inclinada para a rua
        const [tx, tw, c1, c2] = desenho.toldo, faixas = Math.round(tw / 0.25);
        const lona = mat(0xffffff, { roughness: 0.8, map: texturaCanvas(faixas * 32, 32, (c, l, a) => { for (let i = 0; i < faixas; i++) { c.fillStyle = i % 2 ? c1 : c2; c.fillRect(i * 32, 0, 32, a); } }) });
        malha(p, new T.BoxGeometry(tw, 0.04, 0.8), lona, tx + tw / 2 - L / 2, 2.42, 0.4).rotation.x = 0.3;
      }
    }
    predio(11.75, 15.7, Math.PI / 2, 4.2, 3.2, 0xa85a3c, { parede: '#f3e2a9', portas: [[1.65, '#3d6fa8']], janelas: [0.35, 2.95], letreiro: ['ESCOLA', '#3d6fa8', '#ffffff'] });

    // --- fora da cidade: a hidrelétrica (no fim da estrada do norte) e a cachoeira (no fim da do leste) ---
    // Só se chega de carro (ver "o carro"). Cada estrada acaba num retorno redondo, em volta de um
    // canteiro: o carro dá a volta e para na beirada de fora, e o robô desce a pé num lugar de passeio.
    // Não há nada para fazer ali: são lugares para ver. (O jogo não fala deles; as placas da cidade, sim.)
    {
      const USINA = { x: PX, z: 84, r: 6 }, QUEDA = { x: 100, z: PZ, r: 6 };
      const concreto = rebocado(0xb7b4ab), concretoEscuro = liso(0x8f8d86, 0.9), pedra = mat(0x77736b, { roughness: 1, flatShading: true }), pedraClara = mat(0x8d897f, { roughness: 1, flatShading: true });
      const deck = liso(0x9a7148, 0.8), verdePlaca = liso(0x1f6b4a, 0.6);
      // a água parada (o lago, o rio, o poço) e a que cai (o vertedouro e a cachoeira), cada uma com o seu desenho, que corre
      const texAgua = repetida(texturaCanvas(256, 256, (c, l) => {
        c.fillStyle = '#3f8fb5'; c.fillRect(0, 0, l, l);
        const sorte = aleatorio(321);
        for (let i = 0; i < 90; i++) {
          c.strokeStyle = `rgba(255,255,255,${0.05 + sorte() * 0.12})`; c.lineWidth = 1 + sorte() * 2;
          const x = sorte() * l, y = sorte() * l, w = 14 + sorte() * 40;
          c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + w / 2, y - 4 - sorte() * 5, x + w, y); c.stroke();
        }
      }));
      const agua = mat(0xffffff, { map: texAgua, roughness: 0.1, metalness: 0.25, envMap: reflexoDaRua, envMapIntensity: 1.2 });
      agua.userData.lado = 7;
      const queda = () => {
        const t = repetida(texturaCanvas(128, 256, (c, l, a) => {
          c.fillStyle = '#9fd0e6'; c.fillRect(0, 0, l, a);
          const sorte = aleatorio(77);
          for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(255,255,255,${0.25 + sorte() * 0.6})`; c.fillRect(sorte() * l, sorte() * a, 2 + sorte() * 5, 30 + sorte() * 90); }
        }));
        return { textura: t, material: new T.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.93, side: T.DoubleSide, toneMapped: false, color: 0xdde9ee }) };
      };
      const pedras = [], verdes = [];
      const rocha = (x, y, z, r, achatar, material) => { const m = malha(g, new T.IcosahedronGeometry(r, 1), material || pedra, x, y, z); m.scale.y = achatar || 1; m.rotation.set(x * 1.7, z * 2.3, x + z); pedras.push(m); return m; };
      // Uma placa verde, com o texto dado, em dois pés — que ficam por trás da chapa: pela frente só se vê a placa.
      // Com `vao`, é um pórtico: os pés, mais altos, ficam um de cada lado da pista (a `vao` metros um do
      // outro), e a chapa, no alto, entre eles, presa em duas travessas: lê-se de longe, por cima de quem passa.
      const placa = (linhas, x, z, giro, larg, alt, vao) => {
        const p = new T.Group(), base = vao ? 2.75 : 1.5, grosso = vao ? 0.12 : 0.07, tras = -0.025 - grosso / 2, alto = base + alt + (vao ? 0.1 : 0);
        p.position.set(x, 0, z); p.rotation.y = giro;
        g.add(p);
        for (const dx of vao ? [-vao / 2, vao / 2] : [-larg / 2 + 0.15, larg / 2 - 0.15]) caixa(grosso, alto, grosso, ferro, dx, alto / 2, tras, p);
        if (vao) for (const y of [base + 0.16, base + alt - 0.16]) caixa(vao, 0.08, 0.08, ferro, 0, y, -0.065, p);
        caixa(larg, alt, 0.05, verdePlaca, 0, base + alt / 2, 0, p);
        malha(p, new T.PlaneGeometry(larg - 0.08, alt - 0.08), mat(0xffffff, { roughness: 0.6, map: texturaCanvas(Math.round(larg * 256), Math.round(alt * 256), (c, l, a) => {
          c.fillStyle = '#0a8f5b'; c.fillRect(0, 0, l, a);
          c.strokeStyle = '#ffffff'; c.lineWidth = 8; c.strokeRect(10, 10, l - 20, a - 20);
          linhas.forEach((t, i) => letras(c, t, l / 2, a * (i + 0.5) / linhas.length + 4, i ? Math.min(52, a / linhas.length * 0.5) : Math.min(84, a / linhas.length * 0.62), '#ffffff', l - 50));
        }) }), 0, base + alt / 2, 0.03);
      };
      // o retorno no fim de cada estrada: a pista em volta, o canteiro no meio (com um ipê) e a calçada do passeio
      for (const p of [USINA, QUEDA]) {
        deitar(new T.RingGeometry(p.r - MP, p.r + MP, 72).translate(p.x, -p.z, 0), asfalto, 0.002);
        malha(g, new T.CylinderGeometry(p.r - MP - 0.05, p.r - MP - 0.05, CG, 48), granito, p.x, CG / 2, p.z);
        deitar(new T.CircleGeometry(p.r - MP - 0.18, 48).translate(p.x, -p.z, 0), grama, CG + 0.002);
        redondo('canteiro', p.x, p.z, p.r - MP - 0.05);
        arvore(p.x, p.z, { flor: p === USINA ? 'amarelo' : 'rosa' });
      }

      // a hidrelétrica: o passeio de quem visita, o rio ao pé da barragem, a barragem com o vertedouro, a casa de força e as torres
      lugar(13, 'hidrelétrica', 3, 25, 76, 96.5, { x: USINA.x, y: 3, z: USINA.z, forca: 0 });
      plano(3, 25, 91.4, 97, calcada, 0.004);
      caixa(22, 0.05, 0.05, ferro, 14, 0.78, 96.85); caixa(22, 0.04, 0.04, ferro, 14, 0.42, 96.85);                // a grade do mirante (abaixo dos olhos do robô, para não tapar a vista)
      for (let x = 3; x <= 25; x += 2) caixa(0.07, 0.8, 0.07, ferro, x, 0.4, 96.85);
      placa(['USINA HIDRELÉTRICA', 'barragem · vertedouro · casa de força'], 20.2, 95.9, Math.PI, 3.2, 1.0);
      bloco('placa', 18.6, 21.8, 95.7, 96.1);
      caixa(46, 0.5, 0.4, concretoEscuro, 14, 0.25, 98.4);                                                          // a mureta da margem
      plano(MEIO.x - 300, MEIO.x + 300, 98.6, 109.6, agua, 0.03);                                                   // o rio, que segue para os dois lados
      {
        const perfil = new T.Shape([[0, 0], [7, 12], [10, 12], [10, 0]].map(([a, b]) => new T.Vector2(a, b)));     // (de lado: o pé da barragem, a rampa de jusante, a crista)
        const corpo = malha(g, new T.ExtrudeGeometry(perfil, { depth: 60, bevelEnabled: false }), concreto, 44, 0, 110);
        corpo.rotation.y = -Math.PI / 2;                                                                            // (o desenho de lado vira para o norte, e o comprimento, para o oeste: de x = 44 a x = -16)
        caixa(60, 0.9, 0.25, concretoEscuro, 14, 12.45, 117.15); caixa(60, 0.9, 0.25, concretoEscuro, 14, 12.45, 119.85);   // as muretas da crista
        for (const x of [5, 9.5, 14, 18.5, 23]) caixa(0.9, 3.2, 3.4, concretoEscuro, x, 12.4, 118.5);              // os pilares das comportas
        caixa(19, 0.5, 3.6, concretoEscuro, 14, 14.2, 118.5);                                                       // a ponte das comportas
        for (const x of [7.25, 11.75, 16.25, 20.75]) caixa(3.5, 1.9, 0.2, liso(0x2f4a5c, 0.5), x, 12.9, 117.5);    // as comportas
        const cai = queda(), lamina = malha(g, new T.PlaneGeometry(17.6, 13.9), cai.material, 14, 6.02, 113.42);
        lamina.rotation.x = 0.528 + Math.PI;                                                                        // deitada na rampa, com o lado de cima para a crista
        cai.textura.repeat.set(5, 2);
        vila.aguas.caem.push({ textura: cai.textura, quanto: -0.55 });
        for (let i = 0; i < 9; i++) vila.aguas.espumas.push(malha(g, new T.SphereGeometry(0.9, 10, 8), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 }), 6.2 + i * 1.95, 0.25, 109.3));
      }
      caixa(16, 6, 6.4, concreto, 33, 3, 106.4);                                                                    // a casa de força, ao pé da barragem
      caixa(16.6, 0.4, 7, concretoEscuro, 33, 6.2, 106.4);
      for (let i = 0; i < 6; i++) caixa(1.6, 2.2, 0.1, liso(0x24384a, 0.2), 26.6 + i * 2.56, 3.6, 103.16);
      malha(g, new T.PlaneGeometry(9, 0.9), mat(0xffffff, { roughness: 0.7, map: texturaCanvas(720, 72, (c, l, a) => { c.fillStyle = '#b7b4ab'; c.fillRect(0, 0, l, a); letras(c, 'CASA DE FORÇA', l / 2, a / 2 + 3, 54, '#3a3f45', l - 30); }) }), 33, 5.35, 103.17).rotation.y = Math.PI;
      {
        // as torres de alta tensão, que levam a energia embora, e os fios entre elas
        const aco = liso(0x8b939a, 0.5), pontas = [];
        for (const tx of [48, 74, 100, 126]) {
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
            const perna = malha(g, new T.BoxGeometry(0.14, 14.2, 0.14), aco, tx + sx * 0.75, 7, 104 + sz * 0.75);
            perna.rotation.set(sz * 0.085, 0, -sx * 0.085);
          }
          for (const y of [3.5, 7, 10.5]) caixa(1.9 - y * 0.09, 0.08, 1.9 - y * 0.09, aco, tx, y, 104);
          for (const y of [11.2, 13.2]) { caixa(0.12, 0.12, 6.4, aco, tx, y, 104); pontas.push([tx, y - 0.25, 101], [tx, y - 0.25, 107]); }
        }
        const fios = [];
        for (let i = 0; i + 4 < pontas.length; i += 4) for (let k = 0; k < 4; k++) {                                // de cada ponta à mesma ponta da torre seguinte, com barriga
          const [x1, y1, z1] = pontas[i + k], [x2, , z2] = pontas[i + 4 + k];
          for (let s = 0; s < 8; s++) { const u = s / 8, v = (s + 1) / 8, cede = t => y1 - 1.6 * 4 * t * (1 - t); fios.push(x1 + (x2 - x1) * u, cede(u), z1 + (z2 - z1) * u, x1 + (x2 - x1) * v, cede(v), z1 + (z2 - z1) * v); }
        }
        const linhas = new T.BufferGeometry();
        linhas.setAttribute('position', new T.Float32BufferAttribute(fios, 3));
        g.add(new T.LineSegments(linhas, new T.LineBasicMaterial({ color: 0x2a2f33 })));
      }
      {
        // por trás da barragem: o lago, no alto de um platô, e os morros em que a barragem se apoia
        const morro = mat(0x6e9e58, { roughness: 1 });
        const plato = malha(g, new T.BoxGeometry(180, 11.3, 120), [morro, morro, agua, morro, morro, morro], 14, 5.65, 180);
        semSombra.push(plato);
        const uv = plato.geometry.attributes.uv;                                                                     // (a água do lago, do tamanho da dos outros lugares)
        for (let i = 8; i < 12; i++) uv.setXY(i, uv.getX(i) * 26, uv.getY(i) * 17);
        for (const [x, r] of [[-27, 17], [55, 17]]) { const m = malha(g, new T.SphereGeometry(1, 20, 12), morro, x, -1, 121); m.scale.set(r, 17, 21); semSombra.push(m); }
      }

      // a cachoeira: o passeio, o deque de madeira, o poço, o paredão de pedra com a queda e o riacho que sai dali
      lugar(14, 'cachoeira', 91, 113.7, -4, 16.5, { x: QUEDA.x, y: 3, z: QUEDA.z, forca: 0 });
      plano(108.4, 114.1, 0.4, 12.1, deck, 0.006);
      for (let z = 0.6; z <= 12; z += 0.42) plano(108.4, 114.1, z - 0.01, z + 0.01, liso(0x6f4f31, 0.9), 0.008);    // as frestas entre as tábuas
      caixa(0.05, 0.05, 11.7, ferro, 114.05, 0.78, 6.25); caixa(0.04, 0.04, 11.7, ferro, 114.05, 0.42, 6.25);      // a grade do deque
      for (let z = 0.4; z <= 12.2; z += 1.47) caixa(0.07, 0.8, 0.07, ferro, 114.05, 0.4, z);
      placa(['CACHOEIRA', 'cuidado: pedras molhadas'], 111.4, 13.4, Math.PI, 2.6, 0.9);
      bloco('placa', 110.1, 112.7, 13.2, 13.6);
      deitar(new T.CircleGeometry(7.2, 40).translate(121.7, -PZ, 0), agua, 0.04);                                   // o poço
      plano(119.6, 123.8, MEIO.z - 300, 1.2, agua, 0.035);                                                          // o riacho, que segue para o sul
      malha(g, new T.BoxGeometry(24, 13, 62), pedra, 141, 6.5, PZ);                                                 // o paredão
      plano(129.2, 152.8, 3.3, 9.2, agua, 13.03);                                                                   // o rio lá em cima, que chega à beirada
      {
        const sorte = aleatorio(505);
        for (let i = 0; i < 30; i++) {                                                                              // a face do paredão, irregular (menos onde a água cai)
          const z = -23 + sorte() * 58, x = 128.2 + sorte() * 1.6, y = 1 + sorte() * 11.5, r = 1.6 + sorte() * 2.2, achatar = 0.7 + sorte() * 0.5;
          if (z < -0.5 || z > 13) rocha(x, y, z, r, achatar, i % 3 ? pedra : pedraClara);
        }
        for (let i = 0; i < 16; i++) { const a = -2.2 + i * 0.29, r = 7.3 + sorte() * 0.9; rocha(121.7 + Math.cos(a) * r, 0.15, PZ + Math.sin(a) * r, 0.5 + sorte() * 0.6, 0.6, i % 2 ? pedra : pedraClara); }   // em volta do poço
        for (let i = 0; i < 7; i++) rocha(124.5 + sorte() * 2.4, 0.3, 2.6 + sorte() * 7.4, 0.7 + sorte() * 0.7, 0.55, pedraClara);                                            // ao pé da queda
        for (let i = 0; i < 14; i++) { const m = malha(g, new T.SphereGeometry(1, 10, 8), mat(0x4a8f44, { roughness: 1, flatShading: true }), 131 + sorte() * 18, 13.2, -22 + sorte() * 56); m.scale.set(1.6 + sorte() * 2, 0.9 + sorte(), 1.6 + sorte() * 2); verdes.push(m); }   // o mato lá em cima
        const cai = queda(), cai2 = queda();
        malha(g, new T.PlaneGeometry(5.6, 13), cai.material, 128.95, 6.55, PZ).rotation.y = -Math.PI / 2;
        malha(g, new T.PlaneGeometry(3.4, 12.6), cai2.material, 128.7, 6.35, PZ + 0.5).rotation.y = -Math.PI / 2;
        cai.textura.repeat.set(2, 2); cai2.textura.repeat.set(1.3, 1.6);
        vila.aguas.caem.push({ textura: cai.textura, quanto: 0.6 }, { textura: cai2.textura, quanto: 0.85 });
        for (let i = 0; i < 6; i++) vila.aguas.espumas.push(malha(g, new T.SphereGeometry(0.85, 10, 8), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 }), 128.1, 0.3, 3.9 + i * 0.95));
        // a névoa que sobe do pé da queda
        const texNevoa = texturaCanvas(128, 128, (c, l) => { const d = c.createRadialGradient(l / 2, l / 2, 4, l / 2, l / 2, l / 2); d.addColorStop(0, 'rgba(255,255,255,0.55)'); d.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = d; c.fillRect(0, 0, l, l); });
        for (let i = 0; i < 7; i++) {
          const n = new T.Sprite(new T.SpriteMaterial({ map: texNevoa, transparent: true, depthWrite: false, toneMapped: false }));
          n.position.set(127.2, 1, 3.6 + i * 0.9);
          g.add(n);
          vila.aguas.nevoas.push({ sprite: n, vez: i / 7, z: n.position.z });
        }
      }
      for (const [x, z, flor] of [[104, -8, ''], [112, -9, 'amarelo'], [96, 20.5, ''], [108, 21, ''], [116.5, 19, 'rosa'], [90, -8.5, ''], [-2, 80, ''], [30, 79, ''], [30.5, 90, 'amarelo'], [-1.5, 92, '']]) arvore(x, z, flor ? { flor } : {});
      for (const m of pedras.concat(verdes)) semSombra.push(m);
      vila.aguas.parada = texAgua;

      // o ponto do carro, em cada ponto de parada: um totem amarelo com um botão, que chama o carro (ver chamarCarro)
      const pontoDoCarro = (x, z, y, id, paraX, paraZ) => {
        const p = new T.Group(), aro = malha(p, new T.TorusGeometry(0.22, 0.03, 8, 28), M.destaque, 0, 0.04, 0), destino = DESTINOS.find(d => d.id === id);
        p.position.set(x, y, z); p.rotation.y = Math.atan2(paraX - x, paraZ - z);
        g.add(p);
        aro.rotation.x = Math.PI / 2; aro.visible = false;
        malha(p, new T.CylinderGeometry(0.04, 0.05, 1.15, 12), ferro, 0, 0.575, 0);
        malha(p, caixaSuave(0.46, 0.5, 0.1, 0.03), liso(0xf2c230, 0.5), 0, 1.38, 0);
        malha(p, new T.PlaneGeometry(0.4, 0.44), mat(0xffffff, { roughness: 0.6, map: texturaCanvas(200, 220, (c, l, a) => {
          c.fillStyle = '#f2c230'; c.fillRect(0, 0, l, a);
          c.fillStyle = '#1d1f22';                                                                                    // o desenho de um carro, de lado
          c.beginPath(); if (c.roundRect) c.roundRect(34, 62, 132, 40, 12); else c.rect(34, 62, 132, 40); c.fill();
          c.beginPath(); if (c.roundRect) c.roundRect(62, 32, 76, 40, 14); else c.rect(62, 32, 76, 40); c.fill();
          for (const cx of [66, 136]) { c.fillStyle = '#f2c230'; c.beginPath(); c.arc(cx, 102, 15, 0, 7); c.fill(); c.fillStyle = '#1d1f22'; c.beginPath(); c.arc(cx, 102, 10, 0, 7); c.fill(); }
          letras(c, 'CHAME', l / 2, 148, 40, '#1d1f22', l - 16); letras(c, 'O CARRO', l / 2, 190, 40, '#1d1f22', l - 16);
        }) }), 0, 1.38, 0.052);
        malha(p, new T.CylinderGeometry(0.045, 0.045, 0.03, 16), luminoso({ color: 0x35d07f }), 0, 1.06, 0.06).rotation.x = Math.PI / 2;   // o botão
        redondo('ponto do carro', x, z, 0.12);
        vila.pontos.push({ nome: 'ponto do carro', ehPonto: true, destino, x, z, sala: destino.sala, contorno: aro });
      };
      pontoDoCarro(12.71, 8.68, CG, 'praca', PX, PZ); pontoDoCarro(16.6, 92.0, 0, 'usina', 14, 88); pontoDoCarro(107.9, 8.9, 0, 'cachoeira', 104, PZ);
      {
        // a chave geral da vila, num armário ao pé da grade do mirante da hidrelétrica: a alavanca para cima e a luz verde, ligada
        const corpo = caixa(0.9, 1.4, 0.34, liso(0x55606b, 0.6), 8.5, 0.7, 96.32), sinal = luminoso({ color: 0x35d07f }), alavanca = new T.Group();
        malha(g, new T.PlaneGeometry(0.8, 0.34), mat(0xffffff, { roughness: 0.6, map: texturaCanvas(400, 170, (c, l, a) => { c.fillStyle = '#f2c230'; c.fillRect(0, 0, l, a); letras(c, 'CHAVE GERAL', l / 2, 58, 56, '#1d1f22', l - 20); letras(c, 'DA VILA', l / 2, 122, 50, '#1d1f22', l - 20); }) }), 8.5, 1.14, 96.146).rotation.y = Math.PI;
        malha(g, new T.SphereGeometry(0.07, 14, 10), sinal, 8.2, 0.72, 96.14);
        alavanca.position.set(8.62, 0.6, 96.13);
        g.add(alavanca);
        malha(alavanca, new T.BoxGeometry(0.07, 0.36, 0.07), liso(0xc8372d, 0.5), 0, 0.18, 0);
        malha(alavanca, new T.SphereGeometry(0.06, 12, 10), liso(0x1d1f22, 0.4), 0, 0.38, 0);
        bloco('chave geral', 8.05, 8.95, 96.1, 96.6);
        vila.chave = { nome: 'chave geral', x: 8.5, z: 96.15, sala: 13, ligada: true, malha: corpo, contorno: contorno(corpo, new T.BoxGeometry(0.98, 1.48, 0.42), 0, 1),
          mostrar() { alavanca.rotation.x = this.ligada ? 0 : -2.2; sinal.color.set(this.ligada ? 0x35d07f : 0xff3b2a); } };
      }
      {
        // no deque da cachoeira: a bica (um cano de bambu numa pedra, com o fio de água que cai numa cuba) e o caixote do garrafão
        const corpo = caixa(0.24, 0.95, 0.24, pedraClara, 113.72, 0.475, 9.4), cano = malha(g, new T.CylinderGeometry(0.035, 0.035, 0.5, 10), liso(0x8a7a3a, 0.8), 113.5, 0.86, 9.4);
        cano.rotation.z = Math.PI / 2 - 0.25;
        malha(g, new T.CylinderGeometry(0.014, 0.014, 0.5, 8), new T.MeshBasicMaterial({ color: 0xbfe6f7, transparent: true, opacity: 0.85 }), 113.27, 0.55, 9.4);
        malha(g, new T.CylinderGeometry(0.2, 0.16, 0.22, 16), pedra, 113.27, 0.11, 9.4);
        vila.bica = { nome: 'bica', x: 113.4, z: 9.4, sala: 14, malha: corpo, contorno: contorno(corpo, new T.BoxGeometry(0.34, 1.05, 0.34), 0, 1) };
        bloco('bica', 113.05, 113.9, 9.15, 9.65);
        caixa(0.6, 0.4, 0.6, deck, 109.3, 0.2, 1.3);
        bloco('caixote', 109.0, 109.6, 1.0, 1.6);
      }
      // Na cidade, a placa de cada estrada: um pórtico por cima da pista, logo depois da cancela (ver cancela).
      // (Ao lado da pista ela não se lia: a casa azul tapava a da cachoeira, e uma árvore do parquinho, parte da outra.)
      placa(['HIDRELÉTRICA', 'só de carro'], PX, FIM.n + 0.3, Math.PI, 2.4, 0.9, 3.5);
      placa(['CACHOEIRA', 'só de carro'], FIM.l + 0.3, PZ, -Math.PI / 2, 2.4, 0.9, 3.5);
    }

    // as copas, os troncos, as moitas e as flores, cada tipo numa malha só
    for (const [nome, tons] of Object.entries(copas)) tons.forEach((pecas, i) => { if (pecas.length) malha(g, juntar(pecas), mat(CORES_DAS_COPAS[nome][i], { roughness: 0.9, flatShading: true }), 0, 0, 0); });
    malha(g, juntar(troncos), tronco, 0, 0, 0);
    malha(g, juntar(moitas), mat(0x4a8f44, { roughness: 0.95, flatShading: true }), 0, 0, 0);
    for (const [cor, pecas] of Object.entries(petalas)) malha(g, juntar(pecas), liso(Number(cor), 0.7), 0, 0, 0);
    // por fora da nossa casa: a janela do quarto, a do banheiro e o batente da porta
    janela(2.0, 4, 'z', 1.0, 1.0, 2.0); janela(-1.3, 4, 'z', 0.6, 1.62, 2.08, null, false);
    caixa(1.3, 0.22, 0.24, liso(0x7a4a2a, 0.8), 2.0, 0.86, 4.2);                          // a floreira da janela do quarto
    for (let i = 0; i < 5; i++) malha(g, new T.SphereGeometry(0.09, 10, 8), liso([0xe4572e, 0xf2c230, 0xf06aa8][i % 3], 0.7), 1.5 + i * 0.25, 1.02, 4.2);
    for (const x of [5.25, 6.75]) caixa(0.1, ALTURA_PORTA + 0.1, 0.05, branco, x, (ALTURA_PORTA + 0.1) / 2, 4.1);
    caixa(1.6, 0.1, 0.05, branco, 6, ALTURA_PORTA + 0.05, 4.1);

    // --- quarto (1): a cama, o guarda-roupa, a janela e a pessoa na poltrona ---
    const azul = liso(0x3d6fa8, 0.9);
    malha(g, new T.PlaneGeometry(2.2, 1.6), M.tapete, 2.3, 0.012, 2.05).rotation.x = -Math.PI / 2;
    caixa(1.0, 0.28, 2.0, madeira, 0.58, 0.14, 1.08);                                     // cama: estrado, colchão, coberta, travesseiro e cabeceira
    malha(g, caixaSuave(0.94, 0.2, 1.9, 0.05), branco, 0.58, 0.38, 1.1);
    malha(g, caixaSuave(0.96, 0.08, 1.25, 0.03), azul, 0.58, 0.5, 1.42);
    malha(g, caixaSuave(0.6, 0.12, 0.36, 0.05), branco, 0.58, 0.54, 0.38);
    caixa(1.0, 0.9, 0.06, madeira, 0.58, 0.45, 0.1);
    bloco('cama', 0.06, 1.08, 0.06, 2.08);
    caixa(0.4, 0.45, 0.4, madeira, 1.36, 0.225, 0.28);                                    // criado-mudo com abajur
    malha(g, new T.CylinderGeometry(0.03, 0.05, 0.2, 12), M.latao, 1.36, 0.55, 0.28);
    malha(g, new T.CylinderGeometry(0.08, 0.13, 0.16, 20, 1, true), luminoso({ color: 0xffe6bd, side: T.DoubleSide }), 1.36, 0.72, 0.28);
    bloco('criado-mudo', 1.16, 1.56, 0.06, 0.48);
    caixa(1.2, 2.0, 0.52, madeira, 3.3, 1.0, 0.33);                                       // guarda-roupa
    for (const x of [3.0, 3.6]) { malha(g, caixaSuave(0.56, 1.9, 0.02, 0.008), madeiraClara, x, 1.0, 0.6); caixa(0.02, 0.2, 0.03, M.latao, x + (x < 3.3 ? 0.22 : -0.22), 1.0, 0.62); }
    bloco('guarda-roupa', 2.7, 3.9, 0.06, 0.6);
    janela(2.13, 0, 'z', 1.06, 1.02, 2.08);                                               // a janela dos fundos, com cortinas
    for (const x of [1.72, 2.54]) caixa(0.26, 1.25, 0.03, liso(0xe8d9c0, 1), x, 1.52, 0.11);
    const quadro = malha(g, new T.PlaneGeometry(0.7, 0.5), M.quadro, 3.93, 1.6, 3.3);
    quadro.rotation.y = -Math.PI / 2;
    // Quem mora na casa deste desafio: sentada numa poltrona, de costas para uma parede (em z =
    // `parede`) e de frente para onde o robô começa. Não diz nada até falarem com ela. O alvo fica
    // nos joelhos (ver criarSala). O que ela recebe fica no braço da poltrona: a primeira coisa
    // do lado da mão direita, a segunda do outro.
    // (casa: 1 = a amarela, 2 = a cor-de-rosa, 3 = a azul; as falas são as do desafio daquela casa; no coletivo moram as três)
    const morador = (corpo, x, z, sala, parede, casa) => {
      corpo.grupo.position.set(x, 0, z);
      g.add(corpo.grupo);
      vila.pessoa = pessoa = { nome: 'pessoa', ehPessoa: true, casa, falas: DESAFIOS[casa + 3].falas, pedidos: [], x, z: z - 0.45, rosto: { x, z: z + 0.04 }, sala, corpo, contorno: corpo.contorno, fala: '', recebeu: null, recebidos: [],
        receber(o) {
          corpo.grupo.add(o.malha);
          o.malha.position.set(this.recebidos.length ? -0.3 : 0.3, 0.64 + o.alt / 2, -0.29);
          this.recebidos.push(o);
          this.fala = this.falas.agradecimento;
        } };
      vila.pessoas.push(pessoa);
      bloco('poltrona', x - 0.42, x + 0.42, z - 0.65, parede);
    };
    if (DESAFIO === 4 || COLETIVO) morador(montarPessoa(), 2.0, 3.48, 1, 4, 1);     // (nos outros desafios a casa é outra: aqui não há ninguém)

    // --- banheiro (2): pia com espelho, vaso e box (só enfeite) ---
    const louca = liso(0xf7f7f4, 0.2), vidroDoBox = new T.MeshStandardMaterial({ color: 0xbfe3f0, transparent: true, opacity: 0.28, roughness: 0.05, depthWrite: false, side: T.DoubleSide });
    caixa(0.9, 0.8, 0.45, branco, -1.3, 0.4, 0.3);                                        // gabinete da pia
    malha(g, caixaSuave(0.94, 0.05, 0.5, 0.015), louca, -1.3, 0.83, 0.31);
    malha(g, new T.CylinderGeometry(0.17, 0.12, 0.05, 24), liso(0xdfe6e9, 0.15), -1.3, 0.845, 0.33);
    malha(g, new T.CylinderGeometry(0.014, 0.014, 0.2, 12), M.inox, -1.3, 0.95, 0.12);
    caixa(0.78, 0.9, 0.03, M.nogueira, -1.3, 1.55, 0.075);                                // o espelho da pia (com reflexo: ver espelhar)
    espelhar(malha(g, new T.PlaneGeometry(0.7, 0.82), M.inox, -1.3, 1.55, 0.092));
    bloco('pia', -1.77, -0.83, 0.06, 0.55);
    malha(g, caixaSuave(0.38, 0.4, 0.5, 0.06), louca, -2.3, 0.2, 1.75);                   // vaso
    malha(g, caixaSuave(0.18, 0.42, 0.42, 0.04), louca, -2.44, 0.6, 1.75);
    malha(g, caixaSuave(0.4, 0.04, 0.46, 0.015), branco, -2.28, 0.42, 1.75);
    bloco('vaso', -2.54, -1.95, 1.45, 2.05);
    caixa(1.0, 0.06, 1.0, louca, -2.04, 0.03, 3.44);                                      // box do chuveiro
    malha(g, new T.PlaneGeometry(1.0, 2.0), vidroDoBox, -2.04, 1.06, 2.94);
    malha(g, new T.PlaneGeometry(1.0, 2.0), vidroDoBox, -1.54, 1.06, 3.44).rotation.y = Math.PI / 2;
    malha(g, new T.CylinderGeometry(0.012, 0.012, 0.5, 8), M.inox, -2.04, 2.1, 3.7).rotation.x = Math.PI / 2;
    malha(g, new T.CylinderGeometry(0.09, 0.09, 0.02, 16), M.inox, -2.04, 2.08, 3.46);
    bloco('box', -2.54, -1.5, 2.9, 3.94);
    malha(g, new T.PlaneGeometry(0.7, 0.45), liso(0x6fa8c7, 1), -0.95, 0.012, 2.2).rotation.x = -Math.PI / 2;   // tapetinho
    caixa(0.03, 0.5, 0.4, liso(0xf2c230, 1), -0.08, 1.25, 1.2);                           // toalha pendurada

    // --- cozinha (3): bancada com pia, tigela e fogão; geladeira; armário; mesinha ---
    const zf = 0.06, X1 = 4.06, X2 = 6.66, comp = X2 - X1, xm = (X1 + X2) / 2, XF = 6.25;   // zf: a face de dentro da parede; XF: o meio do fogão
    caixa(comp, 0.1, 0.44, preto, xm, 0.05, zf + 0.24);
    caixa(comp, 0.78, 0.54, armario, xm, 0.49, zf + 0.27);
    malha(g, caixaSuave(comp + 0.04, 0.04, 0.58, 0.012), tampo, xm, 0.9, zf + 0.29);
    texAzulejo.repeat.set(comp / 0.3, 2);
    caixa(comp, 0.6, 0.02, M.azulejo, xm, 1.22, zf + 0.012);
    caixa(comp, 0.7, 0.35, armario, xm, 1.9, zf + 0.175);
    for (let i = 0; i < 4; i++) {                                                         // portinhas de cima
      const x = X1 + comp / 4 * (i + 0.5);
      malha(g, caixaSuave(comp / 4 - 0.03, 0.64, 0.02, 0.008), portinha, x, 1.9, zf + 0.355);
      caixa(0.014, 0.12, 0.02, M.latao, x + comp / 8 - 0.07, 1.67, zf + 0.375);
    }
    const baixo = XF - 0.31 - X1;                                                         // portinhas de baixo, até o fogão
    for (let i = 0; i < 3; i++) {
      const x = X1 + baixo / 3 * (i + 0.5);
      malha(g, caixaSuave(baixo / 3 - 0.03, 0.72, 0.02, 0.008), portinha, x, 0.49, zf + 0.55);
      caixa(0.12, 0.014, 0.02, M.latao, x, 0.79, zf + 0.57);
    }
    caixa(0.6, 0.012, 0.4, M.inox, 4.72, 0.921, zf + 0.3); caixa(0.48, 0.012, 0.28, M.inoxEscuro, 4.72, 0.924, zf + 0.32);   // pia
    malha(g, new T.CylinderGeometry(0.014, 0.014, 0.26, 12), M.inox, 4.72, 1.05, zf + 0.1);
    malha(g, new T.CylinderGeometry(0.012, 0.012, 0.16, 12), M.inox, 4.72, 1.17, zf + 0.17).rotation.x = Math.PI / 2;
    caixa(0.62, 0.012, 0.46, preto, XF, 0.926, zf + 0.29);                                // fogão: a chapa e as quatro bocas
    for (const dx of [-0.15, 0.15]) for (const dz of [-0.1, 0.1]) malha(g, new T.CylinderGeometry(0.075, 0.075, 0.006, 24), liso(0x4a4e53, 0.6), XF + dx, 0.934, zf + 0.29 + dz);
    caixa(0.6, 0.76, 0.03, preto, XF, 0.49, zf + 0.55);                                   // forno: a porta, o vidro, a luz de dentro e o puxador
    caixa(0.44, 0.34, 0.012, liso(0x2a2f34, 0.08), XF, 0.45, zf + 0.568);
    const aceso = caixa(0.42, 0.32, 0.006, luminoso({ color: 0xffa23a }), XF, 0.45, zf + 0.576);
    aceso.visible = false;
    caixa(0.5, 0.026, 0.03, M.inox, XF, 0.77, zf + 0.59);
    {
      const borda = new T.Group(), b = 0.035, z = zf + 0.6;
      g.add(borda);
      for (const lado of [-1, 1]) caixa(b, 0.82, 0.02, M.destaque, XF + lado * (0.31 - b / 2), 0.49, z, borda);
      for (const y of [0.1, 0.88]) caixa(0.62, b, 0.02, M.destaque, XF, y, z, borda);
      borda.visible = false;
      // O painel em cima do fogão, na parede: o relógio e há quanto tempo a massa está no forno
      // (ver tiqueDoForno). dentro: o que está assando; desde: a hora em que entrou.
      const painel = texturaCanvas(512, 256, () => { });
      caixa(0.5, 0.27, 0.03, preto, XF, 1.18, zf + 0.027);
      malha(g, new T.PlaneGeometry(0.46, 0.23), luminoso({ map: painel }), XF, 1.18, zf + 0.044);
      vila.forno = { nome: 'forno', x: XF, z: zf + 0.58, sala: 3, contorno: borda, aceso, painel, dentro: null, desde: 0, mostrando: '' };
    }
    bloco('bancada', 4.0, X2, 0, zf + 0.58);
    // a tigela, na bancada: o perfil dela, girado em volta do eixo (centrado na altura)
    const perfil = new T.LatheGeometry([[0, 0], [0.09, 0], [0.13, 0.05], [0.15, 0.11], [0.138, 0.11], [0.118, 0.052], [0.085, 0.014], [0, 0.014]].map(([r, y]) => new T.Vector2(r, y - 0.055)), 32);
    const ceramica = mat(0xf3ead6, { roughness: 0.25, side: T.DoubleSide }), cascaDaTigela = new T.CylinderGeometry(0.175, 0.115, 0.15, 24);
    const TX = 5.45, TZ = zf + 0.3, TY = 0.92;
    const tigela = malha(g, perfil, ceramica, TX, TY + 0.055, TZ);
    vila.tigela = { nome: 'tigela', x: TX, z: TZ, y: TY, alt: 0.11, sala: 3, itens: [], pronta: false, malha: tigela, contorno: contorno(tigela, cascaDaTigela, 0, 1) };
    // geladeira, com a receita colada na porta da esquerda de quem olha
    const gel = montarMovel();
    gel.grupo.position.set(7.3, 0, zf + gel.prof / 2);
    g.add(gel.grupo);
    rechearGeladeira(gel, true);
    const receita = texturaCanvas(512, 720, (c, l, a) => {
      c.fillStyle = '#fffbe8'; c.fillRect(0, 0, l, a);
      c.strokeStyle = '#d8cfae'; c.lineWidth = 6; c.strokeRect(8, 8, l - 16, a - 16);
      c.fillStyle = '#e4572e'; c.beginPath(); c.arc(l / 2, 30, 16, 0, 7); c.fill();        // o ímã
      letras(c, 'BOLO', l / 2, 104, 108, '#3a2a1c', l - 60);
      c.fillStyle = '#3a2a1c'; c.fillRect(70, 162, l - 140, 6);
      // os três ingredientes: um desenho e o nome
      c.fillStyle = '#f1e3c4'; c.fillRect(46, 190, 78, 92); c.fillStyle = '#3d6fa8'; c.fillRect(46, 220, 78, 24);   // o saco de farinha
      letras(c, 'FARINHA', 310, 238, 60, '#3a2a1c', 340);
      c.fillStyle = '#ffffff'; c.strokeStyle = '#3a2a1c'; c.lineWidth = 4;
      for (const x of [62, 108]) { c.beginPath(); c.ellipse(x, 344, 21, 28, 0, 0, 7); c.fill(); c.stroke(); }                 // dois ovos
      letras(c, 'OVOS', 310, 346, 60, '#3a2a1c', 340);
      c.fillStyle = '#5a3219'; c.fillRect(42, 418, 88, 60); c.strokeStyle = '#3b1f0e'; c.lineWidth = 3;                       // a barra de chocolate
      for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(42 + i * 22, 418); c.lineTo(42 + i * 22, 478); c.stroke(); }
      c.beginPath(); c.moveTo(42, 448); c.lineTo(130, 448); c.stroke();
      letras(c, 'CHOCOLATE', 310, 450, 60, '#3a2a1c', 340);
      // o caminho: tigela, forno, bolo
      c.strokeStyle = '#3a2a1c'; c.lineWidth = 5; c.fillStyle = '#f3ead6';
      c.beginPath(); c.moveTo(48, 532); c.quadraticCurveTo(96, 606, 144, 532); c.closePath(); c.fill(); c.stroke();           // tigela
      c.fillStyle = '#2a2f34'; c.fillRect(214, 514, 80, 80); c.fillStyle = '#ffa23a'; c.fillRect(228, 542, 52, 38);           // forno
      c.fillStyle = '#7a4a2a'; c.fillRect(372, 542, 92, 44); c.fillStyle = '#f7d9e3'; c.fillRect(372, 530, 92, 16);           // bolo
      c.fillStyle = '#c8372d'; c.beginPath(); c.arc(418, 522, 9, 0, 7); c.fill();
      c.fillStyle = '#3a2a1c';
      for (const x of [166, 322]) { c.fillRect(x, 552, 22, 6); c.beginPath(); c.moveTo(x + 22, 542); c.lineTo(x + 36, 555); c.lineTo(x + 22, 568); c.fill(); }   // as setas
      // o tempo de forno (em minutos; em segundos, se alguém mudou para um tempo quebrado: ver ASSAR)
      const emMinutos = ASSAR.pronto % 60000 === 0 && ASSAR.queima % 60000 === 0, por = emMinutos ? 60000 : 1000;
      letras(c, `FORNO: ${ASSAR.pronto / por} A ${ASSAR.queima / por} ${emMinutos ? 'MIN' : 'S'}`, l / 2, 652, 54, '#b3261e', l - 50);
    });
    malha(gel.folhas[0], new T.PlaneGeometry(0.28, 0.394), mat(0xffffff, { map: receita, roughness: 0.9 }), 0.19, gel.base + 0.42, 0.027);      // à altura dos olhos do robô
    const geladeira = { nome: 'geladeira', x: 7.3, z: zf + gel.prof, sala: 3, aberta: false, vis: 0, folhas: gel.folhas, contorno: gel.borda, dentro: [], olha: 1, larg: gel.larg, base: gel.base, alt: gel.alt };
    abrem.push(geladeira);
    bloco('geladeira', 7.3 - 0.54, 7.3 + 0.54, 0, zf + gel.prof + 0.3);
    // armário de despensa, encostado na parede da rua (a frente olha para -z)
    const arm = montarMovel({ corpo: madeiraClara, porta: madeira, forro: mat(0x6f5236, { side: T.BackSide, roughness: 0.8 }) });
    arm.grupo.position.set(7.3, 0, 4 - 0.06 - arm.prof / 2);
    arm.grupo.rotation.y = Math.PI;
    g.add(arm.grupo);
    for (const [x, y, cor] of [[0.2, arm.Y2, 0xc8372d], [0.05, arm.Y2, 0xf2c230], [-0.2, arm.Y2, 0x35a853], [0.22, arm.base + 0.02, 0x2f7de1], [-0.15, arm.base + 0.02, 0xf2801f]])   // potes, de enfeite
      malha(arm.grupo, new T.CylinderGeometry(0.05, 0.05, 0.16, 16), liso(cor, 0.4), x, y + 0.09, 0.02);
    const despensa = { nome: 'armário', x: 7.3, z: 4 - 0.06 - arm.prof, sala: 3, aberta: false, vis: 0, folhas: arm.folhas, contorno: arm.borda, dentro: [], olha: -1, larg: arm.larg, base: arm.base, alt: arm.alt };
    abrem.push(despensa);
    bloco('armário', 7.3 - 0.54, 7.3 + 0.54, 4 - 0.06 - arm.prof - 0.3, 4);
    malha(g, new T.CylinderGeometry(0.42, 0.42, 0.04, 32), madeira, 4.62, 0.74, 3.42);     // mesinha redonda com dois banquinhos
    malha(g, new T.CylinderGeometry(0.04, 0.04, 0.72, 12), preto, 4.62, 0.36, 3.42);
    malha(g, new T.CylinderGeometry(0.2, 0.2, 0.02, 24), preto, 4.62, 0.01, 3.42);
    for (const dx of [-0.34, 0.3]) { malha(g, new T.CylinderGeometry(0.15, 0.15, 0.04, 20), madeira, 4.62 + dx, 0.46, 3.0 + Math.abs(dx) * 0.3); malha(g, new T.CylinderGeometry(0.03, 0.03, 0.44, 10), preto, 4.62 + dx, 0.22, 3.0 + Math.abs(dx) * 0.3); }
    bloco('mesa', 4.1, 5.1, 2.9, 3.94);
    // a porta da rua: de correr, como as dos outros desafios; é o jogador que abre, e ela fica aberta (no desafio 5, que é o da outra casa, fica trancada)
    portaDaRua(6, 4, 'z', [3, 4], M.porta, !COLETIVO && DESAFIO !== 4);
    vao(0, 3, 'x', 1, 2); vao(4, 2, 'x', 1, 3); vao(6, 8.5, 'z', 4, 5);                    // os vãos sem porta: para o banheiro, para a cozinha e o do mercadinho

    // --- mercadinho (5): estantes com mercadorias, balcão e caixotes ---
    const rnd = aleatorio(4242), CORES_DAS_CAIXAS = [0xd8433b, 0x2f7de1, 0xf2c230, 0x35a853, 0x9b51e0, 0xf2801f, 0xf06aa8, 0xf4f4f4, 0x24a3a3];
    // Uma estante encostada numa parede, com quatro tábuas. `ao`: (t, f, y) → o ponto a t metros
    // ao longo dela, f metros à frente da parede e y de altura. `vago`: onde não pôr mercadoria.
    // (`cores` e `sorte`: as cores das mercadorias e de onde vem o acaso, quando não são as do mercadinho)
    const estante = (comprimento, ao, giro, vago, cores = CORES_DAS_CAIXAS, sorte = rnd) => {
      for (let i = 0; i < 4; i++) {
        const y = 0.3 + i * 0.45, tabua = malha(g, new T.BoxGeometry(comprimento, 0.03, 0.4), branco, ...ao(comprimento / 2, 0.22, y - 0.015));
        tabua.rotation.y = giro;
        for (let t = 0.14; t < comprimento - 0.1; t += 0.2 + sorte() * 0.06) {
          if (vago && i === vago[0] && Math.abs(t - vago[1]) < 0.52) continue;
          const alt = 0.12 + sorte() * 0.16, lata = sorte() < 0.35, cor = liso(cores[Math.floor(sorte() * cores.length)], 0.5);
          const m = malha(g, lata ? new T.CylinderGeometry(0.055, 0.055, alt, 14) : new T.BoxGeometry(0.13, alt, 0.1), cor, ...ao(t, 0.2 + sorte() * 0.08, y + alt / 2));
          m.rotation.y = giro;
        }
      }
      const fundo = malha(g, new T.BoxGeometry(comprimento, 1.9, 0.03), liso(0xd9d4c8, 0.7), ...ao(comprimento / 2, 0.03, 0.95));
      fundo.rotation.y = giro;
    };
    estante(3.6, (t, f, y) => [4.2 + t, y, 12.44 - f], 0, [1, 1.8]);                       // na parede do fundo, com o lugar do chocolate vago
    bloco('estante', 4.2, 7.8, 12.0, 12.5);
    estante(2.4, (t, f, y) => [3.56 + f, y, 9.4 + t], Math.PI / 2);                        // na parede da esquerda de quem entra
    bloco('estante', 3.5, 4.0, 9.4, 11.8);
    caixa(0.8, 0.9, 1.5, madeira, 8.04, 0.45, 9.95); malha(g, caixaSuave(0.86, 0.04, 1.56, 0.012), tampo, 8.04, 0.92, 9.95);   // o balcão, com a caixa registradora
    malha(g, caixaSuave(0.34, 0.22, 0.3, 0.03), liso(0x3a4046, 0.4), 8.02, 1.05, 10.2); caixa(0.02, 0.16, 0.22, luminoso({ color: 0x9fe8b0 }), 7.84, 1.1, 10.2);
    bloco('balcão', 7.6, 8.5, 9.2, 10.7);
    for (const [x, cor] of [[4.32, 0xf08a1c], [4.84, 0xc8372d]]) {                         // dois caixotes de frutas, perto da entrada
      caixa(0.48, 0.32, 0.46, madeiraClara, x, 0.16, 8.9);
      for (let i = 0; i < 9; i++) malha(g, new T.SphereGeometry(0.06, 12, 10), liso(cor, 0.6), x - 0.14 + (i % 3) * 0.14, 0.36, 8.76 + Math.floor(i / 3) * 0.14);
    }
    bloco('caixotes', 4.08, 5.08, 8.56, 9.14);

    // --- o flat da casa cor-de-rosa (6, 7 e 8), na rua do sul ---
    // Um flat de luxo: mármore, veludo, dourados. A sala com cozinha (6), por onde se entra, o
    // quarto (7) e o banheiro (8), em fila. É a casa do desafio 5, onde mora uma mulher; nos
    // outros desafios a porta da rua dele fica trancada (como a da nossa casa fica no 5).
    //
    //    z      +------------+------------+--------+
    //   -1      |    sofá    | ela  janela|  pia   |
    //           =   6 sala      7 quarto  .   8    |       = a porta da rua (em z = -2,5)
    //   -5      |  cozinha   |       cama | banh.  |
    //           +------------+------------+--------+
    //         16,25        20,25        24,25    26,65   x
    const FX = 16.25, FE = 26.65, FZ1 = -5, FZ2 = -1, FS = FZ1 + 0.06, FN = FZ2 - 0.06;   // as paredes do flat (a da rua, a do leste, a do sul e a do norte) e as faces de dentro das duas últimas
    const dourado = mat(0xd4af61, { metalness: 1, roughness: 0.28 }), veludoVerde = liso(0x1f5f4f, 0.95), veludoAzul = liso(0x27365a, 0.95), rosado = liso(0xe6bfc6, 0.9), laca = liso(0xf7f4ee, 0.25);
    const marinho = liso(0x1f2a44, 0.4), marinhoClaro = liso(0x2a3858, 0.4), marmoreLiso = liso(0xf3f1ec, 0.12), mostarda = liso(0xd9a441, 0.9), folhaEscura = mat(0x2f6b3a, { roughness: 0.8, flatShading: true });
    const texMarmore = repetida(texturaCanvas(512, 512, (c, l) => {            // placas de mármore branco de 60 cm; cobre 1,2 m x 1,2 m
      const sorte = aleatorio(91), m = l / 2;
      c.fillStyle = '#f3f1ec'; c.fillRect(0, 0, l, l);
      for (let i = 0; i < 26; i++) {             // os veios: riscos tortos, cinzentos, uns mais fortes que os outros
        let x = sorte() * l, y = sorte() * l;
        const rumo = sorte() * 6.28;
        c.strokeStyle = `rgba(${sorte() < 0.25 ? '168,150,110' : '120,124,130'},${(0.1 + sorte() * 0.3).toFixed(2)})`; c.lineWidth = 0.6 + sorte() * 2.4;
        c.beginPath(); c.moveTo(x, y);
        for (let k = 0; k < 9; k++) { const a = rumo + (sorte() - 0.5) * 1.4; x += Math.cos(a) * 40; y += Math.sin(a) * 40; c.lineTo(x, y); }
        c.stroke();
      }
      salpicar(c, l, 2500, sorte, '255,255,255', '90,90,96', 6, 0.04);
      c.fillStyle = '#c9c2b4';
      c.fillRect(m - 1, 0, 2, l); c.fillRect(0, m - 1, l, 2); c.fillRect(0, 0, 1, l); c.fillRect(l - 1, 0, 1, l); c.fillRect(0, 0, l, 1); c.fillRect(0, l - 1, l, 1);
    }));
    texMarmore.repeat.set(4 / 1.2, 4 / 1.2);
    const marmore = mat(0xffffff, { map: texMarmore, roughness: 0.12, envMapIntensity: 0.9, vertexColors: true }), marmoreVerde = mat(0x9fb5aa, { map: texMarmore, roughness: 0.12, envMapIntensity: 0.9, vertexColors: true });
    const madeiraEscura = mat(0xa07c62, { map: texPiso, bumpMap: texRelevoPiso, bumpScale: 1, roughness: 0.35, envMapIntensity: 0.7, vertexColors: true });
    // A parede do flat: 1 m de largura (repete a cada metro) pela altura da sala. Rodapé alto e
    // sanca, brancos; um filete dourado; e molduras (um quadro alto por metro e um baixo embaixo dele).
    const texParedeChique = texturaCanvas(512, 1536, (c, l, a) => {
      const Y = h => a * (1 - h / A), sorte = aleatorio(92);
      c.fillStyle = '#ece5d8'; c.fillRect(0, 0, l, a);
      salpicar(c, Math.max(l, a), 5000, sorte, '255,255,255', '0,0,0', 5, 0.02);
      c.fillStyle = '#f8f6f1'; c.fillRect(0, 0, l, Y(A - 0.14));
      c.fillStyle = '#c9a65a'; c.fillRect(0, Y(A - 0.14), l, 5);
      c.fillStyle = 'rgba(0,0,0,0.08)'; c.fillRect(0, Y(A - 0.14) + 5, l, 8);
      c.fillStyle = '#f8f6f1'; c.fillRect(0, Y(0.16), l, a - Y(0.16));
      c.fillStyle = 'rgba(0,0,0,0.14)'; c.fillRect(0, Y(0.16) - 3, l, 3);
      const moldura = (h0, h1) => {
        for (const [d, cor] of [[0, 'rgba(0,0,0,0.16)'], [7, 'rgba(255,255,255,0.9)']]) { c.lineWidth = 4; c.strokeStyle = cor; c.strokeRect(46 + d, Y(h1) + d, l - 92 - 2 * d, Y(h0) - Y(h1) - 2 * d); }
      };
      moldura(1.02, 2.28); moldura(0.3, 0.86);
    });
    texParedeChique.wrapS = T.RepeatWrapping;
    const chique = { parede: mat(0xffffff, { map: texParedeChique, roughness: 0.9, vertexColors: true }), lisa: liso(0xece5d8, 0.9) };
    const quadroChique = mat(0xffffff, { roughness: 0.7, map: texturaCanvas(520, 320, (c, l, a) => {
      c.fillStyle = '#f4efe6'; c.fillRect(0, 0, l, a);
      c.fillStyle = '#1f2a44'; c.beginPath(); c.moveTo(0, a); c.bezierCurveTo(l * 0.25, a * 0.2, l * 0.5, a * 0.9, l, a * 0.35); c.lineTo(l, a); c.fill();
      c.fillStyle = '#e6bfc6'; c.beginPath(); c.arc(l * 0.3, a * 0.38, 62, 0, 7); c.fill();
      c.strokeStyle = '#c9a65a'; c.lineWidth = 7; c.beginPath(); c.moveTo(0, a * 0.72); c.bezierCurveTo(l * 0.3, a * 0.35, l * 0.6, a, l, a * 0.5); c.stroke();
      c.fillStyle = '#c9a65a'; c.beginPath(); c.arc(l * 0.74, a * 0.3, 26, 0, 7); c.fill();
    }) });
    const tapeteChique = mat(0xffffff, { roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, map: texturaCanvas(600, 380, (c, l, a) => {
      c.fillStyle = '#efe8da'; c.fillRect(0, 0, l, a);
      salpicar(c, l, 5000, aleatorio(93), '255,255,255', '120,100,70', 3, 0.05);
      for (const [m, larg, cor] of [[16, 10, '#c9a65a'], [38, 3, '#1f2a44'], [50, 3, '#c9a65a']]) { c.strokeStyle = cor; c.lineWidth = larg; c.strokeRect(m, m, l - 2 * m, a - 2 * m); }
    }) });
    // uma planta de vaso: o tronco fino e um punhado de folhas largas
    const vasoDePlanta = (x, z, alt, vaso) => {
      malha(g, new T.CylinderGeometry(0.17, 0.12, 0.3, 20), vaso, x, 0.15, z);
      malha(g, new T.CylinderGeometry(0.018, 0.022, alt - 0.3, 8), tronco, x, 0.3 + (alt - 0.3) / 2, z);
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4, r = 0.1 + (i % 3) * 0.07, folha = malha(g, new T.IcosahedronGeometry(0.16, 1), folhaEscura, x + Math.cos(a) * r, alt - 0.35 + i * 0.07, z + Math.sin(a) * r);
        folha.scale.set(1, 0.45, 0.7); folha.rotation.set(0.5, a, 0.4);
      }
    };
    const rebocoRosa = rebocado(0xf2b8c6), barradoRosa = liso(0xfaf3f0, 0.9);
    parede(FX, FZ1, FX, FZ2, [[-4.2, 0.94, 0.93, 2.07], -2.5], -1, rebocoRosa, barradoRosa, chique);   // (com a janela da sala)
    parede(FX, FZ2, FE, FZ2, [[23.1, 1.06, 0.87, 2.13]], 1, rebocoRosa, barradoRosa, chique);          // (com a janela do quarto)
    parede(FX, FZ1, FE, FZ1, [], -1, rebocoRosa, barradoRosa, chique);
    parede(FE, FZ1, FE, FZ2, [], 1, rebocoRosa, barradoRosa, chique);
    parede(20.25, FZ1, 20.25, FZ2, [-3], 0, null, null, chique);
    parede(24.25, FZ1, 24.25, FZ2, [-2], 0, null, null, chique);
    piso(FX, 20.25, FZ1, FZ2, marmore); piso(20.25, 24.25, FZ1, FZ2, madeiraEscura); piso(24.25, FE, FZ1, FZ2, marmoreVerde, 2.4 / 4, 1);
    teto(FX, 20.25, FZ1, FZ2); teto(20.25, 24.25, FZ1, FZ2); teto(24.25, FE, FZ1, FZ2);
    cobrir(FX, FE, FZ1, FZ2, A, 1.25, 0x5f5a66);
    portaDaRua(FX, -2.5, 'x', [6, 4], liso(0x1f4e5a, 0.45), !COLETIVO && DESAFIO !== 5);              // a porta da rua (trancada nos desafios que não são o desta casa)
    vao(20.25, -3, 'x', 6, 7); vao(24.25, -2, 'x', 7, 8);
    {
      // por fora, na rua: o batente da porta, a marquise, as arandelas, uma janela, os vasos de buxinho e o capacho
      const xf = FX - 0.1;
      for (const z of [-3.25, -1.75]) caixa(0.05, ALTURA_PORTA + 0.1, 0.1, branco, xf, (ALTURA_PORTA + 0.1) / 2, z);
      caixa(0.05, 0.1, 1.6, branco, xf, ALTURA_PORTA + 0.05, -2.5);
      caixa(0.6, 0.06, 1.9, liso(0x2b2f3a, 0.5), FX - 0.36, 2.36, -2.5);
      for (const z of [-3.5, -1.5]) {
        caixa(0.06, 0.2, 0.08, dourado, xf, 1.76, z); malha(g, new T.SphereGeometry(0.07, 12, 10), globoDaRua, xf - 0.07, 1.9, z);
        malha(g, new T.CylinderGeometry(0.14, 0.11, 0.3, 16), liso(0x2b2f3a, 0.5), FX - 0.26, CIDADE.alto + 0.15, z);
        malha(g, new T.CylinderGeometry(0.015, 0.015, 0.3, 6), tronco, FX - 0.26, CIDADE.alto + 0.45, z);
        malha(g, new T.IcosahedronGeometry(0.19, 1), folhaEscura, FX - 0.26, CIDADE.alto + 0.72, z);
      }
      janela(FX, -4.2, 'x', 0.94, 0.93, 2.07);
      caixa(0.22, 0.2, 1.0, liso(0x2b2f3a, 0.6), xf - 0.1, 0.84, -4.2);
      for (let i = 0; i < 5; i++) malha(g, new T.SphereGeometry(0.085, 10, 8), liso([0xf06aa8, 0xffffff, 0xf29bbd][i % 3], 0.7), xf - 0.1, 1.0, -4.6 + i * 0.2);
      caixa(0.5, 0.012, 0.9, liso(0x2b2f3a, 1), FX - 0.35, CIDADE.alto + 0.006, -2.5);
    }
    {
      // a sala com cozinha (6): a bancada e a geladeira na parede do sul; o sofá na do norte
      const B1 = 16.4, B2 = 19.1, bm = (B1 + B2) / 2, bc = B2 - B1;
      caixa(bc, 0.1, 0.5, preto, bm, 0.05, FS + 0.27);
      caixa(bc, 0.78, 0.6, marinho, bm, 0.49, FS + 0.3);
      malha(g, caixaSuave(bc + 0.04, 0.05, 0.66, 0.012), marmoreLiso, bm, 0.905, FS + 0.32);                  // o tampo e o frontão, de mármore
      caixa(bc, 0.62, 0.02, marmoreLiso, bm, 1.24, FS + 0.012);
      caixa(bc, 0.7, 0.35, marinho, bm, 1.92, FS + 0.175);                                                   // os armários de cima
      for (let i = 0; i < 4; i++) {
        const x = B1 + bc / 4 * (i + 0.5);
        malha(g, caixaSuave(bc / 4 - 0.03, 0.72, 0.02, 0.008), marinhoClaro, x, 0.49, FS + 0.605); caixa(0.16, 0.014, 0.02, dourado, x, 0.8, FS + 0.625);
        malha(g, caixaSuave(bc / 4 - 0.03, 0.64, 0.02, 0.008), marinhoClaro, x, 1.92, FS + 0.355); caixa(0.16, 0.014, 0.02, dourado, x, 1.66, FS + 0.375);
      }
      caixa(0.56, 0.012, 0.38, M.inox, 16.75, 0.932, FS + 0.32); caixa(0.44, 0.012, 0.26, M.inoxEscuro, 16.75, 0.935, FS + 0.34);   // a pia, com a torneira dourada
      malha(g, new T.CylinderGeometry(0.014, 0.014, 0.3, 12), dourado, 16.75, 1.08, FS + 0.1);
      malha(g, new T.CylinderGeometry(0.012, 0.012, 0.18, 12), dourado, 16.75, 1.22, FS + 0.18).rotation.x = Math.PI / 2;
      caixa(0.6, 0.01, 0.44, liso(0x15171a, 0.1), 17.55, 0.936, FS + 0.3);                                   // o fogão, de vidro preto
      for (const dx of [-0.14, 0.14]) for (const dz of [-0.1, 0.1]) malha(g, new T.RingGeometry(0.05, 0.065, 24), luminoso({ color: 0x8a2a20 }), 17.55 + dx, 0.943, FS + 0.3 + dz).rotation.x = -Math.PI / 2;
      const cupula = mat(0xd4af61, { metalness: 1, roughness: 0.28, side: T.DoubleSide }), lampadinha = luminoso({ color: 0xfff0cf });
      for (const x of [17.0, 17.75, 18.5]) {                                                                 // três pendentes sobre a bancada
        semSombra.push(caixa(0.006, 0.52, 0.006, preto, x, 2.33, FS + 0.9));
        semSombra.push(malha(g, new T.ConeGeometry(0.1, 0.14, 20, 1, true), cupula, x, 2.0, FS + 0.9));
        malha(g, new T.SphereGeometry(0.04, 12, 10), lampadinha, x, 1.96, FS + 0.9);
      }
      bloco('bancada', FX, B2, FZ1, FS + 0.64);
      {
        // O filtro de água, na bancada (o copo fica ao lado dele: ver "os objetos"). Com o copo vazio
        // na mão, o ESPACO enche o copo (desafio 5: ela precisa de água para tomar o remédio).
        const corpo = malha(g, caixaSuave(0.2, 0.34, 0.2, 0.03), laca, 18.25, 0.93 + 0.17, FS + 0.2);
        caixa(0.15, 0.13, 0.012, mat(0x7fc4ea, { roughness: 0.1 }), 18.25, 1.18, FS + 0.303);                    // o visor da água
        malha(g, new T.CylinderGeometry(0.012, 0.012, 0.07, 8), M.inox, 18.25, 1.02, FS + 0.32);                 // a bica
        vila.filtro = { nome: 'filtro', x: 18.25, z: FS + 0.3, alt: 0.34, sala: 6, malha: corpo, contorno: contorno(corpo, new T.BoxGeometry(0.27, 0.4, 0.27), 0, 1) };
      }
      for (const x of [16.9, 17.6]) {                                                                        // duas banquetas de veludo
        malha(g, new T.CylinderGeometry(0.17, 0.17, 0.07, 24), veludoVerde, x, 0.7, FS + 0.95);
        malha(g, new T.CylinderGeometry(0.02, 0.02, 0.66, 10), dourado, x, 0.33, FS + 0.95);
        malha(g, new T.CylinderGeometry(0.15, 0.15, 0.015, 24), dourado, x, 0.008, FS + 0.95);
        malha(g, new T.TorusGeometry(0.11, 0.008, 6, 24), dourado, x, 0.28, FS + 0.95).rotation.x = Math.PI / 2;
      }
      bloco('banquetas', 16.7, 17.8, FS + 0.75, FS + 1.15);
      const gelada = montarMovel();                                                                          // a geladeira (de enfeite: esta não abre)
      gelada.grupo.position.set(19.65, 0, FS + gelada.prof / 2);
      g.add(gelada.grupo);
      bloco('geladeira', 19.11, 20.25, FZ1, FS + gelada.prof + 0.1);
      const SX = 18.3;                                                                                       // o sofá, de veludo verde, com duas almofadas
      malha(g, caixaSuave(2.0, 0.3, 0.85, 0.08), veludoVerde, SX, 0.27, FN - 0.43);
      malha(g, caixaSuave(2.0, 0.55, 0.2, 0.08), veludoVerde, SX, 0.62, FN - 0.1);
      for (const lado of [-1, 1]) {
        malha(g, caixaSuave(0.2, 0.4, 0.85, 0.08), veludoVerde, SX + lado * 0.9, 0.5, FN - 0.43);
        malha(g, caixaSuave(0.78, 0.14, 0.6, 0.06), veludoVerde, SX + lado * 0.4, 0.47, FN - 0.5);
        malha(g, caixaSuave(0.36, 0.36, 0.12, 0.05), rosado, SX + lado * 0.5, 0.7, FN - 0.3).rotation.x = -0.25;
        for (const dz of [-0.78, -0.1]) malha(g, new T.CylinderGeometry(0.02, 0.015, 0.12, 8), dourado, SX + lado * 0.9, 0.06, FN + dz);
      }
      bloco('sofá', SX - 1.0, SX + 1.0, FN - 0.86, FZ2);
      caixa(1.38, 0.88, 0.03, dourado, SX, 1.78, FN - 0.016);                                                // o quadro, em cima do sofá
      malha(g, new T.PlaneGeometry(1.3, 0.8), quadroChique, SX, 1.78, FN - 0.034).rotation.y = Math.PI;
      vasoDePlanta(16.75, FN - 0.4, 1.5, dourado); bloco('planta', 16.45, 17.05, FN - 0.7, FZ2);
      malha(g, new T.CylinderGeometry(0.15, 0.15, 0.02, 20), dourado, 19.75, 0.01, FN - 0.35);               // a luminária de pé
      malha(g, new T.CylinderGeometry(0.012, 0.012, 1.55, 8), dourado, 19.75, 0.78, FN - 0.35);
      malha(g, new T.CylinderGeometry(0.11, 0.17, 0.24, 20, 1, true), luminoso({ color: 0xffe9c4, side: T.DoubleSide }), 19.75, 1.62, FN - 0.35);
      bloco('luminária', 19.55, 19.95, FN - 0.55, FZ2);
      malha(g, new T.PlaneGeometry(2.4, 1.5), tapeteChique, 18.2, 0.012, -2.95).rotation.x = -Math.PI / 2;
    }
    {
      // o quarto (7): a cama na parede do sul, a penteadeira, a janela e, na poltrona, a mulher
      const CX = 23.33, CL = 1.65;                 // o meio da cama e a largura dela
      malha(g, caixaSuave(CL + 0.06, 0.3, 2.06, 0.05), veludoAzul, CX, 0.17, FS + 1.05);                      // a base estofada, o colchão, o edredom e a manta dobrada
      malha(g, caixaSuave(CL, 0.2, 1.96, 0.06), branco, CX, 0.42, FS + 1.06);
      malha(g, caixaSuave(CL + 0.02, 0.1, 1.3, 0.04), laca, CX, 0.54, FS + 1.36);
      malha(g, caixaSuave(CL + 0.03, 0.06, 0.45, 0.025), mostarda, CX, 0.6, FS + 1.75);
      for (const dx of [-0.4, 0.4]) {
        malha(g, caixaSuave(0.62, 0.14, 0.38, 0.06), branco, CX + dx, 0.58, FS + 0.36);
        malha(g, caixaSuave(0.4, 0.3, 0.12, 0.05), rosado, CX + dx * 0.9, 0.69, FS + 0.58).rotation.x = -0.3;
      }
      malha(g, caixaSuave(CL + 0.3, 1.3, 0.12, 0.05), veludoAzul, CX, 0.75, FS + 0.07);                       // a cabeceira alta, estofada, com botões dourados
      for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) malha(g, new T.SphereGeometry(0.02, 8, 6), dourado, CX - 0.6 + i * 0.4, 0.95 + k * 0.3, FS + 0.135);
      bloco('cama', CX - CL / 2 - 0.03, 24.25, FZ1, FS + 2.1);
      for (const dx of [-0.42, 0.42]) {                                                                       // dois quadros em cima da cabeceira
        caixa(0.46, 0.56, 0.03, dourado, CX + dx, 1.95, FS + 0.016);
        malha(g, new T.PlaneGeometry(0.4, 0.5), quadroChique, CX + dx, 1.95, FS + 0.034);
      }
      malha(g, caixaSuave(0.42, 0.36, 0.4, 0.03), laca, 22.2, 0.34, FS + 0.24);                               // o criado-mudo, com o abajur
      for (const dx of [-0.17, 0.17]) for (const dz of [0.08, 0.4]) malha(g, new T.CylinderGeometry(0.012, 0.012, 0.16, 8), dourado, 22.2 + dx, 0.08, FS + dz);
      malha(g, new T.CylinderGeometry(0.025, 0.06, 0.22, 12), dourado, 22.2, 0.63, FS + 0.24);
      malha(g, new T.CylinderGeometry(0.08, 0.13, 0.17, 20, 1, true), luminoso({ color: 0xffe9c4, side: T.DoubleSide }), 22.2, 0.82, FS + 0.24);
      bloco('criado-mudo', 21.97, 22.43, FZ1, FS + 0.46);
      if (DESAFIO === 5 || COLETIVO) morador(montarPessoa(true), 21.5, FN - 0.46, 7, FZ2, 2);                               // a mulher, com a mão na testa
      const PX0 = 20.25 + 0.06;                    // a penteadeira, na parede da sala: o tampo de mármore, o espelho redondo e o banquinho
      malha(g, caixaSuave(0.42, 0.04, 1.0, 0.012), marmoreLiso, PX0 + 0.22, 0.76, -1.62);
      for (const dz of [-0.44, 0.44]) for (const dx of [0.05, 0.39]) malha(g, new T.CylinderGeometry(0.014, 0.014, 0.74, 8), dourado, PX0 + dx, 0.37, -1.62 + dz);
      malha(g, new T.CylinderGeometry(0.33, 0.33, 0.02, 40), dourado, PX0 + 0.012, 1.42, -1.62).rotation.z = Math.PI / 2;
      espelhar(malha(g, new T.CircleGeometry(0.29, 40), M.inox, PX0 + 0.025, 1.42, -1.62)).rotation.y = Math.PI / 2;
      malha(g, new T.CylinderGeometry(0.16, 0.16, 0.08, 20), rosado, PX0 + 0.7, 0.44, -1.62);
      malha(g, new T.CylinderGeometry(0.02, 0.1, 0.4, 12), dourado, PX0 + 0.7, 0.2, -1.62);
      bloco('penteadeira', 20.25, PX0 + 0.88, -2.15, FZ2);
      janela(23.1, FZ2, 'z', 1.06, 0.87, 2.13);                                                               // a janela, com cortinas de veludo
      for (const dx of [-0.72, 0.72]) malha(g, caixaSuave(0.36, 2.2, 0.06, 0.025), rosado, 23.1 + dx, 1.26, FN - 0.07);
      malha(g, new T.CylinderGeometry(0.014, 0.014, 2.0, 8), dourado, 23.1, 2.38, FN - 0.07).rotation.z = Math.PI / 2;
      const LX = 22.25, LZ = -3;                   // o lustre, no meio do quarto: um aro dourado com velas
      // (o lustre fica logo abaixo da lâmpada do quarto: se fizesse sombra, cada pingente viraria uma mancha enorme na parede)
      semSombra.push(caixa(0.012, 0.5, 0.012, dourado, LX, 2.34, LZ));
      const aro = malha(g, new T.TorusGeometry(0.34, 0.018, 8, 40), dourado, LX, 2.08, LZ);
      aro.rotation.x = Math.PI / 2;
      semSombra.push(aro);
      const chama = luminoso({ color: 0xfff0cf });
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3, x = LX + Math.cos(a) * 0.34, z = LZ + Math.sin(a) * 0.34;
        semSombra.push(malha(g, new T.CylinderGeometry(0.014, 0.014, 0.09, 8), laca, x, 2.14, z));
        malha(g, new T.SphereGeometry(0.026, 10, 8), chama, x, 2.21, z);
        semSombra.push(malha(g, new T.OctahedronGeometry(0.03), mat(0xeaf6ff, { roughness: 0.05, metalness: 0.3, envMapIntensity: 1.5 }), x, 2.0, z));
      }
      malha(g, new T.CircleGeometry(1.05, 40), mat(0xf1ece2, { roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 21.6, 0.012, -3.3).rotation.x = -Math.PI / 2;
    }
    {
      // o banheiro (8): a banheira solta na parede do sul, a pia de mármore com o espelho redondo na do norte e o vaso na do leste
      const BE = FE - 0.06;
      const banheira = malha(g, new T.CylinderGeometry(0.5, 0.42, 0.56, 32), louca, 25.5, 0.3, FS + 0.5);
      banheira.scale.set(1.6, 1, 0.78);
      const agua = malha(g, new T.CircleGeometry(0.45, 32), mat(0xbfe6ee, { roughness: 0.05, metalness: 0.2 }), 25.5, 0.5, FS + 0.5);
      agua.rotation.x = -Math.PI / 2; agua.scale.set(1.6, 0.78, 1);
      malha(g, new T.CylinderGeometry(0.018, 0.018, 0.86, 10), dourado, 24.62, 0.43, FS + 0.5);               // a torneira de pé, dourada
      malha(g, new T.CylinderGeometry(0.016, 0.016, 0.22, 10), dourado, 24.72, 0.85, FS + 0.5).rotation.z = Math.PI / 2;
      bloco('banheira', 24.5, 26.4, FZ1, FS + 0.95);
      caixa(1.2, 0.42, 0.42, marinho, 25.6, 0.62, FN - 0.21);                                                 // a pia: o gabinete, o tampo, a cuba e a torneira
      malha(g, caixaSuave(1.26, 0.04, 0.46, 0.012), marmoreLiso, 25.6, 0.85, FN - 0.23);
      malha(g, new T.CylinderGeometry(0.17, 0.11, 0.1, 24), louca, 25.6, 0.92, FN - 0.25);
      malha(g, new T.CylinderGeometry(0.012, 0.012, 0.24, 10), dourado, 25.6, 0.99, FN - 0.07);
      malha(g, new T.CylinderGeometry(0.32, 0.32, 0.02, 40), dourado, 25.6, 1.55, FN - 0.012).rotation.x = Math.PI / 2;
      espelhar(malha(g, new T.CircleGeometry(0.28, 40), M.inox, 25.6, 1.55, FN - 0.025)).rotation.y = Math.PI;
      bloco('pia', 24.95, 26.3, FN - 0.5, FZ2);
      malha(g, caixaSuave(0.5, 0.4, 0.38, 0.06), louca, BE - 0.3, 0.2, -2.9);                                 // o vaso
      malha(g, caixaSuave(0.18, 0.42, 0.42, 0.04), louca, BE - 0.1, 0.6, -2.9);
      malha(g, caixaSuave(0.46, 0.04, 0.4, 0.015), branco, BE - 0.32, 0.42, -2.9);
      bloco('vaso', BE - 0.6, FE, -3.2, -2.6);
      malha(g, new T.CylinderGeometry(0.012, 0.012, 0.6, 8), dourado, 24.25 + 0.1, 1.2, -4.0).rotation.x = Math.PI / 2;   // a toalha, no porta-toalhas
      caixa(0.03, 0.5, 0.44, branco, 24.25 + 0.1, 0.96, -4.0);
      malha(g, new T.CircleGeometry(0.42, 32), mat(0xe6bfc6, { roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 25.3, 0.012, -2.7).rotation.x = -Math.PI / 2;
    }

    // --- a farmácia (9), na rua do leste: de portas abertas, como o mercadinho ---
    {
      const X1 = 19.6, X2 = 23.5, Z1 = 8.5, Z2 = 12.5, XP = 21.5, XM = (X1 + X2) / 2, rebocoF = rebocado(0xeef4ee), barradoF = liso(0x2f7d5b, 0.9), verdeF = liso(0x2f9d7a, 0.5);
      parede(X1, Z1, X2, Z1, [[20.2, 1.0, 0.55, 2.05], XP, [22.85, 1.0, 0.55, 2.05]], -1, rebocoF, barradoF);   // (com as duas vitrines)
      parede(X1, Z2, X2, Z2, [], 1, rebocoF, barradoF);
      parede(X1, Z1, X1, Z2, [], -1, rebocoF, barradoF);
      parede(X2, Z1, X2, Z2, [], 1, rebocoF, barradoF);
      piso(X1, X2, Z1, Z2, M.ladrilho, (X2 - X1) / 4, 1);
      teto(X1, X2, Z1, Z2);
      cobrir(X1, X2, Z1, Z2, A + 0.7, 0.9, 0x5c6b73);
      vao(XP, Z1, 'z', 4, 9);
      caixa(X2 - X1 + 0.12, 0.7, 0.14, rebocoF, XM, A + 0.35, Z1); caixa(X2 - X1 + 0.12, 0.7, 0.14, rebocoF, XM, A + 0.35, Z2);   // a platibanda, com o letreiro
      caixa(0.14, 0.7, Z2 - Z1, rebocoF, X1, A + 0.35, (Z1 + Z2) / 2); caixa(0.14, 0.7, Z2 - Z1, rebocoF, X2, A + 0.35, (Z1 + Z2) / 2);
      const letreiroF = texturaCanvas(1024, 170, (c, l, a) => {
        c.fillStyle = '#1f9d55'; c.fillRect(0, 0, l, a);
        c.strokeStyle = '#ffffff'; c.lineWidth = 8; c.strokeRect(10, 10, l - 20, a - 20);
        letras(c, 'FARMÁCIA', l / 2, a / 2 + 6, 112, '#ffffff', l - 330);
        c.fillStyle = '#ffffff';
        for (const x of [100, l - 100]) { c.fillRect(x - 15, a / 2 - 45, 30, 90); c.fillRect(x - 45, a / 2 - 15, 90, 30); }
      });
      malha(g, new T.PlaneGeometry(3.5, 0.58), mat(0xffffff, { map: letreiroF, roughness: 0.6 }), XM, A + 0.36, Z1 - 0.075).rotation.y = Math.PI;
      for (const x of [20.2, 22.85]) janela(x, Z1, 'z', 1.0, 0.55, 2.05, liso(0x3d4a54, 0.5), false);          // as vitrines
      const cruz = mat(0xffffff, { roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0.25, map: texturaCanvas(128, 128, (c, l) => {
        c.fillStyle = '#ffffff'; c.fillRect(0, 0, l, l);
        c.fillStyle = '#1f9d55'; c.fillRect(l * 0.36, l * 0.12, l * 0.28, l * 0.76); c.fillRect(l * 0.12, l * 0.36, l * 0.76, l * 0.28);
      }) });
      malha(g, new T.BoxGeometry(0.06, 0.6, 0.6), [cruz, cruz, verdeF, verdeF, verdeF, verdeF], X1 + 0.3, 2.35, Z1 - 0.48).castShadow = true;   // a cruz verde, de pé na fachada: vê-se de quem vem pela rua
      caixa(0.04, 0.04, 0.3, ferro, X1 + 0.3, 2.62, Z1 - 0.2);
      // por dentro: as estantes do fundo e da esquerda, e o balcão
      const CORES_DA_FARMACIA = [0xffffff, 0xe3f1ec, 0x2f9d7a, 0x3d8fd1, 0xf06a6a, 0xf2c230], acaso = aleatorio(5151);
      estante(3.0, (t, f, y) => [20.0 + t, y, Z2 - 0.06 - f], 0, [1, 1.5], CORES_DA_FARMACIA, acaso);       // na parede do fundo, com o lugar dos três remédios vago
      bloco('estante', 20.0, 23.0, Z2 - 0.5, Z2);
      estante(2.2, (t, f, y) => [X1 + 0.06 + f, y, 9.4 + t], Math.PI / 2, null, CORES_DA_FARMACIA, acaso);
      bloco('estante', X1, X1 + 0.5, 9.4, 11.6);
      caixa(0.7, 0.95, 1.5, branco, 23.05, 0.475, 10.1); caixa(0.74, 0.05, 1.54, verdeF, 23.05, 0.975, 10.1);   // o balcão, com a caixa registradora
      malha(g, caixaSuave(0.34, 0.22, 0.3, 0.03), liso(0x3a4046, 0.4), 23.05, 1.11, 10.35); caixa(0.02, 0.16, 0.22, luminoso({ color: 0x9fe8b0 }), 22.87, 1.16, 10.35);
      bloco('balcão', 22.7, X2, 9.3, 10.9);
    }

    // --- a casa azul (10 e 11), na rua do leste ---
    // A cozinha (10), por onde se entra, e a sala (11). É a casa do desafio 6: o morador quer pão
    // de queijo com café, e o café se faz aqui, na cafeteira, com a água da geladeira e o pó de
    // café do mercadinho. Nos outros desafios a porta da rua dela fica trancada.
    //
    //    z      +--------===---+--------------+
    //    4      |              | janela   ele |       === a porta da rua (em x = 21)
    //           |  10 cozinha  .   11 sala    |
    //    0      | pia  cafet. geladeira   TV  |
    //           +--------------+--------------+
    //         19,6           22,4           25,2   x
    const casaAzul = { geladeira: null, movel: null, ZS: 0.06 };   // (o que os objetos do desafio 6 precisam saber dela: ver "os objetos")
    {
      const X1 = 19.6, XM = 22.4, X2 = 25.2, Z1 = 0, Z2 = 4, zs = casaAzul.ZS, rebocoAzul = rebocado(0xa9cbe6), barradoAzul = liso(0x6f93b5, 0.9);
      parede(X1, Z1, X2, Z1, [], -1, rebocoAzul, barradoAzul);
      parede(X1, Z2, X2, Z2, [21, [23.0, 1.04, 0.93, 2.07], [24.5, 1.04, 0.93, 2.07]], 1, rebocoAzul, barradoAzul);   // (com as duas janelas da sala)
      parede(X1, Z1, X1, Z2, [], -1, rebocoAzul, barradoAzul);
      parede(X2, Z1, X2, Z2, [], 1, rebocoAzul, barradoAzul);
      parede(XM, Z1, XM, Z2, [2]);
      piso(X1, XM, Z1, Z2, M.ladrilho, (XM - X1) / 4, 1); piso(XM, X2, Z1, Z2, M.piso, (X2 - XM) / 4, 1);
      teto(X1, XM, Z1, Z2); teto(XM, X2, Z1, Z2);
      cobrir(X1, X2, Z1, Z2, A, 1.2, 0x8a4a3a);
      portaDaRua(21, Z2, 'z', [10, 4], liso(0xc8553d, 0.5), !COLETIVO && DESAFIO !== 6, 1);            // (corre para o leste: do outro lado a parede acaba logo)
      vao(XM, 2, 'x', 10, 11);
      // por fora, na rua: o batente da porta, duas janelas com floreira e o capacho
      for (const x of [20.25, 21.75]) caixa(0.1, ALTURA_PORTA + 0.1, 0.05, branco, x, (ALTURA_PORTA + 0.1) / 2, Z2 + 0.1);
      caixa(1.6, 0.1, 0.05, branco, 21, ALTURA_PORTA + 0.05, Z2 + 0.1);
      for (const x of [23.0, 24.5]) {
        janela(x, Z2, 'z', 1.04, 0.93, 2.07);
        caixa(1.1, 0.2, 0.22, liso(0x7a4a2a, 0.8), x, 0.86, Z2 + 0.2);
        for (let i = 0; i < 5; i++) malha(g, new T.SphereGeometry(0.085, 10, 8), liso([0xe4572e, 0xf2c230, 0xffffff][i % 3], 0.7), x - 0.4 + i * 0.2, 1.01, Z2 + 0.2);
      }
      caixa(0.9, 0.012, 0.5, liso(0x7a5a3a, 1), 21, CIDADE.alto + 0.006, Z2 + 0.36);
      // a cozinha (10): a bancada com a pia e a cafeteira, e a geladeira, na parede do sul; uma mesinha na do oeste
      const B1 = X1 + 0.06, B2 = 21.4, bm = (B1 + B2) / 2, bc = B2 - B1, azulejado = liso(0xf3f1ea, 0.2);
      caixa(bc, 0.1, 0.44, preto, bm, 0.05, zs + 0.24);
      caixa(bc, 0.78, 0.54, armario, bm, 0.49, zs + 0.27);
      malha(g, caixaSuave(bc + 0.04, 0.04, 0.58, 0.012), tampo, bm, 0.9, zs + 0.29);
      caixa(bc, 0.6, 0.02, azulejado, bm, 1.22, zs + 0.012);
      caixa(bc, 0.7, 0.35, armario, bm, 1.9, zs + 0.175);
      for (let i = 0; i < 3; i++) {
        const x = B1 + bc / 3 * (i + 0.5);
        malha(g, caixaSuave(bc / 3 - 0.03, 0.72, 0.02, 0.008), portinha, x, 0.49, zs + 0.55); caixa(0.12, 0.014, 0.02, M.latao, x, 0.79, zs + 0.57);
        malha(g, caixaSuave(bc / 3 - 0.03, 0.64, 0.02, 0.008), portinha, x, 1.9, zs + 0.355); caixa(0.014, 0.12, 0.02, M.latao, x + bc / 6 - 0.07, 1.67, zs + 0.375);
      }
      caixa(0.56, 0.012, 0.38, M.inox, 20.1, 0.921, zs + 0.3); caixa(0.44, 0.012, 0.26, M.inoxEscuro, 20.1, 0.924, zs + 0.32);   // a pia
      malha(g, new T.CylinderGeometry(0.014, 0.014, 0.26, 12), M.inox, 20.1, 1.05, zs + 0.1);
      malha(g, new T.CylinderGeometry(0.012, 0.012, 0.16, 12), M.inox, 20.1, 1.17, zs + 0.17).rotation.x = Math.PI / 2;
      bloco('bancada', X1, B2, Z1, zs + 0.58);
      {
        // A cafeteira, na bancada: com a água ou o pó de café na mão, o ESPACO põe na cafeteira; com
        // os dois lá dentro, a jarra enche e aparece a xícara de café pronta (ver usarNaVila).
        const CX = 20.95, CZ = zs + 0.26, corpo = malha(g, caixaSuave(0.2, 0.32, 0.22, 0.03), preto, CX, 0.92 + 0.16, CZ);
        caixa(0.16, 0.03, 0.2, M.inox, CX, 0.935, CZ + 0.14);                                                // a chapa
        malha(g, new T.CylinderGeometry(0.065, 0.055, 0.13, 20, 1, true), new T.MeshStandardMaterial({ color: 0xdfeef5, transparent: true, opacity: 0.4, roughness: 0.05, side: T.DoubleSide, depthWrite: false }), CX, 1.015, CZ + 0.15);
        const jarra = malha(g, new T.CylinderGeometry(0.058, 0.05, 0.1, 20), liso(0x2b160c, 0.2), CX, 1.0, CZ + 0.15);   // o café na jarra, que só aparece quando ele fica pronto
        jarra.visible = false;
        caixa(0.03, 0.03, 0.01, luminoso({ color: 0xff5a3c }), CX + 0.06, 1.2, CZ + 0.112);                  // a luzinha
        vila.cafeteira = { nome: 'cafeteira', x: CX, z: CZ + 0.1, alt: 0.32, sala: 10, itens: [], pronta: false, malha: corpo, jarra, contorno: contorno(corpo, new T.BoxGeometry(0.27, 0.38, 0.29), 0, 1) };
      }
      const movel = casaAzul.movel = montarMovel();                                                          // a geladeira, com a garrafa de água dentro
      movel.grupo.position.set(21.95, 0, zs + movel.prof / 2);
      g.add(movel.grupo);
      rechearGeladeira(movel);
      casaAzul.geladeira = { nome: 'geladeira', x: 21.95, z: zs + movel.prof, sala: 10, aberta: false, vis: 0, folhas: movel.folhas, contorno: movel.borda, dentro: [], olha: 1, larg: movel.larg, base: movel.base, alt: movel.alt };
      abrem.push(casaAzul.geladeira);
      bloco('geladeira', 21.95 - 0.54, XM, Z1, zs + movel.prof + 0.3);
      malha(g, new T.CylinderGeometry(0.36, 0.36, 0.04, 28), madeira, X1 + 0.5, 0.74, 2.45);                 // a mesinha, com um banquinho
      malha(g, new T.CylinderGeometry(0.04, 0.04, 0.72, 12), preto, X1 + 0.5, 0.36, 2.45);
      malha(g, new T.CylinderGeometry(0.18, 0.18, 0.02, 20), preto, X1 + 0.5, 0.01, 2.45);
      malha(g, new T.CylinderGeometry(0.15, 0.15, 0.04, 20), madeira, X1 + 0.62, 0.46, 3.1); malha(g, new T.CylinderGeometry(0.03, 0.03, 0.44, 10), preto, X1 + 0.62, 0.22, 3.1);
      bloco('mesa', X1, X1 + 0.92, 2.05, 3.3);
      // a sala (11): o morador na poltrona, de costas para a parede da rua; a TV na do sul; a estante na do leste
      if (DESAFIO === 6 || COLETIVO) morador(montarPessoa(false, 0x2f7d5b), 24.0, 3.48, 11, Z2, 3);
      caixa(1.5, 0.42, 0.4, madeira, 24.0, 0.21, zs + 0.2);                                                  // o rack, com a TV
      caixa(1.16, 0.66, 0.04, preto, 24.0, 0.93, zs + 0.12); caixa(1.08, 0.58, 0.01, liso(0x10151c, 0.08), 24.0, 0.93, zs + 0.142);
      caixa(0.3, 0.08, 0.16, preto, 24.0, 0.46, zs + 0.14);
      bloco('rack', 23.2, 24.8, Z1, zs + 0.42);
      const xe = X2 - 0.06;                                                                                  // a estante de livros
      {
        // Uma estante de verdade: o fundo, os dois lados e cinco tábuas, com os livros em pé em cima de
        // quatro delas, um pouco para dentro da beirada. (Antes era um bloco maciço com os livros
        // encostados na face da frente: as duas superfícies disputavam os mesmos pixels e a imagem piscava.)
        const Z1 = 1.1, Z2 = 2.4, FUNDO = 0.3, TABUAS = [0.06, 0.48, 0.9, 1.32, 1.785], sorte = aleatorio(6161), livros = {};
        caixa(0.02, 1.8, Z2 - Z1, madeiraClara, xe - 0.01, 0.9, (Z1 + Z2) / 2);
        for (const z of [Z1 + 0.015, Z2 - 0.015]) caixa(FUNDO, 1.8, 0.03, madeira, xe - FUNDO / 2, 0.9, z);
        for (const y of TABUAS) caixa(FUNDO - 0.01, 0.03, Z2 - Z1 - 0.06, madeira, xe - FUNDO / 2 - 0.005, y, (Z1 + Z2) / 2);
        for (const y of TABUAS.slice(0, 4)) {
          for (let z = Z1 + 0.05; z < Z2 - 0.12;) {             // uma fileira de livros de grossuras e alturas diferentes, com um vão de vez em quando
            const grossura = 0.035 + sorte() * 0.04, alt = 0.24 + sorte() * 0.1, fundo = 0.17 + sorte() * 0.04, cor = CORES_DAS_CAIXAS[Math.floor(sorte() * CORES_DAS_CAIXAS.length)];
            (livros[cor] = livros[cor] || []).push(new T.BoxGeometry(fundo, alt, grossura).translate(xe - 0.03 - fundo / 2, y + 0.015 + alt / 2, z + grossura / 2));
            z += grossura + (sorte() < 0.12 ? 0.09 : 0.004);
          }
        }
        for (const [cor, pecas] of Object.entries(livros)) malha(g, juntar(pecas), liso(Number(cor), 0.7), 0, 0, 0);   // os livros de cada cor, numa malha só
      }
      bloco('estante', xe - 0.32, X2, 1.08, 2.42);
      malha(g, new T.PlaneGeometry(1.9, 1.3), M.tapete, 23.8, 0.012, 1.9).rotation.x = -Math.PI / 2;         // o tapete
      malha(g, new T.PlaneGeometry(0.7, 0.5), M.quadro, XM + 0.065, 1.6, 0.9).rotation.y = Math.PI / 2;      // um quadro
    }

    // --- a padaria (12), na rua do oeste: de portas abertas, como as outras lojas ---
    {
      const X1 = -4.2, X2 = 1.9, Z1 = 8.5, Z2 = 12.5, XP = 0.5, XM = (X1 + X2) / 2, rebocoP = rebocado(0xe8b4a0), barradoP = liso(0x7a4a2a, 0.9);
      parede(X1, Z1, X2, Z1, [[-2.1, 3.1, 0.55, 2.05], XP], -1, rebocoP, barradoP);   // (com a vitrine)
      parede(X1, Z2, X2, Z2, [], 1, rebocoP, barradoP);
      parede(X1, Z1, X1, Z2, [], -1, rebocoP, barradoP);
      parede(X2, Z1, X2, Z2, [], 1, rebocoP, barradoP);
      piso(X1, X2, Z1, Z2, M.piso, (X2 - X1) / 4, 1);
      teto(X1, X2, Z1, Z2);
      cobrir(X1, X2, Z1, Z2, A + 0.7, 0.9, 0x8a4a3a);
      vao(XP, Z1, 'z', 4, 12);
      caixa(X2 - X1 + 0.12, 0.7, 0.14, rebocoP, XM, A + 0.35, Z1); caixa(X2 - X1 + 0.12, 0.7, 0.14, rebocoP, XM, A + 0.35, Z2);   // a platibanda, com o letreiro
      caixa(0.14, 0.7, Z2 - Z1, rebocoP, X1, A + 0.35, (Z1 + Z2) / 2); caixa(0.14, 0.7, Z2 - Z1, rebocoP, X2, A + 0.35, (Z1 + Z2) / 2);
      const letreiroP = texturaCanvas(1024, 160, (c, l, a) => {
        c.fillStyle = '#7a4a2a'; c.fillRect(0, 0, l, a);
        c.strokeStyle = '#fff3d6'; c.lineWidth = 8; c.strokeRect(10, 10, l - 20, a - 20);
        letras(c, 'PADARIA', l / 2, a / 2 + 6, 112, '#fff3d6', l - 120);
      });
      malha(g, new T.PlaneGeometry(4.6, 0.62), mat(0xffffff, { map: letreiroP, roughness: 0.6 }), XM, A + 0.36, Z1 - 0.075).rotation.y = Math.PI;
      janela(-2.1, Z1, 'z', 3.1, 0.55, 2.05, liso(0x4a3324, 0.5), false);                                    // a vitrine, com o toldo
      const lonaP = mat(0xffffff, { roughness: 0.8, map: texturaCanvas(384, 32, (c, l, a) => { for (let i = 0; i < 12; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#d9772b'; c.fillRect(i * 32, 0, 32, a); } }) });
      malha(g, new T.BoxGeometry(3.4, 0.04, 0.85), lonaP, -2.1, 2.33, Z1 - 0.48).rotation.x = -0.32;
      // por dentro: a estante dos pães no fundo, o balcão de vidro e os cestos
      const CORES_DOS_PAES = [0xd9a25a, 0xc98a3c, 0xe8c27a, 0x8a5a2a, 0xf1dfb5, 0xb9773a], acaso = aleatorio(7171);
      estante(5.2, (t, f, y) => [X1 + 0.2 + t, y, Z2 - 0.06 - f], 0, [1, XP - X1 - 0.2], CORES_DOS_PAES, acaso);   // com o lugar dos três pães vago
      bloco('estante', X1 + 0.2, X1 + 5.4, Z2 - 0.5, Z2);
      caixa(2.4, 0.9, 0.7, madeira, -2.2, 0.45, 10.35);                                                      // o balcão: a base de madeira e a vitrine de vidro, com pães dentro
      malha(g, new T.BoxGeometry(2.36, 0.36, 0.66), new T.MeshStandardMaterial({ color: 0xdfeef5, transparent: true, opacity: 0.28, roughness: 0.05, depthWrite: false }), -2.2, 1.09, 10.35);
      caixa(2.4, 0.03, 0.7, madeiraClara, -2.2, 1.285, 10.35);
      for (let i = 0; i < 9; i++) { const p = malha(g, new T.SphereGeometry(0.07, 12, 8), liso(CORES_DOS_PAES[i % 3], 0.8), -3.2 + i * 0.25, 0.96, 10.25 + (i % 2) * 0.2); p.scale.set(1.4, 0.7, 1); }
      malha(g, caixaSuave(0.34, 0.22, 0.3, 0.03), liso(0x3a4046, 0.4), -1.3, 1.41, 10.35); caixa(0.02, 0.16, 0.22, luminoso({ color: 0x9fe8b0 }), -1.3, 1.46, 10.19);   // a caixa registradora
      bloco('balcão', -3.4, -1.0, 9.9, 10.8);
      for (const [x, cor] of [[-3.7, 0xd9a25a], [-3.1, 0xe8c27a]]) {                                         // dois cestos de pão, perto da vitrine
        malha(g, new T.CylinderGeometry(0.24, 0.2, 0.3, 20), M.palhaEscura, x, 0.15, 8.95);
        for (let i = 0; i < 6; i++) { const p = malha(g, new T.SphereGeometry(0.06, 10, 8), liso(cor, 0.8), x - 0.1 + (i % 3) * 0.1, 0.33, 8.89 + Math.floor(i / 3) * 0.12); p.scale.set(1, 0.7, 2.2); }
      }
      bloco('cestos', -4.0, -2.8, 8.6, 9.25);
    }

    // --- a hora do dia e a chuva ---
    // A cidade pode estar de dia, no fim da tarde ou de noite (?hora=dia|tarde|noite no endereço; a
    // tecla N troca), e de vez em quando chove (sozinha, uns 100 segundos a cada 7 minutos; ?chuva=1
    // chove sempre, ?chuva=0 nunca; a tecla P liga e desliga). Nada disso muda o jogo: só a luz, o
    // céu e o que se vê — na página e na imagem da iA.
    //   sol: de onde vem a luz (de noite, a da lua); tom: a cor que tinge o céu e a névoa;
    //   postes e janelas: quanto os postes da rua e as janelas das casas acendem; exposicao: quanto
    //   a imagem inteira clareia (de noite, pouco: é o que escurece também o que a luz do ambiente
    //   ilumina); lampada: por quanto a lâmpada de dentro de casa é reforçada, para compensar.
    const HORAS = {
      dia: { sol: [0.5, 1, -0.45], corDoSol: 0xfff0d6, forcaDoSol: 2.8, ceu: 0.8, corDoCeu: 0xeef5ff, corDoChao: 0xd9d3c6, rebatida: 0.4, tom: [1, 1, 1], postes: 0, janelas: 0, exposicao: 1, lampada: 1 },
      tarde: { sol: [-0.9, 0.3, -0.35], corDoSol: 0xff9c52, forcaDoSol: 2.4, ceu: 0.5, corDoCeu: 0xffd2ad, corDoChao: 0xa98b7c, rebatida: 0.2, tom: [1.3, 0.8, 0.52], postes: 3, janelas: 0.5, exposicao: 0.8, lampada: 1.25 },
      noite: { sol: [0.35, 1, 0.5], corDoSol: 0x9db4ea, forcaDoSol: 0.35, ceu: 0.14, corDoCeu: 0x7388c4, corDoChao: 0x1b2030, rebatida: 0.04, tom: [0.22, 0.3, 0.62], postes: 22, janelas: 1.6, exposicao: 0.3, lampada: 2.8 },
    };
    const clima = vila.clima = { hora: HORAS[ENDERECO.get('hora')] ? ENDERECO.get('hora') : 'dia', chuva: ENDERECO.get('chuva') === '1' ? true : ENDERECO.get('chuva') === '0' ? false : null, fase: Math.random() * 420, molhado: 0, v: null };
    clima.chovendo = () => clima.chuva != null ? clima.chuva : (performance.now() / 1000 + clima.fase) % 420 < 100;
    vidroDaRua.emissive.set(0xffc27a);
    // As gotas: riscos que caem em toda a cidade, menos em cima das construções (dentro de casa não chove).
    const GOTAS = 5000, telhados = Object.values(areas).filter(a => a.n !== 4).map(a => [a.x1 - 0.3, a.x2 + 0.3, a.z1 - 0.3, a.z2 + 0.3]).concat([[7.45, 12.05, 13.3, 18.1]]);
    const gotas = new Float32Array(GOTAS * 6), acasoDaChuva = aleatorio(9090);
    for (let i = 0; i < GOTAS; i++) {
      let x, z;
      do { x = MEIO.x - 26 + acasoDaChuva() * 52; z = MEIO.z - 24 + acasoDaChuva() * 48; } while (telhados.some(c => x > c[0] && x < c[1] && z > c[2] && z < c[3]));
      const y = acasoDaChuva() * 14;
      gotas.set([x, y, z, x + 0.05, y + 0.45, z], i * 6);
    }
    const geoDaChuva = new T.BufferGeometry();
    geoDaChuva.setAttribute('position', new T.BufferAttribute(gotas, 3));
    const chuva = new T.LineSegments(geoDaChuva, new T.LineBasicMaterial({ color: 0xcfe0ee, transparent: true, opacity: 0, depthWrite: false }));
    chuva.frustumCulled = false;
    chuva.visible = false;
    g.add(chuva);
    const rumoDoSol = new T.Vector3(), corDaHora = new T.Color(), tomDoCeu = new T.Color(), cinza = new T.Color();
    // A cada quadro: a luz, o céu e a névoa vão devagar para os da hora escolhida; a chuva chega e passa aos poucos.
    clima.passo = dt => {
      const h = HORAS[clima.hora], k = dt >= 1 ? 1 : 1 - Math.exp(-dt * 1.5);
      const v = clima.v || (clima.v = { sol: new T.Vector3(...h.sol).normalize(), forca: h.forcaDoSol, ceu: h.ceu, rebatida: h.rebatida, postes: h.postes, janelas: h.janelas, exposicao: h.exposicao, lampada: h.lampada,
        tom: new T.Color(...h.tom), corDoSol: new T.Color(h.corDoSol), corDoCeu: new T.Color(h.corDoCeu), corDoChao: new T.Color(h.corDoChao) });
      clima.molhado += ((clima.chovendo() ? 1 : 0) - clima.molhado) * k;
      const m = clima.molhado;
      v.sol.lerp(rumoDoSol.set(...h.sol).normalize(), k).normalize();
      for (const [campo, alvo] of [['forca', h.forcaDoSol], ['ceu', h.ceu], ['rebatida', h.rebatida], ['postes', h.postes], ['janelas', h.janelas], ['exposicao', h.exposicao], ['lampada', h.lampada]]) v[campo] += (alvo - v[campo]) * k;
      v.tom.lerp(corDaHora.setRGB(...h.tom), k); v.corDoSol.lerp(corDaHora.set(h.corDoSol), k); v.corDoCeu.lerp(corDaHora.set(h.corDoCeu), k); v.corDoChao.lerp(corDaHora.set(h.corDoChao), k);
      sol.position.copy(focoDoSol).addScaledVector(v.sol, 70);
      sol.intensity = v.forca * (1 - 0.7 * m); sol.color.copy(v.corDoSol);
      luzGeral.intensity = v.ceu * (1 - 0.2 * m); luzGeral.color.copy(v.corDoCeu); luzGeral.groundColor.copy(v.corDoChao);
      rebatida.intensity = v.rebatida;
      renderer.toneMappingExposure = v.exposicao * (1 - 0.2 * m);
      clima.lampada = v.lampada;
      const medio = (v.tom.r + v.tom.g + v.tom.b) / 3 * 0.6;                 // com chuva, o céu fica cinzento e mais escuro, e a névoa chega perto
      tomDoCeu.copy(v.tom).lerp(cinza.setRGB(medio, medio, medio * 1.05), 0.8 * m);
      materialDoCeu.color.copy(tomDoCeu).multiplyScalar(CLARO);
      cena.fog.color.copy(horizonte).multiply(tomDoCeu).multiplyScalar(CLARO);
      cena.fog.near = 50 - 34 * m; cena.fog.far = 240 - 140 * m;
      for (const l of luzesDosPostes) l.intensity = v.postes;
      vidroDaRua.emissiveIntensity = v.janelas * 0.22;                       // (o vidro é transparente: um brilho leve, de luz acesa lá dentro)
      asfalto.roughness = 0.95 - 0.5 * m;                                    // o asfalto molhado brilha
      chuva.visible = m > 0.02;
      chuva.material.opacity = 0.55 * m;
      if (chuva.visible && dt < 1) {
        const queda = dt * 11;
        for (let i = 0; i < GOTAS; i++) { const o = i * 6; let y = gotas[o + 1] - queda; if (y < 0) y += 14; gotas[o + 1] = y; gotas[o + 4] = y + 0.45; }
        geoDaChuva.attributes.position.needsUpdate = true;
      }
    };
    clima.passo(1);

    // --- os objetos: os três ingredientes, a massa e o bolo ---
    const novo = (n, forma, material) => { const o = novoObjeto(salas[n], forma, forma.nome, material); o.sala = n; return o; };
    // O desenho de cada objeto, para o inventário: (g, x, y, s) desenha o objeto centrado em
    // (x, y), cabendo num quadrado de lado s. O traço é claro, porque a casa do inventário é escura.
    const traco = g => { g.strokeStyle = 'rgba(255, 255, 255, 0.85)'; g.lineWidth = 5; };
    const caixote = (g, x, y, l, a) => { g.beginPath(); g.rect(x - l / 2, y - a / 2, l, a); g.fill(); g.stroke(); };
    const iconeDeSaco = faixa => (g, x, y, s) => {
      traco(g); g.fillStyle = '#f1e3c4'; caixote(g, x, y, s * 0.56, s * 0.84);
      g.fillStyle = faixa; g.fillRect(x - s * 0.28 + 3, y - s * 0.14, s * 0.56 - 6, s * 0.3);
    };
    const iconeDePacote = (fundo, faixa) => (g, x, y, s) => {
      traco(g); g.fillStyle = fundo; caixote(g, x, y, s * 0.68, s * 0.8);
      g.fillStyle = faixa; g.fillRect(x - s * 0.34 + 3, y - s * 0.13, s * 0.68 - 6, s * 0.28);
    };
    const iconeDeBolo = (cor, cobertura, cereja) => (g, x, y, s) => {
      traco(g);
      g.fillStyle = '#f7f7f4'; g.beginPath(); g.ellipse(x, y + s * 0.3, s * 0.46, s * 0.1, 0, 0, 7); g.fill(); g.stroke();   // o prato
      g.fillStyle = cor; caixote(g, x, y + s * 0.08, s * 0.68, s * 0.4);
      if (cobertura) { g.fillStyle = cobertura; caixote(g, x, y - s * 0.17, s * 0.68, s * 0.14); }
      if (cereja) { g.fillStyle = cereja; g.beginPath(); g.arc(x, y - s * 0.32, s * 0.08, 0, 7); g.fill(); g.stroke(); }
    };
    const iconeDeOvos = (g, x, y, s) => {
      traco(g); g.fillStyle = '#b9ad98'; caixote(g, x, y + s * 0.16, s * 0.84, s * 0.3);
      g.fillStyle = '#fbf6ec';
      for (const dx of [-0.26, 0, 0.26]) { g.beginPath(); g.ellipse(x + dx * s, y - s * 0.06, s * 0.11, s * 0.16, 0, 0, 7); g.fill(); g.stroke(); }
    };
    const iconeDeQueijo = (g, x, y, s) => {
      traco(g); g.fillStyle = '#f0c94a';
      g.beginPath(); g.moveTo(x - s * 0.42, y + s * 0.26); g.lineTo(x + s * 0.42, y + s * 0.26); g.lineTo(x + s * 0.42, y - s * 0.1); g.lineTo(x - s * 0.1, y - s * 0.3); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#c99a1e';
      for (const [dx, dy, r] of [[0.1, 0.08, 0.06], [0.28, 0.14, 0.04], [-0.12, 0.14, 0.045]]) { g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, 7); g.fill(); }
    };
    const iconeDeMaca = (g, x, y, s) => {
      traco(g); g.fillStyle = '#c8372d'; g.beginPath(); g.arc(x, y + s * 0.06, s * 0.32, 0, 7); g.fill(); g.stroke();
      g.strokeStyle = '#7a4a2a'; g.lineWidth = 7; g.beginPath(); g.moveTo(x, y - s * 0.24); g.lineTo(x + s * 0.05, y - s * 0.4); g.stroke();
      g.fillStyle = '#4f9d4a'; g.beginPath(); g.ellipse(x + s * 0.16, y - s * 0.34, s * 0.11, s * 0.05, -0.5, 0, 7); g.fill();
    };
    const iconeDeMassa = (g, x, y, s) => {
      traco(g); g.fillStyle = '#f3ead6';
      g.beginPath(); g.moveTo(x - s * 0.42, y - s * 0.12); g.quadraticCurveTo(x, y + s * 0.62, x + s * 0.42, y - s * 0.12); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#6b3d1e'; g.beginPath(); g.ellipse(x, y - s * 0.12, s * 0.4, s * 0.1, 0, 0, 7); g.fill(); g.stroke();
    };
    const rotulo = (l, a, desenho) => mat(0xffffff, { map: texturaCanvas(l, a, desenho), roughness: 0.7 });
    // No armário, três sacos de papel iguais, a não ser pelo nome e pela cor da faixa: arroz,
    // farinha e açúcar. Só a farinha é ingrediente; para pegar o saco certo é preciso ler e
    // escolher (botão TAB).
    const papel = liso(0xf1e3c4, 0.9);
    const saco = (nome, faixa, x) => {
      const lado = rotulo(256, 352, (c, l, a) => {
        c.fillStyle = '#f1e3c4'; c.fillRect(0, 0, l, a);
        c.fillStyle = faixa; c.fillRect(0, 96, l, 130);
        letras(c, nome.toUpperCase(), l / 2, 164, 58, '#ffffff', l - 20);
      });
      const o = novo(3, { nome, alt: 0.22, raio: 0.1, geo: new T.BoxGeometry(0.16, 0.22, 0.1) }, [lado, lado, papel, papel, lado, lado]);
      assentar(salas[3], o, x, 4 - 0.06 - arm.prof / 2 - 0.04, arm.Y1 + 0.007 + o.alt / 2);     // na prateleira do armário
      o.icone = iconeDeSaco(faixa);
      o.fechado = true;
      despensa.dentro.push(o);
      return o;
    };
    saco('arroz', '#3f8f4a', 7.51);
    const farinha = saco('farinha', '#3d6fa8', 7.3);
    farinha.ingrediente = true;
    saco('açúcar', '#c8553d', 7.09);
    // ovos: uma cartela com seis (a origem fica 5 cm acima do fundo, que é a metade da altura do objeto)
    const ovos = novo(3, { nome: 'ovos', alt: 0.1, raio: 0.11, geo: new T.BoxGeometry(0.2, 0.06, 0.13).translate(0, -0.02, 0), casca: new T.BoxGeometry(0.25, 0.15, 0.18) }, liso(0xb9ad98, 0.95));
    for (let i = 0; i < 6; i++) malha(ovos.malha, new T.SphereGeometry(0.028, 14, 10), liso(0xfbf6ec, 0.4), -0.066 + (i % 3) * 0.066, 0.022, i < 3 ? -0.032 : 0.032).scale.y = 1.25;
    ovos.ingrediente = true;
    ovos.icone = iconeDeOvos;
    assentar(salas[3], ovos, 7.3 - 0.15, zf + gel.prof - 0.2, gel.Y1 + 0.007 + ovos.alt / 2);              // na prateleira da geladeira
    ovos.fechado = true;
    geladeira.dentro.push(ovos);
    // ...e, na mesma geladeira, um queijo e uma maçã, que também dá para pegar (e não entram no bolo)
    const queijo = novo(3, { nome: 'queijo', alt: 0.07, raio: 0.1, geo: new T.BoxGeometry(0.16, 0.07, 0.11), casca: new T.BoxGeometry(0.21, 0.12, 0.16) }, liso(0xf0c94a, 0.5));
    assentar(salas[3], queijo, 7.3 - 0.17, zf + gel.prof / 2 + 0.08, gel.base + queijo.alt / 2);           // embaixo, como a maçã: a prateleira de cima fica atrás do inventário, no alto da imagem
    const maca = novo(3, { nome: 'maçã', alt: 0.084, raio: 0.05, geo: new T.SphereGeometry(0.042, 16, 12), casca: new T.SphereGeometry(0.062, 16, 12) }, liso(0xc8372d, 0.5));
    assentar(salas[3], maca, 7.3 + 0.14, zf + gel.prof / 2 + 0.1, gel.base + maca.alt / 2);
    queijo.icone = iconeDeQueijo; maca.icone = iconeDeMaca;
    for (const o of [queijo, maca]) { o.fechado = true; geladeira.dentro.push(o); }
    // Na estante do mercadinho, três pacotes em pé, do mesmo tamanho: café, chocolate e biscoito. Só o chocolate é ingrediente.
    const pacote = (nome, fundo, faixa, letra, x) => {
      const lado = liso(new T.Color(fundo).getHex(), 0.5), frente = rotulo(256, 300, (c, l, a) => {
        c.fillStyle = fundo; c.fillRect(0, 0, l, a);
        c.fillStyle = faixa; c.fillRect(0, 96, l, 108);
        letras(c, nome.toUpperCase(), l / 2, 152, 44, letra, l - 16);
      });
      const o = novo(5, { nome, alt: 0.2, raio: 0.09, geo: new T.BoxGeometry(0.17, 0.2, 0.035), casca: new T.BoxGeometry(0.22, 0.25, 0.09) }, [lado, lado, lado, lado, frente, frente]);
      assentar(salas[5], o, x, 12.22, 0.75 + o.alt / 2);
      o.icone = iconeDePacote(fundo, faixa);
      return o;
    };
    const poDeCafe = pacote('pó de café', '#1d1f22', '#c8372d', '#ffffff', 5.72);
    poDeCafe.paraOCafe = true;                  // com a água, é o que a cafeteira da casa azul pede (desafio 6)
    const chocolate = pacote('chocolate', '#5a3219', '#e9c46a', '#3b1f0e', 6.0);
    chocolate.ingrediente = true;
    pacote('biscoito', '#f2c230', '#2f7de1', '#ffffff', 6.28);
    // Na estante da farmácia, três caixas de remédio do mesmo tamanho, cada uma com o nome e para
    // que serve: xarope, analgésico e antiácido. Só o analgésico serve para a dor de cabeça (desafio 5).
    const remedio = (nome, para, fundo, faixa, x) => {
      const lado = liso(new T.Color(fundo).getHex(), 0.5), frente = rotulo(320, 224, (c, l, a) => {
        c.fillStyle = fundo; c.fillRect(0, 0, l, a);
        c.fillStyle = faixa; c.fillRect(0, 0, l, 62);
        c.fillStyle = '#ffffff'; c.fillRect(l / 2 - 8, 9, 16, 44); c.fillRect(l / 2 - 22, 23, 44, 16);   // uma cruz
        letras(c, nome.toUpperCase(), l / 2, 116, 50, '#14181c', l - 20);
        letras(c, para, l / 2, 178, 32, faixa, l - 20);
      });
      const o = novo(9, { nome, alt: 0.14, raio: 0.1, geo: new T.BoxGeometry(0.2, 0.14, 0.05), casca: new T.BoxGeometry(0.25, 0.19, 0.1) }, [lado, lado, lado, lado, frente, frente]);
      assentar(salas[9], o, x, 12.22, 0.75 + o.alt / 2);
      o.icone = iconeDePacote(fundo, faixa);
      return o;
    };
    remedio('xarope', 'para tosse', '#fff1cf', '#d9772b', 21.2);
    const analgesico = remedio('analgésico', 'para dor de cabeça', '#ffffff', '#c8372d', 21.5);
    remedio('antiácido', 'para azia', '#e3f1ff', '#2f7de1', 21.8);
    // O copo, na bancada do flat, ao lado do filtro; e o mesmo copo cheio de água, que só existe
    // depois de o vazio passar pelo filtro (desafio 5).
    const iconeDeCopo = cheio => (g, x, y, s) => {
      traco(g); g.fillStyle = 'rgba(216, 238, 248, 0.35)';
      g.beginPath(); g.moveTo(x - s * 0.26, y - s * 0.36); g.lineTo(x + s * 0.26, y - s * 0.36); g.lineTo(x + s * 0.2, y + s * 0.38); g.lineTo(x - s * 0.2, y + s * 0.38); g.closePath(); g.fill(); g.stroke();
      if (cheio) { g.fillStyle = '#6fbdf0'; g.beginPath(); g.moveTo(x - s * 0.235, y - s * 0.1); g.lineTo(x + s * 0.235, y - s * 0.1); g.lineTo(x + s * 0.2, y + s * 0.36); g.lineTo(x - s * 0.2, y + s * 0.36); g.closePath(); g.fill(); }
    };
    const vidroDoCopo = new T.MeshStandardMaterial({ color: 0xd8eef8, transparent: true, opacity: 0.45, roughness: 0.05, side: T.DoubleSide, depthWrite: false });
    const formaDoCopo = nome => ({ nome, alt: 0.12, raio: 0.06, geo: new T.CylinderGeometry(0.04, 0.032, 0.12, 20, 1, true), casca: new T.CylinderGeometry(0.065, 0.06, 0.17, 20) });
    const copo = vila.copo = novo(6, formaDoCopo('copo'), vidroDoCopo);
    malha(copo.malha, new T.CircleGeometry(0.032, 20), vidroDoCopo, 0, -0.058, 0).rotation.x = -Math.PI / 2;
    assentar(salas[6], copo, 18.6, FS + 0.32, 0.93 + copo.alt / 2);
    copo.icone = iconeDeCopo(false);
    const copoCheio = vila.copoCheio = novo(6, formaDoCopo('copo de água'), vidroDoCopo);
    malha(copoCheio.malha, new T.CircleGeometry(0.032, 20), vidroDoCopo, 0, -0.058, 0).rotation.x = -Math.PI / 2;
    malha(copoCheio.malha, new T.CylinderGeometry(0.037, 0.031, 0.09, 20), mat(0x6fbdf0, { roughness: 0.05, transparent: true, opacity: 0.85 }), 0, -0.012, 0);
    copoCheio.icone = iconeDeCopo(true);
    copoCheio.fechado = true;
    // No deque da cachoeira, um garrafão vazio, em cima de um caixote; na bica dali ele se enche de água da cachoeira.
    const formaDoJarro = nome => ({ nome, alt: 0.3, raio: 0.11, geo: new T.CylinderGeometry(0.1, 0.1, 0.24, 20).translate(0, -0.03, 0), casca: new T.CylinderGeometry(0.14, 0.14, 0.36, 20) });
    const plasticoDoJarro = new T.MeshStandardMaterial({ color: 0xa9d6f0, transparent: true, opacity: 0.5, roughness: 0.15, side: T.DoubleSide, depthWrite: false });
    const iconeDeJarro = cheio => (g, x, y, s) => {
      traco(g); g.fillStyle = cheio ? '#4aa6e8' : 'rgba(190, 225, 245, 0.35)';
      g.beginPath(); g.rect(x - s * 0.24, y - s * 0.16, s * 0.48, s * 0.56); g.fill(); g.stroke();
      g.fillStyle = 'rgba(190, 225, 245, 0.35)'; g.beginPath(); g.rect(x - s * 0.09, y - s * 0.38, s * 0.18, s * 0.22); g.fill(); g.stroke();
    };
    const jarro = vila.jarro = novo(14, formaDoJarro('garrafão'), plasticoDoJarro), jarroCheio = vila.jarroCheio = novo(14, formaDoJarro('água da cachoeira'), plasticoDoJarro);
    for (const j of [jarro, jarroCheio]) {
      malha(j.malha, new T.CylinderGeometry(0.035, 0.05, 0.08, 14), plasticoDoJarro, 0, 0.12, 0);                    // o gargalo e a tampa
      malha(j.malha, new T.CylinderGeometry(0.04, 0.04, 0.03, 14), liso(0x1f6fd1, 0.4), 0, 0.165, 0);
    }
    malha(jarroCheio.malha, new T.CylinderGeometry(0.092, 0.092, 0.2, 20), mat(0x3f9fe0, { roughness: 0.05, transparent: true, opacity: 0.85 }), 0, -0.04, 0);
    assentar(salas[14], jarro, 109.3, 1.3, 0.4 + jarro.alt / 2);
    jarro.icone = iconeDeJarro(false); jarroCheio.icone = iconeDeJarro(true);
    jarroCheio.fechado = true;
    // Na estante da padaria, três pães: pão francês, pão de queijo e sonho. O morador da casa azul quer o pão de queijo (desafio 6).
    const pao = (nome, x, forma, enfeitar, icone) => {
      const o = novo(12, Object.assign({ nome }, forma), forma.material);
      enfeitar(o.malha);
      assentar(salas[12], o, x, 12.22, 0.75 + o.alt / 2);
      o.icone = icone;
      return o;
    };
    const dourado2 = liso(0xe3b04b, 0.8), assado = liso(0xc98a3c, 0.8), louca2 = liso(0xf7f7f4, 0.3);
    const iconeDePao = (cor, n, creme) => (g, x, y, s) => {
      traco(g);
      g.fillStyle = '#f7f7f4'; g.beginPath(); g.ellipse(x, y + s * 0.26, s * 0.44, s * 0.1, 0, 0, 7); g.fill(); g.stroke();   // o prato
      g.fillStyle = cor;
      if (n > 1) for (const [dx, dy] of [[-0.2, 0.08], [0.2, 0.08], [0, -0.12]]) { g.beginPath(); g.arc(x + dx * s, y + dy * s, s * 0.17, 0, 7); g.fill(); g.stroke(); }
      else { g.beginPath(); g.ellipse(x, y + s * 0.02, s * (creme ? 0.3 : 0.4), s * 0.2, 0, 0, 7); g.fill(); g.stroke(); }
      if (creme) { g.fillStyle = '#fff6d8'; g.fillRect(x - s * 0.3, y, s * 0.6, s * 0.06); }
    };
    pao('pão francês', 0.22, { alt: 0.09, raio: 0.1, geo: new T.CylinderGeometry(0.1, 0.09, 0.016, 24).translate(0, -0.037, 0), casca: new T.CylinderGeometry(0.13, 0.13, 0.14, 24), material: louca2 }, m => {
      const p = malha(m, new T.SphereGeometry(0.05, 16, 10), assado, 0, 0.005, 0); p.scale.set(1.7, 0.75, 0.9); p.castShadow = true;
    }, iconeDePao('#c98a3c', 1, false));
    const paoDeQueijo = pao('pão de queijo', 0.5, { alt: 0.09, raio: 0.1, geo: new T.CylinderGeometry(0.1, 0.09, 0.016, 24).translate(0, -0.037, 0), casca: new T.CylinderGeometry(0.13, 0.13, 0.14, 24), material: louca2 }, m => {
      for (const [dx, dz] of [[-0.042, 0.02], [0.042, 0.02], [0, -0.045]]) malha(m, new T.SphereGeometry(0.036, 14, 10), dourado2, dx, 0.002, dz).castShadow = true;
      malha(m, new T.SphereGeometry(0.034, 14, 10), dourado2, 0, 0.045, 0).castShadow = true;
    }, iconeDePao('#e3b04b', 3, false));
    pao('sonho', 0.78, { alt: 0.09, raio: 0.1, geo: new T.CylinderGeometry(0.1, 0.09, 0.016, 24).translate(0, -0.037, 0), casca: new T.CylinderGeometry(0.13, 0.13, 0.14, 24), material: louca2 }, m => {
      const p = malha(m, new T.SphereGeometry(0.06, 16, 10), liso(0xd9a25a, 0.8), 0, 0.008, 0); p.scale.set(1, 0.72, 1); p.castShadow = true;
      malha(m, new T.TorusGeometry(0.058, 0.009, 6, 24), liso(0xfff6d8, 0.6), 0, 0.01, 0).rotation.x = Math.PI / 2;
      malha(m, new T.SphereGeometry(0.03, 10, 8), liso(0xffffff, 0.9), 0, 0.045, 0).scale.set(1.5, 0.3, 1.5);
    }, iconeDePao('#d9a25a', 1, true));
    // Na geladeira da casa azul, uma garrafa de água; e a xícara de café, que só existe depois que
    // a água e o pó de café passam pela cafeteira (desafio 6).
    const garrafa = novo(10, { nome: 'água', alt: AGUA.alt, raio: AGUA.raio, geo: AGUA.geo, casca: AGUA.casca }, mat(0xa9d6ff, { roughness: 0.06, envMapIntensity: 1.3 }));
    malha(garrafa.malha, new T.CylinderGeometry(0.0535, 0.0535, 0.085, 32, 1, true), liso(0x1f6fd1, 0.6), 0, -0.055, 0).castShadow = true;   // o rótulo e a tampa
    malha(garrafa.malha, new T.CylinderGeometry(0.024, 0.024, 0.03, 20), liso(0x1f6fd1, 0.4), 0, 0.135, 0).castShadow = true;
    assentar(salas[10], garrafa, 21.95 - 0.15, casaAzul.ZS + casaAzul.movel.prof - 0.2, casaAzul.movel.Y1 + 0.007 + garrafa.alt / 2);
    garrafa.icone = (g, x, y, s) => {
      traco(g); g.fillStyle = '#a9d6ff';
      g.beginPath(); g.rect(x - s * 0.14, y - s * 0.2, s * 0.28, s * 0.62); g.fill(); g.stroke();
      g.beginPath(); g.rect(x - s * 0.07, y - s * 0.4, s * 0.14, s * 0.2); g.fill(); g.stroke();
      g.fillStyle = '#1f6fd1'; g.fillRect(x - s * 0.14 + 3, y, s * 0.28 - 6, s * 0.18);
    };
    garrafa.paraOCafe = true;
    garrafa.fechado = true;
    casaAzul.geladeira.dentro.push(garrafa);
    const cafe = vila.cafe = novo(10, { nome: 'café', alt: 0.08, raio: 0.07, geo: new T.CylinderGeometry(0.042, 0.03, 0.07, 20).translate(0, -0.005, 0), casca: new T.CylinderGeometry(0.075, 0.075, 0.13, 20) }, louca2);
    malha(cafe.malha, new T.CylinderGeometry(0.037, 0.037, 0.006, 20), liso(0x2b160c, 0.2), 0, 0.029, 0);              // o café
    malha(cafe.malha, new T.TorusGeometry(0.022, 0.006, 6, 16), louca2, 0.05, -0.002, 0);                              // a asa
    malha(cafe.malha, new T.CylinderGeometry(0.065, 0.065, 0.008, 24), louca2, 0, -0.036, 0);                          // o pires
    assentar(salas[10], cafe, 20.62, casaAzul.ZS + 0.36, 0.92 + cafe.alt / 2);
    cafe.icone = (g, x, y, s) => {
      traco(g);
      g.fillStyle = '#f7f7f4'; g.beginPath(); g.ellipse(x, y + s * 0.3, s * 0.42, s * 0.09, 0, 0, 7); g.fill(); g.stroke();   // o pires
      g.beginPath(); g.moveTo(x - s * 0.26, y - s * 0.2); g.lineTo(x + s * 0.26, y - s * 0.2); g.lineTo(x + s * 0.18, y + s * 0.26); g.lineTo(x - s * 0.18, y + s * 0.26); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.arc(x + s * 0.3, y + s * 0.02, s * 0.1, -1.3, 1.3); g.stroke();                                // a asa
      g.fillStyle = '#2b160c'; g.beginPath(); g.ellipse(x, y - s * 0.2, s * 0.25, s * 0.06, 0, 0, 7); g.fill();
    };
    cafe.fechado = true;
    cafe.malha.visible = false;
    // a massa: a tigela cheia. Fica no lugar da tigela, escondida, até os três ingredientes estarem nela.
    const massa = vila.massa = novo(3, { nome: 'massa', alt: 0.11, raio: 0.15, geo: perfil, casca: cascaDaTigela }, ceramica);
    malha(massa.malha, new T.CylinderGeometry(0.128, 0.118, 0.02, 32), liso(0x6b3d1e, 0.6), 0, 0.03, 0);
    assentar(salas[3], massa, TX, TZ, TY + massa.alt / 2);
    massa.icone = iconeDeMassa;
    massa.fechado = true;
    massa.malha.visible = false;
    // o bolo: só existe depois que a massa passa pelo forno (ver usarNaVila)
    const bolo = vila.bolo = novo(3, { nome: 'bolo', alt: 0.13, raio: 0.14, geo: new T.CylinderGeometry(0.11, 0.115, 0.09, 32), casca: new T.CylinderGeometry(0.17, 0.17, 0.19, 24) }, liso(0x7a4a2a, 0.8));
    malha(bolo.malha, new T.CylinderGeometry(0.145, 0.13, 0.014, 32), louca, 0, -0.052, 0);                // o prato
    malha(bolo.malha, new T.CylinderGeometry(0.114, 0.114, 0.018, 32), liso(0xf7d9e3, 0.5), 0, 0.052, 0);  // a cobertura
    malha(bolo.malha, new T.SphereGeometry(0.02, 12, 10), liso(0xc8372d, 0.4), 0, 0.075, 0);               // a cereja
    bolo.fechado = true;
    // ...e o bolo queimado, que é o que sai do forno se a massa passar do tempo
    const queimado = vila.queimado = novo(3, { nome: 'bolo queimado', alt: 0.13, raio: 0.14, geo: new T.CylinderGeometry(0.105, 0.11, 0.08, 32), casca: new T.CylinderGeometry(0.17, 0.17, 0.19, 24) }, liso(0x1a1512, 1));
    malha(queimado.malha, new T.CylinderGeometry(0.145, 0.13, 0.014, 32), louca, 0, -0.052, 0);
    queimado.fechado = true;
    bolo.icone = iconeDeBolo('#7a4a2a', '#f7d9e3', '#c8372d');
    queimado.icone = iconeDeBolo('#1a1512', null, null);
    // o que a pessoa deste desafio quer: entregar tudo a ela é a vitória (a ordem é a das falas de "falta": ver DESAFIOS)
    vila.pedidos = DESAFIO === 5 ? [analgesico, copoCheio] : DESAFIO === 6 ? [paoDeQueijo, cafe] : [bolo];
    for (const p of vila.pessoas) p.pedidos = p.casa === 2 ? [analgesico, copoCheio] : p.casa === 3 ? [paoDeQueijo, cafe] : [bolo];
    // (Com qual dos dois cada casa começa, e qual das três pede primeiro, é o sorteio da partida que diz: ver sortear. Abaixo, a ordem de quando não há sorteio.)
    // No coletivo, os pedidos de cada casa se revezam. A casa 1 começa sem luz (é preciso ir à hidrelétrica
    // ligar a chave geral, e voltar para contar) e depois quer o bolo; a casa 3 começa querendo água da
    // cachoeira (o garrafão do deque, cheio na bica de lá) e depois o pão de queijo com café; a casa 2 só tem o dela.
    for (const p of vila.pessoas) {
      const dela = { pedidos: p.pedidos, falas: p.falas };
      p.rodizio = p.casa === 1 ? [{ pedidos: [], falas: { pedido: 'Estou sem luz', agradecimento: 'Obrigado! A luz voltou!', recusa: 'Preciso de luz!', queimado: 'Preciso de luz!' },
        tarefa: () => vila.chave.ligada, aoAbrir() { vila.chave.ligada = false; vila.chave.mostrar(); } }, dela]
        : p.casa === 3 ? [{ pedidos: [jarroCheio], falas: { pedido: 'Quero água fresca da cachoeira', agradecimento: 'Obrigado! Que água boa!', recusa: 'Não é isso!', queimado: 'Não é isso!' } }, dela] : [dela];
    }
    // (no coletivo: o que é do pedido de cada casa, e que volta para o lugar quando ela pede de novo: ver reporMissao)
    const todos = Object.values(salas).flatMap(s => s.objetos);
    vila.missoes = { 1: todos.filter(o => o.ingrediente || o === massa || o === bolo || o === queimado), 2: [analgesico, vila.copo, copoCheio], 3: todos.filter(o => o.paraOCafe || o === paoDeQueijo || o === cafe || o === jarro || o === jarroCheio) };
    // o número de cada casa, numa plaquinha ao lado da porta (a central de pedidos chama as casas pelo número)
    const numeroDaCasa = (n, x, z, giro) => {
      const p = new T.Group();
      p.position.set(x, 1.72, z); p.rotation.y = giro;
      g.add(p);
      malha(p, caixaSuave(0.3, 0.3, 0.03, 0.012), liso(0x1f2a44, 0.5), 0, 0, 0);
      malha(p, new T.PlaneGeometry(0.25, 0.25), mat(0xffffff, { roughness: 0.6, map: texturaCanvas(128, 128, (c, l) => { c.fillStyle = '#f7f3e6'; c.fillRect(0, 0, l, l); letras(c, String(n), l / 2, l / 2 + 6, 104, '#1f2a44', l); }) }), 0, 0, 0.017);
    };
    numeroDaCasa(1, 6.98, 4.11, 0); numeroDaCasa(2, 16.14, -1.22, -Math.PI / 2); numeroDaCasa(3, 22.05, 4.11, 0);

    fazSombra(g);
    for (const m of semSombra.concat(vidros)) m.castShadow = false;
  }

  // Põe um objeto em cima da cabeça do robô. Ali ele só aparece no reflexo (camada 1, como
  // o corpo): em primeira pessoa não dá para ver o que está na própria cabeça.
  function porNaCabeca(o) {
    robo.add(o.malha);
    o.malha.position.set(-0.06, 1.18 + o.alt / 2, 0);   // ao lado da antena
    o.malha.rotation.set(0, 0, 0);
    o.malha.traverse(m => m.layers.set(1));
    o.sombra.visible = false;
    o.naCabeca = true;
    estado.naCabeca = o;
  }

  // leve tom de vidro por cima do reflexo (fora de `raiz`: não se reflete)
  const vidro = new T.Mesh(
    new T.PlaneGeometry(1e5, SALA.A),
    new T.MeshBasicMaterial({ color: 0x7fa3ad, transparent: true, opacity: 0.07, depthWrite: false }));
  vidro.position.set(0, SALA.A / 2, Z_ESPELHO);
  cena.add(vidro);

  // ---------- contador ----------
  // Um "N/M" sem legenda no alto da tela: quantos objetos da sala já estão na cesta. Fica
  // preso à câmera e é desenhado dentro do próprio canvas, então sai igual no frame que a
  // iA recebe. O jogo não diz o que ele conta. (O desafio 3 não tem contador.)
  const contador = { canvas: document.createElement('canvas'), texto: null };
  contador.canvas.width = 264; contador.canvas.height = 120;
  contador.textura = new T.CanvasTexture(contador.canvas);
  contador.textura.colorSpace = T.SRGBColorSpace;
  contador.malha = new T.Mesh(new T.PlaneGeometry(1, 1),
    luminoso({ map: contador.textura, transparent: true, depthTest: false, depthWrite: false }));
  contador.malha.renderOrder = 999;             // por cima de tudo
  contador.malha.layers.set(2);                 // camada 2 = só no desenho do mundo real, nunca no reflexo
  camera.add(contador.malha);
  cena.add(camera);

  function desenharContador(texto) {
    if (texto === contador.texto) return;
    contador.texto = texto;
    const c = contador.canvas, g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(10, 14, 18, 0.72)';
    g.beginPath();
    if (g.roundRect) g.roundRect(0, 0, c.width, c.height, 22); else g.rect(0, 0, c.width, c.height);
    g.fill();
    g.fillStyle = '#ffffff'; g.font = 'bold 78px Consolas, "Courier New", monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(texto, c.width / 2, c.height / 2 + 5, c.width - 30);
    contador.textura.needsUpdate = true;
  }

  // Faixa de vitória: aparece no meio da tela (e do frame) quando o jogo é vencido.
  const faixa = new T.Mesh(new T.PlaneGeometry(1, 1), luminoso({
    transparent: true, depthTest: false, depthWrite: false,
    map: texturaCanvas(1024, 256, (g, l, a) => {
      g.fillStyle = 'rgba(20, 120, 62, 0.93)';
      g.beginPath();
      if (g.roundRect) g.roundRect(0, 0, l, a, 36); else g.rect(0, 0, l, a);
      g.fill();
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 104px Arial, sans-serif'; g.fillText('PARABÉNS!', l / 2, 92);
      g.font = 'bold 60px Arial, sans-serif'; g.fillText('VOCÊ CONSEGUIU!', l / 2, 190);
    }),
  }));
  faixa.renderOrder = 1000;
  faixa.layers.set(2);
  faixa.visible = false;
  camera.add(faixa);
  // Faixa de derrota (desafio 4): o bolo queimou, e é preciso começar de novo.
  const faixaDaDerrota = new T.Mesh(new T.PlaneGeometry(1, 1), luminoso({
    transparent: true, depthTest: false, depthWrite: false,
    map: texturaCanvas(1024, 256, (g, l, a) => {
      g.fillStyle = 'rgba(170, 40, 34, 0.93)';
      g.beginPath();
      if (g.roundRect) g.roundRect(0, 0, l, a, 36); else g.rect(0, 0, l, a);
      g.fill();
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 96px Arial, sans-serif'; g.fillText('O BOLO QUEIMOU!', l / 2, 92, l - 60);
      g.font = 'bold 56px Arial, sans-serif'; g.fillText('COMECE DE NOVO', l / 2, 190);
    }),
  }));
  faixaDaDerrota.renderOrder = 1000;
  faixaDaDerrota.layers.set(2);
  faixaDaDerrota.visible = false;
  camera.add(faixaDaDerrota);

  // O inventário (desafio 4): quatro casas no alto da tela, cada uma com o nome do item que o
  // robô carrega; a do item que está na mão fica clara, com borda azul. Como o contador, fica
  // preso à câmera e é desenhado dentro do próprio canvas: sai igual na imagem que a iA recebe.
  const inventario = { canvas: document.createElement('canvas'), texto: null };
  inventario.canvas.width = 1200; inventario.canvas.height = 300;
  inventario.textura = new T.CanvasTexture(inventario.canvas);
  inventario.textura.colorSpace = T.SRGBColorSpace;
  inventario.malha = new T.Mesh(new T.PlaneGeometry(1, 1), luminoso({ map: inventario.textura, transparent: true, depthTest: false, depthWrite: false }));
  inventario.malha.renderOrder = 999;
  inventario.malha.layers.set(2);
  inventario.malha.visible = false;
  camera.add(inventario.malha);
  function desenharInventario() {
    const texto = itens.map(o => (o === estado.segurando ? '*' : '') + o.nome).join('|');
    if (texto === inventario.texto) return;
    inventario.texto = texto;
    // Em cada casa, o desenho do objeto (cada objeto da vila traz o seu: ver `icone` em criarVila) e o nome embaixo.
    const c = inventario.canvas, g = c.getContext('2d'), n = REGRAS.inventario, vao = 14, larg = (c.width - vao * (n - 1)) / n;
    g.clearRect(0, 0, c.width, c.height);
    for (let i = 0; i < n; i++) {
      const o = itens[i], x = i * (larg + vao), naMao = o && o === estado.segurando;
      g.beginPath();
      if (g.roundRect) g.roundRect(x + 6, 6, larg - 12, c.height - 12, 26); else g.rect(x + 6, 6, larg - 12, c.height - 12);
      g.fillStyle = naMao ? 'rgba(30, 52, 62, 0.92)' : 'rgba(10, 14, 18, 0.74)';
      g.fill();
      g.lineWidth = naMao ? 12 : 4; g.strokeStyle = naMao ? '#00e5ff' : o ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.22)';
      g.stroke();
      if (!o) continue;
      g.save();
      g.lineJoin = g.lineCap = 'round';
      if (o.icone) o.icone(g, x + larg / 2, 112, 168);
      g.restore();
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = naMao ? '#ffffff' : '#dfe8ee'; g.font = 'bold 50px Arial, sans-serif';
      g.fillText(o.nome, x + larg / 2, 246, larg - 40);
    }
    inventario.textura.needsUpdate = true;
  }

  // ---------- balão de fala ----------
  // O que a pessoa diz aparece num balão ao lado do rosto dela, sempre de frente para a
  // câmera. É desenhado só no mundo real (camada 2), por cima de tudo: não é um objeto da
  // sala, então não aparece no espelho nem fica escondido atrás dos móveis.
  const BALAO = { l: 560, a: 240, ponta: 40 };  // tamanho do desenho e o x da ponta do rabicho
  const texBalao = {};
  // lado: -1 = rabicho no canto de baixo à esquerda (o balão fica à direita do rosto); +1 = o contrário
  function texturaDoBalao(texto, lado) {
    const chave = texto + lado;
    return texBalao[chave] || (texBalao[chave] = texturaCanvas(BALAO.l, BALAO.a, (g, l, a) => {
      const x = v => lado < 0 ? v : l - v, fundo = a - 62;
      g.lineJoin = 'round';
      g.beginPath();
      if (g.roundRect) g.roundRect(5, 5, l - 10, fundo - 5, 44); else g.rect(5, 5, l - 10, fundo - 5);
      g.moveTo(x(96), fundo - 4); g.lineTo(x(BALAO.ponta), a - 5); g.lineTo(x(170), fundo - 4);
      g.fillStyle = '#ffffff'; g.strokeStyle = '#20262c'; g.lineWidth = 8;
      g.stroke(); g.fill();                     // o preenchimento por cima apaga o traço entre o balão e o rabicho
      g.fillStyle = '#14181c'; g.font = 'bold 60px Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(texto, l / 2, fundo / 2 + 6, l - 60);
    }));
  }
  const balao = new T.Sprite(new T.SpriteMaterial({ map: texturaDoBalao(FALAS.pedido, -1), transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  balao.scale.set(0.84, 0.84 * BALAO.a / BALAO.l, 1);
  balao.renderOrder = 998;
  balao.layers.set(2);
  balao.layers.enable(3);                       // camada 3 = o que a câmera de quem assiste também vê (ver "o modo voador")
  balao.visible = false;
  cena.add(balao);
  // Põe o balão ao lado do rosto, do lado que fica mais para o meio da tela, e o esconde
  // quando a pessoa não disse nada ou há uma parede entre ela e a câmera. A câmera é a do
  // robô; no modo voador, a de quem assiste (e volta a ser a do robô antes de cada imagem da iA).
  function atualizarBalao(cam) {
    const camera = cam || olhos, gente = vila.pessoas.length ? vila.pessoas : pessoa ? [pessoa] : [];
    gente.forEach((p, i) => porBalaoDaPessoa(p, i ? p.balao || (p.balao = maisUmBalao()) : balao, camera));   // (um balão para cada pessoa: no coletivo são três)
    if (!gente.length) balao.visible = false;
    if (COLETIVO) porBaloesDoColetivo(camera);
  }
  const maisUmBalao = () => {
    const b = new T.Sprite(balao.material.clone());
    b.scale.copy(balao.scale);
    b.renderOrder = 998;
    b.layers.set(2);
    b.layers.enable(3);
    b.visible = false;
    cena.add(b);
    return b;
  };
  // No coletivo: o balão de fala de cada robô, em cima da cabeça dele enquanto vale (ver falaVale), e o da central de pedidos.
  // O balão fica em cima da cabeça de quem fala. Mas cada câmera o vê no lugar e no tamanho em que
  // ele cabe inteiro na imagem dela: para quem está perto, ele desce e encolhe (senão ficava acima
  // do que o robô enxerga, e a fala passava em branco), e vem um pouco para a frente do corpo de quem fala.
  function porBaloesDoColetivo(camera) {
    const meia = Math.tan(camera.fov * Math.PI / 360), formato = camera === olhos ? FRAME.l / FRAME.a : camera.aspect;
    const subida = Math.tan(Math.max(-1.4, Math.min(1.4, camera.rotation.x + camera.fov * Math.PI / 360)));   // (quanto o alto da imagem sobe a cada metro de distância)
    for (const r of robos) {
      const vale = falaVale(r), s = r.balao.sprite;
      s.visible = vale;
      if (!vale) continue;
      const dx = camera.position.x - r.visual.x, dz = camera.position.z - r.visual.z, longe = Math.hypot(dx, dz) || 1e-6, d = Math.max(0.3, longe - 0.3);
      const larg = Math.max(0.45, Math.min(1.7, 0.62 * 2 * d * meia * formato)), alt = larg * r.balao.tela.height / r.balao.tela.width;
      const topo = camera.position.y + d * subida - 0.08 * d * meia;   // o alto da imagem, na distância de quem fala, com uma folga
      s.scale.set(larg, alt, 1);
      s.position.set(r.visual.x + dx / longe * 0.3, Math.max(0.8 + r.visual.chao, Math.min(1.45 + r.visual.chao, topo - alt)), r.visual.z + dz / longe * 0.3);
    }
    const c = vila.central, fala = !!c.fala && hora() <= c.falaAte;
    if (!c.balao) { c.balao = maisUmBalao(); c.balao.scale.set(1.5, 1.5 * BALAO.a / BALAO.l, 1); c.balao.center.set(BALAO.ponta / BALAO.l, 5 / BALAO.a); c.balao.position.set(c.x, 2.0, c.z); }
    c.balao.visible = fala;
    if (fala) c.balao.material.map = texturaDoBalao(c.fala, -1);
  }
  function porBalaoDaPessoa(pessoa, balao, camera) {
    balao.visible = false;
    if (!pessoa.fala || (COLETIVO && hora() > pessoa.falaAte)) return;
    const cx = camera.position.x, cz = camera.position.z, r = pessoa.rosto, parede = centro(pessoa.sala) + SALA.L / 2;
    if (REGRAS.vila) {                                      // na vila: só de dentro do cômodo dela, ou de um dos vãos dele
      // (a câmera de quem voa pode estar fora de todos os lugares, ou acima do telhado: aí também não se vê o balão)
      const onde = Object.values(areas).find(a => cabeNoLugar(a, cx, cz, 0));
      if (camera.position.y > SALA.A) return;
      if ((!onde || onde.n !== pessoa.sala) && !portasDaVila.some(p => p.aberta && p.salas.includes(pessoa.sala) && noVaoDe(p, cx, cz))) return;
    } else if ((cx - parede) * (r.x - parede) < 0) {        // câmera na outra sala: só pela porta aberta
      const z = cz + (r.z - cz) * (parede - cx) / (r.x - cx);
      if (!portaAberta || Math.abs(z - Z_PORTA) > LARGURA_PORTA / 2 - 0.1) return;
    }
    const yaw = camera.rotation.y, dx = Math.cos(yaw), dz = -Math.sin(yaw);   // a direita da câmera
    const lado = (r.x - cx) * dx + (r.z - cz) * dz > 0 ? -1 : 1;              // pessoa à direita do meio: balão à esquerda dela
    balao.material.map = texturaDoBalao(pessoa.fala, -lado);
    balao.center.set(lado > 0 ? BALAO.ponta / BALAO.l : 1 - BALAO.ponta / BALAO.l, 5 / BALAO.a);
    balao.position.set(r.x + dx * lado * 0.14, 1.1, r.z + dz * lado * 0.14);
    balao.visible = true;
  }

  // ---------- robôs ----------
  // Monta um robô, olhando para -z. O do jogador e o outro robô (desafio 2) são idênticos.
  // Devolve o grupo com as peças, o braço direito (que gira no ombro) e `escrever`, que põe
  // um texto na tela do peito. Com `comBorda`, devolve também `contorno`: a borda de
  // destaque, feita de uma casca um pouco maior em volta de cada peça grande.
  function montarRobo(comBorda, cor) {              // (cor: a do cinto, das mãos e da antena, para distinguir os robôs do coletivo)
    const grupo = new T.Group(), braco = new T.Group(), cascas = [];
    const claro = mat(0xe6eaee, { roughness: 0.32 }), escuro = mat(0x2c333b, { roughness: 0.4 }), laranja = mat(cor || 0xff8a3d, { roughness: 0.4 });
    const BORDA = 0.022;
    const caixa = (pai, l, a, p, material, x, y, z, naBorda) => {
      malha(pai, caixaSuave(l, a, p, Math.min(0.025, Math.min(l, a, p) / 4)), material, x, y, z);
      if (comBorda && naBorda) cascas.push(malha(pai, caixaSuave(l + 2 * BORDA, a + 2 * BORDA, p + 2 * BORDA, 0.03), M.contorno, x, y, z));
    };
    const mao = (pai, x, y) => {
      malha(pai, new T.SphereGeometry(0.065, 16, 12), laranja, x, y, 0);
      if (comBorda) cascas.push(malha(pai, new T.SphereGeometry(0.065 + BORDA, 16, 12), M.contorno, x, y, 0));
    };

    caixa(grupo, 0.46, 0.2, 0.4, escuro, 0, 0.1, 0, true);                        // base
    caixa(grupo, 0.5, 0.56, 0.32, claro, 0, 0.5, 0, true);                        // tronco
    caixa(grupo, 0.52, 0.06, 0.34, laranja, 0, 0.25, 0);                          // cinto
    malha(grupo, new T.CylinderGeometry(0.07, 0.07, 0.08, 20), escuro, 0, 0.82, 0);
    caixa(grupo, 0.42, 0.32, 0.36, claro, 0, 1.02, 0, true);                      // cabeça
    caixa(grupo, 0.34, 0.15, 0.02, escuro, 0, 1.04, -0.18);                       // visor
    const olho = luminoso({ color: 0x4fe3ff });
    for (const x of [-0.085, 0.085])
      malha(grupo, new T.CircleGeometry(0.042, 24), olho, x, 1.04, -0.192).rotation.y = Math.PI;
    // antena só de um lado: o robô não é simétrico
    malha(grupo, new T.CylinderGeometry(0.012, 0.012, 0.2, 8), escuro, 0.12, 1.28, 0);
    malha(grupo, new T.SphereGeometry(0.035, 16, 12), laranja, 0.12, 1.4, 0);

    // tela do peito
    const tela = document.createElement('canvas');
    tela.width = 512; tela.height = 256;
    const textura = new T.CanvasTexture(tela);
    textura.colorSpace = T.SRGBColorSpace;
    textura.anisotropy = renderer.capabilities.getMaxAnisotropy();
    malha(grupo, new T.PlaneGeometry(0.4, 0.2), luminoso({ map: textura }), 0, 0.56, -0.162).rotation.y = Math.PI;
    const escrever = texto => {
      const g = tela.getContext('2d');
      g.fillStyle = '#06120c'; g.fillRect(0, 0, tela.width, tela.height);
      g.strokeStyle = '#2a6b48'; g.lineWidth = 10; g.strokeRect(5, 5, tela.width - 10, tela.height - 10);
      g.fillStyle = '#5dffa0'; g.font = 'bold 76px Consolas, "Courier New", monospace';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(texto, tela.width / 2, tela.height / 2 + 4, tela.width - 40);
      textura.needsUpdate = true;
    };
    escrever('');

    // braços (o direito levanta para segurar objetos)
    caixa(grupo, 0.1, 0.46, 0.1, claro, -0.31, 0.5, 0, true);
    mao(grupo, -0.31, 0.25);
    braco.position.set(0.31, 0.72, 0);
    grupo.add(braco);
    caixa(braco, 0.1, 0.46, 0.1, claro, 0, -0.22, 0, true);
    mao(braco, 0, -0.47);

    sombraNoChao(grupo, 0.4, 0.006);
    fazSombra(grupo);
    cascas.forEach(c => { c.visible = false; });
    return { grupo, braco, escrever, contorno: { set visible(v) { cascas.forEach(c => { c.visible = v; }); } } };
  }

  // ---------- pessoa (desafios 3 a 6 e o coletivo) ----------
  // Uma pessoa sentada numa poltrona, olhando para -z; a origem é o chão, no meio da poltrona.
  // Devolve o grupo, `contorno` (a borda de destaque em volta do corpo, não da poltrona) e
  // `animar`, que a mantém viva: ela respira, pisca, olha em volta — ou para quem chega perto
  // —, tamborila os dedos e bate o pé de vez em quando.
  // Com `mulher`, é a moradora do flat (desafio 5): de vestido, cabelo comprido, numa poltrona
  // clara, com o cotovelo esquerdo no braço da poltrona e a mão na testa, de dor de cabeça.
  // `camisa`: outra cor de blusa, para o morador de outra casa não ser igual.
  // Com `violeiro`, não há poltrona (ele senta num banco da praça): tem um violão no colo, que
  // dedilha sem parar, e um chapéu de palha.
  function montarPessoa(mulher, camisa, violeiro) {
    const grupo = new T.Group(), cascas = [], BORDA = 0.028, PARA_CIMA = new T.Vector3(0, 1, 0);
    const pele = mat(mulher ? 0xe2b393 : 0xd8a47f, { roughness: 0.6 }), cabelo = mat(mulher ? 0x5a2c1a : 0x2b1d15, { roughness: 0.8 }), escuro = mat(0x1c1512, { roughness: 0.4 });
    const blusa = mat(camisa || (mulher ? 0x8c2f4b : 0x2f4f7f), { roughness: 0.85 }), calca = mulher ? blusa : mat(0x4b5563, { roughness: 0.85 }), sapato = mat(mulher ? 0xc9a57a : 0x2a2320, { roughness: 0.45 });
    const tecido = mat(mulher ? 0xece4d6 : 0xa85a3c, { roughness: 0.95 }), brancoDoOlho = mat(0xffffff, { roughness: 0.3 });
    const V = (x, y, z) => new T.Vector3(x, y, z);
    // uma peça com a sua casca de destaque (a casca fica no mesmo pai: acompanha o que se mexe)
    const peca = (pai, geo, material, x, y, z, casca) => {
      const m = malha(pai, geo, material, x, y, z);
      if (casca) { m.userData.casca = malha(pai, casca, M.contorno, x, y, z); cascas.push(m.userData.casca); }
      return m;
    };
    // um membro arredondado, de um ponto ao outro
    const membro = (pai, de, ate, raio, material, naBorda) => {
      const comprimento = de.distanceTo(ate), meio = de.clone().add(ate).multiplyScalar(0.5), giro = new T.Quaternion().setFromUnitVectors(PARA_CIMA, ate.clone().sub(de).normalize());
      const m = peca(pai, new T.CapsuleGeometry(raio, comprimento, 6, 14), material, meio.x, meio.y, meio.z, naBorda && new T.CapsuleGeometry(raio + BORDA, comprimento, 6, 14));
      m.quaternion.copy(giro);
      if (m.userData.casca) m.userData.casca.quaternion.copy(giro);
      return m;
    };

    // poltrona: base, assento, encosto, braços e pés
    const almofada = (l, a, p, x, y, z, r) => malha(grupo, caixaSuave(l, a, p, r), tecido, x, y, z);
    if (!violeiro) {
      almofada(0.80, 0.30, 0.76, 0, 0.19, 0, 0.07);
      almofada(0.54, 0.14, 0.58, 0, 0.39, -0.06, 0.06);
      almofada(0.80, 0.72, 0.18, 0, 0.70, 0.29, 0.08);
      for (const x of [-0.335, 0.335]) almofada(0.13, 0.32, 0.64, x, 0.48, -0.06, 0.06);
      for (const x of [-0.33, 0.33]) for (const z of [-0.3, 0.3])
        malha(grupo, new T.CylinderGeometry(0.025, 0.02, 0.05, 12), mulher ? M.latao : M.nogueira, x, 0.025, z);
    }

    // pernas: as coxas no assento e as canelas para baixo; o pé esquerdo é o que bate de vez em quando
    const pes = [];
    for (const x of [-0.1, 0.1]) {
      if (violeiro && x > 0) {
        // a posição do violão flamenco: a perna direita cruzada por cima da esquerda, com o pé solto no ar; o bojo do violão descansa nessa coxa
        const joelho = V(-0.07, 0.66, -0.4), calcanhar = V(-0.3, 0.38, -0.5);
        membro(grupo, V(0.1, 0.56, 0.02), joelho, 0.075, calca, true);
        membro(grupo, joelho, calcanhar, 0.062, calca, true);
        malha(grupo, caixaSuave(0.12, 0.085, 0.26, 0.035), sapato, calcanhar.x - 0.06, calcanhar.y - 0.1, calcanhar.z - 0.05).rotation.set(0.6, 0.5, 0.9);
        continue;
      }
      membro(grupo, V(x, 0.53, 0.02), V(x, 0.53, -0.42), 0.075, calca, true);
      membro(grupo, V(x, 0.5, -0.455), V(x, 0.13, -0.455), mulher ? 0.05 : 0.062, mulher ? pele : calca, true);
      const tornozelo = new T.Group();
      tornozelo.position.set(x, 0.09, -0.42);
      grupo.add(tornozelo);
      malha(tornozelo, caixaSuave(mulher ? 0.1 : 0.12, 0.085, 0.26, 0.035), sapato, 0, -0.045, -0.08);
      pes.push(tornozelo);
    }
    if (mulher) malha(grupo, caixaSuave(0.42, 0.12, 0.5, 0.05), calca, 0, 0.6, -0.2);        // a saia do vestido, por cima das coxas
    // tronco (que respira), ombros e pescoço
    const peito = peca(grupo, caixaSuave(0.36, 0.5, 0.21, 0.09), blusa, 0, 0.75, 0.06, caixaSuave(0.36 + 2 * BORDA, 0.5 + 2 * BORDA, 0.21 + 2 * BORDA, 0.09 + BORDA * 0.6));
    for (const lado of [-1, 1]) malha(grupo, new T.SphereGeometry(0.076, 16, 12), blusa, lado * 0.19, 0.93, 0.06);
    malha(grupo, new T.CylinderGeometry(0.048, 0.056, 0.1, 16), pele, 0, 1.035, 0.055);
    if (!mulher) for (const lado of [-1, 1]) malha(grupo, new T.BoxGeometry(0.07, 0.016, 0.05), mat(0xf4f2ec, { roughness: 0.6 }), lado * 0.045, 0.995, -0.03).rotation.set(0.5, lado * 0.5, lado * -0.5);   // a gola
    let maoDireita = null, antebraco = null, erguido = null, descansado = null, eixoDoDedilhado = null;
    if (!violeiro) {
      // braço direito: do ombro ao cotovelo, e o antebraço apoiado no braço da poltrona, com a mão que tamborila
      membro(grupo, V(0.215, 0.92, 0.06), V(0.3, 0.71, -0.02), 0.05, blusa, true);
      membro(grupo, V(0.3, 0.705, -0.04), V(0.3, 0.69, -0.24), 0.042, mulher ? pele : blusa, true);
      maoDireita = malha(grupo, new T.SphereGeometry(0.05, 16, 12), pele, 0.3, 0.69, -0.27);
      maoDireita.scale.set(1, 0.75, 1.15);
    }
    if (violeiro) {
      // O violão, apoiado na coxa da perna cruzada, com o braço dele bem levantado para a esquerda de
      // quem toca (a posição flamenca); a mão esquerda nas casas, lá no alto, e a direita sobre a
      // boca, com o antebraço descansando na borda do bojo. Esse antebraço balança no cotovelo: dedilha.
      const violao = new T.Group(), tampo = mat(0xd9a45c, { roughness: 0.45 }), jacaranda = mat(0x4a2c17, { roughness: 0.5 });
      violao.position.set(0.05, 0.84, -0.17); violao.rotation.z = -0.5;
      grupo.add(violao);
      for (const [x, r] of [[0.1, 0.19], [-0.12, 0.15]]) malha(violao, new T.CylinderGeometry(r, r, 0.09, 28), tampo, x, 0, 0).rotation.x = Math.PI / 2;   // o bojo
      malha(violao, new T.CylinderGeometry(0.05, 0.05, 0.093, 20), jacaranda, -0.01, 0, 0).rotation.x = Math.PI / 2;                                  // a boca
      malha(violao, new T.BoxGeometry(0.52, 0.045, 0.028), jacaranda, -0.5, 0, -0.02);                                                                // o braço
      malha(violao, new T.BoxGeometry(0.13, 0.07, 0.024), jacaranda, -0.82, 0, -0.02);                                                                // a mão, com as tarraxas
      malha(violao, new T.BoxGeometry(0.06, 0.03, 0.012), jacaranda, 0.16, 0, -0.05);                                                                 // o cavalete
      malha(violao, new T.BoxGeometry(0.92, 0.03, 0.004), mat(0xe8e2d0, { roughness: 0.3, metalness: 0.6 }), -0.3, 0, -0.05);                         // as cordas
      const cotoveloE = V(-0.41, 0.79, -0.04), maoE = V(-0.433, 1.09, -0.215);
      membro(grupo, V(-0.215, 0.92, 0.06), cotoveloE, 0.05, blusa, true);
      membro(grupo, cotoveloE, maoE, 0.042, blusa, true);
      malha(grupo, new T.SphereGeometry(0.05, 16, 12), pele, maoE.x, maoE.y, maoE.z);
      const cotoveloD = V(0.33, 0.95, -0.25), maoD = V(0.07, 0.83, -0.27), comprimento = maoD.distanceTo(cotoveloD);
      membro(grupo, V(0.215, 0.92, 0.06), cotoveloD, 0.05, blusa, true);
      antebraco = new T.Group();
      antebraco.position.copy(cotoveloD);
      grupo.add(antebraco);
      membro(antebraco, V(0, 0, 0), V(0, comprimento, 0), 0.042, blusa, true);
      malha(antebraco, new T.SphereGeometry(0.05, 16, 12), pele, 0, comprimento, 0);
      const ao = maoD.clone().sub(cotoveloD).normalize();
      erguido = new T.Quaternion().setFromUnitVectors(PARA_CIMA, ao);
      eixoDoDedilhado = ao.clone().cross(PARA_CIMA).normalize();                            // (em volta dele a mão sobe e desce sobre as cordas)
      antebraco.quaternion.copy(erguido);
    } else if (mulher) {
      // a dor de cabeça: o cotovelo esquerdo no braço da poltrona e a mão na testa, esfregando devagar.
      // O antebraço é um grupo com o eixo y ao longo dele: gira no cotovelo e, quando a dor passa,
      // deita no braço da poltrona (mais curto: erguido até a testa ele é esticado de propósito).
      const ombro = V(-0.215, 0.92, 0.06), cotovelo = V(-0.31, 0.7, -0.14), mao = V(-0.105, 1.2, -0.055);
      membro(grupo, ombro, cotovelo, 0.05, blusa, true);
      antebraco = new T.Group();
      antebraco.position.copy(cotovelo);
      grupo.add(antebraco);
      const comprimento = mao.distanceTo(cotovelo);
      membro(antebraco, V(0, 0, 0), V(0, comprimento, 0), 0.04, pele, true);
      malha(antebraco, new T.SphereGeometry(0.048, 16, 12), pele, 0, comprimento, 0);
      erguido = new T.Quaternion().setFromUnitVectors(PARA_CIMA, mao.clone().sub(cotovelo).normalize());
      descansado = new T.Quaternion().setFromUnitVectors(PARA_CIMA, V(0.03, -0.02, -1).normalize());
      antebraco.quaternion.copy(erguido);
    } else {
      membro(grupo, V(-0.215, 0.92, 0.06), V(-0.3, 0.71, -0.02), 0.05, blusa, true);
      membro(grupo, V(-0.3, 0.705, -0.04), V(-0.3, 0.69, -0.24), 0.042, blusa, true);
      malha(grupo, new T.SphereGeometry(0.05, 16, 12), pele, -0.3, 0.69, -0.27).scale.set(1, 0.75, 1.15);
    }
    // a cabeça, que vira: o rosto, as orelhas e o cabelo vão juntos
    const cabeca = new T.Group(), CY = 0.1, CZ = -0.005;                                       // (o meio da cabeça, nas medidas do grupo dela)
    cabeca.position.set(0, 1.07, 0.045);
    grupo.add(cabeca);
    const cranio = peca(cabeca, new T.SphereGeometry(0.115, 28, 20), pele, 0, CY, CZ, new T.SphereGeometry(0.115 + BORDA, 28, 20));
    cranio.scale.set(1, 1.07, 1.02); cranio.userData.casca.scale.copy(cranio.scale);
    for (const lado of [-1, 1]) malha(cabeca, new T.SphereGeometry(0.024, 12, 10), pele, lado * 0.112, CY - 0.008, CZ + 0.012).scale.set(0.6, 1, 0.8);   // orelhas
    malha(cabeca, new T.SphereGeometry(0.126, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.52), cabelo, 0, CY + 0.006, CZ + 0.006).rotation.x = 0.42;       // o cabelo: uma calota inclinada para trás
    const olhos = [];
    for (const lado of [-1, 1]) {
      const olho = new T.Group();
      olho.position.set(lado * 0.043, CY + 0.02, CZ - 0.101);
      cabeca.add(olho);
      malha(olho, new T.SphereGeometry(0.02, 14, 10), brancoDoOlho, 0, 0, 0).scale.set(1, 1, 0.5);
      malha(olho, new T.SphereGeometry(0.012, 12, 10), escuro, 0, 0, -0.008);
      olhos.push(olho);
      const sobrancelha = malha(cabeca, new T.BoxGeometry(0.042, 0.008, 0.01), cabelo, lado * 0.043, CY + 0.054, CZ - 0.103);
      sobrancelha.rotation.z = mulher ? lado * -0.28 : lado * 0.06;                            // (as dela, erguidas no meio: está com dor)
    }
    malha(cabeca, new T.SphereGeometry(0.017, 12, 10), pele, 0, CY - 0.012, CZ - 0.113);       // nariz
    const corDaBoca = mat(mulher ? 0xb3263a : 0x8a3b32, { roughness: 0.6 });
    const bocaSeria = malha(cabeca, new T.BoxGeometry(0.046, 0.01, 0.01), corDaBoca, 0, CY - 0.052, CZ - 0.1);
    const sorriso = malha(cabeca, new T.TorusGeometry(0.024, 0.0055, 6, 14, Math.PI), corDaBoca, 0, CY - 0.04, CZ - 0.101);
    sorriso.rotation.z = Math.PI;                                                              // o arco para baixo: um sorriso
    sorriso.visible = false;
    if (violeiro) {                                                                            // o chapéu de palha
      const palha = mat(0xe3c98a, { roughness: 0.9 });
      malha(cabeca, new T.CylinderGeometry(0.21, 0.22, 0.014, 28), palha, 0, CY + 0.085, CZ);
      malha(cabeca, new T.CylinderGeometry(0.105, 0.12, 0.1, 24), palha, 0, CY + 0.135, CZ);
      malha(cabeca, new T.CylinderGeometry(0.122, 0.122, 0.022, 24), mat(0x5a3b22, { roughness: 0.7 }), 0, CY + 0.103, CZ);
    }
    if (mulher) {
      // o cabelo comprido: atrás, até os ombros, e uma mecha de cada lado; e os brincos
      malha(cabeca, caixaSuave(0.25, 0.4, 0.1, 0.045), cabelo, 0, CY - 0.16, CZ + 0.1);
      for (const lado of [-1, 1]) {
        malha(cabeca, caixaSuave(0.06, 0.32, 0.12, 0.028), cabelo, lado * 0.118, CY - 0.12, CZ + 0.045);
        malha(cabeca, new T.SphereGeometry(0.014, 10, 8), M.latao, lado * 0.121, CY - 0.05, CZ - 0.02);
      }
    }

    sombraNoChao(grupo, 0.6, 0.006);
    fazSombra(grupo);
    cascas.forEach(c => { c.visible = false; });
    // t: o tempo, em segundos; perto: onde está quem chegou perto, medido a partir do rosto dela
    // ({ x, z }, ou null); feliz: já recebeu o que queria (sorri, e a mão para de tamborilar).
    const fase = Math.random() * 20;
    const esfrega = new T.Quaternion(), giroDaEsfrega = new T.Euler();
    let olhar = 0, alivio = 0, antes = null;
    const animar = (t, perto, feliz) => {
      const k = 1 - Math.exp(-Math.min(0.1, antes === null ? 0 : Math.max(0, t - antes)) * 4.5);   // (o tanto que o que é devagar anda neste quadro)
      antes = t;
      alivio += ((feliz ? 1 : 0) - alivio) * k * 0.6;                                         // a dor de cabeça que passa aos poucos
      const ar = Math.sin(t * 1.5 + fase);                                                     // respira
      peito.scale.set(1 + 0.008 * ar, 1 + 0.012 * ar, 1 + 0.022 * ar);
      peito.userData.casca.scale.copy(peito.scale);
      cabeca.position.y = 1.07 + 0.004 * ar;
      // olha em volta, devagar; se alguém chega perto, olha para ele
      const quer = perto ? Math.max(-0.95, Math.min(0.95, Math.atan2(-perto.x, -perto.z))) : 0.24 * Math.sin(t * 0.37 + fase);
      olhar += (quer - olhar) * k;
      const dor = mulher ? 1 - alivio : 0;                                                     // (com a mão na testa, a cabeça fica baixa e quase não vira)
      cabeca.rotation.set(0.04 * Math.sin(t * 0.53 + fase) + 0.12 * dor - (violeiro ? 0.1 : 0), olhar * (1 - 0.65 * dor), 0.1 * dor + (violeiro ? 0.07 * Math.sin(t * Math.PI / 0.8) : 0));   // (o violeiro balança a cabeça com a música)
      const aberto = (t + fase) % 4.3 < 0.13 ? 0.12 : 1;                                       // pisca
      for (const olho of olhos) olho.scale.y = aberto;
      const dedos = !feliz && (t + fase * 2) % 9 < 1.4 ? Math.max(0, Math.sin(t * 14)) : 0;    // tamborila os dedos
      if (maoDireita) maoDireita.position.y = 0.69 + 0.016 * dedos;
      pes[0].rotation.x = violeiro ? 0.24 * Math.max(0, Math.sin(t * Math.PI / 0.4)) : (t + fase) % 13 < 2.2 ? 0.3 * Math.max(0, Math.sin(t * 9)) : 0;   // bate o pé (o violeiro, no compasso)
      if (eixoDoDedilhado) antebraco.quaternion.setFromAxisAngle(eixoDoDedilhado, 0.2 * Math.sin(t * Math.PI / 0.2)).multiply(erguido);      // dedilha
      else if (antebraco) {                                                                    // esfrega a testa; sem dor, o braço desce para a poltrona
        esfrega.setFromEuler(giroDaEsfrega.set(0.05 * Math.sin(t * 1.7) * dor, 0, 0.06 * Math.sin(t * 2.3) * dor));
        antebraco.quaternion.copy(erguido).slerp(descansado, alivio).multiply(esfrega);
        antebraco.scale.y = 1 - 0.55 * alivio;
      }
      sorriso.visible = !!feliz; bocaSeria.visible = !feliz;
    };
    return { grupo, animar, contorno: { set visible(v) { cascas.forEach(c => { c.visible = v; }); } } };
  }

  // O robô do jogador. Camada 1 = só aparece no reflexo: em primeira pessoa o jogador não
  // vê o próprio corpo, exceto o braço direito quando levantado (camadas 0 e 1).
  let eu = montarRobo(false);                   // (let: no coletivo, estes passam a ser os do robô da vez: ver encarnar)
  let robo = eu.grupo, bracoDireito = eu.braco;
  raiz.add(robo);
  robo.traverse(o => o.layers.set(1));
  bracoDireito.traverse(o => o.layers.enable(0));

  // ---------- estado ----------
  // `estado` é a verdade do jogo e muda na hora; `visual` só persegue o estado para animar.
  // rumo: múltiplos de 45°, 0 = de frente para o espelho; segurando / naCabeca: objeto ou null
  let estado = { x: REGRAS.inicio.x || 0, z: REGRAS.inicio.z, rumo: REGRAS.inicio.rumo, sala: REGRAS.inicio.sala || 1, segurando: null, naCabeca: null, maoLevantada: false, texto: '', ganhou: false, perdeu: false };
  // (luz, luzY, luzZ e forca: onde está a lâmpada, que acompanha o robô, e a força dela: ver luzDaqui)
  // (chao: a altura do chão debaixo do robô: na vila, a calçada é um degrau acima do asfalto: ver alturaDoChao)
  let visual = { x: estado.x, z: estado.z, yaw: estado.rumo * GIRO, braco: 0, luz: 0, luzY: SALA.A - 0.35, luzZ: 0, forca: 2.1, chao: 0 };
  // Onde fica a lâmpada (há uma só): no meio da sala em que o robô está. Na vila, cada lugar diz
  // onde (ver areas); na rua, onde quem ilumina é o sol, a lâmpada fica na casa ou na loja mais perto.
  const luzDaqui = () => {
    if (!REGRAS.vila) return { x: centro(estado.sala), y: SALA.A - 0.35, z: 0, forca: 2.1 };
    const l = areas[estado.sala].luz;
    return typeof l === 'function' ? l() : l;
  };
  let modoIA = false;

  function vetores() {
    const a = estado.rumo * GIRO;
    return { fx: -Math.sin(a), fz: -Math.cos(a) };
  }
  const limitar = (v, lim) => Math.max(-lim, Math.min(lim, v));
  const dentro = (n, x, z) =>                   // o robô cabe nesse ponto da sala n?
    Math.abs(x - centro(n)) <= SALA.L / 2 - MARGEM_PAREDE + 1e-9 && Math.abs(z) <= SALA.P / 2 - MARGEM_PAREDE + 1e-9;
  const noVao = z => Math.abs(z - Z_PORTA) <= 0.5 + 1e-9;

  // Onde o robô pode estar: na sala atual e, com a porta aberta, também no vão e na sala seguinte.
  function livre(x, z) {
    if (noMovel(x, z, RAIO_ROBO)) return false;
    if (REGRAS.vila) return livreNaVila(x, z);
    if (!portaAberta) return dentro(estado.sala, x, z);
    return dentro(portaAberta, x, z) || dentro(portaAberta + 1, x, z) ||
      (Math.abs(x - centro(portaAberta) - SALA.L / 2) <= MARGEM_PAREDE && noVao(z));
  }

  function abrirPorta(s) {
    if (!salas[s.n + 1]) criarSala(s.n + 1);
    s.porta.aberta = true;
    s.porta.luz.color.set(VERDE);
    portaAberta = s.n;
  }

  function fecharPorta() {
    const s = salas[portaAberta];
    s.porta.aberta = false;
    s.porta.luz.color.set(VERMELHO);
    portaAberta = 0;
    // O que ficou duas salas para trás não pode mais ser visto. (A parede some uma sala
    // depois do conteúdo, porque ainda é a parede esquerda da sala anterior.)
    const velha = salas[estado.sala - 2], maisVelha = salas[estado.sala - 3];
    if (velha) raiz.remove(velha.grupo);
    if (maisVelha) { raiz.remove(maisVelha.parede); delete salas[estado.sala - 3]; }
  }

  // Um objeto que não está no chão: na mão, na cabeça, na cesta, já entregue, dentro de um
  // móvel fechado ou guardado no inventário (desafio 4).
  const foraDoChao = o => o === estado.segurando || o.naCabeca || o.naCesta || o.entregue || o.fechado || o.guardado;
  // Tudo o que ocupa lugar no chão da sala `s`: objetos soltos, a cesta e o outro robô.
  // (Os móveis e a poltrona da pessoa são retângulos: ver blocos.)
  const noCaminho = s => [...s.objetos.filter(o => !foraDoChao(o)), s.cesta, s.outroRobo].filter(Boolean);

  // Põe um objeto na mão do robô. Ele passa a andar junto; a posição exata vem de aplicarVisual.
  function segurar(o) {
    estado.segurando = o;
    robo.add(o.malha);
    o.malha.rotation.set(0, 0, 0);
    o.malha.visible = true;
    o.guardado = false;
    o.sombra.visible = false;
    for (const m of abrem) if (m.dentro.includes(o)) m.dentro.splice(m.dentro.indexOf(o), 1);   // saiu de dentro do móvel: fechar a porta não o tranca mais
  }

  // ---------- o inventário (desafio 4) ----------
  // Na vila o robô carrega até REGRAS.inventario itens. Um deles está na mão (estado.segurando):
  // é o que o ESPACO entrega ou coloca em algum lugar, e o único que se vê. Os outros ficam
  // guardados. O botão L passa a mão para o item seguinte. O inventário aparece no alto da
  // imagem (ver desenharInventario), com o item da mão marcado.
  let itens = [];
  // Guarda o item que está na mão (ele continua no inventário, mas some de vista).
  function guardar(o) {
    o.guardado = true;
    o.malha.visible = false;
    if (estado.segurando === o) estado.segurando = null;
  }
  // O item sai do inventário (foi entregue, colocado em algum lugar ou solto), e a mão fica com o seguinte, se houver.
  function tirarDoInventario(o) {
    const i = itens.indexOf(o);
    if (i >= 0) itens.splice(i, 1);
    if (estado.segurando === o) estado.segurando = null;
    if (!estado.segurando && itens.length) segurar(itens[Math.min(i < 0 ? 0 : i, itens.length - 1)]);
  }
  function trocarItem() {
    if (itens.length < 2) return resposta('trocar', false, itens.length ? 'só há um item no inventário' : 'inventário vazio');
    const proximo = itens[(itens.indexOf(estado.segurando) + 1) % itens.length];
    if (estado.segurando) guardar(estado.segurando);
    segurar(proximo);
    return resposta('trocar', true, `na mão: ${proximo.nome}`);
  }

  // ---------- comandos ----------
  function mover(direcao) {
    // 'esquerda' e 'direita' são o passo de lado: o robô anda para o lado sem virar, e continua
    // olhando para onde olhava. Só existe no desafio 4 (REGRAS.passoDeLado): nos três primeiros
    // o robô só anda para onde está olhando, de propósito.
    if (estado.dirigindo) return carroManual ? dirigir(direcao) : resposta(`mover ${direcao}`, false, 'o carro anda sozinho: escolha um destino');   // dentro do carro, quem anda é ele
    // (na cidade, o passo para trás é como o de lado: o robô recua sem virar. Numa gravação de antes disso, ele dava meia-volta: ver reComMeiaVolta)
    const lado = REGRAS.passoDeLado ? { esquerda: 2, direita: -2, tras: reComMeiaVolta ? undefined : 4 }[direcao] : undefined, giro = lado === undefined ? GIRO_DA_DIRECAO[direcao] : 0;
    if (giro === undefined) return resposta(`mover ${direcao}`, false, 'direção inválida');
    escolhido = undefined;                      // mexeu-se: a escolha do alvo volta ao mais óbvio
    estado.rumo += giro;                        // vira mesmo que o passo acabe bloqueado
    const virou = giro ? ' (virou, mas não andou)' : '';
    const a = (estado.rumo + (lado || 0)) * GIRO, v = { fx: -Math.sin(a), fz: -Math.cos(a) };
    let nx = estado.x + v.fx * PASSO, nz = estado.z + v.fz * PASSO;
    if (!livre(nx, nz)) {                       // na diagonal contra uma parede, desliza ao longo dela
      if (Math.abs(v.fx) > 1e-6 && Math.abs(v.fz) > 1e-6 && livre(nx, estado.z)) nz = estado.z;
      else if (Math.abs(v.fx) > 1e-6 && Math.abs(v.fz) > 1e-6 && livre(estado.x, nz)) nx = estado.x;
      else {
        const lado = nx - centro(estado.sala), movel = noMovel(nx, nz, RAIO_ROBO);
        const naPorta = REGRAS.vila ? portasDaVila.some(p => !p.aberta && noVaoDe(p, nx, nz))
          : noVao(nz) && ((salas[estado.sala].porta && lado > SALA.L / 2 - MARGEM_PAREDE) || (estado.sala > 1 && lado < MARGEM_PAREDE - SALA.L / 2));
        return resposta(`mover ${direcao}`, false, (movel ? `bloqueado: ${movel.nome} no caminho` : naPorta ? 'bloqueado: porta fechada' : 'bloqueado: parede') + virou);
      }
    }
    for (const s of Object.values(salas)) for (const o of noCaminho(s)) {
      const depois = Math.hypot(nx - o.x, nz - o.z), antes = Math.hypot(estado.x - o.x, estado.z - o.z);
      if (depois < RAIO_ROBO + o.raio && depois < antes) return resposta(`mover ${direcao}`, false, `bloqueado: ${o.nome} no caminho` + virou);
    }
    for (const r of emJogo()) {                 // no coletivo, um robô não atravessa o outro
      const depois = Math.hypot(nx - r.estado.x, nz - r.estado.z);
      if (r !== atual && depois < 2 * RAIO_ROBO && depois < Math.hypot(estado.x - r.estado.x, estado.z - r.estado.z)) return resposta(`mover ${direcao}`, false, 'bloqueado: outro robô no caminho' + virou);
    }
    estado.x = nx; estado.z = nz;
    estado.sala = REGRAS.vila ? areaEm(nx, nz) : salaDe(nx);
    if (portaAberta && !REGRAS.portaManual && dentro(portaAberta + 1, nx, nz)) {   // entrou de vez na sala seguinte
      fecharPorta();
      return resposta(`mover ${direcao}`, true, `ok — você entrou na sala ${numero(estado.sala)} e a porta fechou atrás de você`);
    }
    return resposta(`mover ${direcao}`, true, 'ok');
  }

  function virar(lado) {
    if (lado !== 'esquerda' && lado !== 'direita') return resposta(`virar ${lado}`, false, 'lado inválido');
    if (estado.dirigindo && !carroManual) return resposta(`virar ${lado}`, false, 'o carro anda sozinho: escolha um destino');
    escolhido = undefined;
    estado.rumo += lado === 'esquerda' ? 1 : -1;
    if (estado.dirigindo) { estado.dirigindo.rumo = estado.rumo; estado.dirigindo.assentar(); }   // (o carro vira com quem dirige)
    return resposta(`virar ${lado}`, true, 'ok');
  }

  // Distância até algo que esteja ao alcance e à frente (±45°); Infinity se não estiver.
  function alcance(alvo) {
    const onde = alvo.ehCarro ? alvo.pontoMaisPerto(estado.x, estado.z) : alvo;   // (o carro é comprido: vale o ponto dele mais perto do robô)
    const v = vetores(), ox = onde.x - estado.x, oz = onde.z - estado.z, dist = Math.hypot(ox, oz);
    return dist <= ALCANCE && (ox * v.fx + oz * v.fz) / dist >= 0.69 ? dist : Infinity;
  }

  // Levanta ou abaixa a mão direita, com ou sem objeto nela. Com a mão no alto, pegar só
  // mexe com a cabeça; com a mão embaixo, só com o chão e a cesta. (No desafio 4 não há o que
  // fazer com a cabeça: lá o botão L troca o item que está na mão: ver trocarItem.)
  function levantar() {
    if (quebra) return girarNoQuebra();         // (no quebra-cabeça o L gira a peça; o alvo continua o mesmo, para girar de novo)
    escolhido = undefined;
    if (REGRAS.inventario) return trocarItem();
    estado.maoLevantada = !estado.maoLevantada;
    return resposta('levantar', true, estado.maoLevantada ? 'mão levantada' : 'mão abaixada');
  }

  // Tudo em que o ESPACO pode agir agora, na ordem de preferência. O primeiro é o alvo de
  // sempre, o que ele usa se o jogador não escolher; o botão TAB passa para os outros
  // (ver escolher). É o alvo que ganha a borda de destaque. `null` na lista quer dizer "em
  // nada": soltar no chão o que está na mão (ou, com a mão no alto, pôr na cabeça).
  //   segurando algo:       o outro robô, se estiver ao alcance (com a mão no alto ou embaixo)
  //   a pessoa ao alcance:  ela — para entregar o que está na mão ou, de mão vazia e embaixo, falar com ela
  //   porta ou móvel fechado, ao alcance: ele, para abrir (a porta, só a que o jogador abre)
  //   mão no alto:          vazia, o objeto que está na cabeça; cheia, "em nada"
  //   mão embaixo, cheia:   a cesta (na vila: a tigela, para um ingrediente; o forno, para a massa); depois, "em nada"
  //   mão embaixo, vazia:   os objetos ao alcance (do chão ou de um móvel aberto), do mais central na imagem para o mais de lado
  //   por último:           um móvel ou uma porta abertos, ao alcance, para fechar
  // A lista tem no máximo 9 alvos, e todos aparecem na imagem com o seu número (ver "os alvos à vista").
  // Na vila o robô carrega mais de um item: mesmo com a mão cheia os objetos ao alcance entram
  // na lista (antes do "em nada"), e só vale o que está no mesmo lugar que ele (ver "a vila").
  function candidatos() {
    if (quebra) return alvosDoQuebra();         // no quebra-cabeça: as peças ou, com uma na mão, as casas do quadro (ver "o quebra-cabeça")
    if (estado.dirigindo) {                     // dentro do carro: os destinos (menos o lugar em que ele está) e, por último, sair dele; andando, nada
      const c = estado.dirigindo;
      return carroManual ? [c] : c.viagem ? [] : [...DESTINOS.filter(d => d.id !== c.onde), c];
    }
    const aqui = estado.sala, s = salas[aqui], o = estado.segurando, lista = [];
    const perto = a => !!a && (!REGRAS.vila || (a.salas ? a.salas.includes(aqui) : a.sala === aqui)) && alcance(a) < Infinity;
    // Entre coisas do mesmo tipo, vem primeiro a que está mais no centro da imagem (ver centralidade).
    // (Nas gravações feitas antes disso valia a mais próxima do robô: ver ordemAntiga.)
    const maisPertoPrimeiro = coisas => coisas.filter(perto).sort(ordemAntiga ? (a, b) => alcance(a) - alcance(b) : (a, b) => centralidade(b) - centralidade(a));
    const soltosNaLista = [];
    const gente = REGRAS.vila ? vila.pessoas.find(p => p.sala === aqui) || null : s.pessoa;   // (na vila: quem mora no lugar em que o robô está)
    // As portas que o jogador abre e fecha: na vila, as das casas (a trancada não é alvo: é a da casa
    // de outro desafio); nas salas, a desta sala e a da sala anterior, que é a mesma porta vista do outro lado.
    const portas = REGRAS.vila ? portasDaVila.filter(p => p.folha && !p.trancada)
      : REGRAS.portaManual ? [s.porta, salas[aqui - 1] && salas[aqui - 1].porta].filter(Boolean) : [];
    if (!REGRAS.vila && o && s.outroRobo && !s.outroRobo.recebeu && perto(s.outroRobo)) lista.push(s.outroRobo);
    if (gente && (!gente.recebeu || COLETIVO) && (o || !estado.maoLevantada) && perto(gente)) lista.push(gente);
    if (COLETIVO && !estado.maoLevantada && perto(vila.central)) lista.push(vila.central);   // a central de pedidos, na praça
    lista.push(...maisPertoPrimeiro([...portas, ...abrem].filter(a => !a.aberta)));
    // Os objetos soltos ao alcance. Com a porta de saída aberta não há o que pegar (desafio 1):
    // a sala está completa, e os objetos da próxima só valem depois que o robô entra nela. Na
    // sala com a porta que o jogador abre, vale o objeto de qualquer sala; na vila, só os do lugar.
    const soltos = () => {
      const achados = portaAberta && !REGRAS.portaManual ? []
        : maisPertoPrimeiro((REGRAS.portaManual ? Object.values(salas).flatMap(q => q.objetos) : s.objetos).filter(p => !foraDoChao(p) && aVista(p)));   // (o que está num móvel aberto só vale se o robô o vê: ver aVista)
      soltosNaLista.push(...achados);
      return achados;
    };
    if (estado.maoLevantada) { if (o) lista.push(null); else if (estado.naCabeca) lista.push(estado.naCabeca); }
    else if (o) {
      if (REGRAS.vila) {
        if (o.ingrediente && !vila.tigela.pronta && perto(vila.tigela)) lista.push(vila.tigela);
        if ((o === vila.massa || vila.forno.dentro) && perto(vila.forno)) lista.push(vila.forno);   // pôr a massa no forno, ou tirar o que está lá
        if (o === vila.jarro && perto(vila.bica)) lista.push(vila.bica);                              // encher o garrafão na bica da cachoeira
        if (o === vila.copo && perto(vila.filtro)) lista.push(vila.filtro);                           // encher o copo no filtro
        if (o.paraOCafe && !vila.cafeteira.pronta && perto(vila.cafeteira)) lista.push(vila.cafeteira);   // pôr a água ou o pó na cafeteira
        if (REGRAS.inventario) lista.push(...soltos());
      } else if (perto(s.cesta)) lista.push(s.cesta);
      lista.push(null);
    } else {
      if (REGRAS.vila && vila.forno.dentro && perto(vila.forno)) lista.push(vila.forno);
      lista.push(...soltos());
    }
    if (vila.carro && !semCarro && !vila.carro.motorista && !vila.carro.viagem && !estado.maoLevantada && perto(vila.carro)) lista.push(vila.carro);   // o carro, para entrar nele (parado e vazio)
    if (!carroManual && !estado.maoLevantada) for (const p of vila.pontos) if (perto(p)) lista.push(p);   // o ponto do carro, para chamá-lo
    if (vila.chave && !estado.maoLevantada && perto(vila.chave)) lista.push(vila.chave);                // a chave geral, na hidrelétrica
    // Por último, o que está aberto e dá para fechar: os móveis e as portas (menos a porta em cujo vão o robô está).
    lista.push(...maisPertoPrimeiro([...abrem, ...(portasNaoFecham ? [] : portas.filter(p => !noVaoDaPorta(p)))].filter(a => a.aberta)));
    // São no máximo MAXIMO_DE_ALVOS (um algarismo para cada um: ver marcarAlvos). Num lugar
    // cheio de objetos, ficam os que estão mais no centro da vista: saem os soltos de mais fora.
    while (lista.length > MAXIMO_DE_ALVOS && soltosNaLista.length) lista.splice(lista.indexOf(soltosNaLista.pop()), 1);
    lista.length = Math.min(lista.length, MAXIMO_DE_ALVOS);
    return lista;
  }
  const MAXIMO_DE_ALVOS = 9;
  // Só é alvo o que o robô vê. O que está dentro de um móvel aberto (a geladeira, o armário) fica
  // tapado para quem olha de lado: pela porta aberta — que fica virada para fora, uma de cada lado
  // do vão — ou pela lateral do móvel. Sem isso o número do objeto aparecia na imagem, por cima da
  // porta, e contava à iA o que havia ali sem ela ver.
  // Vale a linha reta dos olhos do robô ao meio do objeto. As portas entram na conta abertas de
  // todo, e não no ponto em que a animação delas está: assim a conta é a mesma ao vivo e assistindo
  // à gravação. Cada porta vale como uma chapa de 6 cm (duas linhas, uma de cada face), um pouco
  // mais comprida que ela: na dúvida, não se vê.
  // (Nas gravações de antes da versão 10 bastava o objeto estar ao alcance: ver semVisada.)
  let semVisada = false;
  const ABERTURA_DO_MOVEL = 1.9;                // radianos: quanto cada porta de um móvel gira para fora (ver animar)
  function aVista(o) {
    const m = semVisada ? null : abrem.find(q => q.dentro.includes(o));
    if (!m || !m.larg) return true;
    const p = pontoDe(o), meia = m.larg / 2;
    // No desenho do móvel, visto de cima: u = para o lado; w = para a frente, a partir do plano da frente dele (dentro é negativo).
    const ue = (estado.x - m.x) * m.olha, we = (estado.z - m.z) * m.olha, uo = (p.x - m.x) * m.olha, wo = (p.z - m.z) * m.olha;
    if (we <= 0) return false;                  // de lado ou de trás do móvel: a lateral tapa
    if (Math.abs(ue + (uo - ue) * we / (we - wo)) >= meia - 0.04) return false;   // a linha não entra pelo vão: bate na lateral
    const comp = meia - 0.006 + 0.03, du = -Math.cos(ABERTURA_DO_MOVEL), dw = Math.sin(ABERTURA_DO_MOVEL);   // (a porta aberta: da dobradiça para fora e para a frente)
    const rx = uo - ue, rz = wo - we;
    for (const lado of [-1, 1]) for (const face of [-0.03, 0.03]) {
      const hu = lado * (meia + face * dw), hw = -0.025 - face * du, sx = lado * du * comp, sz = dw * comp, det = rx * sz - rz * sx;
      if (Math.abs(det) < 1e-12) continue;
      const a = ((hu - ue) * sz - (hw - we) * sx) / det, b = ((hu - ue) * rz - (hw - we) * rx) / det;   // onde as duas linhas se cruzam: a, na do olhar; b, na da porta
      if (a <= 0 || a >= 1 || b < 0 || b > 1) continue;
      const y = ALTURA_OLHOS + (p.y - ALTURA_OLHOS) * a;
      if (y > m.base && y < m.alt) return false;
    }
    return true;
  }
  // Nas gravações feitas antes de existir a ordem pelo centro da imagem, entre coisas do mesmo
  // tipo valia a mais próxima do robô. Assistindo a uma delas, vale a ordem antiga (ver o fim do arquivo).
  let ordemAntiga = false;
  // As portas que o jogador abre também fecham: aberta e ao alcance, a porta é um alvo (o último da
  // lista), e o ESPACO a fecha. Só não fecha com o robô no vão dela. Nas gravações feitas antes
  // disso a porta ficava aberta para sempre; assistindo a uma delas, vale a regra antiga.
  let portasNaoFecham = false;
  const noVaoDaPorta = p => REGRAS.vila ? (COLETIVO ? emJogo().some(r => noVaoDe(p, r.estado.x, r.estado.z)) : noVaoDe(p, estado.x, estado.z))
    : Math.abs(estado.x - p.x) <= MARGEM_PAREDE + 1e-9 && noVao(estado.z);
  // A altura do ponto para onde se olha em quem não é um objeto de pegar (móvel, porta, gente):
  // é onde fica o número dele na imagem. Escolhida para não tapar o que importa ver (o que há
  // dentro do móvel, o vidro do forno, o texto no peito do outro robô).
  const ALTO = { 'central de pedidos': 1.05, carro: 1.0, 'ponto do carro': 1.4, 'chave geral': 1.0, bica: 0.9, cesta: 0.42, forno: 0.68, pessoa: 0.8, porta: 1.15, 'outro robô': 1.38, geladeira: 0.38, 'armário': 0.6 };
  // O ponto do alvo: o meio do objeto de pegar; nos outros, o lugar dele no chão, na altura de ALTO.
  const pontoDe = a => {
    if (a.ponto) return a.ponto();              // (as peças e as casas do quebra-cabeça dizem onde fica o número de cada uma)
    if (!a.malha) return new T.Vector3(a.x, ALTO[a.nome] || 1, a.z);
    a.malha.updateWorldMatrix(true, false);
    return a.malha.getWorldPosition(new T.Vector3());
  };
  // Quão no centro da imagem está o alvo: o cosseno do ângulo entre a direção do olhar (a câmera
  // olha um pouco para baixo) e a direção dele. 1 = bem no meio da imagem.
  function centralidade(a) {
    const v = vetores(), p = pontoDe(a), dx = p.x - estado.x, dy = p.y - ALTURA_OLHOS, dz = p.z - estado.z, c = Math.cos(INCLINACAO);
    return (dx * v.fx * c + dy * Math.sin(INCLINACAO) + dz * v.fz * c) / (Math.hypot(dx, dy, dz) || 1);
  }
  // O alvo do ESPACO: o que o jogador escolheu com o TAB, se ainda estiver ao alcance; senão, o primeiro da lista.
  let escolhido;                                // (undefined: ninguém escolheu)
  function alvoAtual() {
    const lista = candidatos();
    if (escolhido !== undefined && lista.includes(escolhido)) return escolhido;
    escolhido = undefined;
    return lista.length ? lista[0] : null;
  }
  // O botão TAB: passa o alvo para o candidato seguinte, dando a volta (com passo -1, para o
  // anterior). Com um número (o texto que vem junto com o botão), vai direto para o alvo com esse
  // número: é o número que aparece em cima de cada um na imagem (ver "os alvos à vista").
  function escolher(passo, numero) {
    if (quebra) return escolherNoQuebra(passo, numero);   // (lá o número é o da peça ou o da casa, e não o lugar na lista)
    const lista = candidatos(), n = lista.length, direto = numero != null && String(numero).trim() !== '', k = Math.floor(Number(numero));
    if (n < 2) return resposta('escolher', false, n ? 'só há um alvo ao alcance' : 'nada ao alcance');
    if (direto && !(k >= 1 && k <= n)) return resposta('escolher', false, `não há alvo com esse número: são ${n}`);
    escolhido = lista[direto ? k - 1 : (Math.max(0, lista.indexOf(alvoAtual())) + passo + n) % n];
    return resposta('escolher', true, `alvo: ${escolhido ? escolhido.nome : estado.maoLevantada ? 'a cabeça' : 'o chão (soltar)'}`);
  }

  // ---------- os alvos à vista ----------
  // Quem joga precisa ver TODOS os alvos possíveis, não só o que está com a borda. Por isso:
  //   os números:   quando há mais de um alvo, cada um ganha na imagem uma bolinha com o seu
  //                 número (o do alvo atual é azul e maior). O número é a posição dele na lista
  //                 (ver candidatos): o TAB passa de um para o seguinte, e o TAB com um número
  //                 vai direto para ele. A bolinha de "em nada" (soltar no chão) fica na beirada
  //                 de baixo da imagem, que é onde o item cairia. Só o que é na cabeça do robô
  //                 (com a mão no alto) tem número e não tem bolinha: a cabeça não aparece.
  //   o indicador:  no canto de cima, à direita, qual é o alvo atual e quantos são: "2/5". No
  //                 desafio 4, em que os controles são explicados, diz também o que o ESPACO
  //                 faria ("alvo 2 de 5" e, embaixo, "pegar: ovos"), e aparece mesmo com um alvo só.
  // Tudo isso é desenhado dentro do canvas, só no mundo real (camada 2): sai na imagem que a iA
  // recebe e não aparece no reflexo.
  const marcas = [];
  for (let n = 1; n <= MAXIMO_DE_ALVOS + (REGRAS.quebraCabeca ? 1 : 0); n++) {   // (no quebra-cabeça há mais uma, a do 0: o lugar da peça na bandeja)
    const m = new T.Sprite(new T.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false, sizeAttenuation: false,
      map: texturaCanvas(96, 96, (g, l) => {
        g.fillStyle = '#ffffff'; g.strokeStyle = '#0a0e12'; g.lineWidth = 8;
        g.beginPath(); g.arc(l / 2, l / 2, l / 2 - 6, 0, 7); g.fill(); g.stroke();
        g.fillStyle = '#0a0e12'; g.font = 'bold 64px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(n > MAXIMO_DE_ALVOS ? 0 : n), l / 2, l / 2 + 5);
      }) }));
    m.renderOrder = 997;                        // por cima do mundo, por baixo do resto do que é desenhado na tela
    m.layers.set(2);
    m.visible = false;
    m.userData.ponto = null;                    // onde o alvo dela está (null: sem uso agora)
    cena.add(m);
    marcas.push(m);
  }
  const TAMANHO_DA_MARCA = 0.075;               // sem atenuação: o tamanho que ela teria a 1 m, perto ou longe (5% da altura da imagem)
  const mira = { canvas: document.createElement('canvas'), texto: null, usado: { l: 1, a: 1 } };
  mira.canvas.width = 736; mira.canvas.height = 160;   // (4,6 por 1: é o que cabe à direita do inventário na imagem da iA)
  mira.textura = new T.CanvasTexture(mira.canvas);
  mira.textura.colorSpace = T.SRGBColorSpace;
  mira.malha = new T.Mesh(new T.PlaneGeometry(1, 1), luminoso({ map: mira.textura, transparent: true, depthTest: false, depthWrite: false }));
  mira.malha.renderOrder = 999;
  mira.malha.layers.set(2);
  mira.malha.visible = false;
  camera.add(mira.malha);
  // O mapa do carro: dentro do carro parado, a imagem do robô mostra os lugares aonde ele vai, cada um
  // com o número do seu alvo (o do alvo atual, em azul-claro), o lugar em que o carro está e, embaixo,
  // o alvo que é sair dele. Em viagem o mapa some, para se ver a estrada (fica o selo "a caminho").
  const mapa = { canvas: document.createElement('canvas'), chave: null };
  mapa.canvas.width = mapa.canvas.height = 512;
  mapa.textura = new T.CanvasTexture(mapa.canvas);
  mapa.textura.colorSpace = T.SRGBColorSpace;
  mapa.malha = new T.Mesh(new T.PlaneGeometry(1, 1), luminoso({ map: mapa.textura, transparent: true, depthTest: false, depthWrite: false }));
  mapa.malha.renderOrder = 999;
  mapa.malha.layers.set(2);
  mapa.malha.visible = false;
  camera.add(mapa.malha);
  function desenharMapa() {
    const c = estado.dirigindo, mostra = !!c && !c.viagem && !carroManual;
    mapa.malha.visible = mostra;
    if (!mostra) return;
    const lista = candidatos(), alvo = alvoAtual(), chave = [c.onde, lista.indexOf(alvo)].join('|');
    if (chave === mapa.chave) return;
    mapa.chave = chave;
    const g = mapa.canvas.getContext('2d'), L = 512, CIANO = '#00e5ff', ONDE = { praca: [190, 318], usina: [190, 150], cachoeira: [404, 318] };
    const texto = (t, x, y, px, cor, alinha) => { g.font = `bold ${px}px Arial, sans-serif`; g.fillStyle = cor; g.textAlign = alinha || 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y); };
    g.clearRect(0, 0, L, L);
    g.beginPath();
    if (g.roundRect) g.roundRect(4, 4, L - 8, L - 8, 26); else g.rect(4, 4, L - 8, L - 8);
    g.fillStyle = 'rgba(12, 18, 24, 0.9)'; g.fill();
    g.strokeStyle = CIANO; g.lineWidth = 5; g.stroke();
    texto('CARRO AUTÔNOMO', L / 2, 42, 34, '#ffffff');
    texto('escolha o destino', L / 2, 80, 24, '#9eeaf5');
    // as estradas: a rotatória no meio, a do norte e a do leste até os passeios, as outras duas só começadas
    g.strokeStyle = '#6b7780'; g.lineWidth = 12; g.lineCap = 'round';
    g.beginPath(); g.arc(190, 318, 30, 0, 7); g.stroke();
    for (const [x1, y1, x2, y2] of [[190, 288, 190, 150], [220, 318, 404, 318], [160, 318, 92, 318], [190, 348, 190, 412]]) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
    for (const d of DESTINOS) {
      const [x, y] = ONDE[d.id], i = lista.indexOf(d), aqui = d.id === c.onde, daVez = d === alvo;
      g.beginPath(); g.arc(x, y, 27, 0, 7);
      g.fillStyle = aqui ? '#3f7a5c' : daVez ? CIANO : '#ffffff'; g.fill();
      g.strokeStyle = '#0c1218'; g.lineWidth = 4; g.stroke();
      if (i >= 0) texto(String(i + 1), x, y + 2, 34, '#0c1218');
      const nome = d.nome.toUpperCase() + (aqui ? ' (aqui)' : '');
      if (d.id === 'usina') texto(nome, x + 40, y, 27, daVez ? CIANO : '#ffffff', 'left');
      else texto(nome, d.id === 'praca' ? x - 8 : x - 6, y + (d.id === 'praca' ? 112 : -50), 27, daVez ? CIANO : '#ffffff');
    }
    const sair = lista.indexOf(c);
    if (sair >= 0) {
      g.beginPath(); g.arc(300, 462, 22, 0, 7); g.fillStyle = alvo === c ? CIANO : '#ffffff'; g.fill();
      texto(String(sair + 1), 300, 464, 28, '#0c1218');
      texto('sair do carro', 334, 463, 26, alvo === c ? CIANO : '#ffffff', 'left');
    }
    mapa.textura.needsUpdate = true;
  }
  // No coletivo: a missão que o robô da vez pegou na central ("missão: casa 2"), no canto de cima, à
  // esquerda, da imagem dele — para ele não depender de lembrar o que a central disse.
  const missao = { canvas: document.createElement('canvas'), texto: null };
  missao.canvas.width = 520; missao.canvas.height = 110;
  missao.textura = new T.CanvasTexture(missao.canvas);
  missao.textura.colorSpace = T.SRGBColorSpace;
  missao.malha = new T.Mesh(new T.PlaneGeometry(1, 1), luminoso({ map: missao.textura, transparent: true, depthTest: false, depthWrite: false }));
  missao.malha.renderOrder = 999;
  missao.malha.layers.set(2);
  missao.malha.visible = false;
  camera.add(missao.malha);
  function desenharMissao() {
    const p = atual && atual.dentro ? vila.pessoas.find(q => q.pedindo && q.com === atual) : null, viagem = estado.dirigindo && estado.dirigindo.viagem;
    const vindo = vila.carro && vila.carro.viagem && vila.carro.viagem.chamou === estado;        // (o carro que este robô chamou de um ponto)
    const texto = viagem ? (viagem.parado ? 'robô na frente: o carro espera' : `a caminho: ${viagem.destino.nome}`) : vindo ? 'o carro está vindo' : p ? `missão: casa ${p.casa}` : '';   // (no carro em viagem, o selo diz para onde ele vai)
    missao.malha.visible = !!texto;
    if (texto === missao.texto) return;
    missao.texto = texto;
    if (!texto) return;
    const c = missao.canvas, g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.beginPath();
    if (g.roundRect) g.roundRect(4, 4, c.width - 8, c.height - 8, 22); else g.rect(4, 4, c.width - 8, c.height - 8);
    g.fillStyle = 'rgba(20, 26, 32, 0.9)'; g.fill();
    g.strokeStyle = '#ffd24a'; g.lineWidth = 6; g.stroke();
    g.fillStyle = '#ffffff'; g.font = 'bold 60px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(texto, c.width / 2, c.height / 2 + 3, c.width - 40);
    missao.textura.needsUpdate = true;
  }
  // O que o ESPACO faria nesse alvo, em poucas palavras (desafio 4).
  function acaoDe(a) {
    const o = estado.segurando;
    if (!a) return 'soltar no chão';
    if (a.ehPeca) return 'pegar a peça (L gira)';
    if (a.ehCasa) return a.peca ? `trocar pela peça ${a.peca.numero}` : 'pôr a peça aqui';
    if (a.ehVaga) return 'devolver a peça';
    if (a.ehDestino) return `ir de carro: ${a.nome}`;
    if (a.ehPonto) return 'chamar o carro';
    if (a === vila.chave) return a.ligada ? 'chave geral: ligada' : 'ligar a chave geral';
    if (a === vila.bica) return 'encher o garrafão';
    if (a.ehCarro) return estado.dirigindo ? 'sair do carro' : 'entrar no carro';
    if (a.ehCentral) return vila.pessoas.some(p => p.pedindo && p.com === atual) ? 'ver a minha missão' : 'pedir uma missão';
    if (a.ehPessoa) return o ? `dar ${o.nome} à pessoa` : 'falar com a pessoa';
    if (portasDaVila.includes(a)) return a.aberta ? 'fechar a porta' : 'abrir a porta';
    if (abrem.includes(a)) return `${a.aberta ? 'fechar' : 'abrir'}: ${a.nome}`;
    if (a === vila.tigela) return `pôr ${o.nome} na tigela`;
    if (a === vila.forno) return vila.forno.dentro ? 'tirar do forno' : 'pôr a massa no forno';
    if (a === vila.filtro) return 'encher o copo';
    if (a === vila.cafeteira) return `pôr ${o.nome} na cafeteira`;
    return `pegar: ${a.nome}`;
  }
  // Diz onde está cada alvo e escreve o indicador. É chamada depois de todo comando (ver resposta).
  function marcarAlvos() {
    const lista = candidatos(), alvo = alvoAtual(), n = lista.length, atual = lista.indexOf(alvo) + 1;
    if (quebra) {                               // no quebra-cabeça o número é o da peça ou o da casa (0: a bandeja), e aparece sempre
      for (const m of marcas) m.userData.ponto = null;
      for (const a of lista) {
        const m = marcas[a.numero ? a.numero - 1 : MAXIMO_DE_ALVOS];
        m.userData.ponto = pontoDe(a);
        m.material.color.set(a === alvo ? 0x00e5ff : 0xffffff);
        m.scale.setScalar(TAMANHO_DA_MARCA * 0.85 * (a === alvo ? 1.25 : 1));
      }
    } else marcas.forEach((m, i) => {
      const a = lista[i];
      m.userData.ponto = null;
      if (n < 2 || i >= n || (a ? a === estado.naCabeca : estado.maoLevantada) || (a && (a.ehDestino || (a.ehCarro && estado.dirigindo)))) return;   // (os destinos do carro têm o número no mapa, não no mundo)   // (a cabeça do robô não aparece na imagem)
      const v = vetores(), p = a ? pontoDe(a) : new T.Vector3(estado.x + v.fx * 0.75, 0.1, estado.z + v.fz * 0.75);   // "em nada": o chão à frente, onde o item cairia (fica na beirada de baixo da imagem)
      if (a && a.malha) p.y += (a.alt || 0.2) / 2 + 0.05;   // logo acima do objeto, sem tapar o que ele tem escrito
      m.userData.ponto = p;
      m.material.color.set(a === alvo ? 0x00e5ff : 0xffffff);
      m.scale.setScalar(TAMANHO_DA_MARCA * (a === alvo ? 1.25 : 1));
    });
    const texto = !n ? [] : quebra ? [nomeNoQuebra(alvo), acaoDe(alvo)] : REGRAS.vila ? [`alvo ${atual} de ${n}`, acaoDe(alvo)] : n > 1 ? [`${atual}/${n}`] : [];
    mira.malha.visible = texto.length > 0;
    if (texto.join('\n') === mira.texto) return;
    mira.texto = texto.join('\n');
    // uma caixa do tamanho do texto, encostada no canto de cima, à direita
    const c = mira.canvas, g = c.getContext('2d'), fonte = px => `bold ${px}px Arial, sans-serif`, margem = 26;
    const linhas = texto.length > 1 ? [{ px: 44, y: 46, cor: '#9eeaf5' }, { px: 56, y: 110, cor: '#ffffff' }] : [{ px: 84, y: 62, cor: '#ffffff' }];
    let larg = 0;
    texto.forEach((t, i) => { g.font = fonte(linhas[i].px); larg = Math.max(larg, g.measureText(t).width); });
    larg = Math.min(c.width - 6, larg + 2 * margem);
    const alt = texto.length > 1 ? c.height - 6 : 114, x = c.width - 3 - larg;
    mira.usado = { l: (larg + 6) / c.width, a: (alt + 6) / c.height };   // a parte do desenho que a caixa ocupa, a partir do canto de cima, à direita
    g.clearRect(0, 0, c.width, c.height);
    mira.textura.needsUpdate = true;
    if (!texto.length) return;
    g.fillStyle = 'rgba(10, 14, 18, 0.82)'; g.strokeStyle = '#00e5ff'; g.lineWidth = 5;
    g.beginPath();
    if (g.roundRect) g.roundRect(x, 3, larg, alt, 24); else g.rect(x, 3, larg, alt);
    g.fill(); g.stroke();
    g.textAlign = 'right'; g.textBaseline = 'middle';
    texto.forEach((t, i) => { g.font = fonte(linhas[i].px); g.fillStyle = linhas[i].cor; g.fillText(t, c.width - 3 - margem, linhas[i].y, larg - 2 * margem); });
  }
  // Põe cada bolinha no lugar do seu alvo, a cada desenho (o robô desliza de um passo para o
  // outro, e a imagem da iA tem outro formato que o da janela). A que cairia fora da imagem
  // fica na beirada; a que cairia atrás do que é desenhado no alto da tela (o inventário, o
  // contador, o indicador) desce para logo abaixo dele.
  const v3 = new T.Vector3();
  function assentarMarcas() {
    const meiaAltura = Math.tan(camera.fov * Math.PI / 360), direita = meiaAltura * camera.aspect;
    // o que tapa o alto da imagem, de -1 a 1: de x1 a x2, de y para cima (do indicador, só a caixa escrita: ver mira.usado)
    const tapado = [contador.malha, inventario.malha, mira.malha, missao.malha, mapa.malha].filter(q => q.visible).map(q => {
      const usado = q === mira.malha ? mira.usado : { l: 1, a: 1 }, x2 = q.position.x + q.scale.x / 2, topo = q.position.y + q.scale.y / 2;
      return { x1: (x2 - q.scale.x * usado.l) / direita, x2: x2 / direita, y: (topo - q.scale.y * usado.a) / meiaAltura };
    });
    const postas = [];
    let atualizada = false;
    for (const m of marcas) {
      const p = m.userData.ponto;
      m.visible = false;
      if (!p) continue;
      if (!atualizada) { camera.updateMatrixWorld(); atualizada = true; }
      v3.copy(p).applyMatrix4(camera.matrixWorldInverse);
      if (v3.z > -0.1) continue;                // atrás de quem olha
      v3.applyMatrix4(camera.projectionMatrix); // agora de -1 a 1 na imagem (x para a direita, y para cima)
      const ry = m.scale.y / 2 / meiaAltura, rx = ry / camera.aspect;
      let x = Math.max(-1 + 1.3 * rx, Math.min(1 - 1.3 * rx, v3.x)), y = Math.max(-1 + 1.3 * ry, Math.min(1 - 1.3 * ry, v3.y));
      for (const t of tapado) if (x > t.x1 - rx && x < t.x2 + rx && y > t.y - 1.2 * ry) y = t.y - 1.2 * ry;
      // duas bolinhas no mesmo lugar (alvos colados, ou os dois na beirada): esta vai para o lado
      for (let k = 0, lado = 0; k < MAXIMO_DE_ALVOS; k++) {
        const q = postas.find(o => Math.abs(o.x - x) < 2.1 * rx && Math.abs(o.y - y) < 2.1 * ry);
        if (!q) break;
        lado = lado || (x < q.x || q.x + 2.2 * rx > 1 - 1.3 * rx ? -1 : 1);
        x = q.x + lado * 2.2 * rx;
      }
      postas.push({ x, y });
      m.position.set(x, y, v3.z).unproject(camera);
      m.visible = true;
    }
  }
  // Abre ou fecha um móvel de duas portas. Fechado, o que ainda está dentro dele não dá para pegar.
  function abrirOuFechar(m) {
    m.aberta = !m.aberta;
    m.dentro.forEach(x => { x.fechado = !m.aberta; });
    return m.aberta;
  }

  // Passa o objeto da mão para quem o recebe (o outro robô ou a pessoa), que fica com ele e
  // agradece. É a vitória dos desafios 2 e 3.
  function entregar(o, r) {
    estado.segurando = null;
    o.entregue = true;
    r.recebeu = o;
    o.malha.rotation.set(0, 0, 0);
    r.receber(o);
    estado.ganhou = true;
    faixa.visible = true;
  }

  // Com a mão no alto, o ESPACO mexe com a cabeça: tira o que está nela ou põe nela o que está na mão.
  function usarACabeca(alvo) {
    const o = estado.segurando;
    if (o) {
      if (estado.naCabeca) return resposta('pegar', false, 'cabeça ocupada');
      estado.segurando = null;
      porNaCabeca(o);
      return resposta('pegar', true, `colocou na cabeça: ${o.nome}`);
    }
    if (!alvo) return resposta('pegar', false, 'nada na cabeça');
    alvo.naCabeca = false;
    estado.naCabeca = null;
    alvo.malha.traverse(m => m.layers.set(0));   // na mão, aparece também em primeira pessoa
    estado.segurando = alvo;                    // a mão continua no alto, segurando
    return resposta('pegar', true, `pegou da cabeça: ${alvo.nome}`);
  }

  function pegar() {
    if (quebra) return usarNoQuebra();
    if (REGRAS.vila) return usarNaVila();
    const v = vetores(), s = salas[estado.sala], alvo = alvoAtual();
    escolhido = undefined;                      // o ESPACO gasta a escolha: depois dele o alvo volta a ser o mais óbvio
    if (alvo && alvo === s.outroRobo) {
      const o = estado.segurando;
      entregar(o, alvo);
      return resposta('pegar', true, `entregou: ${o.nome} ao outro robô — venceu`);
    }
    if (alvo && alvo === s.pessoa) {
      const o = estado.segurando;
      if (!o) {                                 // de mão vazia: fala com ela, e ela diz o que quer
        alvo.fala = FALAS.pedido;
        return resposta('pegar', true, `a pessoa disse: "${alvo.fala}"`);
      }
      entregar(o, alvo);
      return resposta('pegar', true, `entregou: ${o.nome} à pessoa — venceu`);
    }
    // A porta que o jogador abre (desafio 3): abre e fecha, de um lado e do outro (do outro lado, ela é a porta da sala anterior).
    const daPorta = REGRAS.portaManual && alvo ? [s, salas[estado.sala - 1]].find(q => q && q.porta === alvo) : null;
    if (daPorta) {
      if (!alvo.aberta) { abrirPorta(daPorta); return resposta('pegar', true, 'abriu a porta'); }
      alvo.aberta = false;
      portaAberta = 0;                          // fechada, o robô fica na sala em que está (ver livre)
      return resposta('pegar', true, 'fechou a porta');
    }
    if (alvo && alvo === s.geladeira) return resposta('pegar', true, abrirOuFechar(alvo) ? 'abriu a geladeira' : 'fechou a geladeira');
    if (estado.maoLevantada) return usarACabeca(alvo);   // mão no alto: tira da cabeça ou põe na cabeça
    if (estado.segurando) {
      const o = estado.segurando;
      if (alvo) {                               // de frente para a cesta: o objeto vai para dentro dela
        const i = s.cesta.itens.length, camada = Math.floor(i / 5);   // 5 por camada, empilhando
        const a = (i % 5) * 2 * Math.PI / 5 + camada * 0.63, r = 0.22 - camada * 0.1;
        assentar(s, o, s.cesta.x + Math.cos(a) * r, s.cesta.z + Math.sin(a) * r, 0.02 + camada * 0.2 + o.alt / 2);
        o.naCesta = true;
        s.cesta.itens.push(o);
        estado.segurando = null;
        let msg = `colocou: ${o.nome} na cesta (${s.cesta.itens.length}/${s.objetos.length})`;
        if (s.chapeu && !s.chapeu.apareceu && s.cesta.itens.length === s.objetos.length - 1) {
          s.chapeu.apareceu = true;             // o chão ficou vazio: agora falta só o que acaba de surgir na cabeça
          porNaCabeca(s.chapeu);
          msg += ` — apareceu na cabeça: ${s.chapeu.nome}`;
        }
        if (s.cesta.itens.length === s.objetos.length) {
          if (s.porta) {
            abrirPorta(s);
            msg += ` — sala ${numero(s.n)} completa: a porta abriu`;
          } else {                              // era a última sala: fim de jogo, com parabéns na tela
            estado.ganhou = true;
            faixa.visible = true;
            msg += ' — todos os objetos na cesta: venceu';
          }
        }
        return resposta('pegar', true, msg);
      }
      const x = s.cx + limitar(estado.x + v.fx * 0.75 - s.cx, SALA.L / 2 - o.raio - 0.1);
      const z = limitar(estado.z + v.fz * 0.75, SALA.P / 2 - o.raio - 0.03);
      if (noMovel(x, z, o.raio) || Object.values(salas).some(q => noCaminho(q).some(p => Math.hypot(p.x - x, p.z - z) < p.raio + o.raio)))
        return resposta('pegar', false, 'sem espaço para soltar aqui');
      assentar(s, o, x, z, o.alt / 2);
      o.sombra.visible = true;
      estado.segurando = null;
      return resposta('pegar', true, `soltou: ${o.nome}`);
    }
    if (!alvo) return resposta('pegar', false, 'nada ao alcance');
    segurar(alvo);
    return resposta('pegar', true, `pegou: ${alvo.nome}`);
  }

  function escrever(texto) {
    estado.texto = Array.from(String(texto == null ? '' : texto)).slice(0, 10).join('');
    eu.escrever(estado.texto);
    return resposta(`escrever "${estado.texto}"`, true, 'ok');
  }

  // Devolve a visão atual do robô como PNG (data URL). É a única informação que o jogo dá.
  // A imagem tem sempre o mesmo tamanho, seja qual for o tamanho da janela.
  function frame() {
    if (COLETIVO) { cadaRobo(() => { animarRobo(1); porCorpo(); }); refrescarHUD(); }   // os outros robôs no lugar, e o que vai por cima da imagem, que é deste
    animar(1, 1);                               // sem animação pela metade
    aplicarVisual();
    if (COLETIVO) contarVistas(atual);          // (os balões de fala que esta imagem mostra: ver falaVale)
    if (estado.dirigindo) { marcarAlvos(); desenharMissao(); desenharMapa(); }   // (o carro pode ter chegado desde o último botão: o mapa e o selo desta hora)
    const densidade = renderer.getPixelRatio();
    renderer.setPixelRatio(1);
    definirTamanho(FRAME.l, FRAME.a);
    desenhar();
    const imagem = canvas.toDataURL('image/png');
    renderer.setPixelRatio(densidade);          // de volta ao tamanho que a imagem tem na janela, na mesma hora
    definirTamanho(tela.w, tela.h);
    if (vista.voando) desenharDeFora(); else if (variosOlhos()) { ultimoMosaico = 0; desenharMosaico(performance.now()); } else desenhar();   // (a janela volta a mostrar a visão de quem assiste: a imagem da iA é sempre a dos olhos do robô)
    resposta('frame', true, `${FRAME.l}x${FRAME.a}`);
    return imagem;
  }

  // Recomeça o desafio atual. Tudo o que o jogo guarda está na página, então basta recarregá-la.
  const reiniciar = () => location.reload();
  // Começa o desafio n: recarrega a página com ?desafio=n (o resto do endereço fica como está).
  // Devolve true quando a página vai ser recarregada. Os desafios M (multiplayer) e T (treino)
  // são os da quadra (arena.js). Quando quem pede um deles é uma iA, a página nova já entra
  // com essa iA e é ela que responde ao pedido (ver o fim de arena.js). O recado para a
  // página nova (a conexão da iA, o número do pedido no servidor e o nome de guerra) vai
  // pelo sessionStorage, que só esta página enxerga — não pelo endereço, que qualquer link
  // de fora poderia forjar.
  function comecar(n, quem, cmd, nome, modelo) {
    // "C" é a cadeira do comentarista do Galinha Pong: a página vai para a quadra (desafio M) e a iA entra só para assistir.
    if (String(n) === 'V') {                    // a vila coletiva: com a página já nela, a iA só entra; senão, a página recarrega nela e a iA entra na página nova
      const iA = Number.isInteger(quem) && quem > 0;
      if (COLETIVO) return iA ? entrarPelaPonte(quem, nome, modelo) : false;
      const p = new URLSearchParams(location.search);
      p.set('desafio', 'V');
      try {
        if (iA) sessionStorage.setItem('vila.entrada', JSON.stringify({ quem, cmd: cmd || 0, nome: nome || '', modelo: modelo || '' }));
        else sessionStorage.removeItem('vila.entrada');
      } catch (e) { }
      location.search = p.toString();
      return true;
    }
    const comentarista = String(n) === 'C', arena = comentarista || String(n) === 'M' || String(n) === 'T';
    if (!arena && !existeDesafio(n)) return false;
    const p = new URLSearchParams(location.search);
    p.set('desafio', comentarista ? 'M' : n);
    try {
      if (arena && Number.isInteger(quem) && quem > 0) sessionStorage.setItem('quadra.entrada', JSON.stringify({ quem, cmd: cmd || 0, nome: nome || '', modelo: modelo || '', papel: comentarista ? 'C' : '' }));
      else sessionStorage.removeItem('quadra.entrada');
      // nos desafios 1 a 3, a página nova fica sabendo quem está jogando (ver "quem joga, a intenção e a gravação")
      if (!arena && Number.isInteger(quem) && quem > 0) sessionStorage.setItem('desafio.quem', JSON.stringify({ quem, nome: nome || '', modelo: modelo || '' }));
    } catch (e) { }
    if ('?' + p.toString() === location.search) location.reload();
    else location.search = p.toString();
    return true;
  }

  // ---------- desenho ----------
  // Ângulos do braço direito: caído, estendido para carregar, mão levantada.
  const BRACO = { caido: 0, estendido: 1.13, levantado: 2.45 };
  // Aproxima o que se vê do estado do jogo: k = fração do caminho (1 = chega de uma vez).
  function animarRobo(k) {
    const carregando = REGRAS.bracoCaido ? BRACO.caido : BRACO.estendido;
    const braco = estado.maoLevantada ? BRACO.levantado : estado.segurando ? carregando : BRACO.caido;
    const l = luzDaqui(), alvo = { x: estado.x, z: estado.z, yaw: estado.rumo * GIRO, braco, luz: l.x, luzY: l.y, luzZ: l.z, forca: l.forca, chao: alturaDoChao(estado.x, estado.z) };
    for (const c in alvo) visual[c] += (alvo[c] - visual[c]) * k;
    const carro = estado.dirigindo;
    if (carro && carro.viagem) Object.assign(visual, { x: carro.x, z: carro.z, yaw: carro.yaw });   // em viagem, o robô vai exatamente onde o carro está
  }
  function animar(k, kPorta) {
    atualizarPedidos();                         // (no coletivo: os pedidos cuja hora chegou)
    atualizarCarro();                           // (o carro em viagem)
    animarRobo(k);
    for (const gel of abrem) {                  // as duas portas da geladeira (ou do armário) giram para fora, uma para cada lado
      gel.vis += ((gel.aberta ? 1 : 0) - gel.vis) * kPorta;
      gel.folhas.forEach((eixo, i) => { eixo.rotation.y = (i ? 1 : -1) * 1.9 * gel.vis; });
    }
    for (const p of portasDaVila) {             // na vila, a porta corre ao longo da parede em que está
      if (!p.folha) continue;
      p.vis += ((p.aberta ? 1 : 0) - p.vis) * kPorta;
      const ao = p.eixo === 'x' ? 'z' : 'x';
      p.folha.position[ao] = p[ao] + (p.sentido || -1) * (LARGURA_PORTA + 0.03) * p.vis;   // (para o lado em que a parede tem lugar para ela)
    }
    if (REGRAS.vila) tiqueDoForno();            // o relógio da cozinha, o tempo de forno e o bolo que queima
    for (const s of Object.values(salas)) {
      const r = s.outroRobo;
      if (r) {                                  // o outro robô estende o braço quando recebe o presente
        r.braco += ((r.recebeu ? BRACO.estendido : BRACO.caido) - r.braco) * k;
        r.corpo.braco.rotation.x = r.braco;
      }
      const p = s.porta;
      if (!p) continue;
      p.vis += ((p.aberta ? 1 : 0) - p.vis) * kPorta;
      p.folha.position.z = Z_PORTA - (LARGURA_PORTA + 0.03) * p.vis;   // corre para dentro da parede
    }
  }
  // Quem ouve é quem assiste: dos olhos do robô ou, no modo voador, de onde a câmera está. A música
  // do violeiro soa mais alto de perto, e ela e a chuva chegam abafadas dentro de uma casa.
  function soarEViver(t, dt) {
    const ouve = vista.voando ? vista : visual;
    som.ouvir(ouve.x, ouve.z);
    if (!vila.vida) return;
    vila.vida.passo(t, dt, COLETIVO ? emJogo().map(r => r.visual) : [visual]);
    const lugar = Object.values(areas).find(a => cabeNoLugar(a, ouve.x, ouve.z, 0)), abafado = lugar && lugar.n !== 4 ? 0.4 : 1;
    som.musica(Math.max(0, 1 - Math.hypot(ouve.x - vila.vida.violeiro.x, ouve.z - vila.vida.violeiro.z) / 14) ** 1.6 * abafado);
    som.chover((vila.clima ? vila.clima.molhado : 0) * abafado);
    animarAguas(t, dt);
    animarCancelas(dt);
    const ouvido = (x, z, alcance) => Math.max(0, 1 - Math.hypot(ouve.x - x, ouve.z - z) / alcance) ** 2 * abafado;   // (quanto se ouve, dali, de um som que vem de x, z)
    som.fundo('cachoeira', ouvido(127, CIDADE.z, 55));
    som.fundo('usina', ouvido(CIDADE.x, 110, 60));
    som.fundo('motor', vila.carro && vila.carro.viagem ? ouvido(vila.carro.x, vila.carro.z, 28) * (vila.carro.viagem.parado ? 0.35 : 1) : 0);
  }
  // As pessoas, que não ficam paradas como estátuas. Quem chega perto, pela frente, ganha um olhar.
  function animarPessoas(t) {
    const gente = vila.pessoas.length ? vila.pessoas : pessoa ? [pessoa] : [], quem = COLETIVO ? emJogo() : [{ estado, visual }];
    for (const p of gente) {
      let perto = null, menor = 3.2;
      for (const r of quem) {
        const dx = r.visual.x - p.rosto.x, dz = r.visual.z - p.rosto.z, d = Math.hypot(dx, dz);
        if (r.estado.sala === p.sala && dz < -0.2 && d < menor) { menor = d; perto = { x: dx, z: dz }; }
      }
      p.corpo.animar(t, perto, COLETIVO ? hora() < p.agradeceAte : !!estado.ganhou);
    }
  }
  // O corpo do robô da vez, e o que ele tem na mão, no lugar em que `visual` diz.
  function porCorpo() {
    const sentado = estado.dirigindo ? CARRO.assento : 0;   // (no carro, o robô vai sentado no banco da frente: a cabeça aparece pelos vidros, e o resto fica dentro da lataria)
    robo.position.set(visual.x - Math.sin(visual.yaw) * sentado, visual.chao + (estado.dirigindo ? CARRO.banco : 0), visual.z - Math.cos(visual.yaw) * sentado);
    robo.rotation.y = visual.yaw;
    bracoDireito.rotation.x = visual.braco;
    if (estado.segurando) {                     // o objeto acompanha a mão
      const b = visual.braco, o = estado.segurando.malha;
      if (REGRAS.bracoCaido) o.position.set(0.31, 0.72 - 0.56 * Math.cos(b), -0.56 * Math.sin(b));   // na ponta do braço, depois da mão
      else o.position.set(0.31, 0.76 - 0.47 * Math.cos(b), -0.015 - 0.47 * Math.sin(b));              // logo acima da mão
    }
    if (estado.dirigindo) {                     // o carro vai aonde vai quem dirige (a frente dele é o +x do desenho)
      const c = estado.dirigindo.grupo;
      c.position.set(visual.x, visual.chao, visual.z);
      c.rotation.y = visual.yaw + Math.PI / 2;
    }
  }
  function aplicarVisual() {
    porCorpo();
    lampada.position.set(visual.luz, visual.luzY, visual.luzZ);
    lampada.intensity = visual.forca * (vila.clima ? vila.clima.lampada : 1) * (vila.chave && !vila.chave.ligada && estado.sala <= 3 ? 0.1 : 1);   // (com a chave geral desligada, a casa 1 fica no escuro)   // (de noite a imagem inteira escurece, e a lâmpada de dentro é reforçada: ver "a hora do dia e a chuva")
    // Quem vai no carro vê de dentro dele: os olhos do robô sentado no banco da frente, olhando reto pelo para-brisa
    // (o painel embaixo, as colunas dos lados, a beirada do teto em cima). A pé, a câmera olha um pouco para baixo.
    const noCarro = !!estado.dirigindo, adiante = noCarro ? CARRO.olho : 0;
    camera.position.set(visual.x - Math.sin(visual.yaw) * adiante, ALTURA_OLHOS + (noCarro ? CARRO.banco : 0) + visual.chao, visual.z - Math.cos(visual.yaw) * adiante);
    camera.rotation.set(noCarro || quebra ? 0 : INCLINACAO, visual.yaw, 0);   // (no quebra-cabeça ele também olha reto: de frente para a parede, as peças saem quadradas na imagem)
    atualizarBalao();
  }
  // As sombras são calculadas num desenho descartável, de um ponto só, em que a câmera "vê" o corpo do robô (ver desenhar).
  // Nesse desenho só as sombras interessam, e tudo é pintado com um material só, liso. (Com os materiais de verdade, cada um
  // ganhava dois programas na placa de vídeo — um para a tela, outro para este desenho, que não tem as cores da tela — e
  // trocava de um para o outro a cada quadro: o primeiro desenho da página demorava o dobro, e todos os outros, mais.)
  const alvoDescartavel = new T.WebGLRenderTarget(1, 1), tintaDescartavel = new T.MeshBasicMaterial();
  function calcularSombras(camera) {
    renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(alvoDescartavel);
    cena.overrideMaterial = tintaDescartavel;
    try { renderer.render(cena, camera); } finally { cena.overrideMaterial = null; renderer.setRenderTarget(null); }
  }
  function desenhar() {
    assentarMarcas();                           // os números dos alvos, no lugar em que cada um aparece neste desenho
    renderer.clear();
    if (REGRAS.semEspelho) {
      // Na vila não há espelho: só as sombras (calculadas num desenho descartável em que a
      // câmera "vê" o corpo do robô, como abaixo) e o mundo, com o corpo de fora.
      vidro.visible = false;
      vila.focarSol(camera.position.x, camera.position.z);   // (as sombras do sol, em volta de quem olha)
      for (const c of CAMADAS_DOS_CORPOS) camera.layers.enable(c);   // (a camada 1, e as dos outros robôs do coletivo)
      camera.layers.disable(2);
      calcularSombras(camera);
      camera.layers.disable(COLETIVO ? atual.camada : 1);            // o próprio corpo fica de fora; os dos outros robôs, à vista
      camera.layers.enable(2);
      refletirEspelhos(camera);                 // os espelhos das casas, com as sombras deste desenho
      renderer.render(cena, camera);
      return;
    }
    // 1) o mundo refletido no plano do espelho, com o robô inteiro visível
    raiz.scale.z = -1; raiz.position.z = 2 * Z_ESPELHO;
    vidro.visible = false;
    camera.layers.enable(1);
    camera.layers.disable(2);
    renderer.shadowMap.needsUpdate = true;      // sombras do mundo refletido
    renderer.render(cena, camera);
    // Sombras do mundo real. O corpo do robô não aparece em primeira pessoa, mas tem de
    // fazer sombra (senão o reflexo teria sombra e o robô de verdade não). Por isso elas são
    // calculadas aqui, num desenho descartável em que a câmera ainda "vê" o corpo, e o
    // desenho de verdade, logo abaixo, só as reaproveita.
    raiz.scale.z = 1; raiz.position.z = 0;
    calcularSombras(camera);
    // 2) o mundo real por cima; o corpo do robô fica de fora (primeira pessoa) e entra o contador
    renderer.clearDepth();
    vidro.visible = !REGRAS.espelhoDisfarcado;
    camera.layers.disable(1);
    camera.layers.enable(2);
    renderer.render(cena, camera);
  }

  // No coletivo, com mais de um robô em jogo, a visão da iA mostra os olhos de todos: a tela
  // dividida, um quadro para cada robô (dois lado a lado; três ou quatro, dois em cima e dois
  // embaixo), cada um com o que aquele robô vê, inclusive o que é desenhado por cima da imagem
  // dele. Um clique num quadro deixa só aquele robô na tela; outro clique volta a mostrar todos.
  // É de quem assiste: a imagem que cada iA recebe continua sendo só a dos olhos do robô dela.
  let ultimoMosaico = 0, soEste = null, quadros = [];
  const etiquetas = [];
  const variosOlhos = () => COLETIVO && (emJogo().length > 1 || !!(soEste && soEste.dentro));
  function esconderEtiquetas() {
    for (const el of etiquetas) el.hidden = true;
    quadros = [];
  }
  function desenharMosaico(agora) {
    if (agora - ultimoMosaico < 70) return;     // (uns 14 quadros por segundo bastam: cada robô custa um desenho da cidade inteira)
    ultimoMosaico = agora;
    if (soEste && !soEste.dentro) soEste = null;
    const lista = soEste ? [soEste] : emJogo(), daVez = atual, tamanho = renderer.getSize(new T.Vector2()), L = tamanho.x, A = tamanho.y;
    const colunas = lista.length > 1 ? 2 : 1, linhas = lista.length > 2 ? 2 : 1, lc = L / colunas, ac = A / linhas, formato = FRAME.l / FRAME.a;
    const w = Math.min(lc, ac * formato), h = w / formato;
    renderer.clear();
    // as sombras, uma vez só, com todos os corpos à vista (ver desenhar)
    vidro.visible = false;
    for (const c of CAMADAS_DOS_CORPOS) camera.layers.enable(c);
    camera.layers.disable(2);
    calcularSombras(camera);
    camera.layers.enable(2);
    camera.aspect = formato;
    camera.updateProjectionMatrix();
    arrumarHUD();
    renderer.setScissorTest(true);
    quadros = [];
    lista.forEach((r, i) => {
      const x = (i % colunas) * lc + (lc - w) / 2, y = Math.floor(i / colunas) * ac + (ac - h) / 2;   // (do canto de cima, à esquerda, da janela)
      encarnar(r);
      refrescarHUD();
      aplicarVisual();
      assentarMarcas();
      vila.focarSol(camera.position.x, camera.position.z);   // (cada robô com as sombras do lugar em que está)
      renderer.shadowMap.needsUpdate = true;
      renderer.setViewport(x, A - y - h, w, h);
      renderer.setScissor(x, A - y - h, w, h);
      for (const c of CAMADAS_DOS_CORPOS) if (c === r.camada) camera.layers.disable(c); else camera.layers.enable(c);
      refletirEspelhos(camera);
      renderer.render(cena, camera);
      quadros.push({ r, x, y, w, h });
      // a etiqueta do quadro: de quem são aqueles olhos
      const el = etiquetas[i] || (etiquetas[i] = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'olhos-de' })));
      Object.assign(el.style, { position: 'fixed', left: `${Math.round(tela.x + x + 10)}px`, top: `${Math.round(tela.y + y + h - 34)}px`, padding: '4px 10px', borderRadius: '999px', background: 'rgba(12, 16, 20, .78)', color: '#fff',
        font: '600 12.5px/1.3 system-ui, sans-serif', pointerEvents: 'none', zIndex: '4', borderLeft: `5px solid #${CORES_DOS_ROBOS[r.n].toString(16).padStart(6, '0')}` });
      el.textContent = r.nome + (r.modelo ? ' · ' + r.modelo : '') + (soEste ? ' — clique para ver todos' : '');
      el.hidden = false;
    });
    for (let i = lista.length; i < etiquetas.length; i++) etiquetas[i].hidden = true;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, L, A);
    camera.aspect = L / A;
    camera.updateProjectionMatrix();
    arrumarHUD();
    encarnar(daVez);
    refrescarHUD();
    aplicarVisual();
  }
  // Um clique num quadro da tela dividida: fica só aquele robô; com um só na tela, volta a mostrar todos.
  canvas.addEventListener('click', e => {
    if (!COLETIVO || vista.voando || !quadros.length) return;
    const x = e.clientX - tela.x, y = e.clientY - tela.y;   // (os quadros são contados do canto da imagem, não do da janela)
    const q = quadros.find(c => x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h);
    soEste = soEste ? null : q ? q.r : null;
    ultimoMosaico = 0;
  });

  // ---------- a tela cheia e o menu ao lado ----------
  // A página dos desafios tem dois arranjos. Quem assiste troca de um para o outro pela tecla B ou
  // pela pílula "tela cheia / menu ao lado"; a escolha fica guardada no navegador (e ?painel=lado
  // ou ?painel=cheia, no endereço, manda nela).
  //   tela cheia (o de sempre, e o que vale se ninguém escolheu): a imagem enche a janela, e os
  //     painéis de quem assiste ficam por cima dela, de vidro, nos cantos. O campo de quem joga e
  //     do que pretende fica no canto de baixo, à direita, em cima das pílulas. (Ele ficava
  //     embaixo, no meio, e tapava justamente o chão, que é onde estão as coisas de que a iA fala.)
  //   menu ao lado: a janela é repartida em duas — o palco, onde fica a imagem, e a bancada (#doca,
  //     em index.html), onde fica tudo o que é de quem assiste: a gravação, quem joga e o que
  //     pretende, o que o jogo disse, as teclas e as pílulas. Nada fica por cima da imagem, e ela
  //     tem o formato da que a iA recebe (FRAME): quem assiste vê exatamente o que ela vê, nem mais
  //     para os lados, nem menos. (No modo voador e na tela dividida do coletivo o desenho toma o
  //     palco inteiro.) A bancada é uma coluna à esquerda; numa janela mais quadrada, em que a
  //     coluna deixaria a imagem pequena demais, é uma faixa embaixo. O que sobrar da janela nesse
  //     sentido também é dela.
  const BANCADA = { lado: 340, ladoMaximo: 440, baixo: 208, baixoDoColetivo: 250, baixoMaximo: 330, folga: 0.9 };   // (folga: a coluna ganha mesmo com a imagem um pouco menor, porque nela cabe tudo, até a lista de teclas)
  const CHAVE_DO_ARRANJO = 'desafio.arranjo';
  let comBancada = false;
  try { comBancada = localStorage.getItem(CHAVE_DO_ARRANJO) === 'lado'; } catch (e) { }
  if (ENDERECO.get('painel') === 'lado') comBancada = true;
  if (ENDERECO.get('painel') === 'cheia') comBancada = false;
  const tela = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight, px: 0, pl: window.innerWidth, pa: window.innerHeight, chave: '' };   // onde a imagem está na janela (x, y, w, h), e o palco: onde ele começa (px) e o tamanho dele (pl, pa)
  // Reparte a janela. Devolve true quando alguma coisa mudou de lugar ou de tamanho.
  function repartir() {
    const L = window.innerWidth, A = window.innerHeight, formato = FRAME.l / FRAME.a, inteiro = vista.voando || variosOlhos();
    const gravacao = toca && toca.painel;       // (o painel de quem assiste a uma gravação: ver o fim do arquivo)
    const chave = [L, A, inteiro, comBancada, !!gravacao].join();
    if (chave === tela.chave) return false;
    tela.chave = chave;
    let lado = false, doca = 0, px = 0, pl = L, pa = A, w = L, h = A;
    if (comBancada) {
      const l = Math.max(360, L), a = Math.max(260, A), baixo = COLETIVO ? BANCADA.baixoDoColetivo : BANCADA.baixo;
      lado = Math.min(l - BANCADA.lado, a * formato) >= BANCADA.folga * Math.min(l, (a - baixo) * formato);   // (a largura da imagem com a coluna, e com a faixa)
      doca = Math.round(lado ? entre(l - a * formato, BANCADA.lado, BANCADA.ladoMaximo) : entre(a - l / formato, baixo, BANCADA.baixoMaximo));
      if (lado) { px = doca; pl = l - doca; pa = a; } else { pl = l; pa = a - doca; }
      w = Math.round(inteiro ? pl : Math.min(pl, pa * formato));
      h = Math.round(inteiro ? pa : Math.min(pa, pl / formato));
    }
    Object.assign(tela, { x: px + Math.floor((pl - w) / 2), y: Math.floor((pa - h) / 2), w, h, px, pl, pa });
    const raizDaPagina = document.documentElement.style;
    for (const [nome, valor] of [['--tela-x', tela.x], ['--tela-y', tela.y], ['--tela-l', w], ['--tela-a', h], ['--doca', doca]]) raizDaPagina.setProperty(nome, valor + 'px');
    for (const [classe, vale] of [['tela-cheia', !comBancada], ['bancada', comBancada], ['doca-lado', comBancada && lado], ['doca-baixo', comBancada && !lado]]) document.body.classList.toggle(classe, vale);
    // Cada painel no lugar que tem neste arranjo. A lista de teclas só mora na bancada quando ela é uma coluna: senão
    // fica solta, num canto da imagem em que o jogo não escreve (ver arrumarPaineis). O painel da gravação mora na
    // bancada, e solto na tela cheia. Na faixa, assistindo a uma gravação, o painel dela toma a esquerda, e o que o
    // jogo disse sobe para cima das pílulas.
    const pilulas = document.getElementById('pilulas'), bancada = document.getElementById('doca');
    elAjuda.classList.toggle('solta', !lado);
    const casa = comBancada && !lado && ASSISTINDO ? pilulas : bancada;
    if (elMensagem.parentNode !== casa) { if (casa === pilulas) pilulas.prepend(elMensagem); else bancada.insertBefore(elMensagem, elAjuda); }
    if (gravacao && gravacao.parentNode !== (comBancada ? bancada : document.body)) { if (comBancada) bancada.prepend(gravacao); else document.body.appendChild(gravacao); }
    for (const el of [elAjuda, gravacao]) {     // (quem estava solto e foi para a bancada larga o lugar que tinha; quem volta a ficar solto ganha um lugar de novo)
      if (!el) continue;
      for (const beira of ['left', 'top', 'right', 'bottom']) el.style.removeProperty(beira);
      delete el.dataset.onde;
    }
    return true;
  }
  // Troca o arranjo da página: 'cheia', 'lado' ou, sem dizer qual, o outro.
  const elArranjo = document.getElementById('arranjo');
  function mostrarArranjo() {
    if (!elArranjo) return;
    elArranjo.querySelectorAll('button').forEach(b => b.classList.toggle('acesa', (b.dataset.arranjo === 'lado') === comBancada));
    elArranjo.hidden = false;
  }
  function trocarArranjo(qual) {
    const novo = qual ? qual === 'lado' : !comBancada;
    if (novo === comBancada) return;
    comBancada = novo;
    try { localStorage.setItem(CHAVE_DO_ARRANJO, comBancada ? 'lado' : 'cheia'); } catch (e) { }
    mostrarArranjo();
    ajustarTamanho();
  }
  if (elArranjo) elArranjo.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    b.blur();                                   // (senão o Espaço, que numa gravação pausa, apertaria o botão de novo)
    trocarArranjo(b.dataset.arranjo);
  });
  function definirTamanho(l, a) {
    renderer.setSize(l, a, false);
    camera.aspect = voador.aspect = l / a;
    camera.updateProjectionMatrix();
    voador.updateProjectionMatrix();
    arrumarHUD();
  }
  // O que é desenhado por cima da imagem do robô, no tamanho e no lugar certos para o formato da câmera dele.
  function arrumarHUD() {
    // contador: 7% da altura da tela, centralizado no alto, a 1 m da câmera
    const meiaAltura = Math.tan(camera.fov * Math.PI / 360), alt = 0.14 * meiaAltura;
    contador.malha.scale.set(alt * 2.2, alt, 1);
    contador.malha.position.set(0, meiaAltura * 0.96 - alt / 2, -1);
    faixa.scale.set(meiaAltura * 2, meiaAltura / 2, 1);   // um quarto da altura da tela, pouco acima do meio
    faixa.position.set(0, meiaAltura * 0.25, -1);
    faixaDaDerrota.scale.copy(faixa.scale);
    faixaDaDerrota.position.copy(faixa.position);
    // inventário: 19% da altura da tela (menos, se a janela for estreita), centralizado no alto
    const li = Math.min(0.38 * meiaAltura * 1200 / 300, meiaAltura * camera.aspect * 1.8);
    inventario.malha.scale.set(li, li * 300 / 1200, 1);
    inventario.malha.position.set(0, meiaAltura * 0.97 - li * 300 / 2400, -1);
    // o indicador dos alvos: 10% da altura da tela, no canto de cima, à direita, na mesma faixa
    // do inventário (o alto da imagem é de quem é desenhado na tela: o que importa ver no mundo
    // fica abaixo dela). Numa janela estreita, em que ele entraria no inventário, fica embaixo dele.
    const hm = 0.2 * meiaAltura, lm = hm * mira.canvas.width / mira.canvas.height, direita = meiaAltura * camera.aspect * 0.985;
    const cabe = !REGRAS.inventario || direita - lm > li / 2 + 0.02 * meiaAltura;
    mira.malha.scale.set(lm, hm, 1);
    // a missão do robô (no coletivo): 11% da altura da tela, no canto de cima, à esquerda
    const am = 0.22 * meiaAltura, lmi = am * missao.canvas.width / missao.canvas.height;
    missao.malha.scale.set(lmi, am, 1);
    missao.malha.position.set(-direita + lmi / 2, meiaAltura * 0.97 - am / 2, -1);
    // (desafio 7) a peça que está na mão: 25% da altura da tela, no alto, no meio; e a faixa do fim: também no alto (acima do quadro), com 15% da altura, sem passar da largura da tela
    const hn = 0.5 * meiaAltura, lf = Math.min(0.3 * meiaAltura * fimDoQuebra.canvas.width / fimDoQuebra.canvas.height, 1.9 * meiaAltura * camera.aspect), hf = lf * fimDoQuebra.canvas.height / fimDoQuebra.canvas.width;
    naMao.malha.scale.set(hn * naMao.canvas.width / naMao.canvas.height, hn, 1);
    naMao.malha.position.set(0, meiaAltura * 0.97 - hn / 2, -1);
    fimDoQuebra.malha.scale.set(lf, hf, 1);
    fimDoQuebra.malha.position.set(0, meiaAltura * 0.97 - hf / 2, -1);
    // o mapa do carro: 56% da altura da tela, encostado na esquerda, abaixo do selo
    const lado = 1.12 * meiaAltura;
    mapa.malha.scale.set(lado, lado, 1);
    mapa.malha.position.set(-direita + lado / 2, -0.16 * meiaAltura, -1);
    mira.malha.position.set(direita - lm / 2, (cabe ? meiaAltura * 0.97 : inventario.malha.position.y - li * 300 / 2400 - 0.03 * meiaAltura) - hm / 2, -1);
  }
  // Acerta o tamanho da imagem com o da janela. É chamada a cada quadro, e só faz alguma coisa quando
  // a janela mudou de tamanho ou a imagem mudou de formato (a visão de quem assiste, a tela dividida).
  function ajustarTamanho(deQualquerJeito) {
    if (!repartir() && deQualquerJeito !== true) return;
    definirTamanho(tela.w, tela.h);
    ultimoMosaico = 0;                          // (redimensionar limpa o canvas: a tela dividida é desenhada de novo já)
    desenharQuer();                             // (o campo das intenções mostra as linhas que cabem no lugar que ele tem agora)
    arrumarPaineis();
    if (modoIA && !vista.voando) { if (variosOlhos()) desenharMosaico(performance.now()); else desenhar(); }   // (no modo iA a tela só muda quando a iA pede a imagem: sem isto ficaria preta)
  }
  window.addEventListener('resize', ajustarTamanho);

  let anterior = performance.now();
  let toca = null;                              // quem toca a gravação, quando a página está assistindo a uma (ver o fim do arquivo)
  function quadro(agora) {
    const real = Math.min(0.1, (agora - anterior) / 1000);
    anterior = agora;
    // Assistindo a uma gravação, o tempo é o dela: parado na pausa, mais depressa quando se acelera.
    const dt = ASSISTINDO ? (toca ? toca.passo(real) : 0) : real;
    if (ASSISTINDO) horaGravada += dt * 1000;   // o relógio do jogo (ver hora): entre um botão gravado e o outro ele anda com a gravação
    if (toca) toca.soltar();                    // os botões gravados cuja hora chegou
    const k = 1 - Math.exp(-dt * 14);
    if (COLETIVO) {                             // os outros robôs também andam; e quem sumiu sem sair deixa o lugar
      const daVez = atual;
      cadaRobo(r => { if (r !== daVez) { animarRobo(k); porCorpo(); } });
      if (!ASSISTINDO) for (const r of emJogo()) if (r.quem > 0 && agora - r.ativo > PARADO_DEMAIS) sairDoJogo(r);
    }
    animar(k, 1 - Math.exp(-dt * 5));
    if (vila.clima) vila.clima.passo(real);       // a hora do dia e a chuva da cidade
    animarPessoas(agora / 1000);                // quem mora ali respira, pisca e olha em volta (no relógio de verdade, mesmo com a gravação parada)
    soarEViver(agora / 1000, real);             // os sons que dependem de onde se está, e a vida da praça
    ajustarTamanho();                           // (a visão de quem assiste ou a tela dividida podem ter mudado o formato da imagem)
    if (vista.voando) { esconderEtiquetas(); aplicarVisual(); voar(real); desenharDeFora(); }   // quem assiste de fora vê tudo ao vivo, mesmo no modo iA
    else if (variosOlhos()) { if (!modoIA) desenharMosaico(agora); }                           // no coletivo, com mais de um robô: a tela dividida, um quadro para cada um
    else if (!modoIA) { esconderEtiquetas(); aplicarVisual(); desenhar(); }
    if (agora - ultimoArranjo > 250) { ultimoArranjo = agora; arrumarPaineis(); }   // (quatro vezes por segundo basta: a lista de teclas, quando está solta, sai de cima do que o jogo escreve)
    if (quebra && elPlacar && agora - ultimoPlacar > 500) { ultimoPlacar = agora; elPlacar.textContent = placarDoQuebra(); }   // (o relógio do quebra-cabeça, para quem assiste)
    requestAnimationFrame(quadro);
  }

  // ---------- HUD ----------
  const elLog = document.getElementById('log'), elStatus = document.getElementById('status');
  const elModo = document.getElementById('modo'), elAjuda = document.getElementById('ajuda');
  const elCaixa = document.getElementById('caixa'), elEntrada = document.getElementById('entrada');
  const elMensagem = document.getElementById('mensagem');
  elMensagem.textContent = REGRAS.mensagem;
  // A cara da página nos desafios 1 a 3 (as fontes e as caixas) está em index.html, sob esta classe.
  document.body.classList.add('desafio');
  if (ASSISTINDO) document.body.classList.add('assistindo');   // (assistindo a uma gravação a bancada se arruma de outro jeito: ver index.html)
  if (COLETIVO) document.body.classList.add('coletivo');
  if (REGRAS.quebraCabeca) document.body.classList.add('quebra');   // (no quebra-cabeça, na tela cheia, o campo de quem joga fica embaixo, no meio: ver index.html)
  // O som: uma pílula que diz se está ligado; um clique nela, ou a tecla O, liga e desliga.
  const elSom = document.getElementById('som');
  function mostrarSom() {
    if (!elSom) return;
    const b = elSom.querySelector('button');
    b.textContent = som.ligado ? 'som ligado' : 'som desligado';
    b.classList.toggle('acesa', som.ligado);
    elSom.hidden = false;
  }
  function alternarSom() {
    resposta('som', true, som.alternar() ? 'ligado' : 'desligado');
    mostrarSom();
  }
  if (elSom) elSom.querySelector('button').addEventListener('click', alternarSom);
  // as duas réguas de volume, a da música do violeiro e a dos efeitos
  if (elSom) for (const regua of elSom.querySelectorAll('input[data-som]')) {
    regua.value = String(Math.round(som.niveis[regua.dataset.som] * 100));
    regua.addEventListener('input', () => som.ajustar(regua.dataset.som, Number(regua.value) / 100));
    regua.addEventListener('change', () => regua.blur());   // (devolve o teclado ao jogo)
  }
  mostrarSom();
  // A lista de teclas, desenhada como teclas: em cima as do jogo, arrumadas como no teclado, e
  // embaixo as da página. Continua dizendo só quais existem, não o que cada uma faz.
  elAjuda.textContent = '';
  // (No modo voador as teclas do jogo dão lugar às de quem voa, que não são do jogo e por isso vêm explicadas: ver "o modo voador".)
  for (const [classe, fileiras, dica] of [['do-jogo', [REGRAS.passoDeLado ? ['Q', 'W', 'E'] : ['W'], ['A', 'S', 'D'], ['Espaço', 'Tab'], REGRAS.quebraCabeca ? ['L', 'F', 'X'] : ['L', 'T', 'F']]],   // (no quebra-cabeça o X desiste, e o T não serve para nada)
    ['do-voador', [['Q', 'W', 'E'], ['A', 'S', 'D'], ['Shift', 'Z', 'Esc']], 'W A S D voam · Q e E descem e sobem · Shift corre · Z vai até o robô · um clique prende o mouse, que passa a virar a câmera · Esc solta'],
    ['da-pagina', [['1', '2', '3', '4', '5', '6', '7'], ['V', 'M', 'C', 'Shift+T'], ['I', 'R', 'H', 'G', 'O', 'B'].concat(REGRAS.vila ? ['N', 'P'] : [])]]]) {
    const grupo = document.createElement('div');
    grupo.className = classe;
    for (const teclas of fileiras) {
      const fileira = document.createElement('div');
      fileira.className = 'fileira';
      for (const t of teclas) { const k = document.createElement('kbd'); k.textContent = t; fileira.appendChild(k); }
      grupo.appendChild(fileira);
    }
    if (dica) { const d = document.createElement('div'); d.className = 'dica'; d.textContent = dica; grupo.appendChild(d); }
    elAjuda.appendChild(grupo);
  }
  // Na tela cheia, a lista de teclas e o painel de quem assiste a uma gravação ficam soltos, por cima
  // da imagem. No menu ao lado os dois moram na bancada — menos a lista de teclas quando a bancada é
  // uma faixa embaixo, em que ela não cabe. Quem está solto não pode tapar o que o jogo
  // escreve na imagem — a missão, o inventário, o indicador do alvo e o mapa do carro (os lugares e
  // os tamanhos são os de arrumarHUD) —, nem na tela dividida, em que cada quadro tem os seus. Ela
  // vai para o lugar em que menos tapa, descendo pela beirada esquerda do palco e depois pela
  // direita: o que o jogo escreve pesa muito mais que o resto da imagem, e a margem que sobra ao
  // lado da imagem não pesa nada. Onde a imagem não tem nada no canto de cima, à esquerda (os
  // desafios 1 a 3), é lá que ela fica.
  let ultimoArranjo = 0, ultimoTeto = -1;
  function arrumarPaineis() {
    const L = tela.pl, A = tela.pa, BEIRA = 14, FOLGA = 6, DO_JOGO = 20, DE_PAINEL = 3;
    const soltos = [elAjuda.classList.contains('solta') ? elAjuda : null, document.querySelector('body > .gravacao')].filter(el => el && !el.hidden && el.offsetWidth);
    const ocupados = [[tela.x, tela.y, tela.w, tela.h, 1]];   // [x, y, largura, altura, peso]: a imagem inteira...
    for (const q of variosOlhos() && quadros.length ? quadros.map(c => ({ x: tela.x + c.x, y: tela.y + c.y, w: c.w, h: c.h, r: c.r })) : [tela]) {   // ...e, em cada quadro dela, o que o jogo escreve
      const larguraDoAlvo = 0.1 * q.h * mira.canvas.width / mira.canvas.height + 0.02 * q.w;
      ocupados.push([q.x + q.w - larguraDoAlvo, q.y, larguraDoAlvo, 0.125 * q.h, DO_JOGO]);                                  // o indicador do alvo
      ocupados.push(REGRAS.inventario ? [q.x + q.w / 2 - 0.39 * q.h, q.y, 0.78 * q.h, 0.215 * q.h, DO_JOGO] : [q.x + q.w / 2 - 0.09 * q.h, q.y, 0.18 * q.h, 0.1 * q.h, DO_JOGO]);   // o inventário, ou o contador
      if (REGRAS.vila) {
        const carro = (q.r ? q.r.estado : estado).dirigindo;
        ocupados.push([q.x, q.y, 0.01 * q.w + 0.53 * q.h, 0.135 * q.h, DO_JOGO]);                                             // a missão
        if (carro && !carro.viagem && !carroManual) ocupados.push([q.x, q.y + 0.29 * q.h, 0.01 * q.w + 0.57 * q.h, 0.58 * q.h, DO_JOGO]);   // o mapa do carro, enquanto ele aparece: dentro do carro parado (ver desenharMapa)
      }
    }
    for (const el of document.querySelectorAll('.painel')) {                                                               // os outros painéis da página
      if (soltos.includes(el) || el === elQuer || el.hidden || !el.offsetWidth) continue;   // (o campo de quem joga não conta: é ele que dá lugar a quem está solto, e não o contrário: ver o teto, abaixo)
      const r = el.getBoundingClientRect();
      ocupados.push([r.left, r.top, r.width, r.height, DE_PAINEL]);
    }
    for (const el of soltos) {
      const w = el.offsetWidth, h = el.offsetHeight;
      const tapa = (x, y) => {                   // quanto o painel taparia, posto ali
        let soma = 0;
        for (const [ox, oy, ow, oh, peso] of ocupados) {
          const lx = Math.min(x + w, ox + ow + FOLGA) - Math.max(x, ox - FOLGA), ly = Math.min(y + h, oy + oh + FOLGA) - Math.max(y, oy - FOLGA);
          if (lx > 0 && ly > 0) soma += peso * lx * ly;
        }
        return soma;
      };
      let lugar = [tela.px + BEIRA, BEIRA], menor = Infinity;
      for (const x of [tela.px + BEIRA, tela.px + L - w - BEIRA]) for (let y = BEIRA; y <= A - h - BEIRA && menor > 0; y += 4) { const t = tapa(x, y); if (t < menor) { menor = t; lugar = [x, y]; } }
      const onde = `${Math.round(lugar[0])},${Math.round(lugar[1])}`;
      if (el.dataset.onde !== onde) {
        el.dataset.onde = onde;
        for (const [lado, valor] of [['left', Math.round(lugar[0]) + 'px'], ['top', Math.round(lugar[1]) + 'px'], ['right', 'auto'], ['bottom', 'auto']]) el.style.setProperty(lado, valor, 'important');
      }
      ocupados.push([lugar[0], lugar[1], w, h, DO_JOGO]);
    }
    // Na tela cheia, o campo de quem joga fica no canto de baixo, à direita, e cresce para cima. O teto dele é o
    // indicador do alvo, no alto da imagem, ou o pé de quem estiver solto desse lado (a lista de teclas, na cidade).
    let teto = Math.round(0.14 * window.innerHeight);
    if (!comBancada) for (const el of soltos) { const r = el.getBoundingClientRect(); if (r.right > window.innerWidth - 14 - 380 - FOLGA) teto = Math.max(teto, Math.round(r.bottom) + 8); }
    if (teto !== ultimoTeto) {
      ultimoTeto = teto;
      document.documentElement.style.setProperty('--teto', teto + 'px');
      desenharQuer();                           // (as linhas que cabem agora)
    }
  }
  const linhas = [REGRAS.mensagem];
  let destacado = null, ultima = null;
  // Painel de depuração: mostra tudo o que o jogo esconde, então não pode estar ao alcance
  // de quem joga. Não há tecla para ele; só abre com ?depurar no endereço da página.
  if (ENDERECO.has('depurar')) {
    elLog.hidden = elStatus.hidden = false;
    elMensagem.hidden = true;
  }

  // Todo comando termina aqui, então é aqui que a borda de destaque e o painel de
  // depuração são atualizados. Não devolve nada: o jogador não fica sabendo o resultado.
  let depressa = false;                         // (a gravação está pulando para outro ponto: os botões são refeitos de uma vez, sem desenhar nem tocar nada a cada um: ver o fim do arquivo)
  function resposta(comando, ok, mensagem) {
    ultima = { comando, ok, mensagem };
    if (depressa) { alvoAtual(); return; }      // (pulando para outro ponto de uma gravação: fica só o que muda o jogo — alvoAtual esquece o alvo escolhido que saiu do alcance; o que é de ver e de ouvir fica para o fim do pulo: ver mostrarOJogo)
    som.doQueAconteceu(comando, ok, mensagem, estado);   // (o som de cada coisa, para quem assiste)
    linhas.push(`› ${comando} — ${mensagem}`);
    if (linhas.length > 6) linhas.shift();
    elLog.textContent = '';
    linhas.forEach((t, i) => {
      const d = document.createElement('div');
      d.textContent = t;
      if (i === linhas.length - 1) d.className = 'ultima';
      elLog.appendChild(d);
    });
    mostrarOJogo();
  }
  // O que o jogo desenha por cima da imagem e escreve na página, como está agora: a borda do alvo, os
  // números dos alvos e o indicador, o selo e o mapa, o contador, o inventário, as contas do
  // quebra-cabeça e o painel de depuração. Não muda nada no jogo.
  function mostrarOJogo() {
    if (destacado) destacado.contorno.visible = false;
    destacado = alvoAtual();
    if (destacado) destacado.contorno.visible = true;
    marcarAlvos();                              // os números de todos os alvos possíveis e o indicador de qual é o atual
    if (REGRAS.vila) { desenharMissao(); desenharMapa(); }   // (o selo do canto — a missão do coletivo, ou para onde o carro vai — e o mapa do carro)
    const s = salas[estado.sala];
    const feitos = s.objetos.filter(o => o.naCesta || o.entregue).length;   // guardados na cesta ou entregues
    if (REGRAS.contador) desenharContador(`${feitos}/${s.objetos.length}`);
    if (REGRAS.inventario) desenharInventario();
    if (quebra && elPlacar) elPlacar.textContent = placarDoQuebra();   // (as contas do quebra-cabeça, para quem assiste)
    elStatus.textContent = `desafio: ${DESAFIO}\nsala: ${numero(s.n)}\nfeitos: ${feitos}/${s.objetos.length}\n` +
      `na cabeça: ${estado.naCabeca ? estado.naCabeca.nome : 'nada'}\nmão: ${estado.maoLevantada ? 'levantada' : 'abaixada'}\n` +
      `segurando: ${estado.segurando ? estado.segurando.nome : 'nada'}\npeito: ${estado.texto || '—'}` +
      (pessoa ? `\npessoa: ${pessoa.fala ? `"${pessoa.fala}"` : 'calada'}` : '');
  }

  // ---------- o quebra-cabeça (desafio 7) ----------
  // Na parede do fundo da sala há um quadro de 3 x 3 casas, vazio, e ao lado dele a bandeja com as 9
  // peças de uma figura, embaralhadas e giradas. Montar a figura no quadro é a vitória. As peças são
  // quadradas: o que diz onde cada uma vai é só o desenho (e a margem clara da figura, que as da
  // beirada têm num lado, e as dos cantos, em dois).
  //
  //   de mão vazia:   os alvos são as 9 peças, cada uma com o seu número (o lugar dela na bandeja,
  //                   de 1 a 9; o número vai com ela para o quadro). O ESPACO pega a peça: ela some
  //                   do lugar e aparece no alto da imagem, "na mão".
  //   com uma peça:   os alvos são as 9 casas do quadro (numeradas como se lê: 1 a 3 em cima, 7 a 9
  //                   embaixo) e, com o número 0, o lugar dela na bandeja. O ESPACO põe a peça na
  //                   casa; se lá já há uma peça, as duas trocam e a outra vem para a mão.
  //   L:              gira um quarto de volta, no sentido horário, a peça da mão — ou, de mão vazia,
  //                   a peça que é o alvo, onde ela estiver.
  //   SAIR:           desiste. O jogo acaba como está.
  //
  // Só é alvo o que aparece na imagem (ver aVistaNaParede). O jogo não diz se uma peça está certa:
  // ele acaba sozinho quando as nove estão no lugar e de pé — ou quando a iA desiste.
  //
  // No fim sai a pontuação, de 0 a 100 (ver pontuarQuebra): contam as peças certas, quantas peças
  // foram colocadas, quantos giros e o tempo, que corre desde o primeiro botão (o F também vale: é
  // quando a iA começa a olhar). Quem assiste vê essas contas ao vivo, no campo de quem joga, na página;
  // a iA só as vê no fim, numa faixa na imagem, e na resposta do botão que acabou o jogo.
  //
  // Qual figura, onde cada peça começa e quanto ela está girada saem da `sorte` da partida (um
  // número, como na vila coletiva: `?sorte=N` repete uma partida), que vai no resumo da gravação.
  //   lado: o tamanho de uma casa; peca: o de uma peça; passo: de uma peça à outra, na bandeja (lá elas ficam separadas);
  //   y: a altura do meio do quadro (a dos olhos do robô, que aqui olha reto: a parede sai na imagem sem entortar);
  //   quadro e bandeja: o x do meio de cada um (olhando para a parede, +x é a esquerda);
  //   tempo: até `pleno` os pontos do tempo são todos; em `zero`, nenhum; pontos: quanto vale cada parte
  const QUEBRA = { lado: 0.345, peca: 0.332, passo: 0.39, y: ALTURA_OLHOS, quadro: 0.79, bandeja: -0.79,
    tempo: { pleno: 5 * 60000, zero: 30 * 60000 }, pontos: { pecas: 60, jogadas: 15, giros: 10, tempo: 15 } };
  const quebra = REGRAS.quebraCabeca ? { sorte: 0, figura: 0, pecas: [], casas: [], vagas: [], naMao: null, giros: 0, girosMinimos: 0, jogadas: 0, postasCertas: 0, postasErradas: 0,
    comeco: null, fim: null, desistiu: false, pontos: 0, contas: null, novidade: false, tela: null, textura: null } : null;

  // As figuras, desenhadas aqui mesmo (o jogo não tem arquivos de imagem), num quadrado de 768 pontos.
  // Cada uma é pensada para ser cortada em 3 x 3: nenhuma das nove partes fica lisa nem igual a
  // outra, e as coisas atravessam de uma parte para a vizinha — é por aí que se monta.
  const FIGURAS = (() => {
    const bola = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); };
    const oval = (c, x, y, rx, ry) => { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 7); c.fill(); };
    const forma = (c, pontos) => { c.beginPath(); pontos.forEach(([x, y], i) => { if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.closePath(); c.fill(); };
    const risco = (c, x1, y1, x2, y2) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); };
    const nuvem = (c, x, y, s, cor) => {
      c.fillStyle = cor || '#ffffff';
      for (const [dx, dy, r] of [[-1.0, 0.2, 0.5], [-0.35, -0.2, 0.75], [0.45, -0.05, 0.62], [1.05, 0.22, 0.45]]) bola(c, x + dx * s, y + dy * s, r * s);
      c.fillRect(x - 1.05 * s, y + 0.2 * s, 2.15 * s, 0.5 * s);
    };
    const aves = (c, x, y, cor) => {
      c.strokeStyle = cor || '#2c3440'; c.lineWidth = 5; c.lineCap = 'round';
      for (const [dx, dy, s] of [[0, 0, 1], [46, 22, 0.8], [-38, 30, 0.7]]) { c.beginPath(); c.moveTo(x + dx - 16 * s, y + dy); c.quadraticCurveTo(x + dx - 7 * s, y + dy - 12 * s, x + dx, y + dy); c.quadraticCurveTo(x + dx + 7 * s, y + dy - 12 * s, x + dx + 16 * s, y + dy); c.stroke(); }
    };
    const flores = (c, lista) => { for (const [x, y, cor] of lista) { c.fillStyle = cor; for (let i = 0; i < 5; i++) bola(c, x + Math.cos(i * 1.257) * 8, y + Math.sin(i * 1.257) * 8, 6); c.fillStyle = '#ffd23f'; bola(c, x, y, 5); } };
    const estrela = (c, x, y, r) => { c.fillStyle = '#fff6c9'; forma(c, [[x, y - r], [x + r * 0.28, y - r * 0.28], [x + r, y], [x + r * 0.28, y + r * 0.28], [x, y + r], [x - r * 0.28, y + r * 0.28], [x - r, y], [x - r * 0.28, y - r * 0.28]]); };
    // a margem clara em volta da figura, com um fio escuro por dentro
    const margem = (c, L) => { c.strokeStyle = '#fbf7ee'; c.lineWidth = 28; c.strokeRect(14, 14, L - 28, L - 28); c.strokeStyle = '#3a2f26'; c.lineWidth = 4; c.strokeRect(30, 30, L - 60, L - 60); };
    return [
      (c, L) => {                                // o sítio: o sol, as montanhas, a casa, a macieira, o lago e o caminho
        const ceu = c.createLinearGradient(0, 0, 0, L * 0.6);
        ceu.addColorStop(0, '#6db8ee'); ceu.addColorStop(1, '#d8effb');
        c.fillStyle = ceu; c.fillRect(0, 0, L, L);
        c.fillStyle = '#ffd23f'; bola(c, 128, 124, 56);
        c.strokeStyle = '#ffb703'; c.lineWidth = 9; c.lineCap = 'round';
        for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; risco(c, 128 + Math.cos(a) * 72, 124 + Math.sin(a) * 72, 128 + Math.cos(a) * 96, 124 + Math.sin(a) * 96); }
        nuvem(c, 392, 98, 44); nuvem(c, 668, 182, 32);
        aves(c, 590, 66);
        c.fillStyle = '#7d8fb0'; forma(c, [[-20, 420], [150, 205], [320, 420]]);
        c.fillStyle = '#6b7c9e'; forma(c, [[210, 420], [430, 168], [650, 420]]);
        c.fillStyle = '#8796b6'; forma(c, [[540, 420], [700, 236], [800, 420]]);
        c.fillStyle = '#ffffff';
        forma(c, [[150, 205], [121, 242], [140, 236], [152, 252], [166, 236], [180, 243]]);
        forma(c, [[430, 168], [392, 212], [416, 204], [432, 224], [448, 204], [470, 214]]);
        forma(c, [[700, 236], [674, 266], [692, 260], [702, 274], [714, 260], [727, 267]]);
        c.fillStyle = '#7cc66a'; c.beginPath(); c.moveTo(0, 430); c.bezierCurveTo(180, 350, 330, 440, 520, 398); c.bezierCurveTo(640, 372, 720, 408, L, 386); c.lineTo(L, L); c.lineTo(0, L); c.fill();
        c.fillStyle = '#5fb04f'; c.beginPath(); c.moveTo(0, 566); c.bezierCurveTo(200, 506, 420, 606, L, 524); c.lineTo(L, L); c.lineTo(0, L); c.fill();
        c.fillStyle = '#2f7d3f'; forma(c, [[92, 396], [58, 470], [126, 470]]); forma(c, [[92, 432], [50, 512], [134, 512]]);   // um pinheiro
        c.fillStyle = '#7a4a2a'; c.fillRect(84, 512, 16, 30);
        c.fillStyle = '#e6c15a'; c.beginPath(); c.arc(190, 520, 40, Math.PI, 0); c.fill();                                // um monte de feno
        c.strokeStyle = '#e3c58f'; c.lineWidth = 46; c.lineCap = 'butt'; c.beginPath(); c.moveTo(380, 520); c.bezierCurveTo(362, 624, 222, 602, 152, 700); c.lineTo(118, 790); c.stroke();
        c.fillStyle = '#f4e3c1'; c.fillRect(300, 392, 170, 134);
        c.fillStyle = '#8e5a3c'; c.fillRect(426, 314, 24, 56);
        c.fillStyle = '#c0392b'; forma(c, [[278, 396], [385, 300], [492, 396]]);
        c.fillStyle = '#7a4a2a'; c.fillRect(360, 452, 40, 74);
        c.fillStyle = '#9fd3f0'; c.fillRect(315, 420, 34, 34); c.fillRect(420, 420, 34, 34);
        c.fillStyle = 'rgba(255,255,255,0.9)'; bola(c, 444, 292, 13); bola(c, 460, 262, 17); bola(c, 452, 226, 21);
        c.fillStyle = '#7a4a2a'; c.fillRect(628, 430, 26, 132);
        c.fillStyle = '#2f8f46'; bola(c, 641, 398, 66); c.fillStyle = '#3ea457'; bola(c, 608, 432, 42); bola(c, 678, 434, 44);
        c.fillStyle = '#e74c3c'; for (const [x, y] of [[612, 380], [660, 372], [640, 422], [686, 412]]) bola(c, x, y, 8);
        c.fillStyle = '#4aa3df'; oval(c, 612, 668, 128, 52);
        c.fillStyle = '#ffffff'; oval(c, 600, 662, 20, 12); bola(c, 618, 650, 9);
        c.fillStyle = '#f39c12'; forma(c, [[626, 650], [641, 654], [626, 657]]);
        c.strokeStyle = '#8e5a3c'; c.lineWidth = 8;
        for (let x = 44; x <= 212; x += 42) risco(c, x, 600, x, 656);
        risco(c, 34, 616, 222, 616); risco(c, 34, 640, 222, 640);
        flores(c, [[70, 708, '#e84393'], [250, 724, '#ffffff'], [330, 680, '#e84393'], [452, 712, '#9b59b6'], [520, 620, '#ffffff'], [700, 590, '#e84393'], [716, 726, '#9b59b6']]);
        margem(c, L);
      },
      (c, L) => {                                // o mar no fim da tarde: o sol no horizonte, o veleiro e o farol
        const ceu = c.createLinearGradient(0, 0, 0, 420);
        ceu.addColorStop(0, '#3b2d6b'); ceu.addColorStop(0.55, '#e0647a'); ceu.addColorStop(1, '#ffc46b');
        c.fillStyle = ceu; c.fillRect(0, 0, L, 420);
        c.fillStyle = '#f5f0d8'; bola(c, 100, 96, 34); c.fillStyle = '#4b3373'; bola(c, 116, 86, 30);                      // a lua
        for (const [x, y, r] of [[214, 66, 12], [312, 138, 9], [520, 72, 13], [704, 56, 10], [600, 132, 8], [64, 200, 9], [438, 176, 8]]) estrela(c, x, y, r);
        nuvem(c, 250, 262, 30, 'rgba(255,255,255,0.4)'); nuvem(c, 520, 228, 26, 'rgba(255,255,255,0.4)');
        c.fillStyle = '#fff1a8'; bola(c, 384, 420, 84);
        const mar = c.createLinearGradient(0, 420, 0, L);
        mar.addColorStop(0, '#2f7fb8'); mar.addColorStop(1, '#123d6b');
        c.fillStyle = mar; c.fillRect(0, 420, L, L - 420);
        c.fillStyle = 'rgba(255, 220, 130, 0.8)'; for (let i = 0; i < 7; i++) c.fillRect(314 + i * 8, 438 + i * 27, 140 - i * 16, 10);
        aves(c, 470, 330);
        c.fillStyle = 'rgba(255, 240, 160, 0.38)'; forma(c, [[628, 198], [300, 120], [300, 210]]);                         // o facho do farol
        c.fillStyle = '#4a4f57'; forma(c, [[536, 566], [590, 470], [680, 452], [L, 500], [L, 604]]);                       // a pedra
        for (let i = 0; i < 5; i++) {                                                                                       // a torre, listrada
          const y1 = 470 - i * 52, y2 = y1 - 52, l1 = 30 - i * 2.4, l2 = 30 - (i + 1) * 2.4;
          c.fillStyle = i % 2 ? '#ffffff' : '#d63031'; forma(c, [[642 - l1, y1], [642 + l1, y1], [642 + l2, y2], [642 - l2, y2]]);
        }
        c.fillStyle = '#2b2b2b'; c.fillRect(618, 184, 48, 26);
        c.fillStyle = '#ffe66d'; c.fillRect(628, 190, 28, 15);
        c.fillStyle = '#d63031'; forma(c, [[610, 184], [642, 150], [674, 184]]);
        c.fillStyle = '#7a4a2a'; forma(c, [[70, 470], [272, 470], [240, 508], [100, 508]]);                                // o veleiro
        c.strokeStyle = '#4b3323'; c.lineWidth = 6; risco(c, 170, 470, 170, 246);
        c.fillStyle = '#ffffff'; forma(c, [[177, 262], [177, 456], [264, 456]]);
        c.fillStyle = '#e74c3c'; forma(c, [[163, 292], [163, 456], [92, 456]]);
        c.fillStyle = '#ffd23f'; forma(c, [[170, 246], [202, 255], [170, 266]]);
        c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 5; c.lineCap = 'round';
        for (const [x, y] of [[60, 566], [250, 600], [470, 574], [90, 716], [300, 690], [520, 722], [660, 646], [700, 730]]) { c.beginPath(); c.moveTo(x - 34, y); c.quadraticCurveTo(x - 17, y - 14, x, y); c.quadraticCurveTo(x + 17, y + 14, x + 34, y); c.stroke(); }
        c.fillStyle = '#ff9f43'; oval(c, 158, 636, 34, 16); forma(c, [[124, 636], [98, 618], [98, 654]]);                   // um peixe
        c.fillStyle = '#1e272e'; bola(c, 176, 632, 4);
        c.strokeStyle = '#1e272e'; c.lineWidth = 6; risco(c, 402, 612, 402, 660);                                           // uma boia
        c.fillStyle = '#d63031'; oval(c, 402, 664, 30, 18); c.fillStyle = '#ffffff'; c.fillRect(380, 660, 44, 8);
        c.fillStyle = '#ffd23f'; forma(c, [[402, 612], [428, 620], [402, 630]]);
        c.fillStyle = '#8e5a3c'; forma(c, [[600, 692], [716, 692], [698, 720], [618, 720]]);                               // um bote
        c.strokeStyle = '#4b3323'; c.lineWidth = 5; risco(c, 640, 690, 606, 662); risco(c, 680, 690, 720, 664);
        margem(c, L);
      },
      (c, L) => {                                // os balões: um balão grande no meio do céu, a pipa, o avião e o vale lá embaixo
        const ceu = c.createLinearGradient(0, 0, 0, L);
        ceu.addColorStop(0, '#7cc4f2'); ceu.addColorStop(1, '#eaf7ff');
        c.fillStyle = ceu; c.fillRect(0, 0, L, L);
        nuvem(c, 112, 112, 40); nuvem(c, 652, 92, 46); nuvem(c, 92, 428, 30); nuvem(c, 684, 392, 36);
        aves(c, 122, 318);
        c.fillStyle = '#8ad07a'; c.beginPath(); c.moveTo(0, 620); c.bezierCurveTo(160, 560, 300, 640, 470, 610); c.bezierCurveTo(600, 588, 700, 630, L, 596); c.lineTo(L, L); c.lineTo(0, L); c.fill();
        c.fillStyle = '#69b85c'; c.beginPath(); c.moveTo(0, 700); c.bezierCurveTo(220, 650, 480, 730, L, 668); c.lineTo(L, L); c.lineTo(0, L); c.fill();
        c.strokeStyle = '#4aa3df'; c.lineWidth = 30; c.lineCap = 'butt'; c.beginPath(); c.moveTo(-10, 660); c.bezierCurveTo(140, 640, 190, 740, 330, 716); c.bezierCurveTo(430, 700, 470, 760, 520, 790); c.stroke();   // o rio
        c.fillStyle = '#f4e3c1'; c.fillRect(70, 596, 74, 52); c.fillStyle = '#c0392b'; forma(c, [[58, 600], [107, 562], [156, 600]]); c.fillStyle = '#7a4a2a'; c.fillRect(98, 618, 18, 30);   // uma casinha
        c.fillStyle = '#7a4a2a'; c.fillRect(604, 632, 14, 44); c.fillRect(690, 646, 14, 44);                                // duas árvores
        c.fillStyle = '#2f8f46'; bola(c, 611, 614, 34); bola(c, 697, 630, 30);
        c.fillStyle = '#f4e3c1'; forma(c, [[540, 668], [570, 668], [564, 598], [546, 598]]);                               // um moinho
        c.strokeStyle = '#8e5a3c'; c.lineWidth = 7; c.lineCap = 'round'; risco(c, 517, 566, 593, 634); risco(c, 593, 566, 517, 634);
        c.save();                                                                                                           // o balão grande, de gomos coloridos
        c.beginPath(); c.ellipse(384, 290, 150, 176, 0, 0, 7); c.clip();
        ['#e74c3c', '#f39c12', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6'].forEach((cor, i) => { c.fillStyle = cor; c.fillRect(234 + i * 50, 100, 50, 380); });
        c.fillStyle = 'rgba(255,255,255,0.22)'; c.beginPath(); c.ellipse(330, 230, 46, 96, 0.3, 0, 7); c.fill();
        c.restore();
        c.fillStyle = '#c0392b'; forma(c, [[338, 448], [430, 448], [408, 502], [360, 502]]);
        c.strokeStyle = '#4b3323'; c.lineWidth = 4; risco(c, 362, 502, 366, 544); risco(c, 406, 502, 402, 544);
        c.fillStyle = '#a9743f'; c.fillRect(360, 544, 48, 40);
        c.strokeStyle = '#7a4a2a'; c.lineWidth = 3; for (let y = 554; y < 584; y += 10) risco(c, 360, y, 408, y);
        c.fillStyle = '#e84393'; forma(c, [[196, 150], [236, 204], [196, 262], [156, 204]]);                               // a pipa, com a rabiola
        c.fillStyle = '#ffd23f'; forma(c, [[196, 150], [236, 204], [196, 204]]); forma(c, [[196, 204], [196, 262], [156, 204]]);
        c.strokeStyle = '#2c3440'; c.lineWidth = 3; c.beginPath(); c.moveTo(196, 262); c.bezierCurveTo(170, 300, 214, 326, 186, 360); c.bezierCurveTo(168, 384, 200, 402, 190, 426); c.stroke();
        c.fillStyle = '#3498db'; for (const [x, y] of [[188, 300], [200, 338], [180, 372], [192, 410]]) forma(c, [[x - 12, y - 6], [x, y], [x - 12, y + 6]]);
        c.fillStyle = '#dfe6e9'; oval(c, 600, 196, 52, 15);                                                                 // o avião
        c.fillStyle = '#b2bec3'; forma(c, [[588, 196], [622, 196], [600, 236], [582, 236]]); forma(c, [[588, 196], [622, 196], [606, 164], [590, 164]]); forma(c, [[552, 196], [566, 196], [552, 172], [542, 172]]);
        c.fillStyle = '#2d3436'; bola(c, 638, 192, 6);
        c.fillStyle = '#ffffff'; bola(c, 660, 292, 44);                                                                     // um balão pequeno
        c.fillStyle = '#0984e3'; c.beginPath(); c.arc(660, 292, 44, -Math.PI / 2, Math.PI / 2); c.fill();
        c.strokeStyle = '#4b3323'; c.lineWidth = 3; risco(c, 640, 330, 650, 356); risco(c, 680, 330, 670, 356);
        c.fillStyle = '#a9743f'; c.fillRect(648, 356, 24, 18);
        margem(c, L);
      },
    ];
  })();

  // Onde ficam, na parede, o meio de uma casa do quadro e o de um lugar da bandeja: [x, y].
  const casaXY = (lin, col) => [QUEBRA.quadro + (1 - col) * QUEBRA.lado, QUEBRA.y + (1 - lin) * QUEBRA.lado];
  const vagaXY = i => [QUEBRA.bandeja + (1 - i % 3) * QUEBRA.passo, QUEBRA.y + (1 - Math.floor(i / 3)) * QUEBRA.passo];
  // Monta, na parede do fundo da sala `s`, o quadro, a bandeja e as nove peças; e sorteia a partida.
  function montarQuebraCabeca(s) {
    const q = quebra, g = s.grupo, parede = SALA.P / 2, zPeca = parede - 0.022, { lado, peca, passo, y: Y } = QUEBRA;
    q.tela = document.createElement('canvas');
    q.tela.width = q.tela.height = 768;
    q.textura = new T.CanvasTexture(q.tela);
    q.textura.colorSpace = T.SRGBColorSpace;
    q.textura.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const figura = luminoso({ map: q.textura }), corpo = mat(0xf4efe4, { roughness: 0.6 });
    const feltro = mat(0x2c3d35, { roughness: 0.95 }), fio = mat(0x566b5f, { roughness: 0.9 }), cortica = mat(0xcbb48a, { roughness: 0.85 }), rebaixo = mat(0xb19868, { roughness: 0.9 });
    // a borda de destaque de uma casa, de um lugar da bandeja ou de uma peça: quatro barrinhas acesas, na frente dela
    const borda = (pai, x, y, z, tam) => {
      const b = new T.Group(), e = 0.014;
      b.position.set(x, y, z);
      pai.add(b);
      for (const lado of [-1, 1]) { malha(b, new T.BoxGeometry(tam + e, e, 0.006), M.destaque, 0, lado * tam / 2, 0); malha(b, new T.BoxGeometry(e, tam + e, 0.006), M.destaque, lado * tam / 2, 0, 0); }
      b.visible = false;
      return b;
    };
    const plaquinha = (texto, x) => malha(g, new T.PlaneGeometry(0.34, 0.075), mat(0xffffff, { roughness: 0.5, map: texturaCanvas(408, 90, (c, l, a) => {
      c.fillStyle = '#1b2c47'; c.fillRect(0, 0, l, a);
      c.strokeStyle = '#c9a45c'; c.lineWidth = 5; c.strokeRect(6, 6, l - 12, a - 12);
      c.fillStyle = '#ecdcb4'; c.font = 'bold 54px Georgia, "Times New Roman", serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(texto, l / 2, a / 2 + 4);
    }) }), x, Y - 1.5 * lado - 0.115, parede - 0.012).rotation.y = Math.PI;   // (embaixo: em cima fica o que o jogo escreve na imagem)
    // o quadro: a moldura de nogueira, o fundo de feltro e os fios que separam as nove casas
    const xq = QUEBRA.quadro, xb = QUEBRA.bandeja, meio = 1.5 * lado;
    malha(g, new T.BoxGeometry(3 * lado, 3 * lado, 0.01), feltro, xq, Y, parede - 0.005);
    for (const d of [-1, 1]) {
      fazSombra(malha(g, new T.BoxGeometry(3 * lado + 0.08, 0.04, 0.04), M.nogueira, xq, Y + d * (meio + 0.02), parede - 0.02));
      fazSombra(malha(g, new T.BoxGeometry(0.04, 3 * lado, 0.04), M.nogueira, xq + d * (meio + 0.02), Y, parede - 0.02));
      malha(g, new T.BoxGeometry(0.005, 3 * lado, 0.002), fio, xq + d * lado / 2, Y, parede - 0.011);
      malha(g, new T.BoxGeometry(3 * lado, 0.005, 0.002), fio, xq, Y + d * lado / 2, parede - 0.011);
    }
    plaquinha('QUADRO', xq);
    // a bandeja: uma placa de cortiça com nove rebaixos, um para cada peça
    malha(g, new T.BoxGeometry(2 * passo + lado + 0.07, 2 * passo + lado + 0.07, 0.012), cortica, xb, Y, parede - 0.006);
    plaquinha('PEÇAS', xb);
    for (let i = 0; i < 9; i++) {
      const lin = Math.floor(i / 3), col = i % 3, [cx, cy] = casaXY(lin, col), [vx, vy] = vagaXY(i);
      malha(g, new T.BoxGeometry(lado, lado, 0.002), rebaixo, vx, vy, parede - 0.013);
      // (ponto: onde fica o número, na imagem — no canto de cima, à esquerda, para não tapar o desenho)
      const casa = { nome: 'casa', ehCasa: true, numero: i + 1, lin, col, x: cx, y: cy, z: zPeca, peca: null, contorno: borda(g, cx, cy, parede - 0.036, lado - 0.012),
        ponto() { return new T.Vector3(this.x + lado / 2 - 0.05, this.y + lado / 2 - 0.05, parede - 0.04); } };
      const vaga = { nome: 'bandeja', ehVaga: true, numero: 0, x: vx, y: vy, z: zPeca, peca: null, contorno: borda(g, vx, vy, parede - 0.036, lado - 0.012),
        ponto() { return new T.Vector3(this.x + lado / 2 + 0.012, this.y + lado / 2 + 0.012, parede - 0.04); } };
      // a peça: uma plaquinha clara com a sua parte da figura na frente. O `disco` é o que gira; a frente dela olha para a sala.
      const grupo = new T.Group(), disco = new T.Group();
      grupo.rotation.y = Math.PI;
      grupo.add(disco);
      g.add(grupo);
      malha(disco, new T.BoxGeometry(peca, peca, 0.014), corpo, 0, 0, 0).castShadow = true;
      const face = malha(disco, new T.PlaneGeometry(peca - 0.008, peca - 0.008), figura, 0, 0, 0.0074);
      face.receiveShadow = false;
      // (lin, col: a casa em que ela é a certa; giro: quantos quartos de volta, no sentido horário, ela está fora de pé; lugar: a casa ou a vaga em que está — null: na mão)
      const p = { nome: 'peça', ehPeca: true, numero: i + 1, lin: 0, col: 0, giro: 0, lugar: null, grupo, disco, face, contorno: borda(grupo, 0, 0, 0.014, peca + 0.004),
        get x() { return (this.lugar || q.vagas[this.numero - 1]).x; }, get z() { return zPeca; },
        ponto() { return (this.lugar || q.vagas[this.numero - 1]).ponto(); } };
      q.casas.push(casa); q.vagas.push(vaga); q.pecas.push(p);
    }
    const pedida = /^\d{1,9}$/.test(ENDERECO.get('sorte') || '') ? Number(ENDERECO.get('sorte')) : null;
    embaralharQuebra(ASSISTINDO ? 0 : pedida !== null ? pedida : 1 + Math.floor(Math.random() * 0x7fffffff));   // (assistindo, vale a sorte da gravação: ver o fim do arquivo)
  }
  // A peça no lugar em que está (ou fora da parede, se está na mão), virada como o giro dela manda.
  function assentarPeca(p) {
    p.grupo.visible = !!p.lugar;
    if (p.lugar) p.grupo.position.set(p.lugar.x, p.lugar.y, p.lugar.z);
    p.disco.rotation.z = -p.giro * Math.PI / 2;  // (a frente da peça olha para quem joga: girar no sentido horário é um ângulo negativo)
  }
  // Começa a partida de sorte `n`: escolhe a figura, embaralha as peças na bandeja e gira cada uma.
  function embaralharQuebra(n) {
    const q = quebra, acaso = aleatorio(Math.imul(n + 1, 0x9e3779b1) >>> 0), ordem = [0, 1, 2, 3, 4, 5, 6, 7, 8];   // (a sorte é espalhada antes: duas sortes vizinhas dão partidas que não se parecem)
    Object.assign(q, { sorte: n, figura: Math.floor(acaso() * FIGURAS.length), naMao: null, giros: 0, jogadas: 0, postasCertas: 0, postasErradas: 0, comeco: null, fim: null, desistiu: false, pontos: 0, contas: null, novidade: false });
    const c = q.tela.getContext('2d');
    c.clearRect(0, 0, 768, 768);
    c.save(); FIGURAS[q.figura](c, 768); c.restore();
    q.textura.needsUpdate = true;
    for (let i = ordem.length - 1; i > 0; i--) { const j = Math.floor(acaso() * (i + 1)); [ordem[i], ordem[j]] = [ordem[j], ordem[i]]; }
    for (const casa of q.casas) casa.peca = null;
    q.pecas.forEach((p, i) => {
      Object.assign(p, { lin: Math.floor(ordem[i] / 3), col: ordem[i] % 3, giro: Math.floor(acaso() * 4), lugar: q.vagas[i] });
      q.vagas[i].peca = p;
      const uv = p.face.geometry.attributes.uv;  // (os quatro cantos do plano: em cima à esquerda, em cima à direita, embaixo à esquerda, embaixo à direita)
      [[0, 1], [1, 1], [0, 0], [1, 0]].forEach(([u, v], k) => uv.setXY(k, (p.col + u) / 3, (2 - p.lin + v) / 3));
      uv.needsUpdate = true;
      assentarPeca(p);
    });
    q.girosMinimos = q.pecas.reduce((soma, p) => soma + (4 - p.giro) % 4, 0);   // (o L só gira para um lado: de pé em 4 - giro apertos)
    desenharNaMao();
    fimDoQuebra.malha.visible = false;
  }
  // Só é alvo o que aparece na imagem: o que está à frente do robô, a até 3 m, e não mais para o
  // lado do que a imagem alcança. (A conta é sempre a da imagem da iA, e não a da janela de quem
  // assiste: assim ela é a mesma ao vivo e na gravação.)
  function aVistaNaParede(a) {
    const v = vetores(), dx = a.x - estado.x, dz = a.z - estado.z, frente = dx * v.fx + dz * v.fz, lado = dx * v.fz - dz * v.fx;
    return frente > 0.3 && frente <= 3 && Math.abs(lado) <= 1.25 * frente;
  }
  // Os alvos do ESPACO: de mão vazia, as peças; com uma na mão, as casas do quadro e o lugar dela na bandeja.
  function alvosDoQuebra() {
    const q = quebra;
    if (q.fim !== null) return [];
    return (q.naMao ? [...q.casas, q.vagas[q.naMao.numero - 1]] : q.pecas).filter(aVistaNaParede);
  }
  const nomeNoQuebra = a => !a ? '' : a.ehPeca ? `peça ${a.numero}` : a.ehCasa ? `casa ${a.numero}` : 'bandeja';
  // O TAB: passa para o alvo seguinte; com um número, vai direto para o alvo com esse número (a peça, a casa, ou 0 = a bandeja).
  function escolherNoQuebra(passo, numero) {
    const lista = candidatos(), n = lista.length, direto = numero != null && String(numero).trim() !== '', k = Math.floor(Number(numero));
    if (!n) return resposta('escolher', false, quebra.fim !== null ? 'o jogo acabou' : 'nada à vista');
    if (direto) {
      const a = lista.find(q => q.numero === k);
      if (!a) return resposta('escolher', false, 'não há alvo com esse número à vista');
      escolhido = a;
    } else escolhido = lista[(Math.max(0, lista.indexOf(alvoAtual())) + passo + n) % n];
    return resposta('escolher', true, `alvo: ${nomeNoQuebra(escolhido)}`);
  }
  const certaNoLugar = p => !!p.lugar && !!p.lugar.ehCasa && p.lugar.lin === p.lin && p.lugar.col === p.col && p.giro === 0;
  function porNoLugar(p, onde) {
    if (p.lugar) p.lugar.peca = null;
    p.lugar = onde;
    if (onde) onde.peca = p;
    assentarPeca(p);
  }
  // O ESPACO: pega a peça que é o alvo ou, com uma na mão, a põe na casa (trocando com a que estiver lá) ou a devolve à bandeja.
  function usarNoQuebra() {
    const q = quebra, alvo = alvoAtual();
    escolhido = undefined;
    if (q.fim !== null) return resposta('pegar', false, 'o jogo acabou');
    if (!alvo) return resposta('pegar', false, 'nada à vista');
    if (!q.naMao) {
      porNoLugar(alvo, null);
      q.naMao = alvo;
      desenharNaMao();
      return resposta('pegar', true, `pegou: peça ${alvo.numero}`);
    }
    const p = q.naMao, outra = alvo.ehCasa ? alvo.peca : null;
    if (outra) porNoLugar(outra, null);
    porNoLugar(p, alvo);
    q.naMao = outra;
    desenharNaMao();
    if (alvo.ehVaga) return resposta('pegar', true, `devolveu: peça ${p.numero} à bandeja`);
    q.jogadas++;
    if (certaNoLugar(p)) q.postasCertas++; else q.postasErradas++;
    let msg = `colocou: peça ${p.numero} na casa ${alvo.numero}` + (outra ? ` — a peça ${outra.numero}, que estava lá, veio para a mão` : '');
    if (q.pecas.every(certaNoLugar)) { acabarQuebra(false); msg += ' — quebra-cabeça montado: venceu'; }
    return resposta('pegar', true, msg);
  }
  // O L: um quarto de volta, no sentido horário, na peça da mão ou, de mão vazia, na que é o alvo.
  function girarNoQuebra() {
    const q = quebra, p = q.naMao || alvoAtual();
    if (q.fim !== null) return resposta('levantar', false, 'o jogo acabou');
    if (!p || !p.ehPeca) return resposta('levantar', false, 'nada para girar');
    p.giro = (p.giro + 1) % 4;
    q.giros++;
    assentarPeca(p);
    desenharNaMao();
    let msg = `girou: peça ${p.numero}`;
    if (q.pecas.every(certaNoLugar)) { acabarQuebra(false); msg += ' — quebra-cabeça montado: venceu'; }
    return resposta('levantar', true, msg);
  }
  // O SAIR: desiste. A peça que estiver na mão volta para a bandeja, e o jogo acaba como está.
  function desistirDoQuebra() {
    const q = quebra;
    if (q.fim !== null) return resposta('sair', false, 'o jogo acabou');
    if (q.naMao) { porNoLugar(q.naMao, q.vagas[q.naMao.numero - 1]); q.naMao = null; }
    acabarQuebra(true);
    return resposta('sair', true, 'desistiu do quebra-cabeça');
  }
  // O relógio do quebra-cabeça começa no primeiro botão (ver apertar e, assistindo, o fim do arquivo).
  function tocarNoQuebra() { if (quebra && quebra.comeco === null && quebra.fim === null) quebra.comeco = hora(); }
  // As contas de agora: as peças certas (na casa certa e de pé), as erradas (no quadro, fora do lugar
  // ou giradas), as que ficaram fora do quadro, o tempo, as peças colocadas e os giros.
  function contasDoQuebra() {
    const q = quebra, noQuadro = q.pecas.filter(p => p.lugar && p.lugar.ehCasa), certas = noQuadro.filter(certaNoLugar).length;
    return { certas, erradas: noQuadro.length - certas, fora: 9 - noQuadro.length, tempo: q.comeco === null ? 0 : (q.fim !== null ? q.fim : hora()) - q.comeco, jogadas: q.jogadas, giros: q.giros };
  }
  // A pontuação, de 0 a 100. As peças certas valem 60 pontos (cada uma, um nono disso). Os outros 40
  // são da eficiência, e só contam na proporção das peças certas (quem desiste sem acertar nada não
  // ganha pontos por ter sido rápido):
  //   15 pelas peças colocadas: todos, se cada colocação deixou uma peça certa; menos, se foi preciso colocar mais vezes;
  //   10 pelos giros: todos, se não houve giro além dos que as peças pediam (ver girosMinimos);
  //   15 pelo tempo: todos até 5 minutos; daí vão caindo, até nenhum aos 30.
  function pontuarQuebra(c) {
    const P = QUEBRA.pontos, parte = c.certas / 9, jogadas = c.jogadas ? Math.min(1, c.certas / c.jogadas) : 0, giros = c.giros > quebra.girosMinimos ? quebra.girosMinimos / c.giros : 1;
    const tempo = Math.max(0, Math.min(1, (QUEBRA.tempo.zero - c.tempo) / (QUEBRA.tempo.zero - QUEBRA.tempo.pleno)));
    return Math.round(parte * (P.pecas + P.jogadas * jogadas + P.giros * giros + P.tempo * tempo));
  }
  // O fim do jogo: montado (a vitória) ou desistido. Faz as contas, mostra a faixa e deixa o recado para a iA (ver novidadesDoQuebra).
  function acabarQuebra(desistiu) {
    const q = quebra;
    if (q.comeco === null) q.comeco = hora();
    q.fim = hora();
    q.desistiu = desistiu;
    q.contas = contasDoQuebra();
    q.pontos = pontuarQuebra(q.contas);
    q.novidade = true;
    estado.ganhou = !desistiu;
    estado.perdeu = desistiu;
    desenharNaMao();
    desenharFimDoQuebra();
  }
  // O recado do fim, que a iA recebe uma vez só, junto com a resposta do botão que acabou o jogo (o texto está em ferramentas.json, em "notas").
  function novidadesDoQuebra() {
    const q = quebra;
    if (!q || !q.novidade) return [];
    q.novidade = false;
    return [{ tipo: 'quebraCabeca', tempo: minutos(q.contas.tempo), jogadas: q.contas.jogadas, giros: q.contas.giros, certas: q.contas.certas, pontos: q.pontos }];
  }
  // O que quem assiste lê no campo de quem joga, na página: as contas ao vivo (a iA não as vê).
  const placarDoQuebra = () => {
    const c = quebra.fim !== null ? quebra.contas : contasDoQuebra();
    return `${minutos(c.tempo)} · ${c.jogadas} ${c.jogadas === 1 ? 'peça colocada' : 'peças colocadas'} · ${c.giros} ${c.giros === 1 ? 'giro' : 'giros'} · ${c.certas} de 9 certas`
      + (quebra.fim !== null ? ` · ${quebra.desistiu ? 'desistiu' : 'montou'}: ${quebra.pontos} pontos` : '');
  };
  // A peça que está na mão, no alto da imagem, no meio (onde, na parede, fica o vão entre o quadro e
  // a bandeja). Como o inventário dos desafios da cidade, é desenhada dentro do jogo e sai na imagem da iA.
  const naMao = { canvas: document.createElement('canvas'), chave: null };
  naMao.canvas.width = 400; naMao.canvas.height = 470;
  naMao.textura = new T.CanvasTexture(naMao.canvas);
  naMao.textura.colorSpace = T.SRGBColorSpace;
  naMao.malha = new T.Mesh(new T.PlaneGeometry(1, 1), luminoso({ map: naMao.textura, transparent: true, depthTest: false, depthWrite: false }));
  naMao.malha.renderOrder = 999;
  naMao.malha.layers.set(2);
  naMao.malha.visible = false;
  camera.add(naMao.malha);
  function desenharNaMao() {
    const p = quebra.naMao, chave = p ? `${quebra.sorte}|${p.numero}|${p.giro}` : '';
    naMao.malha.visible = !!p;
    if (!p || chave === naMao.chave) return;
    naMao.chave = chave;
    const c = naMao.canvas, g = c.getContext('2d'), L = c.width, A = c.height, tam = 330;
    g.clearRect(0, 0, L, A);
    g.beginPath();
    if (g.roundRect) g.roundRect(5, 5, L - 10, A - 10, 26); else g.rect(5, 5, L - 10, A - 10);
    g.fillStyle = 'rgba(14, 20, 26, 0.92)'; g.fill();
    g.strokeStyle = '#00e5ff'; g.lineWidth = 7; g.stroke();
    g.fillStyle = '#ffffff'; g.font = 'bold 44px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(`NA MÃO: PEÇA ${p.numero}`, L / 2, 52, L - 40);
    g.save();
    g.translate(L / 2, 268);
    g.rotate(p.giro * Math.PI / 2);              // (no desenho, o ângulo que cresce é o do sentido horário)
    g.drawImage(quebra.tela, p.col * 256, p.lin * 256, 256, 256, -tam / 2, -tam / 2, tam, tam);
    g.restore();
    g.strokeStyle = '#f4efe4'; g.lineWidth = 6; g.strokeRect(L / 2 - tam / 2, 268 - tam / 2, tam, tam);
    naMao.textura.needsUpdate = true;
  }
  // A faixa do fim, no alto da imagem (acima do quadro, que fica à vista): montado ou desistido, a pontuação e as contas.
  const fimDoQuebra = { canvas: document.createElement('canvas') };
  fimDoQuebra.canvas.width = 1600; fimDoQuebra.canvas.height = 240;
  fimDoQuebra.textura = new T.CanvasTexture(fimDoQuebra.canvas);
  fimDoQuebra.textura.colorSpace = T.SRGBColorSpace;
  fimDoQuebra.malha = new T.Mesh(new T.PlaneGeometry(1, 1), luminoso({ map: fimDoQuebra.textura, transparent: true, depthTest: false, depthWrite: false }));
  fimDoQuebra.malha.renderOrder = 1000;
  fimDoQuebra.malha.layers.set(2);
  fimDoQuebra.malha.visible = false;
  camera.add(fimDoQuebra.malha);
  function desenharFimDoQuebra() {
    const q = quebra, k = q.contas, c = fimDoQuebra.canvas, g = c.getContext('2d'), L = c.width, A = c.height;
    g.clearRect(0, 0, L, A);
    g.beginPath();
    if (g.roundRect) g.roundRect(0, 0, L, A, 36); else g.rect(0, 0, L, A);
    g.fillStyle = q.desistiu ? 'rgba(150, 62, 30, 0.95)' : 'rgba(20, 120, 62, 0.95)'; g.fill();
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 92px Arial, sans-serif'; g.fillText(`${q.desistiu ? 'VOCÊ DESISTIU' : 'MONTADO!'}  PONTUAÇÃO: ${q.pontos} DE 100`, L / 2, 84, L - 70);
    g.font = 'bold 52px Arial, sans-serif';
    g.fillText(`tempo ${minutos(k.tempo)} · ${k.jogadas} peças colocadas · ${k.giros} giros · ${k.certas} de 9 certas`, L / 2, 182, L - 70);
    fimDoQuebra.textura.needsUpdate = true;
    fimDoQuebra.malha.visible = true;
  }

  // ---------- botões ----------
  // Os botões do jogo. O teclado e o MCP apertam os mesmos, pelo mesmo nome, e é só isso
  // que o jogador fica sabendo: quais botões existem. O que cada um faz, ele descobre.
  const BOTOES = {
    W: () => mover('frente'), S: () => mover('tras'),             // anda um passo
    A: () => virar('esquerda'), D: () => virar('direita'),        // vira 45° sem sair do lugar
    ESPACO: () => pegar(), L: () => levantar(),
    TAB: texto => escolher(1, texto),                             // passa o alvo do ESPACO para o seguinte; com um número no texto, direto para o alvo com esse número
    T: texto => COLETIVO ? falar(texto) : escrever(texto),                // escreve no peito o texto que vem junto
    F: () => frame(),                           // o único que devolve algo: a imagem
  };
  if (REGRAS.passoDeLado) Object.assign(BOTOES, { Q: () => mover('esquerda'), E: () => mover('direita') });   // desafio 4: um passo de lado, sem virar
  if (quebra) BOTOES.SAIR = () => desistirDoQuebra();   // desafio 7: desistir do quebra-cabeça
  function acionar(botao, texto) {
    atualizarCarro();                           // (se o carro está em viagem: onde ele está nesta hora)
    const acao = Object.prototype.hasOwnProperty.call(BOTOES, botao) && BOTOES[botao];
    return acao ? acao(texto) : resposta(`apertar ${botao}`, false, 'botão inexistente');
  }

  // ---------- quem joga, a intenção e a gravação ----------
  // Quem assiste fica sabendo de duas coisas que a iA diz: quem ela é (um nome de guerra e o
  // modelo) e o que pretende com cada botão. As duas aparecem num campo da página (por cima
  // da imagem ou no menu ao lado dela: ver "a tela cheia e o menu ao lado"), e vão para a gravação. Nenhuma entra na imagem que a iA recebe, que é só o desenho do
  // jogo: o nome dela à vista, no quarto do espelho, seria a maior das pistas.
  //   quem joga:  a iA diz ao começar o desafio (o servidor só deixa começar com nome e modelo:
  //               ver ferramentas.json), e a página nova recebe o recado da anterior (ver
  //               comecar). O botão de uma iA que a página não conhece (outra conexão, ou a
  //               página foi aberta sem `comecar`) não é apertado: ela recebe o aviso 'semNome'
  //               e aperta de novo, mandando o nome e o modelo.
  //   a intenção: vem junto com cada botão (o parâmetro intencao). Não muda o que o botão faz,
  //               e a iA continua sem saber o resultado. Sem ela o botão não é apertado: aviso
  //               'semIntencao'.
  // O teclado não precisa dizer nada. Depois da vitória, nada disso é cobrado.
  //
  // Cada vez que a página abre num desafio começa uma gravação (ver gravacao.js), com dois
  // acontecimentos: `quem` (o nome e o modelo de quem passou a jogar) e `botao`, com b (o
  // botão), x (o texto, no botão T) e q (a intenção).
  const semControle = (texto, letras) => Array.from(String(texto == null ? '' : texto).replace(/[\u0000-\u001f\u007f]/g, ' ').trim()).slice(0, letras).join('');
  const quemJoga = { quem: 0, nome: '', modelo: '' }, contagem = { botoes: 0, imagens: 0, vitoria: null };   // (vitoria: as contas na hora em que o jogo foi vencido, para o pódio da lista de replays)
  // A versão das regras que mudam o que um botão faz, para a gravação antiga continuar igual
  // quando é assistida. 2: entre alvos do mesmo tipo, vale o mais central na imagem (ver ordemAntiga).
  const VERSAO_DAS_REGRAS = 10;                 // (3: as portas que o jogador abre também fecham: ver portasNaoFecham; 4: o violeiro e o cachorro barram um canto da praça; 5: dá para entrar no carro; 6: na cidade, o S recua sem virar; 7: no coletivo, cada robô pede a sua missão na central; 8: o carro anda sozinho; 9: ele para para os robôs e pode ser chamado, e as casas 1 e 3 do coletivo revezam dois pedidos; 10: o que está num móvel aberto só é alvo se o robô o vê: ver aVista)
  const gravando = !ASSISTINDO && GRAVACAO
    ? GRAVACAO.gravar(COLETIVO ? 'V' : DESAFIO, () => ({ versao: VERSAO_DAS_REGRAS, nome: COLETIVO ? 'coletivo' : quemJoga.nome, modelo: COLETIVO ? `${participantes.size} robôs, ${entregas} pedidos` : quemJoga.modelo, botoes: contagem.botoes, imagens: contagem.imagens, ganhou: estado.ganhou,
      vitoria: contagem.vitoria || undefined, perdeu: estado.perdeu || undefined, assar: REGRAS.vila ? [ASSAR.pronto, ASSAR.queima] : undefined, sorte: COLETIVO ? sorte : quebra ? quebra.sorte : undefined,   // (sorte: o sorteio do começo, no coletivo: ver sortear; no quebra-cabeça, a partida: ver embaralharQuebra)
      quebra: quebra && quebra.fim !== null ? Object.assign({ pontos: quebra.pontos, desistiu: quebra.desistiu }, quebra.contas) : undefined }))   // (o resultado do quebra-cabeça, para a lista de replays)
    : null;
  const NOME_DO_BOTAO = { ESPACO: 'Espaço', F: 'F · imagem' };
  const elQuer = document.getElementById('quer'), intencoes = [];
  let elPlacar = null, ultimoPlacar = 0;        // (no quebra-cabeça: a linha das contas, no campo de quem assiste)
  // O campo de quem joga: quem está jogando e as últimas intenções, a mais nova embaixo, acesa. Na
  // tela cheia são as quatro últimas; no menu ao lado, até oito. Ficam as que couberem no lugar que
  // o campo tem (ver "a tela cheia e o menu ao lado"): se ele não cabe, saem primeiro as
  // linhas mais antigas (as marcadas com data-corta, na ordem em que estão).
  const INTENCOES_A_VISTA = 8;
  function apararQuer() {
    if (elQuer.hidden) return;
    const sobra = () => elQuer.scrollHeight - elQuer.clientHeight > 1 || elQuer.scrollWidth - elQuer.clientWidth > 1;   // (para os lados: na faixa, o campo do coletivo vai em duas colunas, e o que não cabe vira uma terceira)
    for (const el of [...elQuer.querySelectorAll('[data-corta]')].sort((a, b) => a.dataset.corta - b.dataset.corta)) { if (!sobra()) break; el.remove(); }   // (primeiro as de data-corta menor)
    while (elQuer.lastChild && elQuer.lastChild.className === 'titulo') elQuer.lastChild.remove();   // (um título que ficou sem nada embaixo)
  }
  function desenharQuer() {
    if (!elQuer || depressa) return;            // (pulando para outro ponto de uma gravação, o campo é escrito uma vez só, no fim)
    const pedaco = (tag, texto) => { const el = document.createElement(tag); el.textContent = texto; return el; };   // sempre como texto: tudo aqui vem da iA
    const linha = (classe, ...partes) => { const d = document.createElement('div'); d.className = classe; d.append(...partes); elQuer.appendChild(d); return d; };
    elQuer.textContent = '';
    if (COLETIVO) {                             // no coletivo: quem está na vila, e a última coisa que cada um disse que pretende
      const lista = emJogo();
      linha('titulo', lista.length ? `na vila · pedidos atendidos: ${entregas}` : 'ninguém na vila');
      for (const r of lista) {
        const dele = vila.pessoas.find(p => p.pedindo && p.com === r);
        linha('quem', pedaco('b', r.nome), ' ', pedaco('span', r.modelo + (r.entregas ? ` · ${r.entregas}` : '') + (dele ? ` · missão: casa ${dele.casa}` : ' · sem missão')));
        if (r.intencao) linha(r === atual ? 'linha ultima' : 'linha', pedaco('b', NOME_DO_BOTAO[r.intencao.botao] || r.intencao.botao), pedaco('span', r.intencao.quer));
        if (r.dito) {                           // o que ele disse por último, e quem recebeu uma imagem com o balão à vista
          const viram = [...r.dito.viram.keys()].map(q => q.nome).join(', ');
          linha('linha', pedaco('b', 'disse'), pedaco('span', `"${r.dito.texto}" — ${viram ? 'viu: ' + viram : 'ninguém viu' + (r.fala === r.dito ? ' ainda' : '')}${r.fala === r.dito ? ' (balão no ar)' : ''}`)).dataset.corta = '2';
        }
      }
      if (vila.diario.length) linha('titulo', 'o que aconteceu');
      for (const d of vila.diario.slice(-6)) linha('linha', pedaco('b', minutos(d.t)), pedaco('span', d.texto)).dataset.corta = '1';
      elQuer.style.zoom = '0.72';               // (são até quatro: a lista fica menor que a de um jogador só)
      elQuer.hidden = false;
      apararQuer();
      return;
    }
    if (quemJoga.nome || quemJoga.modelo) linha('quem', pedaco('b', quemJoga.nome || 'sem nome'), ' ', pedaco('span', quemJoga.modelo));
    if (quebra) {                               // no quebra-cabeça: as contas ao vivo (o relógio é acertado a cada meio segundo: ver quadro)
      linha('titulo', 'quebra-cabeça');
      elPlacar = pedaco('span', placarDoQuebra());
      linha('linha', elPlacar);
    }
    if (intencoes.length) linha('titulo', 'o que pretende');
    const mostradas = comBancada ? intencoes : intencoes.slice(quebra ? -1 : -4);   // (na tela cheia o campo fica por cima da imagem: só as quatro últimas, como sempre; no quebra-cabeça, só a última, que a parede toma a imagem inteira)
    mostradas.forEach((x, i) => {
      const atras = mostradas.length - 1 - i, d = linha(atras ? 'linha' : 'linha ultima', pedaco('b', NOME_DO_BOTAO[x.botao] || x.botao), pedaco('span', x.quer));
      if (atras) d.dataset.corta = '1';
      if (atras > 3) d.style.opacity = String(Math.max(0.3, 0.5 - 0.05 * (atras - 3)));   // (as quatro mais novas têm a cor que index.html dá; as de antes vão apagando)
    });
    elQuer.hidden = !elQuer.childNodes.length;
    apararQuer();
  }
  function mostrarIntencao(botao, quer) {
    if (!quer) return;
    intencoes.push({ botao, quer });
    if (intencoes.length > INTENCOES_A_VISTA) intencoes.shift();
    desenharQuer();
  }
  // Quem está jogando é a iA da conexão `quem`, com esse nome e esse modelo. O que vier vazio
  // fica como estava, se a iA for a mesma; de outra iA, o nome da anterior não vale.
  function apresentar(quem, nome, modelo) {
    const antes = quemJoga.nome + '|' + quemJoga.modelo;
    if (quemJoga.quem !== quem) Object.assign(quemJoga, { quem, nome: '', modelo: '' });
    quemJoga.nome = semControle(nome, 12) || quemJoga.nome;
    quemJoga.modelo = semControle(modelo, 24) || quemJoga.modelo;
    try { sessionStorage.setItem('desafio.quem', JSON.stringify(quemJoga)); } catch (e) { }   // para continuar valendo se a página recarregar
    if (quemJoga.nome + '|' + quemJoga.modelo === antes || !(quemJoga.nome || quemJoga.modelo)) return;   // (quem chega sem dizer nada ainda não aparece: o botão dela nem é apertado)
    if (gravando) gravando.anotar('quem', { nome: quemJoga.nome, modelo: quemJoga.modelo });
    desenharQuer();
  }
  // A iA que começou este desafio, ou que já estava jogando quando a página recarregou.
  if (!ASSISTINDO && !COLETIVO) try {
    const antes = JSON.parse(sessionStorage.getItem('desafio.quem'));
    if (antes && Number.isInteger(antes.quem) && antes.quem > 0) apresentar(antes.quem, antes.nome, antes.modelo);
  } catch (e) { }
  // Aperta um botão. `quem` é a conexão da iA que apertou (o teclado não manda nada).
  function apertar(botao, texto, quem, nome, modelo, intencao) {
    if (ASSISTINDO) return undefined;           // numa gravação ninguém joga
    if (COLETIVO) return apertarNoColetivo(botao, texto, quem, nome, modelo, intencao);
    const existe = Object.prototype.hasOwnProperty.call(BOTOES, botao), deIA = Number.isInteger(quem) && quem > 0, quer = semControle(intencao, 140);
    if (deIA) apresentar(quem, nome, modelo);
    if (deIA && existe && !estado.ganhou) {     // (depois da vitória nada disso é cobrado)
      if (!quemJoga.nome || !quemJoga.modelo) return { aviso: 'semNome' };
      if (!quer) return { aviso: 'semIntencao' };
    }
    // A hora deste botão no relógio do jogo: é a que vale para o que ele faz (o forno do desafio
    // 4 conta o tempo) e a que vai para a gravação, que assim refaz a partida igual.
    let saida;
    horaDaJogada = Math.round(performance.now() - NASCEU);
    const t = horaDaJogada;
    try { if (existe) tocarNoQuebra(); saida = acionar(botao, texto); } finally { horaDaJogada = null; }   // (o relógio do quebra-cabeça começa no primeiro botão)
    if (existe) {
      mostrarIntencao(botao, quer);
      if (botao === 'F') contagem.imagens++; else contagem.botoes++;
      if (estado.ganhou && !contagem.vitoria) contagem.vitoria = { botoes: contagem.botoes, imagens: contagem.imagens, tempo: t };   // (quantos botões e quanto tempo até vencer: o que a iA apertar depois não entra no pódio)
      const numero = botao === 'TAB' ? semControle(texto, 2) : '';   // o TAB com número (ver escolher)
      if (gravando) gravando.anotar('botao', Object.assign({ t, b: botao }, botao === 'T' ? { x: estado.texto } : numero ? { x: numero } : null, quer ? { q: quer } : null), true);
    }
    return saida;
  }

  // ---------- o coletivo (Desafio V): vários robôs na mesma vila ----------
  // Na vila coletiva entram até MAXIMO_DE_ROBOS robôs, cada um de uma iA (ou do teclado), e cada
  // um entra e sai quando quer, sem a página recarregar e sem a vila voltar ao começo. Quem entra
  // aparece na praça, numa vaga livre em volta do ponto de encontro, que aqui é a central de
  // pedidos: quando a luz vermelha dela está acesa, alguém de uma das três casas está pedindo
  // alguma coisa, e a tela diz de que casa. Os pedidos são os dos desafios 4, 5 e 6 (o bolo na
  // casa 1, o remédio e a água na casa 2, o pão de queijo e o café na casa 3). Atendido um pedido,
  // a pessoa agradece e, depois de um tempo, as coisas dele voltam para os seus lugares e ela pede
  // de novo: o jogo não acaba.
  //
  // O resto do jogo foi escrito para um robô só, e continua assim: `estado`, `visual`, `itens`,
  // `robo` e os outros são sempre os do robô "da vez". Aqui cada robô guarda os seus, e
  // `encarnar` troca de quem eles são. Cada corpo fica numa camada de desenho só dele: a câmera
  // de um robô vê os corpos dos outros e não o próprio.
  //
  // Um robô fala com os outros pelo botão T: o texto aparece num balão em cima da cabeça dele,
  // que os outros veem na imagem. O balão some sozinho: fica pelo menos FALA.minimo, até cada um
  // dos outros ter recebido FALA.imagens imagens com ele à vista, e nunca mais que FALA.maximo.
  // (O que a iA diz que pretende — o "pensamento" — nunca entra na imagem de ninguém.)
  const MAXIMO_DE_ROBOS = 4, CAMADAS_DOS_CORPOS = [1, 11, 12, 13], CORES_DOS_ROBOS = [0xff8a3d, 0x3d9bff, 0x56c96a, 0xe86ad0];
  // (em milissegundos do relógio do jogo) primeiro: quando cada casa faz o primeiro pedido; volta: quanto depois de atendida ela pede de novo;
  // obrigado: por quanto tempo agradece; fala: quanto dura o que uma pessoa ou a central diz; esquecido: o bolo queimado que ninguém tira do forno
  // prazo: quanto tempo um robô fica com uma missão sem a cumprir, até ela voltar para a central; antes: os tempos do primeiro pedido nas gravações antigas (ver pedidosDeTodos)
  const PEDIDO = { primeiro: [3000, 6000, 9000], antes: [4000, 50000, 100000], volta: 60000, obrigado: 15000, fala: 60000, esquecido: 60000, prazo: 480000, parado: 360000 };
  // O sorteio do começo. Sem ele toda partida começava igual: a casa 1 pedia primeiro, e a central
  // dava a missão dela ao primeiro robô. Cada partida tem a sua `sorte` — um número —, de onde saem a
  // ordem em que as três casas fazem o primeiro pedido e com qual dos pedidos do seu rodízio cada uma
  // começa. A sorte vai no resumo da gravação: quem assiste a ela refaz o mesmo sorteio.
  // Sorte 0 é sem sorteio: as casas pedem na ordem 1, 2, 3, cada uma com o primeiro pedido do seu
  // rodízio (como era antes, e como é numa gravação que não traz a sorte). `?sorte=N` no endereço
  // escolhe a sorte da partida: é para os testes, e para repetir um começo.
  let sorte = 0;
  function sortear(n) {
    sorte = n;
    const acaso = aleatorio(n), ordem = [0, 1, 2];
    if (n) for (let i = ordem.length - 1; i > 0; i--) { const j = Math.floor(acaso() * (i + 1)); [ordem[i], ordem[j]] = [ordem[j], ordem[i]]; }
    for (const p of [...vila.pessoas].sort((a, b) => a.casa - b.casa)) Object.assign(p, { abreEm: PEDIDO.primeiro[ordem[p.casa - 1]], comeca: n ? Math.floor(acaso() * p.rodizio.length) : 0 });
  }
  const FALA = { letras: 80, minimo: 20000, maximo: 90000, imagens: 2 };
  const PARADO_DEMAIS = 15 * 60000;             // a iA que some sem sair deixa o lugar depois desse tempo (do relógio de verdade)
  // as vagas de quem entra: em volta do ponto de encontro, cada uma com o rumo que olha para ele
  const VAGAS = [[14, 8, 0], [14, 4.5, 4], [16, 6.5, 2], [12, 6, 6], [15.5, 8, 0], [12.5, 8, 0], [15.5, 4.5, 4], [12.5, 4.5, 4]];
  const robos = [], participantes = new Set();
  let atual = null, entregas = 0;
  const emJogo = () => robos.filter(r => r.dentro);
  const estadoNovo = () => ({ x: REGRAS.inicio.x || 0, z: REGRAS.inicio.z, rumo: REGRAS.inicio.rumo, sala: REGRAS.inicio.sala || 1, segurando: null, naCabeca: null, maoLevantada: false, texto: '', ganhou: false, perdeu: false });
  // Passa a ser `r` o robô da vez: o estado, o corpo e o inventário do jogo são os dele.
  function encarnar(r) {
    if (r === atual) return;
    if (atual) atual.escolhido = escolhido;
    atual = r;
    eu = r.corpo; robo = eu.grupo; bracoDireito = eu.braco; estado = r.estado; visual = r.visual; itens = r.itens; escolhido = r.escolhido;
  }
  // Roda `f` na pele de cada robô em jogo, e volta a ser o de antes.
  function cadaRobo(f) {
    const antes = atual;
    for (const r of robos) if (r.dentro) { encarnar(r); f(r); }
    encarnar(antes);
  }
  // O que a imagem do robô da vez mostra por cima do jogo (o alvo destacado, os números dos alvos, o inventário) é de um robô só: refaz para ele.
  function refrescarHUD() {
    if (destacado) destacado.contorno.visible = false;
    destacado = alvoAtual();
    if (destacado) destacado.contorno.visible = true;
    marcarAlvos();
    desenharInventario();
    desenharMissao();
    desenharMapa();
  }
  // O balão de fala de um robô: um desenho só dele, na camada do corpo dele (ele mesmo não o vê).
  function balaoDeFala(camada) {
    const tela = document.createElement('canvas');
    tela.width = 640; tela.height = 288;
    const textura = new T.CanvasTexture(tela);
    textura.colorSpace = T.SRGBColorSpace;
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: textura, transparent: true, depthWrite: false, toneMapped: false }));
    sprite.scale.set(1.7, 1.7 * tela.height / tela.width, 1);
    sprite.center.set(0.5, 0);
    sprite.renderOrder = 1001;                  // (por cima do inventário, que fica no alto da imagem; atrás de uma parede ele continua escondido)
    sprite.layers.set(camada);
    sprite.visible = false;
    cena.add(sprite);
    return { sprite, tela, textura };
  }
  function desenharFala(r) {
    const { tela, textura } = r.balao, g = tela.getContext('2d'), l = tela.width, a = tela.height, fundo = a - 46;
    g.clearRect(0, 0, l, a);
    g.lineJoin = 'round';
    g.beginPath();
    if (g.roundRect) g.roundRect(6, 6, l - 12, fundo - 6, 40); else g.rect(6, 6, l - 12, fundo - 6);
    g.moveTo(l / 2 - 34, fundo - 4); g.lineTo(l / 2, a - 6); g.lineTo(l / 2 + 34, fundo - 4);
    g.fillStyle = '#ffffff'; g.strokeStyle = '#20262c'; g.lineWidth = 8;
    g.stroke(); g.fill();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#3a6ea5'; g.font = 'bold 30px Arial, sans-serif';
    g.fillText(r.nome, l / 2, 36, l - 60);                                   // quem está falando
    // o texto, em até três linhas
    g.fillStyle = '#14181c'; g.font = 'bold 52px Arial, sans-serif';
    const linhas = [''];
    for (const palavra of r.fala.texto.split(' ')) {
      const tenta = linhas[linhas.length - 1] ? linhas[linhas.length - 1] + ' ' + palavra : palavra;
      if (g.measureText(tenta).width <= l - 70 || !linhas[linhas.length - 1]) linhas[linhas.length - 1] = tenta; else linhas.push(palavra);
    }
    const mostradas = linhas.slice(0, 3);
    if (linhas.length > 3) mostradas[2] += '…';
    mostradas.forEach((t, i) => g.fillText(t, l / 2, 60 + (fundo - 66) * (i + 0.5) / mostradas.length, l - 50));
    textura.needsUpdate = true;
  }
  // O que o robô disse ainda está no ar?
  function falaVale(r) {
    const f = r.fala;
    if (!f || !r.dentro) return false;
    const t = hora() - f.desde, outros = emJogo().filter(q => q !== r);
    if (t > FALA.maximo || (t > FALA.minimo && outros.every(q => (f.viram.get(q) || 0) >= FALA.imagens))) { r.fala = null; desenharQuer(); return false; }
    return true;
  }
  // O botão T, no coletivo: o texto vira o balão de fala do robô (vazio, ele se cala).
  function falar(texto) {
    const dito = semControle(texto, FALA.letras);
    if (!dito) { atual.fala = null; return resposta('falar', true, 'ficou calado'); }
    atual.fala = atual.dito = { texto: dito, desde: hora(), viram: new Map() };   // (dito: a última fala, que fica na lista de quem assiste mesmo depois de o balão sumir)
    desenharFala(atual);
    som.efeito('balao', estado);
    return resposta('falar', true, `disse: "${dito}"`);
  }
  // O robô `r` recebeu uma imagem: conta, para cada um dos outros que está falando, se o balão dele estava à vista.
  const campoDeVisao = new T.Frustum(), juntaDaVisao = new T.Matrix4(), pontoDoBalao = new T.Vector3();
  function contarVistas(r) {
    let mudou = false;
    camera.updateMatrixWorld();
    campoDeVisao.setFromProjectionMatrix(juntaDaVisao.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    for (const q of emJogo()) {
      if (q === r || !q.fala) continue;
      pontoDoBalao.copy(q.balao.sprite.position);   // (o meio do balão, onde ele está para esta câmera: ver porBaloesDoColetivo)
      pontoDoBalao.y += q.balao.sprite.scale.y / 2;
      if (!campoDeVisao.containsPoint(pontoDoBalao) || Math.hypot(q.visual.x - r.visual.x, q.visual.z - r.visual.z) >= 12) continue;
      if (!q.fala.viram.has(r)) mudou = true;
      q.fala.viram.set(r, (q.fala.viram.get(r) || 0) + 1);
    }
    if (mudou) desenharQuer();                  // (a lista de quem assiste diz quem já viu cada balão)
  }

  // Os pedidos. Tudo aqui depende só do relógio do jogo e do que os robôs fizeram: assistindo à
  // gravação, acontece igual. (Por isso é conferido antes de cada botão, e não só a cada quadro.)
  const missaoDe = o => [1, 2, 3].find(n => vila.missoes[n].includes(o));
  // Guarda como cada objeto da vila estava no começo, para ele poder voltar para lá (ver devolver).
  const NAO_E_ESTADO = ['malha', 'sombra', 'contorno', 'icone', 'lar'];
  function fotografarObjetos() {
    for (const s of Object.values(salas)) for (const o of s.objetos) {
      const campos = {};
      for (const k of Object.keys(o)) if (!NAO_E_ESTADO.includes(k)) campos[k] = o[k];
      o.lar = { campos, pai: o.malha.parent, pos: o.malha.position.clone(), rot: o.malha.rotation.clone(), esc: o.malha.scale.clone(), visivel: o.malha.visible, sombra: o.sombra.visible, moveis: abrem.filter(m => m.dentro.includes(o)) };
    }
  }
  // O objeto volta a ser e a estar como no começo do jogo: sai da mão ou do inventário de quem o tiver, e vai para o seu lugar.
  function devolver(o) {
    for (const r of robos) {
      const i = r.itens.indexOf(o);
      if (i < 0) continue;
      r.itens.splice(i, 1);
      if (r.estado.segurando !== o) continue;
      r.estado.segurando = null;
      if (r.itens.length) { const antes = atual; encarnar(r); segurar(r.itens[0]); encarnar(antes); }
    }
    for (const k of Object.keys(o)) if (!(k in o.lar.campos) && !NAO_E_ESTADO.includes(k)) delete o[k];
    Object.assign(o, o.lar.campos);
    if (o.lar.pai) o.lar.pai.add(o.malha); else if (o.malha.parent) o.malha.parent.remove(o.malha);   // (o que não estava em lugar nenhum volta a não estar)
    o.malha.position.copy(o.lar.pos); o.malha.rotation.copy(o.lar.rot); o.malha.scale.copy(o.lar.esc);
    o.malha.visible = o.lar.visivel; o.sombra.visible = o.lar.sombra;
    for (const m of abrem) { const i = m.dentro.indexOf(o); if (i >= 0) m.dentro.splice(i, 1); }
    for (const m of o.lar.moveis) { m.dentro.push(o); o.fechado = !m.aberta; }
  }
  // Tudo o que é do pedido da casa `n` volta ao começo: os objetos, a tigela e o forno (casa 1), a cafeteira (casa 3) e o que a pessoa tinha recebido.
  function reporMissao(n) {
    for (const o of vila.missoes[n]) devolver(o);
    if (n === 1) { Object.assign(vila.tigela, { itens: [], pronta: false }); vila.tigela.malha.visible = true; vila.forno.dentro = null; }
    if (n === 3) { Object.assign(vila.cafeteira, { itens: [], pronta: false }); vila.cafeteira.jarra.visible = false; }
    const p = vila.pessoas.find(q => q.casa === n);
    if (p) { p.recebidos = []; p.recebeu = null; }
  }
  // Abre os pedidos cuja hora chegou, e joga fora o bolo que queimou esquecido no forno.
  function atualizarPedidos() {
    if (!COLETIVO || !robos.length) return;
    const t = hora();
    let mudou = false;
    for (const p of [...vila.pessoas].sort((a, b) => a.abreEm - b.abreEm)) {   // (na ordem em que as horas chegaram: é a ordem do diário, mesmo quando o relógio dá um salto e várias abrem de uma vez)
      if (p.pedindo || t < p.abreEm) continue;
      if (p.vezes) reporMissao(p.casa);          // (da segunda vez em diante: o que foi usado no pedido anterior volta para o lugar)
      if (!semRodizio) {                         // o pedido da vez, no rodízio dos pedidos dessa casa (que começa no que o sorteio escolheu: ver sortear)
        const m = p.rodizio[(p.vezes + p.comeca) % p.rodizio.length];
        Object.assign(p, { pedidos: m.pedidos, falas: m.falas, tarefa: m.tarefa || null });
        if (m.aoAbrir) m.aoAbrir();
      }
      Object.assign(p, { pedindo: true, desde: p.abreEm, com: null, fala: '', vezes: p.vezes + 1 });
      anotarNoDiario(p.vezes > 1 ? `a casa ${p.casa} pediu de novo` : `a casa ${p.casa} fez um pedido`, p.abreEm);
      mudou = true;
      som.efeito('pedido', vila.central, 30);
    }
    // A missão de quem parou de jogar volta para a central: o robô que fica PEDIDO.parado sem apertar
    // nenhum botão perde a dele. (Quem continua jogando fica com a missão o tempo que precisar. Numa
    // gravação da versão 7 valia um prazo fixo de 8 minutos, contado de quando a missão foi pega.)
    for (const p of vila.pessoas) {
      if (!p.pedindo || !p.com || pedidosDeTodos) continue;
      if (prazoFixo ? t - p.pegoEm <= PEDIDO.prazo : t - p.com.ultimoBotao <= PEDIDO.parado) continue;
      anotarNoDiario(`a missão da casa ${p.casa} voltou para a central: ${p.com.nome} ${prazoFixo ? 'passou do prazo de 8 minutos' : 'ficou ' + Math.round(PEDIDO.parado / 60000) + ' minutos sem jogar'}`);
      p.com = null;
      mudou = true;
    }
    if (vila.forno.dentro && tempoNoForno() > ASSAR.queima + PEDIDO.esquecido) reporMissao(1);
    if (mudou) vila.central.redesenhar();
  }
  // A pessoa recebeu a última coisa que pediu: agradece, e daqui a um tempo pede de novo.
  function concluirPedido(p) {
    anotarNoDiario(`${atual.nome} atendeu a casa ${p.casa}`);
    Object.assign(p, { pedindo: false, com: null, abreEm: hora() + PEDIDO.volta, agradeceAte: hora() + PEDIDO.obrigado, falaAte: hora() + PEDIDO.obrigado });
    entregas++;
    atual.entregas++;
    vila.central.redesenhar();
    desenharQuer();
  }
  // O diário da vila: o que foi acontecendo com os pedidos e com os robôs (quem entrou, quem pegou qual
  // missão, quem atendeu, que missão voltou para a central e por quê). É só para quem assiste: aparece
  // embaixo da lista de quem está na vila.
  function anotarNoDiario(texto, quando) {      // (quando: a hora em que aconteceu, se não foi agora — o pedido que abriu entre um quadro e outro)
    vila.diario.push({ t: quando != null ? quando : hora(), texto });
    if (vila.diario.length > 60) vila.diario.shift();
    desenharQuer();
  }
  // O ESPACO na central de pedidos: é ali que cada robô pede a sua missão. Ela entrega ao robô o
  // pedido aberto mais antigo que ninguém pegou — um só de cada vez: quem já tem uma missão só é
  // lembrado dela — e a casa passa a esperar por ele (ver usarNaVila). A missão aparece no canto da
  // imagem dele (ver desenharMissao). Sem pedido esperando, a central manda voltar depois.
  function usarACentral() {
    const c = vila.central, meu = vila.pessoas.find(q => q.pedindo && q.com === atual);
    const p = meu || vila.pessoas.filter(q => q.pedindo && !q.com).sort((a, b) => a.desde - b.desde)[0];
    if (p && !meu) { Object.assign(p, { com: atual, pegoEm: hora() }); anotarNoDiario(`${atual.nome} pegou a missão da casa ${p.casa}`); }
    c.fala = p ? `${atual.nome}: sua missão é na casa ${p.casa}` : 'Sem missão agora. Volte depois';
    c.falaAte = hora() + PEDIDO.fala / 2;
    c.redesenhar();
    desenharQuer();
    return resposta('pegar', !!p, `a central disse: "${c.fala}"`);
  }

  // Quem entra e quem sai.
  const vagaLivre = (x, z) => livreNaVila(x, z) && !noMovel(x, z, RAIO_ROBO) && emJogo().every(r => Math.hypot(r.estado.x - x, r.estado.z - z) >= 2 * RAIO_ROBO + 0.3)
    && Object.values(salas).every(s => noCaminho(s).every(o => Math.hypot(o.x - x, o.z - z) >= RAIO_ROBO + o.raio));
  // Põe no jogo o robô da conexão `quem` (se já está, é ele mesmo). Devolve o robô, ou null se não há lugar.
  // (vaga e lugar: ao assistir a uma gravação, a vaga [x, z, rumo] e o número do robô que valeram ao vivo)
  function entrarNoJogo(quem, nome, modelo, vaga, lugar) {
    const ja = robos.find(q => q.dentro && q.quem === quem);
    if (ja) return ja;
    const r = lugar != null ? robos[lugar] : robos.find(q => !q.dentro), onde = vaga || VAGAS.find(([x, z]) => vagaLivre(x, z));
    if (!r || r.dentro || !onde) return null;
    atualizarPedidos();
    Object.assign(r.estado, estadoNovo(), { x: onde[0], z: onde[1], rumo: onde[2], sala: 4 });
    Object.assign(r.visual, { x: onde[0], z: onde[1], yaw: onde[2] * GIRO, braco: 0, chao: alturaDoChao(onde[0], onde[1]) });
    r.itens.length = 0;
    Object.assign(r, { dentro: true, quem, nome: semControle(nome, 12) || `robô ${r.n + 1}`, modelo: semControle(modelo, 24), entregas: 0, intencao: null, fala: null, dito: null, escolhido: undefined, ativo: performance.now() });
    if (r === atual) escolhido = undefined;
    r.corpo.grupo.visible = true;
    r.corpo.escrever(r.nome);                   // o nome fica na tela do peito, para os outros lerem
    participantes.add(r.nome);
    r.ultimoBotao = hora();                     // (a hora, no relógio do jogo, do último botão dele: quem para de jogar perde a missão)
    anotarNoDiario(`${r.nome} entrou na vila`);
    if (gravando) gravando.anotar('entrou', { t: Math.round(hora()), r: r.n, nome: r.nome, modelo: r.modelo, x: onde[0], z: onde[1], rumo: onde[2] });
    som.efeito('entrou', r.estado);
    if (!emJogo().includes(atual)) encarnar(r); // (a página passa a mostrar quem está jogando)
    cadaRobo(() => porCorpo());
    desenharQuer();
    vila.central.redesenhar();
    return r;
  }
  function sairDoJogo(r) {
    if (!r.dentro) return;
    // O que ele carregava volta para o lugar. O que só existe no meio de um pedido (a massa, o
    // bolo, o copo cheio, o café) leva o pedido inteiro de volta ao começo, para ele não ficar pela metade.
    for (const o of r.itens.slice()) {
      const m = missaoDe(o), feito = !o.lar.visivel || (o.lar.campos.fechado && !o.lar.moveis.length);
      if (m && feito) reporMissao(m); else devolver(o);
    }
    largarOCarro(r.estado);
    Object.assign(r, { dentro: false, fala: null, intencao: null });
    r.corpo.grupo.visible = false;
    r.balao.sprite.visible = false;
    anotarNoDiario(`${r.nome} saiu da vila`);
    for (const p of vila.pessoas) if (p.com === r) { p.com = null; anotarNoDiario(`a missão da casa ${p.casa} voltou para a central: ${r.nome} saiu do jogo`); }
    if (gravando) gravando.anotar('saiu', { t: Math.round(hora()), r: r.n });
    som.efeito('saiu', r.estado);
    if (r === atual && emJogo().length) encarnar(emJogo()[0]);
    desenharQuer();
    vila.central.redesenhar();
  }
  // O `comecar` de uma iA, com a página já na vila coletiva: ela entra (ou fica sabendo que não há lugar).
  const entrarPelaPonte = (quem, nome, modelo) => ({ aviso: entrarNoJogo(quem, nome, modelo) ? 'inicio' : 'lotado' });
  // Um botão, no coletivo. O teclado é o robô da "conexão" -1, que entra sozinho na primeira tecla.
  function apertarNoColetivo(botao, texto, quem, nome, modelo, intencao) {
    const deIA = Number.isInteger(quem) && quem > 0, quer = semControle(intencao, 140), existe = Object.prototype.hasOwnProperty.call(BOTOES, botao);
    let r = robos.find(q => q.dentro && q.quem === (deIA ? quem : -1));
    if (botao === 'SAIR') { if (r) sairDoJogo(r); return { aviso: 'saiuDoJogo' }; }
    if (!r && !deIA) r = entrarNoJogo(-1, 'teclado', '');
    if (!r) return { aviso: 'foraDoJogo' };
    if (deIA && existe && !quer) return { aviso: 'semIntencao' };
    let saida;
    horaDaJogada = Math.round(performance.now() - NASCEU);
    const t = horaDaJogada;
    try {
      atualizarPedidos();
      encarnar(r);
      saida = acionar(botao, texto);
    } finally { horaDaJogada = null; }
    r.ativo = performance.now();
    if (existe) r.ultimoBotao = t;
    if (existe) {
      if (quer) r.intencao = { botao, quer };
      if (botao === 'F') contagem.imagens++; else contagem.botoes++;
      const junto = botao === 'T' ? semControle(texto, FALA.letras) : botao === 'TAB' ? semControle(texto, 2) : '';
      if (gravando) gravando.anotar('botao', Object.assign({ t, r: r.n, b: botao }, junto ? { x: junto } : null, quer ? { q: quer } : null), true);
      desenharQuer();
    }
    return saida;
  }
  // Monta os robôs (o primeiro é o que o jogo já tinha) e começa a contar a hora dos pedidos.
  function iniciarColetivo() {
    for (let n = 0; n < MAXIMO_DE_ROBOS; n++) {
      const corpo = n ? montarRobo(false, CORES_DOS_ROBOS[n]) : eu, est = n ? estadoNovo() : estado;
      if (n) {
        raiz.add(corpo.grupo);
        corpo.grupo.traverse(o => o.layers.set(CAMADAS_DOS_CORPOS[n]));
        corpo.braco.traverse(o => o.layers.enable(0));
      }
      corpo.grupo.visible = false;
      robos.push({ n, corpo, camada: CAMADAS_DOS_CORPOS[n], dentro: false, quem: 0, nome: '', modelo: '', entregas: 0, intencao: null, fala: null, ativo: 0, escolhido: undefined,
        estado: est, visual: n ? { x: est.x, z: est.z, yaw: est.rumo * GIRO, braco: 0, luz: 0, luzY: SALA.A - 0.35, luzZ: 0, forca: 2.1, chao: 0 } : visual, itens: n ? [] : itens,
        balao: balaoDeFala(CAMADAS_DOS_CORPOS[n]) });
    }
    atual = robos[0];
    for (const p of vila.pessoas) Object.assign(p, { pedindo: false, agradeceAte: 0, falaAte: 0, com: null, vezes: 0 });
    // a hora do primeiro pedido de cada casa, e o pedido com que ela começa (assistindo, vale a sorte da gravação: ver o fim do arquivo)
    const pedida = /^\d{1,9}$/.test(ENDERECO.get('sorte') || '') ? Number(ENDERECO.get('sorte')) : null;
    sortear(ASSISTINDO ? 0 : pedida !== null ? pedida : 1 + Math.floor(Math.random() * 0x7fffffff));
    fotografarObjetos();
    vila.central.redesenhar();
  }

  // ---------- quem assiste: a visão da iA e o modo voador ----------
  // A página mostra uma de duas visões. Nenhuma muda o jogo, e a imagem que a iA recebe é
  // sempre a dos olhos do robô, seja qual for a visão de quem assiste (ver frame).
  //   visão da iA: o que o robô vê, com tudo o que é desenhado na imagem dela.
  //   voador:      uma câmera solta, de quem assiste. Voa por onde quiser, atravessa as paredes
  //                e vê o robô por fora, de corpo inteiro (camada 1, que em primeira pessoa
  //                fica de fora). Não vê o que é desenhado na tela do robô (camada 2). Em cima
  //                da cabeça do robô vai um balão com o que a iA disse que pretende: é um
  //                pedaço da página (#pensa), não do jogo, onde apareceria no espelho.
  // Troca-se pela tecla C ou pelo botão da página (#vista); vale também assistindo a uma
  // gravação. No modo voador o teclado é de quem voa — W A S D andam, Q e E descem e sobem,
  // Shift corre, Z volta para perto do robô — e os botões do jogo, no teclado, ficam
  // desligados (a iA continua jogando pelo MCP). Um clique prende o mouse no jogo, e aí mexer
  // o mouse vira a câmera, até o Esc soltar (ver "o mouse, no modo voador"); a roda anda.
  // A visão escolhida e o lugar da câmera ficam guardados na aba, porque a página recarrega a
  // cada `comecar` e quando se volta numa gravação.
  const voador = new T.PerspectiveCamera(60, 1, 0.05, 140);
  voador.rotation.order = 'YXZ';
  voador.layers.enable(1);                      // vê o corpo do robô
  for (const c of CAMADAS_DOS_CORPOS) voador.layers.enable(c);   // (e os dos outros robôs do coletivo)
  const vista = { voando: false, posta: false, x: 0, y: 2, z: 0, yaw: 0, pitch: 0 };
  const TECLAS_DO_VOO = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight']), apertadas = new Set();
  const entre = (v, a, b) => Math.max(a, Math.min(b, v));
  // Até onde a câmera vai. Nas salas com espelho ela não sai do prédio: de fora dele, ou de
  // trás do espelho, o truque do reflexo ficaria à mostra (o mundo é desenhado duas vezes).
  const VOO = REGRAS.vila ? { x1: CIDADE.oeste - 14, x2: 162, y1: 0.25, y2: 36, z1: CIDADE.sul - 14, z2: 138 }   // (até a cachoeira, a leste, e a hidrelétrica, ao norte)
    : { x1: centro(1) - SALA.L / 2 + 0.15, x2: centro(REGRAS.salas) + SALA.L / 2 - 0.15, y1: 0.25, y2: SALA.A - 0.15, z1: Z_ESPELHO + 0.15, z2: SALA.P / 2 - 0.15 };
  // Põe a câmera perto do robô, olhando para ele: de preferência atrás dele, a 2,3 m e mais
  // alta do que ele, mas dentro do cômodo em que ele está e fora dos móveis. Se atrás houver
  // uma parede ou um móvel, vai para o lado em que há mais espaço.
  function irAteORobo() {
    const a = estado.rumo * GIRO;
    const c = REGRAS.vila ? areas[estado.sala] : { x1: centro(estado.sala) - SALA.L / 2, x2: centro(estado.sala) + SALA.L / 2, z1: -SALA.P / 2, z2: SALA.P / 2 };
    const noMeioDeUmMovel = (x, z) => blocos.some(b => x > b.x1 - 0.15 && x < b.x2 + 0.15 && z > b.z1 - 0.15 && z < b.z2 + 0.15);
    let melhor = null;
    for (let k = 0; k < 8; k++) {               // k = 0: bem atrás dele; os outros, de 45° em 45°
      const g = a + k * Math.PI / 4;
      for (const longe of [2.3, 1.9, 1.5, 1.1]) {   // nessa direção, o ponto mais afastado que não cai dentro de um móvel
        let x = estado.x + Math.sin(g) * longe, z = estado.z + Math.cos(g) * longe;
        if (c.partes) ({ x, z } = pontoNoLugar(c, x, z, 0.3));   // (na vila o lugar pode não ser um retângulo: a rua)
        else { x = entre(x, c.x1 + 0.3, c.x2 - 0.3); z = entre(z, c.z1 + 0.3, c.z2 - 0.3); }
        x = entre(x, VOO.x1, VOO.x2); z = entre(z, VOO.z1, VOO.z2);
        if (noMeioDeUmMovel(x, z) && longe > 1.1) continue;
        const d = Math.hypot(x - estado.x, z - estado.z) + (k === 0 ? 0.5 : k === 1 || k === 7 ? 0.25 : 0) - (noMeioDeUmMovel(x, z) ? 1 : 0);   // (atrás vale mais)
        if (!melhor || d > melhor.d + 1e-9) melhor = { x, z, d };
        break;
      }
    }
    const chao = alturaDoChao(estado.x, estado.z);
    Object.assign(vista, { posta: true, x: melhor.x, y: entre(2.05 + chao, VOO.y1, VOO.y2), z: melhor.z });
    const dx = estado.x - vista.x, dz = estado.z - vista.z;
    vista.yaw = Math.atan2(-dx, -dz);
    vista.pitch = Math.atan2(0.5 + chao - vista.y, Math.hypot(dx, dz) || 1e-6);   // mirando os joelhos dele: o robô fica um pouco acima do meio da tela, com lugar para o balão do pensamento em cima da cabeça
  }
  // Anda com a câmera: para a frente é para onde ela olha (subindo ou descendo junto); de lado, na horizontal.
  function andar(frente, lado, sobe) {
    const sy = Math.sin(vista.yaw), cy = Math.cos(vista.yaw), cp = Math.cos(vista.pitch), sp = Math.sin(vista.pitch);
    vista.x = entre(vista.x - sy * cp * frente + cy * lado, VOO.x1, VOO.x2);
    vista.y = entre(vista.y + sp * frente + sobe, VOO.y1, VOO.y2);
    vista.z = entre(vista.z - cy * cp * frente - sy * lado, VOO.z1, VOO.z2);
  }
  function voar(dt) {
    const tem = c => apertadas.has(c) ? 1 : 0, passo = (tem('ShiftLeft') || tem('ShiftRight') ? 9 : 3) * dt;   // metros por segundo
    andar((tem('KeyW') - tem('KeyS')) * passo, (tem('KeyD') - tem('KeyA')) * passo, (tem('KeyE') - tem('KeyQ')) * passo);
  }
  // O desenho de quem voa: como em desenhar, mas por esta câmera, com o corpo do robô e sem o que é desenhado na tela dele.
  function desenharDeFora() {
    voador.position.set(vista.x, vista.y, vista.z);
    voador.rotation.set(vista.pitch, vista.yaw, 0);
    atualizarBalao(voador);                     // o balão da pessoa, virado para esta câmera
    refletirEspelhos(voador);                   // os espelhos das casas da cidade
    if (vila.focarSol) vila.focarSol(vista.x, vista.z);   // (as sombras do sol, em volta de quem voa)
    renderer.clear();
    voador.layers.disable(3);
    if (!REGRAS.semEspelho) {                   // 1) o mundo refletido no plano do espelho
      raiz.scale.z = -1; raiz.position.z = 2 * Z_ESPELHO;
      vidro.visible = false;
      renderer.shadowMap.needsUpdate = true;
      renderer.render(cena, voador);
      raiz.scale.z = 1; raiz.position.z = 0;
      renderer.clearDepth();
    }
    vidro.visible = !REGRAS.semEspelho && !REGRAS.espelhoDisfarcado;
    voador.layers.enable(3);                    // 2) o mundo real por cima, com o balão da pessoa
    renderer.shadowMap.needsUpdate = true;
    renderer.render(cena, voador);
    porPensamento();
  }
  // O balão do que a iA pretende, em cima da cabeça do robô: a última intenção, no lugar da tela em que a cabeça aparece.
  const elVista = document.getElementById('vista'), elPensa = document.getElementById('pensa');
  let pensado = null;
  function porPensamento() {
    if (!elPensa) return;
    const ultima = COLETIVO ? atual.dentro && atual.intencao : intencoes[intencoes.length - 1];   // (no coletivo: o que pretende o robô que jogou por último)
    v3.set(visual.x, 1.52 + visual.chao, visual.z).applyMatrix4(voador.matrixWorldInverse);
    if (!ultima || v3.z > -0.15) { elPensa.hidden = true; return; }      // nada a dizer, ou o robô está atrás de quem olha
    const longe = -v3.z;
    v3.applyMatrix4(voador.projectionMatrix);
    if (ultima !== pensado) {                   // (sempre como texto: tudo aqui vem da iA)
      pensado = ultima;
      const b = document.createElement('b'), s = document.createElement('span');
      b.textContent = NOME_DO_BOTAO[ultima.botao] || ultima.botao;
      s.textContent = ultima.quer;
      elPensa.textContent = '';
      elPensa.append(b, s);
    }
    const x = tela.x + (v3.x + 1) / 2 * tela.w, y = tela.y + (1 - v3.y) / 2 * tela.h;
    elPensa.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, calc(-100% - 26px)) scale(${entre(3.2 / longe, 0.55, 1).toFixed(3)})`;
    elPensa.hidden = false;
  }
  function mostrarVista() {
    document.body.classList.toggle('voando', vista.voando);
    canvas.style.cursor = vista.voando ? 'grab' : '';
    if (elVista) elVista.querySelectorAll('button').forEach(b => b.classList.toggle('acesa', (b.dataset.vista === 'voador') === vista.voando));
    if (elPensa && !vista.voando) elPensa.hidden = true;
  }
  function guardarVista() {
    try { sessionStorage.setItem('desafio.vista', JSON.stringify({ d: DESAFIO, voando: vista.voando, p: vista.posta ? [vista.x, vista.y, vista.z, vista.yaw, vista.pitch] : null })); } catch (e) { }
  }
  // Troca a visão de quem assiste: 'ia', 'voador' ou, sem dizer qual, a outra.
  function verComo(qual) {
    const voando = qual ? qual === 'voador' : !vista.voando;
    if (voando === vista.voando) return;
    vista.voando = voando;
    apertadas.clear();
    if (!voando) soltar();                      // de volta à visão da iA, o mouse fica livre
    if (voando && !vista.posta) irAteORobo();
    mostrarVista();
    guardarVista();
    if (!voando && modoIA) { aplicarVisual(); desenhar(); }   // no modo iA a tela só muda quando a iA pede a imagem: sem isto ficaria a do voo
  }
  // A visão em que a página abre: a que estava (ver guardarVista), ou a do endereço (?vista=voador).
  function abrirVista() {
    try {
      const g = JSON.parse(sessionStorage.getItem('desafio.vista'));
      if (g && g.voando === true) vista.voando = true;
      if (g && g.d === DESAFIO && Array.isArray(g.p) && g.p.length === 5 && g.p.every(Number.isFinite))
        Object.assign(vista, { posta: true, x: entre(g.p[0], VOO.x1, VOO.x2), y: entre(g.p[1], VOO.y1, VOO.y2), z: entre(g.p[2], VOO.z1, VOO.z2), yaw: g.p[3], pitch: entre(g.p[4], -1.45, 1.45) });
    } catch (e) { }
    if (ENDERECO.get('vista') === 'voador') vista.voando = true;
    if (ENDERECO.get('vista') === 'ia') vista.voando = false;
    if (vista.voando && !vista.posta) irAteORobo();
    if (elVista) elVista.hidden = false;
    mostrarVista();
  }
  if (elVista) elVista.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    b.blur();                                   // (senão o Espaço, que numa gravação pausa, apertaria o botão de novo)
    verComo(b.dataset.vista);
  });
  window.addEventListener('pagehide', guardarVista);
  // O mouse, no modo voador. Um clique na imagem prende o mouse no jogo: daí em diante é só
  // mexer o mouse para virar a câmera, sem segurar botão nenhum, e o Esc solta (quem prende e
  // solta é o navegador: "pointer lock"). Se o navegador não prender, arrastar com o botão
  // apertado vira do mesmo jeito. A roda anda para a frente e para trás.
  let arrasto = null;
  const preso = () => document.pointerLockElement === canvas;
  const virarVista = (dx, dy, quanto) => {
    vista.yaw -= dx * quanto;
    vista.pitch = entre(vista.pitch - dy * quanto, -1.45, 1.45);
  };
  function prender() {
    if (preso() || !canvas.requestPointerLock) return;
    try {
      const pedido = canvas.requestPointerLock();
      if (pedido && pedido.catch) pedido.catch(() => { });   // (logo depois de um Esc o navegador recusa: o clique seguinte prende)
    } catch (e) { }
  }
  const soltar = () => { if (preso() && document.exitPointerLock) document.exitPointerLock(); };
  document.addEventListener('pointerlockchange', () => {
    arrasto = null;
    document.body.classList.toggle('preso', preso());
    canvas.style.cursor = vista.voando ? 'grab' : '';
    if (preso() && !vista.voando) soltar();     // (prendeu depois de a visão já ter voltado para a da iA)
  });
  document.addEventListener('mousemove', e => { if (preso() && vista.voando) virarVista(e.movementX || 0, e.movementY || 0, 0.0026); });
  canvas.addEventListener('pointerdown', e => {
    if (!vista.voando || e.button !== 0 || preso()) return;
    arrasto = { x: e.clientX, y: e.clientY };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { }
    canvas.style.cursor = 'grabbing';
    prender();
  });
  canvas.addEventListener('pointermove', e => {
    if (!arrasto || preso()) return;
    virarVista(e.clientX - arrasto.x, e.clientY - arrasto.y, 0.0045);
    arrasto = { x: e.clientX, y: e.clientY };
  });
  for (const fim of ['pointerup', 'pointercancel']) canvas.addEventListener(fim, () => { arrasto = null; canvas.style.cursor = vista.voando ? 'grab' : ''; });
  canvas.addEventListener('wheel', e => {
    if (!vista.voando) return;
    e.preventDefault();
    andar(-entre(e.deltaY, -300, 300) * 0.004, 0, 0);
  }, { passive: false });
  window.addEventListener('keyup', e => apertadas.delete(e.code));
  window.addEventListener('blur', () => apertadas.clear());

  // ---------- teclado ----------
  const BOTAO_DA_TECLA = { KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyQ: 'Q', KeyE: 'E', Space: 'ESPACO', Tab: 'TAB', KeyL: 'L', KeyT: 'T', KeyF: 'F' };
  const REPETE_SEGURANDO = new Set(['W', 'A', 'S', 'D', 'Q', 'E']);
  let ultimoPasso = 0;

  window.addEventListener('keydown', e => {
    // Quem assiste (vale também numa gravação): C troca a visão e, no modo voador, o teclado é de quem voa.
    if (elCaixa.hidden && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (e.code === 'KeyC') { e.preventDefault(); if (!e.repeat) verComo(); return; }
      // na cidade: N troca a hora do dia (dia, fim de tarde, noite) e P liga ou desliga a chuva
      if (e.code === 'KeyO') { if (!e.repeat) alternarSom(); return; }   // O: liga e desliga o som
      if (e.code === 'KeyB') { if (!e.repeat) trocarArranjo(); return; }   // B: a tela cheia ou o menu ao lado
      if (vila.clima && e.code === 'KeyN') { if (!e.repeat) vila.clima.hora = { dia: 'tarde', tarde: 'noite', noite: 'dia' }[vila.clima.hora]; return; }
      if (vila.clima && e.code === 'KeyP') { if (!e.repeat) vila.clima.chuva = !vila.clima.chovendo(); return; }
      if (vista.voando && TECLAS_DO_VOO.has(e.code)) { e.preventDefault(); apertadas.add(e.code); return; }
      if (vista.voando && e.code === 'KeyZ') { if (!e.repeat) irAteORobo(); return; }
    }
    if (ASSISTINDO) return;                     // numa gravação o teclado não joga (as teclas de quem assiste estão em gravacao.js)
    if (!elCaixa.hidden) {                      // digitando o texto do botão T
      if (e.code === 'Enter' || e.code === 'NumpadEnter') { apertar('T', elEntrada.value); elCaixa.hidden = true; }
      else if (e.code === 'Escape') elCaixa.hidden = true;
      return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.code === 'KeyT' && e.shiftKey) { if (!e.repeat) comecar('T'); return; }   // Shift+T: o treino na quadra (T sozinho é o botão do texto)
    const botao = BOTAO_DA_TECLA[e.code];
    if (botao) {
      e.preventDefault();
      if (vista.voando) return;                 // voando, o teclado não joga: quem assiste é invisível
      if (REPETE_SEGURANDO.has(botao)) {
        if (e.timeStamp - ultimoPasso < INTERVALO_TECLA) return;
        ultimoPasso = e.timeStamp;
      } else if (e.repeat) return;
      if (botao === 'T') {                      // no teclado, o texto é digitado numa caixa
        elCaixa.hidden = false; elEntrada.value = estado.texto; elEntrada.focus(); elEntrada.select();
      } else apertar(botao);
      return;
    }
    if (e.repeat) return;
    switch (e.code) {                           // controles da página, fora do jogo
      case 'KeyM': comecar('M'); break;         // o desafio multiplayer
      case 'KeyV': comecar('V'); break;         // a vila coletiva
      case 'KeyX': if (COLETIVO || quebra) apertar('SAIR'); break;   // no coletivo: o robô do teclado sai do jogo; no quebra-cabeça: desiste
      case 'KeyI':                              // modo iA: a tela congela até a próxima imagem ser pedida
        modoIA = !modoIA;
        elModo.hidden = !modoIA;
        resposta('modo iA', true, modoIA ? 'ligado: a tela congela até pedir frame' : 'desligado');
        break;
      case 'KeyH': elAjuda.hidden = !elAjuda.hidden; arrumarPaineis(); break;
      case 'KeyG': if (GRAVACAO && GRAVACAO.noServidor) GRAVACAO.abrirLista(); break;   // as gravações, em outra aba
      case 'KeyR': reiniciar(); break;
      case 'Digit1': case 'Numpad1': comecar(1); break;
      case 'Digit2': case 'Numpad2': comecar(2); break;
      case 'Digit3': case 'Numpad3': comecar(3); break;
      case 'Digit4': case 'Numpad4': comecar(4); break;
      case 'Digit5': case 'Numpad5': comecar(5); break;
      case 'Digit6': case 'Numpad6': comecar(6); break;
      case 'Digit7': case 'Numpad7': comecar(7); break;
    }
  });

  // ---------- início ----------
  if (REGRAS.vila) criarVila();                 // desafio 4: a vila inteira existe desde o começo
  else {
    const primeira = criarSala(1);
    if (REGRAS.portaManual) for (let n = 2; n <= REGRAS.salas; n++) criarSala(n);   // desafio 3: a cozinha já existe atrás da porta
    if (primeira.presente) segurar(primeira.presente);   // desafio 2: o jogador já começa com o presente na mão
  }
  if (COLETIVO) iniciarColetivo();              // os quatro robôs (ninguém em jogo ainda) e a hora dos pedidos
  animar(1, 1);                                 // tudo já no lugar (a lâmpada, as portas), sem deslizar até lá
  contador.malha.visible = REGRAS.contador;
  inventario.malha.visible = !!REGRAS.inventario;
  // resultado: o jogo acabou para quem joga? (no desafio 4 dá para perder: o bolo queima)
  // (verDe: põe a câmera de quem voa num ponto, olhando para outro: é de quem assiste e dos testes, e não muda nada no jogo)
  window.jogo = { apertar, comecar, mover, virar, pegar, levantar, escrever, frame, reiniciar, get estado() { return estado; }, salas, get itens() { return itens; }, desafio: COLETIVO ? 'V' : DESAFIO, vila, robos, som, entrar: entrarNoJogo, sair: sairDoJogo, diagnostico: () => ultima,
    quebra, novidades: novidadesDoQuebra,       // (no quebra-cabeça: o estado dele, para os testes, e o recado do fim, que vai junto com a resposta do botão: ver ponte.js)
    resultado: () => estado.ganhou ? 'ganhou' : estado.perdeu ? 'perdeu' : '',
    verDe(x, y, z, paraX, paraY, paraZ) {
      const dx = paraX - x, dy = paraY - y, dz = paraZ - z;
      Object.assign(vista, { posta: true, x: entre(x, VOO.x1, VOO.x2), y: entre(y, VOO.y1, VOO.y2), z: entre(z, VOO.z1, VOO.z2), yaw: Math.atan2(-dx, -dz), pitch: entre(Math.atan2(dy, Math.hypot(dx, dz) || 1e-6), -1.45, 1.45) });
      verComo('voador');
    } };
  // A página foi recarregada para atender ao `comecar` de uma iA que pediu a vila coletiva (ver comecar):
  // ela entra agora, e é esta página que responde ao pedido dela (ver ponte.js).
  if (COLETIVO && !ASSISTINDO) try {
    const e = JSON.parse(sessionStorage.getItem('vila.entrada'));
    sessionStorage.removeItem('vila.entrada');
    if (e && Number.isInteger(e.quem) && e.quem > 0) window.jogo.pendenteDoInicio = { id: e.cmd, quem: e.quem, espera: Promise.resolve(entrarPelaPonte(e.quem, e.nome, e.modelo)) };
  } catch (e) { }
  abrirVista();                                 // a visão de quem assiste: a da iA ou a de quem voa
  mostrarArranjo();                             // ...e o arranjo da página: a tela cheia ou o menu ao lado
  ajustarTamanho();
  aplicarVisual();
  resposta('início', true, 'ok');
  // Nas salas, os programas da placa de vídeo são pedidos todos de uma vez, antes do primeiro desenho: ela os monta enquanto a
  // página termina de se arrumar, e o primeiro desenho sai mais cedo (medido: uns 70 ms). Na cidade não compensa: são milhares
  // de peças para percorrer, e isso custa mais do que se ganha.
  if (!REGRAS.vila) try { renderer.compile(cena, camera); } catch (e) { }
  if (quebra) {                                 // no quebra-cabeça: as contas no campo de quem assiste, desde o começo; e, se a lista de teclas está solta por cima da imagem, ela começa guardada (o H a mostra), porque a parede toma a imagem inteira
    desenharQuer();
    if (elAjuda.classList.contains('solta')) elAjuda.hidden = true;
  }
  // Assistindo a uma gravação: os botões gravados são apertados de novo, na ordem, sem as
  // esperas de quem jogava — só com o tempo de ler a intenção de cada um. Para voltar a um
  // ponto anterior a página recarrega já nele (o jogo não sabe desfazer um botão): a página de
  // que se veio deixa a gravação já lida (ver gravacao.js), e esta chega ao ponto pedido aqui
  // mesmo, antes do primeiro desenho. Quem abre a gravação pela lista a busca no servidor.
  if (ASSISTINDO) {
    elAjuda.hidden = true;
    const tocarGravacao = gravada => {
      const nome = semControle(gravada.resumo.nome, 12), modelo = semControle(gravada.resumo.modelo, 24);
      const assar = Array.isArray(gravada.resumo.assar) ? gravada.resumo.assar.map(Number) : [];
      if (assar[0] > 0 && assar[1] > assar[0]) { ASSAR.pronto = assar[0]; ASSAR.queima = assar[1]; }       // o tempo de forno que valia naquela partida
      if (COLETIVO && Number.isInteger(gravada.resumo.sorte) && gravada.resumo.sorte > 0) sortear(gravada.resumo.sorte);   // ...e o sorteio do começo (sem ele na gravação, fica a ordem de antes)
      if (quebra && Number.isInteger(gravada.resumo.sorte) && gravada.resumo.sorte >= 0) { embaralharQuebra(gravada.resumo.sorte); resposta('gravação', true, 'a partida dela'); }   // ...a figura e as peças daquela partida...
      if (!(Number(gravada.resumo.versao) >= 10)) semVisada = true;                                                    // ...o que estava num móvel aberto, que era alvo mesmo tapado pela porta...
      if (!(Number(gravada.resumo.versao) >= 9)) {                                                                     // ...os pontos do carro, que não existiam, o carro, que não parava, e o rodízio dos pedidos...
        carroNaoPara = semRodizio = true;
        for (let i = blocos.length - 1; i >= 0; i--) if (blocos[i].nome === 'ponto do carro') blocos.splice(i, 1);
        { const r = CIDADE.praca - 0.42, cx = CIDADE.x - r * Math.SQRT1_2, cz = CIDADE.z + r * Math.SQRT1_2; blocos.push({ nome: 'banco', cx, cz, r: 0.4, x1: cx - 0.4, x2: cx + 0.4, z1: cz - 0.4, z2: cz + 0.4 }); }   // (e o banco do canto noroeste da praça, que ainda estava lá)
        vila.pontos.length = 0;
      }
      if (!(Number(gravada.resumo.versao) >= 8)) { prazoFixo = true; carroManual = true; if (vila.carro) vila.carro.assentar(); }       // ...o carro, que era dirigido à mão...
      if (COLETIVO && !(Number(gravada.resumo.versao) >= 7)) { pedidosDeTodos = true; for (const p of vila.pessoas) p.abreEm = PEDIDO.antes[p.casa - 1]; }   // ...as missões, que no coletivo eram de qualquer robô...
      if (!(Number(gravada.resumo.versao) >= 6)) reComMeiaVolta = true;                                                 // ...o S, que na cidade dava meia-volta antes do passo...
      if (!(Number(gravada.resumo.versao) >= 5)) semCarro = true;                                                       // ...o carro, que era só enfeite...
      if (!(Number(gravada.resumo.versao) >= 4)) for (let i = blocos.length - 1; i >= 0; i--) if (['violeiro', 'violão', 'cachorro'].includes(blocos[i].nome)) blocos.splice(i, 1);   // ...o canto da praça, que era livre...
      if (!(Number(gravada.resumo.versao) >= 3)) portasNaoFecham = true;                                                // ...as portas, que não fechavam...
      if (!(Number(gravada.resumo.versao) >= 2)) { ordemAntiga = true; resposta('gravação', true, 'regras antigas'); }   // ...e a ordem dos alvos
      toca = GRAVACAO.tocador(gravada, {
        titulo: (COLETIVO ? 'Vila coletiva' : `Desafio ${DESAFIO}`) + (nome ? ` · ${nome}` : '') + (modelo ? ` (${modelo})` : ''),
        nomeDoPasso: 'botão',
        doComeco: false,
        ehPasso: ev => ev.e === 'botao',        // cada botão é uma parada de quem anda para a frente e para trás — a imagem pedida (F) também: não muda nada no jogo, mas é quando se lê o que a iA queria ver
        aplicar(ev, rapido) {                   // (rapido: a gravação está pulando para outro ponto — o que é só de ver e de ouvir fica para o fim do pulo: ver assentar)
          depressa = rapido === true;
          try { refazer(ev); } finally { depressa = false; }
        },
        // Quanto esperar antes de `ev`: o tempo de ler o que o botão anterior pretendia (mais curto depois de uma imagem), e nunca mais do
        // que a iA esperou. Mas, se o botão anterior veio com a intenção e é do mesmo robô, espera-se esse tempo inteiro, mesmo que na
        // partida os dois tenham vindo colados (a iA que aperta um botão e já pede a imagem): senão o botão passava sem dar para ver o
        // que ele fez, e só se lia o pedido da imagem. Assim há uma pausa no botão e outra na imagem.
        espera(ev, intervalo, anterior) {
          const ler = (anterior.b === 'F' ? 500 : 900) + 35 * semControle(anterior.q, 140).length;
          return anterior.e === 'botao' && anterior.q && ev.r === anterior.r ? ler : Math.min(intervalo, ler);
        },
        assentar() { animar(1, 1); aplicarVisual(); mostrarOJogo(); desenharQuer(); },
      });
      function refazer(ev) {
        if (COLETIVO) {                       // no coletivo: quem entrou, quem saiu e o botão de cada robô (r: o número dele)
          const r = robos[Number(ev.r)], vaga = [Number(ev.x), Number(ev.z), Number(ev.rumo)];
          if (!r || !['entrou', 'saiu', 'botao'].includes(ev.e)) return;
          horaGravada = horaDaJogada = Math.max(0, Number(ev.t) || 0);
          try {
            if (ev.e === 'entrou') entrarNoJogo(100 + r.n, ev.nome, ev.modelo, vaga.every(Number.isFinite) ? vaga : undefined, r.n);
            else if (ev.e === 'saiu') sairDoJogo(r);
            else if (r.dentro) {
              atualizarPedidos();
              r.ultimoBotao = hora();
              encarnar(r);
              if (ev.b === 'F') { aplicarVisual(); contarVistas(r); } else acionar(String(ev.b), ev.x);
              if (ev.q) r.intencao = { botao: String(ev.b), quer: semControle(ev.q, 140) };
              desenharQuer();
            }
          } finally { horaDaJogada = null; }
          return;
        }
        if (ev.e === 'quem') { quemJoga.nome = semControle(ev.nome, 12); quemJoga.modelo = semControle(ev.modelo, 24); desenharQuer(); return; }   // quem estava jogando, na tela como ao vivo
        if (ev.e !== 'botao') return;
        horaGravada = horaDaJogada = Math.max(0, Number(ev.t) || 0);     // o botão vale na hora em que foi apertado ao vivo
        try { tocarNoQuebra(); if (ev.b !== 'F') acionar(String(ev.b), ev.x); } finally { horaDaJogada = null; }
        mostrarIntencao(String(ev.b), semControle(ev.q, 140));
      }
      ajustarTamanho(true);                     // (o painel da gravação vai para o lugar que tem no arranjo da página: ver repartir)
    };
    const deixada = GRAVACAO.deixada(GRAVACAO.assistindo);
    if (deixada) { try { tocarGravacao(deixada); } catch (e) { console.error(e); GRAVACAO.avisar('Não consegui tocar essa gravação.'); } }
    else GRAVACAO.carregar(GRAVACAO.assistindo).then(tocarGravacao).catch(() => GRAVACAO.avisar('Não achei essa gravação.'));
  }
  requestAnimationFrame(quadro);
})();
