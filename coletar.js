const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const { exec } = require('child_process');
const fs = require('fs');

const arquivo = `coleta_${new Date().toISOString().slice(0, 10)}.json`;
const arquivoUltimaColeta = 'ultima_coleta.json';

// Determina limite de tempo
let limiteColeta;
let origemLimite;
if (fs.existsSync(arquivoUltimaColeta)) {
  const { ultima } = JSON.parse(fs.readFileSync(arquivoUltimaColeta, 'utf8'));
  const ultimaMs = new Date(ultima).getTime();
  const sete_dias_ms = Date.now() - 7 * 24 * 60 * 60 * 1000;
  limiteColeta = Math.max(ultimaMs, sete_dias_ms);
  origemLimite = limiteColeta === sete_dias_ms
    ? 'últimos 7 dias (cap automático)'
    : `desde última coleta (${new Date(ultima).toLocaleString('pt-BR')})`;
} else {
  limiteColeta = Date.now() - 7 * 24 * 60 * 60 * 1000;
  origemLimite = 'últimos 7 dias (primeira coleta)';
}

// Carrega coleta existente do dia ou começa do zero
let coleta = {};
if (fs.existsSync(arquivo)) {
  coleta = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  console.log(`📂 Continuando coleta do dia: ${arquivo}`);
}

// ---------------------------------------------------------------------------
// Extração de empreendimento
// ---------------------------------------------------------------------------

const PALAVRAS_ACAO = new Set([
  'BUSCO','BUSCA','BUSCAR','VENDO','VENDE','VENDA','VENDENDO',
  'ALUGO','ALUGA','ALUGUEL','PROCURO','PRECISO','DISPONÍVEL','DISPONIVEL',
  'IMÓVEL','IMOVEL','APARTAMENTO','APTO','CASA','LOTE','TERRENO',
  'OI','OLÁ','OLA','BOM','BOA','ÓTIMO','URGENTE','ATENÇÃO','ATENCAO',
  'ATÉ','ATE','DE','DO','DA','EM','NO','NA','POR','COM',
]);

const FRASES_ACAO = [
  /^busco/i, /^vendo/i, /^alugo/i, /^procuro/i, /^preciso/i,
  /^disponív/i, /^até\s+\d/i, /^de\s+\d/i, /^r\$\s*\d/i,
  /imóvel\s+(pronto|à\s+venda|para)/i,
];

function pareceNomeEmpreendimento(texto) {
  if (!texto || texto.trim().length < 4) return false;
  if (FRASES_ACAO.some(r => r.test(texto.trim()))) return false;
  const primeira = texto.trim().split(/\s+/)[0].toUpperCase().replace(/[^A-ZÁÉÍÓÚÂÊÎÔÛÃÕ]/g, '');
  return !PALAVRAS_ACAO.has(primeira);
}

function extrairEmpreendimento(texto) {
  if (!texto) return null;
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);

  for (const linha of linhas.slice(0, 5)) {
    const m = linha.match(/^\*([^*]{4,60})\*$/);
    if (m) {
      const c = m[1].trim();
      if (PALAVRAS_ACAO.has(c.replace(/\s/g, '').toUpperCase())) continue;
      if (c.split(/\s+/).length <= 7 && pareceNomeEmpreendimento(c)) return c;
    }
  }

  const mPrefixo = texto.match(
    /\b(Residencial|Edif[íi]cio|Condom[íi]nio|Ed\.|Cond\.|Village|Garden|Palace|Park)\s+([A-ZÀ-Ú][A-Za-zÀ-úçãõêâôî '\-]{2,50})/
  );
  if (mPrefixo) {
    const nome = `${mPrefixo[1]} ${mPrefixo[2]}`.split(/[\n\r]/)[0].replace(/\s{2,}/g, ' ').trim();
    if (nome.split(/\s+/).length <= 8) return nome;
  }

  const mAsterisco = texto.match(/\*([A-ZÁÉÍÓÚÂÊÎÔÛÃÕ][A-Za-zÀ-úçãõêâôî\s'\-]{3,55})\*/);
  if (mAsterisco) {
    const c = mAsterisco[1].trim();
    const palavras = c.split(/\s+/);
    if (palavras.length >= 2 && palavras.length <= 6 && !PALAVRAS_ACAO.has(palavras[0].toUpperCase()) && pareceNomeEmpreendimento(c)) return c;
  }

  const semEmoji = (linhas[0] || '').replace(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, '').replace(/[*_~🚨⚠️❗️]/g, '').trim();
  const tokens = semEmoji.split(/[\s\-\/|,]+/).filter(p => p.length > 2);
  const emCaps = tokens.filter(p => p === p.toUpperCase() && /[A-ZÁÉÍÓÚÂÊÎÔÛÃÕ]/.test(p));
  if (emCaps.length >= 2 && emCaps.length <= 5 && emCaps.length === tokens.length && !PALAVRAS_ACAO.has(emCaps[0])) {
    return emCaps.join(' ');
  }

  return null;
}

// ---------------------------------------------------------------------------
// Processamento de mensagem
// ---------------------------------------------------------------------------

const vistos = new Set();

function processarMensagem(msg, nomeGrupo) {
  const texto = msg.body;
  if (!texto || texto.trim().length < 5) return;
  if (msg.fromMe) return;

  const ts = msg.timestamp * 1000;
  if (!ts || ts < limiteColeta) return;

  const hora = new Date(ts).toLocaleString('pt-BR');
  const de = msg._data?.notifyName || msg._data?.notify || msg.author?.split('@')[0] || 'Desconhecido';
  const telefone = msg.author?.split('@')[0] || '';
  const empreendimento = extrairEmpreendimento(texto.trim());

  const chave = `${hora}|${de}|${texto.trim()}`;
  if (vistos.has(chave)) return;
  vistos.add(chave);

  if (!coleta[nomeGrupo]) coleta[nomeGrupo] = [];
  coleta[nomeGrupo].push({ de, telefone, texto: texto.trim(), hora, empreendimento, grupo: nomeGrupo });
}

// ---------------------------------------------------------------------------
// Salvar e encerrar
// ---------------------------------------------------------------------------

function encerrar() {
  console.log('\n✅ Coleta concluída. Salvando...\n');
  fs.writeFileSync(arquivo, JSON.stringify(coleta, null, 2), 'utf8');

  const total = Object.values(coleta).reduce((s, m) => s + m.length, 0);
  console.log('📊 Resumo da coleta:');
  for (const [grupo, msgs] of Object.entries(coleta)) {
    if (msgs.length > 0) console.log(`   ${grupo}: ${msgs.length} mensagem(ns)`);
  }
  console.log(`\n📦 Total: ${total} mensagem(ns)`);
  console.log(`💾 Arquivo salvo: ${arquivo}`);

  fs.writeFileSync(arquivoUltimaColeta, JSON.stringify({ ultima: new Date().toISOString() }, null, 2), 'utf8');
  console.log(`🕐 Referência salva em: ${arquivoUltimaColeta}`);
}

// ---------------------------------------------------------------------------
// Cliente WhatsApp Web
// ---------------------------------------------------------------------------

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: 'sessao_wweb' }),
  puppeteer: {
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  }
});

client.on('qr', async (qr) => {
  await QRCode.toFile('qr_matchzap.png', qr, { width: 400, margin: 2 });
  console.log('\n📱 Escaneie qr_matchzap.png com o WhatsApp do MatchZap\n');
  exec('start qr_matchzap.png');
});

client.on('authenticated', () => console.log('🔑 Autenticado.'));

let jaColetou = false;

client.on('ready', async () => {
  if (jaColetou) return; // impede re-fetch em reconexão automática
  jaColetou = true;
  console.log('✅ Conectado.\n');
  console.log(`⏱️  Período: ${origemLimite}\n`);

  // Descobre grupos
  console.log('🔍 Buscando grupos participantes...\n');
  const chats = await client.getChats();
  const grupos = chats.filter(c => c.isGroup);

  const groupList = grupos
    .map(g => ({ id: g.id._serialized, nome: g.name }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  fs.writeFileSync('grupos.json', JSON.stringify(groupList, null, 2), 'utf8');

  console.log(`📋 ${grupos.length} grupo(s) encontrado(s):\n`);
  grupos.forEach(g => console.log(`   • ${g.name}`));
  console.log('');

  // Busca histórico de cada grupo
  console.log('📚 Buscando histórico de mensagens...\n');
  for (const grupo of grupos) {
    process.stdout.write(`   ⬇️  ${grupo.name}... `);
    try {
      const msgs = await grupo.fetchMessages({ limit: 1000 });
      for (const msg of msgs) {
        processarMensagem(msg, grupo.name);
      }
      const count = coleta[grupo.name]?.length || 0;
      console.log(`${count} mensagem(ns) no período`);
    } catch (e) {
      console.log(`⚠️  Erro: ${e.message}`);
    }
  }

  // Fase de tempo real: 10 minutos
  console.log('\n⏳ Aguardando 10 minutos para mensagens em tempo real...\n');
  setTimeout(async () => {
    encerrar();
    await client.destroy();
    process.exit(0);
  }, 10 * 60 * 1000);
});

// Mensagens em tempo real
client.on('message', async (msg) => {
  if (!msg.from.endsWith('@g.us')) return;
  try {
    const chat = await msg.getChat();
    processarMensagem(msg, chat.name);
  } catch {}
});

client.on('auth_failure', (msg) => {
  console.error('❌ Auth failure:', msg);
  process.exit(1);
});

client.on('disconnected', async (reason) => {
  if (reason === 'LOGOUT') {
    console.error('\n❌ Sessão expirada. Apague a pasta sessao_wweb e escaneie o QR code.');
    process.exit(1);
  }
});

client.initialize().catch(e => {
  console.error('❌ Erro:', e.message);
  process.exit(1);
});

// Timeout de segurança: 1 hora
setTimeout(() => {
  console.log('\n⚠️  Timeout máximo atingido. Encerrando...');
  encerrar();
  process.exit(0);
}, 60 * 60 * 1000);
