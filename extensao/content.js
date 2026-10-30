// Painel "Assistente de horas" injetado na tela semanal de Horas do PSOffice.
(async function () {
  'use strict';

  if (!document.querySelector('[name="button_SubmeteSemanal"], #total_geral')) return;

  const R = Regras;
  const base = `${location.origin}/${location.pathname.split('/')[1]}`;
  const cliente = PSOffice.criarCliente(base);
  // O endereço do PSOffice é aprendido da página aberta (os lembretes usam o mesmo); ninguém precisa digitar.
  Config.ler().then((c) => c.psofficeBase !== base && Config.salvar({ psofficeBase: base }));
  const dtRef = new URLSearchParams(location.search).get('dtRef') || (document.getElementById('dataReferencia') || {}).value;
  const iso = dtRef && /^\d{2}\/\d{2}\/\d{4}$/.test(dtRef) ? R.deBr(dtRef) : R.dataLocal(Date.now());

  const painel = document.createElement('section');
  painel.id = 'assistente-horas';
  const ancora = document.querySelector('[name="button_SubmeteSemanal"]');
  const form = ancora ? ancora.form : document.querySelector('form');
  form.parentNode.insertBefore(painel, form);

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const horasBr = (min) => (min / 60).toFixed(2).replace('.', ',');
  const ROTULO = { push: 'push', branch: 'branch', pr: 'PR', 'pr-outro': 'PR de outro', revisao: 'revisão', comentario: 'comentário', commit: 'commit' };

  function mensagem(texto, tipo) {
    const el = painel.querySelector('.ah-msg');
    if (el) {
      el.textContent = texto;
      el.className = `ah-msg ${tipo || ''}`;
    }
  }

  function pedir(msg, seFalhar) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (r) => resolve(r && r.ok ? r.dados : seFalhar(r ? r.erro : 'Extensão sem resposta.')));
    });
  }

  // GitHub e BrasilAPI são chamados pelo service worker (o painel roda sob o CORS da página).
  const remoto = {
    evidencias: (inicio, fim) => pedir({ tipo: 'evidencias', inicio, fim }, (erro) => ({ porDia: {}, avisos: [erro] })),
    feriados: (anos) => pedir({ tipo: 'feriados', anos }, () => []),
  };

  // Descobre a URL do Jira a partir de uma justificativa já escrita (ex.: .../browse/ABC-123).
  async function aprenderJira(cfg, semana) {
    if (cfg.jiraBase) return cfg;
    const comComentario = semana.celulas.find((c) => c.temComentario && c.aponId);
    if (!comComentario) return cfg;
    try {
      const texto = await cliente.lerComentario(comComentario);
      const m = texto.match(/(https?:\/\/[^\s]+\/browse\/)[A-Z][A-Z0-9]+-\d+/);
      if (m) return Config.salvar({ jiraBase: m[1] });
    } catch (e) {
      // Sem comentário legível: segue com as chaves sem link.
    }
    return cfg;
  }

  function linhaExtra(dia) {
    const x = dia.extra;
    if (!x || ['futuro', 'ausencia'].includes(dia.situacao)) return '';
    const prd = x.prd.length ? ` · inclui ${x.prd.map((t) => `<em>${esc(t)}</em>`).join(', ')}` : '';
    const sessoes = x.sessoes > 1 ? `${x.sessoes} sessões` : '1 sessão';
    const horario = x.primeiro === x.ultimo ? esc(x.primeiro) : `${esc(x.primeiro)}–${esc(x.ultimo)}`;
    const tipo = x.soColaboracao ? ', só revisões/comentários' : '';
    const fora = `~${String(x.horas).replace('.', ',')}h fora do expediente em ${sessoes} (${horario}${tipo})`;
    // Já lançado o suficiente? Só informa, sem sugerir nada.
    if (x.coberto) return `<div class="ah-extra ah-coberto">${fora[0].toUpperCase()}${fora.slice(1)}${prd}: já coberto pelas ${horasBr(dia.minutos)}h lançadas.</div>`;
    const botao = dia.situacao === 'sugerir-horas'
      ? ` <button type="button" class="ah-btn ah-sec" data-acao="somar-extra" data-alvo="${x.alvo}">Usar ${String(x.alvo).replace('.', ',')}h</button>`
      : '';
    const lancado = dia.minutos ? ` Lançado: ${horasBr(dia.minutos)}h.` : '';
    return `<div class="ah-extra">Possível hora extra: ${fora}${prd}.${lancado}${botao}</div>`;
  }

  function linhaEvidencias(dia) {
    if (!dia.itens.length) return '';
    // Colaboração (revisão, comentário, PR de outra pessoa) aparece mais apagada: não entra na justificativa.
    const itens = dia.itens
      .map((it) => `<li class="${R.ehAutoria(it) ? '' : 'ah-colab'}"><span class="ah-fonte">${esc(ROTULO[it.fonte] || it.fonte)}</span> ${esc(it.repo.split('/').pop())}: <a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.texto)}</a></li>`)
      .join('');
    const colab = dia.itens.length - dia.autoria;
    const resumo = colab ? `${dia.autoria} sua(s), ${colab} de colaboração` : `${dia.autoria} sua(s)`;
    const chaves = dia.chaves.length ? ` · ${dia.chaves.map(esc).join(', ')}` : '';
    return `<details class="ah-evid"><summary>${dia.itens.length} evidência(s) no GitHub (${resumo})${chaves}</summary><ul>${itens}</ul></details>`;
  }

  function opcoesAusencia(tipos, cfg) {
    const padrao = cfg.tipoAusencia || (tipos.find((t) => /PJ.*Aus/i.test(t.nome)) || tipos[0] || {}).id;
    return tipos.map((t) => `<option value="${esc(t.id)}" ${t.id === padrao ? 'selected' : ''}>${esc(t.nome)}</option>`).join('');
  }

  function blocoDia(dia, ctx) {
    const { cfg, tipos } = ctx;
    const titulo = `<div class="ah-dia-nome">${esc(dia.nome)}</div>`;
    let status = '';
    let acao = '';
    switch (dia.situacao) {
      case 'fim-de-semana':
      case 'feriado':
        status = `<span class="ah-mudo">${dia.situacao === 'feriado' ? 'Feriado' : 'Fim de semana'}</span>`;
        break;
      case 'futuro':
        status = '<span class="ah-mudo">Ainda não chegou</span>';
        break;
      case 'ausencia':
        status = `<span class="ah-ok">Ausência: ${esc(dia.ausencia.tipo)} (${esc(dia.ausencia.situacao)})</span>`;
        // Ausência com trabalho no GitHub costuma ser hora não lançada (ex.: deploy em PRD no dia de folga).
        if (dia.itens.length) status += ` <span class="ah-alerta">· mas há ${dia.itens.length} atividade(s) no GitHub neste dia${dia.extra ? `, das ${esc(dia.extra.primeiro)} às ${esc(dia.extra.ultimo)}` : ''}</span>`;
        break;
      case 'hoje':
        status = '<span class="ah-mudo">Hoje · ainda sem atividade no GitHub</span>';
        break;
      case 'ok':
        status = dia.minutos
          ? `<span class="ah-ok">${horasBr(dia.minutos)}h lançadas${dia.travado ? ' · enviadas' : ''}</span>`
          : '<span class="ah-mudo">Bloqueado</span>';
        break;
      case 'sem-justificativa':
        status = `<span class="ah-alerta">${horasBr(dia.minutos)}h sem justificativa</span>`;
        acao = `
          <textarea class="ah-coment" rows="2">${esc(dia.sugestao.comentario)}</textarea>
          <button type="button" class="ah-btn" data-acao="justificar">Salvar justificativa</button>`;
        break;
      case 'sugerir-horas':
        status = '<span class="ah-alerta">Sem horas lançadas</span>';
        acao = `
          <label class="ah-horas">Horas <input type="number" step="0.25" min="0" max="24" value="${esc(dia.sugestao.horas)}"></label>
          <textarea class="ah-coment" rows="2">${esc(dia.sugestao.comentario)}</textarea>
          <button type="button" class="ah-btn" data-acao="lancar">Lançar</button>
          <button type="button" class="ah-btn ah-sec" data-acao="mostrar-ausencia">Foi ausência</button>`;
        break;
      case 'sugerir-ausencia':
        status = '<span class="ah-alerta">Sem horas e sem atividade no GitHub</span>';
        acao = `
          <button type="button" class="ah-btn ah-sec" data-acao="mostrar-horas">Lançar horas</button>`;
        break;
    }
    const formAusencia = dia.situacao === 'sugerir-horas' || dia.situacao === 'sugerir-ausencia'
      ? `<div class="ah-ausencia" ${dia.situacao === 'sugerir-horas' ? 'hidden' : ''}>
          <select class="ah-tipo">${opcoesAusencia(tipos, cfg)}</select>
          <input class="ah-just" type="text" placeholder="Justificativa da ausência (obrigatória)">
          <button type="button" class="ah-btn" data-acao="ausencia">Registrar ausência</button>
        </div>`
      : '';
    const formHoras = dia.situacao === 'sugerir-ausencia' && dia.sugestao.celula
      ? `<div class="ah-horas-extra" hidden>
          <label class="ah-horas">Horas <input type="number" step="0.25" min="0" max="24" value="${esc(dia.sugestao.horas)}"></label>
          <textarea class="ah-coment" rows="2" placeholder="Justificativa (ex.: links do Jira)"></textarea>
          <button type="button" class="ah-btn" data-acao="lancar">Lançar</button>
        </div>`
      : '';
    // Dia lançado e ainda não enviado/aprovado: corrigir horas (ex.: hora extra) e a justificativa.
    // Horas da célula para o dia chegar ao total com a hora extra (0 se o lançado já cobre).
    const alvoCelula = dia.extra && !dia.extra.coberto && dia.ajuste ? dia.ajuste.horas + (dia.extra.alvo - dia.minutos / 60) : 0;
    const formAjuste = dia.ajuste
      ? `<div class="ah-ajuste" hidden>
          <label class="ah-horas">Horas <input type="number" step="0.25" min="0" max="24" value="${esc(dia.ajuste.horas)}"></label>
          ${alvoCelula ? `<button type="button" class="ah-btn ah-sec" data-acao="somar-extra-ajuste" data-alvo="${alvoCelula}">Hora extra: ${String(alvoCelula).replace('.', ',')}h</button>` : ''}
          <textarea class="ah-coment" rows="3" placeholder="Carregando a justificativa atual..."></textarea>
          ${dia.ajuste.comentarioSugerido ? '<button type="button" class="ah-btn ah-sec" data-acao="incluir-links">+ links do Jira do dia</button>' : ''}
          <button type="button" class="ah-btn" data-acao="salvar-ajuste">Salvar ajuste</button>
        </div>`
      : '';
    if (dia.ajuste) status += ' <button type="button" class="ah-link" data-acao="mostrar-ajuste">Ajustar</button>';
    return `<div class="ah-dia ah-${dia.situacao}" data-data="${dia.data}">
      ${titulo}
      <div class="ah-dia-corpo">
        <div class="ah-status">${status}</div>
        ${formAjuste}
        ${acao ? `<div class="ah-acao">${acao}</div>` : ''}
        ${formAusencia}${formHoras}
        ${linhaExtra(dia)}
        ${linhaEvidencias(dia)}
      </div>
    </div>`;
  }

  const ROTULO_MUDANCA = {
    lancar: 'Lançar horas e justificativa',
    justificar: 'Incluir justificativa',
    links: 'Completar a justificativa com links do Jira',
    extra: 'Somar possível hora extra',
  };

  // Justificativa com as linhas novas destacadas em relação ao "antes".
  function textoComentario(texto, antes) {
    if (!texto) return '<span class="ah-mudo">(sem justificativa)</span>';
    return texto.split('\n').map((l) => (antes !== undefined && !antes.includes(l) ? `<span class="ah-novo">+ ${esc(l)}</span>` : esc(l))).join('<br>');
  }

  // Lista revisável do que "aplicar" gravaria: antes → depois, com seleção por item.
  function tabelaRevisao(mudancas) {
    if (!mudancas.length) return '';
    const linhas = mudancas.map((m) => `
      <tr>
        <td><input type="checkbox" data-id="${esc(m.id)}" ${m.marcada ? 'checked' : ''}></td>
        <td class="ah-rev-dia">${esc(m.nome)}</td>
        <td>${esc(ROTULO_MUDANCA[m.tipo])}${m.nota ? `<div class="ah-mudo">${esc(m.nota)} · estimativa, confira</div>` : ''}</td>
        <td><b>${horasBr(m.antes.horas * 60)}h</b><div class="ah-rev-coment">${m.tipo === 'extra' ? '' : textoComentario(m.antes.comentario)}</div></td>
        <td><b>${horasBr(m.depois.horas * 60)}h</b><div class="ah-rev-coment">${m.tipo === 'extra' ? '' : textoComentario(m.depois.comentario, m.antes.comentario)}</div></td>
      </tr>`).join('');
    return `<div class="ah-revisao" hidden>
      <div class="ah-rev-titulo">O que será gravado no PSOffice (só os itens marcados)</div>
      <table><thead><tr><th></th><th>Dia</th><th>Mudança</th><th>Antes</th><th>Depois</th></tr></thead><tbody>${linhas}</tbody></table>
      <div class="ah-acao">
        <button type="button" class="ah-btn" data-acao="aplicar-selecionadas">Aplicar selecionadas</button>
        <button type="button" class="ah-btn ah-sec" data-acao="fechar-revisao">Fechar</button>
      </div>
    </div>`;
  }

  async function executar(botao, tarefa) {
    const botoes = painel.querySelectorAll('button');
    botoes.forEach((b) => (b.disabled = true));
    try {
      await tarefa();
      mensagem('Feito! Atualizando a semana...', 'ok');
      setTimeout(() => location.reload(), 600);
    } catch (e) {
      mensagem(e.name === 'SessaoExpirada' ? 'Sua sessão do PSOffice expirou: faça login de novo.' : e.message, 'erro');
      botoes.forEach((b) => (b.disabled = false));
    }
  }

  async function carregar() {
    painel.innerHTML = `<header><strong>Assistente de horas</strong><span class="ah-msg">Analisando a semana e o GitHub...</span></header>`;
    let ctx;
    try {
      let cfg = await Config.ler();
      // Semana começou vazia? Repete as atividades da semana anterior (opção ligada por padrão).
      const semana0 = await cliente.lerSemana(iso);
      const semanaAtualOuFutura = semana0.inicio >= R.inicioDaSemana(R.dataLocal(Date.now()));
      if (!semana0.atividades.length && cfg.selecionarAtividadesAuto && semanaAtualOuFutura) {
        const r = await Assistente.garantirAtividades(cliente, iso);
        if (r && r.adicionadas.length) {
          mensagem('Selecionei as atividades da semana anterior. Atualizando...', 'ok');
          setTimeout(() => location.reload(), 600);
          return;
        }
      }
      cfg = await aprenderJira(cfg, semana0);
      const res = await Assistente.analisar(cliente, iso, remoto);
      // Justificativa atual dos dias lançados e editáveis, para mostrar o "antes" e só sugerir links que faltam.
      const comentarios = {};
      await Promise.all(res.analise.dias.filter((d) => d.ajuste).map(async (d) => {
        comentarios[d.data] = await cliente.lerComentario(d.ajuste.celula).catch(() => '');
      }));
      ctx = Object.assign(res, { tipos: res.ausencias.tipos, mudancas: R.montarMudancas(res.analise, comentarios) });
    } catch (e) {
      mensagem(e.name === 'SessaoExpirada' ? 'Sessão do PSOffice expirada: recarregue a página após o login.' : `Erro: ${e.message}`, 'erro');
      return;
    }
    render(ctx);
  }

  function render(ctx) {
    const { cfg, semana, analise, evid, mudancas } = ctx;
    const principal = semana.atividades.find((a) => a.atribId === analise.principal);
    const pend = R.pendencias(analise);
    const abertas = semana.celulas.filter((c) => c.minutos > 0 && !c.travado);
    const enviada = !abertas.length && semana.celulas.some((c) => c.minutos > 0 && c.travado);
    const avisos = [...(evid.avisos || [])];
    // Por que os botões do rodapé estão desligados, dito em texto (não só cinza).
    const motivo = enviada
      ? `Semana já enviada: nada para revisar ou enviar${semana.podeCancelar ? '. Para ajustar, cancele o envio' : ''}.`
      : !mudancas.length && !abertas.length
        ? 'Nada lançado nesta semana ainda.'
        : !mudancas.length
          ? 'Sem sugestões: horas e justificativas já batem com as evidências.'
          : '';

    painel.innerHTML = `
      <header>
        <strong>Assistente de horas</strong>
        <span class="ah-sub">${principal ? `Sugestões em ${esc(principal.projeto)} / ${esc(principal.atividade)}` : 'Nenhuma atividade na semana'}${evid.login ? ` · GitHub ${esc(evid.login)}` : ''}</span>
        <span class="ah-msg"></span>
        <button type="button" class="ah-link" data-acao="opcoes">Opções</button>
      </header>
      ${avisos.length ? `<div class="ah-avisos">${avisos.map((a) => `<div>${esc(a)}</div>`).join('')}</div>` : ''}
      ${!semana.atividades.length ? '<div class="ah-avisos"><div>A semana está sem atividades. <button type="button" class="ah-btn" data-acao="repetir-atividades">Repetir atividades da semana anterior</button></div></div>' : ''}
      <div class="ah-dias">${analise.dias.map((d) => blocoDia(d, ctx)).join('')}</div>
      ${tabelaRevisao(mudancas)}
      <footer>
        <button type="button" class="ah-btn" data-acao="revisar" ${mudancas.length ? '' : 'disabled'}>Revisar sugestões (${mudancas.length})</button>
        <button type="button" class="ah-btn ah-enviar" data-acao="enviar" ${abertas.length && semana.podeEnviar ? '' : 'disabled'}>Enviar semana para aprovação</button>
        ${semana.podeCancelar ? '<button type="button" class="ah-btn ah-sec" data-acao="cancelar-envio">Cancelar envio para ajustar</button>' : ''}
        ${pend.length ? `<span class="ah-alerta">Pendente: ${pend.map((d) => esc(d.nome)).join(', ')}</span>` : ''}
        ${motivo ? `<span class="ah-mudo">${esc(motivo)}</span>` : ''}
      </footer>`;

    painel.onclick = (ev) => {
      const botao = ev.target.closest('[data-acao]');
      if (!botao) return;
      const acao = botao.dataset.acao;
      const bloco = botao.closest('.ah-dia');
      const dia = bloco && analise.dias.find((d) => d.data === bloco.dataset.data);

      if (acao === 'opcoes') return chrome.runtime.sendMessage({ tipo: 'abrirOpcoes' });
      if (acao === 'mostrar-ausencia') return (bloco.querySelector('.ah-ausencia').hidden = false);
      if (acao === 'mostrar-horas') return (bloco.querySelector('.ah-horas-extra').hidden = false);
      if (acao === 'somar-extra') {
        const campo = bloco.querySelector('.ah-acao input[type=number]');
        campo.value = botao.dataset.alvo;
        botao.disabled = true;
        return;
      }

      if (acao === 'repetir-atividades') {
        return executar(botao, async () => {
          const ids = await Assistente.atividadesAnteriores(cliente, iso);
          if (!ids.length) throw new Error('Não achei atividades nas últimas 4 semanas.');
          await cliente.selecionarAtividades(iso, ids);
        });
      }

      if (acao === 'lancar') {
        const area = botao.parentElement;
        const horas = parseFloat(area.querySelector('input[type=number]').value);
        const comentario = area.querySelector('.ah-coment').value.trim();
        if (!(horas > 0 && horas <= 24)) return mensagem('Informe as horas (entre 0 e 24).', 'erro');
        return executar(botao, () => cliente.lancar(dia.sugestao.celula, horas, comentario, semana));
      }

      if (acao === 'mostrar-ajuste') {
        const form = bloco.querySelector('.ah-ajuste');
        form.hidden = false;
        botao.hidden = true;
        const campo = form.querySelector('.ah-coment');
        cliente.lerComentario(dia.ajuste.celula).then(
          (texto) => {
            campo.value = texto;
            campo.dataset.original = texto;
            campo.placeholder = 'Justificativa (ex.: links do Jira)';
          },
          (e) => mensagem(e.message, 'erro')
        );
        return;
      }

      if (acao === 'somar-extra-ajuste') {
        const campo = bloco.querySelector('.ah-ajuste input[type=number]');
        campo.value = botao.dataset.alvo;
        botao.disabled = true;
        return;
      }

      // Acrescenta só os links do dia que ainda não estão na justificativa.
      if (acao === 'incluir-links') {
        const campo = bloco.querySelector('.ah-ajuste .ah-coment');
        const faltando = dia.ajuste.comentarioSugerido.split('\n').filter((l) => l && !campo.value.includes(l));
        campo.value = [campo.value.trim(), ...faltando].filter(Boolean).join('\n');
        botao.disabled = true;
        return;
      }

      if (acao === 'salvar-ajuste') {
        const form = bloco.querySelector('.ah-ajuste');
        const horas = parseFloat(form.querySelector('input[type=number]').value);
        const campo = form.querySelector('.ah-coment');
        if (!(horas > 0 && horas <= 24)) return mensagem('Informe as horas (entre 0 e 24).', 'erro');
        const mudouHoras = Math.round(horas * 60) !== Math.round(dia.ajuste.horas * 60);
        const mudouComentario = campo.dataset.original !== undefined && campo.value.trim() !== campo.dataset.original.trim();
        if (!mudouHoras && !mudouComentario) return mensagem('Nada mudou.', '');
        return executar(botao, async () => {
          if (mudouHoras) await cliente.salvarHoras(dia.ajuste.celula, horas, semana);
          if (mudouComentario) await cliente.salvarComentario(dia.ajuste.celula.aponId, campo.value.trim());
        });
      }

      if (acao === 'cancelar-envio') {
        if (!confirm('Cancelar o envio desta semana para poder ajustar horas e justificativas? Depois é preciso enviar de novo.')) return;
        return executar(botao, () => cliente.cancelarEnvio(iso));
      }

      if (acao === 'justificar') {
        const comentario = bloco.querySelector('.ah-coment').value.trim();
        if (!comentario) return mensagem('Escreva a justificativa.', 'erro');
        return executar(botao, async () => {
          for (const c of dia.sugestao.celulas) await cliente.salvarComentario(c.aponId, comentario);
        });
      }

      if (acao === 'ausencia') {
        const area = botao.parentElement;
        const tipoId = area.querySelector('.ah-tipo').value;
        const justificativa = area.querySelector('.ah-just').value.trim();
        if (!justificativa) return mensagem('A ausência precisa de uma justificativa.', 'erro');
        const tipo = area.querySelector('.ah-tipo').selectedOptions[0].textContent;
        if (!confirm(`Registrar e enviar para aprovação a ausência de ${R.paraBr(dia.data)} (dia inteiro, ${tipo})?\n\n${justificativa}`)) return;
        return executar(botao, () => cliente.registrarAusencia({ inicio: dia.data, tipoId, justificativa }));
      }

      if (acao === 'revisar') {
        const revisao = painel.querySelector('.ah-revisao');
        revisao.hidden = !revisao.hidden;
        if (!revisao.hidden) revisao.scrollIntoView({ block: 'nearest' });
        return;
      }
      if (acao === 'fechar-revisao') return (painel.querySelector('.ah-revisao').hidden = true);

      // Grava só o que ficou marcado na revisão, na ordem dos dias.
      if (acao === 'aplicar-selecionadas') {
        const marcadas = [...painel.querySelectorAll('.ah-revisao input[type=checkbox]:checked')].map((c) => mudancas.find((m) => m.id === c.dataset.id));
        if (!marcadas.length) return mensagem('Marque pelo menos uma mudança.', 'erro');
        return executar(botao, async () => {
          for (const m of marcadas) {
            if (m.tipo === 'lancar') {
              // Respeita o que a pessoa editou no próprio dia (horas e justificativa).
              const bloco = painel.querySelector(`.ah-dia[data-data="${m.data}"] .ah-acao`);
              const horas = bloco ? parseFloat(bloco.querySelector('input[type=number]').value) : m.depois.horas;
              const comentario = bloco ? bloco.querySelector('.ah-coment').value.trim() : m.depois.comentario;
              await cliente.lancar(m.celula, horas, comentario, semana);
            } else if (m.tipo === 'extra') {
              await cliente.salvarHoras(m.celula, m.depois.horas, semana);
            } else {
              await cliente.salvarComentario(m.celula.aponId, m.depois.comentario);
            }
          }
        });
      }

      if (acao === 'enviar') {
        const total = semana.celulas.reduce((s, c) => s + c.minutos, 0);
        const porDia = analise.dias.filter((d) => d.minutos).map((d) => `${d.nome}: ${horasBr(d.minutos)}h`).join('\n');
        const alerta = pend.length ? `\n\nAtenção: ainda falta resolver ${pend.map((d) => d.nome).join(', ')}.` : '';
        if (!confirm(`Enviar ${horasBr(total)}h da semana para aprovação?\n\n${porDia}${alerta}`)) return;
        return executar(botao, () => cliente.enviarSemana(iso));
      }
    };
  }

  carregar();
})();
