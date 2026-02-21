import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import Home from '../app/page';

afterEach(cleanup);

describe('Home page', () => {
  it('renders the page heading', () => {
    render(<Home />);
    expect(screen.getByText('One Shot')).toBeDefined();
  });

  it('renders the workflow section', () => {
    render(<Home />);
    expect(screen.getByText('How to build with Claude Code')).toBeDefined();
  });

  it('renders the small tasks card', () => {
    render(<Home />);
    expect(screen.getByText('Small tasks')).toBeDefined();
  });

  it('renders the larger features card with steps', () => {
    render(<Home />);
    expect(screen.getByText('Larger features')).toBeDefined();
    expect(screen.getByText('Scope')).toBeDefined();
    expect(screen.getByText('Plan')).toBeDefined();
    expect(screen.getByText('Build')).toBeDefined();
  });

  it('renders the quick start section', () => {
    render(<Home />);
    expect(screen.getByText('Quick start')).toBeDefined();
  });
});
