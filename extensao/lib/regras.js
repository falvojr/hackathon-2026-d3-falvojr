// Regras puras do assistente: calendário, dias sem lançamento, chaves do Jira e sugestões.
// Sem dependência de navegador: o mesmo arquivo roda na extensão e no Node (verificação do kit).
(function (raiz) {
  'use strict';

  const FUSO = 'America/Sao_Paulo';
  const NOMES_DIA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  // ---------- datas (sempre strings ISO 'AAAA-MM-DD', sem fuso) ----------

  function paraDate(iso) {
    const [a, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d));
  }

  function deDate(dt) {
    return dt.toISOString().slice(0, 10);
  }

  function somarDias(iso, n) {
    const dt = paraDate(iso);
    dt.setUTCDate(dt.getUTCDate() + n);
    return deDate(dt);
  }

  function diaDaSemana(iso) {
    return paraDate(iso).getUTCDay();
  }

  function paraBr(iso) {
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
  }

  function deBr(br) {
    const [d, m, a] = br.split('/');
    return `${a}-${m}-${d}`;
  }

  // Data local (São Paulo) de um instante qualquer.
  function dataLocal(instante) {
    return new Date(instante).toLocaleDateString('sv-SE', { timeZone: FUSO });
  }

  // Hora local 'HH:MM' de um instante qualquer.
  function horaLocal(instante) {
    return new Date(instante).toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function inicioDaSemana(iso) {
    return somarDias(iso, -diaDaSemana(iso));
  }

  function intervalo(inicio, fim) {
    const dias = [];
    for (let d = inicio; d <= fim; d = somarDias(d, 1)) dias.push(d);
    return dias;
  }

  function ehDiaUtil(iso, feriados) {
    const dow = diaDaSemana(iso);
    return dow !== 0 && dow !== 6 && !feriados.has(iso);
  }

  function diasUteis(inicio, fim, feriados) {
    return intervalo(inicio, fim).filter((d) => ehDiaUtil(d, feriados));
  }

  // ---------- regra do kit: dias úteis sem nenhum lançamento ----------

  // Pendente conta como lançado; qualquer status vale, o que importa é existir lançamento no dia.
  function diasSemLancamento({ colaboradores, lancamentos, feriados, inicio, fim }) {
    const lancados = new Set(lancamentos.map((l) => `${l.matricula}|${l.data}`));
    const uteis = diasUteis(inicio, fim, feriados);
    const saida = [];
    for (const c of colaboradores) {
      for (const d of uteis) {
        if (!lancados.has(`${c.matricula}|${d}`)) {
          saida.push({ matricula: c.matricula, nome: c.nome, gestor: c.gestor, data: d });
        }
      }
    }
    return saida.sort((a, b) => a.matricula.localeCompare(b.matricula) || a.data.localeCompare(b.data));
  }

  // ---------- chaves do Jira ----------

  // Siglas que parecem chave de Jira mas não são (UTF-8, SHA-256...).
  const FALSOS_POSITIVOS = new Set(['UTF', 'ISO', 'SHA', 'RFC', 'HTTP', 'HTTPS', 'TLS', 'SSL', 'CVE', 'AES', 'RSA', 'UTC', 'GMT', 'PR', 'MD', 'X', 'V', 'CP', 'SP', 'ID', 'ES', 'JS', 'TS', 'API', 'K8S']);

  function extrairChaves(texto, prefixos) {
    const chaves = [];
    const re = /\b([A-Z][A-Z0-9]{1,9})-(\d{1,6})\b/g;
    let m;
    while ((m = re.exec(texto || ''))) {
      const prefixo = m[1];
      if (prefixos && prefixos.length ? !prefixos.includes(prefixo) : FALSOS_POSITIVOS.has(prefixo)) continue;
      const chave = `${prefixo}-${m[2]}`;
      if (!chaves.includes(chave)) chaves.push(chave);
    }
    return chaves;
  }

  // Comentário no mesmo formato que já é usado no PSOffice: um link do Jira por linha.
  // Sem chave no dia, fica vazio; só usa títulos do GitHub se `justificativaComTitulos` estiver ligado
  // (títulos de PR/commit são texto do repositório do cliente).
  function montarComentario(itens, cfg) {
    const prefixos = cfg.prefixosJira || [];
    const chaves = [];
    for (const it of itens) {
      for (const k of extrairChaves(it.texto, prefixos)) if (!chaves.includes(k)) chaves.push(k);
    }
    if (chaves.length) {
      return chaves.map((k) => (cfg.jiraBase ? cfg.jiraBase + k : k)).join('\n');
    }
    if (!cfg.justificativaComTitulos) return '';
    const titulos = [];
    for (const it of itens) {
      const linha = `${it.repo.split('/').pop()}: ${it.texto}`;
      if (!titulos.includes(linha)) titulos.push(linha);
    }
    return titulos.slice(0, 6).join('\n');
  }

  // ---------- hora extra ----------

  const RE_PRD = /\[PRD\]|produ[cç][aã]o|release\/producao|deploy|hotfix|rollback/i;

  function minutosDoDia(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  /**
   * Indício de hora extra: atividade no GitHub depois do fim do expediente (ou antes do início).
   * É só um indício (comentar um PR à noite não é trabalhar a noite toda), por isso vira
   * um aviso com teto sugerido, nunca um valor aplicado sozinho.
   */
  function indicioHoraExtra(itens, cfg) {
    if (!itens.length) return null;
    const horas = itens.map((it) => horaLocal(it.ts)).sort();
    const primeiro = horas[0];
    const ultimo = horas[horas.length - 1];
    const fim = minutosDoDia(cfg.fimExpediente || '18:00');
    const inicio = minutosDoDia(cfg.inicioExpediente || '08:00');
    const minutos = Math.max(0, minutosDoDia(ultimo) - fim) + Math.max(0, inicio - minutosDoDia(primeiro));
    const prd = itens.filter((it) => RE_PRD.test(it.texto)).map((it) => it.texto);
    if (minutos < 30) return null;
    return { primeiro, ultimo, ateHoras: Math.ceil(minutos / 30) / 2, prd: [...new Set(prd)].slice(0, 3) };
  }

  // ---------- análise da semana do PSOffice ----------

  // Atividade que recebe a sugestão: a configurada ou a que mais teve horas na semana.
  function atividadePrincipal(semana, cfg) {
    const ids = semana.atividades.map((a) => a.atribId);
    if (cfg.atividadePadrao && ids.includes(cfg.atividadePadrao)) return cfg.atividadePadrao;
    const total = {};
    for (const c of semana.celulas) total[c.atribId] = (total[c.atribId] || 0) + c.minutos;
    return ids.slice().sort((a, b) => (total[b] || 0) - (total[a] || 0))[0] || null;
  }

  /**
   * Classifica cada dia da semana e monta a sugestão.
   * situacao: fim-de-semana | feriado | futuro | ausencia | ok | sem-justificativa | sugerir-horas | sugerir-ausencia
   */
  function analisarSemana({ semana, ausencias, feriados, evidencias, cfg, hoje }) {
    const principal = atividadePrincipal(semana, cfg);
    const jornada = Number(cfg.jornadaHoras) || 8;
    const dias = [];
    for (const data of intervalo(semana.inicio, somarDias(semana.inicio, 6))) {
      const celulas = semana.celulas.filter((c) => c.data === data);
      const minutos = celulas.reduce((s, c) => s + c.minutos, 0);
      const itens = (evidencias && evidencias[data]) || [];
      const ausencia = ausencias.find((a) => a.dias.includes(data) && !/rejeit|cancel/i.test(a.situacao));
      const travado = celulas.some((c) => c.travado);
      const dia = {
        data,
        nome: `${NOMES_DIA[diaDaSemana(data)]} ${paraBr(data).slice(0, 5)}`,
        minutos,
        itens,
        chaves: [],
        ausencia: ausencia || null,
        travado,
        situacao: 'ok',
        sugestao: null,
      };
      for (const it of itens) for (const k of extrairChaves(it.texto, cfg.prefixosJira)) if (!dia.chaves.includes(k)) dia.chaves.push(k);
      dia.extra = indicioHoraExtra(itens, cfg);

      const util = ehDiaUtil(data, feriados);
      const celulaPrincipal = celulas.find((c) => c.atribId === principal);
      if (minutos > 0) {
        const semComentario = celulas.filter((c) => c.minutos > 0 && !c.temComentario && !c.travado);
        const comentario = montarComentario(itens, cfg);
        // Só sugere justificativa quando há o que sugerir (chave do Jira, ou títulos se a opção estiver ligada).
        if (semComentario.length && comentario) {
          dia.situacao = 'sem-justificativa';
          dia.sugestao = { tipo: 'comentario', celulas: semComentario, comentario };
        }
      } else if (!util) {
        dia.situacao = feriados.has(data) ? 'feriado' : 'fim-de-semana';
        // Trabalhou no fim de semana ou feriado? Mostra a evidência, mas não sugere nada sozinho.
      } else if (ausencia) {
        dia.situacao = 'ausencia';
      } else if (data > hoje) {
        dia.situacao = 'futuro';
      } else if (travado) {
        dia.situacao = 'ok';
      } else if (itens.length && celulaPrincipal) {
        dia.situacao = 'sugerir-horas';
        dia.sugestao = { tipo: 'horas', celula: celulaPrincipal, horas: jornada, comentario: montarComentario(itens, cfg) };
      } else {
        dia.situacao = 'sugerir-ausencia';
        dia.sugestao = { tipo: 'ausencia', celula: celulaPrincipal || null, horas: jornada, comentario: '' };
      }
      dias.push(dia);
    }
    return { principal, dias };
  }

  // Dias úteis até hoje que ainda pedem ação (sem horas e sem ausência).
  function pendencias(analise) {
    return analise.dias.filter((d) => d.situacao === 'sugerir-horas' || d.situacao === 'sugerir-ausencia');
  }

  const Regras = {
    FUSO,
    paraDate, deDate, somarDias, diaDaSemana, paraBr, deBr, dataLocal, horaLocal,
    inicioDaSemana, intervalo, ehDiaUtil, diasUteis,
    diasSemLancamento,
    extrairChaves, montarComentario, indicioHoraExtra,
    atividadePrincipal, analisarSemana, pendencias,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Regras;
  raiz.Regras = Regras;
})(typeof globalThis !== 'undefined' ? globalThis : this);
