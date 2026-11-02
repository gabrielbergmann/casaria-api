import { Injectable, OnModuleInit } from '@nestjs/common';
import { PersonalDataAnonymizers } from '../../weddings/personal-data-anonymizers';
import { OrdersRepository } from './orders.repository';

/** Registra a anonimização dos pagadores na rotina do weddings (spec 015). */
@Injectable()
export class OrdersAnonymizer implements OnModuleInit {
  constructor(
    private readonly anonymizers: PersonalDataAnonymizers,
    private readonly orders: OrdersRepository,
  ) {}

  onModuleInit(): void {
    this.anonymizers.register({
      name: 'orders',
      anonymize: (weddingId) => this.orders.anonymizePayers(weddingId),
    });
  }
}
