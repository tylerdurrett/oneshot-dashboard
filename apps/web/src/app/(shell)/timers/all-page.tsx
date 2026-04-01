import { useOutletContext } from 'react-router';
import type { UseTimerStateReturn } from './_hooks/use-timer-state';
import { AllTimerGridWithState } from './_components/all-timer-grid';

export default function TimersAllPage() {
  const timerState = useOutletContext<UseTimerStateReturn>();
  return <AllTimerGridWithState timerState={timerState} />;
}
