import { spawn } from "node:child_process";

export type HttpResponse = {
  status: number;
  body: string;
};

/**
 * На Windows + локалка Node fetch режется TLS-fingerprint детектом
 * Cloudflare для api.mistral.ai и *.supabase.co. На Vercel/Linux всё ок.
 */
function shouldUseCurl(): boolean {
  if (process.env.VERCEL) return false; // на Vercel curl недоступен
  if (process.env.HTTP_FORCE === "fetch") return false;
  if (process.env.HTTP_FORCE === "curl") return true;
  return process.platform === "win32";
}

function fetchPost(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<HttpResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
    body: JSON.stringify(body),
    signal: controller.signal,
    cache: "no-store",
  })
    .then(async (res) => ({
      status: res.status,
      body: await res.text(),
    }))
    .finally(() => clearTimeout(timer));
}

function curlPost(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const args = [
      "-sS",
      "--max-time",
      String(Math.ceil(timeoutMs / 1000)),
      "--http1.1",
      "-w",
      "\n%{http_code}",
      "-X",
      "POST",
      url,
      "-H",
      "Content-Type: application/json; charset=utf-8",
    ];
    for (const [k, v] of Object.entries(headers)) {
      args.push("-H", `${k}: ${v}`);
    }
    args.push("--data-binary", "@-");

    const proc = spawn("curl", args, { windowsHide: true });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    proc.stdout.on("data", (c) => out.push(c));
    proc.stderr.on("data", (c) => err.push(c));
    proc.on("error", reject);
    proc.on("close", (code) => {
      const stderr = Buffer.concat(err).toString("utf-8");
      if (code !== 0) return reject(new Error(`curl ${code}: ${stderr.trim()}`));
      const text = Buffer.concat(out).toString("utf-8");
      const newline = text.lastIndexOf("\n");
      const status = Number(text.slice(newline + 1).trim());
      const responseBody = text.slice(0, newline);
      resolve({ status, body: responseBody });
    });
    proc.stdin.end(Buffer.from(JSON.stringify(body), "utf-8"));
  });
}

export async function httpPost(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  timeoutMs = 30_000
): Promise<HttpResponse> {
  return shouldUseCurl()
    ? curlPost(url, body, headers, timeoutMs)
    : fetchPost(url, body, headers, timeoutMs);
}

function fetchGet(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<HttpResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { method: "GET", headers, signal: controller.signal, cache: "no-store" })
    .then(async (res) => ({ status: res.status, body: await res.text() }))
    .finally(() => clearTimeout(timer));
}

function curlGet(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const args = [
      "-sS",
      "--max-time",
      String(Math.ceil(timeoutMs / 1000)),
      "--http1.1",
      "-w",
      "\n%{http_code}",
      url,
    ];
    for (const [k, v] of Object.entries(headers)) {
      args.push("-H", `${k}: ${v}`);
    }
    const proc = spawn("curl", args, { windowsHide: true });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    proc.stdout.on("data", (c) => out.push(c));
    proc.stderr.on("data", (c) => err.push(c));
    proc.on("error", reject);
    proc.on("close", (code) => {
      const stderr = Buffer.concat(err).toString("utf-8");
      if (code !== 0) return reject(new Error(`curl ${code}: ${stderr.trim()}`));
      const text = Buffer.concat(out).toString("utf-8");
      const newline = text.lastIndexOf("\n");
      const status = Number(text.slice(newline + 1).trim());
      const responseBody = text.slice(0, newline);
      resolve({ status, body: responseBody });
    });
  });
}

export async function httpGet(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 30_000
): Promise<HttpResponse> {
  return shouldUseCurl()
    ? curlGet(url, headers, timeoutMs)
    : fetchGet(url, headers, timeoutMs);
}

function fetchMethod(
  method: "PATCH" | "DELETE",
  url: string,
  body: unknown | null,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<HttpResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const init: RequestInit = {
    method,
    headers:
      body !== null
        ? { "Content-Type": "application/json; charset=utf-8", ...headers }
        : headers,
    signal: controller.signal,
    cache: "no-store",
  };
  if (body !== null) init.body = JSON.stringify(body);
  return fetch(url, init)
    .then(async (res) => ({ status: res.status, body: await res.text() }))
    .finally(() => clearTimeout(timer));
}

function curlMethod(
  method: "PATCH" | "DELETE",
  url: string,
  body: unknown | null,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const args = [
      "-sS",
      "--max-time",
      String(Math.ceil(timeoutMs / 1000)),
      "--http1.1",
      "-w",
      "\n%{http_code}",
      "-X",
      method,
      url,
    ];
    for (const [k, v] of Object.entries(headers)) {
      args.push("-H", `${k}: ${v}`);
    }
    if (body !== null) {
      args.push("-H", "Content-Type: application/json; charset=utf-8");
      args.push("--data-binary", "@-");
    }

    const proc = spawn("curl", args, { windowsHide: true });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    proc.stdout.on("data", (c) => out.push(c));
    proc.stderr.on("data", (c) => err.push(c));
    proc.on("error", reject);
    proc.on("close", (code) => {
      const stderr = Buffer.concat(err).toString("utf-8");
      if (code !== 0) return reject(new Error(`curl ${code}: ${stderr.trim()}`));
      const text = Buffer.concat(out).toString("utf-8");
      const newline = text.lastIndexOf("\n");
      const status = Number(text.slice(newline + 1).trim());
      const responseBody = text.slice(0, newline);
      resolve({ status, body: responseBody });
    });

    if (body !== null) {
      proc.stdin.end(Buffer.from(JSON.stringify(body), "utf-8"));
    } else {
      proc.stdin.end();
    }
  });
}

export async function httpPatch(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  timeoutMs = 30_000
): Promise<HttpResponse> {
  return shouldUseCurl()
    ? curlMethod("PATCH", url, body, headers, timeoutMs)
    : fetchMethod("PATCH", url, body, headers, timeoutMs);
}

export async function httpDelete(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 30_000
): Promise<HttpResponse> {
  return shouldUseCurl()
    ? curlMethod("DELETE", url, null, headers, timeoutMs)
    : fetchMethod("DELETE", url, null, headers, timeoutMs);
}
