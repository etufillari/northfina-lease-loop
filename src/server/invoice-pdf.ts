import type { InvoiceDTO } from '@/server/lease-engine/contracts';

export function invoicePdf(invoice: InvoiceDTO): Uint8Array {
  const lines = [
    'LEASE LOOP',
    `Invoice ${invoice.number}`,
    `Status: ${invoice.status}`,
    `Issue date: ${invoice.issueDate}`,
    `Due date: ${invoice.dueDate}`,
    `Billing period: ${invoice.periodIndex}`,
    `Net: EUR ${(invoice.netCents / 100).toFixed(2)}`,
    `VAT: EUR ${(invoice.vatCents / 100).toFixed(2)}`,
    `Total: EUR ${(invoice.grossCents / 100).toFixed(2)}`,
  ];
  const stream = `BT\n/F1 18 Tf\n72 750 Td\n${lines
    .map(
      (line, index) => `(${escapePdfText(line)}) Tj${index === lines.length - 1 ? '' : ' 0 -28 Td'}`
    )
    .join('\n')}\nET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

function escapePdfText(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}
