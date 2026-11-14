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
 * São vários desafios (ver DESAFIOS). Os três primeiros começam no mesmo quarto; o quarto é
 * uma vila pequena, com casa, rua e mercadinho (ver "a vila"). No desafio 1 o jogo tem
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
  const NUMEROS = ['1', '2', '3', '4'];
  const existeDesafio = n => NUMEROS.includes(String(n));
  const DESAFIO = existeDesafio(ENDERECO.get('desafio')) ? Number(ENDERECO.get('desafio')) : 1;
  const TOTAL_SALAS = 1;                       // quantas salas tem o desafio 1; completar a última é a vitória
  const OBJETOS_NO_CHAO = 3;                    // por sala; com o da cabeça do robô, o contador vai até 4
  // O tamanho de uma sala: largura (x), profundidade (z), altura (y), em metros. Nos desafios 3
  // e 4 as salas são pequenas, para o robô não gastar o jogo atravessando salões: no 3, o
  // quarto e a cozinha têm 5 m x 5 m; no 4 (a vila), cada cômodo da casa tem 4 m x 4 m.
  const SALA = DESAFIO === 3 ? { L: 5, P: 5, A: 3 } : DESAFIO === 4 ? { L: 4, P: 4, A: 2.6 } : { L: 8, P: 7, A: 3 };
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
  // Cada desafio é um jogo diferente. Os três primeiros começam na mesma sala; o quarto, numa vila.
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
      // (ESPACO de frente para ela), e ela fica aberta, com passagem livre nos dois sentidos.
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
      portaManual: true,                        // as portas são abertas pelo jogador e ficam abertas
      contador: false,
      inventario: 4,                            // quantos itens o robô carrega (ver "o inventário")
      passoDeLado: true,                        // os botões Q e E andam de lado, sem virar (como no Galinha Pong)
      falas: { pedido: 'Estou com fome', agradecimento: 'Obrigado!', recusa: 'Quero bolo!', queimado: 'Queimou!' },
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
  const noMovel = (x, z, raio) => blocos.find(b =>
    x > b.x1 - raio + 1e-9 && x < b.x2 + raio - 1e-9 && z > b.z1 - raio + 1e-9 && z < b.z2 + raio - 1e-9);

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

  // ---------- a vila (desafio 4) ----------
  // Uma vila pequena, para o robô não gastar o jogo andando: a casa (quarto, banheiro e
  // cozinha), a rua na frente dela e, do outro lado da rua, o mercadinho. As outras
  // construções (padaria, farmácia, a casa vizinha) são só fachada.
  //
  //     z          PADARIA        MERCADINHO        FARMÁCIA
  //   12,5      ............. +---------------+ .............
  //                           |       5       |
  //    8,5   -----------------+-----     -----+--------------
  //             a rua (4), com a faixa de pedestres em x = 6
  //    4     --+--------+----------+-----===-----+-----------
  //            |   2    |    1     |      3      |  casa vizinha
  //    0       +--------+----------+-------------+ ..........
  //          -2,6       0          4             8           x
  //   1 quarto (onde o robô e a pessoa começam), 2 banheiro, 3 cozinha, 4 rua, 5 mercadinho.
  //   Os vãos entre os cômodos e o do mercadinho não têm porta; a porta da rua (===) é o
  //   jogador que abre.
  //
  // Aqui o mundo não é uma fileira de salas iguais. Cada lugar é um retângulo (areas); o robô
  // pode estar em qualquer ponto a mais de MARGEM_DA_VILA das paredes, ou dentro de um vão
  // aberto (livreNaVila); e o ESPACO só age no que está ao alcance DENTRO do lugar em que o
  // robô está (ver candidatos): sem isso ele pegaria coisas através das paredes.
  //
  // O que há para fazer: a pessoa diz "Estou com fome"; a receita, na porta da geladeira,
  // mostra os três ingredientes (farinha, ovos, chocolate) e o caminho (tigela, forno, bolo).
  // A farinha está no armário, os ovos na geladeira e o chocolate, no mercadinho. Com os três
  // na tigela a massa fica pronta; a massa, levada ao forno, vira o bolo; o bolo vai para a pessoa.
  const MARGEM_DA_VILA = 0.5;
  const areas = {};                             // os lugares, pelo número: { n, nome, x1, x2, z1, z2, luz: onde fica a lâmpada quando o robô está ali }
  // Os vãos: { nome, x, z (o meio do vão), eixo ('x': a parede fica em x = p.x; 'z': em z = p.z),
  // salas (os dois lugares que ele liga), aberta, vis, folha (a porta, se houver) e contorno }.
  const portasDaVila = [];
  const vila = { pessoa: null, tigela: null, forno: null, massa: null, bolo: null };
  const areaEm = (x, z) => {
    for (const a of Object.values(areas)) if (x >= a.x1 && x <= a.x2 && z >= a.z1 && z <= a.z2) return a.n;
    return estado.sala;
  };
  // O ponto está na faixa em que o robô atravessa a parede por esse vão?
  const noVaoDe = (p, x, z) => p.eixo === 'x'
    ? Math.abs(x - p.x) <= MARGEM_DA_VILA + 1e-9 && Math.abs(z - p.z) <= 0.5 + 1e-9
    : Math.abs(z - p.z) <= MARGEM_DA_VILA + 1e-9 && Math.abs(x - p.x) <= 0.5 + 1e-9;
  function livreNaVila(x, z) {
    const m = MARGEM_DA_VILA - 1e-9;
    for (const a of Object.values(areas)) if (x >= a.x1 + m && x <= a.x2 - m && z >= a.z1 + m && z <= a.z2 - m) return true;
    return portasDaVila.some(p => p.aberta && noVaoDe(p, x, z));
  }
  // O ESPACO, na vila: age no alvo (ver candidatos). O robô carrega até quatro itens (ver "o
  // inventário"); o que ele entrega ou coloca em algum lugar é sempre o que está na mão.
  function usarNaVila() {
    const v = vila, alvo = alvoAtual(), o = estado.segurando;
    escolhido = undefined;
    if (alvo && alvo === v.pessoa) {
      if (!o) {                                 // de mão vazia: fala com ela, e ela diz o que quer
        alvo.fala = FALAS.pedido;
        return resposta('pegar', true, `a pessoa disse: "${alvo.fala}"`);
      }
      if (o !== v.bolo) {                       // ela só aceita o bolo (e não o queimado)
        alvo.fala = o === v.queimado ? FALAS.queimado : FALAS.recusa;
        return resposta('pegar', false, `a pessoa não quis: ${o.nome} — disse: "${alvo.fala}"`);
      }
      entregar(o, alvo);
      tirarDoInventario(o);
      return resposta('pegar', true, `entregou: ${o.nome} à pessoa — venceu`);
    }
    if (alvo && portasDaVila.includes(alvo)) {
      alvo.aberta = true;
      return resposta('pegar', true, 'abriu a porta');
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
      const x = Math.max(a.x1 + folga, Math.min(a.x2 - folga, estado.x + f.fx * 0.75));
      const z = Math.max(a.z1 + folga, Math.min(a.z2 - folga, estado.z + f.fz * 0.75));
      if (noMovel(x, z, o.raio) || Object.values(salas).some(q => noCaminho(q).some(p => Math.hypot(p.x - x, p.z - z) < p.raio + o.raio)))
        return resposta('pegar', false, 'sem espaço para soltar aqui');
      tirarDoInventario(o);
      assentar(salas[a.n], o, x, z, o.alt / 2);
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
    luzGeral.intensity = 0.85; luzGeral.color.set(0xffffff); luzGeral.groundColor.set(0xd9d3c6);   // luz de dia
    const caixa = (l, a, p, material, x, y, z, pai) => malha(pai || g, new T.BoxGeometry(l, a, p), material, x, y, z);
    const liso = (hex, aspereza = 0.8) => mat(hex, { roughness: aspereza });
    const bloco = (nome, x1, x2, z1, z2) => blocos.push({ nome, x1, x2, z1, z2 });
    const escalarUV = (geo, fu, fv) => { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * fu, uv.getY(i) * fv); return geo; };
    const letras = (c, texto, x, y, tamanho, cor, largura) => {
      c.fillStyle = cor; c.font = `bold ${tamanho}px Bahnschrift, Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(texto, x, y, largura);
    };
    const madeira = liso(0x8f6a45, 0.55), madeiraClara = liso(0xc49a6c, 0.55), branco = liso(0xf4f2ec, 0.5), preto = liso(0x1d1f22, 0.3);
    const armario = liso(0x4f6a72, 0.55), portinha = liso(0x5d7c85, 0.5), tampo = liso(0xe6dfd2, 0.25);

    // --- os lugares ---
    const lugar = (n, nome, x1, x2, z1, z2, luz) => {
      areas[n] = { n, nome, x1, x2, z1, z2, luz: luz || { x: (x1 + x2) / 2, y: A - 0.35, z: (z1 + z2) / 2, forca: 1.9 } };
      salas[n] = { n, cx: 0, grupo: g, objetos: [], porta: null, cesta: null, chapeu: null, outroRobo: null, presente: null, pessoa: null, geladeira: null, agua: null };
    };
    lugar(1, 'quarto', 0, 4, 0, 4);
    lugar(2, 'banheiro', -2.6, 0, 0, 4);
    lugar(3, 'cozinha', 4, 8, 0, 4);
    lugar(4, 'rua', -3, 11, 4, 8.5, { x: 4.5, y: 9, z: 6.3, forca: 7 });       // na rua a lâmpada faz as vezes do sol: alta e forte
    lugar(5, 'mercadinho', 3.5, 8.5, 8.5, 12.5);

    // --- chão, teto, paredes e telhado ---
    const piso = (x1, x2, z1, z2, material, fu = 1, fv = 1) => {
      const p = malha(g, escalarUV(cantosEscuros(new T.PlaneGeometry(x2 - x1, z2 - z1, 12, 12), 'x', 'y', 0.22, 0.9), fu, fv), material, (x1 + x2) / 2, 0.006, (z1 + z2) / 2);
      p.rotation.x = -Math.PI / 2;
    };
    const chao = (x1, x2, z1, z2, material, y) => { malha(g, new T.PlaneGeometry(x2 - x1, z2 - z1), material, (x1 + x2) / 2, y, (z1 + z2) / 2).rotation.x = -Math.PI / 2; };
    const teto = (x1, x2, z1, z2) => {
      malha(g, cantosEscuros(new T.PlaneGeometry(x2 - x1, z2 - z1, 10, 10), 'x', 'y', 0.2, 0.9), M.teto, (x1 + x2) / 2, A, (z1 + z2) / 2).rotation.x = Math.PI / 2;
      caixa(0.84, 0.03, 0.84, M.rodape, (x1 + x2) / 2, A - 0.015, (z1 + z2) / 2);          // luminária embutida
      malha(g, new T.PlaneGeometry(0.72, 0.72), M.luminaria, (x1 + x2) / 2, A - 0.032, (z1 + z2) / 2).rotation.x = Math.PI / 2;
    };
    // Uma parede reta de (x1, z1) a (x2, z2), ao longo de x ou de z, com os vãos de porta dados
    // (o meio de cada um, ao longo da parede). `fora`: de que lado fica a rua (+1 ou -1, no
    // sentido em que o outro eixo cresce; 0 = parede entre dois cômodos); `reboco`: a cor desse lado.
    function parede(x1, z1, x2, z2, vaos, fora, reboco) {
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
        malha(g, geo, y1 > 0 ? M.paredeLisa : M.parede, emX ? meio : fixo, y, emX ? fixo : meio);
        if (!fora) continue;
        // por fora, uma capa de reboco (um pouco mais comprida nas pontas, para fechar as quinas)
        const d = fora * (ESPESSURA / 2 + 0.015), e1 = t1 === a ? 0.09 : 0, e2 = t2 === b ? 0.09 : 0, c2 = comp + e1 + e2, m2 = meio + (e2 - e1) / 2;
        caixa(emX ? c2 : 0.03, alt, emX ? 0.03 : c2, reboco, emX ? m2 : fixo + d, y, emX ? fixo + d : m2);
      }
    }
    // Cobre um retângulo com uma laje (com beiral) e um telhado de quatro águas.
    function cobrir(x1, x2, z1, z2, y, h, material) {
      const be = 0.28, u1 = x1 - be, u2 = x2 + be, v1 = z1 - be, v2 = z2 + be;
      caixa(u2 - u1, 0.08, v2 - v1, material, (u1 + u2) / 2, y + 0.07, (v1 + v2) / 2);       // (um pouco acima do teto de dentro, para os dois não disputarem os mesmos pixels)
      const emX = u2 - u1 >= v2 - v1, L = emX ? u2 - u1 : v2 - v1, d = (emX ? v2 - v1 : u2 - u1) / 2, Y = y + 0.11;
      // (a = ao longo da cumeeira, b = atravessado): os quatro cantos e as duas pontas da cumeeira
      const P = (a, b, alto) => emX ? [u1 + a, Y + alto, v1 + b] : [u1 + b, Y + alto, v1 + a];
      const A0 = P(0, 0, 0), B0 = P(L, 0, 0), C0 = P(L, 2 * d, 0), D0 = P(0, 2 * d, 0), c1 = P(d, d, h), c2 = P(L - d, d, h);
      let faces = [[A0, c2, B0], [A0, c1, c2], [C0, c1, D0], [C0, c2, c1], [B0, c2, C0], [D0, c1, A0]];
      if (!emX) faces = faces.map(([p, q, r]) => [p, r, q]);       // trocar x por z vira cada face do avesso: desvira
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(faces.flat(2), 3));
      geo.computeVertexNormals();
      malha(g, geo, material, 0, 0, 0);
    }
    const rebocoCasa = liso(0xf0cf7a, 0.9), rebocoMercado = liso(0xf4efe4, 0.9), telha = liso(0xb5533c, 0.8);
    // a casa: paredes de fora e as duas de dentro (com os vãos para o banheiro e para a cozinha)
    parede(-2.6, 0, 8, 0, [], -1, rebocoCasa);
    parede(-2.6, 4, 8, 4, [6], 1, rebocoCasa);
    parede(-2.6, 0, -2.6, 4, [], -1, rebocoCasa);
    parede(8, 0, 8, 4, [], 1, rebocoCasa);
    parede(0, 0, 0, 4, [3]);
    parede(4, 0, 4, 4, [2]);
    piso(0, 4, 0, 4, M.piso);
    piso(-2.6, 0, 0, 4, M.ladrilho, 2.6 / 4, 1);
    piso(4, 8, 0, 4, M.ladrilho);
    teto(0, 4, 0, 4); teto(-2.6, 0, 0, 4); teto(4, 8, 0, 4);
    cobrir(-2.6, 8, 0, 4, A, 1.25, telha);
    // o mercadinho
    parede(3.5, 8.5, 8.5, 8.5, [6], -1, rebocoMercado);
    parede(3.5, 12.5, 8.5, 12.5, [], 1, rebocoMercado);
    parede(3.5, 8.5, 3.5, 12.5, [], -1, rebocoMercado);
    parede(8.5, 8.5, 8.5, 12.5, [], 1, rebocoMercado);
    piso(3.5, 8.5, 8.5, 12.5, M.ladrilho, 5 / 4, 1);
    teto(3.5, 8.5, 8.5, 12.5);
    cobrir(3.5, 8.5, 8.5, 12.5, A + 0.7, 0.9, liso(0x3f6b55, 0.8));
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

    // --- o céu, o gramado e a rua ---
    malha(g, new T.SphereGeometry(46, 32, 16), luminoso({ side: T.BackSide, map: texturaCanvas(8, 256, (c, l, a) => {
      const d = c.createLinearGradient(0, 0, 0, a);
      d.addColorStop(0, '#3f8fd8'); d.addColorStop(0.42, '#9fd2f3'); d.addColorStop(0.5, '#e4f3fa'); d.addColorStop(1, '#e4f3fa');
      c.fillStyle = d; c.fillRect(0, 0, l, a);
    }) }), 4, 0, 6).receiveShadow = false;
    chao(-41, 49, -39, 51, liso(0x74b35a, 1), -0.02);                                     // gramado
    chao(-3.6, 11.6, 5.1, 7.4, liso(0x4a4f55, 0.95), 0);                                  // asfalto
    for (const [z1, z2] of [[4.06, 5.1], [7.4, 8.44]]) chao(-3.6, 11.6, z1, z2, liso(0xc9c3b6, 0.9), 0.003);   // calçadas
    for (const z of [5.1, 7.4]) caixa(15.2, 0.03, 0.08, liso(0x9d978b, 0.8), 4, 0.015, z);                    // meio-fio
    const tinta = liso(0xf2f2ee, 0.7);
    for (let x = -2.9; x < 11; x += 1.6) if (x < 4.6 || x > 7.2) chao(x, x + 0.8, 6.2, 6.3, tinta, 0.004);     // a faixa do meio da rua
    for (const x of [5.36, 5.68, 6.0, 6.32, 6.64]) chao(x - 0.11, x + 0.11, 5.14, 7.36, tinta, 0.004);         // a faixa de pedestres, da porta de casa à do mercadinho
    caixa(1.7, 0.03, 0.42, liso(0xb9b4a8, 0.9), 6, 0.015, 4.3);                           // o degrau da porta de casa
    const verde = mat(0x4d9a45, { roughness: 0.9, flatShading: true }), tronco = liso(0x6b4a2f, 0.9), ferro = liso(0x2f3a40, 0.5);
    const arvore = (x, z, barra) => {
      malha(g, new T.CylinderGeometry(0.1, 0.14, 1.7, 8), tronco, x, 0.85, z);
      for (const [dx, dy, dz, r] of [[0, 2.2, 0, 0.68], [0.4, 2.0, 0.12, 0.46], [-0.38, 2.02, 0.1, 0.5], [0.03, 2.72, 0.02, 0.46]]) malha(g, new T.IcosahedronGeometry(r, 1), verde, x + dx, dy, z + dz);
      if (barra) bloco('árvore', x - 0.14, x + 0.14, z - 0.14, z + 0.14);
    };
    const poste = (x, z) => {
      malha(g, new T.CylinderGeometry(0.045, 0.06, 2.9, 10), ferro, x, 1.45, z);
      malha(g, new T.SphereGeometry(0.16, 16, 12), luminoso({ color: 0xfff1c9 }), x, 3.0, z);
      malha(g, new T.CylinderGeometry(0.2, 0.2, 0.03, 16), ferro, x, 3.17, z);
      bloco('poste', x - 0.08, x + 0.08, z - 0.08, z + 0.08);
    };
    arvore(-1.6, 4.92, true); arvore(9.9, 4.92, true);       // na beira da calçada: a copa não entra nas casas
    arvore(-4.7, 5.0); arvore(-5.2, 7.7); arvore(-7, 6.2); arvore(13.4, 5.9); arvore(14.6, 7.4);
    poste(1.5, 4.72); poste(9.6, 7.78);
    for (const x of [-3.35, 11.35]) malha(g, caixaSuave(0.5, 1.1, 4.3, 0.14), liso(0x3f7f3c, 0.95), x, 0.55, 6.25);   // as cercas vivas que fecham as pontas da rua
    caixa(1.4, 0.06, 0.4, madeira, 1.3, 0.44, 8.12); caixa(1.4, 0.36, 0.05, madeira, 1.3, 0.72, 8.3);            // um banco de praça
    for (const x of [0.7, 1.9]) caixa(0.06, 0.44, 0.36, ferro, x, 0.22, 8.12);
    bloco('banco', 0.6, 2.0, 7.9, 8.35);
    caixa(0.07, 0.95, 0.07, ferro, 7.15, 0.475, 4.28); malha(g, caixaSuave(0.3, 0.2, 0.2, 0.04), liso(0xc8372d, 0.5), 7.15, 1.02, 4.28);   // a caixa de correio

    // --- as fachadas (não dá para entrar) ---
    // Cada prédio é uma caixa com a fachada pintada na face que dá para a rua. No desenho, as
    // medidas são em metros: x a partir da esquerda de quem olha, y a partir do chão.
    const pintar = o => (c, l, a, e) => {
      const R = (x, y, w, h) => c.fillRect(x * e, a - (y + h) * e, w * e, h * e), bola = (x, y, r) => { c.beginPath(); c.arc(x * e, a - y * e, r * e, 0, 7); c.fill(); };
      c.fillStyle = o.parede; c.fillRect(0, 0, l, a);
      c.fillStyle = 'rgba(0,0,0,0.16)'; R(0, 0, l / e, 0.3);
      for (const [x, w] of o.vitrines || []) {
        c.fillStyle = '#3d4a54'; R(x - 0.06, 0.5, w + 0.12, 1.62);
        c.fillStyle = '#a9d2e6'; R(x, 0.56, w, 1.5);
        c.fillStyle = 'rgba(255,255,255,0.4)'; c.beginPath(); c.moveTo((x + 0.1) * e, a - 0.7 * e); c.lineTo((x + 0.55) * e, a - 1.95 * e); c.lineTo((x + 0.8) * e, a - 1.95 * e); c.lineTo((x + 0.35) * e, a - 0.7 * e); c.fill();
      }
      for (const x of o.janelas || []) {
        c.fillStyle = '#ffffff'; R(x - 0.06, 0.94, 1.02, 1.12);
        c.fillStyle = '#8fc2dc'; R(x, 1.0, 0.42, 1.0); R(x + 0.48, 1.0, 0.42, 1.0);
        c.fillStyle = '#7a4a2a'; R(x - 0.1, 0.78, 1.1, 0.16);
        for (let i = 0; i < 5; i++) { c.fillStyle = ['#e4572e', '#f2c230', '#f06aa8'][i % 3]; bola(x + 0.05 + i * 0.2, 0.98, 0.07); }
      }
      for (const [x, cor] of o.portas || []) {
        c.fillStyle = 'rgba(0,0,0,0.3)'; R(x - 0.06, 0, 1.02, 2.16);
        c.fillStyle = cor; R(x, 0, 0.9, 2.1);
        c.fillStyle = 'rgba(0,0,0,0.18)'; R(x + 0.12, 1.15, 0.66, 0.75); R(x + 0.12, 0.2, 0.66, 0.75);
        c.fillStyle = '#e9c46a'; bola(x + 0.78, 1.05, 0.045);
      }
      if (o.toldo) for (let i = 0, [x, w, c1, c2] = o.toldo; i * 0.25 < w; i++) { c.fillStyle = i % 2 ? c1 : c2; R(x + i * 0.25, 2.2, Math.min(0.25, w - i * 0.25), 0.3); }
      if (o.letreiro) {
        const [texto, fundo, letra] = o.letreiro, y = a / e - 0.62;
        c.fillStyle = fundo; R(0.3, y, l / e - 0.6, 0.46);
        letras(c, texto, l / 2, a - (y + 0.23) * e + 3, 0.34 * e, letra, l - e);
      }
      if (o.cruz) { c.fillStyle = '#1f9d55'; R(o.cruz - 0.1, 1.2, 0.2, 0.6); R(o.cruz - 0.3, 1.4, 0.6, 0.2); }
    };
    function predio(x1, x2, zFrente, lado, altura, corTelha, desenho) {     // lado: +1 = a frente olha para +z; -1 = para -z
      const fundo = 4, z1 = lado > 0 ? zFrente - fundo : zFrente, L = x2 - x1, E = 128;
      caixa(L, altura, fundo, liso(new T.Color(desenho.parede).getHex(), 0.9), (x1 + x2) / 2, altura / 2, z1 + fundo / 2);
      const tex = texturaCanvas(Math.round(L * E), Math.round(altura * E), (c, l, a) => pintar(desenho)(c, l, a, E));
      const f = malha(g, new T.PlaneGeometry(L, altura), mat(0xffffff, { map: tex, roughness: 0.85 }), (x1 + x2) / 2, altura / 2, zFrente + lado * 0.012);
      if (lado < 0) f.rotation.y = Math.PI;
      cobrir(x1, x2, z1, z1 + fundo, altura, 1.1, liso(corTelha, 0.8));
    }
    predio(-3.4, 3.3, 8.5, -1, 3.1, 0x8a4a3a, { parede: '#e8b4a0', portas: [[1.0, '#7a4a2a']], vitrines: [[2.6, 2.6]], toldo: [2.5, 2.8, '#ffffff', '#d9772b'], letreiro: ['PADARIA', '#7a4a2a', '#fff3d6'] });
    predio(8.7, 12.6, 8.5, -1, 3.3, 0x5c6b73, { parede: '#eef4ee', portas: [[2.6, '#2f7d5b']], vitrines: [[0.5, 1.6]], letreiro: ['FARMÁCIA', '#1f9d55', '#ffffff'], cruz: 1.3 });
    predio(8.2, 12.6, 4, 1, 2.9, 0x8a4a3a, { parede: '#a9cbe6', portas: [[0.5, '#c8553d']], janelas: [1.9, 3.2] });
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
    {
      // A pessoa, sentada na poltrona, de costas para a parede da rua e de frente para onde o
      // robô começa. Não diz nada até falarem com ela. (O alvo fica nos joelhos: ver criarSala.)
      const corpo = montarPessoa(), x = 2.0, z = 3.48;
      corpo.grupo.position.set(x, 0, z);
      g.add(corpo.grupo);
      vila.pessoa = pessoa = { nome: 'pessoa', x, z: z - 0.45, rosto: { x, z: z + 0.04 }, sala: 1, corpo, contorno: corpo.contorno, fala: '', recebeu: null,
        receber(o) {
          corpo.grupo.add(o.malha);
          o.malha.position.set(0.3, 0.64 + o.alt / 2, -0.29);
          this.fala = FALAS.agradecimento;
        } };
      bloco('poltrona', x - 0.42, x + 0.42, z - 0.65, 4);
    }

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
    {
      // a porta da rua: de correr, como as dos outros desafios; é o jogador que abre, e ela fica aberta
      const X = 6, Z = 4, folha = caixa(LARGURA_PORTA, ALTURA_PORTA, 0.05, M.porta, X, ALTURA_PORTA / 2, Z);
      for (const lado of [-1, 1]) caixa(0.05, 0.3, 0.02, M.latao, 0.5, 0, lado * 0.035, folha);
      const borda = new T.Group(), e = ESPESSURA + 0.14, b = 0.05;
      g.add(borda);
      for (const lado of [-1, 1]) caixa(b, ALTURA_PORTA, e, M.destaque, X + lado * (LARGURA_PORTA / 2 + b / 2), ALTURA_PORTA / 2, Z, borda);
      caixa(LARGURA_PORTA + 2 * b, b, e, M.destaque, X, ALTURA_PORTA + b / 2, Z, borda);
      borda.visible = false;
      portasDaVila.push({ nome: 'porta', x: X, z: Z, eixo: 'z', salas: [3, 4], aberta: false, vis: 0, folha, contorno: borda });
    }
    for (const [x, z, eixo, a, b] of [[0, 3, 'x', 1, 2], [4, 2, 'x', 1, 3], [6, 8.5, 'z', 4, 5]])   // os vãos sem porta
      portasDaVila.push({ nome: 'vão', x, z, eixo, salas: [a, b], aberta: true, vis: 1, folha: null, contorno: null });

    // --- mercadinho (5): estantes com mercadorias, balcão e caixotes ---
    const rnd = aleatorio(4242), CORES_DAS_CAIXAS = [0xd8433b, 0x2f7de1, 0xf2c230, 0x35a853, 0x9b51e0, 0xf2801f, 0xf06aa8, 0xf4f4f4, 0x24a3a3];
    // Uma estante encostada numa parede, com quatro tábuas. `ao`: (t, f, y) → o ponto a t metros
    // ao longo dela, f metros à frente da parede e y de altura. `vago`: onde não pôr mercadoria.
    const estante = (comprimento, ao, giro, vago) => {
      for (let i = 0; i < 4; i++) {
        const y = 0.3 + i * 0.45, tabua = malha(g, new T.BoxGeometry(comprimento, 0.03, 0.4), branco, ...ao(comprimento / 2, 0.22, y - 0.015));
        tabua.rotation.y = giro;
        for (let t = 0.14; t < comprimento - 0.1; t += 0.2 + rnd() * 0.06) {
          if (vago && i === vago[0] && Math.abs(t - vago[1]) < 0.52) continue;
          const alt = 0.12 + rnd() * 0.16, lata = rnd() < 0.35, cor = liso(CORES_DAS_CAIXAS[Math.floor(rnd() * CORES_DAS_CAIXAS.length)], 0.5);
          const m = malha(g, lata ? new T.CylinderGeometry(0.055, 0.055, alt, 14) : new T.BoxGeometry(0.13, alt, 0.1), cor, ...ao(t, 0.2 + rnd() * 0.08, y + alt / 2));
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
    pacote('café', '#1d1f22', '#c8372d', '#ffffff', 5.72);
    const chocolate = pacote('chocolate', '#5a3219', '#e9c46a', '#3b1f0e', 6.0);
    chocolate.ingrediente = true;
    pacote('biscoito', '#f2c230', '#2f7de1', '#ffffff', 6.28);
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

    fazSombra(g);
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
  balao.visible = false;
  cena.add(balao);
  // Põe o balão ao lado do rosto, do lado que fica mais para o meio da tela, e o esconde
  // quando a pessoa não disse nada ou há uma parede entre ela e a câmera.
  function atualizarBalao() {
    balao.visible = false;
    if (!pessoa || !pessoa.fala) return;
    const cx = camera.position.x, cz = camera.position.z, r = pessoa.rosto, parede = centro(pessoa.sala) + SALA.L / 2;
    if (REGRAS.vila) {                                      // na vila: só de dentro do cômodo dela, ou de um dos vãos dele
      if (areaEm(cx, cz) !== pessoa.sala && !portasDaVila.some(p => p.aberta && p.salas.includes(pessoa.sala) && noVaoDe(p, cx, cz))) return;
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

  // ---------- pessoa (desafio 3) ----------
  // Uma pessoa sentada numa poltrona, olhando para -z; a origem é o chão, no meio da poltrona.
  // Devolve o grupo e `contorno`, a borda de destaque em volta do corpo (não da poltrona).
  function montarPessoa() {
    const grupo = new T.Group(), cascas = [];
    const pele = mat(0xd8a47f, { roughness: 0.6 }), cabelo = mat(0x2b1d15, { roughness: 0.85 }), escuro = mat(0x1c1512, { roughness: 0.5 });
    const blusa = mat(0x2f4f7f, { roughness: 0.85 }), calca = mat(0x4b5563, { roughness: 0.85 }), sapato = mat(0x2a2320, { roughness: 0.5 });
    const tecido = mat(0xa85a3c, { roughness: 0.95 });
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
      malha(grupo, new T.CylinderGeometry(0.025, 0.02, 0.05, 12), M.nogueira, x, 0.025, z);

    // pernas: coxas no assento, canelas para baixo
    for (const x of [-0.1, 0.1]) {
      caixa(0.15, 0.14, 0.50, calca, x, 0.53, -0.215, true);
      caixa(0.13, 0.42, 0.13, calca, x, 0.27, -0.455, true);
      caixa(0.13, 0.08, 0.26, sapato, x, 0.045, -0.5);
    }
    caixa(0.38, 0.52, 0.22, blusa, 0, 0.74, 0.06, true);                                 // tronco
    for (const lado of [-1, 1]) {
      caixa(0.1, 0.30, 0.1, blusa, lado * 0.245, 0.80, 0.06, true);                      // braço
      caixa(0.09, 0.09, 0.30, blusa, lado * 0.3, 0.69, -0.07, true);                     // antebraço, apoiado no braço da poltrona
      bola(0.05, pele, lado * 0.3, 0.69, -0.26);                                         // mão
    }
    malha(grupo, new T.CylinderGeometry(0.05, 0.055, 0.1, 16), pele, 0, 1.03, 0.05);     // pescoço
    const CX = 0.04, CY = 1.17;                  // centro da cabeça
    bola(0.115, pele, 0, CY, CX, true);
    // cabelo: uma calota inclinada para trás, que deixa a testa e o rosto de fora
    malha(grupo, new T.SphereGeometry(0.124, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), cabelo, 0, CY + 0.004, CX + 0.004).rotation.x = 0.45;
    for (const x of [-0.042, 0.042]) bola(0.014, escuro, x, CY + 0.02, CX - 0.105);      // olhos
    bola(0.016, pele, 0, CY - 0.012, CX - 0.117);                                        // nariz
    malha(grupo, new T.BoxGeometry(0.046, 0.01, 0.01), mat(0x8a3b32, { roughness: 0.6 }), 0, CY - 0.05, CX - 0.102);   // boca

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
  const visual = { x: estado.x, z: estado.z, yaw: estado.rumo * GIRO, braco: 0, luz: 0, luzY: SALA.A - 0.35, luzZ: 0, forca: 2.1 };
  // Onde fica a lâmpada (há uma só): no meio da sala em que o robô está. Na vila, cada lugar diz onde (ver areas).
  const luzDaqui = () => REGRAS.vila ? areas[estado.sala].luz : { x: centro(estado.sala), y: SALA.A - 0.35, z: 0, forca: 2.1 };
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
  //   por último:           um móvel aberto ao alcance, para fechar
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
    const portas = REGRAS.vila ? portasDaVila.filter(p => p.folha) : REGRAS.portaManual && s.porta ? [s.porta] : [];
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
        if (REGRAS.inventario) lista.push(...soltos());
      } else if (perto(s.cesta)) lista.push(s.cesta);
      lista.push(null);
    } else {
      if (REGRAS.vila && vila.forno.dentro && perto(vila.forno)) lista.push(vila.forno);
      lista.push(...soltos());
    }
    lista.push(...maisPertoPrimeiro(abrem.filter(a => a.aberta)));
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
    if (portasDaVila.includes(a)) return 'abrir a porta';
    if (abrem.includes(a)) return `${a.aberta ? 'fechar' : 'abrir'}: ${a.nome}`;
    if (a === vila.tigela) return `pôr ${o.nome} na tigela`;
    if (a === vila.forno) return vila.forno.dentro ? 'tirar do forno' : 'pôr a massa no forno';
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
    if (alvo && alvo === s.porta) {
      abrirPorta(s);
      return resposta('pegar', true, 'abriu a porta');
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
    desenhar();
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
    const l = luzDaqui(), alvo = { x: estado.x, z: estado.z, yaw: estado.rumo * GIRO, braco, luz: l.x, luzY: l.y, luzZ: l.z, forca: l.forca };
    for (const c in alvo) visual[c] += (alvo[c] - visual[c]) * k;
    for (const gel of abrem) {                  // as duas portas da geladeira (ou do armário) giram para fora, uma para cada lado
      gel.vis += ((gel.aberta ? 1 : 0) - gel.vis) * kPorta;
      gel.folhas.forEach((eixo, i) => { eixo.rotation.y = (i ? 1 : -1) * 1.9 * gel.vis; });
    }
    for (const p of portasDaVila) {             // na vila, a porta corre ao longo da parede em que está
      if (!p.folha) continue;
      p.vis += ((p.aberta ? 1 : 0) - p.vis) * kPorta;
      const ao = p.eixo === 'x' ? 'z' : 'x';
      p.folha.position[ao] = p[ao] - (LARGURA_PORTA + 0.03) * p.vis;
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
    robo.position.set(visual.x, 0, visual.z);
    robo.rotation.y = visual.yaw;
    bracoDireito.rotation.x = visual.braco;
    if (estado.segurando) {                     // o objeto acompanha a mão
      const b = visual.braco, o = estado.segurando.malha;
      if (REGRAS.bracoCaido) o.position.set(0.31, 0.72 - 0.56 * Math.cos(b), -0.56 * Math.sin(b));   // na ponta do braço, depois da mão
      else o.position.set(0.31, 0.76 - 0.47 * Math.cos(b), -0.015 - 0.47 * Math.sin(b));              // logo acima da mão
    }
    lampada.position.set(visual.luz, visual.luzY, visual.luzZ);
    lampada.intensity = visual.forca;
    camera.position.set(visual.x, ALTURA_OLHOS, visual.z);
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
    camera.aspect = l / a;
    camera.updateProjectionMatrix();
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
    if (modoIA) desenhar();                     // redimensionar limpa o canvas
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
    if (!modoIA) { aplicarVisual(); desenhar(); }
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
  for (const [classe, fileiras] of [['do-jogo', [REGRAS.passoDeLado ? ['Q', 'W', 'E'] : ['W'], ['A', 'S', 'D'], ['Espaço', 'Tab'], ['L', 'T', 'F']]], ['da-pagina', [['1', '2', '3', '4', 'M'], ['Shift+T', 'I', 'R', 'H', 'G']]]]) {
    const grupo = document.createElement('div');
    grupo.className = classe;
    for (const teclas of fileiras) {
      const fileira = document.createElement('div');
      fileira.className = 'fileira';
      for (const t of teclas) { const k = document.createElement('kbd'); k.textContent = t; fileira.appendChild(k); }
      grupo.appendChild(fileira);
    }
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
  const VERSAO_DAS_REGRAS = 2;
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

  // ---------- teclado ----------
  const BOTAO_DA_TECLA = { KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyQ: 'Q', KeyE: 'E', Space: 'ESPACO', Tab: 'TAB', KeyL: 'L', KeyT: 'T', KeyF: 'F' };
  const REPETE_SEGURANDO = new Set(['W', 'A', 'S', 'D', 'Q', 'E']);
  let ultimoPasso = 0;

  window.addEventListener('keydown', e => {
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
  window.jogo = { apertar, comecar, mover, virar, pegar, levantar, escrever, frame, reiniciar, estado, salas, itens, desafio: DESAFIO, diagnostico: () => ultima,
    resultado: () => estado.ganhou ? 'ganhou' : estado.perdeu ? 'perdeu' : '' };
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
