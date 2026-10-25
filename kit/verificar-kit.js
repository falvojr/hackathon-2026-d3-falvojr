// Roda a regra "dias úteis sem lançamento" (a mesma da extensão, em extensao/lib/regras.js)
// sobre a massa fictícia do kit e compara com o resultado esperado.
//   node kit/verificar-kit.js [pasta-dos-csv] [inicio] [fim]
'use strict';

const fs = require('fs');
const path = require('path');
const Regras = require('../extensao/lib/regras.js');

const raiz = path.join(__dirname, '..');
const pasta = process.argv[2] || path.join(raiz, 'dados', 'horas');
const inicio = process.argv[3] || '2026-10-09';
const fim = process.argv[4] || '2026-10-22';
const saida = path.join(raiz, 'evidencias', 'dias_sem_lancamento.csv');

function lerCsv(arquivo) {
  const [cabecalho, ...linhas] = fs.readFileSync(arquivo, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const campos = cabecalho.split(',');
  return linhas.map((l) => Object.fromEntries(l.split(',').map((v, i) => [campos[i], v.trim()])));
}

function paraCsv(linhas, campos) {
  return [campos.join(','), ...linhas.map((l) => campos.map((c) => l[c]).join(','))].join('\n') + '\n';
}

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

const colaboradores = lerCsv(path.join(pasta, 'colaboradores.csv'));
const lancamentos = lerCsv(path.join(pasta, 'lancamentos.csv'));
const feriados = new Set(lerCsv(path.join(pasta, 'feriados.csv')).map((f) => f.data));
log(`Lidos ${colaboradores.length} colaboradores, ${lancamentos.length} lançamentos, ${feriados.size} feriado(s).`);
log(`Período ${inicio} a ${fim}: ${Regras.diasUteis(inicio, fim, feriados).length} dias úteis (sem fins de semana e feriados).`);

const resultado = Regras.diasSemLancamento({ colaboradores, lancamentos, feriados, inicio, fim });
fs.mkdirSync(path.dirname(saida), { recursive: true });
fs.writeFileSync(saida, paraCsv(resultado, ['matricula', 'nome', 'gestor', 'data']));
log(`${resultado.length} dia(s) sem lançamento de ${new Set(resultado.map((r) => r.matricula)).size} colaborador(es). Saída: ${path.relative(raiz, saida)}`);

const porGestor = {};
for (const r of resultado) porGestor[r.gestor] = (porGestor[r.gestor] || 0) + 1;
for (const [g, n] of Object.entries(porGestor).sort()) log(`  ${g}: ${n} dia(s) a cobrar`);

const esperado = path.join(pasta, 'esperado', 'dias_sem_lancamento.csv');
if (fs.existsSync(esperado)) {
  const chave = (r) => `${r.matricula}|${r.data}`;
  const a = new Set(resultado.map(chave));
  const b = new Set(lerCsv(esperado).map(chave));
  const faltando = [...b].filter((k) => !a.has(k));
  const sobrando = [...a].filter((k) => !b.has(k));
  if (!faltando.length && !sobrando.length) {
    log(`OK: idêntico ao esperado (${b.size} linhas).`);
  } else {
    log(`DIVERGENTE: faltando ${faltando.join(' ')} | sobrando ${sobrando.join(' ')}`);
    process.exitCode = 1;
  }
}
