// Service Worker – 暑假任务打卡积分系统 V3 → V4
// 缓存策略：JS/CSS/HTML → Stale-While-Revalidate（立即返回缓存，后台更新）
// 其他资源（图片、字体等）→ Cache First
const CACHE_NAME = 'daka-pwa-v13-20260705';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './manifest.webmanifest',
  './vendor/dexie.min.js',
  './src/db.js',
  './src/app.js',
  './src/engine.js',
  './src/rules.js',
  './src/backup.js',
  './src/utils.js',
  './src/styles/base.css',
  './src/styles/challenge.css',
  './src/styles/rewards.css',
  './src/styles/parent.css',
  './src/styles/growth.css',
  './src/ui/children/challenge.js',
  './src/ui/children/rewards.js',
  './src/ui/children/history.js',
  './src/ui/parent/confirm.js',
  './src/ui/parent/manage.js',
  './src/ui/parent/settings.js',
  './src/ui/parent/videolist.js',
  './src/ui/pin.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/avatars/avatar-football.svg',
  './assets/avatars/avatar-basketball.svg',
  './assets/avatars/avatar-robot.svg',
  './assets/avatars/avatar-dinosaur.svg',
  './assets/avatars/avatar-astronaut.svg',
  './assets/avatars/avatar-racing.svg',
  './assets/avatars/avatar-skateboard.svg',
  './assets/avatars/avatar-gamepad.svg'
];

// JS/CSS/HTML 文件扩展名的正则（需要后台更新的资源）
const AUTO_UPDATE_EXT = /\.(js|css|html|json)$/;

// Install: 预缓存所有静态资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      return self.skipWaiting();
    }).catch((err) => {
      console.warn('[SW] install cache.addAll 部分失败（非关键）:', err);
    })
  );
});

// Activate: 清理旧版本缓存 + 通知客户端刷新
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => {
          console.log('[SW] 清理旧缓存:', key);
          return caches.delete(key);
        })
      );
    }).then(() => {
      return self.clients.claim();
    }).then(() => {
      console.log('[SW] 已激活，缓存版本:', CACHE_NAME);
    })
  );
});

// 响应客户端的 SKIP_WAITING 消息（新版本立即激活）
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] 收到 SKIP_WAITING 指令，立即激活...');
    self.skipWaiting();
  }
});

// Fetch: Stale-While-Revalidate 策略
// 对于 JS/CSS/HTML/JSON 文件：立即返回缓存，同时发起网络请求更新缓存
// 对于其他资源：Cache First（缓存优先）
self.addEventListener('fetch', (event) => {
  // 跳过非 GET 请求
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 跳过 chrome-extension:// 等非 http(s) 请求
  if (!url.protocol.startsWith('http')) return;

  // 跳过 IndexedDB / Dexie 相关请求
  if (url.pathname.includes('__dbnames')) return;

  const isAutoUpdate = AUTO_UPDATE_EXT.test(url.pathname);

  if (isAutoUpdate) {
    // Stale-While-Revalidate：先返回缓存，后台更新
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cached) => {
          const fetchPromise = fetch(event.request).then((response) => {
            if (response && response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch((err) => {
            // 网络失败，不影响用户体验
            console.warn('[SW] fetch 更新失败:', url.pathname, err.message);
          });

          // 立即返回缓存（如果有），同时等待网络更新
          return cached || fetchPromise;
        });
      })
    );
  } else {
    // 其他资源（图片、字体等）：Cache First
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;

        return fetch(event.request).then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        }).catch(() => {
          // 离线且无缓存
          if (event.request.headers.get('accept').includes('text/html')) {
            return caches.match('./index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
    );
  }
});
