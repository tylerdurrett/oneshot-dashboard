import { useDocumentTitle } from '@/hooks/use-document-title';

import { AllTimerGrid } from './_components/all-timer-grid';

export default function TimersAllPage() {
  useDocumentTitle('All Timers');
  return <AllTimerGrid />;
}
