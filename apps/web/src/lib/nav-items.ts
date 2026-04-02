import { Circle, CircleCheckBig, Settings } from 'lucide-react';

import { features } from '@/lib/features';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  matchType: 'exact' | 'prefix';
  /** If true, a context menu with extra actions is shown on right-click / long-press. */
  hasContextMenu?: boolean;
  /** Feature flag key — item is hidden when its feature is disabled. */
  feature?: keyof typeof features;
}

// ---------------------------------------------------------------------------
// Nav items — filtered by feature flags at module load time.
// ---------------------------------------------------------------------------

export const ALL_NAV_ITEMS: NavItem[] = [
  { href: '/timers/remaining', label: 'To Do', icon: Circle, matchType: 'exact', hasContextMenu: true, feature: 'timers' },
  { href: '/timers/all', label: 'Done', icon: CircleCheckBig, matchType: 'exact', feature: 'timers' },
  { href: '/settings', label: 'Settings', icon: Settings, matchType: 'prefix' },
];

export const NAV_ITEMS = ALL_NAV_ITEMS.filter(
  (item) => !item.feature || features[item.feature],
);

export function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.matchType === 'exact') return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + '/');
}
