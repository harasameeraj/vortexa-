import { useState } from 'react';
import { Shield, HeartPulse } from 'lucide-react';
import api from '../api';

const inputCls = "w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500";

export default function OnboardingModal({ patientId, initial, onComplete }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    email: initial?.email || '',
    contact: initial?.contact || '',
    blood_type: initial?.blood_type || '',
    diabetic: initial?.diabetic || '',
    chronic_conditions: initial?.chronic_conditions || '',
  });
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/patients/${patientId}/onboard`, form);
      onComplete();
    } finally {
      setSaving(false);
    }
  }

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 overflow-auto">
      <div className="w-full max-w-md my-8">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-3">
            <HeartPulse size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Complete Your Health Profile</h1>
          <p className="text-gray-500 text-sm mt-1">This is a one-time setup so your care team has the essentials.</p>
        </div>

        <form onSubmit={submit} className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4 shadow-sm">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Full Name</label>
            <input value={form.name} onChange={set('name')} required className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Email</label>
            <input value={form.email} onChange={set('email')} type="email" required className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Contact Number</label>
            <input value={form.contact} onChange={set('contact')} placeholder="+1-555-0100" required className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Blood Group</label>
              <select value={form.blood_type} onChange={set('blood_type')} required className={inputCls}>
                <option value="">Select...</option>
                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Diabetic Status</label>
              <select value={form.diabetic} onChange={set('diabetic')} required className={inputCls}>
                <option value="">Select...</option>
                <option value="diabetic">Diabetic</option>
                <option value="non-diabetic">Non-diabetic</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Underlying / Chronic Health Issues</label>
            <textarea value={form.chronic_conditions} onChange={set('chronic_conditions')} rows={3}
              placeholder="e.g. Hypertension, asthma, thyroid… (write 'None' if not applicable)" className={`${inputCls} resize-none`} />
          </div>
          <button type="submit" disabled={saving} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium text-sm transition">
            {saving ? 'Saving…' : 'Complete Setup & Enter Vault'}
          </button>
          <p className="text-center text-xs text-gray-400 flex items-center justify-center gap-1">
            <Shield size={11} /> Stored encrypted in your patient-owned vault
          </p>
        </form>
      </div>
    </div>
  );
}
