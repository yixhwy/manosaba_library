import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT || 3000);
const audioUpstreams = [
  "https://cdn.jsdelivr.net/gh/yixhwy/manosaba_library@audio/audio/",
  "https://raw.githubusercontent.com/yixhwy/manosaba_library/audio/audio/",
];

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ogg": "audio/ogg",
  ".txt": "text/plain; charset=utf-8",
};

function safeLocalPath(pathname) {
  const filePath = resolve(projectRoot, `.${decodeURIComponent(pathname)}`);
  const relativePath = relative(projectRoot, filePath);
  return !relativePath || (!relativePath.startsWith("..") && !relativePath.includes("..\\") && !relativePath.includes("../"))
    ? filePath
    : null;
}

function encodedAudioPath(pathname) {
  const raw = pathname.slice("/audio/".length);
  const parts = decodeURIComponent(raw).split("/");
  if (!raw || parts.some((part) => !part || part === "." || part === "..")) return null;
  return parts.map(encodeURIComponent).join("/");
}

function sendText(response, status, text) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(text);
}

async function proxyAudio(request, response, pathname) {
  let encodedPath;
  try {
    encodedPath = encodedAudioPath(pathname);
  } catch {
    sendText(response, 400, "Invalid audio path");
    return;
  }
  if (!encodedPath) {
    sendText(response, 400, "Invalid audio path");
    return;
  }

  const headers = {};
  if (request.headers.range) headers.Range = request.headers.range;
  let upstream = null;
  for (const base of audioUpstreams) {
    try {
      upstream = await fetch(`${base}${encodedPath}`, {
        method: request.method,
        headers,
        redirect: "follow",
      });
      if (upstream.ok) break;
    } catch {
      upstream = null;
    }
  }
  if (!upstream) {
    sendText(response, 502, "Audio upstream unavailable");
    return;
  }

  const responseHeaders = {
    "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Expose-Headers": "Accept-Ranges, Content-Length, Content-Range, Content-Type",
    "Accept-Ranges": "bytes",
    "Content-Type": upstream.headers.get("content-type") || "audio/ogg",
  };
  for (const name of ["content-length", "content-range"]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders[name] = value;
  }

  response.writeHead(upstream.status, responseHeaders);
  if (request.method === "HEAD" || !upstream.body) {
    response.end();
    return;
  }
  for await (const chunk of upstream.body) response.write(chunk);
  response.end();
}

function serveStatic(request, response, pathname) {
  let filePath;
  try {
    filePath = safeLocalPath(pathname);
  } catch {
    sendText(response, 400, "Invalid path");
    return;
  }
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    sendText(response, 404, "Not found");
    return;
  }
  const stat = statSync(filePath);
  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
    "Content-Length": stat.size,
    "Cache-Control": "no-cache",
  });
  if (request.method === "HEAD") response.end();
  else createReadStream(filePath).pipe(response);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://localhost");
  if (request.method === "OPTIONS" && url.pathname.startsWith("/audio/")) {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type",
      "Access-Control-Max-Age": "86400",
    });
    response.end();
    return;
  }
  if (url.pathname.startsWith("/audio/")) {
    await proxyAudio(request, response, url.pathname);
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendText(response, 405, "Method not allowed");
    return;
  }
  serveStatic(request, response, url.pathname === "/" ? "/index.html" : url.pathname);
});

server.listen(port, () => {
  console.log(`魔裁图书馆本地预览：http://localhost:${port}`);
  console.log("/audio/* 已启用本地同源代理，前端无需改用外部音频地址。");
});
