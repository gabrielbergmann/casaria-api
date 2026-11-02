import { isPostWedding } from './post-wedding';

describe('isPostWedding (spec 014 RF01)', () => {
  const weddingDate = new Date('2027-03-10T19:00:00Z');

  it.each([
    ['2027-03-10T18:59:59Z', false],
    ['2027-03-10T19:00:00Z', false],
    ['2027-03-10T19:00:01Z', true],
  ])('at %s answers %p', (now, expected) => {
    expect(isPostWedding(weddingDate, new Date(now))).toBe(expected);
  });
});
