import { expectWeddingScoped } from './wedding-scope';

describe('expectWeddingScoped', () => {
  it('passes for a query scoped by weddingId in where, compound key or data', () => {
    const query = jest.fn();
    query({ where: { id: 'guest-1', weddingId: 'wedding-a' } });
    query({ where: { weddingId_userId: { weddingId: 'wedding-a', userId: 'user-1' } } });
    query({ data: { name: 'Ana', weddingId: 'wedding-a' } });

    expect(() => expectWeddingScoped(query, 'wedding-a')).not.toThrow();
  });

  it('fails for a repository that updates only by id', () => {
    const update = jest.fn();
    update({ where: { id: 'guest-1' }, data: { name: 'Bia' } });

    expect(() => expectWeddingScoped(update, 'wedding-a')).toThrow('consulta sem weddingId');
  });

  it('fails for a query scoped by another wedding', () => {
    const findFirst = jest.fn();
    findFirst({ where: { id: 'guest-1', weddingId: 'wedding-b' } });

    expect(() => expectWeddingScoped(findFirst, 'wedding-a')).toThrow();
  });
});
