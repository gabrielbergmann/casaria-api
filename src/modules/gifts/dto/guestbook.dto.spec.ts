import { GuestbookInputSchema, ModerateGuestbookMessageDto } from './guestbook.dto';

describe('GuestbookInputSchema (spec 013)', () => {
  const parse = (input: Record<string, unknown>) => GuestbookInputSchema.safeParse(input);
  const valid = { authorName: 'Davi', body: 'Felicidades!' };
  const fieldsWithError = (input: Record<string, unknown>) =>
    parse(input).error?.issues.map((issue) => issue.path.join('.'));

  it('accepts the limits and trims the ends (RF02)', () => {
    const result = parse({
      ...valid,
      authorName: `  ${'a'.repeat(120)}  `,
      body: 'b'.repeat(1000),
    });

    expect(result.success).toBe(true);
    expect(result.data?.authorName).toHaveLength(120);
  });

  it.each([
    ['a name with 121 characters', { authorName: 'a'.repeat(121) }, 'authorName'],
    ['a text with 1001 characters', { body: 'b'.repeat(1001) }, 'body'],
    ['a name with only spaces', { authorName: '   ' }, 'authorName'],
    ['a text with only spaces', { body: ' \n ' }, 'body'],
  ])('rejects %s in the field (RF03)', (_case, override, field) => {
    expect(fieldsWithError({ ...valid, ...override })).toEqual([field]);
  });

  it('keeps HTML tags as plain text', () => {
    expect(parse({ ...valid, body: '<b>oi</b>' }).data?.body).toBe('<b>oi</b>');
  });
});

describe('ModerateGuestbookMessageDto', () => {
  it('never moves a message back to PENDING (ADR-001)', () => {
    const schema = ModerateGuestbookMessageDto.schema;

    expect(schema.safeParse({ status: 'HIDDEN' }).success).toBe(true);
    expect(schema.safeParse({ status: 'PENDING' }).success).toBe(false);
  });
});
