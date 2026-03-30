import React, { useRef, useState } from 'react';
import { ShieldAlert, Users, Code, Zap, AlertTriangle, Info } from 'lucide-react';
import './PlagScanDashboard.css';

// --- Dummy Data ---
const CLUSTERS = [
  {
    id: 1,
    title: 'Cluster Alpha: Final Project',
    students: ['JD', 'AS', 'MR'],
    severity: 'critical',
    score: 84,
  },
  {
    id: 2,
    title: 'Cluster Beta: DP Assignment',
    students: ['KL', 'BW'],
    severity: 'warning',
    score: 52,
  },
  {
    id: 3,
    title: 'Cluster Gamma: Utils',
    students: ['PT', 'LM', 'QN', 'XZ'],
    severity: 'info',
    score: 35,
  }
];

type Cluster = typeof CLUSTERS[0];

const CODE_LEFT = [
  'function calculateGradient(tensor, learningRate) {',
  '  const w = tensor.weights;',
  '  let gradient = new Array(w.length).fill(0);',
  '  ',
  '  // This loop looks highly suspicious',
  '  for(let i = 0; i < w.length; i++) {',
  '    gradient[i] = w[i] * errorRate + bias;',
  '    adjustWeights(learningRate, gradient[i]);',
  '  }',
  '  ',
  '  return gradient;',
  '}',
];

const CODE_RIGHT = [
  'function getGrad(tt, lr) {',
  '  let w = tt.weights;',
  '  const grad = new Array(w.length).fill(0);',
  '  ',
  '  // Adjusted names but identical logic',
  '  for(let j = 0; j < w.length; j++) {',
  '    grad[j] = w[j] * errorRate + bias;',
  '    adjustWeights(lr, grad[j]);',
  '  }',
  '  ',
  '  return grad;',
  '}',
];

// Lines indices (0-based) that are "matched" — highlighted as suspicious
const CRITICAL_LINES = [5, 6, 7, 8];
const WARNING_LINES = [1];

function highlightLine(code: string): string {
  return code
    .replace(/\b(function|const|let|new|for|return)\b/g, '<span class="keyword">$1</span>')
    .replace(/(\/\/.+)/g, '<span class="comment">$1</span>');
}

function CodePane({
  lines,
  paneRef,
  onScroll,
  filename,
}: {
  lines: string[];
  paneRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  filename: string;
}) {
  return (
    <div className="code-pane left-pane" ref={paneRef} onScroll={onScroll}>
      <div style={{ color: '#9ca3af', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
        {filename}
      </div>
      {lines.map((line, idx) => {
        let extraClass = '';
        if (CRITICAL_LINES.includes(idx)) extraClass = 'match-region';
        else if (WARNING_LINES.includes(idx)) extraClass = 'match-region-warning';
        return (
          <div key={idx} className={'code-line ' + extraClass}>
            <div className="line-number">{idx + 1}</div>
            <div dangerouslySetInnerHTML={{ __html: highlightLine(line) || '\u00a0' }} />
          </div>
        );
      })}
    </div>
  );
}

// FilesIcon for "Total Scanned"
function FilesIcon({ size }: { size: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  if (severity === 'critical') {
    return (
      <span className="badge badge-critical">
        <AlertTriangle size={14} /> CRITICAL
      </span>
    );
  }
  if (severity === 'warning') {
    return (
      <span className="badge badge-warning">
        <Zap size={14} /> WARNING
      </span>
    );
  }
  return (
    <span className="badge badge-info">
      <Info size={14} /> INFO
    </span>
  );
}

// Dummy pairwise matches within active cluster
const PAIRWISE = [
  { a: 'JD', b: 'AS', score: 84, severity: 'critical' },
  { a: 'JD', b: 'MR', score: 61, severity: 'critical' },
  { a: 'AS', b: 'MR', score: 43, severity: 'warning' },
];

export default function PlagScanDashboard() {
  const [activeCluster, setActiveCluster] = useState<Cluster>(CLUSTERS[0]);
  const [activePair, setActivePair] = useState(PAIRWISE[0]);

  const leftPaneRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);

  const handleScrollLeft = () => {
    if (leftPaneRef.current && rightPaneRef.current) {
      rightPaneRef.current.scrollTop = leftPaneRef.current.scrollTop;
    }
  };

  const handleScrollRight = () => {
    if (leftPaneRef.current && rightPaneRef.current) {
      leftPaneRef.current.scrollTop = rightPaneRef.current.scrollTop;
    }
  };

  return (
    <div className="plagscan-container">
      {/* ── Header ── */}
      <h1 className="ps-header">
        <ShieldAlert size={36} className="glow-red" />
        PlagScan <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: 8 }}>| Integrity Dashboard</span>
      </h1>

      {/* ── Stats Row ── */}
      <div className="stats-grid">
        <div className="glass-surface stat-card glass-card">
          <div className="stat-title">
            <FilesIcon size={16} /> Total Scanned
          </div>
          <div className="stat-value">1,204</div>
        </div>
        <div className="glass-surface stat-card glass-card">
          <div className="stat-title glow-red">
            <AlertTriangle size={16} /> Critical Flags
          </div>
          <div className="stat-value glow-red">12</div>
        </div>
        <div className="glass-surface stat-card glass-card">
          <div className="stat-title glow-amber">
            <Zap size={16} /> Warnings
          </div>
          <div className="stat-value glow-amber">34</div>
        </div>
        <div className="glass-surface stat-card glass-card">
          <div className="stat-title">
            <Code size={16} /> Avg. Similarity
          </div>
          <div className="stat-value">14.2%</div>
        </div>
      </div>

      {/* ── Main 3-column grid ── */}
      <div className="main-grid">

        {/* Left: Cluster List */}
        <div className="glass-surface cluster-panel">
          <h2 style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8, color: '#e5e7eb' }}>
            <Users size={18} /> Cluster View
          </h2>
          {CLUSTERS.map(cluster => (
            <div
              key={cluster.id}
              className={'glass-surface cluster-card glass-card' + (activeCluster.id === cluster.id ? ' cluster-active' : '')}
              onClick={() => setActiveCluster(cluster)}
            >
              <div className="cluster-header">
                <span className="cluster-title">{cluster.title}</span>
                <div className="avatars-group">
                  {cluster.students.map((s, i) => (
                    <div key={i} className="avatar-pill">{s}</div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
                <span>Max Similarity</span>
                <strong style={{ color: '#f3f4f6' }}>{cluster.score}%</strong>
              </div>
              <div className="severity-meter-bg">
                <div
                  className={'severity-meter-fill ' + (cluster.severity === 'critical' ? 'fill-critical' : cluster.severity === 'warning' ? 'fill-warning' : 'fill-info')}
                  style={{ width: cluster.score + '%' }}
                />
              </div>
              <div style={{ marginTop: '0.75rem' }}>
                <SeverityBadge severity={cluster.severity} />
              </div>
            </div>
          ))}
        </div>

        {/* Middle: Pairwise Detail */}
        <div className="glass-surface diff-panel" style={{ minWidth: 0 }}>
          <div className="diff-header">
            <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
              Pairwise Comparisons — {activeCluster.title}
            </span>
          </div>
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto', flex: 1 }}>
            {PAIRWISE.map((pair, idx) => (
              <div
                key={idx}
                className={'glass-surface glass-card pair-row' + (activePair === pair ? ' pair-active' : '')}
                onClick={() => setActivePair(pair)}
                style={{ padding: '0.875rem 1rem', cursor: 'pointer', borderRadius: '12px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    {pair.a} vs {pair.b}
                  </span>
                  <SeverityBadge severity={pair.severity} />
                </div>
                <div className="severity-meter-bg" style={{ marginTop: '0.75rem' }}>
                  <div
                    className={'severity-meter-fill ' + (pair.severity === 'critical' ? 'fill-critical' : 'fill-warning')}
                    style={{ width: pair.score + '%' }}
                  />
                </div>
                <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: '#9ca3af', textAlign: 'right' }}>{pair.score}% match</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Split Diff "Smoking Gun" */}
        <div className="glass-surface diff-panel" style={{ minWidth: 0 }}>
          <div className="diff-header">
            <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>The Smoking Gun: {activePair.a} vs {activePair.b}</span>
            <SeverityBadge severity={activePair.severity} />
          </div>
          <div style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', color: '#6b7280' }}>
            🔴 Red regions = matched code &nbsp;|&nbsp; Scroll synced
          </div>
          <div className="diff-content">
            <CodePane
              lines={CODE_LEFT}
              paneRef={leftPaneRef}
              onScroll={handleScrollLeft}
              filename={activePair.a + '_Submission.js'}
            />
            <CodePane
              lines={CODE_RIGHT}
              paneRef={rightPaneRef}
              onScroll={handleScrollRight}
              filename={activePair.b + '_Submission.js'}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
