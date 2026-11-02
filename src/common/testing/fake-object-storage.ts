import type { ObjectStorage, StoredObject } from '../../infra/s3/object-storage';

// Storage falso dos testes (spec 006 RNF04): guarda os objetos num Map e pode falhar na
// n-ésima gravação ou em toda exclusão, para exercitar as compensações.
export class FakeObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, StoredObject>();
  private puts = 0;
  failOnPut: number | null = null;
  failOnDelete = false;

  async put(object: StoredObject): Promise<void> {
    this.puts += 1;
    if (this.puts === this.failOnPut) throw new Error('storage indisponível');
    this.objects.set(object.key, object);
  }

  async deletePrefix(prefix: string): Promise<void> {
    if (this.failOnDelete) throw new Error('storage indisponível');
    for (const key of [...this.objects.keys()]) {
      if (key.startsWith(prefix)) this.objects.delete(key);
    }
  }

  publicUrl(key: string): string {
    return `https://storage.test/${key}`;
  }

  keys(): string[] {
    return [...this.objects.keys()].sort();
  }
}
