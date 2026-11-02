import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import type { ObjectStorage, StoredObject } from './object-storage';

/**
 * Adapter do storage compatível com S3 (spec 006). A leitura pública das versões e a ausência de
 * listagem são configuradas no bucket pelo mantenedor; a aplicação não define ACL por objeto.
 */
@Injectable()
export class S3ObjectStorage implements ObjectStorage, OnModuleDestroy {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(config: ConfigService<Env, true>) {
    this.bucket = config.get('S3_BUCKET', { infer: true });
    this.publicBaseUrl = config.get('S3_PUBLIC_BASE_URL', { infer: true });
    this.client = new S3Client({
      endpoint: config.get('S3_ENDPOINT', { infer: true }),
      region: config.get('S3_REGION', { infer: true }),
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY_ID', { infer: true }),
        secretAccessKey: config.get('S3_SECRET_ACCESS_KEY', { infer: true }),
      },
      // Checksums só onde a API exige: serviços compatíveis nem sempre aceitam os opcionais.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async put(object: StoredObject): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: object.key,
        Body: object.body,
        ContentType: object.contentType,
        CacheControl: object.cacheControl,
      }),
    );
  }

  /** Lista e apaga em lotes de até 1.000 chaves, até não sobrar nada sob o prefixo. */
  async deletePrefix(prefix: string): Promise<void> {
    let continuationToken: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      const keys = (page.Contents ?? []).map((item) => ({ Key: item.Key }));
      if (keys.length > 0) {
        const result = await this.client.send(
          new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys, Quiet: true } }),
        );
        if (result.Errors?.length) {
          throw new Error(`falha ao apagar ${result.Errors.length} objetos`);
        }
      }
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
  }

  publicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }
}
