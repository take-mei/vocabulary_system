'use client';

import { useEffect, useState } from 'react';
import { flushPendingActions, getPendingCount } from '@/lib/offlineStore';

export default function SyncStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  async function trySync() {
    if (!navigator.onLine) return;
    setSyncing(true);
    try {
      await flushPendingActions();
    } finally {
      setPending(getPendingCount());
      setSyncing(false);
    }
  }

  useEffect(() => {
    setIsOnline(navigator.onLine);
    setPending(getPendingCount());

    const handleOnline = () => {
      setIsOnline(true);
      trySync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 他の画面(出題画面など)でキューに積まれた分も拾えるよう、定期的に件数を確認する
    const interval = setInterval(() => setPending(getPendingCount()), 3000);

    if (navigator.onLine) trySync();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  if (isOnline && pending === 0) return null;

  return (
    <div className="mb-4 flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <span>
        {!isOnline && '📴 オフラインです。'}
        {pending > 0 && ` 未送信の学習記録が${pending}件あります。`}
      </span>
      {isOnline && pending > 0 && (
        <button
          onClick={trySync}
          disabled={syncing}
          className="whitespace-nowrap rounded-md bg-amber-600 px-2 py-1 font-semibold text-white disabled:opacity-50"
        >
          {syncing ? '送信中...' : '今すぐ同期'}
        </button>
      )}
    </div>
  );
}
