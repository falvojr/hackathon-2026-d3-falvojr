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

  // ---------- autoria x colaboração ----------

  // Trabalho da própria pessoa: é o que justifica as horas. Revisão, comentário e PR de outra
  // pessoa são colaboração: aparecem no painel e pesam menos na hora extra, mas não justificam.
  const FONTES_AUTORIA = ['commit', 'push', 'branch', 'pr'];

  function ehAutoria(item) {
    return typeof item.autoria === 'boolean' ? item.autoria : FONTES_AUTORIA.includes(item.fonte);
  }

  // Comentário no mesmo formato que já é usado no PSOffice: um link do Jira por linha, só das
  // demandas em que a pessoa é autora. Sem chave no dia, fica vazio; só usa títulos do GitHub se
  // `justificativaComTitulos` estiver ligado (títulos de PR/commit são texto do repositório do cliente).
  function montarComentario(itens, cfg) {
    itens = itens.filter(ehAutoria);
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

  const INTERVALO_SESSAO = 60; // eventos até 60 min um do outro são a mesma sessão de trabalho
  const MINIMO_SESSAO = 30; // sessão com trabalho próprio: do primeiro ao último evento + 30 min
  const MINIMO_COLABORACAO = 15; // sessão só de colaboração (review, comentário): metade do intervalo + 15 min

  /**
   * Indício de hora extra: atividade no GitHub fora do expediente (fim de semana/feriado: o dia todo).
   * Os eventos são agrupados em sessões. Sessão com trabalho próprio (commit, push...) vale do primeiro
   * ao último evento mais 30 min; sessão só de colaboração vale metade do intervalo mais 15 min.
   * O total é arredondado para 0,25h: um review isolado às 21h vira 0,25h, não "das 18h às 21h".
   * É só um indício, por isso vira aviso e sugestão desmarcada, nunca um valor aplicado sozinho.
   */
  function indicioHoraExtra(itens, cfg, diaUtil) {
    if (!itens.length) return null;
    const fim = minutosDoDia(cfg.fimExpediente || '18:00');
    const inicio = minutosDoDia(cfg.inicioExpediente || '08:00');
    const fora = itens
      .map((it) => ({ m: minutosDoDia(horaLocal(it.ts)), autoria: ehAutoria(it) }))
      .filter((e) => diaUtil === false || e.m < inicio || e.m > fim)
      .sort((a, b) => a.m - b.m);
    if (!fora.length) return null;
    const sessoes = [];
    for (const e of fora) {
      const atual = sessoes[sessoes.length - 1];
      if (atual && e.m - atual.fim <= INTERVALO_SESSAO) {
        atual.fim = e.m;
        atual.autoria = atual.autoria || e.autoria;
      } else {
        sessoes.push({ inicio: e.m, fim: e.m, autoria: e.autoria });
      }
    }
    const minutos = sessoes.reduce(
      (s, x) => s + (x.autoria ? x.fim - x.inicio + MINIMO_SESSAO : (x.fim - x.inicio) / 2 + MINIMO_COLABORACAO),
      0
    );
    const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const prd = itens.filter((it) => RE_PRD.test(it.texto)).map((it) => it.texto);
    return {
      primeiro: hhmm(fora[0].m),
      ultimo: hhmm(fora[fora.length - 1].m),
      sessoes: sessoes.length,
      soColaboracao: !sessoes.some((x) => x.autoria),
      horas: Math.max(0.25, Math.round(minutos / 15) / 4),
      prd: [...new Set(prd)].slice(0, 3),
    };
  }

  // Horas que o dia deveria ter se a hora extra se confirmar: compara com o já lançado, nunca soma por cima.
  function horasComExtra(extra, lancadas, diaUtil, jornada) {
    if (!extra) return lancadas;
    const esperado = diaUtil === false ? extra.horas : jornada + extra.horas;
    return Math.max(lancadas, esperado);
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
      // Chaves mostradas no painel: só as das demandas em que a pessoa é autora (as mesmas da justificativa).
      dia.autoria = itens.filter(ehAutoria).length;
      for (const it of itens.filter(ehAutoria)) for (const k of extrairChaves(it.texto, cfg.prefixosJira)) if (!dia.chaves.includes(k)) dia.chaves.push(k);
      const util = ehDiaUtil(data, feriados);
      dia.extra = indicioHoraExtra(itens, cfg, util);
      if (dia.extra) {
        // Total que o dia teria com a hora extra; se o lançado já cobre, não há o que sugerir.
        dia.extra.alvo = horasComExtra(dia.extra, minutos / 60, util, jornada);
        dia.extra.coberto = minutos > 0 && dia.extra.alvo <= minutos / 60;
      }
      const celulaPrincipal = celulas.find((c) => c.atribId === principal);
      if (minutos > 0) {
        const semComentario = celulas.filter((c) => c.minutos > 0 && !c.temComentario && !c.travado);
        const comentario = montarComentario(itens, cfg);
        // Só sugere justificativa quando há o que sugerir (chave do Jira, ou títulos se a opção estiver ligada).
        if (semComentario.length && comentario) {
          dia.situacao = 'sem-justificativa';
          dia.sugestao = { tipo: 'comentario', celulas: semComentario, comentario };
        }
        // Lançado mas ainda não enviado (ou rejeitado): dá para corrigir horas e justificativa.
        const editavel = celulas.filter((c) => c.minutos > 0 && !c.travado && c.aponId).sort((a, b) => b.minutos - a.minutos)[0];
        if (editavel) dia.ajuste = { celula: editavel, horas: editavel.minutos / 60, comentarioSugerido: comentario };
      } else if (data === hoje && !itens.length && util && !ausencia) {
        // O dia ainda está em andamento: sem atividade até agora não é ausência.
        dia.situacao = 'hoje';
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

  /**
   * O que "Aplicar sugestões" gravaria, para revisar e escolher antes.
   * `comentarios`: justificativa atual ({ 'AAAA-MM-DD': texto }) dos dias lançados e ainda editáveis.
   * Hora extra entra desmarcada: é estimativa e só a pessoa sabe se trabalhou.
   */
  function montarMudancas(analise, comentarios) {
    const mudancas = [];
    const horas = (c) => c.minutos / 60;
    for (const d of analise.dias) {
      const base = { data: d.data, nome: d.nome };
      if (d.situacao === 'sugerir-horas') {
        mudancas.push(Object.assign({}, base, {
          id: `${d.data}-lancar`, tipo: 'lancar', celula: d.sugestao.celula, marcada: true,
          antes: { horas: 0, comentario: '' },
          depois: { horas: d.sugestao.horas, comentario: d.sugestao.comentario },
        }));
      } else if (d.situacao === 'sem-justificativa') {
        for (const c of d.sugestao.celulas) {
          mudancas.push(Object.assign({}, base, {
            id: `${d.data}-${c.atribId}-justificar`, tipo: 'justificar', celula: c, marcada: true,
            antes: { horas: horas(c), comentario: '' },
            depois: { horas: horas(c), comentario: d.sugestao.comentario },
          }));
        }
      } else if (d.ajuste) {
        const c = d.ajuste.celula;
        const atual = (comentarios && comentarios[d.data]) || '';
        const faltando = (d.ajuste.comentarioSugerido || '').split('\n').filter((l) => l && !atual.includes(l));
        if (faltando.length) {
          mudancas.push(Object.assign({}, base, {
            id: `${d.data}-links`, tipo: 'links', celula: c, marcada: true,
            antes: { horas: horas(c), comentario: atual },
            depois: { horas: horas(c), comentario: [atual.trim(), ...faltando].filter(Boolean).join('\n') },
          }));
        }
        if (d.extra && !d.extra.coberto) {
          const sessoes = d.extra.sessoes > 1 ? `${d.extra.sessoes} sessões` : '1 sessão';
          mudancas.push(Object.assign({}, base, {
            id: `${d.data}-extra`, tipo: 'extra', celula: c, marcada: false,
            nota: `~${String(d.extra.horas).replace('.', ',')}h fora do expediente em ${sessoes} (${d.extra.primeiro === d.extra.ultimo ? d.extra.primeiro : `${d.extra.primeiro}–${d.extra.ultimo}`})${d.extra.soColaboracao ? ', só revisões/comentários' : ''}${d.extra.prd.length ? ', com deploy/hotfix' : ''}`,
            antes: { horas: horas(c), comentario: atual },
            depois: { horas: horas(c) + (d.extra.alvo - d.minutos / 60), comentario: atual },
          }));
        }
      }
    }
    return mudancas;
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
    FONTES_AUTORIA, ehAutoria, extrairChaves, montarComentario, indicioHoraExtra, horasComExtra,
    atividadePrincipal, analisarSemana, montarMudancas, pendencias,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Regras;
  raiz.Regras = Regras;
})(typeof globalThis !== 'undefined' ? globalThis : this);
