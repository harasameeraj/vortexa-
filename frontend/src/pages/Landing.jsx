import { useNavigate } from 'react-router-dom';
import { Shield, Brain, Lock, FileText, Activity } from 'lucide-react';

export default function Landing() {
  const nav = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-500 rounded-lg flex items-center justify-center">
            <Shield size={20} />
          </div>
          <span className="text-xl font-bold tracking-tight">VORTEXA</span>
        </div>
        <div className="flex gap-3">
          <button onClick={() => nav('/login')} className="px-4 py-2 text-sm text-blue-300 border border-blue-400/30 rounded-lg hover:bg-blue-400/10 transition">
            Sign In
          </button>
          <button onClick={() => nav('/register')} className="px-4 py-2 text-sm bg-blue-600 rounded-lg hover:bg-blue-500 transition">
            Get Started
          </button>
        </div>
      </header>

      {/* Hero */}
      <main className="max-w-5xl mx-auto px-8 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-500/15 border border-blue-400/30 text-blue-300 text-xs font-medium px-3 py-1.5 rounded-full mb-6">
          <Shield size={12} /> Patient-Sovereign · Signature-Verified · AI-Powered
        </div>
        <h1 className="text-5xl md:text-6xl font-bold leading-tight mb-6 text-white" style={{letterSpacing: '-1px'}}>
          Your Health Data.<br />
          <span className="text-blue-400">Your Signature.</span><br />
          Your Control.
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10">
          VORTEXA is a cryptographically-secured prescription intelligence network where patients own their medical data and every access requires your digital signature.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <button onClick={() => nav('/login?role=patient')} className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold transition text-white">
            Patient Portal →
          </button>
          <button onClick={() => nav('/login?role=provider')} className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-semibold transition border border-white/20">
            Provider / Pharmacy Portal →
          </button>
        </div>

        {/* Demo credentials */}
        <div className="mt-8 inline-block bg-white/5 border border-white/10 rounded-xl px-6 py-4 text-left text-sm">
          <p className="text-slate-400 font-medium mb-2">Demo Credentials (password: <code className="text-blue-300">demo123</code>)</p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-slate-300">
            <span>Patient: <span className="text-blue-300">alice@demo.com</span></span>
            <span>Hospital: <span className="text-blue-300">hospital@demo.com</span></span>
            <span>Patient: <span className="text-blue-300">bob@demo.com</span></span>
            <span>Pharmacy: <span className="text-blue-300">pharmacy@demo.com</span></span>
          </div>
        </div>
      </main>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-8 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: Lock, title: 'RSA-Signed Consent', desc: 'Every access is authorized by your cryptographic signature. No signature = no access.' },
            { icon: Shield, title: 'Encrypted Health Vault', desc: 'Your prescriptions, allergies, and lab reports are AES-GCM encrypted at rest.' },
            { icon: Brain, title: 'AI Clinical Safety', desc: 'GPT-4o analyzes your medication profile for dangerous drug interactions and allergy conflicts.' },
            { icon: Activity, title: 'Fraud Detection', desc: 'AI identifies suspicious prescription patterns, duplicate controlled substances, and anomalies.' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-white/5 border border-white/10 rounded-xl p-5 hover:bg-white/8 transition">
              <div className="w-9 h-9 bg-blue-600/30 rounded-lg flex items-center justify-center mb-3">
                <Icon size={18} className="text-blue-400" />
              </div>
              <h3 className="font-semibold text-white mb-1.5 text-sm">{title}</h3>
              <p className="text-slate-400 text-xs leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
