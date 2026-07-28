/**
 * servidor.js
 * Servidor local NexuHunt — http://localhost:3721
 * - Dispara o fluxo via botão no relatório (SSE)
 * - Mantém cliente WhatsApp dedicado para envio de notificações de match
 * - Endpoint /enviar-match envia msgs para os dois corretores de um match
 */
const http      = require('http');
const { spawn } = require('child_process');
const { exec }  = require('child_process');
require('dotenv').config();
const fs        = require('fs');
const path      = require('path');

const PORT = 3721;
const DIR  = __dirname;

const ARQ_ENVIADOS = path.join(DIR, 'matches_enviados.json');

let isRunning = false;

// ── WhatsApp sender ────────────────────────────────────────────────────────

let waClient  = null;
let waReady   = false;

function initWaSender() {
  let Client, LocalAuth, QRCode;
  try {
    ({ Client, LocalAuth } = require('whatsapp-web.js'));
    QRCode = require('qrcode');
  } catch (e) {
    log('⚠️  whatsapp-web.js não encontrado — envio automático desativado');
    return;
  }

  const sender = new Client({
    authStrategy: new LocalAuth({ dataPath: 'sessao_servidor', clientId: 'nexu-sender' }),
    puppeteer: {
      headless: true,
      executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    }
  });

  sender.on('qr', async (qr) => {
    try {
      await QRCode.toFile(path.join(DIR, 'qr_sender.png'), qr, { width: 400, margin: 2 });
      log('📱 Escaneie qr_sender.png com o número dedicado para envio de matches');
      exec('start ' + path.join(DIR, 'qr_sender.png'));
    } catch (e) {
      log('QR gerado — use um leitor para escanear');
    }
  });

  sender.on('authenticated', () => log('🔑 WA sender autenticado'));

  sender.on('ready', () => {
    waReady  = true;
    waClient = sender;
    log('✅ WhatsApp sender conectado e pronto para envio');
  });

  sender.on('auth_failure', (msg) => {
    waReady = false;
    log('❌ WA sender auth failure: ' + msg);
  });

  sender.on('disconnected', (reason) => {
    waReady = false;
    log('⚠️  WA sender desconectado: ' + reason);
    if (reason !== 'LOGOUT') {
      setTimeout(() => sender.initialize().catch(() => {}), 10000);
    }
  });

  sender.initialize().catch((e) => log('❌ WA sender init erro: ' + e.message));
}

// Converte LID ou número de telefone para chat ID do WhatsApp
function formatarChatId(id) {
  if (!id) return null;
  const d = String(id).replace(/[^0-9]/g, '');
  if (!d) return null;
  if (d.length > 13) return d + '@lid';                           // LID de 15 dígitos
  if (d.length === 11) return '55' + d + '@c.us';                 // número BR com 9º dígito
  if (d.length === 10) return '55' + d + '@c.us';                 // número BR sem 9º dígito
  if (d.length >= 12 && d.slice(0, 2) === '55') return d + '@c.us'; // já tem 55
  return d + '@c.us';
}

// ── Helpers ────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function stripAnsi(s) {
  return s.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '').replace(/\r/g, '');
}

function log(msg) {
  const t = new Date().toLocaleTimeString('pt-BR');
  console.log(`[${t}] ${msg}`);
}

function lerEnviados() {
  try { return fs.existsSync(ARQ_ENVIADOS) ? JSON.parse(fs.readFileSync(ARQ_ENVIADOS, 'utf8')) : {}; }
  catch { return {}; }
}

function salvarEnviados(obj) {
  try { fs.writeFileSync(ARQ_ENVIADOS, JSON.stringify(obj, null, 2), 'utf8'); } catch {}
}

// ── Servidor HTTP ──────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  // ── Status do fluxo ──
  if (req.url === '/status') {
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ running: isRunning }));
    return;
  }

  // ── Status do WA sender ──
  if (req.url === '/wa-status') {
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ready: waReady }));
    return;
  }

  // ── Lookup de contato por LID ──
  if (req.url.startsWith('/contato/')) {
    const lid = decodeURIComponent(req.url.slice('/contato/'.length));
    const contFile = path.join(DIR, 'contatos_ricos.json');
    let info = {};
    try {
      if (fs.existsSync(contFile)) {
        const contatos = JSON.parse(fs.readFileSync(contFile, 'utf8'));
        info = contatos[lid] || {};
      }
    } catch {}
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ nome: info.nome || '', tel: info.tel || '', creci: info.creci || '' }));
    return;
  }

  // ── Envio de notificação de match ──
  if (req.url === '/enviar-match' && req.method === 'POST') {
    if (!waReady || !waClient) {
      res.writeHead(503, { ...CORS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'WhatsApp sender não conectado', b: 'erro', o: 'erro' }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => body += chunk);
    req.on('end', async () => {
      let payload;
      try { payload = JSON.parse(body); }
      catch { res.writeHead(400, CORS); res.end(); return; }

      const { bId, oId, bMsg, oMsg } = payload;
      const results = { b: null, o: null };

      const bChatId = formatarChatId(bId);
      const oChatId = formatarChatId(oId);

      if (bChatId && bMsg) {
        try {
          await waClient.sendMessage(bChatId, bMsg);
          results.b = 'ok';
          log(`✉️  Match enviado → busca (${bChatId})`);
        } catch (e) {
          results.b = 'erro: ' + e.message;
          log(`❌ Falha ao enviar para busca (${bChatId}): ${e.message}`);
        }
      } else {
        results.b = bChatId ? 'sem-msg' : 'sem-id';
      }

      if (oChatId && oMsg) {
        try {
          await waClient.sendMessage(oChatId, oMsg);
          results.o = 'ok';
          log(`✉️  Match enviado → oferta (${oChatId})`);
        } catch (e) {
          results.o = 'erro: ' + e.message;
          log(`❌ Falha ao enviar para oferta (${oChatId}): ${e.message}`);
        }
      } else {
        results.o = oChatId ? 'sem-msg' : 'sem-id';
      }

      // Persiste histórico
      const chave = (bId || '') + '|' + (oId || '');
      const enviados = lerEnviados();
      enviados[chave] = { enviadoEm: new Date().toISOString(), ...results };
      salvarEnviados(enviados);

      res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(results));
    });
    return;
  }

  // ── Rodar fluxo completo (SSE) ──
  if (req.url === '/rodar') {
    if (isRunning) {
      res.writeHead(409, { ...CORS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Fluxo já em execução' }));
      return;
    }

    res.writeHead(200, {
      ...CORS,
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });

    const send = (msg) => {
      try {
        const clean = stripAnsi(String(msg)).trim();
        if (clean) res.write(`data: ${clean}\n\n`);
      } catch {}
    };

    isRunning = true;
    log('Fluxo disparado via botão');
    send(`🚀 Fluxo iniciado — ${new Date().toLocaleString('pt-BR')}`);

    const etapas = [
      { script: 'fluxo.js',     label: 'Coletando + Processando', obrigatorio: true  },
      { script: 'publicar.js',  label: 'Publicando',              obrigatorio: true  },
      { script: 'notificar.js', label: 'Notificando',             obrigatorio: false },
    ];
    let idx = 0;

    function proxima() {
      if (idx >= etapas.length) {
        send('\n✅ Tudo pronto! https://gregfaleiro.github.io/matchzap/');
        send('[DONE]');
        isRunning = false;
        log('Fluxo concluído com sucesso');
        try { res.end(); } catch {}
        return;
      }
      const { script, label, obrigatorio } = etapas[idx++];
      send(`\n━━━ ${label} ━━━`);

      const proc = spawn('node', [script], { cwd: DIR });
      proc.stdout.on('data', (d) => d.toString().split('\n').forEach(l => send(l)));
      proc.stderr.on('data', (d) => d.toString().split('\n').forEach(l => { if (l.trim()) send('⚠️ ' + l); }));
      proc.on('close', (code) => {
        if (code !== 0 && obrigatorio) {
          send(`\n❌ Falha em ${script} (código ${code}).`);
          send('[DONE]');
          isRunning = false;
          log(`Falha em ${script}`);
          try { res.end(); } catch {}
          return;
        }
        proxima();
      });
    }

    proxima();
    return;
  }

  res.writeHead(404, CORS);
  res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  log(`NexuHunt servidor local ativo em http://localhost:${PORT}`);
  log('Aguardando comandos do relatório HTML...');
  initWaSender();
});

process.on('uncaughtException', (e) => log('Erro não tratado: ' + e.message));
