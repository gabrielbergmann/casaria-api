/** Storage de arquivos (spec 006): o S3 em produção e um falso nos testes. */
export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export interface StoredObject {
  key: string;
  body: Buffer;
  contentType: string;
  /** Ausente no original, que não é servido publicamente. */
  cacheControl?: string;
}

export interface ObjectStorage {
  put(object: StoredObject): Promise<void>;
  /** Apaga todos os objetos cujas chaves começam por `prefix`. */
  deletePrefix(prefix: string): Promise<void>;
  /** URL de leitura pública da chave. */
  publicUrl(key: string): string;
}
