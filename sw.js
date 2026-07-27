/* Lindero — Service Worker (2026-07-24)
 * Resiliencia offline para el rancho con internet intermitente (Starlink):
 *  - Shell de la app (mismo origen): cache-first → carga sin conexión.
 *  - Librerías CDN (Leaflet/fuentes): stale-while-revalidate.
 *  - Tiles del mapa (Esri/Google/OSM): cache-first con tope LRU → el área ya vista
 *    sigue viéndose sin señal.
 *  - GET de la API (Render): network-first con respaldo a caché → últimos datos vistos.
 *  - Escrituras (POST/PATCH/DELETE) y todo lo no-GET: pasan directo a la red (no se cachean).
 * NOTA: un Service Worker solo se activa sobre HTTPS o localhost (no file://).
 */
const VER = 'lindero-v1';
const SHELL = `${VER}-shell`;
const CDN   = `${VER}-cdn`;
const TILES = `${VER}-tiles`;
const API   = `${VER}-api`;
const TILE_MAX = 600;   // tope de tiles cacheados (LRU aproximado)
const API_HOST = 'collar-gps-server.onrender.com';
const TILE_HOSTS = ['server.arcgisonline.com', 'google.com', 'openstreetmap.org'];
const CDN_HOSTS  = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

const SHELL_URLS = ['index.html', 'pruebas.html', 'manifest.webmanifest', 'icon.svg', './'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // Precache tolerante: si un recurso falla, no aborta la instalación.
    await Promise.all(SHELL_URLS.map(u => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.startsWith(VER)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const hostMatch = (h, list) => list.some(d => h === d || h.endsWith('.' + d) || h.endsWith(d));

async function trimCache(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  if (keys.length > max) { for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]); }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // escrituras: red directa
  let url; try { url = new URL(req.url); } catch (_) { return; }
  const host = url.hostname;

  // Tiles del mapa: cache-first (el área vista funciona offline)
  if (hostMatch(host, TILE_HOSTS)) {
    e.respondWith((async () => {
      const c = await caches.open(TILES);
      const hit = await c.match(req);
      if (hit) return hit;
      try { const res = await fetch(req); if (res && (res.ok || res.type === 'opaque')) { c.put(req, res.clone()); trimCache(TILES, TILE_MAX); } return res; }
      catch (_) { return hit || Response.error(); }
    })());
    return;
  }

  // CDN (Leaflet/fuentes): stale-while-revalidate
  if (hostMatch(host, CDN_HOSTS)) {
    e.respondWith((async () => {
      const c = await caches.open(CDN);
      const hit = await c.match(req);
      const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
    return;
  }

  // API de Render (GET): network-first, respaldo a caché (últimos datos)
  if (host === API_HOST) {
    e.respondWith((async () => {
      const c = await caches.open(API);
      try {
        const res = await fetch(req);
        if (res && res.ok) c.put(req, res.clone());
        return res;
      } catch (_) {
        const hit = await c.match(req);
        if (hit) { const h = new Headers(hit.headers); h.set('X-Lindero-Cache', '1'); return new Response(await hit.blob(), { status: 200, headers: h }); }
        return Response.error();
      }
    })());
    return;
  }

  // Mismo origen (shell/estáticos): cache-first, respaldo red
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(SHELL);
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) { fetch(req).then(res => { if (res && res.ok) c.put(req, res.clone()); }).catch(() => {}); return hit; }
      try { const res = await fetch(req); if (res && res.ok) c.put(req, res.clone()); return res; }
      catch (_) { return caches.match('index.html'); }
    })());
  }
});
