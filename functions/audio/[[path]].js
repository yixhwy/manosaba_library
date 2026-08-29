function parseAudioPath(context) {
  const raw = context.params && context.params.path;
  const segments = Array.isArray(raw) ? raw : [raw];
  if (segments.some((part) => part === undefined || part === null)) return null;

  try {
    const relativePath = segments.map((part) => decodeURIComponent(String(part))).join("/");
    if (!relativePath || relativePath.split("/").some((part) => !part || part === "." || part === "..")) {
      return null;
    }
    return relativePath;
  } catch {
    return null;
  }
}

async function fetchUpstream(urls, request, range) {
  const headers = new Headers();
  if (range) headers.set("Range", range);

  let lastResponse = null;
  for (const url of urls) {
    try {
      lastResponse = await fetch(url, {
        method: request.method,
        headers,
        redirect: "follow",
      });
      if (lastResponse.ok) return lastResponse;
    } catch {
      lastResponse = null;
    }
  }
  return lastResponse;
}

async function proxyAudio(context) {
  const request = context.request;
  const range = request.headers.get("Range");
  const cacheable = request.method === "GET" && !range;
  const cache = caches.default;

  if (cacheable) {
    const cached = await cache.match(request);
    if (cached && cached.status !== 206) return cached;
  }

  const relativePath = parseAudioPath(context);
  if (!relativePath) return new Response("Invalid audio path", { status: 400 });

  const encodedPath = relativePath.split("/").map(encodeURIComponent).join("/");
  const upstream = await fetchUpstream([
    `https://cdn.jsdelivr.net/gh/yixhwy/manosaba_library@audio/audio/${encodedPath}`,
    `https://raw.githubusercontent.com/yixhwy/manosaba_library/audio/audio/${encodedPath}`,
  ], request, range);

  if (!upstream) return new Response("Audio upstream unavailable", { status: 502 });

  const headers = new Headers(upstream.headers);
  headers.set("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  headers.set("Access-Control-Expose-Headers", "Accept-Ranges, Content-Length, Content-Range, Content-Type");
  headers.set("Accept-Ranges", "bytes");
  const response = new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });

  if (cacheable && upstream.ok) context.waitUntil(cache.put(request, response.clone()));
  return response;
}

export function onRequestGet(context) {
  return proxyAudio(context);
}

export function onRequestHead(context) {
  return proxyAudio(context);
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}