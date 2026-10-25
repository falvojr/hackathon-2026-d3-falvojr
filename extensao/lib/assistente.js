// Junta PSOffice + GitHub + feriados numa análise da semana. Usado pelo painel e pelos lembretes.
(function (raiz) {
  'use strict';

  const R = raiz.Regras;

  function hojeLocal() {
    return R.dataLocal(Date.now());
  }

  const PONTE = 'br.com.ideen.assistente_horas';
  const INSTALAR_PONTE = 'Instale a ponte local do GitHub: node extensao/ponte/instalar.js --usuario <sua-conta-do-gh>';

  // Pergunta à ponte local (extensao/ponte/ponte.js), que lê o GitHub com o `gh` já autenticado.
  // Só existe no service worker e nas páginas da extensão (não no painel).
  function pedirPonte(msg) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendNativeMessage(PONTE, msg, (r) => {
        if (chrome.runtime.lastError) {
          const original = chrome.runtime.lastError.message;
          return reject(new Error(/not found/i.test(original) ? `${INSTALAR_PONTE} (${original})` : `Ponte local: ${original}`));
        }
        if (!r || !r.ok) return reject(new Error(`Ponte local: ${r ? r.erro : 'sem resposta'}`));
        resolve(r.dados);
      });
    });
  }

  // Evidências do GitHub com cache de 10 minutos (a busca do GitHub tem limite por minuto).
  async function evidencias(cfg, inicio, fim) {
    const chave = `evid_${inicio}_${fim}`;
    const cache = (await chrome.storage.local.get(chave))[chave];
    if (cache && Date.now() - cache.em < 10 * 60 * 1000) return cache.dados;
    try {
      const dados = await pedirPonte({ tipo: 'evidencias', inicio, fim });
      await chrome.storage.local.set({ [chave]: { em: Date.now(), dados } });
      return dados;
    } catch (e) {
      return { porDia: {}, avisos: [e.message] };
    }
  }

  /**
   * Analisa a semana que contém `iso`. `remoto` permite que o painel peça evidências e
   * feriados ao service worker (GitHub e BrasilAPI são chamados de lá, sem CORS).
   */
  async function analisar(cliente, iso, remoto) {
    const cfg = await raiz.Config.ler();
    const semana = await cliente.lerSemana(iso);
    const fim = R.somarDias(semana.inicio, 6);
    const anos = [semana.inicio.slice(0, 4), fim.slice(0, 4)];
    const [aus, feriados, evid] = await Promise.all([
      cliente.lerAusencias(),
      remoto ? remoto.feriados(anos).then((l) => new Set(l)) : raiz.Config.feriados(anos, cfg),
      remoto ? remoto.evidencias(semana.inicio, fim) : evidencias(cfg, semana.inicio, fim),
    ]);
    const analise = R.analisarSemana({ semana, ausencias: aus.ausencias, feriados, evidencias: evid.porDia, cfg, hoje: hojeLocal() });
    return { cfg, semana, ausencias: aus, feriados, evid, analise };
  }

  // Atividades da semana anterior com apontamento (volta até 4 semanas, para cobrir férias).
  async function atividadesAnteriores(cliente, iso) {
    for (let n = 1; n <= 4; n++) {
      const s = await cliente.lerSemana(R.somarDias(R.inicioDaSemana(iso), -7 * n));
      if (s.atividades.length) return s.atividades.map((a) => a.atribId);
    }
    return [];
  }

  // Se a semana começou sem atividades, repete as da semana anterior.
  async function garantirAtividades(cliente, iso) {
    const semana = await cliente.lerSemana(iso);
    if (semana.atividades.length) return null;
    const ids = await atividadesAnteriores(cliente, iso);
    if (!ids.length) return null;
    return cliente.selecionarAtividades(iso, ids);
  }

  raiz.Assistente = { hojeLocal, pedirPonte, evidencias, analisar, atividadesAnteriores, garantirAtividades };
})(typeof globalThis !== 'undefined' ? globalThis : this);
