export default function NoFeaturesPage() {
  return (
    <div className="dark flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-semibold">No features enabled</h1>
        <p className="text-muted-foreground">
          All features are currently turned off. To enable them, open{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
            project.config.json
          </code>{' '}
          and set the features you want to <code className="rounded bg-muted px-1.5 py-0.5 text-sm">true</code>,
          then restart the dev server.
        </p>
      </div>
    </div>
  );
}
