import { getLanguageDirection, getStoredLanguage, translateText } from '@/i18n/translations';

/**
 * Generate an HD PDF from a DOM element using html2canvas (dynamic import)
 */
export async function generateHDPreviewPDF(element: HTMLElement, filename: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const canvas = await html2canvas(element, {
    scale: 3,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });

  const pdfWidth = 210;
  const pdfHeight = 297;
  const imgWidth = pdfWidth;
  const imgHeight = (canvas.height * pdfWidth) / canvas.width;

  const pdf = new jsPDF('p', 'mm', 'a4');
  const imgData = canvas.toDataURL('image/png');

  let position = 0;
  let remainingHeight = imgHeight;

  pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
  remainingHeight -= pdfHeight;

  while (remainingHeight > 0) {
    position = remainingHeight - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    remainingHeight -= pdfHeight;
  }

  pdf.save(filename);
}

/**
 * Print HD preview directly via browser
 */
export function printHDPreview(element: HTMLElement) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const language = getStoredLanguage();
  const dir = getLanguageDirection(language);
  const title = translateText('common.preview', language);

  printWindow.document.write(`
    <html dir="${dir}">
    <head>
      <title>${title}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
         body { font-family: 'Segoe UI', Tahoma, sans-serif; direction: ${dir}; padding: 20mm; }
        @media print { body { padding: 10mm; } }
      </style>
    </head>
    <body>${element.innerHTML}</body>
    </html>
  `);
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); }, 500);
}
