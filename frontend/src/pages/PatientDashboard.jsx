import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Shield, Activity, FileText, Lock, LogOut, AlertTriangle, CheckCircle, Clock, Zap, Eye, Plus, RefreshCw, XCircle, FileDown, ExternalLink, Copy, ShieldAlert } from 'lucide-react';
import api, { API_BASE } from '../api';
import SignatureModal from '../components/SignatureModal';
import OnboardingModal from '../components/OnboardingModal';

const SEVERITY_COLORS = {
  high: 'bg-red-500/15 border-red-400/30 text-red-300',
  medium: 'bg-amber-500/15 border-amber-400/30 text-amber-300',
  low: 'bg-blue-500/15 border-blue-400/30 text-blue-300',
};
const SEVERITY_DOT = { high: 'bg-red-400', medium: 'bg-amber-400', low: 'bg-blue-400' };

export default function PatientDashboard() {
  const { id } = useParams();
  const nav = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const [tab, setTab] = useState('vault');
  const [prescriptions, setPrescriptions] = useState([]);
  const [records, setRecords] = useState([]);
  const [pendingConsent, setPendingConsent] = useState([]);
  const [grantedConsent, setGrantedConsent] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [clinicalAlerts, setClinicalAlerts] = useState([]);
  const [fraudFlags, setFraudFlags] = useState([]);
  const [patient, setPatient] = useState(null);
  const [sigModal, setSigModal] = useState(null);
  const [runningAI, setRunningAI] = useState(false);
  const [decryptedRecord, setDecryptedRecord] = useState(null);
  const [newRx, setNewRx] = useState({ drug_name: '', dosage: '', frequency: '', duration: '', notes: '' });
  const [addingRx, setAddingRx] = useState(false);
  const [showRxForm, setShowRxForm] = useState(false);
  const [newRecord, setNewRecord] = useState({ record_type: 'allergy', title: '', content: '' });
  const [recordFile, setRecordFile] = useState(null);
  const [uploadingRecord, setUploadingRecord] = useState(false);
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [filePreview, setFilePreview] = useState(null);  // { url, title, file_name }
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [rxFile, setRxFile] = useState(null);
  const [rxFileName, setRxFileName] = useState('');
  const [showRxPdfForm, setShowRxPdfForm] = useState(false);
  const [uploadingRxPdf, setUploadingRxPdf] = useState(false);
  const [rxParsing, setRxParsing] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [fraudScanning, setFraudScanning] = useState(false);
  const [fraudResult, setFraudResult] = useState(null);  // { status, summary, checked }

  // Identity guard — a patient may only view their OWN vault (core sovereignty rule)
  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    if (!u.id || u.role !== 'patient' || String(u.id) !== String(id)) {
      localStorage.clear();
      nav('/login?role=patient');
    }
  }, [id, nav]);

  const load = useCallback(async () => {
    try {
      const [pRes, rxRes, recRes, pendRes, grantRes, logRes, caRes, ffRes] = await Promise.all([
        api.get(`/patients/${id}`),
        api.get(`/prescriptions/list/${id}`),
        api.get(`/vault/records/${id}`),
        api.get(`/consent/pending/${id}`),
        api.get(`/consent/granted/${id}`),
        api.get(`/audit/log/${id}`),
        api.get(`/ai/clinical-alerts/${id}`),
        api.get(`/ai/fraud-flags/${id}`),
      ]);
      setPatient(pRes.data);
      setPrescriptions(rxRes.data);
      setRecords(recRes.data);
      setPendingConsent(pendRes.data);
      setGrantedConsent(grantRes.data);
      setAuditLog(logRes.data);
      setClinicalAlerts(caRes.data);
      setFraudFlags(ffRes.data);
    } catch (err) {
      if (err.response?.status === 401) { localStorage.clear(); nav('/login'); }
    }
  }, [id, nav]);

  useEffect(() => { load(); }, [load]);

  async function signConsent(tokenItem, signature) {
    await api.post('/consent/sign', { token_id: tokenItem.token_id, signature });
    setSigModal(null);
    load();
  }

  async function revokeConsent(token_id) {
    await api.post('/consent/revoke', { token_id });
    load();
  }

  async function runAIAnalysis() {
    setRunningAI(true);
    try {
      await api.post(`/ai/run-analysis/${id}`);
      load();
    } finally {
      setRunningAI(false);
    }
  }

  async function runFraudScan() {
    setFraudScanning(true);
    try {
      const res = await api.post(`/ai/fraud-scan/${id}`);
      setFraudResult(res.data);
      setFraudFlags(res.data.flags || []);
    } finally {
      setFraudScanning(false);
    }
  }

  function openRecord(record) {
    if (record.is_file) {
      setFilePreview({
        url: `${API_BASE}/vault/records/${id}/${record.id}/file`,
        title: record.title,
        file_name: record.file_name,
      });
    } else {
      api.get(`/vault/records/${id}/${record.id}/decrypt`).then(res => setDecryptedRecord(res.data));
    }
  }

  function openRxFile(rx) {
    setFilePreview({
      url: `${API_BASE}/prescriptions/${id}/${rx.id}/file`,
      title: rx.drug_name,
      file_name: rx.file_name,
    });
  }

  async function uploadRxPdf(e) {
    e.preventDefault();
    if (!rxFile) return;
    setUploadingRxPdf(true);
    try {
      const fd = new FormData();
      fd.append('drug_name', rxFileName);
      fd.append('file', rxFile);
      const res = await api.post(`/prescriptions/upload-pdf/${id}`, fd);
      setRxFile(null);
      setRxFileName('');
      setShowRxPdfForm(false);
      await load();
      pollRxExtraction(res.data.id);  // AI reads the PDF in the background
    } finally {
      setUploadingRxPdf(false);
    }
  }

  // Poll until the AI has extracted medications from the uploaded prescription PDF
  function pollRxExtraction(rxId) {
    setRxParsing(true);
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      try {
        const res = await api.get(`/prescriptions/list/${id}`);
        setPrescriptions(res.data);
        const target = res.data.find(x => x.id === rxId);
        if ((target && target.extracted_meds) || tries >= 20) {
          clearInterval(timer);
          setRxParsing(false);
          load();
        }
      } catch {
        if (tries >= 20) { clearInterval(timer); setRxParsing(false); }
      }
    }, 6000);
  }

  function copyCode() {
    if (patient?.patient_code) {
      navigator.clipboard.writeText(patient.patient_code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1500);
    }
  }

  async function addPrescription(e) {
    e.preventDefault();
    setAddingRx(true);
    try {
      await api.post(`/prescriptions/add/${id}`, newRx);
      setNewRx({ drug_name: '', dosage: '', frequency: '', duration: '', notes: '' });
      setShowRxForm(false);
      await load();           // show the new prescription immediately
      pollClinicalAlerts();   // AI safety check runs in the background — poll for results
    } finally {
      setAddingRx(false);
    }
  }

  // Poll for clinical alerts after a prescription is added (AI runs async on the server)
  function pollClinicalAlerts() {
    setAiAnalyzing(true);
    const before = clinicalAlerts.length;
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      try {
        const res = await api.get(`/ai/clinical-alerts/${id}`);
        setClinicalAlerts(res.data);
        if (res.data.length !== before || tries >= 15) {
          clearInterval(timer);
          setAiAnalyzing(false);
          load();
        }
      } catch {
        if (tries >= 15) { clearInterval(timer); setAiAnalyzing(false); }
      }
    }, 6000);
  }

  async function uploadRecord(e) {
    e.preventDefault();
    setUploadingRecord(true);
    try {
      if (recordFile) {
        const fd = new FormData();
        fd.append('record_type', newRecord.record_type);
        fd.append('title', newRecord.title || recordFile.name);
        fd.append('file', recordFile);
        await api.post(`/vault/upload-file/${id}`, fd);
      } else {
        await api.post(`/vault/upload/${id}`, newRecord);
      }
      setNewRecord({ record_type: 'allergy', title: '', content: '' });
      setRecordFile(null);
      setShowRecordForm(false);
      load();
    } finally {
      setUploadingRecord(false);
    }
  }

  function logout() { localStorage.clear(); nav('/'); }

  const tabs = [
    { key: 'vault', label: 'Health Vault', icon: FileText },
    { key: 'consent', label: 'Consent', icon: Lock, badge: pendingConsent.length },
    { key: 'fraud', label: 'Fraud Monitor', icon: ShieldAlert, badge: fraudFlags.filter(f => f.severity === 'high').length },
    { key: 'audit', label: 'Audit Log', icon: Activity },
  ];

  // One-time onboarding gate
  if (patient && !patient.onboarded) {
    return (
      <OnboardingModal
        patientId={id}
        initial={patient}
        onComplete={load}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Topbar */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center"><Shield size={16} /></div>
          <span className="font-bold text-sm">VORTEXA</span>
          <span className="text-slate-600 text-sm">/</span>
          <span className="text-slate-300 text-sm">{patient?.name || 'Patient'}</span>
        </div>
        <div className="flex items-center gap-3">
          {patient?.patient_code && (
            <button onClick={copyCode} title="Share this ID with your provider so they can request access"
              className="flex items-center gap-1.5 text-xs bg-blue-500/15 border border-blue-400/25 text-blue-300 px-2.5 py-1 rounded-full hover:bg-blue-500/25">
              <span className="font-mono">{patient.patient_code}</span>
              <Copy size={11} /> {codeCopied ? 'Copied' : ''}
            </button>
          )}
          {patient?.blood_type && <span className="text-xs bg-red-500/15 border border-red-400/20 text-red-300 px-2 py-1 rounded-full">{patient.blood_type}</span>}
          <button onClick={logout} className="flex items-center gap-1.5 text-slate-400 hover:text-white text-xs"><LogOut size={13} /> Sign out</button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* Alert banner */}
        {(clinicalAlerts.filter(a => a.severity === 'high').length > 0 || fraudFlags.filter(f => f.severity === 'high').length > 0) && (
          <div className="bg-red-500/10 border border-red-400/30 rounded-xl p-4 mb-5 flex items-center gap-3">
            <AlertTriangle size={18} className="text-red-400 shrink-0" />
            <p className="text-red-300 text-sm">
              <span className="font-semibold">AI Safety Alert:</span> {clinicalAlerts.filter(a => a.severity === 'high').length} critical drug interaction(s) in your Health Vault and {fraudFlags.filter(f => f.severity === 'high').length} fraud flag(s) detected.
            </p>
            <button onClick={() => setTab('vault')} className="ml-auto text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 px-3 py-1.5 rounded-lg whitespace-nowrap">View</button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-white/5 rounded-xl p-1 mb-6 w-fit">
          {tabs.map(({ key, label, icon: Icon, badge }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition relative ${tab === key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              <Icon size={14} />{label}
              {badge > 0 && <span className="w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center ml-0.5">{badge}</span>}
            </button>
          ))}
        </div>

        {/* VAULT TAB */}
        {tab === 'vault' && (
          <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Prescriptions */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-white text-sm flex items-center gap-2"><FileText size={15} /> Active Prescriptions</h2>
                <div className="flex items-center gap-3">
                  <button onClick={() => { setShowRxForm(v => !v); setShowRxPdfForm(false); }} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                    <Plus size={13} /> Add
                  </button>
                  <button onClick={() => { setShowRxPdfForm(v => !v); setShowRxForm(false); }} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                    <FileDown size={13} /> Upload PDF
                  </button>
                </div>
              </div>

              {showRxPdfForm && (
                <form onSubmit={uploadRxPdf} className="bg-white/5 rounded-lg p-3 mb-4 space-y-2">
                  <input value={rxFileName} onChange={e => setRxFileName(e.target.value)}
                    placeholder="Label (optional, e.g. Cardiology Rx)"
                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
                  <label className="flex items-center gap-2 border border-dashed border-white/15 rounded px-2 py-2 cursor-pointer hover:border-blue-400/50 transition">
                    <FileDown size={14} className="text-slate-400" />
                    <span className="text-xs text-slate-400 truncate">{rxFile ? rxFile.name : 'Choose prescription PDF'}</span>
                    <input type="file" accept="application/pdf,.pdf" className="hidden"
                      onChange={e => setRxFile(e.target.files[0] || null)} />
                  </label>
                  <button type="submit" disabled={uploadingRxPdf || !rxFile} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-1.5 rounded text-xs font-medium">
                    {uploadingRxPdf ? 'Encrypting & Uploading…' : 'Encrypt & Upload Prescription PDF'}
                  </button>
                </form>
              )}

              {showRxForm && (
                <form onSubmit={addPrescription} className="bg-white/5 rounded-lg p-3 mb-4 space-y-2">
                  {[['drug_name','Drug name','Warfarin'],['dosage','Dosage','5mg'],['frequency','Frequency','Once daily'],['duration','Duration','30 days']].map(([k,l,p]) => (
                    <input key={k} value={newRx[k]} onChange={e => setNewRx(n => ({...n,[k]:e.target.value}))}
                      placeholder={`${l} (e.g. ${p})`} required={k==='drug_name'}
                      className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
                  ))}
                  <button type="submit" disabled={addingRx} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-1.5 rounded text-xs font-medium">
                    {addingRx ? 'Adding...' : 'Add & Run AI Safety Check'}
                  </button>
                </form>
              )}

              {aiAnalyzing && (
                <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-400/20 rounded-lg p-2.5 mb-3">
                  <RefreshCw size={13} className="text-blue-400 animate-spin shrink-0" />
                  <p className="text-blue-300 text-xs">AI clinical safety check running on-device (Qwen3)… results appear below shortly.</p>
                </div>
              )}

              <div className="space-y-2">
                {prescriptions.length === 0 && <p className="text-slate-500 text-xs">No prescriptions yet</p>}
                {prescriptions.map(rx => (
                  <div key={rx.id} className="bg-white/3 border border-white/5 rounded-lg p-3">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-white text-sm font-medium truncate">{rx.drug_name}</p>
                          {rx.is_file && <span className="flex items-center gap-1 text-xs bg-red-500/15 border border-red-400/25 text-red-300 px-1.5 py-0.5 rounded shrink-0"><FileText size={9} /> PDF</span>}
                        </div>
                        {!rx.is_file && <p className="text-slate-400 text-xs">{rx.dosage} · {rx.frequency}</p>}
                        <p className="text-slate-500 text-xs">{rx.provider_name} · {rx.date}</p>
                      </div>
                      {rx.is_file ? (
                        <button onClick={() => openRxFile(rx)} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 border border-blue-400/20 rounded px-2 py-1 shrink-0">
                          <Eye size={11} /> View
                        </button>
                      ) : (
                        <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${rx.is_active ? 'bg-green-500/15 border-green-400/20 text-green-400' : 'bg-slate-500/15 border-slate-400/20 text-slate-400'}`}>
                          {rx.is_active ? 'Active' : 'Inactive'}
                        </span>
                      )}
                    </div>

                    {/* AI-extracted medications from the uploaded PDF */}
                    {rx.is_file && rx.extracted_meds && rx.extracted_meds.length > 0 && (
                      <div className="mt-2 border-t border-white/5 pt-2">
                        <p className="text-xs text-blue-300 mb-1.5 flex items-center gap-1"><Zap size={10} /> AI-extracted medications</p>
                        <div className="space-y-1.5">
                          {rx.extracted_meds.map((m, i) => (
                            <div key={i} className="bg-white/3 rounded px-2 py-1.5">
                              <p className="text-white text-xs font-medium">{m.drug}</p>
                              <p className="text-slate-400 text-xs">
                                {[m.dosage, m.frequency, m.days ? `${m.days}${/^\d+$/.test(String(m.days)) ? ' days' : ''}` : null].filter(Boolean).join(' · ')}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {rx.is_file && rxParsing && !rx.extracted_meds && (
                      <p className="text-xs text-blue-300 mt-2 flex items-center gap-1"><RefreshCw size={10} className="animate-spin" /> AI reading prescription…</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Health Records */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-white text-sm flex items-center gap-2"><Lock size={15} /> Encrypted Health Records</h2>
                <button onClick={() => setShowRecordForm(v => !v)} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                  <Plus size={13} /> Upload
                </button>
              </div>

              {showRecordForm && (
                <form onSubmit={uploadRecord} className="bg-white/5 rounded-lg p-3 mb-4 space-y-2">
                  <select value={newRecord.record_type} onChange={e => setNewRecord(n => ({ ...n, record_type: e.target.value }))}
                    style={{ colorScheme: 'dark' }}
                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500">
                    <option value="allergy" className="bg-slate-800 text-white">Allergy</option>
                    <option value="lab_report" className="bg-slate-800 text-white">Lab Report</option>
                    <option value="note" className="bg-slate-800 text-white">Clinical Note</option>
                    <option value="prescription" className="bg-slate-800 text-white">Prescription Document</option>
                  </select>
                  <input value={newRecord.title} onChange={e => setNewRecord(n => ({ ...n, title: e.target.value }))}
                    placeholder="Title (e.g. Penicillin Allergy)" required={!recordFile}
                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
                  {!recordFile && (
                    <textarea value={newRecord.content} onChange={e => setNewRecord(n => ({ ...n, content: e.target.value }))}
                      placeholder="Record details / notes..." rows={3} required={!recordFile}
                      className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 resize-none" />
                  )}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 border-t border-white/10" />
                    <span className="text-slate-500 text-xs">or attach a PDF</span>
                    <div className="flex-1 border-t border-white/10" />
                  </div>
                  <label className="flex items-center gap-2 border border-dashed border-white/15 rounded px-2 py-2 cursor-pointer hover:border-blue-400/50 transition">
                    <FileDown size={14} className="text-slate-400" />
                    <span className="text-xs text-slate-400 truncate">{recordFile ? recordFile.name : 'Choose PDF file (medical record)'}</span>
                    <input type="file" accept="application/pdf,.pdf" className="hidden"
                      onChange={e => setRecordFile(e.target.files[0] || null)} />
                  </label>
                  {recordFile && (
                    <button type="button" onClick={() => setRecordFile(null)} className="text-red-400 text-xs hover:underline">Remove file</button>
                  )}
                  <button type="submit" disabled={uploadingRecord} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-1.5 rounded text-xs font-medium">
                    {uploadingRecord ? 'Encrypting & Uploading...' : recordFile ? 'Encrypt & Upload PDF' : 'Encrypt & Upload'}
                  </button>
                </form>
              )}

              <div className="space-y-2">
                {records.length === 0 && <p className="text-slate-500 text-xs">No records uploaded yet</p>}
                {records.map(rec => (
                  <div key={rec.id} className="flex items-center justify-between bg-white/3 border border-white/5 rounded-lg p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-white text-sm font-medium truncate">{rec.title}</p>
                        {rec.is_file && <span className="flex items-center gap-1 text-xs bg-red-500/15 border border-red-400/25 text-red-300 px-1.5 py-0.5 rounded shrink-0"><FileText size={9} /> PDF</span>}
                      </div>
                      <p className="text-slate-400 text-xs capitalize">{rec.record_type.replace('_', ' ')} · {new Date(rec.created_at).toLocaleDateString()}</p>
                    </div>
                    <button onClick={() => openRecord(rec)} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 border border-blue-400/20 rounded px-2 py-1 shrink-0">
                      <Eye size={11} /> View
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Decrypted record modal */}
            {decryptedRecord && (
              <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setDecryptedRecord(null)}>
                <div className="bg-slate-900 border border-white/15 rounded-2xl p-6 max-w-lg w-full" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="font-semibold text-white">{decryptedRecord.title}</h3>
                    <button onClick={() => setDecryptedRecord(null)} className="text-slate-400 hover:text-white"><XCircle size={18} /></button>
                  </div>
                  <div className="bg-green-500/5 border border-green-400/20 rounded-lg p-4">
                    <p className="text-green-400 text-xs font-mono whitespace-pre-wrap">{decryptedRecord.content}</p>
                  </div>
                  <p className="text-slate-500 text-xs mt-3 text-center">🔓 Decrypted in-session only · Access logged to audit trail</p>
                </div>
              </div>
            )}

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
                  <p className="text-slate-500 text-xs mt-2 text-center">🔓 Decrypted on-device for this session · Access logged to audit trail</p>
                </div>
              </div>
            )}
          </div>

          {/* AI Clinical Safety panel — lives inside the Health Vault */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-white text-sm flex items-center gap-2"><Zap size={15} className="text-blue-400" /> AI Clinical Safety</h2>
              <button onClick={runAIAnalysis} disabled={runningAI || aiAnalyzing}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-medium">
                <RefreshCw size={13} className={runningAI ? 'animate-spin' : ''} /> {runningAI ? 'Analyzing…' : 'Run Analysis'}
              </button>
            </div>
            <p className="text-slate-500 text-xs mb-4">On-device AI (Qwen3) analyzes your prescription history for drug interactions, duplicate medications, allergy conflicts, and medication safety risks. Nothing leaves your network.</p>
            {aiAnalyzing && (
              <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-400/20 rounded-lg p-2.5 mb-3">
                <RefreshCw size={13} className="text-blue-400 animate-spin shrink-0" />
                <p className="text-blue-300 text-xs">Running clinical safety check on-device…</p>
              </div>
            )}
            {clinicalAlerts.length === 0 && !aiAnalyzing && (
              <p className="text-slate-500 text-xs">No clinical alerts. Run analysis to check your current medications.</p>
            )}
            <div className="space-y-3">
              {clinicalAlerts.map(alert => (
                <div key={alert.id} className={`border rounded-xl p-4 ${SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.low}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity] || 'bg-blue-400'}`} />
                    <span className="text-xs font-semibold uppercase tracking-wide">{alert.severity} severity</span>
                    <span className="text-xs opacity-70">· {alert.drug}</span>
                  </div>
                  <p className="text-sm mb-2">{alert.issue}</p>
                  <p className="text-xs opacity-75"><span className="font-semibold">Recommendation:</span> {alert.recommendation}</p>
                </div>
              ))}
            </div>
          </div>
          </div>
        )}

        {/* CONSENT TAB */}
        {tab === 'consent' && (
          <div className="space-y-5">
            {/* Pending */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <h2 className="font-semibold text-white text-sm flex items-center gap-2 mb-4">
                <Clock size={15} className="text-amber-400" /> Pending Access Requests
                {pendingConsent.length > 0 && <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">{pendingConsent.length}</span>}
              </h2>
              {pendingConsent.length === 0 && <p className="text-slate-500 text-xs">No pending requests</p>}
              {pendingConsent.map(item => (
                <div key={item.token_id} className="flex items-center justify-between bg-amber-500/5 border border-amber-400/20 rounded-lg p-4 mb-2">
                  <div>
                    <p className="text-white text-sm font-medium">{item.provider_name}</p>
                    <p className="text-slate-400 text-xs capitalize">{item.provider_type} · Scope: {item.access_scope}</p>
                    <p className="text-slate-500 text-xs">Requested: {new Date(item.requested_at).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setSigModal(item)}
                      className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-2 rounded-lg font-medium">
                      <Shield size={12} /> Sign & Authorize
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Granted */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <h2 className="font-semibold text-white text-sm flex items-center gap-2 mb-4">
                <CheckCircle size={15} className="text-green-400" /> Granted Access
              </h2>
              {grantedConsent.length === 0 && <p className="text-slate-500 text-xs">No active grants</p>}
              {grantedConsent.map(item => (
                <div key={item.token_id} className="flex items-center justify-between bg-green-500/5 border border-green-400/20 rounded-lg p-4 mb-2">
                  <div>
                    <p className="text-white text-sm font-medium">{item.provider_name}</p>
                    <p className="text-slate-400 text-xs capitalize">{item.provider_type} · Scope: {item.access_scope}</p>
                    <p className="text-slate-500 text-xs">Expires: {item.expires_at ? new Date(item.expires_at).toLocaleString() : 'N/A'}</p>
                  </div>
                  <button onClick={() => revokeConsent(item.token_id)}
                    className="flex items-center gap-1 text-red-400 hover:text-red-300 border border-red-400/20 text-xs px-3 py-2 rounded-lg">
                    <XCircle size={12} /> Revoke
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FRAUD MONITOR TAB */}
        {tab === 'fraud' && (() => {
          // Derive a status if a scan hasn't been run this session but stored flags exist
          const derivedStatus = fraudResult?.status ||
            (fraudFlags.some(f => f.severity === 'high') ? 'red'
              : fraudFlags.some(f => f.severity === 'medium') ? 'yellow'
              : (fraudFlags.length > 0 ? 'yellow' : null));

          const STATUS = {
            green: { ring: 'border-green-400/40 bg-green-500/10', dot: 'bg-green-400', text: 'text-green-300', label: 'ALL CLEAR', icon: CheckCircle,
              fallback: 'No suspicious activity detected. Your prescription history looks consistent — no duplicate controlled substances, multi-provider overlaps, or abnormal patterns.' },
            yellow: { ring: 'border-amber-400/40 bg-amber-500/10', dot: 'bg-amber-400', text: 'text-amber-300', label: 'CAUTION', icon: AlertTriangle,
              fallback: 'Some patterns warrant attention. Review the flagged items below.' },
            red: { ring: 'border-red-400/40 bg-red-500/10', dot: 'bg-red-400', text: 'text-red-300', label: 'HIGH RISK', icon: ShieldAlert,
              fallback: 'High-risk patterns detected. Review the flagged items below immediately.' },
          };
          const s = derivedStatus ? STATUS[derivedStatus] : null;

          return (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-white text-sm flex items-center gap-2"><ShieldAlert size={15} className="text-amber-400" /> Prescription Fraud Monitor</h2>
                <p className="text-slate-500 text-xs mt-0.5">On-device AI scans Active Prescriptions and Health Records for suspicious activity, unusual patterns, repeated requests, and insurance anomalies.</p>
              </div>
              <button onClick={runFraudScan} disabled={fraudScanning}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium shrink-0">
                <RefreshCw size={14} className={fraudScanning ? 'animate-spin' : ''} />
                {fraudScanning ? 'Scanning…' : 'Run Fraud Analysis'}
              </button>
            </div>

            {/* Traffic-light safety status */}
            {fraudScanning && !s && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-6 flex items-center gap-3">
                <RefreshCw size={18} className="text-blue-400 animate-spin" />
                <p className="text-slate-300 text-sm">Running privacy-preserving fraud scan on-device (Qwen3)…</p>
              </div>
            )}

            {s && (
              <div className={`border rounded-xl p-5 ${s.ring}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    {['green','yellow','red'].map(c => (
                      <div key={c} className={`w-3.5 h-3.5 rounded-full ${derivedStatus === c ? STATUS[c].dot : 'bg-white/10'}`} />
                    ))}
                  </div>
                  <s.icon size={18} className={s.text} />
                  <span className={`text-sm font-bold tracking-wide ${s.text}`}>{s.label}</span>
                  {fraudResult?.checked && (
                    <span className="text-slate-500 text-xs ml-auto">Checked {fraudResult.checked.prescriptions} prescription(s) · {fraudResult.checked.records} record(s)</span>
                  )}
                </div>
                <p className="text-sm text-slate-200">{fraudResult?.summary || s.fallback}</p>
              </div>
            )}

            {!s && !fraudScanning && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center">
                <ShieldAlert size={28} className="mx-auto text-slate-600 mb-3" />
                <p className="text-slate-400 text-sm">Run a fraud analysis to get a safety status.</p>
                <p className="text-slate-600 text-xs mt-1">The scan reads your prescriptions and health records — nothing leaves your device.</p>
              </div>
            )}

            {/* Detailed flags */}
            {fraudFlags.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                <h3 className="font-semibold text-white text-sm mb-3">Flagged Items</h3>
                {fraudFlags.map((flag, i) => (
                  <div key={flag.id || i} className={`border rounded-xl p-4 mb-3 last:mb-0 ${SEVERITY_COLORS[flag.severity] || SEVERITY_COLORS.low}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-2 h-2 rounded-full ${SEVERITY_DOT[flag.severity] || 'bg-blue-400'}`} />
                      <span className="text-xs font-semibold uppercase tracking-wide">{flag.severity} risk</span>
                      {flag.risk_score && <span className="text-xs opacity-70">· Risk Score: {flag.risk_score}/10</span>}
                    </div>
                    <p className="text-sm font-medium mb-1">{flag.pattern}</p>
                    <p className="text-xs opacity-80">{flag.details}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          );
        })()}

        {/* AUDIT TAB */}
        {tab === 'audit' && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <h2 className="font-semibold text-white text-sm flex items-center gap-2 mb-4">
              <Activity size={15} /> Audit Trail
            </h2>
            {auditLog.length === 0 && <p className="text-slate-500 text-xs">No activity logged yet</p>}
            <div className="space-y-1">
              {auditLog.map(log => (
                <div key={log.id} className="flex items-start gap-3 py-2.5 border-b border-white/5 last:border-0">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                    log.action.includes('GRANTED') ? 'bg-green-400' :
                    log.action.includes('REVOKED') ? 'bg-red-400' :
                    log.action.includes('REQUESTED') ? 'bg-amber-400' :
                    log.action.includes('ACCESS') ? 'bg-blue-400' : 'bg-slate-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white text-xs font-medium">{log.action.replace(/_/g, ' ')}</span>
                      {log.provider_name && <span className="text-slate-500 text-xs">· {log.provider_name}</span>}
                    </div>
                    {log.detail && <p className="text-slate-400 text-xs mt-0.5 truncate">{log.detail}</p>}
                  </div>
                  <span className="text-slate-600 text-xs shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Signature modal */}
      {sigModal && (
        <SignatureModal
          token={sigModal.token}
          onSigned={(sig) => signConsent(sigModal, sig)}
          onClose={() => setSigModal(null)}
        />
      )}
    </div>
  );
}
