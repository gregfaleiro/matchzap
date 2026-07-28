const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const dir  = __dirname;
const args = process.argv.slice(2);
const skipColetar = args.includes('--sem-coletar');

function cabecalho(texto) {
  console.log(`\n${'━'.repeat(45)}`);
  console.log(`  ${texto}`);
  console.log(`${'━'.repeat(45)}\n`);
}

// ── ETAPA 1: Coletar ──────────────────────────────
if (!skipColetar) {
  cabecalho('📱 Coletando mensagens do WhatsApp...');
  const coletar_args = args.includes('--com-tempo-real') ? '' : '--rapido';
  execSync(`node coletar.js ${coletar_args}`, { stdio: 'inherit', cwd: dir });
} else {
  console.log('\n⏭️  Coleta ignorada (--sem-coletar)');
}

// ── ETAPA 2: Exportar ─────────────────────────────
cabecalho('📤 Exportando mensagens novas...');
try {
  execSync('node exportar.js', { stdio: 'inherit', cwd: dir });
} catch {
  console.error('❌ Falha na exportação. Verifique os arquivos de coleta.');
  process.exit(1);
}

// ── ETAPA 3: Filtrar (classifica ofertas vs buscas) ─
cabecalho('🔀 Classificando ofertas e buscas...');
try {
  execSync('node filtrar.js', { stdio: 'inherit', cwd: dir });
} catch {
  console.error('❌ Falha ao classificar mensagens.');
  process.exit(1);
}

// ── ETAPA 4: Atualizar inventário ─────────────────
cabecalho('📦 Atualizando inventário persistente...');
try {
  execSync('node atualizar_inventario.js', { stdio: 'inherit', cwd: dir });
} catch {
  console.error('❌ Falha ao atualizar inventário.');
  process.exit(1);
}

// ── Backup OneDrive ───────────────────────────────
const ONEDRIVE_DIR  = 'C:\\Users\\User\\OneDrive\\nexuhunt';
const INVENTARIO    = path.join(dir, 'inventario.json');
const CONTATOS      = path.join(dir, 'contatos_ricos.json');
try {
  if (fs.existsSync(INVENTARIO))
    fs.copyFileSync(INVENTARIO, path.join(ONEDRIVE_DIR, 'inventario.json'));
  if (fs.existsSync(CONTATOS))
    fs.copyFileSync(CONTATOS,   path.join(ONEDRIVE_DIR, 'contatos_ricos.json'));
  console.log('☁️  Backup OneDrive: inventario.json + contatos_ricos.json');
} catch (e) {
  console.warn('⚠️  Backup OneDrive falhou (não crítico):', e.message);
}

// ── ETAPA 4b: Enriquecer contatos ────────────────
cabecalho('📇 Enriquecendo contatos...');
try {
  execSync('node enriquecer_contatos.js', { stdio: 'inherit', cwd: dir });
} catch {
  console.warn('⚠️  Enriquecimento de contatos falhou (não crítico).');
}

// ── ETAPA 5: Gerar relatório ──────────────────────
cabecalho('📊 Gerando relatório HTML...');
try {
  execSync('node gerar_relatorio.js', { stdio: 'inherit', cwd: dir });
} catch {
  console.error('❌ Falha ao gerar relatório.');
  process.exit(1);
}

// ── Resumo ────────────────────────────────────────
const inv = JSON.parse(fs.readFileSync(path.join(dir, 'inventario.json'), 'utf8'));
console.log('\n' + '━'.repeat(45));
console.log('  ✅ Fluxo completo!');
console.log('━'.repeat(45));
console.log(`\n📊 Inventário: ${inv.ofertas.length} ofertas | ${inv.buscas.length} buscas`);
console.log('💡 Rode "node publicar.js" para publicar na nuvem\n');
