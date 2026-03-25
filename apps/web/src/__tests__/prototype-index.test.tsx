import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import PrototypeIndex from '../app/prototype/page';

afterEach(cleanup);

function renderPrototypeIndex() {
  return render(
    <MemoryRouter>
      <PrototypeIndex />
    </MemoryRouter>,
  );
}

describe('Prototype index page', () => {
  it('renders the page heading', () => {
    renderPrototypeIndex();
    expect(screen.getByText('Prototypes')).toBeDefined();
  });

  it('links to the chat prototype', () => {
    renderPrototypeIndex();
    const link = screen.getByRole('link', { name: /Fullscreen Chat/i });
    expect(link.getAttribute('href')).toBe('/prototype/chat');
  });
});
