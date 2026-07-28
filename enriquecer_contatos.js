/**
 * enriquecer_contatos.js
 * Constrói/atualiza contatos_ricos.json a partir do inventário.
 * Fontes: campo `de` (nome salvo na agenda) + assinatura extraída do texto.
 */
const fs   = require('fs');
const path = require('path');

const ARQ_INV  = path.join(__dirname, 'inventario.json');
const ARQ_CONT = path.join(__dirname, 'contatos_ricos.json');

if (!fs.existsSync(ARQ_INV)) {
  console.error('❌ inventario.json não encontrado.');
  process.exit(1);
}

const inv = JSON.parse(fs.readFileSync(ARQ_INV, 'utf8'));
const contatos = fs.existsSync(ARQ_CONT)
  ? JSON.parse(fs.readFileSync(ARQ_CONT, 'utf8'))
  : {};

function eLid(str) {
  return /^\d{14,}$/.test(String(str || '').replace(/[^0-9]/g, ''));
}

function extrairTelDoTexto(txt) {
  const ms = txt.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)(?:9\s?)?\d{4}[\s.\-]?\d{4}/g);
  if (!ms) return '';
  for (const m of ms) {
    const d = m.replace(/[^0-9]/g, '');
    const num = (d.startsWith('55') && d.length > 11) ? d.slice(2) : d;
    if (num.length >= 10 && num.length <= 11) return num;
  }
  return '';
}

function extrairNomeDaAssinatura(txt) {
  const linhas = txt.split('\n').map(l => l.trim()).filter(Boolean);
  const ultimas = linhas.slice(-7);

  // Texto em negrito *Nome* nas últimas linhas — exclui nomes de empreendimentos e termos imobiliários
  for (const l of ultimas) {
    const m = l.match(/\*([^*\n]{3,50})\*/);
    if (m) {
      const c = m[1].trim();
      if (
        !/R\$|\d{5,}|m²|quarto|suite|suíte|setor|busco|vendo|ofert|panorâmico|elevador|garden|park|vista|home|life|residenci|towers?|plaza|square|prive|privê|ville|condomínio|cond\./i.test(c)
        && c.split(/\s+/).length >= 2
        && /[A-ZÀ-Ú][a-zà-ú]/.test(c)  // tem ao menos uma palavra com inicial maiúscula e letras minúsculas
      ) return c;
    }
  }

  // Linha que parece nome próprio (2-5 palavras capitalizadas, sem números)
  for (const l of ultimas) {
    if (/^[A-ZÀ-Ú][a-zà-ú]+(\s+[A-ZÀ-Ú][a-zà-ú]+){1,4}$/.test(l) && l.length <= 50)
      return l;
  }

  return '';
}

function extrairCreci(txt) {
  const m = txt.match(/CRECI[:\s#-]*([A-Z0-9\/\-]{4,14})/i);
  return m ? m[1].trim() : '';
}

// Agrupa mensagens por LID
const porLid = new Map();
for (const m of [...(inv.ofertas || []), ...(inv.buscas || [])]) {
  const lid = String(m.tel || '').trim();
  if (!lid) continue;
  if (!porLid.has(lid)) porLid.set(lid, { nomes: [], txts: [] });
  const entry = porLid.get(lid);
  if (m.de && !eLid(m.de)) entry.nomes.push(m.de);
  if (m.txt) entry.txts.push(m.txt);
}

let novos = 0, atualizados = 0;

for (const [lid, dados] of porLid) {
  const snapAntes = JSON.stringify(contatos[lid] || null);
  if (!contatos[lid]) contatos[lid] = {};
  const c = contatos[lid];

  // Nome da agenda — usa o mais frequente para este LID
  if (!c.nome && dados.nomes.length > 0) {
    const freq = {};
    for (const n of dados.nomes) freq[n] = (freq[n] || 0) + 1;
    c.nome = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
  }

  // Extrai de textos até ter nome, tel e CRECI
  for (const txt of dados.txts) {
    if (!c.tel)   { const t  = extrairTelDoTexto(txt);       if (t)  c.tel   = t;  }
    if (!c.nome)  { const n  = extrairNomeDaAssinatura(txt); if (n)  c.nome  = n;  }
    if (!c.creci) { const cr = extrairCreci(txt);            if (cr) c.creci = cr; }
    if (c.tel && c.nome && c.creci) break;
  }

  c.msgs = dados.txts.length;

  if (snapAntes === 'null') novos++;
  else if (snapAntes !== JSON.stringify(c)) atualizados++;
}

fs.writeFileSync(ARQ_CONT, JSON.stringify(contatos, null, 2), 'utf8');

const comNome = Object.values(contatos).filter(c => c.nome).length;
const comTel  = Object.values(contatos).filter(c => c.tel).length;
const total   = Object.keys(contatos).length;

console.log(`📇 Contatos enriquecidos:`);
console.log(`   📊 Total LIDs    : ${total}`);
console.log(`   👤 Com nome      : ${comNome} (${total ? Math.round(comNome / total * 100) : 0}%)`);
console.log(`   📞 Com telefone  : ${comTel} (${total ? Math.round(comTel / total * 100) : 0}%)`);
console.log(`   ✨ Novos         : ${novos}`);
console.log(`   🔄 Atualizados   : ${atualizados}`);
console.log(`💾 Salvo em: contatos_ricos.json`);
