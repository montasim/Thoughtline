import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { AppError } from './errors';
import { normalizeUntrustedText } from '../shared/text';

GlobalWorkerOptions.workerSrc = workerUrl;

export async function extractProfessionalPdfText(file: File): Promise<string> {
  if (file.type !== 'application/pdf' || file.size > 10 * 1024 * 1024) {
    throw new AppError('invalid-input', 'Choose a LinkedIn PDF up to 10 MB.');
  }
  const documentValue = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
    .promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= Math.min(documentValue.numPages, 40); pageNumber += 1) {
    const page = await documentValue.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter(Boolean)
        .join(' '),
    );
  }
  const stripped = stripContactDetails(normalizeUntrustedText(pages.join('\n'))).slice(0, 40_000);
  if (stripped.length < 80)
    throw new AppError('invalid-input', 'The PDF contains too little professional text.');
  return stripped;
}

function stripContactDetails(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email removed]')
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, '[phone removed]')
    .replace(
      /https?:\/\/(?:www\.)?(?:linkedin\.com\/in\/|github\.com\/)[^\s]+/gi,
      '[profile link removed]',
    );
}
