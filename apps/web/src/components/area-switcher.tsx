import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { LayoutGrid } from 'lucide-react';
import { cn } from '@repo/ui';
import { Drawer } from '@repo/ui';

import { APP_AREAS, type AppArea } from '@/lib/app-areas';

// ---------------------------------------------------------------------------
// AreaSwitcher — mobile bottom sheet picker for switching between app areas.
// Renders as a small button in the bottom nav's far-right slot.
// ---------------------------------------------------------------------------

export function AreaSwitcher({ currentArea }: { currentArea: AppArea }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const handleSelect = useCallback(
    (area: AppArea) => {
      setOpen(false);
      if (area.id !== currentArea.id) {
        navigate(area.navItems[0]!.href, { replace: true });
      }
    },
    [currentArea.id, navigate],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex flex-col items-center justify-center gap-1 px-3 py-2 text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors select-none"
        aria-label="Switch app area"
        style={{ WebkitTouchCallout: 'none' }}
      >
        <div className="p-1.5 rounded-lg">
          <LayoutGrid className="size-5" />
        </div>
        <span className="text-[10px] font-medium">Areas</span>
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <div className="space-y-1">
          {APP_AREAS.map((area) => {
            const isActive = area.id === currentArea.id;
            return (
              <button
                key={area.id}
                type="button"
                onClick={() => handleSelect(area)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50',
                )}
              >
                <area.icon className="size-5" />
                <span className="text-sm font-medium">{area.label}</span>
              </button>
            );
          })}
        </div>
      </Drawer>
    </>
  );
}
