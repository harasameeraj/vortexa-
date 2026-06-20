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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-100 rounded-lg flex items-center justify-center">
              <Shield size={18} className="text-emerald-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Authorize Access</h3>
              <p className="text-gray-500 text-xs">Sign with your private key</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4">
          <p className="text-xs text-emerald-700">Token to sign:</p>
          <p className="text-xs text-gray-500 font-mono break-all mt-1">{token}</p>
        </div>

        <div className="space-y-3 mb-5">
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Upload your private key (.pem)</label>
            <label className="flex items-center gap-2 border border-dashed border-gray-300 rounded-lg p-3 cursor-pointer hover:border-emerald-400 transition bg-white">
              <Upload size={16} className="text-gray-400" />
              <span className="text-sm text-gray-500">Choose .pem file</span>
              <input type="file" accept=".pem,.txt" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Or paste private key</label>
            <textarea value={keyText} onChange={e => setKeyText(e.target.value)}
              placeholder="-----BEGIN RSA PRIVATE KEY-----..." rows={4}
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-800 font-mono placeholder:text-gray-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-none" />
          </div>
        </div>

        {error && <p className="text-red-500 text-xs mb-3">{error}</p>}
        {keyText && <p className="text-emerald-600 text-xs mb-3">✓ Private key loaded</p>}

        <button onClick={sign} disabled={signing || !keyText.trim()}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white py-2.5 rounded-lg font-medium text-sm transition">
          {signing ? 'Signing...' : 'Sign & Authorize Access'}
        </button>
        <p className="text-xs text-gray-400 text-center mt-3">Your private key never leaves this browser</p>
      </div>
    </div>
  );
}
