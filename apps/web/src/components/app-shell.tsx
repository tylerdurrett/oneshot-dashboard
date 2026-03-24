'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clock, MessageSquare, Menu } from 'lucide-react';
import { cn } from '@repo/ui';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  matchType: 'exact' | 'prefix';
}

const NAV_ITEMS: NavItem[] = [
  { href: '/timers', label: 'Timers', icon: Clock, matchType: 'exact' },
  { href: '/chat', label: 'Chat', icon: MessageSquare, matchType: 'prefix' },
];

function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.matchType === 'exact') return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

function NavLink({ item, isMobile, isActive }: { item: NavItem; isMobile: boolean; isActive: boolean }) {
  return (
    <Link
      href={item.href}
      data-active={isActive || undefined}
      className={cn(
        'flex flex-col items-center justify-center gap-1 transition-colors',
        isMobile ? 'flex-1 py-2' : 'w-full px-3 py-3',
        isActive
          ? 'text-sidebar-foreground'
          : 'text-sidebar-foreground/50 hover:text-sidebar-foreground',
      )}
    >
      <div
        className={cn(
          'p-1.5 rounded-lg transition-colors',
          isActive && 'bg-sidebar-accent',
        )}
      >
        <item.icon className="size-5" />
      </div>
      <span className="text-[10px] font-medium">{item.label}</span>
    </Link>
  );
}

// TODO: wire up overflow menu (e.g. DropdownMenu from @repo/ui)
function MoreButton({ isMobile }: { isMobile: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'flex flex-col items-center justify-center gap-1 transition-colors text-sidebar-foreground/50 hover:text-sidebar-foreground',
        isMobile ? 'flex-1 py-2' : 'w-full px-3 py-3',
      )}
      aria-label="More options"
    >
      <div className="p-1.5 rounded-lg">
        <Menu className="size-5" />
      </div>
      <span className="text-[10px] font-medium">More</span>
    </button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="h-dvh flex flex-col md:flex-row bg-background overflow-hidden">
      {/* Desktop sidebar */}
      <nav
        aria-label="Sidebar navigation"
        className="hidden md:flex flex-col w-16 shrink-0 bg-sidebar border-r border-sidebar-border"
      >
        <div className="flex-1 flex flex-col items-center py-4 gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} isMobile={false} isActive={isItemActive(item, pathname)} />
          ))}
          <MoreButton isMobile={false} />
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav
        aria-label="Bottom navigation"
        className="flex md:hidden shrink-0 bg-sidebar border-t border-sidebar-border safe-area-pb"
      >
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} isMobile={true} isActive={isItemActive(item, pathname)} />
        ))}
        <MoreButton isMobile={true} />
      </nav>
    </div>
  );
}
