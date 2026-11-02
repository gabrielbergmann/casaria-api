import { Injectable } from '@nestjs/common';

/** Relógio injetável: os testes trocam por um fixo (ex.: prazo do RSVP, spec 010). */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}
