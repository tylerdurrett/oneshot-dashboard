import { Outlet, useLocation } from 'react-router';

import { ALL_TIMERS_TITLE, TIMERS_TITLE } from '@/app/route-metadata';
import { useDocumentTitle } from '@/hooks/use-document-title';

import { TotalTimeIndicator } from './_components/total-time-indicator';
import { useTimerState } from './_hooks/use-timer-state';

function getPageTitle(pathname: string): string {
  if (pathname === '/timers/all') return ALL_TIMERS_TITLE;
  return TIMERS_TITLE;
}

export default function TimersLayout() {
  const { pathname } = useLocation();
  const timerState = useTimerState();

  useDocumentTitle(getPageTitle(pathname));

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <TotalTimeIndicator allBuckets={timerState.allBuckets} />
      <div className="timers-content flex-1 min-h-0 min-w-0 overflow-hidden">
        <Outlet context={timerState} />
      </div>
    </div>
  );
}
