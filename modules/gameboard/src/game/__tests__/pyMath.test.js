import { roundHalfEven, pyIndex } from '../pyMath';

describe('roundHalfEven matches Python 3 round()', () => {
  test.each([
    [0.5, 0],
    [1.5, 2],
    [2.5, 2],
    [-0.5, 0],
    [-1.5, -2],
    [-2.5, -2],
    [0.49, 0],
    [0.51, 1],
    [-0.51, -1],
    [3, 3],
    [-3, -3],
  ])('round(%p) == %p', (value, expected) => {
    expect(roundHalfEven(value) + 0).toBe(expected); // + 0 folds -0 into 0
  });
});

describe('pyIndex', () => {
  const angles = [-90, -30, -45, -60, -120, -135, -150];
  test('positive and negative indices behave like Python lists', () => {
    expect(pyIndex(angles, 0)).toBe(-90);
    expect(pyIndex(angles, 1)).toBe(-30);
    expect(pyIndex(angles, 3)).toBe(-60);
    expect(pyIndex(angles, -1)).toBe(-150);
    expect(pyIndex(angles, -2)).toBe(-135);
    expect(pyIndex(angles, -3)).toBe(-120);
  });
});
