import React, { useState, useEffect } from 'react';
import { TravelRequest, PNCStatus, TravelModePolicy } from '../types';
import StatusBadge from './StatusBadge';
import Card from './Card';
import { supabase } from '../supabaseClient';
import { checkPolicyViolation } from '../utils/policyUtils';
import { MermaidDiagram } from './MermaidDiagram';

interface PNCDashboardProps {
  requests: TravelRequest[];
  onTabChange: (tab: string) => void;
  onView: (request: TravelRequest) => void;
  policies?: TravelModePolicy[];
  policy?: any;
}

export const PNCDashboard = ({ requests, onTabChange, onView, policies = [], policy }: PNCDashboardProps) => {
  const [timeFilter, setTimeFilter] = useState<'all' | '24h' | '7d' | '30d' | 'thisMonth' | 'lastMonth'>('all');
  const [selectedStage, setSelectedStage] = useState<PNCStatus | null>(null);
  const [viewType, setViewType] = useState<'cards' | 'funnel' | 'flowchart'>('cards');
  const [selectedFunnelStep, setSelectedFunnelStep] = useState<any | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  const [slaConfigs, setSlaConfigs] = useState<any[]>([]);
  const [statusHistory, setStatusHistory] = useState<any[]>([]);
  const [slaLoading, setSlaLoading] = useState(true);

  useEffect(() => {
    const loadDbData = async () => {
      try {
        // 1. Fetch SLA configs
        const { data: configsData, error: configErr } = await supabase
          .from('sla_configs')
          .select('*');

        let loadedConfigs = configsData || [];
        if (configErr || loadedConfigs.length === 0) {
          // Fallback defaults
          loadedConfigs = [
            { stage: 'Approval Pending', target_hours: 24, escalation_hours: 48, owner_role: 'Manager' },
            { stage: 'Processing', target_hours: 48, escalation_hours: 96, owner_role: 'PNC' },
            { stage: 'Booked', target_hours: 72, escalation_hours: 144, owner_role: 'PNC' },
            { stage: 'On Hold', target_hours: 48, escalation_hours: 96, owner_role: 'Employee' }
          ];
        }
        setSlaConfigs(loadedConfigs);

        // 2. Fetch Status History
        const { data: historyData } = await supabase
          .from('ticket_status_history')
          .select('*')
          .order('created_at', { ascending: true });

        setStatusHistory(historyData || []);
      } catch (err) {
        console.error("Failed to load SLA/History database data:", err);
      } finally {
        setSlaLoading(false);
      }
    };
    loadDbData();
  }, [requests]);

  // ─── Flowchart edge data ───────────────────────────────────────────────────
  const [flowchartEdges, setFlowchartEdges] = useState<{ from: string; to: string; count: number }[]>([]);
  const [flowchartLoading, setFlowchartLoading] = useState(false);

  /** Compute the active date-range start/end from the current timeFilter */
  const getTimeFilterDates = () => {
    const now = new Date();
    let startTime: Date | null = null;
    let endTime: Date | null = null;
    switch (timeFilter) {
      case '24h': startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); break;
      case '7d': startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
      case '30d': startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
      case 'thisMonth': startTime = new Date(now.getFullYear(), now.getMonth(), 1); break;
      case 'lastMonth':
        startTime = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endTime = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        break;
      default: startTime = null; endTime = null;
    }
    return { startTime, endTime };
  };

  /** Map a known (from → to) pair to a human-readable semantic label. */
  const getEdgeLabel = (from: string, to: string): string | null => {
    if (from === 'Received' && to === 'Approval Pending') return 'violation';
    if (from === 'Received' && to === 'Processing') return 'no violation';
    if (to === 'Received' || to === 'Not Started') return 'resubmit';
    if (from === 'On Hold' && to === 'Processing') return 'info provided';
    if (from === 'Approved' && to === 'Processing') return 'auto-advance';
    return null;
  };

  /** Build edge counts by parsing statusHistory rows (DB path) or timeline events (fallback). */
  const getFlowchartEdgesClientSide = (startTime: Date | null, endTime: Date | null) => {
    const edgeMap: Record<string, { from: string; to: string; count: number }> = {};

    const normStatus = (s: string | null | undefined): string => {
      if (!s || s === 'Not Started' || s === 'Created') return 'Received';
      return s;
    };

    const addEdge = (from: string, to: string) => {
      if (from === to) return;
      const key = `${from}→${to}`;
      if (!edgeMap[key]) edgeMap[key] = { from, to, count: 0 };
      edgeMap[key].count++;
    };

    // Primary: status history rows
    statusHistory.forEach(h => {
      const d = new Date(h.created_at);
      if (startTime && d < startTime) return;
      if (endTime && d > endTime) return;
      addEdge(normStatus(h.from_status), normStatus(h.to_status));
    });

    // Fallback: parse timeline events from request objects
    if (Object.keys(edgeMap).length === 0) {
      filteredRequests.forEach(r => {
        let prev = 'Received';
        (r.timeline || []).forEach((evt: any) => {
          if (evt.event.includes('Status changed to:')) {
            const next = normStatus(evt.event.replace('Status changed to: ', '').trim());
            if (prev !== next) { addEdge(prev, next); prev = next; }
          }
        });
      });
    }

    return Object.values(edgeMap).filter(e => e.count > 0);
  };

  /** Build the mermaid `flowchart TD` definition string from edge data. */
  const getFlowchartText = (): string => {
    if (flowchartEdges.length === 0) return '';
    const LF = String.fromCharCode(10);
    const nodeId = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '_');

    const lines: string[] = ['flowchart TD'];

    // Collect unique nodes for class assignment later
    const allNodes = new Set<string>();

    flowchartEdges.forEach(e => {
      allNodes.add(e.from);
      allNodes.add(e.to);
      const srcId = nodeId(e.from);
      const tgtId = nodeId(e.to);
      const semantic = getEdgeLabel(e.from, e.to);
      const labelHTML = semantic
        ? `<div class='bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-lg  text-xs font-medium whitespace-nowrap leading-tight'>${semantic} · ${e.count}</div>`
        : `<div class='bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-600 text-xs font-medium whitespace-nowrap leading-tight'>${e.count}</div>`;
      // Double-quote node labels and edge labels so spaces are safe
      lines.push(`  ${srcId}("${e.from}") -->|"${labelHTML}"| ${tgtId}("${e.to}")`);
    });

    // Color scheme matching dashboard status pills
    lines.push('  classDef initial    fill:#64748b,color:#fff,stroke:#475569,stroke-width:2px');
    lines.push('  classDef pending    fill:#f59e0b,color:#fff,stroke:#d97706,stroke-width:2px');
    lines.push('  classDef processing fill:#6366f1,color:#fff,stroke:#4f46e5,stroke-width:2px');
    lines.push('  classDef positive   fill:#10b981,color:#fff,stroke:#059669,stroke-width:2px');
    lines.push('  classDef rejected   fill:#f43f5e,color:#fff,stroke:#e11d48,stroke-width:2px');
    lines.push('  classDef cancelled  fill:#94a3b8,color:#fff,stroke:#64748b,stroke-width:2px');

    // Apply classes to whichever nodes appear in this render
    const classify = (label: string, cls: string) => {
      if (allNodes.has(label)) lines.push(`  class ${nodeId(label)} ${cls}`);
    };
    classify('Received', 'initial');
    classify('Approval Pending', 'pending');
    classify('On Hold', 'pending');
    classify('Processing', 'processing');
    classify('Approved', 'processing');
    classify('Booked', 'positive');
    classify('Closed', 'positive');
    classify('Rejected by Manager', 'rejected');
    classify('Rejected by PNC', 'rejected');
    classify('Cancelled by Employee', 'cancelled');
    classify('Cancelled by PNC', 'cancelled');

    return lines.join(LF);
  };

  // Load flowchart edge counts whenever filter / history / requests change
  useEffect(() => {
    const load = async () => {
      setFlowchartLoading(true);
      const { startTime, endTime } = getTimeFilterDates();
      try {
        const { data, error } = await supabase.rpc('get_flowchart_edges', {
          start_time: startTime ? startTime.toISOString() : null,
          end_time: endTime ? endTime.toISOString() : null
        });
        if (!error && data?.edges?.length) {
          setFlowchartEdges((data.edges as any[]).filter((e: any) => e.count > 0));
        } else {
          setFlowchartEdges(getFlowchartEdgesClientSide(startTime, endTime));
        }
      } catch {
        setFlowchartEdges(getFlowchartEdgesClientSide(startTime, endTime));
      } finally {
        setFlowchartLoading(false);
      }
    };
    load();
  }, [timeFilter, statusHistory, requests]);

  // End flowchart section ────────────────────────────────────────────────────


  // Filter requests based on time period
  const getFilteredRequests = () => {
    const now = new Date();

    return requests.filter((r: TravelRequest) => {
      const requestDate = new Date(r.timestamp);

      switch (timeFilter) {
        case 'all':
          return true;

        case '24h':
          const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          return requestDate >= yesterday;

        case '7d':
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          return requestDate >= sevenDaysAgo;

        case '30d':
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          return requestDate >= thirtyDaysAgo;

        case 'thisMonth':
          const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          return requestDate >= thisMonthStart;

        case 'lastMonth':
          const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
          return requestDate >= lastMonthStart && requestDate <= lastMonthEnd;

        default:
          return true;
      }
    });
  };

  const filteredRequests = getFilteredRequests();

  // Count requests by status
  const statusCounts = {
    [PNCStatus.NOT_STARTED]: filteredRequests.filter(r => r.pncStatus === PNCStatus.NOT_STARTED).length,
    [PNCStatus.APPROVAL_PENDING]: filteredRequests.filter(r => r.pncStatus === PNCStatus.APPROVAL_PENDING).length,
    [PNCStatus.REJECTED_BY_MANAGER]: filteredRequests.filter(r => r.pncStatus === PNCStatus.REJECTED_BY_MANAGER).length,
    [PNCStatus.APPROVED]: filteredRequests.filter(r => r.pncStatus === PNCStatus.APPROVED).length,
    [PNCStatus.PROCESSING]: filteredRequests.filter(r => r.pncStatus === PNCStatus.PROCESSING).length,
    [PNCStatus.ON_HOLD]: filteredRequests.filter(r => r.pncStatus === PNCStatus.ON_HOLD).length,
    [PNCStatus.REJECTED_BY_PNC]: filteredRequests.filter(r => r.pncStatus === PNCStatus.REJECTED_BY_PNC).length,
    [PNCStatus.BOOKED]: filteredRequests.filter(r => r.pncStatus === PNCStatus.BOOKED).length,
    [PNCStatus.CANCELLED_BY_EMPLOYEE]: filteredRequests.filter(r => r.pncStatus === PNCStatus.CANCELLED_BY_EMPLOYEE).length,
    [PNCStatus.CANCELLED_BY_PNC]: filteredRequests.filter(r => r.pncStatus === PNCStatus.CANCELLED_BY_PNC).length,
    [PNCStatus.CLOSED]: filteredRequests.filter(r => r.pncStatus === PNCStatus.CLOSED).length,
  };

  const totalInflow = filteredRequests.length;
  const countReceived = filteredRequests.length;

  // Calculate policy violations count (tickets that triggered or are in manager review)
  const countViolations = filteredRequests.filter(r =>
    r.hasViolation ||
    r.pncStatus === PNCStatus.APPROVAL_PENDING ||
    r.pncStatus === PNCStatus.REJECTED_BY_MANAGER ||
    (r.timeline && r.timeline.some(e => e.event.includes('Approval Pending') || e.event.includes(PNCStatus.APPROVAL_PENDING)))
  ).length;

  const percentViolations = countReceived > 0 ? Math.round((countViolations / countReceived) * 100) : 0;
  const percentBypass = 100 - percentViolations;

  // Calculate processing, booked, and closed counts
  const countApprovalPending = statusCounts[PNCStatus.APPROVAL_PENDING];
  const countProcessing = statusCounts[PNCStatus.PROCESSING];
  const countBooked = statusCounts[PNCStatus.BOOKED];
  const countClosed = statusCounts[PNCStatus.CLOSED];

  // Transition rates
  const countReachedProcessing = filteredRequests.filter(r =>
    r.pncStatus !== PNCStatus.NOT_STARTED &&
    r.pncStatus !== PNCStatus.APPROVAL_PENDING &&
    r.pncStatus !== PNCStatus.REJECTED_BY_MANAGER
  ).length;

  const countReachedBooked = filteredRequests.filter(r =>
    r.pncStatus === PNCStatus.BOOKED ||
    r.pncStatus === PNCStatus.CLOSED ||
    r.pncStatus === PNCStatus.CANCELLED_BY_PNC
  ).length;

  const percentProcessingToBooked = countReachedProcessing > 0 ? Math.round((countReachedBooked / countReachedProcessing) * 100) : 0;
  const percentBookedToClosed = countReachedBooked > 0 ? Math.round((countClosed / countReachedBooked) * 100) : 0;

  const getStageDuration = (ticketId: string, stageName: string, requestTimestamp: string, currentStatus: string) => {
    // Try to calculate from statusHistory first
    const ticketHist = statusHistory.filter(h => h.ticket_id === ticketId);
    if (ticketHist.length > 0) {
      // Find where it entered this status
      const entry = ticketHist.find(h => h.to_status === stageName);
      if (!entry) {
        if (currentStatus === stageName) {
          return Date.now() - new Date(requestTimestamp).getTime();
        }
        return 0;
      }

      const entryTime = new Date(entry.created_at).getTime();
      // Exit time is when it transitioned to another status after entry
      const exit = ticketHist.find(h => h.from_status === stageName && new Date(h.created_at).getTime() > entryTime);
      const exitTime = exit ? new Date(exit.created_at).getTime() : (currentStatus === stageName ? Date.now() : entryTime);
      return exitTime - entryTime;
    }

    // Fallback to timeline JSON array
    const r = requests.find(req => req.id === ticketId);
    if (!r) return 0;

    const timeline = r.timeline || [];
    if (stageName === PNCStatus.NOT_STARTED) {
      const entryTime = new Date(r.timestamp).getTime();
      const exitEvent = timeline.find(e => e.event.includes('Status changed to:') && !e.event.includes(PNCStatus.NOT_STARTED));
      if (!exitEvent) {
        if (r.pncStatus === PNCStatus.NOT_STARTED) {
          return Date.now() - entryTime;
        }
        return 0;
      }
      const exitTime = new Date(exitEvent.timestamp).getTime();
      return Math.max(0, exitTime - entryTime);
    }

    const entryEvent = timeline.find(e => e.event.includes(stageName) || e.event.includes(`Status changed to: ${stageName}`));
    if (!entryEvent) {
      if (r.pncStatus === stageName) {
        return Date.now() - new Date(r.timestamp).getTime();
      }
      return 0;
    }
    const entryTime = new Date(entryEvent.timestamp).getTime();
    const entryIdx = timeline.indexOf(entryEvent);
    const exitEvent = timeline.slice(entryIdx + 1).find(e => e.event.includes('Status changed to:') || e.event.includes('Status changed to'));
    const exitTime = exitEvent ? new Date(exitEvent.timestamp).getTime() : (r.pncStatus === stageName ? Date.now() : entryTime);
    return exitTime - entryTime;
  };

  const getTimeInState = (r: TravelRequest, targetStatus: PNCStatus) => {
    return getStageDuration(r.id, targetStatus, r.timestamp, r.pncStatus);
  };

  const getBookingTime = (r: TravelRequest) => {
    // Try history first
    const ticketHist = statusHistory.filter(h => h.ticket_id === r.id);
    if (ticketHist.length > 0) {
      const bookingEntry = ticketHist.find(h => h.to_status === PNCStatus.BOOKED);
      if (bookingEntry) {
        return new Date(bookingEntry.created_at).getTime() - new Date(r.timestamp).getTime();
      }
      if (r.pncStatus === PNCStatus.BOOKED) {
        return Date.now() - new Date(r.timestamp).getTime();
      }
      return 0;
    }

    // Fallback to timeline
    const bookingEvent = (r.timeline || []).find(e => e.event.includes(PNCStatus.BOOKED) || e.event.includes(`Status changed to: ${PNCStatus.BOOKED}`));
    if (!bookingEvent) {
      if (r.pncStatus === PNCStatus.BOOKED) {
        return Date.now() - new Date(r.timestamp).getTime();
      }
      return 0;
    }
    return new Date(bookingEvent.timestamp).getTime() - new Date(r.timestamp).getTime();
  };

  const getAverageTimeInState = (targetStatus: PNCStatus) => {
    const times = filteredRequests
      .map(r => getTimeInState(r, targetStatus))
      .filter(t => t > 0);
    if (times.length === 0) return '—';
    const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
    const hours = Math.floor(avgMs / (1000 * 60 * 60));
    const minutes = Math.floor((avgMs % (1000 * 60 * 60)) / (1000 * 60));
    if (hours === 0) return `${minutes}m`;
    return `${hours}h ${minutes}m`;
  };

  const getAverageBookingTime = () => {
    const times = filteredRequests
      .filter(r => r.pncStatus === PNCStatus.BOOKED || r.pncStatus === PNCStatus.CLOSED)
      .map(r => getBookingTime(r))
      .filter(t => t > 0);
    if (times.length === 0) return '—';
    const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
    const hours = Math.floor(avgMs / (1000 * 60 * 60));
    const minutes = Math.floor((avgMs % (1000 * 60 * 60)) / (1000 * 60));
    if (hours === 0) return `${minutes}m`;
    return `${hours}h ${minutes}m`;
  };

  // SLA Calculation values
  const tatApproval = policy?.tatApprovalHours || 24;
  const tatProcessing = policy?.tatProcessingHours || 48;
  const tatBooking = policy?.tatBookingHours || 72;

  const approvalBreaches = filteredRequests.filter(r => r.pncStatus === PNCStatus.APPROVAL_PENDING && getTimeInState(r, PNCStatus.APPROVAL_PENDING) > tatApproval * 60 * 60 * 1000).length;
  const processingBreaches = filteredRequests.filter(r => r.pncStatus === PNCStatus.PROCESSING && getTimeInState(r, PNCStatus.PROCESSING) > tatProcessing * 60 * 60 * 1000).length;
  const bookedBreaches = filteredRequests.filter(r => (r.pncStatus === PNCStatus.BOOKED || r.pncStatus === PNCStatus.CLOSED) && getBookingTime(r) > tatBooking * 60 * 60 * 1000).length;

  const getEmployeeCancellationStats = () => {
    let intake = 0;
    let approval = 0;
    let processing = 0;
    let booked = 0;

    filteredRequests.forEach(r => {
      if (r.pncStatus === PNCStatus.CANCELLED_BY_EMPLOYEE) {
        const timeline = r.timeline || [];
        const statusEvents = timeline
          .filter(e => e.event.includes('Status changed to:') && !e.event.includes(PNCStatus.CANCELLED_BY_EMPLOYEE))
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        if (statusEvents.length === 0) {
          intake++;
        } else {
          const lastStatus = statusEvents[0].event.replace('Status changed to: ', '').trim();
          if (lastStatus === PNCStatus.APPROVAL_PENDING) approval++;
          else if (lastStatus === PNCStatus.PROCESSING || lastStatus === PNCStatus.ON_HOLD) processing++;
          else if (lastStatus === PNCStatus.BOOKED) booked++;
          else intake++;
        }
      }
    });
    return { intake, approval, processing, booked };
  };

  const getPnccancellationStats = () => {
    let processing = 0;
    let booked = 0;

    filteredRequests.forEach(r => {
      if (r.pncStatus === PNCStatus.CANCELLED_BY_PNC) {
        const timeline = r.timeline || [];
        const statusEvents = timeline
          .filter(e => e.event.includes('Status changed to:') && !e.event.includes(PNCStatus.CANCELLED_BY_PNC))
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        if (statusEvents.length === 0) {
          processing++;
        } else {
          const lastStatus = statusEvents[0].event.replace('Status changed to: ', '').trim();
          if (lastStatus === PNCStatus.BOOKED) booked++;
          else processing++;
        }
      }
    });
    return { processing, booked };
  };

  const empCancelStats = getEmployeeCancellationStats();
  const pncCancelStats = getPnccancellationStats();

  const calculateMedian = (values: number[]) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const half = Math.floor(sorted.length / 2);
    if (sorted.length % 2 !== 0) {
      return sorted[half];
    }
    return (sorted[half - 1] + sorted[half]) / 2;
  };

  const getStageStats = (stageName: string) => {
    const config = slaConfigs.find(c => c.stage === stageName) || { target_hours: 24, owner_role: 'Manager', escalation_hours: 48 };
    const targetMs = config.target_hours * 60 * 60 * 1000;
    const escalationMs = config.escalation_hours * 60 * 60 * 1000;

    const openTickets = filteredRequests.filter(r => r.pncStatus === stageName);

    const passedTickets = filteredRequests.filter(r => {
      const duration = getStageDuration(r.id, stageName, r.timestamp, r.pncStatus);
      return duration > 0;
    });

    const durations = passedTickets.map(r => getStageDuration(r.id, stageName, r.timestamp, r.pncStatus));

    const medianMs = calculateMedian(durations);
    const avgMs = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    const formatDuration = (ms: number) => {
      if (ms === 0) return '—';
      const hours = Math.floor(ms / (1000 * 60 * 60));
      const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
      if (hours === 0) return `${minutes}m`;
      return `${hours}h ${minutes}m`;
    };

    const currentlyBreached = openTickets.filter(r => {
      const duration = getStageDuration(r.id, stageName, r.timestamp, r.pncStatus);
      return duration > targetMs;
    }).length;

    const historicallyBreached = passedTickets.filter(r => {
      if (r.pncStatus === stageName) return false;
      const duration = getStageDuration(r.id, stageName, r.timestamp, r.pncStatus);
      return duration > targetMs;
    }).length;

    const totalBreaches = currentlyBreached + historicallyBreached;
    const breachPercent = passedTickets.length > 0 ? Math.round((totalBreaches / passedTickets.length) * 100) : 0;

    const currentlyEscalated = openTickets.filter(r => {
      const duration = getStageDuration(r.id, stageName, r.timestamp, r.pncStatus);
      return duration > escalationMs;
    }).length;

    return {
      owner: config.owner_role,
      target: `${config.target_hours}h`,
      escalationText: `Escalate at ${config.escalation_hours}h (2x target)`,
      median: formatDuration(medianMs),
      avg: formatDuration(avgMs),
      currentCount: openTickets.length,
      currentlyBreached,
      historicallyBreached,
      breachPercent,
      isEscalated: currentlyEscalated > 0,
      escalatedCount: currentlyEscalated
    };
  };

  const currentlyBreachedApproval = getStageStats('Approval Pending').currentlyBreached;
  const currentlyBreachedProcessing = getStageStats('Processing').currentlyBreached;
  const currentlyBreachedBooked = getStageStats('Booked').currentlyBreached;

  const funnelStages = [
    {
      name: "1. Intake (Received)",
      count: countReceived,
      statuses: [
        PNCStatus.NOT_STARTED,
        PNCStatus.APPROVAL_PENDING,
        PNCStatus.REJECTED_BY_MANAGER,
        PNCStatus.APPROVED,
        PNCStatus.PROCESSING,
        PNCStatus.ON_HOLD,
        PNCStatus.REJECTED_BY_PNC,
        PNCStatus.BOOKED,
        PNCStatus.CANCELLED_BY_EMPLOYEE,
        PNCStatus.CANCELLED_BY_PNC,
        PNCStatus.CLOSED
      ],
      description: "New travel ticket requests received",
      color: "from-slate-400 to-slate-500",
      icon: "fa-circle-dot"
    },
    {
      name: "2. Approval Pending",
      count: countApprovalPending,
      statuses: [PNCStatus.APPROVAL_PENDING],
      description: "Tickets with policy violations awaiting manager approval",
      color: "from-amber-400 to-amber-500",
      icon: "fa-clock"
    },
    {
      name: "3. Processing",
      count: countProcessing,
      statuses: [PNCStatus.PROCESSING],
      description: "Tickets currently being triaged or booked by PNC",
      color: "from-indigo-400 to-indigo-500",
      icon: "fa-spinner"
    },
    {
      name: "4. Confirmed (Booked)",
      count: countBooked,
      statuses: [PNCStatus.BOOKED],
      description: "Tickets successfully booked and itinerary confirmed",
      color: "from-blue-400 to-blue-500",
      icon: "fa-ticket"
    },
    {
      name: "5. Closed / Complete",
      count: countClosed,
      statuses: [PNCStatus.CLOSED],
      description: "Completed trips and reconciled expenses",
      color: "from-emerald-400 to-emerald-500",
      icon: "fa-flag-checkered"
    }
  ];

  const cardConfigs = [
    {
      status: PNCStatus.NOT_STARTED,
      icon: <i className="fa-solid fa-circle-dot"></i>,
      color: {
        bg: 'bg-slate-100 dark:bg-slate-800',
        text: 'text-slate-600 dark:text-slate-400',
        border: 'border-slate-200 dark:border-slate-700'
      }
    },
    {
      status: PNCStatus.APPROVAL_PENDING,
      icon: <i className="fa-solid fa-clock"></i>,
      color: {
        bg: 'bg-amber-100 dark:bg-amber-900/30',
        text: 'text-amber-700 dark:text-amber-400',
        border: 'border-amber-200 dark:border-amber-800/50'
      }
    },
    {
      status: PNCStatus.REJECTED_BY_MANAGER,
      icon: <i className="fa-solid fa-user-xmark"></i>,
      color: {
        bg: 'bg-rose-100 dark:bg-rose-900/30',
        text: 'text-rose-700 dark:text-rose-400',
        border: 'border-rose-200 dark:border-rose-800/50'
      }
    },
    {
      status: PNCStatus.APPROVED,
      icon: <i className="fa-solid fa-circle-check"></i>,
      color: {
        bg: 'bg-emerald-100 dark:bg-emerald-900/30',
        text: 'text-emerald-700 dark:text-emerald-400',
        border: 'border-emerald-200 dark:border-emerald-800/50'
      }
    },
    {
      status: PNCStatus.PROCESSING,
      icon: <i className="fa-solid fa-spinner fa-spin"></i>,
      color: {
        bg: 'bg-indigo-100 dark:bg-indigo-900/30',
        text: 'text-indigo-700 dark:text-indigo-400',
        border: 'border-indigo-200 dark:border-indigo-800/50'
      }
    },
    {
      status: PNCStatus.ON_HOLD,
      icon: <i className="fa-solid fa-circle-pause"></i>,
      color: {
        bg: 'bg-orange-100 dark:bg-orange-900/30',
        text: 'text-orange-700 dark:text-orange-400',
        border: 'border-orange-200 dark:border-orange-800/50'
      }
    },
    {
      status: PNCStatus.REJECTED_BY_PNC,
      icon: <i className="fa-solid fa-ban"></i>,
      color: {
        bg: 'bg-red-100 dark:bg-red-900/30',
        text: 'text-red-700 dark:text-red-400',
        border: 'border-red-200 dark:border-red-800/50'
      }
    },
    {
      status: PNCStatus.BOOKED,
      icon: <i className="fa-solid fa-ticket"></i>,
      color: {
        bg: 'bg-blue-100 dark:bg-blue-900/30',
        text: 'text-blue-700 dark:text-blue-400',
        border: 'border-blue-200 dark:border-blue-800/50'
      }
    },
    {
      status: PNCStatus.CANCELLED_BY_EMPLOYEE,
      icon: <i className="fa-solid fa-user-slash"></i>,
      color: {
        bg: 'bg-zinc-150 dark:bg-zinc-900/30',
        text: 'text-zinc-600 dark:text-zinc-400',
        border: 'border-zinc-200 dark:border-zinc-800/50'
      }
    },
    {
      status: PNCStatus.CANCELLED_BY_PNC,
      icon: <i className="fa-solid fa-plane-slash"></i>,
      color: {
        bg: 'bg-pink-100 dark:bg-pink-900/30',
        text: 'text-pink-700 dark:text-pink-400',
        border: 'border-pink-200 dark:border-pink-800/50'
      }
    },
    {
      status: PNCStatus.CLOSED,
      icon: <i className="fa-solid fa-flag-checkered"></i>,
      color: {
        bg: 'bg-slate-500 dark:bg-slate-700',
        text: 'text-white',
        border: 'border-slate-600 dark:border-slate-600'
      }
    }
  ];

  const visibleCards = cardConfigs.filter(card => statusCounts[card.status] > 0);

  const timeFilterOptions = [
    { value: 'all', label: 'All Time' },
    { value: '24h', label: 'Last 24 Hours' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: 'thisMonth', label: 'This Month' },
    { value: 'lastMonth', label: 'Last Month' },
  ];

  const StageCard = ({ status, count, icon, color, onClick }: any) => (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-slate-900 border-2 ${color.border} rounded-lg p-6 transition-all hover:shadow-lg hover:-translate-y-1 cursor-pointer group`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 ${color.bg} ${color.text} rounded-lg flex items-center justify-center text-xl group-hover:scale-110 transition-transform`}>
          {icon}
        </div>
        <div className={`px-5 py-2 ${color.bg} ${color.text} rounded-full text-xl font-black min-w-[3.5rem] text-center`}>
          {count}
        </div>
      </div>
      <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">{status}</h3>
      <p className="text-xs text-slate-500 mt-1 font-medium">
        {count === 0 ? 'No requests' : count === 1 ? '1 request' : `${count} requests`}
      </p>
    </div>
  );

  // Get requests for selected stage
  const getStageRequests = () => {
    if (!selectedStage) return [];
    const filtered = filteredRequests.filter(r => r.pncStatus === selectedStage);

    // Sort by timestamp
    return filtered.sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });
  };

  const stageRequests = getStageRequests();
  const totalPages = Math.ceil(stageRequests.length / itemsPerPage);
  const paginatedRequests = stageRequests.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getFunnelRequests = () => {
    if (!selectedFunnelStep) return [];
    const filtered = filteredRequests.filter(r => selectedFunnelStep.statuses.includes(r.pncStatus));
    return filtered.sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });
  };

  const funnelRequests = getFunnelRequests();
  const funnelTotalPages = Math.ceil(funnelRequests.length / itemsPerPage);
  const paginatedFunnelRequests = funnelRequests.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleStageClick = (stage: PNCStatus) => {
    setSelectedStage(stage);
    setCurrentPage(1);
  };

  const handleCloseModal = () => {
    setSelectedStage(null);
    setSelectedFunnelStep(null);
    setCurrentPage(1);
  };

  const modalActive = !!selectedStage || !!selectedFunnelStep;
  const modalTitle = selectedStage ? selectedStage : (selectedFunnelStep ? selectedFunnelStep.name : '');
  const modalRequests = selectedStage ? stageRequests : funnelRequests;
  const modalPaginatedRequests = selectedStage ? paginatedRequests : paginatedFunnelRequests;
  const modalTotalPages = selectedStage ? totalPages : funnelTotalPages;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white transition-all">PNC Operations</h2>
          <p className="text-slate-500 text-sm mt-1">Manage transport bookings and fulfillment steps.</p>
        </div>

        <div className="flex flex-col items-start xl:items-end gap-3">
          {/* Toggle Switch show cards / funnel / sankey */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-lg border border-slate-200/30 dark:border-slate-700/30 shadow-2sm">
            <button
              onClick={() => setViewType('cards')}
              className={`px-3 py-1.5 rounded-md text-xs font-black uppercase tracking-wider transition-all duration-200 ${viewType === 'cards'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200/50 dark:border-slate-600/50'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
            >
              <i className="fa-solid fa-border-all mr-1"></i> Cards
            </button>
            <button
              onClick={() => setViewType('funnel')}
              className={`px-3 py-1.5 rounded-md text-xs font-black uppercase tracking-wider transition-all duration-200 ${viewType === 'funnel'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200/50 dark:border-slate-600/50'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
            >
              Funnel <i className="fa-solid fa-filter ml-1 text-2xs"></i>
            </button>
            <button
              onClick={() => setViewType('flowchart')}
              className={`px-3 py-1.5 rounded-md text-xs font-black uppercase tracking-wider transition-all duration-200 ${viewType === 'flowchart'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200/50 dark:border-slate-600/50'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
            >
              Flowchart <i className="fa-solid fa-diagram-project ml-1 text-2xs"></i>
            </button>
          </div>

          {/* Time Filter Buttons */}
          <div className="flex flex-wrap gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-lg">
            {timeFilterOptions.map(option => (
              <button
                key={option.value}
                onClick={() => setTimeFilter(option.value as any)}
                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${timeFilter === option.value
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700'
                  }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {viewType === 'funnel' ? (
        /* Mockup-styled Narrowing Funnel View */
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-sm space-y-8 animate-in fade-in duration-300">
          {/* Funnel Title Row */}
          <div className="flex items-center gap-3.5">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center text-white text-md shadow-md shadow-indigo-600/20">
              <i className="fa-solid fa-filter"></i>
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800 dark:text-white tracking-tight">Classic Narrowing Funnel</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">The tapered shape for completion rate, with drop-offs listed alongside.</p>
            </div>
          </div>

          {/* Funnel Layout Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Tapered Trapezoids */}
            <div className="lg:col-span-7 flex flex-col items-center py-4">
              {/* Trapezoid 1: Received */}
              <div
                onClick={() => {
                  setSelectedFunnelStep({
                    name: "Received Requests",
                    statuses: [PNCStatus.NOT_STARTED, PNCStatus.APPROVAL_PENDING, PNCStatus.REJECTED_BY_MANAGER, PNCStatus.APPROVED, PNCStatus.PROCESSING, PNCStatus.ON_HOLD, PNCStatus.REJECTED_BY_PNC, PNCStatus.BOOKED, PNCStatus.CANCELLED_BY_EMPLOYEE, PNCStatus.CANCELLED_BY_PNC, PNCStatus.CLOSED]
                  });
                  setCurrentPage(1);
                }}
                className="w-full bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-600 hover:brightness-110 active:scale-98 transition-all cursor-pointer flex flex-col items-center justify-center py-5 text-white shadow-lg relative group rounded-lg h-[90px]"
              >
                <span className="text-xs font-black uppercase tracking-widest opacity-90">Received</span>
                <span className="text-3xl font-black mt-0.5 tracking-tight group-hover:scale-105 transition-transform">{countReceived}</span>
              </div>

              {/* Split Arrow 1 (Conditional Branching) */}
              <div className="w-full flex items-center justify-center gap-1 my-1 text-slate-500">
                <div className="w-1/2 flex flex-col items-end pr-4 border-r border-dashed border-slate-200 dark:border-slate-800">
                  <span className="text-3xs font-extrabold uppercase tracking-widest text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-100 dark:border-amber-900/30">
                    ↙ {percentViolations}% violation path
                  </span>
                </div>
                <div className="w-1/2 flex flex-col items-start pl-4">
                  <span className="text-3xs font-extrabold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-full border border-indigo-150 dark:border-indigo-900/30">
                    ↘ {percentBypass}% clean bypass
                  </span>
                </div>
              </div>

              {/* Trapezoid 2: Approval Pending (Conditional branch) */}
              <div
                onClick={() => {
                  setSelectedFunnelStep({
                    name: "Approval Pending",
                    statuses: [PNCStatus.APPROVAL_PENDING]
                  });
                  setCurrentPage(1);
                }}
                className="w-[84%] bg-gradient-to-r from-amber-500 to-orange-500 hover:brightness-110 active:scale-98 transition-all cursor-pointer flex flex-col items-center justify-center py-5 text-white shadow-lg relative group border-2 border-dashed border-amber-300 dark:border-amber-700/50 rounded-lg h-[90px]"
              >
                {currentlyBreachedApproval > 0 && (
                  <span className="absolute top-2 right-6 bg-rose-600 text-white text-3xs font-extrabold px-2 py-0.5 rounded-full animate-pulse shadow-md border border-rose-400">
                    🚨 {currentlyBreachedApproval} Breached
                  </span>
                )}
                <span className="text-xs font-black uppercase tracking-widest opacity-90">Approval Pending (Manager)</span>
                <span className="text-3xl font-black mt-0.5 tracking-tight group-hover:scale-105 transition-transform">{countApprovalPending}</span>
              </div>

              {/* Merge / Advance Arrow to Processing */}
              <div className="flex flex-col items-center my-1 text-slate-400 dark:text-slate-600">
                <span className="text-3xs font-extrabold uppercase tracking-widest text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-full border border-indigo-150 dark:border-indigo-900/30">
                  ↓ Merge into Processing
                </span>
              </div>

              {/* Trapezoid 3: Processing (PNC Triage) */}
              <div
                onClick={() => {
                  setSelectedFunnelStep({
                    name: "Processing",
                    statuses: [PNCStatus.PROCESSING]
                  });
                  setCurrentPage(1);
                }}
                className="w-[75%] bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 hover:brightness-110 active:scale-98 transition-all cursor-pointer flex flex-col items-center justify-center py-5 text-white shadow-lg relative group rounded-lg h-[90px]"
              >
                {currentlyBreachedProcessing > 0 && (
                  <span className="absolute top-2 right-6 bg-rose-600 text-white text-3xs font-extrabold px-2 py-0.5 rounded-full animate-pulse shadow-md border border-rose-400">
                    🚨 {currentlyBreachedProcessing} Breached
                  </span>
                )}
                <span className="text-xs font-black uppercase tracking-widest opacity-90">Processing (PNC)</span>
                <span className="text-3xl font-black mt-0.5 tracking-tight group-hover:scale-105 transition-transform">{countProcessing}</span>
              </div>

              {/* Advance Arrow to Booked */}
              <div className="flex flex-col items-center my-1 text-slate-400 dark:text-slate-600">
                <span className="text-3xs font-extrabold uppercase tracking-widest text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-900/30">
                  ↓ {percentProcessingToBooked}% booked
                </span>
              </div>

              {/* Trapezoid 4: Booked */}
              <div
                onClick={() => {
                  setSelectedFunnelStep({
                    name: "Booked Requests",
                    statuses: [PNCStatus.BOOKED]
                  });
                  setCurrentPage(1);
                }}
                className="w-[60%] bg-gradient-to-r from-blue-500 to-indigo-600 hover:brightness-110 active:scale-98 transition-all cursor-pointer flex flex-col items-center justify-center py-5 text-white shadow-lg relative group rounded-lg h-[90px]"
              >
                {currentlyBreachedBooked > 0 && (
                  <span className="absolute top-2 right-6 bg-rose-600 text-white text-3xs font-extrabold px-2 py-0.5 rounded-full animate-pulse shadow-md border border-rose-400">
                    🚨 {currentlyBreachedBooked} Breached
                  </span>
                )}
                <span className="text-xs font-black uppercase tracking-widest opacity-90">Booked</span>
                <span className="text-3xl font-black mt-0.5 tracking-tight group-hover:scale-105 transition-transform">{countBooked}</span>
              </div>

              {/* Advance Arrow to Closed */}
              <div className="flex flex-col items-center my-1 text-slate-400 dark:text-slate-600">
                <span className="text-3xs font-extrabold uppercase tracking-widest text-emerald-500 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-100 dark:border-emerald-900/30">
                  ↓ {percentBookedToClosed}% closed
                </span>
              </div>

              {/* Trapezoid 5: Closed */}
              <div
                onClick={() => {
                  setSelectedFunnelStep({
                    name: "Closed Requests",
                    statuses: [PNCStatus.CLOSED]
                  });
                  setCurrentPage(1);
                }}
                className="w-[45%] bg-gradient-to-r from-emerald-600 to-teal-600 hover:brightness-110 active:scale-98 transition-all cursor-pointer flex flex-col items-center justify-center py-5 text-white shadow-lg relative group rounded-lg h-[90px]"
              >
                <span className="text-xs font-black uppercase tracking-widest opacity-90">Closed</span>
                <span className="text-3xl font-black mt-0.5 tracking-tight group-hover:scale-105 transition-transform">{countClosed}</span>
              </div>
            </div>

            {/* Right Column: DROP-OFFS & HOLDS */}
            <div className="lg:col-span-5 border border-slate-200 dark:border-slate-800 rounded-xl p-6 bg-slate-50/30 dark:bg-slate-950/10 h-full">
              <h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4">Drop-Offs & Holds</h4>
              <div className="space-y-3">
                {[
                  { label: "On Hold (waiting)", count: statusCounts[PNCStatus.ON_HOLD], status: PNCStatus.ON_HOLD, color: "bg-amber-500", exitStage: "Processing" },
                  { label: "Rejected by Manager", count: statusCounts[PNCStatus.REJECTED_BY_MANAGER], status: PNCStatus.REJECTED_BY_MANAGER, color: "bg-rose-500", exitStage: "Approval Pending" },
                  { label: "Rejected by PNC", count: statusCounts[PNCStatus.REJECTED_BY_PNC], status: PNCStatus.REJECTED_BY_PNC, color: "bg-rose-600", exitStage: "Processing" },
                  { label: "Cancelled by Employee", count: statusCounts[PNCStatus.CANCELLED_BY_EMPLOYEE], status: PNCStatus.CANCELLED_BY_EMPLOYEE, color: "bg-slate-400", breakdown: `Intake: ${empCancelStats.intake} | Approval Pending: ${empCancelStats.approval} | Processing: ${empCancelStats.processing} | Booked: ${empCancelStats.booked}` },
                  { label: "Cancelled by PNC", count: statusCounts[PNCStatus.CANCELLED_BY_PNC], status: PNCStatus.CANCELLED_BY_PNC, color: "bg-rose-700", breakdown: `Processing: ${pncCancelStats.processing} | Booked: ${pncCancelStats.booked}` },
                ].map((item) => (
                  <div
                    key={item.label}
                    onClick={() => {
                      if (item.count > 0) {
                        setSelectedFunnelStep({
                          name: item.label,
                          statuses: [item.status]
                        });
                        setCurrentPage(1);
                      }
                    }}
                    className={`flex flex-col border border-slate-200/60 dark:border-slate-800/80 rounded-lg p-3 bg-white dark:bg-slate-900 shadow-sm transition-all ${item.count > 0 ? 'hover:border-indigo-500 cursor-pointer hover:shadow' : 'opacity-65'}`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${item.color}`}></span>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{item.label}</span>
                      </div>
                      <span className="text-sm font-black text-slate-950 dark:text-white">{item.count}</span>
                    </div>
                    {item.exitStage && (
                      <div className="mt-1 ml-4.5 flex items-center">
                        <span className="text-3xs font-extrabold uppercase tracking-widest text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400 px-1.5 py-0.5 rounded">
                          Source Stage: {item.exitStage}
                        </span>
                      </div>
                    )}
                    {item.breakdown && item.count > 0 && (
                      <div className="mt-1 ml-4.5 flex flex-wrap gap-1">
                        <span className="text-3xs font-medium text-slate-400 dark:text-slate-500">
                          Exits: {item.breakdown}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* STAGE METRICS Table */}
          <div className="border-t border-slate-150 dark:border-slate-800 pt-6">
            <h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4 ml-1">SLA & TAT Monitoring</h4>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 shadow-2sm">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/40 text-slate-400 dark:text-slate-500 font-black uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <th className="px-6 py-4">Stage</th>
                    <th className="px-6 py-4">Owner</th>
                    <th className="px-6 py-4">Target TAT</th>
                    <th className="px-6 py-4">Actual TAT (Median / Avg)</th>
                    <th className="px-6 py-4">Currently Breached</th>
                    <th className="px-6 py-4">Historically Breached</th>
                    <th className="px-6 py-4 text-right">Escalation Trigger & Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900">
                  {[
                    { name: "Not Started", icon: "fa-circle-dot", color: "text-slate-400", stageKey: PNCStatus.NOT_STARTED, isSla: false },
                    { name: "Approval Pending", icon: "fa-clock", color: "text-amber-500", stageKey: 'Approval Pending', isSla: true },
                    { name: "Processing (PNC)", icon: "fa-spinner", color: "text-indigo-500 animate-spin", stageKey: 'Processing', isSla: true },
                    { name: "Booked", icon: "fa-ticket", color: "text-blue-500", stageKey: 'Booked', isSla: true },
                    { name: "On Hold", icon: "fa-pause", color: "text-orange-500", stageKey: 'On Hold', isSla: true },
                  ].map((row) => {
                    const stats = getStageStats(row.stageKey);
                    return (
                      <tr key={row.name} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/10 transition-colors">
                        <td className="px-6 py-4 font-bold flex items-center gap-2 text-slate-800 dark:text-slate-200">
                          <i className={`fa-solid ${row.icon} ${row.color} text-xs`}></i>
                          {row.name}
                        </td>
                        <td className="px-6 py-4 font-semibold text-slate-650 dark:text-slate-400">
                          {row.isSla ? stats.owner : 'System'}
                        </td>
                        <td className="px-6 py-4 font-semibold text-slate-650 dark:text-slate-400">
                          {row.isSla ? stats.target : '—'}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-850 dark:text-slate-100">{stats.median}</span>
                            <span className="text-3xs text-slate-400 dark:text-slate-500">Avg: {stats.avg}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {stats.currentlyBreached > 0 ? (
                            <span className="bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-455 px-2.5 py-0.5 rounded text-2xs font-extrabold border border-rose-150 dark:border-rose-900/40 animate-pulse">
                              🚨 {stats.currentlyBreached} Breached
                            </span>
                          ) : (
                            <span className="bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-450 px-2.5 py-0.5 rounded text-2xs font-bold border border-emerald-150 dark:border-emerald-900/30">
                              On Track
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                          {row.isSla ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-slate-800 dark:text-slate-200">{stats.historicallyBreached}</span>
                              <span className="text-3xs text-slate-400">({stats.breachPercent}% rate)</span>
                            </div>
                          ) : '—'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex flex-col items-end">
                            <span className="text-3xs text-slate-400 dark:text-slate-500">{row.isSla ? stats.escalationText : 'Auto-advance'}</span>
                            {row.isSla && stats.isEscalated ? (
                              <span className="text-3xs font-extrabold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 px-1.5 py-0.5 rounded border border-rose-150 dark:border-rose-900/40 mt-1 animate-pulse">
                                🚨 {stats.escalatedCount} Escalated
                              </span>
                            ) : row.isSla ? (
                              <span className="text-3xs font-medium text-emerald-600 dark:text-emerald-450 mt-1">No Escalations</span>
                            ) : (
                              <span className="text-3xs font-medium text-slate-400 mt-1">N/A</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : viewType === 'flowchart' ? (
        /* Ticket Lifecycle Flowchart View */
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-sm space-y-8 animate-in fade-in duration-300">
          {/* Flowchart Title Row */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-lg bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center text-white text-md shadow-md shadow-indigo-600/20">
                <i className="fa-solid fa-diagram-project"></i>
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800 dark:text-white tracking-tight">Ticket Lifecycle Flowchart</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Visualizing ticket volume and branching across all stages.</p>
              </div>
            </div>
          </div>

          {flowchartLoading ? (
            <div className="py-24 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-3"></div>
              <span className="text-xs text-slate-400">Loading flow data...</span>
            </div>
          ) : flowchartEdges.length === 0 ? (
            <div className="py-16 text-center bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 rounded-lg">
              <div className="w-16 h-16 bg-white dark:bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100 dark:border-slate-800 text-slate-400">
                <i className="fa-solid fa-inbox text-xl"></i>
              </div>
              <p className="text-slate-500 font-black text-sm uppercase tracking-wider">No status transitions recorded for this period</p>
              <p className="text-xs text-slate-450 dark:text-slate-500 mt-1 font-medium">Try broadening your date filter option.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <MermaidDiagram
                chart={getFlowchartText()}
              />
              <div className="text-3xs text-slate-400 font-medium flex items-center justify-center gap-4">
                <span>Node values represent transition volumes in selected range.</span>
                <span>•</span>
                <span>Loops (e.g. Rejections → Received) show cycle counts.</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Stage Cards Grid - Non-Zero Only */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 animate-in fade-in duration-300">
          {visibleCards.length > 0 ? (
            visibleCards.map(card => (
              <StageCard
                key={card.status}
                status={card.status}
                count={statusCounts[card.status]}
                icon={card.icon}
                onClick={() => handleStageClick(card.status)}
                color={card.color}
              />
            ))
          ) : (
            <div className="col-span-full py-16 text-center bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 rounded-lg">
              <div className="w-16 h-16 bg-white dark:bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100 dark:border-slate-800 text-slate-400">
                <i className="fa-solid fa-inbox text-xl"></i>
              </div>
              <p className="text-slate-500 font-black text-sm uppercase tracking-wider">No active requests for this filter</p>
            </div>
          )}
        </div>
      )}

      {/* Quick Action Card */}
      <Card className="p-8 flex flex-col md:flex-row items-center justify-between gap-6 bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/20 dark:to-slate-900 border-2 border-indigo-100 dark:border-indigo-900/30">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-indigo-600 text-white rounded-lg flex items-center justify-center text-2xl shadow-lg shadow-indigo-600/20">
            <i className="fa-solid fa-list-check"></i>
          </div>
          <div>
            <h4 className="font-black text-slate-900 dark:text-white text-lg">Process Queue</h4>
            <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">Start working on pending bookings</p>
          </div>
        </div>
        <button
          onClick={() => onTabChange('requests')}
          className="bg-indigo-600 text-white px-8 py-3 rounded-lg text-sm font-black uppercase tracking-wide shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all"
        >
          Go to Queue <i className="fa-solid fa-arrow-right ml-2"></i>
        </button>
      </Card>

      {/* Dynamic Details Modal (Supports Stage and Funnel Steps) */}
      {modalActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40" onClick={handleCloseModal}></div>
          <div className="relative w-full max-w-5xl bg-white dark:bg-slate-900 rounded-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 z-50">
            {/* Modal Header */}
            <div className="px-8 py-6 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex justify-between items-start gap-4 mb-4">
                <div>
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">{modalTitle}</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Showing {modalPaginatedRequests.length} of {modalRequests.length} requests
                  </p>
                </div>
                <button
                  onClick={handleCloseModal}
                  className="w-10 h-10 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all text-slate-400 flex items-center justify-center"
                >
                  <i className="fa-solid fa-xmark text-xl"></i>
                </button>
              </div>

              {/* Sort Options */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Sort by:</span>
                <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                  <button
                    onClick={() => setSortOrder('newest')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${sortOrder === 'newest'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700'
                      }`}
                  >
                    <i className="fa-solid fa-arrow-down-short-wide mr-1.5"></i>
                    Newest
                  </button>
                  <button
                    onClick={() => setSortOrder('oldest')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${sortOrder === 'oldest'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700'
                      }`}
                  >
                    <i className="fa-solid fa-arrow-up-short-wide mr-1.5"></i>
                    Oldest
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {modalPaginatedRequests.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="fa-solid fa-inbox text-2xl text-slate-400"></i>
                  </div>
                  <p className="text-slate-500 font-medium">No requests in this stage</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {modalPaginatedRequests.map((req: TravelRequest) => {
                    const isViolated = req.hasViolation || (policies.length > 0 ? checkPolicyViolation(req, policies) : false);
                    return (
                      <div
                        key={req.id}
                        className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-lg border border-slate-200 dark:border-slate-700 hover:shadow-md transition-all cursor-pointer group"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="font-mono text-sm font-black text-indigo-600">{req.submissionId || req.id}</span>
                              <StatusBadge type="priority" value={req.priority} />
                              {isViolated && (
                                <div className="bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 px-2 py-0.5 rounded-lg text-2xs font-bold border border-rose-200 dark:border-rose-800 flex items-center gap-1.5 animate-pulse">
                                  <i className="fa-solid fa-triangle-exclamation"></i>
                                  Policy
                                </div>
                              )}
                              <span className="ml-auto text-2xs font-bold text-slate-400 uppercase tracking-widest">
                                {req.pncStatus}
                              </span>
                            </div>
                            <h4 className="font-bold text-slate-900 dark:text-white mb-1">{req.requesterName}</h4>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                              <i className="fa-solid fa-route text-xs mr-2"></i>
                              {req.from} → {req.to}
                            </p>
                            <p className="text-xs text-slate-500 mt-2">
                              <i className="fa-solid fa-calendar text-xs mr-2"></i>
                              {new Date(req.dateOfTravel).toLocaleDateString()}
                            </p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onView(req);
                              handleCloseModal();
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700"
                          >
                            View Details
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer with Pagination */}
            {modalRequests.length > 0 && (
              <div className="px-8 py-5 border-t dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Items per page:</span>
                  {[5, 10, 25].map(size => (
                    <button
                      key={size}
                      onClick={() => {
                        setItemsPerPage(size);
                        setCurrentPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${itemsPerPage === size
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <i className="fa-solid fa-chevron-left"></i>
                  </button>
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300 px-4">
                    Page {currentPage} of {modalTotalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(modalTotalPages, p + 1))}
                    disabled={currentPage === modalTotalPages}
                    className="px-4 py-2 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <i className="fa-solid fa-chevron-right"></i>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PNCDashboard;


