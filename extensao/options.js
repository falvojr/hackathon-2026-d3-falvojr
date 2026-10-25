(async function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const cfg = await Config.ler();

  $('jornadaHoras').value = cfg.jornadaHoras;
  $('atividadePadrao').value = cfg.atividadePadrao;
  $('jiraBase').value = cfg.jiraBase;
  $('prefixosJira').value = cfg.prefixosJira.join(', ');
  $('justificativaComTitulos').checked = cfg.justificativaComTitulos;
  $('horaLembrete').value = cfg.horaLembrete;
  $('horaEnvio').value = cfg.horaEnvio;
  $('inicioExpediente').value = cfg.inicioExpediente;
  $('fimExpediente').value = cfg.fimExpediente;
  $('selecionarAtividadesAuto').checked = cfg.selecionarAtividadesAuto;
  $('feriadosExtras').value = cfg.feriadosExtras.join('\n');
  $('psofficeBase').value = cfg.psofficeBase;

  function status(el, texto, tipo) {
    el.textContent = texto;
    el.className = tipo || '';
  }

  function mensagem(msg) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, (r) => (r && r.ok ? resolve(r.dados) : reject(new Error(r ? r.erro : 'Sem resposta'))));
    });
  }

  async function salvar() {
    const parcial = {
      jornadaHoras: Number($('jornadaHoras').value) || 8,
      atividadePadrao: $('atividadePadrao').value.trim(),
      jiraBase: $('jiraBase').value.trim(),
      prefixosJira: $('prefixosJira').value.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
      justificativaComTitulos: $('justificativaComTitulos').checked,
      horaLembrete: $('horaLembrete').value || '17:30',
      horaEnvio: $('horaEnvio').value || '16:00',
      inicioExpediente: $('inicioExpediente').value || '08:00',
      fimExpediente: $('fimExpediente').value || '18:00',
      selecionarAtividadesAuto: $('selecionarAtividadesAuto').checked,
      feriadosExtras: $('feriadosExtras').value.split(/\s+/).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)),
      psofficeBase: $('psofficeBase').value.trim().replace(/\/+$/, ''),
    };
    Object.assign(cfg, await Config.salvar(parcial));
  }

  async function verificarPonte() {
    status($('statusGithub'), 'Verificando...');
    try {
      const { login } = await mensagem({ tipo: 'statusPonte' });
      status($('statusGithub'), `Ponte ok: lendo o GitHub como ${login}`, 'ok');
    } catch (e) {
      status($('statusGithub'), e.message, 'erro');
    }
  }

  $('testar').onclick = verificarPonte;
  verificarPonte();

  $('salvar').onclick = async () => {
    try {
      await salvar();
      status($('status'), 'Salvo.', 'ok');
    } catch (e) {
      status($('status'), e.message, 'erro');
    }
  };

  // Força um ciclo dos lembretes já (útil para testar sem esperar o horário).
  $('verificar').onclick = async () => {
    try {
      await salvar();
      await chrome.storage.local.remove('estado');
      await mensagem({ tipo: 'rodarCiclo', forcar: true });
      status($('status'), 'Salvo e verificado. Se houver pendências, uma notificação aparece.', 'ok');
    } catch (e) {
      status($('status'), e.message, 'erro');
    }
  };
})();
