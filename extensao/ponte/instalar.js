// Instala (ou remove) a ponte local para o Chrome e o Edge do usuário atual. Não precisa de admin.
//   node extensao/ponte/instalar.js [--usuario <conta-do-gh>]
//   node extensao/ponte/instalar.js --remover
'use strict';

const { execFileSync, spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const NOME = 'br.com.ideen.assistente_horas';
const WIN = process.platform === 'win32';
const args = process.argv.slice(2);
const opcao = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

const pasta = WIN
  ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'AssistenteHorasPSOffice')
  : path.join(os.homedir(), '.config', 'assistente-horas-psoffice');

// Onde cada navegador procura o manifesto do host (no Windows, via registro).
const REGISTRO = [`HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NOME}`, `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${NOME}`];
const PASTAS_HOST = process.platform === 'darwin'
  ? ['Google/Chrome', 'Microsoft Edge'].map((p) => path.join(os.homedir(), 'Library', 'Application Support', p, 'NativeMessagingHosts'))
  : ['google-chrome', 'chromium', 'microsoft-edge'].map((p) => path.join(os.homedir(), '.config', p, 'NativeMessagingHosts'));

function log(msg) {
  console.log(`[ponte] ${msg}`);
}

// ID da extensão = sha256 da chave pública do manifest, 32 primeiros dígitos hex mapeados para a-p.
function idDaExtensao() {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  const hash = crypto.createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex');
  return hash.slice(0, 32).split('').map((h) => String.fromCharCode(97 + parseInt(h, 16))).join('');
}

function acharGh() {
  const saida = execFileSync(WIN ? 'where' : 'which', ['gh'], { encoding: 'utf8' }).trim().split(/\r?\n/);
  return saida.find((p) => /\.exe$/i.test(p)) || saida[0];
}

function contasDoGh(gh) {
  let texto = '';
  try {
    texto = execFileSync(gh, ['auth', 'status', '--hostname', 'github.com'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    texto = `${e.stdout || ''}${e.stderr || ''}`;
  }
  return [...texto.matchAll(/account (\S+)/g)].map((m) => m[1]);
}

// Terminais de apps empacotados (MSIX, ex.: o app desktop do Claude) gravam AppData e o registro
// numa cópia privada do pacote, que o navegador não enxerga. Detecta e pede um terminal comum.
function verificarVirtualizacao() {
  if (!WIN) return;
  const pacotes = path.join(path.dirname(pasta), 'Packages');
  let nomes = [];
  try {
    nomes = fs.readdirSync(pacotes);
  } catch (e) {
    return;
  }
  const preso = nomes.find((p) => fs.existsSync(path.join(pacotes, p, 'LocalCache', 'Local', path.basename(pasta), 'config.json')));
  if (preso) {
    fs.rmSync(path.join(pacotes, preso, 'LocalCache', 'Local', path.basename(pasta)), { recursive: true, force: true });
    throw new Error(
      `Este terminal roda dentro do app empacotado "${preso.split('_')[0]}", e o Windows esconde do navegador o que ele grava. ` +
        'Abra um terminal comum (Iniciar > Terminal ou PowerShell) e rode o instalador de novo.'
    );
  }
}

function remover() {
  if (WIN) for (const chave of REGISTRO) {
    try {
      execFileSync('reg', ['delete', chave, '/f'], { stdio: 'ignore' });
    } catch (e) {
      // Chave já não existia.
    }
  }
  else for (const p of PASTAS_HOST) fs.rmSync(path.join(p, `${NOME}.json`), { force: true });
  fs.rmSync(pasta, { recursive: true, force: true });
  log('Ponte removida.');
}

// Fala com a ponte exatamente como o navegador falaria.
function perguntar(lancador, msg) {
  return new Promise((resolve, reject) => {
    const proc = spawn(WIN ? `"${lancador}"` : lancador, [`chrome-extension://${idDaExtensao()}/`], { shell: WIN, windowsHide: true });
    const partes = [];
    proc.stdout.on('data', (d) => partes.push(d));
    proc.stderr.on('data', (d) => process.stderr.write(d));
    proc.on('error', reject);
    proc.on('close', () => {
      const buf = Buffer.concat(partes);
      if (buf.length < 4) return reject(new Error('A ponte não respondeu.'));
      resolve(JSON.parse(buf.slice(4, 4 + buf.readUInt32LE(0)).toString('utf8')));
    });
    const corpo = Buffer.from(JSON.stringify(msg), 'utf8');
    const tamanho = Buffer.alloc(4);
    tamanho.writeUInt32LE(corpo.length, 0);
    proc.stdin.end(Buffer.concat([tamanho, corpo]));
  });
}

async function instalar() {
  const gh = acharGh();
  log(`gh encontrado em ${gh}`);
  const contas = contasDoGh(gh);
  const login = opcao('--usuario') || (contas.length === 1 ? contas[0] : null);
  if (!login) {
    throw new Error(`O gh tem ${contas.length ? `as contas ${contas.join(', ')}` : 'nenhuma conta logada'}. Rode de novo com --usuario <conta>.`);
  }
  if (contas.length && !contas.includes(login)) throw new Error(`A conta ${login} não está logada no gh (contas: ${contas.join(', ')}).`);

  fs.mkdirSync(pasta, { recursive: true });
  const config = path.join(pasta, 'config.json');
  fs.writeFileSync(config, JSON.stringify({ login, gh }, null, 2));
  verificarVirtualizacao();

  const ponte = path.join(__dirname, 'ponte.js');
  const lancador = path.join(pasta, WIN ? 'ponte.cmd' : 'ponte.sh');
  if (WIN) {
    fs.writeFileSync(lancador, `@echo off\r\nset "ASSISTENTE_HORAS_CONFIG=${config}"\r\n"${process.execPath}" "${ponte}" %*\r\n`);
  } else {
    fs.writeFileSync(lancador, `#!/bin/sh\nASSISTENTE_HORAS_CONFIG='${config}' exec '${process.execPath}' '${ponte}' "$@"\n`, { mode: 0o755 });
  }

  const manifesto = {
    name: NOME,
    description: 'Assistente de Horas PSOffice: leitura do GitHub via gh',
    path: lancador,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${idDaExtensao()}/`],
  };
  const arquivoManifesto = path.join(pasta, `${NOME}.json`);
  fs.writeFileSync(arquivoManifesto, JSON.stringify(manifesto, null, 2));
  if (WIN) {
    for (const chave of REGISTRO) execFileSync('reg', ['add', chave, '/ve', '/t', 'REG_SZ', '/d', arquivoManifesto, '/f'], { stdio: 'ignore' });
  } else {
    for (const p of PASTAS_HOST) {
      fs.mkdirSync(p, { recursive: true });
      fs.writeFileSync(path.join(p, `${NOME}.json`), JSON.stringify(manifesto, null, 2));
    }
  }
  log(`Registrada para Chrome e Edge (extensão ${idDaExtensao()}), conta ${login}.`);

  const r = await perguntar(lancador, { tipo: 'usuario' });
  if (!r.ok) throw new Error(`Teste da ponte falhou: ${r.erro}`);
  log(`Teste ok: a ponte lê o GitHub como ${r.dados.login}. Recarregue a extensão no navegador.`);
}

(async () => {
  if (args.includes('--remover')) return remover();
  await instalar();
})().catch((e) => {
  console.error(`[ponte] Erro: ${e.message}`);
  process.exitCode = 1;
});
