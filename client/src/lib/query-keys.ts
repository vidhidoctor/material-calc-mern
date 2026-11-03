/** Query keys shared across features so a mutation in one feature refreshes the others. */
export const queryKeys = {
  me: ['auth', 'me'] as const,
  users: ['admin', 'users'] as const,
  roles: ['admin', 'roles'] as const,
  permissions: ['admin', 'permissions'] as const,
  departments: ['admin', 'departments'] as const,
  materials: ['materials'] as const,
  materialCategories: ['material-categories'] as const,
  componentNames: ['component-names'] as const,
  /** Prefix for the audit log and every record's history. */
  audit: ['audit'] as const,
  auditLog: (filters: object) => ['audit', 'log', filters] as const,
  entityHistory: (type: string, id: string) => ['audit', 'entity', type, id] as const,
  settings: ['settings'] as const,
  /** Prefix for every design query (list and detail). */
  designs: ['designs'] as const,
  designList: (q: string) => ['designs', 'list', q] as const,
  design: (designNo: string) => ['designs', 'detail', designNo] as const,
  /** Prefix for Production's design queries. */
  production: ['production'] as const,
  productionDesigns: (q: string) => ['production', 'designs', q] as const,
  productionDesign: (designNo: string) => ['production', 'design', designNo] as const,
  /** Prefix for every order query (list, detail, summary). */
  orders: ['orders'] as const,
  order: (orderNo: number) => ['orders', 'detail', orderNo] as const,
  orderSummary: (orderNo: number) => ['orders', 'summary', orderNo] as const,
  purchaseOrder: (orderNo: number) => ['orders', 'purchase-order', orderNo] as const,
  purchase: ['purchase'] as const,
  /** Prefix for every ₹ query (rates, design cost, order cost). */
  costing: ['costing'] as const,
  rates: ['costing', 'rates'] as const,
  orderCost: (orderNo: number) => ['costing', 'order', orderNo] as const,
  /** Under the ₹ prefix, so a punching edit refreshes it too. */
  designCostingPrefix: ['costing', 'design-costing'] as const,
  designCostingList: (q: string) => ['costing', 'design-costing', 'list', q] as const,
  designCosting: (designNo: string) => ['costing', 'design-costing', 'detail', designNo] as const,
  designCostingPreview: (designNo: string, body: object) => ['costing', 'design-costing', 'preview', designNo, body] as const,
  /** Also under the ₹ prefix: a punching edit changes its figures too. */
  jobWorkPrefix: ['costing', 'job-work'] as const,
  jobWork: (designNo: string) => ['costing', 'job-work', 'detail', designNo] as const,
  jobWorkPreview: (designNo: string, body: object) => ['costing', 'job-work', 'preview', designNo, body] as const,
  printConfig: (sheet: string) => ['print-config', sheet] as const,
};
