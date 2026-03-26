import { Link, Outlet, useLocation } from 'react-router';
import { List, ListFilter } from 'lucide-react';
import { cn } from '@repo/ui';

const SUB_NAV_TABS = [
  { href: '/timers/remaining', label: 'Remaining', icon: ListFilter },
  { href: '/timers/all', label: 'All', icon: List },
] as const;

export default function TimersLayout() {
  const { pathname } = useLocation();

  return (
    <div className="flex flex-col md:flex-row flex-1 min-h-0">
      {/* Sub-nav: horizontal bar at top on mobile, vertical sidebar on desktop */}
      <nav
        aria-label="Timer views"
        className="timers-sub-nav shrink-0 flex md:flex-col bg-sidebar border-b md:border-b-0 md:border-r border-sidebar-border md:w-16 select-none"
      >
        {SUB_NAV_TABS.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              to={tab.href}
              className={cn(
                'timers-sub-nav-item flex flex-col items-center justify-center gap-1 transition-colors select-none',
                'flex-1 py-2 md:flex-none md:w-full md:px-3 md:py-3',
                isActive
                  ? 'text-sidebar-foreground'
                  : 'text-sidebar-foreground/50 hover:text-sidebar-foreground',
              )}
              // Keep tab presses from falling into text selection on touch devices.
              style={{ WebkitTouchCallout: 'none' }}
            >
              <div
                className={cn(
                  'p-1.5 rounded-lg transition-colors',
                  isActive && 'bg-sidebar-accent',
                )}
              >
                <tab.icon className="size-5" />
              </div>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Content area */}
      <div className="timers-content flex-1 min-h-0 min-w-0 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
