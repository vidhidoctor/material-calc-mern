import type { SettingsDto } from '@app/shared';
import { api } from '../../api/client';

export interface AddAdminEmailBody {
  email: string;
  name: string;
  password?: string;
}

export const getSettings = () => api<SettingsDto>('/settings');
export const addAdminEmail = (body: AddAdminEmailBody) => api<SettingsDto>('/settings/admin-emails', { method: 'POST', body });
export const removeAdminEmail = (email: string) =>
  api<SettingsDto>(`/settings/admin-emails/${encodeURIComponent(email)}`, { method: 'DELETE' });
