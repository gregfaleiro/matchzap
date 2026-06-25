# MatchZap — Contexto e Instruções de Processamento

## O que é o MatchZap
Sistema de cruzamento de oferta e demanda imobiliária em grupos de WhatsApp de corretores em Goiânia. Coleta mensagens dos grupos, identifica ofertas e buscas, cruza os matches e gera um relatório HTML publicado automaticamente via GitHub + Netlify.

**Link do relatório:** https://venerable-figolla-8336dd.netlify.app
**Repositório:** https://github.com/gregfaleiro/matchzap

---

## Modelo de negócio — como o relatório será usado

### Uso interno (Greg e Vinicius — VORA)
O match vira oportunidade de **captação**: eles identificam o imóvel que deu match no mercado e vão captá-lo diretamente. O relatório precisa dar todas as informações para localizar o corretor no grupo e chegar ao imóvel.

### Uso externo (corretores clientes)
O match é uma **oportunidade de parceria**: o corretor que recebe o relatório pode linkar as duas partes (quem oferta + quem busca) e fechar em parceria 50/50.

**Consequência direta no design:** cada match precisa ter informação suficiente para o corretor agir sem precisar voltar ao grupo para descobrir quem é quem.

---

## Fluxo completo

```
node coletar.js        → coleta mensagens dos grupos (10 min)
node exportar.js       → filtra últimas 24h e salva hoje.json
[processar com Claude] → gera index.html com relatório
git add + commit + push → Netlify publica automaticamente
```

---

## Como processar o relatório

### Passo 1 — Filtrar mensagens relevantes (reduz tokens)
Antes de processar, filtrar apenas mensagens que contenham:
- Ofertas: "vendo", "à venda", "oportunidade", "ofereço", "parceria"
- Buscas: "busco", "busca", "procuro", "procurando", "cliente busca", "buscando"
- Ignorar: mensagens curtas (<20 chars), só emojis, só links, menções (@), bom dia, brigas

### Passo 2 — Extrair dados de cada OFERTA
- `empreendimento`: nome do prédio/condomínio (campo `empreendimento` ou extrair do texto)
- `setor`: localização / setor / bairro
- `area`: área em m²
- `quartos`: número de quartos / suítes
- `vagas`: vagas de garagem
- `valor`: valor em R$
- `corretor`: campo `de` (se for @lid, usar "Corretor não identificado")
- `telefone`: número se disponível no texto ou campo `telefone`
- `horario`: campo `hora`
- `grupo`: campo `grupo` — **OBRIGATÓRIO, sempre incluir**

### Passo 3 — Extrair dados de cada BUSCA
- `buscador`: campo `de` (se for @lid, usar "Corretor não identificado")
- `telefone`: número se disponível
- `setor_desejado`: localização desejada
- `tipologia`: quartos, área mínima, tipo (apto/casa/lote/comercial)
- `orcamento`: valor máximo em R$
- `condicoes`: observações importantes (urgência, permuta, financiamento, à vista, nunca habitado, etc.)
- `horario`: campo `hora`
- `grupo`: campo `grupo` — **OBRIGATÓRIO, sempre incluir**

### Passo 4 — Cruzar matches
Para cada busca, verificar quais ofertas atendem:
- **ALTO:** setor compatível + valor dentro do orçamento + tipologia adequada (3 critérios)
- **MÉDIO:** 2 critérios batem
- **BAIXO:** apenas 1 critério bate — incluir somente se relevante

---

## Design do relatório — Regras de UX

### Princípio central
**O relatório é uma ferramenta de ação, não uma listagem.** Cada match precisa ter informação suficiente para o corretor agir sem abrir o WhatsApp para descobrir quem é quem.

### Card de match — estrutura obrigatória

Cada card tem DOIS LADOS lado a lado (em mobile, empilhados):

**LADO ESQUERDO — BUSCA** (cor: dourado #C9A84C)
```
🔍 BUSCA
[Nome do buscador] ou "Corretor não identificado"
[Horário da mensagem]
📍 Grupo: [Nome exato do grupo]
─────────────────
Tipologia: [ex: Apto 2-3 quartos]
Região: [ex: Bueno, Jardim América]
Orçamento: [ex: Até R$600k]
Condições: [ex: À vista · Urgente · Aceita permuta]
```

**LADO DIREITO — OFERTA** (cor: teal #00C9A7)
```
🏠 OFERTA
[Nome do corretor] ou "Corretor não identificado"
[Horário da mensagem]
📍 Grupo: [Nome exato do grupo]
─────────────────
Empreendimento: [Nome em destaque bold]
Localização: [Setor/bairro]
Área: [Xm²] · Quartos: [X] · Vagas: [X]
Valor: [R$XXX.XXX]
[Telefone se disponível — em destaque]
```

**RODAPÉ DO CARD — Observação de match**
```
→ [Por que é compatível / o que falta / ação recomendada]
```

### Regras visuais obrigatórias

1. **Nome do grupo SEMPRE visível** em ambos os lados — é a informação que permite localizar o corretor quando não há telefone
2. **Horário SEMPRE visível** — permite encontrar a mensagem no grupo por data/hora
3. **Quando corretor não identificado (@lid):** mostrar "Corretor não identificado" + grupo + horário em destaque maior, pois são as únicas informações para localização
4. **Telefone disponível:** destacar em verde com ícone de telefone — é informação premium
5. **Empreendimento:** sempre em bold e destaque — é o ativo central da negociação
6. **Urgência:** badge vermelho "URGENTE" visível no card inteiro, não só no rodapé
7. **Permuta:** badge roxo "PERMUTA" — indica complexidade e oportunidade específica

### Badge de nível de match
- **ALTO** → fundo verde escuro, borda verde, texto verde
- **MÉDIO** → fundo amarelo escuro, borda amarela, texto amarelo
- **BAIXO** → fundo cinza, borda cinza — usar com moderação

---

## Estrutura completa do HTML

### Header fixo (sticky)
- Logo MatchZap (MZ em teal)
- Data e hora da geração
- "X grupos monitorados"

### Stats rápidos (4 números)
- Matches ALTO (verde)
- Matches MÉDIO (amarelo)
- Compradores ativos (branco)
- Urgências (vermelho)

### Navegação em abas (tabs sticky)
- 🎯 Matches (número)
- 🔍 Demanda (número)
- ⚠️ Alertas (número)

### Aba Matches
- Ordenação: ALTO primeiro, depois MÉDIO
- Primeiro match ALTO com destaque "⚡ AÇÃO IMEDIATA"
- Cards com os dois lados conforme especificado acima

### Aba Demanda Ativa
Tabela com todos os compradores ativos:
- Comprador | Tipo buscado | Região | Orçamento | Condições | Grupo | Horário

O campo Grupo e Horário são obrigatórios — permitem localizar o comprador para contato.

### Aba Alertas
Cards com bordas coloridas:
- 🚨 Vermelho: urgências e compradores quentes (à vista, urgente)
- 📍 Teal: gaps de captação (alta demanda, pouca oferta naquela região)
- ⚠️ Dourado: sobre-oferta (muita coisa igual no mesmo setor/faixa)
- 🔄 Roxo: permutas ativas
- 🏆 Azul: empreendimentos específicos com alta demanda

### Footer
"Gerado por MatchZap · [data] · [N] mensagens de [N] grupos do WhatsApp"

---

## Paleta de cores (dark theme)

```css
--bg:        #0B0F0E   /* fundo principal */
--surface:   #131918   /* cards */
--border:    #1E2B28   /* bordas */
--teal:      #00C9A7   /* cor principal / ofertas */
--teal-dim:  #00C9A715
--gold:      #C9A84C   /* buscas / regiões */
--gold-dim:  #C9A84C15
--red:       #E05252   /* urgências */
--red-dim:   #E0525215
--white:     #F0EDE6   /* texto principal */
--muted:     #6B7B78   /* texto secundário */
--alto:      #27AE60   /* badge ALTO */
--alto-dim:  #27AE6015
--medio:     #F39C12   /* badge MÉDIO */
--medio-dim: #F39C1215
--purple:    #9B59B6   /* permuta */
```

Fonte: Inter (texto) + JetBrains Mono (números, badges, labels)

---

## Deploy após gerar o HTML

```
git add index.html
git commit -m "relatorio: atualiza [DATA]"
git push
```

Netlify publica automaticamente em ~30 segundos.

---

## Comando padrão para o Warp

Quando o usuário pedir para gerar o relatório, executar:

1. Lê e filtra o `hoje.json` — manter só mensagens com palavras-chave de oferta ou busca
2. Extrai ofertas e buscas conforme estrutura acima
3. Cruza os matches
4. Gera o `index.html` seguindo todas as regras de UX deste documento
5. Faz `git add index.html && git commit -m "relatorio: atualiza $(date +%d/%m/%Y)" && git push`
6. Confirma o link: https://venerable-figolla-8336dd.netlify.app
