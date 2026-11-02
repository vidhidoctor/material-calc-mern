import type { DesignCostingDto } from '@app/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ComponentCard } from '../../components/ComponentCard';
import { StatCard } from '../../components/StatCard';
import { Tabs, useTabParam, type TabItem } from '../../components/Tabs';
import { ErrorAlert, PageHeader, QueryState } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatDateTime, formatRupees, formatNumber } from '../../lib/format';
import { useDebounced } from '../../lib/use-debounced';
import { HistoryButton } from '../audit/components/HistoryPanel';
import { JobWorkTab } from '../job-work-costing/JobWorkTab';
import { ComponentEditor } from '../punching/components/ComponentEditor';
import { BulkRateModal, type BulkRates } from './components/BulkRateModal';
import { MaterialTab } from './components/MaterialTab';
import { PricingTab } from './components/PricingTab';
import { RateTab } from './components/RateTab';
import { NO_RATE, rowKey, toBody, toDraft, type Draft, type RateDraft } from './costing-draft';
import { useDesignCosting, useDesignCostingPreview, useSaveDesignCosting } from './design-costing.hooks';

type Tab = 'punching' | 'rates' | 'materials' | 'pricing' | 'jobwork';

const TABS: readonly TabItem<Tab>[] = [
  { id: 'punching', label: 'Punching Details' },
  { id: 'rates', label: 'Rate & Costing' },
  { id: 'materials', label: 'Material Requirement' },
  { id: 'pricing', label: 'Pricing Summary' },
  { id: 'jobwork', label: 'Job Work Costing' },
];

function Editor({ data, canManage }: { data: DesignCostingDto; canManage: boolean }) {
  const { designNo } = data.design;
  // Opens on the tab where the Manager works. Unsaved entries are kept when switching tabs.
  const [tab, setTab] = useTabParam(TABS, 'rates');
  const jobWorkOpen = tab === 'jobwork';
  const [draft, setDraft] = useState(() => toDraft(data.saved));
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);
  const save = useSaveDesignCosting(designNo);

  // Fresh data (e.g. after a punching edit) replaces the entries only when none are unsaved.
  useEffect(() => {
    if (!dirty) setDraft(toDraft(data.saved));
  }, [data.saved, dirty]);

  const body = useMemo(() => toBody(draft, data), [draft, data]);
  const settledBody = useDebounced(body, 300);
  const preview = useDesignCostingPreview(designNo, settledBody, dirty);
  const calculation = (dirty ? preview.data : null) ?? data.calculation;
  const recalculating = dirty && (preview.isFetching || settledBody !== body);

  const change = (update: (current: Draft) => Draft) => {
    setDirty(true);
    setDraft(update);
  };
  const setRate = (key: string, field: keyof RateDraft, value: string) =>
    change((d) => ({ ...d, rates: { ...d.rates, [key]: { ...(d.rates[key] ?? NO_RATE), [field]: value } } }));
  const setType = (key: string, type: string) => change((d) => ({ ...d, types: { ...d.types, [key]: type } }));
  const setCord = (key: string, field: 'denier' | 'rate', value: string) =>
    change((d) => ({ ...d, cords: { ...d.cords, [key]: { ...(d.cords[key] ?? { denier: '', rate: '' }), [field]: value } } }));

  const applyBulk = ({ component, stitch, laser, stitchHeads, laserHeads }: BulkRates) => {
    change((d) => {
      const rates = { ...d.rates };
      for (const c of data.design.components) {
        if (component && c.name !== component) continue;
        for (const s of c.sizes) {
          const key = rowKey(c.name, s.size);
          const current = rates[key] ?? NO_RATE;
          rates[key] = {
            ...current,
            stitch: stitch || current.stitch,
            laser: laser || current.laser,
            stitchHeads: stitchHeads || current.stitchHeads,
            laserHeads: laserHeads || current.laserHeads,
          };
        }
      }
      return { ...d, rates };
    });
    setBulk(false);
  };

  const onSave = () => save.mutate(body, { onSuccess: () => setDirty(false) });
  const priceListUrl = `/design-costing/${encodeURIComponent(designNo)}/price-list`;

  return (
    <>
      <PageHeader
        title={`Design ${designNo}`}
        subtitle={
          <>
            <strong>{data.design.productName}</strong> ·{' '}
            {data.savedAt ? `costing saved ${formatDateTime(data.savedAt)} by ${data.savedBy}` : 'no costing saved yet'}
          </>
        }
        actions={
          <>
            {!jobWorkOpen && <HistoryButton type="DesignCosting" id={designNo} title={`Design costing ${designNo}`} />}
            {jobWorkOpen && !dirty ? null : dirty ? (
              <button type="button" className="btn" disabled title="Save the costing first: the sheet prints what is saved.">
                Print price list
              </button>
            ) : (
              <a className="btn" href={priceListUrl} target="_blank" rel="noreferrer">
                Print price list
              </a>
            )}
            {canManage && (!jobWorkOpen || dirty) && (
              <button type="button" className="btn btn-primary" disabled={!dirty || save.isPending} onClick={onSave}>
                {save.isPending ? 'Saving…' : dirty ? 'Save costing' : 'Saved'}
              </button>
            )}
          </>
        }
      />
      <ErrorAlert error={save.error ?? (dirty ? preview.error : null)} />
      {!jobWorkOpen && calculation.errors.length > 0 && (
        <details className="alert alert-info costing-pending">
          <summary>Pending inputs ({calculation.errors.length}): not in the figures yet</summary>
          <ul className="costing-notes">
            {calculation.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </details>
      )}

      <div className={`stack ${recalculating ? 'is-stale' : ''}`}>
        <div className="order-stats" hidden={jobWorkOpen}>
          <StatCard icon="layers" label="Base cost, all components">
            <strong className="order-stat-value">{formatRupees(calculation.total.base)}</strong>
          </StatCard>
          <StatCard icon="sliders" label={`Markup (${formatNumber(body.markupPercent)}%)`}>
            <strong className="order-stat-value">{formatRupees(calculation.total.markup)}</strong>
          </StatCard>
          <StatCard icon="rupee" label="Final price, all components">
            <strong className="order-stat-value">{formatRupees(calculation.total.finalPrice)}</strong>
          </StatCard>
        </div>

        <Tabs label="Design costing" tabs={TABS} active={tab} onChange={setTab} />

        {tab === 'punching' && (
          <div className="costing-tab">
            {data.design.components.length === 0 && <p className="muted">Punching has not entered any component yet.</p>}
            {data.design.components.map((component) => (
              <ComponentCard key={component.name} component={component} materials={data.design.materials} onEdit={canManage ? () => setEditing(component.name) : undefined} />
            ))}
          </div>
        )}
        {tab === 'rates' && <RateTab calculation={calculation} draft={draft} canManage={canManage} setRate={setRate} onBulk={() => setBulk(true)} />}
        {tab === 'materials' && <MaterialTab data={data} calculation={calculation} draft={draft} canManage={canManage} setType={setType} setCord={setCord} />}
        {tab === 'pricing' && (
          <PricingTab calculation={calculation} draft={draft} canManage={canManage} setMarkup={(v) => change((d) => ({ ...d, markup: v }))} setRate={setRate} />
        )}
        {/* Stays mounted, so its unsaved entries survive switching tabs, like the costing's. */}
        <div hidden={!jobWorkOpen}>
          <JobWorkTab designNo={designNo} canManage={canManage} />
        </div>
      </div>

      {editing && <ComponentEditor key={editing} design={data.design} componentName={editing} viaCosting onClose={() => setEditing(null)} />}
      {bulk && <BulkRateModal components={data.design.components.map((c) => c.name)} onApply={applyBulk} onClose={() => setBulk(false)} />}
    </>
  );
}

/** One design: its punching details, the rates entered per size, and the resulting cost and price. */
export function DesignCostingPage() {
  const designNo = useParams().designNo ?? '';
  const auth = useAuth();
  const costing = useDesignCosting(designNo);
  return (
    <>
      <Link to="/design-costing" className="back-link">
        ← Design Costing
      </Link>
      <QueryState query={costing}>{(data) => <Editor key={data.design.designNo} data={data} canManage={auth.can('DESIGN_COSTING_MANAGE')} />}</QueryState>
    </>
  );
}
