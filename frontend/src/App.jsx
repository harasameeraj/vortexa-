import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LanguageProvider } from './i18n';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import RegisterProvider from './pages/RegisterProvider';
import PatientDashboard from './pages/PatientDashboard';
import ProviderPortal from './pages/ProviderPortal';

export default function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/register/provider" element={<RegisterProvider />} />
          <Route path="/patient/:id" element={<PatientDashboard />} />
          <Route path="/provider/:id" element={<ProviderPortal />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  );
}
