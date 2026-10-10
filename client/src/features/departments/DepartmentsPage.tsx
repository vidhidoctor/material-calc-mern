import type { DepartmentDto } from '@app/shared';
import { useState, type FormEvent } from 'react';
import { DataGrid, type Column } from '../../components/DataGrid';
import { EmptyState, ErrorAlert, PageHeader, QueryState } from '../../components/ui';
import { formatNumber } from '../../lib/format';
import { useCreateDepartment, useDepartments } from './departments.hooks';

const columns: Column<DepartmentDto>[] = [
  { key: 'name', header: 'Department', render: (d) => <strong>{d.name}</strong> },
  { key: 'users', header: 'Users', align: 'right', render: (d) => formatNumber(d.userCount, 0) },
];

export function DepartmentsPage() {
  const departments = useDepartments();
  const create = useCreateDepartment();
  const [name, setName] = useState('');

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(name, { onSuccess: () => setName('') });
  };

  return (
    <>
      <PageHeader title="Departments" />
      <form className="card inline-form" onSubmit={onSubmit}>
        <input className="input" placeholder="New department name" required value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="btn btn-primary" disabled={create.isPending}>
          + Add department
        </button>
      </form>
      <ErrorAlert error={create.error} />
      <QueryState query={departments}>
        {(list) => (
          <section className="card">
            <DataGrid columns={columns} rows={list} rowKey={(d) => d.id} empty={<EmptyState title="No departments yet." />} />
          </section>
        )}
      </QueryState>
    </>
  );
}
