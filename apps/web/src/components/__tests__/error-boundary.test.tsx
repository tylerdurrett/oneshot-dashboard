import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { RouteErrorBoundary } from '../error-boundary';

/** Helper: render a route that throws, caught by our error boundary. */
function renderWithError(error: Error) {
  const ThrowingComponent = () => {
    throw error;
  };

  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <ThrowingComponent />,
        errorElement: <RouteErrorBoundary />,
      },
    ],
    { initialEntries: ['/'] },
  );

  return render(<RouterProvider router={router} />);
}

afterEach(cleanup);

describe('RouteErrorBoundary', () => {
  it('renders the error message', () => {
    renderWithError(new Error('Test failure'));
    expect(screen.getByText('Something went wrong')).toBeDefined();
    expect(screen.getByText('Test failure')).toBeDefined();
  });

  it('renders fallback when error has no message', () => {
    renderWithError(new Error(''));
    expect(
      screen.getByText('An unexpected error occurred.'),
    ).toBeDefined();
  });

  it('"Try again" button is rendered', () => {
    renderWithError(new Error('Boom'));
    const button = screen.getByRole('button', { name: 'Try again' });
    expect(button).toBeDefined();
    // Click navigation not testable in jsdom due to AbortSignal incompatibility.
  });

  it('has dark theme and fullscreen layout classes', () => {
    const { container } = renderWithError(new Error('Boom'));
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('dark');
    expect(root.className).toContain('h-dvh');
  });
});
