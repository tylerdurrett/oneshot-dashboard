import type { Metadata } from 'next';
import { timersMetadata } from '@/app/route-metadata';
import { TimerGrid } from './_components/timer-grid';

export const metadata: Metadata = timersMetadata;

export default function TimersPage() {
  return <TimerGrid />;
}
