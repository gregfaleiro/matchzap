/**
 * notificar.js
 * Envia mensagem WhatsApp para o número em .env (NEXUHUNT_NOTIF_TEL).
 * Configure: NEXUHUNT_NOTIF_TEL=5562XXXXXXXXX  (com DDD, sem +)
 */
const { Client, LocalAuth } = require('whatsapp-web.js');
const fs   = require('fs');
const path = require('path');
require('dotenv').config();

const dir = __dirname;

function lerEnv() {
  const p = path.join(dir, '.env');
  if (!fs.existsSync(p)) return '';
  const m = fs.readFileSync(p, 'utf8').match(/NEXUHUNT_NOTIF_TEL\s*=\s*([0-9]+)/);
  return m ? m[1] : '';
}

const tel = lerEnv();
if (!tel) {
  console.log('⏭️  Notificação desativada. Adicione NEXUHUNT_NOTIF_TEL=5562XXXXXXXXX em .env');
  process.exit(0);
}

function montarMensagem() {
  let ofertas = 0, buscas = 0, matchesLabel = '';
  try {
    const inv = JSON.parse(fs.readFileSync(path.join(dir, 'inventario.json'), 'utf8'));
    ofertas = inv.ofertas.length;
    buscas  = inv.buscas.length;
  } catch {}
  try {
    const hist = JSON.parse(fs.readFileSync(path.join(dir, 'historico.json'), 'utf8'));
    if (hist[0]?.label) matchesLabel = hist[0].label;
  } catch {}

  const hora = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return `✅ *NexuHunt* — ${hora}\n\n` +
    `📊 ${ofertas} ofertas · ${buscas} buscas\n` +
    (matchesLabel ? `🎯 ${matchesLabel}\n` : '') +
    `🔗 https://gregfaleiro.github.io/matchzap/`;
}

const chatId  = tel + '@c.us';
const mensagem = montarMensagem();

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: 'sessao_servidor', clientId: 'nexu-sender' }),
  puppeteer: {
    headless: true,
    executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  },
});

client.on('ready', async () => {
  try {
    await client.sendMessage(chatId, mensagem);
    console.log(`✅ Notificação enviada para ${tel}`);
  } catch (e) {
    console.log('⚠️  Erro ao enviar mensagem:', e.message);
  }
  await client.destroy();
  process.exit(0);
});

client.on('auth_failure', () => {
  console.log('⚠️  Sessão expirada — notificação não enviada');
  process.exit(0);
});

client.on('disconnected', () => {
  console.log('⚠️  Desconectado — notificação não enviada');
  process.exit(0);
});

setTimeout(() => {
  console.log('⚠️  Timeout (90s) — notificação não enviada');
  client.destroy().catch(() => {}).finally(() => process.exit(0));
}, 90 * 1000);

client.initialize().catch((e) => {
  console.log('⚠️  Falha ao inicializar:', e.message);
  process.exit(0);
});
