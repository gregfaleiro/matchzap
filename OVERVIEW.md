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
| `coletar.js` | Conecta ao WhatsApp, busca histórico desde a última coleta (máx 7 dias), captura mensagens em tempo real por 10 minutos e salva em `coleta_YYYY-MM-DD.json` |
| `exportar.js` | Lê o(s) arquivo(s) de coleta, filtra pela janela de tempo, remove duplicatas e salva em `exportacao_dia_YYYY-MM-DD_HH-mm.json` |
| `filtrar.js` | Classifica mensagens em **ofertas** vs **buscas** e salva em `filtrado_dia.json` |
| `atualizar_inventario.js` | Merge de `filtrado_dia.json` no `inventario.json` — deduplicação por identidade+texto, expiração em 15 dias |
| `gerar_relatorio.js` | Cruza matches (buscas 48h × ofertas do inventário), gera `index.html` e `relatorio_YYYY-MM-DD_HH-mm.html` |
| `publicar.js` | Git commit + push → Netlify publica em ~30 segundos |
| `fluxo.js` | Orquestra tudo: coletar → exportar → filtrar → inventário → relatório |
| `rodar_fluxo.bat` | Atalho Windows para executar `fluxo.js` com log em `logs/` |
| `index.html` | Relatório HTML mais recente (publicado no Netlify) |
| `inventario.json` | Banco persistente com todas as ofertas e buscas dos últimos 15 dias |
| `historico.json` | Índice dos relatórios anteriores — botão 🗂️ no header |
| `.gitignore` | Exclui node_modules, sessões, coletas e exportações brutas |

---

## Fluxo completo de uso

```
# Comando único — faz tudo automaticamente:
node fluxo.js

Etapas internas:

1. COLETAR (coletar.js)
   → autentica automaticamente (sessao_wweb/) ou pede QR na 1ª vez
   → descobre todos os grupos participantes
   → busca histórico desde a última coleta (máx 7 dias)
   → captura mensagens em tempo real por 10 minutos
   → salva: coleta_YYYY-MM-DD.json + ultima_coleta.json

2. EXPORTAR (exportar.js)
   → lê coleta do dia, filtra por data, remove duplicatas
   → salva: exportacao_dia_YYYY-MM-DD_HH-mm.json

3. FILTRAR (filtrar.js)
   → classifica mensagens em ofertas vs buscas
   → salva: filtrado_dia.json

4. INVENTÁRIO (atualizar_inventario.js)
   → merge filtrado_dia.json → inventario.json
   → deduplicação por identidade + conteúdo
   → expira itens com mais de 15 dias sem reaparecer

5. RELATÓRIO (gerar_relatorio.js)
   → cruza buscas ativas (48h) × todas as ofertas do inventário
   → pontuação por setor, valor, suítes, área
   → salva: index.html + relatorio_YYYY-MM-DD_HH-mm.html

6. PUBLICAR (node publicar.js — separado)
   → git commit + push
   → Netlify publica em ~30 segundos
   → URL: https://venerable-figolla-8336dd.netlify.app
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
- **Stats:** matches ALTO (verde), MÉDIO (amarelo), compradores ativos (48h), ofertas no inventário, urgências
- **Aba Matches:** filtro por período (Hoje / Semana / 15 dias) + cards dois lados — busca (dourado) × oferta (teal) — com nome, horário, grupo, dados do imóvel e telefone
- **Aba Demanda:** tabela com todos os compradores no inventário — tipo, região, orçamento, condições, grupo e horário
- **Aba Alertas:** urgências (vermelho), gaps de captação (teal), permutas (roxo)
- **Aba Buscar:** campo livre — cola uma mensagem e encontra matches no inventário
- **Aba Filtrar:** filtros avançados (tipo, suítes, quartos, valor, área, condições, bairro, grupo)
- **Níveis de match:** ALTO (score ≥ 5), MÉDIO (score ≥ 4) — calculado por setor, valor, suítes, área

---

## Algoritmo de matching

**Bloqueadores** (qualquer um impede o match):
1. Tipo incompatível (rural, terreno, lote, comercial, casa — quando ambos têm tipo específico)
2. Setor incompatível (ambos têm setor declarado e não coincidem)
3. Valor com diferença > 20% (ou < 50% do orçamento)
4. Cômodos com diferença > 1
5. Área discrepante em > 70%
6. Área mínima declarada ("acima de Xm") não atingida

**Pontuação** (score mínimo 4 para aparecer):
- Setor coincide: +2
- Valor dentro de 20%: +2
- Suítes coincidem (±1): +2
- Quartos coincidem (±1, sem suíte): +1
- Área compatível (±25%): +1

---

## Próximos passos pendentes

- [ ] **Agendamento automático** — rodar `fluxo.js` + `publicar.js` todo dia às 8h via Agendador de Tarefas do Windows
- [ ] **Contador regressivo em coletar.js** — exibir tempo restante durante a coleta (ex: `⏱ 7min restantes`)
- [ ] **Telefone real de participantes de grupo** — WhatsApp blinda números com `@lid`; extrair do texto da mensagem com regex
