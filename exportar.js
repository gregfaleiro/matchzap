const fs = require('fs');
const path = require('path');

const dir = __dirname;
const args = process.argv.slice(2);
const modo = args.includes('--semana') ? 'semana' : 'dia';
const arquivoUltimaExportacao = path.join(dir, 'ultima_exportacao.json');

// Converte "25/06/2026, 10:32:15" → Date
function parseHora(hora) {
  if (!hora) return null;
  const [datePart, timePart] = hora.split(', ');
  if (!datePart || !timePart) return null;
  const [d, m, y] = datePart.split('/');
  return new Date(`${y}-${m}-${d}T${timePart}`);
}

// Lista todos os coleta_*.json disponíveis
const todosArquivos = fs.readdirSync(dir)
  .filter(f => /^coleta_\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .sort();

let arquivosParaProcessar;
let limiteMs;
let origemLimite;

if (modo === 'semana') {
  // Semana: últimos 7 dias, ignora histórico de exportações anteriores
  const limite7dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  arquivosParaProcessar = todosArquivos.filter(f => f.slice(7, 17) >= limite7dias);
  limiteMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  origemLimite = 'últimos 7 dias';
} else {
  // Dia: processa apenas arquivos de coleta ainda não exportados
  let arquivosJaProcessados = [];
  let ultimaMs = null;

  if (fs.existsSync(arquivoUltimaExportacao)) {
    const salvo = JSON.parse(fs.readFileSync(arquivoUltimaExportacao, 'utf8'));
    arquivosJaProcessados = salvo.arquivos || [];
    ultimaMs = salvo.ultima ? new Date(salvo.ultima).getTime() : null;
  }

  arquivosParaProcessar = todosArquivos.filter(f => !arquivosJaProcessados.includes(f));

  if (!arquivosParaProcessar.length) {
    console.log('ℹ️  Nenhum arquivo novo desde a última exportação.');
    console.log('   Rode o coletar.js primeiro para capturar novos dados.');
    process.exit(0);
  }

  // Filtra mensagens a partir do momento da última exportação (remove sobreposição do histórico 24h)
  limiteMs = ultimaMs ?? (Date.now() - 24 * 60 * 60 * 1000);
  origemLimite = ultimaMs
    ? `desde última exportação (${new Date(ultimaMs).toLocaleString('pt-BR')})`
    : 'últimas 24h (primeira exportação)';
}

if (!arquivosParaProcessar.length) {
  console.error('Nenhum arquivo de coleta encontrado para o período.');
  process.exit(1);
}

// Carrega e mescla os arquivos selecionados
const coletaMesclada = {};
for (const arquivo of arquivosParaProcessar) {
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

// Nome do arquivo de saída com timestamp
const agora = new Date();
const ts = agora.toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
const saida = path.join(dir, `exportacao_${modo}_${ts}.json`);

console.log(`⚙️  Modo       : --${modo} (${origemLimite})`);
console.log(`📂 Arquivos   : ${arquivosParaProcessar.join(', ')}`);
console.log(`📊 Mensagens  : ${totalBruto} brutas → ${totalFiltrado} após filtro e deduplicação`);
console.log('');
console.log('Por grupo:');
for (const [grupo, msgs] of Object.entries(resultado)) {
  console.log(`   ${grupo}: ${msgs.length}`);
}

fs.writeFileSync(saida, JSON.stringify(resultado, null, 2), 'utf8');
console.log(`\n💾 Salvo em: ${path.basename(saida)}`);

// Atualiza controle: marca arquivos como processados e salva timestamp
if (modo === 'dia') {
  let salvo = { arquivos: [], ultima: null };
  if (fs.existsSync(arquivoUltimaExportacao)) {
    salvo = JSON.parse(fs.readFileSync(arquivoUltimaExportacao, 'utf8'));
  }
  salvo.arquivos = [...new Set([...(salvo.arquivos || []), ...arquivosParaProcessar])];
  salvo.ultima = agora.toISOString();
  fs.writeFileSync(arquivoUltimaExportacao, JSON.stringify(salvo, null, 2), 'utf8');
  console.log(`🕐 Controle atualizado em: ultima_exportacao.json`);
}
