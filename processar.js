const fs = require('fs');

async function processar() {
  const dados = JSON.parse(fs.readFileSync('coleta_2026-06-24.json', 'utf8'));

  const prompt = `Você é o motor de análise do MatchZap — sistema de cruzamento de oferta e demanda imobiliária em grupos de WhatsApp de corretores em Goiânia.

Analise as mensagens abaixo e gere um relatório com três seções:

SEÇÃO 1 — MATCHES DO DIA
Para cada busca, verifique se existe oferta compatível. Classifique: ALTO (setor + valor + tipologia batem), MÉDIO (2 critérios), BAIXO (1 critério).
Para cada match: Buscador | Critério | Imóvel compatível | Corretor | Valor | Nível | Observação

SEÇÃO 2 — DEMANDA ATIVA HOJE
Perfis de compradores ativos com critérios principais. Útil para direcionar captação.

SEÇÃO 3 — ALERTAS
Tipologias com excesso de oferta, urgências declaradas, oportunidades raras.

DADOS:
${JSON.stringify(dados, null, 2)}

Responda em português. Direto e objetivo. Foco no valor comercial real.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await response.json();
  const texto = data.content[0].text;
  console.log(texto);
  fs.writeFileSync('relatorio_matchzap.txt', texto, 'utf8');
  console.log('\n✅ Relatório salvo em relatorio_matchzap.txt');
}

processar().catch(console.error);