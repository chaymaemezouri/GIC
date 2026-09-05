import type { Response } from 'express';

type PdfColumn = { key: string; label: string; width?: number };

export function sendPdfTable(
  res: Response,
  filename: string,
  title: string,
  columns: PdfColumn[],
  rows: Record<string, unknown>[]
) {
  const escape = (v: unknown) =>
    String(v ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');

  const colWidths = columns.map((c) => c.width || Math.floor(500 / columns.length));
  const header = columns.map((c) => c.label).join(' | ');
  const body = rows.map((row) => columns.map((c) => String(row[c.key] ?? '')).join(' | '));
  const lines = [title, '', header, ...body];

  let y = 800;
  const content: string[] = ['BT', '/F1 10 Tf', '50 800 Td'];
  for (const line of lines) {
    if (y < 50) break;
    content.push(`(${escape(line)}) Tj`);
    content.push('0 -14 Td');
    y -= 14;
  }
  content.push('ET');

  const stream = content.join('\n');
  const len = stream.length;

  const pdf = `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length ${len} >>stream
${stream}
endstream endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000366 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
450
%%EOF`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(pdf, 'utf-8'));
}
