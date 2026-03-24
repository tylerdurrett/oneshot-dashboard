import { redirect } from 'next/navigation';

// Fallback redirect — primary redirect is handled by next.config.ts
export default function Home() {
  redirect('/timers');
}
