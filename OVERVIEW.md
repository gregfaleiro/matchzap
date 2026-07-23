# NexuHunt — Visão Geral do Projeto

**Relatório ao vivo:** https://gregfaleiro.github.io/matchzap/  
**Repositório:** https://github.com/gregfaleiro/matchzap

---

## O que é

NexuHunt é uma ferramenta de inteligência imobiliária da **Nexu Imobiliário** que monitora grupos de WhatsApp de corretores em Goiânia, identifica ofertas e buscas de imóveis, cruza os matches e gera um relatório HTML publicado automaticamente via GitHub Pages.

**Uso interno (Greg e Vinicius — Nexu):** o match vira oportunidade de captação direta.  
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
| `publicar.js` | Git commit + push → GitHub Pages publica em ~30 segundos |
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
   → GitHub Pages publica em ~30 segundos
   → URL: https://gregfaleiro.github.io/matchzap/
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

- **Header fixo (sticky):** logo NH, data/hora, nº de grupos + botão 🗂️ com dropdown de histórico
- **Stats:** matches ALTO (verde), MÉDIO (amarelo), compradores ativos (48h), ofertas no inventário, urgências
- **Aba Matches:** filtro por período (Hoje / Semana / 15 dias) + cards dois lados — busca (dourado) × oferta (teal) — com nome, horário, grupo, dados do imóvel e telefone
- **Aba Demanda:** tabela com todos os compradores no inventário — tipo, região, orçamento, condições, grupo e horário
- **Aba Alertas:** urgências (vermelho), gaps de captação (teal), permutas (roxo)
- **Aba Buscar:** campo livre — cola uma mensagem e encontra matches no inventário
- **Aba Filtrar:** filtros avançados (tipo, suítes, quartos, valor, área, condições, bairro, grupo)
- **Níveis de match:** ALTO (score ≥ 6), MÉDIO (score ≥ 5) — calculado por setor, valor, suítes, área
- **Badges de recência:** 🟢 hoje, 🟡 ontem, 🟠 X dias — no canto de cada card
- **Paginação:** 50 cards por vez com botão "Ver mais"
- **Texto expansível:** mensagens longas colapsadas com "Ver mais / Ver menos"
- **Telefone:** link direto para WhatsApp; botão copiar; LIDs filtrados automaticamente

---

## Algoritmo de matching

**Bloqueadores** (qualquer um impede o match):
1. Tipo incompatível (rural, terreno, lote, comercial, casa — quando ambos têm tipo específico)
2. Setor incompatível (ambos têm setor declarado e não coincidem)
3. Valor: oferta fora da faixa **70% – 115%** do orçamento declarado
4. Cômodos com diferença > 1
5. Área discrepante em > **35%** (fator 1.35x)
6. Área mínima declarada ("acima de Xm") — oferta abaixo do mínimo exato é bloqueada

**Pontuação** (score mínimo **5** para aparecer):
- Setor coincide: +2
- Valor dentro do range: +2
- Suítes coincidem (±1): +2
- Quartos coincidem (±1, sem suíte): +1
- Área compatível (±25%): +1

**Níveis:** ALTO ≥ 6 pontos | MÉDIO ≥ 5 pontos

---

## Identidade dos corretores

O WhatsApp usa IDs internos (`@lid`) nos grupos modernos, bloqueando o acesso direto ao número real.

**Estratégia atual:**
- `coletar.js` chama `msg.getContact()` com cache por autor → captura o `pushname` real
- Fallback: extrai telefone do corpo da mensagem via regex (padrão brasileiro 10-11 dígitos)
- IDs numéricos longos (LIDs) são filtrados do display — aparecem como "Corretor"
- Telefones válidos ganham link direto para WhatsApp (`wa.me/55...`)

> Corretores cujos nomes aparecem como "Corretor" ainda não foram coletados com a versão atualizada do `coletar.js`. Na próxima coleta, os pushnames serão capturados.

---

## Automação

Tarefa agendada **"NexuHunt Diario"** criada no Agendador de Tarefas do Windows:
- Executa `rodar_fluxo.bat` todo dia às **08:00**
- Roda o fluxo completo: coletar → exportar → filtrar → inventário → relatório → publicar
- Logs salvos em `logs/fluxo_YYYY-MM-DD.log`
- Para recriar: `powershell -ExecutionPolicy Bypass -File agendar_tarefa.ps1`

---

## Próximos passos pendentes

- [ ] **Contador regressivo em coletar.js** — exibir tempo restante durante a coleta (ex: `⏱ 7min restantes`)
- [ ] **Agrupamento de matches por comprador** — mostrar cada comprador 1x com N ofertas colapsadas, em vez de N cards separados
