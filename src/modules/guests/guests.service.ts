import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type { Env } from '../../infra/config/env.schema';
import { siteOrigin } from '../../infra/config/public-urls';
import type { Tx } from '../../infra/prisma/transaction-runner';
import { isUniqueViolation } from '../../infra/prisma/unique-violation';
import { WeddingsService } from '../weddings/weddings.service';
import { newInvitationToken, normalizeCode, pickFreeCode } from './credentials';
import { GuestNotFound } from './errors/guest-not-found';
import { InvitationNotFound } from './errors/invitation-not-found';
import { InvitationRequiresGuest } from './errors/invitation-requires-guest';
import { GuestSettingsRepository } from './guest-settings.repository';
import {
  type GuestChanges,
  type GuestData,
  type GuestRecord,
  type InvitationChanges,
  type InvitationRecord,
  InvitationsRepository,
} from './invitations.repository';

/** Texto do convite sem linha em guest_settings (RF13). */
export const DEFAULT_INVITE_MESSAGE =
  'Olá, {convite}! Vocês estão convidados para o nosso casamento. Confirme a presença em {link} ou com o código {codigo} no site.';

const PAGE_SIZE = 50;
/** Disputa pelo mesmo código entre duas gravações simultâneas: sorteia de novo. */
const CREDENTIAL_ATTEMPTS = 3;
const isUuid = (value: string) => z.uuid().safeParse(value).success;

/** Convite como o painel vê: com o código e o link, sem o token solto. */
export interface InvitationView {
  id: string;
  label: string;
  maxCompanions: number;
  code: string;
  inviteUrl: string;
  guests: GuestRecord[];
}

export interface InvitationPage {
  items: InvitationView[];
  page: number;
  pageSize: number;
  total: number;
}

export interface NewInvitationInput {
  label: string;
  maxCompanions: number;
  guests: GuestData[];
}

/** Acompanhante enviado pelo convidado: id altera, null cria (spec 010 ADR-001). */
export interface CompanionInput {
  id: string | null;
  name: string;
  isChild: boolean;
}

/**
 * Convites e pessoas (spec 009). Exportado para o rsvp (010): identificação por token ou código
 * e leitura do convite com as pessoas, sempre dentro do casamento recebido.
 */
@Injectable()
export class GuestsService {
  private readonly urlEnv: Pick<Env, 'NODE_ENV' | 'APP_DOMAIN'>;

  constructor(
    private readonly repository: InvitationsRepository,
    private readonly settings: GuestSettingsRepository,
    private readonly weddings: WeddingsService,
    config: ConfigService<Env, true>,
  ) {
    this.urlEnv = {
      NODE_ENV: config.get('NODE_ENV', { infer: true }),
      APP_DOMAIN: config.get('APP_DOMAIN', { infer: true }),
    };
  }

  async list(weddingId: string, search: string | undefined, page: number): Promise<InvitationPage> {
    const term = search?.trim() || undefined;
    const [result, toView] = await Promise.all([
      this.repository.listPage(weddingId, term, (page - 1) * PAGE_SIZE, PAGE_SIZE),
      this.viewer(weddingId),
    ]);
    return { items: result.items.map(toView), page, pageSize: PAGE_SIZE, total: result.total };
  }

  async get(weddingId: string, invitationId: string): Promise<InvitationView> {
    const [invitation, toView] = await Promise.all([
      this.getInvitation(weddingId, invitationId),
      this.viewer(weddingId),
    ]);
    return toView(invitation);
  }

  async create(weddingId: string, input: NewInvitationInput): Promise<InvitationView> {
    const invitation = await this.withFreshCredentials(weddingId, (token, code) =>
      this.repository.create(weddingId, { ...input, token, code }),
    );
    return (await this.viewer(weddingId))(invitation);
  }

  async update(
    weddingId: string,
    invitationId: string,
    changes: InvitationChanges,
  ): Promise<InvitationView> {
    if (
      !isUuid(invitationId) ||
      !(await this.repository.update(weddingId, invitationId, changes))
    ) {
      throw new InvitationNotFound();
    }
    return this.get(weddingId, invitationId);
  }

  async delete(weddingId: string, invitationId: string): Promise<void> {
    if (!isUuid(invitationId) || !(await this.repository.delete(weddingId, invitationId))) {
      throw new InvitationNotFound();
    }
  }

  /** Novo token e novo código juntos; os anteriores deixam de identificar o convite (RF12). */
  async regenerateCredentials(
    weddingId: string,
    invitationId: string,
  ): Promise<{ code: string; inviteUrl: string }> {
    await this.getInvitation(weddingId, invitationId);
    const credentials = await this.withFreshCredentials(weddingId, async (token, code) => {
      if (!(await this.repository.replaceCredentials(weddingId, invitationId, token, code))) {
        throw new InvitationNotFound();
      }
      return { token, code };
    });
    const slug = (await this.weddings.getDetails(weddingId)).slug;
    return { code: credentials.code, inviteUrl: this.inviteUrl(slug, credentials.token) };
  }

  async addGuest(weddingId: string, invitationId: string, guest: GuestData): Promise<GuestRecord> {
    await this.getInvitation(weddingId, invitationId);
    return this.repository.createGuest(weddingId, invitationId, guest);
  }

  async updateGuest(weddingId: string, guestId: string, changes: GuestChanges) {
    if (!isUuid(guestId) || !(await this.repository.updateGuest(weddingId, guestId, changes))) {
      throw new GuestNotFound();
    }
    return this.getGuest(weddingId, guestId);
  }

  /** O convite nunca fica vazio: a última pessoa só sai com o convite inteiro (RF04). */
  async deleteGuest(weddingId: string, guestId: string): Promise<void> {
    const guest = await this.getGuest(weddingId, guestId);
    if ((await this.repository.countGuests(weddingId, guest.invitationId)) <= 1) {
      throw new InvitationRequiresGuest();
    }
    await this.repository.deleteGuest(weddingId, guestId);
  }

  async getInviteMessage(weddingId: string): Promise<string> {
    return (await this.settings.findInviteMessage(weddingId)) ?? DEFAULT_INVITE_MESSAGE;
  }

  async saveInviteMessage(weddingId: string, inviteMessage: string): Promise<string> {
    await this.settings.saveInviteMessage(weddingId, inviteMessage);
    return inviteMessage;
  }

  /** Token do link (#convite=) no casamento do site; regenerado ou alheio → null. */
  identifyByToken(weddingId: string, token: string): Promise<InvitationRecord | null> {
    return token ? this.repository.findByToken(weddingId, token) : Promise.resolve(null);
  }

  /** Código digitado (" k7m q2x " vale "K7MQ2X") no casamento do site; senão null. */
  identifyByCode(weddingId: string, rawCode: string): Promise<InvitationRecord | null> {
    const code = normalizeCode(rawCode);
    return code ? this.repository.findByCode(weddingId, code) : Promise.resolve(null);
  }

  /**
   * Deixa no convite só os acompanhantes enviados, na transação de quem chama (spec 010 RF06):
   * apaga os que saíram, altera os que têm id e cria os novos. Devolve os ids na ordem recebida.
   * Os ids já foram conferidos como acompanhantes deste convite.
   */
  async syncCompanions(
    weddingId: string,
    invitationId: string,
    companions: CompanionInput[],
    tx: Tx,
  ): Promise<string[]> {
    const keepIds = companions.flatMap((companion) => (companion.id ? [companion.id] : []));
    await this.repository.deleteCompanionsExcept(weddingId, invitationId, keepIds, tx);
    const ids: string[] = [];
    for (const { id, name, isChild } of companions) {
      if (id) {
        await this.repository.updateGuest(weddingId, id, { name, isChild }, tx);
        ids.push(id);
      } else {
        const guest = { name, isChild, phone: null, email: null, origin: 'COMPANION' as const };
        ids.push((await this.repository.createGuest(weddingId, invitationId, guest, tx)).id);
      }
    }
    return ids;
  }

  async getInvitation(weddingId: string, invitationId: string): Promise<InvitationRecord> {
    const invitation = isUuid(invitationId)
      ? await this.repository.find(weddingId, invitationId)
      : null;
    if (!invitation) throw new InvitationNotFound();
    return invitation;
  }

  private async getGuest(weddingId: string, guestId: string): Promise<GuestRecord> {
    const guest = isUuid(guestId) ? await this.repository.findGuest(weddingId, guestId) : null;
    if (!guest) throw new GuestNotFound();
    return guest;
  }

  /** Grava com um token novo e um código livre no casamento; repete se outro levou o código. */
  private async withFreshCredentials<T>(
    weddingId: string,
    write: (token: string, code: string) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      const code = pickFreeCode(await this.repository.listCodes(weddingId));
      try {
        return await write(newInvitationToken(), code);
      } catch (error) {
        if (!isUniqueViolation(error) || attempt === CREDENTIAL_ATTEMPTS) throw error;
      }
    }
  }

  /** O link usa o slug atual (RF11): uma leitura do casamento por requisição. */
  private async viewer(
    weddingId: string,
  ): Promise<(invitation: InvitationRecord) => InvitationView> {
    const { slug } = await this.weddings.getDetails(weddingId);
    return ({ token, ...invitation }) => ({
      ...invitation,
      inviteUrl: this.inviteUrl(slug, token),
    });
  }

  private inviteUrl(slug: string, token: string): string {
    return `${siteOrigin(this.urlEnv, slug)}/#convite=${token}`;
  }
}
