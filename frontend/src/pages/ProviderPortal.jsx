import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Send, FileText, Search, Lock, Clock, CheckCircle, Eye, ExternalLink, FileDown, XCircle, Users, AlertTriangle } from 'lucide-react';
import api, { API_BASE } from '../api';
import Sidebar from '../components/Sidebar';
import { useT } from '../i18n';

export default function ProviderPortal() {
  const { id } = useParams();
  const nav = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const { t } = useT();

  const [query, setQuery] = useState('');
  const [found, setFound] = useState(null);
  const [searching, setSearching] = useState(false);
  const [records, setRecords] = useState(null);
  const [viewingPatientId, setViewingPatientId] = useState(null);
  const [consentStatus, setConsentStatus] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filePreview, setFilePreview] = useState(null);
  const [textPreview, setTextPreview] = useState(null);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState('');
  const [emergencyLoading, setEmergencyLoading] = useState(false);

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

  async function invokeBreakGlass(patientId) {
    if (!emergencyReason.trim() || emergencyReason.trim().length < 10) return;
    setEmergencyLoading(true);
    setError('');
    try {
      await api.post(`/emergency/break-glass/${patientId}?provider_id=${id}`, { reason: emergencyReason });
      setShowEmergencyModal(false);
      setEmergencyReason('');
      await refreshStatus();
    } catch (err) {
      setError(err.response?.data?.detail || 'Emergency access request failed');
      setShowEmergencyModal(false);
    } finally {
      setEmergencyLoading(false);
    }
  }

  function openHealthRecord(rec) {
    if (rec.is_file) {
      setFilePreview({ url: `${API_BASE}/consent/provider-file/${id}/${viewingPatientId}/${rec.id}`, title: rec.title, file_name: rec.file_name });
    } else {
      setTextPreview({ title: rec.title, content: rec.content });
    }
  }

  function logout() { localStorage.clear(); nav('/'); }

  function StatusBadge({ status }) {
    if (status === 'emergency') return <span className="flex items-center gap-1 text-xs bg-red-50 border border-red-300 text-red-700 px-2 py-0.5 rounded-full font-semibold"><AlertTriangle size={10} /> Emergency Access</span>;
    if (status === 'granted') return <span className="flex items-center gap-1 text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full"><CheckCircle size={10} /> Authorized</span>;
    if (status === 'pending') return <span className="flex items-center gap-1 text-xs bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full"><Clock size={10} /> Pending</span>;
    if (status === 'expired') return <span className="text-xs bg-gray-100 border border-gray-200 text-gray-500 px-2 py-0.5 rounded-full">Expired</span>;
    if (status === 'revoked') return <span className="text-xs bg-red-50 border border-red-200 text-red-600 px-2 py-0.5 rounded-full">Revoked</span>;
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex text-gray-900">
      <Sidebar items={[{ key: 'patients', label: t.tabPatients, icon: Users }]} active="patients" onSelect={() => {}} onLogout={logout} />

      <main className="flex-1 min-w-0">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{user.name || 'Provider'}</h1>
            <p className="text-xs text-gray-500 capitalize">{user.provider_type} portal</p>
          </div>
          <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full capitalize">{user.provider_type}</span>
        </div>

        <div className="px-6 py-6 max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Patient search */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2 mb-1"><Search size={15} className="text-emerald-600" /> {t.findPatient}</h2>
              <p className="text-gray-500 text-xs mb-4">{t.findPatientDesc}</p>

              <form onSubmit={searchPatient} className="flex gap-2 mb-4">
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="e.g. VTX-3F9A2B7C"
                  className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
                <button type="submit" disabled={searching} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
                  <Search size={14} /> {searching ? 'Searching…' : 'Search'}
                </button>
              </form>

              {error && <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg p-3 mb-3">{error}</div>}

              {found && (() => {
                const status = consentStatus[found.id];
                const isGranted = status === 'granted' || status === 'emergency';
                return (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-gray-900 text-sm font-medium">{found.name}</p>
                          <StatusBadge status={status} />
                        </div>
                        <p className="text-gray-400 text-xs font-mono">{found.patient_code}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => viewRecords(found.id)} disabled={!isGranted}
                        title={isGranted ? 'View authorized records' : 'Requires patient authorization'}
                        className="flex items-center gap-1 text-xs border px-3 py-1.5 rounded disabled:opacity-40 disabled:cursor-not-allowed border-emerald-200 text-emerald-600 hover:text-emerald-700">
                        <FileText size={11} /> View Records
                      </button>
                      {isGranted ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-600 px-2 py-1.5"><CheckCircle size={11} /> Authorized</span>
                      ) : status === 'pending' ? (
                        <button disabled className="flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-3 py-1.5 rounded cursor-default"><Clock size={11} /> Awaiting Patient Signature</button>
                      ) : (
                        <button onClick={() => requestAccess(found.id)} disabled={loading} className="flex items-center gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded">
                          <Send size={11} /> Request Access
                        </button>
                      )}
                    </div>
                    {user.provider_type === 'hospital' && !isGranted && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <button
                          onClick={() => setShowEmergencyModal(true)}
                          className="w-full flex items-center justify-center gap-1.5 text-xs border border-red-300 text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg font-medium transition-colors"
                        >
                          <AlertTriangle size={12} /> {t.emergencyOverride}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Authorized records */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2 mb-4"><FileText size={15} className="text-emerald-600" /> {t.authorizedRecords}</h2>
              {!records && (
                <div className="text-center py-12">
                  <Lock className="mx-auto mb-3 text-gray-300" size={32} />
                  <p className="text-gray-500 text-sm">No records loaded</p>
                  <p className="text-gray-400 text-xs mt-1">Request and receive patient authorization to view records</p>
                </div>
              )}
              {records && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-emerald-600 text-xs font-medium">Cryptographically Authorized Session</span>
                  </div>
                  <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 mb-4">
                    <p className="text-gray-900 font-medium text-sm">{records.patient_name}</p>
                    {records.blood_type && <p className="text-gray-500 text-xs">Blood Type: {records.blood_type}</p>}
                  </div>
                  <h3 className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">Prescriptions</h3>
                  <div className="space-y-2 mb-5">
                    {records.prescriptions?.length === 0 && <p className="text-gray-400 text-xs">No prescriptions on file</p>}
                    {records.prescriptions?.map((rx, i) => (
                      <div key={i} className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                        <p className="text-gray-900 text-sm font-medium">{rx.drug_name}</p>
                        <p className="text-gray-500 text-xs">{rx.dosage} · {rx.frequency}</p>
                        <p className="text-gray-400 text-xs">{rx.prescribed_date ? new Date(rx.prescribed_date).toLocaleDateString() : ''}</p>
                      </div>
                    ))}
                  </div>

                  <h3 className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">Medical Records & Documents</h3>
                  <div className="space-y-2">
                    {(!records.health_records || records.health_records.length === 0) && <p className="text-gray-400 text-xs">No documents on file</p>}
                    {records.health_records?.map(rec => (
                      <div key={rec.id} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg p-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-gray-900 text-sm font-medium truncate">{rec.title}</p>
                            {rec.is_file && <span className="flex items-center gap-1 text-xs bg-red-50 border border-red-200 text-red-600 px-1.5 py-0.5 rounded shrink-0"><FileText size={9} /> PDF</span>}
                          </div>
                          <p className="text-gray-400 text-xs capitalize">{rec.record_type.replace('_', ' ')}</p>
                        </div>
                        <button onClick={() => openHealthRecord(rec)} className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 border border-emerald-200 rounded px-2 py-1 shrink-0"><Eye size={11} /> View</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* PDF preview modal */}
      {filePreview && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setFilePreview(null)}>
          <div className="bg-white border border-gray-200 rounded-2xl p-4 w-full max-w-3xl shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={16} className="text-red-500 shrink-0" />
                <h3 className="font-semibold text-gray-900 text-sm truncate">{filePreview.title}</h3>
                <span className="text-gray-400 text-xs truncate">{filePreview.file_name}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <a href={filePreview.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700"><ExternalLink size={12} /> Open</a>
                <a href={filePreview.url} download={filePreview.file_name} className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700"><FileDown size={12} /> Download</a>
                <button onClick={() => setFilePreview(null)} className="text-gray-400 hover:text-gray-700"><XCircle size={18} /></button>
              </div>
            </div>
            <iframe src={filePreview.url} title={filePreview.title} className="w-full rounded-lg bg-gray-100 border border-gray-200" style={{ height: '70vh' }} />
            <p className="text-gray-400 text-xs mt-2 text-center">Decrypted under active patient consent · Access logged to audit trail</p>
          </div>
        </div>
      )}

      {/* Text record modal */}
      {textPreview && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setTextPreview(null)}>
          <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-lg w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-gray-900">{textPreview.title}</h3>
              <button onClick={() => setTextPreview(null)} className="text-gray-400 hover:text-gray-700"><XCircle size={18} /></button>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <p className="text-emerald-800 text-xs font-mono whitespace-pre-wrap">{textPreview.content}</p>
            </div>
            <p className="text-gray-400 text-xs mt-3 text-center">Decrypted under active patient consent · Access logged</p>
          </div>
        </div>
      )}
      {/* Emergency break-glass modal */}
      {showEmergencyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowEmergencyModal(false)}>
          <div className="bg-white border border-red-200 rounded-2xl p-6 max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Emergency Override — Break Glass</h3>
                <p className="text-xs text-gray-500">Hospital emergency access bypass</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-red-700 text-xs leading-relaxed">
                This bypasses patient cryptographic consent and grants immediate read access to all records for <strong>4 hours</strong>. This action is <strong>permanently logged</strong> to the patient's audit trail and cannot be undone. Only invoke for genuine clinical emergencies where the patient is unable to authorize access.
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Clinical justification <span className="text-red-500">*</span></label>
              <textarea
                value={emergencyReason}
                onChange={e => setEmergencyReason(e.target.value)}
                placeholder="e.g. Patient is unconscious following a cardiac event in the ER — reviewing medication history to avoid contraindicated treatment."
                rows={4}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 resize-none"
              />
              <p className="text-gray-400 text-xs mt-1">{emergencyReason.trim().length} / 10 characters minimum</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowEmergencyModal(false); setEmergencyReason(''); }}
                className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 py-2.5 rounded-lg text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => invokeBreakGlass(found.id)}
                disabled={emergencyLoading || emergencyReason.trim().length < 10}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                {emergencyLoading ? 'Invoking…' : <><AlertTriangle size={14} /> Invoke Emergency Access</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
