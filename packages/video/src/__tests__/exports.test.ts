import { describe, expect, it } from 'vitest';
import { HelloWorld, compositions } from '../index';

describe('video package exports', () => {
  it('exports HelloWorld component', () => {
    expect(HelloWorld).toBeDefined();
  });

  it('exports compositions metadata', () => {
    expect(compositions).toBeDefined();
    expect(compositions.HelloWorld).toBeDefined();
  });

  it('HelloWorld metadata has required fields', () => {
    const hw = compositions.HelloWorld;
    expect(hw.id).toBe('HelloWorld');
    expect(hw.durationInFrames).toBeGreaterThan(0);
    expect(hw.fps).toBeGreaterThan(0);
    expect(hw.width).toBeGreaterThan(0);
    expect(hw.height).toBeGreaterThan(0);
  });
});
