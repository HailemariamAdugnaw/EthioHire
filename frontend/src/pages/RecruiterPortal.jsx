import { useEffect, useState } from 'react';
import { request } from '../api';

export default function RecruiterPortal({ session }) {
  const token = session?.token;
  const isAuthorized = session?.user?.role === 'RECRUITER';

  const [status, setStatus] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [jobs, setJobs] = useState([]);
  const [applicants, setApplicants] = useState([]);
  const [jobForm, setJobForm] = useState({
    title: '',
    description: '',
    minExperienceYears: 0,
    minGpa: 2.5,
    targetGradYearStart: 2019,
    targetGradYearEnd: 2026,
    allowedDegreeLevels: 'BSc,MSc',
    salaryMin: 5000,
    salaryMax: 15000,
    knockoutQuestions: JSON.stringify([{ key: 'relocation', text: 'Willing to relocate?', requiredAnswer: true }]),
  });
  const [questionForm, setQuestionForm] = useState({ jobId: '', questionText: '', questionType: 'SHORT_TEXT', expectedAnswer: '', timeLimitSeconds: 120 });
  const [interviewForm, setInterviewForm] = useState({ applicationId: '', scheduledTime: '' });

  const loadData = async () => {
    if (!token || !isAuthorized) return;
    try {
      const [jobsData, applicantJobs] = await Promise.all([
        request('/recruiter/jobs', { token }),
        request('/recruiter/applicants', { token }),
      ]);
      setJobs(jobsData || []);
      const flattened = (applicantJobs || []).flatMap((job) =>
        job.applications.map((app) => ({ ...app, jobTitle: job.title })),
      );
      setApplicants(flattened);
    } catch (error) {
      setStatus(error.message);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  const saveCompany = async (event) => {
    event.preventDefault();
    try {
      await request('/recruiter/company', { method: 'POST', token, body: { companyName } });
      setStatus('Company profile updated.');
    } catch (error) {
      setStatus(error.message);
    }
  };

  const createJob = async (event) => {
    event.preventDefault();
    try {
      await request('/recruiter/jobs', { method: 'POST', token, body: jobForm });
      setStatus('Job created.');
      await loadData();
    } catch (error) {
      setStatus(error.message);
    }
  };

  const addQuestion = async (event) => {
    event.preventDefault();
    try {
      await request('/recruiter/questions', { method: 'POST', token, body: questionForm });
      setStatus('Question added.');
      setQuestionForm((prev) => ({ ...prev, questionText: '', expectedAnswer: '' }));
      await loadData();
    } catch (error) {
      setStatus(error.message);
    }
  };

  const scheduleInterview = async (event) => {
    event.preventDefault();
    try {
      await request('/recruiter/interviews', { method: 'POST', token, body: interviewForm });
      setStatus('Interview scheduled.');
      await loadData();
    } catch (error) {
      setStatus(error.message);
    }
  };

  if (!session?.user) return <p className="rounded bg-yellow-100 p-3">Login as recruiter to use this portal.</p>;
  if (!isAuthorized) return <p className="rounded bg-yellow-100 p-3">This portal is only for RECRUITER role accounts.</p>;

  return (
    <section className="space-y-4">
      <p className="rounded bg-slate-100 p-3 text-sm">{status || 'Ready'}</p>

      <div className="grid gap-4 md:grid-cols-2">
        <form onSubmit={saveCompany} className="rounded-xl bg-white p-5 shadow">
          <h2 className="text-xl font-semibold">Company Profile</h2>
          <input className="mt-3 w-full rounded border px-3 py-2" placeholder="Company name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
          <button className="mt-3 rounded bg-blue-600 px-4 py-2 text-white" type="submit">Save Company</button>
        </form>

        <form onSubmit={createJob} className="rounded-xl bg-white p-5 shadow">
          <h3 className="font-semibold">Create Job + Screening Config</h3>
          <div className="mt-3 grid gap-2">
            {Object.keys(jobForm).map((field) => (
              <input
                key={field}
                className="rounded border px-3 py-2"
                placeholder={field}
                value={jobForm[field]}
                onChange={(e) => setJobForm((prev) => ({ ...prev, [field]: e.target.value }))}
                required={field !== 'knockoutQuestions'}
              />
            ))}
            <button className="rounded bg-green-600 px-4 py-2 text-white" type="submit">Create Job</button>
          </div>
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <form onSubmit={addQuestion} className="rounded-xl bg-white p-5 shadow">
          <h3 className="font-semibold">Assessment Question Bank</h3>
          <select className="mt-2 w-full rounded border px-3 py-2" value={questionForm.jobId} onChange={(e) => setQuestionForm((prev) => ({ ...prev, jobId: e.target.value }))}>
            <option value="">Select job</option>
            {jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
          </select>
          <textarea className="mt-2 w-full rounded border p-2" rows={3} placeholder="Question text" value={questionForm.questionText} onChange={(e) => setQuestionForm((prev) => ({ ...prev, questionText: e.target.value }))} />
          <input className="mt-2 w-full rounded border px-3 py-2" placeholder="Expected answer (optional)" value={questionForm.expectedAnswer} onChange={(e) => setQuestionForm((prev) => ({ ...prev, expectedAnswer: e.target.value }))} />
          <button className="mt-2 rounded bg-purple-600 px-4 py-2 text-white" type="submit">Add Question</button>
        </form>

        <form onSubmit={scheduleInterview} className="rounded-xl bg-white p-5 shadow">
          <h3 className="font-semibold">Schedule Interview</h3>
          <select className="mt-2 w-full rounded border px-3 py-2" value={interviewForm.applicationId} onChange={(e) => setInterviewForm((prev) => ({ ...prev, applicationId: e.target.value }))}>
            <option value="">Select passed application</option>
            {applicants.filter((app) => app.status === 'ASSESSMENT_PASSED').map((app) => (
              <option key={app.id} value={app.id}>{app.jobTitle} - {app.candidate.fullName}</option>
            ))}
          </select>
          <input
            className="mt-2 w-full rounded border px-3 py-2"
            type="datetime-local"
            value={interviewForm.scheduledTime ? interviewForm.scheduledTime.slice(0, 16) : ''}
            onChange={(e) => {
              const value = e.target.value;
              setInterviewForm((prev) => ({ ...prev, scheduledTime: value ? new Date(value).toISOString() : '' }));
            }}
          />
          <button className="mt-2 rounded bg-amber-600 px-4 py-2 text-white" type="submit">Schedule</button>
        </form>
      </div>

      <div className="rounded-xl bg-white p-5 shadow">
        <h3 className="font-semibold">Applicant Pipeline & Proctoring Flags</h3>
        <div className="mt-3 overflow-auto text-sm">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-100">
                <th className="border p-2 text-left">Candidate</th>
                <th className="border p-2 text-left">Job</th>
                <th className="border p-2 text-left">Status</th>
                <th className="border p-2 text-left">Score</th>
                <th className="border p-2 text-left">Flags</th>
              </tr>
            </thead>
            <tbody>
              {applicants.map((app) => (
                <tr key={app.id}>
                  <td className="border p-2">{app.candidate.fullName}</td>
                  <td className="border p-2">{app.jobTitle}</td>
                  <td className="border p-2">{app.status}</td>
                  <td className="border p-2">{app.matchScore.toFixed(1)}</td>
                  <td className="border p-2">{app.proctoringLogs.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
