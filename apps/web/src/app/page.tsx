import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/ui';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-background px-4 py-16">
      <div className="w-full max-w-2xl space-y-2 text-center">
        <h1 className="text-4xl font-bold tracking-tight">One Shot</h1>
        <p className="text-lg text-muted-foreground">
          A monorepo starter kit built for agentic development.
        </p>
      </div>

      <div className="mt-12 w-full max-w-2xl space-y-4">
        <h2 className="text-xl font-semibold">Quick start</h2>
        <div className="rounded-lg bg-muted p-4">
          <pre className="text-sm font-mono text-muted-foreground">
            <code>{`pnpm install
pnpm go`}</code>
          </pre>
        </div>
        <p className="text-sm text-muted-foreground">
          Then open Claude Code and start building.
        </p>
      </div>

      <div className="mt-16 w-full max-w-2xl space-y-6">
        <h2 className="text-xl font-semibold">How to build with Claude Code</h2>

        <Card>
          <CardHeader>
            <CardTitle>Small tasks</CardTitle>
            <CardDescription>
              For quick fixes and small features, just open Claude Code in your project and tell it what to build. It knows the project
              structure and handles the rest.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Larger features</CardTitle>
            <CardDescription>For anything bigger, use the structured dev cycle.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4 text-sm">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                  1
                </span>
                <div>
                  <p className="font-medium">Scope</p>
                  <p className="text-muted-foreground">
                    Use{' '}
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      /feature-request
                    </code>{' '}
                    to scope your idea through conversational discovery. Creates a feature
                    description in{' '}
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      _tasks/_planning/
                    </code>
                    .
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                  2
                </span>
                <div>
                  <p className="font-medium">Plan</p>
                  <p className="text-muted-foreground">
                    Use{' '}
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      /implementation-guide
                    </code>{' '}
                    to turn the feature description into a phased implementation plan with
                    acceptance criteria and tests.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                  3
                </span>
                <div>
                  <p className="font-medium">Build</p>
                  <p className="text-muted-foreground">
                    Run{' '}
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      ralph.sh
                    </code>{' '}
                    to automatically implement the plan section by section, or work through it
                    interactively with Claude Code.
                  </p>
                </div>
              </li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
