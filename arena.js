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
  cena.background = texturaCanvas(8, 256, (g, l, a) => {       // céu: azul em cima, claro no horizonte
    const ceu = g.createLinearGradient(0, 0, 0, a);
    ceu.addColorStop(0, '#3f97e0'); ceu.addColorStop(0.6, '#a9d6f5'); ceu.addColorStop(1, '#e4f2fb');
    g.fillStyle = ceu; g.fillRect(0, 0, l, a);
  });
  cena.add(new T.HemisphereLight(0xeaf4ff, 0x5f8f55, 1.15));
  const sol = new T.DirectionalLight(0xfff0d8, 2.3);
  sol.position.set(5, 11, 3);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  Object.assign(sol.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 30 });
  sol.shadow.bias = -0.0005; sol.shadow.normalBias = 0.03;
  cena.add(sol);

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
    malha(cena, new T.PlaneGeometry(90, 90), mat(0x5a9c4f, { roughness: 1 }), 0, -0.012, 0).rotation.x = -Math.PI / 2;   // gramado em volta
    malha(cena, new T.PlaneGeometry(LQ, PQ), mat(0xffffff, { map: piso, roughness: 0.85 }), 0, 0, 0).rotation.x = -Math.PI / 2;

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
    for (const [x, z, s] of [[-8, -9, 1.2], [-9.5, -2.5, 1], [-8.5, 5.5, 1.3], [-3, -11, 1.1], [4.5, -11.5, 1], [3.5, 11, 1.2], [-4.5, 11.5, 1], [10, -10, 1.3], [10.5, 9.5, 1.1]]) {
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
  malha(cena, new T.BoxGeometry(0.12, 1.16, 2.76), M.escuro, -5.6, 2.7, 0).castShadow = true;
  malha(cena, new T.PlaneGeometry(2.6, 1.0), luminoso({ map: placar.textura }), -5.53, 2.7, 0).rotation.y = Math.PI / 2;
  for (const z of [-1.1, 1.1]) malha(cena, new T.CylinderGeometry(0.05, 0.05, 2.2, 10), M.escuro, -5.6, 1.1, z);

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
    { nome: 'desentupidor', grito: 'PLOC!', y: 0.13, raio: 0.4, fazer(g) {
      const d = new T.Group();
      d.rotation.z = -0.24;                     // o cabo encosta no chão; a ventosa fica de pé
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
  // Onde os objetos aparecem: quatro em cada lado (e mais o escudo, logo à frente de onde o
  // robô começa), na mesma disposição vista por cada jogador.
  const VAGAS = [[-2.5, 2.0], [2.5, 2.5], [-1.5, 5.0], [1.5, 4.5], [0, 2.9]];
  const objetos = TIPOS.map((tipo, i) => {
    const grupo = new T.Group(), miolo = new T.Group();
    grupo.add(miolo);
    tipo.fazer(miolo);
    miolo.scale.setScalar(ESCALA);
    fazSombra(miolo);
    const casca = malha(grupo, new T.SphereGeometry(tipo.raio * ESCALA * 0.72, 20, 12), M.contorno, 0, 0, 0);   // borda de destaque: uma bolha achatada
    casca.scale.y = 0.6;
    casca.visible = false;
    const sombra = sombraNoChao(grupo, tipo.raio * ESCALA * 0.8);
    sombra.position.y = 0.006 - tipo.y * ESCALA;             // no chão, debaixo do objeto
    cena.add(grupo);
    return { i, tipo, nome: tipo.nome, grupo, miolo, casca, sombra, x: 0, z: 0, estado: 'chao', dono: 0, dir: null, voado: 0, anim: null };
  });

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
    return { sprite, escrever(texto) {
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
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: texSinal[0], transparent: true, depthWrite: false, toneMapped: false }));
    sprite.scale.set(0.5, 0.375, 1);
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
      ausente: false, faltas: 0, pendente: null, novas: [], vis: { x: 0, z: 0, yaw: 0, braco: 0, queda: 0, pulo: 0, guarda: 0 } });
  }
  // A partida está valendo quando os dois robôs têm quem jogue.
  const valendo = () => jog[1].controle !== 'ninguem' && jog[2].controle !== 'ninguem';
  // O nome de guerra de cada jogador, que vai no placar. A iA manda o dela ao entrar (comecar).
  const nomeDe = J => J.nome || (J.controle === 'bot' ? 'Robô da casa' : `Jogador ${J.n}`);
  const limparNome = nome => Array.from(String(nome == null ? '' : nome).replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, 12).join('');
  function batizar(J, nome) {
    nome = limparNome(nome);
    if (!nome || nome === J.nome) return;
    J.nome = nome;
    hudVelho = true;
    desenharPlacar();
    desenharRegistro();
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
  const ORDEM_DAS_NOTAS = ['partidaNova', 'placar', 'quadraArrumada', 'rodada', 'rodadaPerdida', 'vez'];
  function novidades(quem) {
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

  function novaPartida() {
    const recomeco = rodadas > 0;                // uma partida que já andava foi zerada: as iAs ficam sabendo
    rodadas = 0; fim = 0; hudVelho = true;
    aberta = Date.now(); prazo = 0;
    historico.length = 0;
    for (const J of [jog[1], jog[2]]) {
      J.novas = [];
      J.olhadas = 0;                             // quantas vezes pediu a imagem desde a última rodada
      if (recomeco) anotar(J, { tipo: 'partidaNova' });
      // gasto: tempo somado que o jogador levou para jogar; jogadas: quantas fez; jogouEm: a hora da jogada desta rodada
      // segurando: o objeto de arremessar, na mão direita; escudo: o escudo, na esquerda; guarda: o escudo está levantado
      Object.assign(J, { x: 0, z: 4 * J.lado, rumo: J.n === 1 ? 0 : 4, segurando: null, escudo: null, guarda: false, texto: '',
        pontos: 0, caido: 0, pow: 0, lambuzado: 0, faltas: 0, ausente: false, gasto: 0, jogadas: 0, jogouEm: 0 });
      J.corpo.escrever('');
      Object.assign(J.vis, { x: J.x, z: J.z, yaw: J.rumo * GIRO, braco: 0, queda: 0, pulo: 0, guarda: 0 });
      diagnosticos[J.n] = { comando: 'início', ok: true, mensagem: 'ok' };
    }
    objetos.forEach((o, i) => {
      const v = vagaDe(i);
      cena.add(o.grupo);
      Object.assign(o, { x: v.x, z: v.z, estado: 'chao', dono: 0, dir: null, voado: 0, anim: null });
      o.grupo.position.set(o.x, o.tipo.y * ESCALA, o.z);
      o.grupo.rotation.set(0, i * 1.3, 0);
      o.miolo.rotation.set(0, 0, 0);
      o.sombra.visible = true;
    });
    for (const J of [jog[1], jog[2]]) anotarVez(J);          // quem já está na partida fica sabendo que pode jogar
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
    for (const J of [jog[1], jog[2]]) {
      const frente = J.n === 1 ? 0 : 4;
      // (o rumo volta para a frente pelo lado mais curto, para o robô não sair rodopiando)
      Object.assign(J, { x: 0, z: 4 * J.lado, rumo: frente + 8 * Math.round((J.rumo - frente) / 8), segurando: null, escudo: null, guarda: false, caido: 0, pow: 0 });
      anotar(J, { tipo: 'quadraArrumada' });
    }
    objetos.forEach((o, i) => {
      if (o.estado === 'mao') soltar(o);         // sai da mão de quem segurava
      const v = vagaDe(i);
      Object.assign(o, { x: v.x, z: v.z, estado: 'chao', dono: 0, dir: null, voado: 0 });
      o.grupo.rotation.set(0, i * 1.3, 0);
      o.sombra.visible = true;
      mover(o, o.x, o.tipo.y * ESCALA, o.z, 0.5, 0.5);       // volta para o lugar com um pulinho
    });
    aberta = Date.now(); prazo = 0;              // a pausa do ponto não conta no tempo de ninguém
    hudVelho = true;
    soltarPausa();
    if ([jog[1], jog[2]].some(J => J.pendente)) conferir();  // jogadas feitas no teclado durante a pausa
  }

  const frenteDe = J => ({ x: -Math.sin(J.rumo * GIRO), z: -Math.cos(J.rumo * GIRO) });
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
  // Manda o desenho do objeto de onde está até (x, y, z), subindo `arco` no meio do caminho.
  function mover(o, x, y, z, arco, segundos) {
    const p = o.grupo.position;
    o.anim = { x0: p.x, y0: p.y, z0: p.z, x1: x, y1: y, z1: z, arco, t: 0, dur: segundos };
  }
  // O objeto cai no chão perto de (x, z): sempre dentro da cerca e fora da faixa da rede.
  function cair(o, x, z, arco) {
    const lado = Math.abs(z) > 1e-6 ? Math.sign(z) : (o.dir && Math.sign(o.dir.z)) || 1;
    o.x = Math.max(-CERCA.x, Math.min(CERCA.x, x));
    o.z = lado * Math.max(0.8, Math.min(CERCA.z, Math.abs(z)));
    o.estado = 'chao'; o.dono = 0; o.dir = null; o.voado = 0;
    o.sombra.visible = true;
    mover(o, o.x, o.tipo.y * ESCALA, o.z, arco, 0.45);
  }

  // ---------- as jogadas ----------
  function andar(J, nota) {
    const v = frenteDe(J);
    let nx = J.x + v.x * PASSO, nz = J.z + v.z * PASSO;
    if (!cabe(J, nx, nz)) {                      // na diagonal contra a linha, desliza ao longo dela
      const diagonal = Math.abs(v.x) > 1e-6 && Math.abs(v.z) > 1e-6;
      if (diagonal && cabe(J, nx, J.z)) nz = J.z;
      else if (diagonal && cabe(J, J.x, nz)) nx = J.x;
      else return { ok: false, mensagem: 'bloqueado: linha da quadra' + nota };
    }
    J.x = nx; J.z = nz;
    J.vis.pulo = 1;
    return { ok: true, mensagem: nota ? 'deu meia-volta e andou' : 'andou' };
  }
  function agir(J, botao, texto, arremessos) {
    switch (botao) {
      case 'W': return andar(J, '');
      case 'S': J.rumo += 4; return andar(J, ' (virou, mas não andou)');
      case 'A': J.rumo += 1; return { ok: true, mensagem: 'virou à esquerda' };
      case 'D': J.rumo -= 1; return { ok: true, mensagem: 'virou à direita' };
      case 'L':                                  // levanta ou abaixa a mão esquerda: com o escudo nela, é a guarda
        J.guarda = !J.guarda;
        return { ok: true, mensagem: J.guarda ? (J.escudo ? 'em guarda' : 'mão levantada, sem escudo') : 'guarda baixa' };
      case 'T':
        J.texto = Array.from(String(texto == null ? '' : texto)).slice(0, 10).join('');
        J.corpo.escrever(J.texto);
        return { ok: true, mensagem: `escreveu "${J.texto}"` };
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
    else mover(o, o.x, 1.05, o.z, 0.12, 0.3);
    return null;
  }

  // Fecha uma rodada. `jogadas[n]` é { botao, texto } ou null (ficou parado).
  function resolver(jogadas) {
    rodadas++;
    const arremessos = [], pontosAntes = jog[1].pontos + jog[2].pontos;
    for (const J of [jog[1], jog[2]]) {
      const j = jogadas[J.n];
      if (!j) diagnosticos[J.n] = { comando: '—', ok: true, mensagem: 'não jogou' };
      else if (fim) diagnosticos[J.n] = { comando: j.botao, ok: false, mensagem: 'o jogo acabou' };
      else if (J.caido) diagnosticos[J.n] = { comando: j.botao, ok: false, mensagem: 'caído: perdeu a jogada' };
      else diagnosticos[J.n] = Object.assign({ comando: j.botao }, agir(J, j.botao, j.texto, arremessos));
    }
    for (const J of arremessos) {                // os arremessos saem depois de todo mundo ter se mexido
      const o = J.segurando;
      J.segurando = null;
      soltar(o);
      Object.assign(o, { estado: 'voo', dono: J.n, dir: frenteDe(J), x: J.x, z: J.z, voado: 0 });
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
      if (vitima.escudo && vitima.guarda && -(olha.x * dir.x + olha.z * dir.z) >= 0.5) {
        const s = vitima.escudo;
        vitima.escudo = null; vitima.guarda = false;
        vitima.pow = 2;
        vitima.grito.escrever('TÓIM!');
        diagnosticos[autor.n].mensagem += ` — o jogador ${vitima.n} defendeu`;
        diagnosticos[vitima.n].mensagem += ` — defendeu ${o.nome} com ${s.nome}`;
        soltar(s);                               // o escudo sai voando e cai longe: é preciso ir buscar
        const lado = (rodadas + vitima.n) % 2 ? 1 : -1;
        cair(s, vitima.x + dir.x * 1.2 - dir.z * 1.6 * lado, meuLado(vitima.z + dir.z * 1.2 + dir.x * 1.6 * lado), 1.5);
        cair(o, vitima.x - dir.x * 1.1 + 0.3, meuLado(vitima.z - dir.z * 1.1), 0.7);   // o objeto bate e volta um pouco
        continue;
      }
      autor.pontos++;
      vitima.caido = 2;                          // o resto desta rodada e a próxima inteira
      vitima.pow = 2;
      vitima.guarda = false;
      vitima.grito.escrever(o.tipo.grito);
      if (o.tipo.lambuza) vitima.lambuzado = 3;
      diagnosticos[autor.n].mensagem += ` — acertou o jogador ${vitima.n} com ${o.nome}`;
      diagnosticos[vitima.n].mensagem += ` — foi acertado por ${o.nome}`;
      for (const [mao, dx] of [['segurando', 0.7], ['escudo', -0.7]]) {      // o que ele segurava cai ao lado
        const s = vitima[mao];
        if (!s) continue;
        vitima[mao] = null;
        soltar(s);
        cair(s, vitima.x + dx, vitima.z + 0.3 * vitima.lado, 0.3);
      }
      cair(o, vitima.x + dir.x * 0.7 + 0.2, vitima.z + dir.z * 0.7, 0.9);    // quica para trás dele
    }
    // Vence quem chega aos pontos na frente. Se os dois chegam juntos, o jogo segue até um passar.
    const [a, b] = [jog[1].pontos, jog[2].pontos];
    if (!fim && Math.max(a, b) >= PONTOS_PARA_VENCER && a !== b) fim = a > b ? 1 : 2;
    if (a + b !== pontosAntes) anotarPlacar();   // o placar mudou: as duas iAs ficam sabendo por texto
    for (const J of [jog[1], jog[2]]) {          // o que dura algumas rodadas vai passando
      if (J.caido) J.caido--;
      if (J.pow) J.pow--;
      if (J.lambuzado) J.lambuzado--;
    }
    // o registro das jogadas, para quem assiste: o que cada um fez nesta rodada e quantas vezes pediu a imagem antes
    // a vez: a rodada fechou e a seguinte já está aberta. Quem não jogou fica sabendo que perdeu a rodada.
    if (!fim) for (const J of [jog[1], jog[2]])
      anotar(J, { tipo: jogadas[J.n] ? 'rodada' : 'rodadaPerdida', n: rodadas, rodada: rodadas + 1 }, 'vez');
    historico.push({ rodada: rodadas, 1: Object.assign({ olhou: jog[1].olhadas }, diagnosticos[1]), 2: Object.assign({ olhou: jog[2].olhadas }, diagnosticos[2]) });
    if (a + b !== pontosAntes) {                 // saiu ponto: o placar fica e a quadra volta ao começo (a menos que o jogo tenha acabado)
      historico.push({ marca: fim ? `Fim de jogo: ${nomeDe(jog[1])} ${a} x ${b} ${nomeDe(jog[2])}` : `Ponto! ${nomeDe(jog[1])} ${a} x ${b} ${nomeDe(jog[2])} — a quadra é arrumada` });
      if (!fim) {
        if (PAUSA_DO_PONTO > 0) { pausa.ativa = true; pausa.relogio = setTimeout(arrumarQuadra, PAUSA_DO_PONTO * 1000); }
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
    J.ausente = false; J.faltas = 0;
    if (antes === tipo) return false;
    J.controle = tipo;
    if (tipo === 'humano') { J.avisado = true; J.dono = null; }   // quem está no teclado vê a tela: não precisa de aviso
    hudVelho = true;
    desenharPlacar();
    desenharRegistro();
    if (antes === 'ninguem') { if (valendo()) iniciar(); }
    else if (antes === 'bot' && rodadas > 0) novaPartida();
    return true;
  }
  // Desafio M: os dois entraram. A partida começa do zero, e quem estava pendurado
  // aguardando é liberado com o aviso de que começou.
  function iniciar() {
    novaPartida();
    for (const J of [jog[1], jog[2]]) {
      if (J.esperas.length) J.avisado = true;
      for (const e of J.esperas.splice(0)) { clearTimeout(e.relogio); e.pronto({ aviso: 'inicio' }); }
    }
  }
  // Desafio M, com um jogador só: a chamada dele fica pendurada até o outro entrar (aviso
  // 'inicio') ou até passarem `segundos` (aviso 'espera': ainda não entrou ninguém).
  function aguardar(J, segundos) {
    hudVelho = true;
    if (!segundos) return Promise.resolve({ aviso: 'espera' });
    return new Promise(pronto => {
      const e = { pronto, relogio: setTimeout(() => { J.esperas.splice(J.esperas.indexOf(e), 1); pronto({ aviso: 'espera' }); }, segundos * 1000) };
      J.esperas.push(e);
    });
  }
  // Registra a jogada de um jogador e devolve uma promessa que se cumpre quando a rodada
  // fecha. A promessa pode trazer um aviso em vez de a jogada valer: 'espera' (o outro
  // jogador ainda não entrou) ou 'inicio' (a partida começou; só para a iA que ainda não sabia).
  function pedir(n, botao, texto, tipo) {
    entrar(n, tipo);
    const J = jog[n];
    if (!valendo()) return aguardar(J, tipo === 'ia' ? ESPERA.ia : 0);
    if (!J.avisado) { J.avisado = true; return Promise.resolve({ aviso: 'inicio' }); }
    if (J.pendente) J.pendente.pronto();         // trocou de ideia antes de a rodada fechar (só no teclado)
    return new Promise(pronto => {
      J.pendente = { botao, texto, pronto };
      J.jogouEm = Date.now();
      hudVelho = true;
      conferir();
    });
  }
  function conferir() {
    if (pausa.ativa) return;                     // na pausa de um ponto nenhuma rodada fecha: as jogadas esperam
    const reais = [jog[1], jog[2]].filter(J => J.controle !== 'bot' && !J.ausente);
    if (reais.every(J => J.pendente)) return fechar();
    if (!relogio) {                              // alguém jogou e falta o outro: a rodada tem hora para fechar
      const segundos = reais.some(J => J.controle === 'ia') ? ESPERA.ia : ESPERA.teclado;
      prazo = Date.now() + segundos * 1000;
      relogio = setTimeout(fechar, segundos * 1000);
    }
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
        J.gasto += Math.max(0, J.jogouEm - aberta);          // o tempo que levou para jogar nesta rodada
        J.jogadas++;
      } else if (J.controle === 'bot') {
        const botao = decidirBot(J);
        jogadas[J.n] = botao && { botao, texto: '' };
      } else if (!J.ausente) {
        J.gasto += agora - aberta;               // pensou a rodada inteira e não jogou
        if (++J.faltas >= 2) J.ausente = true;   // sumiu: as rodadas param de esperar por ele
      }
    }
    resolver(jogadas);
    aberta = Date.now(); prazo = 0;              // começa a contar a rodada seguinte
    if (pausa.ativa) pausa.prontos.push(...prontos);         // saiu ponto: as respostas esperam a quadra ser arrumada
    else prontos.forEach(pronto => pronto());
  }
  // minutos:segundos
  const relogioDe = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  // O tempo total do jogador: a soma de tudo o que ele levou para jogar em cada rodada, mais
  // o que já passou desta, se ainda não jogou. É um relógio que só corre enquanto ele pensa.
  function tempoDe(J) {
    const pensando = valendo() && !fim && !pausa.ativa && J.controle !== 'bot' && !J.pendente && !J.ausente;
    return J.gasto + (pensando ? Math.max(0, Date.now() - aberta) : 0);
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
  const camTV = new T.PerspectiveCamera(40, 16 / 9, 0.1, 150);
  camTV.layers.enable(CAMADA[1]); camTV.layers.enable(CAMADA[2]);
  // A câmera da transmissão gira em volta de um ponto da quadra. Quem assiste escolhe uma das
  // vistas prontas (os botões na tela, ou a tecla C) e pode mexer com o mouse: arrastar gira,
  // a roda aproxima e afasta, o botão direito (ou Shift + arrastar) desloca. As duas últimas
  // vistas são os olhos de cada jogador, em tela cheia.
  const VISTAS = [
    { nome: 'Transmissão', de: [14.5, 9.6, 0], para: [2.3, 0, 0] },   // olha um pouco para cá do meio: sobra lugar embaixo para as vistas dos jogadores
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
  const cam = { vista: 0, olhos: 0, livre: false, meta: orbitaDe(VISTAS[0]), atual: orbitaDe(VISTAS[0]) };
  function escolherVista(i) {
    const v = VISTAS[i];
    cam.vista = i; cam.livre = false; cam.olhos = v.olhos || 0;
    if (!v.olhos) cam.meta = orbitaDe(v);
    marcarVista();
  }
  function moverCamera(k) {                      // k = fração do caminho até onde a câmera deve estar
    const a = cam.atual, m = cam.meta;
    for (const c of ['x', 'y', 'z', 'dist', 'alto']) a[c] += (m[c] - a[c]) * k;
    a.giro += Math.atan2(Math.sin(m.giro - a.giro), Math.cos(m.giro - a.giro)) * k;   // pelo lado mais curto
    const s = Math.sin(a.alto);
    camTV.position.set(a.x + a.dist * s * Math.cos(a.giro), a.y + a.dist * Math.cos(a.alto), a.z + a.dist * s * Math.sin(a.giro));
    camTV.lookAt(a.x, a.y, a.z);
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
    const c = new T.PerspectiveCamera(75, FRAME.l / FRAME.a, 0.05, 150);
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
  for (const [qual, l, a] of [['tv', 1280, 720], [1, FRAME.l, FRAME.a], [2, FRAME.l, FRAME.a]]) {
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
      // ao lado, para fora: nome de guerra, o que está fazendo nesta rodada, quem joga e a média por jogada
      const borda = n === 1 ? x - 10 : x + CAIXA + 10, texto = borda + lado * 14, cabe = INFO - RELOGIO - 30;
      g.fillStyle = 'rgba(10,14,18,0.78)'; cantos(g, n === 1 ? borda - INFO : borda, Y, INFO, ALT, 12); g.fill();
      g.textAlign = n === 1 ? 'right' : 'left';
      g.fillStyle = COR_CSS[n]; g.font = 'bold 25px Arial, sans-serif'; g.fillText(nomeDe(J), texto, Y + 23, cabe);
      if (s) { g.fillStyle = s.jogou ? '#7dffb0' : '#ffd83a'; g.font = 'bold 15px Arial, sans-serif'; g.fillText((s.jogou ? '✓ ' : '') + s.texto, texto, Y + 48, cabe); }
      g.fillStyle = '#cfd8de'; g.font = '14px Arial, sans-serif';
      g.fillText(NOME_DO_CONTROLE[J.controle] + (J.jogadas ? ` · média ${(J.gasto / J.jogadas / 1000).toFixed(1).replace('.', ',')} s por jogada` : ''), texto, Y + 69, cabe);
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
    const fora = [1, 2].filter(n => jog[n].controle === 'ninguem');
    if (fora.length) faixa(g, l, a, COR_DE_ESPERA, [fora.length === 2 ? 'AGUARDANDO OS JOGADORES' : `AGUARDANDO O JOGADOR ${fora[0]}`], a * 0.12, a * 0.17);
    else if (fim) faixa(g, l, a, COR_CSS[fim], [`${nomeDe(jog[fim]).toUpperCase()} VENCEU!`], a * 0.12, a * 0.17);   // estreita e no alto, para não tapar a quadra
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
      g.font = 'bold 24px Arial, sans-serif';
      g.textAlign = 'right'; g.fillText(nomeDe(J), l / 2 - 76, 40, 160);
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
      if (!valendo()) faixa(g, l, a, COR_DE_ESPERA, ['AGUARDANDO O OUTRO JOGADOR'], a * 0.16);
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
      g.font = 'bold 36px Arial, sans-serif'; g.fillText(nomeDe(jog[n]), x, 34, 236);
      g.font = 'bold 128px Consolas, "Courier New", monospace'; g.fillText(String(jog[n].pontos), x, 134);
    }
    g.fillStyle = '#e8eef2'; g.font = 'bold 80px Arial, sans-serif'; g.fillText('×', 256, 128);
    placar.textura.needsUpdate = true;
  }

  // Aproxima o desenho do estado do jogo: k = fração do caminho (1 = chega de uma vez).
  let tempo = 0, parado = false;                // parado: sem balanço, para a imagem que vai para a iA
  function animar(k, dt) {
    tempo += dt;
    moverCamera(k);
    for (const J of [jog[1], jog[2]]) {
      const v = J.vis, c = J.corpo;
      const braco = J.segurando ? BRACO.estendido : BRACO.caido;
      const meta = { x: J.x, z: J.z, yaw: J.rumo * GIRO, braco, queda: J.caido ? 1 : 0, guarda: J.guarda ? 1 : 0 };
      for (const campo in meta) v[campo] += (meta[campo] - v[campo]) * k;
      v.pulo = Math.max(0, v.pulo - dt * 4);
      const mole = parado ? 0 : Math.sin(tempo * 5 + J.n * 2) * 0.025, pulo = parado ? 0 : Math.sin(v.pulo * Math.PI);
      c.grupo.visible = J.controle !== 'ninguem';          // desafio M: quem não entrou ainda não está na quadra
      c.grupo.position.set(v.x, 0, v.z);
      c.grupo.rotation.y = v.yaw;
      c.eixo.rotation.x = v.queda * Math.PI / 2;           // cai de costas
      c.eixo.position.y = v.queda * 0.23;
      c.corpo.position.y = pulo * 0.1;
      c.corpo.scale.set(1 - mole + pulo * 0.05, 1 + mole * 2 - pulo * 0.1, 1 - mole + pulo * 0.05);   // gelatina
      c.braco.rotation.x = v.braco + (J.caido ? 1.9 * v.queda : 0);
      // braço esquerdo: em guarda, sobe e vem para a frente do corpo, com o escudo; senão, balança solto
      c.outro.rotation.x = J.caido ? 1.9 * v.queda : v.guarda * 1.5 + (parado || J.guarda ? 0 : Math.sin(tempo * 3 + J.n) * 0.12);
      c.outro.rotation.z = J.caido ? -0.8 * v.queda : v.guarda * 0.5;
      c.estrelas.visible = !!J.caido;
      c.estrelas.rotation.y = parado ? 0.6 : tempo * 4;
      c.olhar(J.caido ? 'tonto' : fim === J.n ? 'feliz' : 'normal');
      const s = situacao(J);                               // de quem é a vez: o sinal em cima do robô
      J.sinal3d.visible = !!s && !J.ausente && !J.caido && !J.pow;
      J.sinal3d.material.map = texSinal[s && s.jogou ? 1 : 0];
      J.sinal3d.position.set(v.x, 1.8, v.z);
      J.grito.sprite.visible = J.pow > 0;
      J.grito.sprite.position.set(J.x, 1.75, J.z);
    }
    for (const o of objetos) {
      if (o.estado === 'mao') { o.miolo.rotation.set(0, 0, 0); continue; }
      const an = o.anim;
      if (an) {
        an.t = Math.min(1, k >= 1 ? 1 : an.t + dt / an.dur);
        const t = an.t;
        o.grupo.position.set(an.x0 + (an.x1 - an.x0) * t, an.y0 + (an.y1 - an.y0) * t + an.arco * Math.sin(Math.PI * t), an.z0 + (an.z1 - an.z0) * t);
        if (t >= 1) o.anim = null;
      }
      // no ar, o objeto roda; no chão, descansa deitado
      if (o.estado === 'voo') { o.miolo.rotation.z = parado ? 0.7 : o.miolo.rotation.z + dt * 9; o.sombra.visible = false; }
      else if (o.anim) o.miolo.rotation.z += dt * 9;
      else o.miolo.rotation.set(0, 0, 0);
    }
  }
  function apontarCamera(n) {
    const J = jog[n], v = J.vis, c = camJ[n];
    // de pé, olha para a frente e um pouco para baixo; caído, está de costas no chão, olhando o céu
    c.position.set(v.x, ALTURA_OLHOS - 0.7 * v.queda, v.z);
    c.rotation.set(INCLINACAO + 1.25 * v.queda, v.yaw, 0);
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
  function desenhar() {                          // a tela da página: a transmissão e, embaixo, o que cada jogador vê
    // o placar é refeito quando algo muda e, com a partida andando, quatro vezes por segundo (os relógios)
    const agora = performance.now();
    if (hudVelho || (valendo() && !fim && agora - hudEm > 250)) { desenharHud(); hudEm = agora; }
    apontarCamera(1); apontarCamera(2);
    sombras();
    renderer.setScissorTest(true);
    if (cam.olhos) {                             // a vista grande são os olhos de um jogador (com o que ele vê por cima da imagem)
      const c = camJ[cam.olhos];
      c.aspect = largura / altura; c.updateProjectionMatrix();
      vista(c, hud[cam.olhos], [cam.olhos], 0, 0, largura, altura);
      c.aspect = FRAME.l / FRAME.a; c.updateProjectionMatrix();
    } else {
      camTV.aspect = largura / altura;
      camTV.fov = camTV.aspect < 1.5 ? 52 : 40;  // janela estreita: abre o ângulo para a quadra caber
      camTV.updateProjectionMatrix();
      vista(camTV, hud.tv, [1, 2], 0, 0, largura, altura);
    }
    const l = Math.round(Math.min(largura * 0.27, 420)), a = Math.round(l * FRAME.a / FRAME.l), m = 14, b = 3, y = 56;
    for (const n of [1, 2]) {
      const x = n === 1 ? m : largura - m - l;
      renderer.setScissor(x - b, y - b, l + 2 * b, a + 2 * b);
      renderer.setClearColor(COR[n]);
      renderer.clear(true, false, false);        // a moldura na cor do robô
      vista(camJ[n], hud[n], [n], x, y, l, a);
    }
    renderer.setClearColor(0x000000);
    renderer.setScissorTest(false);
  }
  function definirTamanho(l, a) {
    largura = l; altura = a;
    renderer.setSize(l, a, false);
  }
  // A imagem do botão F: o que o jogador n está vendo, sempre do mesmo tamanho.
  function frame(n) {
    parado = true;
    animar(1, 0);
    desenharHud();                               // sempre: os tempos do placar têm de ser os de agora
    const densidade = renderer.getPixelRatio();
    renderer.setPixelRatio(1);
    definirTamanho(FRAME.l, FRAME.a);
    apontarCamera(n);
    sombras();
    renderer.setScissorTest(true);
    vista(camJ[n], hud[n], [n], 0, 0, FRAME.l, FRAME.a);
    renderer.setScissorTest(false);
    const imagem = canvas.toDataURL('image/png');
    parado = false;
    renderer.setPixelRatio(densidade);
    definirTamanho(window.innerWidth, window.innerHeight);
    desenhar();
    return imagem;
  }
  window.addEventListener('resize', () => definirTamanho(window.innerWidth, window.innerHeight));

  let anterior = performance.now();
  function quadro(agora) {
    const dt = Math.min(0.1, (agora - anterior) / 1000);
    anterior = agora;
    animar(1 - Math.exp(-dt * 12), dt);
    desenhar();
    requestAnimationFrame(quadro);
  }

  // ---------- interface (a mesma de jogo.js) ----------
  const BOTOES = new Set(['W', 'A', 'S', 'D', 'ESPACO', 'L', 'T']);
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
  function apertar(botao, texto, quem, nome) {
    const n = conexao(quem) ? sentar(quem, nome) : 0;
    if (!n) return Promise.resolve({ aviso: 'lotado' });
    if (jog[n].herdou) retomar(jog[n], nome);
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
  function comecar(desafio, quem, cmd, nome) {
    desafio = String(desafio);
    const deIA = conexao(quem);
    if (desafio !== MODO) {
      const arena = desafio === 'M' || desafio === 'T';
      if (!arena && !/^[0-9]+$/.test(desafio)) return false;
      const p = new URLSearchParams();
      p.set('desafio', desafio);
      for (const chave of ['depurar', 'bot']) if (ENDERECO.has(chave)) p.set(chave, ENDERECO.get(chave));
      try {                                      // o recado para a página nova (ver o fim deste arquivo)
        if (arena && deIA) sessionStorage.setItem('quadra.entrada', JSON.stringify({ quem, cmd: cmd || 0, nome: nome || '' }));
        else sessionStorage.removeItem('quadra.entrada');
      } catch (e) { }
      location.search = p.toString();
      return true;
    }
    if (!deIA) { novaPartida(); return false; }
    const n = sentar(quem, nome);
    if (!n) return { aviso: 'lotado' };
    const J = jog[n], herdou = J.herdou;
    if (herdou) retomar(J, nome);
    batizar(J, nome);
    const mudou = entrar(n, 'ia');
    if (!valendo()) return aguardar(J, ESPERA.entrada);
    if (!mudou && !herdou) novaPartida();        // quem já estava jogando pede de novo: partida nova
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
  elAjuda.textContent = 'J1:  W A S D   Espaço   L T\nJ2:  ↑ ← ↓ →   Enter    O P\n1 2 3 M Shift+T   R H J C V';
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
      if (h.marca) { celula(h.marca, { gridColumn: '1 / -1', color: '#ffd83a', fontWeight: 'bold' }); continue; }   // um ponto, ou o fim do jogo
      celula(String(h.rodada), { color: '#9fb0ba' });
      for (const n of [1, 2]) {
        const d = h[n], c = celula('', { color: d.ok ? '#e8eef2' : '#f0a59b' });
        const botao = document.createElement('b');
        botao.textContent = d.comando === 'ESPACO' ? 'Espaço' : d.comando;
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
  Object.assign(elCameras.style, { right: '14px', pointerEvents: 'auto', whiteSpace: 'normal', fontSize: '12px', lineHeight: '1.5', padding: '6px 8px', maxWidth: '190px' });
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
    KeyW: [1, 'W'], KeyA: [1, 'A'], KeyS: [1, 'S'], KeyD: [1, 'D'], Space: [1, 'ESPACO'], KeyL: [1, 'L'], KeyT: [1, 'T'],
    ArrowUp: [2, 'W'], ArrowLeft: [2, 'A'], ArrowDown: [2, 'S'], ArrowRight: [2, 'D'], Enter: [2, 'ESPACO'], NumpadEnter: [2, 'ESPACO'], KeyO: [2, 'L'], KeyP: [2, 'T'],
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
      case 'KeyV': alternarSom(); break;
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
  const VOLUME = 0.65;
  const passoDaMusica = nivel => 60 / (nivel === 2 ? 152 : 138) / 4;       // segundos de uma semicolcheia
  // 0 = esperando (ou o jogo acabou), 1 = partida valendo, 2 = alguém a um ponto de vencer
  const nivelDaMusica = () => !valendo() || fim ? 0 : Math.max(jog[1].pontos, jog[2].pontos) >= PONTOS_PARA_VENCER - 1 ? 2 : 1;

  // Monta a mesa de som num contexto de áudio: a saída geral e os filtros de cada grupo de instrumentos.
  function montarSom(ctx) {
    const saida = ctx.createGain(), aperto = ctx.createDynamicsCompressor();
    saida.gain.value = VOLUME;
    saida.connect(aperto); aperto.connect(ctx.destination);
    const filtro = (tipo, freq) => { const f = ctx.createBiquadFilter(); f.type = tipo; f.frequency.value = freq; f.connect(saida); return f; };
    const ruido = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), amostras = ruido.getChannelData(0), rnd = aleatorio(77);
    for (let i = 0; i < amostras.length; i++) amostras[i] = rnd() * 2 - 1;
    return { ctx, saida, ruido, grave: filtro('lowpass', 520), agudo: filtro('lowpass', 3200), prato: filtro('highpass', 7000), tarol: filtro('bandpass', 1900) };
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
  function fanfarra(kit, t) {                     // fim de jogo: quatro notas subindo e um acorde
    [76, 79, 83, 88].forEach((nota, i) => tom(kit, 'square', hz(nota), t + i * 0.11, 0.2, 0.1, kit.agudo));
    for (const nota of [64, 71, 76, 79, 88]) tom(kit, 'sawtooth', hz(nota), t + 0.46, 1.1, 0.07, kit.agudo);
  }

  const som = { kit: null, ligado: true, passo: 0, proximo: 0, acabou: false };
  try { som.ligado = localStorage.getItem('galinhaPong.musica') !== 'desligada'; } catch (e) { }
  function agendar() {                            // chamado várias vezes por segundo: marca as notas um pouco à frente do relógio do áudio
    const c = som.kit.ctx;
    if (c.state !== 'running') return;
    if (som.proximo < c.currentTime) som.proximo = c.currentTime + 0.05;      // a aba ficou parada: recomeça daqui
    if (fim && !som.acabou) fanfarra(som.kit, c.currentTime + 0.05);
    som.acabou = !!fim;
    while (som.proximo < c.currentTime + 0.14) {
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
        som.kit.saida.gain.value = som.ligado ? VOLUME : 0;
        som.kit.ctx.onstatechange = marcarSom;
        setInterval(agendar, 25);
      }
      if (som.kit.ctx.state === 'suspended' && !document.hidden) som.kit.ctx.resume();
    } catch (e) { }
    marcarSom();
  }
  function alternarSom() {
    som.ligado = !som.ligado;
    try { localStorage.setItem('galinhaPong.musica', som.ligado ? 'ligada' : 'desligada'); } catch (e) { }
    if (som.kit) som.kit.saida.gain.setTargetAtTime(som.ligado ? VOLUME : 0, som.kit.ctx.currentTime, 0.04);
    marcarSom();
  }
  const elSom = document.createElement('div');
  Object.assign(elSom.style, { cursor: 'pointer', padding: '4px 6px 0', marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.15)' });
  elSom.addEventListener('click', alternarSom);
  elCameras.appendChild(elSom);
  function marcarSom() {
    const tocando = som.kit && som.kit.ctx.state === 'running';
    elSom.textContent = !som.ligado ? '♪ música desligada (V liga)' : tocando ? '♪ música ligada (V desliga)' : '♪ música: clique na página ou aperte uma tecla';
    elSom.style.color = som.ligado && tocando ? '#7dffb0' : '#9fb0ba';
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
  if (entrada && conexao(entrada.quem)) {
    const espera = Promise.resolve(comecar(MODO, entrada.quem, null, entrada.nome));
    if (Number.isInteger(entrada.cmd) && entrada.cmd > 0) pendenteDoInicio = { id: entrada.cmd, quem: entrada.quem, espera };
  }
  window.jogo = { apertar, comecar, frame, pedir, resultado, novidades, ensaiarTrilha, reiniciar: novaPartida, desafio: MODO, pendenteDoInicio,
    estado: { jog, objetos, get rodadas() { return rodadas; }, get fim() { return fim; }, get ganhou() { return !!fim; }, get camera() { return cam.meta; } },
    diagnostico: n => diagnosticos[Number(n) === 2 ? 2 : 1] };   // o diagnóstico é por robô (1 ou 2), não por conexão
  definirTamanho(window.innerWidth, window.innerHeight);
  arrumarPaineis();
  atualizarPainel();
  requestAnimationFrame(quadro);
})();
