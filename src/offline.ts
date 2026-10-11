type Progress = {
  completed: number;
  total: number;
  bytes: number;
  totalBytes: number;
};
type Status = {
  ready: boolean;
  bytes?: number;
  progress?: Progress;
  error?: string;
};
const supported =
  "serviceWorker" in navigator && "caches" in window && window.isSecureContext;
let registration: Promise<ServiceWorkerRegistration> | undefined;
let state: Status = { ready: false };
let busy = false;
const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

function worker() {
  registration ??= navigator.serviceWorker
    .getRegistration("/")
    .then(async (existing) => {
      if (existing?.active) {
        if (navigator.onLine) void existing.update().catch(() => {});
        return existing;
      }
      await navigator.serviceWorker.register("/sw.js", {
        updateViaCache: "none",
      });
      return navigator.serviceWorker.ready;
    })
    .catch((error) => {
      registration = undefined;
      throw error;
    });
  return registration;
}

async function request(action: string): Promise<Status> {
  const registration = await worker();
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(
      () => {
        channel.port1.close();
        reject(
          new Error(
            "The download was interrupted. Keep the game open and try again to resume.",
          ),
        );
      },
      action === "download" ? 15 * 60 * 1000 : 15000,
    );
    channel.port1.onmessage = (event) => {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(event.data);
    };
    registration.active!.postMessage({ action }, [channel.port2]);
  });
}

function render() {
  const container = document.querySelector<HTMLElement>("#offline-options");
  if (!container) return;
  const output = container.querySelector<HTMLElement>("#offline-status")!;
  const download =
    container.querySelector<HTMLButtonElement>("#offline-download")!;
  const remove = container.querySelector<HTMLButtonElement>("#offline-remove")!;
  const progress = container.querySelector<HTMLProgressElement>("progress")!;
  const working = busy || Boolean(state.progress);
  output.textContent = !supported
    ? "Offline downloads are unavailable in this browser."
    : state.error
      ? `${state.error}${state.ready ? " Your previous download is still ready." : ""}`
      : state.progress
        ? `Downloading ${mb(state.progress.bytes)} of ${mb(state.progress.totalBytes)} (${state.progress.completed}/${state.progress.total} files). Keep the game open.`
        : state.ready
          ? `Ready offline · ${mb(state.bytes!)} saved on this device.`
          : busy
            ? "Preparing download…"
            : "Download once while connected, then play without internet.";
  download.disabled = !supported || working;
  download.textContent = state.ready
    ? "Refresh offline download"
    : "Download for offline play";
  remove.disabled = !supported || working;
  progress.hidden = !state.progress;
  progress.max = state.progress?.totalBytes || 1;
  progress.value = state.progress?.bytes || 0;
}

async function act(action: string) {
  busy = true;
  state.error = undefined;
  render();
  try {
    if (action === "download")
      void navigator.storage?.persist?.().catch(() => false);
    state = await request(action);
  } catch (error) {
    state = { ...state, progress: undefined, error: (error as Error).message };
  } finally {
    busy = false;
    render();
  }
}

if (supported)
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type !== "offline-progress") return;
    state = event.data.progress
      ? { ...state, progress: event.data.progress }
      : event.data;
    render();
  });

export const offlineOptions = `<section id="offline-options" aria-labelledby="offline-heading"><h3 id="offline-heading">Play offline</h3><p>Save all 110 levels, music, sounds, and 3D scenes on this device (about 54 MB).</p><p id="offline-status" role="status" aria-live="polite"></p><progress aria-label="Offline download progress" hidden></progress><div class="offline-actions"><button id="offline-download">Download for offline play</button><button id="offline-remove">Remove download</button></div><p class="offline-hint">On iPhone: use Safari’s Share menu → Add to Home Screen. Open the game from that icon and download here before going offline. Your browser may clear downloads if device storage runs low. Scores and settings stay saved when you remove the download.</p></section>`;

export function mountOfflineOptions() {
  document.querySelector<HTMLButtonElement>("#offline-download")!.onclick =
    () => void act("download");
  document.querySelector<HTMLButtonElement>("#offline-remove")!.onclick = () =>
    void act("remove");
  render();
  if (supported)
    void request("status")
      .then((value) => {
        state = value;
        render();
      })
      .catch(() => {
        state.error =
          "Offline setup could not start. Connect to the internet and try again.";
        render();
      });
}
