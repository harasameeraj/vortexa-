import { Shield, RefreshCw, Pill, Activity, ShieldAlert, KeyRound, Lightbulb, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { useT } from '../i18n';

const STATUS_STYLES = {
  green:  { text: 'text-emerald-600', ring: 'border-emerald-200 bg-emerald-50', dot: 'bg-emerald-500', bar: 'bg-emerald-500' },
  yellow: { text: 'text-amber-600',   ring: 'border-amber-200 bg-amber-50',     dot: 'bg-amber-500',   bar: 'bg-amber-500'   },
  red:    { text: 'text-red-600',     ring: 'border-red-200 bg-red-50',         dot: 'bg-red-500',     bar: 'bg-red-500'     },
};
const SEV = {
  high:   'bg-red-50 border-red-200 text-red-700',
  medium: 'bg-amber-50 border-amber-200 text-amber-700',
  low:    'bg-blue-50 border-blue-200 text-blue-700',
};
const DOT  = { high: 'bg-red-500', medium: 'bg-amber-500', low: 'bg-blue-500' };
const PRIO = { high: 'bg-red-500', medium: 'bg-amber-500', low: 'bg-blue-500' };

function LensCard({ icon: Icon, title, status, children }) {
  const { t } = useT();
  const s = STATUS_STYLES[status];
  const STATUS_LABELS = { green: t.statusStrong, yellow: t.statusNeedsAttention, red: t.statusAtRisk };
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><Icon size={15} className="text-emerald-600" /> {title}</h3>
        {s && <span className={`flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border ${s.ring}`}><span className={`w-2 h-2 rounded-full ${s.dot}`} /> <span className={s.text}>{STATUS_LABELS[status] || status}</span></span>}
      </div>
      {children}
    </div>
  );
}

export default function GuardianPanel({ report, running, onRun }) {
  const { t } = useT();

  const STATUS = {
    green:  { ...STATUS_STYLES.green,  label: t.statusStrong },
    yellow: { ...STATUS_STYLES.yellow, label: t.statusNeedsAttention },
    red:    { ...STATUS_STYLES.red,    label: t.statusAtRisk },
  };

  const SEV_LABELS  = { high: t.sevHigh,      medium: t.sevMedium,      low: t.sevLow      };
  const PRIO_LABELS = { high: t.priorityHigh,  medium: t.priorityMedium, low: t.priorityLow };
  const TYPE_LABELS = { health: t.typeHealth, security: t.typeSecurity, fraud: t.typeFraud, consent: t.typeConsent };

  if (!report && running) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-10 text-center">
        <RefreshCw size={26} className="mx-auto text-emerald-600 animate-spin mb-3" />
        <p className="text-gray-900 text-sm font-medium">{t.analyzing}</p>
        <p className="text-gray-500 text-xs mt-1">{t.analyzingNote}</p>
      </div>
    );
  }
  if (!report) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col items-center justify-center text-center" style={{ minHeight: '420px' }}>
        <Shield size={40} className="text-gray-200 mb-4" />
        <p className="text-gray-900 text-base font-semibold mb-1">{t.runGuardianTitle}</p>
        <p className="text-gray-500 text-sm mb-6 max-w-xs">{t.runGuardianDesc}</p>
        <button onClick={onRun} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium">{t.runGuardianBtn}</button>
      </div>
    );
  }

  const s = STATUS[report.status] || STATUS.yellow;
  const sec = report.sections;

  return (
    <div className="space-y-5">
      {/* Score hero */}
      <div className={`border rounded-xl p-5 ${s.ring}`}>
        <div className="flex items-start gap-5">
          <div className="text-center min-w-[88px]">
            <div className={`text-5xl font-bold leading-none ${s.text}`}>{report.integrity_score}</div>
            <div className="text-gray-500 text-xs mt-1">{t.outOf100}</div>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Shield size={15} className="text-gray-700" />
              <span className="text-gray-900 text-sm font-semibold">{t.healthScore}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full border bg-white ${s.text}`}>{s.label}</span>
              <button onClick={onRun} disabled={running} className="ml-auto flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 disabled:opacity-50 font-medium">
                <RefreshCw size={12} className={running ? 'animate-spin' : ''} /> {running ? t.reRunning : t.reRun}
              </button>
            </div>
            <div className="h-2 rounded-full bg-white overflow-hidden mb-2 border border-gray-200">
              <div className={`h-full ${s.bar}`} style={{ width: `${report.integrity_score}%` }} />
            </div>
            <div className="flex items-center gap-2 mb-2">
              {['red', 'yellow', 'green'].map(c => (
                <span key={c} className={`w-3 h-3 rounded-full ${report.status === c ? STATUS_STYLES[c].dot : 'bg-gray-200'}`} />
              ))}
              <span className="text-gray-500 text-xs ml-1">
                {report.checked && `${t.analyzedPrefix} ${report.checked.prescriptions} ${t.prescriptionUnit} · ${report.checked.records} ${t.recordUnit} · ${t.onDevice}`}
              </span>
            </div>
            {report.breakdown?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {report.breakdown.map((b, i) => (
                  <span key={i} className={`text-xs px-2 py-0.5 rounded border ${b.delta < 0 ? 'border-red-200 text-red-600 bg-red-50' : 'border-emerald-200 text-emerald-600 bg-emerald-50'}`}>
                    {b.label} {b.delta > 0 ? `+${b.delta}` : b.delta}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2 mb-3"><Lightbulb size={15} className="text-emerald-600" /> {t.guardianRecs}</h3>
        <div className="space-y-2">
          {sec.recommendations.map((r, i) => (
            <div key={i} className="flex items-start gap-2.5 bg-gray-50 border border-gray-100 rounded-lg p-3">
              <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${PRIO[r.priority] || 'bg-blue-500'}`} />
              <div className="min-w-0">
                <p className="text-gray-900 text-sm">{r.text}</p>
                <span className="text-gray-400 text-xs">
                  {TYPE_LABELS[r.type?.toLowerCase()] || r.type} · {PRIO_LABELS[r.priority?.toLowerCase()] || r.priority} {t.prioritySuffix}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Medication safety */}
        <LensCard icon={Pill} title={t.lensMedSafety} status={sec.medication.status}>
          {sec.medication.alerts.length === 0 && <p className="text-gray-400 text-xs">{t.noMedIssues}</p>}
          <div className="space-y-2">
            {sec.medication.alerts.map((a, i) => (
              <div key={i} className={`border rounded-lg p-3 ${SEV[a.severity] || SEV.low}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full ${DOT[a.severity] || 'bg-blue-500'}`} />
                  <span className="text-xs font-semibold">{SEV_LABELS[a.severity?.toLowerCase()] || a.severity}</span>
                  <span className="text-xs opacity-70">· {a.drug}</span>
                </div>
                <p className="text-xs mb-1">{a.issue}</p>
                {a.recommendation && <p className="text-xs opacity-75">{a.recommendation}</p>}
              </div>
            ))}
          </div>
        </LensCard>

        {/* Health insights */}
        <LensCard icon={Activity} title={t.lensHealth}>
          {sec.health.summary && <p className="text-gray-600 text-xs mb-3">{sec.health.summary}</p>}
          {sec.health.chronic_conditions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {sec.health.chronic_conditions.map((c, i) => (
                <span key={i} className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full">{c}</span>
              ))}
            </div>
          )}
          {sec.health.lab_trends?.length > 0 && (
            <div className="space-y-1 mb-3">
              {sec.health.lab_trends.map((trend, i) => (
                <div key={i} className="text-xs text-gray-600 flex items-center gap-2">
                  <span className={trend.direction === 'up' ? 'text-red-500' : trend.direction === 'down' ? 'text-emerald-600' : 'text-gray-400'}>
                    {trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : '■'}
                  </span>
                  <span className="text-gray-900">{trend.name}</span> <span>{trend.reading}</span>
                  {trend.note && <span className="text-gray-400">· {trend.note}</span>}
                </div>
              ))}
            </div>
          )}
          {sec.health.timeline?.length > 0 && (
            <div>
              <p className="text-gray-400 text-xs mb-1.5">{t.healthTimeline}</p>
              <div className="space-y-1">
                {sec.health.timeline.slice(0, 6).map((e, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-400">{new Date(e.date).toLocaleDateString()}</span>
                    <span className="text-gray-600">{e.event}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </LensCard>

        {/* Fraud & abuse */}
        <LensCard icon={ShieldAlert} title={t.lensFraud} status={sec.fraud.status}>
          {sec.fraud.flags.length === 0 && <p className="text-gray-400 text-xs">{t.noSuspicious}</p>}
          {sec.fraud.flags.map((f, i) => (
            <div key={i} className={`border rounded-lg p-3 mb-2 ${SEV[f.severity] || SEV.low}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${DOT[f.severity] || 'bg-blue-500'}`} />
                <span className="text-xs font-semibold">{SEV_LABELS[f.severity?.toLowerCase()] || f.severity} {t.riskSuffix}</span>
              </div>
              <p className="text-xs font-medium mb-0.5">{f.pattern}</p>
              <p className="text-xs opacity-80">{f.details}</p>
            </div>
          ))}
        </LensCard>

        {/* Consent intelligence */}
        <LensCard icon={KeyRound} title={t.lensConsent}>
          {sec.consent.risky.map((c, i) => (
            <div key={`r${i}`} className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg p-2.5 mb-2">
              <span className="text-xs text-gray-900"><AlertTriangle size={11} className="inline text-red-500 mr-1" />{c.provider}</span>
              <span className="text-xs text-red-600">{t.staleAccess}</span>
            </div>
          ))}
          {sec.consent.expiring.map((c, i) => (
            <div key={`e${i}`} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-2">
              <span className="text-xs text-gray-900"><Clock size={11} className="inline text-amber-500 mr-1" />{c.provider}</span>
              <span className="text-xs text-amber-600">{t.expiresIn} {c.in_minutes} {t.minUnit}</span>
            </div>
          ))}
          {sec.consent.active.map((c, i) => (
            <div key={`a${i}`} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg p-2.5 mb-2">
              <span className="text-xs text-gray-900"><CheckCircle size={11} className="inline text-emerald-600 mr-1" />{c.provider}</span>
              <span className="text-xs text-gray-400">{c.scope}</span>
            </div>
          ))}
          {sec.consent.active.length + sec.consent.expiring.length + sec.consent.risky.length === 0 && (
            <p className="text-gray-400 text-xs">{t.noActiveGrants}{sec.consent.pending_count > 0 && ` ${sec.consent.pending_count} ${t.pendingCount}`}</p>
          )}
          {sec.consent.pending_count > 0 && (sec.consent.active.length + sec.consent.expiring.length > 0) && (
            <p className="text-gray-400 text-xs mt-1">{sec.consent.pending_count} {t.pendingAwaitingSig}</p>
          )}
        </LensCard>
      </div>
    </div>
  );
}
