import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router';
import { Clock, Menu, MessageSquare, Plus } from 'lucide-react';
import { cn } from '@repo/ui';

import { ADD_BUCKET_EVENT } from '@/app/(shell)/timers/_lib/timer-types';
import { features } from '@/lib/features';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NavItem {
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

const ALL_NAV_ITEMS: NavItem[] = [
  { href: '/timers', label: 'Timers', icon: Clock, matchType: 'prefix', hasContextMenu: true, feature: 'timers' },
  { href: '/chat', label: 'Chat', icon: MessageSquare, matchType: 'prefix', feature: 'chat' },
];

const NAV_ITEMS = ALL_NAV_ITEMS.filter(
  (item) => !item.feature || features[item.feature],
);

function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.matchType === 'exact') return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

// ---------------------------------------------------------------------------
// Long-press / context-menu constants
// ---------------------------------------------------------------------------

const LONG_PRESS_MS = 800;
const LONG_PRESS_MOVE_THRESHOLD = 10;
const VIEWPORT_MARGIN = 8;
const OFFSET_BELOW = 10;

function getIsStandaloneMode() {
  if (typeof window === 'undefined') return false;

  const displayModeStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches ?? false;
  const iosStandalone = (
    window.navigator as Navigator & { standalone?: boolean }
  ).standalone === true;

  return displayModeStandalone || iosStandalone;
}

function useStandaloneMode() {
  const [isStandaloneMode, setIsStandaloneMode] = useState(() => getIsStandaloneMode());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncStandaloneMode = () => {
      setIsStandaloneMode(getIsStandaloneMode());
    };

    const mediaQuery = window.matchMedia?.('(display-mode: standalone)');
    syncStandaloneMode();

    if (!mediaQuery) return;

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncStandaloneMode);
      return () => mediaQuery.removeEventListener('change', syncStandaloneMode);
    }

    mediaQuery.addListener(syncStandaloneMode);
    return () => mediaQuery.removeListener(syncStandaloneMode);
  }, []);

  return isStandaloneMode;
}

// ---------------------------------------------------------------------------
// NavLink (plain — no context menu)
// ---------------------------------------------------------------------------

function NavLink({ item, isMobile, isActive }: { item: NavItem; isMobile: boolean; isActive: boolean }) {
  return (
    <Link
      to={item.href}
      data-active={isActive || undefined}
      className={cn(
        'flex flex-col items-center justify-center gap-1 transition-colors select-none',
        isMobile ? 'flex-1 py-2' : 'w-full px-3 py-3',
        isActive
          ? 'text-sidebar-foreground'
          : 'text-sidebar-foreground/50 hover:text-sidebar-foreground',
      )}
      // Keep nav taps feeling like navigation on iOS instead of opening
      // text-selection/callout affordances.
      style={{ WebkitTouchCallout: 'none' }}
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

// ---------------------------------------------------------------------------
// NavLink with context menu (right-click / long-press → "Add Bucket")
// ---------------------------------------------------------------------------

function NavLinkWithContextMenu({
  item,
  isMobile,
  isActive,
}: {
  item: NavItem;
  isMobile: boolean;
  isActive: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStartRef = useRef({ x: 0, y: 0 });
  const isLongPressRef = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(() => setMenuOpen(false));

  // Cleanup long-press timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const openMenu = (x: number, y: number) => {
    setMenuPosition({ x, y });
    setMenuOpen(true);
  };

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    openMenu(e.clientX, e.clientY);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return;

    isLongPressRef.current = false;
    pressStartRef.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      longPressTimerRef.current = null;
      openMenu(e.clientX, e.clientY);
    }, LONG_PRESS_MS);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' || !longPressTimerRef.current) return;

    const dx = e.clientX - pressStartRef.current.x;
    const dy = e.clientY - pressStartRef.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_MOVE_THRESHOLD) {
      clearLongPress();
    }
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    clearLongPress();
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Already released or not captured
    }
  }, []);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    clearLongPress();
    isLongPressRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Already released
    }
  }, []);

  // Prevent navigation when long-press was detected — the user intended to
  // open the context menu, not follow the link.
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isLongPressRef.current) {
      e.preventDefault();
      isLongPressRef.current = false;
    }
  }, []);

  // Click-outside and Escape dismissal for the context menu
  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onCloseRef.current();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    // Close on scroll anywhere in the page (capture phase catches scrolls
    // inside nested containers before they bubble).
    const handleScroll = () => {
      onCloseRef.current();
    };

    const id = requestAnimationFrame(() => {
      document.addEventListener('pointerdown', handlePointerDown);
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('scroll', handleScroll, true);
    });
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [menuOpen]);

  const handleAddBucket = useCallback(() => {
    window.dispatchEvent(new CustomEvent(ADD_BUCKET_EVENT));
    setMenuOpen(false);
  }, []);

  return (
    <>
      <Link
        to={item.href}
        data-active={isActive || undefined}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className={cn(
          'flex flex-col items-center justify-center gap-1 transition-colors touch-none select-none',
          isMobile ? 'flex-1 py-2' : 'w-full px-3 py-3',
          isActive
            ? 'text-sidebar-foreground'
            : 'text-sidebar-foreground/50 hover:text-sidebar-foreground',
        )}
        // Suppress iOS native link preview so our long-press context menu works
        style={{ WebkitTouchCallout: 'none' }}
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

      {menuOpen &&
        createPortal(
          <NavContextMenu
            ref={menuRef}
            x={menuPosition.x}
            y={menuPosition.y}
            onAddBucket={handleAddBucket}
          />,
          document.body,
        )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Nav context menu (portal-rendered)
// ---------------------------------------------------------------------------

const NavContextMenu = forwardRef<
  HTMLDivElement,
  { x: number; y: number; onAddBucket: () => void }
>(function NavContextMenu({ x, y, onAddBucket }, ref) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [adjusted, setAdjusted] = useState({ x, y: y + OFFSET_BELOW });

  // Merge forwarded ref with inner ref
  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      (innerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
    },
    [ref],
  );

  // Viewport-edge clamping — offset applied here so it's in one place
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let ax = x;
    let ay = y + OFFSET_BELOW;

    if (ax + rect.width > window.innerWidth - VIEWPORT_MARGIN) {
      ax = window.innerWidth - rect.width - VIEWPORT_MARGIN;
    }
    if (ax < VIEWPORT_MARGIN) ax = VIEWPORT_MARGIN;
    if (ay + rect.height > window.innerHeight - VIEWPORT_MARGIN) {
      ay = y - rect.height - OFFSET_BELOW;
    }
    if (ay < VIEWPORT_MARGIN) ay = VIEWPORT_MARGIN;

    setAdjusted((prev) => (prev.x === ax && prev.y === ay ? prev : { x: ax, y: ay }));
  }, [x, y]);

  return (
    <div
      ref={setRefs}
      role="menu"
      className="fixed z-50 min-w-[160px] rounded-lg border border-border bg-popover p-1 shadow-xl"
      style={{ left: adjusted.x, top: adjusted.y }}
    >
      <button
        role="menuitem"
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-popover-foreground hover:bg-accent"
        onClick={onAddBucket}
      >
        <Plus className="size-4" />
        Add Bucket
      </button>
    </div>
  );
});

// ---------------------------------------------------------------------------
// More button
// ---------------------------------------------------------------------------

// TODO: wire up overflow menu (e.g. DropdownMenu from @repo/ui)
function MoreButton({ isMobile }: { isMobile: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'flex flex-col items-center justify-center gap-1 transition-colors text-sidebar-foreground/50 hover:text-sidebar-foreground select-none',
        isMobile ? 'flex-1 py-2' : 'w-full px-3 py-3',
      )}
      aria-label="More options"
      style={{ WebkitTouchCallout: 'none' }}
    >
      <div className="p-1.5 rounded-lg">
        <Menu className="size-5" />
      </div>
      <span className="text-[10px] font-medium">More</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Render helper: pick the right NavLink variant
// ---------------------------------------------------------------------------

function renderNavItem(item: NavItem, isMobile: boolean, isActive: boolean) {
  if (item.hasContextMenu) {
    return (
      <NavLinkWithContextMenu
        key={item.href}
        item={item}
        isMobile={isMobile}
        isActive={isActive}
      />
    );
  }
  return (
    <NavLink key={item.href} item={item} isMobile={isMobile} isActive={isActive} />
  );
}

// ---------------------------------------------------------------------------
// App shell
// ---------------------------------------------------------------------------

export function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const isStandaloneMode = useStandaloneMode();

  return (
    <div
      className={cn(
        'fixed inset-0 flex flex-col md:flex-row bg-background overflow-hidden',
        isStandaloneMode && 'app-shell-standalone',
      )}
    >
      {/* Desktop sidebar */}
      <nav
        aria-label="Sidebar navigation"
        className="hidden md:flex flex-col w-16 shrink-0 bg-sidebar border-r border-sidebar-border select-none"
      >
        <div className="flex-1 flex flex-col items-center py-4 gap-1">
          {NAV_ITEMS.map((item) =>
            renderNavItem(item, false, isItemActive(item, pathname)),
          )}
          <MoreButton isMobile={false} />
        </div>
      </nav>

      {/* Main content */}
      <main className="app-shell-main flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav
        aria-label="Bottom navigation"
        className="app-shell-mobile-nav flex md:hidden shrink-0 bg-sidebar border-t border-sidebar-border safe-area-pb select-none"
      >
        {/* Keep the iPhone standalone safe-area inset on the nav itself.
            Installed iOS PWAs also pin the nav to the viewport bottom via CSS,
            because WebKit can misplace bottom-aligned flex layouts in standalone mode. */}
        {NAV_ITEMS.map((item) =>
          renderNavItem(item, true, isItemActive(item, pathname)),
        )}
        <MoreButton isMobile={true} />
      </nav>
    </div>
  );
}
