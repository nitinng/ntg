import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { PNCStatus } from '../types';
import { employeeStatusLabel } from '../utils/statusGuide';

/**
 * The status history of the employee's own request.
 *
 * Reads through get_my_ticket_status_history (migration 20261009120000), which
 * returns from/to/when for the caller's own requests only -- no actor, no
 * internal notes. A traveller should be able to see that their request moved,
 * not read the desk's working notes about it.
 *
 * Statuses are rendered through employeeStatusLabel so the timeline agrees with
 * the dashboard: "On Hold" shows as "Action Required" to the person who has to
 * act on it.
 */

interface StatusHistoryRow {
  from_status: string | null;
  to_status: string;
  changed_at: string;
}

interface EmployeeStatusTimelineProps {
  ticketId: string;
}

const formatWhen = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const EmployeeStatusTimeline: React.FC<EmployeeStatusTimelineProps> = ({ ticketId }) => {
  const [rows, setRows] = useState<StatusHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_my_ticket_status_history', {
          p_ticket_id: ticketId
        });
        if (cancelled) return;
        if (error) {
          setFailed(true);
          setRows([]);
        } else {
          setRows((data as StatusHistoryRow[]) || []);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  if (loading) {
    return (
      <p className="text-sm text-slate-400 font-medium">Loading progress…</p>
    );
  }

  // A history that cannot be read is not worth an error message to a traveller:
  // the current status is shown prominently elsewhere on this screen.
  if (failed || rows.length === 0) {
    return (
      <p className="text-sm text-slate-400 font-medium">
        No status changes recorded yet.
      </p>
    );
  }

  return (
    <ol className="space-y-0">
      {rows.map((row, index) => {
        const isLatest = index === rows.length - 1;
        return (
          <li key={`${row.changed_at}-${row.to_status}`} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span
                className={`mt-1.5 w-3 h-3 rounded-full border-2 ${
                  isLatest
                    ? 'bg-indigo-600 border-indigo-600'
                    : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'
                }`}
                aria-hidden="true"
              />
              {!isLatest && <span className="flex-1 w-px bg-slate-200 dark:bg-slate-700" />}
            </div>
            <div className="pb-5">
              <p className="text-sm font-bold text-slate-800 dark:text-white">
                {employeeStatusLabel(row.to_status as PNCStatus)}
              </p>
              {row.from_status && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  from {employeeStatusLabel(row.from_status as PNCStatus)}
                </p>
              )}
              <p className="text-xs text-slate-400 mt-0.5">{formatWhen(row.changed_at)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
};

export default EmployeeStatusTimeline;
