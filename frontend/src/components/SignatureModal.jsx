import { useState } from 'react';
import { Shield, Upload, X } from 'lucide-react';
import forge from 'node-forge';

export default function SignatureModal({ token, onSigned, onClose }) {
  const [keyText, setKeyText] = useState('');
  const [error, setError] = useState('');
  const [signing, setSigning] = useState(false);

  function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => setKeyText(evt.target.result);
    reader.readAsText(file);
  }

  async function sign() {
    if (!keyText.trim()) { setError('Please provide your private key'); return; }
    setSigning(true);
    setError('');
    try {
      const privateKey = forge.pki.privateKeyFromPem(keyText.trim());
      const md = forge.md.sha256.create();
      md.update(token, 'utf8');
      const signature = privateKey.sign(md);
      const signatureB64 = forge.util.encode64(signature);
      onSigned(signatureB64);
    } catch (err) {
      setError('Invalid private key — make sure you uploaded the correct .pem file');
    } finally {
      setSigning(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-white/15 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600/30 rounded-lg flex items-center justify-center">
              <Shield size={18} className="text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">Authorize Access</h3>
              <p className="text-slate-400 text-xs">Sign with your private key</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>

        <div className="bg-blue-500/10 border border-blue-400/20 rounded-lg p-3 mb-4">
          <p className="text-xs text-blue-300">Token to sign:</p>
          <p className="text-xs text-slate-400 font-mono break-all mt-1">{token}</p>
        </div>

        <div className="space-y-3 mb-5">
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Upload your private key (.pem)</label>
            <label className="flex items-center gap-2 border border-dashed border-white/20 rounded-lg p-3 cursor-pointer hover:border-blue-400/50 transition">
              <Upload size={16} className="text-slate-400" />
              <span className="text-sm text-slate-400">Choose .pem file</span>
              <input type="file" accept=".pem,.txt" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Or paste private key</label>
            <textarea value={keyText} onChange={e => setKeyText(e.target.value)}
              placeholder="-----BEGIN RSA PRIVATE KEY-----..."
              rows={4}
              className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-xs text-green-400 font-mono placeholder:text-slate-600 focus:outline-none focus:border-blue-500 resize-none" />
          </div>
        </div>

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
        {keyText && <p className="text-green-400 text-xs mb-3">✓ Private key loaded</p>}

        <button onClick={sign} disabled={signing || !keyText.trim()}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white py-2.5 rounded-lg font-medium text-sm transition">
          {signing ? 'Signing...' : 'Sign & Authorize Access'}
        </button>
        <p className="text-xs text-slate-500 text-center mt-3">Your private key never leaves this browser</p>
      </div>
    </div>
  );
}
