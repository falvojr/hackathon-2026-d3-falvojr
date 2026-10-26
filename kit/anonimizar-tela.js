// Mascara dados pessoais e do cliente na tela de Horas antes de tirar prints ou gravar vídeo.
// Uso: com o painel carregado, abra o console (F12), cole este arquivo e tecle Enter.
// Não contém nenhum dado real: descobre na própria página o que esconder (nome, projeto,
// conta do GitHub, repositórios, títulos de PR/commit, chaves e links do Jira).
(() => {
  const trocas = [];
  const trocar = (de, para) => {
    de = (de || '').trim();
    if (de.length > 2 && !trocas.some(([d]) => d === de)) trocas.push([de, para]);
  };

  // Pessoa: menu do topo e "Cargo - Nome" do recurso na grade.
  for (const el of document.querySelectorAll('.labelUserName, .labelNomeUsu, #usuarioLogado')) {
    trocar(el.textContent, 'Pessoa');
  }
  for (const el of document.querySelectorAll('.recTitulo')) {
    const nome = el.textContent.split(' - ').slice(1).join(' - ');
    trocar(nome, 'Pessoa Consultora');
  }

  // Projeto/atividade da grade e do cabeçalho do painel, e a conta do GitHub.
  const projetos = [...new Set([...document.querySelectorAll('.ativTitulo')].map((e) => e.textContent.trim()))];
  projetos.forEach((p, i) => trocar(p, `PROJETO_CLIENTE_${String.fromCharCode(65 + i)}`));
  const sub = document.querySelector('#assistente-horas .ah-sub');
  const conta = sub && sub.textContent.match(/GitHub (\S+)/);
  if (conta) trocar(conta[1], 'dev-exemplo');

  // Chaves do Jira viram chaves fictícias estáveis (a mesma chave real vira sempre a mesma falsa).
  const chaves = new Map();
  const falsa = (k) => {
    if (!chaves.has(k)) chaves.set(k, `ABC-${1001 + chaves.size}`);
    return chaves.get(k);
  };
  // Mais longos primeiro: "Nome Sobrenome" antes de "Nome", senão sobra o sobrenome.
  trocas.sort((a, b) => b[0].length - a[0].length);
  const mascarar = (texto) => {
    let t = texto;
    for (const [de, para] of trocas) t = t.split(de).join(para);
    t = t.replace(/https?:\/\/[^\s/]+\/browse\//g, 'https://jira.exemplo/browse/');
    return t.replace(/\b[A-Z][A-Z0-9]{1,9}-\d{1,6}\b/g, (k) => (/^ABC-1\d{3}$/.test(k) ? k : falsa(k)));
  };

  // Evidências: repositório e título viram genéricos; fica só o tipo (PR, commit...) e as chaves.
  const repos = new Map();
  document.querySelectorAll('#assistente-horas .ah-evid li').forEach((li) => {
    const fonte = li.querySelector('.ah-fonte');
    const link = li.querySelector('a');
    const repo = (li.textContent.replace(fonte ? fonte.textContent : '', '').split(':')[0] || '').trim();
    if (!repos.has(repo)) repos.set(repo, `repositorio-${String.fromCharCode(97 + repos.size)}`);
    const k = link ? (link.textContent.match(/\b[A-Z][A-Z0-9]{1,9}-\d{1,6}\b/) || [])[0] : null;
    li.innerHTML = `${fonte ? fonte.outerHTML : ''} ${repos.get(repo)}: ${k ? `${falsa(k)} ` : ''}<em>título ocultado</em>`;
  });
  document.querySelectorAll('#assistente-horas .ah-extra em').forEach((em) => (em.textContent = 'título ocultado'));

  // Todo o texto restante da página, os campos e os títulos (tooltips).
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement && /^(SCRIPT|STYLE)$/.test(n.parentElement.tagName)) continue;
    const novo = mascarar(n.nodeValue);
    if (novo !== n.nodeValue) n.nodeValue = novo;
  }
  document.querySelectorAll('textarea, input[type=text]').forEach((c) => (c.value = mascarar(c.value)));
  document.querySelectorAll('[title]').forEach((e) => e.setAttribute('title', mascarar(e.getAttribute('title'))));
  document.title = 'Horas';
  window.__anonimizar = mascarar;
  return `Mascarados: ${trocas.length} nomes, ${chaves.size} chaves do Jira, ${repos.size} repositórios.`;
})();
