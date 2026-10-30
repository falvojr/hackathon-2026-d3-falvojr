// Evidências de trabalho por dia a partir do GitHub: pushes por branch, PRs, revisões,
// comentários em PR e commits. Só metadados (títulos, branches, mensagens), nunca código.
// Roda dentro da ponte local (Node), não no navegador.
(function (raiz) {
  'use strict';

  const R = raiz.Regras;
  const API = 'https://api.github.com';

  // `chamar(caminho)` faz um GET na API do GitHub e devolve o JSON. Quem fornece é a ponte
  // local (extensao/ponte/ponte.js), que usa o `gh` já autenticado: o token nunca chega aqui.
  async function usuario(chamar) {
    return (await chamar('/user')).login;
  }

  function buscar(q) {
    return encodeURIComponent(q);
  }

  /**
   * Retorna { [AAAA-MM-DD]: [{ fonte, autoria, repo, texto, url, ts }] } no fuso de São Paulo.
   * `autoria`: trabalho da própria pessoa (commit, push, branch, PR que ela abriu), o que justifica
   * as horas; o resto (revisão, comentário, PR de outra pessoa) é colaboração.
   * A API de eventos cobre os ~300 eventos mais recentes (cerca de 1 a 2 semanas);
   * para dias mais antigos a busca de commits e PRs completa o histórico.
   */
  async function evidencias({ chamar, login, inicio, fim }) {
    const porDia = {};
    const vistos = new Set();
    const avisos = [];
    function add(ts, item) {
      const dia = R.dataLocal(ts);
      if (dia < inicio || dia > fim) return;
      const chave = `${dia}|${item.fonte}|${item.repo}|${item.texto}`;
      if (vistos.has(chave)) return;
      vistos.add(chave);
      (porDia[dia] = porDia[dia] || []).push(Object.assign({ ts, autoria: R.ehAutoria(item) }, item));
    }

    // Busca usa datas UTC: amplia um dia para cada lado e filtra pelo dia local.
    const de = R.somarDias(inicio, -1);
    const ate = R.somarDias(fim, 1);

    // Títulos dos PRs em que a pessoa se envolveu (os eventos não trazem mais o título).
    const titulos = {};
    try {
      const prs = await chamar(`/search/issues?q=${buscar(`involves:${login} type:pr updated:${de}..${ate}`)}&per_page=100`);
      for (const pr of prs.items) {
        const repo = pr.repository_url.replace(`${API}/repos/`, '');
        titulos[`${repo}#${pr.number}`] = { titulo: pr.title, url: pr.html_url, autor: pr.user && pr.user.login };
        if (pr.user && pr.user.login === login) add(pr.created_at, { fonte: 'pr', repo, texto: pr.title, url: pr.html_url });
      }
    } catch (e) {
      avisos.push(e.message);
    }

    // Eventos recentes: dizem exatamente quando a pessoa agiu e em qual branch.
    try {
      for (let pagina = 1; pagina <= 3; pagina++) {
        const eventos = await chamar(`/users/${login}/events?per_page=100&page=${pagina}`);
        for (const ev of eventos) {
          const repo = ev.repo.name;
          const p = ev.payload || {};
          if (ev.type === 'PushEvent' && p.ref) {
            add(ev.created_at, { fonte: 'push', repo, texto: p.ref.replace('refs/heads/', ''), url: `https://github.com/${repo}` });
          } else if (ev.type === 'CreateEvent' && p.ref_type === 'branch') {
            add(ev.created_at, { fonte: 'branch', repo, texto: p.ref, url: `https://github.com/${repo}` });
          } else if (/^PullRequest(Review|ReviewComment)?Event$/.test(ev.type) && p.pull_request) {
            const pr = titulos[`${repo}#${p.pull_request.number}`];
            // Abrir/fechar o próprio PR é autoria; mexer no PR de outra pessoa (ex.: merge) é colaboração.
            // Sem saber o autor, fica como colaboração (não entra na justificativa).
            const fonte = ev.type !== 'PullRequestEvent' ? 'revisao' : pr && pr.autor === login ? 'pr' : 'pr-outro';
            const texto = pr ? pr.titulo : (p.pull_request.head && p.pull_request.head.ref) || `PR #${p.pull_request.number}`;
            add(ev.created_at, { fonte, repo, texto, url: pr ? pr.url : `https://github.com/${repo}/pull/${p.pull_request.number}` });
          } else if (ev.type === 'IssueCommentEvent' && p.issue) {
            add(ev.created_at, { fonte: 'comentario', repo, texto: p.issue.title, url: p.issue.html_url });
          }
        }
        if (!eventos.length || R.dataLocal(eventos[eventos.length - 1].created_at) < inicio) break;
      }
    } catch (e) {
      avisos.push(e.message);
    }

    // Commits (a busca só enxerga a branch padrão; cobre o histórico além dos eventos).
    try {
      const commits = await chamar(`/search/commits?q=${buscar(`author:${login} author-date:${de}..${ate}`)}&per_page=100&sort=author-date`);
      for (const c of commits.items) {
        add(c.commit.author.date, { fonte: 'commit', repo: c.repository.full_name, texto: c.commit.message.split('\n')[0], url: c.html_url });
      }
    } catch (e) {
      avisos.push(e.message);
    }

    for (const dia of Object.keys(porDia)) porDia[dia].sort((a, b) => a.ts.localeCompare(b.ts));
    return { porDia, avisos };
  }

  raiz.GitHub = { usuario, evidencias };
})(typeof globalThis !== 'undefined' ? globalThis : this);
