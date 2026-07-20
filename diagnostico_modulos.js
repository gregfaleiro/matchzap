/**
 * Verifica o que aconteceu com os módulos que o WhatsApp renomeou.
 * Gera QR para nova sessão, inspeciona e encerra de forma limpa.
 */
const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const { exec } = require('child_process');
const fs = require('fs');

// Limpa sessão anterior
try { fs.rmSync('.wweb_diagnostics', { recursive: true, force: true }); } catch {}

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: '.wweb_diagnostics' }),
  puppeteer: {
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  }
});

client.on('qr', async (qr) => {
  await QRCode.toFile('qr_diagnostico.png', qr, { width: 400 });
  exec('start qr_diagnostico.png');
  console.log('📱 Escaneie qr_diagnostico.png com o WhatsApp do MatchZap\n');
});

client.on('authenticated', () => console.log('✅ Autenticado\n'));

client.on('ready', async () => {
  console.log('🔍 Inspecionando módulos...\n');

  const resultado = await client.pupPage.evaluate(() => {
    const out = {};

    // 1. Verifica os módulos problemáticos diretamente
    const alvo = [
      'WAWebCollections',
      'WAWebFindChatAction',
      'WAWebChatLoadMessages',
      'WAWebFindChatByIdAction',
    ];

    alvo.forEach(nome => {
      try {
        const m = window.require(nome);
        out[nome] = m ? { ok: true, props: Object.keys(m).slice(0, 20) } : { ok: false, valor: String(m) };
      } catch (e) {
        out[nome] = { ok: false, erro: e.message };
      }
    });

    // 2. Busca módulos WAWeb* que existem agora (lista completa de módulos com prefixo WAWeb)
    const todos = Object.keys(window.require.m || {});
    out._totalModulos = todos.length;
    out._modulosWAWeb = todos.filter(k => k.startsWith('WAWeb')).slice(0, 100);

    // 3. Busca dinâmica: encontra módulo com Chat+Msg (qualquer estrutura)
    out._candidatosChat = [];
    for (const key of todos) {
      try {
        const m = window.require(key);
        if (!m || typeof m !== 'object') continue;
        // Verifica direto e via .default
        const obj = m.Chat ? m : (m.default?.Chat ? m.default : null);
        if (obj && obj.Chat && obj.Msg) {
          out._candidatosChat.push({ key, props: Object.keys(obj).slice(0, 15) });
          if (out._candidatosChat.length >= 5) break;
        }
      } catch {}
    }

    return out;
  });

  console.log('=== MÓDULOS PROBLEMÁTICOS ===');
  ['WAWebCollections', 'WAWebFindChatAction', 'WAWebChatLoadMessages'].forEach(n => {
    const r = resultado[n];
    if (r?.ok) {
      console.log(`✅ ${n}: EXISTE → props: ${r.props?.join(', ')}`);
    } else {
      console.log(`❌ ${n}: NÃO EXISTE (${r?.erro || r?.valor})`);
    }
  });

  console.log(`\n=== MÓDULOS WAWeb* ATIVOS (${resultado._modulosWAWeb?.length} de ${resultado._totalModulos} total) ===`);
  (resultado._modulosWAWeb || []).slice(0, 30).forEach(m => console.log(`  ${m}`));

  console.log('\n=== CANDIDATOS PARA Chat+Msg ===');
  if (resultado._candidatosChat?.length) {
    resultado._candidatosChat.forEach(c => console.log(`  "${c.key}" → ${c.props?.join(', ')}`));
  } else {
    console.log('  Nenhum encontrado com busca direta');
  }

  fs.writeFileSync('modulos_diagnostico.json', JSON.stringify(resultado, null, 2));
  console.log('\n💾 Salvo em modulos_diagnostico.json');

  // Encerra de forma limpa (preserva sessão)
  await client.destroy();
  process.exit(0);
});

client.on('auth_failure', (msg) => { console.error('Auth failure:', msg); process.exit(1); });
client.initialize().catch(e => { console.error('Erro:', e.message); process.exit(1); });
setTimeout(() => { console.log('Timeout'); process.exit(0); }, 4 * 60 * 1000);
