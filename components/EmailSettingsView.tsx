/**
 * Email routing settings.
 *
 * The triggers sheet leaves three routing parties undefined - it writes "system set
 * defaults" for the standing CC, adds Finance to the settlement mails without saying
 * who they are, and names an "Escalation Owner" that exists nowhere else. Rather than
 * hardcode guesses, they are configured here, along with the SLA windows that drive
 * the time-based reminders.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { EmailRoutingSetting, User, UserRole } from '../types';
import { invalidateRoutingConfigCache } from '../utils/emailTriggers';
import { validateRoutingSettings, findDirtyKeys } from '../utils/emailRoutingValidation';

interface EmailSettingsViewProps {
  currentUser?: User | null;
}

const GROUP_META: Record<string, { title: string; blurb: string; icon: string }> = {
  routing: {
    title: 'Recipients & routing',
    blurb:
      'Who is copied on lifecycle mail. These fill the "system set defaults", Finance and Escalation Owner slots the triggers sheet left open.',
    icon: 'fa-inbox'
  },
  reminders: {
    title: 'Reminder & SLA windows',
    blurb:
      'How long a request may sit awaiting information before it is chased, escalated and finally closed. Sheet rows 26, 26b, 27 and 28.',
    icon: 'fa-clock'
  }
};

export const EmailSettingsView: React.FC<EmailSettingsViewProps> = ({ currentUser }) => {
  const [settings, setSettings] = useState<EmailRoutingSetting[]>([]);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const canEdit = currentUser?.role === UserRole.ADMIN;

  useEffect(() => {
    void fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('email_routing_settings')
        .select('*')
        .order('sort_order', { ascending: true });

      if (err) throw err;

      const rows: EmailRoutingSetting[] = (data || []).map((s: any) => ({
        key: s.key,
        value: s.value,
        label: s.label,
        description: s.description,
        valueType: s.value_type,
        group: s.group,
        sortOrder: s.sort_order,
        updatedAt: s.updated_at,
        updatedBy: s.updated_by
      }));

      setSettings(rows);
      setDraft(Object.fromEntries(rows.map(r => [r.key, r.value])));
    } catch (err: any) {
      setError(
        err?.message ||
          'Could not load email routing settings. The email_routing_settings table may not be migrated yet.'
      );
    } finally {
      setLoading(false);
    }
  };

  const dirtyKeys = useMemo(() => findDirtyKeys(settings, draft), [settings, draft]);

  const invalidKeys = useMemo(
    () => validateRoutingSettings(settings, draft),
    [settings, draft]
  );

  const handleSave = async () => {
    if (!canEdit || dirtyKeys.length === 0 || Object.keys(invalidKeys).length > 0) return;

    setSaving(true);
    setError(null);
    try {
      for (const key of dirtyKeys) {
        const { error: err } = await supabase
          .from('email_routing_settings')
          .update({
            value: draft[key],
            updated_at: new Date().toISOString(),
            updated_by: currentUser?.email || 'unknown'
          })
          .eq('key', key);
        if (err) throw err;
      }

      // The trigger engine caches this config for a minute; clear it so the next
      // mail uses what was just saved rather than the previous recipients.
      invalidateRoutingConfigCache();

      await fetchSettings();
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err: any) {
      setError(err?.message || 'Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setDraft(Object.fromEntries(settings.map(s => [s.key, s.value])));
    setError(null);
  };

  const grouped = useMemo(() => {
    const out: Record<string, EmailRoutingSetting[]> = {};
    for (const s of settings) {
      if (s.group === 'routing' || s.group === 'reminders') {
        (out[s.group] ||= []).push(s);
      }
    }
    return out;
  }, [settings]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-64 bg-slate-200 dark:bg-slate-800 rounded" />
        <div className="h-40 bg-slate-100 dark:bg-slate-900 rounded-lg" />
        <div className="h-40 bg-slate-100 dark:bg-slate-900 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6 animate-in fade-in duration-500">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <i className="fa-solid fa-route text-indigo-600" />
            Email Routing
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Recipients, standing CC and SLA windows for the travel lifecycle mails.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {savedAt && dirtyKeys.length === 0 && (
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <i className="fa-solid fa-check mr-1" />
              Saved at {savedAt}
            </span>
          )}
          {dirtyKeys.length > 0 && (
            <button
              onClick={handleReset}
              className="px-4 py-2 text-sm font-semibold rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Discard
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!canEdit || saving || dirtyKeys.length === 0 || Object.keys(invalidKeys).length > 0}
            className="px-5 py-2 text-sm font-bold rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : dirtyKeys.length > 0 ? `Save ${dirtyKeys.length} change${dirtyKeys.length > 1 ? 's' : ''}` : 'Saved'}
          </button>
        </div>
      </div>

      {!canEdit && (
        <div className="rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <i className="fa-solid fa-lock mr-2" />
          These settings are read-only for your role. An Admin can change them.
        </div>
      )}

      {error && (
        <div className="rounded-md border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          <i className="fa-solid fa-triangle-exclamation mr-2" />
          {error}
        </div>
      )}

      {Object.entries(grouped).map(([group, rows]) => {
        const meta = GROUP_META[group] || { title: group, blurb: '', icon: 'fa-gear' };
        return (
          <section
            key={group}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden"
          >
            <header className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40">
              <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <i className={`fa-solid ${meta.icon} text-slate-400`} />
                {meta.title}
              </h3>
              {meta.blurb && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">{meta.blurb}</p>
              )}
            </header>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map(setting => (
                <SettingRow
                  key={setting.key}
                  setting={setting}
                  value={draft[setting.key]}
                  onChange={v => setDraft(d => ({ ...d, [setting.key]: v }))}
                  disabled={!canEdit}
                  dirty={dirtyKeys.includes(setting.key)}
                  invalid={invalidKeys[setting.key]}
                />
              ))}
            </div>
          </section>
        );
      })}

      <p className="text-xs text-slate-400 dark:text-slate-600 px-1">
        Reminder windows are read by the hourly <code>scan_email_reminders()</code> job. Changing
        them affects requests already on hold from the next scan onward.
      </p>
    </div>
  );
};

// ---------------------------------------------------------------------------

const SettingRow: React.FC<{
  setting: EmailRoutingSetting;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled: boolean;
  dirty: boolean;
  invalid?: string;
}> = ({ setting, value, onChange, disabled, dirty, invalid }) => (
  <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-5 gap-4 items-start">
    <div className="md:col-span-2">
      <label className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
        {setting.label}
        {dirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Unsaved" />}
      </label>
      {setting.description && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
          {setting.description}
        </p>
      )}
    </div>

    <div className="md:col-span-3">
      {setting.valueType === 'email_list' ? (
        <EmailListInput
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
          disabled={disabled}
        />
      ) : setting.valueType === 'boolean' ? (
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(value)}
          disabled={disabled}
          onClick={() => onChange(!value)}
          className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-40 ${
            value ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
          }`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              value ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      ) : setting.valueType === 'number' ? (
        <input
          type="number"
          min={1}
          value={String(value ?? '')}
          disabled={disabled}
          onChange={e => onChange(Number(e.target.value))}
          className="w-32 px-3 py-2 text-sm font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none disabled:opacity-50"
        />
      ) : (
        <input
          type="text"
          value={String(value ?? '')}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2 text-sm font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none disabled:opacity-50"
        />
      )}

      {invalid && (
        <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 mt-2">
          <i className="fa-solid fa-circle-exclamation mr-1" />
          {invalid}
        </p>
      )}
    </div>
  </div>
);

const EmailListInput: React.FC<{
  value: string[];
  onChange: (value: string[]) => void;
  disabled: boolean;
}> = ({ value, onChange, disabled }) => {
  const [entry, setEntry] = useState('');

  const add = () => {
    const email = entry.trim().replace(/,$/, '');
    if (!email) return;
    if (value.some(v => v.toLowerCase() === email.toLowerCase())) {
      setEntry('');
      return;
    }
    onChange([...value, email]);
    setEntry('');
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {value.length === 0 && (
          <span className="text-xs italic text-slate-400 dark:text-slate-600 py-1">
            No recipients — mails in this slot will go out with none.
          </span>
        )}
        {value.map(email => (
          <span
            key={email}
            className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
          >
            {email}
            {!disabled && (
              <button
                type="button"
                aria-label={`Remove ${email}`}
                onClick={() => onChange(value.filter(v => v !== email))}
                className="text-slate-400 hover:text-rose-500"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            )}
          </span>
        ))}
      </div>

      {!disabled && (
        <div className="flex gap-2">
          <input
            type="email"
            value={entry}
            placeholder="name@navgurukul.org"
            onChange={e => setEntry(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                add();
              }
            }}
            onBlur={add}
            className="flex-1 px-3 py-2 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
          />
          <button
            type="button"
            onClick={add}
            className="px-3 py-2 text-sm font-semibold rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
};

export default EmailSettingsView;
