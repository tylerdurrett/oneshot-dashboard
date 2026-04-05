import { describe, expect, it } from 'vitest';
import { blocksToMarkdown } from '../services/document.js';

describe('blocksToMarkdown', () => {
  it('returns empty string for empty blocks array', () => {
    expect(blocksToMarkdown([])).toBe('');
  });

  it('returns empty string for null content', () => {
    expect(blocksToMarkdown(null)).toBe('');
  });

  it('returns empty string for undefined content', () => {
    expect(blocksToMarkdown(undefined)).toBe('');
  });

  it('converts a single paragraph to plain text', () => {
    const blocks = [
      { type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] },
    ];
    expect(blocksToMarkdown(blocks).trim()).toBe('Hello world');
  });

  it('converts headings to markdown heading syntax', () => {
    const blocks = [
      { type: 'heading', props: { level: 1 }, content: [{ type: 'text', text: 'H1' }] },
      { type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: 'H2' }] },
      { type: 'heading', props: { level: 3 }, content: [{ type: 'text', text: 'H3' }] },
    ];
    const md = blocksToMarkdown(blocks);
    expect(md).toContain('# H1');
    expect(md).toContain('## H2');
    expect(md).toContain('### H3');
  });

  it('converts bullet list items with dash prefix', () => {
    const blocks = [
      { type: 'bulletListItem', content: [{ type: 'text', text: 'Item 1' }] },
      { type: 'bulletListItem', content: [{ type: 'text', text: 'Item 2' }] },
    ];
    const md = blocksToMarkdown(blocks);
    expect(md).toContain('* Item 1');
    expect(md).toContain('* Item 2');
  });

  it('converts numbered list items', () => {
    const blocks = [
      { type: 'numberedListItem', content: [{ type: 'text', text: 'First' }] },
      { type: 'numberedListItem', content: [{ type: 'text', text: 'Second' }] },
    ];
    const md = blocksToMarkdown(blocks);
    expect(md).toContain('1. First');
    expect(md).toContain('2. Second');
  });

  it('converts bold and italic inline styles', () => {
    const blocks = [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Some ' },
          { type: 'text', text: 'bold', styles: { bold: true } },
          { type: 'text', text: ' and ' },
          { type: 'text', text: 'italic', styles: { italic: true } },
          { type: 'text', text: ' text' },
        ],
      },
    ];
    const md = blocksToMarkdown(blocks);
    expect(md).toContain('**bold**');
    expect(md).toContain('*italic*');
  });

  it('converts mixed content correctly', () => {
    const blocks = [
      { type: 'heading', props: { level: 1 }, content: [{ type: 'text', text: 'My Doc' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'A paragraph.' }] },
      { type: 'bulletListItem', content: [{ type: 'text', text: 'Bullet' }] },
    ];
    const md = blocksToMarkdown(blocks);
    expect(md).toContain('# My Doc');
    expect(md).toContain('A paragraph.');
    expect(md).toContain('* Bullet');
  });

  it('converts nested children (sub-lists) with indentation', () => {
    const blocks = [
      {
        type: 'bulletListItem',
        content: [{ type: 'text', text: 'Parent' }],
        children: [
          { type: 'bulletListItem', content: [{ type: 'text', text: 'Child' }] },
        ],
      },
    ];
    const md = blocksToMarkdown(blocks);
    expect(md).toContain('* Parent');
    // Child should be indented under parent
    expect(md).toMatch(/\s+\* Child/);
  });

  it('produces consistent results across sequential calls', () => {
    const blocks = [
      { type: 'paragraph', content: [{ type: 'text', text: 'Test' }] },
    ];
    const md1 = blocksToMarkdown(blocks);
    const md2 = blocksToMarkdown(blocks);
    expect(md1).toBe(md2);
  });

  it('does not leak globalThis.document after call', () => {
    const hadDoc = 'document' in globalThis;
    blocksToMarkdown([{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }]);
    if (!hadDoc) {
      expect('document' in globalThis).toBe(false);
    }
  });
});
