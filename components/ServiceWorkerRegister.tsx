'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // オフライン対応が使えないだけなので、失敗しても致命的ではない
      });
    }
  }, []);

  return null;
}
