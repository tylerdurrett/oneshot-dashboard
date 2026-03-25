import { useNavigate, useRouteError } from 'react-router';

import { Button } from '@repo/ui/components/button';

/**
 * Generic route-level error boundary for React Router.
 *
 * Catches errors thrown during rendering or in loaders/actions and displays
 * a full-screen recovery UI. Wired into route definitions via `errorElement`.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  const message =
    error instanceof Error && error.message
      ? error.message
      : 'An unexpected error occurred.';

  const handleReset = () => {
    navigate('.', { replace: true });
  };

  return (
    <div className="dark flex h-dvh flex-col items-center justify-center gap-4 bg-background text-foreground">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button onClick={handleReset} size="sm">
        Try again
      </Button>
    </div>
  );
}
