// RFC 4180 CSV: CRLF line breaks; fields with comma, quote, CR or LF are quoted; quotes doubled.

function cell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** rows: object[]; columns: [{key, label}] → CSV text with a header row. */
export function toCSV(rows, columns) {
  const lines = [columns.map((c) => cell(c.label)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => cell(r[c.key])).join(','));
  return lines.join('\r\n');
}
