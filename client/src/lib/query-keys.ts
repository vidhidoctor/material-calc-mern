/** Query keys shared across features so a mutation in one feature refreshes the others. */
export const queryKeys = {
  me: ['auth', 'me'] as const,
  users: ['admin', 'users'] as const,
  roles: ['admin', 'roles'] as const,
  permissions: ['admin', 'permissions'] as const,
  departments: ['admin', 'departments'] as const,
  materials: ['materials'] as const,
};
