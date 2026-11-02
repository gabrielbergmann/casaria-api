import { Injectable } from '@nestjs/common';

/**
 * Anonimizador de dados pessoais de um módulo (spec 015 ADR-001): substitui campos em lote, sem
 * apagar linhas, e é idempotente. guests, rsvp e payments se registram; weddings não os importa.
 */
export interface PersonalDataAnonymizer {
  /** Tabelas cobertas, só para log. */
  readonly name: string;
  anonymize(weddingId: string): Promise<void>;
}

/** Registro dos anonimizadores, preenchido no onModuleInit dos módulos donos. */
@Injectable()
export class PersonalDataAnonymizers {
  private readonly anonymizers: PersonalDataAnonymizer[] = [];

  register(anonymizer: PersonalDataAnonymizer): void {
    this.anonymizers.push(anonymizer);
  }

  all(): readonly PersonalDataAnonymizer[] {
    return this.anonymizers;
  }
}
