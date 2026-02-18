import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import mammoth from 'mammoth';

// Set workerSrc for pdfjs-dist. This uses Vite's import.meta.url to resolve path.
try {
  GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).toString();
} catch (e) {
  // fallback to CDN if URL resolution fails
  GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.81/pdf.worker.min.js';
}

const readArrayBuffer = async (blob) => {
  if (blob.arrayBuffer) return await blob.arrayBuffer();
  return await new Response(blob).arrayBuffer();
};

export const extractTextFromPDFArrayBuffer = async (arrayBuffer) => {
  const loadingTask = getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const maxPages = pdf.numPages || 0;
  let fullText = '';

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    try {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const strings = content.items.map((item) => item.str || item.toString());
      fullText += strings.join(' ') + '\n\n';
    } catch (err) {
      console.error('Error extracting page', pageNum, err);
    }
  }

  return fullText.trim();
};

export const extractTextFromDocxArrayBuffer = async (arrayBuffer) => {
  try {
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value || '';
  } catch (err) {
    console.error('DOCX extraction failed', err);
    return '';
  }
};

export const extractTextFromFile = async (fileOrBlob) => {
  // Accept File / Blob / ArrayBuffer
  try {
    // If it's already an ArrayBuffer
    if (fileOrBlob instanceof ArrayBuffer) {
      // Heuristic: cannot detect type — assume PDF first
      return await extractTextFromPDFArrayBuffer(fileOrBlob);
    }

    // If it's a File or Blob
    if (fileOrBlob instanceof Blob) {
      const type = fileOrBlob.type || '';
      const name = fileOrBlob.name || '';

      // Handle PDF
      if (type === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) {
        const arrayBuffer = await readArrayBuffer(fileOrBlob);
        return await extractTextFromPDFArrayBuffer(arrayBuffer);
      }

      // Handle DOCX
      if (
        type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        name.toLowerCase().endsWith('.docx')
      ) {
        const arrayBuffer = await readArrayBuffer(fileOrBlob);
        return await extractTextFromDocxArrayBuffer(arrayBuffer);
      }

      // Fallback: try to read as text
      try {
        const txt = await (fileOrBlob.text ? fileOrBlob.text() : new Response(fileOrBlob).text());
        return txt;
      } catch (err) {
        console.error('Fallback text read failed', err);
        return '';
      }
    }

    // If it's a URL string, fetch and process
    if (typeof fileOrBlob === 'string') {
      const res = await fetch(fileOrBlob);
      if (!res.ok) throw new Error('Failed to fetch file');
      const contentType = res.headers.get('Content-Type') || '';
      const blob = await res.blob();
      return await extractTextFromFile(blob);
    }

    return '';
  } catch (err) {
    console.error('extractTextFromFile error', err);
    return '';
  }
};
