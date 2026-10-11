const PREFIX = "jarkanoid-offline-";
const META = PREFIX + "state";
const STATE = "/__offline_state__";
let job;
let progress;

self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

async function saved() {
  const cache = await caches.open(META);
  const response = await cache.match(STATE);
  return response ? response.json() : null;
}

async function status() {
  const state = await saved();
  if (!state || !(await caches.has(state.cache)))
    return { ready: false, progress };
  const cache = await caches.open(state.cache);
  const keys = new Set(
    (await cache.keys()).map((key) => new URL(key.url).pathname),
  );
  const ready = state.entries.every((entry) => keys.has(entry.url));
  return { ready, bytes: state.bytes, progress };
}

async function announce(value) {
  for (const client of await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  }))
    client.postMessage({ type: "offline-progress", ...value });
}

async function download() {
  const response = await fetch("/offline-manifest.json", { cache: "no-store" });
  if (!response.ok)
    throw new Error(
      "Could not load the download list. Connect to the internet and try again.",
    );
  const manifest = await response.json();
  const name = PREFIX + manifest.version;
  const cache = await caches.open(name);
  let cursor = 0;
  let completed = 0;
  let bytes = 0;
  let failure;
  progress = {
    completed,
    total: manifest.entries.length,
    bytes,
    totalBytes: manifest.bytes,
  };
  await announce({ progress });
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (cursor < manifest.entries.length && !failure) {
        const entry = manifest.entries[cursor++];
        try {
          if (!(await cache.match(entry.url))) {
            const file = await fetch(entry.url, { cache: "no-store" });
            if (!file.ok)
              throw new Error(
                "A game file could not be downloaded. Please try again.",
              );
            const data = await file.clone().arrayBuffer();
            const digest = await crypto.subtle.digest("SHA-256", data);
            const hash = Array.from(new Uint8Array(digest), (byte) =>
              byte.toString(16).padStart(2, "0"),
            ).join("");
            if (hash !== entry.sha256)
              throw new Error(
                "The game was updated during the download. Please try again.",
              );
            await cache.put(entry.url, file);
          }
          completed++;
          bytes += entry.bytes;
          progress = {
            completed,
            total: manifest.entries.length,
            bytes,
            totalBytes: manifest.bytes,
          };
          await announce({ progress });
        } catch (error) {
          failure = error;
        }
      }
    }),
  );
  if (failure) throw failure;
  await cache.put("/offline-manifest.json", Response.json(manifest));
  const meta = await caches.open(META);
  await meta.put(STATE, Response.json({ ...manifest, cache: name }));
  for (const key of await caches.keys())
    if (key.startsWith(PREFIX) && key !== META && key !== name)
      await caches.delete(key);
}

async function remove() {
  for (const name of await caches.keys())
    if (name.startsWith(PREFIX)) await caches.delete(name);
}

self.addEventListener("message", (event) => {
  const action = event.data?.action;
  if (!["status", "download", "remove"].includes(action)) return;
  event.waitUntil(
    (async () => {
      try {
        if (action !== "status") {
          if (job) throw new Error("A download is already in progress.");
          job = action === "download" ? download() : remove();
          try {
            await job;
          } finally {
            job = undefined;
            progress = undefined;
          }
        }
        const result = await status();
        event.ports[0]?.postMessage(result);
        if (action !== "status") await announce(result);
      } catch (error) {
        const result = {
          ...(await status().catch(() => ({ ready: false }))),
          error:
            error.name === "QuotaExceededError"
              ? "Not enough free space. Free some device storage, then try again."
              : error.name === "TypeError"
                ? "Download interrupted. Reconnect and try again to resume."
                : error.message ||
                  "Download interrupted. Reconnect and try again to resume.",
        };
        event.ports[0]?.postMessage(result);
        await announce(result);
      }
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (
    request.method !== "GET" ||
    new URL(request.url).origin !== self.location.origin
  )
    return;
  event.respondWith(
    (async () => {
      const state = await saved().catch(() => null);
      const cache =
        state && (await caches.has(state.cache))
          ? await caches.open(state.cache)
          : null;
      if (request.mode === "navigate") {
        try {
          const response = await fetch(request);
          if (response.ok) return response;
          const fallback = await cache?.match("/");
          return fallback || response;
        } catch (error) {
          const fallback = await cache?.match("/");
          if (fallback) return fallback;
          throw error;
        }
      }
      return (
        (await cache?.match(request, { ignoreVary: true })) || fetch(request)
      );
    })(),
  );
});
