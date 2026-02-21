import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import PrototypeIndex from '../app/prototype/page';

afterEach(cleanup);

describe('Prototype index page', () => {
  it('renders the page heading', () => {
    render(<PrototypeIndex />);
    expect(screen.getByText('Prototypes')).toBeDefined();
  });

  it('renders the Fullscreen Chat link', () => {
    render(<PrototypeIndex />);
    expect(screen.getByText('Fullscreen Chat')).toBeDefined();
  });

  it('links to the chat prototype', () => {
    render(<PrototypeIndex />);
    const link = screen.getByRole('link', { name: /Fullscreen Chat/i });
    expect(link.getAttribute('href')).toBe('/prototype/chat');
  });
});
