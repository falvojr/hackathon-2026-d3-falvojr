// Ponte local (native messaging do Chrome/Edge) entre a extensão e o `gh` já autenticado.
// O token fica no cofre do sistema; a extensão nunca o recebe. A ponte só entende duas
// perguntas e só faz GET em quatro caminhos fixos da API do GitHub.
'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
require('../lib/regras.js');
require('../lib/github.js');

const GitHub = globalThis.GitHub;
const R = globalThis.Regras;

// Única lista do que a ponte pode ler no GitHub. Qualquer outro caminho é recusado.
function caminhoPermitido(caminho, login) {
  const u = new URL(caminho, 'https://api.github.com');
  if (u.origin !== 'https://api.github.com') return false;
  return (
    u.pathname === '/user' ||
    u.pathname === `/users/${login}/events` ||
    u.pathname === '/search/issues' ||
    u.pathname === '/search/commits'
  );
}

function executar(programa, args, env) {
  return new Promise((resolve, reject) => {
    execFile(programa, args, { env, windowsHide: true, maxBuffer: 32 * 1024 * 1024 }, (erro, saida, falha) => {
      if (erro) reject(new Error((falha || erro.message).toString().trim().split('\n')[0]));
      else resolve(saida.toString());
    });
  });
}

function criarLeitor(cfg) {
  let token = null;
  // Token da conta configurada, pedido ao `gh` a cada execução e mantido só na memória deste processo.
  async function tokenDaConta() {
    if (!token) token = (await executar(cfg.gh, ['auth', 'token', '--hostname', 'github.com', '--user', cfg.login], process.env)).trim();
    return token;
  }
  return async function chamar(caminho) {
    if (!caminhoPermitido(caminho, cfg.login)) throw new Error(`Chamada não permitida pela ponte: ${caminho.split('?')[0]}`);
    const env = Object.assign({}, process.env, { GH_TOKEN: await tokenDaConta() });
    const saida = await executar(cfg.gh, ['api', '--method', 'GET', caminho.replace(/^\//, '')], env);
    return JSON.parse(saida);
  };
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

async function tratar(msg, cfg) {
  const chamar = criarLeitor(cfg);
  if (msg.tipo === 'usuario') {
    const login = await GitHub.usuario(chamar);
    if (login !== cfg.login) throw new Error(`O gh respondeu como ${login}, mas a ponte foi instalada para ${cfg.login}.`);
    return { login };
  }
  if (msg.tipo === 'evidencias') {
    if (!DATA.test(msg.inicio) || !DATA.test(msg.fim) || msg.inicio > msg.fim) throw new Error('Período inválido.');
    if (R.intervalo(msg.inicio, msg.fim).length > 62) throw new Error('Período maior que 62 dias.');
    const r = await GitHub.evidencias({ chamar, login: cfg.login, inicio: msg.inicio, fim: msg.fim });
    // Mensagens do native messaging têm limite de 1 MB: textos longos são cortados.
    for (const itens of Object.values(r.porDia)) for (const it of itens) it.texto = it.texto.slice(0, 200);
    return Object.assign(r, { login: cfg.login });
  }
  throw new Error(`Pergunta desconhecida: ${msg.tipo}`);
}

// ---------- protocolo do native messaging: 4 bytes de tamanho (little endian) + JSON ----------

function responder(obj) {
  const corpo = Buffer.from(JSON.stringify(obj), 'utf8');
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32LE(corpo.length, 0);
  process.stdout.write(Buffer.concat([tamanho, corpo]));
}

function iniciar() {
  const cfg = JSON.parse(fs.readFileSync(process.env.ASSISTENTE_HORAS_CONFIG || path.join(__dirname, 'config.json'), 'utf8'));
  let buffer = Buffer.alloc(0);
  let pendentes = 0;
  let fechado = false;
  const talvezSair = () => fechado && pendentes === 0 && process.exit(0);

  process.stdin.on('data', (pedaco) => {
    buffer = Buffer.concat([buffer, pedaco]);
    while (buffer.length >= 4) {
      const n = buffer.readUInt32LE(0);
      if (buffer.length < 4 + n) break;
      const texto = buffer.slice(4, 4 + n).toString('utf8');
      buffer = buffer.slice(4 + n);
      pendentes++;
      Promise.resolve()
        .then(() => tratar(JSON.parse(texto), cfg))
        .then((dados) => responder({ ok: true, dados }), (e) => responder({ ok: false, erro: e.message }))
        .finally(() => {
          pendentes--;
          talvezSair();
        });
    }
  });
  process.stdin.on('end', () => {
    fechado = true;
    talvezSair();
  });
}

if (require.main === module) iniciar();

module.exports = { caminhoPermitido, tratar };
