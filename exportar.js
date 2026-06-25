const fs = require('fs');
const path = require('path');

const dir = __dirname;
const args = process.argv.slice(2);
const modo = args.includes('--semana') ? 'semana' : 'dia';
const diasJanela = modo === 'semana' ? 7 : 1;

// Gera lista de datas esperadas (YYYY-MM-DD) dos últimos N dias
function datasEsperadas(n) {
  const datas = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    datas.push(d.toISOString().slice(0, 10));
  }
  return datas;
}

// Converte "25/06/2026, 10:32:15" → Date
function parseHora(hora) {
  if (!hora) return null;
  const [datePart, timePart] = hora.split(', ');
  if (!datePart || !timePart) return null;
  const [d, m, y] = datePart.split('/');
  return new Date(`${y}-${m}-${d}T${timePart}`);
}

const limiteMs = Date.now() - diasJanela * 24 * 60 * 60 * 1000;

const datas = datasEsperadas(diasJanela);
const arquivosEsperados = datas.map(d => `coleta_${d}.json`);
const arquivosExistentes = arquivosEsperados.filter(f => fs.existsSync(path.join(dir, f)));
const arquivosFaltando  = arquivosEsperados.filter(f => !fs.existsSync(path.join(dir, f)));

if (!arquivosExistentes.length) {
  console.error('Nenhum arquivo de coleta encontrado para o período.');
  process.exit(1);
}

// Carrega e mescla todos os arquivos disponíveis
const coletaMesclada = {};
for (const arquivo of arquivosExistentes) {
  const dados = JSON.parse(fs.readFileSync(path.join(dir, arquivo), 'utf8'));
  for (const [grupo, mensagens] of Object.entries(dados)) {
    if (!coletaMesclada[grupo]) coletaMesclada[grupo] = [];
    coletaMesclada[grupo].push(...mensagens);
  }
}

// Filtra por janela de tempo e remove duplicatas por hora+texto
let totalBruto = 0;
let totalFiltrado = 0;
const resultado = {};

for (const [grupo, mensagens] of Object.entries(coletaMesclada)) {
  totalBruto += mensagens.length;
  const vistas = new Set();
  resultado[grupo] = mensagens.filter(m => {
    const ts = parseHora(m.hora);
    if (!ts || ts.getTime() < limiteMs) return false;
    const chave = `${m.hora}|${m.texto}`;
    if (vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });
  totalFiltrado += resultado[grupo].length;
}

// Cabeçalho (stderr para não poluir o JSON no stdout)
const label = modo === 'semana' ? 'últimos 7 dias' : 'últimas 24h';
console.error(`⚙️  Modo       : --${modo} (${label})`);
console.error(`📂 Arquivos   : ${arquivosExistentes.join(', ')}`);
if (arquivosFaltando.length) {
  console.error(`⚠️  Sem dados  : ${arquivosFaltando.join(', ')} (coletar.js não estava rodando)`);
}
console.error(`📊 Mensagens  : ${totalBruto} brutas → ${totalFiltrado} após filtro e deduplicação`);
console.error('');
console.error('Por grupo:');
for (const [grupo, msgs] of Object.entries(resultado)) {
  console.error(`   ${grupo}: ${msgs.length}`);
}
console.error('');

console.log(JSON.stringify(resultado, null, 2));
