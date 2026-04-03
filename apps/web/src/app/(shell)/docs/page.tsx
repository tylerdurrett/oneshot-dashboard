import { FileText } from 'lucide-react';

export default function DocsPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-2xl bg-sidebar-accent/50 p-6">
        <FileText className="size-12 text-sidebar-foreground/50" />
      </div>
      <h1 className="text-xl font-semibold text-foreground">Docs</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Coming soon — a place for guides, notes, and reference material.
      </p>
    </div>
  );
}
