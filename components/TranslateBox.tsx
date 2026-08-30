'use client';

import { useState } from 'react';
import { WordSetType } from '@/lib/types';
import { getGeminiRemainingToday, recordGeminiUsage } from '@/lib/geminiQuota';
import GeminiQuotaBadge from '@/components/GeminiQuotaBadge';

interface TranslationResult {
  mean: string;
  phonetic: string | null;
}

export default function TranslateBox() {
  const [word, setWord] = useState('');
  const [type, setType] = useState<WordSetType>('english');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TranslationResult | null>(null);

  async function handleTranslate(e: React.FormEvent) {
    e.preventDefault();
    if (!word.trim()) return;

    if (getGeminiRemainingToday() <= 0) {
      setError('本日のGemini利用上限に達しています。日を改めて実行してください。');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: word.trim(), type }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? '翻訳に失敗しました');
      } else {
        recordGeminiUsage();
        setResult({ mean: json.mean, phonetic: json.phonetic ?? null });
      }
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold">🔤 単語を翻訳</h2>
        <GeminiQuotaBadge />
      </div>
      <form onSubmit={handleTranslate} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <input
          value={word}
          onChange={(e) => setWord(e.target.value)}
          placeholder={type === 'english' ? '英単語を入力' : '古語を入力'}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
        />
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value as WordSetType);
            setResult(null);
            setError(null);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="english">英単語 → 日本語訳</option>
          <option value="kobun">古語 → 現代語訳</option>
        </select>
        <button
          type="submit"
          disabled={loading || !word.trim()}
          className="rounded-lg bg-primary-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? '翻訳中...' : '翻訳する'}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

      {result && (
        <div className="mt-3 rounded-xl bg-primary-50 p-3">
          <p className="text-lg font-bold text-primary-800">{result.mean}</p>
          {result.phonetic && (
            <p className="mt-1 text-sm text-primary-600">[{result.phonetic}]</p>
          )}
        </div>
      )}
    </section>
  );
}
