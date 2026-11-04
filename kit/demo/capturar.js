// Gera os quadros do GIF a partir da demonstração (kit/demo/painel.html) e das Opções da extensão,
// com o Chrome ou Edge em modo headless. Tudo com dados fictícios.
// Uso: node kit/demo/capturar.js <pasta-de-saída>
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const RAIZ = path.resolve(__dirname, '..', '..');
const SAIDA = path.resolve(process.argv[2] || path.join(RAIZ, 'evidencias', 'prints', 'quadros'));
const NAVEGADOR = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => p && fs.existsSync(p));

const PAINEL = pathToFileURL(path.join(RAIZ, 'kit', 'demo', 'painel.html')).href;
const OPCOES = pathToFileURL(path.join(RAIZ, 'extensao', 'options.html')).href;

// Chrome fictício para a página de Opções (a mesma conta e atividades da demonstração).
const CHROME_OPCOES = `window.chrome = {
  storage: { local: {
    get: async (k) => ({ [k]: k === 'config' ? { jiraBase: 'https://jira.exemplo/browse/', prefixosJira: ['ABC', 'XYZ'] } : undefined }),
    set: async () => {},
  } },
  runtime: { sendMessage(msg, responder) {
    const dados = msg.tipo === 'statusPonte' ? { login: 'dev-exemplo' }
      : msg.tipo === 'atividades' ? [{ nome: 'PROJETO_DEMO / 1-Desenvolvimento', atribId: '1' }] : null;
    if (responder) setTimeout(() => responder({ ok: true, dados }), 20);
  } },
};`;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function abrirNavegador() {
  if (!NAVEGADOR) throw new Error('Chrome ou Edge não encontrado (defina a variável CHROME).');
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-demo-'));
  const proc = spawn(NAVEGADOR, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${perfil}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-device-scale-factor=1', 'about:blank'], { stdio: 'ignore' });
  const arquivoPorta = path.join(perfil, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(arquivoPorta); i++) await espera(100);
  const porta = fs.readFileSync(arquivoPorta, 'utf8').split('\n')[0];
  const paginas = await (await fetch(`http://127.0.0.1:${porta}/json/list`)).json();
  const ws = new WebSocket(paginas.find((p) => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pendentes = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (!pendentes.has(m.id)) return;
    const { resolve, reject } = pendentes.get(m.id);
    pendentes.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result);
  };
  const enviar = (method, params = {}) => new Promise((resolve, reject) => {
    pendentes.set(++id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const fechar = async () => {
    ws.close();
    const saiu = new Promise((r) => proc.once('exit', r));
    proc.kill();
    await saiu;
    try {
      fs.rmSync(perfil, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    } catch (e) {
      // Perfil temporário preso pelo sistema: fica na pasta temporária.
    }
  };
  return { enviar, fechar };
}

async function main() {
  fs.mkdirSync(SAIDA, { recursive: true });
  const { enviar, fechar } = await abrirNavegador();
  const avaliar = async (expr) => (await enviar('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
  const aguardar = async (expr) => {
    for (let i = 0; i < 100; i++) {
      if (await avaliar(expr)) return;
      await espera(100);
    }
    throw new Error(`Não apareceu: ${expr}`);
  };
  const abrir = async (url, pronto) => {
    await enviar('Page.navigate', { url: 'about:blank' });
    await enviar('Page.navigate', { url });
    await aguardar(pronto);
    await espera(300);
  };
  // Recorta a união dos elementos (com margem) e salva em PNG.
  const quadro = async (nome, seletores, margem = 8) => {
    const r = await avaliar(`(() => {
      const els = ${JSON.stringify(seletores)}.flatMap((s) => [...document.querySelectorAll(s)]).filter((e) => e.offsetParent);
      const rs = els.map((e) => e.getBoundingClientRect());
      const x = Math.min(...rs.map((r) => r.left)), y = Math.min(...rs.map((r) => r.top));
      return { x: x + scrollX, y: y + scrollY, w: Math.max(...rs.map((r) => r.right)) - x, h: Math.max(...rs.map((r) => r.bottom)) - y };
    })()`);
    const clip = { x: Math.max(0, r.x - margem), y: Math.max(0, r.y - margem), width: r.w + 2 * margem, height: r.h + 2 * margem, scale: 1 };
    const { data } = await enviar('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true });
    fs.writeFileSync(path.join(SAIDA, `${nome}.png`), Buffer.from(data, 'base64'));
    console.log(`${nome}.png  ${Math.round(clip.width)}x${Math.round(clip.height)}`);
  };
  const clicar = (seletor) => avaliar(`document.querySelector(${JSON.stringify(seletor)}).click()`);

  try {
    await enviar('Page.enable');
    // Pixels em dobro: o GIF reduz depois e o texto fica nítido.
    await enviar('Emulation.setDeviceMetricsOverride', { width: 960, height: 900, deviceScaleFactor: 2, mobile: false });
    const painelPronto = "!!document.querySelector('#assistente-horas footer')";
    const dia = (d) => `#assistente-horas .ah-dia[data-data="2026-10-${d}"]`;

    // 1. Visão geral: a semana dia a dia.
    await abrir(PAINEL, painelPronto);
    await quadro('painel', ['#assistente-horas']);

    // 2. Dia sem horas: sugestão a partir das suas evidências; colaboração aparece apagada.
    await avaliar(`document.querySelector('${dia(27)} .ah-evid').open = true`);
    await quadro('evidencias', [dia(27)], 0);
    await avaliar(`document.querySelector('${dia(27)} .ah-evid').open = false`);

    // 3. Hora extra (só revisão pesa menos) e Ajustar num dia lançado e ainda não enviado.
    await clicar(`${dia(26)} [data-acao="mostrar-ajuste"]`);
    await aguardar(`document.querySelector('${dia(26)} .ah-ajuste .ah-coment').value !== ''`);
    await quadro('ajustar', [dia(25), dia(26)], 0);

    // 4. Revisar sugestões: antes → depois, grava só o que for marcado.
    await abrir(PAINEL, painelPronto);
    await clicar('#assistente-horas [data-acao="revisar"]');
    await quadro('revisar', ['#assistente-horas .ah-revisao', '#assistente-horas footer'], 0);

    // 5. Painel recolhido em uma linha, em cima da grade (tela mais larga, como num monitor comum).
    await clicar('#assistente-horas [data-acao="fechar-revisao"]');
    await clicar('#assistente-horas [data-acao="recolher"]');
    await enviar('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 2, mobile: false });
    await quadro('recolhido', ['#assistente-horas', '.grade'], 12);
    await enviar('Emulation.setDeviceMetricsOverride', { width: 960, height: 900, deviceScaleFactor: 2, mobile: false });

    // 6 e 7. Opções da extensão (a página real, com um Chrome fictício).
    const { identifier } = await enviar('Page.addScriptToEvaluateOnNewDocument', { source: CHROME_OPCOES });
    await abrir(OPCOES, "document.getElementById('statusGithub').textContent.startsWith('Conectado')");
    await quadro('opcoes', ['body > *'], 16);
    await avaliar("document.querySelector('details').open = true");
    await quadro('opcoes-avancado', ['details'], 12);
    await enviar('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  } finally {
    await fechar();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
