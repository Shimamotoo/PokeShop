import { createHmac, randomUUID } from 'node:crypto';
import type { AllowedPhotoMimeType } from '@pokeshop/shared';

export type PresignedUploadInput = {
  sellerId: string;
  fileName: string;
  contentType: AllowedPhotoMimeType;
  fileSize: number;
};

export type PresignedUploadResult = {
  s3Key: string;
  uploadUrl: string;
  expiresIn: number;
};

export type PresignedDownloadResult = {
  s3Key: string;
  downloadUrl: string;
  expiresIn: number;
};

export interface S3StorageProvider {
  createPresignedUploadUrl(input: PresignedUploadInput): Promise<PresignedUploadResult>;
  createPresignedDownloadUrl(s3Key: string): Promise<PresignedDownloadResult>;
}

export type S3StorageConfig = {
  bucketName?: string;
  region?: string;
  endpoint?: string;
  signingSecret?: string;
  ttlSeconds?: number;
};

const EXTENSION_BY_MIME: Record<AllowedPhotoMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function sanitizeBaseName(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^/.]+$/, '');
  const slug = withoutExt
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'exemplar';
}

export function createS3StorageProvider(config: S3StorageConfig = {}): S3StorageProvider {
  const bucketName = config.bucketName ?? process.env.S3_BUCKET_NAME ?? 'pokeshop-private-media';
  const region = config.region ?? process.env.AWS_REGION ?? 'sa-east-1';
  const endpoint =
    config.endpoint ??
    process.env.S3_ENDPOINT ??
    `https://${bucketName}.s3.${region}.amazonaws.com`;
  const signingSecret =
    config.signingSecret ?? process.env.S3_SIGNING_SECRET ?? 'pokeshop-dev-s3-secret';
  const ttlSeconds = config.ttlSeconds ?? 900; // 15 minutos (ADR-003)

  function signOperation(method: 'PUT' | 'GET', s3Key: string, extra = ''): string {
    return createHmac('sha256', signingSecret)
      .update(`${method}:${bucketName}:${s3Key}:${ttlSeconds}:${extra}`)
      .digest('hex');
  }

  return {
    async createPresignedUploadUrl(input: PresignedUploadInput): Promise<PresignedUploadResult> {
      const ext = EXTENSION_BY_MIME[input.contentType];
      const baseName = sanitizeBaseName(input.fileName);
      const s3Key = `listings/${input.sellerId}/${randomUUID()}-${baseName}.${ext}`;
      const signature = signOperation('PUT', s3Key, `${input.contentType}:${input.fileSize}`);

      const uploadUrl = `${endpoint}/${encodeURI(s3Key)}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${ttlSeconds}&X-Amz-Content-Type=${encodeURIComponent(
        input.contentType
      )}&X-Amz-Content-Length=${input.fileSize}&X-Amz-Signature=${signature}`;

      return {
        s3Key,
        uploadUrl,
        expiresIn: ttlSeconds,
      };
    },

    async createPresignedDownloadUrl(s3Key: string): Promise<PresignedDownloadResult> {
      const signature = signOperation('GET', s3Key);
      const downloadUrl = `${endpoint}/${encodeURI(s3Key)}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${ttlSeconds}&X-Amz-Signature=${signature}`;

      return {
        s3Key,
        downloadUrl,
        expiresIn: ttlSeconds,
      };
    },
  };
}
