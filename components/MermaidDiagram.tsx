import React, { useEffect, useRef, useState } from 'react';
import { sanitizeSvg } from '../utils/sanitizeHtml';
import mermaid from 'mermaid';

interface MermaidDiagramProps {
  chart: string;
  config?: Record<string, any>;
}

let mermaidReady = false;
let renderCounter = 0;

export const MermaidDiagram = ({ chart, config }: MermaidDiagramProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgHtml, setSvgHtml] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!chart) return;

    setError(null);
    setSvgHtml('');

    const defaultThemeVariables = isDark
      ? {
          background: '#171717',
          mainBkg: '#171717',
          primaryColor: '#262626',
          primaryTextColor: '#e5e5e5',
          textColor: '#e5e5e5',
          primaryBorderColor: '#404040',
          lineColor: '#737373',
          secondaryColor: '#262626',
          secondaryTextColor: '#e5e5e5',
          tertiaryColor: '#171717',
          edgeLabelBackground: '#00000000',
        }
      : {
          primaryColor: '#6366f1',
          primaryTextColor: '#1e293b',
          primaryBorderColor: '#e2e8f0',
          lineColor: '#94a3b8',
          secondaryColor: '#f59e0b',
          tertiaryColor: '#10b981',
          edgeLabelBackground: '#00000000',
        };

    // Initialize with merged config
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'base',
      themeVariables: {
        ...defaultThemeVariables,
        ...config?.themeVariables,
      },
      ...config,
    });
    mermaidReady = true;

    // Use a unique ID per invocation
    renderCounter += 1;
    const id = `mmd-${Date.now()}-${renderCounter}`;

    // mermaid.render receives the raw JS string directly — no DOM read-back,
    // so newlines in the string are guaranteed to survive to the jison tokenizer.
    mermaid
      .render(id, chart)
      .then(({ svg }) => {
        setSvgHtml(svg);
      })
      .catch((err: any) => {
        console.error('Mermaid render failed:', err);
        // Clean up any stale #id element mermaid may have appended to <body>
        const stale = document.getElementById(id);
        if (stale) stale.remove();
        setError(
          typeof err?.message === 'string'
            ? err.message
            : 'Failed to render diagram.'
        );
      });
  }, [chart, isDark, config]);

  if (error) {
    return (
      <div className="p-4 border border-rose-200 dark:border-rose-800/40 rounded-lg bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-xs">
        <p className="font-bold mb-1">Diagram Render Error</p>
        <code className="block whitespace-pre-wrap">{error}</code>
      </div>
    );
  }

  if (!svgHtml) {
    return (
      <div className="py-16 flex flex-col items-center gap-3 text-slate-400">
        <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-500" />
        <span className="text-xs">Rendering flow diagram…</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full overflow-x-auto flex justify-center py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm"
      dangerouslySetInnerHTML={{ __html: sanitizeSvg(svgHtml) }}
    />
  );
};
