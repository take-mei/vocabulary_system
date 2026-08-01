'use client';

import { useRef, useState } from 'react';
import Papa from 'papaparse';

export default function ImportCsv({
  setId,
  onImported,
}: {
  setId: string;
  onImported: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function handleFile(file: File) {
    setBusy(true);
    setStatus(null);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = (results.data as any[]).map((r) => ({
          word: r.word ?? r.Word ?? '',
          mean: r.mean ?? r.Mean ?? '',
          remarks: r.remarks ?? r.Remarks ?? '',
        }));

        try {
          const res = await fetch('/api/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ set_id: setId, rows }),
          });
          const json = await res.json();
          if (!res.ok) {
            setStatus(`エラー: ${json.error ?? 'インポートに失敗しました'}`);
          } else {
            setStatus(
              `${json.imported}件インポートしました${
                json.skipped ? `(${json.skipped}件スキップ)` : ''
              }`
            );
            onImported();
          }
        } catch (e) {
          setStatus('通信エラーが発生しました');
        } finally {
          setBusy(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      },
      error: () => {
        setStatus('CSVの解析に失敗しました');
        setBusy(false);
      },
    });
  }

  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4">
      <p className="mb-2 text-sm font-semibold text-gray-700">
        CSVインポート
      </p>
      <p className="mb-3 text-xs text-gray-500">
        1行目はヘッダー行にしてください。列: <code>word, mean, remarks</code>
        (remarksは任意)
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
        className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary-600 file:px-3 file:py-1.5 file:text-white"
      />
      {status && <p className="mt-2 text-xs text-gray-600">{status}</p>}
    </div>
  );
}
