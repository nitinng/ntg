import React, { useState, useEffect, useRef, useMemo } from 'react';
import { TravelRequest, User, UserRole, PNCStatus } from '../types';
import Card from './Card';
import StatCard from './StatCard';
import StatusBadge from './StatusBadge';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';

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
        <text x={cx} y={cy - 10} textAnchor="middle" fill="currentColor" fontSize="22" fontWeight="800" className="text-slate-900 dark:text-white" style={{ fill: hoveredIdx !== null ? slices[hoveredIdx].color : '#1e293b' }}>
          {hoveredIdx !== null ? fmtVal(slices[hoveredIdx].value) : fmtVal(total)}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="700">
          {hoveredIdx !== null ? `${slices[hoveredIdx].pct}%` : 'Total'}
        </text>
        {/* Inline SVG tooltip */}
        {hovered && (() => {
          const tx = Math.min(Math.max(tooltipPos.x, 60), W - 60);
          const ty = tooltipPos.y > cy ? tooltipPos.y - 44 : tooltipPos.y + 10;
          return (
            <g>
              <rect x={tx - 58} y={ty} width={116} height={36} rx="8" fill="#1e293b" fillOpacity="0.93" />
              <text x={tx} y={ty + 14} textAnchor="middle" fill="white" fontSize="9" fontWeight="700">{hovered.label}</text>
              <text x={tx} y={ty + 28} textAnchor="middle" fill={hovered.color} fontSize="11" fontWeight="800">{fmtVal(hovered.value)} ({hovered.pct}%)</text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
};

export const AnalyticsView: React.FC<{ requests: TravelRequest[]; currentUser: User }> = ({ requests, currentUser }) => {
  const [filters, setFilters] = useState<{
    campuses: string[];
    departments: string[];
    period: string;
    startDate: string;
    endDate: string;
  }>({
    campuses: [],
    departments: [],
    period: 'All Time',
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

  const [activeSubTab, setActiveSubTab] = useState<'travel' | 'advances' | 'cancellations'>('travel');
  const [advances, setAdvances] = useState<any[]>([]);
  const [cancellations, setCancellations] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Pagination states
  const [travelPage, setTravelPage] = useState(1);
  const [advancesPage, setAdvancesPage] = useState(1);
  const [cancellationsPage, setCancellationsPage] = useState(1);
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
  const showComparison = filters.period !== 'All Time';

  const CHART_ICONS: Record<string, string> = { bar: 'fa-chart-bar', line: 'fa-chart-line', scatter: 'fa-braille', bubble: 'fa-circle-dot', pie: 'fa-chart-pie' };

  // Compute date range for current period
  const getCurrentRange = useMemo(() => {
    const now = new Date();
    if (filters.period === 'This Month') return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999) };
    if (filters.period === 'Last Month') return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999) };
    if (filters.period === 'Custom Date') {
      const start = filters.startDate ? new Date(filters.startDate) : null;
      const end = filters.endDate ? (() => { const d = new Date(filters.endDate); d.setHours(23, 59, 59, 999); return d; })() : null;
      return { start, end };
    }
    return { start: null, end: null };
  }, [filters]);

  // Compute date range for previous period
  const getPreviousRange = useMemo(() => {
    const now = new Date();
    if (filters.period === 'This Month') return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999) };
    if (filters.period === 'Last Month') return { start: new Date(now.getFullYear(), now.getMonth() - 2, 1), end: new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999) };
    if (filters.period === 'Custom Date' && filters.startDate && filters.endDate) {
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
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white transition-all">
            {currentUser.role === UserRole.EMPLOYEE ? 'My Travel Insights' : 'Analytics & Reporting'}
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            {currentUser.role === UserRole.EMPLOYEE ? 'Track your personal travel history and spend.' : 'Data-driven insights for strategic decision making.'}
          </p>
        </div>
        <button onClick={() => {
          let csv = '';
          if (activeSubTab === 'travel') {
            csv = [['Request ID', 'Traveler', 'Department', 'Campus', 'Route', 'Date', 'Status', 'Cost', 'Vendor', 'Invoice'], ...filteredData.map(r => [r.submissionId || r.id, r.requesterName, r.requesterDepartment, r.requesterCampus, `${r.from} -> ${r.to}`, new Date(r.dateOfTravel).toLocaleDateString(), r.pncStatus, r.ticketCost || 0, r.vendorName || '', r.invoiceUrl || ''])].map(e => e.join(',')).join('\n');
          } else if (activeSubTab === 'advances') {
            csv = [['Advance ID', 'Received On', 'Received From', 'Amount Received', 'Amount Left', 'Settled Status', 'Comments'], ...filteredAdvances.map(a => [a.receipt_id || a.id, a.received_on, a.received_from, a.amount_received, a.amount_left, a.is_settled ? 'Settled' : 'Unsettled', a.comments || ''])].map(e => e.join(',')).join('\n');
          } else {
            csv = [['Cancellation ID', 'Request ID', 'Traveler', 'Cancellation Date', 'Original Fare', 'Net Loss', 'Status', 'Owed By Employee', 'Absorbed By Org'], ...filteredCancellations.map(c => [c.id, c.travel_requests?.submission_id || c.travel_request_id, c.travel_requests?.requester_name || '', new Date(c.cancellation_date).toLocaleDateString(), c.original_fare || c.originalFare, c.net_unrecovered_amount || c.netUnrecoveredAmount, c.status, c.employee_owed_amount || c.employeeOwedAmount, c.org_absorbed_amount || c.orgAbsorbedAmount])].map(e => e.join(',')).join('\n');
          }
          const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `${activeSubTab}_report_${new Date().toISOString().split('T')[0]}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a);
          toast.success('CSV exported!');
        }} className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 active:scale-95 transition-all">
          <i className="fa-solid fa-download mr-2"></i>Export Report
        </button>
      </header>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button onClick={() => setActiveSubTab('travel')} className={`py-4 px-6 font-bold text-sm border-b-2 flex items-center gap-2 transition-all ${activeSubTab === 'travel' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}>
          <i className="fa-solid fa-plane-departure text-xs"></i>Travel & Spend
        </button>
        <button onClick={() => setActiveSubTab('advances')} className={`py-4 px-6 font-bold text-sm border-b-2 flex items-center gap-2 transition-all ${activeSubTab === 'advances' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}>
          <i className="fa-solid fa-wallet text-xs"></i>PNC Advances & Funds
        </button>
        <button onClick={() => setActiveSubTab('cancellations')} className={`py-4 px-6 font-bold text-sm border-b-2 flex items-center gap-2 transition-all ${activeSubTab === 'cancellations' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}>
          <i className="fa-solid fa-rectangle-xmark text-xs"></i>Cancellations & Recovery
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-wrap gap-4 items-start shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mt-2"><i className="fa-solid fa-filter"></i> Filters</div>

        {/* Campus multi-select */}
        <div className="relative" ref={campusDropRef}>
          <button
            onClick={() => { setCampusDropOpen(v => !v); setDeptDropOpen(false); }}
            className={`flex items-center gap-2 min-w-[140px] bg-slate-50 dark:bg-slate-800 border rounded-lg px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 outline-none transition-all ${filters.campuses.length > 0 ? 'border-indigo-400 dark:border-indigo-500' : 'border-slate-200 dark:border-slate-700'}`}
          >
            <i className="fa-solid fa-building text-slate-400 text-xs"></i>
            <span className="flex-1 text-left truncate">
              {filters.campuses.length === 0 ? 'All Campuses' : filters.campuses.length === 1 ? filters.campuses[0] : `${filters.campuses.length} Campuses`}
            </span>
            <i className={`fa-solid fa-chevron-${campusDropOpen ? 'up' : 'down'} text-xs text-slate-400`}></i>
          </button>
          {campusDropOpen && (
            <div className="absolute top-full left-0 mt-1 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
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
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${checked ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                      <div className={`w-4 h-4 rounded-lg flex items-center justify-center border-2 flex-shrink-0 transition-all ${checked ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300 dark:border-slate-600'}`}>
                        {checked && <i className="fa-solid fa-check text-white text-[8px]"></i>}
                      </div>
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {filters.campuses.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {filters.campuses.map(c => (
                <span key={c} className="inline-flex items-center gap-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-bold px-2 py-0.5 rounded-full">
                  {c}
                  <button onClick={() => setFilters(f => ({ ...f, campuses: f.campuses.filter(x => x !== c) }))} className="hover:text-rose-500 transition-colors"><i className="fa-solid fa-xmark text-[8px]"></i></button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Department multi-select */}
        <div className="relative" ref={deptDropRef}>
          <button
            onClick={() => { setDeptDropOpen(v => !v); setCampusDropOpen(false); }}
            className={`flex items-center gap-2 min-w-[160px] bg-slate-50 dark:bg-slate-800 border rounded-lg px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 outline-none transition-all ${filters.departments.length > 0 ? 'border-indigo-400 dark:border-indigo-500' : 'border-slate-200 dark:border-slate-700'}`}
          >
            <i className="fa-solid fa-sitemap text-slate-400 text-xs"></i>
            <span className="flex-1 text-left truncate">
              {filters.departments.length === 0 ? 'All Departments' : filters.departments.length === 1 ? filters.departments[0] : `${filters.departments.length} Departments`}
            </span>
            <i className={`fa-solid fa-chevron-${deptDropOpen ? 'up' : 'down'} text-xs text-slate-400`}></i>
          </button>
          {deptDropOpen && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
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
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${checked ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                      <div className={`w-4 h-4 rounded-lg flex items-center justify-center border-2 flex-shrink-0 transition-all ${checked ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300 dark:border-slate-600'}`}>
                        {checked && <i className="fa-solid fa-check text-white text-[8px]"></i>}
                      </div>
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {filters.departments.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {filters.departments.map(d => (
                <span key={d} className="inline-flex items-center gap-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-bold px-2 py-0.5 rounded-full">
                  {d}
                  <button onClick={() => setFilters(f => ({ ...f, departments: f.departments.filter(x => x !== d) }))} className="hover:text-rose-500 transition-colors"><i className="fa-solid fa-xmark text-[8px]"></i></button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Period select */}
        <select className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500 text-slate-600 dark:text-slate-300" value={filters.period} onChange={e => setFilters({ ...filters, period: e.target.value })}>
          <option value="All Time">All Time</option>
          <option value="This Month">This Month</option>
          <option value="Last Month">Last Month</option>
          <option value="Custom Date">Custom Date</option>
        </select>
        {filters.period === 'Custom Date' && (
          <div className="flex items-center gap-2">
            <input type="date" className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500 text-slate-600 dark:text-slate-300" value={filters.startDate} onChange={e => setFilters({ ...filters, startDate: e.target.value })} />
            <span className="text-slate-400 font-bold">–</span>
            <input type="date" className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500 text-slate-600 dark:text-slate-300" value={filters.endDate} onChange={e => setFilters({ ...filters, endDate: e.target.value })} />
          </div>
        )}

        {(filters.campuses.length > 0 || filters.departments.length > 0) && (
          <button onClick={() => setFilters(f => ({ ...f, campuses: [], departments: [] }))} className="text-xs font-bold text-slate-400 hover:text-rose-500 flex items-center gap-1.5 transition-colors">
            <i className="fa-solid fa-xmark"></i> Clear All
          </button>
        )}

        {showComparison && (
          <div className="ml-auto flex items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-3 py-1.5 rounded-full">
            <i className="fa-solid fa-arrows-left-right"></i>
            vs previous {filters.period === 'Custom Date' ? 'period' : 'month'}
          </div>
        )}
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
      ) : (
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
      )}
    </div>
  );
};

export default AnalyticsView;
