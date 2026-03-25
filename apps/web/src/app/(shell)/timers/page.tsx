import { TIMERS_TITLE } from '@/app/route-metadata';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { TimerGrid } from './_components/timer-grid';

export default function TimersPage() {
  useDocumentTitle(TIMERS_TITLE);
  return <TimerGrid />;
}
