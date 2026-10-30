(async function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const cfg = await Config.ler();

  $('jornadaHoras').value = cfg.jornadaHoras;
  $('inicioExpediente').value = cfg.inicioExpediente;
  $('fimExpediente').value = cfg.fimExpediente;
  $('horaLembrete').value = cfg.horaLembrete;
  $('horaEnvio').value = cfg.horaEnvio;
  $('selecionarAtividadesAuto').checked = cfg.selecionarAtividadesAuto;
  $('jiraBase').value = cfg.jiraBase;
  $('prefixosJira').value = cfg.prefixosJira.join(', ');
  $('justificativaComTitulos').checked = cfg.justificativaComTitulos;
  $('feriadosExtras').value = cfg.feriadosExtras.join('\n');
  $('psofficeBase').value = cfg.psofficeBase;

  function mensagem(msg) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, (r) => (r && r.ok ? resolve(r.dados) : reject(new Error(r ? r.erro : 'Sem resposta'))));
    });
  }

  const horasBr = (h) => String(h).replace('.', ',');

  // Resumo em linguagem simples do que o assistente vai fazer com os valores da tela.
  function atualizarPratica() {
    const jornada = Number($('jornadaHoras').value) || 8;
    const inicio = $('inicioExpediente').value || '08:00';
    const fim = $('fimExpediente').value || '18:00';
    const itens = [
      `Dia útil em que você trabalhou e não lançou horas: sugere <b>${horasBr(jornada)}h</b>.`,
      `Atividade no GitHub antes das <b>${inicio}</b> ou depois das <b>${fim}</b>: aviso de possível hora extra (um review isolado vale cerca de 0,25h).`,
      `Atividade entre ${inicio} e ${fim}: nunca vira hora extra; almoço e pausas não são descontados.`,
      'Fim de semana e feriado: toda atividade conta como possível hora extra.',
    ];
    $('pratica').innerHTML = itens.map((t) => `<li>${t}</li>`).join('');
    const invalido = $('fimExpediente').value && $('inicioExpediente').value && $('fimExpediente').value <= $('inicioExpediente').value;
    $('erroHorario').hidden = !invalido;
    return !invalido;
  }

  function status(texto, tipo) {
    $('salvo').textContent = texto;
    $('salvo').className = tipo || '';
  }

  async function salvar() {
    if (!atualizarPratica()) return status('Não salvo: o horário de fim precisa ser depois do início.', 'erro');
    await Config.salvar({
      jornadaHoras: Number($('jornadaHoras').value) || 8,
      inicioExpediente: $('inicioExpediente').value || '08:00',
      fimExpediente: $('fimExpediente').value || '18:00',
      horaLembrete: $('horaLembrete').value || '17:30',
      horaEnvio: $('horaEnvio').value || '16:00',
      selecionarAtividadesAuto: $('selecionarAtividadesAuto').checked,
      jiraBase: $('jiraBase').value.trim(),
      prefixosJira: $('prefixosJira').value.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
      justificativaComTitulos: $('justificativaComTitulos').checked,
      atividadePadrao: $('atividadePadrao').value,
      feriadosExtras: $('feriadosExtras').value.split(/\s+/).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)),
      psofficeBase: $('psofficeBase').value.trim().replace(/\/+$/, ''),
    });
    status(`Salvo às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`, 'ok');
  }

  // Salva sozinho a cada alteração.
  document.querySelectorAll('input, select, textarea').forEach((el) => {
    el.addEventListener('change', () => salvar().catch((e) => status(e.message, 'erro')));
    if (el.type === 'number' || el.type === 'time') el.addEventListener('input', atualizarPratica);
  });

  async function verificarPonte() {
    $('statusGithub').textContent = 'Verificando...';
    $('statusGithub').className = 'selo';
    try {
      const { login } = await mensagem({ tipo: 'statusPonte' });
      $('statusGithub').textContent = `Conectado como ${login}`;
      $('statusGithub').className = 'selo ok';
      $('instalar').hidden = true;
    } catch (e) {
      $('statusGithub').textContent = /instale a ponte/i.test(e.message) ? 'Ponte local não instalada' : e.message;
      $('statusGithub').className = 'selo erro';
      $('instalar').hidden = false;
    }
  }

  // Lista as atividades do PSOffice pelo nome (em vez de pedir o atribId); sem sessão, fica só "Automática".
  async function carregarAtividades() {
    const select = $('atividadePadrao');
    try {
      const lista = await mensagem({ tipo: 'atividades' });
      for (const a of lista) select.add(new Option(a.nome, a.atribId));
      if (!lista.length) $('ajudaAtividade').textContent = 'Nenhuma atividade encontrada nas últimas semanas do PSOffice.';
    } catch (e) {
      $('ajudaAtividade').textContent = 'Abra o PSOffice logado e recarregue esta página para escolher uma atividade.';
    }
    if (cfg.atividadePadrao && ![...select.options].some((o) => o.value === cfg.atividadePadrao)) {
      select.add(new Option(`Atividade ${cfg.atividadePadrao} (salva antes)`, cfg.atividadePadrao));
    }
    select.value = cfg.atividadePadrao || '';
  }

  $('testar').onclick = verificarPonte;

  // Roda os lembretes já, sem esperar o horário (útil para conferir se as notificações aparecem).
  $('verificar').onclick = async () => {
    try {
      await salvar();
      await chrome.storage.local.remove('estado');
      await mensagem({ tipo: 'rodarCiclo', forcar: true });
      status('Lembretes testados. Se faltar algo na semana, uma notificação aparece.', 'ok');
    } catch (e) {
      status(e.message, 'erro');
    }
  };

  atualizarPratica();
  verificarPonte();
  carregarAtividades();
})();
