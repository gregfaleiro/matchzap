const fs = require('fs');
const path = require('path');

// Padrões que indicam oferta ou busca de imóvel
const POSITIVOS = [
  /busco/i, /busca/i, /procuro/i, /preciso\s+de/i,
  /vendo/i, /vende/i, /[aà]\s*venda/i,
  /alugo/i, /aluga/i, /loca[çc][ãa]o/i, /aluguel/i,
  /apartamento/i, /\bapto\b/i,
  /\bcasa\b/i, /\blote\b/i, /sobrado/i, /kitnet/i,
  /cobertura/i, /\bflat\b/i, /duplex/i,
  /ch[áa]cara/i, /terreno/i, /sala\s+comercial/i,
  /im[oó]vel/i, /im[oó]veis/i,
  /su[íi]te/i, /quarto/i,
  /\bm[²2]\b/i, /metros?\s+quadrados?/i,
  /r\$\s*[\d.]/i, /[\d.]+\s*mil\b/i,
  /permuta/i, /financiamento/i, /\bfgts\b/i,
  /garagem/i, /\bvaga[s]?\b/i,
  /nascente/i, /\blazer\b/i, /piscina/i,
  /condom[íi]nio/i, /\bandar\b/i,
  /setor\s+\w/i, /jardim\s+\w/i, /parque\s+\w/i,
  // bairros comuns de Goiânia
  /\bbueno\b/i, /\bmarista\b/i, /\boeste\b/i,
  /\bgoiás\b/i, /\bgoias\b/i, /\bpalm[ae]s\b/i,
];

// Padrões que indicam conversa fora do tema
const NEGATIVOS = [
  /^bom\s+dia/i, /^boa\s+tarde/i, /^boa\s+noite/i, /^boa\s+semana/i,
  /^obrigad[oa]/i, /^valeu/i, /^grat[oa]/i, /^[👍❤️🙏✅]{1,3}$/u,
  /kkkk/i, /rsrs/i, /hahaha/i, /hauha/i,
  /^[oO]i\b/, /^[oO]lá/, /^[tT]udo\s+bem/,
  /^[pP]or\s+favor/,
];

function ehImovel(texto) {
  if (!texto || texto.trim().length < 10) return false;
  if (NEGATIVOS.some(r => r.test(texto.trim()))) return false;
  return POSITIVOS.some(r => r.test(texto));
}

const entrada = path.join(__dirname, 'hoje.json');
const saida = path.join(__dirname, 'resumo.json');

if (!fs.existsSync(entrada)) {
  console.error('hoje.json não encontrado. Execute exportar.js primeiro.');
  process.exit(1);
}

const coleta = JSON.parse(fs.readFileSync(entrada, 'utf8'));

let totalAntes = 0;
let totalDepois = 0;
const resumo = {};

for (const [grupo, mensagens] of Object.entries(coleta)) {
  totalAntes += mensagens.length;
  resumo[grupo] = mensagens.filter(m => ehImovel(m.texto));
  totalDepois += resumo[grupo].length;
}

fs.writeFileSync(saida, JSON.stringify(resumo, null, 2), 'utf8');

console.log(`📥 Mensagens lidas  : ${totalAntes}`);
console.log(`✅ Relevantes salvas: ${totalDepois}`);
console.log(`🗑️  Descartadas      : ${totalAntes - totalDepois}`);
console.log(`\n💾 Salvo em: resumo.json\n`);

for (const [grupo, msgs] of Object.entries(resumo)) {
  console.log(`   ${grupo}: ${msgs.length}`);
}
