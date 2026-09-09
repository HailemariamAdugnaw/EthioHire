import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import CandidatePortal from './pages/CandidatePortal';
import RecruiterPortal from './pages/RecruiterPortal';
import AdminPortal from './pages/AdminPortal';

function App() {
  const [session, setSession] = useState(() => {
    const raw = localStorage.getItem('ethiohire-session');
    return raw ? JSON.parse(raw) : null;
  });

  useEffect(() => {
    if (!session) localStorage.removeItem('ethiohire-session');
  }, [session]);

  const onLogout = () => setSession(null);

  return (
    <BrowserRouter>
      <Layout session={session} onLogout={onLogout}>
        <Routes>
          <Route path="/" element={<HomePage session={session} setSession={setSession} />} />
          <Route path="/candidate" element={<CandidatePortal session={session} />} />
          <Route path="/recruiter" element={<RecruiterPortal session={session} />} />
          <Route path="/admin" element={<AdminPortal session={session} />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
