import type { UseTimerStateReturn } from '../_hooks/use-timer-state';
import { AllTimerGrid, AllTimerGridWithState } from './all-timer-grid';
import { TimerGrid, TimerGridWithState } from './timer-grid';

export function RemainingTimersView() {
  return <TimerGrid />;
}

export function AllTimersView() {
  return <AllTimerGrid />;
}

export function RemainingTimersViewWithState({
  timerState,
}: {
  timerState: UseTimerStateReturn;
}) {
  return <TimerGridWithState timerState={timerState} />;
}

export function AllTimersViewWithState({
  timerState,
}: {
  timerState: UseTimerStateReturn;
}) {
  return <AllTimerGridWithState timerState={timerState} />;
}
