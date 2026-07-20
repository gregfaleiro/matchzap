/**
 * Lê filtrado_dia.json, cruza matches e gera index.html
 */
const fs = require('fs');
const path = require('path');

// ── Carrega dados ──────────────────────────────────────────────────────────
// Prefere inventario.json (banco persistente); cai em filtrado_dia.json se ainda não existir
const arquivoDados = fs.existsSync('inventario.json') ? 'inventario.json' : 'filtrado_dia.json';
const dadosCarregados = JSON.parse(fs.readFileSync(arquivoDados, 'utf8'));
const ofertas = dadosCarregados.ofertas || [];
const buscas  = dadosCarregados.buscas  || [];
console.log(`📊 Fonte: ${arquivoDados} — Ofertas: ${ofertas.length} | Buscas: ${buscas.length}`);

// ── Helpers de extração ────────────────────────────────────────────────────

const SETORES_GO = [
  'Bueno','Marista','Jardins','Jardim Goiás','Serrinha',
  'Setor Oeste','Setor Sul','Setor Bueno','Setor Marista','Setor Leste','Setor Norte',
  'Alphaville','Negrão de Lima','Faiçalville','Jardim Europa','Jardim Planalto',
  'Parque Amazônia','Goiânia 2','Aparecida','Trindade','Olímpico',
  'Vila Rosa','Portal do Sol','Garavelo','Cidade Jardim','Bandeirantes','Crimeia',
  'Setor Pedro Ludovico','Aeroviário','Jardim Novo Mundo','Coimbra','Alto da Glória',
  'Jardim América','Universitário','Rodoviário','Jardim Petrópolis','Jardim das Esmeraldas',
  'Noroeste','Sudoeste','Sudeste','Nordeste','Mendanha','Centro','Bougainville','Vaca Brava',
];

// Retorna TODOS os setores mencionados (OR logic)
function extrairSetores(txt) {
  const found = [];
  const tl = txt.toLowerCase();
  for (const s of SETORES_GO) {
    if (tl.includes(s.toLowerCase()) && !found.includes(s)) found.push(s);
  }
  // fallback: "Setor Xpto"
  if (!found.length) {
    const m = txt.match(/setor\s+([A-ZÀ-Ú][a-zà-ú]+)/i);
    if (m) found.push(m[1]);
  }
  return found;
}

function extrairValor(txt) {
  // Pega todos os valores e retorna o maior (evita pegar metragem como valor)
  const matches = [...txt.matchAll(/r\$\s*([\d.,]+)\s*(mil(?:h(?:ão|ões))?|k|m(?:il)?)?/gi)];
  if (!matches.length) {
    const m2 = txt.match(/([\d]+(?:[.,]\d{3})+)\s*(reais)?/);
    if (m2) {
      const v = parseFloat(m2[1].replace(/\./g,'').replace(',','.'));
      if (v >= 50000) return v;
    }
    return 0;
  }
  let maior = 0;
  for (const m of matches) {
    let v = parseFloat(m[1].replace(/\./g,'').replace(',','.'));
    const suf = (m[2] || '').toLowerCase();
    if (suf.startsWith('mil')) v *= 1000;
    else if (suf === 'k') v *= 1000;
    else if (suf === 'm') v *= 1000000;
    else if (v < 5000) v *= 1000;
    if (v > maior) maior = v;
  }
  return maior;
}

function extrairSuites(txt) {
  const m = txt.match(/(\d+)\s*su[ií]tes?/i) || txt.match(/su[ií]tes?\s*[:\-]?\s*(\d+)/i);
  return m ? parseInt(m[1] || m[2]) : 0;
}

function extrairQuartos(txt) {
  const mQuarto = txt.match(/(\d+)\s*(?:quartos?|qtos?|qts|dormit[oó]rios?|dorms?)/i)
                || txt.match(/(?:quartos?|qtos?|qts|dormit[oó]rios?)\s*[:\-]?\s*(\d+)/i);
  if (mQuarto) return parseInt(mQuarto[1] || mQuarto[2]);
  return 0;
}

function extrairArea(txt) {
  // Padrão primário: com símbolo ²/2
  const m = txt.match(/(\d{2,5})\s*m[²2]/i) || txt.match(/(\d{2,5})\s*metros\s*quad/i);
  if (m) { const v = parseInt(m[1]); return (v >= 20 && v <= 5000) ? v : 0; }
  // Padrão contextual: "mínimo 180m", "acima de 150m", "mín. 120m" sem símbolo ²
  const m2 = txt.match(/(?:m[íi]nimo|acima\s+de|m[íi]n\.?|pelo\s+menos|a\s+partir\s+de)\s+(\d{2,4})\s*m(?!\w)/i);
  if (m2) { const v = parseInt(m2[1]); return (v >= 20 && v <= 2000) ? v : 0; }
  return 0;
}

function extrairAreaMin(txt) {
  // "acima de", "mínimo", "a partir de", "+" → área mínima
  return /acima\s+de|acima\s+\d|m[íi]nimo|a partir de|\+\s*\d+\s*m[²2]|mais de \d/i.test(txt);
}

function extrairTipo(txt) {
  const t = txt.toLowerCase();
  if (/fazenda|s[íi]tio|ch[áa]cara|haras|rural/.test(t))            return 'rural';
  if (/\[áa]rea\s+(urbana|rural|industrial|incorpor|gleba)|gleba/.test(t)) return 'area';
  if (/\bterreno\b/.test(t))                                          return 'terreno';
  if (/\blote\b/.test(t))                                             return 'lote';
  if (/galp[aã]o|shed|industrial/.test(t))                           return 'comercial';
  if (/sala\s+comercial|loja\s+comercial|ponto\s+comercial/.test(t)) return 'comercial';
  if (/\bcasa\b|sobrado|geminado|village\s+house/.test(t))           return 'casa';
  if (/apart|apto|studio|kitnet|loft|cobertura|flat|penthouse/.test(t)) return 'apartamento';
  return 'apartamento'; // default — contexto imobiliário de Goiânia
}

function urgente(txt) {
  return /urgent|urgência|urgente|preciso hoje|essa semana|imediato/i.test(txt);
}
function permuta(txt) {
  return /permut[ao]|troco|troca|aceito im[oó]vel/i.test(txt);
}
function aVista(txt) {
  return /[àa]\s*vista|cash|recursos\s+pr[oó]prios/i.test(txt);
}

// ── Enriquecer dados ───────────────────────────────────────────────────────

function enriquecerOferta(o) {
  const t = o.txt || '';
  return {
    ...o,
    setores: extrairSetores(t),
    valor:   extrairValor(t),
    suites:  extrairSuites(t),
    quartos: extrairQuartos(t),
    area:    extrairArea(t),
    tipo:    extrairTipo(t),
    urgente: urgente(t),
    permuta: permuta(t),
  };
}

function enriquecerBusca(b) {
  const t = b.txt || '';
  return {
    ...b,
    setores:  extrairSetores(t),
    orcamento: extrairValor(t),
    suites:   extrairSuites(t),
    quartos:  extrairQuartos(t),
    area:     extrairArea(t),
    areaMin:  extrairAreaMin(t),
    tipo:     extrairTipo(t),
    urgente:  urgente(t),
    permuta:  permuta(t),
    aVista:   aVista(t),
  };
}

const ofertasRich = ofertas.map(enriquecerOferta);
const buscasRich  = buscas.map(enriquecerBusca);

// ── Cruzamento de matches ──────────────────────────────────────────────────
// Regras:
//   BLOQUEADORES (falhou = sem match):
//     1. Tipo incompatível (quando ambos têm tipo diferente de 'apartamento' default)
//     2. Setor incompatível (quando AMBOS têm setor e não coincidem)
//     3. Valor com diferença > 20%
//   PONTUAÇÃO:
//     Setor coincide (ambos têm):        +2
//     Valor dentro de 20% (ambos têm):   +2
//     Suítes coincidem (±1):             +2
//     Quartos coincidem (±1, sem suíte): +1
//     Área compatível:                   +1
//   ALTO ≥ 4 | MÉDIO ≥ 2 | BAIXO → descartado

function setoresCoincide(setsA, setsB) {
  if (!setsA.length || !setsB.length) return null; // ausente em um lado
  const al = setsA.map(s => s.toLowerCase());
  const bl = setsB.map(s => s.toLowerCase());
  return al.some(a => bl.some(b => a === b || a.includes(b) || b.includes(a)));
}

function calcScore(b, o) {
  const razoes = [];

  // ── BLOQUEADOR 1: Tipo incompatível ────────────────────────────────────
  // Só bloqueia se ambos têm tipo extraído com certeza (não default)
  const TIPOS_ESPECIFICOS = new Set(['rural','area','terreno','lote','comercial','casa']);
  if (TIPOS_ESPECIFICOS.has(b.tipo) || TIPOS_ESPECIFICOS.has(o.tipo)) {
    if (b.tipo !== o.tipo) return { score: 0, razoes };
  }

  // ── BLOQUEADOR 2: Setor incompatível ────────────────────────────────────
  const setorStatus = setoresCoincide(b.setores, o.setores);
  if (setorStatus === false) return { score: 0, razoes }; // ambos têm, não coincidem

  // ── BLOQUEADOR 3: Valor com diferença > 20% ─────────────────────────────
  if (b.orcamento > 0 && o.valor > 0) {
    const ratio = o.valor / b.orcamento;
    if (ratio > 1.20 || ratio < 0.50) return { score: 0, razoes };
  }

  // ── BLOQUEADOR 4: Cômodos incompatíveis (diferença > 1) ─────────────────
  const bCom = b.suites > 0 ? b.suites : b.quartos;
  const oCom = o.suites > 0 ? o.suites : o.quartos;
  if (bCom > 0 && oCom > 0 && Math.abs(bCom - oCom) > 1) return { score: 0, razoes };

  // ── BLOQUEADOR 5: Área muito discrepante (> 70% de diferença) ───────────
  if (b.area > 0 && o.area > 0) {
    const menor = Math.min(b.area, o.area);
    const maior = Math.max(b.area, o.area);
    if (maior / menor > 1.7) return { score: 0, razoes };
  }

  // ── BLOQUEADOR 5b: Área mínima declarada ("acima de Xm") não atingida ───
  if (b.areaMin && b.area > 0 && o.area > 0 && o.area < b.area * 0.90) return { score: 0, razoes };

  // ── BLOQUEADOR 6: Impossibilidade física — imóvel pequeno × muitos cômodos
  if (o.area > 0 && o.area < 65 && (b.suites >= 2 || b.quartos >= 3)) return { score: 0, razoes };
  if (b.area > 0 && b.area < 65 && (o.suites >= 2 || o.quartos >= 3)) return { score: 0, razoes };

  // ── PONTUAÇÃO ───────────────────────────────────────────────────────────
  let score = 0;

  if (setorStatus === true) {
    const setor = o.setores.find(s => b.setores.map(x=>x.toLowerCase()).includes(s.toLowerCase())) || o.setores[0];
    razoes.push('📍 ' + setor);
    score += 2;
  }

  if (b.orcamento > 0 && o.valor > 0) {
    razoes.push('💰 ' + o.valor.toLocaleString('pt-BR', {style:'currency',currency:'BRL',maximumFractionDigits:0}));
    score += 2;
  }

  if (b.suites > 0 && o.suites > 0) {
    if (Math.abs(b.suites - o.suites) <= 1) { razoes.push(o.suites + ' suítes'); score += 2; }
  } else if (b.quartos > 0 && o.quartos > 0 && b.suites === 0 && o.suites === 0) {
    if (Math.abs(b.quartos - o.quartos) <= 1) { razoes.push(o.quartos + ' qtos'); score += 1; }
  }

  if (b.area > 0 && o.area > 0) {
    const ok = b.areaMin ? o.area >= b.area * 0.90 : Math.abs(o.area - b.area) / b.area <= 0.25;
    if (ok) { razoes.push(o.area + 'm²'); score += 1; }
  }

  // Se busca especifica setor mas oferta não tem setor detectado → exige ≥4 de outros critérios
  if (b.setores.length > 0 && o.setores.length === 0 && score < 4) return { score: 0, razoes: [] };

  return { score, razoes };
}

// Deduplica mensagens identicas que aparecem em grupos diferentes
function dedupMensagens(arr) {
  const seen = new Map();
  for (const m of arr) {
    const k = (m.de || '') + '||' + (m.txt || '');
    if (!seen.has(k)) seen.set(k, m);
  }
  return [...seen.values()];
}
const ofertasUniq = dedupMensagens(ofertasRich);
const buscasUniq  = dedupMensagens(buscasRich);

// Para matches: só buscas ativas nas últimas 48h
// (compradores que ainda estão no mercado — evita cruzar tudo × tudo)
const LIMITE_48H = Date.now() - 48 * 60 * 60 * 1000;
function parseHoraMs(hora) {
  if (!hora) return 0;
  const [datePart, timePart] = hora.split(', ');
  if (!datePart || !timePart) return 0;
  const [d, m, y] = datePart.split('/');
  return new Date(`${y}-${m}-${d}T${timePart}`).getTime();
}
function ehBuscaRecente(b) {
  if (b.ultimaVez) return new Date(b.ultimaVez).getTime() >= LIMITE_48H;
  return parseHoraMs(b.hora) >= LIMITE_48H;
}
const buscasParaMatch = buscasUniq.filter(ehBuscaRecente);

const matches = [];
const parVisto = new Set();

for (const b of buscasParaMatch) {
  for (const o of ofertasUniq) {
    const { score, razoes } = calcScore(b, o);
    if (score < 4) continue;
    const parKey = (b.txt || '') + '|||' + (o.txt || '');
    if (parVisto.has(parKey)) continue;
    parVisto.add(parKey);
    const nivel = score >= 5 ? 'ALTO' : 'MÉDIO';
    matches.push({ busca: b, oferta: o, nivel, score, razoes });
  }
}

// Ordena: score desc, depois recência (quão recente é o lado mais novo do par)
function recenciaMs(item) {
  if (item.ultimaVez) return new Date(item.ultimaVez).getTime();
  return 0;
}
matches.sort((a, b) => {
  if (b.score !== a.score) return b.score - a.score;
  const ra = Math.max(recenciaMs(a.busca), recenciaMs(a.oferta));
  const rb = Math.max(recenciaMs(b.busca), recenciaMs(b.oferta));
  return rb - ra;
});

const totalAlto  = matches.filter(m => m.nivel === 'ALTO').length;
const totalMedio = matches.filter(m => m.nivel === 'MÉDIO').length;
const urgencias  = buscasRich.filter(b => b.urgente || b.aVista).length;
const compradores       = buscasRich.length;        // total no inventário
const compradoresHoje   = buscasParaMatch.length;   // ativos nas 48h
const ofertasInventario = ofertasUniq.length;

console.log(`🎯 Matches ALTO: ${totalAlto} | MÉDIO: ${totalMedio}`);
console.log(`📅 Buscas 48h: ${compradoresHoje} | Inventário: ${ofertasInventario} ofertas | ${compradores} buscas`);

// ── Helpers HTML ───────────────────────────────────────────────────────────

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtValor(v) {
  if (!v) return '';
  return 'R$ ' + v.toLocaleString('pt-BR');
}

function badgeNivel(nivel) {
  const cls = nivel === 'ALTO' ? 'badge-alto' : nivel === 'MÉDIO' ? 'badge-medio' : 'badge-baixo';
  return `<span class="badge ${cls}">${nivel}</span>`;
}

function badgeExtra(b, o) {
  let out = '';
  if (b.urgente || o.urgente) out += '<span class="badge badge-urgente">URGENTE</span>';
  if (b.permuta || o.permuta) out += '<span class="badge badge-permuta">PERMUTA</span>';
  if (b.aVista) out += '<span class="badge badge-avista">À VISTA</span>';
  const maxCount = Math.max(b.contagem || 1, o.contagem || 1);
  if (maxCount >= 3) out += `<span class="badge badge-hot" title="${maxCount}x nas últimas 2 semanas">🔥 ${maxCount}x</span>`;
  return out;
}

function cardMatch(m, idx) {
  const { busca: b, oferta: o, nivel, razoes } = m;
  const destaque = idx === 0 && nivel === 'ALTO' ? '<div class="acao-imediata">⚡ AÇÃO IMEDIATA</div>' : '';
  const telO = o.tel ? `<div class="telefone">📞 ${esc(o.tel)}</div>` : '';
  const telB = b.tel ? `<div class="telefone">📞 ${esc(b.tel)}</div>` : '';

  return `
<div class="card-match nivel-${nivel.toLowerCase()}">
  ${destaque}
  <div class="card-header">
    ${badgeNivel(nivel)} ${badgeExtra(b, o)}
    <span class="match-razao">↔ ${razoes.join(' · ')}</span>
  </div>
  <div class="card-body">
    <div class="lado busca-lado">
      <div class="lado-label">🔍 BUSCA</div>
      <div class="corretor">${esc(b.de || 'Corretor não identificado')}</div>
      <div class="horario">${esc(b.hora)}</div>
      <div class="grupo-tag">📍 ${esc(b.g || b.grupo)}</div>
      ${telB}
      <div class="divider"></div>
      <div class="detalhe"><b>Tipo:</b> ${esc(b.tipo)} ${b.quartos ? b.quartos + ' qtos' : ''} ${b.area ? b.area + 'm²' : ''}</div>
      ${b.setor ? `<div class="detalhe"><b>Região:</b> ${esc(b.setor)}</div>` : ''}
      ${b.orcamento ? `<div class="detalhe"><b>Orçamento:</b> ${fmtValor(b.orcamento)}</div>` : ''}
      <div class="txt-original">${esc(b.txt.slice(0,150))}${b.txt.length>150?'…':''}</div>
    </div>
    <div class="lado oferta-lado">
      <div class="lado-label">🏠 OFERTA</div>
      <div class="corretor">${esc(o.de || 'Corretor não identificado')}</div>
      <div class="horario">${esc(o.hora)}</div>
      <div class="grupo-tag">📍 ${esc(o.g || o.grupo)}</div>
      ${telO}
      <div class="divider"></div>
      ${o.emp ? `<div class="empreendimento">${esc(o.emp)}</div>` : ''}
      ${o.setor ? `<div class="detalhe"><b>Localização:</b> ${esc(o.setor)}</div>` : ''}
      <div class="detalhe">
        ${o.area ? `<b>Área:</b> ${o.area}m² · ` : ''}${o.quartos ? `<b>Qtos:</b> ${o.quartos} · ` : ''}
      </div>
      ${o.valor ? `<div class="valor">${fmtValor(o.valor)}</div>` : ''}
      <div class="txt-original">${esc(o.txt.slice(0,150))}${o.txt.length>150?'…':''}</div>
    </div>
  </div>
</div>`;
}

// ── Aba Demanda ─────────────────────────────────────────────────────────────

function tabelaDemanda() {
  const linhas = buscasRich.map(b => `
    <tr>
      <td>${esc(b.de || '—')}</td>
      <td>${esc(b.tipo)} ${b.quartos ? b.quartos+'qtos' : ''} ${b.area ? b.area+'m²' : ''}</td>
      <td>${esc(b.setor || '—')}</td>
      <td>${b.orcamento ? fmtValor(b.orcamento) : '—'}</td>
      <td>${[b.urgente?'Urgente':'', b.aVista?'À Vista':'', b.permuta?'Permuta':''].filter(Boolean).join(' · ') || '—'}</td>
      <td class="grupo-cell">${esc(b.g || b.grupo)}</td>
      <td class="horario-cell">${esc(b.hora)}</td>
    </tr>`).join('');

  return `<table class="demanda-table">
    <thead><tr>
      <th>Comprador</th><th>Tipo</th><th>Região</th>
      <th>Orçamento</th><th>Condições</th><th>Grupo</th><th>Horário</th>
    </tr></thead>
    <tbody>${linhas}</tbody>
  </table>`;
}

// ── Aba Alertas ─────────────────────────────────────────────────────────────

function alertas() {
  const urgentes = buscasRich.filter(b => b.urgente || b.aVista);
  const permutas = buscasRich.filter(b => b.permuta).concat(ofertasRich.filter(o => o.permuta));

  // Demanda por setor
  const setorCount = {};
  buscasRich.forEach(b => { if (b.setor) setorCount[b.setor] = (setorCount[b.setor]||0)+1; });
  const gaps = Object.entries(setorCount).filter(([,c]) => c >= 3).sort((a,b)=>b[1]-a[1]).slice(0,5);

  let html = '';

  urgentes.forEach(b => {
    html += `<div class="alerta alerta-vermelho">
      <span class="alerta-ico">🚨</span>
      <div><b>${esc(b.de||'Corretor')}</b> — ${esc(b.txt.slice(0,120))}…
      <div class="alerta-meta">${esc(b.g||b.grupo)} · ${esc(b.hora)} ${b.tel?`· 📞 ${esc(b.tel)}`:''}</div></div>
    </div>`;
  });

  gaps.forEach(([setor, count]) => {
    html += `<div class="alerta alerta-teal">
      <span class="alerta-ico">📍</span>
      <div><b>Gap de captação — ${esc(setor)}</b>: ${count} comprador(es) buscando nessa região sem oferta clara</div>
    </div>`;
  });

  permutas.slice(0,5).forEach(p => {
    html += `<div class="alerta alerta-roxo">
      <span class="alerta-ico">🔄</span>
      <div><b>${esc(p.de||'Corretor')}</b> — permuta ativa
      <div class="alerta-meta">${esc(p.g||p.grupo)} · ${esc(p.hora)}</div></div>
    </div>`;
  });

  return html || '<p class="vazio">Nenhum alerta no período.</p>';
}

// ── Lê historico.json ───────────────────────────────────────────────────────

let historico = [];
try { historico = JSON.parse(fs.readFileSync('historico.json', 'utf8')); } catch {}

function dropdownHistorico() {
  if (!historico.length) return '';
  const itens = historico.map(h =>
    `<a class="hist-item" href="${esc(h.arquivo)}">${esc(h.label)}</a>`
  ).join('');
  return `<div class="hist-wrapper">
    <button class="hist-btn" onclick="this.nextElementSibling.classList.toggle('open')">🗂️ Histórico ▾</button>
    <div class="hist-dropdown">${itens}</div>
  </div>`;
}

// ── Gera HTML ───────────────────────────────────────────────────────────────

const agora = new Date();
const dataStr = agora.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
const horaStr = agora.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
const ts = agora.toISOString().slice(0,16).replace('T','_').replace(':','-');

const matchesAlto = matches.filter(m => m.nivel === 'ALTO').slice(0, 30);
const matchesMedio = matches.filter(m => m.nivel === 'MÉDIO').slice(0, 20);
const matchesExibidos = [...matchesAlto, ...matchesMedio];
const matchCards = matchesExibidos.map((m, i) => cardMatch(m, i)).join('');

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MatchZap · ${dataStr}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
:root {
  --bg:#0B0F0E; --surface:#131918; --border:#1E2B28;
  --teal:#00C9A7; --teal-dim:#00C9A715; --gold:#C9A84C; --gold-dim:#C9A84C15;
  --red:#E05252; --red-dim:#E0525215; --white:#F0EDE6; --muted:#6B7B78;
  --alto:#27AE60; --alto-dim:#27AE6015; --medio:#F39C12; --medio-dim:#F39C1215;
  --purple:#9B59B6;
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--white);min-height:100vh}
a{color:var(--teal);text-decoration:none}

/* Header */
.header{position:sticky;top:0;z-index:100;background:var(--bg);border-bottom:1px solid var(--border);padding:12px 20px;display:flex;align-items:center;gap:16px}
.logo{font-family:'JetBrains Mono',monospace;font-size:22px;font-weight:700;color:var(--teal);letter-spacing:-1px}
.header-meta{font-size:13px;color:var(--muted);flex:1}
.header-meta b{color:var(--white)}

/* Stats */
.stats{display:flex;gap:12px;padding:16px 20px;flex-wrap:wrap}
.stat{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 18px;min-width:110px}
.stat-num{font-family:'JetBrains Mono',monospace;font-size:28px;font-weight:700}
.stat-lbl{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-top:2px}
.stat-alto .stat-num{color:var(--alto)}
.stat-medio .stat-num{color:var(--medio)}
.stat-red .stat-num{color:var(--red)}

/* Tabs */
.tabs{position:sticky;top:57px;z-index:90;background:var(--bg);border-bottom:1px solid var(--border);display:flex;gap:4px;padding:0 16px}
.tab{padding:12px 18px;font-size:14px;font-weight:500;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;transition:all .2s}
.tab.active{color:var(--teal);border-bottom-color:var(--teal)}
.tab-content{display:none;padding:20px}
.tab-content.active{display:block}

/* Cards de match */
.card-match{background:var(--surface);border:1px solid var(--border);border-radius:12px;margin-bottom:16px;overflow:hidden}
.card-match.nivel-alto{border-color:#27AE6040}
.card-match.nivel-médio,.card-match.nivel-medio{border-color:#F39C1240}
.card-header{padding:10px 16px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border);flex-wrap:wrap}
.match-razao{font-size:12px;color:var(--muted);margin-left:auto}
.card-body{display:grid;grid-template-columns:1fr 1fr;gap:0}
@media(max-width:640px){.card-body{grid-template-columns:1fr}}
.lado{padding:16px}
.busca-lado{border-right:1px solid var(--border);background:var(--gold-dim)}
.oferta-lado{background:var(--teal-dim)}
.lado-label{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;letter-spacing:1px;color:var(--muted);margin-bottom:6px}
.busca-lado .lado-label{color:var(--gold)}
.oferta-lado .lado-label{color:var(--teal)}
.corretor{font-weight:600;font-size:15px;margin-bottom:2px}
.horario{font-size:12px;color:var(--muted);margin-bottom:4px}
.grupo-tag{font-size:12px;color:var(--muted);margin-bottom:8px}
.telefone{font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--alto);margin-bottom:6px}
.divider{border-top:1px solid var(--border);margin:8px 0}
.detalhe{font-size:13px;color:var(--muted);margin-bottom:3px}
.detalhe b{color:var(--white)}
.empreendimento{font-weight:700;font-size:15px;color:var(--teal);margin-bottom:4px}
.valor{font-family:'JetBrains Mono',monospace;font-size:16px;font-weight:600;color:var(--gold);margin-top:6px}
.txt-original{font-size:11px;color:var(--muted);margin-top:8px;line-height:1.4;font-style:italic}

/* Ação imediata */
.acao-imediata{background:linear-gradient(90deg,#27AE6020,transparent);padding:8px 16px;font-size:12px;font-weight:700;color:var(--alto);letter-spacing:.5px;border-bottom:1px solid #27AE6030}

/* Badges */
.badge{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;padding:3px 8px;border-radius:4px;letter-spacing:.5px}
.badge-alto{background:var(--alto-dim);border:1px solid var(--alto);color:var(--alto)}
.badge-medio{background:var(--medio-dim);border:1px solid var(--medio);color:var(--medio)}
.badge-baixo{background:#1E1E1E;border:1px solid #333;color:#666}
.badge-urgente{background:#E0525215;border:1px solid var(--red);color:var(--red)}
.badge-permuta{background:#9B59B615;border:1px solid var(--purple);color:var(--purple)}
.badge-avista{background:#27AE6015;border:1px solid var(--alto);color:var(--alto)}
.badge-hot{background:#E0522515;border:1px solid #E05225;color:#E05225}

/* Demanda */
.demanda-table{width:100%;border-collapse:collapse;font-size:13px}
.demanda-table th{background:var(--surface);color:var(--muted);padding:10px 12px;text-align:left;border-bottom:1px solid var(--border);font-size:11px;text-transform:uppercase;letter-spacing:.5px}
.demanda-table td{padding:10px 12px;border-bottom:1px solid var(--border);vertical-align:top}
.demanda-table tr:hover td{background:var(--surface)}
.grupo-cell,.horario-cell{color:var(--muted);font-size:12px}

/* Alertas */
.alerta{display:flex;gap:12px;padding:14px 16px;border-radius:10px;margin-bottom:10px;align-items:flex-start}
.alerta-ico{font-size:20px;flex-shrink:0}
.alerta-vermelho{background:#E0525210;border:1px solid #E0525230}
.alerta-teal{background:#00C9A710;border:1px solid #00C9A730}
.alerta-roxo{background:#9B59B610;border:1px solid #9B59B630}
.alerta-meta{font-size:12px;color:var(--muted);margin-top:4px}
.vazio{color:var(--muted);font-size:14px;padding:20px 0}

/* Histórico */
.hist-wrapper{position:relative;margin-left:auto}
.hist-btn{background:var(--surface);border:1px solid var(--border);color:var(--white);padding:6px 12px;border-radius:6px;font-size:13px;cursor:pointer;font-family:'Inter',sans-serif}
.hist-dropdown{display:none;position:absolute;right:0;top:calc(100% + 4px);background:var(--surface);border:1px solid var(--border);border-radius:8px;min-width:260px;z-index:200;box-shadow:0 8px 24px #000a}
.hist-dropdown.open{display:block}
.hist-item{display:block;padding:10px 14px;font-size:13px;color:var(--white);border-bottom:1px solid var(--border)}
.hist-item:last-child{border-bottom:none}
.hist-item:hover{background:var(--border)}

/* Buscar */
.buscar-wrap{max-width:860px;margin:0 auto;padding:4px 0}
.buscar-hint{font-size:13px;color:var(--muted);margin-bottom:12px;line-height:1.5}
.buscar-textarea{width:100%;min-height:130px;background:var(--surface);border:1px solid var(--border);border-radius:10px;color:var(--white);font-family:'Inter',sans-serif;font-size:14px;line-height:1.6;padding:14px;resize:vertical;outline:none;transition:border-color .2s;box-sizing:border-box}
.buscar-textarea:focus{border-color:var(--teal)}
.buscar-textarea::placeholder{color:var(--muted)}
.buscar-actions{display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap}
.buscar-btn{background:var(--teal);color:#000;font-weight:700;font-size:14px;padding:10px 22px;border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif}
.buscar-btn:hover{opacity:.9}
.buscar-limpar{background:transparent;border:1px solid var(--border);color:var(--muted);font-size:13px;padding:10px 16px;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif}
.mode-toggle{display:flex;gap:4px;margin-left:auto}
.mode-btn{font-size:12px;padding:7px 12px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;font-family:'Inter',sans-serif;transition:all .15s}
.mode-btn.active{border-color:var(--teal);color:var(--teal);background:rgba(56,189,175,.1)}
.crit-panel{margin-top:12px;padding:12px 14px;background:var(--surface);border:1px solid var(--border);border-radius:8px}
.crit-label{font-size:10px;color:var(--muted);margin-bottom:8px;letter-spacing:.8px;text-transform:uppercase}
.crit-chips{display:flex;flex-wrap:wrap;gap:6px}
.crit-chip{font-size:12px;padding:4px 10px;border-radius:20px;border:1px solid}
.crit-chip.mode{border-color:#445;color:#889;font-style:italic}
.crit-chip.tipo{border-color:#445;color:#99a;background:#111a1f}
.crit-chip.setor{border-color:var(--teal);color:var(--teal);background:rgba(56,189,175,.07)}
.crit-chip.valor{border-color:var(--alto);color:var(--alto);background:rgba(74,222,128,.05)}
.crit-chip.rooms{border-color:var(--gold);color:var(--gold);background:rgba(234,179,8,.05)}
.crit-chip.area{border-color:#5a9;color:#5a9;background:rgba(80,170,130,.05)}
.buscar-count{font-size:13px;color:var(--muted);margin:16px 0 8px}
.res-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:10px}
.res-card:hover{border-color:#2e3b38}
.res-header{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px}
.res-badge{font-size:11px;font-weight:700;padding:3px 9px;border-radius:4px;letter-spacing:.5px;white-space:nowrap}
.res-badge.forte{background:rgba(74,222,128,.15);color:#4ade80;border:1px solid rgba(74,222,128,.3)}
.res-badge.bom{background:rgba(56,189,175,.15);color:var(--teal);border:1px solid rgba(56,189,175,.3)}
.res-badge.basico{background:rgba(234,179,8,.1);color:var(--gold);border:1px solid rgba(234,179,8,.2)}
.res-de{font-weight:600;font-size:15px}
.res-tel{font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--alto);cursor:pointer;text-decoration:underline dotted}
.res-hora{font-size:12px;color:var(--muted);margin-left:auto}
.res-grupo{font-size:12px;color:var(--muted);margin-bottom:6px}
.res-emp{font-weight:700;font-size:14px;color:var(--teal);margin-bottom:5px}
.res-fields{display:flex;flex-wrap:wrap;gap:5px;margin:5px 0 7px}
.res-field{font-size:11px;padding:2px 9px;border-radius:12px;background:#111a1f;border:1px solid var(--border);color:var(--muted)}
.res-razoes{font-size:12px;color:var(--gold);margin-bottom:8px;letter-spacing:.3px;font-weight:500}
.res-txt{font-size:13px;color:var(--white);line-height:1.55;white-space:pre-line;border-top:1px solid var(--border);padding-top:8px;margin-top:4px}
.buscar-empty{text-align:center;padding:32px 20px;color:var(--muted)}
.buscar-empty b{display:block;color:var(--white);font-size:15px;margin-bottom:8px}
.buscar-empty p{font-size:13px;line-height:1.7;margin:0}

/* Footer */
.footer{text-align:center;padding:32px 20px;color:var(--muted);font-size:12px;border-top:1px solid var(--border);margin-top:40px}

/* ── Filtrar ────────────────────────────────────────────────────────────── */
.filtrar-layout{display:grid;grid-template-columns:268px 1fr;gap:16px;align-items:start}
@media(max-width:800px){.filtrar-layout{grid-template-columns:1fr}}
.filtrar-sidebar{position:sticky;top:100px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;max-height:calc(100vh - 120px);overflow-y:auto}
.f-section{margin-bottom:16px}
.f-section:last-child{margin-bottom:0}
.f-label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px}
.f-chips{display:flex;flex-wrap:wrap;gap:5px}
.f-chip{font-size:12px;padding:5px 12px;border-radius:20px;border:1px solid var(--border);color:var(--muted);background:transparent;cursor:pointer;transition:all .15s;font-family:'Inter',sans-serif}
.f-chip:hover{border-color:#3a4a47;color:var(--white)}
.f-chip.sel{border-color:var(--teal);color:var(--teal);background:rgba(0,201,167,.1)}
.f-modo{display:flex;border:1px solid var(--border);border-radius:8px;overflow:hidden}
.f-modo-btn{flex:1;padding:9px 6px;font-size:13px;font-weight:500;text-align:center;cursor:pointer;color:var(--muted);background:transparent;border:none;font-family:'Inter',sans-serif;transition:all .15s}
.f-modo-btn.sel{background:var(--teal);color:#000;font-weight:700}
.f-range{display:flex;gap:6px;align-items:center}
.f-input{background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--white);font-family:'Inter',sans-serif;font-size:13px;padding:6px 10px;width:100%;outline:none;transition:border-color .2s}
.f-input:focus{border-color:var(--teal)}
.f-input::placeholder{color:var(--muted);font-size:12px}
.f-sep{color:var(--muted);flex-shrink:0;font-size:12px}
.f-check-row{display:flex;flex-direction:column;gap:7px}
.f-check{display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--muted)}
.f-check input{accent-color:var(--teal);width:14px;height:14px;cursor:pointer}
.f-check:hover{color:var(--white)}
.f-scroll-list{max-height:150px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin-top:4px;padding-right:2px}
.f-list-item{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted);cursor:pointer;padding:3px 0}
.f-list-item input{accent-color:var(--teal);cursor:pointer;flex-shrink:0}
.f-list-item:hover{color:var(--white)}
.f-limpar{width:100%;margin-top:6px;padding:9px;background:transparent;border:1px solid var(--border);border-radius:8px;color:var(--muted);font-size:13px;cursor:pointer;font-family:'Inter',sans-serif;transition:all .15s}
.f-limpar:hover{border-color:var(--red);color:var(--red)}
.filtrar-resultados{min-height:200px}
.f-count{font-size:13px;color:var(--muted);margin-bottom:12px;padding:6px 0;border-bottom:1px solid var(--border)}
.f-count b{color:var(--white);font-size:15px}
.f-empty{text-align:center;padding:40px 20px;color:var(--muted)}
.f-empty b{display:block;color:var(--white);margin-bottom:8px;font-size:15px}
</style>
</head>
<body>

<div class="header">
  <div class="logo">MZ</div>
  <div class="header-meta">
    <b>${dataStr} · ${horaStr}</b> &nbsp;·&nbsp; 10 grupos monitorados
  </div>
  ${dropdownHistorico()}
</div>

<div class="stats">
  <div class="stat stat-alto">
    <div class="stat-num">${totalAlto}</div>
    <div class="stat-lbl">Matches Alto</div>
  </div>
  <div class="stat stat-medio">
    <div class="stat-num">${totalMedio}</div>
    <div class="stat-lbl">Matches Médio</div>
  </div>
  <div class="stat">
    <div class="stat-num">${compradoresHoje}</div>
    <div class="stat-lbl">Buscas 48h</div>
  </div>
  <div class="stat">
    <div class="stat-num">${ofertasInventario}</div>
    <div class="stat-lbl">Ofertas (inv.)</div>
  </div>
  <div class="stat stat-red">
    <div class="stat-num">${urgencias}</div>
    <div class="stat-lbl">Urgências</div>
  </div>
</div>

<div class="tabs">
  <div class="tab active" onclick="showTab('matches', this)">🎯 Matches (${matchesExibidos.length} de ${matches.length})</div>
  <div class="tab" onclick="showTab('demanda', this)">🔍 Demanda (${compradores})</div>
  <div class="tab" onclick="showTab('alertas', this)">⚠️ Alertas</div>
  <div class="tab" onclick="showTab('buscar', this)">🔎 Buscar</div>
  <div class="tab" onclick="showTab('filtrar', this)">⚙️ Filtrar</div>
</div>

<div id="matches" class="tab-content active">
  ${matchCards || '<p class="vazio" style="padding:20px">Nenhum match encontrado no período.</p>'}
</div>

<div id="demanda" class="tab-content">
  ${tabelaDemanda()}
</div>

<div id="alertas" class="tab-content">
  ${alertas()}
</div>

<div id="buscar" class="tab-content">
  <div class="buscar-wrap">
    <p class="buscar-hint">Cole uma mensagem do WhatsApp — busca ou oferta. O sistema detecta tipo, setor, valor, suítes e área, e encontra os matches nos grupos coletados.</p>
    <textarea id="buscar-input" class="buscar-textarea" placeholder="Ex: BUSCO&#10;3 SUÍTES — Bueno ou Marista&#10;Acima de 150m²&#10;Até R$1.700.000"></textarea>
    <div class="buscar-actions">
      <button class="buscar-btn" onclick="executarBusca()">🔎 Buscar</button>
      <button class="buscar-limpar" onclick="limparBusca()">✕ Limpar</button>
      <div class="mode-toggle">
        <button class="mode-btn active" id="mode-auto"    onclick="setModo('auto',this)">Auto</button>
        <button class="mode-btn"        id="mode-ofertas" onclick="setModo('ofertas',this)">Em Ofertas</button>
        <button class="mode-btn"        id="mode-buscas"  onclick="setModo('buscas',this)">Em Buscas</button>
      </div>
    </div>
    <div id="buscar-crit"></div>
    <div id="buscar-resultados"></div>
  </div>
</div>

<div id="filtrar" class="tab-content">
  <div class="filtrar-layout">
    <aside class="filtrar-sidebar">
      <div class="f-section">
        <div class="f-label">Exibir</div>
        <div class="f-modo">
          <div class="f-modo-btn sel" id="fm-ofertas" onclick="setFModo('ofertas')">🏠 Ofertas</div>
          <div class="f-modo-btn" id="fm-buscas"  onclick="setFModo('buscas')">🔍 Buscas</div>
        </div>
      </div>
      <div class="f-section">
        <div class="f-label">Tipo</div>
        <div class="f-chips">
          <div class="f-chip" onclick="toggleFChip(this,'tipos','apartamento')">Apartamento</div>
          <div class="f-chip" onclick="toggleFChip(this,'tipos','casa')">Casa</div>
          <div class="f-chip" onclick="toggleFChip(this,'tipos','lote')">Lote</div>
          <div class="f-chip" onclick="toggleFChip(this,'tipos','terreno')">Terreno</div>
          <div class="f-chip" onclick="toggleFChip(this,'tipos','rural')">Rural</div>
          <div class="f-chip" onclick="toggleFChip(this,'tipos','comercial')">Comercial</div>
        </div>
      </div>
      <div class="f-section">
        <div class="f-label">Suítes</div>
        <div class="f-chips">
          <div class="f-chip" onclick="toggleFNum(this,'fSuites',1)">1</div>
          <div class="f-chip" onclick="toggleFNum(this,'fSuites',2)">2</div>
          <div class="f-chip" onclick="toggleFNum(this,'fSuites',3)">3</div>
          <div class="f-chip" onclick="toggleFNum(this,'fSuites',4)">4+</div>
        </div>
      </div>
      <div class="f-section">
        <div class="f-label">Quartos</div>
        <div class="f-chips">
          <div class="f-chip" onclick="toggleFNum(this,'fQuartos',1)">1</div>
          <div class="f-chip" onclick="toggleFNum(this,'fQuartos',2)">2</div>
          <div class="f-chip" onclick="toggleFNum(this,'fQuartos',3)">3</div>
          <div class="f-chip" onclick="toggleFNum(this,'fQuartos',4)">4+</div>
        </div>
      </div>
      <div class="f-section">
        <div class="f-label">Valor (R$)</div>
        <div class="f-range">
          <input class="f-input" id="f-vmin" type="number" placeholder="Mín" oninput="aplicarFiltros()" min="0" step="50000">
          <span class="f-sep">–</span>
          <input class="f-input" id="f-vmax" type="number" placeholder="Máx" oninput="aplicarFiltros()" min="0" step="50000">
        </div>
      </div>
      <div class="f-section">
        <div class="f-label">Área (m²)</div>
        <div class="f-range">
          <input class="f-input" id="f-amin" type="number" placeholder="Mín" oninput="aplicarFiltros()" min="0" step="10">
          <span class="f-sep">–</span>
          <input class="f-input" id="f-amax" type="number" placeholder="Máx" oninput="aplicarFiltros()" min="0" step="10">
        </div>
      </div>
      <div class="f-section">
        <div class="f-label">Condições</div>
        <div class="f-check-row">
          <label class="f-check"><input type="checkbox" id="f-urgente" onchange="aplicarFiltros()"> Urgente</label>
          <label class="f-check"><input type="checkbox" id="f-permuta" onchange="aplicarFiltros()"> Aceita Permuta</label>
          <label class="f-check"><input type="checkbox" id="f-avista"  onchange="aplicarFiltros()"> À Vista</label>
        </div>
      </div>
      <div class="f-section">
        <div class="f-label">Bairro / Setor</div>
        <div class="f-scroll-list" id="f-setor-list"></div>
      </div>
      <div class="f-section">
        <div class="f-label">Grupo</div>
        <div class="f-scroll-list" id="f-grupo-list"></div>
      </div>
      <button class="f-limpar" onclick="limparFiltros()">✕ Limpar filtros</button>
    </aside>
    <div class="filtrar-resultados" id="filtrar-resultados">
      <div class="f-count">Selecione filtros para explorar as mensagens coletadas.</div>
    </div>
  </div>
</div>

<div class="footer">
  Gerado por MatchZap · ${dataStr} ${horaStr} · ${ofertas.length + buscas.length} mensagens de 10 grupos do WhatsApp
</div>

<script>
// ── Dataset embarcado ───────────────────────────────────────────────────────
const DS_OFERTAS = ${JSON.stringify(ofertasRich)};
const DS_BUSCAS  = ${JSON.stringify(buscasRich)};

const SETORES = ${JSON.stringify(SETORES_GO)};

// ── Navegação ───────────────────────────────────────────────────────────────
function showTab(id, el) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  el.classList.add('active');
}
document.addEventListener('click', e => {
  if (!e.target.closest('.hist-wrapper')) {
    document.querySelectorAll('.hist-dropdown').forEach(d => d.classList.remove('open'));
  }
});

// ── Parser de mensagem livre ─────────────────────────────────────────────────
function parseMsgLivre(txt) {
  const isBusca = /\\bbusc[oa]\\b|\\bprocur[ao]\\b|\\bpreciso\\b|\\bquero comprar\\b|\\btenho cliente\\b|\\bcliente busca\\b/i.test(txt);
  const txtL = txt.toLowerCase();

  // Setores (OR logic)
  const setores = SETORES.filter(s => txtL.includes(s.toLowerCase()));

  // Suítes (separado de quartos)
  const mSuite = txt.match(/(\\d+)\\s*su[ií]tes?/i) || txt.match(/su[ií]tes?\\s*[:\\-]?\\s*(\\d+)/i);
  const suites = mSuite ? parseInt(mSuite[1] || mSuite[2]) : 0;

  // Quartos (apenas se não for suíte)
  const mQ = txt.match(/(\\d+)\\s*(?:quartos?|qtos?|qts|dormit[oó]rios?|dorms?)/i)
          || txt.match(/(?:quartos?|qtos?|qts|dormit[oó]rios?)\\s*[:\\-]?\\s*(\\d+)/i);
  const quartos = mQ ? parseInt(mQ[1] || mQ[2]) : 0;

  // Área (inclui "Mínimo 180m" sem símbolo ²)
  const mA = txt.match(/(\\d{2,5})\\s*m[²2]/i) || txt.match(/(\\d{2,5})\\s*metros\\s*quad/i);
  let areaRaw = mA ? parseInt(mA[1]) : 0;
  if (!areaRaw) {
    const mA2 = txt.match(/(?:m[íi]nimo|acima\\s+de|m[íi]n\\.?|pelo\\s+menos|a\\s+partir\\s+de)\\s+(\\d{2,4})\\s*m(?!\\w)/i);
    if (mA2) areaRaw = parseInt(mA2[1]);
  }
  const area = (areaRaw >= 20 && areaRaw <= 2000) ? areaRaw : 0;
  const areaMin = /acima\\s+de|acima\\s+\\d|m[íi]nimo|a partir de|mais de \\d/i.test(txt);

  // Valor (pega o maior R$ encontrado)
  const vmatch = [...txt.matchAll(/r\\$\\s*([\\d.,]+)\\s*(mil(?:h(?:ão|ões))?|k|m(?:il)?)?/gi)];
  let valor = 0;
  for (const m of vmatch) {
    let v = parseFloat(m[1].replace(/\\./g,'').replace(',','.'));
    const suf = (m[2]||'').toLowerCase();
    if (suf.startsWith('mil')) v *= 1000;
    else if (suf === 'k') v *= 1000;
    else if (suf === 'm') v *= 1000000;
    else if (v < 5000) v *= 1000;
    if (v > valor) valor = v;
  }

  // Tipo
  const t = txtL;
  let tipo = 'apartamento';
  if (/fazenda|s[íi]tio|ch[áa]cara|haras|rural/.test(t)) tipo = 'rural';
  else if (/\\bterreno\\b/.test(t)) tipo = 'terreno';
  else if (/\\blote\\b/.test(t)) tipo = 'lote';
  else if (/galp[aã]o|shed|industrial/.test(t)) tipo = 'comercial';
  else if (/sala\\s+comercial|loja\\s+comercial/.test(t)) tipo = 'comercial';
  else if (/\\bcasa\\b|sobrado/.test(t)) tipo = 'casa';
  else if (/apart|apto|studio|kitnet|loft|cobertura|flat|penthouse/.test(t)) tipo = 'apartamento';

  return { isBusca, setores, suites, quartos, area, areaMin, valor, tipo };
}

// ── Scoring (mesma lógica do servidor) ──────────────────────────────────────
const TIPOS_ESPECIFICOS_CLI = new Set(['rural','area','terreno','lote','comercial','casa']);

function scoreItem(item, c) {
  let score = 0;
  const razoes = [];

  // Tipo: bloqueia se tipos específicos diferentes
  const itemTipo = item.tipo || 'apartamento';
  if (TIPOS_ESPECIFICOS_CLI.has(c.tipo) || TIPOS_ESPECIFICOS_CLI.has(itemTipo)) {
    if (c.tipo !== itemTipo) return { score: 0, razoes };
  }

  // Setor (OR logic) — usa setores pré-computados do item
  const itemSetores = item.setores || [];
  if (c.setores.length > 0 && itemSetores.length > 0) {
    const hit = c.setores.find(cs => itemSetores.some(is => cs.toLowerCase() === is.toLowerCase() || cs.toLowerCase().includes(is.toLowerCase()) || is.toLowerCase().includes(cs.toLowerCase())));
    if (hit) { score += 2; razoes.push('📍 ' + hit); }
    else return { score: 0, razoes }; // ambos têm setor mas não coincidem
  }

  // Valor — max 20% de diferença
  const itemValor = item.valor || item.orcamento || 0;
  if (c.valor > 0 && itemValor > 0) {
    const ratio = c.isBusca ? (itemValor / c.valor) : (c.valor / itemValor);
    if (ratio > 1.20 || ratio < 0.50) return { score: 0, razoes };
    score += 2;
    razoes.push('💰 R$' + itemValor.toLocaleString('pt-BR'));
  }

  // ── BLOQUEADOR: Cômodos incompatíveis (diferença > 1) ──────────────────
  const itemSuites = item.suites || 0;
  const itemQuartos = item.quartos || 0;
  const cCom = c.suites > 0 ? c.suites : c.quartos;
  const iCom = itemSuites > 0 ? itemSuites : itemQuartos;
  if (cCom > 0 && iCom > 0 && Math.abs(cCom - iCom) > 1) return { score: 0, razoes: [] };

  // ── BLOQUEADOR: Área muito discrepante (> 70%) ──────────────────────────
  const itemArea = item.area || 0;
  if (c.area > 0 && itemArea > 0) {
    const menor = Math.min(c.area, itemArea);
    const maior = Math.max(c.area, itemArea);
    if (maior / menor > 1.7) return { score: 0, razoes: [] };
  }

  // ── BLOQUEADOR: Área mínima ("acima de Xm") não atingida ────────────────
  if (c.areaMin && c.area > 0 && itemArea > 0 && itemArea < c.area * 0.90) return { score: 0, razoes: [] };
  if (item.areaMin && itemArea > 0 && c.area > 0 && c.area < itemArea * 0.90) return { score: 0, razoes: [] };

  // ── BLOQUEADOR: Impossibilidade física — imóvel pequeno × muitos cômodos
  if (c.area > 0 && c.area < 65 && (itemSuites >= 2 || itemQuartos >= 3)) return { score: 0, razoes: [] };
  if (itemArea > 0 && itemArea < 65 && (c.suites >= 2 || c.quartos >= 3)) return { score: 0, razoes: [] };

  // ── Pontuação de cômodos ────────────────────────────────────────────────
  if (c.suites > 0 && itemSuites > 0) {
    if (Math.abs(c.suites - itemSuites) <= 1) { score += 2; razoes.push(itemSuites + ' suítes'); }
  } else if (c.quartos > 0 && itemQuartos > 0 && c.suites === 0 && itemSuites === 0) {
    if (Math.abs(c.quartos - itemQuartos) <= 1) { score += 1; razoes.push(itemQuartos + ' qtos'); }
  }

  // ── Pontuação de área ───────────────────────────────────────────────────
  if (c.area > 0 && itemArea > 0) {
    const ok = c.areaMin ? itemArea >= c.area * 0.90 : Math.abs(itemArea - c.area) / c.area <= 0.25;
    if (ok) { score += 1; razoes.push(itemArea + 'm²'); }
  }

  // Se busca especifica setor mas item não tem setor detectado → exige ≥4 de outros critérios
  if (c.setores.length > 0 && itemSetores.length === 0 && score < 4) return { score: 0, razoes: [] };

  return { score, razoes };
}

// ── Modo de busca ────────────────────────────────────────────────────────────
let _modo = 'auto';
function setModo(m, el) {
  _modo = m;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  if (document.getElementById('buscar-input').value.trim()) executarBusca();
}

// ── Painel de critérios detectados ───────────────────────────────────────────
function renderCrit(c, emOfertas) {
  const modeLabel = emOfertas ? '→ buscando em Ofertas' : '→ buscando em Buscas';
  const chips = [
    '<span class="crit-chip mode">' + modeLabel + '</span>',
    '<span class="crit-chip tipo">🏠 ' + c.tipo + '</span>',
  ];
  if (c.setores.length) chips.push('<span class="crit-chip setor">📍 ' + c.setores.join(' | ') + '</span>');
  if (c.suites)        chips.push('<span class="crit-chip rooms">' + c.suites + ' suítes</span>');
  else if (c.quartos)  chips.push('<span class="crit-chip rooms">' + c.quartos + ' quartos</span>');
  if (c.area)          chips.push('<span class="crit-chip area">' + (c.areaMin?'≥':'≈') + c.area + 'm²</span>');
  if (c.valor)         chips.push('<span class="crit-chip valor">💰 R$' + c.valor.toLocaleString('pt-BR') + (c.isBusca ? ' (teto)' : '') + '</span>');
  return '<div class="crit-panel"><div class="crit-label">Critérios detectados</div><div class="crit-chips">' + chips.join('') + '</div></div>';
}

// ── Executa busca ────────────────────────────────────────────────────────────
function executarBusca() {
  const txt = document.getElementById('buscar-input').value.trim();
  if (!txt) return;

  const c = parseMsgLivre(txt);
  let emOfertas;
  if (_modo === 'ofertas') emOfertas = true;
  else if (_modo === 'buscas') emOfertas = false;
  else emOfertas = c.isBusca; // auto

  const fonte = emOfertas ? DS_OFERTAS : DS_BUSCAS;
  document.getElementById('buscar-crit').innerHTML = renderCrit(c, emOfertas);

  const scored = fonte
    .map(item => ({ ...item, ...scoreItem(item, c) }))
    .filter(i => i.score >= 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);

  const el = document.getElementById('buscar-resultados');
  if (!scored.length) {
    el.innerHTML = '<div class="buscar-empty"><b>Nenhum resultado encontrado</b><p>Verifique os critérios detectados acima.<br>Tente remover setor ou valor para ampliar a busca.</p></div>';
    return;
  }

  el.innerHTML = '<div class="buscar-count">' + scored.length + ' resultado(s) — ordenados por relevância</div>' +
    scored.map(r => {
      const sc = r.score;
      const bCls = sc >= 6 ? 'forte' : 'bom';
      const bTxt = sc >= 6 ? 'FORTE' : 'BOM';
      const tel = r.tel
        ? '<span class="res-tel" title="Copiar" onclick="navigator.clipboard.writeText(\\'' + r.tel + '\\')">📞 ' + r.tel + '</span>'
        : '';
      const emp = r.emp ? '<div class="res-emp">' + r.emp + '</div>' : '';
      const razoes = r.razoes.length ? '<div class="res-razoes">✓ ' + r.razoes.join(' · ') + '</div>' : '';
      const flds = [];
      if (r.tipo && r.tipo !== 'apartamento') flds.push(r.tipo);
      if (r.setores && r.setores.length)      flds.push('📍 ' + r.setores.join(', '));
      const rv = r.valor || r.orcamento || 0;
      if (rv) flds.push('R$' + rv.toLocaleString('pt-BR'));
      if (r.suites)       flds.push(r.suites + ' suítes');
      else if (r.quartos) flds.push(r.quartos + ' qtos');
      if (r.area)         flds.push(r.area + 'm²');
      const fldHtml = flds.length
        ? '<div class="res-fields">' + flds.map(f => '<span class="res-field">' + f + '</span>').join('') + '</div>'
        : '';
      const txt2 = r.txt.slice(0, 300).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      return '<div class="res-card">' +
        '<div class="res-header">' +
          '<span class="res-badge ' + bCls + '">' + bTxt + '</span>' +
          '<span class="res-de">' + (r.de || 'Desconhecido') + '</span>' +
          tel +
          '<span class="res-hora">' + r.hora + '</span>' +
        '</div>' +
        '<div class="res-grupo">📍 ' + (r.g || r.grupo || '') + '</div>' +
        emp + fldHtml + razoes +
        '<div class="res-txt">' + txt2 + (r.txt.length > 300 ? '…' : '') + '</div>' +
      '</div>';
    }).join('');
}

function limparBusca() {
  document.getElementById('buscar-input').value = '';
  document.getElementById('buscar-resultados').innerHTML = '';
  document.getElementById('buscar-crit').innerHTML = '';
}

// ── Filtrar parametrizado ────────────────────────────────────────────────────
const fState = {
  modo: 'ofertas',
  tipos: new Set(),
  fSuites: new Set(),
  fQuartos: new Set(),
  setores: new Set(),
  grupos: new Set(),
};

function initFiltrar() {
  // Setores
  const sEl = document.getElementById('f-setor-list');
  SETORES.forEach(function(s) {
    const lbl = document.createElement('label');
    lbl.className = 'f-list-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.value = s;
    cb.addEventListener('change', function() { toggleFSetor(this); });
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(' ' + s));
    sEl.appendChild(lbl);
  });
  // Grupos (união dos dois datasets)
  const todosGrupos = [...new Set([...DS_OFERTAS, ...DS_BUSCAS].map(function(i){ return i.g || i.grupo || ''; }).filter(Boolean))].sort();
  const gEl = document.getElementById('f-grupo-list');
  todosGrupos.forEach(function(g) {
    const lbl = document.createElement('label');
    lbl.className = 'f-list-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.value = g;
    cb.addEventListener('change', function() { toggleFGrupo(this); });
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(' ' + g));
    gEl.appendChild(lbl);
  });
  aplicarFiltros();
}

function setFModo(m) {
  fState.modo = m;
  document.getElementById('fm-ofertas').classList.toggle('sel', m === 'ofertas');
  document.getElementById('fm-buscas').classList.toggle('sel', m === 'buscas');
  aplicarFiltros();
}

function toggleFChip(el, key, val) {
  if (fState[key].has(val)) { fState[key].delete(val); el.classList.remove('sel'); }
  else { fState[key].add(val); el.classList.add('sel'); }
  aplicarFiltros();
}

function toggleFNum(el, key, val) {
  if (fState[key].has(val)) { fState[key].delete(val); el.classList.remove('sel'); }
  else { fState[key].add(val); el.classList.add('sel'); }
  aplicarFiltros();
}

function toggleFSetor(el) {
  if (el.checked) fState.setores.add(el.value);
  else fState.setores.delete(el.value);
  aplicarFiltros();
}

function toggleFGrupo(el) {
  if (el.checked) fState.grupos.add(el.value);
  else fState.grupos.delete(el.value);
  aplicarFiltros();
}

function aplicarFiltros() {
  const fonte = fState.modo === 'ofertas' ? DS_OFERTAS : DS_BUSCAS;
  let r = fonte;

  if (fState.tipos.size > 0)
    r = r.filter(function(i){ return fState.tipos.has(i.tipo || 'apartamento'); });

  if (fState.fSuites.size > 0)
    r = r.filter(function(i){ const s = i.suites||0; return [...fState.fSuites].some(function(v){ return v===4 ? s>=4 : s===v; }); });

  if (fState.fQuartos.size > 0)
    r = r.filter(function(i){ const q = i.quartos||0; return [...fState.fQuartos].some(function(v){ return v===4 ? q>=4 : q===v; }); });

  const vMin = parseInt(document.getElementById('f-vmin').value)||0;
  const vMax = parseInt(document.getElementById('f-vmax').value)||0;
  if (vMin > 0 || vMax > 0) {
    r = r.filter(function(i){
      const v = i.valor||i.orcamento||0;
      if (!v) return false;
      if (vMin > 0 && v < vMin) return false;
      if (vMax > 0 && v > vMax) return false;
      return true;
    });
  }

  const aMin = parseInt(document.getElementById('f-amin').value)||0;
  const aMax = parseInt(document.getElementById('f-amax').value)||0;
  if (aMin > 0 || aMax > 0) {
    r = r.filter(function(i){
      const a = i.area||0;
      if (!a) return false;
      if (aMin > 0 && a < aMin) return false;
      if (aMax > 0 && a > aMax) return false;
      return true;
    });
  }

  if (document.getElementById('f-urgente').checked) r = r.filter(function(i){ return i.urgente; });
  if (document.getElementById('f-permuta').checked) r = r.filter(function(i){ return i.permuta; });
  if (document.getElementById('f-avista').checked)  r = r.filter(function(i){ return i.aVista; });

  if (fState.setores.size > 0)
    r = r.filter(function(i){ const iS = i.setores||[]; return [...fState.setores].some(function(s){ return iS.some(function(is){ return is.toLowerCase()===s.toLowerCase(); }); }); });

  if (fState.grupos.size > 0)
    r = r.filter(function(i){ return fState.grupos.has(i.g||i.grupo); });

  renderFiltros(r);
}

function renderFiltros(itens) {
  const el = document.getElementById('filtrar-resultados');
  const label = fState.modo === 'ofertas' ? 'oferta(s)' : 'busca(s)';

  if (!itens.length) {
    el.innerHTML = '<div class="f-count">0 ' + label + '</div><div class="f-empty"><b>Nenhum resultado</b><p>Tente remover alguns filtros.</p></div>';
    return;
  }

  const cards = itens.slice(0, 100).map(function(r) {
    const tel = r.tel
      ? '<span class="res-tel" title="Copiar" onclick="navigator.clipboard.writeText(\\'' + r.tel + '\\')">📞 ' + r.tel + '</span>'
      : '';
    const emp = r.emp ? '<div class="res-emp">' + r.emp + '</div>' : '';
    const flds = [];
    if (r.tipo && r.tipo !== 'apartamento') flds.push(r.tipo);
    if (r.setores && r.setores.length) flds.push('📍 ' + r.setores.join(', '));
    const rv = r.valor||r.orcamento||0;
    if (rv) flds.push('R$' + rv.toLocaleString('pt-BR'));
    if (r.suites) flds.push(r.suites + ' suítes');
    else if (r.quartos) flds.push(r.quartos + ' qtos');
    if (r.area) flds.push(r.area + 'm²');
    if (r.urgente) flds.push('🚨 URGENTE');
    if (r.permuta) flds.push('🔄 PERMUTA');
    if (r.aVista)  flds.push('💵 À VISTA');
    const fldHtml = flds.length
      ? '<div class="res-fields">' + flds.map(function(f){ return '<span class="res-field">' + f + '</span>'; }).join('') + '</div>'
      : '';
    const countBadge = (r.contagem >= 3) ? '<span class="res-badge" style="background:rgba(224,82,37,.15);color:#E05225;border-color:#E05225">🔥 ' + r.contagem + 'x</span>' : '';
    const txt2 = (r.txt||'').slice(0, 300).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return '<div class="res-card">' +
      '<div class="res-header">' +
        countBadge +
        '<span class="res-de">' + (r.de||'Desconhecido') + '</span>' +
        tel +
        '<span class="res-hora">' + r.hora + '</span>' +
      '</div>' +
      '<div class="res-grupo">📍 ' + (r.g||r.grupo||'') + '</div>' +
      emp + fldHtml +
      '<div class="res-txt">' + txt2 + ((r.txt||'').length > 300 ? '…' : '') + '</div>' +
    '</div>';
  }).join('');

  el.innerHTML = '<div class="f-count"><b>' + itens.length + '</b> ' + label + (itens.length > 100 ? ' — mostrando os primeiros 100' : '') + '</div>' + cards;
}

function limparFiltros() {
  fState.tipos.clear(); fState.fSuites.clear(); fState.fQuartos.clear();
  fState.setores.clear(); fState.grupos.clear();
  document.querySelectorAll('.f-chip').forEach(function(c){ c.classList.remove('sel'); });
  document.getElementById('f-vmin').value = '';
  document.getElementById('f-vmax').value = '';
  document.getElementById('f-amin').value = '';
  document.getElementById('f-amax').value = '';
  document.getElementById('f-urgente').checked = false;
  document.getElementById('f-permuta').checked = false;
  document.getElementById('f-avista').checked  = false;
  document.querySelectorAll('#f-setor-list input, #f-grupo-list input').forEach(function(i){ i.checked = false; });
  aplicarFiltros();
}

// Enter no textarea não submete — Ctrl+Enter executa
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('buscar-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.ctrlKey) executarBusca();
  });
  initFiltrar();
});
</script>
</body>
</html>`;

// ── Salva arquivos ──────────────────────────────────────────────────────────

const nomeRelatorio = `relatorio_${agora.toISOString().slice(0,10)}_${horaStr.replace(':','-')}.html`;

fs.writeFileSync('index.html', html, 'utf8');
fs.writeFileSync(nomeRelatorio, html, 'utf8');
console.log(`💾 index.html salvo`);
console.log(`💾 ${nomeRelatorio} salvo`);

// Atualiza historico.json
const novaEntrada = {
  arquivo: nomeRelatorio,
  label: `${dataStr.slice(0,5)} · ${horaStr} · ${totalAlto + totalMedio} matches`
};
historico.unshift(novaEntrada);
fs.writeFileSync('historico.json', JSON.stringify(historico, null, 2), 'utf8');
console.log(`📚 historico.json atualizado`);
console.log(`\n✅ Relatório gerado: ${totalAlto} ALTO + ${totalMedio} MÉDIO = ${totalAlto+totalMedio} matches`);
