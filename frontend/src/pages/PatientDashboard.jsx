import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Shield, Activity, FileText, Lock, AlertTriangle, CheckCircle, Clock, Zap, Eye, Plus, RefreshCw, XCircle, FileDown, ExternalLink, Copy, Star } from 'lucide-react';
import api, { API_BASE } from '../api';
import SignatureModal from '../components/SignatureModal';
import OnboardingModal from '../components/OnboardingModal';
import GuardianPanel from '../components/GuardianPanel';
import Sidebar from '../components/Sidebar';
import { useT } from '../i18n';

const inputCls = "w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500";

export default function PatientDashboard() {
  const { id } = useParams();
  const nav = useNavigate();

  const [tab, setTab] = useState('guardian');
  const [guardianReport, setGuardianReport] = useState(null);
  const [guardianRunning, setGuardianRunning] = useState(false);
  const [prescriptions, setPrescriptions] = useState([]);
  const [records, setRecords] = useState([]);
  const [pendingConsent, setPendingConsent] = useState([]);
  const [grantedConsent, setGrantedConsent] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [patient, setPatient] = useState(null);
  const [sigModal, setSigModal] = useState(null);
  const [decryptedRecord, setDecryptedRecord] = useState(null);
  const [newRx, setNewRx] = useState({ drug_name: '', dosage: '', frequency: '', duration: '', notes: '' });
  const [addingRx, setAddingRx] = useState(false);
  const [showRxForm, setShowRxForm] = useState(false);
  const [newRecord, setNewRecord] = useState({ record_type: 'allergy', title: '', content: '' });
  const [recordFile, setRecordFile] = useState(null);
  const [uploadingRecord, setUploadingRecord] = useState(false);
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [filePreview, setFilePreview] = useState(null);
  const [rxFile, setRxFile] = useState(null);
  const [rxFileName, setRxFileName] = useState('');
  const [showRxPdfForm, setShowRxPdfForm] = useState(false);
  const [uploadingRxPdf, setUploadingRxPdf] = useState(false);
  const [rxParsing, setRxParsing] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const { t } = useT();

  // Identity guard — a patient may only view their OWN vault (core sovereignty rule)
  useEffect(() => {
    if (!id) return;
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    if (!u.id || u.role !== 'patient' || String(u.id) !== String(id)) {
      localStorage.clear();
      nav('/login?role=patient');
    }
  }, [id, nav]);

  const load = useCallback(async () => {
    try {
      const [pRes, rxRes, recRes, pendRes, grantRes, logRes, gRes] = await Promise.all([
        api.get(`/patients/${id}`),
        api.get(`/prescriptions/list/${id}`),
        api.get(`/vault/records/${id}`),
        api.get(`/consent/pending/${id}`),
        api.get(`/consent/granted/${id}`),
        api.get(`/audit/log/${id}`),
        api.get(`/guardian/report/${id}`),
      ]);
      setPatient(pRes.data);
      setPrescriptions(rxRes.data);
      setRecords(recRes.data);
      setPendingConsent(pendRes.data);
      setGrantedConsent(grantRes.data);
      setAuditLog(logRes.data);
      setGuardianReport(gRes.data);
    } catch (err) {
      if (err.response?.status === 401) { localStorage.clear(); nav('/login'); }
    }
  }, [id, nav]);

  useEffect(() => { load(); }, [load]);

  async function signConsent(tokenItem, signature) {
    try {
      await api.post('/consent/sign', { token_id: tokenItem.token_id, signature });
      setSigModal(null);
      load();
    } catch (err) {
      alert(err.response?.data?.detail || 'Signature verification failed — make sure you are using the correct private key for this account');
    }
  }

  async function revokeConsent(token_id) {
    await api.post('/consent/revoke', { token_id });
    load();
  }

  function pollGuardianRefresh() {
    const prevAt = guardianReport?.generated_at;
    setGuardianRunning(true);
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      try {
        const res = await api.get(`/guardian/report/${id}`);
        if (res.data && res.data.generated_at !== prevAt) {
          setGuardianReport(res.data);
          clearInterval(timer);
          setGuardianRunning(false);
        } else if (tries >= 25) {
          clearInterval(timer);
          setGuardianRunning(false);
        }
      } catch {
        if (tries >= 25) { clearInterval(timer); setGuardianRunning(false); }
      }
    }, 5000);
  }

  function runGuardian() {
    api.post(`/guardian/run/${id}`).catch(() => {});
    pollGuardianRefresh();
  }

  function openRecord(record) {
    if (record.is_file) {
      setFilePreview({ url: `${API_BASE}/vault/records/${id}/${record.id}/file`, title: record.title, file_name: record.file_name });
    } else {
      api.get(`/vault/records/${id}/${record.id}/decrypt`).then(res => setDecryptedRecord(res.data));
    }
  }

  function openRxFile(rx) {
    setFilePreview({ url: `${API_BASE}/prescriptions/${id}/${rx.id}/file`, title: rx.drug_name, file_name: rx.file_name });
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
      pollRxExtraction(res.data.id);
      pollGuardianRefresh();
    } finally {
      setUploadingRxPdf(false);
    }
  }

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
      await load();
      pollGuardianRefresh();
    } finally {
      setAddingRx(false);
    }
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
    { key: 'guardian', label: t.tabGuardian, icon: Shield },
    { key: 'vault', label: t.tabVault, icon: FileText },
    { key: 'consent', label: t.tabConsent, icon: Lock, badge: pendingConsent.length },
    { key: 'audit', label: t.tabAudit, icon: Activity },
  ];

  if (patient && !patient.onboarded) {
    return <OnboardingModal patientId={id} initial={patient} onComplete={load} />;
  }

  const allergyCount = records.filter(r => r.record_type === 'allergy').length;
  const initials = (patient?.name || 'P').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const InfoCard = ({ label, children }) => (
    <div className="px-4 border-l border-gray-200 first:border-l-0 first:pl-0">
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <div className="text-sm text-gray-900 font-medium">{children}</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex text-gray-900">
      <Sidebar items={tabs} active={tab} onSelect={setTab} onLogout={logout} />

      <main className="flex-1 min-w-0">
        {/* Patient header */}
        <div className="bg-white border-b border-gray-200 px-6 py-5">
          <div className="max-w-6xl flex flex-wrap items-center gap-x-6 gap-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-semibold">{initials}</div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="text-lg font-semibold text-gray-900">{patient?.name || 'Patient'}</h1>
                  <Star size={14} className="text-amber-400 fill-amber-400" />
                </div>
                <p className="text-xs text-gray-500">{patient?.dob && `DOB ${patient.dob} · `}{patient?.contact}</p>
              </div>
            </div>

            <div className="flex items-center ml-auto flex-wrap gap-y-3">
              <InfoCard label="Patient ID">
                <button onClick={copyCode} className="flex items-center gap-1.5 text-emerald-700 font-mono hover:text-emerald-800">
                  {patient?.patient_code} <Copy size={12} /> {codeCopied && <span className="text-xs text-emerald-600">copied</span>}
                </button>
              </InfoCard>
              <InfoCard label="Blood Type">
                <span className="text-red-600">{patient?.blood_type || '—'}</span>
              </InfoCard>
              <InfoCard label="Diabetic Status"><span className="capitalize">{patient?.diabetic || '—'}</span></InfoCard>
              <InfoCard label="Allergies">{allergyCount > 0 ? `${allergyCount} on file` : 'None'}</InfoCard>
              {guardianReport && (
                <InfoCard label="Integrity Score">
                  <span className={guardianReport.status === 'red' ? 'text-red-600' : guardianReport.status === 'yellow' ? 'text-amber-600' : 'text-emerald-600'}>
                    {guardianReport.integrity_score}/100
                  </span>
                </InfoCard>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-6 max-w-6xl">
          {/* Guardian risk banner */}
          {guardianReport && guardianReport.status === 'red' && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 flex items-center gap-3">
              <AlertTriangle size={18} className="text-red-500 shrink-0" />
              <p className="text-red-700 text-sm">
                <span className="font-semibold">Guardian: At risk (score {guardianReport.integrity_score}).</span> {guardianReport.sections.recommendations[0]?.text}
              </p>
              <button onClick={() => setTab('guardian')} className="ml-auto text-xs bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-lg whitespace-nowrap font-medium">Open Guardian</button>
            </div>
          )}

          {/* GUARDIAN TAB */}
          {tab === 'guardian' && (
            <GuardianPanel report={guardianReport} running={guardianRunning} onRun={runGuardian} />
          )}

          {/* VAULT TAB */}
          {tab === 'vault' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Prescriptions */}
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><FileText size={15} className="text-emerald-600" /> Active Prescriptions</h2>
                  <div className="flex items-center gap-3">
                    <button onClick={() => { setShowRxForm(v => !v); setShowRxPdfForm(false); }} className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium"><Plus size={13} /> Add</button>
                    <button onClick={() => { setShowRxPdfForm(v => !v); setShowRxForm(false); }} className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium"><FileDown size={13} /> Upload PDF</button>
                  </div>
                </div>

                {showRxPdfForm && (
                  <form onSubmit={uploadRxPdf} className="bg-gray-50 border border-gray-100 rounded-lg p-3 mb-4 space-y-2">
                    <input value={rxFileName} onChange={e => setRxFileName(e.target.value)} placeholder="Label (optional, e.g. Cardiology Rx)" className={inputCls} />
                    <label className="flex items-center gap-2 border border-dashed border-gray-300 rounded-lg px-3 py-2.5 cursor-pointer hover:border-emerald-400 transition bg-white">
                      <FileDown size={14} className="text-gray-400" />
                      <span className="text-xs text-gray-500 truncate">{rxFile ? rxFile.name : 'Choose prescription PDF'}</span>
                      <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={e => setRxFile(e.target.files[0] || null)} />
                    </label>
                    <button type="submit" disabled={uploadingRxPdf || !rxFile} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2 rounded-lg text-xs font-medium">
                      {uploadingRxPdf ? 'Encrypting & Uploading…' : 'Encrypt & Upload Prescription PDF'}
                    </button>
                  </form>
                )}

                {showRxForm && (
                  <form onSubmit={addPrescription} className="bg-gray-50 border border-gray-100 rounded-lg p-3 mb-4 space-y-2">
                    {[['drug_name', 'Drug name', 'Warfarin'], ['dosage', 'Dosage', '5mg'], ['frequency', 'Frequency', 'Once daily'], ['duration', 'Duration', '30 days']].map(([k, l, p]) => (
                      <input key={k} value={newRx[k]} onChange={e => setNewRx(n => ({ ...n, [k]: e.target.value }))} placeholder={`${l} (e.g. ${p})`} required={k === 'drug_name'} className={inputCls} />
                    ))}
                    <button type="submit" disabled={addingRx} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2 rounded-lg text-xs font-medium">
                      {addingRx ? 'Adding…' : 'Add & re-score with Guardian'}
                    </button>
                  </form>
                )}

                {guardianRunning && (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 mb-3">
                    <RefreshCw size={13} className="text-emerald-600 animate-spin shrink-0" />
                    <p className="text-emerald-700 text-xs">Guardian is re-scoring on-device — open the Guardian tab to watch the score move.</p>
                  </div>
                )}

                <div className="space-y-2">
                  {prescriptions.length === 0 && <p className="text-gray-400 text-xs">No prescriptions yet</p>}
                  {prescriptions.map(rx => (
                    <div key={rx.id} className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-gray-900 text-sm font-medium truncate">{rx.drug_name}</p>
                            {rx.is_file && <span className="flex items-center gap-1 text-xs bg-red-50 border border-red-200 text-red-600 px-1.5 py-0.5 rounded shrink-0"><FileText size={9} /> PDF</span>}
                          </div>
                          {!rx.is_file && <p className="text-gray-500 text-xs">{rx.dosage} · {rx.frequency}</p>}
                          <p className="text-gray-400 text-xs">{rx.provider_name} · {rx.date}</p>
                        </div>
                        {rx.is_file ? (
                          <button onClick={() => openRxFile(rx)} className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 border border-emerald-200 rounded px-2 py-1 shrink-0"><Eye size={11} /> View</button>
                        ) : (
                          <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${rx.is_active ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-gray-100 border-gray-200 text-gray-400'}`}>{rx.is_active ? 'Active' : 'Inactive'}</span>
                        )}
                      </div>
                      {rx.is_file && rx.extracted_meds && rx.extracted_meds.length > 0 && (
                        <div className="mt-2 border-t border-gray-200 pt-2">
                          <p className="text-xs text-emerald-700 mb-1.5 flex items-center gap-1"><Zap size={10} /> AI-extracted medications</p>
                          <div className="space-y-1.5">
                            {rx.extracted_meds.map((m, i) => (
                              <div key={i} className="bg-white border border-gray-100 rounded px-2 py-1.5">
                                <p className="text-gray-900 text-xs font-medium">{m.drug}</p>
                                <p className="text-gray-500 text-xs">{[m.dosage, m.frequency, m.days ? `${m.days}${/^\d+$/.test(String(m.days)) ? ' days' : ''}` : null].filter(Boolean).join(' · ')}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {rx.is_file && rxParsing && !rx.extracted_meds && (
                        <p className="text-xs text-emerald-700 mt-2 flex items-center gap-1"><RefreshCw size={10} className="animate-spin" /> AI reading prescription…</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Health Records */}
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><Lock size={15} className="text-emerald-600" /> Encrypted Health Records</h2>
                  <button onClick={() => setShowRecordForm(v => !v)} className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium"><Plus size={13} /> Upload</button>
                </div>

                {showRecordForm && (
                  <form onSubmit={uploadRecord} className="bg-gray-50 border border-gray-100 rounded-lg p-3 mb-4 space-y-2">
                    <select value={newRecord.record_type} onChange={e => setNewRecord(n => ({ ...n, record_type: e.target.value }))} className={inputCls}>
                      <option value="allergy">Allergy</option>
                      <option value="lab_report">Lab Report</option>
                      <option value="note">Clinical Note</option>
                      <option value="prescription">Prescription Document</option>
                    </select>
                    <input value={newRecord.title} onChange={e => setNewRecord(n => ({ ...n, title: e.target.value }))} placeholder="Title (e.g. Penicillin Allergy)" required={!recordFile} className={inputCls} />
                    {!recordFile && (
                      <textarea value={newRecord.content} onChange={e => setNewRecord(n => ({ ...n, content: e.target.value }))} placeholder="Record details / notes..." rows={3} required={!recordFile} className={`${inputCls} resize-none`} />
                    )}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 border-t border-gray-200" /><span className="text-gray-400 text-xs">or attach a PDF</span><div className="flex-1 border-t border-gray-200" />
                    </div>
                    <label className="flex items-center gap-2 border border-dashed border-gray-300 rounded-lg px-3 py-2.5 cursor-pointer hover:border-emerald-400 transition bg-white">
                      <FileDown size={14} className="text-gray-400" />
                      <span className="text-xs text-gray-500 truncate">{recordFile ? recordFile.name : 'Choose PDF file (medical record)'}</span>
                      <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={e => setRecordFile(e.target.files[0] || null)} />
                    </label>
                    {recordFile && <button type="button" onClick={() => setRecordFile(null)} className="text-red-500 text-xs hover:underline">Remove file</button>}
                    <button type="submit" disabled={uploadingRecord} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2 rounded-lg text-xs font-medium">
                      {uploadingRecord ? 'Encrypting & Uploading...' : recordFile ? 'Encrypt & Upload PDF' : 'Encrypt & Upload'}
                    </button>
                  </form>
                )}

                <div className="space-y-2">
                  {records.length === 0 && <p className="text-gray-400 text-xs">No records uploaded yet</p>}
                  {records.map(rec => (
                    <div key={rec.id} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg p-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-gray-900 text-sm font-medium truncate">{rec.title}</p>
                          {rec.is_file && <span className="flex items-center gap-1 text-xs bg-red-50 border border-red-200 text-red-600 px-1.5 py-0.5 rounded shrink-0"><FileText size={9} /> PDF</span>}
                        </div>
                        <p className="text-gray-400 text-xs capitalize">{rec.record_type.replace('_', ' ')} · {new Date(rec.created_at).toLocaleDateString()}</p>
                      </div>
                      <button onClick={() => openRecord(rec)} className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 border border-emerald-200 rounded px-2 py-1 shrink-0"><Eye size={11} /> View</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* CONSENT TAB */}
          {tab === 'consent' && (
            <div className="space-y-5">
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
                <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2 mb-4">
                  <Clock size={15} className="text-amber-500" /> Pending Access Requests
                  {pendingConsent.length > 0 && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{pendingConsent.length}</span>}
                </h2>
                {pendingConsent.length === 0 && <p className="text-gray-400 text-xs">No pending requests</p>}
                {pendingConsent.map(item => (
                  <div key={item.token_id} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg p-4 mb-2">
                    <div>
                      <p className="text-gray-900 text-sm font-medium">{item.provider_name}</p>
                      <p className="text-gray-500 text-xs capitalize">{item.provider_type} · Scope: {item.access_scope}</p>
                      <p className="text-gray-400 text-xs">Requested: {new Date(item.requested_at).toLocaleString()}</p>
                    </div>
                    <button onClick={() => setSigModal(item)} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-2 rounded-lg font-medium"><Shield size={12} /> Sign & Authorize</button>
                  </div>
                ))}
              </div>

              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
                <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2 mb-4"><CheckCircle size={15} className="text-emerald-600" /> Granted Access</h2>
                {grantedConsent.length === 0 && <p className="text-gray-400 text-xs">No active grants</p>}
                {grantedConsent.map(item => (
                  <div key={item.token_id} className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-2">
                    <div>
                      <p className="text-gray-900 text-sm font-medium">{item.provider_name}</p>
                      <p className="text-gray-500 text-xs capitalize">{item.provider_type} · Scope: {item.access_scope}</p>
                      <p className="text-gray-400 text-xs">Expires: {item.expires_at ? new Date(item.expires_at).toLocaleString() : 'N/A'}</p>
                    </div>
                    <button onClick={() => revokeConsent(item.token_id)} className="flex items-center gap-1 text-red-600 hover:text-red-700 border border-red-200 text-xs px-3 py-2 rounded-lg"><XCircle size={12} /> Revoke</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AUDIT TAB */}
          {tab === 'audit' && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2 mb-4"><Activity size={15} className="text-emerald-600" /> Audit Trail</h2>
              {auditLog.length === 0 && <p className="text-gray-400 text-xs">No activity logged yet</p>}
              <div className="space-y-1">
                {auditLog.map(log => (
                  <div key={log.id} className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-0">
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${log.action.includes('GRANTED') ? 'bg-emerald-500' : log.action.includes('REVOKED') ? 'bg-red-500' : log.action.includes('REQUESTED') ? 'bg-amber-500' : log.action.includes('ACCESS') ? 'bg-blue-500' : 'bg-gray-300'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-900 text-xs font-medium">{log.action.replace(/_/g, ' ')}</span>
                        {log.provider_name && <span className="text-gray-400 text-xs">· {log.provider_name}</span>}
                      </div>
                      {log.detail && <p className="text-gray-500 text-xs mt-0.5 truncate">{log.detail}</p>}
                    </div>
                    <span className="text-gray-400 text-xs shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Decrypted record modal */}
      {decryptedRecord && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDecryptedRecord(null)}>
          <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-lg w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-gray-900">{decryptedRecord.title}</h3>
              <button onClick={() => setDecryptedRecord(null)} className="text-gray-400 hover:text-gray-700"><XCircle size={18} /></button>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <p className="text-emerald-800 text-xs font-mono whitespace-pre-wrap">{decryptedRecord.content}</p>
            </div>
            <p className="text-gray-400 text-xs mt-3 text-center">Decrypted in-session only · Access logged to audit trail</p>
          </div>
        </div>
      )}

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
            <p className="text-gray-400 text-xs mt-2 text-center">Decrypted on-device for this session · Access logged to audit trail</p>
          </div>
        </div>
      )}

      {sigModal && (
        <SignatureModal token={sigModal.token} onSigned={(sig) => signConsent(sigModal, sig)} onClose={() => setSigModal(null)} />
      )}
    </div>
  );
}
