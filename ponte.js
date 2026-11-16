/* Ponte entre a página do jogo e o servidor MCP (servidor.ps1).
 *
 * A página fica com um pedido pendurado em /ponte; o servidor responde quando uma iA aperta
 * um botão. A página aperta o mesmo botão em window.jogo e, quando o botão termina, avisa o
 * servidor com um pedido rápido (mandando junto a imagem, se o botão devolveu uma).
 *
 * Enquanto um botão não termina, a página já volta a ficar pendurada, pronta para o próximo.
 * Isso importa no desafio M: lá a jogada de um jogador só termina quando a rodada fecha,
 * isto é, depois que o outro jogador também jogou — e o botão dele chega por aqui.
 *
 * Só liga quando a página vem do servidor (http://localhost:...). Aberta direto do
 * arquivo, o jogo continua só no teclado.
 */
(() => {
  'use strict';
  if (!location.protocol.startsWith('http')) return;
  // Assistindo a uma gravação (ver gravacao.js), a página não se liga ao servidor: senão esta
  // aba, por ser a mais nova, tomaria o jogo da aba em que as iAs estão jogando.
  if (window.gravacao && window.gravacao.assistindo) return;
  const jogo = window.jogo;

  function bytesDoPng(dataUrl) {
    const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  const pausa = ms => new Promise(ok => setTimeout(ok, ms));

  // Aviso no canto da página: diz se ESTA aba é a que a iA está controlando. Só uma aba
  // fica ligada ao servidor por vez; as outras ficam paradas, e é fácil olhar para a errada.
  const aviso = document.getElementById('ponte');
  function avisar(texto, alerta) {
    aviso.textContent = texto;
    aviso.classList.toggle('alerta', !!alerta);
    aviso.hidden = false;
  }

  // O alerta: o servidor avisa quando alguém pede um arquivo do jogo sem ser esta página (ver servidor.ps1, "a credencial
  // da página"). Pode ser a iA tentando ler o código, em vez de jogar. O pedido já foi recusado; aqui ele vira um aviso
  // no alto da página, para quem assiste saber que aquela partida pode não valer, e vai para a gravação (jogo.alerta).
  // O aviso é da página: nunca entra na imagem que a iA recebe. Tudo o que vem no alerta é tratado como texto.
  let elAlerta = null, alertasVistos = 0;
  function mostrarAlerta(lista) {
    lista = Array.isArray(lista) ? lista.slice(0, 20) : [];
    if (!lista.length) return;
    const limpo = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
    const ultimo = lista[lista.length - 1] || {}, arquivo = limpo(ultimo.arquivo, 40);
    const oQue = !arquivo || arquivo === 'a pagina do jogo' ? 'a página do jogo' : 'o arquivo ' + arquivo.replace(/^\/+/, '');
    alertasVistos += lista.length;
    if (!elAlerta) {
      elAlerta = document.createElement('div');
      Object.assign(elAlerta.style, { position: 'fixed', top: '64px', left: '50%', transform: 'translateX(-50%)', zIndex: '40', boxSizing: 'border-box', width: 'max-content', maxWidth: 'min(740px, calc(100vw - 32px))',
        padding: '12px 18px', borderRadius: '12px', background: 'rgba(150, 24, 20, .96)', border: '1px solid rgba(255, 255, 255, .35)', color: '#fff', font: '600 14px/1.45 system-ui, "Segoe UI", sans-serif',
        boxShadow: '0 12px 32px rgba(0, 0, 0, .5)', cursor: 'pointer', whiteSpace: 'pre-line', userSelect: 'none' });
      elAlerta.id = 'alerta';
      elAlerta.title = 'clique para fechar';
      elAlerta.addEventListener('click', () => { elAlerta.hidden = true; });
      document.body.appendChild(elAlerta);
    }
    elAlerta.textContent = `⚠ Alguém pediu ${oQue} sem ser esta página (${limpo(ultimo.hora, 8)}, por ${limpo(ultimo.agente, 60) || 'programa sem nome'}).\n`
      + 'O servidor recusou. Se uma iA está jogando, ela pode estar tentando ler o código do jogo: esta partida pode não valer.\n'
      + (alertasVistos > 1 ? `(${alertasVistos} pedidos assim desde que esta página abriu · clique para fechar)` : '(clique para fechar)');
    elAlerta.hidden = false;
    try { if (typeof jogo.alerta === 'function') jogo.alerta(lista.map(a => ({ arquivo: limpo(a && a.arquivo, 40), agente: limpo(a && a.agente, 60) }))); } catch (e) { }
  }

  // Quem é esta aba e quando foi carregada: o servidor entrega o jogo à aba mais nova.
  // (O endereço é relativo ao da página: ela mora num endereço com uma chave que só o navegador conhece.)
  const eu = 'ponte?aba=' + Math.random().toString(36).slice(2) + '&desde=' + Date.now();

  // Avisa o servidor que o comando `id` terminou. Junto vai o que a iA precisa saber no
  // lugar do "recebido" de sempre:
  //   o resultado do jogo para quem apertou (ganhou ou perdeu);
  //   um aviso da quadra (saida.aviso): 'espera' = o outro jogador ainda não entrou;
  //   'lotado' = não há lugar para essa iA na partida;
  //   'aguarde' = o outro jogador não jogou a tempo: o jogo está parado e a jogada não valeu;
  //   'inicio' = a partida começou agora, e a iA recebe o texto de início do desafio.
  async function concluir(id, quem, corpo, saida) {
    let extra = '';
    try {
      const fim = jogo.resultado ? jogo.resultado(quem) : jogo.estado.ganhou ? 'ganhou' : '';
      if (fim) extra += '&' + fim + '=1';
      if (saida && saida.aviso === 'espera') extra += '&espera=1';
      if (saida && saida.aviso === 'lotado') extra += '&lotado=1';
      if (saida && saida.aviso === 'aguarde') extra += '&aguarde=1';
      // os outros avisos da quadra (o juiz perguntando se está pronto, a partida valendo, a passada que não valeu): o texto de cada um está em ferramentas.json
      if (saida && ['pronto', 'esperaPronto', 'valendo', 'semPassar', 'saiu', 'cadeiraOcupada', 'jogadorNaoComenta', 'semIntencao', 'semNome', 'saiuDoJogo', 'foraDoJogo'].includes(saida.aviso)) extra += '&aviso=' + saida.aviso;
      if (saida && saida.aviso === 'inicio') extra += '&inicio=' + encodeURIComponent(jogo.desafio);
      // notas da quadra para essa iA ler junto com a resposta (o placar que mudou, por exemplo)
      const notas = jogo.novidades ? jogo.novidades(quem) : [];
      if (notas.length) extra += '&nota=' + encodeURIComponent(JSON.stringify(notas));
    } catch (e) { }
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      try { await fetch(eu + '&id=' + id + extra + '&fim=1', { method: 'POST', body: corpo }); return; } catch (e) { await pausa(200); }
    }
  }
  // Aperta o botão pedido. Na quadra, apertar devolve uma promessa (a rodada); nos outros
  // desafios, o botão termina na hora. Só o botão do frame devolve uma imagem.
  async function executar(c) {
    let saida;
    try { saida = await jogo.apertar(c.args[0], c.args[1] || '', c.quem, c.args[2] || '', c.args[3] || '', c.args[4] || ''); } catch (e) { }   // [botão, texto, nome, modelo, intenção]
    await concluir(c.id, c.quem, typeof saida === 'string' ? bytesDoPng(saida) : null, saida);
  }
  // A página foi recarregada para atender ao `comecar` de uma iA (ver o fim de arena.js):
  // o pedido dela ainda está em aberto no servidor, e é esta página que responde.
  if (jogo.pendenteDoInicio) {
    const p = jogo.pendenteDoInicio;
    p.espera.then(saida => concluir(p.id, p.quem, null, saida));
  }

  (async function ciclo() {
    const perdeu = () => avisar('Esta aba saiu do jogo: uma aba mais nova assumiu.\nA iA está jogando lá. Recarregue (F5) para trazer o jogo para cá.', true);
    // (403: esta aba não tem a credencial que o servidor dá ao navegador que ele abre — por exemplo, a página veio da memória do navegador)
    const semPermissao = () => avisar('Esta aba não tem a permissão do servidor do jogo.\nUse a aba que o servidor abriu, ou feche o servidor e ligue de novo.', true);
    let ligada = false;
    for (;;) {
      let resposta;
      try {
        if (!ligada) {                           // um pedido rápido, só para saber se o servidor está lá
          const primeiro = (await fetch(eu + '&fim=1', { method: 'POST' })).status;
          if (primeiro === 409) return perdeu();
          if (primeiro === 403) return semPermissao();
          ligada = true;
          avisar('MCP ligado nesta aba');
        }
        resposta = await fetch(eu, { method: 'POST' });   // fica pendurado até haver um comando
      } catch (e) {                              // servidor fora do ar: tenta de novo daqui a pouco
        ligada = false;
        avisar('MCP desligado: o servidor não responde', true);
        await pausa(500);
        continue;
      }
      if (resposta.status === 409) return perdeu();   // esta aba para de vez
      if (resposta.status === 403) return semPermissao();
      if (resposta.status !== 200) continue;     // ninguém pediu nada: pendura de novo

      const c = await resposta.json();
      if (c.comando === 'alerta') { mostrarAlerta(c.alertas); continue; }   // alguém pediu um arquivo do jogo sem ser esta página
      if (c.comando === 'comecar') {             // começa o desafio pedido: [desafio, nome de guerra, modelo] (no desafio 9, mais dois: a missão e o nível)
        const desafio = String(c.args[0]);
        // (A vila coletiva, V, é como a quadra: se a página já está nela, a iA só entra, sem recarregar nada.)
        if (desafio !== 'M' && desafio !== 'T' && desafio !== 'C' && desafio !== 'V') {   // desafios 1 a 6: responde e recarrega a página no desafio
          await concluir(c.id, c.quem, null);
          if (jogo.comecar(desafio, c.quem, null, c.args[1] || '', c.args[2] || '', c.args[3], c.args[4])) return;   // o nome e o modelo vão junto: a página nova mostra quem está jogando (e, no desafio 9, a missão e o nível pedidos)
          continue;
        }
        // Na quadra, a resposta pode demorar: no desafio M a iA aguarda o outro jogador. (Na vila coletiva ela entra na hora.)
        const saida = jogo.comecar(desafio, c.quem, c.id, c.args[1] || '', c.args[2] || '');
        if (saida === true) return;              // recarregando: quem responde é a página nova
        Promise.resolve(saida).then(s => concluir(c.id, c.quem, null, s));
        continue;
      }
      executar(c);                               // comando 'apertar': [botão, texto]. Não espera terminar para pendurar de novo
    }
  })();
})();
