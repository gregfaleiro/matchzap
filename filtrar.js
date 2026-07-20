/**
 * filtrar.js
 * Lê o exportacao_dia_*.json mais recente, classifica mensagens em
 * ofertas/buscas e salva filtrado_dia.json.
 */
const fs   = require('fs');
const path = require('path');

const dir = __dirname;

// Pega o exportacao mais recente
const exportacoes = fs.readdirSync(dir)
  .filter(f => /^exportacao_dia_.*\.json$/.test(f))
  .sort()
  .reverse();

if (!exportacoes.length) {
  console.error('❌ Nenhum arquivo exportacao_dia_*.json encontrado. Rode exportar.js primeiro.');
  process.exit(1);
}

const arquivo = exportacoes[0];
console.log(`📂 Processando: ${arquivo}`);

const dados = JSON.parse(fs.readFileSync(path.join(dir, arquivo), 'utf8'));

// ── Classificação oferta vs busca ──────────────────────────────────────────

// Grupos cujo propósito é exclusivamente receber buscas de compradores
function ehGrupoBusca(grupo) {
  return /^BUSCA[S]?\b|^BUSQUE\b/i.test(grupo || '');
}

// Só captura intenção explícita de busca (1ª pessoa ou intermediário com cliente)
// Evita falsos positivos como "busca" / "procura" em textos de oferta
function ehBuscaPorTexto(txt) {
  return /\bbusco\b|\bprocuro\b|\bpreciso\b|\bquero\s+comprar\b|\bquero\s+alugar\b|\btenho\s+cliente\b|\bcliente\s+busca\b|\bcliente[as]?\s+quer\b|\bcliente[as]?\s+procura\b/i.test(txt);
}

const ofertas = [];
const buscas  = [];
let ignoradas = 0;

for (const [grupo, mensagens] of Object.entries(dados)) {
  for (const m of mensagens) {
    const txt = (m.texto || '').trim();
    if (!txt || txt.length < 10) { ignoradas++; continue; }

    const item = {
      de:  m.de  || '',
      tel: m.telefone || '',
      emp: m.empreendimento || '',
      txt,
      hora: m.hora || '',
      g:   grupo,
    };

    if (ehGrupoBusca(grupo) || ehBuscaPorTexto(txt)) buscas.push(item);
    else                                               ofertas.push(item);
  }
}

const saida = { ofertas, buscas };
fs.writeFileSync(path.join(dir, 'filtrado_dia.json'), JSON.stringify(saida, null, 2), 'utf8');

console.log(`✅ Classificação concluída:`);
console.log(`   🏠 Ofertas : ${ofertas.length}`);
console.log(`   🔍 Buscas  : ${buscas.length}`);
if (ignoradas) console.log(`   ⏭️  Ignoradas: ${ignoradas} (curtas/vazias)`);
console.log(`💾 Salvo em: filtrado_dia.json`);
