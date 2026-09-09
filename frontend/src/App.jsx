import { useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import CandidatePortal from './pages/CandidatePortal';
import RecruiterPortal from './pages/RecruiterPortal';
import AdminPortal from './pages/AdminPortal';

function App() {
  const [role, setRole] = useState('CANDIDATE');

  return (
    <BrowserRouter>
      <Layout role={role} setRole={setRole}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/candidate" element={<CandidatePortal />} />
          <Route path="/recruiter" element={<RecruiterPortal />} />
          <Route path="/admin" element={<AdminPortal />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
