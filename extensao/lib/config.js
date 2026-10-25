// Configuração da extensão (chrome.storage.local) e feriados.
(function (raiz) {
  'use strict';

  const PADRAO = {
    psofficeBase: 'https://psofficeapp.com.br/ideen',
    jiraBase: '',
    prefixosJira: [],
    // Sem chave do Jira no dia, a justificativa fica vazia: títulos de PR/commit do cliente
    // só vão para o PSOffice se a pessoa ligar esta opção.
    justificativaComTitulos: false,
    jornadaHoras: 8,
    atividadePadrao: '',
    horaLembrete: '17:30',
    horaEnvio: '16:00',
    inicioExpediente: '08:00',
    fimExpediente: '18:00',
    selecionarAtividadesAuto: true,
    tipoAusencia: '',
    feriadosExtras: [],
  };

  async function ler() {
    const salvo = (await chrome.storage.local.get('config')).config || {};
    // Versão 1.0 guardava um token do GitHub aqui; a ponte local substituiu isso.
    if ('githubToken' in salvo) {
      delete salvo.githubToken;
      delete salvo.githubLogin;
      await chrome.storage.local.set({ config: salvo });
    }
    return Object.assign({}, PADRAO, salvo);
  }

  async function salvar(parcial) {
    const atual = await ler();
    const nova = Object.assign(atual, parcial);
    await chrome.storage.local.set({ config: nova });
    return nova;
  }

  // Feriados nacionais (BrasilAPI, guardados por ano) + feriados extras da configuração.
  async function feriados(anos, cfg) {
    const conjunto = new Set(cfg.feriadosExtras || []);
    for (const ano of new Set(anos)) {
      const chave = `feriados_${ano}`;
      let lista = (await chrome.storage.local.get(chave))[chave];
      if (!lista) {
        try {
          const r = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`);
          if (r.ok) {
            lista = (await r.json()).map((f) => f.date);
            await chrome.storage.local.set({ [chave]: lista });
          }
        } catch (e) {
          // Sem internet para a BrasilAPI: segue só com os feriados extras.
        }
      }
      for (const d of lista || []) conjunto.add(d);
    }
    return conjunto;
  }

  raiz.Config = { PADRAO, ler, salvar, feriados };
})(typeof globalThis !== 'undefined' ? globalThis : this);
