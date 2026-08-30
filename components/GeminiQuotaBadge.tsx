'use client';

import { useEffect, useState } from 'react';
import { GEMINI_DAILY_LIMIT, getGeminiUsageToday } from '@/lib/geminiQuota';

export default function GeminiQuotaBadge() {
  const [used, setUsed] = useState(0);

  useEffect(() => {
    setUsed(getGeminiUsageToday());
    // 同じページ内の別の場所でカウントが増えても表示に反映されるよう、簡易的にポーリングする
    const interval = setInterval(() => setUsed(getGeminiUsageToday()), 2000);
    return () => clearInterval(interval);
  }, []);

  const remaining = Math.max(GEMINI_DAILY_LIMIT - used, 0);

  return (
    <span
      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${
        remaining === 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
      }`}
      title="ブラウザ内での自己集計です。他の端末からの利用は反映されません。"
    >
      Gemini本日の残り: {remaining} / {GEMINI_DAILY_LIMIT}
    </span>
  );
}
