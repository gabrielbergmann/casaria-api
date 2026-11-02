import { Injectable } from '@nestjs/common';
import { Clock } from '../../common/time/clock';
import { EXPORT_CONTENT_TYPES, type ExportFormat, exportRows, toCsv, toXlsx } from './export-file';
import { OpenRsvpRepository } from './open-rsvp.repository';
import { type PersonStatus, RsvpRepository } from './rsvp.repository';

const PAGE_SIZE = 50;
const SAO_PAULO_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });

export interface AgeTotals {
  confirmed: number;
  pending: number;
  declined: number;
}

export interface RsvpSummary {
  adults: AgeTotals;
  children: AgeTotals;
  visitors: { confirmed: number; declined: number };
}

export interface ExportFile {
  body: Buffer;
  contentType: string;
  filename: string;
}

/** Totais, lista por pessoa e exportação para owner e editor (spec 010 RF11, RF12, RF14). */
@Injectable()
export class RsvpReportService {
  constructor(
    private readonly responses: RsvpRepository,
    private readonly openResponses: OpenRsvpRepository,
    private readonly clock: Clock,
  ) {}

  /** Contado no banco: pessoas por idade e presença, e visitantes à parte (RF11). */
  async summary(weddingId: string): Promise<RsvpSummary> {
    const [counts, visitors] = await Promise.all([
      this.responses.countByAgeAndStatus(weddingId),
      this.openResponses.countByStatus(weddingId),
    ]);
    const totals = (isChild: boolean): AgeTotals => {
      const count = (status: 'CONFIRMED' | 'DECLINED' | null) =>
        counts.find((row) => row.isChild === isChild && row.status === status)?.count ?? 0;
      return { confirmed: count('CONFIRMED'), pending: count(null), declined: count('DECLINED') };
    };
    return {
      adults: totals(false),
      children: totals(true),
      visitors: { confirmed: visitors.CONFIRMED ?? 0, declined: visitors.DECLINED ?? 0 },
    };
  }

  async people(weddingId: string, status: PersonStatus | undefined, page: number) {
    const result = await this.responses.listPeople(
      weddingId,
      status,
      (page - 1) * PAGE_SIZE,
      PAGE_SIZE,
    );
    return { ...result, page, pageSize: PAGE_SIZE };
  }

  async export(weddingId: string, format: ExportFormat): Promise<ExportFile> {
    const [people, visitors] = await Promise.all([
      this.responses.listAllPeople(weddingId),
      this.openResponses.listAll(weddingId),
    ]);
    const rows = exportRows(people, visitors);
    return {
      body: format === 'csv' ? toCsv(rows) : await toXlsx(rows),
      contentType: EXPORT_CONTENT_TYPES[format],
      filename: `rsvp-${SAO_PAULO_DATE.format(this.clock.now())}.${format}`,
    };
  }
}
