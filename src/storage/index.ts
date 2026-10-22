/**
 * Almacenamiento de objetos para snapshots en bruto y exportaciones.
 * - "s3": MinIO u otro servicio compatible con S3 (firmado con SigV4 vía aws4fetch).
 * - "local": carpeta en disco (desarrollo o hosting sin MinIO).
 * - "none": desactivado.
 * PostgreSQL sigue siendo la fuente de verdad: un fallo aquí nunca detiene el pipeline.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { AwsClient } from "aws4fetch";
import type { AppConfig } from "@/lib/config";

export interface ObjectStore {
  readonly driver: "local" | "s3" | "none";
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
}

function safeKey(key: string) {
  if (!/^[a-zA-Z0-9/_.:-]+$/.test(key) || key.includes("..")) throw new Error(`Clave de objeto no válida: ${key}`);
  return key;
}

class LocalStore implements ObjectStore {
  readonly driver = "local" as const;
  constructor(private root: string) {}
  async put(key: string, body: Uint8Array) {
    const file = path.resolve(this.root, safeKey(key));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
  }
  async get(key: string) {
    try {
      return new Uint8Array(await fs.readFile(path.resolve(this.root, safeKey(key))));
    } catch {
      return null;
    }
  }
}

class S3Store implements ObjectStore {
  readonly driver = "s3" as const;
  private client: AwsClient;
  constructor(
    private endpoint: string,
    private bucket: string,
    accessKeyId: string,
    secretAccessKey: string,
    region: string,
  ) {
    this.client = new AwsClient({ accessKeyId, secretAccessKey, region, service: "s3" });
  }
  private url(key: string) {
    return `${this.endpoint.replace(/\/+$/, "")}/${this.bucket}/${safeKey(key)}`;
  }
  async put(key: string, body: Uint8Array, contentType: string) {
    const res = await this.client.fetch(this.url(key), {
      method: "PUT",
      body: body as unknown as BodyInit,
      headers: { "content-type": contentType },
    });
    if (!res.ok) throw new Error(`S3 PUT ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  async get(key: string) {
    const res = await this.client.fetch(this.url(key));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`S3 GET ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
}

class NoopStore implements ObjectStore {
  readonly driver = "none" as const;
  async put() {}
  async get() {
    return null;
  }
}

export function createObjectStore(config: AppConfig): ObjectStore {
  if (config.STORAGE_DRIVER === "s3") {
    const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION } = config;
    if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
      throw new Error("STORAGE_DRIVER=s3 requiere S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID y S3_SECRET_ACCESS_KEY.");
    }
    return new S3Store(S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION);
  }
  if (config.STORAGE_DRIVER === "none") return new NoopStore();
  return new LocalStore(path.resolve(process.cwd(), config.LOCAL_STORAGE_DIR));
}

export async function putJsonSnapshot(store: ObjectStore, key: string, data: unknown) {
  await store.put(key, gzipSync(Buffer.from(JSON.stringify(data))), "application/gzip");
  return key;
}

export async function getJsonSnapshot<T = unknown>(store: ObjectStore, key: string): Promise<T | null> {
  const buf = await store.get(key);
  return buf ? (JSON.parse(gunzipSync(buf).toString("utf8")) as T) : null;
}
