/**
 * Edu Bridge - Service Worker
 * Network-first for pages/scripts, cache-first for videos.
 */
var CACHE_NAME = 'edubridge-lessons-v3';
var VIDEO_CACHE_NAME = 'edubridge-videos-v3';

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function() {
            return self.skipWaiting();
        })
    );
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        (async function() {
            var keys = await caches.keys();
            await Promise.all(
                keys
                    .filter(function(k) { return k !== CACHE_NAME && k !== VIDEO_CACHE_NAME; })
                    .map(function(k) { return caches.delete(k); })
            );
            self.clients.claim();
        })()
    );
});

self.addEventListener('fetch', function(event) {
    if (event.request.method !== 'GET') return;

    var reqUrl = event.request.url || '';
    if (!reqUrl.startsWith('http://') && !reqUrl.startsWith('https://')) return;

    var url = new URL(reqUrl);

    // Cache-first for video streams and mp4 files (offline playback)
    var isVideo = url.pathname.startsWith('/lesson-video/') ||
                  url.pathname.endsWith('.mp4') ||
                  url.pathname.includes('/vid/');

    if (isVideo) {
        event.respondWith(
            caches.open(VIDEO_CACHE_NAME).then(function(cache) {
                return cache.match(event.request).then(function(cached) {
                    if (cached) return cached;
                    // Only cache full (non-range) responses to avoid 206 errors
                    return fetch(event.request).then(function(response) {
                        if (response.ok && response.status === 200) {
                            cache.put(event.request, response.clone());
                        }
                        return response;
                    }).catch(function() {
                        return new Response('Video not available offline', {
                            status: 503, statusText: 'Service Unavailable'
                        });
                    });
                });
            })
        );
        return;
    }

    // Network-first for everything else (HTML, JS, CSS, API calls)
    // This ensures updated files are always served fresh
    event.respondWith(
        fetch(event.request).then(function(response) {
            if (response.ok) {
                var clone = response.clone();
                caches.open(CACHE_NAME).then(function(cache) {
                    cache.put(event.request, clone);
                });
            }
            return response;
        }).catch(function() {
            // Offline fallback: serve from cache
            return caches.match(event.request).then(function(cached) {
                if (cached) return cached;
                if (event.request.mode === 'navigate') {
                    return caches.match('index.html');
                }
                return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
            });
        })
    );
});
