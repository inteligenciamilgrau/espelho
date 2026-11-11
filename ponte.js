/* Ponte entre a página do jogo e o servidor MCP (servidor.ps1).
 *
 * A página fica com um pedido pendurado em /ponte; o servidor responde quando a iA aperta
 * um botão. A página aperta o mesmo botão em window.jogo e, no pedido seguinte, avisa que
 * terminou (mandando junto a imagem, se o botão devolveu uma).
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

  (async function ciclo() {
    // Quem é esta aba e quando foi carregada: o servidor entrega o jogo à aba mais nova.
    const eu = '/ponte?aba=' + Math.random().toString(36).slice(2) + '&desde=' + Date.now();
    const perdeu = () => avisar('Esta aba saiu do jogo: uma aba mais nova assumiu.\nA iA está jogando lá. Recarregue (F5) para trazer o jogo para cá.', true);
    let feito = '', corpo = null;                // o comando que acabou de ser executado
    let ligada = false;
    for (;;) {
      let resposta;
      try {
        if (!ligada) {                           // um pedido rápido, só para saber se o servidor está lá
          if ((await fetch(eu + '&fim=1', { method: 'POST' })).status === 409) return perdeu();
          ligada = true;
          avisar('MCP ligado nesta aba');
        }
        resposta = await fetch(eu + '&id=' + feito, { method: 'POST', body: corpo });   // fica pendurado até haver um comando
      } catch (e) {                              // servidor fora do ar: tenta de novo daqui a pouco
        feito = ''; corpo = null; ligada = false;
        avisar('MCP desligado: o servidor não responde', true);
        await pausa(500);
        continue;
      }
      feito = ''; corpo = null;
      if (resposta.status === 409) return perdeu();   // esta aba para de vez
      if (resposta.status !== 200) continue;     // ninguém pediu nada: pendura de novo

      const c = await resposta.json();
      if (c.comando === 'comecar') {             // começa o desafio pedido: avisa e recarrega a página nele
        try { await fetch(eu + '&id=' + c.id + '&fim=1', { method: 'POST' }); } catch (e) { }
        jogo.comecar(c.args[0]);
        return;
      }
      const saida = jogo.apertar(c.args[0], c.args[1] || '');     // comando 'apertar': [botão, texto]
      if (typeof saida === 'string') corpo = bytesDoPng(saida);   // só o botão do frame devolve algo
      feito = c.id + (jogo.estado.ganhou ? '&ganhou=1' : '');     // vencido: o servidor dá os parabéns à iA
    }
  })();
})();
