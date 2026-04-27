import '@/lib/sentry';
import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { ActionsProvider } from '@/context/ActionsContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ErrorBusProvider } from '@/components/ErrorBus';
import { Layout } from '@/components/Layout';
import DashboardOverview from '@/pages/DashboardOverview';
import AdminPage from '@/pages/AdminPage';
import KundenverwaltungPage from '@/pages/KundenverwaltungPage';
import KatzenverwaltungPage from '@/pages/KatzenverwaltungPage';
import ZimmerverwaltungPage from '@/pages/ZimmerverwaltungPage';
import LeistungsverwaltungPage from '@/pages/LeistungsverwaltungPage';
import BuchungsverwaltungPage from '@/pages/BuchungsverwaltungPage';
import GesundheitsprotokollPage from '@/pages/GesundheitsprotokollPage';
import PublicFormKundenverwaltung from '@/pages/public/PublicForm_Kundenverwaltung';
import PublicFormKatzenverwaltung from '@/pages/public/PublicForm_Katzenverwaltung';
import PublicFormZimmerverwaltung from '@/pages/public/PublicForm_Zimmerverwaltung';
import PublicFormLeistungsverwaltung from '@/pages/public/PublicForm_Leistungsverwaltung';
import PublicFormBuchungsverwaltung from '@/pages/public/PublicForm_Buchungsverwaltung';
import PublicFormGesundheitsprotokoll from '@/pages/public/PublicForm_Gesundheitsprotokoll';
// <public:imports>
// </public:imports>
// <custom:imports>
const NeueBuchungPage = lazy(() => import('@/pages/intents/NeueBuchungPage'));
const TagesprotokollPage = lazy(() => import('@/pages/intents/TagesprotokollPage'));
// </custom:imports>

export default function App() {
  return (
    <ErrorBoundary>
      <ErrorBusProvider>
        <HashRouter>
          <ActionsProvider>
            <Routes>
              <Route path="public/69e6442ee20422c9c76e7a9d" element={<PublicFormKundenverwaltung />} />
              <Route path="public/69e6442f8bf9b400575dae08" element={<PublicFormKatzenverwaltung />} />
              <Route path="public/69e6442fee4676e450ae217f" element={<PublicFormZimmerverwaltung />} />
              <Route path="public/69e644305bb831e00fe90d04" element={<PublicFormLeistungsverwaltung />} />
              <Route path="public/69e644309b0ad64abffd2cc8" element={<PublicFormBuchungsverwaltung />} />
              <Route path="public/69e644311142a4fbb8d3bc8f" element={<PublicFormGesundheitsprotokoll />} />
              {/* <public:routes> */}
              {/* </public:routes> */}
              <Route element={<Layout />}>
                <Route index element={<DashboardOverview />} />
                <Route path="kundenverwaltung" element={<KundenverwaltungPage />} />
                <Route path="katzenverwaltung" element={<KatzenverwaltungPage />} />
                <Route path="zimmerverwaltung" element={<ZimmerverwaltungPage />} />
                <Route path="leistungsverwaltung" element={<LeistungsverwaltungPage />} />
                <Route path="buchungsverwaltung" element={<BuchungsverwaltungPage />} />
                <Route path="gesundheitsprotokoll" element={<GesundheitsprotokollPage />} />
                <Route path="admin" element={<AdminPage />} />
                {/* <custom:routes> */}
                <Route path="intents/neue-buchung" element={<Suspense fallback={null}><NeueBuchungPage /></Suspense>} />
                <Route path="intents/tagesprotokoll" element={<Suspense fallback={null}><TagesprotokollPage /></Suspense>} />
                {/* </custom:routes> */}
              </Route>
            </Routes>
          </ActionsProvider>
        </HashRouter>
      </ErrorBusProvider>
    </ErrorBoundary>
  );
}
