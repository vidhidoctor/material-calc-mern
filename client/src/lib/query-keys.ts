/** Query keys shared across features so a mutation in one feature refreshes the others. */
export const queryKeys = {
  me: ['auth', 'me'] as const,
  users: ['admin', 'users'] as const,
  roles: ['admin', 'roles'] as const,
  permissions: ['admin', 'permissions'] as const,
  departments: ['admin', 'departments'] as const,
  materials: ['materials'] as const,
  materialCategories: ['material-categories'] as const,
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
  purchase: ['purchase'] as const,
  /** Prefix for every ₹ query (rates, design cost, order cost). */
  costing: ['costing'] as const,
  rates: ['costing', 'rates'] as const,
  designCost: (designNo: string) => ['costing', 'design', designNo] as const,
  orderCost: (orderNo: number) => ['costing', 'order', orderNo] as const,
};
