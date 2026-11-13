/* Desafio M — multiplayer: dois robôs numa quadra dividida por uma rede.
 *
 * Cada robô fica na sua metade e não passa das linhas brancas. Em cada lado aparecem quatro
 * objetos. ESPACO de frente para um objeto pega; ESPACO com um objeto na mão arremessa para
 * onde o robô está olhando. Quem é acertado cai e o outro marca um ponto; vence quem chegar
 * primeiro a PONTOS_PARA_VENCER.
 *
 * O tempo anda em RODADAS, não em segundos: uma iA leva vários segundos para decidir cada
 * botão, então um jogo em tempo real seria injusto. Numa rodada cada jogador faz uma jogada
 * (um botão), as duas valem ao mesmo tempo e só então os objetos no ar avançam. A rodada
 * fecha quando os dois jogaram, ou quando um deles demora demais (ver ESPERA). O botão F
 * (a imagem) não gasta rodada.
 *
 * Quem joga em cada robô: uma iA (pelo MCP) ou uma pessoa no teclado. Todas as iAs usam o
 * mesmo endereço MCP; o servidor dá um número a cada conexão, e é por esse número que o jogo
 * sabe de quem é cada botão: a primeira conexão que entra fica com um robô, a segunda com o
 * outro (ver sentar). São dois desafios na mesma quadra:
 *   M (multiplayer): um contra o outro. Quem entra primeiro aguarda: o robô do outro lado só
 *                    aparece, e a partida só começa, quando o segundo jogador entra.
 *   T (treino):      o lado que ninguém pegou é jogado pelo robô da casa ("bot"), e a
 *                    partida começa na hora.
 *
 * Este arquivo só roda com ?desafio=M ou ?desafio=T; os outros desafios estão em jogo.js.
 * Os dois expõem a mesma interface em window.jogo, que é o que a ponte com o servidor usa.
 */
(() => {
  'use strict';
  const ENDERECO = new URLSearchParams(location.search);
  const MODO = ENDERECO.get('desafio');
  if (MODO !== 'M' && MODO !== 'T') return;
  const TREINO = MODO === 'T';
  const T = THREE;

  // ---------- configuração ----------
  const NOME_DO_JOGO = 'Galinha Pong';          // aparece nas placas da quadra e na aba do navegador
  document.title = NOME_DO_JOGO + (TREINO ? ' (treino)' : '');
  const LINHA = { x: 3.9, z: 5.9 };             // as linhas brancas de fora da quadra (a rede fica em z = 0)
  const LIMITE = { x: 3.5, perto: 1.0, fundo: 5.5 };   // onde o centro de um robô pode estar, na sua metade
  const CERCA = { x: 4.4, z: 6.4 };             // até onde um objeto arremessado chega
  const PASSO = 0.5, GIRO = Math.PI / 4;        // metros por passo, 45° por giro
  const ALCANCE = 1.5;                          // distância máxima para pegar um objeto do chão
  const ALTURA_OLHOS = 1.02, INCLINACAO = -0.14;
  const FRAME = { l: 960, a: 540 };             // tamanho da imagem que o botão F devolve
  const VELOCIDADE = 4.5;                       // metros que um objeto voa por rodada
  const ALCANCE_DO_ARREMESSO = 11;              // depois disso ele cai no chão
  const RAIO_DE_ACERTO = 0.5;                   // o objeto acerta se passar a menos disso do centro do robô
  const PONTOS_PARA_VENCER = 3;
  const FOLEGO_DO_ESCUDO = 4;                   // rodadas que o braço aguenta com o escudo levantado; cada rodada abaixado recupera uma
  // Segundos de espera. teclado / ia: quanto uma rodada espera pelo outro jogador (e, no
  // desafio M, quanto um botão espera o outro jogador entrar). entrada: quanto a chamada
  // `comecar` de uma iA espera a outra entrar antes de voltar dizendo que ainda aguarda.
  const ESPERA = { teclado: 0.25, ia: 15, entrada: 20 };
  const ABANDONO = 45;                          // segundos sem nenhuma chamada para o lugar de uma iA poder passar para outra
  // Segundos de pausa depois de um ponto, antes de a quadra ser arrumada (?pausa=0 tira a pausa).
  const PAUSA_DO_PONTO = ENDERECO.has('pausa') ? Math.max(0, Number(ENDERECO.get('pausa')) || 0) : 1.6;
  const COM_BOT = ENDERECO.get('bot') !== '0';  // treino com ?bot=0: o robô da casa fica parado
  const MENSAGEM = 'Acerte o outro robô e não seja acertado.';   // o que a iA recebe está em ferramentas.json
  const INTERVALO_TECLA = 150;                  // ms entre jogadas com a tecla segurada
  const COR = { 1: 0xff7a3d, 2: 0x22b3a6 }, COR_CSS = { 1: '#ff7a3d', 2: '#22b3a6' };
  const CAMADA = { 1: 3, 2: 4 };                // camada do corpo de cada robô: a câmera dele não a enxerga
  const BRACO = { caido: 0, estendido: 1.13, levantado: 2.45 };
  const INICIO = 5.0;                           // a que distância da rede cada robô começa: bem atrás, perto da linha de fundo
  const RODA = 3.2;                             // raio do semicírculo de objetos à frente de quem começa: uns quatro passos até alcançar um
  // Replay: depois de um acerto, o lance é reprisado em câmera lenta, de um ponto de vista só
  // dele. Sem a pausa do ponto (?pausa=0) ou com ?replay=0 não há reprise.
  const REPLAY = PAUSA_DO_PONTO > 0 && ENDERECO.get('replay') !== '0';
  const ANTES_DO_REPLAY = 1.5;                  // segundos entre o acerto e a reprise: o lance ao vivo acaba de acontecer
  // Antes de a partida valer, o juiz pergunta a cada iA se ela está pronta, e o tempo só começa
  // a contar quando as duas respondem (botão PRONTO). ?pronto=0 tira a pergunta.
  const PERGUNTAR_PRONTO = ENDERECO.get('pronto') !== '0';
  const NARRACAO = 140;                         // quantas letras cabem numa fala do comentarista

  // ---------- cena ----------
  const canvas = document.getElementById('tela');
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.autoClear = false;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;        // as sombras são refeitas uma vez por desenho (ver desenhar)

  const mat = (cor, extra) => new T.MeshStandardMaterial(Object.assign({ color: cor, roughness: 0.7, metalness: 0 }, extra));
  const luminoso = opcoes => new T.MeshBasicMaterial(Object.assign({ toneMapped: false }, opcoes));
  function malha(pai, geo, material, x, y, z) {
    const m = new T.Mesh(geo, material);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    pai.add(m);
    return m;
  }
  const fazSombra = obj => obj.traverse(m => { if (m.isMesh && m.material.isMeshStandardMaterial && !m.material.transparent) m.castShadow = true; });
  function caixaSuave(l, a, p, r) {             // caixa com as quinas arredondadas
    const x = l / 2 - r, y = a / 2 - r, c = r * 0.6, forma = new T.Shape();
    forma.moveTo(-x + c, -y);
    forma.lineTo(x - c, -y); forma.quadraticCurveTo(x, -y, x, -y + c);
    forma.lineTo(x, y - c); forma.quadraticCurveTo(x, y, x - c, y);
    forma.lineTo(-x + c, y); forma.quadraticCurveTo(-x, y, -x, y - c);
    forma.lineTo(-x, -y + c); forma.quadraticCurveTo(-x, -y, -x + c, -y);
    return new T.ExtrudeGeometry(forma, { depth: p - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 4 }).center();
  }
  function texturaCanvas(l, a, desenho) {
    const c = document.createElement('canvas');
    c.width = l; c.height = a;
    desenho(c.getContext('2d'), l, a);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  function aleatorio(semente) {                 // a mesma semente dá sempre a mesma sequência
    let a = semente >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const cantos = (g, x, y, l, a, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, l, a, r); else g.rect(x, y, l, a); };

  const cena = new T.Scene();
  // Fim de tarde. O céu é uma cúpula: azul-escuro no alto, com as primeiras estrelas, passando
  // por roxo e laranja até o clarão do sol no horizonte. O sol, já baixo e alaranjado, vem do
  // lado da câmera e faz sombras compridas; o resto da luz é o azul do céu e os quatro
  // refletores da quadra, já acesos (os postes deles estão nos enfeites).
  const SOL = new T.Vector3(20, 9.5, 9);        // de onde vem o sol
  const texCeu = texturaCanvas(2048, 512, (g, l, a) => {
    const rnd = aleatorio(41), ceu = g.createLinearGradient(0, 0, 0, a);
    [[0, '#0d1738'], [0.22, '#1f2a63'], [0.36, '#5a3f85'], [0.44, '#c2607a'], [0.485, '#f59a55'], [0.5, '#ffd596'], [0.51, '#6b5a78'], [1, '#2c2a3e']]
      .forEach(([p, cor]) => ceu.addColorStop(p, cor));
    g.fillStyle = ceu; g.fillRect(0, 0, l, a);
    for (let i = 0; i < 260; i++) {              // estrelas, só no alto
      const y = rnd() * a * 0.3;
      g.fillStyle = `rgba(255,255,255,${(0.25 + rnd() * 0.6) * (1 - y / (a * 0.3))})`;
      g.fillRect(rnd() * l, y, rnd() < 0.2 ? 2 : 1, rnd() < 0.2 ? 2 : 1);
    }
    // o clarão do sol, na direção de onde ele vem (a cúpula dá a volta inteira de 0 a l)
    const x = ((Math.atan2(SOL.z, -SOL.x) / (2 * Math.PI) + 1) % 1) * l, y = a * (0.5 - Math.atan2(SOL.y, Math.hypot(SOL.x, SOL.z)) / Math.PI);
    for (const dx of [-l, 0, l]) {
      g.save(); g.translate(x + dx, y); g.scale(2, 1);
      const brilho = g.createRadialGradient(0, 0, 0, 0, 0, 90);
      brilho.addColorStop(0, 'rgba(255,244,214,1)'); brilho.addColorStop(0.12, 'rgba(255,214,140,0.95)'); brilho.addColorStop(0.45, 'rgba(255,150,80,0.35)'); brilho.addColorStop(1, 'rgba(255,120,60,0)');
      g.fillStyle = brilho; g.fillRect(-100, -100, 200, 200);
      g.restore();
    }
  });
  cena.add(new T.Mesh(new T.SphereGeometry(125, 40, 20), new T.MeshBasicMaterial({ map: texCeu, side: T.BackSide, fog: false, depthWrite: false })));
  cena.add(new T.HemisphereLight(0xa9b8ec, 0x4c423a, 0.34));
  const sol = new T.DirectionalLight(0xffa868, 1.35);
  sol.position.copy(SOL);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  Object.assign(sol.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 50 });
  sol.shadow.bias = -0.0005; sol.shadow.normalBias = 0.03;
  cena.add(sol);
  const REFLETORES = [[-10.8, -11.8], [-10.8, 11.8], [7.8, -11.8], [7.8, 11.8]];     // os postes, um em cada canto
  for (const [x, z] of REFLETORES) {
    const luz = new T.SpotLight(0xfff1d2, 95, 60, 0.62, 0.55, 1.6);
    luz.position.set(x, 8.5, z);
    luz.target.position.set(x * 0.15, 0, z * 0.25);
    cena.add(luz, luz.target);
  }
  // Os reflexos: o que brilha (o piso, as tampas, o peixe) espelha um "ambiente" simples —
  // o mesmo céu e os quatro refletores acesos.
  cena.environment = (() => {
    const amb = new T.Scene();
    amb.add(new T.Mesh(new T.SphereGeometry(60, 24, 12), new T.MeshBasicMaterial({ map: texCeu, side: T.BackSide })));
    for (const [x, z] of REFLETORES) {
      const lampada = new T.Mesh(new T.PlaneGeometry(5, 3), new T.MeshBasicMaterial({ color: new T.Color(9, 8.4, 6.6) }));
      lampada.position.set(x * 2.2, 17, z * 2.2);
      lampada.lookAt(0, 0, 0);
      amb.add(lampada);
    }
    const gerador = new T.PMREMGenerator(renderer), textura = gerador.fromScene(amb, 0.03).texture;
    gerador.dispose();
    return textura;
  })();

  const M = {
    contorno: luminoso({ color: 0x00e5ff, side: T.BackSide }),   // borda de destaque (uma casca vista por dentro)
    escuro: mat(0x2c333b, { roughness: 0.5 }),
    branco: mat(0xf4f1ea, { roughness: 0.5 }),
    poste: mat(0x1f5a3d, { roughness: 0.6 }),
    madeira: mat(0x8a5a33, { roughness: 0.8 }),
    folha: mat(0x2f8a45, { roughness: 0.9 }),
  };
  const texSombra = texturaCanvas(128, 128, (g, l) => {
    const r = g.createRadialGradient(l / 2, l / 2, 0, l / 2, l / 2, l / 2);
    r.addColorStop(0, 'rgba(0,0,0,0.45)'); r.addColorStop(0.55, 'rgba(0,0,0,0.25)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, l, l);
  });
  function sombraNoChao(pai, raio) {            // mancha escura que "assenta" as coisas no chão
    const s = malha(pai, new T.CircleGeometry(raio, 24), new T.MeshBasicMaterial({ map: texSombra, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 0, 0.006, 0);
    s.rotation.x = -Math.PI / 2;
    return s;
  }

  // ---------- quadra ----------
  (() => {
    const PX = 100, LQ = 10.4, PQ = 14.4;       // pixels por metro e tamanho do piso pintado
    const piso = texturaCanvas(LQ * PX, PQ * PX, (g, l, a) => {
      const X = x => (x + LQ / 2) * PX, Z = z => (z + PQ / 2) * PX, rnd = aleatorio(4);
      g.fillStyle = '#2f7f5c'; g.fillRect(0, 0, l, a);
      g.fillStyle = '#2f6fb7'; g.fillRect(X(-LINHA.x), Z(-LINHA.z), 2 * LINHA.x * PX, 2 * LINHA.z * PX);
      for (let i = 0; i < 9000; i++) {           // granulado do piso
        g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${0.02 + rnd() * 0.03})`;
        g.fillRect(rnd() * l, rnd() * a, 2 + rnd() * 5, 2 + rnd() * 5);
      }
      g.strokeStyle = '#ffffff'; g.lineWidth = 0.08 * PX;
      g.strokeRect(X(-LINHA.x), Z(-LINHA.z), 2 * LINHA.x * PX, 2 * LINHA.z * PX);
      const linha = (x1, z1, x2, z2) => { g.beginPath(); g.moveTo(X(x1), Z(z1)); g.lineTo(X(x2), Z(z2)); g.stroke(); };
      for (const z of [-3.2, 3.2, -0.6, 0.6]) linha(-LINHA.x, z, LINHA.x, z);   // linhas de saque e a faixa da rede
      linha(0, -3.2, 0, -0.6); linha(0, 0.6, 0, 3.2);
    });
    // gramado em volta: faixas de corte, uma mais clara e outra mais escura, e um granulado de capim
    const grama = texturaCanvas(256, 256, (g, l) => {
      const rnd = aleatorio(15);
      g.fillStyle = '#5a9c4f'; g.fillRect(0, 0, l, l);
      g.fillStyle = '#63a657'; g.fillRect(0, 0, l / 2, l);
      for (let i = 0; i < 5000; i++) {
        g.fillStyle = `rgba(${rnd() < 0.5 ? '20,60,20' : '190,230,150'},${0.04 + rnd() * 0.07})`;
        g.fillRect(rnd() * l, rnd() * l, 1 + rnd() * 2, 2 + rnd() * 5);
      }
    });
    grama.wrapS = grama.wrapT = T.RepeatWrapping;
    grama.repeat.set(30, 30);
    // (Bem abaixo do piso da quadra e em vários pedaços: um plano enorme e inteiriço, a poucos
    // milímetros do piso, aparecia por cima dele nas vistas pequenas, por falta de precisão de profundidade.)
    malha(cena, new T.PlaneGeometry(220, 220, 22, 22), mat(0xffffff, { map: grama, roughness: 1, envMapIntensity: 0.3 }), 0, -0.06, 0).rotation.x = -Math.PI / 2;
    malha(cena, new T.PlaneGeometry(16.6, 23.6, 8, 12), mat(0xcfcbc0, { roughness: 0.9, envMapIntensity: 0.4 }), -2.3, -0.03, 0).rotation.x = -Math.PI / 2;   // piso claro em volta da quadra, sob as arquibancadas
    malha(cena, new T.PlaneGeometry(LQ, PQ), mat(0xffffff, { map: piso, roughness: 0.42, envMapIntensity: 0.55 }), 0, 0, 0).rotation.x = -Math.PI / 2;   // piso liso: reflete os refletores e o céu

    // Tela de arame: uma malha quadriculada que se repete. De longe vira um véu translúcido.
    const tela = (cor, celulas) => {
      const t = texturaCanvas(32, 32, (g, l) => { g.clearRect(0, 0, l, l); g.fillStyle = cor; g.fillRect(0, 0, l, 4); g.fillRect(0, 0, 4, l); });
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.repeat.set(celulas[0], celulas[1]);
      return new T.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, side: T.DoubleSide });
    };
    const g = new T.Group();
    cena.add(g);
    // rede: baixa (meio metro), para cada jogador ver o adversário inteiro e o que ele tem nas mãos
    const REDE = 0.5;
    malha(g, new T.PlaneGeometry(8.6, REDE - 0.07), tela('rgba(250,250,250,0.95)', [86, (REDE - 0.07) * 10]), 0, (REDE - 0.07) / 2 + 0.04, 0);
    malha(g, new T.BoxGeometry(8.6, 0.06, 0.03), M.branco, 0, REDE, 0);
    for (const x of [-4.3, 4.3]) malha(g, new T.CylinderGeometry(0.05, 0.05, REDE + 0.06, 12), M.escuro, x, (REDE + 0.06) / 2, 0);
    // alambrado no fundo dos dois lados e na lateral de -x; a outra lateral fica aberta para a câmera
    const A = 2.4, arame = (l) => tela('rgba(20,70,45,0.9)', [l / 0.12, A / 0.12]);
    for (const z of [-6.9, 6.9]) malha(g, new T.PlaneGeometry(9.8, A), arame(9.8), 0, A / 2, z);
    malha(g, new T.PlaneGeometry(13.8, A), arame(13.8), -4.9, A / 2, 0).rotation.y = Math.PI / 2;
    for (const [x, z] of [[-4.9, -6.9], [-4.9, -3.45], [-4.9, 0], [-4.9, 3.45], [-4.9, 6.9], [-1.6, -6.9], [1.6, -6.9], [4.9, -6.9], [-1.6, 6.9], [1.6, 6.9], [4.9, 6.9]])
      malha(g, new T.CylinderGeometry(0.04, 0.04, A, 10), M.poste, x, A / 2, z);
    // placas baixas na lateral aberta
    // (O desenho tem a proporção da placa, 13,8 m por 0,7 m, e cada faixa é larga o bastante
    // para o texto dela: faixas estreitas demais faziam um texto invadir o outro.)
    const placa = texturaCanvas(2048, 104, (c, l, a) => {
      const FAIXAS = 6, larg = l / FAIXAS;
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'bold 52px Arial, sans-serif';
      for (let i = 0; i < FAIXAS; i++) {
        c.fillStyle = ['#f25c54', '#577590', '#43aa8b'][i % 3];
        c.fillRect(Math.floor(i * larg), 0, Math.ceil(larg), a);
        c.fillStyle = '#ffffff';
        c.fillText(i % 2 ? '★  ★  ★' : NOME_DO_JOGO.toUpperCase(), (i + 0.5) * larg, a / 2 + 4, larg - 44);
      }
    });
    malha(g, new T.BoxGeometry(0.08, 0.7, 13.8), mat(0xffffff, { map: placa, roughness: 0.6 }), 4.9, 0.35, 0);
    // árvores em volta, para dar fundo
    for (const [x, z, s] of [[-8, -9.5, 1.2], [-12, -3, 1], [-12, 5.5, 1.3], [-3, -12.8, 1.1], [4.5, -13, 1], [3.5, 12.8, 1.2], [-4.5, 13, 1], [10, -10, 1.3], [10.5, 9.5, 1.1]]) {
      malha(g, new T.CylinderGeometry(0.16 * s, 0.22 * s, 1.4 * s, 8), M.madeira, x, 0.7 * s, z);
      malha(g, new T.SphereGeometry(1.1 * s, 12, 10), M.folha, x, 2.2 * s, z);
      malha(g, new T.SphereGeometry(0.8 * s, 12, 10), M.folha, x + 0.5 * s, 3.0 * s, z - 0.3 * s);
    }
    fazSombra(g);
  })();

  // Placar de verdade, na lateral: os dois números, cada um na cor do seu robô.
  const placar = { canvas: document.createElement('canvas') };
  placar.canvas.width = 512; placar.canvas.height = 208;
  placar.textura = new T.CanvasTexture(placar.canvas);
  placar.textura.colorSpace = T.SRGBColorSpace;
  malha(cena, new T.BoxGeometry(0.12, 1.16, 2.76), M.escuro, -5.35, 3.7, 0).castShadow = true;
  malha(cena, new T.PlaneGeometry(2.6, 1.0), luminoso({ map: placar.textura }), -5.28, 3.7, 0).rotation.y = Math.PI / 2;
  for (const z of [-1.1, 1.1]) malha(cena, new T.CylinderGeometry(0.05, 0.05, 3.2, 10), M.escuro, -5.35, 1.6, z);

  // ---------- arquibancada e plateia ----------
  // Três arquibancadas: uma na lateral oposta à da câmera e uma atrás de cada jogador. Cada uma
  // começa com uma mureta escura, da altura dos robôs: é ela que fica de fundo para quem joga,
  // e a plateia aparece por cima, sem atrapalhar a visão do adversário e dos objetos.
  // A plateia são bonecos simples (corpo e cabeça), todos desenhados de uma vez só. A metade de
  // cada jogador torce por ele, com a cor dele; quando sai ponto, a torcida de quem marcou pula.
  // Ela tem vida própria: cada torcedor tem braços; alguns filmam com o celular (e o flash
  // dispara), outros seguram cartazes com o nome do jogador; vizinhos viram um para o outro e
  // conversam; todos acompanham o lance com o corpo. Quando sai ponto, a torcida de quem marcou
  // pula de braços para cima e a outra põe as mãos na cabeça; numa defesa, palmas; e quando
  // os jogadores demoram a jogar, passa uma ola pelas arquibancadas. Na imagem que vai para
  // as iAs a torcida aparece sempre quieta: ela não conta nada do jogo a ninguém.
  const torcida = { lugares: [], corpos: null, cabecas: null, bracos: null, celulares: null, cartazes: [], claroes: [], comFone: [],
    animo: 0, lado: 0, palmas: 0, quemAplaude: 0, flashes: 0, tensao: 0, ola: -99, proximaOla: 18, conta: 0, sorte: aleatorio(555),
    m: new T.Matrix4(), m2: new T.Matrix4(), m3: new T.Matrix4(), q: new T.Quaternion(), e: new T.Euler(0, 0, 0, 'YXZ'), e2: new T.Euler(), p: new T.Vector3(), v: new T.Vector3(), um: new T.Vector3(1, 1, 1) };
  (() => {
    const g = new T.Group(), rnd = aleatorio(2026);
    cena.add(g);
    const concreto = mat(0xb4b9bf, { roughness: 0.9 }), mureta = mat(0x22344d, { roughness: 0.7 }), banco = mat(0x2f6fb7, { roughness: 0.6 });
    const DEGRAU = 0.8, SUBIDA = 0.45, BASE = 1.3;
    // (ox, oz) é o meio da frente; (dx, dz), o sentido em que ela sobe, para longe da quadra;
    // `comprimento`, o tamanho ao longo da quadra; `time`, por quem torce (0 = depende do lugar).
    function arquibancada(ox, oz, dx, dz, comprimento, fileiras, time) {
      const lateral = dx !== 0;
      for (let i = 0; i < fileiras; i++) {
        const alt = BASE + SUBIDA * i, cx = ox + dx * DEGRAU * (i + 0.5), cz = oz + dz * DEGRAU * (i + 0.5);
        malha(g, new T.BoxGeometry(lateral ? DEGRAU : comprimento, alt, lateral ? comprimento : DEGRAU), concreto, cx, alt / 2, cz);
        malha(g, new T.BoxGeometry(lateral ? 0.4 : comprimento - 0.3, 0.05, lateral ? comprimento - 0.3 : 0.4), banco, cx + dx * 0.1, alt + 0.025, cz + dz * 0.1);
        const giro = Math.atan2(dx, dz), vizinho = lateral ? -Math.sin(giro) : Math.cos(giro);   // giro: de frente para a quadra; vizinho: de que lado fica o próximo da fileira
        let anterior = null;
        for (let s = -comprimento / 2 + 0.45; s <= comprimento / 2 - 0.45; s += 0.64) {
          if (rnd() < 0.1) { anterior = null; continue; }      // um lugar vazio de vez em quando
          const ao = s + (rnd() - 0.5) * 0.14, x = lateral ? cx + dx * 0.1 : ox + ao, z = lateral ? oz + ao : cz + dz * 0.1;
          const eu = { x, y: alt + 0.05, z, giro, fase: rnd() * 6.28, pressa: 0.8 + rnd() * 0.5, time: time || (z > 0.7 ? 1 : z < -0.7 ? 2 : 0),
            volta: (Math.atan2(z, x) + 2 * Math.PI) % (2 * Math.PI), par: 0, fone: rnd() < 0.17, cartaz: null, fileira: i };
          if (anterior && !anterior.par && rnd() < 0.5) { anterior.par = -vizinho; eu.par = vizinho; }     // dois vizinhos que conversam: cada um vira para o outro
          torcida.lugares.push(anterior = eu);
        }
      }
      // a mureta: do lado da quadra, o nome do torneio (as faces de uma caixa vêm na ordem +x, -x, +y, -y, +z, -z)
      const faces = Array(6).fill(mureta);
      faces[lateral ? (dx < 0 ? 0 : 1) : (dz < 0 ? 4 : 5)] = mat(0xffffff, { roughness: 0.7, map: texturaCanvas(Math.round(comprimento * 150), Math.round(BASE * 150), (c, l, a) => {
        const vezes = Math.max(1, Math.floor(comprimento / 6.5));
        c.fillStyle = '#22344d'; c.fillRect(0, 0, l, a);
        c.fillStyle = '#e9c46a'; c.textAlign = 'center'; c.textBaseline = 'middle';
        for (let i = 0; i < vezes; i++) {
          const meio = (i + 0.5) * l / vezes;
          c.font = `bold ${a * 0.4}px "Arial Black", Arial, sans-serif`;
          c.fillText('OLIMPÍADAS DO BOB', meio, a * 0.5, l / vezes - a * 2.2);
          c.font = `${a * 0.3}px Arial, sans-serif`;
          for (const lado of [-1, 1]) c.fillText('★', meio + lado * (l / vezes / 2 - a * 0.6), a * 0.5);
        }
      }) });
      malha(g, new T.BoxGeometry(lateral ? 0.06 : comprimento, BASE, lateral ? comprimento : 0.06), faces, ox - dx * 0.03, BASE / 2, oz - dz * 0.03);
    }
    arquibancada(-5.75, 0, -1, 0, 13.8, 5, 0);   // na lateral
    arquibancada(0, 7.5, 0, 1, 9.8, 4, 1);       // atrás do jogador 1
    arquibancada(0, -7.5, 0, -1, 9.8, 4, 2);     // atrás do jogador 2
    fazSombra(g);

    const n = torcida.lugares.length, cor = new T.Color(), branco = new T.Color(0xffffff), preto = new T.Color(0x1a1a1a);
    torcida.corpos = new T.InstancedMesh(caixaSuave(0.38, 0.5, 0.28, 0.09), mat(0xffffff, { roughness: 0.8 }), n);
    torcida.cabecas = new T.InstancedMesh(new T.SphereGeometry(0.13, 12, 10), mat(0xffffff, { roughness: 0.7 }), n);
    const NEUTRAS = [0xf4f1ea, 0xe8c547, 0xd6453d, 0x4a78c2, 0x8a5fbf, 0x3b3f46, 0x7fc56b], PELES = [0xf1c9a5, 0xe0ac86, 0xc68e63, 0x9a6a45, 0x6f4a31];
    torcida.bracos = new T.InstancedMesh(caixaSuave(0.09, 0.32, 0.09, 0.03), mat(0xffffff, { roughness: 0.7 }), n * 2);
    torcida.lugares.forEach((p, i) => {
      if (p.time && rnd() < 0.72) cor.setHex(COR[p.time]).lerp(rnd() < 0.5 ? branco : preto, rnd() * 0.3);   // a camisa do time
      else cor.setHex(NEUTRAS[Math.floor(rnd() * NEUTRAS.length)]);
      torcida.corpos.setColorAt(i, cor);
      torcida.cabecas.setColorAt(i, cor.setHex(PELES[Math.floor(rnd() * PELES.length)]));
      torcida.bracos.setColorAt(2 * i, cor); torcida.bracos.setColorAt(2 * i + 1, cor);
      if (p.fone) { p.fone = torcida.comFone.length + 1; torcida.comFone.push(p); }
    });
    torcida.celulares = new T.InstancedMesh(new T.BoxGeometry(0.075, 0.14, 0.02), mat(0x15181c, { roughness: 0.3 }), torcida.comFone.length);
    for (const m of [torcida.corpos, torcida.cabecas, torcida.bracos, torcida.celulares]) { m.castShadow = m.receiveShadow = true; m.frustumCulled = false; cena.add(m); }
    // os flashes: uns poucos claroes que pulam de um celular para outro
    const texFlash = texturaCanvas(64, 64, (c, l) => {
      const r = c.createRadialGradient(l / 2, l / 2, 0, l / 2, l / 2, l / 2);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(235,245,255,0.7)'); r.addColorStop(1, 'rgba(200,225,255,0)');
      c.clearRect(0, 0, l, l); c.fillStyle = r; c.fillRect(0, 0, l, l);
    });
    for (let i = 0; i < 18; i++) {
      const s = new T.Sprite(new T.SpriteMaterial({ map: texFlash, blending: T.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
      s.visible = false;
      cena.add(s);
      torcida.claroes.push({ s, vida: 0 });
    }
    // os cartazes: alguns torcedores, da segunda fileira para cima, seguram um por cima da cabeça
    const candidatos = torcida.lugares.filter(p => p.fileira >= 1 && !p.fone);
    for (let i = 0; i < 9; i++) {
      const p = candidatos[Math.floor((i + 0.5) * candidatos.length / 9)], tela = document.createElement('canvas');
      tela.width = 256; tela.height = 144;
      const textura = new T.CanvasTexture(tela), grupo = new T.Group();
      textura.colorSpace = T.SRGBColorSpace;
      malha(grupo, new T.PlaneGeometry(0.78, 0.44), mat(0xffffff, { map: textura, roughness: 0.8 }), 0, 0, -0.012).rotation.y = Math.PI;   // a frente dele é o -z, como a do torcedor
      malha(grupo, new T.PlaneGeometry(0.78, 0.44), mat(0xcdb892, { roughness: 0.9 }), 0, 0, 0.012);
      cena.add(grupo);
      p.cartaz = { grupo, tela, textura, n: i };
      torcida.cartazes.push(p);
    }
  })();
  // O que está escrito em cada cartaz: o de quem torce por um jogador leva o nome de guerra dele.
  function escreverCartazes() {
    const SOLTOS = ['PÓ PÓ PÓ!', 'TÔ NA TV!', 'OI, MÃE!', 'QUE JOGÃO!'];
    for (const p of torcida.cartazes) {
      const c = p.cartaz, g = c.tela.getContext('2d'), nome = p.time && jog[p.time] && jog[p.time].nome;
      const linhas = nome ? [c.n % 2 ? 'VAI,' : 'DÁ-LHE,', nome.toUpperCase() + '!'] : [SOLTOS[c.n % SOLTOS.length]];
      g.fillStyle = p.time ? COR_CSS[p.time] : '#fff7d6'; g.fillRect(0, 0, 256, 144);
      g.strokeStyle = '#20262c'; g.lineWidth = 8; g.strokeRect(4, 4, 248, 136);
      g.fillStyle = p.time ? '#ffffff' : '#20262c'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `bold ${linhas.length > 1 ? 50 : 44}px "Arial Black", Arial, sans-serif`;
      linhas.forEach((texto, i) => g.fillText(texto, 128, linhas.length > 1 ? 46 + i * 56 : 74, 228));
      c.textura.needsUpdate = true;
    }
  }
  // Põe cada torcedor no seu lugar, do jeito que ele está agora (ver o comentário lá em cima).
  function moverTorcida(dt) {
    const t = torcida, m = t.m, m2 = t.m2, m3 = t.m3, q = t.q;
    t.animo = Math.max(fim ? 0.7 : 0, t.animo - dt * 0.4);       // no fim do jogo, a festa de quem venceu continua
    t.palmas = Math.max(0, t.palmas - dt * 0.45);
    t.flashes = Math.max(0, t.flashes - dt * 0.8);
    const noAr = objetos.find(o => o.estado === 'voo');
    t.tensao += ((noAr ? 1 : 0) - t.tensao) * Math.min(1, dt * 3);
    // a ola: quando os jogadores demoram a jogar, a torcida se distrai
    if (!parado && valendo() && !fim && tempo > t.proximaOla && t.animo < 0.05 && Date.now() - aberta > 6000) { t.ola = tempo; t.proximaOla = tempo + 20 + t.sorte() * 16; }
    const frente = (tempo - t.ola) * 2.4 + 0.5;                  // por onde a ola vai passando, em radianos em volta da quadra
    // para onde a torcida olha: o objeto que está no ar ou, sem nenhum, o meio dos dois jogadores
    const fx = noAr ? noAr.grupo.position.x : (jog[1].vis.x + jog[2].vis.x) / 2, fz = noAr ? noAr.grupo.position.z : (jog[1].vis.z + jog[2].vis.z) / 2;
    t.lugares.forEach((p, i) => {
      let festa = 0, lamento = 0, palmas = 0, ola = 0, fala = 0, foto = 0, olha = 0, pulo = 0;
      if (!parado) {
        const meu = !p.time || p.time === t.lado, d = frente - p.volta;
        festa = meu ? t.animo : 0;
        lamento = meu ? 0 : Math.min(1, t.animo * 1.5);
        palmas = !p.time || p.time === t.quemAplaude ? Math.min(1, t.palmas * 1.5) * (1 - festa) : 0;
        ola = d > 0 && d < 1.1 ? Math.sin(d / 1.1 * Math.PI) * (1 - festa) : 0;
        if (p.par && festa + lamento + palmas + ola + t.tensao < 0.05) fala = limitar((Math.sin(tempo * 0.21 * p.pressa + p.fase) - 0.5) * 4, 0, 1);
        if (p.fone) foto = limitar(Math.max(t.tensao, t.flashes, fim ? 0.7 : 0) * 1.5 - (p.fase % 1) * 0.5, 0, 1) * (1 - lamento);
        const rumo = Math.atan2(-(fx - p.x), -(fz - p.z)) - p.giro;
        olha = limitar(Math.atan2(Math.sin(rumo), Math.cos(rumo)), -0.5, 0.5) * 0.8 * (1 - fala);
        pulo = festa > 0.05 ? Math.max(0, Math.sin(tempo * 9 * p.pressa + p.fase)) * 0.36 * festa : Math.max(0, Math.sin(tempo * 2.2 * p.pressa + p.fase)) * 0.02;
      }
      const sobe = pulo + ola * 0.26, cartaz = p.cartaz;
      // o corpo: vira para o vizinho ou para o lance; inclina para trás no lamento e para a frente na tensão
      q.setFromEuler(t.e.set(lamento * 0.2 - t.tensao * 0.1 * (parado ? 0 : 1) - palmas * 0.06, p.giro + olha + fala * p.par * 0.8, 0));
      m.compose(t.p.set(p.x, p.y + 0.25 + sobe, p.z), q, t.um);
      t.corpos.setMatrixAt(i, m);
      t.v.set(0, 0.38 + (fala ? Math.sin(tempo * 7 + p.fase) * 0.012 : 0), lamento * 0.04).applyQuaternion(q).add(t.p);
      t.cabecas.setMatrixAt(i, m2.makeTranslation(t.v.x, t.v.y, t.v.z));
      for (const lado of [-1, 1]) {
        // cada braço: quanto sobe (para a frente e para cima) e quanto abre ou fecha
        const acena = Math.sin(tempo * 11 * p.pressa + p.fase + lado), comFone = lado > 0 && foto > 0;
        let sobeB = 0.15 + festa * (2.7 + acena * 0.3) + ola * 2.8 + lamento * 2.5 + palmas * 1.15 + (fala && lado === p.par ? 0.5 + acena * 0.25 : 0);
        let abre = 0.06 + festa * 0.3 - lamento * 0.6 - palmas * (0.42 + 0.3 * Math.sin(tempo * 17 + p.fase));
        if (comFone) { sobeB += foto * 1.75 * (1 - festa); abre -= foto * 0.28; }
        if (cartaz && !parado) { sobeB = 2.85; abre = 0.28; }
        m2.makeRotationFromEuler(t.e2.set(Math.min(3.05, sobeB), 0, abre * lado)).setPosition(lado * 0.23, 0.17, 0).premultiply(m);
        t.bracos.setMatrixAt(2 * i + (lado > 0 ? 1 : 0), m3.makeTranslation(0, -0.14, 0).premultiply(m2));
        if (lado > 0 && p.fone) {                // o celular vai na mão direita
          t.celulares.setMatrixAt(p.fone - 1, m3.makeTranslation(0, -0.34, -0.03).premultiply(m2));
          p.fx = m3.elements[12]; p.fy = m3.elements[13]; p.fz = m3.elements[14]; p.filmando = foto > 0.6;
        }
      }
      if (cartaz) {
        cartaz.grupo.visible = !parado;          // (na imagem das iAs, sem cartazes: eles tapariam a vista)
        cartaz.grupo.quaternion.copy(q);
        cartaz.grupo.position.copy(t.v.set(0, 0.92 + festa * 0.1 + Math.sin(tempo * 3 + p.fase) * 0.02, -0.05).applyQuaternion(q).add(t.p));
      }
    });
    for (const malhaT of [t.corpos, t.cabecas, t.bracos, t.celulares]) malhaT.instanceMatrix.needsUpdate = true;
    // os flashes: mais quando há um objeto no ar, muitos na hora de uma pancada
    t.conta += dt * (0.3 + t.tensao * 2 + Math.min(1.6, t.flashes) * 9 + (fim ? 1.5 : 0));
    for (const c of t.claroes) {
      if (c.vida > 0) { c.vida -= dt; c.s.scale.setScalar(0.5 + c.vida * 8); }
      else if (t.conta >= 1 && !parado && t.comFone.length) {
        const p = t.comFone[Math.floor(t.sorte() * t.comFone.length)];
        if (!p.filmando) continue;
        t.conta -= 1; c.vida = 0.11;
        c.s.position.set(p.fx, p.fy, p.fz);
      }
      c.s.visible = c.vida > 0 && !parado;
    }
    t.conta = Math.min(t.conta, 3);
  }
  // Saiu ponto: a torcida de quem marcou comemora — pula, joga confete — e ouve-se o grito dela.
  function festejar(time) {
    torcida.animo = 1; torcida.lado = time; torcida.flashes = 2;
    for (const [x, z] of [[-6.8, 3.2 * (time === 1 ? 1 : -1)], [-2, 9 * (time === 1 ? 1 : -1)], [2, 9 * (time === 1 ? 1 : -1)]])
      particulas.soltar('confete', x, 3.4, z, 0, 0, [COR[time], 0xffffff, 0xffd83a], 22);
    if (som.kit && nivelDoSom('efeitos') && som.kit.ctx.state === 'running') aplauso(som.kit.fx, som.kit.ctx.currentTime + 0.05);
  }
  // Uma defesa: palmas da torcida de quem defendeu.
  function aplaudir(time) {
    torcida.palmas = 1; torcida.quemAplaude = time; torcida.flashes = Math.max(torcida.flashes, 0.8);
    tocar('palmas');
  }

  // ---------- objetos ----------
  // Cada tipo sabe se montar (em torno da origem, deitado como fica no chão), a que altura o
  // centro fica quando está no chão e o que "grita" quando acerta alguém.
  const ESCALA = 1.35;                          // maiores que na vida real: é para ver de longe (e rir)
  const TIPOS = [
    { nome: 'frango de borracha', grito: 'QUÉÉÉ!', y: 0.11, raio: 0.42, fazer(g) {
      const amarelo = mat(0xf2c12e, { roughness: 0.45 }), laranja = mat(0xf28a1f, { roughness: 0.5 }), vermelho = mat(0xd6382e, { roughness: 0.5 });
      malha(g, new T.SphereGeometry(0.11, 20, 14), amarelo, 0, 0, 0).scale.set(1.9, 1, 1);
      malha(g, new T.CylinderGeometry(0.045, 0.06, 0.18, 12), amarelo, 0.25, 0.02, 0).rotation.z = -Math.PI / 2;
      malha(g, new T.SphereGeometry(0.07, 16, 12), amarelo, 0.36, 0.03, 0);
      malha(g, new T.ConeGeometry(0.03, 0.09, 10), laranja, 0.45, 0.02, 0).rotation.z = -Math.PI / 2;
      for (const x of [0.33, 0.37, 0.41]) malha(g, new T.SphereGeometry(0.026, 10, 8), vermelho, x, 0.1, 0);
      malha(g, new T.SphereGeometry(0.024, 10, 8), vermelho, 0.42, -0.03, 0);
      for (const z of [-0.055, 0.055]) {
        malha(g, new T.SphereGeometry(0.013, 8, 6), M.escuro, 0.39, 0.05, z);
        malha(g, new T.CylinderGeometry(0.014, 0.014, 0.22, 8), laranja, -0.3, -0.02, z * 0.8).rotation.z = Math.PI / 2;
        malha(g, new T.SphereGeometry(0.035, 10, 8), laranja, -0.42, -0.02, z * 0.8).scale.set(1.3, 0.4, 1);
      }
    } },
    { nome: 'peixe', grito: 'PLOFT!', y: 0.055, raio: 0.36, fazer(g) {
      const azul = mat(0x5aa7d6, { roughness: 0.25 }), claro = mat(0xcfe6f2, { roughness: 0.3 });
      malha(g, new T.SphereGeometry(0.11, 20, 14), azul, 0, 0, 0).scale.set(2.2, 0.5, 1);
      malha(g, new T.SphereGeometry(0.09, 16, 12), claro, 0.02, -0.012, 0).scale.set(2.0, 0.4, 0.9);
      const rabo = malha(g, new T.ConeGeometry(0.12, 0.18, 4), azul, -0.31, 0, 0);
      rabo.rotation.z = -Math.PI / 2; rabo.scale.set(0.25, 1, 1);   // a ponta para o corpo, achatado como uma nadadeira
      malha(g, new T.ConeGeometry(0.05, 0.1, 4), azul, -0.02, 0.01, -0.12).rotation.x = -Math.PI / 2;
      malha(g, new T.SphereGeometry(0.026, 10, 8), M.branco, 0.15, 0.045, 0.045);
      malha(g, new T.SphereGeometry(0.014, 8, 6), M.escuro, 0.16, 0.062, 0.05);
    } },
    { nome: 'banana', grito: 'POF!', y: 0.05, raio: 0.34, fazer(g) {
      const b = malha(g, new T.TorusGeometry(0.2, 0.048, 10, 22, 2.2), mat(0xffd83a, { roughness: 0.5 }), 0, 0, 0);
      b.rotation.x = Math.PI / 2; b.position.set(-0.05, 0, -0.1);   // o arco deitado no chão, mais ou menos centrado
      for (const a of [0, 2.2]) malha(g, new T.SphereGeometry(0.034, 10, 8), mat(0x4a3220, { roughness: 0.7 }), -0.05 + 0.2 * Math.cos(a), 0, -0.1 + 0.2 * Math.sin(a));
    } },
    { nome: 'pizza', grito: 'NHAC!', y: 0.02, raio: 0.36, fazer(g) {
      const cobertura = texturaCanvas(256, 256, (c, l) => {
        const rnd = aleatorio(8);
        c.fillStyle = '#c98a3c'; c.fillRect(0, 0, l, l);
        c.fillStyle = '#c0392b'; c.beginPath(); c.arc(l / 2, l / 2, l * 0.45, 0, 7); c.fill();
        c.fillStyle = '#f6cf5a'; c.beginPath(); c.arc(l / 2, l / 2, l * 0.42, 0, 7); c.fill();
        for (let i = 0; i < 9; i++) {
          const a = i * 0.7 + rnd(), r = (0.12 + 0.24 * rnd()) * l;
          c.fillStyle = '#b3261e'; c.beginPath(); c.arc(l / 2 + Math.cos(a) * r, l / 2 + Math.sin(a) * r, l * 0.05, 0, 7); c.fill();
        }
        c.strokeStyle = 'rgba(160,110,40,0.7)'; c.lineWidth = 3;
        for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(l / 2 - Math.cos(i * 0.785) * l * 0.45, l / 2 - Math.sin(i * 0.785) * l * 0.45); c.lineTo(l / 2 + Math.cos(i * 0.785) * l * 0.45, l / 2 + Math.sin(i * 0.785) * l * 0.45); c.stroke(); }
      });
      const massa = mat(0xc98a3c, { roughness: 0.8 });
      malha(g, new T.CylinderGeometry(0.26, 0.26, 0.04, 28), [massa, mat(0xffffff, { map: cobertura, roughness: 0.6 }), massa], 0, 0, 0);
    } },
    { nome: 'torta', grito: 'SPLAT!', y: 0.04, raio: 0.32, lambuza: true, fazer(g) {
      const creme = mat(0xfffaf0, { roughness: 0.4 });
      malha(g, new T.CylinderGeometry(0.2, 0.15, 0.08, 24), mat(0xaeb4ba, { roughness: 0.35, metalness: 0.4 }), 0, 0, 0);
      malha(g, new T.SphereGeometry(0.19, 20, 12), creme, 0, 0.04, 0).scale.set(1, 0.5, 1);
      malha(g, new T.ConeGeometry(0.08, 0.11, 14), creme, 0, 0.16, 0);
      malha(g, new T.SphereGeometry(0.038, 12, 10), mat(0xd6232e, { roughness: 0.3 }), 0, 0.225, 0);
    } },
    { nome: 'pato de borracha', grito: 'QUACK!', y: 0.125, raio: 0.34, fazer(g) {
      const amarelo = mat(0xffd21f, { roughness: 0.35 });
      malha(g, new T.SphereGeometry(0.14, 20, 14), amarelo, 0, 0, 0).scale.set(1.25, 0.9, 1);
      malha(g, new T.SphereGeometry(0.092, 18, 12), amarelo, 0.1, 0.16, 0);
      malha(g, new T.SphereGeometry(0.048, 12, 8), mat(0xf28a1f, { roughness: 0.4 }), 0.195, 0.145, 0).scale.set(1.4, 0.5, 1.1);
      malha(g, new T.ConeGeometry(0.05, 0.11, 10), amarelo, -0.17, 0.07, 0).rotation.z = 0.9;
      for (const z of [-0.055, 0.055]) malha(g, new T.SphereGeometry(0.015, 8, 6), M.escuro, 0.155, 0.19, z);
    } },
    { nome: 'desentupidor', grito: 'PLOC!', y: 0.09, raio: 0.4, fazer(g) {
      const d = new T.Group();
      d.rotation.z = 0.19;                      // deitado: a ponta do cabo e a beirada da ventosa encostam no chão
      g.add(d);
      malha(d, new T.CylinderGeometry(0.02, 0.02, 0.5, 10), mat(0xb07f4a, { roughness: 0.7 }), -0.13, 0, 0).rotation.z = Math.PI / 2;
      const ventosa = malha(d, new T.CylinderGeometry(0.055, 0.135, 0.12, 22, 1, true), mat(0xc0392b, { roughness: 0.5, side: T.DoubleSide }), 0.17, 0, 0);
      ventosa.rotation.z = Math.PI / 2;
      malha(d, new T.SphereGeometry(0.057, 14, 10), mat(0xc0392b, { roughness: 0.5 }), 0.115, 0, 0);
    } },
    { nome: 'chinelo', grito: 'PAFT!', y: 0.025, raio: 0.34, fazer(g) {
      const tira = mat(0x1565a8, { roughness: 0.5 });
      malha(g, caixaSuave(0.38, 0.04, 0.16, 0.018), mat(0x1f9bd1, { roughness: 0.7 }), 0, 0, 0);
      malha(g, caixaSuave(0.37, 0.012, 0.15, 0.005), mat(0xf7f3e8, { roughness: 0.8 }), 0, 0.024, 0);
      malha(g, new T.CylinderGeometry(0.012, 0.012, 0.06, 8), tira, 0.09, 0.05, 0);
      for (const lado of [-1, 1]) {
        const t = malha(g, new T.BoxGeometry(0.19, 0.016, 0.028), tira, 0.005, 0.066, lado * 0.036);
        t.rotation.y = lado * 0.42; t.rotation.z = 0.12;
      }
    } },
    // Os escudos (um de cada lado): não se arremessam. Vão na mão esquerda e, com a guarda
    // levantada, defendem o que vem de frente — uma vez; depois saem voando.
    { nome: 'tampa de panela', escudo: true, y: 0.015, raio: 0.34, fazer(g) {
      const aco = mat(0xcfd4d9, { roughness: 0.25, metalness: 0.35 });
      malha(g, new T.CylinderGeometry(0.25, 0.26, 0.03, 30), aco, 0, 0, 0);
      malha(g, new T.SphereGeometry(0.24, 26, 10, 0, Math.PI * 2, 0, Math.PI / 2), aco, 0, 0.012, 0).scale.y = 0.22;
      malha(g, new T.CylinderGeometry(0.02, 0.028, 0.05, 12), M.escuro, 0, 0.085, 0);
      malha(g, new T.SphereGeometry(0.04, 14, 10), M.escuro, 0, 0.125, 0);
    } },
    { nome: 'tampa de lixeira', escudo: true, y: 0.02, raio: 0.36, fazer(g) {
      const lata = mat(0x6f8f7b, { roughness: 0.5, metalness: 0.2 }), escuro = mat(0x3f5547, { roughness: 0.6 });
      malha(g, new T.CylinderGeometry(0.27, 0.29, 0.04, 26), lata, 0, 0, 0);
      malha(g, new T.CylinderGeometry(0.2, 0.26, 0.035, 26), lata, 0, 0.036, 0);
      for (const r of [0.12, 0.2]) malha(g, new T.TorusGeometry(r, 0.01, 6, 28), escuro, 0, 0.056, 0).rotation.x = Math.PI / 2;
      for (const x of [-0.07, 0.07]) malha(g, new T.CylinderGeometry(0.012, 0.012, 0.07, 8), escuro, x, 0.09, 0);
      malha(g, new T.CylinderGeometry(0.014, 0.014, 0.17, 8), escuro, 0, 0.125, 0).rotation.z = Math.PI / 2;
    } },
  ];
  // O jeito de cada objeto no ar e no chão. eixo e vel: em torno de que eixo ele roda no ar e
  // a quantos radianos por segundo (z: cambalhota para a frente; x: parafuso; y: deitado, como
  // um disco). incl: como ele se inclina no ar (a torta vai com o creme para a frente).
  // quique: quanto da altura ele recupera a cada batida no chão. mole: quanto amassa e estica.
  // moeda: ao parar, bamboleia como uma moeda. resto: as cores e o tipo do que voa dele quando
  // acerta alguém (ver particulas). som: o barulho da pancada (ver tocar).
  const FISICA = {
    'frango de borracha': { eixo: 'z', vel: 11, quique: 0.55, mole: 1, resto: [0xfff3c4, 0xf2c12e, 'pena'], som: 'guincho' },
    'peixe': { eixo: 'x', vel: 13, quique: 0.22, mole: 0.6, resto: [0x9fd4f2, 0xe8f6ff, 'gota'], som: 'ploft' },
    'banana': { eixo: 'y', vel: 16, quique: 0.35, mole: 0.3, resto: [0xffd83a, 0xfff2a8, 'lasca'], som: 'paft' },
    'pizza': { eixo: 'y', vel: 12, quique: 0.1, mole: 0.15, resto: [0xc0392b, 0xf6cf5a, 'lasca'], som: 'ploft' },
    'torta': { eixo: 'x', vel: 2.5, incl: -Math.PI / 2, quique: 0.08, mole: 0.3, resto: [0xfffaf0, 0xffffff, 'creme'], som: 'ploft' },
    'pato de borracha': { eixo: 'z', vel: 9, quique: 0.65, mole: 1, resto: [0xffd21f, 0xfff3c4, 'pena'], som: 'guincho' },
    'desentupidor': { eixo: 'x', vel: 14, quique: 0.3, mole: 0.2, resto: [0xc0392b, 0xb07f4a, 'lasca'], som: 'paft' },
    'chinelo': { eixo: 'y', vel: 18, quique: 0.35, mole: 0.3, resto: [0x1f9bd1, 0xf7f3e8, 'lasca'], som: 'paft' },
    'tampa de panela': { eixo: 'y', vel: 14, quique: 0.4, mole: 0, moeda: true, resto: [0xfff6c0, 0xffffff, 'faisca'], som: 'clang' },
    'tampa de lixeira': { eixo: 'y', vel: 12, quique: 0.35, mole: 0, moeda: true, resto: [0xfff6c0, 0xffffff, 'faisca'], som: 'clang' },
  };
  // Onde os objetos aparecem: em semicírculo à frente de onde o robô começa, a RODA metros
  // dele — o escudo bem em frente e os quatro de arremessar a 45° e a 90° para cada lado (cada
  // um fica numa das oito direções para as quais o robô vira). A disposição é a mesma vista
  // por cada jogador.
  const VAGAS = [-90, -45, 45, 90, 0].map(graus => { const a = graus * Math.PI / 180; return [RODA * Math.sin(a), INICIO - RODA * Math.cos(a)]; });
  // O risco que o objeto deixa no ar: duas tiras cruzadas atrás dele, claras na ponta de cá.
  const texRastro = texturaCanvas(128, 32, (g, l, a) => {
    g.clearRect(0, 0, l, a);
    const ao = g.createLinearGradient(0, 0, l, 0);
    ao.addColorStop(0, 'rgba(255,255,255,0)'); ao.addColorStop(1, 'rgba(255,255,255,0.9)');
    g.fillStyle = ao; g.fillRect(0, 0, l, a);
    const fino = g.createLinearGradient(0, 0, 0, a);
    fino.addColorStop(0, 'rgba(0,0,0,0)'); fino.addColorStop(0.5, 'rgba(0,0,0,1)'); fino.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-in'; g.fillStyle = fino; g.fillRect(0, 0, l, a);
  });
  const objetos = TIPOS.map((tipo, i) => {
    const grupo = new T.Group(), miolo = new T.Group(), rastro = new T.Group();
    const matRastro = new T.MeshBasicMaterial({ map: texRastro, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, toneMapped: false, fog: false });
    for (const deitada of [true, false]) {
      const tira = new T.Mesh(new T.PlaneGeometry(1.3, 0.34), matRastro);
      tira.position.x = -0.78;                  // o objeto voa com o +x dele para a frente (ver resolver)
      if (deitada) tira.rotation.x = -Math.PI / 2;
      rastro.add(tira);
    }
    rastro.visible = false;
    grupo.add(miolo, rastro);
    tipo.fazer(miolo);
    miolo.scale.setScalar(ESCALA);
    fazSombra(miolo);
    const casca = malha(grupo, new T.SphereGeometry(tipo.raio * ESCALA * 0.72, 20, 12), M.contorno, 0, 0, 0);   // borda de destaque: uma bolha achatada
    casca.scale.y = 0.6;
    casca.visible = false;
    const sombra = sombraNoChao(grupo, tipo.raio * ESCALA * 0.8);
    sombra.position.y = 0.006 - tipo.y * ESCALA;             // no chão, debaixo do objeto
    cena.add(grupo);
    // vis: o que só o desenho usa — o ângulo em que está rodando, a inclinação, o quanto está
    // amassado e há quanto tempo bamboleia (-1 = não está)
    return { i, tipo, nome: tipo.nome, fisica: FISICA[tipo.nome], grupo, miolo, casca, sombra, rastro, matRastro, x: 0, z: 0, estado: 'chao', dono: 0, dir: null, voado: 0, lancado: 0, anim: null,
      vis: { ang: 0, incl: 0, amassa: 0, treme: -1 } };
  });

  // ---------- estilhaços ----------
  // O que voa quando um objeto bate: penas, creme, gotas, lascas, faíscas e a poeira do chão.
  // São bolinhas (achatadas, no caso das penas) desenhadas todas de uma vez; cada uma tem
  // velocidade, peso e tempo de vida. É só enfeite: não entra na imagem que vai para a iA.
  const JEITOS = {
    pena: { n: 16, vel: 2.6, sobe: 2.6, peso: 3.2, freio: 2.2, vida: 1.5, tam: 0.13, chato: 0.22 },
    creme: { n: 18, vel: 3.2, sobe: 2.8, peso: 9, freio: 0.4, vida: 0.9, tam: 0.09, chato: 1 },
    gota: { n: 16, vel: 3.4, sobe: 3.2, peso: 9, freio: 0.2, vida: 0.8, tam: 0.07, chato: 1 },
    lasca: { n: 12, vel: 3.2, sobe: 2.8, peso: 9, freio: 0.3, vida: 0.8, tam: 0.08, chato: 0.5 },
    faisca: { n: 18, vel: 5.5, sobe: 2.6, peso: 6, freio: 1.2, vida: 0.4, tam: 0.06, chato: 1 },
    poeira: { n: 6, vel: 1.4, sobe: 0.5, peso: -0.5, freio: 3, vida: 0.5, tam: 0.17, chato: 0.5 },
    brilho: { n: 10, vel: 1.3, sobe: 2.4, peso: 2, freio: 1.6, vida: 0.75, tam: 0.07, chato: 1 },
    bolha: { n: 4, vel: 0.25, sobe: 0.9, peso: -0.4, freio: 0.6, vida: 1.5, tam: 0.11, chato: 1 },
    confete: { n: 26, vel: 2.4, sobe: 4.4, peso: 2.6, freio: 1.6, vida: 2.6, tam: 0.09, chato: 0.15 },
  };
  const particulas = (() => {
    const N = 220, malhaP = new T.InstancedMesh(new T.SphereGeometry(0.5, 10, 8), mat(0xffffff, { roughness: 0.6 }), N);
    const lista = [], m = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), p = new T.Vector3(), s = new T.Vector3(), cor = new T.Color(), rnd = aleatorio(7);
    for (let i = 0; i < N; i++) { lista.push({ vida: 0 }); malhaP.setMatrixAt(i, m.makeScale(0, 0, 0)); malhaP.setColorAt(i, cor.set(0xffffff)); }
    malhaP.frustumCulled = false;
    cena.add(malhaP);
    let vez = 0;
    return {
      malha: malhaP, vivas: 0,
      // solta um punhado em (x, y, z); (dx, dz) é para onde ia o que bateu: os estilhaços voltam um pouco
      soltar(jeito, x, y, z, dx, dz, cores, quantos) {
        const j = JEITOS[jeito];
        for (let i = 0; i < (quantos || j.n); i++) {
          const a = rnd() * 6.283, v = j.vel * (0.35 + rnd() * 0.65), pt = lista[vez];
          Object.assign(pt, { x, y, z, vx: Math.cos(a) * v - dx * j.vel * 0.35, vy: j.sobe * (0.35 + rnd() * 0.65), vz: Math.sin(a) * v - dz * j.vel * 0.35,
            vida: j.vida * (0.6 + rnd() * 0.4), total: j.vida, j, giro: rnd() * 6.283, roda: (rnd() - 0.5) * 14 });
          malhaP.setColorAt(vez, cor.set(cores[i % cores.length]));
          vez = (vez + 1) % N;
        }
        malhaP.instanceColor.needsUpdate = true;
      },
      mover(dt) {
        let vivas = 0;
        lista.forEach((pt, i) => {
          if (pt.vida <= 0) return;
          pt.vida -= dt;
          if (pt.vida <= 0) { malhaP.setMatrixAt(i, m.makeScale(0, 0, 0)); return; }
          vivas++;
          const j = pt.j, freio = Math.exp(-j.freio * dt);
          pt.vy -= j.peso * dt;
          pt.vx *= freio; pt.vz *= freio; if (j.freio > 1) pt.vy *= freio;
          pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.z += pt.vz * dt;
          if (pt.y < 0.03) { pt.y = 0.03; pt.vy = -pt.vy * 0.25; pt.vx *= 0.5; pt.vz *= 0.5; pt.roda *= 0.4; }
          pt.giro += pt.roda * dt;
          const t = j.tam * Math.min(1, pt.vida / 0.25) * (j.peso < 0 ? 2 - pt.vida / pt.total : 1);     // a poeira cresce enquanto some
          m.compose(p.set(pt.x, pt.y, pt.z), q.setFromEuler(e.set(pt.giro, pt.giro * 0.7, 0)), s.set(t, t * j.chato, t));
          malhaP.setMatrixAt(i, m);
        });
        if (vivas || this.vivas) malhaP.instanceMatrix.needsUpdate = true;
        this.vivas = vivas;
      },
    };
  })();

  // ---------- enfeites do cenário ----------
  // Nada disto entra no jogo: é só para a quadra parecer um lugar. Longe: nuvens, morros e
  // uma névoa leve. Perto: refletores nos cantos, bandeiras no alto das arquibancadas (que
  // balançam) e a mascote — uma galinha de borracha gigante em cima do placar.
  const bandeiras = [];
  cena.fog = new T.Fog(0x8f7c9e, 50, 128);      // a névoa do entardecer, que funde os morros com o horizonte
  (() => {
    const longe = new T.Group(), perto = new T.Group(), rnd = aleatorio(99);
    cena.add(longe, perto);
    const nuvem = mat(0xe9c9cf, { roughness: 1, emissive: 0xff9a6e, emissiveIntensity: 0.38, fog: false, envMapIntensity: 0 });   // rosadas, acesas pelo sol baixo
    for (const [x, y, z, s] of [[-34, 21, -26, 3], [-42, 27, 12, 4.2], [-22, 31, 38, 3.4], [22, 25, -44, 3.6], [-52, 19, -6, 2.6], [6, 29, 48, 4], [-30, 34, -52, 4.6]])
      for (const [dx, dy, dz, r] of [[0, 0, 0, 1], [1.15, -0.12, 0.2, 0.8], [-1.15, -0.16, -0.1, 0.75], [0.45, 0.36, -0.3, 0.7], [-0.5, 0.3, 0.3, 0.62], [2.0, -0.25, 0, 0.5]])
        malha(longe, new T.SphereGeometry(r * s, 14, 10), nuvem, x + dx * s, y + dy * s, z + dz * s).scale.y = 0.62;
    for (let i = 0; i < 16; i++) {                // morros: uma roda de calombos verdes no horizonte
      const a = i / 16 * Math.PI * 2 + rnd() * 0.2, d = 62 + rnd() * 22, r = 12 + rnd() * 12;
      malha(longe, new T.SphereGeometry(r, 18, 10), mat(i % 3 ? 0x36604c : 0x436f58, { roughness: 1, envMapIntensity: 0.2 }), Math.cos(a) * d, -r * 0.42, Math.sin(a) * d).scale.y = 0.55 + rnd() * 0.25;
    }
    // refletores: um poste alto em cada canto, com o painel de lâmpadas virado para a quadra
    const aceso = luminoso({ color: 0xfff6d8 });
    const texBrilho = texturaCanvas(128, 128, (g, l) => {
      const r = g.createRadialGradient(l / 2, l / 2, 0, l / 2, l / 2, l / 2);
      r.addColorStop(0, 'rgba(255,250,235,1)'); r.addColorStop(0.2, 'rgba(255,240,200,0.55)'); r.addColorStop(1, 'rgba(255,230,170,0)');
      g.fillStyle = r; g.fillRect(0, 0, l, l);
    });
    for (const [x, z] of REFLETORES) {
      const clarao = new T.Sprite(new T.SpriteMaterial({ map: texBrilho, blending: T.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
      clarao.position.set(x * 0.985, 8.5, z * 0.985);
      clarao.scale.setScalar(5.5);
      // O clarão é de quem está na frente do refletor: visto por trás ele não aparece (senão
      // parecia que a luz saía para o lado de fora da quadra).
      const paraAQuadra = new T.Vector3(-x, -8.5, -z).normalize(), olho = new T.Vector3();
      clarao.onBeforeRender = (r, c, camera) => {
        clarao.material.opacity = limitar(olho.setFromMatrixPosition(camera.matrixWorld).sub(clarao.position).normalize().dot(paraAQuadra) * 2.5, 0, 1);
      };
      perto.add(clarao);
      malha(perto, new T.CylinderGeometry(0.1, 0.16, 8.4, 10), M.escuro, x, 4.2, z);
      const painel = new T.Group();
      painel.position.set(x, 8.5, z);
      painel.lookAt(0, 0, 0);
      perto.add(painel);
      malha(painel, new T.BoxGeometry(1.9, 1.0, 0.16), M.escuro, 0, 0, 0);
      for (let i = 0; i < 8; i++) malha(painel, new T.CircleGeometry(0.17, 14), aceso, -0.69 + (i % 4) * 0.46, 0.24 - Math.floor(i / 4) * 0.48, 0.085);
    }
    // bandeiras: no alto de cada arquibancada, na cor do time daquele lado
    const haste = mat(0xe9e6df, { roughness: 0.5 });
    const bandeira = (x, y, z, time, virada) => {
      malha(perto, new T.CylinderGeometry(0.025, 0.025, 1.7, 8), haste, x, y + 0.85, z);
      const eixo = new T.Group();
      eixo.position.set(x, y + 1.42, z);
      perto.add(eixo);
      malha(eixo, new T.PlaneGeometry(0.8, 0.5), mat(COR[time], { roughness: 0.8, side: T.DoubleSide }), 0.42, 0, 0);
      bandeiras.push({ eixo, base: virada, fase: rnd() * 6.28 });
    };
    for (let x = -4.4; x <= 4.4; x += 2.2) { bandeira(x, 2.65, 10.75, 1, 0); bandeira(x, 2.65, -10.75, 2, 0); }
    for (let z = -6.3; z <= 6.3; z += 2.1) bandeira(-9.8, 3.1, z, z > 0 ? 1 : 2, Math.PI / 2);
    fazSombra(perto);
    // a mascote: o frango de borracha, bem grande, deitado em cima do placar
    const mascote = new T.Group();
    TIPOS[0].fazer(mascote);
    mascote.scale.setScalar(3.1);
    mascote.rotation.y = Math.PI / 2;
    mascote.position.set(-5.35, 4.28 + 0.11 * 3.1, 0.15);
    fazSombra(mascote);
    cena.add(mascote);
  })();

  // ---------- o juiz ----------
  // Numa cadeira alta na ponta da rede, do lado da arquibancada, como o juiz de tênis. Ele
  // acompanha o lance com a cabeça e apita: um apito comprido quando a partida começa, um
  // curto a cada ponto (com o braço esticado para o lado de quem marcou) e três no fim.
  const juiz = (() => {
    const g = new T.Group(), figura = new T.Group(), corpo = new T.Group(), cabeca = new T.Group(), bracoD = new T.Group(), bracoE = new T.Group();
    const verde = mat(0x1f5a3d, { roughness: 0.6 }), ASSENTO = 1.55;
    g.position.set(-4.62, 0, 0);
    cena.add(g);
    for (const [x, z] of [[-0.22, -0.24], [0.22, -0.24], [-0.22, 0.24], [0.22, 0.24]]) malha(g, new T.CylinderGeometry(0.03, 0.035, ASSENTO, 8), verde, x, ASSENTO / 2, z);
    for (const y of [0.4, 0.8, 1.2]) malha(g, new T.BoxGeometry(0.04, 0.04, 0.5), verde, 0.22, y, 0);    // os degraus, do lado da quadra
    malha(g, new T.BoxGeometry(0.56, 0.06, 0.6), verde, 0, ASSENTO, 0);
    malha(g, new T.BoxGeometry(0.06, 0.6, 0.6), verde, -0.26, ASSENTO + 0.32, 0);                          // o encosto, de costas para a arquibancada
    figura.position.set(0, ASSENTO + 0.03, 0);
    figura.rotation.y = -Math.PI / 2;            // a frente dele (-z) fica virada para a quadra (+x); o braço direito, para o lado do jogador 1
    g.add(figura); figura.add(corpo);
    const listras = texturaCanvas(64, 64, (c, l) => { c.fillStyle = '#f4f1ea'; c.fillRect(0, 0, l, l); c.fillStyle = '#16181b'; for (let x = 0; x < l; x += 16) c.fillRect(x, 0, 8, l); });
    const camisa = mat(0xffffff, { map: listras, roughness: 0.7 }), pele = mat(0xe0ac86, { roughness: 0.7 }), preto = mat(0x16181b, { roughness: 0.6 });
    malha(corpo, caixaSuave(0.4, 0.5, 0.28, 0.09), camisa, 0, 0.27, 0);
    for (const x of [-0.11, 0.11]) malha(corpo, caixaSuave(0.14, 0.14, 0.4, 0.05), preto, x, 0.06, -0.2);   // as pernas de quem está sentado
    cabeca.position.set(0, 0.66, 0);
    corpo.add(cabeca);
    malha(cabeca, new T.SphereGeometry(0.14, 16, 12), pele, 0, 0, 0);
    malha(cabeca, new T.CylinderGeometry(0.145, 0.145, 0.07, 16), preto, 0, 0.09, 0);                      // o boné
    malha(cabeca, new T.BoxGeometry(0.2, 0.02, 0.14), preto, 0, 0.06, -0.17);
    for (const x of [-0.05, 0.05]) malha(cabeca, new T.SphereGeometry(0.018, 8, 6), preto, x, 0.01, -0.13);
    malha(cabeca, new T.SphereGeometry(0.03, 10, 8), mat(0xd9dde2, { roughness: 0.25, metalness: 0.5 }), 0, -0.06, -0.145);   // o apito, na boca
    for (const [b, lado] of [[bracoD, 1], [bracoE, -1]]) {
      b.position.set(lado * 0.25, 0.44, 0);
      corpo.add(b);
      malha(b, caixaSuave(0.1, 0.36, 0.1, 0.035), camisa, 0, -0.16, 0);
      malha(b, new T.SphereGeometry(0.055, 10, 8), pele, 0, -0.36, 0);
    }
    fazSombra(g);
    const grito = montarGrito();
    grito.escrever('PRIII!');
    grito.sprite.scale.set(1.3, 0.65, 1);
    grito.sprite.position.set(-4.35, ASSENTO + 1.3, 0);
    return { corpo, cabeca, bracoD, bracoE, grito, gesto: '', lado: 0, t: 0, dur: 0, sopros: [] };
  })();
  function apitar(gesto, lado) {
    const sopros = gesto === 'ponto' ? [[0, 0.3]] : gesto === 'inicio' ? [[0, 0.7]] : [[0, 0.22], [0.36, 0.22], [0.72, 0.9]];
    Object.assign(juiz, { gesto, lado, t: 0, dur: gesto === 'ponto' ? 1.4 : gesto === 'inicio' ? 1.6 : 2.6, sopros });
    for (const [quando, dura] of sopros) tocar('apito', dura, quando);
  }
  function moverJuiz(dt) {
    const j = juiz, noAr = objetos.find(o => o.estado === 'voo');
    let soprando = false, gesto = 0;
    if (!parado && j.gesto) {
      j.t += dt;
      if (j.t > j.dur) j.gesto = '';
      else { soprando = j.sopros.some(([quando, dura]) => j.t >= quando && j.t < quando + dura); gesto = Math.min(1, j.t * 6, (j.dur - j.t) * 4); }
    }
    const fz = noAr ? noAr.grupo.position.z : (jog[1].vis.z + jog[2].vis.z) / 2;
    j.cabeca.rotation.y = parado ? 0 : limitar(-Math.atan2(fz, 4.6), -0.9, 0.9);        // segue o lance com a cabeça
    j.corpo.rotation.x = soprando ? -0.14 : 0;
    // os braços: no ponto, o do lado de quem marcou estica para esse lado; no começo, os dois para cima; no fim, os dois abertos
    // antes de a partida valer, ele pergunta se os jogadores estão prontos: os braços meio erguidos e o balão "PRONTOS?"
    const pergunta = !parado && !soprando && presentes() && !valendo() && !fim;
    const abre = j.gesto === 'ponto' || j.gesto === 'fim' ? 1.45 * gesto : 0, sobe = j.gesto === 'inicio' ? 2.9 * gesto : pergunta ? 1.0 + Math.sin(tempo * 3) * 0.12 : 0;
    j.bracoD.rotation.set(0.35 + sobe, 0, j.gesto === 'ponto' && j.lado !== 1 ? 0 : abre);
    j.bracoE.rotation.set(0.35 + sobe, 0, j.gesto === 'ponto' && j.lado !== 2 ? 0 : -abre);
    j.grito.escrever(pergunta ? 'PRONTOS?' : 'PRIII!');
    j.grito.sprite.visible = soprando || pergunta;
  }

  // ---------- a mesa do comentarista ----------
  // Fora da quadra, na ponta da rede do lado da câmera: uma mesa com microfone e monitor e uma
  // cadeira. Quando uma iA entra como comentarista (ver comentar), um robô roxo de fone senta
  // nela, e o nome dele vai na placa das costas da cadeira — que é o que a transmissão vê.
  const cabine = (() => {
    const g = new T.Group(), figura = new T.Group(), cabeca = new T.Group();
    const madeira = mat(0x5b4636, { roughness: 0.7 }), roxo = mat(0x8a5fbf, { roughness: 0.35 }), claro = mat(0xc9b3e6, { roughness: 0.35 });
    g.position.set(5.75, 0, 0);
    cena.add(g);
    malha(g, new T.BoxGeometry(0.7, 0.06, 1.7), madeira, 0, 0.74, 0);
    malha(g, new T.BoxGeometry(0.05, 0.74, 1.7), mat(0x22344d, { roughness: 0.7 }), -0.32, 0.37, 0);
    for (const z of [-0.82, 0.82]) malha(g, new T.BoxGeometry(0.6, 0.74, 0.05), madeira, 0, 0.37, z);
    malha(g, new T.CylinderGeometry(0.012, 0.012, 0.22, 8), M.escuro, -0.08, 0.87, 0.28).rotation.z = 0.5;      // o microfone
    malha(g, new T.SphereGeometry(0.04, 10, 8), M.escuro, -0.14, 0.97, 0.28);
    malha(g, new T.BoxGeometry(0.03, 0.26, 0.42), M.escuro, -0.2, 0.93, -0.38);                                  // o monitor
    malha(g, new T.BoxGeometry(0.46, 0.06, 0.46), M.escuro, 0.62, 0.48, 0);                                      // a cadeira
    malha(g, new T.BoxGeometry(0.06, 0.56, 0.46), M.escuro, 0.84, 0.78, 0);
    malha(g, new T.CylinderGeometry(0.03, 0.03, 0.46, 8), M.escuro, 0.62, 0.24, 0);
    const tela = document.createElement('canvas');
    tela.width = 256; tela.height = 96;
    const textura = new T.CanvasTexture(tela);
    textura.colorSpace = T.SRGBColorSpace;
    malha(g, new T.PlaneGeometry(0.44, 0.165), luminoso({ map: textura }), 0.875, 0.82, 0).rotation.y = Math.PI / 2;
    figura.position.set(0.6, 0.51, 0);
    figura.rotation.y = Math.PI / 2;             // de frente para a quadra (-x)
    g.add(figura);
    malha(figura, caixaSuave(0.44, 0.46, 0.34, 0.1), roxo, 0, 0.26, 0);
    for (const x of [-0.27, 0.27]) malha(figura, caixaSuave(0.11, 0.11, 0.36, 0.04), roxo, x, 0.3, -0.2);        // os braços, em cima da mesa
    cabeca.position.set(0, 0.68, 0);
    figura.add(cabeca);
    malha(cabeca, caixaSuave(0.4, 0.3, 0.34, 0.07), claro, 0, 0, 0);
    const rosto = texturaCanvas(128, 64, c => { c.fillStyle = '#1b2026'; c.fillRect(0, 0, 128, 64); c.fillStyle = '#5fe9ff'; for (const x of [40, 88]) { c.beginPath(); c.arc(x, 32, 12, 0, 7); c.fill(); } });
    malha(cabeca, new T.PlaneGeometry(0.28, 0.14), luminoso({ map: rosto }), 0, 0.01, -0.172).rotation.y = Math.PI;
    malha(cabeca, new T.TorusGeometry(0.2, 0.018, 8, 20, Math.PI), M.escuro, 0, 0.08, 0);                        // o fone: o arco, as conchas e o microfone
    for (const x of [-0.21, 0.21]) malha(cabeca, new T.CylinderGeometry(0.06, 0.06, 0.04, 12), M.escuro, x, 0.02, 0).rotation.z = Math.PI / 2;
    malha(cabeca, new T.CylinderGeometry(0.008, 0.008, 0.18, 6), M.escuro, 0.2, -0.06, -0.09).rotation.x = Math.PI / 2;
    malha(cabeca, new T.SphereGeometry(0.022, 8, 6), M.escuro, 0.2, -0.06, -0.18);
    fazSombra(g);
    figura.visible = false;
    return { figura, cabeca, tela, textura };
  })();

  // ---------- robôs ----------
  // Um robô gorducho, olhando para -z. `eixo` é o que tomba quando ele cai; `corpo` é o que
  // estica e encolhe; `mira` é a borda de destaque que o adversário vê quando está com ele na mira.
  function montarBoneco(n) {
    const grupo = new T.Group(), eixo = new T.Group(), corpo = new T.Group(), mira = new T.Group(), braco = new T.Group(), outro = new T.Group();
    grupo.add(eixo); eixo.add(corpo); corpo.add(mira);
    const cor = mat(COR[n], { roughness: 0.35 }), claro = mat(new T.Color(COR[n]).lerp(new T.Color(0xffffff), 0.4), { roughness: 0.35 });
    const peca = (pai, geo, material, x, y, z, casca) => {
      if (casca) malha(mira, casca, M.contorno, x, y, z);
      return malha(pai, geo, material, x, y, z);
    };
    for (const x of [-0.14, 0.14]) peca(corpo, caixaSuave(0.21, 0.14, 0.3, 0.06), M.escuro, x, 0.07, -0.02);            // pés
    peca(corpo, caixaSuave(0.58, 0.62, 0.46, 0.12), cor, 0, 0.45, 0, caixaSuave(0.65, 0.69, 0.53, 0.15));              // barriga
    peca(corpo, caixaSuave(0.52, 0.38, 0.44, 0.08), claro, 0, 0.97, 0, caixaSuave(0.59, 0.45, 0.51, 0.11));            // cabeça
    peca(corpo, new T.CylinderGeometry(0.014, 0.014, 0.2, 8), M.escuro, 0.14, 1.26, 0);                                 // antena, só de um lado
    peca(corpo, new T.SphereGeometry(0.045, 14, 10), cor, 0.14, 1.38, 0);

    // rosto: uma tela com os olhos, que mudam conforme o que acontece
    const rosto = document.createElement('canvas');
    rosto.width = 256; rosto.height = 128;
    const texRosto = new T.CanvasTexture(rosto);
    texRosto.colorSpace = T.SRGBColorSpace;
    malha(corpo, new T.PlaneGeometry(0.36, 0.18), luminoso({ map: texRosto }), 0, 0.99, -0.2215).rotation.y = Math.PI;
    let cara = '';
    const olhar = jeito => {
      if (jeito === cara) return;
      cara = jeito;
      const g = rosto.getContext('2d');
      g.fillStyle = '#1b2026'; g.fillRect(0, 0, 256, 128);
      g.strokeStyle = g.fillStyle = '#5fe9ff'; g.lineWidth = 14; g.lineCap = 'round';
      for (const x of [78, 178]) {
        g.beginPath();
        if (jeito === 'tonto') { g.moveTo(x - 24, 40); g.lineTo(x + 24, 88); g.moveTo(x + 24, 40); g.lineTo(x - 24, 88); g.stroke(); }
        else if (jeito === 'feliz') { g.arc(x, 78, 26, Math.PI, 0); g.stroke(); }
        else { g.arc(x, 64, 24, 0, 7); g.fill(); }
      }
      texRosto.needsUpdate = true;
    };
    olhar('normal');

    // tela da barriga, para o texto do botão T
    const tela = document.createElement('canvas');
    tela.width = 512; tela.height = 256;
    const texTela = new T.CanvasTexture(tela);
    texTela.colorSpace = T.SRGBColorSpace;
    malha(corpo, new T.PlaneGeometry(0.32, 0.16), luminoso({ map: texTela }), 0, 0.5, -0.2315).rotation.y = Math.PI;
    const escrever = texto => {
      const g = tela.getContext('2d');
      g.fillStyle = '#06120c'; g.fillRect(0, 0, 512, 256);
      g.strokeStyle = '#2a6b48'; g.lineWidth = 10; g.strokeRect(5, 5, 502, 246);
      g.fillStyle = '#5dffa0'; g.font = 'bold 76px Consolas, "Courier New", monospace';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(texto, 256, 132, 472);
      texTela.needsUpdate = true;
    };
    escrever('');

    // braços: giram no ombro; o direito (+x) é o que pega e arremessa
    for (const [b, lado] of [[braco, 1], [outro, -1]]) {
      b.position.set(lado * 0.37, 0.68, 0);
      corpo.add(b);
      peca(b, caixaSuave(0.14, 0.4, 0.14, 0.06), cor, 0, -0.17, 0);
      peca(b, new T.SphereGeometry(0.085, 14, 10), M.branco, 0, -0.42, 0);
    }
    // estrelas que giram em volta da cabeça de quem caiu
    const estrelas = new T.Group();
    estrelas.position.y = 1.5;
    corpo.add(estrelas);
    for (let i = 0; i < 3; i++) malha(estrelas, new T.OctahedronGeometry(0.07), luminoso({ color: 0xffd83a }), Math.cos(i * 2.1) * 0.3, 0, Math.sin(i * 2.1) * 0.3);
    estrelas.visible = false;

    fazSombra(grupo);
    grupo.traverse(o => o.layers.set(CAMADA[n]));          // o próprio jogador não vê o seu corpo...
    braco.traverse(o => o.layers.enable(0));               // ...só os braços, quando entram na vista
    outro.traverse(o => o.layers.enable(0));
    sombraNoChao(grupo, 0.5);
    mira.visible = false;
    return { grupo, eixo, corpo, mira, braco, outro, estrelas, olhar, escrever };
  }

  // O balão de história em quadrinhos que aparece em cima de quem foi acertado.
  function montarGrito() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const textura = new T.CanvasTexture(c);
    textura.colorSpace = T.SRGBColorSpace;
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: textura, transparent: true, depthWrite: false, toneMapped: false }));
    sprite.scale.set(1.9, 0.95, 1);
    sprite.visible = false;
    cena.add(sprite);
    let atual = '';
    return { sprite, get texto() { return atual; }, escrever(texto) {
      if (texto === atual) return;
      atual = texto;
      const g = c.getContext('2d');
      g.clearRect(0, 0, 512, 256);
      g.beginPath();
      for (let i = 0; i < 28; i++) {             // estrela de pontas: o "estouro" dos gibis
        const a = i * Math.PI / 14, r = i % 2 ? 0.72 : 1;
        g.lineTo(256 + Math.cos(a) * 246 * r, 128 + Math.sin(a) * 120 * r);
      }
      g.closePath();
      g.fillStyle = '#ffd83a'; g.fill();
      g.lineWidth = 8; g.strokeStyle = '#d6382e'; g.lineJoin = 'round'; g.stroke();
      g.font = 'bold 76px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 10; g.strokeStyle = '#ffffff'; g.strokeText(texto, 256, 132, 330);
      g.fillStyle = '#d6382e'; g.fillText(texto, 256, 132, 330);
      textura.needsUpdate = true;
    } };
  }

  // O sinal em cima de cada robô, que diz de quem é a vez: "…" enquanto ele não jogou nesta
  // rodada, "✓" quando já jogou e está esperando o outro. O próprio jogador não o vê (fica
  // na camada do corpo dele); vê o do adversário.
  const texSinal = [false, true].map(jogou => texturaCanvas(128, 96, (g, l, a) => {
    g.clearRect(0, 0, l, a);
    g.fillStyle = '#ffffff'; g.strokeStyle = '#20262c'; g.lineWidth = 6; g.lineJoin = g.lineCap = 'round';
    cantos(g, 6, 6, l - 12, a - 30, 24); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(l / 2 - 12, a - 26); g.lineTo(l / 2, a - 6); g.lineTo(l / 2 + 12, a - 26); g.fill(); g.stroke();
    g.fillRect(l / 2 - 10, a - 34, 20, 10);                 // apaga o traço entre o balão e a ponta
    if (jogou) { g.strokeStyle = '#1f9d55'; g.lineWidth = 12; g.beginPath(); g.moveTo(40, 38); g.lineTo(58, 54); g.lineTo(90, 22); g.stroke(); }
    else { g.fillStyle = '#c98a00'; for (const x of [38, 64, 90]) { g.beginPath(); g.arc(x, 38, 9, 0, 7); g.fill(); } }
  }));
  function montarSinal(n) {
    const tela = document.createElement('canvas');
    tela.width = 256; tela.height = 96;
    const textura = new T.CanvasTexture(tela);
    textura.colorSpace = T.SRGBColorSpace;
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: textura, transparent: true, depthWrite: false, toneMapped: false }));
    sprite.userData = { tela, textura, chave: '' };
    sprite.scale.set(1.5, 0.5625, 1);
    sprite.layers.set(CAMADA[n]);
    sprite.visible = false;
    cena.add(sprite);
    return sprite;
  }

  // ---------- estado ----------
  // jog[1] começa em +z olhando para a rede (rumo 0 = -z); jog[2], em -z (rumo 4 = +z).
  // controle: quem joga nesse robô — 'ia' (MCP), 'humano' (teclado), 'bot' (o robô da casa,
  //           só no treino) ou 'ninguem' (desafio M, enquanto o jogador não entra: o robô
  //           nem aparece na quadra).
  // dono:     quando o controle é 'ia', o número da conexão MCP dela; sinal: a hora da última chamada.
  // avisado:  a iA desse robô já recebeu o aviso de que a partida começou (ver pedir).
  // esperas:  chamadas dessa iA penduradas até o outro jogador entrar (ver aguardar).
  const jog = [null];
  for (const n of [1, 2]) {
    const corpo = montarBoneco(n);
    cena.add(corpo.grupo);
    jog.push({ n, corpo, grito: montarGrito(), sinal3d: montarSinal(n), lado: n === 1 ? 1 : -1, controle: TREINO ? 'bot' : 'ninguem', dono: null, sinal: 0, avisado: false, esperas: [],
      ausente: false, faltas: 0, pendente: null, novas: [], modelo: '', desde: 0, banco: 0, pronto: true, passou: false, vis: { x: 0, z: 0, yaw: 0, braco: 0, queda: 0, pulo: 0, guarda: 0 } });
  }
  // O que cada um acabou de fazer, para quem assiste entender a jogada (ver anunciar): uma
  // etiqueta em cima do robô, um sinal no chão — a seta de para onde andou, a volta de para
  // que lado virou, o anel do escudo que subiu, o xis do que não deu certo — e o brilho do
  // escudo levantado. Nada disso aparece na imagem que vai para as iAs.
  const texDeSinal = desenho => texturaCanvas(128, 128, (g, l) => {
    g.clearRect(0, 0, l, l);
    g.lineCap = g.lineJoin = 'round';
    for (const [cor, larg] of [['rgba(10,14,18,0.85)', 26], ['#ffffff', 14]]) { g.strokeStyle = cor; g.lineWidth = larg; desenho(g); }
  });
  const TEX_SINAL = {
    reta: texDeSinal(g => { for (const y of [100, 66, 32]) { g.beginPath(); g.moveTo(16, y + 14); g.lineTo(64, y - 16); g.lineTo(112, y + 14); g.stroke(); } }),   // três divisas, largas: aparecem dos dois lados do robô
    curva: texDeSinal(g => { g.beginPath(); g.arc(64, 64, 42, Math.PI * 0.15, Math.PI * 1.5); g.stroke(); g.beginPath(); g.moveTo(40, 6); g.lineTo(66, 22); g.lineTo(46, 46); g.stroke(); }),
    anel: texDeSinal(g => { g.beginPath(); g.arc(64, 64, 48, 0, 7); g.stroke(); }),
    xis: texDeSinal(g => { g.beginPath(); g.moveTo(28, 28); g.lineTo(100, 100); g.moveTo(100, 28); g.lineTo(28, 100); g.stroke(); }),
  };
  const texAura = texturaCanvas(64, 64, (g, l) => {
    const r = g.createRadialGradient(l / 2, l / 2, 0, l / 2, l / 2, l / 2);
    r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.35, 'rgba(140,235,255,0.55)'); r.addColorStop(1, 'rgba(90,200,255,0)');
    g.clearRect(0, 0, l, l); g.fillStyle = r; g.fillRect(0, 0, l, l);
  });
  for (const J of [jog[1], jog[2]]) {
    const tela = document.createElement('canvas');
    tela.width = 512; tela.height = 112;
    const textura = new T.CanvasTexture(tela);
    textura.colorSpace = T.SRGBColorSpace;
    const etiqueta = new T.Sprite(new T.SpriteMaterial({ map: textura, transparent: true, depthWrite: false, toneMapped: false }));
    etiqueta.visible = false;
    cena.add(etiqueta);
    J.etiqueta = { sprite: etiqueta, tela, textura };
    const grupo = new T.Group(), material = new T.MeshBasicMaterial({ map: TEX_SINAL.reta, transparent: true, depthWrite: false, side: T.DoubleSide, toneMapped: false });
    const folha = new T.Mesh(new T.PlaneGeometry(1, 1), material);
    folha.rotation.x = -Math.PI / 2;             // deitada no chão: o "para cima" do desenho aponta para -z
    grupo.add(folha); grupo.visible = false;
    cena.add(grupo);
    J.noChao = { grupo, folha, material };
    J.aura = new T.Sprite(new T.SpriteMaterial({ map: texAura, transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
    J.aura.position.set(0, -0.56, -0.08);        // onde o escudo fica, na mão esquerda
    J.aura.visible = false;
    J.corpo.outro.add(J.aura);
    J.feito = null;
  }
  function anunciar(J, de, jogada) {
    const d = diagnosticos[J.n], b = jogada && jogada.botao, m = d.mensagem, f = frenteDe(J);
    const andou = Math.hypot(J.x - de.x, J.z - de.z) > 1e-6;
    let texto = '', sinal = null, cor = COR_CSS[J.n];
    if (!jogada) { if (J.controle === 'ia') { texto = 'TEMPO ESGOTADO: PERDEU A VEZ'; cor = '#b3261e'; } }     // (no teclado, quem não aperta nada não ganha etiqueta)
    else if (!d.ok) {
      texto = '✖ ' + m.split(/[:(—]/)[0].trim().toUpperCase(); cor = '#b3261e';
      sinal = { tipo: 'xis', x: J.x + f.x * 0.75, z: J.z + f.z * 0.75, giro: 0, cor: 0xff5a4d, tam: 0.7 };
      tocar('erro');
    } else if (b === 'PASSAR') {
      texto = 'PASSOU A VEZ'; cor = '#5b6770';
      particulas.soltar('bolha', J.x, 1.45, J.z, 0, 0, [0xffffff, 0xcfe6f2]);
      tocar('passa');
    } else if (b === 'A' || b === 'D') {
      texto = b === 'A' ? 'VIROU À ESQUERDA' : 'VIROU À DIREITA';
      sinal = { tipo: 'curva', x: J.x, z: J.z, giro: J.rumo * GIRO, espelho: b === 'A', tam: 1.7 };
      tocar('vira');
    } else if (b === 'L') {
      if (/^em guarda/.test(m)) {
        texto = 'LEVANTOU O ESCUDO';
        sinal = { tipo: 'anel', x: J.x, z: J.z, giro: 0, cor: 0x8cebff, tam: 1 };
        J.vis.brilho = 1;
        particulas.soltar('brilho', J.x + f.x * 0.4, 1.0, J.z + f.z * 0.4, 0, 0, [0x8cebff, 0xffffff], 8);
        tocar('escudo');
      } else texto = /^mão levantada/.test(m) ? 'LEVANTOU A MÃO' : 'ABAIXOU A GUARDA';
    } else if (b === 'ESPACO' && /^pegou: /.test(m)) {
      texto = 'PEGOU: ' + m.slice(7).split(' —')[0].toUpperCase();
      particulas.soltar('brilho', J.x + f.x * 0.45, 0.8, J.z + f.z * 0.45, 0, 0, [0xffe066, 0xffffff]);
      tocar('pega');
    } else if (b === 'ESPACO') texto = 'ARREMESSOU!';
    else if (andou) {
      texto = b === 'W' ? 'ANDOU' : b === 'S' ? 'MEIA-VOLTA E ANDOU' : 'PASSO DE LADO';
      // a seta começa onde ele estava e passa de onde parou, para a ponta aparecer à frente do robô
      sinal = { tipo: 'reta', x: de.x + (J.x - de.x) * 1.5, z: de.z + (J.z - de.z) * 1.5, giro: Math.atan2(-(J.x - de.x), -(J.z - de.z)), tam: 1.6, comp: 1.9 };
      particulas.soltar('poeira', de.x, 0.05, de.z, 0, 0, [0xd9cfbd, 0xbfb4a0], 4);
      tocar('passo');
    }
    if (/ — defendeu/.test(m)) texto = 'DEFENDEU!';
    else if (/ — acertou/.test(m)) texto = 'ACERTOU!';
    rotular(J, texto, cor, sinal);
  }
  // Põe a etiqueta em cima do robô (e o sinal no chão). Sem texto, tira a que havia.
  function rotular(J, texto, cor, sinal = null) {
    J.feito = texto ? { texto, sinal, em: tempo } : null;
    if (!texto) return;
    const g = J.etiqueta.tela.getContext('2d');
    g.clearRect(0, 0, 512, 112);
    g.fillStyle = cor; cantos(g, 6, 10, 500, 92, 30); g.fill();
    g.strokeStyle = 'rgba(10,14,18,0.85)'; g.lineWidth = 6; cantos(g, 6, 10, 500, 92, 30); g.stroke();
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 50px Arial, sans-serif';
    g.fillText(texto, 256, 59, 460);
    J.etiqueta.textura.needsUpdate = true;
  }
  // A partida está valendo quando os dois robôs têm quem jogue.
  const presentes = () => jog[1].controle !== 'ninguem' && jog[2].controle !== 'ninguem';
  // ...e os dois disseram ao juiz que estão prontos (ver ficarPronto). Só então o tempo conta.
  const valendo = () => presentes() && jog[1].pronto && jog[2].pronto;
  // O nome de guerra de cada jogador, que vai no placar. A iA manda o dela ao entrar (comecar).
  const nomeDe = J => J.nome || (J.controle === 'bot' ? 'Robô da casa' : `Jogador ${J.n}`);
  const limparNome = nome => Array.from(String(nome == null ? '' : nome).replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, 12).join('');
  // `modelo`: que modelo de iA é (ela diz, se quiser, ao entrar): vai em letras menores, embaixo do nome.
  const limparModelo = modelo => Array.from(String(modelo == null ? '' : modelo).replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, 24).join('');
  function batizar(J, nome, modelo) {
    nome = limparNome(nome); modelo = limparModelo(modelo);
    if ((!nome || nome === J.nome) && (!modelo || modelo === J.modelo)) return;
    if (nome && nome !== J.nome) { J.nome = nome; J.modelo = ''; }        // outro nome é outra iA
    if (modelo) J.modelo = modelo;
    hudVelho = true;
    desenharPlacar();
    desenharRegistro();
    escreverCartazes();
  }

  // ---------- o comentarista ----------
  // Uma iA pode entrar só para assistir e ajudar a narrar (comecar com o desafio "C"). Ela
  // senta na mesa do comentarista, recebe as regras do jogo, vê a transmissão (botão F) e fica
  // sabendo por texto, a cada rodada, o que os dois jogadores fizeram — ela não joga, então
  // pode saber de tudo. O que ela diz (botão T) aparece como legenda na transmissão e no
  // registro, nunca na imagem dos jogadores; com o som ligado, o navegador fala em voz alta.
  // dono: a conexão MCP dela; novas: as notas que ainda não leu; esperas: as chamadas dela
  // penduradas à espera da próxima rodada; fala: a legenda que está no ar.
  const narrador = { dono: null, nome: '', modelo: '', sinal: 0, novas: [], esperas: [], fala: null };
  // O comentarista está na cabine? (Dois minutos sem nenhuma chamada dele e a cadeira aparece
  // vazia; o lugar continua sendo dele, e qualquer chamada o traz de volta.)
  const naCabine = () => !!narrador.dono && Date.now() - narrador.sinal < 120000;
  function narrar(nota) {
    if (!narrador.dono) return;
    narrador.novas.push(nota);
    // O servidor manda cinco notas de cada vez. Se o comentarista demora e a fila enche, saem
    // as rodadas mais antigas: o ponto, o fim de jogo e a partida nova ele não pode perder.
    while (narrador.novas.length > 5) {
      const i = narrador.novas.findIndex(n => n.tipo === 'narraRodada' || n.tipo === 'narraBarriga');
      narrador.novas.splice(i >= 0 ? i : 0, 1);
    }
    for (const e of narrador.esperas.splice(0)) { clearTimeout(e.relogio); e.pronto(); }
  }
  // A iA da conexão `quem` senta na cadeira do comentarista. Devolve true, ou o aviso de por
  // que não pode: ela está jogando, ou a cadeira é de outra iA (que não saiu nem sumiu).
  function comentar(quem, nome, modelo) {
    const n = narrador, agora = Date.now();
    nome = limparNome(nome) || 'Comentarista';
    if ([jog[1], jog[2]].some(J => J.controle === 'ia' && J.dono === quem)) return 'jogadorNaoComenta';
    if (n.dono && n.dono !== quem && n.nome !== nome && agora - n.sinal < ABANDONO * 1000) return 'cadeiraOcupada';
    for (const e of n.esperas.splice(0)) { clearTimeout(e.relogio); e.pronto(); }
    Object.assign(n, { dono: quem, nome, modelo: limparModelo(modelo) || (nome === n.nome ? n.modelo : ''), sinal: agora, novas: [] });
    cabine.figura.visible = true;
    if (valendo()) n.novas.push({ tipo: 'narraPlacar', a: nomeDe(jog[1]), pa: jog[1].pontos, pb: jog[2].pontos, b: nomeDe(jog[2]), rodada: rodadas + 1 });
    try { sessionStorage.setItem('quadra.narrador', JSON.stringify({ quem, nome })); } catch (e) { }   // para continuar na cadeira se a página recarregar
    escreverPlaca();
    hudVelho = true;
    return true;
  }
  function largarCadeira() {
    for (const e of narrador.esperas.splice(0)) { clearTimeout(e.relogio); e.pronto(); }
    Object.assign(narrador, { dono: null, nome: '', modelo: '', novas: [], fala: null });
    try { sessionStorage.removeItem('quadra.narrador'); } catch (e) { }
    escreverPlaca();
    hudVelho = true;
  }
  function escreverPlaca() {
    const g = cabine.tela.getContext('2d');
    g.fillStyle = '#12161a'; g.fillRect(0, 0, 256, 96);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const presente = naCabine();
    g.fillStyle = '#c9b3e6'; g.font = `bold ${presente ? 20 : 26}px Arial, sans-serif`; g.fillText('COMENTARISTA', 128, presente ? 24 : 48, 236);
    if (presente) { g.fillStyle = '#ffffff'; g.font = 'bold 38px Arial, sans-serif'; g.fillText(narrador.nome, 128, 62, 236); }
    cabine.textura.needsUpdate = true;
    marcarCadeira();
  }
  // Os botões do comentarista: F é a imagem da transmissão; T põe no ar o que ele diz e fica
  // esperando a próxima rodada (ou 20 segundos), para a resposta já trazer o que aconteceu.
  function botaoDoNarrador(botao, texto) {
    const n = narrador;
    n.sinal = Date.now();
    if (botao === 'F') return frameDaTransmissao();
    if (botao !== 'T') return undefined;         // os outros botões são de quem joga
    falar(texto);
    if (n.novas.length) return undefined;        // já há o que contar: responde na hora
    return new Promise(pronto => {
      const e = { pronto, relogio: setTimeout(() => { n.esperas.splice(n.esperas.indexOf(e), 1); pronto(); }, 20000) };
      n.esperas.push(e);
    });
  }
  function falar(texto) {
    texto = Array.from(String(texto == null ? '' : texto).replace(/[\u0000-\u001f\u007f]/g, ' ').trim()).slice(0, NARRACAO).join('');
    if (!texto) return;
    narrador.fala = { texto, ate: performance.now() + Math.max(5000, 2500 + texto.length * 75) };
    historico.push({ marca: `🎙 ${narrador.nome}: ${texto}`, fala: true });
    if (historico.length > 400) historico.shift();
    hudVelho = true;
    desenharRegistro();
    try {                                        // em voz alta, se o som está ligado e o navegador sabe falar
      if (!nivelDoSom('narracao') || !window.speechSynthesis) return;      // narração no mudo: fica só a legenda
      const voz = new SpeechSynthesisUtterance(texto);
      voz.lang = 'pt-BR'; voz.rate = 1.15; voz.volume = nivelDoSom('narracao');
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(voz);
    } catch (e) { }
  }
  function moverComentarista() {
    const noAr = objetos.find(o => o.estado === 'voo'), fz = noAr ? noAr.grupo.position.z : (jog[1].vis.z + jog[2].vis.z) / 2;
    const presente = naCabine();
    if (presente !== cabine.figura.visible) { cabine.figura.visible = presente; escreverPlaca(); hudVelho = true; }   // chegou ou foi embora
    cabine.cabeca.rotation.y = limitar(Math.atan2(fz, 6.3), -0.8, 0.8);                 // acompanha o lance
    cabine.cabeca.rotation.x = narrador.fala ? Math.sin(tempo * 9) * 0.07 : 0;         // e balança a cabeça enquanto fala
  }
  // Notas: o que a iA fica sabendo por texto, sem precisar pedir a imagem. Vão junto com a
  // resposta da próxima chamada dela (ver novidades). Só fatos que não ensinam a jogar nem
  // contam o que o outro está fazendo: o placar, quando muda; que a partida recomeçou; e de
  // quem é a vez — que a rodada fechou e ela já pode jogar a seguinte.
  // O texto de cada nota está em ferramentas.json; daqui sai só o tipo e os dados.
  // `assunto`: de cada assunto só a nota mais nova interessa (a anterior é trocada).
  function anotar(J, nota, assunto = nota.tipo) {
    if (J.controle !== 'ia') return;
    J.novas = J.novas.filter(n => n.assunto !== assunto);
    J.novas.push({ assunto, nota });
  }
  const anotarPlacar = () => {
    for (const J of [jog[1], jog[2]]) { const O = jog[3 - J.n]; anotar(J, { tipo: 'placar', eu: nomeDe(J), meus: J.pontos, dele: O.pontos, ele: nomeDe(O) }); }
  };
  // A vez: com a partida valendo, todo jogador pode jogar a rodada que está aberta.
  const anotarVez = J => { if (valendo() && !fim) anotar(J, { tipo: 'vez', rodada: rodadas + 1 }, 'vez'); };
  // As notas pendentes da iA da conexão `quem`, na ordem em que fazem sentido lidas (a vez
  // por último). Quem pede leva: a lista fica vazia.
  const ORDEM_DAS_NOTAS = ['partidaNova', 'placar', 'quadraArrumada', 'bracoCansado', 'defendeu', 'rodada', 'rodadaFalhou', 'rodadaPerdida', 'vez'];
  function novidades(quem) {
    if (narrador.dono === quem) return narrador.novas.splice(0);
    const J = [jog[1], jog[2]].find(J => J.controle === 'ia' && J.dono === quem);
    if (!J) return [];
    return J.novas.splice(0).map(n => n.nota).sort((a, b) => ORDEM_DAS_NOTAS.indexOf(a.tipo) - ORDEM_DAS_NOTAS.indexOf(b.tipo));
  }
  let rodadas = 0, fim = 0, hudVelho = true;
  const historico = [];                         // o que cada jogador fez em cada rodada da partida (ver desenharRegistro)
  // Relógio das rodadas: quando a rodada atual abriu e, se alguém já jogou e falta o outro,
  // quando ela fecha sozinha (0 = ninguém jogou ainda). Em milissegundos, como Date.now().
  let aberta = Date.now(), prazo = 0;
  const diagnosticos = { 1: null, 2: null };
  const sorte = aleatorio(20261111);

  // manter: os jogadores continuam prontos (é a partida começando, depois de os dois
  // responderem ao juiz). Sem isso, o juiz pergunta de novo a cada iA antes de valer.
  function novaPartida(manter) {
    const recomeco = rodadas > 0;                // uma partida que já andava foi zerada: as iAs ficam sabendo
    rodadas = 0; fim = 0; hudVelho = true;
    abrirRodada();
    historico.length = 0;
    for (const J of [jog[1], jog[2]]) {
      J.novas = [];
      J.olhadas = 0;                             // quantas vezes pediu a imagem desde a última rodada
      if (recomeco) anotar(J, { tipo: 'partidaNova' });
      // gasto: tempo somado que o jogador levou para jogar; jogadas: quantas fez; jogouEm: a hora da jogada desta rodada
      // segurando: o objeto de arremessar, na mão direita; escudo: o escudo, na esquerda; guarda: o escudo está levantado
      Object.assign(J, { x: 0, z: INICIO * J.lado, rumo: J.n === 1 ? 0 : 4, segurando: null, escudo: null, guarda: false, texto: '',
        pontos: 0, caido: 0, pow: 0, lambuzado: 0, faltas: 0, ausente: false, gasto: 0, jogadas: 0, jogouEm: 0, folego: FOLEGO_DO_ESCUDO });
      J.corpo.escrever('');
      Object.assign(J.vis, { x: J.x, z: J.z, yaw: J.rumo * GIRO, braco: 0, queda: 0, pulo: 0, guarda: 0, lance: 0, atraso: 0, estouro: 1, brilho: 0, tombo: { x: 1, z: 0 } });
      J.feito = null;
      J.passou = false;
      if (manter !== true) J.pronto = J.controle !== 'ia' || !PERGUNTAR_PRONTO;
      diagnosticos[J.n] = { comando: 'início', ok: true, mensagem: 'ok' };
    }
    objetos.forEach((o, i) => {
      const v = vagaDe(i);
      cena.add(o.grupo);
      Object.assign(o, { x: v.x, z: v.z, estado: 'chao', dono: 0, dir: null, voado: 0, anim: null });
      Object.assign(o.vis, { ang: 0, incl: 0, amassa: 0, treme: -1 });
      o.grupo.position.set(o.x, o.tipo.y * ESCALA, o.z);
      o.grupo.rotation.set(0, i * 1.3, 0);
      o.miolo.rotation.set(0, 0, 0);
    });
    for (const J of [jog[1], jog[2]]) anotarVez(J);          // quem já está na partida fica sabendo que pode jogar
    acabarReplay();
    clipes.length = 0;
    if (valendo()) { narrar({ tipo: 'narraPartida' }); apitar('inicio'); }       // o juiz apita o começo
    desenharPlacar();
    desenharRegistro();
    soltarPausa();                               // se a partida foi zerada no meio da pausa de um ponto
  }
  // O lugar em que o objeto i começa: os de índice par ficam com o jogador 1.
  function vagaDe(i) {
    const [x, z] = VAGAS[i >> 1], lado = i % 2 ? -1 : 1;
    return { x: x * lado, z: z * lado };
  }

  // Depois de um ponto o placar fica, e a quadra volta ao começo: cada robô no seu lugar, de
  // mãos vazias, e os objetos arrumados como no início. (Só o creme da torta continua na cara
  // de quem levou.) Antes disso há uma pausa curta, para quem assiste ver o acerto; as
  // respostas dessa rodada só saem depois que a quadra foi arrumada.
  const pausa = { ativa: false, relogio: null, prontos: [] };
  function soltarPausa() {
    clearTimeout(pausa.relogio);
    pausa.ativa = false;
    pausa.prontos.splice(0).forEach(pronto => pronto());
  }
  function arrumarQuadra() {
    acabarReplay();
    for (const J of [jog[1], jog[2]]) {
      const frente = J.n === 1 ? 0 : 4;
      // (o rumo volta para a frente pelo lado mais curto, para o robô não sair rodopiando)
      Object.assign(J, { x: 0, z: INICIO * J.lado, rumo: frente + 8 * Math.round((J.rumo - frente) / 8), segurando: null, escudo: null, guarda: false, caido: 0, pow: 0, folego: FOLEGO_DO_ESCUDO, passou: false });
      J.vis.atraso = 0;
      anotar(J, { tipo: 'quadraArrumada' });
    }
    objetos.forEach((o, i) => {
      if (o.estado === 'mao') soltar(o);         // sai da mão de quem segurava
      const v = vagaDe(i);
      Object.assign(o, { x: v.x, z: v.z, estado: 'chao', dono: 0, dir: null, voado: 0 });
      o.grupo.rotation.set(0, i * 1.3, 0);
      o.vis.treme = -1;
      mover(o, o.x, o.tipo.y * ESCALA, o.z, 0.5, 0.5, { giro: 0.4 });       // volta para o lugar com um pulinho
    });
    abrirRodada();                               // a pausa do ponto não conta no tempo de ninguém
    hudVelho = true;
    soltarPausa();
    if ([jog[1], jog[2]].some(J => J.pendente)) conferir();  // jogadas feitas no teclado durante a pausa
  }

  // Para onde o robô olha; com `giro`, a direção a tantos oitavos de volta à esquerda disso (2 = a esquerda dele).
  const frenteDe = (J, giro = 0) => ({ x: -Math.sin((J.rumo + giro) * GIRO), z: -Math.cos((J.rumo + giro) * GIRO) });
  const cabe = (J, x, z) => Math.abs(x) <= LIMITE.x + 1e-9 && z * J.lado >= LIMITE.perto - 1e-9 && z * J.lado <= LIMITE.fundo + 1e-9;

  // O objeto do chão que o ESPACO pegaria: o mais próximo ao alcance e à frente (±45°), entre
  // os que cabem numa mão livre — um objeto de arremessar na direita, um escudo na esquerda.
  // `semEscudo`: só os de arremessar (é o que o robô da casa procura).
  function alvoDe(J, semEscudo) {
    const v = frenteDe(J);
    let alvo = null, menor = Infinity;
    for (const o of objetos) {
      if (o.estado !== 'chao' || (o.tipo.escudo ? J.escudo || semEscudo : J.segurando)) continue;
      const dx = o.x - J.x, dz = o.z - J.z, dist = Math.hypot(dx, dz);
      if (dist > ALCANCE || (dist > 0.3 && (dx * v.x + dz * v.z) / dist < 0.69)) continue;
      if (dist < menor) { menor = dist; alvo = o; }
    }
    return alvo;
  }
  // O arremesso de J, daqui e para onde ele olha, acertaria O (se O não sair do lugar)?
  function naMira(J, O) {
    const v = frenteDe(J), t = (O.x - J.x) * v.x + (O.z - J.z) * v.z;
    return t > 0 && t <= ALCANCE_DO_ARREMESSO && Math.hypot(O.x - J.x - v.x * t, O.z - J.z - v.z * t) < RAIO_DE_ACERTO;
  }

  // Tira o objeto da mão de quem o segura e o deixa solto no mundo, no lugar em que a mão está.
  function soltar(o) {
    o.grupo.updateWorldMatrix(true, false);
    const p = o.grupo.getWorldPosition(new T.Vector3());
    cena.add(o.grupo);
    o.grupo.position.copy(p);
    o.grupo.rotation.set(0, 0, 0);
  }
  // O desenho de um objeto anda por uma lista de trechos: cada um vai de onde o anterior parou
  // até (x, y, z), subindo `arco` no meio (uma parábola), em `dur` segundos. Um trecho pode
  // ainda ter: espera (segundos parado antes de começar), freia (chega devagar, escorregando),
  // voo (está em pleno arremesso: estica e deixa rastro), giro (o quanto roda, de 0 a 1) e
  // aoFim (o que acontece quando ele termina: a batida no chão, a pancada em alguém).
  const trecho = (x, y, z, arco, dur, extra) => Object.assign({ x, y, z, arco, dur, espera: 0 }, extra);
  const ESPERANDO = { giro: 0 };                // o "trecho" de quem ainda está esperando para começar
  function animarObjeto(o, trechos) { o.anim = { trechos, i: 0, t: 0, e: 0, de: null }; }
  function mover(o, x, y, z, arco, segundos, extra) { animarObjeto(o, [trecho(x, y, z, arco, segundos, extra)]); }
  // Um passo dessa animação. Devolve o trecho em que o objeto está, ou null se ela acabou.
  function avancar(o, dt) {
    const an = o.anim, p = o.grupo.position;
    while (an.i < an.trechos.length) {
      const tr = an.trechos[an.i];
      if (!an.de) an.de = { x: p.x, y: p.y, z: p.z };        // o trecho começa de onde o objeto está
      if (an.e < tr.espera) { an.e += dt; return ESPERANDO; }
      an.t = Math.min(1, an.t + dt / tr.dur);
      const t = tr.freia ? 1 - (1 - an.t) * (1 - an.t) : an.t, d = an.de;
      p.set(d.x + (tr.x - d.x) * t, d.y + (tr.y - d.y) * t + tr.arco * 4 * an.t * (1 - an.t), d.z + (tr.z - d.z) * t);
      if (an.t < 1) return tr;
      an.i++; an.t = 0; an.e = 0; an.de = null; dt = 0;
      if (tr.aoFim) tr.aoFim();
    }
    o.anim = null;
    return null;
  }
  // A queda de um objeto, de (x0, z0) até parar em (x, z): o voo até o chão e depois os quiques,
  // cada um mais baixo e mais curto que o anterior — ou, para o que não quica (a pizza, a
  // torta), um escorregão. `espera`: segundos parado antes de começar a cair.
  function queda(o, x0, z0, x, z, arco, espera = 0) {
    const f = o.fisica, y = o.tipo.y * ESCALA, dx = x - x0, dz = z - z0, lista = [];
    const bate = forca => () => {
      const p = o.grupo.position;
      o.vis.amassa = forca;
      particulas.soltar('poeira', p.x, 0.05, p.z, 0, 0, [0xd9cfbd, 0xbfb4a0], forca > 0.5 ? 6 : 3);
      tocar(f.moeda ? 'tilim' : 'quique', forca);
    };
    const quiques = f.quique >= 0.5 ? 3 : f.quique >= 0.2 ? 2 : 0, depois = quiques ? 0.34 : 0.22;   // a parte do caminho feita depois de tocar o chão
    let px = x0 + dx * (1 - depois), pz = z0 + dz * (1 - depois);
    lista.push(trecho(px, y, pz, arco, 0.25 + 0.25 * Math.sqrt(arco), { espera, aoFim: bate(1) }));
    if (!quiques) lista.push(trecho(x, y, z, 0, 0.45, { freia: true, giro: 0.35 }));
    else {
      let alt = Math.max(0.16, arco * f.quique), soma = 0;
      for (let i = 0; i < quiques; i++) soma += Math.pow(f.quique, i);
      for (let i = 0; i < quiques; i++) {
        const ultimo = i === quiques - 1;
        px += dx * depois * Math.pow(f.quique, i) / soma; pz += dz * depois * Math.pow(f.quique, i) / soma;
        lista.push(trecho(ultimo ? x : px, y, ultimo ? z : pz, alt, 2 * Math.sqrt(2 * alt / 20), { giro: 0.6 * Math.pow(0.6, i), aoFim: bate(0.7 * Math.pow(0.7, i)) }));
        alt *= f.quique;
      }
    }
    if (f.moeda) { const fim = lista[lista.length - 1], antes = fim.aoFim; fim.aoFim = () => { if (antes) antes(); o.vis.treme = 0; }; }
    return lista;
  }
  // O objeto cai no chão perto de (x, z): sempre dentro da cerca e fora da faixa da rede.
  // `antes`: trechos que ele faz primeiro (ir até quem foi acertado, por exemplo).
  function cair(o, x, z, arco, espera = 0, antes = null) {
    const lado = Math.abs(z) > 1e-6 ? Math.sign(z) : (o.dir && Math.sign(o.dir.z)) || 1;
    o.x = Math.max(-CERCA.x, Math.min(CERCA.x, x));
    o.z = lado * Math.max(0.8, Math.min(CERCA.z, Math.abs(z)));
    o.estado = 'chao'; o.dono = 0; o.dir = null; o.voado = 0;
    const de = antes ? antes[antes.length - 1] : o.grupo.position;
    animarObjeto(o, (antes || []).concat(queda(o, de.x, de.z, o.x, o.z, arco, espera)));
  }
  // O objeto arremessado vai até o robô J (um pouco antes do centro dele, à altura do peito).
  // Devolve o trecho dessa chegada; `aoFim` é o que acontece na pancada.
  function chegar(o, J, dir, aoFim) {
    const p = o.grupo.position, x = J.x - dir.x * 0.3, z = J.z - dir.z * 0.3;
    return trecho(x, 0.85, z, 0.05, Math.max(0.1, Math.min(0.32, Math.hypot(x - p.x, z - p.z) / 16)), { voo: true, aoFim });
  }

  // ---------- as jogadas ----------
  // Um passo na direção v. `feito`: o que dizer se andou; `nota`: o que acrescentar se não deu.
  function andar(J, v, feito, nota = '') {
    let nx = J.x + v.x * PASSO, nz = J.z + v.z * PASSO;
    if (!cabe(J, nx, nz)) {                      // na diagonal contra a linha, desliza ao longo dela
      const diagonal = Math.abs(v.x) > 1e-6 && Math.abs(v.z) > 1e-6;
      if (diagonal && cabe(J, nx, J.z)) nz = J.z;
      else if (diagonal && cabe(J, J.x, nz)) nx = J.x;
      else return { ok: false, mensagem: 'bloqueado: linha da quadra' + nota };
    }
    J.x = nx; J.z = nz;
    J.vis.pulo = 1;
    return { ok: true, mensagem: feito };
  }
  function agir(J, botao, texto, arremessos) {
    switch (botao) {
      case 'W': return andar(J, frenteDe(J), 'andou');
      case 'S': J.rumo += 4; return andar(J, frenteDe(J), 'deu meia-volta e andou', ' (virou, mas não andou)');
      case 'Q': return andar(J, frenteDe(J, 2), 'deu um passo de lado, para a esquerda');    // de lado, sem virar: continua olhando para a frente
      case 'E': return andar(J, frenteDe(J, -2), 'deu um passo de lado, para a direita');
      case 'A': J.rumo += 1; return { ok: true, mensagem: 'virou à esquerda' };
      case 'D': J.rumo -= 1; return { ok: true, mensagem: 'virou à direita' };
      case 'L':                                  // levanta ou abaixa a mão esquerda: com o escudo nela, é a guarda
        if (!J.guarda && J.escudo && J.folego <= 0) return { ok: false, mensagem: 'braço cansado: não levanta o escudo' };
        J.guarda = !J.guarda;
        return { ok: true, mensagem: J.guarda ? (J.escudo ? 'em guarda' : 'mão levantada, sem escudo') : 'guarda baixa' };
      case 'PASSAR': return { ok: true, mensagem: 'passou a vez' };                        // fica como está: não faz nada nesta rodada
      case 'ESPACO': {
        // Um objeto ao alcance que caiba numa mão livre é pego. Senão, o que está na mão
        // direita é arremessado — a menos que o robô esteja em guarda: quem defende não ataca.
        const o = alvoDe(J);
        if (!o) {
          if (!J.segurando) return { ok: false, mensagem: 'nada ao alcance' };
          if (J.guarda && J.escudo) return { ok: false, mensagem: 'em guarda: não arremessa' };
          arremessos.push(J);
          return { ok: true, mensagem: `arremessou: ${J.segurando.nome}` };
        }
        if (o.tipo.escudo) J.escudo = o; else J.segurando = o;
        o.estado = 'mao'; o.anim = null;
        o.sombra.visible = false;
        (o.tipo.escudo ? J.corpo.outro : J.corpo.braco).add(o.grupo);   // vai na mão, e anda com ela
        o.grupo.position.set(0, -0.56, 0);
        o.grupo.rotation.set(0, 0, 0);
        return { ok: true, mensagem: `pegou: ${o.nome}` };
      }
    }
    return { ok: false, mensagem: 'botão inexistente' };
  }

  // Um passo do voo de um objeto: avança VELOCIDADE metros, a menos que antes disso acerte o
  // adversário de quem jogou, bata na cerca ou perca o fôlego. Devolve quem foi acertado.
  function voar(o) {
    const alvo = jog[3 - o.dono];
    let d = Math.min(VELOCIDADE, ALCANCE_DO_ARREMESSO - o.voado), parou = d < VELOCIDADE;
    const ate = (p, v, m) => v > 1e-9 ? (m - p) / v : v < -1e-9 ? (-m - p) / v : Infinity;
    const cerca = Math.max(0, Math.min(ate(o.x, o.dir.x, CERCA.x), ate(o.z, o.dir.z, CERCA.z)));
    if (cerca <= d) { d = cerca; parou = true; }
    if (!alvo.caido && !fim) {
      const t = Math.max(0, Math.min(d, (alvo.x - o.x) * o.dir.x + (alvo.z - o.z) * o.dir.z));
      if (Math.hypot(alvo.x - o.x - o.dir.x * t, alvo.z - o.z - o.dir.z * t) < RAIO_DE_ACERTO) return alvo;
    }
    o.x += o.dir.x * d; o.z += o.dir.z * d; o.voado += d;
    if (parou) cair(o, o.x, o.z, 0.25);
    else mover(o, o.x, 1.05, o.z, 0.12, 0.3, { voo: true });
    return null;
  }
  // A pancada, para quem assiste: os estilhaços do objeto, o barulho dele e um tranco na câmera.
  function pancada(o, J, dir, forca) {
    const f = o.fisica;
    particulas.soltar(f.resto[2], J.x - dir.x * 0.25, 0.9, J.z - dir.z * 0.25, dir.x, dir.z, f.resto);
    tocar(f.som, 1);
    cam.tranco = forca;
    torcida.flashes = Math.max(torcida.flashes, forca * 1.4);
  }

  // Fecha uma rodada. `jogadas[n]` é { botao, texto } ou null (ficou parado).
  function resolver(jogadas) {
    rodadas++;
    gravar();                                    // a rodada é filmada, para a reprise (ver replay)
    const arremessos = [], pontosAntes = jog[1].pontos + jog[2].pontos, lances = [], jaAcabou = !!fim;
    const de = { 1: { x: jog[1].x, z: jog[1].z }, 2: { x: jog[2].x, z: jog[2].z } };      // onde cada um estava antes da jogada
    const reprises = [];                         // um acerto, ou dois: quando os dois se acertam na mesma rodada, as duas reprises passam
    for (const J of [jog[1], jog[2]]) {
      const j = jogadas[J.n];
      if (!j) diagnosticos[J.n] = { comando: '—', ok: true, mensagem: 'não jogou' };
      else if (fim) diagnosticos[J.n] = { comando: j.botao, ok: false, mensagem: 'o jogo acabou' };
      else if (J.caido) diagnosticos[J.n] = { comando: j.botao, ok: false, mensagem: 'caído: perdeu a jogada' };
      else diagnosticos[J.n] = Object.assign({ comando: j.botao }, agir(J, j.botao, j.texto, arremessos));
      if (j) J.passou = j.botao === 'PASSAR';   // quem passou a vez nesta rodada não pode passar na seguinte (ver pedir)
    }
    for (const J of arremessos) {                // os arremessos saem depois de todo mundo ter se mexido
      const o = J.segurando;
      J.segurando = null;
      soltar(o);
      Object.assign(o, { estado: 'voo', dono: J.n, dir: frenteDe(J), x: J.x, z: J.z, voado: 0, lancado: rodadas });
      o.grupo.rotation.set(0, Math.atan2(-o.dir.z, o.dir.x), 0);   // o +x do objeto (a cabeça do frango, a ventosa) vai na frente
      o.vis.treme = -1;
      J.vis.lance = 1;                           // o braço dá o bote
      tocar('arremesso');
      lances.push({ tipo: 'arremesso', n: J.n, o });
    }
    const acertos = [];
    for (const o of objetos) {
      if (o.estado !== 'voo') continue;
      const vitima = voar(o);
      if (vitima) acertos.push([o, vitima]);
    }
    for (const [o, vitima] of acertos) {
      const autor = jog[o.dono], dir = o.dir, olha = frenteDe(vitima);
      const meuLado = z => vitima.lado * Math.max(0.8, z * vitima.lado);     // o que cai fica do lado de quem foi alvejado
      // Defesa: escudo na mão, guarda levantada e o objeto vindo de frente (até 60° para cada lado).
      // No desenho, o objeto primeiro chega em quem foi alvejado (`chegada`), e só então vem o
      // resto: a queda, o grito, o que ele segurava caindo. `atraso` é esse tempo de chegada.
      if (vitima.escudo && vitima.guarda && -(olha.x * dir.x + olha.z * dir.z) >= 0.5) {
        const s = vitima.escudo;
        const chegada = chegar(o, vitima, dir, () => { pancada(s, vitima, dir, 0.5); aplaudir(vitima.n); });
        vitima.escudo = null; vitima.guarda = false;
        vitima.pow = 2;
        vitima.vis.atraso = chegada.dur;
        vitima.grito.escrever('TÓIM!');
        diagnosticos[autor.n].mensagem += ` — o jogador ${vitima.n} defendeu`;
        diagnosticos[vitima.n].mensagem += ` — defendeu ${o.nome} com ${s.nome}`;
        anotar(vitima, { tipo: 'defendeu' });     // quem defendeu fica sabendo (é com ele: o escudo dele caiu longe)
        lances.push({ tipo: 'defesa', n: vitima.n, o });
        soltar(s);                               // o escudo sai voando e cai longe: é preciso ir buscar
        s.grupo.rotation.set(0, Math.atan2(-dir.z, dir.x), 0);
        const lado = (rodadas + vitima.n) % 2 ? 1 : -1;
        cair(s, vitima.x + dir.x * 1.2 - dir.z * 1.6 * lado, meuLado(vitima.z + dir.z * 1.2 + dir.x * 1.6 * lado), 1.5, chegada.dur);
        cair(o, vitima.x - dir.x * 1.1 + 0.3, meuLado(vitima.z - dir.z * 1.1), 0.7, 0, [chegada]);   // o objeto bate e volta um pouco
        continue;
      }
      autor.pontos++;
      const chegada = chegar(o, vitima, dir, () => { pancada(o, vitima, dir, 1); festejar(autor.n); apitar(fim ? 'fim' : 'ponto', autor.n); });
      vitima.caido = 2;                          // o resto desta rodada e a próxima inteira
      vitima.pow = 2;
      vitima.guarda = false;
      vitima.grito.escrever(o.tipo.grito);
      if (o.tipo.lambuza) vitima.lambuzado = 3;
      // ele cai para longe de onde veio a pancada: o eixo da queda, no referencial do próprio robô
      const yaw = vitima.rumo * GIRO, c = Math.cos(yaw), sn = Math.sin(yaw);
      Object.assign(vitima.vis, { atraso: chegada.dur, tombo: { x: dir.x * sn + dir.z * c, z: -(dir.x * c - dir.z * sn) } });
      diagnosticos[autor.n].mensagem += ` — acertou o jogador ${vitima.n} com ${o.nome}`;
      diagnosticos[vitima.n].mensagem += ` — foi acertado por ${o.nome}`;
      lances.push({ tipo: 'acerto', n: autor.n, o });
      reprises.push({ o, autor: autor.n, vitima: vitima.n, dir: { x: dir.x, z: dir.z }, chega: chegada.dur, desde: o.lancado, rodada: rodadas, nome: o.nome });
      for (const [mao, dx] of [['segurando', 0.7], ['escudo', -0.7]]) {      // o que ele segurava cai ao lado
        const s = vitima[mao];
        if (!s) continue;
        vitima[mao] = null;
        soltar(s);
        cair(s, vitima.x + dx, vitima.z + 0.3 * vitima.lado, 0.3, chegada.dur);
      }
      cair(o, vitima.x + dir.x * 0.7 + 0.2, vitima.z + dir.z * 0.7, 0.9, 0, [chegada]);    // quica para trás dele
    }
    for (const J of [jog[1], jog[2]]) { if (jaAcabou) J.feito = null; else anunciar(J, de[J.n], jogadas[J.n]); }   // para quem assiste: o que cada um fez
    // Vence quem chega aos pontos na frente. Se os dois chegam juntos, o jogo segue até um passar.
    const [a, b] = [jog[1].pontos, jog[2].pontos];
    if (!fim && Math.max(a, b) >= PONTOS_PARA_VENCER && a !== b) fim = a > b ? 1 : 2;
    if (a + b !== pontosAntes) anotarPlacar();   // o placar mudou: as duas iAs ficam sabendo por texto
    for (const J of [jog[1], jog[2]]) {          // o que dura algumas rodadas vai passando
      if (J.caido) J.caido--;
      if (J.pow) J.pow--;
      if (J.lambuzado) J.lambuzado--;
      // Segurar o escudo levantado cansa o braço: cada rodada assim gasta um de fôlego, e sem
      // fôlego o escudo abaixa sozinho. Com o escudo abaixado (ou sem ele), o braço descansa.
      if (J.guarda && J.escudo) {
        if (--J.folego <= 0) {
          J.folego = 0; J.guarda = false;
          anotar(J, { tipo: 'bracoCansado' });
          diagnosticos[J.n].mensagem += ' — o braço cansou: o escudo abaixou';
        }
      } else if (J.folego < FOLEGO_DO_ESCUDO) J.folego++;
    }
    // o registro das jogadas, para quem assiste: o que cada um fez nesta rodada e quantas vezes pediu a imagem antes
    // a vez: a rodada fechou e a seguinte já está aberta. Quem não jogou fica sabendo que perdeu a rodada.
    if (!fim) for (const J of [jog[1], jog[2]])
    {
      // Junto vai o que a jogada DELE fez, ou por que não valeu ("bloqueado: linha da quadra",
      // "nada ao alcance"...): sem isso a iA só descobriria olhando a imagem. É só a parte que
      // é com ele (o que vem antes do travessão): o que aconteceu com o adversário não vai.
      const j = jogadas[J.n], d = diagnosticos[J.n];
      if (!j) anotar(J, { tipo: 'rodadaPerdida', n: rodadas, rodada: rodadas + 1 }, 'vez');
      else anotar(J, { tipo: d.ok ? 'rodada' : 'rodadaFalhou', n: rodadas, rodada: rodadas + 1, botao: j.botao, fez: d.mensagem.split(' — ')[0] }, 'vez');
    }
    historico.push({ rodada: rodadas, 1: Object.assign({ olhou: jog[1].olhadas }, diagnosticos[1]), 2: Object.assign({ olhou: jog[2].olhadas }, diagnosticos[2]) });
    // o comentarista fica sabendo de tudo o que os dois fizeram
    narrar({ tipo: 'narraRodada', n: rodadas, a: nomeDe(jog[1]), fezA: diagnosticos[1].mensagem, b: nomeDe(jog[2]), fezB: diagnosticos[2].mensagem });
    for (const J of [jog[1], jog[2]]) for (const j of [jogadas[J.n]]) if (j && j.botao === 'ESPACO' && diagnosticos[J.n].ok && !lances.some(l => l.n === J.n)) lances.push({ tipo: 'pegou', n: J.n });
    diretor.lances = lances;                     // a câmera dinâmica escolhe o ângulo pelo que aconteceu
    if (a + b !== pontosAntes) {                 // saiu ponto: o placar fica e a quadra volta ao começo (a menos que o jogo tenha acabado)
      historico.push({ marca: fim ? `Fim de jogo: ${nomeDe(jog[1])} ${a} x ${b} ${nomeDe(jog[2])}` : `Ponto! ${nomeDe(jog[1])} ${a} x ${b} ${nomeDe(jog[2])} — a quadra é arrumada` });
      narrar({ tipo: fim ? 'narraFim' : 'narraPonto', a: nomeDe(jog[1]), pa: a, pb: b, b: nomeDe(jog[2]), venceu: fim ? nomeDe(jog[fim]) : '' });
      // A reprise: daqui a pouco, o lance passa de novo em câmera lenta. Com a aba escondida
      // o navegador não desenha nada, e a reprise só atrasaria o jogo.
      const reprisa = REPLAY && reprises.length > 0 && !document.hidden;
      if (reprisa) {
        reprises.forEach((r, i) => Object.assign(r, { dur: duracaoDoReplay(rodadas - r.desde, r.chega), parte: reprises.length > 1 ? `${i + 1}/${reprises.length}` : '' }));
        replay.pedido = { em: performance.now() + ANTES_DO_REPLAY * 1000, fila: reprises };
      }
      if (!fim) {
        const espera = reprisa ? ANTES_DO_REPLAY + reprises.reduce((soma, r) => soma + r.dur, 0) + 0.1 : PAUSA_DO_PONTO;
        if (espera > 0) { pausa.ativa = true; pausa.relogio = setTimeout(arrumarQuadra, espera * 1000); }
        else arrumarQuadra();
      }
    }
    if (historico.length > 400) historico.shift();
    jog[1].olhadas = jog[2].olhadas = 0;
    hudVelho = true;
    desenharPlacar();
    atualizarPainel();
    desenharRegistro();
  }

  // ---------- o robô da casa ----------
  // Joga no lado que ninguém pegou. É simples de propósito: busca o objeto mais próximo,
  // anda até ficar na frente do adversário e arremessa. Às vezes hesita.
  function decidirBot(J) {
    if (!COM_BOT || fim || J.caido || sorte() < 0.2) return null;
    const O = jog[3 - J.n], frente = J.n === 1 ? 0 : 4;
    const virarPara = rumo => { const d = (((rumo - J.rumo) % 8) + 8) % 8; return d === 0 ? null : d <= 4 ? 'A' : 'D'; };
    if (J.segurando) {
      if (naMira(J, O)) return 'ESPACO';
      const dx = O.x - J.x;
      if (Math.abs(dx) < 0.3) return virarPara(frente) || 'ESPACO';
      return virarPara(dx > 0 ? 6 : 2) || 'W';   // anda de lado até alinhar com ele
    }
    let perto = null, menor = Infinity;
    for (const o of objetos) {                   // (ele não usa escudo)
      if (o.estado !== 'chao' || o.tipo.escudo || o.z * J.lado < 0) continue;
      const dist = Math.hypot(o.x - J.x, o.z - J.z);
      if (dist < menor) { menor = dist; perto = o; }
    }
    if (!perto) return virarPara(frente);
    if (alvoDe(J, true) === perto) return 'ESPACO';
    return virarPara(Math.round(Math.atan2(-(perto.x - J.x), -(perto.z - J.z)) / GIRO)) || 'W';
  }

  // ---------- rodadas ----------
  let relogio = null;
  // O jogador n passou a ser controlado por `tipo` ('ia' ou 'humano'). Devolve true se isso
  // mudou alguma coisa.
  //   desafio M: quando o segundo jogador entra, a partida começa (do zero).
  //   treino:    quem assume o lado do robô da casa com a partida andando faz ela recomeçar.
  function entrar(n, tipo) {
    const J = jog[n], antes = J.controle;
    if (J.ausente) J.desde = Date.now();         // voltou: o relógio dele recomeça daqui
    J.ausente = false; J.faltas = 0;
    if (antes === tipo) return false;
    J.controle = tipo;
    J.pronto = tipo !== 'ia' || !PERGUNTAR_PRONTO;                // a iA ainda vai responder ao juiz (ver ficarPronto)
    if (tipo === 'humano') { J.avisado = true; J.dono = null; }   // quem está no teclado vê a tela: não precisa de aviso
    hudVelho = true;
    desenharPlacar();
    desenharRegistro();
    if (antes === 'ninguem') { if (presentes()) apresentar(); }
    else if (antes === 'bot' && rodadas > 0) novaPartida();
    return true;
  }
  // Desafio M: os dois entraram. Quem estava pendurado aguardando o outro recebe as regras — e,
  // com elas, a pergunta do juiz: está pronto? A partida só começa quando os dois respondem.
  function apresentar() {
    for (const J of [jog[1], jog[2]]) {
      if (J.esperas.length) J.avisado = true;
      for (const e of J.esperas.splice(0)) { clearTimeout(e.relogio); e.pronto({ aviso: 'inicio' }); }
    }
    hudVelho = true;
    if (valendo()) iniciar();                    // (no teclado, ou sem a pergunta do juiz, já começa)
  }
  // Os dois estão prontos: a partida começa do zero, o juiz apita e o tempo passa a contar.
  // Quem já tinha respondido e estava esperando o outro recebe o aviso 'valendo'.
  function iniciar() {
    novaPartida(true);
    for (const J of [jog[1], jog[2]]) for (const e of J.esperas.splice(0)) { clearTimeout(e.relogio); e.pronto({ aviso: 'valendo' }); }
  }
  // A chamada de um jogador fica pendurada até a partida andar (o outro entrar, ou ficar
  // pronto) ou até passarem `segundos`; aí volta com `aviso` ('espera': o outro ainda não
  // entrou; 'esperaPronto': o outro ainda não respondeu ao juiz).
  function aguardar(J, segundos, aviso = 'espera') {
    hudVelho = true;
    if (!segundos) return Promise.resolve({ aviso });
    return new Promise(pronto => {
      const e = { pronto, relogio: setTimeout(() => { J.esperas.splice(J.esperas.indexOf(e), 1); pronto({ aviso }); }, segundos * 1000) };
      J.esperas.push(e);
    });
  }
  // O botão PRONTO: a resposta à pergunta do juiz. Com os dois prontos a partida começa; até
  // lá, a chamada de quem já respondeu fica pendurada esperando o outro.
  function ficarPronto(J, tipo) {
    if (valendo()) return Promise.resolve();     // a partida já está valendo: não muda nada
    if (!J.pronto) {
      J.pronto = true;
      rotular(J, 'PRONTO!', '#1f9d55');
      tocar('pega');
      hudVelho = true;
    }
    if (valendo()) { iniciar(); return Promise.resolve({ aviso: 'valendo' }); }
    return aguardar(J, tipo === 'ia' ? ESPERA.ia : 0, 'esperaPronto');
  }
  // O botão T: escreve um texto curto na telinha da barriga do robô. É só um recado para o
  // adversário e para quem assiste: não é uma jogada e, como a imagem (F), não gasta rodada.
  function escreverNaBarriga(J, texto) {
    const f = frenteDe(J);
    J.texto = Array.from(String(texto == null ? '' : texto)).slice(0, 10).join('');
    J.corpo.escrever(J.texto);
    diagnosticos[J.n] = { comando: 'T', ok: true, mensagem: `escreveu "${J.texto}"` };
    rotular(J, J.texto ? `NA BARRIGA: "${J.texto.toUpperCase()}"` : 'APAGOU A BARRIGA', COR_CSS[J.n]);
    particulas.soltar('brilho', J.x + f.x * 0.3, 0.6, J.z + f.z * 0.3, 0, 0, [0x5dffa0, 0xffffff], 6);
    historico.push({ marca: J.texto ? `${nomeDe(J)} escreveu na barriga: "${J.texto}"` : `${nomeDe(J)} apagou o texto da barriga`, fala: true });
    if (historico.length > 400) historico.shift();
    narrar({ tipo: 'narraBarriga', a: nomeDe(J), texto: J.texto || '(nada)' });
    atualizarPainel();
    desenharRegistro();
  }
  // Registra a jogada de um jogador e devolve uma promessa que se cumpre quando a rodada
  // fecha. A promessa pode trazer um aviso em vez de a jogada valer: 'espera' (o outro
  // jogador ainda não entrou) ou 'inicio' (a partida começou; só para a iA que ainda não sabia).
  function pedir(n, botao, texto, tipo) {
    entrar(n, tipo);
    const J = jog[n];
    if (botao === 'T') { escreverNaBarriga(J, texto); return Promise.resolve(); }      // o texto não é jogada: vale na hora
    if (!presentes()) return aguardar(J, tipo === 'ia' ? ESPERA.ia : 0);                // o outro jogador ainda não entrou
    if (!J.avisado) { J.avisado = true; return Promise.resolve({ aviso: 'inicio' }); }
    if (botao === 'PRONTO') return ficarPronto(J, tipo);
    if (!J.pronto) return Promise.resolve({ aviso: 'pronto' });                         // o juiz ainda espera a resposta dele: o botão não vale
    if (!valendo()) return aguardar(J, tipo === 'ia' ? ESPERA.ia : 0, 'esperaPronto');  // ele está pronto; o outro, ainda não
    if (botao === 'PASSAR' && J.passou) {        // não se passa a vez duas rodadas seguidas: esta não vale, ele tem de jogar outra coisa
      diagnosticos[n] = { comando: 'PASSAR', ok: false, mensagem: 'já passou a vez na rodada anterior: tem de jogar' };
      rotular(J, '✖ JÁ PASSOU: TEM DE JOGAR', '#b3261e');
      tocar('erro');
      atualizarPainel();
      return Promise.resolve({ aviso: 'semPassar' });
    }
    if (J.pendente) J.pendente.pronto();         // trocou de ideia antes de a rodada fechar (só no teclado)
    return new Promise(pronto => {
      J.pendente = { botao, texto, pronto };
      J.jogouEm = Date.now();
      hudVelho = true;
      conferir();
    });
  }
  // Abre a rodada seguinte: o relógio de cada jogador começa a contar. desde: a hora em que
  // ele começou a pensar; banco: o que já pensou nesta rodada antes disso (ver segurar).
  function abrirRodada() {
    aberta = Date.now(); prazo = 0;
    for (const J of [jog[1], jog[2]]) { J.desde = aberta; J.banco = 0; }
  }
  function conferir() {
    if (pausa.ativa) return;                     // na pausa de um ponto nenhuma rodada fecha: as jogadas esperam
    // De quem a rodada precisa para fechar: dos dois — menos o robô da casa e, no teclado, quem largou o jogo.
    // (Uma iA que sumiu continua na conta: a rodada espera por ela — ver segurar.)
    const reais = [jog[1], jog[2]].filter(J => J.controle !== 'bot' && !(J.ausente && J.controle !== 'ia'));
    if (reais.every(J => J.pendente)) return fechar();
    if (!relogio) {                              // alguém jogou e falta o outro: há um prazo
      const comIA = reais.some(J => J.controle === 'ia'), segundos = comIA ? ESPERA.ia : ESPERA.teclado;
      prazo = Date.now() + segundos * 1000;
      relogio = setTimeout(comIA ? segurar : fechar, segundos * 1000);
    }
  }
  // O prazo passou e falta a jogada de alguém, numa partida com iA. Quem estourou o tempo pela
  // primeira vez perde a vez: a rodada fecha sem ele (é o que dá aflição no cronômetro em cima
  // da cabeça dele). Mas se ele já tinha faltado na rodada anterior, é porque sumiu — e aí a
  // rodada NÃO fecha: o jogo fica parado, para ninguém jogar sozinho contra quem não reage. A
  // iA que já tinha jogado recebe a chamada de volta com o aviso 'aguarde' (a jogada dela é
  // desfeita: ela joga de novo e espera mais um prazo), e quem sumiu aparece como "sumiu" (o
  // lugar dele pode então passar para outra iA: ver sentar). Qualquer chamada dele o traz de
  // volta. No teclado, a jogada de quem já jogou fica guardada.
  function segurar() {
    const faltou = [jog[1], jog[2]].filter(J => J.controle !== 'bot' && !J.pendente && !J.ausente);
    if (faltou.length && faltou.every(J => J.faltas === 0)) return fechar();
    clearTimeout(relogio);
    relogio = null; prazo = 0;
    const agora = Date.now();
    for (const J of [jog[1], jog[2]]) {
      if (J.controle === 'bot') continue;
      if (J.pendente) {
        if (J.controle !== 'ia') continue;
        const p = J.pendente;
        J.pendente = null;
        J.banco += Math.max(0, J.jogouEm - J.desde); J.desde = agora;     // o que ela já pensou fica guardado, e o relógio dela volta a correr
        rotular(J, 'ESPERANDO O OUTRO', '#5b6770');                        // a jogada dela não valeu: a etiqueta da rodada passada sai
        p.pronto({ aviso: 'aguarde' });
      } else if (!J.ausente && ++J.faltas >= 2) {
        J.ausente = true;
        J.banco += Math.max(0, agora - J.desde);                           // enquanto está sumido, o relógio dele para
        rotular(J, 'SUMIU: JOGO PARADO', '#b3261e');
      }
    }
    hudVelho = true;
  }
  function fechar() {
    clearTimeout(relogio);
    relogio = null;
    const jogadas = {}, prontos = [], agora = Date.now();
    for (const J of [jog[1], jog[2]]) {
      if (J.pendente) {
        jogadas[J.n] = J.pendente;
        prontos.push(J.pendente.pronto);
        J.pendente = null;
        J.faltas = 0;
        J.gasto += J.banco + Math.max(0, J.jogouEm - J.desde);   // o tempo que levou para jogar nesta rodada
        J.jogadas++;
      } else if (J.controle === 'bot') {
        const botao = decidirBot(J);
        jogadas[J.n] = botao && { botao, texto: '' };
      } else if (!J.ausente) {                   // (só no teclado: com uma iA na partida a rodada não fecha sem os dois)
        J.gasto += J.banco + agora - J.desde;    // pensou a rodada inteira e não jogou
        if (++J.faltas >= 2) J.ausente = true;   // largou o jogo: as rodadas param de esperar por ele
      } else J.gasto += J.banco;
    }
    resolver(jogadas);
    abrirRodada();                               // começa a contar a rodada seguinte
    if (pausa.ativa) pausa.prontos.push(...prontos);         // saiu ponto: as respostas esperam a quadra ser arrumada
    else prontos.forEach(pronto => pronto());
  }
  // minutos:segundos
  const relogioDe = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  // O tempo total do jogador: a soma de tudo o que ele levou para jogar em cada rodada, mais
  // o que já passou desta, se ainda não jogou. É um relógio que só corre enquanto ele pensa.
  function tempoDe(J) {
    if (!valendo() || fim || pausa.ativa || J.controle === 'bot') return J.gasto;
    return J.gasto + J.banco + (J.pendente ? Math.max(0, J.jogouEm - J.desde) : J.ausente ? 0 : Math.max(0, Date.now() - J.desde));
  }
  // O que o jogador está fazendo nesta rodada: null (não se aplica), ou se já jogou e um texto com o tempo.
  function situacao(J) {
    if (!valendo() || fim || pausa.ativa || J.controle === 'bot' || jog[3 - J.n].controle === 'bot') return null;   // contra o robô da casa ninguém espera ninguém
    const agora = Date.now();
    if (J.pendente) return { jogou: true, texto: `jogou em ${relogioDe(J.jogouEm - aberta)}` };
    if (J.ausente) return { jogou: false, texto: 'sumiu' };
    return { jogou: false, texto: `pensando ${relogioDe(agora - aberta)}` + (prazo ? ` · fecha em ${Math.max(0, Math.ceil((prazo - agora) / 1000))} s` : '') };
  }

  // ---------- câmeras e desenho ----------
  const camTV = new T.PerspectiveCamera(40, 16 / 9, 0.1, 300);
  camTV.layers.enable(CAMADA[1]); camTV.layers.enable(CAMADA[2]);
  // A câmera da transmissão gira em volta de um ponto da quadra. Quem assiste escolhe uma das
  // vistas prontas (os botões na tela, ou a tecla C) e pode mexer com o mouse: arrastar gira,
  // a roda aproxima e afasta, o botão direito (ou Shift + arrastar) desloca. As duas últimas
  // vistas são os olhos de cada jogador, em tela cheia.
  const VISTAS = [
    { nome: 'Transmissão', de: [14.5, 9.6, 0], para: [2.3, 0, 0] },   // olha um pouco para cá do meio: sobra lugar embaixo para as vistas dos jogadores
    { nome: 'Dinâmica (diretor)', diretor: true },                   // muda sozinha, procurando o melhor ângulo de cada lance (ver dirigir)
    { nome: 'De cima', de: [0.5, 21, 0], para: [0, 0, 0] },
    { nome: 'Atrás do jogador 1', de: [0, 6.5, 11.5], para: [0, 0.4, -1] },
    { nome: 'Atrás do jogador 2', de: [0, 6.5, -11.5], para: [0, 0.4, 1] },
    { nome: 'Rente à rede', de: [9.5, 1.7, 0], para: [0, 0.7, 0] },
    { nome: 'Olhos do jogador 1', olhos: 1 },
    { nome: 'Olhos do jogador 2', olhos: 2 },
  ];
  // Uma órbita: o ponto para onde a câmera olha (x, y, z), a distância até ele, o giro em
  // volta dele e a altura (o ângulo a partir da vertical: 0 = bem de cima).
  const orbitaDe = v => {
    const d = [v.de[0] - v.para[0], v.de[1] - v.para[1], v.de[2] - v.para[2]], dist = Math.hypot(...d);
    return { x: v.para[0], y: v.para[1], z: v.para[2], dist, giro: Math.atan2(d[2], d[0]), alto: Math.acos(d[1] / dist) };
  };
  const cam = { vista: 0, olhos: 0, livre: false, meta: orbitaDe(VISTAS[0]), atual: orbitaDe(VISTAS[0]), tranco: 0 };
  function escolherVista(i) {
    const v = VISTAS[i];
    cam.vista = i; cam.livre = false; cam.olhos = v.olhos || 0;
    if (v.diretor) diretor.plano = '';
    else if (!v.olhos) cam.meta = orbitaDe(v);
    marcarVista();
  }
  function moverCamera(k, dt) {                  // k = fração do caminho até onde a câmera deve estar
    const a = cam.atual, m = cam.meta;
    for (const c of ['x', 'y', 'z', 'dist', 'alto']) a[c] += (m[c] - a[c]) * k;
    a.giro += Math.atan2(Math.sin(m.giro - a.giro), Math.cos(m.giro - a.giro)) * k;   // pelo lado mais curto
    const s = Math.sin(a.alto);
    camTV.position.set(a.x + a.dist * s * Math.cos(a.giro), a.y + a.dist * Math.cos(a.alto), a.z + a.dist * s * Math.sin(a.giro));
    if (cam.tranco > 0.01) {                     // uma pancada sacode a câmera
      camTV.position.x += Math.sin(tempo * 97) * 0.08 * cam.tranco;
      camTV.position.y += Math.sin(tempo * 131) * 0.08 * cam.tranco;
      cam.tranco *= Math.exp(-dt * 7);
    }
    camTV.lookAt(a.x, a.y, a.z);
  }
  // A câmera dinâmica: um "diretor" que escolhe o plano pelo que está acontecendo. Um objeto
  // no ar: vai atrás dele, de olho em quem ele vai acertar. Alguém pegou um objeto, defendeu
  // ou foi acertado: fecha nele. Fim de jogo: roda em volta de quem venceu. Sem nada disso,
  // reveza a cada poucos segundos entre a vista geral, o duelo visto de lado e o ombro de cada
  // jogador. A troca de plano é um corte seco; dentro do plano a câmera acompanha macio.
  const diretor = { plano: '', quem: 0, desde: 0, vez: 0, lances: null, objeto: null };
  const orbita = (de, para) => orbitaDe({ de, para });
  function planoDe(nome, n) {
    const P = jog[n || 1].vis, O = jog[3 - (n || 1)].vis;
    if (nome === 'duelo') { const z = (jog[1].vis.z + jog[2].vis.z) / 2; return orbita([11.5, 2.4, z], [0, 0.9, z]); }
    if (nome === 'ombro') {
      const dx = P.x - O.x, dz = P.z - O.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
      return orbita([limitar(P.x + ux * 3.2 + uz * 1.2, -4.4, 7), 2.7, limitar(P.z + uz * 3.2 - ux * 1.2, -6.6, 6.6)], [P.x + (O.x - P.x) * 0.55, 0.7, P.z + (O.z - P.z) * 0.55]);
    }
    if (nome === 'perto') {
      const f = frenteDe(jog[n]);
      return orbita([limitar(P.x + f.x * 2.8 + 1.7, -4.4, 8), 1.6, limitar(P.z + f.z * 2.8, -6.6, 6.6)], [P.x, 0.8, P.z]);
    }
    if (nome === 'voo') {
      const o = diretor.objeto, p = o.grupo.position, V = jog[3 - o.dono] ? jog[3 - o.dono].vis : O, dir = o.dir || { x: 0, z: 0 };
      return orbita([limitar(p.x - dir.x * 4 + 2.2, -4.4, 8), 3, limitar(p.z - dir.z * 4, -6.6, 6.6)], [p.x + (V.x - p.x) * 0.6, 0.8, p.z + (V.z - p.z) * 0.6]);
    }
    if (nome === 'festa') return { x: P.x, y: 0.9, z: P.z, dist: 4.8, giro: tempo * 0.35, alto: 1.2 };
    return orbitaDe(VISTAS[0]);
  }
  function dirigir() {
    if (!VISTAS[cam.vista].diretor || cam.livre || cam.olhos) return;
    const d = diretor, ha = tempo - d.desde, lances = d.lances || [];
    d.lances = null;
    const lance = ['acerto', 'defesa', 'arremesso', 'pegou'].map(tipo => lances.find(l => l.tipo === tipo)).find(Boolean);
    const voando = objetos.filter(o => o.estado === 'voo').sort((a, b) => b.lancado - a.lancado)[0];
    let nome = d.plano, n = d.quem;
    if (!valendo()) nome = 'geral';
    else if (fim) { nome = 'festa'; n = fim; }
    else if (lance && lance.tipo === 'acerto') { nome = 'perto'; n = 3 - lance.n; }      // fecha em quem levou
    else if (lance && lance.tipo === 'defesa') { nome = 'perto'; n = lance.n; }
    else if (voando) { nome = 'voo'; n = voando.dono; d.objeto = voando; }
    else if (lance && lance.tipo === 'pegou' && ha > 1.2) { nome = 'perto'; n = lance.n; }
    else if (!pausa.ativa && (nome === 'voo' || nome === 'festa' || !nome || ha > (nome === 'geral' ? 7 : 5))) {
      d.vez = (d.vez + 1) % 4;
      nome = (jog[1].segurando && jog[2].segurando ? ['duelo', 'ombro', 'duelo', 'ombro'] : ['geral', 'ombro', 'duelo', 'ombro'])[d.vez];
      n = d.vez === 1 ? 1 : 2;
    }
    const mudou = nome !== d.plano || n !== d.quem;
    if (mudou) { d.plano = nome; d.quem = n; d.desde = tempo; }
    cam.meta = planoDe(nome, n);
    if (mudou) cam.atual = Object.assign({}, cam.meta);
  }
  // o mouse
  const limitar = (v, a, b) => Math.max(a, Math.min(b, v));
  let arrasto = null;
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    arrasto = { x: e.clientX, y: e.clientY, desloca: e.button !== 0 || e.shiftKey, andou: 0 };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!arrasto) return;
    const dx = e.clientX - arrasto.x, dy = e.clientY - arrasto.y, m = cam.meta;
    arrasto.x = e.clientX; arrasto.y = e.clientY;
    arrasto.andou += Math.abs(dx) + Math.abs(dy);
    if (arrasto.andou < 4) return;               // ainda é um clique, não um arrasto
    if (cam.olhos || !cam.livre) { cam.olhos = 0; cam.livre = true; marcarVista(); }   // mexeu: a câmera fica solta
    if (arrasto.desloca) {
      // Desloca a vista como quem puxa a imagem com a mão: para os lados e para cima e para
      // baixo NA TELA (não pelo chão, o que de cima pareceria aproximar e afastar). O ponto
      // para onde a câmera olha anda pela direita e pelo "para cima" da própria câmera, o
      // tanto que o mouse andou: k é quantos metros vale um pixel àquela distância.
      const k = 2 * m.dist * Math.tan(camTV.fov * Math.PI / 360) / altura;
      const c = Math.cos(m.giro), s = Math.sin(m.giro), deitada = Math.cos(m.alto), emPe = Math.sin(m.alto);
      m.x = limitar(m.x - s * dx * k - deitada * c * dy * k, -14, 14);
      m.y = limitar(m.y + emPe * dy * k, -3, 10);
      m.z = limitar(m.z + c * dx * k - deitada * s * dy * k, -14, 14);
    } else {                                     // gira em volta do ponto
      m.giro += dx * 0.006;
      m.alto = limitar(m.alto - dy * 0.006, 0.03, 1.52);
    }
  });
  canvas.addEventListener('pointerup', e => {
    const clique = arrasto && arrasto.andou < 4;
    arrasto = null;
    if (!clique) return;
    // clicar numa das vistas pequenas, embaixo, põe os olhos daquele jogador em tela cheia
    const l = Math.round(Math.min(largura * 0.27, 420)), a = Math.round(l * FRAME.a / FRAME.l), y = altura - e.clientY;
    if (y < 56 || y > 56 + a) return;
    if (e.clientX >= 14 && e.clientX <= 14 + l) escolherVista(VISTAS.findIndex(v => v.olhos === 1));
    else if (e.clientX >= largura - 14 - l && e.clientX <= largura - 14) escolherVista(VISTAS.findIndex(v => v.olhos === 2));
  });
  canvas.addEventListener('dblclick', () => escolherVista(cam.vista));     // dois cliques: volta à vista escolhida
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (cam.olhos) return;
    cam.meta.dist = limitar(cam.meta.dist * Math.exp(e.deltaY * 0.0012), 2.5, 45);
    if (!cam.livre) { cam.livre = true; marcarVista(); }
  }, { passive: false });
  const camJ = [null];
  for (const n of [1, 2]) {
    const c = new T.PerspectiveCamera(75, FRAME.l / FRAME.a, 0.05, 300);
    c.rotation.order = 'YXZ';
    c.layers.enable(CAMADA[3 - n]);              // vê o corpo do outro, não o seu
    camJ.push(c);
  }
  const camSombra = new T.PerspectiveCamera();   // "vê" tudo: é com ela que as sombras são calculadas
  camSombra.layers.enableAll();
  const alvoDescartavel = new T.WebGLRenderTarget(1, 1);

  // O que vai por cima da imagem (placar, faixas): um desenho 2D para cada vista.
  const cenaHud = new T.Scene(), camHud = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const hud = {};
  for (const [qual, l, a] of [['tv', 1280, 720], ['replay', 1280, 720], [1, FRAME.l, FRAME.a], [2, FRAME.l, FRAME.a]]) {
    const c = document.createElement('canvas');
    c.width = l; c.height = a;
    const textura = new T.CanvasTexture(c);
    textura.colorSpace = T.SRGBColorSpace;
    hud[qual] = { canvas: c, textura };
  }
  const folhaHud = new T.Mesh(new T.PlaneGeometry(2, 2), new T.MeshBasicMaterial({ map: hud.tv.textura, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  folhaHud.position.z = -0.5;
  cenaHud.add(folhaHud);

  const NOME_DO_CONTROLE = { bot: 'robô da casa', humano: 'teclado', ia: 'iA', ninguem: 'aguardando…' };
  const COR_DE_ESPERA = 'rgba(28, 38, 50, 0.92)';
  function faixa(g, l, a, cor, linhas, alt = a * 0.26, y = a * 0.24) {
    g.fillStyle = cor;
    cantos(g, l * 0.2, y, l * 0.6, alt, alt * 0.14); g.fill();
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (linhas.length === 1) { g.font = `bold ${alt * 0.42}px Arial, sans-serif`; g.fillText(linhas[0], l / 2, y + alt * 0.54, l * 0.56); return; }
    g.font = `bold ${alt * 0.4}px Arial, sans-serif`; g.fillText(linhas[0], l / 2, y + alt * 0.36, l * 0.56);
    g.font = `bold ${alt * 0.23}px Arial, sans-serif`; g.fillText(linhas[1], l / 2, y + alt * 0.74, l * 0.56);
  }
  function desenharHud() {
    hudVelho = false;
    // transmissão: placar colorido, quem controla cada robô e, no fim, quem venceu
    let c = hud.tv.canvas, g = c.getContext('2d'), l = c.width, a = c.height;
    g.clearRect(0, 0, l, a);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    // Tudo numa faixa só, no alto, para não tapar a quadra: de fora para dentro, o nome de
    // guerra com a situação e o tempo, a caixa de pontos e, no meio, a rodada.
    const Y = 12, ALT = 86, CAIXA = 108, VAO = 78, INFO = 316, RELOGIO = 104;
    for (const n of [1, 2]) {
      const J = jog[n], lado = n === 1 ? -1 : 1, s = situacao(J);
      const x = l / 2 + lado * (VAO / 2 + CAIXA / 2) - CAIXA / 2;          // a caixa de pontos
      // a caixa de quem ainda não jogou nesta rodada ganha uma borda acesa; a de quem já jogou esmaece
      g.globalAlpha = s && s.jogou ? 0.55 : 1;
      g.fillStyle = COR_CSS[n]; cantos(g, x, Y, CAIXA, ALT, 16); g.fill();
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.font = 'bold 64px Consolas, "Courier New", monospace'; g.fillText(String(J.pontos), x + CAIXA / 2, Y + ALT / 2 + 4);
      g.globalAlpha = 1;
      if (s && !s.jogou && !J.ausente) { g.strokeStyle = '#ffd83a'; g.lineWidth = 6; cantos(g, x - 4, Y - 4, CAIXA + 8, ALT + 8, 19); g.stroke(); }
      if (J.escudo) {                            // o fôlego do braço do escudo: um traço por rodada que ele ainda aguenta levantado
        const passo = (CAIXA - 12) / FOLEGO_DO_ESCUDO;
        for (let i = 0; i < FOLEGO_DO_ESCUDO; i++) {
          g.fillStyle = i >= J.folego ? 'rgba(255,255,255,0.28)' : J.guarda ? '#ffd83a' : '#7dffb0';
          g.fillRect(x + 6 + i * passo + 2, Y + ALT + 7, passo - 4, 7);
        }
      }
      // ao lado, para fora: nome de guerra, o que está fazendo nesta rodada, quem joga e a média por jogada
      const borda = n === 1 ? x - 10 : x + CAIXA + 10, texto = borda + lado * 14, cabe = INFO - RELOGIO - 30;
      g.fillStyle = 'rgba(10,14,18,0.78)'; cantos(g, n === 1 ? borda - INFO : borda, Y, INFO, ALT, 12); g.fill();
      g.textAlign = n === 1 ? 'right' : 'left';
      const m = J.modelo && J.controle === 'ia' ? 1 : 0;                   // com o modelo embaixo do nome, as linhas apertam um pouco
      g.fillStyle = COR_CSS[n]; g.font = `bold ${m ? 22 : 25}px Arial, sans-serif`; g.fillText(nomeDe(J), texto, Y + (m ? 17 : 23), cabe);
      if (m) { g.fillStyle = '#e8eef2'; g.font = '13px Arial, sans-serif'; g.fillText(J.modelo, texto, Y + 36, cabe); }
      if (s) { g.fillStyle = s.jogou ? '#7dffb0' : '#ffd83a'; g.font = `bold ${m ? 14 : 15}px Arial, sans-serif`; g.fillText((s.jogou ? '✓ ' : '') + s.texto, texto, Y + (m ? 54 : 48), cabe); }
      g.fillStyle = '#cfd8de'; g.font = `${m ? 12 : 14}px Arial, sans-serif`;
      g.fillText(NOME_DO_CONTROLE[J.controle] + (J.jogadas ? ` · média ${(J.gasto / J.jogadas / 1000).toFixed(1).replace('.', ',')} s por jogada` : ''), texto, Y + (m ? 72 : 69), cabe);
      // na ponta de fora: o relógio do jogador, o tempo total que ele já levou para jogar. Corre enquanto ele pensa.
      if (J.controle === 'ia' || J.controle === 'humano') {
        const meio = borda + lado * (INFO - RELOGIO / 2 - 8), corre = s && !s.jogou && !J.ausente;
        g.fillStyle = 'rgba(255,255,255,0.08)'; cantos(g, meio - RELOGIO / 2, Y + 8, RELOGIO, ALT - 16, 10); g.fill();
        g.textAlign = 'center';
        g.fillStyle = '#9fb0ba'; g.font = 'bold 11px Arial, sans-serif'; g.fillText('TEMPO TOTAL', meio, Y + 22, RELOGIO - 8);
        g.fillStyle = corre ? '#ffd83a' : '#ffffff'; g.font = 'bold 34px Consolas, "Courier New", monospace'; g.fillText(relogioDe(tempoDe(J)), meio, Y + 52, RELOGIO - 10);
      }
    }
    g.textAlign = 'center';
    g.fillStyle = '#ffffff'; g.font = 'bold 40px Arial, sans-serif'; g.fillText('×', l / 2, Y + 30);
    if (valendo()) { g.font = 'bold 13px Arial, sans-serif'; g.fillText('rodada', l / 2, Y + 58); g.font = 'bold 17px Arial, sans-serif'; g.fillText(String(rodadas + (fim ? 0 : 1)), l / 2, Y + 76); }
    const fora = [1, 2].filter(n => jog[n].controle === 'ninguem'), sumido = [jog[1], jog[2]].find(J => J.controle === 'ia' && J.ausente);
    if (fora.length) faixa(g, l, a, COR_DE_ESPERA, [fora.length === 2 ? 'AGUARDANDO OS JOGADORES' : `AGUARDANDO O JOGADOR ${fora[0]}`], a * 0.12, a * 0.17);
    else if (fim) faixa(g, l, a, COR_CSS[fim], [`${nomeDe(jog[fim]).toUpperCase()} VENCEU!`], a * 0.12, a * 0.17);   // estreita e no alto, para não tapar a quadra
    else if (!valendo()) faixa(g, l, a, COR_DE_ESPERA, ['O JUIZ PERGUNTA: PRONTOS?', 'falta responder: ' + [jog[1], jog[2]].filter(J => !J.pronto).map(nomeDe).join(' e ')], a * 0.16, a * 0.17);
    else if (sumido) faixa(g, l, a, COR_DE_ESPERA, [`JOGO PARADO: AGUARDANDO ${nomeDe(sumido).toUpperCase()}`], a * 0.1, a * 0.17);
    // o comentarista: uma etiqueta com o nome dele e, enquanto fala, a legenda (só na transmissão)
    if (naCabine()) {
      if (narrador.fala && performance.now() > narrador.fala.ate) narrador.fala = null;
      g.textAlign = 'left'; g.textBaseline = 'middle';
      if (narrador.fala) {
        const LARG = 580, x = l / 2 - LARG / 2, linhas = [];
        g.font = 'bold 22px Arial, sans-serif';
        let linha = '';
        for (const palavra of narrador.fala.texto.split(/\s+/)) {
          const tenta = linha ? linha + ' ' + palavra : palavra;
          if (linha && g.measureText(tenta).width > LARG - 40) { linhas.push(linha); linha = palavra; } else linha = tenta;
        }
        if (linha) linhas.push(linha);
        const alt = 40 + linhas.length * 28, y = a - 150 - alt;
        g.fillStyle = 'rgba(22, 14, 38, 0.88)'; cantos(g, x, y, LARG, alt, 12); g.fill();
        g.fillStyle = '#8a5fbf'; g.fillRect(x + 8, y + 10, 5, alt - 20);
        g.fillStyle = '#c9b3e6'; g.font = 'bold 15px Arial, sans-serif'; g.fillText(`🎙 ${narrador.nome}` + (narrador.modelo ? ` · ${narrador.modelo}` : ''), x + 24, y + 19, LARG - 40);
        g.fillStyle = '#ffffff'; g.font = 'bold 22px Arial, sans-serif';
        linhas.forEach((texto, i) => g.fillText(texto, x + 24, y + 48 + i * 28, LARG - 40));
      } else {
        g.font = 'bold 14px Arial, sans-serif';
        const texto = `🎙 Comentarista: ${narrador.nome}` + (narrador.modelo ? ` · ${narrador.modelo}` : ''), larg = g.measureText(texto).width + 22;
        const x = l / 2 - VAO / 2 - CAIXA - 10 - INFO;       // no canto, embaixo do quadro do jogador 1: ali não tapa as etiquetas dos robôs
        g.fillStyle = 'rgba(22, 14, 38, 0.8)'; cantos(g, x, Y + ALT + 8, larg, 26, 8); g.fill();
        g.fillStyle = '#c9b3e6'; g.fillText(texto, x + 11, Y + ALT + 22);
      }
    }
    hud.tv.textura.needsUpdate = true;
    // cada jogador: placar sem legenda (o dele primeiro), a torta na cara e o resultado
    for (const n of [1, 2]) {
      const J = jog[n];
      c = hud[n].canvas; g = c.getContext('2d'); l = c.width; a = c.height;
      g.clearRect(0, 0, l, a);
      if (J.lambuzado) {                         // torta na cara: o creme cobre boa parte da vista
        const rnd = aleatorio(31 + J.lambuzado);
        g.fillStyle = 'rgba(255,251,240,0.96)';
        for (let i = 0; i < 46; i++) { g.beginPath(); g.arc(l * (0.12 + 0.76 * rnd()), a * (0.12 + 0.76 * rnd()), (0.05 + 0.1 * rnd()) * l * (J.lambuzado > 1 ? 1 : 0.6), 0, 7); g.fill(); }
      }
      if (J.caido) {                             // tonto: estrelas na vista
        g.fillStyle = '#ffd83a'; g.strokeStyle = '#c98a00'; g.lineWidth = 4;
        for (const [x, y] of [[0.3, 0.3], [0.52, 0.2], [0.72, 0.34]]) {
          g.beginPath();
          for (let i = 0; i < 10; i++) { const ang = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? 22 : 52; g.lineTo(l * x + Math.cos(ang) * r, a * y + Math.sin(ang) * r); }
          g.closePath(); g.fill(); g.stroke();
        }
      }
      // placar: o nome e os pontos de quem olha vêm primeiro. Embaixo de cada nome, se já jogou
      // nesta rodada (✓) ou ainda não (…) e o tempo que já gastou na partida.
      const O = jog[3 - n];
      g.fillStyle = 'rgba(10, 14, 18, 0.72)'; cantos(g, l / 2 - 250, 12, 500, 84, 12); g.fill();
      g.fillStyle = '#ffffff'; g.textBaseline = 'middle';
      g.font = 'bold 42px Consolas, "Courier New", monospace'; g.textAlign = 'center';
      g.fillText(`${J.pontos} x ${O.pontos}`, l / 2, 44);
      // (O modelo de quem olha vai embaixo do nome dele: é assim que a iA vê que o que mandou
      // valeu. O do adversário não aparece aqui: os dois modelos são só para quem assiste.)
      const meuModelo = J.controle === 'ia' && J.modelo;
      g.font = 'bold 24px Arial, sans-serif';
      g.textAlign = 'right'; g.fillText(nomeDe(J), l / 2 - 76, meuModelo ? 31 : 40, 160);
      if (meuModelo) { g.font = '14px Arial, sans-serif'; g.fillStyle = '#cfd8de'; g.fillText(J.modelo, l / 2 - 76, 51, 160); g.fillStyle = '#ffffff'; g.font = 'bold 24px Arial, sans-serif'; }
      g.textAlign = 'left'; g.fillText(nomeDe(O), l / 2 + 76, 40, 160);
      g.font = 'bold 17px Arial, sans-serif';
      for (const [K, alinhar, x] of [[J, 'right', l / 2 - 76], [O, 'left', l / 2 + 76]]) {
        const s = situacao(K);
        if (!s) continue;
        g.textAlign = alinhar; g.fillStyle = s.jogou ? '#7dffb0' : '#ffd83a';
        // para quem olha, a pergunta é "posso jogar?": SUA VEZ enquanto ele não jogou nesta rodada
        const oQue = K === J ? (s.jogou ? '✓ você já jogou' : 'SUA VEZ') : s.jogou ? '✓ jogou' : K.ausente ? 'sumiu' : '… pensando';
        g.fillText(`${oQue}  ${relogioDe(tempoDe(K))}`, x, 72, 170);
      }
      g.textAlign = 'center'; g.fillStyle = '#ffffff';
      if (valendo() && !fim) { g.font = 'bold 13px Arial, sans-serif'; g.fillStyle = '#cfd8de'; g.fillText(`rodada ${rodadas + 1}`, l / 2, 76); g.fillStyle = '#ffffff'; }
      if (J.escudo) {                            // o fôlego do braço do escudo
        g.fillStyle = 'rgba(10, 14, 18, 0.72)'; cantos(g, 16, a - 66, 190, 50, 10); g.fill();
        g.textAlign = 'left'; g.font = 'bold 15px Arial, sans-serif';
        g.fillStyle = J.guarda ? '#ffd83a' : '#ffffff'; g.fillText(J.guarda ? 'escudo levantado' : 'escudo abaixado', 28, a - 49);
        for (let i = 0; i < FOLEGO_DO_ESCUDO; i++) {
          g.fillStyle = i >= J.folego ? 'rgba(255,255,255,0.28)' : J.folego <= 1 ? '#f0a59b' : '#7dffb0';
          g.fillRect(28 + i * 41, a - 34, 35, 9);
        }
        g.textAlign = 'center';
      }
      if (!presentes()) faixa(g, l, a, COR_DE_ESPERA, ['AGUARDANDO O OUTRO JOGADOR'], a * 0.16);
      else if (!valendo()) faixa(g, l, a, COR_DE_ESPERA, J.pronto ? ['VOCÊ ESTÁ PRONTO', 'aguardando o outro jogador'] : ['O JUIZ PERGUNTA: PRONTO?', 'aperte PRONTO para começar'], a * 0.22);
      else if (fim === n) faixa(g, l, a, 'rgba(20, 120, 62, 0.93)', ['PARABÉNS!', 'VOCÊ CONSEGUIU!']);
      else if (fim) faixa(g, l, a, 'rgba(170, 40, 34, 0.93)', ['VOCÊ PERDEU!']);
      hud[n].textura.needsUpdate = true;
    }
  }
  function desenharPlacar() {
    const g = placar.canvas.getContext('2d');
    g.fillStyle = '#12161a'; g.fillRect(0, 0, 512, 208);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    // de frente para a placa, o jogador 1 (em +z) fica à esquerda; em cima, os nomes de guerra
    for (const [n, x] of [[1, 128], [2, 384]]) {
      g.fillStyle = COR_CSS[n];
      // (sem o modelo de cada um: esta placa aparece na imagem dos jogadores, e os modelos são só para quem assiste a transmissão)
      g.font = 'bold 36px Arial, sans-serif'; g.fillText(nomeDe(jog[n]), x, 34, 236);
      g.font = 'bold 128px Consolas, "Courier New", monospace'; g.fillText(String(jog[n].pontos), x, 134);
    }
    g.fillStyle = '#e8eef2'; g.font = 'bold 80px Arial, sans-serif'; g.fillText('×', 256, 128);
    placar.textura.needsUpdate = true;
  }

  // O cronômetro em cima do robô: quanto tempo ele já está pensando nesta rodada (em décimos de
  // segundo, que é para dar aflição). Fica vermelho quando há um objeto do adversário no ar,
  // vindo. Quando ele joga, vira um ✓ verde com o tempo que levou.
  function cronometrar(J) {
    // Enquanto ninguém jogou, conta o tempo que ele está pensando. Quando o outro joga, passa a
    // ser uma contagem regressiva: o tempo que resta para ele jogar antes de perder a vez.
    const u = J.sinal3d.userData, jogou = !!J.pendente, pensou = Math.max(0, J.banco + (jogou ? J.jogouEm - J.desde : J.ausente ? 0 : Date.now() - J.desde));
    const resta = !jogou && !J.ausente && prazo ? Math.max(0, prazo - Date.now()) : -1, ms = resta >= 0 ? resta : pensou;
    const perigo = !jogou && (objetos.some(o => o.estado === 'voo' && o.dono !== J.n) || (resta >= 0 && resta < 5000));
    const texto = J.ausente ? 'sumiu' : ms < 60000 ? (ms / 1000).toFixed(1).replace('.', ',') + ' s' : relogioDe(ms);
    const chave = `${jogou}|${perigo}|${resta >= 0}|${texto}`;
    if (chave === u.chave) return;
    u.chave = chave;
    const g = u.tela.getContext('2d');
    g.clearRect(0, 0, 256, 96);
    g.fillStyle = jogou ? '#1f9d55' : perigo ? '#d6382e' : resta >= 0 ? '#b85c00' : '#20262c';
    g.strokeStyle = jogou ? '#0e5c30' : '#ffd83a'; g.lineWidth = 6; g.lineJoin = g.lineCap = 'round';
    cantos(g, 6, 6, 244, 66, 22); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(112, 70); g.lineTo(128, 92); g.lineTo(144, 70); g.closePath(); g.fill();    // a ponta do balão
    g.strokeStyle = g.fillStyle = '#ffffff'; g.lineWidth = 6;
    if (jogou) { g.beginPath(); g.moveTo(28, 40); g.lineTo(42, 54); g.lineTo(66, 24); g.stroke(); }
    else {                                       // o relógio: a caixa, o botão e o ponteiro, que dá uma volta a cada segundo
      const a = (resta >= 0 ? -1 : 1) * (ms % 1000) / 1000 * 2 * Math.PI - Math.PI / 2;
      g.beginPath(); g.arc(46, 42, 19, 0, 7); g.stroke();
      if (resta >= 0) { g.globalAlpha = 0.45; g.beginPath(); g.moveTo(46, 42); g.arc(46, 42, 19, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * Math.min(1, resta / (ESPERA.ia * 1000))); g.closePath(); g.fill(); g.globalAlpha = 1; }   // a fatia do tempo que resta
      g.beginPath(); g.moveTo(46, 23); g.lineTo(46, 15); g.moveTo(39, 14); g.lineTo(53, 14); g.stroke();
      g.lineWidth = 5; g.beginPath(); g.moveTo(46, 42); g.lineTo(46 + Math.cos(a) * 13, 42 + Math.sin(a) * 13); g.stroke();
    }
    g.font = 'bold 40px Consolas, "Courier New", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(texto, 160, 41, 150);
    u.textura.needsUpdate = true;
  }
  // Aproxima o desenho dos robôs e dos objetos do estado do jogo: k = fração do caminho (1 =
  // chega de uma vez, sem animação: é assim a imagem que vai para a iA).
  let tempo = 0, parado = false;                // parado: sem balanço, para a imagem que vai para a iA
  const eixoDaQueda = new T.Vector3();
  function posar(k, dt) {
    for (const b of bandeiras) b.eixo.rotation.y = b.base + (parado ? 0.25 : Math.sin(tempo * 2.6 + b.fase) * 0.45);
    for (const J of [jog[1], jog[2]]) {
      const v = J.vis, c = J.corpo;
      // Quem foi alvejado só reage quando o objeto chega nele (v.atraso, em segundos): até lá
      // continua de pé, com a guarda como estava.
      if (v.atraso > 0) v.atraso = k >= 1 ? 0 : Math.max(0, v.atraso - dt);
      const antes = v.atraso > 0, caido = J.caido && !antes;
      const meta = { x: J.x, z: J.z, yaw: J.rumo * GIRO, braco: J.segurando ? BRACO.estendido : BRACO.caido };
      if (!antes) { meta.queda = J.caido ? 1 : 0; meta.guarda = J.guarda ? 1 : 0; }
      for (const campo in meta) v[campo] += (meta[campo] - v[campo]) * k;
      v.pulo = Math.max(0, v.pulo - dt * 4);
      v.lance = k >= 1 ? 0 : Math.max(0, v.lance - dt * 3.2);
      v.estouro = antes ? 0 : k >= 1 ? 1 : Math.min(1, v.estouro + dt * 4);
      const mole = parado ? 0 : Math.sin(tempo * 5 + J.n * 2) * 0.025, pulo = parado ? 0 : Math.sin(v.pulo * Math.PI);
      const bote = v.lance > 0 ? Math.sin((1 - v.lance) * Math.PI) : 0;     // o arremesso: o braço sobe e desce, e o corpo vai junto
      c.grupo.visible = J.controle !== 'ninguem';          // desafio M: quem não entrou ainda não está na quadra
      c.grupo.position.set(v.x, 0, v.z);
      c.grupo.rotation.y = v.yaw;
      c.eixo.quaternion.setFromAxisAngle(eixoDaQueda.set(v.tombo.x, 0, v.tombo.z).normalize(), v.queda * Math.PI / 2);   // cai para longe da pancada
      c.eixo.position.y = v.queda * 0.23;
      c.corpo.position.y = pulo * 0.1;
      c.corpo.rotation.x = -0.28 * bote;
      c.corpo.scale.set(1 - mole + pulo * 0.05, 1 + mole * 2 - pulo * 0.1, 1 - mole + pulo * 0.05);   // gelatina
      c.braco.rotation.x = v.braco + (caido ? 1.9 * v.queda : 0) + bote * 1.5;
      // braço esquerdo: em guarda, sobe e vem para a frente do corpo, com o escudo; senão, balança solto
      c.outro.rotation.x = caido ? 1.9 * v.queda : v.guarda * 1.5 + (parado || v.guarda > 0.5 ? 0 : Math.sin(tempo * 3 + J.n) * 0.12);
      c.outro.rotation.z = caido ? -0.8 * v.queda : v.guarda * 0.5;
      c.estrelas.visible = !!caido;
      c.estrelas.rotation.y = parado ? 0.6 : tempo * 4;
      v.cara = caido ? 'tonto' : fim === J.n ? 'feliz' : 'normal';
      c.olhar(v.cara);
      // em cima do robô, o cronômetro de quem está pensando (ou o ✓ de quem já jogou e espera o outro)
      J.sinal3d.visible = valendo() && !fim && !pausa.ativa && J.controle !== 'bot' && !J.caido && !J.pow;
      if (J.sinal3d.visible) { cronometrar(J); J.sinal3d.position.set(v.x, 1.74, v.z); }
      const estouro = parado ? 1 : 0.3 + 0.7 * v.estouro + 0.35 * Math.sin(Math.PI * v.estouro);    // o balão do grito aparece estourando
      J.grito.sprite.visible = J.pow > 0 && !antes;
      J.grito.sprite.position.set(J.x, 1.75, J.z);
      J.grito.sprite.scale.set(1.9 * estouro, 0.95 * estouro, 1);
      // o que ele acabou de fazer (ver anunciar): a etiqueta em cima dele, o sinal no chão e o brilho do escudo
      const feito = J.feito, idade = feito ? tempo - feito.em : 9, mostra = !!feito && !parado && !replay.ativo && c.grupo.visible;
      const etiqueta = J.etiqueta.sprite, chao = J.noChao, sinal = mostra && feito.sinal;
      etiqueta.visible = mostra && !J.grito.sprite.visible;
      if (etiqueta.visible) {
        const salto = 1 + Math.max(0, 0.18 - idade) * 2;                 // aparece com um pulinho; depois de uns segundos, esmaece
        etiqueta.position.set(v.x, 2.3, v.z);
        etiqueta.scale.set(2.3 * salto, 0.503 * salto, 1);
        etiqueta.material.opacity = idade < 3.5 ? 1 : 0.55;
      }
      chao.grupo.visible = !!sinal && idade < 2.6;
      if (chao.grupo.visible) {
        const tam = sinal.tam * (sinal.tipo === 'anel' ? 0.7 + idade * 0.9 : 1);   // o anel do escudo vai abrindo
        chao.material.map = TEX_SINAL[sinal.tipo];
        chao.material.color.set(sinal.cor || COR[J.n]);
        chao.material.opacity = Math.min(1, (1 - idade / 2.6) * 2.2);
        chao.grupo.position.set(sinal.x, 0.03, sinal.z);
        chao.grupo.rotation.y = sinal.giro + (sinal.tipo === 'curva' ? (sinal.espelho ? 1 : -1) * (Math.min(1, idade * 2) - 1) * 0.6 : 0);   // a volta gira para o lado em que ele virou
        chao.folha.scale.set(sinal.espelho ? -tam : tam, sinal.comp || tam, 1);
      }
      v.brilho = k >= 1 ? 0 : Math.max(0, v.brilho - dt * 1.4);
      J.aura.visible = !parado && !!J.escudo && v.guarda > 0.3;
      if (J.aura.visible) { J.aura.material.opacity = 0.32 + 0.68 * v.brilho + 0.08 * Math.sin(tempo * 6); J.aura.scale.setScalar(1.05 + v.brilho); }
    }
    for (const o of objetos) {
      const w = o.vis, f = o.fisica, p = o.grupo.position, voando = o.estado === 'voo';
      if (o.estado === 'mao') {                              // na mão: quieto, do jeito que se segura
        Object.assign(w, { ang: 0, incl: 0, amassa: 0, treme: -1 });
        o.miolo.rotation.set(0, 0, 0); o.grupo.scale.setScalar(1);
        o.sombra.visible = o.rastro.visible = false;
        continue;
      }
      let tr = null;
      if (o.anim && k >= 1) { const u = o.anim.trechos[o.anim.trechos.length - 1]; p.set(u.x, u.y, u.z); o.anim = null; }
      else if (o.anim) tr = avancar(o, dt);
      // No ar ele roda do jeito dele; entre uma rodada e outra, parado no ar, roda devagar e
      // flutua; no chão, termina a volta e descansa deitado.
      const ritmo = tr ? (tr.giro === undefined ? 1 : tr.giro) : voando ? 0.1 : 0;
      if (parado) { w.ang = voando ? 0.7 : 0; w.incl = voando ? f.incl || 0 : 0; w.amassa = 0; w.treme = -1; if (voando) p.y = 1.05; }
      else {
        w.ang += f.vel * ritmo * dt;
        if (!tr && !voando && f.eixo !== 'y') w.ang += (Math.round(w.ang / (2 * Math.PI)) * 2 * Math.PI - w.ang) * Math.min(1, k * 1.5);
        w.incl += ((voando || (tr && tr.voo) ? f.incl || 0 : 0) - w.incl) * Math.min(1, k * 1.2);
        w.amassa = Math.max(0, w.amassa - dt * 7);
        if (voando && !tr) p.y = 1.05 + Math.sin(tempo * 3.1 + o.i) * 0.035;
      }
      o.miolo.rotation.set(f.eixo === 'x' ? w.ang : 0, f.eixo === 'y' ? w.ang : 0, (f.eixo === 'z' ? -w.ang : 0) + w.incl);
      if (w.treme >= 0) {                                    // a tampa que acabou de cair bamboleia como uma moeda, cada vez mais rápido e mais baixo
        w.treme += dt;
        if (w.treme > 1.2 || o.anim) w.treme = -1;
        else {
          const resta = 1 - w.treme / 1.2, tomba = 0.55 * resta * resta, fase = 16 * w.treme + 22 * w.treme * w.treme;
          o.miolo.rotation.x = tomba * Math.cos(fase); o.miolo.rotation.z = tomba * Math.sin(fase);
          p.y = o.tipo.y * ESCALA + 0.3 * Math.sin(tomba);
        }
      }
      const s = w.amassa * f.mole, estica = tr && tr.voo ? 0.16 * f.mole : 0;                       // amassa quando bate, estica quando voa
      o.grupo.scale.set(1 + 0.3 * s + estica, 1 - 0.45 * s - estica * 0.4, 1 + 0.3 * s - estica * 0.4);
      // a mancha de sombra fica no chão, debaixo dele, e some com a altura
      o.sombra.visible = true;
      o.sombra.position.y = (0.006 - p.y) / o.grupo.scale.y;
      o.sombra.material.opacity = Math.max(0, 1 - p.y / 2.4);
      o.rastro.visible = voando || !!(tr && tr.voo);
      o.matRastro.opacity = tr && tr.voo ? 0.8 : voando ? 0.32 : 0;
    }
  }
  // O que precisa ser guardado para a animação continuar de onde estava depois de uma imagem
  // para a iA (que mostra tudo já no lugar, sem animação): ver frame.
  function guardar() {
    return { j: [jog[1], jog[2]].map(J => Object.assign({}, J.vis, { tombo: J.vis.tombo })),
      o: objetos.map(o => ({ anim: o.anim && Object.assign({}, o.anim, { de: o.anim.de && Object.assign({}, o.anim.de) }), vis: Object.assign({}, o.vis), p: o.grupo.position.clone() })) };
  }
  function repor(g) {
    [jog[1], jog[2]].forEach((J, i) => Object.assign(J.vis, g.j[i]));
    objetos.forEach((o, i) => { o.anim = g.o[i].anim; Object.assign(o.vis, g.o[i].vis); o.grupo.position.copy(g.o[i].p); });
  }
  // ---------- replay ----------
  // Cada rodada é filmada: enquanto os objetos voam e quicam, o desenho dos robôs, dos objetos
  // e dos estilhaços é fotografado a cada quadro (um "clipe" por rodada). Quando alguém é
  // acertado, a reprise passa esses quadros de novo, devagar — desde a rodada do arremesso,
  // emendando só o voo do objeto das rodadas do meio — com uma câmera que vai atrás do objeto
  // e termina rodeando quem caiu. É só para quem assiste: as imagens das iAs mostram sempre o
  // jogo como está, e a quadra só é arrumada (e as respostas só saem) depois da reprise.
  const clipes = [];                             // { rodada, t0, quadros: [{ t, f }] }
  const replay = { pedido: null, fila: [], ativo: false, fita: null, dados: null, t0: 0, i: 0, impacto: 0, antes: 0, bateu: false, alvo: new T.Vector3() };
  const CORTE = 0.42;                            // das rodadas anteriores à do acerto, só o começo (o voo do objeto) entra na reprise
  // A que altura da reprise fica o instante t (em segundos) da rodada do acerto: perto da
  // pancada (que acontece em `chega`) o tempo passa a um quarto da velocidade.
  const tempoNaFita = (t, chega) => {
    const a = Math.max(0, chega - 0.1), b = chega + 0.45;
    return t < a ? t / 0.6 : t < b ? a / 0.6 + (t - a) / 0.25 : a / 0.6 + (b - a) / 0.25 + (t - b) / 0.55;
  };
  const duracaoDoReplay = (rodadasAntes, chega) => rodadasAntes * CORTE / 0.7 + tempoNaFita(chega + 1.0, chega) + 0.3;
  function gravar() {
    clipes.push({ rodada: rodadas, t0: performance.now(), quadros: [] });
    if (clipes.length > 4) clipes.shift();
  }
  function filmar(agora) {
    const c = clipes[clipes.length - 1];
    if (!REPLAY || !c || replay.ativo || agora - c.t0 > 2600) return;
    if (c.quadros.length && agora - c.t0 - c.quadros[c.quadros.length - 1].t * 1000 < 14) return;   // no máximo uns 60 quadros por segundo: mais que isso só gasta memória
    c.quadros.push({ t: Math.max(0, agora - c.t0) / 1000, f: fotografar() });
  }
  // O desenho de agora: de cada robô, de cada objeto (e na mão de quem está) e dos estilhaços.
  function fotografar() {
    return {
      j: [jog[1], jog[2]].map(J => {
        const c = J.corpo, g = J.grito.sprite;
        return { ver: c.grupo.visible, x: c.grupo.position.x, z: c.grupo.position.z, yaw: c.grupo.rotation.y, eq: c.eixo.quaternion.clone(), ey: c.eixo.position.y,
          cy: c.corpo.position.y, cr: c.corpo.rotation.x, cs: c.corpo.scale.clone(), b: c.braco.rotation.x, ox: c.outro.rotation.x, oz: c.outro.rotation.z,
          est: c.estrelas.visible, er: c.estrelas.rotation.y, cara: J.vis.cara, gv: g.visible, gx: g.position.x, gz: g.position.z, ge: g.scale.x, gt: J.grito.texto, sv: J.sinal3d.visible };
      }),
      o: objetos.map(o => ({ pai: o.grupo.parent, p: o.grupo.position.clone(), q: o.grupo.quaternion.clone(), s: o.grupo.scale.clone(), mq: o.miolo.quaternion.clone(),
        sv: o.sombra.visible, sy: o.sombra.position.y, so: o.sombra.material.opacity, rv: o.rastro.visible, ro: o.matRastro.opacity })),
      p: particulas.vivas ? { m: particulas.malha.instanceMatrix.array.slice(), c: particulas.malha.instanceColor.array.slice() } : null,
    };
  }
  // Põe na cena o desenho f — ou, com g, um ponto entre f e g (u de 0 a 1): é o que deixa a câmera lenta lisa.
  function revelar(f, g, u) {
    const entre = (a, b) => g ? a + (b - a) * u : a;
    [jog[1], jog[2]].forEach((J, i) => {
      const c = J.corpo, a = f.j[i], b = g ? g.j[i] : a, s = J.grito.sprite, e = entre(a.ge, b.ge);
      c.grupo.visible = a.ver;
      c.grupo.position.set(entre(a.x, b.x), 0, entre(a.z, b.z));
      c.grupo.rotation.y = entre(a.yaw, b.yaw);
      c.eixo.quaternion.copy(a.eq).slerp(b.eq, g ? u : 0);
      c.eixo.position.y = entre(a.ey, b.ey);
      c.corpo.position.y = entre(a.cy, b.cy);
      c.corpo.rotation.x = entre(a.cr, b.cr);
      c.corpo.scale.copy(a.cs).lerp(b.cs, g ? u : 0);
      c.braco.rotation.x = entre(a.b, b.b);
      c.outro.rotation.x = entre(a.ox, b.ox); c.outro.rotation.z = entre(a.oz, b.oz);
      c.estrelas.visible = a.est; c.estrelas.rotation.y = entre(a.er, b.er);
      c.olhar(a.cara);
      J.grito.escrever(a.gt);
      s.visible = a.gv; s.position.set(a.gx, 1.75, a.gz); s.scale.set(e, e / 2, 1);
      J.sinal3d.visible = a.sv;
    });
    objetos.forEach((o, i) => {
      const a = f.o[i], b = g && g.o[i].pai === a.pai ? g.o[i] : a, t = b === a ? 0 : u;    // saiu da mão entre um quadro e o outro: não mistura
      if (o.grupo.parent !== a.pai) a.pai.add(o.grupo);
      o.grupo.position.copy(a.p).lerp(b.p, t);
      o.grupo.quaternion.copy(a.q).slerp(b.q, t);
      o.grupo.scale.copy(a.s).lerp(b.s, t);
      o.miolo.quaternion.copy(a.mq).slerp(b.mq, t);
      o.sombra.visible = a.sv; o.sombra.position.y = a.sy; o.sombra.material.opacity = a.so;
      o.rastro.visible = a.rv; o.matRastro.opacity = a.ro;
    });
    const m = particulas.malha.instanceMatrix, cores = particulas.malha.instanceColor;
    if (!f.p) m.array.fill(0);
    else {
      const de = f.p.m, ate = g && g.p ? g.p.m : de;
      for (let i = 0; i < de.length; i++) m.array[i] = de[i] + (ate[i] - de[i]) * (g ? u : 0);
      cores.array.set(f.p.c); cores.needsUpdate = true;
    }
    m.needsUpdate = true;
  }
  const camReplay = new T.PerspectiveCamera(46, 16 / 9, 0.08, 300);
  camReplay.layers.enable(CAMADA[1]); camReplay.layers.enable(CAMADA[2]);
  // Começa a reprise seguinte da fila (a do acerto; ou, se os dois se acertaram, uma de cada vez).
  function comecarReplay(agora) {
    if (replay.pedido) { replay.fila = replay.pedido.fila.slice(); replay.pedido = null; }
    const d = replay.fila.shift(), fita = [];
    if (!d) return acabarReplay();
    let base = 0;
    for (const c of clipes) {
      if (c.rodada < d.desde || c.rodada > d.rodada) continue;
      const ultimo = c.rodada === d.rodada;
      for (const q of c.quadros) {
        if (q.t > (ultimo ? d.chega + 1.0 : CORTE)) break;
        fita.push({ tp: base + (ultimo ? tempoNaFita(q.t, d.chega) : q.t / 0.7), f: q.f });
      }
      if (!ultimo) base += CORTE / 0.7;
      else replay.impacto = base + tempoNaFita(d.chega, d.chega);
    }
    if (fita.length < 2) return comecarReplay(agora);    // não deu para filmar (a página estava parada): fica sem esta reprise
    // de que lado a câmera vai: o que a deixa mais para dentro da quadra; no meio, o que tem a arquibancada de fundo
    const V = jog[d.vitima], esquerda = para(d.dir, 1), fora = V.x * esquerda.x + V.z * esquerda.z;
    d.lado = Math.abs(fora) > 0.3 ? -Math.sign(fora) : esquerda.x >= 0 ? 1 : -1;
    Object.assign(replay, { ativo: true, fita, dados: d, t0: agora, i: 0, antes: 0, bateu: false });
    document.body.classList.add('reprise');     // os painéis da página saem da frente (ver o estilo no fim do arquivo)
    // por cima da imagem: as tarjas de cinema e o letreiro
    const c = hud.replay.canvas, g = c.getContext('2d'), l = c.width, a = c.height;
    g.clearRect(0, 0, l, a);
    g.fillStyle = '#000000'; g.fillRect(0, 0, l, 72); g.fillRect(0, a - 72, l, 72);
    g.fillStyle = '#e5383b'; g.beginPath(); g.arc(48, 36, 11, 0, 7); g.fill();
    g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillStyle = '#ffffff'; g.font = 'bold 34px Arial, sans-serif'; g.fillText('REPLAY' + (d.parte ? '  ' + d.parte : ''), 72, 38);
    g.textAlign = 'right'; g.fillStyle = '#cfd8de'; g.font = '20px Arial, sans-serif'; g.fillText('câmera lenta', l - 40, 38);
    g.textAlign = 'center'; g.fillStyle = '#ffffff'; g.font = 'bold 28px Arial, sans-serif';
    g.fillText(`${nomeDe(jog[d.autor])} acerta ${nomeDe(jog[d.vitima])} com ${d.nome}`, l / 2, a - 36, l - 80);
    hud.replay.textura.needsUpdate = true;
  }
  function acabarReplay() {
    replay.pedido = null; replay.fila = [];
    if (!replay.ativo) return;
    replay.ativo = false; replay.fita = null;
    document.body.classList.remove('reprise');
    hudVelho = true;
  }
  // Mostra a reprise no instante tp dela (em segundos) e aponta a câmera.
  const olhoR = new T.Vector3(), miraR = new T.Vector3(), ondeO = new T.Vector3();
  function reprisar(tp) {
    const r = replay, d = r.dados, fita = r.fita, dir = d.dir, lado = d.lado;
    while (r.i < fita.length - 2 && fita[r.i + 1].tp <= tp) r.i++;
    const a = fita[r.i], b = fita[r.i + 1];
    revelar(a.f, b.f, limitar((tp - a.tp) / Math.max(1e-6, b.tp - a.tp), 0, 1));
    jog[1].sinal3d.visible = jog[2].sinal3d.visible = false;      // na reprise, sem cronômetros
    const V = jog[d.vitima].corpo.grupo.position, A = jog[d.autor].corpo.grupo.position;
    d.o.grupo.updateWorldMatrix(true, false);
    d.o.grupo.getWorldPosition(ondeO);
    if (tp < r.impacto) {
      // antes da pancada, vai atrás do objeto, um pouco acima e de lado, de olho em quem vai ser acertado
      olhoR.set(ondeO.x - dir.x * 2.5 + para(dir, lado).x * 0.9, Math.max(1.5, ondeO.y + 0.6), ondeO.z - dir.z * 2.5 + para(dir, lado).z * 0.9);
      miraR.set(ondeO.x + (V.x - ondeO.x) * 0.6, 0.85, ondeO.z + (V.z - ondeO.z) * 0.6);
    } else {
      // depois, fica perto de quem caiu e vai rodeando devagar
      if (!r.bateu) { r.bateu = true; torcida.flashes = Math.max(torcida.flashes, 1.6); }
      const g = (tp - r.impacto) * 0.16 * lado, c = Math.cos(g), s = Math.sin(g), bx = -dir.x * 3.4 + para(dir, lado).x * 1.3, bz = -dir.z * 3.4 + para(dir, lado).z * 1.3;
      olhoR.set(V.x + bx * c - bz * s, 1.6, V.z + bx * s + bz * c);
      miraR.set(V.x, 0.6, V.z);
    }
    olhoR.x = limitar(olhoR.x, -4.5, 4.6); olhoR.z = limitar(olhoR.z, -6.5, 6.5);
    if (Math.hypot(olhoR.x - A.x, olhoR.z - A.z) < 0.8) olhoR.y = Math.max(olhoR.y, 1.8);   // em cima de quem arremessou: passa por cima da cabeça dele
    const agora = performance.now(), k = r.antes ? 1 - Math.exp(-(agora - r.antes) / 1000 * 7) : 1;
    r.antes = agora;
    camReplay.position.lerp(olhoR, k);
    r.alvo.lerp(miraR, k);
    camReplay.lookAt(r.alvo);
    camReplay.fov += ((tp < r.impacto ? 46 : 41) - camReplay.fov) * k;
  }
  const para = (dir, lado) => ({ x: -dir.z * lado, z: dir.x * lado });     // o lado de quem vai na direção dir

  function apontarCamera(n) {
    const J = jog[n], v = J.vis, c = camJ[n];
    // de pé, olha para a frente e um pouco para baixo; caído, está de costas no chão, olhando o céu
    c.position.set(v.x, ALTURA_OLHOS - 0.7 * v.queda, v.z);
    c.rotation.set((olhos ? 0 : INCLINACAO) + 1.25 * v.queda, v.yaw, 0);
  }
  // ---------- os olhos do jogador ----------
  // A imagem de cada jogador é panorâmica, para lembrar o campo de visão de uma pessoa: meia
  // volta na horizontal (90° para cada lado) e, na vertical, de 35° para cima até 70° para
  // baixo. Dá para ver quem está ao lado e o chão quase até os próprios pés. Uma câmera comum
  // não abre tanto, então o mundo é desenhado nas seis faces de um cubo em volta dos olhos do
  // robô, e a imagem sai desse cubo: cada coluna é uma direção, da esquerda para a direita;
  // cada linha, uma altura do olhar. (?visao=0 volta à câmera comum, de uns 107° de largura.)
  const VISAO = ENDERECO.get('visao') === '0' ? null : { lados: 90, cima: 35, baixo: 70 };
  const olhos = VISAO && (() => {
    const grau = Math.PI / 180;
    const cubo = lado => new T.WebGLCubeRenderTarget(lado, { type: T.HalfFloatType, generateMipmaps: true, minFilter: T.LinearMipmapLinearFilter });
    const material = new T.ShaderMaterial({
      uniforms: { mapa: { value: null }, giro: { value: new T.Matrix3() }, angulos: { value: new T.Vector3(VISAO.lados * grau, VISAO.cima * grau, VISAO.baixo * grau) } },
      vertexShader: 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: [
        'uniform samplerCube mapa;', 'uniform mat3 giro;', 'uniform vec3 angulos;', 'varying vec2 vUv;',
        // (o que o three.js põe antes de todo sombreador já traz as funções de tom e de cor usadas no fim)
        'void main() {',
        '  float lado = (vUv.x - 0.5) * 2.0 * angulos.x;',                 // para que lado esta coluna olha
        '  float alto = mix(-angulos.z, angulos.y, vUv.y);',               // e a que altura esta linha olha
        '  vec3 d = giro * vec3(sin(lado) * cos(alto), sin(alto), -cos(lado) * cos(alto));',
        '  gl_FragColor = vec4(textureCube(mapa, d).rgb, 1.0);',
        '  #include <tonemapping_fragment>', '  #include <colorspace_fragment>',
        '}'].join('\n'),
      depthTest: false, depthWrite: false });
    const cenaDoOlho = new T.Scene(), folha = new T.Mesh(new T.PlaneGeometry(2, 2), material);
    folha.frustumCulled = false;
    cenaDoOlho.add(folha);
    const grande = cubo(1024), pequeno = [null, cubo(256), cubo(256)];   // o cubo da imagem inteira e o da vista pequena de cada jogador, na transmissão
    const cams = [null, 1, 2].map(n => {
      if (!n) return null;
      const c = new T.CubeCamera(0.05, 300, grande);
      c.layers.enable(CAMADA[3 - n]);            // vê o corpo do outro, não o seu
      return c;
    });
    return { grande, pequeno, material, cena: cenaDoOlho, cams };
  })();
  // Desenha o que o jogador n vê, com o que vai por cima (`folha`), no retângulo dado.
  function vistaDoJogador(n, folha, x, y, l, a) {
    if (!olhos) return vista(camJ[n], folha, [n], x, y, l, a);
    const inteira = Math.max(l, a) * renderer.getPixelRatio() > 520, c = olhos.cams[n], alvo = inteira ? olhos.grande : olhos.pequeno[n], olho = camJ[n];
    olho.updateMatrixWorld();
    // Desenhar as seis faces do cubo é o que mais custa. Por isso as vistas pequenas da
    // transmissão são refeitas uma de cada vez, quadro sim, quadro não.
    if (inteira || !alvo.feito || (quadros + n) % 2 === 0) {
      destacar([n]);
      c.position.copy(olho.position);
      c.renderTarget = alvo;
      renderer.autoClear = true;                 // as faces do cubo são limpas a cada desenho
      c.update(renderer, cena);
      renderer.autoClear = false;
      alvo.feito = true;
    }
    renderer.setViewport(x, y, l, a);
    renderer.setScissor(x, y, l, a);
    renderer.clear(true, true, false);
    olhos.material.uniforms.mapa.value = alvo.texture;
    olhos.material.uniforms.giro.value.setFromMatrix4(olho.matrixWorld);
    renderer.render(olhos.cena, camHud);
    folhaHud.material.map = folha.textura;
    renderer.clearDepth();
    renderer.render(cenaHud, camHud);
  }
  // A borda de destaque é de quem olha, e mostra em que o ESPACO dele agiria agora: o objeto
  // que ele pegaria ou, se for arremessar, o adversário, quando o arremesso acertaria. (Em
  // guarda ele não arremessa, então o adversário não ganha borda.)
  function destacar(quem) {
    for (const o of objetos) o.casca.visible = false;
    for (const J of [jog[1], jog[2]]) J.corpo.mira.visible = false;
    for (const n of quem) {
      const J = jog[n], O = jog[3 - n];
      if (fim || J.caido || !valendo()) continue;
      const o = alvoDe(J);
      if (o) o.casca.visible = true;
      else if (J.segurando && !(J.guarda && J.escudo) && !O.caido && naMira(J, O)) O.corpo.mira.visible = true;
    }
  }
  function vista(camera, folha, quem, x, y, l, a) {
    renderer.setViewport(x, y, l, a);
    renderer.setScissor(x, y, l, a);
    destacar(quem);
    renderer.clear(true, true, false);
    renderer.render(cena, camera);
    folhaHud.material.map = folha.textura;
    renderer.clearDepth();
    renderer.render(cenaHud, camHud);
  }
  // Sombras: calculadas uma vez, num desenho descartável em que tudo aparece (o corpo de
  // cada robô some da vista dele, mas tem de continuar fazendo sombra).
  function sombras() {
    renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(alvoDescartavel);
    renderer.render(cena, camSombra);
    renderer.setRenderTarget(null);
  }
  let largura = 1, altura = 1;
  let hudEm = 0;
  function desenhar(semVistas) {                 // a tela da página: a transmissão e, embaixo, o que cada jogador vê
    // o placar é refeito quando algo muda e, com a partida andando, quatro vezes por segundo (os relógios)
    const agora = performance.now();
    if (hudVelho || ((valendo() && !fim || narrador.fala) && agora - hudEm > 250)) { desenharHud(); hudEm = agora; }
    apontarCamera(1); apontarCamera(2);
    // Na reprise, a cena mostra por um instante o lance filmado (e depois volta ao jogo de agora).
    let vivo = null;
    if (replay.ativo && (agora - replay.t0) / 1000 >= replay.dados.dur) comecarReplay(agora);    // acabou esta: passa a seguinte, se houver
    if (replay.ativo) { vivo = fotografar(); reprisar(Math.max(0, agora - replay.t0) / 1000); }
    sombras();
    renderer.setScissorTest(true);
    if (vivo) {
      camReplay.aspect = largura / altura; camReplay.updateProjectionMatrix();
      vista(camReplay, hud.replay, [], 0, 0, largura, altura);
      revelar(vivo);
      renderer.setScissorTest(false);
      return;
    }
    if (cam.olhos) {                             // a vista grande são os olhos de um jogador (com o que ele vê por cima da imagem)
      const c = camJ[cam.olhos];
      c.aspect = largura / altura; c.updateProjectionMatrix();
      vistaDoJogador(cam.olhos, hud[cam.olhos], 0, 0, largura, altura);
      c.aspect = FRAME.l / FRAME.a; c.updateProjectionMatrix();
    } else {
      camTV.aspect = largura / altura;
      camTV.fov = camTV.aspect < 1.5 ? 52 : 40;  // janela estreita: abre o ângulo para a quadra caber
      camTV.updateProjectionMatrix();
      vista(camTV, hud.tv, [1, 2], 0, 0, largura, altura);
    }
    const l = Math.round(Math.min(largura * 0.27, 420)), a = Math.round(l * FRAME.a / FRAME.l), m = 14, b = 3, y = 56;
    for (const n of semVistas ? [] : [1, 2]) {
      const x = n === 1 ? m : largura - m - l;
      renderer.setScissor(x - b, y - b, l + 2 * b, a + 2 * b);
      renderer.setClearColor(COR[n]);
      renderer.clear(true, false, false);        // a moldura na cor do robô
      vistaDoJogador(n, hud[n], x, y, l, a);
    }
    renderer.setClearColor(0x000000);
    renderer.setScissorTest(false);
  }
  function definirTamanho(l, a) {
    largura = l; altura = a;
    renderer.setSize(l, a, false);
  }
  // A imagem do botão F: o que o jogador n está vendo, sempre do mesmo tamanho.
  // Mostra o jogo como ele ESTÁ — tudo no lugar, sem animação, sem torcida pulando nem
  // estilhaços — e depois devolve o desenho ao ponto em que estava: quem assiste não perde o
  // arremesso que estava no ar só porque uma iA pediu a imagem.
  function frame(n) {
    return fotoParada(() => {
      apontarCamera(n);
      sombras();
      renderer.setScissorTest(true);
      vistaDoJogador(n, hud[n], 0, 0, largura, altura);
      renderer.setScissorTest(false);
    });
  }
  function fotoParada(desenho) {
    const antes = guardar();
    parado = true;
    posar(1, 0); moverTorcida(0); moverJuiz(0);
    particulas.malha.visible = false;
    desenharHud();                               // sempre: os tempos do placar têm de ser os de agora
    const imagem = capturar(desenho);
    parado = false;
    particulas.malha.visible = true;
    repor(antes);
    posar(0, 0); moverTorcida(0); moverJuiz(0);
    desenhar();
    return imagem;
  }
  // Tira uma imagem de FRAME.l x FRAME.a sem mexer no tamanho da tela. (Redimensionar a tela a
  // cada imagem pedida, e de volta, travava a página por dezenas de milissegundos: dava para
  // ouvir na música.) O desenho é feito num canto da própria tela, em pixels de verdade, e só
  // esse canto é copiado e codificado; quem chama redesenha a tela inteira em seguida. Numa
  // janela menor que a imagem não há canto que chegue, e a tela é redimensionada como antes.
  const telaDaFoto = document.createElement('canvas');
  telaDaFoto.width = FRAME.l; telaDaFoto.height = FRAME.a;
  function capturar(desenho) {
    const densidade = renderer.getPixelRatio(), cabe = canvas.width >= FRAME.l && canvas.height >= FRAME.a, tamanho = [largura, altura];
    if (cabe) { largura = (FRAME.l + 0.01) / densidade; altura = (FRAME.a + 0.01) / densidade; }
    else { renderer.setPixelRatio(1); definirTamanho(FRAME.l, FRAME.a); }
    desenho();
    let imagem;
    if (cabe) {
      telaDaFoto.getContext('2d').drawImage(canvas, 0, canvas.height - FRAME.a, FRAME.l, FRAME.a, 0, 0, FRAME.l, FRAME.a);
      imagem = telaDaFoto.toDataURL('image/png');
      [largura, altura] = tamanho;
    } else {
      imagem = canvas.toDataURL('image/png');
      renderer.setPixelRatio(densidade);
      definirTamanho(window.innerWidth, window.innerHeight);
    }
    return imagem;
  }
  // A imagem do comentarista: a transmissão, como está no ar (sem as vistas dos jogadores).
  function frameDaTransmissao() {
    desenharHud();
    const imagem = capturar(() => desenhar(true));
    desenhar();
    return imagem;
  }
  window.addEventListener('resize', () => definirTamanho(window.innerWidth, window.innerHeight));

  let anterior = performance.now(), quadros = 0;
  function quadro(agora) {
    quadros++;
    const dt = Math.min(0.1, (agora - anterior) / 1000), k = 1 - Math.exp(-dt * 12);
    anterior = agora;
    tempo += dt;
    posar(k, dt);
    particulas.mover(dt);
    moverTorcida(dt);
    moverJuiz(dt);
    moverComentarista(dt);
    filmar(agora);
    if (replay.pedido && agora >= replay.pedido.em) comecarReplay(agora);
    dirigir(dt);
    moverCamera(k, dt);
    desenhar();
    requestAnimationFrame(quadro);
  }

  // ---------- interface (a mesma de jogo.js) ----------
  const BOTOES = new Set(['W', 'A', 'S', 'D', 'Q', 'E', 'ESPACO', 'L', 'PASSAR', 'PRONTO', 'T']);
  // Em qual robô joga a iA da conexão `quem`, que diz se chamar `nome`? Devolve 1 ou 2, ou 0
  // se não há lugar para ela. Pela ordem:
  //   1. quem já tem um robô continua nele;
  //   2. quem chega com o nome de guerra de um robô retoma esse robô: é a iA cuja ligação caiu
  //      (ou que foi reiniciada) voltando. A exceção é haver lugar livre e a dona desse nome
  //      estar no meio de uma chamada: aí são duas iAs que escolheram o mesmo nome;
  //   3. um lugar livre: no desafio M, aquele em que ninguém entrou; no treino, o do robô da
  //      casa — mas o treino é de uma iA só, então quem chega fica com o lugar da anterior;
  //   4. o lugar de uma iA que sumiu (parou de jogar, ou não faz nenhuma chamada há ABANDONO segundos).
  // Nos casos 2 e 4, e na troca do treino, a iA HERDA o robô: a partida continua como está,
  // com o mesmo placar. Um lugar ocupado por uma pessoa no teclado nunca é tomado.
  function sentar(quem, nome) {
    const agora = Date.now(), todos = [jog[1], jog[2]];
    const meu = todos.find(J => J.controle === 'ia' && J.dono === quem);
    if (meu) { meu.sinal = agora; return meu.n; }
    nome = limparNome(nome);
    const livre = todos.find(J => J.controle === (TREINO ? 'bot' : 'ninguem'));
    const emChamada = J => J.pendente || J.esperas.length;
    const sumiu = J => J.controle === 'ia' && (J.ausente || agora - J.sinal > ABANDONO * 1000);
    let herdado = nome && todos.find(J => J.controle === 'ia' && J.nome === nome && !(livre && emChamada(J)));
    if (!herdado && TREINO) herdado = todos.find(J => J.controle === 'ia');
    if (!herdado && !livre) herdado = todos.find(sumiu);
    if (herdado) {
      // as chamadas penduradas eram da ligação antiga: não há mais quem as espere
      for (const e of herdado.esperas.splice(0)) { clearTimeout(e.relogio); e.pronto({ aviso: 'lotado' }); }
      Object.assign(herdado, { dono: quem, sinal: agora, ausente: false, faltas: 0, herdou: true });
      return herdado.n;
    }
    if (!livre) return 0;
    livre.dono = quem; livre.sinal = agora;
    return livre.n;
  }
  const conexao = quem => Number.isInteger(quem) && quem > 0;
  // Aperta um botão como a iA da conexão `quem`. F devolve a imagem na hora; os outros
  // devolvem uma promessa, cumprida quando a rodada fecha (ver pedir). Sem lugar na partida,
  // a promessa traz o aviso 'lotado'.
  function apertar(botao, texto, quem, nome, modelo) {
    // SAIR é do comentarista: ele deixa a cadeira, e outra iA pode sentar. Para os outros não faz nada (nem os põe na partida).
    if (botao === 'SAIR') {
      if (!conexao(quem) || narrador.dono !== quem) return undefined;
      largarCadeira();
      return { aviso: 'saiu' };
    }
    // o comentarista (a conexão que está na cadeira, ou ele voltando com o mesmo nome por outra ligação)
    // Quem tem um robô é jogador, e nunca comentarista — mesmo que o número da conexão seja o de
    // um comentarista de antes (os números recomeçam quando o servidor é religado).
    const dito = limparNome(nome), jogando = [jog[1], jog[2]].some(J => J.controle === 'ia' && J.dono === quem);
    if (jogando && narrador.dono === quem) largarCadeira();
    if (!jogando && conexao(quem) && narrador.dono && (narrador.dono === quem ? !dito || dito === narrador.nome : dito === narrador.nome && ![jog[1], jog[2]].some(J => J.nome === dito))) {
      narrador.dono = quem;
      if (limparModelo(modelo) && limparModelo(modelo) !== narrador.modelo) { narrador.modelo = limparModelo(modelo); hudVelho = true; }
      return botaoDoNarrador(botao, texto);
    }
    const n = conexao(quem) ? sentar(quem, nome) : 0;
    if (!n) return Promise.resolve({ aviso: 'lotado' });
    if (jog[n].herdou) retomar(jog[n], nome);
    batizar(jog[n], '', modelo);                 // o modelo pode vir junto com qualquer botão (o nome, não: trocar de nome é ser outra iA)
    entrar(n, 'ia');
    if (botao === 'F') { jog[n].olhadas++; diagnosticos[n] = { comando: 'frame', ok: true, mensagem: `${FRAME.l}x${FRAME.a}` }; return frame(n); }
    if (!BOTOES.has(botao)) { diagnosticos[n] = { comando: String(botao), ok: false, mensagem: 'botão inexistente' }; return undefined; }
    return pedir(n, botao, texto, 'ia');
  }
  // Começa um desafio. `quem` é a conexão da iA que pediu (o teclado não manda nada); `cmd`
  // é o número do pedido dela no servidor e `nome`, o nome de guerra que ela escolheu.
  // Devolve true quando a página vai ser recarregada; senão false, um aviso ou uma promessa (ver aguardar).
  //   outro desafio:  recarrega a página nele. Se for o outro desafio da quadra (M ou T), a
  //                   página nova já entra com essa iA e é ela que responde ao pedido.
  //   este desafio, pedido por uma iA que não estava jogando: ela entra. No desafio M, se o
  //                   outro jogador ainda não entrou, a chamada fica aguardando por ele.
  //   este desafio, pedido por quem já estava (ou pelo teclado): começa uma partida nova.
  function comecar(desafio, quem, cmd, nome, modelo) {
    desafio = String(desafio);
    const deIA = conexao(quem);
    if (desafio === 'C') {                       // a cadeira do comentarista: não mexe na partida
      const sentou = deIA ? comentar(quem, nome, modelo) : true;
      return sentou === true ? false : { aviso: sentou };
    }
    if (desafio !== MODO) {
      const arena = desafio === 'M' || desafio === 'T';
      if (!arena && !/^[0-9]+$/.test(desafio)) return false;
      const p = new URLSearchParams();
      p.set('desafio', desafio);
      for (const chave of ['depurar', 'bot']) if (ENDERECO.has(chave)) p.set(chave, ENDERECO.get(chave));
      try {                                      // o recado para a página nova (ver o fim deste arquivo)
        if (arena && deIA) sessionStorage.setItem('quadra.entrada', JSON.stringify({ quem, cmd: cmd || 0, nome: nome || '', modelo: modelo || '' }));
        else sessionStorage.removeItem('quadra.entrada');
      } catch (e) { }
      location.search = p.toString();
      return true;
    }
    if (!deIA) { novaPartida(); return false; }
    const n = sentar(quem, nome);
    if (!n) return { aviso: 'lotado' };
    if (narrador.dono === quem) largarCadeira(); // quem entra para jogar deixa a cadeira do comentarista
    const J = jog[n], herdou = J.herdou;
    if (herdou) retomar(J, nome);
    const disseOModelo = !!limparModelo(modelo) && limparModelo(modelo) !== J.modelo && (!limparNome(nome) || limparNome(nome) === J.nome);
    batizar(J, nome, modelo);
    const mudou = entrar(n, 'ia');
    if (!presentes()) return aguardar(J, ESPERA.entrada);
    if (!mudou && !herdou && !disseOModelo) novaPartida();   // quem já estava jogando pede de novo: partida nova (a menos que só tenha vindo dizer o modelo)
    J.avisado = true;                            // a resposta deste comecar é o aviso de que a partida começou
    anotarVez(J);
    return false;
  }
  // A iA acaba de herdar o robô J (voltou depois de cair, ou ficou no lugar de quem sumiu): a
  // partida continua como está, e ela fica sabendo por texto quanto está o placar e que pode jogar.
  function retomar(J, nome) {
    const O = jog[3 - J.n];
    J.herdou = false;
    J.avisado = false;                           // ela ainda não recebeu as regras: a próxima resposta as traz
    batizar(J, nome);
    J.novas = [];
    if (valendo() && rodadas > 0) anotar(J, { tipo: 'placar', eu: nomeDe(J), meus: J.pontos, dele: O.pontos, ele: nomeDe(O) });
    anotarVez(J);
    hudVelho = true;
  }
  // O resultado do jogo para a iA da conexão `quem`: 'ganhou', 'perdeu' ou '' (não acabou, ou ela não joga).
  function resultado(quem) {
    const J = [jog[1], jog[2]].find(J => J.controle === 'ia' && J.dono === quem);
    return !fim || !J ? '' : fim === J.n ? 'ganhou' : 'perdeu';
  }

  // ---------- HUD da página ----------
  const elAjuda = document.getElementById('ajuda'), elMensagem = document.getElementById('mensagem');
  const elLog = document.getElementById('log'), elStatus = document.getElementById('status');
  const elCaixa = document.getElementById('caixa'), elEntrada = document.getElementById('entrada');
  elAjuda.textContent = 'J1:  W A S D  Q E  Espaço  L X T\nJ2:  ↑ ← ↓ →  , .  Enter   O / P\n1 2 3 M Shift+T   R H J C V B N';
  elMensagem.textContent = MENSAGEM;

  // Registro das jogadas: uma linha por rodada, com o que cada jogador fez. É só para quem
  // assiste: fica na página, por cima da transmissão, e nunca entra na imagem que as iAs
  // recebem (elas não podem saber por aqui o que o adversário fez). A tecla J esconde.
  const elRegistro = document.createElement('div');
  elRegistro.className = 'painel';
  Object.assign(elRegistro.style, { bottom: '12px', left: '50%', transform: 'translateX(-50%)', width: 'min(44vw, 760px)', boxSizing: 'border-box',
    display: 'grid', gridTemplateColumns: '2.4em 1fr 1fr', columnGap: '12px', whiteSpace: 'normal', fontSize: '12px', lineHeight: '1.4', padding: '8px 12px' });
  document.body.appendChild(elRegistro);
  function desenharRegistro() {
    const celula = (texto, estilo) => {
      const d = document.createElement('div');
      d.textContent = texto;                     // sempre como texto: os nomes de guerra vêm das iAs
      Object.assign(d.style, estilo);
      elRegistro.appendChild(d);
      return d;
    };
    elRegistro.textContent = '';
    celula('nº', { color: '#9fb0ba' });
    for (const n of [1, 2]) celula(nomeDe(jog[n]), { color: COR_CSS[n], fontWeight: 'bold' });
    const linhas = Math.max(3, Math.min(8, Math.floor(window.innerHeight / 120)));
    for (const h of historico.slice(-linhas)) {
      if (h.marca) { celula(h.marca, { gridColumn: '1 / -1', color: h.fala ? '#d9c7f2' : '#ffd83a', fontWeight: h.fala ? 'normal' : 'bold' }); continue; }   // um ponto, o fim do jogo ou uma fala do comentarista
      celula(String(h.rodada), { color: '#9fb0ba' });
      for (const n of [1, 2]) {
        const d = h[n], c = celula('', { color: d.ok ? '#e8eef2' : '#f0a59b' });
        const botao = document.createElement('b');
        botao.textContent = d.comando === 'ESPACO' ? 'Espaço' : d.comando === 'PASSAR' ? 'Passar' : d.comando;
        botao.style.color = COR_CSS[n];
        c.append(botao, ' ' + d.mensagem);
        if (d.olhou) { const olhos = document.createElement('span'); olhos.textContent = `  (imagem ×${d.olhou})`; olhos.style.color = '#9fb0ba'; c.append(olhos); }
      }
    }
    if (!historico.length) celula(valendo() ? 'as jogadas de cada rodada aparecem aqui' : 'aguardando os jogadores', { gridColumn: '1 / -1', color: '#9fb0ba' });
  }
  // As vistas da câmera: uma lista de botões, à direita. Clicar escolhe; a tecla C passa para a próxima.
  const elCameras = document.createElement('div');
  elCameras.className = 'painel';
  Object.assign(elCameras.style, { right: '14px', pointerEvents: 'auto', whiteSpace: 'normal', fontSize: '12px', lineHeight: '1.5', padding: '6px 8px', maxWidth: '215px' });
  const botoesDeVista = VISTAS.map((v, i) => {
    const b = document.createElement('div');
    b.textContent = v.nome;
    Object.assign(b.style, { cursor: 'pointer', padding: '0 6px', borderRadius: '5px' });
    b.addEventListener('click', () => escolherVista(i));
    elCameras.appendChild(b);
    return b;
  });
  const dica = document.createElement('div');
  dica.textContent = 'C troca · arrastar gira · roda aproxima · botão direito desloca · 2 cliques volta';
  Object.assign(dica.style, { color: '#9fb0ba', fontSize: '11px', lineHeight: '1.3', padding: '4px 6px 0', borderTop: '1px solid rgba(255,255,255,0.15)', marginTop: '4px' });
  elCameras.appendChild(dica);
  document.body.appendChild(elCameras);
  function marcarVista() {                       // acende o botão da vista em uso (nenhum, se a câmera foi solta com o mouse)
    botoesDeVista.forEach((b, i) => {
      const acesa = i === cam.vista && !cam.livre;
      b.style.background = acesa ? 'rgba(255,255,255,0.2)' : 'none';
      b.style.fontWeight = acesa ? 'bold' : 'normal';
    });
  }
  // Onde fica cada painel. As vistas dos jogadores, embaixo, têm um tamanho que depende da
  // largura da janela: a lista de teclas fica logo acima da do jogador 1, as câmeras acima da
  // do jogador 2, e o registro e a instrução ocupam o que sobra no meio e embaixo.
  function arrumarPaineis() {
    const l = Math.round(Math.min(window.innerWidth * 0.27, 420)), acima = `${Math.round(56 + l * FRAME.a / FRAME.l + 16)}px`;
    Object.assign(elAjuda.style, { top: 'auto', left: '14px', bottom: acima });
    elCameras.style.bottom = acima;
    elRegistro.style.width = `${Math.max(240, Math.min(760, window.innerWidth - 2 * (14 + l) - 24))}px`;
    Object.assign(elMensagem.style, { maxWidth: `${l - 20}px`, whiteSpace: 'normal', fontSize: '12px', lineHeight: '1.3', padding: '6px 10px', bottom: '8px' });
    desenharRegistro();
  }
  window.addEventListener('resize', arrumarPaineis);
  marcarVista();
  if (ENDERECO.has('depurar')) { elLog.hidden = elStatus.hidden = false; elMensagem.hidden = true; }
  function atualizarPainel() {                   // painel de depuração: só com ?depurar
    elStatus.textContent = `desafio: ${MODO}\nrodada: ${rodadas}\nplacar: ${jog[1].pontos} x ${jog[2].pontos}` + (fim ? `\nvenceu: jogador ${fim}` : '');
    elLog.textContent = [1, 2].map(n => { const d = diagnosticos[n]; return `J${n} (${NOME_DO_CONTROLE[jog[n].controle]}) › ${d.comando} — ${d.mensagem}`; }).join('\n');
  }

  // ---------- teclado ----------
  const TECLAS = {
    KeyW: [1, 'W'], KeyA: [1, 'A'], KeyS: [1, 'S'], KeyD: [1, 'D'], KeyQ: [1, 'Q'], KeyE: [1, 'E'], Space: [1, 'ESPACO'], KeyL: [1, 'L'], KeyX: [1, 'PASSAR'], KeyT: [1, 'T'],
    ArrowUp: [2, 'W'], ArrowLeft: [2, 'A'], ArrowDown: [2, 'S'], ArrowRight: [2, 'D'], Comma: [2, 'Q'], Period: [2, 'E'], Slash: [2, 'PASSAR'], Enter: [2, 'ESPACO'], NumpadEnter: [2, 'ESPACO'], KeyO: [2, 'L'], KeyP: [2, 'T'],
  };
  const ultimaTecla = { 1: 0, 2: 0 };
  let escrevendo = 0;                            // de quem é o texto que está sendo digitado
  window.addEventListener('keydown', e => {
    if (escrevendo) {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') { pedir(escrevendo, 'T', elEntrada.value, 'humano'); escrevendo = 0; elCaixa.hidden = true; }
      else if (e.code === 'Escape') { escrevendo = 0; elCaixa.hidden = true; }
      return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.code === 'KeyT' && e.shiftKey) { if (!e.repeat) comecar('T'); return; }   // Shift+T: o treino (T sozinho é o botão do texto)
    const tecla = TECLAS[e.code];
    if (tecla) {
      e.preventDefault();
      const [n, botao] = tecla;
      if (e.timeStamp - ultimaTecla[n] < INTERVALO_TECLA) return;
      ultimaTecla[n] = e.timeStamp;
      if (botao === 'T') { escrevendo = n; elCaixa.hidden = false; elEntrada.value = jog[n].texto; elEntrada.focus(); elEntrada.select(); }
      else pedir(n, botao, '', 'humano');
      return;
    }
    if (e.repeat) return;
    switch (e.code) {                            // controles da página, fora do jogo
      case 'KeyH': elAjuda.hidden = !elAjuda.hidden; break;
      case 'KeyJ': elRegistro.hidden = !elRegistro.hidden; break;
      case 'KeyC': escolherVista((cam.vista + 1) % VISTAS.length); break;
      case 'KeyV': alternarSom('musica'); break;
      case 'KeyB': alternarSom('efeitos'); break;
      case 'KeyN': alternarSom('narracao'); break;
      case 'KeyR': novaPartida(); break;
      case 'KeyM': comecar('M'); break;
      case 'Digit1': case 'Numpad1': comecar(1); break;
      case 'Digit2': case 'Numpad2': comecar(2); break;
      case 'Digit3': case 'Numpad3': comecar(3); break;
    }
  });

  // ---------- trilha sonora ----------
  // Música de ação feita aqui mesmo, com o sintetizador do navegador (Web Audio): não há
  // arquivo de som. É um laço de 8 compassos em mi menor, tocado nota a nota: baixo,
  // arpejo, melodia e bateria. A intensidade acompanha o jogo: mansa enquanto se espera,
  // cheia com a partida valendo e mais rápida quando alguém está a um ponto de vencer.
  // O navegador só deixa tocar depois de um clique ou de uma tecla na página. A tecla V liga e desliga.
  const hz = nota => 440 * Math.pow(2, (nota - 69) / 12);     // nota MIDI → frequência
  const RAIZES = [40, 40, 36, 38, 40, 40, 43, 35];            // o baixo de cada compasso: mi, mi, dó, ré, mi, mi, sol, si
  const ACORDES = [[64, 67, 71], [64, 67, 71], [60, 64, 67], [62, 66, 69], [64, 67, 71], [64, 67, 71], [67, 71, 74], [59, 63, 66]];
  const BAIXO = [0, null, 0, null, 12, null, 0, null, 0, null, 12, null, 0, null, 7, 12];   // semitons acima da raiz, a cada semicolcheia
  const MELODIA = [                             // de cada compasso: [semicolcheia em que começa, nota, duração em semicolcheias]
    [[0, 76, 2], [3, 79, 1], [4, 83, 2], [7, 79, 1], [8, 81, 2], [10, 79, 2], [12, 76, 3]],
    [[0, 76, 2], [3, 79, 1], [4, 83, 2], [7, 86, 1], [8, 83, 5]],
    [[0, 76, 2], [3, 79, 1], [4, 84, 2], [7, 79, 1], [8, 76, 2], [10, 79, 2], [12, 84, 3]],
    [[0, 78, 2], [3, 81, 1], [4, 86, 2], [7, 81, 1], [8, 78, 2], [10, 81, 2], [12, 86, 2], [14, 88, 2]],
    [[0, 88, 2], [3, 86, 1], [4, 83, 2], [7, 79, 1], [8, 81, 2], [10, 79, 2], [12, 76, 3]],
    [[0, 76, 2], [3, 79, 1], [4, 83, 2], [7, 86, 1], [8, 88, 5]],
    [[0, 79, 2], [3, 83, 1], [4, 86, 2], [7, 83, 1], [8, 79, 2], [10, 83, 2], [12, 86, 3]],
    [[0, 78, 2], [2, 83, 2], [4, 87, 2], [6, 90, 2], [8, 87, 2], [10, 83, 2], [12, 78, 4]],
  ];
  const BUMBO = [0, 3, 8, 10];
  const VOLUME = 0.65, VOLUME_DOS_EFEITOS = 0.8, VOLUME_DA_NARRACAO = 1;   // os volumes de fábrica da música, dos efeitos e da voz do comentarista
  const passoDaMusica = nivel => 60 / (nivel === 2 ? 152 : 138) / 4;       // segundos de uma semicolcheia
  // 0 = esperando (ou o jogo acabou), 1 = partida valendo, 2 = alguém a um ponto de vencer
  const nivelDaMusica = () => !valendo() || fim ? 0 : Math.max(jog[1].pontos, jog[2].pontos) >= PONTOS_PARA_VENCER - 1 ? 2 : 1;

  // Monta a mesa de som num contexto de áudio: a saída geral e os filtros de cada grupo de instrumentos.
  function montarSom(ctx) {
    // Dois canais, cada um com o seu volume: o da música (o próprio kit) e o dos efeitos (kit.fx).
    const aperto = ctx.createDynamicsCompressor();
    aperto.connect(ctx.destination);
    const ruido = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), amostras = ruido.getChannelData(0), rnd = aleatorio(77);
    for (let i = 0; i < amostras.length; i++) amostras[i] = rnd() * 2 - 1;
    const canal = volume => {
      const saida = ctx.createGain();
      saida.gain.value = volume;
      saida.connect(aperto);
      const filtro = (tipo, freq) => { const f = ctx.createBiquadFilter(); f.type = tipo; f.frequency.value = freq; f.connect(saida); return f; };
      return { ctx, saida, ruido, grave: filtro('lowpass', 520), agudo: filtro('lowpass', 3200), prato: filtro('highpass', 7000), tarol: filtro('bandpass', 1900) };
    };
    return Object.assign(canal(VOLUME), { fx: canal(VOLUME_DOS_EFEITOS) });
  }
  // Uma nota: um oscilador com ataque rápido e queda até o silêncio.
  function tom(kit, tipo, freq, t, dur, vol, para) {
    const o = kit.ctx.createOscillator(), g = kit.ctx.createGain();
    o.type = tipo; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(para);
    o.start(t); o.stop(t + dur + 0.03);
    return o;
  }
  function chiado(kit, t, dur, vol, para) {       // ruído: a pele da caixa e os pratos
    const s = kit.ctx.createBufferSource(), g = kit.ctx.createGain();
    s.buffer = kit.ruido;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(g); g.connect(para);
    s.start(t); s.stop(t + dur + 0.02);
  }
  // Toca tudo o que cai na semicolcheia `passo` (0 a 127), no instante t.
  function tocarPasso(kit, passo, t, nivel) {
    const compasso = passo >> 4, p = passo & 15, dur = passoDaMusica(nivel);
    const b = BAIXO[p];
    if (b !== null && (nivel || p % 8 === 0)) tom(kit, 'sawtooth', hz(RAIZES[compasso] + b), t, nivel ? dur * 1.7 : dur * 6, nivel ? 0.34 : 0.2, kit.grave);
    if (nivel || p % 2 === 0) tom(kit, 'square', hz(ACORDES[compasso][p % 3] + 12 * ((p >> 2) & 1)), t, dur * 0.9, nivel === 2 ? 0.05 : 0.035, kit.agudo);
    if (!nivel) { if (p % 4 === 0) chiado(kit, t, 0.03, 0.05, kit.prato); return; }
    for (const [quando, nota, tamanho] of MELODIA[compasso]) if (quando === p) tom(kit, 'square', hz(nota), t, dur * tamanho * 0.92, 0.085, kit.agudo);
    if (BUMBO.includes(p)) tom(kit, 'sine', 150, t, 0.16, 0.9, kit.saida).frequency.exponentialRampToValueAtTime(42, t + 0.12);
    if (p === 4 || p === 12) { chiado(kit, t, 0.14, 0.5, kit.tarol); tom(kit, 'triangle', 190, t, 0.08, 0.25, kit.saida); }
    if (p % 2 === 0 || nivel === 2) chiado(kit, t, p % 4 === 2 ? 0.05 : 0.025, p % 4 === 2 ? 0.16 : 0.09, kit.prato);
  }
  // Os barulhos do jogo, feitos na hora como a música: o arremesso, cada tipo de pancada, o
  // quique, a tampa tilintando, as palmas e o apito do juiz. `forca`: o volume (no apito, a
  // duração em segundos); `quando`: daqui a quantos segundos. Sem som ligado, não faz nada.
  function tocar(qual, forca = 1, quando = 0) {
    const kit = som.kit && som.kit.fx;
    if (!kit || !nivelDoSom('efeitos') || kit.ctx.state !== 'running') return;
    const t = kit.ctx.currentTime + 0.01 + quando, desce = (o, ate, em) => o.frequency.exponentialRampToValueAtTime(ate, t + em);
    switch (qual) {
      case 'arremesso': chiado(kit, t, 0.16, 0.22, kit.prato); chiado(kit, t, 0.2, 0.3, kit.tarol); break;
      case 'guincho': { const o = tom(kit, 'square', 620, t, 0.3, 0.16, kit.agudo); desce(o, 1500, 0.08); desce(o, 520, 0.28); break; }
      case 'ploft': desce(tom(kit, 'sine', 190, t, 0.22, 0.8, kit.saida), 55, 0.18); chiado(kit, t, 0.12, 0.35, kit.tarol); break;
      case 'paft': chiado(kit, t, 0.08, 0.7, kit.tarol); desce(tom(kit, 'triangle', 260, t, 0.1, 0.4, kit.saida), 110, 0.08); break;
      case 'clang': for (const f of [830, 1245, 1870, 2490]) tom(kit, 'triangle', f, t, 0.55, 0.14, kit.saida); chiado(kit, t, 0.05, 0.4, kit.prato); break;
      case 'tilim': tom(kit, 'triangle', 1245, t, 0.12, 0.1 * forca, kit.saida); tom(kit, 'triangle', 1870, t, 0.1, 0.07 * forca, kit.saida); break;
      case 'quique': desce(tom(kit, 'sine', 230, t, 0.08, 0.3 * forca, kit.saida), 95, 0.06); break;
      case 'passo': desce(tom(kit, 'sine', 150, t, 0.07, 0.22, kit.saida), 80, 0.06); break;
      case 'vira': tom(kit, 'triangle', 520, t, 0.05, 0.07, kit.saida); break;
      case 'pega': tom(kit, 'square', 660, t, 0.07, 0.07, kit.agudo); tom(kit, 'square', 990, t + 0.07, 0.1, 0.07, kit.agudo); break;
      case 'escudo': for (const f of [1245, 1660]) tom(kit, 'triangle', f, t, 0.3, 0.1, kit.saida); break;
      case 'passa': desce(tom(kit, 'sine', 330, t, 0.2, 0.12, kit.saida), 220, 0.18); break;
      case 'erro': tom(kit, 'sawtooth', 110, t, 0.16, 0.16, kit.grave); break;
      case 'palmas': for (let i = 0; i < 14; i++) chiado(kit, t + i * 0.09 + (i % 3) * 0.02, 0.04, 0.22, kit.tarol); break;
      case 'apito': {                             // um apito de bolinha: um som agudo que treme
        const o = kit.ctx.createOscillator(), treme = kit.ctx.createOscillator(), quanto = kit.ctx.createGain(), g = kit.ctx.createGain();
        o.frequency.value = 2850; treme.frequency.value = 42; quanto.gain.value = 160;
        treme.connect(quanto); quanto.connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
        g.gain.setValueAtTime(0.16, t + Math.max(0.03, forca - 0.04));
        g.gain.exponentialRampToValueAtTime(0.0001, t + forca);
        o.connect(g); g.connect(kit.saida);
        for (const x of [o, treme]) { x.start(t); x.stop(t + forca + 0.03); }
        break;
      }
    }
  }
  function aplauso(kit, t) {                      // a torcida comemorando: um chiado largo que sobe e some
    const s = kit.ctx.createBufferSource(), f = kit.ctx.createBiquadFilter(), g = kit.ctx.createGain();
    s.buffer = kit.ruido; s.loop = true;
    f.type = 'bandpass'; f.Q.value = 0.6;
    f.frequency.setValueAtTime(700, t); f.frequency.linearRampToValueAtTime(1500, t + 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.18);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
    s.connect(f); f.connect(g); g.connect(kit.saida);
    s.start(t); s.stop(t + 2.1);
  }
  function fanfarra(kit, t) {                     // fim de jogo: quatro notas subindo e um acorde
    [76, 79, 83, 88].forEach((nota, i) => tom(kit, 'square', hz(nota), t + i * 0.11, 0.2, 0.1, kit.agudo));
    for (const nota of [64, 71, 76, 79, 88]) tom(kit, 'sawtooth', hz(nota), t + 0.46, 1.1, 0.07, kit.agudo);
  }

  // A música, os efeitos (os barulhos do jogo, o apito, a torcida) e a narração (a voz do
  // comentarista, que o navegador lê em voz alta) têm cada um o seu volume e o seu mudo: os
  // controles ficam no painel das câmeras, e as teclas V, B e N
  // calam e soltam cada um. O que foi escolhido fica guardado no navegador.
  const som = { kit: null, passo: 0, proximo: 0, acabou: false, musica: { volume: VOLUME, mudo: false }, efeitos: { volume: VOLUME_DOS_EFEITOS, mudo: false },
    narracao: { volume: VOLUME_DA_NARRACAO, mudo: false } };
  const CANAIS = ['musica', 'efeitos', 'narracao'];
  try {
    const guardado = JSON.parse(localStorage.getItem('galinhaPong.som')) || {};
    for (const qual of CANAIS) {
      const g = guardado[qual] || {};
      if (Number.isFinite(g.volume)) som[qual].volume = Math.max(0, Math.min(1, g.volume));
      som[qual].mudo = !!g.mudo;
    }
    if (localStorage.getItem('galinhaPong.musica') === 'desligada') { som.musica.mudo = true; localStorage.removeItem('galinhaPong.musica'); }   // a escolha de antes de haver dois canais
  } catch (e) { }
  const nivelDoSom = qual => som[qual].mudo ? 0 : som[qual].volume;
  function agendar() {                            // chamado várias vezes por segundo: marca as notas um pouco à frente do relógio do áudio
    const c = som.kit.ctx;
    if (c.state !== 'running') return;
    if (som.proximo < c.currentTime) som.proximo = c.currentTime + 0.05;      // a aba ficou parada: recomeça daqui
    if (fim && !som.acabou) fanfarra(som.kit, c.currentTime + 0.05);
    som.acabou = !!fim;
    // (meio segundo de folga: uma travada da página menor que isso não chega à música)
    while (som.proximo < c.currentTime + 0.5) {
      const nivel = nivelDaMusica();
      tocarPasso(som.kit, som.passo, som.proximo, nivel);
      som.proximo += passoDaMusica(nivel);
      som.passo = (som.passo + 1) % 128;
    }
  }
  // O navegador só deixa o som sair depois de um gesto de quem está na página: daí isto ser
  // chamado no primeiro clique e na primeira tecla.
  function ligarSom() {
    try {
      if (!som.kit) {
        const Contexto = window.AudioContext || window.webkitAudioContext;
        if (!Contexto) return;
        som.kit = montarSom(new Contexto());
        som.kit.saida.gain.value = nivelDoSom('musica');
        som.kit.fx.saida.gain.value = nivelDoSom('efeitos');
        som.kit.ctx.onstatechange = marcarSom;
        setInterval(agendar, 25);
      }
      if (som.kit.ctx.state === 'suspended' && !document.hidden) som.kit.ctx.resume();
    } catch (e) { }
    marcarSom();
  }
  // Muda o volume ou o mudo de um canal ('musica' ou 'efeitos'), aplica e guarda.
  function ajustarSom(qual, mudanca) {
    Object.assign(som[qual], mudanca);
    try { localStorage.setItem('galinhaPong.som', JSON.stringify({ musica: som.musica, efeitos: som.efeitos, narracao: som.narracao })); } catch (e) { }
    if (som.kit && qual !== 'narracao') (qual === 'musica' ? som.kit : som.kit.fx).saida.gain.setTargetAtTime(nivelDoSom(qual), som.kit.ctx.currentTime, 0.04);
    if (qual === 'narracao' && !nivelDoSom('narracao') && window.speechSynthesis) window.speechSynthesis.cancel();     // cala a fala que estiver no ar
    marcarSom();
  }
  const alternarSom = qual => ajustarSom(qual, { mudo: !som[qual].mudo });
  // Os controles: de cada canal, o nome (clicar nele cala ou solta) e a régua do volume.
  const elSom = document.createElement('div');
  Object.assign(elSom.style, { padding: '4px 6px 0', marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.15)' });
  elCameras.appendChild(elSom);
  const controlesDoSom = {};
  for (const [qual, nome, tecla] of [['musica', '♪ música', 'V'], ['efeitos', '♫ efeitos', 'B'], ['narracao', '🎙 narração', 'N']]) {
    const linha = document.createElement('div'), rotulo = document.createElement('span'), regua = document.createElement('input');
    Object.assign(linha.style, { display: 'flex', alignItems: 'center', gap: '6px' });
    Object.assign(rotulo.style, { cursor: 'pointer', flex: '1', whiteSpace: 'nowrap' });
    rotulo.title = `clique (ou a tecla ${tecla}) para calar e soltar`;
    rotulo.addEventListener('click', () => alternarSom(qual));
    Object.assign(regua, { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(som[qual].volume * 100)) });
    Object.assign(regua.style, { width: '70px', margin: '0', accentColor: '#7dffb0' });
    regua.addEventListener('input', () => ajustarSom(qual, { volume: Number(regua.value) / 100, mudo: false }));
    regua.addEventListener('change', () => regua.blur());                 // devolve as setas do teclado ao jogo
    linha.append(rotulo, regua);
    elSom.appendChild(linha);
    controlesDoSom[qual] = { nome, tecla, rotulo, regua };
  }
  // Quem está na cadeira do comentarista, para quem assiste — e um clique para liberá-la (para
  // trocar de comentarista sem esperar: o que estava deixa de ser, e outra iA pode sentar).
  const elCadeira = document.createElement('div');
  Object.assign(elCadeira.style, { cursor: 'pointer', color: '#c9b3e6', padding: '4px 6px 0', marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.15)', whiteSpace: 'normal', lineHeight: '1.3' });
  elCadeira.title = 'clique para tirar este comentarista da cadeira';
  elCadeira.addEventListener('click', () => { if (narrador.dono) largarCadeira(); });
  elCameras.appendChild(elCadeira);
  function marcarCadeira() {
    elCadeira.hidden = !narrador.dono;
    elCadeira.textContent = narrador.dono ? `🎙 ${narrador.nome} · clique para liberar a cadeira` : '';     // sempre como texto: o nome vem da iA
  }
  const elAvisoDoSom = document.createElement('div');
  Object.assign(elAvisoDoSom.style, { color: '#9fb0ba', fontSize: '11px', lineHeight: '1.3' });
  elSom.appendChild(elAvisoDoSom);
  function marcarSom() {
    const tocando = som.kit && som.kit.ctx.state === 'running';
    for (const qual of CANAIS) {
      const c = controlesDoSom[qual], calado = !nivelDoSom(qual);
      c.rotulo.textContent = `${c.nome} ${calado ? '(mudo)' : Math.round(som[qual].volume * 100) + '%'} · ${c.tecla}`;
      c.rotulo.style.color = calado ? '#9fb0ba' : tocando ? '#7dffb0' : '#e8eef2';
      c.rotulo.style.textDecoration = som[qual].mudo ? 'line-through' : 'none';
      c.regua.value = String(Math.round(som[qual].volume * 100));
    }
    elAvisoDoSom.textContent = tocando ? '' : 'para o som sair: clique na página ou aperte uma tecla';
  }
  marcarSom();
  window.addEventListener('pointerdown', ligarSom, true);
  window.addEventListener('keydown', ligarSom, true);
  document.addEventListener('visibilitychange', () => {     // aba escondida: a música para, em vez de engasgar
    if (!som.kit) return;
    if (document.hidden) som.kit.ctx.suspend(); else som.kit.ctx.resume();
  });
  // Para os testes: toca `segundos` da trilha num contexto que não sai pela caixa de som e
  // devolve o volume médio e o pico do que foi gerado.
  async function ensaiarTrilha(segundos, nivel) {
    const ctx = new OfflineAudioContext(1, Math.round(44100 * segundos), 44100), kit = montarSom(ctx);
    let passo = 0;
    for (let t = 0.02; t < segundos - 0.4; t += passoDaMusica(nivel), passo = (passo + 1) % 128) tocarPasso(kit, passo, t, nivel);
    if (nivel === 3) fanfarra(kit, 0.02);
    const dados = (await ctx.startRendering()).getChannelData(0);
    let soma = 0, pico = 0;
    for (let i = 0; i < dados.length; i++) { soma += dados[i] * dados[i]; pico = Math.max(pico, Math.abs(dados[i])); }
    return { media: Math.sqrt(soma / dados.length), pico };
  }

  // ---------- início ----------
  novaPartida();
  // Uma iA pediu este desafio enquanto a página estava em outro, e a página foi recarregada
  // para cá. A página anterior deixou um recado no sessionStorage (ver comecar): a conexão da
  // iA, o número do pedido dela no servidor e o nome de guerra. Ela entra agora, e o pedido
  // continua em aberto: a ponte responde quando esta promessa se cumprir. O recado vale uma
  // vez só. (Ele não vem pelo endereço da página de propósito: um link de fora poderia
  // forjar um endereço, mas não escreve no sessionStorage desta página.)
  let pendenteDoInicio = null, entrada = null;
  try { entrada = JSON.parse(sessionStorage.getItem('quadra.entrada')); sessionStorage.removeItem('quadra.entrada'); } catch (e) { }
  // Quem estava na cadeira do comentarista continua nela depois de a página recarregar.
  try {
    const antes = JSON.parse(sessionStorage.getItem('quadra.narrador'));
    if (antes && conexao(antes.quem)) Object.assign(narrador, { dono: antes.quem, nome: limparNome(antes.nome) || 'Comentarista', sinal: Date.now() });
  } catch (e) { }
  escreverCartazes();
  escreverPlaca();
  if (entrada && conexao(entrada.quem)) {
    const espera = Promise.resolve(comecar(entrada.papel === 'C' ? 'C' : MODO, entrada.quem, null, entrada.nome, entrada.modelo));
    if (Number.isInteger(entrada.cmd) && entrada.cmd > 0) pendenteDoInicio = { id: entrada.cmd, quem: entrada.quem, espera };
  }
  window.jogo = { apertar, comecar, frame, pedir, resultado, novidades, ensaiarTrilha, reiniciar: novaPartida, desafio: MODO, pendenteDoInicio,
    estado: { jog, objetos, get rodadas() { return rodadas; }, get fim() { return fim; }, get ganhou() { return !!fim; }, get camera() { return cam.meta; },
      get replay() { return replay.ativo; }, get reprise() { return replay.ativo ? replay.dados.parte || '1/1' : ''; }, narrador, torcida, juiz, diretor },
    diagnostico: n => diagnosticos[Number(n) === 2 ? 2 : 1] };   // o diagnóstico é por robô (1 ou 2), não por conexão
  const estilo = document.createElement('style');
  estilo.textContent = 'body.reprise .painel { visibility: hidden; }';       // durante a reprise, a tela é só do lance
  document.head.appendChild(estilo);
  definirTamanho(window.innerWidth, window.innerHeight);
  arrumarPaineis();
  atualizarPainel();
  requestAnimationFrame(quadro);
})();
