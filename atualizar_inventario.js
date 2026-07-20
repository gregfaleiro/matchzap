/**
 * atualizar_inventario.js
 * Merge filtrado_dia.json → inventario.json
 *   - Deuplica por (telefone || nome) + primeiros 150 chars do texto
 *   - Incrementa contagem quando a mesma mensagem reaparece
 *   - Expira entradas com mais de 15 dias sem reaparecer
 */
const fs   = require('fs');
const path = require('path');

const DIAS_EXPIRACAO  = 15;
const ARQUIVO_INV     = path.join(__dirname, 'inventario.json');
const ARQUIVO_FILTRADO = path.join(__dirname, 'filtrado_dia.json');

if (!fs.existsSync(ARQUIVO_FILTRADO)) {
  console.error('❌ filtrado_dia.json não encontrado. Rode filtrar.js primeiro.');
  process.exit(1);
}

// Carrega inventário existente (ou começa do zero)
let inv = { ofertas: [], buscas: [] };
if (fs.existsSync(ARQUIVO_INV)) {
  inv = JSON.parse(fs.readFileSync(ARQUIVO_INV, 'utf8'));
  // Garante campos obrigatórios em registros antigos sem metadados
  for (const cat of [inv.ofertas, inv.buscas]) {
    for (const m of cat) {
      if (!m.primeiraVez) m.primeiraVez = m.hora || new Date().toISOString();
      if (!m.ultimaVez)   m.ultimaVez   = m.primeiraVez;
      if (!m.contagem)    m.contagem    = 1;
    }
  }
}

// Carrega coleta classificada do dia
const filtrado = JSON.parse(fs.readFileSync(ARQUIVO_FILTRADO, 'utf8'));

const agora      = new Date().toISOString();
const limite15d  = Date.now() - DIAS_EXPIRACAO * 24 * 60 * 60 * 1000;

let adicionados = 0, atualizados = 0, expirados = 0;

// Chave de deduplicação: identidade + conteúdo da mensagem
function chaveDedup(msg) {
  const id  = (msg.tel || msg.de || '').trim();
  const txt = (msg.txt || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 150);
  return id + '||' + txt;
}

function mergeCat(existentes, novos) {
  // Indexa inventário por chave
  const idx = new Map();
  for (const m of existentes) {
    idx.set(chaveDedup(m), m);
  }

  // Processa novos
  for (const msg of novos) {
    const chave = chaveDedup(msg);
    if (idx.has(chave)) {
      const ex = idx.get(chave);
      ex.ultimaVez = agora;
      ex.contagem  = (ex.contagem || 1) + 1;
      // Atualiza empreendimento se agora foi detectado e antes não havia
      if (!ex.emp && msg.emp) ex.emp = msg.emp;
      atualizados++;
    } else {
      idx.set(chave, {
        ...msg,
        primeiraVez: agora,
        ultimaVez:   agora,
        contagem:    1,
      });
      adicionados++;
    }
  }

  // Remove expirados e ordena por ultimaVez desc (mais recentes primeiro)
  const resultado = [];
  for (const m of idx.values()) {
    const ts = new Date(m.ultimaVez).getTime();
    if (ts < limite15d) { expirados++; }
    else resultado.push(m);
  }
  resultado.sort((a, b) => new Date(b.ultimaVez) - new Date(a.ultimaVez));
  return resultado;
}

inv.ofertas = mergeCat(inv.ofertas || [], filtrado.ofertas || []);
inv.buscas  = mergeCat(inv.buscas  || [], filtrado.buscas  || []);
inv.atualizadoEm = agora;

fs.writeFileSync(ARQUIVO_INV, JSON.stringify(inv, null, 2), 'utf8');

console.log(`📦 Inventário atualizado:`);
console.log(`   ✅ Novos       : ${adicionados}`);
console.log(`   🔄 Atualizados : ${atualizados}`);
console.log(`   🗑️  Expirados   : ${expirados} (> ${DIAS_EXPIRACAO} dias)`);
console.log(`   📊 Total       : ${inv.ofertas.length} ofertas | ${inv.buscas.length} buscas`);
console.log(`💾 Salvo em: inventario.json`);
