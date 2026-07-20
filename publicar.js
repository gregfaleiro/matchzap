const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;

if (!fs.existsSync(path.join(dir, 'index.html'))) {
  console.error('❌ index.html não encontrado. Gere o relatório primeiro.');
  process.exit(1);
}

const agora = new Date();
const dd = String(agora.getDate()).padStart(2, '0');
const mo = String(agora.getMonth() + 1).padStart(2, '0');
const yyyy = agora.getFullYear();
const hh = String(agora.getHours()).padStart(2, '0');
const mm = String(agora.getMinutes()).padStart(2, '0');

const relatorioNome = `relatorio_${yyyy}-${mo}-${dd}_${hh}-${mm}.html`;

// Copia index.html → relatorio_*.html
fs.copyFileSync(path.join(dir, 'index.html'), path.join(dir, relatorioNome));
console.log(`✅ ${relatorioNome} salvo`);

// Conta matches no HTML para o label
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const altos = (html.match(/ALTO/g) || []).length;
const medios = (html.match(/MÉDIO/g) || []).length;
const nMatches = Math.max(1, Math.round((altos + medios) / 2));

// Atualiza historico.json (prepend)
const historicoPath = path.join(dir, 'historico.json');
const historico = fs.existsSync(historicoPath)
  ? JSON.parse(fs.readFileSync(historicoPath, 'utf8'))
  : [];

historico.unshift({
  arquivo: relatorioNome,
  label: `${dd}/${mo} · ${hh}h${mm} · ${nMatches} matches`,
});
fs.writeFileSync(historicoPath, JSON.stringify(historico, null, 2), 'utf8');
console.log(`✅ historico.json atualizado`);

// Git push
execSync(`git add index.html "${relatorioNome}" historico.json`, { stdio: 'inherit', cwd: dir });
execSync(`git commit -m "relatorio: atualiza ${dd}/${mo}/${yyyy}"`, { stdio: 'inherit', cwd: dir });
execSync('git push', { stdio: 'inherit', cwd: dir });

console.log('\n🎉 Publicado! Acesse em ~30 segundos:');

const env = fs.existsSync(path.join(dir, '.env'))
  ? Object.fromEntries(
      fs.readFileSync(path.join(dir, '.env'), 'utf8')
        .split('\n').filter(l => l.includes('='))
        .map(l => l.split('='))
    )
  : {};
console.log(`   ${env.NETLIFY_URL || 'https://venerable-figolla-8336dd.netlify.app'}\n`);
