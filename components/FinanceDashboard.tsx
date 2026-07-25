import React from 'react';
import { TravelRequest, PaymentStatus } from '../types';
import Card from './Card';
import StatCard from './StatCard';
import BarChart from './BarChart';

interface FinanceDashboardProps {
  requests: TravelRequest[];
}

export const FinanceDashboard = ({ requests }: FinanceDashboardProps) => {
  const allBookedRequests = requests.filter((r: TravelRequest) => r.ticketCost && r.ticketCost > 0);
  const totalSpend = allBookedRequests.reduce((acc: number, r: TravelRequest) => acc + (r.ticketCost || 0), 0);

  const pendingRequests = allBookedRequests.filter((r: TravelRequest) => r.paymentStatus === PaymentStatus.PENDING);
  const pendingAmount = pendingRequests.reduce((acc: number, r: TravelRequest) => acc + (r.ticketCost || 0), 0);
  const pendingCount = pendingRequests.length;

  const paidRequests = allBookedRequests.filter((r: TravelRequest) => r.paymentStatus === PaymentStatus.PAID);
  const paidAmount = paidRequests.reduce((acc: number, r: TravelRequest) => acc + (r.ticketCost || 0), 0);

  const avgCost = allBookedRequests.length > 0 ? Math.round(totalSpend / allBookedRequests.length) : 0;

  // Department Spend for BarChart
  const departmentSpend: Record<string, number> = {};
  allBookedRequests.forEach((r: TravelRequest) => {
    const dept = r.requesterDepartment || 'Unassigned';
    departmentSpend[dept] = (departmentSpend[dept] || 0) + (r.ticketCost || 0);
  });

  const chartData = Object.entries(departmentSpend)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([label, value]) => ({ label, value }));

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white transition-all">Financial Overview</h2>
        <p className="text-slate-500 text-sm mt-1">Monitor budget utilization and travel spend.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Travel Spend"
          value={`₹${totalSpend.toLocaleString()}`}
          icon={<i className="fa-solid fa-indian-rupee-sign"></i>}
          description="Total of all ticket costs"
        />
        <StatCard
          title="Paid Amount"
          value={`₹${paidAmount.toLocaleString()}`}
          icon={<i className="fa-solid fa-check-double"></i>}
          description="Total of cleared payments"
          trendUp={true}
          trend={`${paidRequests.length} invoices`}
        />
        <StatCard
          title="Pending Payments"
          value={`₹${pendingAmount.toLocaleString()}`}
          icon={<i className="fa-solid fa-clock-rotate-left"></i>}
          description={`${pendingCount} invoice(s) pending`}
          trendUp={false}
          trend="Needs Action"
        />
        <StatCard
          title="Avg Ticket Cost"
          value={`₹${avgCost.toLocaleString()}`}
          icon={<i className="fa-solid fa-calculator"></i>}
          description={`Across ${allBookedRequests.length} bookings`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="p-6">
          <h4 className="font-bold text-slate-800 dark:text-white mb-6">Spend by Department</h4>
          {chartData.length > 0 ? (
            <BarChart data={chartData} color="bg-emerald-500" />
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm italic border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-lg">
              No department spend data available yet.
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h4 className="font-bold text-slate-800 dark:text-white mb-4">Recent Transactions</h4>
          <div className="space-y-4">
            {allBookedRequests.sort((a: TravelRequest, b: TravelRequest) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 5).map((r: TravelRequest) => (
              <div key={r.id} className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700/50 transition-all hover:shadow-md">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-white">{r.requesterName}</p>
                  <p className="text-xs text-slate-500">{r.from} → {r.to}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{r.requesterDepartment || 'General'} • {new Date(r.timestamp).toLocaleDateString()}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className="font-bold text-slate-900 dark:text-white">₹{r.ticketCost?.toLocaleString()}</span>
                  {r.paymentStatus === PaymentStatus.PAID ? (
                    <span className="text-2xs uppercase tracking-wider font-bold px-2 py-0.5 rounded-lg flex items-center gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"><i className="fa-solid fa-check"></i> Paid</span>
                  ) : r.paymentStatus === PaymentStatus.PENDING ? (
                    <span className="text-2xs uppercase tracking-wider font-bold px-2 py-0.5 rounded-lg flex items-center gap-1 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"><i className="fa-regular fa-clock"></i> Pending</span>
                  ) : r.paymentStatus === PaymentStatus.REIMBURSED ? (
                    <span className="text-2xs uppercase tracking-wider font-bold px-2 py-0.5 rounded-lg flex items-center gap-1 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"><i className="fa-solid fa-arrow-rotate-left"></i> Reimbursed</span>
                  ) : (
                    <span className="text-2xs uppercase tracking-wider font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">{r.paymentStatus || 'N/A'}</span>
                  )}
                </div>
              </div>
            ))}
            {allBookedRequests.length === 0 && (
              <div className="h-48 flex items-center justify-center text-slate-400 text-sm italic border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-lg">
                No recent transactions found.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default FinanceDashboard;
