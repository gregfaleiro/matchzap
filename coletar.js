const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

const arquivo = `coleta_${new Date().toISOString().slice(0, 10)}.json`;

// Grupos e coleta são populados dinamicamente após conexão
let GRUPOS = [];
let IDS_GRUPOS = [];
let coleta = {};

if (fs.existsSync(arquivo)) {
  coleta = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  console.log(`📂 Continuando coleta do dia: ${arquivo}`);
}

let salvarTimer = null;
function salvar() {
  clearTimeout(salvarTimer);
  salvarTimer = setTimeout(() => {
    fs.writeFile(arquivo, JSON.stringify(coleta, null, 2), 'utf8', (err) => {
      if (err) console.error('Erro ao salvar:', err.message);
    });
  }, 500);
}

function nomeGrupo(id) {
  return GRUPOS.find(g => g.id === id)?.nome || id;
}

function chave(entrada) {
  return `${entrada.hora}|${entrada.de}|${entrada.texto}`;
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
// Contatos
// ---------------------------------------------------------------------------

function formatarTelefone(numero) {
  const digits = (numero || '').replace(/\D/g, '');
  if (!digits) return '';
  const local = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  const ddd = local.slice(0, 2);
  const num = local.slice(2);
  if (num.length === 9) return `(${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`;
  if (num.length === 8) return `(${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`;
  return digits;
}

const contatoCache = new Map();

async function resolverContato(authorId) {
  if (!authorId) return { nome: 'desconhecido', telefone: '' };
  if (contatoCache.has(authorId)) return contatoCache.get(authorId);
  try {
    const contato = await client.getContactById(authorId);
    const nome = contato.pushname || contato.name || contato.shortName || authorId;
    const telefone = formatarTelefone(contato.number || contato.id?.user || '');
    const info = { nome, telefone };
    contatoCache.set(authorId, info);
    return info;
  } catch {
    return { nome: authorId, telefone: '' };
  }
}

// ---------------------------------------------------------------------------
// Descoberta dinâmica de grupos
// ---------------------------------------------------------------------------

async function inicializarGrupos() {
  console.log('🔍 Buscando grupos participantes...\n');

  const ignorados = new Set();
  if (fs.existsSync('grupos_ignorados.json')) {
    const ids = JSON.parse(fs.readFileSync('grupos_ignorados.json', 'utf8'));
    ids.forEach(id => ignorados.add(id));
    console.log(`🚫 Ignorando ${ignorados.size} grupo(s) listado(s) em grupos_ignorados.json`);
  }

  const todos = await client.groupFetchAllParticipating();

  GRUPOS = Object.values(todos)
    .filter(g => !ignorados.has(g.id._serialized))
    .map(g => ({ nome: g.name, id: g.id._serialized }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  IDS_GRUPOS = GRUPOS.map(g => g.id);

  // Garante entrada no coleta para cada grupo descoberto
  GRUPOS.forEach(g => {
    if (!coleta[g.nome]) coleta[g.nome] = [];
  });

  fs.writeFileSync('grupos.json', JSON.stringify(GRUPOS, null, 2), 'utf8');

  console.log(`📋 ${GRUPOS.length} grupo(s) encontrado(s) — lista salva em grupos.json:\n`);
  GRUPOS.forEach(g => console.log(`   • ${g.nome}`));
  console.log('');
}

// ---------------------------------------------------------------------------
// Ciclo de vida
// ---------------------------------------------------------------------------

const DURACAO_MS = 10 * 60 * 1000;

function encerrar() {
  console.log('\n⏱️  10 minutos encerrados. Salvando e encerrando...\n');
  clearTimeout(salvarTimer);
  fs.writeFileSync(arquivo, JSON.stringify(coleta, null, 2), 'utf8');

  console.log('📊 Resumo da coleta:');
  GRUPOS.forEach(g => {
    const total = (coleta[g.nome] || []).length;
    console.log(`   ${g.nome}: ${total} mensagem(ns)`);
  });
  console.log(`\n💾 Arquivo salvo: ${arquivo}`);

  client.destroy().finally(() => process.exit(0));
}

async function buscarHistorico() {
  const limite24h = Date.now() - 24 * 60 * 60 * 1000;
  let totalGeral = 0;

  console.log('📥 Buscando histórico das últimas 24h...\n');

  for (const grupo of GRUPOS) {
    try {
      const chat = await client.getChatById(grupo.id);
      const msgs = await chat.fetchMessages({ limit: 500 });

      const validas = msgs.filter(msg =>
        !msg.fromMe &&
        (msg.body || '').trim() &&
        msg.timestamp * 1000 >= limite24h
      );

      const idsUnicos = [...new Set(validas.map(m => m.author || m._data?.author).filter(Boolean))];
      await Promise.all(idsUnicos.map(id => resolverContato(id)));

      const existentes = new Set(coleta[grupo.nome].map(chave));
      let adicionadas = 0;

      for (const msg of validas) {
        const authorId = msg.author || msg._data?.author;
        const { nome, telefone } = await resolverContato(authorId);
        const texto = (msg.body || '').trim();
        const hora = new Date(msg.timestamp * 1000).toLocaleString('pt-BR');
        const empreendimento = extrairEmpreendimento(texto);
        const entrada = { de: nome, telefone, texto, hora, empreendimento, grupo: grupo.nome };

        if (existentes.has(chave(entrada))) continue;
        coleta[grupo.nome].push(entrada);
        existentes.add(chave(entrada));
        adicionadas++;
        totalGeral++;
      }

      console.log(`   ${grupo.nome}: ${adicionadas} mensagem(ns) do histórico`);
    } catch (err) {
      console.error(`   ✗ Erro em ${grupo.nome}: ${err.message}`);
    }
  }

  if (totalGeral > 0) salvar();
  console.log(`\n📦 Total do histórico carregado: ${totalGeral} mensagem(ns)\n`);
}

// ---------------------------------------------------------------------------
// Cliente WhatsApp
// ---------------------------------------------------------------------------

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: 'sessao' }),
  takeoverOnConflict: true,
  takeoverTimeoutMs: 10000,
  puppeteer: {
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

client.on('qr', (qr) => {
  console.log('\n📱 Escaneie o QR code com o WhatsApp do número dedicado:\n');
  qrcode.generate(qr, { small: true });
});

client.on('loading_screen', (percent, message) => {
  console.log(`⏳ Carregando... ${percent}% — ${message}`);
});

client.on('authenticated', () => console.log('🔑 Autenticado.'));

client.on('auth_failure', (msg) => {
  console.error('❌ Falha de autenticação:', msg);
  process.exit(1);
});

client.on('ready', async () => {
  console.log('✅ Conectado.\n');
  await inicializarGrupos();
  await buscarHistorico();
  console.log('👂 Capturando mensagens em tempo real por 10 minutos...\n');
  setTimeout(encerrar, DURACAO_MS);
});

client.on('disconnected', (reason) => {
  console.log(`❌ Desconectado: ${reason}. Reiniciando...`);
  client.initialize();
});

client.on('message', async (msg) => {
  if (!IDS_GRUPOS.includes(msg.from)) return;
  if (msg.fromMe) return;

  const texto = (msg.body || '').trim();
  if (!texto) return;

  const authorId = msg.author || msg._data?.author;
  const { nome, telefone } = await resolverContato(authorId);
  const hora = new Date(msg.timestamp * 1000).toLocaleString('pt-BR');
  const nomeGrupoStr = nomeGrupo(msg.from);
  const empreendimento = extrairEmpreendimento(texto);
  const entrada = { de: nome, telefone, texto, hora, empreendimento, grupo: nomeGrupoStr };

  coleta[nomeGrupoStr].push(entrada);
  salvar();

  console.log(`[${nomeGrupoStr}] ${nome}: ${texto.slice(0, 80)}`);
});

client.initialize();
