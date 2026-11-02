import {
  AnswerInvitationSchema,
  IdentifyInvitationSchema,
  OpenAnswerSchema,
  SaveRsvpSettingsSchema,
} from './rsvp.dto';

describe('RSVP DTOs', () => {
  it.each([
    [{ token: 'abc' }, true],
    [{ code: 'k7m q2x' }, true],
    [{}, false],
    [{ token: 'abc', code: 'K7MQ2X' }, false],
  ])('identifies with exactly one of token or code: %p', (input, valid) => {
    expect(IdentifyInvitationSchema.safeParse(input).success).toBe(valid);
  });

  it('keeps omitted dietary notes absent, turns empty into null and trims text', () => {
    const parsed = AnswerInvitationSchema.parse({
      token: 't',
      answers: [
        { guestId: '01890000-0000-7000-8000-0000000000a1', status: 'CONFIRMED', message: '' },
        {
          guestId: '01890000-0000-7000-8000-0000000000a2',
          status: 'CONFIRMED',
          dietaryNotes: '  ',
          message: ' Oba ',
        },
        {
          guestId: '01890000-0000-7000-8000-0000000000a3',
          status: 'DECLINED',
          dietaryNotes: ' Sem glúten ',
        },
      ],
    });

    expect(parsed.answers[0].dietaryNotes).toBeUndefined();
    expect(parsed.answers[0].message).toBeNull();
    expect(parsed.answers[1]).toMatchObject({ dietaryNotes: null, message: 'Oba' });
    expect(parsed.answers[2].dietaryNotes).toBe('Sem glúten');
    expect(parsed.companions).toEqual([]);
  });

  it('limits dietary notes to 500 and messages to 1.000 characters', () => {
    const result = AnswerInvitationSchema.safeParse({
      token: 't',
      answers: [
        {
          guestId: '01890000-0000-7000-8000-0000000000a1',
          status: 'CONFIRMED',
          dietaryNotes: 'x'.repeat(501),
          message: 'x'.repeat(1001),
        },
      ],
    });

    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'Use até 500 caracteres.',
      'Use até 1.000 caracteres.',
    ]);
  });

  it('requires a phone or an email from the visitor, validated as in the 009', () => {
    const base = { name: 'Davi', status: 'CONFIRMED' };

    expect(OpenAnswerSchema.safeParse(base).error?.issues[0]).toMatchObject({
      path: ['phone'],
      message: 'Informe um telefone ou um email.',
    });
    expect(OpenAnswerSchema.safeParse({ ...base, phone: '1199' }).success).toBe(false);
    expect(OpenAnswerSchema.parse({ ...base, email: 'Davi@Example.com' })).toMatchObject({
      email: 'davi@example.com',
    });
    expect(OpenAnswerSchema.parse({ ...base, phone: '(11) 99999-0000' })).toMatchObject({
      phone: '+5511999990000',
    });
    expect(
      OpenAnswerSchema.parse({ ...base, email: 'd@x.com', dietaryNotes: 'x' }),
    ).not.toHaveProperty('dietaryNotes');
  });

  it('accepts a deadline with offset or none', () => {
    expect(
      SaveRsvpSettingsSchema.parse({
        openModeEnabled: false,
        deadline: '2027-03-01T02:59:00.000Z',
      }),
    ).toBeDefined();
    expect(SaveRsvpSettingsSchema.parse({ openModeEnabled: true, deadline: null })).toEqual({
      openModeEnabled: true,
      deadline: null,
    });
    expect(
      SaveRsvpSettingsSchema.safeParse({ openModeEnabled: true, deadline: '28/02/2027' }).success,
    ).toBe(false);
  });
});
