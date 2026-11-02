import type { TemplateRow } from './guest-template';
import { invitationKey, personKey, planImport } from './import-rows';

let nextRow = 2;
const row = (fields: Partial<TemplateRow>): TemplateRow => ({
  row: nextRow++,
  invitation: '',
  name: '',
  child: '',
  phone: '',
  email: '',
  companions: '',
  ...fields,
});

describe('planImport', () => {
  beforeEach(() => (nextRow = 2));

  it.each([
    ['Família Lima', 'família lima'],
    ['  Família   Lima ', 'família lima'],
  ])('groups the invitation %p ignoring case and extra spaces', (label, key) => {
    expect(invitationKey(label)).toBe(key);
  });

  it('compares people ignoring case, accents and extra spaces', () => {
    expect(personKey('JOSÉ  silva')).toBe(personKey('José Silva'));
  });

  it('groups "Família Lima", "família lima" and "Família  Lima" in one invitation', () => {
    const plan = planImport(
      [
        row({ invitation: 'Família Lima', name: 'Ana', companions: '' }),
        row({ invitation: 'família lima', name: 'Bia', companions: '1' }),
        row({ invitation: 'Família  Lima', name: 'Caio', child: 'Sim', companions: '' }),
        row({ name: 'Davi Souza', phone: '(11) 99999-0000', email: 'Davi@Example.com' }),
      ],
      [],
    );

    expect(plan.rejected).toEqual([]);
    expect(plan.invitations).toEqual([
      {
        label: 'Família Lima',
        maxCompanions: 1,
        guests: [
          { name: 'Ana', isChild: false, phone: null, email: null },
          { name: 'Bia', isChild: false, phone: null, email: null },
          { name: 'Caio', isChild: true, phone: null, email: null },
        ],
      },
      {
        label: 'Davi Souza',
        maxCompanions: 0,
        guests: [
          {
            name: 'Davi Souza',
            isChild: false,
            phone: '+5511999990000',
            email: 'davi@example.com',
          },
        ],
      },
    ]);
  });

  it('refuses every row of an invitation with an invalid phone and keeps the others', () => {
    const plan = planImport(
      [
        row({ invitation: 'Família A', name: 'Ana' }),
        row({ invitation: 'Família B', name: 'Bia' }),
        row({ invitation: 'Família C', name: 'Caio' }),
        row({ invitation: 'Família D', name: 'Davi' }),
        row({ invitation: 'Família D', name: 'Duda', phone: '1199' }),
      ],
      [],
    );

    expect(plan.invitations.map((invitation) => invitation.label)).toEqual([
      'Família A',
      'Família B',
      'Família C',
    ]);
    expect(plan.rejected).toEqual([
      {
        row: 5,
        name: 'Davi',
        reason: 'Recusada junto com o convite: corrija a linha 6 e envie a planilha de novo.',
      },
      {
        row: 6,
        name: 'Duda',
        reason: 'Telefone inválido. Informe DDD e número, como (11) 99999-0000.',
      },
    ]);
  });

  it.each([
    [{ child: 'Talvez' }, 'Use Sim, Não ou deixe vazio na coluna Criança.'],
    [
      { companions: '-1' },
      'Use na coluna Acompanhantes um número inteiro igual ou maior que 0, ou deixe vazio.',
    ],
    [{ email: 'ana@' }, 'Email inválido. Use o formato nome@exemplo.com.'],
    [{ name: '' }, 'Informe o nome.'],
    [{ invitation: 'x'.repeat(121) }, 'Use até 120 caracteres na coluna Convite.'],
  ])('explains in pt-BR how to fix %p', (fields, reason) => {
    const plan = planImport([row({ name: 'Ana', ...fields })], []);

    expect(plan.invitations).toEqual([]);
    expect(plan.rejected).toEqual([expect.objectContaining({ row: 2, reason })]);
  });

  it('accepts "Não", "nao" and empty as adults', () => {
    const plan = planImport(
      [
        row({ invitation: 'F', name: 'Ana', child: 'Não' }),
        row({ invitation: 'F', name: 'Bia', child: 'nao' }),
        row({ invitation: 'F', name: 'Caio', child: 'SIM' }),
      ],
      [],
    );

    expect(plan.invitations[0].guests.map((guest) => guest.isChild)).toEqual([false, false, true]);
  });

  it('refuses every row again when the same spreadsheet is sent twice', () => {
    const rows = [
      row({ invitation: 'Família Lima', name: 'Ana' }),
      row({ invitation: 'Família Lima', name: 'Bia' }),
      row({ name: 'Davi Souza' }),
    ];
    const first = planImport(rows, []);
    const existing = first.invitations.flatMap((invitation) =>
      invitation.guests.map((guest) => ({ invitationLabel: invitation.label, name: guest.name })),
    );

    const second = planImport(rows, existing);

    expect(second.invitations).toEqual([]);
    expect(second.rejected).toEqual([
      { row: 2, name: 'Ana', reason: 'Duplicada: já está cadastrada no convite Família Lima.' },
      { row: 3, name: 'Bia', reason: 'Duplicada: já está cadastrada no convite Família Lima.' },
      {
        row: 4,
        name: 'Davi Souza',
        reason: 'Duplicada: já está cadastrada no convite Davi Souza.',
      },
    ]);
  });

  it('treats "JOSÉ  silva" as a duplicate of "José Silva" in the same invitation only', () => {
    const existing = [{ invitationLabel: 'Família Silva', name: 'José Silva' }];

    const plan = planImport(
      [
        row({ invitation: 'família silva', name: 'JOSÉ  silva' }),
        row({ invitation: 'Família Souza', name: 'JOSÉ  silva' }),
        row({ invitation: 'Família Souza', name: 'Maria' }),
        row({ invitation: 'Família Souza', name: 'maria' }),
      ],
      existing,
    );

    expect(plan.invitations).toEqual([]);
    expect(plan.rejected).toEqual([
      {
        row: 2,
        name: 'JOSÉ  silva',
        reason: 'Duplicada: já está cadastrada no convite família silva.',
      },
      {
        row: 3,
        name: 'JOSÉ  silva',
        reason: 'Recusada junto com o convite: corrija a linha 5 e envie a planilha de novo.',
      },
      {
        row: 4,
        name: 'Maria',
        reason: 'Recusada junto com o convite: corrija a linha 5 e envie a planilha de novo.',
      },
      { row: 5, name: 'maria', reason: 'Duplicada da linha 4.' },
    ]);
  });

  it('accepts namesakes in different invitations', () => {
    const plan = planImport(
      [
        row({ invitation: 'Família Silva', name: 'José Silva' }),
        row({ invitation: 'Família Souza', name: 'José Silva' }),
      ],
      [{ invitationLabel: 'Família Costa', name: 'José Silva' }],
    );

    expect(plan.rejected).toEqual([]);
    expect(plan.invitations).toHaveLength(2);
  });
});
