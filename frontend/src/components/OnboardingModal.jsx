import { useState } from 'react';
import { Shield, HeartPulse } from 'lucide-react';
import api from '../api';

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
    <div className="fixed inset-0 bg-slate-950/90 flex items-center justify-center z-50 p-4 overflow-auto">
      <div className="w-full max-w-md my-8">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-3">
            <HeartPulse size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">Complete Your Health Profile</h1>
          <p className="text-slate-400 text-sm mt-1">This is a one-time setup so your care team has the essentials.</p>
        </div>

        <form onSubmit={submit} className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Full Name</label>
            <input value={form.name} onChange={set('name')} required
              className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Email</label>
            <input value={form.email} onChange={set('email')} type="email" required
              className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Contact Number</label>
            <input value={form.contact} onChange={set('contact')} placeholder="+1-555-0100" required
              className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Blood Group</label>
              <select value={form.blood_type} onChange={set('blood_type')} required style={{ colorScheme: 'dark' }}
                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="" className="bg-slate-800">Select...</option>
                {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(t => <option key={t} value={t} className="bg-slate-800 text-white">{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Diabetic Status</label>
              <select value={form.diabetic} onChange={set('diabetic')} required style={{ colorScheme: 'dark' }}
                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="" className="bg-slate-800">Select...</option>
                <option value="diabetic" className="bg-slate-800 text-white">Diabetic</option>
                <option value="non-diabetic" className="bg-slate-800 text-white">Non-diabetic</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Underlying / Chronic Health Issues</label>
            <textarea value={form.chronic_conditions} onChange={set('chronic_conditions')} rows={3}
              placeholder="e.g. Hypertension, asthma, thyroid… (write 'None' if not applicable)"
              className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500 resize-none" />
          </div>
          <button type="submit" disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium text-sm transition">
            {saving ? 'Saving…' : 'Complete Setup & Enter Vault'}
          </button>
          <p className="text-center text-xs text-slate-500 flex items-center justify-center gap-1">
            <Shield size={11} /> Stored encrypted in your patient-owned vault
          </p>
        </form>
      </div>
    </div>
  );
}
