import React from 'react';
import { TravelRequest, User, ApprovalStatus, Priority } from '../types';
import StatusBadge from './StatusBadge';
import Card from './Card';
import StatCard from './StatCard';
import { PageBanner } from './PageBanner';

interface AdminDashboardProps {
  requests: TravelRequest[];
  users: User[];
  onTabChange: (tab: string) => void;
}

export const AdminDashboard = ({ requests, users, onTabChange }: AdminDashboardProps) => {
  const pendingCount = requests.filter((r: TravelRequest) => r.approvalStatus === ApprovalStatus.PENDING).length;
  const criticalCount = requests.filter((r: TravelRequest) => r.priority === Priority.CRITICAL).length;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageBanner
        title="Admin Overview"
        description="System-wide performance metrics, user administration, and operational controls."
        icon="fa-shield-halved"
      >
        <button
          onClick={() => onTabChange('requests')}
          className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider backdrop-blur-sm transition-all active:scale-95 shadow-sm flex items-center gap-2"
        >
          <i className="fa-solid fa-list-check"></i>
          <span>View Queue</span>
        </button>
      </PageBanner>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Total Users" value={users.length} icon={<i className="fa-solid fa-users"></i>} description="Active accounts" />
        <StatCard title="Pending Approvals" value={pendingCount} icon={<i className="fa-solid fa-clock"></i>} description="Needs attention" />
        <StatCard title="Critical Trips" value={criticalCount} icon={<i className="fa-solid fa-triangle-exclamation"></i>} trendUp={false} description="High priority" />
      </div>

      <Card className="p-6">
        <h4 className="font-bold text-slate-800 dark:text-white mb-4">Recent Activity</h4>
        <div className="space-y-4">
          {requests.slice(0, 5).map((r: TravelRequest) => (
            <div key={r.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <div>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{r.requesterName}</p>
                <p className="text-xs text-slate-500">{r.from} → {r.to}</p>
              </div>
              <StatusBadge type="pnc" value={r.pncStatus} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default AdminDashboard;
