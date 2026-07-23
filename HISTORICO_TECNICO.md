# NexuHunt — Histórico Técnico

## O que aconteceu (julho 2026)

### Problema
A partir de ~10 de julho de 2026, o `coletar.js` parou de buscar histórico de mensagens.
Os grupos têm centenas de mensagens dos últimos 7 dias, mas só as mensagens em tempo real
(durante a execução do script) eram capturadas.

### Causa raiz
O WhatsApp Web atualizou para a versão **2.3000.1043xxx** e fez três mudanças internas que quebraram o `whatsapp-web.js`:

1. **Sistema de módulos**: Mudou de `window.require('WAWebNomeDoModulo')` para `window.Store.*`
2. **Serialização de IDs**: IDs de mensagens/chats migraram de `._serialized` para `.$1`
3. **API de mensagens**: `WAWebChatLoadMessages.loadEarlierMsgs` substituído por `WAWebDBMessageFindLocal`

O `whatsapp-web.js` v1.34.7 usava `window.require('WAWebCollections').Chat.getModelsArray()` para listar chats
e `WAWebChatLoadMessages.loadEarlierMsgs()` para histórico — ambos quebraram com o erro minificado `r: r` / `t: t`.

---

## O que foi tentado

### Tentativa: Baileys (@whiskeysockets/baileys 7.0.0-rc13)
Reescrevemos o `coletar.js` para usar o protocolo móvel (Baileys) ao invés do WhatsApp Web.

**Funciona:** autenticação, grupos, mensagens em tempo real
**NÃO funciona:** histórico de mensagens

O `sock.fetchMessageHistory()` do Baileys só funciona com cursor real (chave de mensagem existente),
e depende que o celular principal responda ao pedido HISTORY_SYNC_ON_DEMAND.
Na prática: só funciona para grupos onde alguma mensagem chegou em tempo real.
Grupos sem atividade recente ficam sem histórico.

**Resultado da abordagem Baileys:** ~50 mensagens (vs. centenas possíveis com whatsapp-web.js).

---

## A solução

### Fork com fix: jolicristo/whatsapp-web.js

**PR #201837** no repo `wwebjs/whatsapp-web.js` — fechado sem merge pelos mantenedores, mas o fix é correto.

- **Fork:** `github:jolicristo/whatsapp-web.js#fix/wa-web-compat`
- **Issues relacionadas:** #201800, #201793, #5733

**O que o PR corrige:**
- Nova helper `window.WWebJS.widSerialized()` — suporta tanto `._serialized` quanto `.$1`
- `fetchMessages()` reescrito para usar `WAWebDBMessageFindLocal` com `msgFindByDirection`/`msgFindBefore`
- `getChatModel` e `getMessageModel` atualizados para o novo formato de ID

### Como reinstalar se quebrar de novo
```
# Em package.json, a linha de whatsapp-web.js deve ser:
"whatsapp-web.js": "github:jolicristo/whatsapp-web.js#fix/wa-web-compat"

# Depois:
npm install
```

---

## Estado dos arquivos

| Arquivo | Estado | Função |
|---|---|---|
| `coletar.js` | ✅ whatsapp-web.js | Busca histórico (1000 msgs/grupo) + 10min tempo real |
| `exportar.js` | ✅ OK | Filtra e exporta mensagens por período |
| `filtrar.js` | ✅ OK | Classifica mensagens em ofertas vs buscas |
| `atualizar_inventario.js` | ✅ OK | Merge filtrado_dia.json → inventario.json (15 dias, dedup) |
| `gerar_relatorio.js` | ✅ OK | Cruza matches e gera index.html + relatorio_*.html |
| `publicar.js` | ✅ OK | Git commit + push → GitHub Pages |
| `fluxo.js` | ✅ OK | Orquestra coletar → exportar → filtrar → inventário → relatório |
| `gerar_qr.js` | 🗄️ Baileys (não usado) | Gerava QR para sessão Baileys |
| `conectar.js` | 🗄️ Baileys (não usado) | Mantinha conexão Baileys ativa |
| `diagnostico_modulos.js` | 🔧 Diagnóstico | Inspeciona módulos internos do WhatsApp Web |

## Sessões
- `sessao/` — sessão Baileys (pode manter, não interfere)
- `sessao_wweb/` — sessão whatsapp-web.js (Chrome profile)
- **Na primeira execução:** pede QR para escanear com o WhatsApp do NexuHunt
- **Execuções seguintes:** autentica automaticamente (sessão persistente)

---

## Estrutura de dados das coletas

```json
{
  "Nome do Grupo": [
    {
      "de": "Nome do Remetente",
      "telefone": "5562999999999",
      "texto": "Texto da mensagem",
      "hora": "17/07/2026, 10:30:00",
      "empreendimento": "Residencial Xpto",
      "grupo": "Nome do Grupo"
    }
  ]
}
```

---

## Fluxo de execução

```
node fluxo.js
  → node coletar.js
      1. Conecta via Chrome (whatsapp-web.js + sessao_wweb/)
      2. Escaneia QR (primeira vez) ou autentica automaticamente
      3. Descobre todos os grupos
      4. Para cada grupo: chat.fetchMessages({ limit: 1000 })
      5. Filtra por período (desde última coleta, máx 7 dias)
      6. Aguarda 10 min para mensagens em tempo real
      7. Salva coleta_YYYY-MM-DD.json
  → node exportar.js
      8. Lê coleta, filtra por data, remove duplicatas
      9. Salva exportacao_dia_YYYY-MM-DD_HH-mm.json
```

---

---

## Atualizações — julho 2026

### 22/07/2026 — Renomeação, refinamento do matching, identidade de corretores

#### Renomeação: MatchZap → NexuHunt
- Nome antigo conflitava com outra ferramenta do mercado
- Novo nome reflete a marca mãe (Nexu Imobiliário) e a função (hunt = caça oportunidades)
- Atualizado em: `gerar_relatorio.js`, `package.json`, `coletar.js`, `rodar_fluxo.bat`, `agendar_tarefa.ps1`, documentação
- Logo no relatório: `MZ` → `NH`
- Tarefa agendada: "MatchZap Diario" → "NexuHunt Diario"

#### Migração Netlify → GitHub Pages
- Netlify esgotou os créditos operacionais gratuitos
- Repositório tornado público (`gh repo edit --visibility public`)
- GitHub Pages habilitado via API (`gh api .../pages`)
- URL mantida: `https://gregfaleiro.github.io/matchzap/`
- `publicar.js` atualizado para referenciar a nova URL

#### UX do relatório (renderização client-side)
- Cards de match migrados de server-side (HTML pré-renderizado) para client-side (DS_MATCHES JSON compacto)
- Filtros por período: **Hoje / Semana / 15 dias** — stats e contagem atualizam instantaneamente
- Paginação: 50 cards por vez + botão "Ver mais"
- Badge de recência por card: 🟢 hoje, 🟡 ontem, 🟠 X dias
- Separador visual ALTO → MÉDIO na listagem
- Texto longo colapsado com "Ver mais / Ver menos"
- Telefone com link WhatsApp e botão copiar

#### Refinamento do algoritmo de matching
Problema: 1.690 matches com falsos positivos evidentes (ex: busca R$ 2.8M × oferta R$ 1.45M aparecia como match).

Causa raiz: dois bugs no `calcScore()`:
1. Bloqueador de área mínima usava 90% da área declarada (`< b.area * 0.90`) — deveria ser o valor exato
2. Lower bound de preço era 50% do orçamento — muito permissivo

Correções aplicadas em `gerar_relatorio.js`:

| Parâmetro | Antes | Depois |
|---|---|---|
| Valor inferior | < 50% do orçamento | < **70%** do orçamento |
| Valor superior | > 120% do orçamento | > **115%** do orçamento |
| Área máx. diferença | fator **1.7x** (70%) | fator **1.35x** (35%) |
| Área mínima declarada | oferta < 90% do mínimo | oferta < **100%** do mínimo |
| Score mínimo MÉDIO | ≥ 4 | ≥ **5** |
| Score mínimo ALTO | ≥ 5 | ≥ **6** |

Resultado: **1.690 → 354 matches** (−79%), com qualidade significativamente maior.

#### Identidade de corretores (nomes e telefones)
Problema: WhatsApp usa IDs internos `@lid` (ex: `128050322792448`) nos grupos modernos — não são telefones reais.

Soluções implementadas:

**`coletar.js`:**
- `processarMensagem` tornou-se `async`
- Adicionado `getContactInfo()` com cache por autor → chama `msg.getContact()` para obter o `pushname` real
- Adicionado `extrairTelDoTexto()` → regex para extrair telefone brasileiro (10–11 dígitos) do corpo da mensagem
- LIDs não são mais armazenados como telefone (campo fica vazio)

**`gerar_relatorio.js`:**
- Adicionadas funções `resolverNome()` e `resolverTel()` no enriquecimento server-side
- Campos `nomeExibir` e `telExibir` adicionados a todos os itens de busca e oferta
- `_telHtml()` reescrito: LIDs (>13 dígitos) retornam vazio; números 10–11 dígitos ganham `+55` e link `wa.me`
- Cards mostram "Corretor" no lugar de IDs numéricos longos

#### Automação diária
- Criada tarefa agendada **"NexuHunt Diario"** no Agendador de Tarefas do Windows
- Horário: **08:00** todos os dias
- Executa `rodar_fluxo.bat` → fluxo completo + publicação automática
- `agendar_tarefa.ps1` atualizado com o novo nome

### 22/07/2026 (início do dia) — Filtro de período nos matches + fluxo completo automatizado

**O que mudou em `gerar_relatorio.js`:**
- Adicionada barra de botões **Hoje / Semana / 15 dias** na aba Matches do relatório HTML
- Cada card de match recebe atributo `data-ts` com o timestamp da busca (`ultimaVez`)
- Filtragem client-side instantânea via `filtrarPeriodo()` — sem recarregar página
- Contador de matches visíveis exibido ao lado dos botões
- Padrão inicial: **15 dias** (comportamento anterior preservado)

**Por que:** o cruzamento é feito sobre o inventário acumulado (15 dias), gerando ~1.690 matches.
Os botões permitem focar em compradores ativos de hoje ou da semana, reduzindo o ruído.

**Fluxo completo (`node fluxo.js`) confirmado funcional:**
- 833 mensagens coletadas de 10 grupos
- 418 ofertas + 95 buscas classificadas
- Inventário: 926 ofertas | 227 buscas
- 1.690 matches gerados (609 ALTO + 1.081 MÉDIO)

---

## Referências
- [PR #201837 - fix: compatibility WA Web 2.3000.1043xxx](https://github.com/wwebjs/whatsapp-web.js/pull/201837)
- [Issue #201800 - Puppeteer error r: r on getChatById](https://github.com/wwebjs/whatsapp-web.js/issues/201800)
- [Fork com fix: jolicristo/whatsapp-web.js](https://github.com/jolicristo/whatsapp-web.js/tree/fix/wa-web-compat)
- [Repo oficial: wwebjs/whatsapp-web.js](https://github.com/wwebjs/whatsapp-web.js)
