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
 * São vários desafios (ver DESAFIOS), todos no mesmo quarto. No desafio 1 o jogo tem
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

  // ---------- configuração ----------
  const TOTAL_SALAS = 1;                        // quantas salas tem o desafio 1; completar a última é a vitória
  const OBJETOS_NO_CHAO = 3;                    // por sala; com o da cabeça do robô, o contador vai até 4
  const SALA = { L: 8, P: 7, A: 3 };            // largura (x), profundidade (z), altura (y), em metros
  const Z_ESPELHO = -SALA.P / 2;                // a parede-espelho inteira fica em z = -3.5
  const Z_PORTA = 1.7, LARGURA_PORTA = 1.4, ALTURA_PORTA = 2.1;
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
  // Cada desafio é um jogo diferente na mesma sala. Qual deles roda vem do endereço da
  // página (?desafio=2); sem isso, é o 1.
  //   1: guardar na cesta os objetos do chão e mais o que aparece na cabeça do próprio robô.
  //   2: entregar um presente a outro robô. O jogador começa de frente para o espelho e vê
  //      dois robôs: o mais próximo é o próprio reflexo; o outro está atrás dele, no fundo.
  //   3: há uma pessoa no quarto e nenhuma regra. Quem fala com ela ouve "Estou com sede".
  //      Atrás de uma porta há uma cozinha, e na geladeira há água: levá-la à pessoa é a vitória.
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
    },
  };
  const FALAS = { pedido: 'Estou com sede', agradecimento: 'Obrigado!' };   // o que a pessoa do desafio 3 diz
  const ENDERECO = new URLSearchParams(location.search);
  // Só vale o que está escrito em DESAFIOS: sem isto, ?desafio=constructor (ou outro nome que
  // todo objeto herda) passaria por desafio e a página quebraria ao procurar as regras dele.
  const existeDesafio = n => Object.prototype.hasOwnProperty.call(DESAFIOS, n);
  const DESAFIO = existeDesafio(ENDERECO.get('desafio')) ? Number(ENDERECO.get('desafio')) : 1;
  const REGRAS = Object.assign({ portaManual: false, contador: true }, DESAFIOS[DESAFIO]);
  // Variante para experimentar sem mexer no código: ...?desafio=2&disfarce
  if (ENDERECO.has('disfarce')) REGRAS.espelhoDisfarcado = true;

  // O robô só anda para onde está olhando: ir para trás é dar meia-volta e então o passo.
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
  raiz.add(new T.HemisphereLight(0xfff1e0, 0xcfc4b4, 0.38));
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
    if (DESAFIO === 3) return n === 1 ? { itens: [], pessoa: [-1.5, 3.0] }   // encostada na parede do fundo
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
    if (!cozinha) malha(g, new T.PlaneGeometry(3.6, 2.6), M.tapete, 0, 0.002, 0.2).rotation.x = -Math.PI / 2;
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
      malha(g, new T.BoxGeometry(0.94, 0.32, 0.02), M.latao, 1.8, 2.3, P / 2 - 0.01);
      malha(g, new T.PlaneGeometry(0.9, 0.28), mat(0xffffff, { map: placa, roughness: 0.45 }), 1.8, 2.3, P / 2 - 0.022).rotation.y = Math.PI;
    }

    // Enfeites de uma parede lateral: um quadro com moldura de nogueira entre duas arandelas
    // de latão. `lado` é +1 na parede esquerda (olha para +x) e -1 na direita.
    const enfeitar = (x, lado, tela, largura, altura) => {
      fazSombra(malha(g, new T.BoxGeometry(0.04, altura + 0.12, largura + 0.12), M.nogueira, x + lado * 0.02, 1.7, -1.2));
      malha(g, new T.PlaneGeometry(largura, altura), tela, x + lado * 0.042, 1.7, -1.2).rotation.y = lado * Math.PI / 2;
      for (const z of [-2.65, 0.25]) {
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
    const X1 = -2.9, X2 = 1.3, comp = X2 - X1, xm = (X1 + X2) / 2;
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

    // mesa no fundo, com dois bancos e uma fruteira
    const MX = 1.8, MZ = P / 2 - 0.45;
    malha(m, caixaSuave(1.6, 0.05, 0.8, 0.015), madeira, MX, 0.755, MZ);
    for (const dx of [-0.72, 0.72]) for (const dz of [-0.32, 0.32]) malha(m, new T.BoxGeometry(0.06, 0.73, 0.06), madeira, MX + dx, 0.365, MZ + dz);
    for (const dx of [-0.4, 0.4]) {
      malha(m, new T.CylinderGeometry(0.17, 0.17, 0.04, 24), madeira, MX + dx, 0.47, MZ - 0.62);
      malha(m, new T.CylinderGeometry(0.03, 0.03, 0.45, 12), preto, MX + dx, 0.225, MZ - 0.62);
      malha(m, new T.CylinderGeometry(0.14, 0.14, 0.02, 24), preto, MX + dx, 0.01, MZ - 0.62);
    }
    malha(m, new T.CylinderGeometry(0.17, 0.1, 0.08, 24), mat(0xf1eee6, { roughness: 0.3 }), MX, 0.82, MZ);
    const laranja = mat(0xf08a1c, { roughness: 0.6 });
    for (const [dx, dz] of [[-0.06, 0.03], [0.06, 0.03], [0, -0.06]]) malha(m, new T.SphereGeometry(0.05, 16, 12), laranja, MX + dx, 0.89, MZ + dz);
    blocos.push({ nome: 'mesa', x1: s.cx + MX - 0.8, x2: s.cx + MX + 0.8, z1: MZ - 0.79, z2: P / 2 });

    // geladeira: gaveta do congelador embaixo e, em cima, duas portas que abrem para os lados
    const GX = 1.8, larg = 0.8, prof = 0.65, alt = 1.85, base = 0.62, ap = alt - base, frente = prof / 2;
    const f = new T.Group();
    f.position.set(GX, 0, zf + prof / 2);
    m.add(f);
    const meio = base + (ap - 0.04) / 2;         // altura do meio do vão de dentro
    malha(f, new T.BoxGeometry(larg, base, prof - 0.05), M.inox, 0, base / 2, -0.025);                     // corpo do congelador
    malha(f, caixaSuave(larg - 0.01, base - 0.08, 0.05, 0.012), M.inox, 0, base / 2 + 0.02, frente - 0.025);   // frente da gaveta
    malha(f, new T.BoxGeometry(0.5, 0.022, 0.03), M.inoxEscuro, 0, base - 0.1, frente + 0.02);             // puxador da gaveta
    malha(f, new T.BoxGeometry(larg, 0.04, prof - 0.05), M.inox, 0, alt - 0.02, -0.025);                   // teto
    for (const lado of [-1, 1]) malha(f, new T.BoxGeometry(0.04, ap - 0.04, prof - 0.05), M.inox, lado * (larg / 2 - 0.02), meio, -0.025);
    malha(f, new T.BoxGeometry(larg - 0.08, ap - 0.04, 0.04), M.inox, 0, meio, -prof / 2 + 0.02);          // fundo
    malha(f, new T.BoxGeometry(larg - 0.084, ap - 0.044, prof - 0.088), M.forro, 0, meio, -0.002).receiveShadow = false;   // forro branco, visto por dentro (aceso: sem sombras)
    const prateleira = mat(0xe9f1f5, { roughness: 0.2, emissive: 0xe9f1f5, emissiveIntensity: 0.25 });
    const Y1 = 1.02, Y2 = 1.42;                  // as duas prateleiras
    for (const y of [Y1, Y2]) malha(f, new T.BoxGeometry(larg - 0.09, 0.014, 0.48), prateleira, 0, y, -0.03);
    const comida = (geo, cor, x, y, z) => malha(f, geo, mat(cor, { roughness: 0.5 }), x, y, z);   // enfeites: não dá para pegar
    for (const [x, z, cor] of [[0.14, 0.1, 0xc8372d], [0.25, 0.02, 0xc8372d], [0.05, 0.0, 0x7fae3c]])
      comida(new T.SphereGeometry(0.042, 16, 12), cor, x, base + 0.042, z);                                // maçãs
    comida(new T.CylinderGeometry(0.09, 0.08, 0.09, 24), 0x8f989f, 0.17, Y1 + 0.052, 0.02);                // panela...
    comida(new T.CylinderGeometry(0.095, 0.095, 0.012, 24), 0x70787f, 0.17, Y1 + 0.103, 0.02);             // ...com tampa
    comida(new T.BoxGeometry(0.16, 0.07, 0.11), 0xf0c94a, -0.17, Y2 + 0.042, 0.03);                        // queijo
    comida(new T.SphereGeometry(0.075, 16, 12), 0x5f9e45, 0.16, Y2 + 0.075, 0.0);                          // alface
    const folhas = [-1, 1].map(lado => {         // cada porta gira em torno da sua borda de fora
      const eixo = new T.Group();
      eixo.position.set(lado * larg / 2, 0, frente - 0.025);
      f.add(eixo);
      malha(eixo, caixaSuave(larg / 2 - 0.006, ap - 0.012, 0.05, 0.012), M.inox, -lado * larg / 4, base + ap / 2, 0);
      malha(eixo, new T.BoxGeometry(0.022, 0.6, 0.03), M.inoxEscuro, -lado * (larg / 2 - 0.045), base + 0.5, 0.045);   // puxador
      malha(eixo, new T.BoxGeometry(larg / 2 - 0.07, ap - 0.12, 0.012), prateleira, -lado * larg / 4, base + ap / 2, -0.031);   // lado de dentro
      return eixo;
    });
    // borda de destaque: uma moldura na frente da geladeira (ver M.destaque)
    const borda = new T.Group(), b = 0.035;
    f.add(borda);
    for (const lado of [-1, 1]) malha(borda, new T.BoxGeometry(b, alt, 0.02), M.destaque, lado * (larg / 2 - b / 2), alt / 2, frente + 0.005);
    for (const y of [b / 2, base, alt - b / 2]) malha(borda, new T.BoxGeometry(larg, b, 0.02), M.destaque, 0, y, frente + 0.005);
    borda.visible = false;
    // O alvo é a frente da geladeira. O bloco é mais fundo que ela, para o robô ficar fora
    // do caminho das portas quando elas abrem.
    s.geladeira = { nome: 'geladeira', x: s.cx + GX, z: zf + prof, aberta: false, vis: 0, folhas, contorno: borda, dentro: [] };
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
    if ((cx - parede) * (r.x - parede) < 0) {               // câmera na outra sala: só pela porta aberta
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
  const estado = { x: 0, z: REGRAS.inicio.z, rumo: REGRAS.inicio.rumo, sala: 1, segurando: null, naCabeca: null, maoLevantada: false, texto: '', ganhou: false };
  const visual = { x: estado.x, z: estado.z, yaw: estado.rumo * GIRO, braco: 0, luz: 0 };
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

  // Um objeto que não está no chão: na mão, na cabeça, na cesta, já entregue ou dentro da geladeira fechada.
  const foraDoChao = o => o === estado.segurando || o.naCabeca || o.naCesta || o.entregue || o.fechado;
  // Tudo o que ocupa lugar no chão da sala `s`: objetos soltos, a cesta e o outro robô.
  // (Os móveis e a poltrona da pessoa são retângulos: ver blocos.)
  const noCaminho = s => [...s.objetos.filter(o => !foraDoChao(o)), s.cesta, s.outroRobo].filter(Boolean);

  // Põe um objeto na mão do robô. Ele passa a andar junto; a posição exata vem de aplicarVisual.
  function segurar(o) {
    estado.segurando = o;
    robo.add(o.malha);
    o.malha.rotation.set(0, 0, 0);
    o.sombra.visible = false;
  }

  // ---------- comandos ----------
  function mover(direcao) {
    const giro = GIRO_DA_DIRECAO[direcao];
    if (giro === undefined) return resposta(`mover ${direcao}`, false, 'direção inválida');
    estado.rumo += giro;                        // vira mesmo que o passo acabe bloqueado
    const virou = giro ? ' (virou, mas não andou)' : '';
    const v = vetores();
    let nx = estado.x + v.fx * PASSO, nz = estado.z + v.fz * PASSO;
    if (!livre(nx, nz)) {                       // na diagonal contra uma parede, desliza ao longo dela
      if (Math.abs(v.fx) > 1e-6 && Math.abs(v.fz) > 1e-6 && livre(nx, estado.z)) nz = estado.z;
      else if (Math.abs(v.fx) > 1e-6 && Math.abs(v.fz) > 1e-6 && livre(estado.x, nz)) nx = estado.x;
      else {
        const lado = nx - centro(estado.sala), movel = noMovel(nx, nz, RAIO_ROBO);
        const naPorta = noVao(nz) && ((salas[estado.sala].porta && lado > SALA.L / 2 - MARGEM_PAREDE) || (estado.sala > 1 && lado < MARGEM_PAREDE - SALA.L / 2));
        return resposta(`mover ${direcao}`, false, (movel ? `bloqueado: ${movel.nome} no caminho` : naPorta ? 'bloqueado: porta fechada' : 'bloqueado: parede') + virou);
      }
    }
    for (const s of Object.values(salas)) for (const o of noCaminho(s)) {
      const depois = Math.hypot(nx - o.x, nz - o.z), antes = Math.hypot(estado.x - o.x, estado.z - o.z);
      if (depois < RAIO_ROBO + o.raio && depois < antes) return resposta(`mover ${direcao}`, false, `bloqueado: ${o.nome} no caminho` + virou);
    }
    estado.x = nx; estado.z = nz;
    estado.sala = salaDe(nx);
    if (portaAberta && !REGRAS.portaManual && dentro(portaAberta + 1, nx, nz)) {   // entrou de vez na sala seguinte
      fecharPorta();
      return resposta(`mover ${direcao}`, true, `ok — você entrou na sala ${numero(estado.sala)} e a porta fechou atrás de você`);
    }
    return resposta(`mover ${direcao}`, true, 'ok');
  }

  function virar(lado) {
    if (lado !== 'esquerda' && lado !== 'direita') return resposta(`virar ${lado}`, false, 'lado inválido');
    estado.rumo += lado === 'esquerda' ? 1 : -1;
    return resposta(`virar ${lado}`, true, 'ok');
  }

  // Distância até algo que esteja ao alcance e à frente (±45°); Infinity se não estiver.
  function alcance(alvo) {
    const v = vetores(), ox = alvo.x - estado.x, oz = alvo.z - estado.z, dist = Math.hypot(ox, oz);
    return dist <= ALCANCE && (ox * v.fx + oz * v.fz) / dist >= 0.69 ? dist : Infinity;
  }

  // Levanta ou abaixa a mão direita, com ou sem objeto nela. Com a mão no alto, pegar só
  // mexe com a cabeça; com a mão embaixo, só com o chão e a cesta.
  function levantar() {
    estado.maoLevantada = !estado.maoLevantada;
    return resposta('levantar', true, estado.maoLevantada ? 'mão levantada' : 'mão abaixada');
  }

  // O que o comando pegar pegaria agora — ou em quem ele agiria, se fosse entregar ou
  // guardar o que está na mão. É isso que ganha a borda de destaque.
  //   segurando algo:       o outro robô, se estiver ao alcance (com a mão no alto ou embaixo)
  //   a pessoa ao alcance:  ela — para entregar o que está na mão ou, de mão vazia e embaixo, falar com ela
  //   porta ou geladeira fechada, ao alcance: ela, para abrir (a porta, só a que o jogador abre)
  //   mão no alto, vazia:   o objeto que está na cabeça
  //   mão embaixo, cheia:   a cesta, se estiver ao alcance
  //   mão embaixo, vazia:   o objeto do chão (ou da geladeira aberta) mais próximo ao alcance
  function alvoAtual() {
    const s = salas[estado.sala], perto = a => alcance(a) < Infinity;
    if (estado.segurando && s.outroRobo && !s.outroRobo.recebeu && perto(s.outroRobo)) return s.outroRobo;
    if (s.pessoa && !s.pessoa.recebeu && (estado.segurando || !estado.maoLevantada) && perto(s.pessoa)) return s.pessoa;
    if (REGRAS.portaManual && s.porta && !s.porta.aberta && perto(s.porta)) return s.porta;
    if (s.geladeira && !s.geladeira.aberta && perto(s.geladeira)) return s.geladeira;
    if (estado.maoLevantada) return estado.segurando ? null : estado.naCabeca;
    if (estado.segurando) return s.cesta && perto(s.cesta) ? s.cesta : null;
    // Com a porta aberta não há o que pegar: a sala atual está completa, e os objetos da
    // próxima só valem depois que o robô entra nela e a porta fecha. (Não vale para a porta
    // que o jogador abre: aí as salas são um lugar só, e um objeto pode ter sido solto em qualquer uma.)
    if (portaAberta && !REGRAS.portaManual) return null;
    let alvo = null, menor = Infinity;
    for (const o of REGRAS.portaManual ? Object.values(salas).flatMap(q => q.objetos) : s.objetos) {
      const dist = foraDoChao(o) ? Infinity : alcance(o);   // o que já foi guardado ou entregue fica onde está
      if (dist < menor) { menor = dist; alvo = o; }
    }
    return alvo;
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

  function pegar() {
    const v = vetores(), s = salas[estado.sala], alvo = alvoAtual();
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
    if (alvo && alvo === s.geladeira) {
      alvo.aberta = true;
      alvo.dentro.forEach(o => { o.fechado = false; });
      return resposta('pegar', true, 'abriu a geladeira');
    }
    if (estado.maoLevantada) {                  // mão no alto: tira da cabeça ou põe na cabeça
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
      estado.segurando = alvo;                  // a mão continua no alto, segurando
      return resposta('pegar', true, `pegou da cabeça: ${alvo.nome}`);
    }
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
    const alvo = { x: estado.x, z: estado.z, yaw: estado.rumo * GIRO, braco, luz: centro(estado.sala) };
    for (const c in alvo) visual[c] += (alvo[c] - visual[c]) * k;
    for (const s of Object.values(salas)) {
      const r = s.outroRobo;
      if (r) {                                  // o outro robô estende o braço quando recebe o presente
        r.braco += ((r.recebeu ? BRACO.estendido : BRACO.caido) - r.braco) * k;
        r.corpo.braco.rotation.x = r.braco;
      }
      const gel = s.geladeira;
      if (gel) {                                // as duas portas da geladeira giram para fora, uma para cada lado
        gel.vis += ((gel.aberta ? 1 : 0) - gel.vis) * kPorta;
        gel.folhas.forEach((eixo, i) => { eixo.rotation.y = (i ? 1 : -1) * 1.9 * gel.vis; });
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
    lampada.position.x = visual.luz;
    camera.position.set(visual.x, ALTURA_OLHOS, visual.z);
    camera.rotation.set(INCLINACAO, visual.yaw, 0);
    atualizarBalao();
  }
  const alvoDescartavel = new T.WebGLRenderTarget(1, 1);
  function desenhar() {
    renderer.clear();
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
  }
  function ajustarTamanho() {
    definirTamanho(window.innerWidth, window.innerHeight);
    if (modoIA) desenhar();                     // redimensionar limpa o canvas
  }
  window.addEventListener('resize', ajustarTamanho);

  let anterior = performance.now();
  function quadro(agora) {
    const dt = Math.min(0.1, (agora - anterior) / 1000);
    anterior = agora;
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
    T: texto => escrever(texto),                // o único que usa o texto que vem junto
    F: () => frame(),                           // o único que devolve algo: a imagem
  };
  function apertar(botao, texto) {
    const acao = Object.prototype.hasOwnProperty.call(BOTOES, botao) && BOTOES[botao];
    return acao ? acao(texto) : resposta(`apertar ${botao}`, false, 'botão inexistente');
  }

  // ---------- teclado ----------
  const BOTAO_DA_TECLA = { KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D', Space: 'ESPACO', KeyL: 'L', KeyT: 'T', KeyF: 'F' };
  const REPETE_SEGURANDO = new Set(['W', 'A', 'S', 'D']);
  let ultimoPasso = 0;

  window.addEventListener('keydown', e => {
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
      case 'KeyR': reiniciar(); break;
      case 'Digit1': case 'Numpad1': comecar(1); break;
      case 'Digit2': case 'Numpad2': comecar(2); break;
      case 'Digit3': case 'Numpad3': comecar(3); break;
    }
  });

  // ---------- início ----------
  const primeira = criarSala(1);
  if (REGRAS.portaManual) for (let n = 2; n <= REGRAS.salas; n++) criarSala(n);   // desafio 3: a cozinha já existe atrás da porta
  if (primeira.presente) segurar(primeira.presente);   // desafio 2: o jogador já começa com o presente na mão
  contador.malha.visible = REGRAS.contador;
  window.jogo = { apertar, comecar, mover, virar, pegar, levantar, escrever, frame, reiniciar, estado, salas, desafio: DESAFIO, diagnostico: () => ultima };
  ajustarTamanho();
  aplicarVisual();
  resposta('início', true, 'ok');
  requestAnimationFrame(quadro);
})();
