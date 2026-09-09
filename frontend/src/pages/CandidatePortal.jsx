import { useEffect, useMemo, useState } from 'react';
import { request } from '../api';

const shortcuts = ['Control', 'Meta', 'Alt'];

export default function CandidatePortal({ session }) {
  const token = session?.token;
  const isAuthorized = session?.user?.role === 'CANDIDATE';

  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [profile, setProfile] = useState({
    fullName: '',
    phone: '',
    graduationYear: '',
    universityName: '',
    degreeLevel: '',
    gpa: '',
    expectedSalary: '',
  });
  const [files, setFiles] = useState({ cv: null, credentials: null });
  const [reference, setReference] = useState({ name: '', email: '', relationship: '' });
  const [selectedJobId, setSelectedJobId] = useState('');
  const [activeApplicationId, setActiveApplicationId] = useState('');
  const [assessment, setAssessment] = useState({ questions: [], index: 0, answers: {} });

  const selectedQuestion = useMemo(() => assessment.questions[assessment.index], [assessment]);

  const loadData = async () => {
    if (!token || !isAuthorized) return;
    try {
      const [jobsData, appsData] = await Promise.all([
        request('/jobs'),
        request('/applications/me', { token }),
      ]);
      setJobs(jobsData || []);
      setApplications(appsData || []);
      if ((jobsData || []).length > 0) setSelectedJobId((prev) => prev || jobsData[0].id);
    } catch (error) {
      setStatus(error.message);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  useEffect(() => {
    if (!token || !activeApplicationId) return undefined;

    const logEvent = async (eventType, metadata = {}) => {
      try {
        await request('/assessment/proctoring-log', {
          method: 'POST',
          token,
          body: { applicationId: activeApplicationId, eventType, metadata },
        });
      } catch (_error) {
        // no-op
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        setEvents((prev) => [...prev, 'TAB_SWITCH detected']);
        logEvent('TAB_SWITCH', { at: new Date().toISOString() });
      }
    };

    const onFullscreen = () => {
      const enabled = Boolean(document.fullscreenElement);
      setFullscreen(enabled);
      if (!enabled) {
        setEvents((prev) => [...prev, 'EXIT_FULLSCREEN detected']);
        logEvent('EXIT_FULLSCREEN', { at: new Date().toISOString() });
      }
    };

    const onCopyPaste = (event) => {
      event.preventDefault();
      setEvents((prev) => [...prev, `${event.type.toUpperCase()} blocked`]);
      logEvent('COPY_PASTE', { type: event.type, at: new Date().toISOString() });
    };

    const onContextMenu = (event) => {
      event.preventDefault();
      setEvents((prev) => [...prev, 'RIGHT_CLICK blocked']);
      logEvent('COPY_PASTE', { type: 'contextmenu', at: new Date().toISOString() });
    };

    const onShortcut = (event) => {
      if (shortcuts.includes(event.key) || event.ctrlKey || event.metaKey) {
        event.preventDefault();
        setEvents((prev) => [...prev, 'KEYBOARD_SHORTCUT blocked']);
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('copy', onCopyPaste);
    document.addEventListener('paste', onCopyPaste);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('keydown', onShortcut);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('copy', onCopyPaste);
      document.removeEventListener('paste', onCopyPaste);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('keydown', onShortcut);
    };
  }, [token, activeApplicationId]);

  const saveProfile = async (event) => {
    event.preventDefault();
    if (!token) return;

    const formData = new FormData();
    Object.entries(profile).forEach(([key, value]) => formData.append(key, value));
    if (files.cv) formData.append('cv', files.cv);
    if (files.credentials) formData.append('credentials', files.credentials);

    try {
      await request('/candidate/profile', { method: 'POST', token, body: formData, isForm: true });
      setStatus('Profile saved.');
    } catch (error) {
      setStatus(error.message);
    }
  };

  const addReference = async (event) => {
    event.preventDefault();
    if (!token) return;

    try {
      await request('/candidate/references', { method: 'POST', token, body: reference });
      setReference({ name: '', email: '', relationship: '' });
      setStatus('Reference submitted.');
    } catch (error) {
      setStatus(error.message);
    }
  };

  const applyToJob = async () => {
    if (!token || !selectedJobId) return;
    try {
      await request('/applications', { method: 'POST', token, body: { jobId: selectedJobId, knockoutAnswers: {} } });
      await loadData();
      setStatus('Application submitted and pre-screen evaluated.');
    } catch (error) {
      setStatus(error.message);
    }
  };

  const startAssessment = async () => {
    if (!token || !activeApplicationId) return;
    try {
      const data = await request('/assessment/start', {
        method: 'POST',
        token,
        body: { applicationId: activeApplicationId },
      });
      setAssessment({ questions: data.questions || [], index: 0, answers: {} });
      await document.documentElement.requestFullscreen();
      setFullscreen(true);
      setStatus('Assessment started.');
    } catch (error) {
      setStatus(error.message);
    }
  };

  const submitCurrentAnswer = async () => {
    if (!token || !selectedQuestion || !activeApplicationId) return;
    const answerText = assessment.answers[selectedQuestion.id];
    if (!answerText) return;

    try {
      await request('/assessment/answers', {
        method: 'POST',
        token,
        body: { applicationId: activeApplicationId, questionId: selectedQuestion.id, answerText },
      });

      setAssessment((prev) => ({ ...prev, index: prev.index + 1 }));
      setStatus('Answer saved.');
    } catch (error) {
      setStatus(error.message);
    }
  };

  const completeAssessment = async () => {
    if (!token || !activeApplicationId) return;
    try {
      const result = await request('/assessment/complete', {
        method: 'POST',
        token,
        body: { applicationId: activeApplicationId },
      });
      setStatus(`Assessment completed. Score ${result.averageScore.toFixed(1)} - ${result.passed ? 'PASSED' : 'FAILED'}.`);
      await loadData();
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch (error) {
      setStatus(error.message);
    }
  };

  if (!session?.user) return <p className="rounded bg-yellow-100 p-3">Login as candidate to use this portal.</p>;
  if (!isAuthorized) return <p className="rounded bg-yellow-100 p-3">This portal is only for CANDIDATE role accounts.</p>;

  return (
    <section className="space-y-4">
      <p className="rounded bg-slate-100 p-3 text-sm">{status || 'Ready'}</p>

      <div className="grid gap-4 md:grid-cols-2">
        <form onSubmit={saveProfile} className="rounded-xl bg-white p-5 shadow">
          <h2 className="text-xl font-semibold">Candidate Profile</h2>
          <div className="mt-3 grid gap-2">
            {Object.keys(profile).map((field) => (
              <input
                key={field}
                className="rounded border px-3 py-2"
                placeholder={field}
                value={profile[field]}
                onChange={(event) => setProfile((prev) => ({ ...prev, [field]: event.target.value }))}
                required
              />
            ))}
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => setFiles((prev) => ({ ...prev, cv: event.target.files[0] }))} />
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => setFiles((prev) => ({ ...prev, credentials: event.target.files[0] }))} />
            <button className="rounded bg-blue-600 px-4 py-2 text-white" type="submit">Save Profile</button>
          </div>
        </form>

        <form onSubmit={addReference} className="rounded-xl bg-white p-5 shadow">
          <h3 className="font-semibold">Reference Contact</h3>
          <div className="mt-3 grid gap-2">
            <input className="rounded border px-3 py-2" placeholder="Name" value={reference.name} onChange={(e) => setReference((prev) => ({ ...prev, name: e.target.value }))} required />
            <input className="rounded border px-3 py-2" placeholder="Email" type="email" value={reference.email} onChange={(e) => setReference((prev) => ({ ...prev, email: e.target.value }))} required />
            <input className="rounded border px-3 py-2" placeholder="Relationship" value={reference.relationship} onChange={(e) => setReference((prev) => ({ ...prev, relationship: e.target.value }))} required />
            <button className="rounded bg-slate-800 px-4 py-2 text-white" type="submit">Add Reference</button>
          </div>
        </form>
      </div>

      <div className="rounded-xl bg-white p-5 shadow">
        <h3 className="font-semibold">Open Jobs & Applications</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <select className="rounded border px-3 py-2" value={selectedJobId} onChange={(e) => setSelectedJobId(e.target.value)}>
            <option value="">Select job</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>{job.title}</option>
            ))}
          </select>
          <button onClick={applyToJob} className="rounded bg-green-600 px-4 py-2 text-white">Apply + Pre-screen</button>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <select className="rounded border px-3 py-2" value={activeApplicationId} onChange={(e) => setActiveApplicationId(e.target.value)}>
            <option value="">Select application for assessment</option>
            {applications.map((app) => (
              <option key={app.id} value={app.id}>{app.job.title} - {app.status}</option>
            ))}
          </select>
          <button onClick={startAssessment} className="rounded bg-purple-600 px-4 py-2 text-white">Start Assessment</button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-white p-5 shadow">
          <h3 className="font-semibold">Assessment Room {fullscreen ? '(Fullscreen)' : ''}</h3>
          {selectedQuestion ? (
            <div className="mt-3 space-y-3">
              <p className="font-medium">{selectedQuestion.questionText}</p>
              <p className="text-xs text-slate-500">Time limit: {selectedQuestion.timeLimitSeconds}s</p>
              <textarea
                className="w-full rounded border p-2"
                rows={4}
                value={assessment.answers[selectedQuestion.id] || ''}
                onChange={(event) =>
                  setAssessment((prev) => ({
                    ...prev,
                    answers: { ...prev.answers, [selectedQuestion.id]: event.target.value },
                  }))
                }
              />
              <button onClick={submitCurrentAnswer} className="rounded bg-blue-600 px-4 py-2 text-white">Submit Answer</button>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-600">No active question.</p>
          )}
          {assessment.questions.length > 0 && assessment.index >= assessment.questions.length && (
            <button onClick={completeAssessment} className="mt-3 rounded bg-emerald-700 px-4 py-2 text-white">Complete Assessment</button>
          )}
        </div>

        <div className="rounded-xl bg-white p-5 shadow">
          <h3 className="font-semibold">Proctoring Activity</h3>
          <div className="mt-2 max-h-64 overflow-auto rounded bg-slate-100 p-3 text-sm">
            {events.length === 0 ? 'No suspicious events logged yet.' : events.map((event, i) => <p key={`${event}-${i}`}>{event}</p>)}
          </div>
        </div>
      </div>
    </section>
  );
}
