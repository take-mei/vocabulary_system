// シンプルなService Worker。
// 目的: 一度開いたページのJS/CSS/HTMLをキャッシュしておき、電波が弱い/オフラインの時でも
// 「アプリの見た目」自体は開けるようにする(データはlib/offlineStore.tsのlocalStorageキャッシュを使う)。
const CACHE_NAME = 'word-app-shell-v3';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // ログイン関連はキャッシュしない(ログアウト後に古い内容が出たり、ログイン状態が混ざるのを防ぐ)
  // 管理者認証・ユーザー管理(/admin/login, /api/admin/*)も同様にキャッシュしない
  if (
    url.pathname === '/login' ||
    url.pathname === '/admin/login' ||
    url.pathname.startsWith('/api/auth/') ||
    url.pathname.startsWith('/api/admin/')
  ) {
    return;
  }

  // Next.jsのビルド成果物(ハッシュ付きファイル名)はcache-first: 一度取得したら再ダウンロード不要
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })
    );
    return;
  }

  // ページ本体(HTML/RSC)はnetwork-first: 通信できる時は最新を、失敗したらキャッシュにフォールバック
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        // リダイレクト(未ログイン時の/loginへの転送など)はキャッシュしない
        if (res.ok && !res.redirected) cache.put(request, res.clone());
        return res;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        return cached ?? Response.error();
      }
    })()
  );
});
