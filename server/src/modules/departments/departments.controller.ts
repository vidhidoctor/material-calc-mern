import type { Request, Response } from 'express';
import * as departmentsService from './departments.service.js';
import type { CreateDepartmentInput } from './departments.validation.js';

export async function list(_req: Request, res: Response): Promise<void> {
  res.json(await departmentsService.listDepartments());
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(await departmentsService.createDepartment(req.body as CreateDepartmentInput));
}
