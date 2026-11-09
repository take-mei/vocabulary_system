// ブラウザ側でPDFから文字を取り出す(サーバーには文字だけを送る。PDFそのものは送らない)。
// pdf.js を使う。PDFは端末の中で読むので、ファイルサイズがVercelの通信上限に引っかからない。
// 文字が入っていない(画像だけの)PDFは、文字を取り出せない。その場合は likelyScanned が true になる。

export interface PdfTextResult {
  text: string;
  pages: number;
  chars: number;
  likelyScanned: boolean; // 1ページあたりの文字がごく少ない=画像だけのPDFの可能性が高い
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
}

// 1ページ分のテキスト項目を、行ごとにまとめて文字列にする
export function itemsToText(items: unknown[]): string {
  const lines: string[] = [];
  let line = '';
  let lastY: number | null = null;
  let prevEnd: number | null = null;

  const flush = () => {
    if (line.trim()) lines.push(line.replace(/[ \t]+$/g, ''));
    line = '';
    prevEnd = null;
  };

  for (const raw of items) {
    const item = raw as Partial<PdfTextItem>;
    if (typeof item.str !== 'string' || !item.transform) continue;
    const x = item.transform[4];
    const y = item.transform[5];
    const size = item.height || Math.abs(item.transform[3]) || 10;

    // 縦の位置が大きく変わったら、改行
    if (lastY !== null && Math.abs(y - lastY) > size * 0.6) flush();

    // 同じ行で、前の文字との間に隙間があれば、空白を入れる(単語がくっつかないように)
    if (prevEnd !== null && x - prevEnd > size * 0.25 && !line.endsWith(' ') && !item.str.startsWith(' ')) {
      line += ' ';
    }
    line += item.str;
    prevEnd = x + (item.width ?? 0);
    lastY = y;
    if (item.hasEOL) flush();
  }
  flush();
  return lines.join('\n');
}

export async function extractPdfText(file: File): Promise<PdfTextResult> {
  // 動的importで、PDFを読む時だけ読み込む(SSR時にwindow参照エラーを避ける・通常の画面を軽くする)
  const pdfjs: any = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.js',
    import.meta.url
  ).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  let doc: any;
  try {
    doc = await pdfjs.getDocument({ data }).promise;
  } catch (e: any) {
    if (e?.name === 'PasswordException') {
      throw new Error('パスワード付きのPDFは読み込めません');
    }
    throw new Error('PDFを読み込めませんでした(壊れているか、対応していない形式です)');
  }

  const pageTexts: string[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pageTexts.push(itemsToText(content.items));
      page.cleanup();
    }
  } finally {
    doc.destroy?.();
  }

  const text = pageTexts.join('\n\n').trim();
  const pages = pageTexts.length;
  return {
    text,
    pages,
    chars: text.length,
    likelyScanned: text.replace(/\s/g, '').length < pages * 40,
  };
}
