import type { DepartmentDto } from '@app/shared';
import { AppError } from '../../lib/app-error.js';
import { UserModel } from '../users/user.model.js';
import { DepartmentModel } from './department.model.js';
import type { CreateDepartmentInput } from './departments.validation.js';

export const DEPARTMENT_MESSAGES = {
  NAME_TAKEN: 'A department with this name already exists.',
} as const;

export async function listDepartments(): Promise<DepartmentDto[]> {
  const [departments, rows] = await Promise.all([
    DepartmentModel.find().sort({ name: 1 }),
    UserModel.aggregate<{ _id: unknown; count: number }>([
      { $match: { departmentId: { $ne: null } } },
      { $group: { _id: '$departmentId', count: { $sum: 1 } } },
    ]),
  ]);
  const counts = new Map(rows.map((row) => [String(row._id), row.count]));
  return departments.map((d) => ({ id: d.id as string, name: d.name, userCount: counts.get(d.id as string) ?? 0 }));
}

export async function createDepartment(input: CreateDepartmentInput): Promise<DepartmentDto> {
  if (await DepartmentModel.exists({ name: input.name }).collation({ locale: 'en', strength: 2 })) {
    throw new AppError(409, DEPARTMENT_MESSAGES.NAME_TAKEN);
  }
  const department = await DepartmentModel.create({ name: input.name });
  return { id: department.id as string, name: department.name, userCount: 0 };
}
