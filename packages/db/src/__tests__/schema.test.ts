import { describe, expect, it } from 'vitest';

import * as schema from '../schema';
import { db } from '../index';

describe('schema module', () => {
  it('exports without errors', () => {
    expect(schema).toBeDefined();
  });
});

describe('db client', () => {
  it('initializes without errors', () => {
    expect(db).toBeDefined();
  });
});
