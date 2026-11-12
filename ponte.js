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

  // Quem é esta aba e quando foi carregada: o servidor entrega o jogo à aba mais nova.
  const eu = '/ponte?aba=' + Math.random().toString(36).slice(2) + '&desde=' + Date.now();

  // Avisa o servidor que o comando `id` terminou. Junto vai o que a iA precisa saber no
  // lugar do "recebido" de sempre:
  //   o resultado do jogo para quem apertou (ganhou ou perdeu);
  //   um aviso da quadra (saida.aviso): 'espera' = o outro jogador ainda não entrou;
  //   'lotado' = não há lugar para essa iA na partida;
  //   'inicio' = a partida começou agora, e a iA recebe o texto de início do desafio.
  async function concluir(id, quem, corpo, saida) {
    let extra = '';
    try {
      const fim = jogo.resultado ? jogo.resultado(quem) : jogo.estado.ganhou ? 'ganhou' : '';
      if (fim) extra += '&' + fim + '=1';
      if (saida && saida.aviso === 'espera') extra += '&espera=1';
      if (saida && saida.aviso === 'lotado') extra += '&lotado=1';
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
    try { saida = await jogo.apertar(c.args[0], c.args[1] || '', c.quem, c.args[2] || ''); } catch (e) { }
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
    let ligada = false;
    for (;;) {
      let resposta;
      try {
        if (!ligada) {                           // um pedido rápido, só para saber se o servidor está lá
          if ((await fetch(eu + '&fim=1', { method: 'POST' })).status === 409) return perdeu();
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
      if (resposta.status !== 200) continue;     // ninguém pediu nada: pendura de novo

      const c = await resposta.json();
      if (c.comando === 'comecar') {             // começa o desafio pedido: [desafio, nome de guerra]
        const desafio = String(c.args[0]);
        if (desafio !== 'M' && desafio !== 'T') {          // desafios 1 a 3: responde e recarrega a página no desafio
          await concluir(c.id, c.quem, null);
          if (jogo.comecar(desafio, c.quem)) return;
          continue;
        }
        // Na quadra, a resposta pode demorar: no desafio M a iA aguarda o outro jogador.
        const saida = jogo.comecar(desafio, c.quem, c.id, c.args[1] || '');
        if (saida === true) return;              // recarregando: quem responde é a página nova
        Promise.resolve(saida).then(s => concluir(c.id, c.quem, null, s));
        continue;
      }
      executar(c);                               // comando 'apertar': [botão, texto]. Não espera terminar para pendurar de novo
    }
  })();
})();
