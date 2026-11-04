// Simula o que a extensão usa fora dela (Chrome, PSOffice e GitHub) com uma semana fictícia,
// para ver o painel de verdade sem PSOffice, sem login e sem dado real.
// Nada é gravado: as ações do painel só recarregam a página.
(function () {
  'use strict';

  // Relógio fixo: sexta 30/10/2026, 15h (a semana inteira já aconteceu, menos o sábado).
  const AGORA = Date.parse('2026-10-30T15:00:00-03:00');
  Date.now = () => AGORA;

  const JIRA = 'https://jira.exemplo/browse/';
  const ev = (dia, hora, fonte, repo, texto) => ({
    ts: `${dia}T${hora}:00-03:00`,
    fonte,
    repo: `acme/${repo}`,
    texto,
    url: 'https://github.com/acme',
  });

  // Atividade fictícia no GitHub, por dia.
  const EVIDENCIAS = {
    '2026-10-25': [ev('2026-10-25', '20:19', 'revisao', 'portal', 'XYZ-9 Ajusta a validação do lote')],
    '2026-10-26': [
      ev('2026-10-26', '10:12', 'commit', 'api-lotes', 'ABC-100 Valida lote duplicado'),
      ev('2026-10-26', '15:40', 'push', 'api-lotes', 'feature/ABC-100-lote-duplicado'),
      ev('2026-10-26', '18:35', 'commit', 'api-lotes', 'ABC-100 Corrige teste do lote'),
    ],
    '2026-10-27': [
      ev('2026-10-27', '09:30', 'commit', 'api-lotes', 'ABC-101 Cria o endpoint de reenvio'),
      ev('2026-10-27', '14:10', 'pr', 'api-logs', 'ABC-102 Mascara documentos nos logs'),
      ev('2026-10-27', '16:00', 'revisao', 'conector', 'XYZ-7 Ajusta o conector'),
    ],
    '2026-10-29': [
      ev('2026-10-29', '11:00', 'commit', 'api-consulta', 'ABC-103 Ajusta a consulta do sacado'),
      ev('2026-10-29', '15:00', 'comentario', 'conector', 'XYZ-8 Dúvida sobre o retorno'),
    ],
    '2026-10-30': [
      ev('2026-10-30', '10:00', 'commit', 'api-consulta', 'ABC-104 Trata o tempo limite'),
      ev('2026-10-30', '21:10', 'pr', 'api-consulta', 'ABC-104 [PRD] Sobe a correção em produção'),
    ],
  };

  // Semana fictícia no "PSOffice": horas lançadas e justificativas já salvas.
  const LANCADO = { '2026-10-26': 480, '2026-10-29': 480, '2026-10-30': 540 };
  const COMENTARIOS = { '2026-10-26': `${JIRA}ABC-100`, '2026-10-30': `${JIRA}ABC-104` };

  const dias = ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'];
  const celulas = dias.map((data) => ({
    id: `l_1c_${data.slice(-2)}`,
    atribId: '1',
    data,
    aponId: LANCADO[data] ? `a${data.slice(-2)}` : null,
    params: { data: `${data}T00:00:00-0300`, atribId: '1' },
    minutos: LANCADO[data] || 0,
    temComentario: !!COMENTARIOS[data],
    status: '0',
    travado: false,
  }));

  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const semana = {
    usuId: '1',
    inicio: '2026-10-25',
    atividades: [{ atribId: '1', projeto: 'PROJETO_DEMO', atividade: '1-Desenvolvimento', recurso: 'Dev', ept: 120 }],
    celulas,
    urlAtividades: '#',
    podeEnviar: true,
    podeCancelar: false,
  };

  window.PSOffice = {
    criarCliente: () => ({
      lerSemana: async () => semana,
      lerAusencias: async () => ({
        ausencias: [],
        tipos: [{ id: '14', nome: 'PJ - Ausência' }, { id: '9', nome: 'CLT - Férias' }, { id: '11', nome: 'Treinamento' }],
      }),
      lerComentario: async (c) => COMENTARIOS[c.data] || '',
      // Ações de gravação: só simulam (o painel recarrega a página em seguida).
      lancar: () => espera(300),
      salvarHoras: () => espera(300),
      salvarComentario: () => espera(300),
      registrarAusencia: () => espera(300),
      enviarSemana: () => espera(300),
      cancelarEnvio: () => espera(300),
      selecionarAtividades: () => espera(300),
    }),
  };

  // Chrome: armazenamento em memória e respostas do "service worker".
  const armazenado = { config: { jiraBase: JIRA, prefixosJira: ['ABC', 'XYZ'] }, painelRecolhido: false };
  window.chrome = {
    storage: {
      local: {
        get: async (k) => ({ [k]: armazenado[k] }),
        set: async (o) => Object.assign(armazenado, o),
        remove: async () => {},
      },
    },
    runtime: {
      sendMessage(msg, responder) {
        const dados = msg.tipo === 'evidencias' ? { porDia: EVIDENCIAS, avisos: [], login: 'dev-exemplo' } : msg.tipo === 'feriados' ? [] : null;
        if (responder) setTimeout(() => responder({ ok: true, dados }), 50);
      },
    },
  };
})();
