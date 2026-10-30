// Service worker: lembretes (diário e de envio na sexta), seleção automática das atividades
// da semana e pedidos à ponte local do GitHub para o painel.
importScripts('lib/regras.js', 'lib/psoffice.js', 'lib/config.js', 'lib/assistente.js');

const R = self.Regras;
const ALARME = 'ciclo';

function urlHoras(base) {
  return `${base}/psoffice/horas/horasnew.do?controller=com.mcfox.cron.controller.HorasNewController&state=Select&_mn_cdg=horasminha&_nm_ctx=minhaPagina&tela=1`;
}

async function abrirHoras() {
  const cfg = await Config.ler();
  const origem = new URL(cfg.psofficeBase).origin;
  const abas = await chrome.tabs.query({ url: `${origem}/*` });
  const aba = abas.find((a) => /horasnew\.do/.test(a.url || '')) || abas[0];
  if (aba) {
    await chrome.tabs.update(aba.id, { active: true, url: urlHoras(cfg.psofficeBase) });
    await chrome.windows.update(aba.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: urlHoras(cfg.psofficeBase) });
  }
}

// Devolve se o Chrome aceitou criar a notificação. O Windows ainda pode escondê-la
// (notificações desligadas ou "Não perturbe"); por isso o ícone também mostra as pendências.
function notificacao(id, titulo, mensagem) {
  return new Promise((resolve) => {
    chrome.notifications.create(
      `${id}_${Date.now()}`,
      { type: 'basic', iconUrl: 'icone128.png', title: titulo, message: mensagem, priority: 2, requireInteraction: true },
      () => resolve(!chrome.runtime.lastError)
    );
  });
}

// Selo no ícone da extensão: número de dias pendentes ou "↑" quando falta enviar a semana na sexta.
function marcarIcone(pendentes, faltaEnviar) {
  const texto = pendentes ? String(pendentes) : faltaEnviar ? '↑' : '';
  chrome.action.setBadgeText({ text: texto });
  chrome.action.setBadgeBackgroundColor({ color: pendentes ? '#b45309' : '#1f6fd1' });
  chrome.action.setTitle({ title: pendentes ? `${pendentes} dia(s) com horas pendentes` : faltaEnviar ? 'Falta enviar a semana' : 'Abrir minhas horas no PSOffice' });
}

function agendar() {
  chrome.alarms.create(ALARME, { delayInMinutes: 1, periodInMinutes: 10 });
}

// Roda a cada 10 minutos; cada aviso sai no máximo uma vez por dia (ou por semana).
// `forcar` é o "Testar lembretes agora" das opções: ignora horário e dia da semana, não grava nada
// no PSOffice (sem seleção automática de atividades) e não mexe no controle dos avisos reais do dia.
// Devolve os títulos das notificações mostradas.
async function ciclo(forcar) {
  const cfg = await Config.ler();
  const agora = Date.now();
  const hoje = R.dataLocal(agora);
  const hora = forcar ? '23:59' : R.horaLocal(agora);
  const dow = forcar ? 5 : R.diaDaSemana(hoje);
  if (dow === 0 || dow === 6) return [];

  const inicioSemana = R.inicioDaSemana(hoje);
  const estado = forcar ? {} : (await chrome.storage.local.get('estado')).estado || {};
  const cliente = PSOffice.criarCliente(cfg.psofficeBase);
  const mostradas = [];
  const notificar = async (id, titulo, texto) => {
    mostradas.push({ titulo, ok: await notificacao(id, titulo, texto) });
  };
  let pendentes = 0;
  let faltaEnviar = false;
  try {
    if (!forcar && cfg.selecionarAtividadesAuto && hora >= '07:00' && estado.atividadesSemana !== inicioSemana) {
      const r = await Assistente.garantirAtividades(cliente, hoje);
      estado.atividadesSemana = inicioSemana;
      if (r && r.adicionadas.length) {
        const semana = await cliente.lerSemana(hoje);
        const nomes = semana.atividades.map((a) => `${a.projeto} / ${a.atividade}`).join(', ');
        await notificar('atividades', 'Atividades da semana selecionadas', `Repeti as atividades da semana anterior: ${nomes}.`);
      }
    }

    if (hora >= cfg.horaLembrete && estado.lembrete !== hoje) {
      const { analise } = await Assistente.analisar(cliente, hoje);
      const dias = R.pendencias(analise);
      pendentes = dias.length;
      estado.lembrete = hoje;
      if (dias.length) {
        await notificar('horas', 'Horas pendentes no PSOffice', `${dias.map((d) => d.nome).join(', ')}: clique para revisar as sugestões e lançar.`);
      }
    }

    if (dow === 5 && hora >= cfg.horaEnvio && estado.envio !== inicioSemana) {
      const semana = await cliente.lerSemana(hoje);
      estado.envio = inicioSemana;
      faltaEnviar = semana.celulas.some((c) => c.minutos > 0 && !c.travado);
      if (faltaEnviar) {
        await notificar('envio', 'Enviar a semana para aprovação', 'Sua semana ainda não foi enviada. Clique para revisar e enviar.');
      }
    }
  } catch (e) {
    if (e.name === 'SessaoExpirada') {
      // Sem sessão não dá para conferir: lembra do mesmo jeito, uma vez por dia, no horário do lembrete.
      if (hora >= cfg.horaLembrete && estado.lembrete !== hoje) {
        estado.lembrete = hoje;
        await notificar('sessao', 'Lembre de lançar suas horas', 'Não consegui conferir o PSOffice (sessão expirada). Clique para abrir e revisar a semana.');
      }
    } else {
      console.error('[assistente de horas]', e);
      if (forcar) throw e;
    }
  }
  if (estado.lembrete === hoje || forcar) marcarIcone(pendentes, faltaEnviar);
  if (!forcar) await chrome.storage.local.set({ estado });
  return mostradas;
}

chrome.runtime.onInstalled.addListener(async (detalhes) => {
  agendar();
  if (detalhes.reason === 'install') chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(agendar);
chrome.alarms.onAlarm.addListener((a) => a.name === ALARME && ciclo(false));
chrome.notifications.onClicked.addListener((id) => {
  chrome.notifications.clear(id);
  abrirHoras();
});
chrome.action.onClicked.addListener(abrirHoras);

chrome.runtime.onMessage.addListener((msg, _remetente, responder) => {
  (async () => {
    if (msg.tipo === 'evidencias') {
      const cfg = await Config.ler();
      return Assistente.evidencias(cfg, msg.inicio, msg.fim);
    }
    if (msg.tipo === 'feriados') return [...(await Config.feriados(msg.anos, await Config.ler()))];
    // O painel atualiza o selo do ícone sempre que analisa a semana.
    if (msg.tipo === 'pendencias') return marcarIcone(msg.dias, msg.faltaEnviar);
    if (msg.tipo === 'statusPonte') return Assistente.pedirPonte({ tipo: 'usuario' });
    // Atividades da semana atual (ou da última com atividades) pelo nome, para a página de opções.
    if (msg.tipo === 'atividades') {
      const cfg = await Config.ler();
      const cliente = PSOffice.criarCliente(cfg.psofficeBase);
      const hoje = R.dataLocal(Date.now());
      for (let n = 0; n <= 4; n++) {
        const semana = await cliente.lerSemana(R.somarDias(hoje, -7 * n));
        if (semana.atividades.length) return semana.atividades.map((a) => ({ atribId: a.atribId, nome: `${a.projeto} / ${a.atividade}` }));
      }
      return [];
    }
    if (msg.tipo === 'abrirOpcoes') return chrome.runtime.openOptionsPage();
    if (msg.tipo === 'rodarCiclo') return ciclo(!!msg.forcar);
    throw new Error(`Mensagem desconhecida: ${msg.tipo}`);
  })().then(
    (dados) => responder({ ok: true, dados }),
    (e) => responder({ ok: false, erro: e.message })
  );
  return true;
});
