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

function notificar(id, titulo, mensagem) {
  chrome.notifications.create(`${id}_${Date.now()}`, {
    type: 'basic',
    iconUrl: 'icone128.png',
    title: titulo,
    message: mensagem,
    priority: 2,
    requireInteraction: true,
  });
}

function agendar() {
  chrome.alarms.create(ALARME, { delayInMinutes: 1, periodInMinutes: 10 });
}

// Roda a cada 10 minutos; cada aviso sai no máximo uma vez por dia (ou por semana).
// `forcar` ignora horário e dia da semana (botão "verificar agora" das opções).
async function ciclo(forcar) {
  const cfg = await Config.ler();
  const agora = Date.now();
  const hoje = R.dataLocal(agora);
  const hora = forcar ? '23:59' : R.horaLocal(agora);
  const dow = forcar ? 5 : R.diaDaSemana(hoje);
  if (dow === 0 || dow === 6) return;

  const inicioSemana = R.inicioDaSemana(hoje);
  const estado = (await chrome.storage.local.get('estado')).estado || {};
  const cliente = PSOffice.criarCliente(cfg.psofficeBase);
  try {
    if (cfg.selecionarAtividadesAuto && hora >= '07:00' && estado.atividadesSemana !== inicioSemana) {
      const r = await Assistente.garantirAtividades(cliente, hoje);
      estado.atividadesSemana = inicioSemana;
      if (r && r.adicionadas.length) {
        const semana = await cliente.lerSemana(hoje);
        const nomes = semana.atividades.map((a) => `${a.projeto} / ${a.atividade}`).join(', ');
        notificar('atividades', 'Atividades da semana selecionadas', `Repeti as atividades da semana anterior: ${nomes}.`);
      }
    }

    if (hora >= cfg.horaLembrete && estado.lembrete !== hoje) {
      const { analise } = await Assistente.analisar(cliente, hoje);
      const pendentes = R.pendencias(analise);
      estado.lembrete = hoje;
      if (pendentes.length) {
        notificar('horas', 'Horas pendentes no PSOffice', `${pendentes.map((d) => d.nome).join(', ')}: clique para revisar as sugestões e lançar.`);
      }
    }

    if (dow === 5 && hora >= cfg.horaEnvio && estado.envio !== inicioSemana) {
      const semana = await cliente.lerSemana(hoje);
      estado.envio = inicioSemana;
      if (semana.celulas.some((c) => c.minutos > 0 && !c.travado)) {
        notificar('envio', 'Enviar a semana para aprovação', 'Sua semana ainda não foi enviada. Clique para revisar e enviar.');
      }
    }
  } catch (e) {
    if (e.name === 'SessaoExpirada') {
      // Sem sessão não dá para conferir: lembra do mesmo jeito, uma vez por dia, no horário do lembrete.
      if (hora >= cfg.horaLembrete && estado.lembrete !== hoje) {
        estado.lembrete = hoje;
        notificar('sessao', 'Lembre de lançar suas horas', 'Não consegui conferir o PSOffice (sessão expirada). Clique para abrir e revisar a semana.');
      }
    } else {
      console.error('[assistente de horas]', e);
    }
  }
  await chrome.storage.local.set({ estado });
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
    if (msg.tipo === 'statusPonte') return Assistente.pedirPonte({ tipo: 'usuario' });
    if (msg.tipo === 'abrirOpcoes') return chrome.runtime.openOptionsPage();
    if (msg.tipo === 'rodarCiclo') return ciclo(!!msg.forcar);
    throw new Error(`Mensagem desconhecida: ${msg.tipo}`);
  })().then(
    (dados) => responder({ ok: true, dados }),
    (e) => responder({ ok: false, erro: e.message })
  );
  return true;
});
