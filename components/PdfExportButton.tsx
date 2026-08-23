'use client';

import { useState } from 'react';

export default function PdfExportButton({
  targetId,
  fileName,
  label = 'PDFとして出力',
}: {
  targetId: string;
  fileName: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    const target = document.getElementById(targetId);
    if (!target) return;

    setBusy(true);
    try {
      // 動的importでクライアントバンドルにのみ含める(SSR時にwindow参照エラーを避ける)
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      const canvas = await html2canvas(target, {
        scale: 2, // 高解像度化(文字がにじまないように)
        useCORS: true,
        backgroundColor: '#ffffff',
      });

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      // 1ページに収まらない場合は、キャンバスを縦方向に分割して複数ページに出力する
      const pageHeightPx = (pageHeight * canvas.width) / imgWidth;
      let renderedHeightPx = 0;
      let pageIndex = 0;

      while (renderedHeightPx < canvas.height) {
        const sliceHeightPx = Math.min(pageHeightPx, canvas.height - renderedHeightPx);

        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeightPx;
        const ctx = pageCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(
            canvas,
            0,
            renderedHeightPx,
            canvas.width,
            sliceHeightPx,
            0,
            0,
            canvas.width,
            sliceHeightPx
          );
        }

        const imgData = pageCanvas.toDataURL('image/png');
        const sliceHeightMm = (sliceHeightPx * imgWidth) / canvas.width;

        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, sliceHeightMm);

        renderedHeightPx += sliceHeightPx;
        pageIndex += 1;
      }

      pdf.save(`${fileName}.pdf`);
    } catch (e) {
      alert('PDFの生成に失敗しました');
      // eslint-disable-next-line no-console
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={busy}
      className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
    >
      {busy ? '生成中...' : `📄 ${label}`}
    </button>
  );
}
