import type { DesignCostingDto, JobWorkCostingDto } from '@app/shared';
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
import { useJobWorkCosting } from '../job-work-costing/job-work-costing.hooks';
import { JobWorkTab } from '../job-work-costing/JobWorkTab';
import { useJobWorkEditor } from '../job-work-costing/use-job-work-editor';
import { ComponentEditor } from '../punching/components/ComponentEditor';
import { BulkRateModal, type BulkRates } from './components/BulkRateModal';
import { MaterialTab } from './components/MaterialTab';
import { RateTab } from './components/RateTab';
import { NO_RATE, rowKey, toBody, toDraft, type Draft, type RateDraft } from './costing-draft';
import { useDesignCosting, useDesignCostingPreview, useSaveDesignCosting } from './design-costing.hooks';

type Tab = 'punching' | 'rates' | 'materials' | 'jobwork';

const TABS: readonly TabItem<Tab>[] = [
  { id: 'punching', label: 'Punching Details' },
  { id: 'rates', label: 'Rate & Pricing' },
  { id: 'materials', label: 'Material Requirement' },
  { id: 'jobwork', label: 'Job Work Costing' },
];

/** One line per tab, so the header keeps its height whichever tab is open. */
const TAB_DESCRIPTIONS: Record<Tab, string> = {
  punching: 'Components, sizes and materials from the Punching Master.',
  rates: 'Stitch and laser rates and heads per size, discount, markup, final price and remarks.',
  materials: 'What one piece of every size consumes, and what it costs.',
  jobwork: 'What the job worker is paid per piece. Nothing here changes your own costing or the Punching Master.',
};

const savedLine = (what: string, savedAt: string | null, savedBy: string | null) => (savedAt ? `${what} saved ${formatDateTime(savedAt)} by ${savedBy}` : `no ${what} saved yet`);

function Editor({ data, jobWorkData, canManage }: { data: DesignCostingDto; jobWorkData: JobWorkCostingDto; canManage: boolean }) {
  const { designNo } = data.design;
  // Opens on the tab where the Manager works. Unsaved entries are kept when switching tabs.
  const [tab, setTab] = useTabParam(TABS, 'rates');
  const jobWorkOpen = tab === 'jobwork';
  const [draft, setDraft] = useState(() => toDraft(data.saved));
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);
  const save = useSaveDesignCosting(designNo);
  const jobWork = useJobWorkEditor(jobWorkData);

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
  const pending = jobWorkOpen ? jobWork.calculation.errors : calculation.errors;
  const stale = jobWorkOpen ? jobWork.recalculating : recalculating;

  return (
    <>
      <PageHeader
        title={`Design ${designNo}`}
        subtitle={
          <>
            <span className="costing-subtitle-line">
              <strong>{data.design.productName}</strong> · {jobWorkOpen ? savedLine('job work', jobWorkData.savedAt, jobWorkData.savedBy) : savedLine('costing', data.savedAt, data.savedBy)}
            </span>
            <span className="costing-subtitle-line">{TAB_DESCRIPTIONS[tab]}</span>
          </>
        }
        actions={
          jobWorkOpen ? (
            <>
              <HistoryButton type="JobWorkCosting" id={designNo} title={`Job work costing ${designNo}`} />
              {jobWork.dirty ? (
                <button type="button" className="btn" disabled title="Save the job work first: the sheet prints what is saved.">
                  Print
                </button>
              ) : (
                <a className="btn" href={`/design-costing/${encodeURIComponent(designNo)}/job-work-sheet`} target="_blank" rel="noreferrer">
                  Print
                </a>
              )}
              {canManage && (
                <button type="button" className="btn btn-primary" disabled={!jobWork.dirty || jobWork.saving} onClick={jobWork.save}>
                  {jobWork.saving ? 'Saving…' : jobWork.dirty ? 'Save job work' : 'Saved'}
                </button>
              )}
            </>
          ) : (
            <>
              <HistoryButton type="DesignCosting" id={designNo} title={`Design costing ${designNo}`} />
              {canManage && (
                <button type="button" className="btn btn-primary" disabled={!dirty || save.isPending} onClick={onSave}>
                  {save.isPending ? 'Saving…' : dirty ? 'Save costing' : 'Saved'}
                </button>
              )}
            </>
          )
        }
      />
      <ErrorAlert error={jobWorkOpen ? jobWork.error : (save.error ?? (dirty ? preview.error : null))} />

      <div className={`stack ${stale ? 'is-stale' : ''}`}>
        {/* Always shown, even with nothing pending, so the tabs below never move. */}
        <details className="alert alert-info costing-pending">
          <summary>Pending inputs ({pending.length}){pending.length > 0 && ': not in the figures yet'}</summary>
          <ul className="costing-notes">
            {pending.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </details>

        {jobWorkOpen ? (
          <div className="order-stats costing-stats">
            <StatCard icon="users" label="Job worker rate">
              <strong className="order-stat-value">{formatRupees(jobWork.calculation.total.rate)}</strong>
            </StatCard>
            <StatCard icon="layers" label="Stitch cost">
              <strong className="order-stat-value">{formatRupees(jobWork.calculation.total.stitchCost)}</strong>
            </StatCard>
            <StatCard icon="sliders" label="Laser cost">
              <strong className="order-stat-value">{formatRupees(jobWork.calculation.total.laserCost)}</strong>
            </StatCard>
            <StatCard icon="package" label="Included materials">
              <strong className="order-stat-value">{formatRupees(jobWork.calculation.total.includedMaterials)}</strong>
            </StatCard>
            <StatCard icon="rupee" label="Final job work cost">
              <strong className="order-stat-value">{formatRupees(jobWork.calculation.total.finalCost)}</strong>
            </StatCard>
          </div>
        ) : (
          <div className="order-stats costing-stats">
            <StatCard icon="layers" label="Base cost, all components">
              <strong className="order-stat-value">{formatRupees(calculation.total.base)}</strong>
            </StatCard>
            <StatCard icon="sliders" label={`Markup (${formatNumber(calculation.markupPercent)}% for ${formatNumber(body.discountPercent)}% discount)`}>
              <strong className="order-stat-value">{formatRupees(calculation.total.markup)}</strong>
            </StatCard>
            <StatCard icon="rupee" label="Final price, all components">
              <strong className="order-stat-value">{formatRupees(calculation.total.finalPrice)}</strong>
            </StatCard>
          </div>
        )}

        <Tabs label="Design costing" tabs={TABS} active={tab} onChange={setTab} />

        {tab === 'punching' && (
          <div className="costing-tab">
            {data.design.components.length === 0 && <p className="muted">Punching has not entered any component yet.</p>}
            {data.design.components.map((component) => (
              <ComponentCard key={component.name} component={component} materials={data.design.materials} onEdit={canManage ? () => setEditing(component.name) : undefined} />
            ))}
          </div>
        )}
        {tab === 'rates' && (
          <RateTab
            designNo={designNo}
            dirty={dirty}
            calculation={calculation}
            draft={draft}
            canManage={canManage}
            setRate={setRate}
            setDiscount={(v) => change((d) => ({ ...d, discount: v }))}
            onBulk={() => setBulk(true)}
          />
        )}
        {tab === 'materials' && <MaterialTab data={data} calculation={calculation} draft={draft} canManage={canManage} setType={setType} setCord={setCord} />}
        {jobWorkOpen && <JobWorkTab editor={jobWork} canManage={canManage} />}
      </div>

      {editing && <ComponentEditor key={editing} design={data.design} componentName={editing} viaCosting onClose={() => setEditing(null)} />}
      {bulk && <BulkRateModal components={data.design.components.map((c) => c.name)} onApply={applyBulk} onClose={() => setBulk(false)} />}
    </>
  );
}

/** One design: its punching details, the rates entered per size, the resulting cost and price, and its job work costing. */
export function DesignCostingPage() {
  const designNo = useParams().designNo ?? '';
  const auth = useAuth();
  const costing = useDesignCosting(designNo);
  const jobWork = useJobWorkCosting(designNo);
  return (
    <>
      <Link to="/design-costing" className="back-link">
        ← Design Costing
      </Link>
      <QueryState query={costing}>
        {(data) => <QueryState query={jobWork}>{(jobWorkData) => <Editor key={data.design.designNo} data={data} jobWorkData={jobWorkData} canManage={auth.can('DESIGN_COSTING_MANAGE')} />}</QueryState>}
      </QueryState>
    </>
  );
}
