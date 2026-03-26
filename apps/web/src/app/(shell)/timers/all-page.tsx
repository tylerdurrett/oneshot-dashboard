import { useDocumentTitle } from '@/hooks/use-document-title';

export default function TimersAllPage() {
  useDocumentTitle('All Timers');
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      All timers view coming soon.
    </div>
  );
}
