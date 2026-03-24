import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ChatError from '../error';

describe('ChatError (error boundary)', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the error message', () => {
    const error = new Error('Test failure');
    render(<ChatError error={error} reset={vi.fn()} />);
    expect(screen.getByText('Something went wrong')).toBeDefined();
    expect(screen.getByText('Test failure')).toBeDefined();
  });

  it('renders fallback when error has no message', () => {
    const error = new Error('');
    render(<ChatError error={error} reset={vi.fn()} />);
    expect(
      screen.getByText('An unexpected error occurred in the chat.'),
    ).toBeDefined();
  });

  it('calls reset when try again is clicked', () => {
    const reset = vi.fn();
    const error = new Error('Boom');
    render(<ChatError error={error} reset={reset} />);
    fireEvent.click(screen.getByText('Try again'));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('has dark theme and fullscreen layout classes', () => {
    const error = new Error('Boom');
    const { container } = render(<ChatError error={error} reset={vi.fn()} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('dark');
    expect(root.className).toContain('h-dvh');
  });
});
