import React, { useState, useEffect, useRef, useMemo } from 'react';
import { TravelRequest, User, UserRole, PNCStatus, ApprovalStatus, Priority, PolicyConfig } from '../types';
import Card from './Card';
import StatCard from './StatCard';
import StatusBadge from './StatusBadge';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';
import { PageBanner } from './PageBanner';
import { calculateDynamicUrgency, getEffectiveBookingSlaHours, getDaysRemaining } from '../utils/policyUtils';

// --- Chart Components (CSS/SVG based) ---
export const DonutChart = ({ data }: { data: { label: string; value: number; color: string }[] }) => {
  const total = data.reduce((acc, d) => acc + d.value, 0);
  let accumulatedDeg = 0;

  const gradient = data.map(d => {
    const deg = (d.value / total) * 360;
    const str = `${d.color} ${accumulatedDeg}deg ${accumulatedDeg + deg}deg`;
    accumulatedDeg += deg;
    return str;
  }).join(', ');

  return (
    <div className="flex flex-col items-center gap-5 w-full">
      <div className="relative w-44 h-44 rounded-full flex-shrink-0" style={{ background: `conic-gradient(${gradient})` }}>
        <div className="absolute inset-5 bg-white dark:bg-slate-900 rounded-full flex items-center justify-center flex-col">
          <span className="text-3xl font-bold text-slate-900 dark:text-white">{total}</span>
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Total</span>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }}></span>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{d.label}</span>
            <span className="text-xs text-slate-500 font-mono">({Math.round((d.value / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const PieChartInteractive = ({ data, isFinancial }: { data: { label: string; value: number; color: string }[]; isFinancial?: boolean }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const total = data.reduce((acc, d) => acc + d.value, 0);
  if (total === 0) return <div className="h-72 flex items-center justify-center text-slate-400 text-sm italic">No data available.</div>;

  const cx = 140, cy = 140, outerR = 120, innerR = 60;
  const W = 280, H = 280;

  const fmtVal = (v: number) => isFinancial
    ? (v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`)
    : `${v}`;

  const slices: { d: string; color: string; label: string; value: number; pct: number; midAngle: number }[] = [];
  let startAngle = -Math.PI / 2;
  data.forEach((seg) => {
    const angle = (seg.value / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const midAngle = startAngle + angle / 2;
    const x1 = cx + outerR * Math.cos(startAngle), y1 = cy + outerR * Math.sin(startAngle);
    const x2 = cx + outerR * Math.cos(endAngle), y2 = cy + outerR * Math.sin(endAngle);
    const ix1 = cx + innerR * Math.cos(endAngle), iy1 = cy + innerR * Math.sin(endAngle);
    const ix2 = cx + innerR * Math.cos(startAngle), iy2 = cy + innerR * Math.sin(startAngle);
    const large = angle > Math.PI ? 1 : 0;
    const d = `M ${x1} ${y1} A ${outerR} ${outerR} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${large} 0 ${ix2} ${iy2} Z`;
    slices.push({ d, color: seg.color, label: seg.label, value: seg.value, pct: Math.round((seg.value / total) * 100), midAngle });
    startAngle = endAngle;
  });

  const hovered = hoveredIdx !== null ? slices[hoveredIdx] : null;

  const handleMouseMove = (e: React.MouseEvent<SVGGElement>, idx: number) => {
    const rect = (e.currentTarget.closest('svg') as SVGSVGElement).getBoundingClientRect();
    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setHoveredIdx(idx);
  };

  return (
    <div className="relative flex items-center justify-center w-full h-72">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-72" onMouseLeave={() => setHoveredIdx(null)}>
        {slices.map((s, i) => {
          const isHov = hoveredIdx === i;
          const scale = isHov ? 1.04 : 1;
          return (
            <g key={i}
              style={{ cursor: 'pointer', transformOrigin: `${cx}px ${cy}px`, transform: `scale(${scale})`, transition: 'transform 0.18s ease' }}
              onMouseMove={(e) => handleMouseMove(e, i)}
              onMouseEnter={() => setHoveredIdx(i)}
            >
              <path d={s.d} fill={s.color} fillOpacity={isHov ? 1 : 0.82} stroke="white" strokeWidth="2" />
            </g>
          );
        })}
        {/* Center label */}
        <text x={cx} y={cy - 10} textAnchor="middle" fill="currentColor" fontSize="22" fontWeight="800" className="text-slate-900 dark:text-white" style={hoveredIdx !== null ? { fill: slices[hoveredIdx].color } : undefined}>
          {hoveredIdx !== null ? fmtVal(slices[hoveredIdx].value) : fmtVal(total)}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="rgb(var(--slate-400))" fontSize="10" fontWeight="700">
          {hoveredIdx !== null ? `${slices[hoveredIdx].pct}%` : 'Total'}
        </text>
        {/* Inline SVG tooltip */}
        {hovered && (() => {
          const tx = Math.min(Math.max(tooltipPos.x, 60), W - 60);
          const ty = tooltipPos.y > cy ? tooltipPos.y - 44 : tooltipPos.y + 10;
          return (
            <g>
              <rect x={tx - 58} y={ty} width={116} height={36} rx="8" fill="rgb(var(--slate-800))" fillOpacity="0.93" />
              <text x={tx} y={ty + 14} textAnchor="middle" fill="white" fontSize="9" fontWeight="700">{hovered.label}</text>
              <text x={tx} y={ty + 28} textAnchor="middle" fill={hovered.color} fontSize="11" fontWeight="800">{fmtVal(hovered.value)} ({hovered.pct}%)</text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
};

export const AnalyticsView: React.FC<{ requests: TravelRequest[]; currentUser: User; policy?: PolicyConfig }> = ({ requests, currentUser, policy }) => {
  const [filters, setFilters] = useState<{
    campuses: string[];
    departments: string[];
    period: string;
    startDate: string;
    endDate: string;
  }>({
    campuses: [],
    departments: [],
    period: 'ALL TIME',
    startDate: '',
    endDate: ''
  });
  const [campusDropOpen, setCampusDropOpen] = useState(false);
  const [deptDropOpen, setDeptDropOpen] = useState(false);
  const campusDropRef = useRef<HTMLDivElement>(null);
  const deptDropRef = useRef<HTMLDivElement>(null);

  // Close multi-select dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (campusDropRef.current && !campusDropRef.current.contains(e.target as Node)) setCampusDropOpen(false);
      if (deptDropRef.current && !deptDropRef.current.contains(e.target as Node)) setDeptDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const [activeSubTab, setActiveSubTab] = useState<'travel' | 'advances' | 'cancellations' | 'tat-sla'>('travel');
  const [advances, setAdvances] = useState<any[]>([]);
  const [cancellations, setCancellations] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Pagination states
  const [travelPage, setTravelPage] = useState(1);
  const [advancesPage, setAdvancesPage] = useState(1);
  const [cancellationsPage, setCancellationsPage] = useState(1);
  const [slaPage, setSlaPage] = useState(1);
  const [slaSearch, setSlaSearch] = useState('');
  const [slaPriorityFilter, setSlaPriorityFilter] = useState<'all' | Priority>('all');
  const [slaStatusFilter, setSlaStatusFilter] = useState<'all' | 'Met' | 'On Track' | 'At Risk' | 'Breached'>('all');
  const [slaSort, setSlaSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'actualTatHours', dir: 'desc' });
  const itemsPerPage = 10;

  // Sorting state for Advances & Cancellations
  const [advSort, setAdvSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'received_on', dir: 'desc' });
  const [cancelSort, setCancelSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'cancellation_date', dir: 'desc' });

  // Fetch advances and cancellations
  useEffect(() => {
    const fetchData = async () => {
      setLoadingData(true);
      try {
        const { data: advData, error: advError } = await supabase
          .from('advances')
          .select('*')
          .order('received_on', { ascending: false });
        if (advError) throw advError;
        setAdvances(advData || []);

        const { data: cancelData, error: cancelError } = await supabase
          .from('cancellation_records')
          .select(`
            *,
            travel_requests ( submission_id, purpose, split_tickets, advance_id, requester_name, requester_campus, requester_department )
          `)
          .order('cancellation_date', { ascending: false });
        if (cancelError) throw cancelError;
        setCancellations(cancelData || []);
      } catch (err) {
        console.error('Error loading data for analytics:', err);
      } finally {
        setLoadingData(false);
      }
    };

    if (currentUser.role !== UserRole.EMPLOYEE) {
      fetchData();
    }
  }, [currentUser]);

  const [deptChartType, setDeptChartType] = useState<'bar' | 'line' | 'scatter' | 'bubble' | 'pie'>('bar');
  const [deptSort, setDeptSort] = useState<{ col: 'dept' | 'count' | 'avg' | 'total'; dir: 'asc' | 'desc' }>({ col: 'total', dir: 'desc' });

  const isFinancialView = currentUser.role === UserRole.FINANCE || currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.PNC;
  const showComparison = (filters.period || '').toUpperCase() !== 'ALL TIME';

  const CHART_ICONS: Record<string, string> = { bar: 'fa-chart-bar', line: 'fa-chart-line', scatter: 'fa-braille', bubble: 'fa-circle-dot', pie: 'fa-chart-pie' };

  // Compute date range for current period
  const getCurrentRange = useMemo(() => {
    const now = new Date();
    const p = (filters.period || '').toUpperCase();
    if (p === 'LAST 24 HOURS') {
      return { start: new Date(now.getTime() - 24 * 60 * 60 * 1000), end: now };
    }
    if (p === 'LAST 7 DAYS') {
      return { start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), end: now };
    }
    if (p === 'LAST 30 DAYS') {
      return { start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), end: now };
    }
    if (p === 'THIS MONTH') {
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999) };
    }
    if (p === 'LAST MONTH') {
      return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999) };
    }
    if (p === 'CUSTOM DATE') {
      const start = filters.startDate ? new Date(filters.startDate) : null;
      const end = filters.endDate ? (() => { const d = new Date(filters.endDate); d.setHours(23, 59, 59, 999); return d; })() : null;
      return { start, end };
    }
    return { start: null, end: null };
  }, [filters]);

  // Compute date range for previous period
  const getPreviousRange = useMemo(() => {
    const now = new Date();
    const p = (filters.period || '').toUpperCase();
    if (p === 'LAST 24 HOURS') {
      return { start: new Date(now.getTime() - 48 * 60 * 60 * 1000), end: new Date(now.getTime() - 24 * 60 * 60 * 1000) };
    }
    if (p === 'LAST 7 DAYS') {
      return { start: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000), end: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
    }
    if (p === 'LAST 30 DAYS') {
      return { start: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000), end: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
    }
    if (p === 'THIS MONTH') {
      return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999) };
    }
    if (p === 'LAST MONTH') {
      return { start: new Date(now.getFullYear(), now.getMonth() - 2, 1), end: new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999) };
    }
    if (p === 'CUSTOM DATE' && filters.startDate && filters.endDate) {
      const s = new Date(filters.startDate);
      const e = new Date(filters.endDate); e.setHours(23, 59, 59, 999);
      const dur = e.getTime() - s.getTime();
      return { start: new Date(s.getTime() - dur - 1000), end: new Date(s.getTime() - 1000) };
    }
    return { start: null, end: null };
  }, [filters]);

  const applyFilters = (data: TravelRequest[], range: { start: Date | null; end: Date | null }) => {
    return data.filter(r => {
      const matchCampus = filters.campuses.length === 0 || filters.campuses.includes(r.requesterCampus || '');
      const matchDept = filters.departments.length === 0 || filters.departments.includes(r.requesterDepartment || '');
      const reqDate = new Date(r.timestamp);
      let matchDate = true;
      if (range.start) matchDate = matchDate && reqDate >= range.start;
      if (range.end) matchDate = matchDate && reqDate <= range.end;
      return matchCampus && matchDept && matchDate;
    });
  };

  const applyAdvanceFilters = (data: any[], range: { start: Date | null; end: Date | null }) => {
    return data.filter(a => {
      const advDate = new Date(a.received_on);
      let matchDate = true;
      if (range.start) matchDate = matchDate && advDate >= range.start;
      if (range.end) matchDate = matchDate && advDate <= range.end;
      return matchDate;
    });
  };

  const applyCancellationFilters = (data: any[], range: { start: Date | null; end: Date | null }) => {
    return data.filter(c => {
      const matchCampus = filters.campuses.length === 0 || filters.campuses.includes(c.travel_requests?.requester_campus || '');
      const matchDept = filters.departments.length === 0 || filters.departments.includes(c.travel_requests?.requester_department || '');
      const cancelDate = new Date(c.cancellation_date);
      let matchDate = true;
      if (range.start) matchDate = matchDate && cancelDate >= range.start;
      if (range.end) matchDate = matchDate && cancelDate <= range.end;
      return matchCampus && matchDept && matchDate;
    });
  };

  const filteredData = useMemo(() => applyFilters(requests, getCurrentRange), [requests, filters, getCurrentRange]);
  const prevPeriodData = useMemo(() => showComparison ? applyFilters(requests, getPreviousRange) : [], [requests, filters, showComparison, getPreviousRange]);

  const filteredAdvances = useMemo(() => applyAdvanceFilters(advances, getCurrentRange), [advances, getCurrentRange]);
  const filteredCancellations = useMemo(() => applyCancellationFilters(cancellations, getCurrentRange), [cancellations, getCurrentRange]);

  const computeChange = (curr: number, prev: number): { pct: string; up: boolean } | null => {
    if (!showComparison) return null;
    if (prev === 0 && curr === 0) return null;
    if (prev === 0) return { pct: '▲ New', up: true };
    const pct = ((curr - prev) / prev) * 100;
    return { pct: `${pct >= 0 ? '+' : ''}${Math.round(pct)}%`, up: pct >= 0 };
  };

  // Reset pagination when active tab changes
  useEffect(() => {
    setTravelPage(1);
    setAdvancesPage(1);
    setCancellationsPage(1);
    setSlaPage(1);
  }, [activeSubTab]);

  // Travel KPI Aggregations
  const totalRequests = filteredData.length;
  const prevTotalRequests = prevPeriodData.length;
  const totalBookings = filteredData.filter(r => r.pncStatus === PNCStatus.BOOKED || r.pncStatus === PNCStatus.CLOSED).length;
  const prevTotalBookings = prevPeriodData.filter(r => r.pncStatus === PNCStatus.BOOKED || r.pncStatus === PNCStatus.CLOSED).length;
  const openRequests = filteredData.filter(r => r.pncStatus !== PNCStatus.CLOSED && r.pncStatus !== PNCStatus.REJECTED_BY_PNC && r.pncStatus !== PNCStatus.REJECTED_BY_MANAGER && r.pncStatus !== PNCStatus.BOOKED).length;
  const totalSpend = Math.round(filteredData.reduce((acc, r) => acc + (r.ticketCost || 0), 0) * 100) / 100;
  const prevTotalSpend = Math.round(prevPeriodData.reduce((acc, r) => acc + (r.ticketCost || 0), 0) * 100) / 100;

  const bookedWithCost = filteredData.filter(r => r.pncStatus === PNCStatus.CLOSED && (r.ticketCost || 0) > 0);
  const prevBookedWithCost = prevPeriodData.filter(r => r.pncStatus === PNCStatus.CLOSED && (r.ticketCost || 0) > 0);
  const avgTicketCost = bookedWithCost.length > 0 ? Math.round(bookedWithCost.reduce((acc, r) => acc + (r.ticketCost || 0), 0) / bookedWithCost.length) : 0;
  const prevAvgTicketCost = prevBookedWithCost.length > 0 ? Math.round(prevBookedWithCost.reduce((acc, r) => acc + (r.ticketCost || 0), 0) / prevBookedWithCost.length) : 0;

  const reqChange = computeChange(totalRequests, prevTotalRequests);
  const bookingsChange = computeChange(totalBookings, prevTotalBookings);
  const spendChange = computeChange(totalSpend, prevTotalSpend);
  const avgCostChange = computeChange(avgTicketCost, prevAvgTicketCost);

  // Advances KPI Aggregations
  const totalAdvReceived = useMemo(() => filteredAdvances.reduce((acc, a) => acc + (Number(a.amount_received) || 0), 0), [filteredAdvances]);
  const totalAdvRemaining = useMemo(() => filteredAdvances.reduce((acc, a) => acc + (Number(a.amount_left) || 0), 0), [filteredAdvances]);
  const totalAdvSpent = Math.max(0, totalAdvReceived - totalAdvRemaining);
  const advUtilPct = totalAdvReceived > 0 ? (totalAdvSpent / totalAdvReceived) * 100 : 0;
  const advSettledCount = filteredAdvances.filter(a => a.is_settled).length;

  // Cancellations KPI Aggregations
  const totalCancelOriginalFare = useMemo(() => filteredCancellations.reduce((acc, c) => acc + (Number(c.original_fare || c.originalFare) || 0), 0), [filteredCancellations]);
  const totalCancelNetLoss = useMemo(() => filteredCancellations.reduce((acc, c) => acc + (Number(c.net_unrecovered_amount || c.netUnrecoveredAmount) || 0), 0), [filteredCancellations]);
  const totalCancelEmployeeOwed = useMemo(() => filteredCancellations.reduce((acc, c) => acc + (Number(c.employee_owed_amount || c.employeeOwedAmount) || 0), 0), [filteredCancellations]);
  const totalCancelOrgAbsorbed = useMemo(() => filteredCancellations.reduce((acc, c) => acc + (Number(c.org_absorbed_amount || c.orgAbsorbedAmount) || 0), 0), [filteredCancellations]);
  const totalCancelVendorRefund = Math.max(0, totalCancelOriginalFare - totalCancelNetLoss);

  // Charts data
  const deptData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredData.forEach(r => {
      const d = r.requesterDepartment || 'Unknown';
      counts[d] = Math.round(((counts[d] || 0) + (isFinancialView ? (r.ticketCost || 0) : 1)) * 100) / 100;
    });
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  }, [filteredData, isFinancialView]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredData.forEach(r => { counts[r.pncStatus] = (counts[r.pncStatus] || 0) + 1; });
    const colors: Record<string, string> = {
      [PNCStatus.NOT_STARTED]: '#cbd5e1', [PNCStatus.APPROVAL_PENDING]: '#fcd34d',
      [PNCStatus.APPROVED]: '#34d399', [PNCStatus.PROCESSING]: '#818cf8',
      [PNCStatus.BOOKED]: '#60a5fa', [PNCStatus.REJECTED_BY_MANAGER]: '#fda4af',
      [PNCStatus.REJECTED_BY_PNC]: '#f87171', [PNCStatus.CLOSED]: '#64748b',
    };
    return Object.entries(counts).map(([label, value]) => ({ label: label.replace(/_/g, ' '), value, color: colors[label] || '#94a3b8' }));
  }, [filteredData]);

  // Mode & Priority distributions
  const modeData = useMemo(() => {
    const counts: Record<string, number> = { Flight: 0, Train: 0, Bus: 0 };
    filteredData.forEach(r => {
      const m = r.mode || 'Flight';
      counts[m] = (counts[m] || 0) + 1;
    });
    return Object.entries(counts);
  }, [filteredData]);

  const priorityData = useMemo(() => {
    const counts: Record<string, number> = { Low: 0, Medium: 0, High: 0, Critical: 0 };
    filteredData.forEach(r => {
      const p = r.priority || 'Medium';
      counts[p] = (counts[p] || 0) + 1;
    });
    return Object.entries(counts);
  }, [filteredData]);

  // Department summary table
  const deptSummary = useMemo(() => {
    const map: Record<string, { count: number; totalCost: number; closedCount: number; closedCost: number }> = {};
    filteredData.forEach(r => {
      const d = r.requesterDepartment || 'Unknown';
      if (!map[d]) map[d] = { count: 0, totalCost: 0, closedCount: 0, closedCost: 0 };
      map[d].count += 1;
      map[d].totalCost += r.ticketCost || 0;
      if (r.pncStatus === PNCStatus.CLOSED && (r.ticketCost || 0) > 0) {
        map[d].closedCount += 1;
        map[d].closedCost += r.ticketCost || 0;
      }
    });
    return Object.entries(map).map(([dept, s]) => ({
      dept,
      count: s.count,
      totalCost: Math.round(s.totalCost),
      avgCost: s.closedCount > 0 ? Math.round(s.closedCost / s.closedCount) : 0
    }));
  }, [filteredData]);

  const sortedDeptSummary = useMemo(() => {
    return [...deptSummary].sort((a, b) => {
      const dir = deptSort.dir === 'asc' ? 1 : -1;
      if (deptSort.col === 'dept') return dir * a.dept.localeCompare(b.dept);
      if (deptSort.col === 'count') return dir * (a.count - b.count);
      if (deptSort.col === 'avg') return dir * (a.avgCost - b.avgCost);
      return dir * (a.totalCost - b.totalCost);
    });
  }, [deptSummary, deptSort]);

  // Advances Sorting
  const sortedAdvances = useMemo(() => {
    return [...filteredAdvances].sort((a, b) => {
      const dir = advSort.dir === 'asc' ? 1 : -1;
      if (advSort.col === 'received_on') return dir * (new Date(a.received_on).getTime() - new Date(b.received_on).getTime());
      if (advSort.col === 'received_from') return dir * a.received_from.localeCompare(b.received_from);
      if (advSort.col === 'amount_received') return dir * (Number(a.amount_received) - Number(b.amount_received));
      if (advSort.col === 'amount_left') return dir * (Number(a.amount_left) - Number(b.amount_left));
      return 0;
    });
  }, [filteredAdvances, advSort]);

  // Cancellations Sorting
  const sortedCancellations = useMemo(() => {
    return [...filteredCancellations].sort((a, b) => {
      const dir = cancelSort.dir === 'asc' ? 1 : -1;
      const dateA = new Date(a.cancellation_date || a.cancellationDate || 0).getTime();
      const dateB = new Date(b.cancellation_date || b.cancellationDate || 0).getTime();
      if (cancelSort.col === 'cancellation_date') return dir * (dateA - dateB);
      if (cancelSort.col === 'original_fare') return dir * ((a.original_fare || a.originalFare || 0) - (b.original_fare || b.originalFare || 0));
      if (cancelSort.col === 'status') return dir * (a.status || '').localeCompare(b.status || '');
      return 0;
    });
  }, [filteredCancellations, cancelSort]);

  const toggleDeptSort = (col: typeof deptSort.col) => setDeptSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' });
  const toggleAdvSort = (col: string) => setAdvSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' });
  const toggleCancelSort = (col: string) => setCancelSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' });
  const toggleSlaSort = (col: string) => setSlaSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' });

  // --- TAT and SLA Analytics Aggregations ---
  const tatApprovalTarget = policy?.tatApprovalHours || 24;
  const tatProcessingTarget = policy?.tatProcessingHours || 48;
  const tatBookingTarget = policy?.tatBookingHours || 72;
  const enableUrgencySla = policy?.enableUrgencySla === true;

  const slaData = useMemo(() => {
    return filteredData.map(r => {
      const timeline = r.timeline || [];
      const createdAt = new Date(r.timestamp || Date.now()).getTime();

      // 1. Manager Approval TAT
      const approvedEvent = timeline.find(e =>
        e.event.toLowerCase().includes('approved') ||
        e.event.toLowerCase().includes('status changed to: approved')
      );
      const approvalTime = approvedEvent ? new Date(approvedEvent.timestamp).getTime() : null;
      const approvalHours = approvalTime
        ? Math.max(0.1, (approvalTime - createdAt) / (1000 * 60 * 60))
        : (r.approvalStatus === ApprovalStatus.APPROVED
            ? 12
            : Math.max(0.1, (Date.now() - createdAt) / (1000 * 60 * 60)));

      // 2. PNC Processing TAT
      const processingEvent = timeline.find(e => e.event.toLowerCase().includes('processing'));
      const processingTime = processingEvent ? new Date(processingEvent.timestamp).getTime() : (approvalTime || createdAt);
      const isClosedOrBooked = r.pncStatus === PNCStatus.BOOKED || r.pncStatus === PNCStatus.CLOSED;

      const bookedEvent = timeline.find(e =>
        e.event.toLowerCase().includes('booked') ||
        e.event.toLowerCase().includes('closed') ||
        e.event.toLowerCase().includes('ticket')
      );
      const bookedTime = bookedEvent ? new Date(bookedEvent.timestamp).getTime() : null;

      const processingHours = bookedTime
        ? Math.max(0.1, (bookedTime - processingTime) / (1000 * 60 * 60))
        : Math.max(0.1, (Date.now() - processingTime) / (1000 * 60 * 60));

      // 3. Overall Ticketing / Fulfillment TAT
      const completionTime = bookedTime
        ? bookedTime
        : (isClosedOrBooked ? createdAt + (36 * 3600 * 1000) : Date.now());

      const actualTatHours = Math.max(0.2, (completionTime - createdAt) / (1000 * 60 * 60));

      // Dynamic Urgency & Effective SLA Target
      const dynamicPriority = (policy?.allowRequesterUrgency && r.priority)
        ? r.priority
        : calculateDynamicUrgency(r.dateOfTravel, policy);

      const targetSlaHours = getEffectiveBookingSlaHours(dynamicPriority, policy);
      const isBreached = actualTatHours > targetSlaHours;
      const isAtRisk = !isClosedOrBooked && !isBreached && actualTatHours > (targetSlaHours * 0.75);

      const daysRemaining = getDaysRemaining(r.dateOfTravel);

      let slaStatus: 'Met' | 'On Track' | 'At Risk' | 'Breached' = 'On Track';
      if (isBreached) {
        slaStatus = 'Breached';
      } else if (isClosedOrBooked) {
        slaStatus = 'Met';
      } else if (isAtRisk) {
        slaStatus = 'At Risk';
      }

      return {
        ...r,
        dynamicPriority,
        daysRemaining,
        approvalHours,
        processingHours,
        actualTatHours,
        targetSlaHours,
        isBreached,
        isAtRisk,
        slaStatus,
        isClosedOrBooked
      };
    });
  }, [filteredData, policy]);

  // Executive SLA KPIs
  const totalSlaRequests = slaData.length;
  const closedCount = slaData.filter(d => d.isClosedOrBooked).length;
  const closedOnTime = slaData.filter(d => d.isClosedOrBooked && !d.isBreached).length;
  const totalBreaches = slaData.filter(d => d.isBreached).length;
  const activeAtRisk = slaData.filter(d => d.slaStatus === 'At Risk').length;
  const overallCompliancePct = closedCount > 0
    ? Math.round((closedOnTime / closedCount) * 100)
    : (totalSlaRequests > 0 ? Math.round(((totalSlaRequests - totalBreaches) / totalSlaRequests) * 100) : 100);

  const avgFulfillmentHours = totalSlaRequests > 0
    ? Math.round((slaData.reduce((acc, d) => acc + d.actualTatHours, 0) / totalSlaRequests) * 10) / 10
    : 0;

  const avgApprovalHours = totalSlaRequests > 0
    ? Math.round((slaData.reduce((acc, d) => acc + d.approvalHours, 0) / totalSlaRequests) * 10) / 10
    : 0;

  const avgProcessingHours = totalSlaRequests > 0
    ? Math.round((slaData.reduce((acc, d) => acc + d.processingHours, 0) / totalSlaRequests) * 10) / 10
    : 0;

  // Breakdown by Priority / Urgency Tier
  const tierStats = useMemo(() => {
    const tiers = [Priority.CRITICAL, Priority.HIGH, Priority.MEDIUM, Priority.LOW];
    return tiers.map(tier => {
      const items = slaData.filter(d => d.dynamicPriority === tier);
      const count = items.length;
      const targetHours = getEffectiveBookingSlaHours(tier, policy);
      const avgTat = count > 0 ? Math.round((items.reduce((acc, d) => acc + d.actualTatHours, 0) / count) * 10) / 10 : 0;
      const breaches = items.filter(d => d.isBreached).length;
      const compliance = count > 0 ? Math.round(((count - breaches) / count) * 100) : 100;
      return {
        tier,
        count,
        targetHours,
        avgTat,
        breaches,
        compliance
      };
    });
  }, [slaData, policy]);

  // Breakdown by Stage
  const stageStats = [
    {
      name: 'Manager Approval',
      target: tatApprovalTarget,
      avg: avgApprovalHours,
      breaches: slaData.filter(d => d.approvalHours > tatApprovalTarget).length,
      icon: 'fa-user-check'
    },
    {
      name: 'PNC Processing',
      target: tatProcessingTarget,
      avg: avgProcessingHours,
      breaches: slaData.filter(d => d.processingHours > tatProcessingTarget).length,
      icon: 'fa-gears'
    },
    {
      name: 'Ticketing Fulfillment',
      target: tatBookingTarget,
      avg: avgFulfillmentHours,
      breaches: totalBreaches,
      icon: 'fa-ticket'
    }
  ];

  // Campus SLA ranking
  const campusSlaRanking = useMemo(() => {
    const map: Record<string, { count: number; tatSum: number; breaches: number }> = {};
    slaData.forEach(d => {
      const c = d.requesterCampus || 'Navgurukul';
      if (!map[c]) map[c] = { count: 0, tatSum: 0, breaches: 0 };
      map[c].count++;
      map[c].tatSum += d.actualTatHours;
      if (d.isBreached) map[c].breaches++;
    });
    return Object.entries(map).map(([campus, stat]) => ({
      campus,
      count: stat.count,
      avgTat: Math.round((stat.tatSum / stat.count) * 10) / 10,
      compliance: Math.round(((stat.count - stat.breaches) / stat.count) * 100),
      breaches: stat.breaches
    })).sort((a, b) => b.compliance - a.compliance);
  }, [slaData]);

  // Filtered & Sorted SLA ledger rows
  const sortedSlaRows = useMemo(() => {
    const filtered = slaData.filter(d => {
      const matchSearch = slaSearch.trim() === '' ||
        d.submissionId?.toLowerCase().includes(slaSearch.toLowerCase()) ||
        d.requesterName?.toLowerCase().includes(slaSearch.toLowerCase()) ||
        d.from?.toLowerCase().includes(slaSearch.toLowerCase()) ||
        d.to?.toLowerCase().includes(slaSearch.toLowerCase());
      const matchPriority = slaPriorityFilter === 'all' || d.dynamicPriority === slaPriorityFilter;
      const matchStatus = slaStatusFilter === 'all' || d.slaStatus === slaStatusFilter;
      return matchSearch && matchPriority && matchStatus;
    });

    return filtered.sort((a, b) => {
      const dir = slaSort.dir === 'asc' ? 1 : -1;
      if (slaSort.col === 'submissionId') return dir * (a.submissionId || '').localeCompare(b.submissionId || '');
      if (slaSort.col === 'requesterName') return dir * (a.requesterName || '').localeCompare(b.requesterName || '');
      if (slaSort.col === 'actualTatHours') return dir * (a.actualTatHours - b.actualTatHours);
      if (slaSort.col === 'targetSlaHours') return dir * (a.targetSlaHours - b.targetSlaHours);
      if (slaSort.col === 'dateOfTravel') return dir * (new Date(a.dateOfTravel || 0).getTime() - new Date(b.dateOfTravel || 0).getTime());
      if (slaSort.col === 'slaStatus') return dir * a.slaStatus.localeCompare(b.slaStatus);
      return 0;
    });
  }, [slaData, slaSearch, slaPriorityFilter, slaStatusFilter, slaSort]);

  const totalSlaPages = Math.ceil(sortedSlaRows.length / itemsPerPage) || 1;
  const paginatedSlaData = useMemo(() => {
    const start = (slaPage - 1) * itemsPerPage;
    return sortedSlaRows.slice(start, start + itemsPerPage);
  }, [sortedSlaRows, slaPage, itemsPerPage]);

  const SortIcon = ({ col, current }: { col: string; current: { col: string; dir: 'asc' | 'desc' } }) => (
    <i className={`fa-solid ml-1 text-xs ${current.col === col ? (current.dir === 'asc' ? 'fa-arrow-up text-indigo-500' : 'fa-arrow-down text-indigo-500') : 'fa-arrows-up-down text-slate-300'}`}></i>
  );

  const uniqueCampuses = Array.from(new Set(requests.map(r => r.requesterCampus).filter(Boolean))) as string[];
  const uniqueDepts = Array.from(new Set(requests.map(r => r.requesterDepartment).filter(Boolean))) as string[];
  const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  const renderDeptChart = () => {
    if (deptData.length === 0) return (
      <div className="h-80 flex items-center justify-center text-slate-400 text-sm italic border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-lg">No data for selected period.</div>
    );

    const W = 440, H = 300, PL = 52, PR = 12, PT = 16, PB = 32;
    const cW = W - PL - PR, cH = H - PT - PB;
    const max = Math.max(...deptData.map(d => d.value), 1);
    const NUM_Y = 4;
    const gridVals = Array.from({ length: NUM_Y + 1 }, (_, i) => ({
      val: Math.round((max / NUM_Y) * (NUM_Y - i)),
      y: PT + (i / NUM_Y) * cH
    }));
    const fmtVal = (v: number) => isFinancialView
      ? (v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`)
      : `${v}`;
    const svgClass = "w-full h-80";

    const axesJSX = (
      <>
        {gridVals.map((g, i) => (
          <g key={i}>
            <line x1={PL} y1={g.y} x2={W - PR} y2={g.y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray={i === NUM_Y ? '0' : '4 3'} className="dark:stroke-slate-800" />
            <text x={PL - 5} y={g.y + 3} textAnchor="end" fill="#94a3b8" fontSize="8" fontWeight="600">{fmtVal(g.val)}</text>
          </g>
        ))}
        <line x1={PL} y1={PT} x2={PL} y2={PT + cH} stroke="#cbd5e1" strokeWidth="1.5" className="dark:stroke-slate-700" />
        <line x1={PL} y1={PT + cH} x2={W - PR} y2={PT + cH} stroke="#cbd5e1" strokeWidth="1.5" className="dark:stroke-slate-700" />
      </>
    );

    if (deptChartType === 'pie') return (
      <div className="h-80 flex items-center justify-center py-4">
        <PieChartInteractive data={deptData.map((d, i) => ({ ...d, color: CHART_COLORS[i % CHART_COLORS.length] }))} isFinancial={isFinancialView} />
      </div>
    );

    if (deptChartType === 'bar') {
      const gap = cW / deptData.length;
      const barW = Math.max(10, gap * 0.55);
      return (
        <svg viewBox={`0 0 ${W} ${H}`} className={svgClass}>
          {axesJSX}
          {deptData.map((d, i) => {
            const bH = Math.max(2, (d.value / max) * cH);
            const x = PL + gap * i + (gap - barW) / 2;
            const y = PT + cH - bH;
            return (
              <g key={i}>
                <rect x={x} y={y} width={barW} height={bH} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity="0.85" rx="3" />
                <line x1={x + barW / 2} y1={PT + cH} x2={x + barW / 2} y2={PT + cH + 4} stroke="#cbd5e1" strokeWidth="1" className="dark:stroke-slate-700" />
                <text x={x + barW / 2} y={H - 2} textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="700">{d.label.substring(0, 9)}</text>
              </g>
            );
          })}
        </svg>
      );
    }

    if (deptChartType === 'line') {
      const pts = deptData.map((d, i) => ({
        x: PL + (deptData.length < 2 ? cW / 2 : (i / (deptData.length - 1)) * cW),
        y: PT + (1 - d.value / max) * cH,
        d
      }));
      const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
      const area = pts.length > 1 ? `${path} L ${pts[pts.length - 1].x} ${PT + cH} L ${pts[0].x} ${PT + cH} Z` : '';
      return (
        <svg viewBox={`0 0 ${W} ${H}`} className={svgClass}>
          <defs><linearGradient id="lgDeptArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity="0.22" /><stop offset="100%" stopColor="#6366f1" stopOpacity="0" /></linearGradient></defs>
          {axesJSX}
          {area && <path d={area} fill="url(#lgDeptArea)" />}
          <path d={path} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {pts.map((p, i) => (
            <g key={i}>
              <line x1={p.x} y1={PT + cH} x2={p.x} y2={PT + cH + 4} stroke="#cbd5e1" strokeWidth="1" className="dark:stroke-slate-700" />
              <circle cx={p.x} cy={p.y} r="4.5" fill="#6366f1" stroke="white" strokeWidth="2" />
              <text x={p.x} y={H - 2} textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="700">{p.d.label.substring(0, 9)}</text>
            </g>
          ))}
        </svg>
      );
    }

    if (deptChartType === 'scatter') {
      const SIDE_PAD = 28;
      const pts = deptData.map((d, i) => ({
        x: PL + SIDE_PAD + (deptData.length < 2 ? (cW - 2 * SIDE_PAD) / 2 : (i / (deptData.length - 1)) * (cW - 2 * SIDE_PAD)),
        y: PT + (1 - d.value / max) * cH,
        d, c: CHART_COLORS[i % CHART_COLORS.length]
      }));
      return (
        <svg viewBox={`0 0 ${W} ${H}`} className={svgClass}>
          {axesJSX}
          {pts.map((p, i) => (
            <g key={i}>
              <line x1={p.x} y1={PT + cH} x2={p.x} y2={PT + cH + 4} stroke="#cbd5e1" strokeWidth="1" className="dark:stroke-slate-700" />
              <circle cx={p.x} cy={p.y} r="9" fill={p.c} fillOpacity="0.75" stroke={p.c} strokeWidth="1.5" />
              <text x={p.x} y={H - 2} textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="700">{p.d.label.substring(0, 9)}</text>
            </g>
          ))}
        </svg>
      );
    }

    if (deptChartType === 'bubble') {
      const minV = Math.min(...deptData.map(d => d.value));
      const rng = max - minV || 1;
      const SIDE_PAD = 28;
      const pts = deptData.map((d, i) => ({
        x: PL + SIDE_PAD + (deptData.length < 2 ? (cW - 2 * SIDE_PAD) / 2 : (i / (deptData.length - 1)) * (cW - 2 * SIDE_PAD)),
        y: PT + (1 - d.value / max) * cH,
        r: 14 + ((d.value - minV) / rng) * 36,
        d, c: CHART_COLORS[i % CHART_COLORS.length]
      }));
      return (
        <svg viewBox={`0 0 ${W} ${H}`} className={svgClass}>
          {axesJSX}
          {pts.map((p, i) => (
            <g key={i}>
              <line x1={p.x} y1={PT + cH} x2={p.x} y2={PT + cH + 4} stroke="#cbd5e1" strokeWidth="1" className="dark:stroke-slate-700" />
              <circle cx={p.x} cy={p.y} r={p.r} fill={p.c} fillOpacity="0.55" stroke={p.c} strokeWidth="1.5" />
              <text x={p.x} y={H - 2} textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="700">{p.d.label.substring(0, 9)}</text>
            </g>
          ))}
        </svg>
      );
    }
    return null;
  };

  // Paginated Slices of Data
  const totalTravelPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
  const paginatedTravelData = useMemo(() => filteredData.slice((travelPage - 1) * itemsPerPage, travelPage * itemsPerPage), [filteredData, travelPage]);

  const totalAdvancesPages = Math.ceil(sortedAdvances.length / itemsPerPage) || 1;
  const paginatedAdvancesData = useMemo(() => sortedAdvances.slice((advancesPage - 1) * itemsPerPage, advancesPage * itemsPerPage), [sortedAdvances, advancesPage]);

  const totalCancellationsPages = Math.ceil(sortedCancellations.length / itemsPerPage) || 1;
  const paginatedCancellationsData = useMemo(() => sortedCancellations.slice((cancellationsPage - 1) * itemsPerPage, cancellationsPage * itemsPerPage), [sortedCancellations, cancellationsPage]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <PageBanner
        title={currentUser.role === UserRole.EMPLOYEE ? 'My Travel Insights' : 'Analytics & Reporting'}
        description={currentUser.role === UserRole.EMPLOYEE ? 'Track your personal travel history, frequency, and spend.' : 'Data-driven insights for strategic decision making, budget forecasting, and route tracking.'}
        icon="fa-chart-simple"
      >
        <button
          onClick={() => {
            let csv = '';
            if (activeSubTab === 'travel') {
              csv = [['Request ID', 'Traveler', 'Department', 'Campus', 'Route', 'Date', 'Status', 'Cost', 'Vendor', 'Invoice'], ...filteredData.map(r => [r.submissionId || r.id, r.requesterName, r.requesterDepartment, r.requesterCampus, `${r.from} -> ${r.to}`, new Date(r.dateOfTravel).toLocaleDateString(), r.pncStatus, r.ticketCost || 0, r.vendorName || '', r.invoiceUrl || ''])].map(e => e.join(',')).join('\n');
            } else if (activeSubTab === 'advances') {
              csv = [['Advance ID', 'Received On', 'Received From', 'Amount Received', 'Amount Left', 'Settled Status', 'Comments'], ...filteredAdvances.map(a => [a.receipt_id || a.id, a.received_on, a.received_from, a.amount_received, a.amount_left, a.is_settled ? 'Settled' : 'Unsettled', a.comments || ''])].map(e => e.join(',')).join('\n');
            } else if (activeSubTab === 'cancellations') {
              csv = [['Cancellation ID', 'Request ID', 'Traveler', 'Cancellation Date', 'Original Fare', 'Net Loss', 'Status', 'Owed By Employee', 'Absorbed By Org'], ...filteredCancellations.map(c => [c.id, c.travel_requests?.submission_id || c.travel_request_id, c.travel_requests?.requester_name || '', new Date(c.cancellation_date).toLocaleDateString(), c.original_fare || c.originalFare, c.net_unrecovered_amount || c.netUnrecoveredAmount, c.status, c.employee_owed_amount || c.employeeOwedAmount, c.org_absorbed_amount || c.orgAbsorbedAmount])].map(e => e.join(',')).join('\n');
            } else {
              csv = [['Request ID', 'Traveler', 'Department', 'Campus', 'Travel Date', 'Urgency Tier', 'Days to Travel', 'Target SLA (Hrs)', 'Actual TAT (Hrs)', 'SLA Status', 'Manager Approval (Hrs)', 'PNC Processing (Hrs)'], ...sortedSlaRows.map(s => [s.submissionId || s.id, s.requesterName, s.requesterDepartment, s.requesterCampus, new Date(s.dateOfTravel).toLocaleDateString(), s.dynamicPriority, s.daysRemaining, s.targetSlaHours, s.actualTatHours.toFixed(1), s.slaStatus, s.approvalHours.toFixed(1), s.processingHours.toFixed(1)])].map(e => e.join(',')).join('\n');
            }
            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `${activeSubTab}_report_${new Date().toISOString().split('T')[0]}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a);
            toast.success('CSV exported!');
          }}
          className="flex items-center gap-2 px-5 py-3 bg-white text-indigo-700 hover:bg-indigo-50 rounded-lg text-sm font-black shadow-lg transition-all"
        >
          <i className="fa-solid fa-download"></i>
          Export Report
        </button>
      </PageBanner>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="bg-slate-100/90 dark:bg-slate-900/90 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-1.5 shadow-xs">
          {[
            { id: 'travel', label: 'Travel & Spend', icon: 'fa-plane', badge: filteredData.length },
            { id: 'advances', label: 'PNC Advances & Funds', icon: 'fa-wallet', badge: filteredAdvances.length },
            { id: 'cancellations', label: 'Cancellations & Recovery', icon: 'fa-rectangle-xmark', badge: filteredCancellations.length },
            { id: 'tat-sla', label: 'TAT and SLAs', icon: 'fa-stopwatch', badge: `${overallCompliancePct}% Met` }
          ].map(tab => {
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2.5 transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 font-black'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800/80'
                }`}
              >
                <i className={`fa-solid ${tab.icon} text-xs ${isActive ? 'text-white' : 'text-slate-400'}`}></i>
                <span>{tab.label}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black transition-all ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}>
                  {tab.badge}
                </span>
              </button>
            );
          })}
        </div>

        {/* Dynamic Context Tag */}
        <div className="hidden md:flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/40 px-3.5 py-2 rounded-xl border border-slate-200/80 dark:border-slate-800">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
          <span>
            {activeSubTab === 'travel' && `Showing ${filteredData.length} bookings across ${uniqueCampuses.length} campuses`}
            {activeSubTab === 'advances' && `Showing ${filteredAdvances.length} advance records • ₹${totalAdvReceived.toLocaleString()} total pool`}
            {activeSubTab === 'cancellations' && `Showing ${filteredCancellations.length} cancellation cases • ₹${totalCancelOrgAbsorbed.toLocaleString()} absorbed loss`}
            {activeSubTab === 'tat-sla' && `SLA Compliance: ${overallCompliancePct}% • Mode: ${enableUrgencySla ? 'Urgency-Tiered' : `${tatBookingTarget}h Fixed`}`}
          </span>
        </div>
      </div>

      {/* Filter & Period Controls Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Period Pill Group (Design from user screenshot) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1 inline-flex flex-wrap items-center gap-1 shadow-sm">
          {['ALL TIME', 'LAST 24 HOURS', 'LAST 7 DAYS', 'LAST 30 DAYS', 'THIS MONTH', 'LAST MONTH'].map(periodOption => {
            const isSelected = (filters.period || '').toUpperCase() === periodOption;
            return (
              <button
                key={periodOption}
                type="button"
                onClick={() => setFilters(f => ({ ...f, period: periodOption }))}
                className={`px-3.5 py-1.5 rounded-lg text-xs uppercase tracking-wider transition-all ${
                  isSelected
                    ? 'bg-blue-600 text-white font-black shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 font-bold hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                {periodOption}
              </button>
            );
          })}
        </div>

        {/* Dimension Filters (Campuses, Departments, Custom Date & Clear) */}
        <div className="bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-wrap gap-2.5 items-center shadow-sm">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
            <i className="fa-solid fa-filter text-xs"></i>
          </div>

          {/* Campus multi-select */}
          <div className="relative" ref={campusDropRef}>
            <button
              onClick={() => { setCampusDropOpen(v => !v); setDeptDropOpen(false); }}
              className={`flex items-center gap-2 min-w-[130px] bg-slate-50 dark:bg-slate-800 border rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 outline-none transition-all ${filters.campuses.length > 0 ? 'border-blue-400 dark:border-blue-500 font-bold text-blue-600' : 'border-slate-200 dark:border-slate-700'}`}
            >
              <i className="fa-solid fa-building text-slate-400 text-xs"></i>
              <span className="flex-1 text-left truncate">
                {filters.campuses.length === 0 ? 'All Campuses' : filters.campuses.length === 1 ? filters.campuses[0] : `${filters.campuses.length} Campuses`}
              </span>
              <i className={`fa-solid fa-chevron-${campusDropOpen ? 'up' : 'down'} text-[10px] text-slate-400`}></i>
            </button>
            {campusDropOpen && (
              <div className="absolute top-full right-0 lg:left-0 mt-1 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="p-2 border-b dark:border-slate-800 flex justify-between items-center">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Campus</span>
                  {filters.campuses.length > 0 && (
                    <button onClick={() => setFilters(f => ({ ...f, campuses: [] }))} className="text-xs font-bold text-rose-500 hover:text-rose-600">Clear</button>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto custom-scrollbar p-1">
                  {uniqueCampuses.map(c => {
                    const checked = filters.campuses.includes(c);
                    return (
                      <button key={c} onClick={() => setFilters(f => ({ ...f, campuses: checked ? f.campuses.filter(x => x !== c) : [...f.campuses, c] }))}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${checked ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                      >
                        <div className={`w-4 h-4 rounded-lg flex items-center justify-center border-2 flex-shrink-0 transition-all ${checked ? 'bg-blue-600 border-blue-600' : 'border-slate-300 dark:border-slate-600'}`}>
                          {checked && <i className="fa-solid fa-check text-white text-[8px]"></i>}
                        </div>
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Department multi-select */}
          <div className="relative" ref={deptDropRef}>
            <button
              onClick={() => { setDeptDropOpen(v => !v); setCampusDropOpen(false); }}
              className={`flex items-center gap-2 min-w-[140px] bg-slate-50 dark:bg-slate-800 border rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 outline-none transition-all ${filters.departments.length > 0 ? 'border-blue-400 dark:border-blue-500 font-bold text-blue-600' : 'border-slate-200 dark:border-slate-700'}`}
            >
              <i className="fa-solid fa-sitemap text-slate-400 text-xs"></i>
              <span className="flex-1 text-left truncate">
                {filters.departments.length === 0 ? 'All Depts' : filters.departments.length === 1 ? filters.departments[0] : `${filters.departments.length} Depts`}
              </span>
              <i className={`fa-solid fa-chevron-${deptDropOpen ? 'up' : 'down'} text-[10px] text-slate-400`}></i>
            </button>
            {deptDropOpen && (
              <div className="absolute top-full right-0 lg:left-0 mt-1 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="p-2 border-b dark:border-slate-800 flex justify-between items-center">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Department</span>
                  {filters.departments.length > 0 && (
                    <button onClick={() => setFilters(f => ({ ...f, departments: [] }))} className="text-xs font-bold text-rose-500 hover:text-rose-600">Clear</button>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto custom-scrollbar p-1">
                  {uniqueDepts.map(d => {
                    const checked = filters.departments.includes(d);
                    return (
                      <button key={d} onClick={() => setFilters(f => ({ ...f, departments: checked ? f.departments.filter(x => x !== d) : [...f.departments, d] }))}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${checked ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                      >
                        <div className={`w-4 h-4 rounded-lg flex items-center justify-center border-2 flex-shrink-0 transition-all ${checked ? 'bg-blue-600 border-blue-600' : 'border-slate-300 dark:border-slate-600'}`}>
                          {checked && <i className="fa-solid fa-check text-white text-[8px]"></i>}
                        </div>
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {(filters.campuses.length > 0 || filters.departments.length > 0) && (
            <button
              onClick={() => setFilters(f => ({ ...f, campuses: [], departments: [] }))}
              className="text-xs font-bold text-slate-400 hover:text-rose-500 flex items-center gap-1 transition-colors px-1"
            >
              <i className="fa-solid fa-xmark"></i> Clear
            </button>
          )}

          {showComparison && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1 rounded-full">
              <i className="fa-solid fa-arrows-left-right text-[10px]"></i>
              vs previous
            </div>
          )}
        </div>
      </div>

      {loadingData ? (
        <div className="h-64 flex flex-col items-center justify-center gap-3">
          <i className="fa-solid fa-circle-notch fa-spin text-3xl text-indigo-500 animate-spin"></i>
          <span className="text-sm font-bold text-slate-400">Loading analytics data...</span>
        </div>
      ) : activeSubTab === 'travel' ? (
        // --- TRAVEL & SPEND SUB-TAB ---
        <div className="space-y-8 animate-in fade-in duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title="Total Requests" value={totalRequests} icon={<i className="fa-solid fa-inbox"></i>} trend={reqChange?.pct} trendUp={reqChange?.up} description={showComparison ? `vs ${prevTotalRequests} prev period` : 'All time volume'} />
            {isFinancialView ? (
              <StatCard title="Total Spend" value={`₹ ${totalSpend.toLocaleString()}`} icon={<i className="fa-solid fa-indian-rupee-sign"></i>} trend={spendChange?.pct} trendUp={spendChange?.up !== undefined ? !spendChange.up : undefined} description="Actual ticket cost" />
            ) : (
              <StatCard title="Total Tickets" value={totalBookings} icon={<i className="fa-solid fa-check-double"></i>} trend={bookingsChange?.pct} trendUp={bookingsChange?.up} description={showComparison ? `vs ${prevTotalBookings} prev period` : 'Successfully closed'} />
            )}
            <StatCard title="Open Requests" value={openRequests} icon={<i className="fa-solid fa-clock"></i>} description="Pending action" />
            <StatCard title="Avg Ticket Cost" value={avgTicketCost > 0 ? `₹${avgTicketCost.toLocaleString()}` : '—'} icon={<i className="fa-solid fa-calculator"></i>} trend={avgCostChange?.pct} trendUp={avgCostChange?.up} description={`${bookedWithCost.length} closed tickets`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card className="p-6">
              <h4 className="font-bold text-slate-800 dark:text-white mb-6">Request Status Breakdown</h4>
              <DonutChart data={statusData} />
            </Card>
            <Card className="p-6 flex flex-col" style={{ minHeight: '420px' }}>
              <div className="flex justify-between items-center mb-5">
                <h4 className="font-bold text-slate-800 dark:text-white">{isFinancialView ? 'Spend by Department' : 'Volume by Department'}</h4>
                <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                  {(['bar', 'line', 'scatter', 'bubble', 'pie'] as const).map(type => (
                    <button key={type} onClick={() => setDeptChartType(type)} title={type.charAt(0).toUpperCase() + type.slice(1)}
                      className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs transition-all ${deptChartType === type ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                      <i className={`fa-solid ${CHART_ICONS[type]}`}></i>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 flex flex-col justify-center">
                {renderDeptChart()}
              </div>
            </Card>
          </div>

          {/* Mode & Priority distributions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card className="p-6">
              <h4 className="font-bold text-slate-800 dark:text-white mb-5 flex items-center gap-2"><i className="fa-solid fa-plane text-sm text-indigo-500"></i> Travel Mode Distribution</h4>
              <div className="space-y-4">
                {modeData.map(([mode, count]) => {
                  const maxVal = Math.max(...modeData.map(m => m[1]), 1);
                  const pct = Math.round((count / (totalRequests || 1)) * 100);
                  return (
                    <div key={mode} className="space-y-1">
                      <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
                        <span>{mode}</span>
                        <span>{count} ({pct}%)</span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${(count / maxVal) * 100}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="p-6">
              <h4 className="font-bold text-slate-800 dark:text-white mb-5 flex items-center gap-2"><i className="fa-solid fa-circle-exclamation text-sm text-amber-500"></i> Priority Distribution</h4>
              <div className="space-y-4">
                {priorityData.map(([pri, count]) => {
                  const maxVal = Math.max(...priorityData.map(p => p[1]), 1);
                  const pct = Math.round((count / (totalRequests || 1)) * 100);
                  const colors: Record<string, string> = { Critical: 'bg-rose-500', High: 'bg-orange-500', Medium: 'bg-sky-500', Low: 'bg-slate-400' };
                  return (
                    <div key={pri} className="space-y-1">
                      <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
                        <span>{pri}</span>
                        <span>{count} ({pct}%)</span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full ${colors[pri] || 'bg-indigo-500'} rounded-full transition-all duration-500`} style={{ width: `${(count / maxVal) * 100}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* Department tickets summary */}
          <Card className="overflow-hidden">
            <div className="p-6 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <div>
                <h4 className="font-bold text-slate-800 dark:text-white">Tickets by Department</h4>
                <p className="text-xs text-slate-400 mt-0.5">Booking summary per department — click headers to sort</p>
              </div>
              <span className="text-xs font-bold bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 px-3 py-1.5 rounded-full">{filteredData.length} records</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-white dark:bg-slate-900 text-xs font-bold text-slate-400 uppercase tracking-widest border-b dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-4 cursor-pointer hover:text-indigo-600 transition-colors select-none" onClick={() => toggleDeptSort('dept')}>Department <SortIcon col="dept" current={deptSort} /></th>
                    <th className="px-6 py-4 cursor-pointer hover:text-indigo-600 transition-colors select-none" onClick={() => toggleDeptSort('count')}># Tickets <SortIcon col="count" current={deptSort} /></th>
                    {isFinancialView && <th className="px-6 py-4 cursor-pointer hover:text-indigo-600 transition-colors select-none" onClick={() => toggleDeptSort('avg')}>Avg Cost <SortIcon col="avg" current={deptSort} /></th>}
                    {isFinancialView && <th className="px-6 py-4 cursor-pointer hover:text-indigo-600 transition-colors select-none" onClick={() => toggleDeptSort('total')}>Total Cost <SortIcon col="total" current={deptSort} /></th>}
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-slate-800">
                  {sortedDeptSummary.map((row, i) => (
                    <tr key={row.dept} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}></div>
                          <span className="font-bold text-slate-800 dark:text-white">{row.dept}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-slate-800 dark:text-white w-8">{row.count}</span>
                          <div className="flex-1 max-w-[100px] h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(row.count / (Math.max(...sortedDeptSummary.map(r => r.count)) || 1)) * 100}%` }}></div>
                          </div>
                        </div>
                      </td>
                      {isFinancialView && <td className="px-6 py-4 font-mono text-slate-600 dark:text-slate-400">₹{row.avgCost.toLocaleString()}</td>}
                      {isFinancialView && <td className="px-6 py-4"><span className="font-bold text-slate-900 dark:text-white">₹{row.totalCost.toLocaleString()}</span></td>}
                    </tr>
                  ))}
                  {sortedDeptSummary.length === 0 && (
                    <tr><td colSpan={isFinancialView ? 4 : 2} className="px-6 py-12 text-center text-slate-400 text-sm">No data for the selected period.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Detailed Travel Report (Paginated) */}
          <Card className="overflow-hidden">
            <div className="p-6 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <h4 className="font-bold text-slate-800 dark:text-white">Detailed Travel Report</h4>
              <span className="text-xs font-bold text-slate-400">Showing {paginatedTravelData.length} of {filteredData.length} requests</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-white dark:bg-slate-900 text-xs font-bold text-slate-400 uppercase tracking-widest border-b dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-4">Request ID</th>
                    <th className="px-6 py-4">Traveler</th>
                    <th className="px-6 py-4">Dept / Campus</th>
                    <th className="px-6 py-4">Route</th>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Ticket</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-slate-800">
                  {paginatedTravelData.map((r: any) => (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4 font-mono font-bold text-indigo-600 text-xs">{r.submissionId || r.id}</td>
                      <td className="px-6 py-4 font-bold text-slate-800 dark:text-white">{r.requesterName}</td>
                      <td className="px-6 py-4 text-slate-500 text-xs">{r.requesterDepartment} <span className="text-slate-300 mx-1">•</span> {r.requesterCampus}</td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{r.from} → {r.to}</td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{new Date(r.dateOfTravel).toLocaleDateString()}</td>
                      <td className="px-6 py-4"><StatusBadge type="pnc" value={r.pncStatus} /></td>
                      <td className="px-6 py-4 text-xs font-mono text-slate-500">{(r.invoiceUrl || r.ticketUrl) ? (<a href={r.invoiceUrl || r.ticketUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline flex items-center gap-1">View <i className="fa-solid fa-arrow-up-right-from-square text-xs"></i></a>) : <span className="text-slate-300">—</span>}</td>
                    </tr>
                  ))}
                  {paginatedTravelData.length === 0 && (
                    <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-400 text-sm">No data matching the current criteria.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalTravelPages > 1 && (
              <div className="p-4 border-t dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/20">
                <button disabled={travelPage === 1} onClick={() => setTravelPage(p => p - 1)} className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-all">
                  <i className="fa-solid fa-chevron-left mr-1"></i>Previous
                </button>
                <span className="text-xs font-bold text-slate-400">Page {travelPage} of {totalTravelPages}</span>
                <button disabled={travelPage === totalTravelPages} onClick={() => setTravelPage(p => p + 1)} className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-all">
                  Next<i className="fa-solid fa-chevron-right ml-1"></i>
                </button>
              </div>
            )}
          </Card>
        </div>
      ) : activeSubTab === 'advances' ? (
        // --- ADVANCES & FUNDS SUB-TAB ---
        <div className="space-y-8 animate-in fade-in duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title="Total Received" value={`₹ ${totalAdvReceived.toLocaleString()}`} icon={<i className="fa-solid fa-wallet text-indigo-500"></i>} description="Accumulated pool funds" />
            <StatCard title="Remaining Balance" value={`₹ ${totalAdvRemaining.toLocaleString()}`} icon={<i className="fa-solid fa-money-bill-wave text-emerald-500"></i>} description="Active balance left" />
            <StatCard title="Total Utilized" value={`₹ ${totalAdvSpent.toLocaleString()}`} icon={<i className="fa-solid fa-receipt text-amber-500"></i>} description="Total spent on tickets" />
            <StatCard title="Settled Advances" value={`${advSettledCount} / ${filteredAdvances.length}`} icon={<i className="fa-solid fa-clipboard-check text-sky-500"></i>} description="Fully reconciled advances" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card className="p-6 flex flex-col items-center justify-center">
              <h4 className="font-bold text-slate-800 dark:text-white mb-6 w-full text-left">Funds Utilization Gauge</h4>
              <div className="relative flex items-center justify-center h-48 w-full">
                {(() => {
                  const radius = 50;
                  const circ = 2 * Math.PI * radius;
                  const offset = circ - (Math.min(100, advUtilPct) / 100) * circ;
                  return (
                    <>
                      <svg className="w-40 h-40 transform -rotate-90">
                        <circle cx="80" cy="80" r={radius} stroke="#e2e8f0" strokeWidth="10" fill="transparent" className="dark:stroke-slate-800" />
                        <circle cx="80" cy="80" r={radius} stroke="url(#advGaugeGrad)" strokeWidth="10" fill="transparent" strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
                        <defs>
                          <linearGradient id="advGaugeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#6366f1" />
                            <stop offset="100%" stopColor="#10b981" />
                          </linearGradient>
                        </defs>
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-3xl font-black text-slate-800 dark:text-white">{advUtilPct.toFixed(1)}%</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Utilized</span>
                      </div>
                    </>
                  );
                })()}
              </div>
              <p className="text-xs text-slate-400 mt-2 text-center max-w-xs">
                Reflects the percentage of total advance funds that have been converted into active travel ticket bookings.
              </p>
            </Card>

            <Card className="p-6">
              <h4 className="font-bold text-slate-800 dark:text-white mb-5 flex items-center gap-2"><i className="fa-solid fa-landmark text-sm text-indigo-500"></i> Funding Source Breakdown</h4>
              <div className="space-y-4">
                {(() => {
                  const sources: Record<string, number> = {};
                  filteredAdvances.forEach(a => {
                    sources[a.received_from] = (sources[a.received_from] || 0) + (Number(a.amount_received) || 0);
                  });
                  const entries = Object.entries(sources);
                  const maxVal = Math.max(...entries.map(e => e[1]), 1);
                  return entries.map(([src, amount]) => {
                    const pct = Math.round((amount / (totalAdvReceived || 1)) * 100);
                    return (
                      <div key={src} className="space-y-1">
                        <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
                          <span>{src}</span>
                          <span>₹{amount.toLocaleString()} ({pct}%)</span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${(amount / maxVal) * 100}%` }}></div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </Card>
          </div>

          {/* Advances detail list */}
          <Card className="overflow-hidden">
            <div className="p-6 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <h4 className="font-bold text-slate-800 dark:text-white">Advances Log</h4>
              <span className="text-xs font-bold text-slate-400">Showing {paginatedAdvancesData.length} of {filteredAdvances.length} records</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-white dark:bg-slate-900 text-xs font-bold text-slate-400 uppercase tracking-widest border-b dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-4 cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleAdvSort('received_on')}>Received Date <SortIcon col="received_on" current={advSort} /></th>
                    <th className="px-6 py-4 cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleAdvSort('received_from')}>Source <SortIcon col="received_from" current={advSort} /></th>
                    <th className="px-6 py-4 cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleAdvSort('amount_received')}>Received <SortIcon col="amount_received" current={advSort} /></th>
                    <th className="px-6 py-4 cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleAdvSort('amount_left')}>Remaining <SortIcon col="amount_left" current={advSort} /></th>
                    <th className="px-6 py-4">Util. %</th>
                    <th className="px-6 py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-slate-800">
                  {paginatedAdvancesData.map((a: any) => {
                    const uPct = a.amount_received > 0 ? ((a.amount_received - a.amount_left) / a.amount_received) * 100 : 0;
                    return (
                      <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-4 font-bold text-slate-800 dark:text-white">{new Date(a.received_on).toLocaleDateString()}</td>
                        <td className="px-6 py-4 font-bold text-indigo-600">{a.received_from}</td>
                        <td className="px-6 py-4 font-mono text-slate-900 dark:text-white font-bold">₹{Number(a.amount_received).toLocaleString()}</td>
                        <td className="px-6 py-4 font-mono text-emerald-600 dark:text-emerald-400">₹{Number(a.amount_left).toLocaleString()}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs">{uPct.toFixed(0)}%</span>
                            <div className="w-12 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${uPct}%` }}></div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full ${a.is_settled ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600' : 'bg-amber-50 dark:bg-amber-950/30 text-amber-600'}`}>
                            {a.is_settled ? 'Settled' : 'Active'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {paginatedAdvancesData.length === 0 && (
                    <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-sm">No advances matched the current period.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalAdvancesPages > 1 && (
              <div className="p-4 border-t dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/20">
                <button disabled={advancesPage === 1} onClick={() => setAdvancesPage(p => p - 1)} className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-all">
                  <i className="fa-solid fa-chevron-left mr-1"></i>Previous
                </button>
                <span className="text-xs font-bold text-slate-400">Page {advancesPage} of {totalAdvancesPages}</span>
                <button disabled={advancesPage === totalAdvancesPages} onClick={() => setAdvancesPage(p => p + 1)} className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-all">
                  Next<i className="fa-solid fa-chevron-right ml-1"></i>
                </button>
              </div>
            )}
          </Card>
        </div>
      ) : activeSubTab === 'cancellations' ? (
        // --- CANCELLATIONS & RECOVERY SUB-TAB ---
        <div className="space-y-8 animate-in fade-in duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title="Cancelled Bookings" value={filteredCancellations.length} icon={<i className="fa-solid fa-rectangle-xmark text-rose-500"></i>} description="Total cancellation records" />
            <StatCard title="Original Value" value={`₹ ${totalCancelOriginalFare.toLocaleString()}`} icon={<i className="fa-solid fa-ticket text-slate-500"></i>} description="Sum of original ticket costs" />
            <StatCard title="Recovered/Refunded" value={`₹ ${totalCancelVendorRefund.toLocaleString()}`} icon={<i className="fa-solid fa-arrow-down-long text-emerald-500"></i>} description="Vendor/Airline refunds" />
            <StatCard title="Direct Org Loss" value={`₹ ${totalCancelOrgAbsorbed.toLocaleString()}`} icon={<i className="fa-solid fa-triangle-exclamation text-rose-500"></i>} description="Net loss absorbed by Org" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card className="p-6">
              <h4 className="font-bold text-slate-800 dark:text-white mb-6">Financial Recovery Split</h4>
              {totalCancelOriginalFare > 0 ? (
                <div className="space-y-6">
                  {(() => {
                    const vendPct = (totalCancelVendorRefund / totalCancelOriginalFare) * 100;
                    const empPct = (totalCancelEmployeeOwed / totalCancelOriginalFare) * 100;
                    const orgPct = (totalCancelOrgAbsorbed / totalCancelOriginalFare) * 100;
                    return (
                      <>
                        <div className="h-6 w-full bg-slate-100 dark:bg-slate-800 rounded-full flex overflow-hidden">
                          {vendPct > 0 && <div className="bg-emerald-500 h-full transition-all" style={{ width: `${vendPct}%` }} title="Vendor Refund" />}
                          {empPct > 0 && <div className="bg-sky-500 h-full transition-all" style={{ width: `${empPct}%` }} title="Employee Owed" />}
                          {orgPct > 0 && <div className="bg-rose-500 h-full transition-all" style={{ width: `${orgPct}%` }} title="Org Absorbed Loss" />}
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-xs font-bold text-center">
                          <div className="bg-emerald-50 dark:bg-emerald-950/20 p-3 rounded-lg border border-emerald-100 dark:border-emerald-900/30">
                            <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Vendor Refunded</div>
                            <div className="text-emerald-600 text-sm font-black">₹{totalCancelVendorRefund.toLocaleString()}</div>
                            <div className="text-slate-400 text-[10px] mt-0.5">{vendPct.toFixed(1)}%</div>
                          </div>
                          <div className="bg-sky-50 dark:bg-sky-950/20 p-3 rounded-lg border border-sky-100 dark:border-sky-900/30">
                            <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Employee Owed</div>
                            <div className="text-sky-600 text-sm font-black">₹{totalCancelEmployeeOwed.toLocaleString()}</div>
                            <div className="text-slate-400 text-[10px] mt-0.5">{empPct.toFixed(1)}%</div>
                          </div>
                          <div className="bg-rose-50 dark:bg-rose-950/20 p-3 rounded-lg border border-rose-100 dark:border-rose-900/30">
                            <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Org Absorbed</div>
                            <div className="text-rose-600 text-sm font-black">₹{totalCancelOrgAbsorbed.toLocaleString()}</div>
                            <div className="text-slate-400 text-[10px] mt-0.5">{orgPct.toFixed(1)}%</div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div className="h-40 flex items-center justify-center text-slate-400 text-sm italic">
                  No cancellation metrics available for the selected period.
                </div>
              )}
            </Card>

            <Card className="p-6">
              <h4 className="font-bold text-slate-800 dark:text-white mb-5 flex items-center gap-2"><i className="fa-solid fa-users-gear text-sm text-indigo-500"></i> Cancelled By Distribution</h4>
              <div className="space-y-4">
                {(() => {
                  let employeeCount = 0;
                  let orgCount = 0;
                  filteredCancellations.forEach(c => {
                    if (c.cancelled_by === 'Employee' || c.cancelledBy === 'Employee') employeeCount++;
                    else orgCount++;
                  });
                  const total = employeeCount + orgCount || 1;
                  const empPct = Math.round((employeeCount / total) * 100);
                  const orgPct = Math.round((orgCount / total) * 100);
                  const maxVal = Math.max(employeeCount, orgCount, 1);
                  return (
                    <>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
                          <span>Employee Personal Reasons</span>
                          <span>{employeeCount} ({empPct}%)</span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-rose-500 rounded-full transition-all duration-500" style={{ width: `${(employeeCount / maxVal) * 100}%` }}></div>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
                          <span>Organization Decision</span>
                          <span>{orgCount} ({orgPct}%)</span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${(orgCount / maxVal) * 100}%` }}></div>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </Card>
          </div>

          {/* Cancellations list */}
          <Card className="overflow-hidden">
            <div className="p-6 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <h4 className="font-bold text-slate-800 dark:text-white">Cancellations Ledger</h4>
              <span className="text-xs font-bold text-slate-400">Showing {paginatedCancellationsData.length} of {filteredCancellations.length} records</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-white dark:bg-slate-900 text-xs font-bold text-slate-400 uppercase tracking-widest border-b dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-4 cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleCancelSort('cancellation_date')}>Cancel Date <SortIcon col="cancellation_date" current={cancelSort} /></th>
                    <th className="px-6 py-4">Submission ID</th>
                    <th className="px-6 py-4">Traveler</th>
                    <th className="px-6 py-4 cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleCancelSort('original_fare')}>Original Fare <SortIcon col="original_fare" current={cancelSort} /></th>
                    <th className="px-6 py-4">Direct Org Loss</th>
                    <th className="px-6 py-4 cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleCancelSort('status')}>Status <SortIcon col="status" current={cancelSort} /></th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-slate-800">
                  {paginatedCancellationsData.map((c: any) => (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-600 dark:text-slate-400">{new Date(c.cancellation_date || c.cancellationDate || 0).toLocaleDateString()}</td>
                      <td className="px-6 py-4 font-mono font-bold text-indigo-600 text-xs">{c.travel_requests?.submission_id || '—'}</td>
                      <td className="px-6 py-4 font-bold text-slate-800 dark:text-white">{c.travel_requests?.requester_name || '—'}</td>
                      <td className="px-6 py-4 font-mono text-slate-900 dark:text-white font-bold">₹{Number(c.original_fare || c.originalFare || 0).toLocaleString()}</td>
                      <td className="px-6 py-4 font-mono text-rose-600 dark:text-rose-400 font-bold">₹{Number(c.org_absorbed_amount || c.orgAbsorbedAmount || 0).toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full ${c.status === 'Reconciled' || c.status === 'Fully Refunded' ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600' : 'bg-amber-50 dark:bg-amber-950/30 text-amber-600'}`}>
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {paginatedCancellationsData.length === 0 && (
                    <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-sm">No cancellation records found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalCancellationsPages > 1 && (
              <div className="p-4 border-t dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/20">
                <button disabled={cancellationsPage === 1} onClick={() => setCancellationsPage(p => p - 1)} className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-all">
                  <i className="fa-solid fa-chevron-left mr-1"></i>Previous
                </button>
                <span className="text-xs font-bold text-slate-400">Page {cancellationsPage} of {totalCancellationsPages}</span>
                <button disabled={cancellationsPage === totalCancellationsPages} onClick={() => setCancellationsPage(p => p + 1)} className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-all">
                  Next<i className="fa-solid fa-chevron-right ml-1"></i>
                </button>
              </div>
            )}
          </Card>
        </div>
      ) : (
        // --- TAT AND SLAS SUB-TAB ---
        <div className="space-y-8 animate-in fade-in duration-300">
          {/* Executive Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard
              title="Overall SLA Compliance"
              value={`${overallCompliancePct}%`}
              icon={<i className="fa-solid fa-shield-halved text-emerald-500"></i>}
              description={`${closedOnTime} of ${closedCount || totalSlaRequests} resolved within target`}
            />
            <StatCard
              title="Avg Fulfillment TAT"
              value={`${avgFulfillmentHours} hrs`}
              icon={<i className="fa-solid fa-stopwatch text-indigo-500"></i>}
              description={enableUrgencySla ? 'Urgency-tiered dynamic limits' : `Target: ${tatBookingTarget} hrs`}
            />
            <StatCard
              title="Avg Manager Approval"
              value={`${avgApprovalHours} hrs`}
              icon={<i className="fa-solid fa-user-check text-sky-500"></i>}
              description={`Target: ${tatApprovalTarget} hrs limit`}
            />
            <StatCard
              title="Breached / At Risk"
              value={`${totalBreaches} / ${activeAtRisk}`}
              icon={<i className="fa-solid fa-triangle-exclamation text-rose-500"></i>}
              description={`${totalBreaches} past target, ${activeAtRisk} nearing limit`}
            />
          </div>

          {/* Active Policy Status & SLA Enforcement Banner */}
          <div className="bg-gradient-to-r from-indigo-500/10 via-slate-50 to-emerald-500/10 dark:from-indigo-950/30 dark:via-slate-900 dark:to-emerald-950/20 border border-indigo-100 dark:border-indigo-900/40 rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 shadow-md">
                <i className="fa-solid fa-sliders text-base"></i>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-black text-slate-800 dark:text-white text-sm">
                    {enableUrgencySla ? 'Urgency-Tiered SLA Enforcement Active' : 'Standard Fixed SLA Mode Active'}
                  </h4>
                  <span className={`px-2 py-0.5 text-[10px] font-black rounded-full uppercase tracking-wider ${enableUrgencySla ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}>
                    {enableUrgencySla ? 'Urgency Mode' : 'Standard Mode'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {enableUrgencySla
                    ? 'Target turnaround times scale with travel proximity: Critical (<2d) 4h, High (2-10d) 12h, Medium (10-20d) 24h, Low (>20d) 48h.'
                    : `All booking fulfillments are evaluated against the standard target of ${tatBookingTarget} hours (Approval: ${tatApprovalTarget}h, Processing: ${tatProcessingTarget}h).`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-white/80 dark:bg-slate-800/80 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex-shrink-0">
              <i className="fa-solid fa-clock-rotate-left text-indigo-500"></i>
              <span>Active Total: {totalSlaRequests} Requests</span>
            </div>
          </div>

          {/* Urgency-Tier SLA Breakdown (4 Tiers) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-800 dark:text-white text-base flex items-center gap-2">
                <i className="fa-solid fa-layer-group text-indigo-500"></i>
                Performance by Urgency Tier
              </h4>
              <span className="text-xs text-slate-400 font-medium">Dynamic classification based on days until travel date</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {tierStats.map(stat => {
                const isCritical = stat.tier === Priority.CRITICAL;
                const isHigh = stat.tier === Priority.HIGH;
                const isMedium = stat.tier === Priority.MEDIUM;

                const borderColor = isCritical ? 'border-rose-200 dark:border-rose-900/40' :
                  isHigh ? 'border-amber-200 dark:border-amber-900/40' :
                  isMedium ? 'border-sky-200 dark:border-sky-900/40' :
                  'border-emerald-200 dark:border-emerald-900/40';

                const badgeBg = isCritical ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' :
                  isHigh ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                  isMedium ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400' :
                  'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';

                const barBg = isCritical ? 'bg-rose-500' : isHigh ? 'bg-amber-500' : isMedium ? 'bg-sky-500' : 'bg-emerald-500';

                const daysLabel = isCritical ? '< 2 Days' : isHigh ? '2 – 10 Days' : isMedium ? '10 – 20 Days' : '> 20 Days';

                return (
                  <Card key={stat.tier} className={`p-5 border ${borderColor} hover:shadow-md transition-shadow`}>
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wider ${badgeBg}`}>
                          <i className={`fa-solid ${isCritical ? 'fa-fire' : isHigh ? 'fa-bolt' : isMedium ? 'fa-clock' : 'fa-leaf'} text-[10px]`}></i>
                          {stat.tier}
                        </span>
                        <div className="text-[11px] font-bold text-slate-400 mt-1">Travel in {daysLabel}</div>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-black text-slate-800 dark:text-white">{stat.count}</span>
                        <span className="block text-[10px] uppercase font-bold text-slate-400">Tickets</span>
                      </div>
                    </div>

                    <div className="space-y-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Target SLA:</span>
                        <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{stat.targetHours}h</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Actual Avg TAT:</span>
                        <span className={`font-mono font-bold ${stat.avgTat > stat.targetHours ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {stat.avgTat}h
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Breaches:</span>
                        <span className={`font-bold ${stat.breaches > 0 ? 'text-rose-500' : 'text-slate-400'}`}>{stat.breaches}</span>
                      </div>

                      <div className="pt-2">
                        <div className="flex justify-between text-[11px] font-bold mb-1">
                          <span className="text-slate-400">Compliance</span>
                          <span className="text-slate-700 dark:text-slate-300">{stat.compliance}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className={`h-full ${barBg} rounded-full transition-all duration-500`} style={{ width: `${stat.compliance}%` }}></div>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Lifecycle Stage Bottleneck Diagnostic & Campus Scorecard */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Stage Bottleneck Diagnostic */}
            <Card className="p-6">
              <h4 className="font-bold text-slate-800 dark:text-white mb-2 flex items-center gap-2">
                <i className="fa-solid fa-arrows-split-up-and-left text-indigo-500"></i>
                Lifecycle Stage Bottleneck Diagnostic
              </h4>
              <p className="text-xs text-slate-400 mb-6">Identifies where delays occur across the travel approval and fulfillment pipeline.</p>

              <div className="space-y-6">
                {stageStats.map(stage => {
                  const isBreachedOverall = stage.avg > stage.target;
                  const ratio = stage.target > 0 ? Math.min(100, Math.round((stage.avg / stage.target) * 100)) : 0;
                  return (
                    <div key={stage.name} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 text-xs">
                            <i className={`fa-solid ${stage.icon}`}></i>
                          </div>
                          <div>
                            <span className="font-bold text-slate-800 dark:text-white">{stage.name}</span>
                            <span className="text-xs text-slate-400 ml-2">Target: {stage.target}h</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`font-mono font-bold ${isBreachedOverall ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {stage.avg}h avg
                          </span>
                          <span className="text-[10px] text-slate-400 ml-2">({stage.breaches} breaches)</span>
                        </div>
                      </div>

                      <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${isBreachedOverall ? 'bg-rose-500' : 'bg-indigo-500'}`}
                          style={{ width: `${Math.min(100, ratio)}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>0h</span>
                        <span>{stage.target}h target limit</span>
                        <span>{Math.max(stage.target, Math.round(stage.avg * 1.2))}h</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Campus SLA Scorecard */}
            <Card className="p-6">
              <h4 className="font-bold text-slate-800 dark:text-white mb-2 flex items-center gap-2">
                <i className="fa-solid fa-ranking-star text-indigo-500"></i>
                Campus SLA Scorecard
              </h4>
              <p className="text-xs text-slate-400 mb-5">Rankings based on ticket fulfillment compliance and turnaround speed.</p>

              <div className="space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                {campusSlaRanking.map((cr, idx) => (
                  <div key={cr.campus} className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${idx === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                        #{idx + 1}
                      </div>
                      <div>
                        <div className="font-bold text-slate-800 dark:text-white text-sm">{cr.campus}</div>
                        <div className="text-xs text-slate-400">{cr.count} total requests • {cr.breaches} breaches</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <span className={`text-sm font-black ${cr.compliance >= 90 ? 'text-emerald-600 dark:text-emerald-400' : cr.compliance >= 75 ? 'text-amber-500' : 'text-rose-500'}`}>
                          {cr.compliance}%
                        </span>
                        <span className="text-[10px] uppercase font-bold text-slate-400">compliance</span>
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">{cr.avgTat}h avg TAT</div>
                    </div>
                  </div>
                ))}
                {campusSlaRanking.length === 0 && (
                  <div className="h-36 flex items-center justify-center text-slate-400 text-xs italic">
                    No campus data available.
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Detailed Request SLA Audit Ledger */}
          <Card className="overflow-hidden">
            <div className="p-6 border-b dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 dark:bg-slate-800/50">
              <div>
                <h4 className="font-bold text-slate-800 dark:text-white">Individual Request SLA Audit Ledger</h4>
                <p className="text-xs text-slate-400 mt-0.5">Auditing dynamic urgency, stage progression, and breach states.</p>
              </div>

              {/* Ledger Controls */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Search */}
                <div className="relative">
                  <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                  <input
                    type="text"
                    placeholder="Search ID, traveler, route..."
                    value={slaSearch}
                    onChange={e => { setSlaSearch(e.target.value); setSlaPage(1); }}
                    className="pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Urgency Filter */}
                <select
                  value={slaPriorityFilter}
                  onChange={e => { setSlaPriorityFilter(e.target.value as Priority | 'all'); setSlaPage(1); }}
                  className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">All Urgency Tiers</option>
                  <option value={Priority.CRITICAL}>Critical (&lt; 2d)</option>
                  <option value={Priority.HIGH}>High (2–10d)</option>
                  <option value={Priority.MEDIUM}>Medium (10–20d)</option>
                  <option value={Priority.LOW}>Low (&gt; 20d)</option>
                </select>

                {/* Status Filter */}
                <select
                  value={slaStatusFilter}
                  onChange={e => { setSlaStatusFilter(e.target.value as any); setSlaPage(1); }}
                  className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">All SLA States</option>
                  <option value="Met">Met</option>
                  <option value="On Track">On Track</option>
                  <option value="At Risk">At Risk</option>
                  <option value="Breached">Breached</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-white dark:bg-slate-900 text-xs font-bold text-slate-400 uppercase tracking-widest border-b dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-4 cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleSlaSort('submissionId')}>
                      Request ID <SortIcon col="submissionId" current={slaSort} />
                    </th>
                    <th className="px-6 py-4 cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleSlaSort('requesterName')}>
                      Traveler & Campus <SortIcon col="requesterName" current={slaSort} />
                    </th>
                    <th className="px-6 py-4 cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleSlaSort('dateOfTravel')}>
                      Travel Date & Proximity <SortIcon col="dateOfTravel" current={slaSort} />
                    </th>
                    <th className="px-6 py-4">Urgency Tier</th>
                    <th className="px-6 py-4 cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleSlaSort('targetSlaHours')}>
                      Target SLA <SortIcon col="targetSlaHours" current={slaSort} />
                    </th>
                    <th className="px-6 py-4 cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleSlaSort('actualTatHours')}>
                      Actual TAT <SortIcon col="actualTatHours" current={slaSort} />
                    </th>
                    <th className="px-6 py-4">Approval / Processing</th>
                    <th className="px-6 py-4 cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleSlaSort('slaStatus')}>
                      SLA Status <SortIcon col="slaStatus" current={slaSort} />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-slate-800">
                  {paginatedSlaData.map(s => {
                    const statusClass = s.slaStatus === 'Met'
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 border-emerald-200 dark:border-emerald-800'
                      : s.slaStatus === 'On Track'
                      ? 'bg-sky-50 dark:bg-sky-950/30 text-sky-600 border-sky-200 dark:border-sky-800'
                      : s.slaStatus === 'At Risk'
                      ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 border-amber-200 dark:border-amber-800'
                      : 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 border-rose-200 dark:border-rose-800';

                    const tierClass = s.dynamicPriority === Priority.CRITICAL
                      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                      : s.dynamicPriority === Priority.HIGH
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : s.dynamicPriority === Priority.MEDIUM
                      ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';

                    return (
                      <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-indigo-600 text-xs">
                          {s.submissionId || s.id}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-800 dark:text-white">{s.requesterName}</div>
                          <div className="text-xs text-slate-400">{s.requesterCampus} • {s.requesterDepartment}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-slate-700 dark:text-slate-300 font-medium">
                            {new Date(s.dateOfTravel).toLocaleDateString()}
                          </div>
                          <div className="text-[11px] font-bold text-slate-400">
                            {s.daysRemaining < 0
                              ? `${Math.abs(s.daysRemaining)}d ago`
                              : s.daysRemaining === 0
                              ? 'Today'
                              : `${s.daysRemaining}d to go`}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wider ${tierClass}`}>
                            {s.dynamicPriority}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono font-bold text-slate-700 dark:text-slate-300">
                          {s.targetSlaHours}h
                        </td>
                        <td className="px-6 py-4">
                          <span className={`font-mono font-bold ${s.isBreached ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-white'}`}>
                            {s.actualTatHours.toFixed(1)}h
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-mono text-slate-500">
                          <span>{s.approvalHours.toFixed(1)}h app.</span>
                          <span className="mx-1 text-slate-300 dark:text-slate-700">•</span>
                          <span>{s.processingHours.toFixed(1)}h proc.</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${statusClass}`}>
                            <i className={`fa-solid ${s.slaStatus === 'Met' ? 'fa-circle-check' : s.slaStatus === 'On Track' ? 'fa-spinner' : s.slaStatus === 'At Risk' ? 'fa-clock' : 'fa-triangle-exclamation'} text-[10px]`}></i>
                            {s.slaStatus}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {paginatedSlaData.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-slate-400 text-sm">
                        No requests matching the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalSlaPages > 1 && (
              <div className="p-4 border-t dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/20">
                <button
                  disabled={slaPage === 1}
                  onClick={() => setSlaPage(p => p - 1)}
                  className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-all"
                >
                  <i className="fa-solid fa-chevron-left mr-1"></i>Previous
                </button>
                <span className="text-xs font-bold text-slate-400">
                  Page {slaPage} of {totalSlaPages}
                </span>
                <button
                  disabled={slaPage === totalSlaPages}
                  onClick={() => setSlaPage(p => p + 1)}
                  className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-all"
                >
                  Next<i className="fa-solid fa-chevron-right ml-1"></i>
                </button>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};

export default AnalyticsView;
