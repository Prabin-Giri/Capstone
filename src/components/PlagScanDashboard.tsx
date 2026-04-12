import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { runPlagiarismCheck } from '../lib/api';
import type { PlagiarismResponse, PlagiarismResult } from '../lib/api';
import './PlagScanDashboard.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getSeverity(score: number): 'critical' | 'warning' | 'safe' {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'warning';
  return 'safe';
}

function SeverityChip({ score }: { score: number }) {
  const sev = getSeverity(score);
  if (sev === 'critical') return <span className="ps-chip ps-chip-critical">CRITICAL MATCH</span>;
  if (sev === 'warning') return <span className="ps-chip ps-chip-warning">MODERATE SIMILARITY</span>;
  return <span className="ps-chip ps-chip-safe">LOW MATCH</span>;
}

// ─── Code Diff Pane ───────────────────────────────────────────────────────────
function CodePane({
  filename,
  content,
  matchedLines,
  paneRef,
  onScroll,
  syncScroll,
}: {
  filename: string;
  content: string;
  matchedLines: number[];
  paneRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  syncScroll: boolean;
}) {
  const lines = content.split('\n');
  const matchedSet = new Set(matchedLines);
  return (
    <div
      className="ps-code-pane"
      ref={paneRef}
      onScroll={syncScroll ? onScroll : undefined}
    >
      <div className="ps-code-filename">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
        {filename}
      </div>
      <div className="ps-code-body">
        {lines.map((line, idx) => {
          const isMatch = matchedSet.has(idx);
          // dim lines that are just comments or whitespace (likely boilerplate)
          const stripped = line.replace(/#.*/g, '').trim();
          const isBoilerplate = stripped.length === 0;
          return (
            <div
              key={idx}
              className={`ps-code-line ${isMatch ? 'ps-code-match' : ''} ${isBoilerplate ? 'ps-code-dim' : ''}`}
            >
              <span className="ps-line-num">{idx + 1}</span>
              <span className="ps-line-content">{line || '\u00a0'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function PlagScanDashboard() {
  const [searchParams] = useSearchParams();
  const assignmentId = searchParams.get('assignment') || '';
  const initialS1 = searchParams.get('s1') || '';
  const initialS2 = searchParams.get('s2') || '';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PlagiarismResponse | null>(null);
  const [activePair, setActivePair] = useState<PlagiarismResult | null>(null);
  const [syncScroll, setSyncScroll] = useState(true);
  const [logicHighlight, setLogicHighlight] = useState(true);

  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  // Load results on mount if we have an assignment
  useEffect(() => {
    if (!assignmentId) return;
    setLoading(true);
    runPlagiarismCheck(assignmentId)
      .then(res => {
        setData(res);
        // Auto-select the pair from URL params or first result
        const target = res.flaggedPairs.find(
          p => p.student1.id === initialS1 && p.student2.id === initialS2
        ) || res.flaggedPairs[0] || null;
        setActivePair(target);
      })
      .catch(() => setError('Failed to load plagiarism report.'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  const handleScrollLeft = () => {
    if (syncScroll && leftRef.current && rightRef.current)
      rightRef.current.scrollTop = leftRef.current.scrollTop;
  };
  const handleScrollRight = () => {
    if (syncScroll && leftRef.current && rightRef.current)
      leftRef.current.scrollTop = rightRef.current.scrollTop;
  };

  const totalSubmissions = data?.totalSubmissions ?? 0;
  const flaggedPairs = data?.flaggedPairs ?? [];
  const criticalCount = flaggedPairs.filter(p => p.similarity >= 75).length;
  const warningCount = flaggedPairs.filter(p => p.similarity >= 50 && p.similarity < 75).length;
  const avgSimilarity = flaggedPairs.length > 0
    ? Math.round(flaggedPairs.reduce((sum, p) => sum + p.similarity, 0) / flaggedPairs.length)
    : 0;

  const activeMatchScore = activePair?.similarity ?? 0;

  // If no assignment in URL, show a placeholder nudge
  if (!assignmentId) {
    return (
      <div className="ps-root">
        <div className="ps-empty-nudge">
          <div className="ps-empty-icon">⚖️</div>
          <h2 className="ps-empty-title">No Investigation Selected</h2>
          <p className="ps-empty-text">
            Navigate to an assignment's grading page and click <strong>Plagiarism Check</strong>,<br />
            then click <strong>View Diff</strong> on a flagged pair to open it here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ps-root">
      {/* ── Sidebar ── */}
      <aside className="ps-sidebar">
        <div className="ps-sidebar-section-label ps-sidebar-high">HIGH PRIORITY</div>
        <div className="ps-sidebar-section-label ps-sidebar-sub">
          <span className="ps-sidebar-sub-icon">!</span> PENDING REVIEW
        </div>

        <div className="ps-sidebar-queue">
          {loading && <div className="ps-sidebar-loading">Analyzing…</div>}
          {!loading && flaggedPairs.length === 0 && (
            <div className="ps-sidebar-none">No flagged pairs for this assignment.</div>
          )}
          {flaggedPairs.map((pair, idx) => {
            const isActive = activePair === pair;
            const sev = getSeverity(pair.similarity);
            return (
              <div
                key={idx}
                className={`ps-queue-item ${isActive ? 'ps-queue-item-active' : ''}`}
                onClick={() => setActivePair(pair)}
              >
                <div className="ps-queue-header">
                  <span className={`ps-queue-names ${sev === 'critical' ? 'ps-queue-names-critical' : ''}`}>
                    {pair.student1.name} vs {pair.student2.name}
                  </span>
                  <span className={`ps-queue-score ${sev === 'critical' ? 'ps-queue-score-critical' : 'ps-queue-score-warn'}`}>
                    {pair.similarity}% Match
                  </span>
                </div>
                <div className="ps-queue-sub">
                  {assignmentId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Assignment
                  {pair.sameGroup && <span className="ps-same-group-tag">Same Group</span>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="ps-sidebar-divider" />
        <div className="ps-sidebar-section-label ps-sidebar-archived">
          <span className="ps-sidebar-archived-icon">▣</span> ARCHIVED
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="ps-main">
        {loading && (
          <div className="ps-loading-state">
            <div className="ps-spinner" />
            <p>Analyzing submissions…</p>
          </div>
        )}

        {error && <div className="ps-error-state">{error}</div>}

        {!loading && !error && data && (
          <>
            {/* ── 3 Stat Cards ── */}
            <div className="ps-stats-row">
              <div className="ps-stat-card ps-stat-red">
                <span className="ps-stat-value">{activeMatchScore}%</span>
                <span className="ps-stat-label">TOTAL MATCH SCORE</span>
              </div>
              <div className="ps-stat-card ps-stat-gold">
                <span className="ps-stat-value">
                  {activePair?.file1?.matchedLines?.length || 0}
                </span>
                <span className="ps-stat-label">IDENTICAL LINES</span>
              </div>
              <div className="ps-stat-card ps-stat-neutral">
                <span className="ps-stat-value ps-stat-neutral-value">
                  {(() => {
                    const f1 = activePair?.file1?.content?.split('# ---')?.length || 1;
                    const f2 = activePair?.file2?.content?.split('# ---')?.length || 1;
                    const maxFiles = Math.max(f1, f2);
                    return maxFiles > 1 ? `${maxFiles} Files` : 'Single File';
                  })()}
                </span>
                <span className="ps-stat-label">SUBMISSION FORMAT</span>
              </div>
            </div>

            {/* ── Hero Header ── */}
            {activePair ? (
              <header className="ps-hero-header">
                <nav className="ps-breadcrumb">
                  <span>Investigations</span>
                  <span className="ps-breadcrumb-sep">›</span>
                  <span>{assignmentId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                </nav>
                <h1 className="ps-hero-title">
                  {activePair.student1.name} vs {activePair.student2.name}
                  {activePair.sameGroup && <span className="ps-same-group-badge">{activePair.sameGroup} — Same Group</span>}
                </h1>
                <p className="ps-hero-desc">
                  Academic review of cross-student source correlation. Token-based similarity analysis detected{' '}
                  <strong>{activePair.matchedTokens} matched tokens</strong> out of {activePair.totalTokens} total.
                  {activePair.sameGroup
                    ? ' These students share the same group submission — this match is expected.'
                    : ' Manual refactoring attempts identified — variable names differ but logic structure is identical.'}
                </p>
              </header>
            ) : (
              <header className="ps-hero-header">
                <h1 className="ps-hero-title" style={{ fontSize: '1.5rem', color: '#646469' }}>
                  Select a flagged pair from the sidebar to begin investigation.
                </h1>
              </header>
            )}

            {/* ── Controls ── */}
            {activePair && (
              <>
                <div className="ps-controls-row">
                  <div className="ps-controls-left">
                    <label className="ps-toggle-pill">
                      <span>Sync Scroll</span>
                      <button
                        className={`ps-toggle-btn ${syncScroll ? 'ps-toggle-on' : ''}`}
                        onClick={() => setSyncScroll(v => !v)}
                        aria-label="Toggle sync scroll"
                      >
                        <div className="ps-toggle-knob" />
                      </button>
                    </label>
                    <label className="ps-toggle-pill">
                      <span>Logic Highlighting</span>
                      <button
                        className={`ps-toggle-btn ${logicHighlight ? 'ps-toggle-on' : ''}`}
                        onClick={() => setLogicHighlight(v => !v)}
                        aria-label="Toggle logic highlighting"
                      >
                        <div className="ps-toggle-knob" />
                      </button>
                    </label>
                  </div>
                  <div className="ps-controls-right">
                    <span className="ps-summary-text">
                      {criticalCount} critical · {warningCount} warning · {totalSubmissions} submissions scanned
                    </span>
                  </div>
                </div>

                {/* ── Code Diff Block ── */}
                <div className="ps-diff-block">
                  <div className="ps-diff-block-header">
                    <div className="ps-diff-block-left">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#840029" strokeWidth="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                      <span className="ps-diff-file-name">{activePair.file1?.name ?? 'submission_1'}</span>
                    </div>
                    <div className="ps-diff-block-right">
                      <SeverityChip score={activePair.similarity} />
                      <span className="ps-diff-match-count">{activePair.matchedTokens} Matches</span>
                    </div>
                  </div>

                  <div className="ps-diff-panes">
                    {activePair.file1 && activePair.file2 ? (
                      <>
                        <CodePane
                          filename={`${activePair.student1.name} — ${activePair.file1.name}`}
                          content={activePair.file1.content}
                          matchedLines={logicHighlight ? activePair.file1.matchedLines : []}
                          paneRef={leftRef}
                          onScroll={handleScrollLeft}
                          syncScroll={syncScroll}
                        />
                        <CodePane
                          filename={`${activePair.student2.name} — ${activePair.file2.name}`}
                          content={activePair.file2.content}
                          matchedLines={logicHighlight ? activePair.file2.matchedLines : []}
                          paneRef={rightRef}
                          onScroll={handleScrollRight}
                          syncScroll={syncScroll}
                        />
                      </>
                    ) : (
                      <div className="ps-no-files">
                        File content not available. Submissions may have been uploaded externally.
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Stats Summary Bar ── */}
                <div className="ps-summary-bar">
                  <div className="ps-summary-stat">
                    <span className="ps-summary-label">Total Scanned</span>
                    <span className="ps-summary-val">{totalSubmissions}</span>
                  </div>
                  <div className="ps-summary-stat">
                    <span className="ps-summary-label">Flagged Pairs</span>
                    <span className="ps-summary-val">{flaggedPairs.length}</span>
                  </div>
                  <div className="ps-summary-stat">
                    <span className="ps-summary-label">Critical</span>
                    <span className="ps-summary-val ps-summary-red">{criticalCount}</span>
                  </div>
                  <div className="ps-summary-stat">
                    <span className="ps-summary-label">Warning</span>
                    <span className="ps-summary-val ps-summary-gold">{warningCount}</span>
                  </div>
                  <div className="ps-summary-stat">
                    <span className="ps-summary-label">Avg Similarity</span>
                    <span className="ps-summary-val">{avgSimilarity}%</span>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
