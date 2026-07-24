// Fixed bottom navigation (§10). Four screens, no nested nav, no hamburger.

import type { FC } from 'react';
import type { Tab } from '../store';
import { useGame } from '../store';

interface NavItem {
  tab: Tab;
  label: string;
  Icon: FC<{ active: boolean }>;
}

const stroke = (active: boolean) => (active ? '#1A0B2E' : '#FFF4E0');

const ClickIcon: FC<{ active: boolean }> = ({ active }) => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke={stroke(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="11" r="7" />
    <path d="M9 10h.01M15 10h.01M9 14c1.5 1.5 4.5 1.5 6 0" />
  </svg>
);

const HatchIcon: FC<{ active: boolean }> = ({ active }) => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke={stroke(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3c-3.5 4-5 7.5-5 10a5 5 0 0 0 10 0c0-2.5-1.5-6-5-10z" />
  </svg>
);

const CollectionIcon: FC<{ active: boolean }> = ({ active }) => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke={stroke(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

const UpgradeIcon: FC<{ active: boolean }> = ({ active }) => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke={stroke(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20V8M12 8l-5 5M12 8l5 5" />
    <path d="M6 4h12" />
  </svg>
);

const ITEMS: NavItem[] = [
  { tab: 'click', label: 'לְחִיצָה', Icon: ClickIcon },
  { tab: 'hatch', label: 'בְּקִיעָה', Icon: HatchIcon },
  { tab: 'collection', label: 'אוֹסֶף', Icon: CollectionIcon },
  { tab: 'upgrades', label: 'שְׁדְרוּג', Icon: UpgradeIcon },
];

export function BottomNav() {
  const activeTab = useGame((s) => s.activeTab);
  const setTab = useGame((s) => s.setTab);

  return (
    <nav className="flex shrink-0 items-stretch justify-around border-t border-bone/10 bg-black/40 pb-[env(safe-area-inset-bottom)]">
      {ITEMS.map(({ tab, label, Icon }) => {
        const active = tab === activeTab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => setTab(tab)}
            aria-current={active ? 'page' : undefined}
            className="flex flex-1 flex-col items-center gap-1 py-2"
          >
            <span
              className={`flex h-11 w-11 items-center justify-center rounded-2xl transition ${
                active ? 'bg-cy' : 'bg-transparent'
              }`}
            >
              <Icon active={active} />
            </span>
            <span className={`text-[11px] ${active ? 'text-cy' : 'text-bone/60'}`}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
