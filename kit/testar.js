// Testes das partes puras da extensão (sem rede): node kit/testar.js
'use strict';

const assert = require('assert');
const Regras = require('../extensao/lib/regras.js');
require('../extensao/lib/psoffice.js');
const { serializar, codificar1252, atributos } = globalThis.PSOffice._interno;

let ok = 0;
function teste(nome, fn) {
  fn();
  ok++;
  console.log(`ok - ${nome}`);
}

teste('dias úteis ignoram fim de semana e feriado', () => {
  const uteis = Regras.diasUteis('2026-10-09', '2026-10-13', new Set(['2026-10-12']));
  assert.deepStrictEqual(uteis, ['2026-10-09', '2026-10-13']);
});

teste('semana começa no domingo', () => {
  assert.strictEqual(Regras.inicioDaSemana('2026-10-23'), '2026-10-18');
  assert.strictEqual(Regras.inicioDaSemana('2026-10-18'), '2026-10-18');
});

teste('data local usa o fuso de São Paulo', () => {
  assert.strictEqual(Regras.dataLocal('2026-10-23T01:30:00Z'), '2026-10-22');
  assert.strictEqual(Regras.horaLocal('2026-10-23T01:30:00Z'), '22:30');
});

teste('chaves do Jira sem falsos positivos', () => {
  assert.deepStrictEqual(Regras.extrairChaves('feature/ABC-12 usa UTF-8 e SHA-256; ABC-12 de novo, XYZ-3'), ['ABC-12', 'XYZ-3']);
  assert.deepStrictEqual(Regras.extrairChaves('ABC-1 XYZ-2', ['XYZ']), ['XYZ-2']);
});

teste('comentário só com links do Jira; títulos do GitHub apenas se a opção estiver ligada', () => {
  const itens = [{ repo: 'org/api', texto: 'ABC-7 corrige o lote' }, { repo: 'org/api', texto: 'feature/ABC-9' }];
  assert.strictEqual(Regras.montarComentario(itens, { jiraBase: 'https://j/browse/' }), 'https://j/browse/ABC-7\nhttps://j/browse/ABC-9');
  const semChave = [{ repo: 'org/api', texto: 'ajusta README' }];
  assert.strictEqual(Regras.montarComentario(semChave, {}), '');
  assert.strictEqual(Regras.montarComentario(semChave, { justificativaComTitulos: true }), 'api: ajusta README');
});

teste('dia lançado sem justificativa e sem chave do Jira não vira sugestão vazia', () => {
  const semana = {
    inicio: '2026-10-18',
    atividades: [{ atribId: '1' }],
    celulas: [{ atribId: '1', data: '2026-10-20', minutos: 480, temComentario: false, travado: false }],
  };
  const evidencias = { '2026-10-20': [{ ts: '2026-10-20T10:00:00-03:00', fonte: 'pr', repo: 'org/api', texto: 'ajusta README' }] };
  const a = Regras.analisarSemana({ semana, ausencias: [], feriados: new Set(), evidencias, cfg: {}, hoje: '2026-10-23' });
  assert.strictEqual(a.dias[2].situacao, 'ok');
});

teste('ponte só aceita os GETs da lista', () => {
  const { caminhoPermitido } = require('../extensao/ponte/ponte.js');
  const ok = ['/user', '/users/eu/events?per_page=100&page=1', '/search/issues?q=involves%3Aeu', '/search/commits?q=author%3Aeu'];
  const nao = ['/users/outro/events', '/repos/org/api/contents/x', '/user/../repos/org/api', '/search/code?q=senha', 'https://evil.example/user', '/orgs/org/actions/secrets'];
  for (const c of ok) assert.ok(caminhoPermitido(c, 'eu'), c);
  for (const c of nao) assert.ok(!caminhoPermitido(c, 'eu'), c);
});

function semanaFicticia(minutos) {
  const dias = Regras.intervalo('2026-10-18', '2026-10-24');
  return {
    inicio: '2026-10-18',
    atividades: [{ atribId: '1', projeto: 'PROJ', atividade: 'Dev', ept: 100 }, { atribId: '2', projeto: 'INTERNO', atividade: 'Staff', ept: 10 }],
    celulas: dias.flatMap((d) => [
      { atribId: '1', data: d, minutos: (minutos[d] || 0), temComentario: false, travado: false, aponId: null, params: {} },
      { atribId: '2', data: d, minutos: 0, temComentario: false, travado: false, aponId: null, params: {} },
    ]),
  };
}

teste('análise da semana: horas, ausência, justificativa, futuro e hora extra', () => {
  const ev = (dia, hora, texto) => ({ ts: `${dia}T${hora}:00-03:00`, fonte: 'pr', repo: 'org/api', texto, url: '' });
  const evidencias = {
    '2026-10-19': [ev('2026-10-19', '10:00', 'ABC-1 [PRD] deploy')],
    '2026-10-20': [ev('2026-10-20', '09:00', 'ABC-2'), ev('2026-10-20', '21:40', 'ABC-2 [PRD] sobe em produção')],
    '2026-10-21': [ev('2026-10-21', '11:00', 'ABC-3')],
    '2026-10-23': [ev('2026-10-23', '10:00', 'ABC-5')],
  };
  const ausencias = [{ dias: ['2026-10-22'], situacao: 'Em aprovação', tipo: 'PJ - Ausência' }];
  const a = Regras.analisarSemana({
    semana: semanaFicticia({ '2026-10-21': 480 }),
    ausencias,
    feriados: new Set(),
    evidencias,
    cfg: { jornadaHoras: 8, jiraBase: 'https://j/browse/' },
    hoje: '2026-10-22',
  });
  const sit = Object.fromEntries(a.dias.map((d) => [d.data, d.situacao]));
  assert.strictEqual(a.principal, '1');
  assert.deepStrictEqual(sit, {
    '2026-10-18': 'fim-de-semana',
    '2026-10-19': 'sugerir-horas',
    '2026-10-20': 'sugerir-horas',
    '2026-10-21': 'sem-justificativa',
    '2026-10-22': 'ausencia',
    '2026-10-23': 'futuro',
    '2026-10-24': 'fim-de-semana',
  });
  const ter = a.dias[2];
  assert.strictEqual(ter.sugestao.horas, 8);
  assert.strictEqual(ter.sugestao.comentario, 'https://j/browse/ABC-2');
  assert.deepStrictEqual([ter.extra.ultimo, ter.extra.ateHoras], ['21:40', 4]);
  assert.strictEqual(ter.extra.prd.length, 1);
  assert.deepStrictEqual(Regras.pendencias(a).map((d) => d.data), ['2026-10-19', '2026-10-20']);
});

teste('hoje sem atividade ainda não vira sugestão de ausência', () => {
  const a = Regras.analisarSemana({ semana: semanaFicticia({}), ausencias: [], feriados: new Set(), evidencias: {}, cfg: {}, hoje: '2026-10-19' });
  assert.strictEqual(a.dias[1].situacao, 'hoje');
  assert.strictEqual(Regras.pendencias(a).length, 0);
});

teste('dia lançado e não enviado pode ser ajustado; enviado não', () => {
  const semana = {
    inicio: '2026-10-18',
    atividades: [{ atribId: '1' }],
    celulas: [
      { atribId: '1', data: '2026-10-20', minutos: 480, temComentario: true, travado: false, aponId: '10' },
      { atribId: '1', data: '2026-10-21', minutos: 480, temComentario: true, travado: true, aponId: '11' },
    ],
  };
  const evidencias = { '2026-10-20': [{ ts: '2026-10-20T21:00:00-03:00', fonte: 'pr', repo: 'org/api', texto: 'ABC-1 [PRD]' }] };
  const a = Regras.analisarSemana({ semana, ausencias: [], feriados: new Set(), evidencias, cfg: { jiraBase: 'https://j/browse/' }, hoje: '2026-10-23' });
  assert.deepStrictEqual([a.dias[2].ajuste.horas, a.dias[2].ajuste.comentarioSugerido], [8, 'https://j/browse/ABC-1']);
  assert.strictEqual(a.dias[2].extra.ateHoras, 3);
  assert.strictEqual(a.dias[3].ajuste, undefined);
});

teste('revisão lista o que mudaria: horas novas, links que faltam e hora extra desmarcada', () => {
  const semana = {
    inicio: '2026-10-18',
    atividades: [{ atribId: '1' }],
    celulas: [
      { atribId: '1', data: '2026-10-19', minutos: 0, temComentario: false, travado: false, aponId: null },
      { atribId: '1', data: '2026-10-20', minutos: 480, temComentario: true, travado: false, aponId: '20' },
      { atribId: '1', data: '2026-10-21', minutos: 480, temComentario: true, travado: true, aponId: '21' },
    ],
  };
  const ev = (dia, hora, texto) => ({ ts: `${dia}T${hora}:00-03:00`, fonte: 'pr', repo: 'org/api', texto, url: '' });
  const evidencias = {
    '2026-10-19': [ev('2026-10-19', '10:00', 'ABC-1')],
    '2026-10-20': [ev('2026-10-20', '10:00', 'ABC-2'), ev('2026-10-20', '20:30', 'ABC-3 [PRD]')],
    '2026-10-21': [ev('2026-10-21', '10:00', 'ABC-4')],
  };
  const cfg = { jornadaHoras: 8, jiraBase: 'https://j/browse/' };
  const a = Regras.analisarSemana({ semana, ausencias: [], feriados: new Set(), evidencias, cfg, hoje: '2026-10-23' });
  const m = Regras.montarMudancas(a, { '2026-10-20': 'https://j/browse/ABC-2' });
  assert.deepStrictEqual(m.map((x) => [x.data, x.tipo, x.marcada]), [
    ['2026-10-19', 'lancar', true],
    ['2026-10-20', 'links', true],
    ['2026-10-20', 'extra', false],
  ]);
  assert.strictEqual(m[1].depois.comentario, 'https://j/browse/ABC-2\nhttps://j/browse/ABC-3');
  assert.deepStrictEqual([m[2].antes.horas, m[2].depois.horas], [8, 10.5]);
});

teste('dia útil passado sem horas e sem GitHub sugere ausência', () => {
  const a = Regras.analisarSemana({ semana: semanaFicticia({}), ausencias: [], feriados: new Set(), evidencias: {}, cfg: {}, hoje: '2026-10-20' });
  assert.strictEqual(a.dias[1].situacao, 'sugerir-ausencia');
});

teste('formulário serializado como o navegador (checkbox, select, textarea, botão clicado)', () => {
  const form = `<form name="f" action="x.do">
    <input type="hidden" name="Salvar_params" value="controller%3Dx">
    <input type="submit" name="button_Salvar" value="Salvar">
    <input type="submit" name="button_Outro" value="Outro">
    <input type="checkbox" name="check_1" value="1" checked>
    <input type="checkbox" name="check_2" value="2">
    <input type="text" name="desabilitado" value="x" disabled>
    <select name="AUST_ID"><option value="7">A</option><option value="14" selected>PJ</option></select>
    <textarea name="DESCRICAO">ol&aacute;</textarea>
  </form>`;
  const pares = serializar(form, 'button_Salvar', { check_2: '2', ADDED: '2;' });
  assert.deepStrictEqual(pares, [
    ['Salvar_params', 'controller%3Dx'],
    ['button_Salvar', 'Salvar'],
    ['check_1', '1'],
    ['AUST_ID', '14'],
    ['DESCRICAO', 'olá'],
    ['check_2', '2'],
    ['ADDED', '2;'],
  ]);
});

teste('HTML malformado do PSOffice: aspas sobrando e ">" dentro de atributo', () => {
  const form = `<form name="form1" action="/x.do">
    <input type="text" autocomplete="off" name="DT_INICIO"" id="DT_INICIO" value="" class="a">
    <textarea name="DESCRICAO" onkeyup="if (this.value.length > 3600) this.value = this.value.substring(0, 3600);" rows=4></textarea>
    <input type="radio" name="HORARIORADIO" value="1" checked onclick="atualizaHorarioText(this)">
    <input type="submit" name="button_Submete" value="Enviar para Aprova&ccedil;&atilde;o">
  </form>`;
  assert.deepStrictEqual(serializar(form, 'button_Submete', { DESCRICAO: 'Consulta médica' }), [
    ['DT_INICIO', ''],
    ['HORARIORADIO', '1'],
    ['button_Submete', 'Enviar para Aprovação'],
    ['DESCRICAO', 'Consulta médica'],
  ]);
});

teste('codificação windows-1252 igual à do navegador', () => {
  assert.strictEqual(codificar1252('Enviar para Aprovação'), 'Enviar+para+Aprova%E7%E3o');
  assert.strictEqual(codificar1252('a/b=c&d'), 'a%2Fb%3Dc%26d');
  assert.strictEqual(codificar1252('“ok” – €'), '%93ok%94+%96+%80');
});

teste('atributos com JSON entre aspas simples', () => {
  const a = atributos(`<input type="text" name='{"data":"2026-10-20T00:00:00-0300","atribId":"1"}' value="9.00" readonly>`);
  assert.strictEqual(JSON.parse(a.name).atribId, '1');
  assert.strictEqual(a.value, '9.00');
  assert.ok('readonly' in a);
});

console.log(`\n${ok} testes passaram.`);
