/* Gravação das partidas, para assistir depois.
 *
 * O jogo é lento de assistir ao vivo: cada iA leva vários segundos para decidir um botão. Mas
 * o que acontece numa partida depende só dos botões apertados, na ordem em que foram
 * apertados. Por isso a gravação é pequena: uma linha por acontecimento (a rodada, com o
 * botão de cada jogador; o texto na barriga; a fala do comentarista...) e a hora em que ele se
 * deu. Para assistir, o próprio jogo refaz a partida a partir dessas linhas, sem as esperas.
 *
 * Quem guarda as gravações é o servidor (servidor.ps1), numa pasta fora do projeto: a cada
 * novidade a página manda a gravação inteira de novo. Aberta direto do arquivo, sem servidor,
 * a página não grava nada.
 *
 * Para assistir: a aba de replays (replays.html) lista as gravações, e escolher uma abre a
 * página do jogo com ?assistir=<id>. Nesse modo a página não se liga ao servidor MCP (ver
 * ponte.js) nem aceita jogadas: só toca a gravação. O jogo que estiver aberto em outra aba
 * continua como está.
 *
 * O arquivo é texto, com um objeto JSON por linha. A primeira linha é o resumo (o que a lista
 * de replays mostra). As outras são os acontecimentos, cada um com `t` (milissegundos desde o
 * começo da gravação) e `e` (o tipo); o que cada tipo quer dizer é assunto de cada jogo (ver
 * arena.js e jogo.js).
 */
(() => {
  'use strict';
  const ENDERECO = new URLSearchParams(location.search);
  const FORMA_DO_ID = /^[0-9]{8}-[0-9]{6}-[a-z0-9]{6}$/;     // data, hora e seis letras ao acaso (o servidor só aceita assim)
  const assistindo = FORMA_DO_ID.test(ENDERECO.get('assistir') || '') ? ENDERECO.get('assistir') : '';
  const noServidor = location.protocol.startsWith('http');
  const TAMANHO_MAXIMO = 1000000;               // em bytes: o servidor recusa gravações de mais de 1 MB
  const LINHAS_MAXIMAS = 20000;
  const RITMOS = [0.5, 1, 2, 4];                // as velocidades de quem assiste

  // Nos desafios, voltar a um ponto anterior recarrega a página (o jogo não sabe desfazer um
  // botão: ver tocador). Para a tela não piscar preta no meio, e a volta não demorar mais do
  // que precisa:
  //   - a página velha fica na tela até a nova ter o que mostrar, e a troca é de uma vez só. Quem
  //     faz isso é o navegador (a "transição de página" e a espera pelo fim da página: ver
  //     index.html, @view-transition e o link rel=expect);
  //   - a página velha deixa a gravação, já lida, guardada na aba (ver deixar e deixada): a nova
  //     não a busca de novo no servidor, e chega ao ponto pedido antes do seu primeiro desenho.
  // No navegador que não sabe fazer a transição, fica o jeito antigo: a página velha guarda uma
  // foto do que estava mostrando, e a nova a põe por cima do canvas até o jogo chegar ao ponto
  // pedido. (Tudo isso fica só nesta aba, e só até ser usado.)
  const TROCA_SUAVE = 'CSSViewTransitionRule' in window;
  const CHAVE_DA_FITA = 'gravacao.fita';
  function deixar(gravada) {
    try { sessionStorage.setItem(CHAVE_DA_FITA, JSON.stringify({ id: assistindo, resumo: gravada.resumo, eventos: gravada.eventos })); }
    catch (e) { try { sessionStorage.removeItem(CHAVE_DA_FITA); } catch (e2) { } }   // (não coube na aba: a página nova busca a gravação no servidor, como antes)
  }
  // A gravação `id` que a página anterior deixou, ou null. Vale uma vez só: quem recarrega a página à mão lê a do servidor.
  function deixada(id) {
    try {
      const texto = sessionStorage.getItem(CHAVE_DA_FITA);
      sessionStorage.removeItem(CHAVE_DA_FITA);
      const g = texto ? JSON.parse(texto) : null;
      if (!g || g.id !== id || !g.resumo || typeof g.resumo !== 'object' || Array.isArray(g.resumo) || !Array.isArray(g.eventos)) return null;
      return { resumo: g.resumo, eventos: g.eventos.filter(o => o && typeof o === 'object' && !Array.isArray(o) && typeof o.e === 'string' && Number.isFinite(o.t)) };
    } catch (e) { return null; }
  }
  const CHAVE_DA_FOTO = 'gravacao.foto';
  let foto = null;
  if (assistindo) try {
    const guardada = sessionStorage.getItem(CHAVE_DA_FOTO);
    let onde = null;                            // (onde a imagem do jogo estava na janela: nos desafios, com o menu ao lado, ela não enche a janela)
    try { onde = JSON.parse(sessionStorage.getItem(CHAVE_DA_FOTO + '.onde')); } catch (e) { }
    sessionStorage.removeItem(CHAVE_DA_FOTO);
    sessionStorage.removeItem(CHAVE_DA_FOTO + '.onde');
    const tela = document.getElementById('tela');
    if (guardada && guardada.startsWith('data:image/') && tela) {
      const r = Array.isArray(onde) && onde.length === 4 && onde.every(v => Number.isFinite(v) && v >= 0) ? onde.map(v => Math.round(v) + 'px') : ['0', '0', '100vw', '100vh'];
      foto = new Image();
      foto.alt = '';
      Object.assign(foto.style, { position: 'fixed', left: r[0], top: r[1], width: r[2], height: r[3], pointerEvents: 'none' });
      foto.src = guardada;
      tela.after(foto);                         // logo depois do canvas: por cima dele e por baixo dos painéis da página
      setTimeout(tirarFoto, 6000);              // (se a gravação não carregar, a foto não fica ali para sempre)
    }
  } catch (e) { }
  function tirarFoto() {
    if (foto) { foto.remove(); foto = null; }
  }
  function guardarFoto() {
    try {
      const tela = document.getElementById('tela');
      if (!tela) return;
      const r = tela.getBoundingClientRect();
      sessionStorage.setItem(CHAVE_DA_FOTO, tela.toDataURL('image/jpeg', 0.85));
      sessionStorage.setItem(CHAVE_DA_FOTO + '.onde', JSON.stringify([r.left, r.top, r.width, r.height]));
    } catch (e) { }
  }

  // ---------- gravar ----------
  // Começa uma gravação. `resumo()` devolve o que a lista de replays mostra dela (quem jogou,
  // o placar...): é chamado de novo toda vez que a gravação é guardada.
  // Devolve { id, anotar, fechar }. anotar(e, dados, conta): acrescenta um acontecimento do
  // tipo `e`. A gravação só começa a ser guardada depois do primeiro acontecimento que
  // `conta` (uma rodada, um botão): uma partida em que ninguém jogou não vira arquivo.
  function gravar(desafio, resumo) {
    const dia = new Date(), dois = n => String(n).padStart(2, '0');
    const id = `${dia.getFullYear()}${dois(dia.getMonth() + 1)}${dois(dia.getDate())}-${dois(dia.getHours())}${dois(dia.getMinutes())}${dois(dia.getSeconds())}-${(Math.random().toString(36) + '000000').slice(2, 8)}`;
    const t0 = performance.now(), linhas = [];
    let vale = false, suja = false, relogio = null, ultimo = 0;
    function texto() {
      let r = null;
      try { r = resumo(); } catch (e) { }
      return [JSON.stringify(Object.assign({ v: 1, id, desafio: String(desafio), quando: dia.toISOString(), duracao: ultimo }, r))].concat(linhas).join('\n');
    }
    // naSaida: a página está fechando (ou recarregando), e um pedido comum seria cancelado no meio.
    function guardar(naSaida) {
      clearTimeout(relogio);
      relogio = null;
      if (!noServidor || !vale || !suja) return;
      const corpo = new Blob([texto()], { type: 'text/plain' });
      if (corpo.size > TAMANHO_MAXIMO) return;               // grande demais: fica o que já estava guardado
      suja = false;
      try {
        if (naSaida === true && navigator.sendBeacon && navigator.sendBeacon('partidas?id=' + id, corpo)) return;
        fetch('partidas?id=' + id, { method: 'POST', body: corpo }).catch(() => { suja = true; });
      } catch (e) { }
    }
    function anotar(e, dados, conta) {
      if (linhas.length >= LINHAS_MAXIMAS) return;
      ultimo = Math.round(performance.now() - t0);
      linhas.push(JSON.stringify(Object.assign({ t: ultimo, e }, dados)));
      if (conta) vale = true;
      suja = true;
      if (vale && !relogio) relogio = setTimeout(guardar, 1000);
    }
    const naSaida = () => guardar(true);
    window.addEventListener('pagehide', naSaida);
    return { id, anotar, guardar: () => guardar(false), fechar() { guardar(false); window.removeEventListener('pagehide', naSaida); } };
  }

  // ---------- ler ----------
  // Uma gravação guardada: { resumo, eventos }. Linha que não é um objeto JSON é ignorada.
  function ler(texto) {
    const objetos = [];
    for (const linha of String(texto).split('\n')) {
      try { const o = JSON.parse(linha); if (o && typeof o === 'object' && !Array.isArray(o)) objetos.push(o); } catch (e) { }
    }
    return { resumo: objetos.shift() || {}, eventos: objetos.filter(o => typeof o.e === 'string' && Number.isFinite(o.t)) };
  }
  async function carregar(id) {
    if (!FORMA_DO_ID.test(id)) throw new Error('id inválido');
    const r = await fetch('partidas?id=' + id, { cache: 'no-store' });
    if (!r.ok) throw new Error('gravação não encontrada');
    return ler(await r.text());
  }
  // As gravações guardadas, da mais nova para a mais antiga: [{ id, resumo }].
  async function listar() {
    const r = await fetch('partidas', { cache: 'no-store' });
    if (!r.ok) throw new Error('sem resposta do servidor');
    const lista = [];
    for (const item of await r.json()) {
      if (!item || !FORMA_DO_ID.test(item.id)) continue;
      let resumo = null;
      try { resumo = JSON.parse(item.resumo); } catch (e) { }
      lista.push({ id: item.id, resumo: resumo && typeof resumo === 'object' ? resumo : {} });
    }
    return lista;
  }
  const apagar = id => FORMA_DO_ID.test(id) ? fetch('partidas?id=' + id + '&apagar=1', { method: 'POST' }) : Promise.resolve();
  const abrirLista = () => { window.open('replays.html', '_blank', 'noopener'); };
  // "12/11/2026 22:19", a partir da data guardada no resumo.
  function quandoFoi(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  // ---------- o painel de quem assiste ----------
  const ESTILO_DO_PAINEL = { position: 'fixed', top: '12px', left: '12px', zIndex: '5', width: '262px', boxSizing: 'border-box', padding: '8px 10px', borderRadius: '8px',
    background: 'rgba(10, 14, 18, .86)', color: '#e8eef2', font: '13px/1.5 Consolas, "Cascadia Mono", monospace', userSelect: 'none', whiteSpace: 'normal' };
  function elemento(pai, tag, texto, estilo) {
    const el = document.createElement(tag);
    el.textContent = texto;                     // sempre como texto: os nomes vêm das iAs
    Object.assign(el.style, estilo);
    pai.appendChild(el);
    return el;
  }
  function cabecalho(painel, linha) {
    const topo = elemento(painel, 'div', '', { display: 'flex', alignItems: 'center', gap: '6px' });
    elemento(topo, 'span', '●', { color: '#e5383b' });
    elemento(topo, 'b', 'GRAVAÇÃO', {});
    elemento(topo, 'span', linha, { color: '#9fb0ba', marginLeft: 'auto' });
  }
  function ligacaoDaLista(pai) {
    const a = elemento(pai, 'a', '↩ replays', { color: '#7dffb0', marginLeft: 'auto', whiteSpace: 'nowrap' });
    a.title = 'voltar à lista de gravações';
    a.href = 'replays.html';
    return a;
  }
  // A gravação pedida não pôde ser tocada: um aviso no lugar do painel.
  function avisar(mensagem) {
    const painel = elemento(document.body, 'div', '', ESTILO_DO_PAINEL);
    painel.className = 'gravacao';
    cabecalho(painel, '');
    elemento(painel, 'div', mensagem, { margin: '4px 0' });
    ligacaoDaLista(elemento(painel, 'div', '', { display: 'flex' }));
  }

  // ---------- tocar ----------
  // Toca uma gravação lida por carregar(). Quem chama é o jogo, que diz como:
  //   titulo        o que aparece no painel (quem jogou)
  //   nomeDoPasso   'rodada', 'botão': a unidade em que se anda para a frente e para trás
  //   ehPasso(ev)   esse acontecimento é um passo?
  //   aplicar(ev, rapido)   faz o acontecimento acontecer no jogo. rapido: sem animação nem
  //                 som, porque quem assiste pulou para outro ponto da gravação
  //   espera(ev, intervalo, anterior)   quantos milissegundos esperar antes de `ev`, que na
  //                 gravação veio `intervalo` depois de `anterior`: é aqui que as esperas encolhem
  //   livre(ev)     dá para aplicar `ev` agora? (a quadra espera a reprise de um ponto acabar)
  //   destravar()   antes de um pulo: termina o que estiver no meio
  //   assentar()    depois de um pulo: põe o desenho no lugar, sem animação
  //   doComeco      true: para voltar, refaz a gravação desde o primeiro acontecimento, que
  //                 põe o jogo no estado inicial. false: recarrega a página no ponto pedido
  // O relógio é o do jogo: a cada quadro ele chama passo(dt), com os segundos que passaram, e
  // recebe quantos segundos passaram na gravação (nenhum na pausa, o dobro no ritmo 2);
  // depois chama soltar(), que aplica os acontecimentos cuja hora chegou.
  function tocador(gravada, o) {
    const ev = gravada.eventos, passos = [];
    ev.forEach((e, n) => { if (o.ehPasso(e)) passos.push(n); });
    const total = passos.length;
    let i = 0, falta = 700;                     // i: o próximo acontecimento; falta: milissegundos até ele
    let tocando = ENDERECO.get('parado') === '0';   // a gravação abre em pausa, para quem assiste começar quando quiser (o Espaço ou o botão); com ?parado=0 no endereço ela já abre tocando
    let ritmo = RITMOS.includes(Number(ENDERECO.get('ritmo'))) ? Number(ENDERECO.get('ritmo')) : 1;
    let voltando = null, marcada = false;       // voltando: o ponto para onde a página nova vai abrir, enquanto ela não vem (ver ir)
    const posicao = () => { if (voltando !== null) return voltando; let p = 0; while (p < total && passos[p] < i) p++; return p; };   // quantos passos já foram
    const acabou = () => i >= ev.length;
    function aplicarUm(rapido) {
      try { o.aplicar(ev[i], rapido); } catch (e) { console.error('gravação: acontecimento ' + i, e); }
      i++;
    }
    // A página recarrega no ponto `voltando`. Enquanto a nova não vem, esta continua na tela, parada.
    function recarregar() {
      marcada = false;
      const q = new URLSearchParams(location.search);
      q.set('em', String(voltando)); q.set('ritmo', String(ritmo));
      q.set('parado', tocando ? '0' : '1');     // (a página nova continua como esta estava: tocando ou em pausa)
      deixar(gravada);                          // a página nova não precisa buscar a gravação de novo
      if (!TROCA_SUAVE) guardarFoto();          // (no navegador sem a transição de página: a foto, por cima da tela preta)
      location.search = q.toString();
    }
    // Vai para o ponto em que `p` passos já aconteceram (0 = o começo).
    function ir(p) {
      p = Math.max(0, Math.min(total, Math.round(p)));
      const alvo = p >= total ? ev.length : passos[p];
      if (voltando !== null && p >= voltando) return;   // (já está voltando para antes disso: quem decide o resto é a página nova)
      if (alvo < i) {
        if (!o.doComeco) {                      // este jogo não sabe voltar: a página recarrega já nesse ponto
          voltando = p;                         // (um segundo pedido de voltar, antes de a página nova chegar, muda o ponto: ela abre já nele)
          mostrar();
          if (!marcada) { marcada = true; requestAnimationFrame(recarregar); }   // (no quadro seguinte: o painel já diz "voltando", e dois pedidos seguidos viram uma recarga só)
          return;
        }
        i = 0;
      }
      if (o.destravar) o.destravar();
      while (i < alvo) aplicarUm(true);
      if (o.assentar) o.assentar();
      falta = 600;
      mostrar();
    }
    function passo(dt) {
      if (!tocando || voltando !== null) return 0;
      falta -= dt * ritmo * 1000;
      return dt * ritmo;
    }
    function soltar() {
      if (!tocando || voltando !== null) return;
      let mudou = false;
      while (i < ev.length && falta <= 0) {
        if (o.livre && !o.livre(ev[i])) { falta = 450; break; }   // ainda não dá: tenta de novo, e deixa um respiro depois
        const anterior = ev[i];
        aplicarUm(false);
        mudou = true;
        if (i < ev.length) falta += Math.max(0, Number(o.espera(ev[i], ev[i].t - anterior.t, anterior)) || 0);
      }
      if (mudou) mostrar();
    }
    function alternar() {
      if (acabou() && tocando) { ir(0); return; }   // no fim, o botão recomeça
      tocando = !tocando;
      mostrar();
    }
    function mudarRitmo(r) {
      if (!RITMOS.includes(r)) return;
      ritmo = r;
      mostrar();
    }

    // o painel: de quem é a gravação, os botões, onde ela está e a velocidade
    const painel = elemento(document.body, 'div', '', ESTILO_DO_PAINEL);
    painel.className = 'gravacao';              // (para a página poder dar outra cara a ele: ver index.html)
    cabecalho(painel, quandoFoi(gravada.resumo.quando));
    elemento(painel, 'div', o.titulo || '', { fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
    const linhaDosBotoes = elemento(painel, 'div', '', { display: 'flex', gap: '4px', margin: '4px 0' });
    const botao = (pai, texto, dica, acao) => {
      const b = elemento(pai, 'div', texto, { cursor: 'pointer', padding: '1px 7px', borderRadius: '5px', background: 'rgba(255,255,255,.12)', whiteSpace: 'nowrap' });
      b.title = dica;
      b.addEventListener('click', acao);
      return b;
    };
    botao(linhaDosBotoes, '|◀', 'do começo (Home)', () => ir(0));
    botao(linhaDosBotoes, '◀', `${o.nomeDoPasso} anterior (←)`, () => ir(posicao() - 1));
    const elTocar = botao(linhaDosBotoes, '', 'pausar e continuar (Espaço)', alternar);
    Object.assign(elTocar.style, { flex: '1', textAlign: 'center', fontWeight: 'bold' });
    botao(linhaDosBotoes, '▶', `${o.nomeDoPasso} seguinte (→)`, () => ir(posicao() + 1));
    const elOnde = elemento(painel, 'div', '', { color: '#cfd8de' });
    const regua = document.createElement('input');
    Object.assign(regua, { type: 'range', min: '0', max: String(total), step: '1', value: '0' });
    Object.assign(regua.style, { width: '100%', margin: '2px 0', accentColor: '#7dffb0' });
    regua.title = 'arraste para ir a outro ponto da gravação';
    regua.addEventListener('change', () => { ir(Number(regua.value)); regua.blur(); });   // (blur: devolve as setas do teclado ao painel)
    painel.appendChild(regua);
    const linhaDoRitmo = elemento(painel, 'div', '', { display: 'flex', gap: '4px', alignItems: 'center' });
    const botoesDeRitmo = RITMOS.map(r => botao(linhaDoRitmo, String(r).replace('.', ',') + '×', 'velocidade (↑ ↓)', () => mudarRitmo(r)));
    ligacaoDaLista(linhaDoRitmo);
    elemento(painel, 'div', 'Espaço pausa · ← → ' + o.nomeDoPasso + ' · ↑ ↓ velocidade', { color: '#9fb0ba', fontSize: '11px', lineHeight: '1.3', marginTop: '4px' });
    function mostrar() {
      const p = posicao();
      elTocar.textContent = acabou() && tocando ? '↻ de novo' : tocando ? '❚❚ pausar' : '▶ tocar';
      elOnde.textContent = `${o.nomeDoPasso} ${p} de ${total}` + (voltando !== null ? ' · voltando…' : acabou() ? ' · fim da gravação' : tocando ? '' : ' · em pausa');
      if (document.activeElement !== regua) regua.value = String(p);
      botoesDeRitmo.forEach((b, n) => { const aceso = RITMOS[n] === ritmo; b.style.background = aceso ? '#7dffb0' : 'rgba(255,255,255,.12)'; b.style.color = aceso ? '#0a0e12' : '#e8eef2'; });
    }
    window.addEventListener('keydown', e => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const onde = RITMOS.indexOf(ritmo);
      const acao = { Space: alternar, ArrowLeft: () => ir(posicao() - 1), ArrowRight: () => ir(posicao() + 1), Home: () => ir(0),
        ArrowUp: () => mudarRitmo(RITMOS[onde + 1]), ArrowDown: () => mudarRitmo(RITMOS[onde - 1]) }[e.code];
      if (!acao) return;
      e.preventDefault();
      if (e.code === 'Space' && e.repeat) return;
      acao();
    });
    // a página foi recarregada para voltar a um ponto da gravação (ver ir)
    const em = Number(ENDERECO.get('em'));
    if (Number.isFinite(em) && em > 0) ir(em); else mostrar();
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(tirarFoto)));   // o jogo já desenhou o ponto pedido: a foto da página anterior sai
    return { passo, soltar, ir, alternar, mudarRitmo, posicao, acabou, total, painel, get tocando() { return tocando; }, get ritmo() { return ritmo; } };
  }

  // O atalho para a aba de replays que fica na página do jogo (index.html): só faz sentido com
  // o servidor ligado e fora de uma gravação.
  const atalho = document.getElementById('replays');
  if (atalho && (!noServidor || assistindo)) atalho.hidden = true;

  window.gravacao = { assistindo, noServidor, gravar, carregar, deixada, listar, apagar, abrirLista, quandoFoi, tocador, avisar };
})();
