import { useOutletContext } from 'react-router';
import type { UseTimerStateReturn } from './_hooks/use-timer-state';
import { TimerGridWithState } from './_components/timer-grid';

export default function TimersPage() {
  const timerState = useOutletContext<UseTimerStateReturn>();
  return <TimerGridWithState timerState={timerState} />;
}
