import { mkdirSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { logger } from "./logger.js";

export const UPLOAD_DIR =
  process.env.UPLOAD_DIR || join(import.meta.dirname, "../../uploads");

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "restai-images";
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || "";

/** Public web app URL — local uploads are proxied at /uploads/* by Next.js. */
const WEB_PUBLIC_BASE =
  process.env.APP_URL ||
  (process.env.CORS_ORIGINS || "http://localhost:3000").split(",")[0]?.trim() ||
  "http://localhost:3000";

function isR2Configured(): boolean {
  return Boolean(
    R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_PUBLIC_URL,
  );
}

let s3: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3) {
    s3 = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3;
}

export function resolveUploadFilePath(key: string): string {
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) {
    throw new Error("Chave de arquivo inválida");
  }
  const fullPath = resolve(UPLOAD_DIR, normalized);
  const root = resolve(UPLOAD_DIR);
  if (!fullPath.startsWith(root)) {
    throw new Error("Chave de arquivo inválida");
  }
  return fullPath;
}

function uploadToLocal(key: string, body: Buffer | Uint8Array, contentType: string) {
  const filePath = resolveUploadFilePath(key);
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, body);
  logger.info("Upload salvo localmente", { key, contentType });
}

function deleteFromLocal(key: string) {
  const filePath = resolveUploadFilePath(key);
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
) {
  if (isR2Configured()) {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return;
  }

  uploadToLocal(key, body, contentType);
}

export async function deleteFromR2(key: string) {
  if (isR2Configured()) {
    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      }),
    );
    return;
  }

  deleteFromLocal(key);
}

export function getPublicUrl(key: string): string {
  if (isR2Configured()) {
    return `${R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  }
  return `${WEB_PUBLIC_BASE.replace(/\/$/, "")}/uploads/${key}`;
}

export function isUsingLocalStorage(): boolean {
  return !isR2Configured();
}
