// Cliente do PSOffice que usa a sessão já aberta no navegador (nenhuma senha passa por aqui).
// Reproduz exatamente as chamadas que as telas fazem; não depende de DOMParser para rodar
// também no service worker da extensão.
(function (raiz) {
  'use strict';

  const R = raiz.Regras;
  const CHARSET = 'windows-1252';
  const CTRL_HORAS = 'com.mcfox.cron.controller.HorasNewController';
  const CTRL_AUSENCIAS = 'com.mcfox.geraloc.controller.MinhasAusenciasController';

  class SessaoExpirada extends Error {
    constructor() {
      super('Sessão do PSOffice expirada: faça login no PSOffice e tente de novo.');
      this.name = 'SessaoExpirada';
    }
  }

  // ---------- HTML mínimo (atributos, entidades e formulários) ----------

  const ENTIDADES = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", nbsp: ' ', ccedil: 'ç', Ccedil: 'Ç', atilde: 'ã', otilde: 'õ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', acirc: 'â', ecirc: 'ê', ocirc: 'ô', agrave: 'à', Aacute: 'Á', Eacute: 'É' };

  function decodificar(s) {
    return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTIDADES[e] !== undefined ? ENTIDADES[e] : m;
    });
  }

  function atributos(tag) {
    const attrs = {};
    const re = /([^\s=<>"'\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    const corpo = tag.replace(/^<\w+/, '').replace(/\/?>$/, '');
    let m;
    while ((m = re.exec(corpo))) {
      const valor = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '';
      attrs[m[1].toLowerCase()] = decodificar(valor);
    }
    return attrs;
  }

  // Fim de tag como o navegador: ">" dentro de valor entre aspas não fecha a tag
  // (onkeyup="if (x.length > 3600)"), e aspas soltas fora de valor (name="DT_INICIO"") não abrem valor.
  const ATTRS = `(?:\\s+(?!\\s)|[^\\s/>=]+(?![^\\s/>=])(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+(?![^\\s>])))?|/)*`;
  const ABRE = new RegExp(`^<\\w+${ATTRS}>`);

  function tags(html, nome) {
    return html.match(new RegExp(`<${nome}\\b${ATTRS}>`, 'gi')) || [];
  }

  function textoPuro(html) {
    return decodificar(String(html).replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
  }

  // Bloco <form>...</form> que contém o botão informado.
  function formComBotao(html, nomeBotao) {
    const re = new RegExp(`<form\\b${ATTRS}>[\\s\\S]*?</form>`, 'gi');
    let m;
    while ((m = re.exec(html))) {
      if (m[0].includes(`name="${nomeBotao}"`) || m[0].includes(`name='${nomeBotao}'`)) return m[0];
    }
    throw new Error(`Formulário com o botão ${nomeBotao} não encontrado (a tela do PSOffice mudou?).`);
  }

  // Serializa o formulário como o navegador faria ao clicar no botão `nomeBotao`.
  function serializar(formHtml, nomeBotao, sobrescrever) {
    const pares = [];
    let botaoIncluido = false;
    // Só select/textarea têm conteúdo; capturar conteúdo opcional para input engoliria os campos seguintes.
    const re = new RegExp(`<(select|textarea)\\b${ATTRS}>([\\s\\S]*?)</\\1\\s*>|<(input)\\b${ATTRS}>`, 'gi');
    let m;
    while ((m = re.exec(formHtml))) {
      const el = (m[1] || m[3]).toLowerCase();
      const a = atributos(m[0].match(ABRE)[0]);
      if (!a.name || 'disabled' in a) continue;
      if (el === 'input') {
        const tipo = (a.type || 'text').toLowerCase();
        if (['submit', 'image'].includes(tipo)) {
          if (a.name === nomeBotao && !botaoIncluido) {
            pares.push([a.name, a.value || '']);
            botaoIncluido = true;
          }
          continue;
        }
        if (['button', 'reset', 'file'].includes(tipo)) continue;
        if ((tipo === 'checkbox' || tipo === 'radio') && !('checked' in a)) continue;
        pares.push([a.name, a.value !== undefined ? a.value : tipo === 'checkbox' ? 'on' : '']);
      } else if (el === 'select') {
        const opcoes = tags(m[2] || '', 'option');
        const sel = opcoes.map(atributos).find((o) => 'selected' in o) || (opcoes[0] && atributos(opcoes[0]));
        pares.push([a.name, sel ? sel.value || '' : '']);
      } else {
        pares.push([a.name, decodificar(m[2] || '')]);
      }
    }
    if (!botaoIncluido) throw new Error(`Botão ${nomeBotao} não encontrado no formulário.`);
    const nomes = Object.keys(sobrescrever || {});
    const saida = pares.filter(([n]) => !nomes.includes(n));
    for (const n of nomes) {
      const v = sobrescrever[n];
      if (v === null || v === undefined) continue;
      for (const x of Array.isArray(v) ? v : [v]) saida.push([n, String(x)]);
    }
    return saida;
  }

  // As telas são windows-1252: o corpo do formulário precisa ir nessa codificação.
  const CP1252 = { 0x20ac: 0x80, 0x201a: 0x82, 0x192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x2c6: 0x88, 0x2030: 0x89, 0x160: 0x8a, 0x2039: 0x8b, 0x152: 0x8c, 0x17d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x2dc: 0x98, 0x2122: 0x99, 0x161: 0x9a, 0x203a: 0x9b, 0x153: 0x9c, 0x17e: 0x9e, 0x178: 0x9f };

  function codificar1252(s) {
    let out = '';
    for (const ch of String(s)) {
      const cp = ch.codePointAt(0);
      const b = cp < 0x80 || (cp >= 0xa0 && cp <= 0xff) ? cp : CP1252[cp];
      if (b === undefined) {
        out += encodeURIComponent(`&#${cp};`);
      } else if (/[A-Za-z0-9\-_.*]/.test(String.fromCharCode(b)) && b < 0x80) {
        out += String.fromCharCode(b);
      } else if (b === 0x20) {
        out += '+';
      } else {
        out += '%' + b.toString(16).toUpperCase().padStart(2, '0');
      }
    }
    return out;
  }

  function corpoFormulario(pares) {
    return pares.map(([n, v]) => `${codificar1252(n)}=${codificar1252(v)}`).join('&');
  }

  // ---------- cliente ----------

  function criarCliente(base) {
    base = String(base || '').replace(/\/+$/, '');
    const origem = new URL(base).origin;

    async function requisitar(caminho, opcoes) {
      const url = /^https?:/.test(caminho) ? caminho : caminho.startsWith('/') ? origem + caminho : `${base}/${caminho}`;
      const r = await fetch(url, Object.assign({ credentials: 'include', cache: 'no-store' }, opcoes));
      const html = new TextDecoder(CHARSET).decode(await r.arrayBuffer());
      if (/\/util\/login\.do/.test(r.url) || /Acesso à Plataforma PSOffice/.test(html)) throw new SessaoExpirada();
      // Erros do PSOffice (ex.: "Acesso Negado") vêm com status 200 e título "Error".
      if (!r.ok || /<title>\s*Error\s*<\/title>/i.test(html)) {
        throw new Error(`PSOffice recusou ${caminho.split('?')[0].split('/').pop()}: ${textoPuro(html.replace(/<script[\s\S]*?<\/script>/gi, '')).slice(0, 200)}`);
      }
      return { html, url: r.url };
    }

    async function postarFormulario(paginaUrl, html, nomeBotao, sobrescrever) {
      const form = formComBotao(html, nomeBotao);
      const acao = atributos(form.match(ABRE)[0]).action || paginaUrl;
      const destino = new URL(acao, paginaUrl).href;
      return requisitar(destino, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: corpoFormulario(serializar(form, nomeBotao, sobrescrever)),
      });
    }

    // "Select" é a entrada do menu Horas: aceita dtRef e não exige usuId (o "ExibeSemanal" exige).
    function urlSemana(iso) {
      return `${base}/psoffice/horas/horasnew.do?controller=${CTRL_HORAS}&state=Select&_mn_cdg=horasminha&_nm_ctx=minhaPagina&tela=1&dtRef=${R.paraBr(iso)}`;
    }

    // Lê a semana (domingo a sábado) que contém a data `iso`.
    async function lerSemana(iso) {
      const { html } = await requisitar(urlSemana(iso));
      const usuId = (html.match(/usuId=(\d+)/) || [])[1] || null;
      const status = {};
      const atividades = {};
      const reDet = /detAponNewSemanal\(\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"/g;
      let m;
      while ((m = reDet.exec(html))) {
        status[m[1]] = m[4];
        const atribId = m[2].replace('EPT_', '');
        atividades[atribId] = atividades[atribId] || { atribId, projeto: decodificar(m[6]), atividade: decodificar(m[7]), recurso: decodificar(m[8]) };
      }
      const celulas = [];
      for (const tag of tags(html, 'input')) {
        const a = atributos(tag);
        if (!/form-horas/.test(a.class || '') || !a.name || a.name[0] !== '{' || !/^l_\d+c_\d+$/.test(a.id || '')) continue;
        const params = JSON.parse(a.name);
        const [, linha, coluna] = a.id.match(/^l_(\d+)c_(\d+)$/);
        const icone = html.match(new RegExp(`id="img_${linha}_${coluna}"[^>]*?style="([^"]*)"`));
        const st = status[a.id];
        const horas = parseFloat(String(a.value || '').replace(',', '.'));
        celulas.push({
          id: a.id,
          atribId: String(params.atribId),
          data: params.data.slice(0, 10),
          aponId: params.aponId || null,
          params,
          minutos: isNaN(horas) ? 0 : Math.round(horas * 60),
          temComentario: !!icone && !/display\s*:\s*none/i.test(icone[1]),
          status: st === undefined ? '' : st,
          // Mesma regra da tela: só "em aberto" (0), "rejeitado" (3) ou sem apontamento podem ser editados.
          travado: 'readonly' in a || (st !== undefined && st !== '' && st !== '0' && st !== '3'),
        });
      }
      for (const tag of tags(html, 'input')) {
        const a = atributos(tag);
        const id = (a.id || '').match(/^EPT_(\d+)$/);
        if (id && atividades[id[1]]) atividades[id[1]].ept = parseFloat(a.value);
      }
      const sel = html.match(/location='([^']*atividades\.do\?[^']*)'/);
      return {
        usuId,
        inicio: R.inicioDaSemana(iso),
        atividades: Object.values(atividades),
        celulas,
        urlAtividades: sel ? decodificar(sel[1]) : null,
        podeEnviar: /name="button_SubmeteSemanal"/.test(html),
        // A tela só oferece "Cancelar Envio" enquanto há apontamento enviado e ainda não aprovado.
        podeCancelar: /name="button_CancelaSubmissaoSemanal"/.test(html) && celulas.some((c) => c.status === '1'),
      };
    }

    // Grava as horas de uma célula (mesmo POST que a tela faz ao sair do campo).
    async function salvarHoras(celula, horas, semana) {
      const ativ = semana && semana.atividades.find((a) => a.atribId === celula.atribId);
      const params = Object.assign({}, celula.params, { minutos: Math.round(horas * 60) });
      params.ept = ativ && !isNaN(ativ.ept) ? ativ.ept * 60 : null;
      const r = await fetch(`${base}/api/horas/apontamento?ieCode=${Math.random()}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(params),
      });
      const texto = await r.text();
      if (/Acesso à Plataforma PSOffice/.test(texto)) throw new SessaoExpirada();
      if (!r.ok) throw new Error(`Não salvou as horas de ${celula.data}: ${textoPuro(texto).slice(0, 200)}`);
      return JSON.parse(texto);
    }

    // Grava o comentário (justificativa) de um apontamento já existente.
    async function salvarComentario(aponId, comentario) {
      const udfs = Array.from({ length: 10 }, (_, i) => `&udf${i + 1}=`).join('');
      const url = `${base}/core/util/ajax.do?service=comentapon${udfs}&ept=&ind_restrito=N&apon_id=${aponId}&action=ADD_UPDATE&ieCode=${Math.random()}`;
      // A tela aplica encodeURIComponent antes do $.post, que codifica de novo: o servidor espera as duas camadas.
      const { html } = await requisitar(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: 'comentario=' + encodeURIComponent(encodeURIComponent(comentario)),
      });
      return html;
    }

    async function lerComentario(celula) {
      const url = `${base}/core/util/ajax.do?service=comentapon&data=${R.paraBr(celula.data)}&atrib_id=${celula.atribId}&apon_id=${celula.aponId || ''}&action=FIND&ieCode=${Math.random()}`;
      const { html } = await requisitar(url, { method: 'POST' });
      const m = html.match(/COMENTARIOS:"((?:[^"\\]|\\.)*)"/);
      return m ? JSON.parse(`"${m[1]}"`) : '';
    }

    // Lança horas e, se houver, a justificativa. Retorna o aponId.
    async function lancar(celula, horas, comentario, semana) {
      const r = await salvarHoras(celula, horas, semana);
      const aponId = r.aponId || celula.aponId;
      if (comentario && aponId) await salvarComentario(aponId, comentario);
      return aponId;
    }

    // Marca as atividades da semana (tela "Selecionar atividades para seu resumo de horas").
    async function selecionarAtividades(iso, atribIds) {
      const semana = await lerSemana(iso);
      if (!semana.urlAtividades) throw new Error('Link "Selecionar Atividades" não encontrado na semana.');
      const pagina = await requisitar(semana.urlAtividades);
      const form = formComBotao(pagina.html, 'button_UpdateAtividadesNew');
      const disponiveis = tags(form, 'input').map(atributos).filter((a) => /^check_\d+$/.test(a.name || ''));
      const jaMarcadas = disponiveis.filter((a) => 'checked' in a).map((a) => a.value);
      const alvo = atribIds.filter((id) => disponiveis.some((a) => a.value === id));
      const novas = alvo.filter((id) => !jaMarcadas.includes(id));
      if (!novas.length) return { adicionadas: [], indisponiveis: atribIds.filter((id) => !alvo.includes(id)) };
      const sobrescrever = { ADDED: novas.map((id) => `${id};`).join(''), REMOVED: '' };
      for (const id of [...jaMarcadas, ...novas]) sobrescrever[`check_${id}`] = id;
      await postarFormulario(pagina.url, pagina.html, 'button_UpdateAtividadesNew', sobrescrever);
      const depois = await lerSemana(iso);
      const faltando = novas.filter((id) => !depois.atividades.some((a) => a.atribId === id));
      if (faltando.length) throw new Error(`O PSOffice não confirmou a seleção das atividades ${faltando.join(', ')}.`);
      return { adicionadas: novas, indisponiveis: atribIds.filter((id) => !alvo.includes(id)) };
    }

    // Envia a semana para aprovação da gestão.
    async function enviarSemana(iso) {
      const { html, url: final } = await requisitar(urlSemana(iso));
      await postarFormulario(final, html, 'button_SubmeteSemanal', {});
      const depois = await lerSemana(iso);
      const abertas = depois.celulas.filter((c) => c.minutos > 0 && !c.travado);
      if (abertas.length) throw new Error(`O PSOffice não confirmou o envio: ${abertas.length} apontamento(s) continuam em aberto.`);
      return depois;
    }

    // Cancela o envio (mesmo botão "Cancelar Envio para Aprovação"), para permitir ajustes antes da aprovação.
    async function cancelarEnvio(iso) {
      const { html, url: final } = await requisitar(urlSemana(iso));
      await postarFormulario(final, html, 'button_CancelaSubmissaoSemanal', {});
      const depois = await lerSemana(iso);
      if (depois.celulas.some((c) => c.status === '1')) throw new Error('O PSOffice não confirmou o cancelamento do envio.');
      return depois;
    }

    // ---------- ausências ----------

    function urlAusencias() {
      return `${base}/psoffice/minhas/ausencias.do?controller=${CTRL_AUSENCIAS}&state=MinhasAusencias&_mn_cdg=ausminha&_nm_ctx=minhaPagina`;
    }

    async function lerAusencias() {
      const { html } = await requisitar(urlAusencias());
      const grid = html.match(/gridurldtgraj0\s*=\s*'([^']+)'/);
      const tipos = [];
      const select = html.match(/<select\b[^>]*name="AUST_ID"[^>]*>([\s\S]*?)<\/select>/i);
      if (select) {
        const re = /<option\b([^>]*)>([^<]*)/gi;
        let m;
        while ((m = re.exec(select[1]))) {
          const v = atributos(`<o ${m[1]}>`).value;
          if (v) tipos.push({ id: v, nome: decodificar(m[2]).trim() });
        }
      }
      if (!grid) return { ausencias: [], tipos };
      const { html: xml } = await requisitar(decodificar(grid[1]));
      const ausencias = [];
      const reLinha = /<row\b[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/row>/gi;
      let m;
      while ((m = reLinha.exec(xml))) {
        const cel = (m[2].match(/<cell>[\s\S]*?<\/cell>/gi) || []).map((c) => textoPuro(c.replace(/<!\[CDATA\[|\]\]>/g, '')));
        const datas = (cel[1] || '').match(/\d{2}\/\d{2}\/\d{4}/g) || [];
        if (!datas.length) continue;
        const ini = R.deBr(datas[0]);
        const fim = R.deBr(datas[datas.length - 1]);
        ausencias.push({ id: m[1], periodo: cel[1], horario: cel[2], justificativa: cel[3], situacao: cel[4], tipo: cel[5], dias: R.intervalo(ini, fim) });
      }
      return { ausencias, tipos };
    }

    // Registra uma ausência de dia inteiro e envia para aprovação (mesmo formulário de "Nova ausência").
    async function registrarAusencia({ inicio, fim, tipoId, justificativa }) {
      const pagina = await requisitar(urlAusencias());
      await postarFormulario(pagina.url, pagina.html, 'button_Submete', {
        DT_INICIO: R.paraBr(inicio),
        DT_FIM: R.paraBr(fim || inicio),
        HORARIO: '1',
        HORARIORADIO: '1',
        HORARIO_INICIO: '',
        HORARIO_FIM: '',
        AUST_ID: tipoId,
        DESCRICAO: justificativa,
      });
      const { ausencias } = await lerAusencias();
      const registrada = ausencias.find((a) => a.dias.includes(inicio));
      if (!registrada) throw new Error(`O PSOffice não confirmou a ausência de ${R.paraBr(inicio)}.`);
      return registrada;
    }

    return {
      base, urlSemana, urlAusencias,
      lerSemana, salvarHoras, salvarComentario, lerComentario, lancar,
      selecionarAtividades, enviarSemana, cancelarEnvio,
      lerAusencias, registrarAusencia,
    };
  }

  raiz.PSOffice = { criarCliente, SessaoExpirada, _interno: { atributos, serializar, codificar1252, decodificar, formComBotao } };
})(typeof globalThis !== 'undefined' ? globalThis : this);
