import { useSearchParams } from 'react-router';

export interface TabItem<T extends string> {
  id: T;
  label: string;
}

/** The active tab, kept in the address (?tab=…) so it survives a refresh; the default tab (first, unless given) has no parameter. */
export function useTabParam<T extends string>(tabs: readonly TabItem<T>[], defaultTab: T = tabs[0]!.id): [T, (id: T) => void] {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const active = tabs.find((t) => t.id === requested)?.id ?? defaultTab;
  return [active, (id) => setParams(id === defaultTab ? {} : { tab: id })];
}

/** The tab switch used across the app. */
export function Tabs<T extends string>({ label, tabs, active, onChange }: { label: string; tabs: readonly TabItem<T>[]; active: T; onChange: (id: T) => void }) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={active === t.id} aria-pressed={active === t.id} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
