function extrairTelDoTexto(txt) {
  const matches = txt.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)(?:9\s?)?\d{4}[\s.\-]?\d{4}/g);
  if (!matches) return '';
  for (const m of matches) {
    const d = m.replace(/[^0-9]/g, '');
    const num = (d.startsWith('55') && d.length > 11) ? d.slice(2) : d;
    if (num.length >= 10 && num.length <= 11) return num;
  }
  return '';
}

module.exports = { extrairTelDoTexto };
