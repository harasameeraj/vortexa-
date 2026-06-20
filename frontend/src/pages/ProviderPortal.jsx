import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Shield, LogOut, Send, FileText, Search, Lock, Clock, CheckCircle, Eye, ExternalLink, FileDown, XCircle } from 'lucide-react';
import api, { API_BASE } from '../api';

export default function ProviderPortal() {
  const { id } = useParams();
  const nav = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const [query, setQuery] = useState('');
  const [found, setFound] = useState(null);     // { id, name, patient_code }
  const [searching, setSearching] = useState(false);
  const [records, setRecords] = useState(null);
  const [viewingPatientId, setViewingPatientId] = useState(null);
  const [consentStatus, setConsentStatus] = useState({});  // { patientId: 'pending'|'granted'|'expired'|'revoked' }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filePreview, setFilePreview] = useState(null);  // { url, title, file_name }
  const [textPreview, setTextPreview] = useState(null);  // { title, content }

  // Identity guard — a provider may only use their own portal
  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    if (!u.id || u.role !== 'provider' || String(u.id) !== String(id)) {
      localStorage.clear();
      nav('/login?role=provider');
    }
  }, [id, nav]);

  const refreshStatus = useCallback(async () => {
    const sRes = await api.get(`/consent/provider-status/${id}`);
    setConsentStatus(sRes.data);
  }, [id]);

  async function searchPatient(e) {
    e?.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError('');
    setFound(null);
    setRecords(null);
    try {
      const res = await api.get(`/patients/search?code=${encodeURIComponent(query.trim())}`);
      setFound(res.data);
      await refreshStatus();
    } catch (err) {
      setError(err.response?.data?.detail || 'No patient found with that ID');
    } finally {
      setSearching(false);
    }
  }

  async function requestAccess(patientId) {
    setLoading(true);
    setError('');
    try {
      await api.post(`/consent/request?provider_id=${id}`, { patient_id: patientId, access_scope: 'prescriptions' });
      await refreshStatus();
    } catch (err) {
      setError(err.response?.data?.detail || 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  async function viewRecords(patientId) {
    setError('');
    try {
      const res = await api.get(`/consent/provider-records/${id}/${patientId}`);
      setRecords(res.data);
      setViewingPatientId(patientId);
    } catch (err) {
      setError(err.response?.data?.detail || 'Access denied — patient authorization required');
      setRecords(null);
      setViewingPatientId(null);
    }
  }

  function openHealthRecord(rec) {
    if (rec.is_file) {
      setFilePreview({
        url: `${API_BASE}/consent/provider-file/${id}/${viewingPatientId}/${rec.id}`,
        title: rec.title,
        file_name: rec.file_name,
      });
    } else {
      setTextPreview({ title: rec.title, content: rec.content });
    }
  }

  function logout() { localStorage.clear(); nav('/'); }

  function StatusBadge({ status }) {
    if (status === 'granted') return <span className="flex items-center gap-1 text-xs bg-green-500/15 border border-green-400/25 text-green-300 px-2 py-0.5 rounded-full"><CheckCircle size={10} /> Authorized</span>;
    if (status === 'pending') return <span className="flex items-center gap-1 text-xs bg-amber-500/15 border border-amber-400/25 text-amber-300 px-2 py-0.5 rounded-full"><Clock size={10} /> Pending</span>;
    if (status === 'expired') return <span className="text-xs bg-slate-500/15 border border-slate-400/25 text-slate-300 px-2 py-0.5 rounded-full">Expired</span>;
    if (status === 'revoked') return <span className="text-xs bg-red-500/15 border border-red-400/25 text-red-300 px-2 py-0.5 rounded-full">Revoked</span>;
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center"><Shield size={16} /></div>
          <span className="font-bold text-sm">VORTEXA</span>
          <span className="text-slate-600 text-sm">/</span>
          <span className="text-slate-300 text-sm">{user.name || 'Provider'}</span>
          <span className="text-xs bg-blue-500/20 text-blue-300 border border-blue-400/20 px-2 py-0.5 rounded-full capitalize">{user.provider_type}</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={logout} className="flex items-center gap-1.5 text-slate-400 hover:text-white text-xs"><LogOut size={13} /> Sign out</button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Patient search */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <h2 className="font-semibold text-white text-sm flex items-center gap-2 mb-1"><Search size={15} /> Find a Patient</h2>
            <p className="text-slate-500 text-xs mb-4">Enter the patient's exact VORTEXA ID. There is no patient directory — you can only locate a patient who has shared their unique ID with you.</p>

            <form onSubmit={searchPatient} className="flex gap-2 mb-4">
              <input value={query} onChange={e => setQuery(e.target.value)}
                placeholder="e.g. VTX-3F9A2B7C"
                className="flex-1 bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-white text-sm font-mono placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
              <button type="submit" disabled={searching}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
                <Search size={14} /> {searching ? 'Searching…' : 'Search'}
              </button>
            </form>

            {error && <div className="bg-red-500/10 border border-red-400/20 text-red-300 text-xs rounded-lg p-3 mb-3">{error}</div>}

            {found && (() => {
              const status = consentStatus[found.id];
              const isGranted = status === 'granted';
              return (
                <div className="bg-white/3 border border-white/10 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-white text-sm font-medium">{found.name}</p>
                        <StatusBadge status={status} />
                      </div>
                      <p className="text-slate-500 text-xs font-mono">{found.patient_code}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => viewRecords(found.id)} disabled={!isGranted}
                      title={isGranted ? 'View authorized records' : 'Requires patient authorization'}
                      className="flex items-center gap-1 text-xs border px-3 py-1.5 rounded disabled:opacity-40 disabled:cursor-not-allowed border-blue-400/20 text-blue-400 hover:text-blue-300">
                      <FileText size={11} /> View Records
                    </button>
                    {isGranted ? (
                      <span className="flex items-center gap-1 text-xs text-green-400 px-2 py-1.5"><CheckCircle size={11} /> Authorized</span>
                    ) : status === 'pending' ? (
                      <button disabled className="flex items-center gap-1 text-xs bg-amber-600/40 text-white px-3 py-1.5 rounded cursor-default">
                        <Clock size={11} /> Awaiting Patient Signature
                      </button>
                    ) : (
                      <button onClick={() => requestAccess(found.id)} disabled={loading}
                        className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-1.5 rounded">
                        <Send size={11} /> Request Access
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Authorized records */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <h2 className="font-semibold text-white text-sm flex items-center gap-2 mb-4"><FileText size={15} /> Authorized Patient Records</h2>
            {!records && (
              <div className="text-center py-12">
                <Lock className="mx-auto mb-3 text-slate-600" size={32} />
                <p className="text-slate-500 text-sm">No records loaded</p>
                <p className="text-slate-600 text-xs mt-1">Request and receive patient authorization to view records</p>
              </div>
            )}
            {records && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  <span className="text-green-400 text-xs font-medium">Cryptographically Authorized Session</span>
                </div>
                <div className="bg-white/3 border border-white/5 rounded-lg p-3 mb-4">
                  <p className="text-white font-medium text-sm">{records.patient_name}</p>
                  {records.blood_type && <p className="text-slate-400 text-xs">Blood Type: {records.blood_type}</p>}
                </div>
                <h3 className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wide">Prescriptions</h3>
                <div className="space-y-2 mb-5">
                  {records.prescriptions?.length === 0 && <p className="text-slate-500 text-xs">No prescriptions on file</p>}
                  {records.prescriptions?.map((rx, i) => (
                    <div key={i} className="bg-white/3 border border-white/5 rounded-lg p-3">
                      <p className="text-white text-sm font-medium">{rx.drug_name}</p>
                      <p className="text-slate-400 text-xs">{rx.dosage} · {rx.frequency}</p>
                      <p className="text-slate-500 text-xs">{rx.prescribed_date ? new Date(rx.prescribed_date).toLocaleDateString() : ''}</p>
                    </div>
                  ))}
                </div>

                <h3 className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wide">Medical Records & Documents</h3>
                <div className="space-y-2">
                  {(!records.health_records || records.health_records.length === 0) && <p className="text-slate-500 text-xs">No documents on file</p>}
                  {records.health_records?.map(rec => (
                    <div key={rec.id} className="flex items-center justify-between bg-white/3 border border-white/5 rounded-lg p-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-white text-sm font-medium truncate">{rec.title}</p>
                          {rec.is_file && <span className="flex items-center gap-1 text-xs bg-red-500/15 border border-red-400/25 text-red-300 px-1.5 py-0.5 rounded shrink-0"><FileText size={9} /> PDF</span>}
                        </div>
                        <p className="text-slate-400 text-xs capitalize">{rec.record_type.replace('_', ' ')}</p>
                      </div>
                      <button onClick={() => openHealthRecord(rec)} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 border border-blue-400/20 rounded px-2 py-1 shrink-0">
                        <Eye size={11} /> View
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PDF preview modal */}
      {filePreview && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setFilePreview(null)}>
          <div className="bg-slate-900 border border-white/15 rounded-2xl p-4 w-full max-w-3xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={16} className="text-red-300 shrink-0" />
                <h3 className="font-semibold text-white text-sm truncate">{filePreview.title}</h3>
                <span className="text-slate-500 text-xs truncate">{filePreview.file_name}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <a href={filePreview.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"><ExternalLink size={12} /> Open</a>
                <a href={filePreview.url} download={filePreview.file_name} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"><FileDown size={12} /> Download</a>
                <button onClick={() => setFilePreview(null)} className="text-slate-400 hover:text-white"><XCircle size={18} /></button>
              </div>
            </div>
            <iframe src={filePreview.url} title={filePreview.title} className="w-full rounded-lg bg-white" style={{ height: '70vh' }} />
            <p className="text-slate-500 text-xs mt-2 text-center">🔓 Decrypted under active patient consent · Access logged to audit trail</p>
          </div>
        </div>
      )}

      {/* Text record modal */}
      {textPreview && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setTextPreview(null)}>
          <div className="bg-slate-900 border border-white/15 rounded-2xl p-6 max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-white">{textPreview.title}</h3>
              <button onClick={() => setTextPreview(null)} className="text-slate-400 hover:text-white"><XCircle size={18} /></button>
            </div>
            <div className="bg-green-500/5 border border-green-400/20 rounded-lg p-4">
              <p className="text-green-400 text-xs font-mono whitespace-pre-wrap">{textPreview.content}</p>
            </div>
            <p className="text-slate-500 text-xs mt-3 text-center">🔓 Decrypted under active patient consent · Access logged</p>
          </div>
        </div>
      )}
    </div>
  );
}
