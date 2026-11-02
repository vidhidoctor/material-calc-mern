import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** One figure with an icon; goes inside .order-stats (the grid that lays them out). */
export function StatCard({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <div className="order-stat">
      <span className="order-stat-icon">
        <Icon name={icon} size={22} />
      </span>
      <div className="order-stat-body">
        <span className="muted small">{label}</span>
        {children}
      </div>
    </div>
  );
}
