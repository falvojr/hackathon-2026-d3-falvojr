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
      `Dia com atividade e sem horas: sugere <b>${horasBr(jornada)}h</b> e os links do Jira.`,
      'Dia sem horas e sem atividade: sugere ausência.',
      `Atividade antes das <b>${inicio}</b>, depois das <b>${fim}</b> ou no fim de semana: possível hora extra.`,
      'Almoço e pausas não contam.',
      'Nada é gravado sem você confirmar.',
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
    if (!atualizarPratica()) return status('Não salvo: confira o horário de trabalho.', 'erro');
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
      $('testar').hidden = true;
    } catch (e) {
      $('statusGithub').textContent = /instale a ponte/i.test(e.message) ? 'Não conectado' : e.message;
      $('statusGithub').className = 'selo erro';
      $('instalar').hidden = false;
      $('testar').hidden = false;
    }
  }

  // Lista as atividades do PSOffice pelo nome (em vez de pedir o atribId); sem sessão, fica só "Automática".
  async function carregarAtividades() {
    const select = $('atividadePadrao');
    try {
      const lista = await mensagem({ tipo: 'atividades' });
      for (const a of lista) select.add(new Option(a.nome, a.atribId));
      if (!lista.length) $('ajudaAtividade').textContent = 'Nenhuma atividade encontrada no PSOffice.';
    } catch (e) {
      $('ajudaAtividade').textContent = 'Abra o PSOffice e recarregue esta página para ver suas atividades.';
    }
    if (cfg.atividadePadrao && ![...select.options].some((o) => o.value === cfg.atividadePadrao)) {
      select.add(new Option(`Atividade ${cfg.atividadePadrao}`, cfg.atividadePadrao));
    }
    select.value = cfg.atividadePadrao || '';
  }

  $('testar').onclick = verificarPonte;

  // Mostra agora os avisos que sairiam (sem gravar no PSOffice nem mexer nos avisos reais do dia).
  $('verificar').onclick = async () => {
    const resultado = $('resultadoTeste');
    resultado.className = '';
    resultado.textContent = 'Conferindo...';
    try {
      await salvar();
      const mostradas = await mensagem({ tipo: 'rodarCiclo', forcar: true });
      resultado.className = 'ok';
      resultado.textContent = mostradas.length
        ? `Aviso mostrado: ${mostradas.join('; ')}.`
        : 'Nada pendente agora.';
    } catch (e) {
      resultado.className = 'erro';
      resultado.textContent = /sess/i.test(e.message) ? 'Entre no PSOffice e tente de novo.' : e.message;
    }
  };

  atualizarPratica();
  verificarPonte();
  carregarAtividades();
})();
