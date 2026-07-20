# MatchZap — Visão Geral do Projeto

**Relatório ao vivo:** https://venerable-figolla-8336dd.netlify.app  
**Repositório:** https://github.com/gregfaleiro/matchzap

---

## O que é

MatchZap é uma ferramenta de inteligência imobiliária que monitora grupos de WhatsApp de corretores em Goiânia, identifica ofertas e buscas de imóveis, cruza os matches e gera um relatório HTML publicado automaticamente via GitHub + Netlify.

**Uso interno (Greg e Vinicius — VORA):** o match vira oportunidade de captação direta.  
**Uso externo (corretores clientes):** o match é uma oportunidade de parceria 50/50.

---

## Arquivos principais

| Arquivo | Função |
|---|---|
| `coletar.js` | Conecta ao WhatsApp, busca histórico das últimas 24h de todos os grupos, captura mensagens em tempo real por 10 minutos e salva em `coleta_YYYY-MM-DD.json` |
| `exportar.js` | Lê o(s) arquivo(s) de coleta, filtra pela janela de tempo (--dia ou --semana), remove duplicatas e salva em `exportacao_dia_YYYY-MM-DD_HH-mm.json` |
| `resumir.js` | Filtra mensagens com palavras-chave imobiliárias e salva em `resumo.json` |
| `index.html` | Relatório HTML mais recente — dark theme, abas (Matches / Demanda / Alertas), cards dois lados (busca × oferta), botão de histórico |
| `relatorio_YYYY-MM-DD_HH-mm.html` | Cópias permanentes de cada relatório gerado |
| `historico.json` | Índice dos relatórios anteriores — carregado pelo botão 🗂️ no header |
| `PROMPT.md` | Instruções completas para o Claude processar o JSON e gerar o relatório HTML |
| `grupos_ignorados.json` | Lista de IDs de grupos a ignorar na coleta (opcional) |
| `.gitignore` | Exclui node_modules, sessao/, coleta_*.json, exportacao_*.json e outros dados temporários |

---

## Fluxo completo de uso

```
1. COLETAR
   node coletar.js
   → escaneia QR code (primeira vez) ou autentica automaticamente
   → descobre todos os grupos participantes
   → busca histórico das últimas 24h de cada grupo
   → captura mensagens em tempo real por 10 minutos
   → salva: coleta_YYYY-MM-DD.json

2. EXPORTAR
   node exportar.js
   → filtra mensagens das últimas 24h
   → remove duplicatas
   → salva: exportacao_dia_YYYY-MM-DD_HH-mm.json

3. GERAR RELATÓRIO (com Claude)
   → Abrir nova conversa com Claude
   → Colar o conteúdo do PROMPT.md
   → Colar o conteúdo do exportacao_dia_*.json
   → Claude filtra, extrai, cruza matches e escreve o index.html

4. SALVAR HISTÓRICO
   → Copiar index.html para relatorio_YYYY-MM-DD_HH-mm.html
   → Prepend nova entrada em historico.json:
     { "arquivo": "relatorio_YYYY-MM-DD_HH-mm.html", "label": "DD/MM · HHhMM · N matches" }

5. PUBLICAR
   git add index.html relatorio_*.html historico.json
   git commit -m "relatorio: atualiza DD/MM/YYYY"
   git push
   → Netlify publica automaticamente em ~30 segundos
```

---

## Grupos monitorados (descobertos dinamicamente)

- 🌟 Corretores Vip's 💎
- Só Mobiliados e Decorados
- BUSQUE IMÓVEIS 🚫 Ñ OFERTE
- BUSCAS💰- REVENDAS GOIÂNIA
- Anúncios da AutImob
- Comunidade AutImob

Grupos podem ser excluídos criando `grupos_ignorados.json` com array de IDs.

---

## Estrutura do relatório

- **Header fixo (sticky):** logo MZ, data/hora, nº de grupos + botão 🗂️ com dropdown de histórico
- **Stats:** matches ALTO (verde), MÉDIO (amarelo), compradores ativos, urgências
- **Aba Matches:** cards dois lados — busca (dourado) × oferta (teal) — com nome, horário, grupo, dados do imóvel e telefone
- **Aba Demanda:** tabela com todos os compradores ativos — tipo, região, orçamento, condições, grupo e horário
- **Aba Alertas:** urgências (vermelho), gaps de captação (teal), sobre-oferta (dourado), permutas (roxo)
- **Níveis de match:** ALTO (3 critérios), MÉDIO (2), BAIXO (1, com moderação)

---

## Próximos passos pendentes

- [ ] **Contador regressivo em coletar.js** — exibir tempo restante enquanto coleta (ex: `⏱ 7min restantes`)
- [ ] **Automatizar steps 2–5** — script `gerar.sh` ou `gerar.ps1` que exporta, chama Claude API e faz push
- [ ] **Telefone real de participantes de grupo** — WhatsApp blinda números com `@lid`; solução possível: extrair telefone do próprio texto da mensagem com regex
- [ ] **hoje.json padronizado** — criar alias no exportar.js para sempre salvar também como `hoje.json`
- [ ] **Atualização automática de historico.json** — ao gerar novo relatório, atualizar o JSON sem precisar editar manualmente
