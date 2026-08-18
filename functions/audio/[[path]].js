export async function onRequestGet(context) {
  const cache = caches.default;
  const cached = await cache.match(context.request);
  if (cached) return cached;

  const raw = context.params.path;
  const segments = Array.isArray(raw) ? raw : [raw];
  const rel = segments.map((part) => decodeURIComponent(String(part))).join('/');
  const encoded = rel.split('/').map(encodeURIComponent).join('/');
  const url = `https://cdn.jsdelivr.net/gh/yixhwy/manosaba_library@audio/audio/${encoded}`;
  const upstream = await fetch(url);

  const headers = new Headers(upstream.headers);
  headers.set('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
  headers.set('Access-Control-Allow-Origin', '*');
  const response = new Response(upstream.body, { status: upstream.status, headers });
  if (upstream.ok) context.waitUntil(cache.put(context.request, response.clone()));
  return response;
}
