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
  const NUMEROS = ['1', '2', '3', '4', '5', '6'];
  const existeDesafio = n => NUMEROS.includes(String(n));
  const DESAFIO = existeDesafio(ENDERECO.get('desafio')) ? Number(ENDERECO.get('desafio')) : 1;
  const TOTAL_SALAS = 1;                       // quantas salas tem o desafio 1; completar a última é a vitória
  const OBJETOS_NO_CHAO = 3;                    // por sala; com o da cabeça do robô, o contador vai até 4
  // O tamanho de uma sala: largura (x), profundidade (z), altura (y), em metros. Nos desafios 3
  // e 4 as salas são pequenas, para o robô não gastar o jogo atravessando salões: no 3, o
  // quarto e a cozinha têm 5 m x 5 m; no 4 (a vila), cada cômodo da casa tem 4 m x 4 m.
  const SALA = DESAFIO === 3 ? { L: 5, P: 5, A: 3 } : DESAFIO >= 4 ? { L: 4, P: 4, A: 2.6 } : { L: 8, P: 7, A: 3 };
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
  };
  const REGRAS = Object.assign({ portaManual: false, contador: true, falas: { pedido: '', agradecimento: '' } }, DESAFIOS[DESAFIO]);
  const FALAS = REGRAS.falas;                   // o que a pessoa diz (desafios 3 e 4)
  // Variante para experimentar sem mexer no código: ...?desafio=2&disfarce
  if (ENDERECO.has('disfarce')) REGRAS.espelhoDisfarcado = true;

  // Para a frente e para trás o robô anda olhando: ir para trás é dar meia-volta e então o passo.
  // (De lado é diferente: ele dá o passo sem virar. Ver mover.)
  // Valor = quantos giros de 45° antes do passo. (Virar para os lados é outro comando.)
  const GIRO_DA_DIRECAO = { 'frente': 0, 'tras': 4 };

  const centro = n => (n - 1) * SALA.L;                               // x do meio da sala n
  const salaDe = x => Math.floor((x + SALA.L / 2) / SALA.L) + 1;      // em que sala fica esse x
  const numero = n => String(n).padStart(2, '0');

  // ---------- cena ----------
  const canvas = document.getElementById('tela');
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
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
    const pl = planta(n), cozinha = !!pl.cozinha;
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
    if (cozinha) {
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
    if (!REGRAS.espelhoDisfarcado && !cozinha) {
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
        // destaque, como os objetos). A borda é uma moldura em volta do vão, dos dois lados da parede.
        const borda = new T.Group(), e = ESPESSURA + 0.07, b = 0.05;
        w.add(borda);
        malha(borda, new T.BoxGeometry(e, ALTURA_PORTA, b), M.destaque, 0, ALTURA_PORTA / 2, z1 - b / 2);
        malha(borda, new T.BoxGeometry(e, ALTURA_PORTA, b), M.destaque, 0, ALTURA_PORTA / 2, z2 + b / 2);
        malha(borda, new T.BoxGeometry(e, b, LARGURA_PORTA + 2 * b), M.destaque, 0, ALTURA_PORTA + b / 2, Z_PORTA);
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
    s.geladeira = { nome: 'geladeira', x: s.cx + GX, z: zf + prof, aberta: false, vis: 0, folhas: gel.folhas, contorno: gel.borda, dentro: [] };
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
  const vila = { clima: null, pessoa: null, tigela: null, forno: null, massa: null, bolo: null, encontro: null, pedidos: [], filtro: null, copo: null, copoCheio: null, cafeteira: null, cafe: null };
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
    if (alvo && alvo === v.pessoa) {
      // A pessoa quer uma coisa (o bolo, no desafio 4) ou duas (o remédio e a água, no 5; o pão de
      // queijo e o café, no 6): v.pedidos. Ela aceita uma de cada vez e, enquanto falta alguma,
      // diz qual. A vitória é quando recebe a última.
      const falta = v.pedidos.filter(p => !alvo.recebidos.includes(p));
      if (!o) {                                 // de mão vazia: fala com ela, e ela diz o que quer (ou o que ainda falta)
        alvo.fala = alvo.recebidos.length ? FALAS.falta[v.pedidos.indexOf(falta[0])] : FALAS.pedido;
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
        alvo.fala = FALAS.falta[v.pedidos.indexOf(falta.find(p => p !== o))];
        return resposta('pegar', true, `entregou: ${o.nome} à pessoa — ela disse: "${alvo.fala}"`);
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
      if (noMovel(x, z, o.raio) || Object.values(salas).some(q => noCaminho(q).some(p => Math.hypot(p.x - x, p.z - z) < p.raio + o.raio)))
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
  }
  // A cada quadro: o painel do fogão (quando o segundo muda) e o bolo que queima sozinho se ficar esquecido no forno.
  function tiqueDoForno() {
    const f = vila.forno;
    if (!f) return;
    const ponto = f.dentro ? pontoDoForno() : '';
    if (ponto === 'queimado') perder();
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
      for (const c of (vaos || []).slice().sort((p, q) => p - q)) {
        trechos.push([de, c - LARGURA_PORTA / 2, 0, A], [c - LARGURA_PORTA / 2, c + LARGURA_PORTA / 2, ALTURA_PORTA, A]);
        de = c + LARGURA_PORTA / 2;
      }
      trechos.push([de, b, 0, A]);
      for (const [t1, t2, y1, y2] of trechos) {
        const comp = t2 - t1, meio = (t1 + t2) / 2, alt = y2 - y1, y = (y1 + y2) / 2;
        if (comp < 1e-6) continue;
        const geo = y1 > 0 ? new T.BoxGeometry(emX ? comp : ESPESSURA, alt, emX ? ESPESSURA : comp)        // o pedaço em cima do vão
          : emX ? cantosEscuros(porMetro(new T.BoxGeometry(comp, alt, ESPESSURA, Math.ceil(comp * 3), 9, 1), comp), 'x', 'y', 0.2, 0.7)
            : cantosEscuros(porMetro(new T.BoxGeometry(ESPESSURA, alt, comp, 1, 9, Math.ceil(comp * 3)), comp), 'z', 'y', 0.2, 0.7);
        malha(g, geo, y1 > 0 ? (dentro || M_DE_DENTRO).lisa : (dentro || M_DE_DENTRO).parede, emX ? meio : fixo, y, emX ? fixo : meio);
        if (!fora) continue;
        // por fora, uma capa de reboco (um pouco mais comprida nas pontas, para fechar as quinas)
        const d = fora * (ESPESSURA / 2 + 0.015), e1 = t1 === a ? 0.09 : 0, e2 = t2 === b ? 0.09 : 0, c2 = comp + e1 + e2, m2 = meio + (e2 - e1) / 2;
        malha(g, escalarUV(new T.BoxGeometry(emX ? c2 : 0.03, alt, emX ? 0.03 : c2), c2 / 2, alt / 2), reboco, emX ? m2 : fixo + d, y, emX ? fixo + d : m2);
        if (barrado && y1 === 0) caixa(emX ? c2 : 0.02, 0.38, emX ? 0.02 : c2, barrado, emX ? m2 : fixo + d + fora * 0.012, 0.19, emX ? fixo + d + fora * 0.012 : m2);
      }
    }
    const M_DE_DENTRO = { parede: M.parede, lisa: M.paredeLisa };
    // Uma porta de correr na parede de fora de uma casa, que o jogador abre (e que fica aberta).
    // (x, z): o meio do vão; eixo: 'z' se a parede fica em z (a porta corre ao longo de x), 'x' se
    // fica em x (corre ao longo de z); salas: os dois lugares que ela liga. Trancada, não abre nem
    // é alvo: é a porta da casa que não é a deste desafio.
    function portaDaRua(x, z, eixo, salas, material, trancada, sentido) {     // (sentido: +1 se ela corre para o lado em que a medida cresce; sem isso, para o outro)
      const emZ = eixo === 'z', folha = caixa(emZ ? LARGURA_PORTA : 0.05, ALTURA_PORTA, emZ ? 0.05 : LARGURA_PORTA, material, x, ALTURA_PORTA / 2, z);
      for (const lado of [-1, 1]) caixa(emZ ? 0.05 : 0.02, 0.3, emZ ? 0.02 : 0.05, M.latao, emZ ? 0.5 : lado * 0.035, 0, emZ ? lado * 0.035 : 0.5, folha);   // os puxadores
      const borda = new T.Group(), e = ESPESSURA + 0.14, b = 0.05;
      g.add(borda);
      for (const lado of [-1, 1]) caixa(emZ ? b : e, ALTURA_PORTA, emZ ? e : b, M.destaque, emZ ? x + lado * (LARGURA_PORTA / 2 + b / 2) : x, ALTURA_PORTA / 2, emZ ? z : z + lado * (LARGURA_PORTA / 2 + b / 2), borda);
      caixa(emZ ? LARGURA_PORTA + 2 * b : e, b, emZ ? e : LARGURA_PORTA + 2 * b, M.destaque, x, ALTURA_PORTA + b / 2, z, borda);
      borda.visible = false;
      portasDaVila.push({ nome: 'porta', x, z, eixo, salas, aberta: false, trancada: !!trancada, sentido: sentido || -1, vis: 0, folha, contorno: borda });
    }
    const vao = (x, z, eixo, a, b) => portasDaVila.push({ nome: 'vão', x, z, eixo, salas: [a, b], aberta: true, vis: 1, folha: null, contorno: null });   // um vão sem porta, entre os lugares a e b
    // Cobre um retângulo com uma laje (com beiral) e um telhado de quatro águas, de telhas da cor
    // dada. `pai`: o grupo em que ele fica (as medidas são as desse grupo).
    function cobrir(x1, x2, z1, z2, y, h, cor, pai) {
      const be = 0.28, u1 = x1 - be, u2 = x2 + be, v1 = z1 - be, v2 = z2 + be, onde = pai || g;
      caixa(u2 - u1, 0.08, v2 - v1, beiral, (u1 + u2) / 2, y + 0.07, (v1 + v2) / 2, onde);   // (um pouco acima do teto de dentro, para os dois não disputarem os mesmos pixels)
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
    parede(-2.6, 0, 8, 0, [], -1, rebocoCasa, barradoCasa);
    parede(-2.6, 4, 8, 4, [6], 1, rebocoCasa, barradoCasa);
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
    parede(3.5, 8.5, 8.5, 8.5, [6], -1, rebocoMercado, barradoMercado);
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
      caixa(1.26, 1.5, 0.04, liso(0x3d4a54, 0.5), x, 1.3, 8.5 - 0.095);
      malha(g, new T.PlaneGeometry(1.14, 1.38), mat(0xa9d2e6, { roughness: 0.08, metalness: 0.4 }), x, 1.3, 8.5 - 0.118).rotation.y = Math.PI;
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

    // O sol: uma luz de longe, que faz as sombras da rua. Dentro das casas ele não entra (o
    // telhado faz sombra): lá quem ilumina é a lâmpada, que acompanha o robô.
    const SOL = new T.Vector3(0.5, 1, -0.45).normalize();
    const sol = new T.DirectionalLight(0xfff0d6, 2.8);
    sol.position.copy(MEIO).addScaledVector(SOL, 70);
    sol.target.position.copy(MEIO);
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
    plano(PX - 300, PX - 3.6, PZ - MP, PZ + MP, asfalto, 0); plano(PX + 3.6, PX + 300, PZ - MP, PZ + MP, asfalto, 0);
    plano(PX - MP, PX + MP, PZ - 300, PZ - 3.6, asfalto, 0); plano(PX - MP, PX + MP, PZ + 3.6, PZ + 300, asfalto, 0);
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
      const pedra = rebocado(0xd9d4c7), verdeFerro = mat(0x1f5a43, { roughness: 0.45, metalness: 0.3 });
      malha(g, new T.CylinderGeometry(0.62, 0.68, 0.16, 40), pedra, PX, CG + 0.08, PZ);
      malha(g, new T.CylinderGeometry(0.44, 0.48, 0.16, 40), pedra, PX, CG + 0.24, PZ);
      malha(g, new T.CylinderGeometry(0.07, 0.1, 0.72, 16), verdeFerro, PX, CG + 0.68, PZ);
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
      malha(g, new T.BoxGeometry(0.92, 0.92, 0.92), [placa, placa, verdeFerro, verdeFerro, placa, placa], PX, CG + 1.5, PZ).castShadow = true;
      malha(g, new T.ConeGeometry(0.8, 0.34, 4), verdeFerro, PX, CG + 2.13, PZ).rotation.y = Math.PI / 4;
      malha(g, new T.SphereGeometry(0.07, 16, 12), M.latao, PX, CG + 2.34, PZ);
      malha(g, new T.TorusGeometry(0.56, 0.07, 8, 40), sebeMat, PX, CG + 0.2, PZ).rotation.x = Math.PI / 2;
      for (let i = 0; i < 30; i++) flor(PX + Math.cos(i / 30 * 6.283) * 0.56, CG + 0.26, PZ + Math.sin(i / 30 * 6.283) * 0.56, 0.06, CORES_DAS_FLORES[i % 3]);
      redondo('ponto de encontro', PX, PZ, 0.68);
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
      banco(x, z, Math.PI / 2 - a, CG, 0.8);    // (um pouco menores que os da rua, para sobrar passagem)
      redondo('banco', x, z, 0.4);
      poste(PX + sx * 3.96, PZ + sz * 3.96);
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
    const cavalete = (x, z, aoLongoDeX) => {
      const b = new T.Group();
      b.position.set(x, 0, z); if (!aoLongoDeX) b.rotation.y = Math.PI / 2;
      g.add(b);
      for (const y of [0.5, 0.84]) caixa(2.5, 0.16, 0.04, listras, 0, y, 0, b);
      for (const dx of [-1.05, 1.05]) { caixa(0.06, 0.96, 0.06, ferro, dx, 0.48, 0, b); caixa(0.06, 0.05, 0.5, ferro, dx, 0.025, 0, b); }
    };
    for (const s of [-1, 1]) {
      cavalete(s < 0 ? CIDADE.oeste - 0.15 : CIDADE.leste + 0.15, PZ, false);
      cavalete(PX, s < 0 ? CIDADE.sul - 0.15 : CIDADE.norte + 0.15, true);
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
      const vidraca = mat(0x1c2b35, { roughness: 0.05, metalness: 0.7, envMap: reflexoDaRua, envMapIntensity: 1.3, side: T.DoubleSide });
      const borracha = liso(0x17181a, 0.9), plastico = liso(0x25282c, 0.6), cromado = mat(0xd0d5da, { metalness: 0.9, roughness: 0.25, envMap: reflexoDaRua });
      // um perfil de lado (x = comprimento, y = altura; um ponto de quatro números é uma curva), esticado na largura do carro
      const perfilado = (pontos, largura, chanfro) => {
        const s = new T.Shape();
        pontos.forEach((p, i) => { if (!i) s.moveTo(p[0], p[1]); else if (p.length === 4) s.quadraticCurveTo(p[0], p[1], p[2], p[3]); else s.lineTo(p[0], p[1]); });
        return new T.ExtrudeGeometry(s, { depth: largura - 2 * chanfro, bevelEnabled: true, bevelThickness: chanfro, bevelSize: chanfro * 0.8, bevelSegments: 3, curveSegments: 8 }).translate(0, 0, chanfro - largura / 2);
      };
      // a carroceria de baixo, de um para-choque ao outro, e a cabine, mais estreita, por cima
      malha(c, perfilado([[-1.6, 0.34], [-1.64, 0.62], [-1.64, 0.86, -1.5, 0.9], [0.98, 0.92], [1.5, 0.82], [1.66, 0.78, 1.66, 0.6], [1.62, 0.34]], LARG, 0.06), lataria, 0, 0, 0);
      malha(c, perfilado([[-1.5, 0.86], [-1.08, 1.32], [-1.04, 1.38, -0.9, 1.38], [0.14, 1.38], [0.28, 1.38, 0.34, 1.33], [0.98, 0.9]], 1.28, 0.05), lataria, 0, 0, 0);
      // os vidros: os dos lados (dois de cada), o para-brisa e o de trás, deitados sobre a cabine
      for (const pontos of [[[-1.36, 0.93], [-1.06, 1.27], [-0.44, 1.29], [-0.44, 0.93]], [[-0.36, 0.93], [-0.36, 1.29], [0.28, 1.29], [0.84, 0.93]]]) {
        const s = new T.Shape();
        pontos.forEach(([px, py], i) => { if (i) s.lineTo(px, py); else s.moveTo(px, py); });
        for (const lado of [-1, 1]) malha(c, new T.ShapeGeometry(s), vidraca, 0, 0, lado * 0.642);
      }
      malha(c, new T.BoxGeometry(0.64, 0.012, 1.1), vidraca, 0.686, 1.153, 0).rotation.z = -0.592;
      malha(c, new T.BoxGeometry(0.48, 0.012, 1.08), vidraca, -1.324, 1.121, 0).rotation.z = 0.831;
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
    }
    carro(-4.0, 1.95, -Math.PI / 2, 0x2f6fb5);                                              // na entrada ao lado da nossa casa, de frente para a rua: fora do caminho do robô
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

    // as copas, os troncos, as moitas e as flores, cada tipo numa malha só
    for (const [nome, tons] of Object.entries(copas)) tons.forEach((pecas, i) => { if (pecas.length) malha(g, juntar(pecas), mat(CORES_DAS_COPAS[nome][i], { roughness: 0.9, flatShading: true }), 0, 0, 0); });
    malha(g, juntar(troncos), tronco, 0, 0, 0);
    malha(g, juntar(moitas), mat(0x4a8f44, { roughness: 0.95, flatShading: true }), 0, 0, 0);
    for (const [cor, pecas] of Object.entries(petalas)) malha(g, juntar(pecas), liso(Number(cor), 0.7), 0, 0, 0);
    // por fora da nossa casa: a janela do quarto, a do banheiro e o batente da porta
    for (const [x, y, w, h] of [[2.0, 1.5, 1.0, 1.0], [-1.3, 1.85, 0.6, 0.45]]) {
      caixa(w + 0.14, h + 0.14, 0.03, branco, x, y, 4.1);
      malha(g, new T.PlaneGeometry(w, h), mat(0x8fc2dc, { roughness: 0.08, metalness: 0.4 }), x, y, 4.118);
      caixa(0.04, h, 0.01, branco, x, y, 4.122);
    }
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
    caixa(1.06, 1.06, 0.03, branco, 2.13, 1.55, 0.075);                                   // a janela (por dentro), com cortinas
    malha(g, new T.PlaneGeometry(0.94, 0.94), luminoso({ color: 0xbfe3f7 }), 2.13, 1.55, 0.092);
    caixa(0.03, 0.94, 0.012, branco, 2.13, 1.55, 0.096); caixa(0.94, 0.03, 0.012, branco, 2.13, 1.55, 0.096);
    for (const x of [1.72, 2.54]) caixa(0.26, 1.25, 0.03, liso(0xe8d9c0, 1), x, 1.52, 0.11);
    const quadro = malha(g, new T.PlaneGeometry(0.7, 0.5), M.quadro, 3.93, 1.6, 3.3);
    quadro.rotation.y = -Math.PI / 2;
    // Quem mora na casa deste desafio: sentada numa poltrona, de costas para uma parede (em z =
    // `parede`) e de frente para onde o robô começa. Não diz nada até falarem com ela. O alvo fica
    // nos joelhos (ver criarSala). O que ela recebe fica no braço da poltrona: a primeira coisa
    // do lado da mão direita, a segunda do outro.
    const morador = (corpo, x, z, sala, parede) => {
      corpo.grupo.position.set(x, 0, z);
      g.add(corpo.grupo);
      vila.pessoa = pessoa = { nome: 'pessoa', x, z: z - 0.45, rosto: { x, z: z + 0.04 }, sala, corpo, contorno: corpo.contorno, fala: '', recebeu: null, recebidos: [],
        receber(o) {
          corpo.grupo.add(o.malha);
          o.malha.position.set(this.recebidos.length ? -0.3 : 0.3, 0.64 + o.alt / 2, -0.29);
          this.recebidos.push(o);
          this.fala = FALAS.agradecimento;
        } };
      bloco('poltrona', x - 0.42, x + 0.42, z - 0.65, parede);
    };
    if (DESAFIO === 4) morador(montarPessoa(), 2.0, 3.48, 1, 4);     // (nos outros desafios a casa é outra: aqui não há ninguém)

    // --- banheiro (2): pia com espelho, vaso e box (só enfeite) ---
    const louca = liso(0xf7f7f4, 0.2), vidroDoBox = new T.MeshStandardMaterial({ color: 0xbfe3f0, transparent: true, opacity: 0.28, roughness: 0.05, depthWrite: false, side: T.DoubleSide });
    caixa(0.9, 0.8, 0.45, branco, -1.3, 0.4, 0.3);                                        // gabinete da pia
    malha(g, caixaSuave(0.94, 0.05, 0.5, 0.015), louca, -1.3, 0.83, 0.31);
    malha(g, new T.CylinderGeometry(0.17, 0.12, 0.05, 24), liso(0xdfe6e9, 0.15), -1.3, 0.845, 0.33);
    malha(g, new T.CylinderGeometry(0.014, 0.014, 0.2, 12), M.inox, -1.3, 0.95, 0.12);
    caixa(0.78, 0.9, 0.03, M.nogueira, -1.3, 1.55, 0.075);                                // o espelho da pia: um metal polido, que só rebate a luz do ambiente
    malha(g, new T.PlaneGeometry(0.7, 0.82), mat(0xe6eef2, { metalness: 1, roughness: 0.04 }), -1.3, 1.55, 0.092);
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
    const geladeira = { nome: 'geladeira', x: 7.3, z: zf + gel.prof, sala: 3, aberta: false, vis: 0, folhas: gel.folhas, contorno: gel.borda, dentro: [] };
    abrem.push(geladeira);
    bloco('geladeira', 7.3 - 0.54, 7.3 + 0.54, 0, zf + gel.prof + 0.3);
    // armário de despensa, encostado na parede da rua (a frente olha para -z)
    const arm = montarMovel({ corpo: madeiraClara, porta: madeira, forro: mat(0x6f5236, { side: T.BackSide, roughness: 0.8 }) });
    arm.grupo.position.set(7.3, 0, 4 - 0.06 - arm.prof / 2);
    arm.grupo.rotation.y = Math.PI;
    g.add(arm.grupo);
    for (const [x, y, cor] of [[0.2, arm.Y2, 0xc8372d], [0.05, arm.Y2, 0xf2c230], [-0.2, arm.Y2, 0x35a853], [0.22, arm.base + 0.02, 0x2f7de1], [-0.15, arm.base + 0.02, 0xf2801f]])   // potes, de enfeite
      malha(arm.grupo, new T.CylinderGeometry(0.05, 0.05, 0.16, 16), liso(cor, 0.4), x, y + 0.09, 0.02);
    const despensa = { nome: 'armário', x: 7.3, z: 4 - 0.06 - arm.prof, sala: 3, aberta: false, vis: 0, folhas: arm.folhas, contorno: arm.borda, dentro: [] };
    abrem.push(despensa);
    bloco('armário', 7.3 - 0.54, 7.3 + 0.54, 4 - 0.06 - arm.prof - 0.3, 4);
    malha(g, new T.CylinderGeometry(0.42, 0.42, 0.04, 32), madeira, 4.62, 0.74, 3.42);     // mesinha redonda com dois banquinhos
    malha(g, new T.CylinderGeometry(0.04, 0.04, 0.72, 12), preto, 4.62, 0.36, 3.42);
    malha(g, new T.CylinderGeometry(0.2, 0.2, 0.02, 24), preto, 4.62, 0.01, 3.42);
    for (const dx of [-0.34, 0.3]) { malha(g, new T.CylinderGeometry(0.15, 0.15, 0.04, 20), madeira, 4.62 + dx, 0.46, 3.0 + Math.abs(dx) * 0.3); malha(g, new T.CylinderGeometry(0.03, 0.03, 0.44, 10), preto, 4.62 + dx, 0.22, 3.0 + Math.abs(dx) * 0.3); }
    bloco('mesa', 4.1, 5.1, 2.9, 3.94);
    // a porta da rua: de correr, como as dos outros desafios; é o jogador que abre, e ela fica aberta (no desafio 5, que é o da outra casa, fica trancada)
    portaDaRua(6, 4, 'z', [3, 4], M.porta, DESAFIO !== 4);
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
    const vidroDaRua = mat(0x8fc2dc, { roughness: 0.06, metalness: 0.5, envMap: reflexoDaRua, envMapIntensity: 1.1 });
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
    parede(FX, FZ1, FX, FZ2, [-2.5], -1, rebocoRosa, barradoRosa, chique);
    parede(FX, FZ2, FE, FZ2, [], 1, rebocoRosa, barradoRosa, chique);
    parede(FX, FZ1, FE, FZ1, [], -1, rebocoRosa, barradoRosa, chique);
    parede(FE, FZ1, FE, FZ2, [], 1, rebocoRosa, barradoRosa, chique);
    parede(20.25, FZ1, 20.25, FZ2, [-3], 0, null, null, chique);
    parede(24.25, FZ1, 24.25, FZ2, [-2], 0, null, null, chique);
    piso(FX, 20.25, FZ1, FZ2, marmore); piso(20.25, 24.25, FZ1, FZ2, madeiraEscura); piso(24.25, FE, FZ1, FZ2, marmoreVerde, 2.4 / 4, 1);
    teto(FX, 20.25, FZ1, FZ2); teto(20.25, 24.25, FZ1, FZ2); teto(24.25, FE, FZ1, FZ2);
    cobrir(FX, FE, FZ1, FZ2, A, 1.25, 0x5f5a66);
    portaDaRua(FX, -2.5, 'x', [6, 4], liso(0x1f4e5a, 0.45), DESAFIO !== 5);              // a porta da rua (trancada nos desafios que não são o desta casa)
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
      caixa(0.03, 1.14, 0.94, branco, xf, 1.5, -4.2);
      malha(g, new T.PlaneGeometry(0.8, 1.0), vidroDaRua, xf - 0.018, 1.5, -4.2).rotation.y = -Math.PI / 2;
      caixa(0.01, 1.0, 0.04, branco, xf - 0.022, 1.5, -4.2); caixa(0.01, 0.04, 0.8, branco, xf - 0.022, 1.5, -4.2);
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
      if (DESAFIO === 5) morador(montarPessoa(true), 21.5, FN - 0.46, 7, FZ2);                               // a mulher, com a mão na testa
      const PX0 = 20.25 + 0.06;                    // a penteadeira, na parede da sala: o tampo de mármore, o espelho redondo e o banquinho
      malha(g, caixaSuave(0.42, 0.04, 1.0, 0.012), marmoreLiso, PX0 + 0.22, 0.76, -1.62);
      for (const dz of [-0.44, 0.44]) for (const dx of [0.05, 0.39]) malha(g, new T.CylinderGeometry(0.014, 0.014, 0.74, 8), dourado, PX0 + dx, 0.37, -1.62 + dz);
      malha(g, new T.CylinderGeometry(0.33, 0.33, 0.02, 40), dourado, PX0 + 0.012, 1.42, -1.62).rotation.z = Math.PI / 2;
      malha(g, new T.CircleGeometry(0.29, 40), mat(0xe6eef2, { metalness: 1, roughness: 0.04 }), PX0 + 0.025, 1.42, -1.62).rotation.y = Math.PI / 2;
      malha(g, new T.CylinderGeometry(0.16, 0.16, 0.08, 20), rosado, PX0 + 0.7, 0.44, -1.62);
      malha(g, new T.CylinderGeometry(0.02, 0.1, 0.4, 12), dourado, PX0 + 0.7, 0.2, -1.62);
      bloco('penteadeira', 20.25, PX0 + 0.88, -2.15, FZ2);
      caixa(1.06, 1.26, 0.03, branco, 23.1, 1.5, FN - 0.015);                                                 // a janela, com cortinas de veludo
      malha(g, new T.PlaneGeometry(0.94, 1.14), luminoso({ color: 0xcfe9fa }), 23.1, 1.5, FN - 0.032).rotation.y = Math.PI;
      caixa(0.03, 1.14, 0.012, branco, 23.1, 1.5, FN - 0.036); caixa(0.94, 0.03, 0.012, branco, 23.1, 1.5, FN - 0.036);
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
      malha(g, new T.CircleGeometry(0.28, 40), mat(0xe6eef2, { metalness: 1, roughness: 0.04 }), 25.6, 1.55, FN - 0.025).rotation.y = Math.PI;
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
      parede(X1, Z1, X2, Z1, [XP], -1, rebocoF, barradoF);
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
      for (const x of [20.2, 22.85]) {                                                                        // as vitrines, de enfeite
        caixa(1.0, 1.5, 0.04, liso(0x3d4a54, 0.5), x, 1.3, Z1 - 0.095);
        malha(g, new T.PlaneGeometry(0.88, 1.38), vidroDaRua, x, 1.3, Z1 - 0.118).rotation.y = Math.PI;
      }
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
      parede(X1, Z2, X2, Z2, [21], 1, rebocoAzul, barradoAzul);
      parede(X1, Z1, X1, Z2, [], -1, rebocoAzul, barradoAzul);
      parede(X2, Z1, X2, Z2, [], 1, rebocoAzul, barradoAzul);
      parede(XM, Z1, XM, Z2, [2]);
      piso(X1, XM, Z1, Z2, M.ladrilho, (XM - X1) / 4, 1); piso(XM, X2, Z1, Z2, M.piso, (X2 - XM) / 4, 1);
      teto(X1, XM, Z1, Z2); teto(XM, X2, Z1, Z2);
      cobrir(X1, X2, Z1, Z2, A, 1.2, 0x8a4a3a);
      portaDaRua(21, Z2, 'z', [10, 4], liso(0xc8553d, 0.5), DESAFIO !== 6, 1);            // (corre para o leste: do outro lado a parede acaba logo)
      vao(XM, 2, 'x', 10, 11);
      // por fora, na rua: o batente da porta, duas janelas com floreira e o capacho
      for (const x of [20.25, 21.75]) caixa(0.1, ALTURA_PORTA + 0.1, 0.05, branco, x, (ALTURA_PORTA + 0.1) / 2, Z2 + 0.1);
      caixa(1.6, 0.1, 0.05, branco, 21, ALTURA_PORTA + 0.05, Z2 + 0.1);
      for (const x of [23.0, 24.5]) {
        caixa(1.04, 1.14, 0.03, branco, x, 1.5, Z2 + 0.1);
        malha(g, new T.PlaneGeometry(0.9, 1.0), vidroDaRua, x, 1.5, Z2 + 0.118);
        caixa(0.04, 1.0, 0.01, branco, x, 1.5, Z2 + 0.122); caixa(0.9, 0.04, 0.01, branco, x, 1.5, Z2 + 0.122);
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
      casaAzul.geladeira = { nome: 'geladeira', x: 21.95, z: zs + movel.prof, sala: 10, aberta: false, vis: 0, folhas: movel.folhas, contorno: movel.borda, dentro: [] };
      abrem.push(casaAzul.geladeira);
      bloco('geladeira', 21.95 - 0.54, XM, Z1, zs + movel.prof + 0.3);
      malha(g, new T.CylinderGeometry(0.36, 0.36, 0.04, 28), madeira, X1 + 0.5, 0.74, 2.45);                 // a mesinha, com um banquinho
      malha(g, new T.CylinderGeometry(0.04, 0.04, 0.72, 12), preto, X1 + 0.5, 0.36, 2.45);
      malha(g, new T.CylinderGeometry(0.18, 0.18, 0.02, 20), preto, X1 + 0.5, 0.01, 2.45);
      malha(g, new T.CylinderGeometry(0.15, 0.15, 0.04, 20), madeira, X1 + 0.62, 0.46, 3.1); malha(g, new T.CylinderGeometry(0.03, 0.03, 0.44, 10), preto, X1 + 0.62, 0.22, 3.1);
      bloco('mesa', X1, X1 + 0.92, 2.05, 3.3);
      // a sala (11): o morador na poltrona, de costas para a parede da rua; a TV na do sul; a estante na do leste
      if (DESAFIO === 6) morador(montarPessoa(false, 0x2f7d5b), 24.0, 3.48, 11, Z2);
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
      caixa(1.06, 1.26, 0.03, branco, 23.0, 1.5, Z2 - 0.075);                                                // a janela, por dentro
      malha(g, new T.PlaneGeometry(0.94, 1.14), luminoso({ color: 0xbfe3f7 }), 23.0, 1.5, Z2 - 0.092).rotation.y = Math.PI;
      caixa(0.03, 1.14, 0.012, branco, 23.0, 1.5, Z2 - 0.096); caixa(0.94, 0.03, 0.012, branco, 23.0, 1.5, Z2 - 0.096);
      malha(g, new T.PlaneGeometry(0.7, 0.5), M.quadro, XM + 0.065, 1.6, 0.9).rotation.y = Math.PI / 2;      // um quadro
    }

    // --- a padaria (12), na rua do oeste: de portas abertas, como as outras lojas ---
    {
      const X1 = -4.2, X2 = 1.9, Z1 = 8.5, Z2 = 12.5, XP = 0.5, XM = (X1 + X2) / 2, rebocoP = rebocado(0xe8b4a0), barradoP = liso(0x7a4a2a, 0.9);
      parede(X1, Z1, X2, Z1, [XP], -1, rebocoP, barradoP);
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
      caixa(3.1, 1.5, 0.04, liso(0x4a3324, 0.5), -2.1, 1.3, Z1 - 0.095);                                     // a vitrine, com o toldo
      malha(g, new T.PlaneGeometry(2.98, 1.38), vidroDaRua, -2.1, 1.3, Z1 - 0.118).rotation.y = Math.PI;
      caixa(0.05, 1.38, 0.02, liso(0x4a3324, 0.5), -2.1, 1.3, Z1 - 0.125);
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
      sol.position.copy(MEIO).addScaledVector(v.sol, 70);
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
      vidroDaRua.emissiveIntensity = v.janelas;
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

    fazSombra(g);
    for (const m of semSombra) m.castShadow = false;
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
    const camera = cam || olhos;
    balao.visible = false;
    if (!pessoa || !pessoa.fala) return;
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
  function montarRobo(comBorda) {
    const grupo = new T.Group(), braco = new T.Group(), cascas = [];
    const claro = mat(0xe6eaee, { roughness: 0.32 }), escuro = mat(0x2c333b, { roughness: 0.4 }), laranja = mat(0xff8a3d, { roughness: 0.4 });
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

  // ---------- pessoa (desafios 3, 4 e 5) ----------
  // Uma pessoa sentada numa poltrona, olhando para -z; a origem é o chão, no meio da poltrona.
  // Devolve o grupo e `contorno`, a borda de destaque em volta do corpo (não da poltrona).
  // Com `mulher`, é a moradora do flat (desafio 5): de vestido, cabelo comprido, numa poltrona
  // clara, com o cotovelo esquerdo no braço da poltrona e a mão na testa, de dor de cabeça.
  function montarPessoa(mulher, camisa) {       // (camisa: outra cor de blusa, para o morador de outra casa não ser igual)
    const grupo = new T.Group(), cascas = [];
    const pele = mat(mulher ? 0xe0b090 : 0xd8a47f, { roughness: 0.6 }), cabelo = mat(mulher ? 0x5a2c1a : 0x2b1d15, { roughness: 0.85 }), escuro = mat(0x1c1512, { roughness: 0.5 });
    const blusa = mat(camisa || (mulher ? 0x8c2f4b : 0x2f4f7f), { roughness: 0.85 }), calca = mulher ? blusa : mat(0x4b5563, { roughness: 0.85 }), sapato = mat(mulher ? 0xc9a57a : 0x2a2320, { roughness: 0.5 });
    const tecido = mat(mulher ? 0xece4d6 : 0xa85a3c, { roughness: 0.95 }), canela = mulher ? pele : calca, perna = mulher ? 0.11 : 0.13;
    const BORDA = 0.028;
    const caixa = (l, a, p, material, x, y, z, naBorda) => {
      const r = Math.min(0.05, Math.min(l, a, p) / 3);
      malha(grupo, caixaSuave(l, a, p, r), material, x, y, z);
      if (naBorda) cascas.push(malha(grupo, caixaSuave(l + 2 * BORDA, a + 2 * BORDA, p + 2 * BORDA, r + BORDA * 0.6), M.contorno, x, y, z));
    };
    const bola = (raio, material, x, y, z, naBorda) => {
      malha(grupo, new T.SphereGeometry(raio, 24, 16), material, x, y, z);
      if (naBorda) cascas.push(malha(grupo, new T.SphereGeometry(raio + BORDA, 24, 16), M.contorno, x, y, z));
    };

    // poltrona: base, assento, encosto, braços e pés
    caixa(0.80, 0.30, 0.76, tecido, 0, 0.19, 0);
    caixa(0.54, 0.14, 0.58, tecido, 0, 0.39, -0.06);
    caixa(0.80, 0.72, 0.18, tecido, 0, 0.70, 0.29);
    for (const x of [-0.335, 0.335]) caixa(0.13, 0.32, 0.64, tecido, x, 0.48, -0.06);
    for (const x of [-0.33, 0.33]) for (const z of [-0.3, 0.3])
      malha(grupo, new T.CylinderGeometry(0.025, 0.02, 0.05, 12), mulher ? M.latao : M.nogueira, x, 0.025, z);

    // pernas: coxas no assento, canelas para baixo
    for (const x of [-0.1, 0.1]) {
      caixa(0.15, 0.14, 0.50, calca, x, 0.53, -0.215, true);
      caixa(perna, 0.42, perna, canela, x, 0.27, -0.455, true);
      caixa(perna, 0.08, 0.26, sapato, x, 0.045, -0.5);
    }
    if (mulher) caixa(0.42, 0.1, 0.52, calca, 0, 0.6, -0.2);                             // a saia do vestido, por cima das coxas
    caixa(0.38, 0.52, 0.22, blusa, 0, 0.74, 0.06, true);                                 // tronco
    for (const lado of [-1, 1]) {
      if (mulher && lado < 0) continue;                                                  // (o braço esquerdo dela é outro: ver abaixo)
      caixa(0.1, 0.30, 0.1, blusa, lado * 0.245, 0.80, 0.06, true);                      // braço
      caixa(0.09, 0.09, 0.30, mulher ? pele : blusa, lado * 0.3, 0.69, -0.07, true);     // antebraço, apoiado no braço da poltrona
      bola(0.05, pele, lado * 0.3, 0.69, -0.26);                                         // mão
    }
    malha(grupo, new T.CylinderGeometry(0.05, 0.055, 0.1, 16), pele, 0, 1.03, 0.05);     // pescoço
    const CX = 0.04, CY = 1.17;                  // centro da cabeça
    bola(0.115, pele, 0, CY, CX, true);
    // cabelo: uma calota inclinada para trás, que deixa a testa e o rosto de fora
    malha(grupo, new T.SphereGeometry(0.124, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), cabelo, 0, CY + 0.004, CX + 0.004).rotation.x = 0.45;
    for (const x of [-0.042, 0.042]) bola(0.014, escuro, x, CY + 0.02, CX - 0.105);      // olhos
    bola(0.016, pele, 0, CY - 0.012, CX - 0.117);                                        // nariz
    malha(grupo, new T.BoxGeometry(0.046, 0.01, 0.01), mat(mulher ? 0xb3263a : 0x8a3b32, { roughness: 0.6 }), 0, CY - 0.05, CX - 0.102);   // boca
    if (mulher) {
      // o cabelo comprido: atrás, até os ombros, e uma mecha de cada lado; e os brincos
      malha(grupo, caixaSuave(0.25, 0.36, 0.09, 0.04), cabelo, 0, CY - 0.15, CX + 0.095);
      for (const lado of [-1, 1]) {
        malha(grupo, caixaSuave(0.06, 0.3, 0.12, 0.025), cabelo, lado * 0.118, CY - 0.11, CX + 0.045);
        malha(grupo, new T.SphereGeometry(0.014, 10, 8), M.latao, lado * 0.121, CY - 0.045, CX - 0.03);
      }
      // a dor de cabeça: o cotovelo esquerdo no braço da poltrona e a mão na testa
      const membro = (de, ate, grossura, material) => {
        const m = malha(grupo, caixaSuave(grossura, grossura, de.distanceTo(ate) + grossura * 0.5, grossura * 0.3), material, (de.x + ate.x) / 2, (de.y + ate.y) / 2, (de.z + ate.z) / 2);
        m.lookAt(ate);
      };
      const ombro = new T.Vector3(-0.245, 0.93, 0.06), cotovelo = new T.Vector3(-0.31, 0.7, -0.14), mao = new T.Vector3(-0.105, 1.2, -0.055);
      membro(ombro, cotovelo, 0.1, blusa);
      membro(cotovelo, mao, 0.085, pele);
      bola(0.05, pele, mao.x, mao.y, mao.z);
    }

    sombraNoChao(grupo, 0.6, 0.006);
    fazSombra(grupo);
    cascas.forEach(c => { c.visible = false; });
    return { grupo, contorno: { set visible(v) { cascas.forEach(c => { c.visible = v; }); } } };
  }

  // O robô do jogador. Camada 1 = só aparece no reflexo: em primeira pessoa o jogador não
  // vê o próprio corpo, exceto o braço direito quando levantado (camadas 0 e 1).
  const eu = montarRobo(false);
  const robo = eu.grupo, bracoDireito = eu.braco;
  raiz.add(robo);
  robo.traverse(o => o.layers.set(1));
  bracoDireito.traverse(o => o.layers.enable(0));

  // ---------- estado ----------
  // `estado` é a verdade do jogo e muda na hora; `visual` só persegue o estado para animar.
  // rumo: múltiplos de 45°, 0 = de frente para o espelho; segurando / naCabeca: objeto ou null
  const estado = { x: REGRAS.inicio.x || 0, z: REGRAS.inicio.z, rumo: REGRAS.inicio.rumo, sala: REGRAS.inicio.sala || 1, segurando: null, naCabeca: null, maoLevantada: false, texto: '', ganhou: false, perdeu: false };
  // (luz, luzY, luzZ e forca: onde está a lâmpada, que acompanha o robô, e a força dela: ver luzDaqui)
  // (chao: a altura do chão debaixo do robô: na vila, a calçada é um degrau acima do asfalto: ver alturaDoChao)
  const visual = { x: estado.x, z: estado.z, yaw: estado.rumo * GIRO, braco: 0, luz: 0, luzY: SALA.A - 0.35, luzZ: 0, forca: 2.1, chao: 0 };
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
  const itens = [];
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
    const lado = REGRAS.passoDeLado ? { esquerda: 2, direita: -2 }[direcao] : undefined, giro = lado === undefined ? GIRO_DA_DIRECAO[direcao] : 0;
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
    escolhido = undefined;
    estado.rumo += lado === 'esquerda' ? 1 : -1;
    return resposta(`virar ${lado}`, true, 'ok');
  }

  // Distância até algo que esteja ao alcance e à frente (±45°); Infinity se não estiver.
  function alcance(alvo) {
    const v = vetores(), ox = alvo.x - estado.x, oz = alvo.z - estado.z, dist = Math.hypot(ox, oz);
    return dist <= ALCANCE && (ox * v.fx + oz * v.fz) / dist >= 0.69 ? dist : Infinity;
  }

  // Levanta ou abaixa a mão direita, com ou sem objeto nela. Com a mão no alto, pegar só
  // mexe com a cabeça; com a mão embaixo, só com o chão e a cesta. (No desafio 4 não há o que
  // fazer com a cabeça: lá o botão L troca o item que está na mão: ver trocarItem.)
  function levantar() {
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
    const aqui = estado.sala, s = salas[aqui], o = estado.segurando, lista = [];
    const perto = a => !!a && (!REGRAS.vila || (a.salas ? a.salas.includes(aqui) : a.sala === aqui)) && alcance(a) < Infinity;
    // Entre coisas do mesmo tipo, vem primeiro a que está mais no centro da imagem (ver centralidade).
    // (Nas gravações feitas antes disso valia a mais próxima do robô: ver ordemAntiga.)
    const maisPertoPrimeiro = coisas => coisas.filter(perto).sort(ordemAntiga ? (a, b) => alcance(a) - alcance(b) : (a, b) => centralidade(b) - centralidade(a));
    const soltosNaLista = [];
    const gente = REGRAS.vila ? vila.pessoa : s.pessoa;
    // As portas que o jogador abre e fecha: na vila, as das casas (a trancada não é alvo: é a da casa
    // de outro desafio); nas salas, a desta sala e a da sala anterior, que é a mesma porta vista do outro lado.
    const portas = REGRAS.vila ? portasDaVila.filter(p => p.folha && !p.trancada)
      : REGRAS.portaManual ? [s.porta, salas[aqui - 1] && salas[aqui - 1].porta].filter(Boolean) : [];
    if (!REGRAS.vila && o && s.outroRobo && !s.outroRobo.recebeu && perto(s.outroRobo)) lista.push(s.outroRobo);
    if (gente && !gente.recebeu && (o || !estado.maoLevantada) && perto(gente)) lista.push(gente);
    lista.push(...maisPertoPrimeiro([...portas, ...abrem].filter(a => !a.aberta)));
    // Os objetos soltos ao alcance. Com a porta de saída aberta não há o que pegar (desafio 1):
    // a sala está completa, e os objetos da próxima só valem depois que o robô entra nela. Na
    // sala com a porta que o jogador abre, vale o objeto de qualquer sala; na vila, só os do lugar.
    const soltos = () => {
      const achados = portaAberta && !REGRAS.portaManual ? []
        : maisPertoPrimeiro((REGRAS.portaManual ? Object.values(salas).flatMap(q => q.objetos) : s.objetos).filter(p => !foraDoChao(p)));
      soltosNaLista.push(...achados);
      return achados;
    };
    if (estado.maoLevantada) { if (o) lista.push(null); else if (estado.naCabeca) lista.push(estado.naCabeca); }
    else if (o) {
      if (REGRAS.vila) {
        if (o.ingrediente && !vila.tigela.pronta && perto(vila.tigela)) lista.push(vila.tigela);
        if ((o === vila.massa || vila.forno.dentro) && perto(vila.forno)) lista.push(vila.forno);   // pôr a massa no forno, ou tirar o que está lá
        if (o === vila.copo && perto(vila.filtro)) lista.push(vila.filtro);                           // encher o copo no filtro
        if (o.paraOCafe && !vila.cafeteira.pronta && perto(vila.cafeteira)) lista.push(vila.cafeteira);   // pôr a água ou o pó na cafeteira
        if (REGRAS.inventario) lista.push(...soltos());
      } else if (perto(s.cesta)) lista.push(s.cesta);
      lista.push(null);
    } else {
      if (REGRAS.vila && vila.forno.dentro && perto(vila.forno)) lista.push(vila.forno);
      lista.push(...soltos());
    }
    // Por último, o que está aberto e dá para fechar: os móveis e as portas (menos a porta em cujo vão o robô está).
    lista.push(...maisPertoPrimeiro([...abrem, ...(portasNaoFecham ? [] : portas.filter(p => !noVaoDaPorta(p)))].filter(a => a.aberta)));
    // São no máximo MAXIMO_DE_ALVOS (um algarismo para cada um: ver marcarAlvos). Num lugar
    // cheio de objetos, ficam os que estão mais no centro da vista: saem os soltos de mais fora.
    while (lista.length > MAXIMO_DE_ALVOS && soltosNaLista.length) lista.splice(lista.indexOf(soltosNaLista.pop()), 1);
    lista.length = Math.min(lista.length, MAXIMO_DE_ALVOS);
    return lista;
  }
  const MAXIMO_DE_ALVOS = 9;
  // Nas gravações feitas antes de existir a ordem pelo centro da imagem, entre coisas do mesmo
  // tipo valia a mais próxima do robô. Assistindo a uma delas, vale a ordem antiga (ver o fim do arquivo).
  let ordemAntiga = false;
  // As portas que o jogador abre também fecham: aberta e ao alcance, a porta é um alvo (o último da
  // lista), e o ESPACO a fecha. Só não fecha com o robô no vão dela. Nas gravações feitas antes
  // disso a porta ficava aberta para sempre; assistindo a uma delas, vale a regra antiga.
  let portasNaoFecham = false;
  const noVaoDaPorta = p => REGRAS.vila ? noVaoDe(p, estado.x, estado.z)
    : Math.abs(estado.x - p.x) <= MARGEM_PAREDE + 1e-9 && noVao(estado.z);
  // A altura do ponto para onde se olha em quem não é um objeto de pegar (móvel, porta, gente):
  // é onde fica o número dele na imagem. Escolhida para não tapar o que importa ver (o que há
  // dentro do móvel, o vidro do forno, o texto no peito do outro robô).
  const ALTO = { cesta: 0.42, forno: 0.68, pessoa: 0.8, porta: 1.15, 'outro robô': 1.38, geladeira: 0.38, 'armário': 0.6 };
  // O ponto do alvo: o meio do objeto de pegar; nos outros, o lugar dele no chão, na altura de ALTO.
  const pontoDe = a => {
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
  for (let n = 1; n <= MAXIMO_DE_ALVOS; n++) {
    const m = new T.Sprite(new T.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false, sizeAttenuation: false,
      map: texturaCanvas(96, 96, (g, l) => {
        g.fillStyle = '#ffffff'; g.strokeStyle = '#0a0e12'; g.lineWidth = 8;
        g.beginPath(); g.arc(l / 2, l / 2, l / 2 - 6, 0, 7); g.fill(); g.stroke();
        g.fillStyle = '#0a0e12'; g.font = 'bold 64px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(n), l / 2, l / 2 + 5);
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
  // O que o ESPACO faria nesse alvo, em poucas palavras (desafio 4).
  function acaoDe(a) {
    const o = estado.segurando;
    if (!a) return 'soltar no chão';
    if (a === vila.pessoa) return o ? `dar ${o.nome} à pessoa` : 'falar com a pessoa';
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
    marcas.forEach((m, i) => {
      const a = lista[i];
      m.userData.ponto = null;
      if (n < 2 || i >= n || (a ? a === estado.naCabeca : estado.maoLevantada)) return;   // (a cabeça do robô não aparece na imagem)
      const v = vetores(), p = a ? pontoDe(a) : new T.Vector3(estado.x + v.fx * 0.75, 0.1, estado.z + v.fz * 0.75);   // "em nada": o chão à frente, onde o item cairia (fica na beirada de baixo da imagem)
      if (a && a.malha) p.y += (a.alt || 0.2) / 2 + 0.05;   // logo acima do objeto, sem tapar o que ele tem escrito
      m.userData.ponto = p;
      m.material.color.set(a === alvo ? 0x00e5ff : 0xffffff);
      m.scale.setScalar(TAMANHO_DA_MARCA * (a === alvo ? 1.25 : 1));
    });
    const texto = !n ? [] : REGRAS.vila ? [`alvo ${atual} de ${n}`, acaoDe(alvo)] : n > 1 ? [`${atual}/${n}`] : [];
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
    const tapado = [contador.malha, inventario.malha, mira.malha].filter(q => q.visible).map(q => {
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
    animar(1, 1);                               // sem animação pela metade
    aplicarVisual();
    const densidade = renderer.getPixelRatio();
    renderer.setPixelRatio(1);
    definirTamanho(FRAME.l, FRAME.a);
    desenhar();
    const imagem = canvas.toDataURL('image/png');
    renderer.setPixelRatio(densidade);          // de volta ao tamanho da janela, na mesma hora
    definirTamanho(window.innerWidth, window.innerHeight);
    if (vista.voando) desenharDeFora(); else desenhar();   // (a janela volta a mostrar a visão de quem assiste: a imagem da iA é sempre a dos olhos do robô)
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
  function animar(k, kPorta) {
    const carregando = REGRAS.bracoCaido ? BRACO.caido : BRACO.estendido;
    const braco = estado.maoLevantada ? BRACO.levantado : estado.segurando ? carregando : BRACO.caido;
    const l = luzDaqui(), alvo = { x: estado.x, z: estado.z, yaw: estado.rumo * GIRO, braco, luz: l.x, luzY: l.y, luzZ: l.z, forca: l.forca, chao: alturaDoChao(estado.x, estado.z) };
    for (const c in alvo) visual[c] += (alvo[c] - visual[c]) * k;
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
  function aplicarVisual() {
    robo.position.set(visual.x, visual.chao, visual.z);
    robo.rotation.y = visual.yaw;
    bracoDireito.rotation.x = visual.braco;
    if (estado.segurando) {                     // o objeto acompanha a mão
      const b = visual.braco, o = estado.segurando.malha;
      if (REGRAS.bracoCaido) o.position.set(0.31, 0.72 - 0.56 * Math.cos(b), -0.56 * Math.sin(b));   // na ponta do braço, depois da mão
      else o.position.set(0.31, 0.76 - 0.47 * Math.cos(b), -0.015 - 0.47 * Math.sin(b));              // logo acima da mão
    }
    lampada.position.set(visual.luz, visual.luzY, visual.luzZ);
    lampada.intensity = visual.forca * (vila.clima ? vila.clima.lampada : 1);   // (de noite a imagem inteira escurece, e a lâmpada de dentro é reforçada: ver "a hora do dia e a chuva")
    camera.position.set(visual.x, ALTURA_OLHOS + visual.chao, visual.z);
    camera.rotation.set(INCLINACAO, visual.yaw, 0);
    atualizarBalao();
  }
  const alvoDescartavel = new T.WebGLRenderTarget(1, 1);
  function desenhar() {
    assentarMarcas();                           // os números dos alvos, no lugar em que cada um aparece neste desenho
    renderer.clear();
    if (REGRAS.semEspelho) {
      // Na vila não há espelho: só as sombras (calculadas num desenho descartável em que a
      // câmera "vê" o corpo do robô, como abaixo) e o mundo, com o corpo de fora.
      vidro.visible = false;
      camera.layers.enable(1);
      camera.layers.disable(2);
      renderer.shadowMap.needsUpdate = true;
      renderer.setRenderTarget(alvoDescartavel);
      renderer.render(cena, camera);
      renderer.setRenderTarget(null);
      camera.layers.disable(1);
      camera.layers.enable(2);
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
    renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(alvoDescartavel);
    renderer.render(cena, camera);
    renderer.setRenderTarget(null);
    // 2) o mundo real por cima; o corpo do robô fica de fora (primeira pessoa) e entra o contador
    renderer.clearDepth();
    vidro.visible = !REGRAS.espelhoDisfarcado;
    camera.layers.disable(1);
    camera.layers.enable(2);
    renderer.render(cena, camera);
  }

  function definirTamanho(l, a) {
    renderer.setSize(l, a, false);
    camera.aspect = voador.aspect = l / a;
    camera.updateProjectionMatrix();
    voador.updateProjectionMatrix();
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
    mira.malha.position.set(direita - lm / 2, (cabe ? meiaAltura * 0.97 : inventario.malha.position.y - li * 300 / 2400 - 0.03 * meiaAltura) - hm / 2, -1);
  }
  function ajustarTamanho() {
    definirTamanho(window.innerWidth, window.innerHeight);
    if (modoIA && !vista.voando) desenhar();    // redimensionar limpa o canvas
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
    animar(1 - Math.exp(-dt * 14), 1 - Math.exp(-dt * 5));
    if (vila.clima) vila.clima.passo(real);       // a hora do dia e a chuva da cidade
    if (vista.voando) { aplicarVisual(); voar(real); desenharDeFora(); }   // quem assiste de fora vê tudo ao vivo, mesmo no modo iA
    else if (!modoIA) { aplicarVisual(); desenhar(); }
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
  // A lista de teclas, desenhada como teclas: em cima as do jogo, arrumadas como no teclado, e
  // embaixo as da página. Continua dizendo só quais existem, não o que cada uma faz.
  elAjuda.textContent = '';
  // (No modo voador as teclas do jogo dão lugar às de quem voa, que não são do jogo e por isso vêm explicadas: ver "o modo voador".)
  for (const [classe, fileiras, dica] of [['do-jogo', [REGRAS.passoDeLado ? ['Q', 'W', 'E'] : ['W'], ['A', 'S', 'D'], ['Espaço', 'Tab'], ['L', 'T', 'F']]],
    ['do-voador', [['Q', 'W', 'E'], ['A', 'S', 'D'], ['Shift', 'Z', 'Esc']], 'W A S D voam · Q e E descem e sobem · Shift corre · Z vai até o robô · um clique prende o mouse, que passa a virar a câmera · Esc solta'],
    ['da-pagina', [['1', '2', '3', '4', '5', '6', 'M', 'C'], ['Shift+T', 'I', 'R', 'H', 'G'].concat(REGRAS.vila ? ['N', 'P'] : [])]]]) {
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
  function resposta(comando, ok, mensagem) {
    ultima = { comando, ok, mensagem };
    if (destacado) destacado.contorno.visible = false;
    destacado = alvoAtual();
    if (destacado) destacado.contorno.visible = true;
    marcarAlvos();                              // os números de todos os alvos possíveis e o indicador de qual é o atual
    linhas.push(`› ${comando} — ${mensagem}`);
    if (linhas.length > 6) linhas.shift();
    elLog.textContent = '';
    linhas.forEach((t, i) => {
      const d = document.createElement('div');
      d.textContent = t;
      if (i === linhas.length - 1) d.className = 'ultima';
      elLog.appendChild(d);
    });
    const s = salas[estado.sala];
    const feitos = s.objetos.filter(o => o.naCesta || o.entregue).length;   // guardados na cesta ou entregues
    if (REGRAS.contador) desenharContador(`${feitos}/${s.objetos.length}`);
    if (REGRAS.inventario) desenharInventario();
    elStatus.textContent = `desafio: ${DESAFIO}\nsala: ${numero(s.n)}\nfeitos: ${feitos}/${s.objetos.length}\n` +
      `na cabeça: ${estado.naCabeca ? estado.naCabeca.nome : 'nada'}\nmão: ${estado.maoLevantada ? 'levantada' : 'abaixada'}\n` +
      `segurando: ${estado.segurando ? estado.segurando.nome : 'nada'}\npeito: ${estado.texto || '—'}` +
      (pessoa ? `\npessoa: ${pessoa.fala ? `"${pessoa.fala}"` : 'calada'}` : '');
  }

  // ---------- botões ----------
  // Os botões do jogo. O teclado e o MCP apertam os mesmos, pelo mesmo nome, e é só isso
  // que o jogador fica sabendo: quais botões existem. O que cada um faz, ele descobre.
  const BOTOES = {
    W: () => mover('frente'), S: () => mover('tras'),             // anda um passo
    A: () => virar('esquerda'), D: () => virar('direita'),        // vira 45° sem sair do lugar
    ESPACO: () => pegar(), L: () => levantar(),
    TAB: texto => escolher(1, texto),                             // passa o alvo do ESPACO para o seguinte; com um número no texto, direto para o alvo com esse número
    T: texto => escrever(texto),                // escreve no peito o texto que vem junto
    F: () => frame(),                           // o único que devolve algo: a imagem
  };
  if (REGRAS.passoDeLado) Object.assign(BOTOES, { Q: () => mover('esquerda'), E: () => mover('direita') });   // desafio 4: um passo de lado, sem virar
  function acionar(botao, texto) {
    const acao = Object.prototype.hasOwnProperty.call(BOTOES, botao) && BOTOES[botao];
    return acao ? acao(texto) : resposta(`apertar ${botao}`, false, 'botão inexistente');
  }

  // ---------- quem joga, a intenção e a gravação ----------
  // Quem assiste fica sabendo de duas coisas que a iA diz: quem ela é (um nome de guerra e o
  // modelo) e o que pretende com cada botão. As duas aparecem num campo da página, por cima do
  // jogo, e vão para a gravação. Nenhuma entra na imagem que a iA recebe, que é só o desenho do
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
  const quemJoga = { quem: 0, nome: '', modelo: '' }, contagem = { botoes: 0, imagens: 0 };
  // A versão das regras que mudam o que um botão faz, para a gravação antiga continuar igual
  // quando é assistida. 2: entre alvos do mesmo tipo, vale o mais central na imagem (ver ordemAntiga).
  const VERSAO_DAS_REGRAS = 3;                  // (3: as portas que o jogador abre também fecham: ver portasNaoFecham)
  const gravando = !ASSISTINDO && GRAVACAO
    ? GRAVACAO.gravar(DESAFIO, () => ({ versao: VERSAO_DAS_REGRAS, nome: quemJoga.nome, modelo: quemJoga.modelo, botoes: contagem.botoes, imagens: contagem.imagens, ganhou: estado.ganhou,
      perdeu: estado.perdeu || undefined, assar: REGRAS.vila ? [ASSAR.pronto, ASSAR.queima] : undefined }))
    : null;
  const NOME_DO_BOTAO = { ESPACO: 'Espaço', F: 'F · imagem' };
  const elQuer = document.getElementById('quer'), intencoes = [];
  // O campo de quem assiste: quem está jogando e as últimas quatro intenções, a mais nova embaixo, acesa.
  function desenharQuer() {
    if (!elQuer) return;
    const pedaco = (tag, texto) => { const el = document.createElement(tag); el.textContent = texto; return el; };   // sempre como texto: tudo aqui vem da iA
    const linha = (classe, ...partes) => { const d = document.createElement('div'); d.className = classe; d.append(...partes); elQuer.appendChild(d); };
    elQuer.textContent = '';
    if (quemJoga.nome || quemJoga.modelo) linha('quem', pedaco('b', quemJoga.nome || 'sem nome'), ' ', pedaco('span', quemJoga.modelo));
    if (intencoes.length) linha('titulo', 'o que pretende');
    intencoes.forEach((x, i) => linha(i === intencoes.length - 1 ? 'linha ultima' : 'linha', pedaco('b', NOME_DO_BOTAO[x.botao] || x.botao), pedaco('span', x.quer)));
    elQuer.hidden = !elQuer.childNodes.length;
  }
  function mostrarIntencao(botao, quer) {
    if (!quer) return;
    intencoes.push({ botao, quer });
    if (intencoes.length > 4) intencoes.shift();
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
  if (!ASSISTINDO) try {
    const antes = JSON.parse(sessionStorage.getItem('desafio.quem'));
    if (antes && Number.isInteger(antes.quem) && antes.quem > 0) apresentar(antes.quem, antes.nome, antes.modelo);
  } catch (e) { }
  // Aperta um botão. `quem` é a conexão da iA que apertou (o teclado não manda nada).
  function apertar(botao, texto, quem, nome, modelo, intencao) {
    if (ASSISTINDO) return undefined;           // numa gravação ninguém joga
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
    try { saida = acionar(botao, texto); } finally { horaDaJogada = null; }
    if (existe) {
      mostrarIntencao(botao, quer);
      if (botao === 'F') contagem.imagens++; else contagem.botoes++;
      const numero = botao === 'TAB' ? semControle(texto, 2) : '';   // o TAB com número (ver escolher)
      if (gravando) gravando.anotar('botao', Object.assign({ t, b: botao }, botao === 'T' ? { x: estado.texto } : numero ? { x: numero } : null, quer ? { q: quer } : null), true);
    }
    return saida;
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
  const vista = { voando: false, posta: false, x: 0, y: 2, z: 0, yaw: 0, pitch: 0 };
  const TECLAS_DO_VOO = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight']), apertadas = new Set();
  const entre = (v, a, b) => Math.max(a, Math.min(b, v));
  // Até onde a câmera vai. Nas salas com espelho ela não sai do prédio: de fora dele, ou de
  // trás do espelho, o truque do reflexo ficaria à mostra (o mundo é desenhado duas vezes).
  const VOO = REGRAS.vila ? { x1: CIDADE.oeste - 14, x2: CIDADE.leste + 14, y1: 0.25, y2: 16, z1: CIDADE.sul - 14, z2: CIDADE.norte + 14 }
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
    vista.pitch = Math.atan2(0.5 + chao - vista.y, Math.hypot(dx, dz) || 1e-6);   // mirando os joelhos dele: o robô fica no meio da tela, acima do campo das intenções
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
    const ultima = intencoes[intencoes.length - 1];
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
    const x = (v3.x + 1) / 2 * window.innerWidth, y = (1 - v3.y) / 2 * window.innerHeight;
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
      case 'KeyI':                              // modo iA: a tela congela até a próxima imagem ser pedida
        modoIA = !modoIA;
        elModo.hidden = !modoIA;
        resposta('modo iA', true, modoIA ? 'ligado: a tela congela até pedir frame' : 'desligado');
        break;
      case 'KeyH': elAjuda.hidden = !elAjuda.hidden; break;
      case 'KeyG': if (GRAVACAO && GRAVACAO.noServidor) GRAVACAO.abrirLista(); break;   // as gravações, em outra aba
      case 'KeyR': reiniciar(); break;
      case 'Digit1': case 'Numpad1': comecar(1); break;
      case 'Digit2': case 'Numpad2': comecar(2); break;
      case 'Digit3': case 'Numpad3': comecar(3); break;
      case 'Digit4': case 'Numpad4': comecar(4); break;
      case 'Digit5': case 'Numpad5': comecar(5); break;
      case 'Digit6': case 'Numpad6': comecar(6); break;
    }
  });

  // ---------- início ----------
  if (REGRAS.vila) criarVila();                 // desafio 4: a vila inteira existe desde o começo
  else {
    const primeira = criarSala(1);
    if (REGRAS.portaManual) for (let n = 2; n <= REGRAS.salas; n++) criarSala(n);   // desafio 3: a cozinha já existe atrás da porta
    if (primeira.presente) segurar(primeira.presente);   // desafio 2: o jogador já começa com o presente na mão
  }
  animar(1, 1);                                 // tudo já no lugar (a lâmpada, as portas), sem deslizar até lá
  contador.malha.visible = REGRAS.contador;
  inventario.malha.visible = !!REGRAS.inventario;
  // resultado: o jogo acabou para quem joga? (no desafio 4 dá para perder: o bolo queima)
  // (verDe: põe a câmera de quem voa num ponto, olhando para outro: é de quem assiste e dos testes, e não muda nada no jogo)
  window.jogo = { apertar, comecar, mover, virar, pegar, levantar, escrever, frame, reiniciar, estado, salas, itens, desafio: DESAFIO, diagnostico: () => ultima,
    resultado: () => estado.ganhou ? 'ganhou' : estado.perdeu ? 'perdeu' : '',
    verDe(x, y, z, paraX, paraY, paraZ) {
      const dx = paraX - x, dy = paraY - y, dz = paraZ - z;
      Object.assign(vista, { posta: true, x: entre(x, VOO.x1, VOO.x2), y: entre(y, VOO.y1, VOO.y2), z: entre(z, VOO.z1, VOO.z2), yaw: Math.atan2(-dx, -dz), pitch: entre(Math.atan2(dy, Math.hypot(dx, dz) || 1e-6), -1.45, 1.45) });
      verComo('voador');
    } };
  abrirVista();                                 // a visão de quem assiste: a da iA ou a de quem voa
  ajustarTamanho();
  aplicarVisual();
  resposta('início', true, 'ok');
  // Assistindo a uma gravação: os botões gravados são apertados de novo, na ordem, sem as
  // esperas de quem jogava — só com o tempo de ler a intenção de cada um. Para voltar a um
  // ponto anterior a página recarrega já nele (o jogo não sabe desfazer um botão).
  if (ASSISTINDO) {
    elAjuda.hidden = true;
    GRAVACAO.carregar(GRAVACAO.assistindo).then(gravada => {
      const nome = semControle(gravada.resumo.nome, 12), modelo = semControle(gravada.resumo.modelo, 24);
      const assar = Array.isArray(gravada.resumo.assar) ? gravada.resumo.assar.map(Number) : [];
      if (assar[0] > 0 && assar[1] > assar[0]) { ASSAR.pronto = assar[0]; ASSAR.queima = assar[1]; }       // o tempo de forno que valia naquela partida
      if (!(Number(gravada.resumo.versao) >= 3)) portasNaoFecham = true;                                                // ...as portas, que não fechavam...
      if (!(Number(gravada.resumo.versao) >= 2)) { ordemAntiga = true; resposta('gravação', true, 'regras antigas'); }   // ...e a ordem dos alvos
      toca = GRAVACAO.tocador(gravada, {
        titulo: `Desafio ${DESAFIO}` + (nome ? ` · ${nome}` : '') + (modelo ? ` (${modelo})` : ''),
        nomeDoPasso: 'botão',
        doComeco: false,
        ehPasso: ev => ev.e === 'botao' && ev.b !== 'F',       // a imagem pedida não muda nada no jogo: não conta como passo
        aplicar(ev) {
          if (ev.e === 'quem') { quemJoga.nome = semControle(ev.nome, 12); quemJoga.modelo = semControle(ev.modelo, 24); desenharQuer(); return; }   // quem estava jogando, na tela como ao vivo
          if (ev.e !== 'botao') return;
          horaGravada = horaDaJogada = Math.max(0, Number(ev.t) || 0);     // o botão vale na hora em que foi apertado ao vivo
          try { if (ev.b !== 'F') acionar(String(ev.b), ev.x); } finally { horaDaJogada = null; }
          mostrarIntencao(String(ev.b), semControle(ev.q, 140));
        },
        espera: (ev, intervalo, anterior) => Math.min(intervalo, (anterior.b === 'F' ? 500 : 900) + 35 * semControle(anterior.q, 140).length),
        assentar() { animar(1, 1); aplicarVisual(); },
      });
    }).catch(() => GRAVACAO.avisar('Não achei essa gravação.'));
  }
  requestAnimationFrame(quadro);
})();
