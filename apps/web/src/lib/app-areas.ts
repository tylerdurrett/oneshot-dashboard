import { Timer, FileText, MessageSquare } from 'lucide-react';

import { NAV_ITEMS, isItemActive, type NavItem } from '@/lib/nav-items';
import { AREA_STORAGE_KEY } from '@/lib/area-storage';
import { features } from '@/lib/features';

// ---------------------------------------------------------------------------
// App area — a grouping layer above nav items. Each area owns a subset of
// routes and appears as a top-level icon in the desktop rail / mobile switcher.
// ---------------------------------------------------------------------------

export interface AppArea {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  navItems: NavItem[];
  /** When true the desktop sidebar skips the secondary-nav column for this area. */
  hideDesktopSecondaryNav?: boolean;
}

// ---------------------------------------------------------------------------
// Area definitions — navItems are derived from the already feature-filtered
// NAV_ITEMS so feature flags are respected automatically.
// ---------------------------------------------------------------------------

/** Paths that belong to the Timers area (matched against NAV_ITEMS). */
const TIMERS_HREFS = new Set(['/timers/remaining', '/timers/all', '/chat', '/settings']);

const DOCS_NAV_ITEM: NavItem = {
  href: '/docs',
  label: 'Docs',
  icon: FileText,
  matchType: 'exact',
};

const DOCS_CHAT_NAV_ITEM: NavItem = {
  href: '/docs/chat',
  label: 'Chat',
  icon: MessageSquare,
  matchType: 'exact',
};

export const APP_AREAS: AppArea[] = [
  {
    id: 'timers',
    label: 'Timers',
    icon: Timer,
    navItems: NAV_ITEMS.filter((item) => TIMERS_HREFS.has(item.href)),
  },
  {
    id: 'docs',
    label: 'Docs',
    icon: FileText,
    navItems: [DOCS_NAV_ITEM, ...(features.chat ? [DOCS_CHAT_NAV_ITEM] : [])],
    // Chat is embedded in the docs page on desktop, so no secondary nav needed
    hideDesktopSecondaryNav: true,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine which area owns the given pathname by checking each area's
 * navItems with the existing `isItemActive` matcher. Falls back to the
 * first area (Timers) for unknown routes.
 */
export function getAreaForPath(pathname: string): AppArea {
  for (const area of APP_AREAS) {
    if (area.navItems.some((item) => isItemActive(item, pathname))) {
      return area;
    }
  }
  return APP_AREAS[0]!;
}

