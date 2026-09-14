/** EthioHire — shared domain constants */

export const APPLICATION_STATUSES = [
  "APPLIED",
  "PRE_SCREEN_REJECTED",
  "EXAM_SCHEDULED",
  "EXAM_IN_PROGRESS",
  "EXAM_PASSED",
  "EXAM_FAILED",
  "EXAM_TERMINATED",
  "INTERVIEW_SCHEDULED",
  "INTERVIEW_COMPLETED",
  "SHORTLISTED",
  "HIRED",
  "REJECTED",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const STATUS_LABELS: Record<string, string> = {
  APPLIED: "Applied — Pre-screening",
  PRE_SCREEN_REJECTED: "Rejected at Pre-screening",
  EXAM_SCHEDULED: "Exam Scheduled",
  EXAM_IN_PROGRESS: "Proctored Exam In Progress",
  EXAM_SUBMITTED: "Submitted — Awaiting Results",
  EXAM_PASSED: "Exam Passed",
  EXAM_FAILED: "Exam Failed",
  EXAM_TERMINATED: "Exam Terminated (Proctoring)",
  INTERVIEW_SCHEDULED: "Interview Scheduled",
  INTERVIEW_COMPLETED: "Interview Completed",
  SHORTLISTED: "Shortlisted",
  HIRED: "Hired",
  REJECTED: "Rejected",
};

export const STATUS_COLORS: Record<string, string> = {
  APPLIED: "bg-amber-100 text-amber-800 border-amber-200",
  PRE_SCREEN_REJECTED: "bg-red-100 text-red-700 border-red-200",
  EXAM_SCHEDULED: "bg-violet-100 text-violet-800 border-violet-200",
  EXAM_IN_PROGRESS: "bg-sky-100 text-sky-800 border-sky-200",
  EXAM_SUBMITTED: "bg-amber-100 text-amber-800 border-amber-200",
  EXAM_PASSED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  EXAM_FAILED: "bg-red-100 text-red-700 border-red-200",
  EXAM_TERMINATED: "bg-red-100 text-red-700 border-red-200",
  INTERVIEW_SCHEDULED: "bg-teal-100 text-teal-800 border-teal-200",
  INTERVIEW_COMPLETED: "bg-stone-100 text-stone-700 border-stone-200",
  SHORTLISTED: "bg-lime-100 text-lime-800 border-lime-200",
  HIRED: "bg-emerald-600 text-white border-emerald-600",
  REJECTED: "bg-red-100 text-red-700 border-red-200",
};

export const DEGREE_LEVELS = [
  { value: "HIGH_SCHOOL", label: "High School" },
  { value: "DIPLOMA", label: "Diploma" },
  { value: "BACHELORS", label: "Bachelor's Degree" },
  { value: "MASTERS", label: "Master's Degree" },
  { value: "PHD", label: "PhD / Doctorate" },
];

export const DEGREE_ORDER: Record<string, number> = {
  HIGH_SCHOOL: 1,
  DIPLOMA: 2,
  BACHELORS: 3,
  MASTERS: 4,
  PHD: 5,
};

export const JOB_TYPES = [
  { value: "FULL_TIME", label: "Full-time" },
  { value: "PART_TIME", label: "Part-time" },
  { value: "CONTRACT", label: "Contract" },
  { value: "INTERNSHIP", label: "Internship" },
];

/** Standardized job categories — the exact list recruiters pick from in the
 * job editor (replaces the old free-text Category field). The backend
 * validates every write against the same list. */
export const JOB_CATEGORIES: string[] = [
  "Accounting and Finance",
  "Admin, Secretarial, and Clerical",
  "Agriculture",
  "Architecture and Construction",
  "Automotive",
  "Banking and Insurance",
  "Business and Administration",
  "Business Development",
  "Communications, Media and Journalism",
  "Consultancy and Training",
  "Creative Arts",
  "Customer Service",
  "Development and Project Management",
  "Economics",
  "Education",
  "Engineering",
  "Environment and Natural Resource",
  "Event Management",
  "FMCG and Manufacturing",
  "Graduate and Management Trainee",
  "Health Care",
  "Hotel and Hospitality",
  "Human Resource and Recruitment",
  "IT, Computer Science and Software Engineering",
  "Legal",
  "Logistics, Transport and Supply Chain",
  "Management",
  "Natural Sciences",
  "Pharmaceutical",
  "Purchasing and Procurement",
  "Quality Assurance",
  "Research and Development",
  "Retail, Wholesale and Distribution",
  "Sales and Marketing",
  "Security",
  "Social Sciences and Community Service",
  "Technology",
  "Telecommunications",
  "Travel and Tourism",
  "Veterinary Services",
  "Warehouse, Supply Chain and Distribution",
  "Water and Sanitation",
];

export const PROCTORING_EVENT_LABELS: Record<string, string> = {
  TAB_SWITCH: "Tab switch",
  WINDOW_BLUR: "Window lost focus",
  FULLSCREEN_EXIT: "Exited fullscreen",
  COPY_PASTE: "Copy / paste attempt",
  RIGHT_CLICK: "Right-click attempt",
  FACE_MISSING: "Face missing from webcam",
  MULTI_FACE: "Multiple faces detected",
  SNAPSHOT: "Webcam snapshot",
};

export function formatETB(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `ETB ${n.toLocaleString("en-US")}`;
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** ISO string → value usable by <input type="datetime-local"> (local time). */
export function toDatetimeLocal(d: string | Date | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

/** datetime-local input value → ISO string (or null when empty/invalid). */
export function fromDatetimeLocal(v: string | null | undefined): string | null {
  if (!v) return null;
  const dt = new Date(v);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

/** Live countdown "5d 04:23:11" from a millisecond duration. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const h = String(Math.floor((total % 86400) / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return days > 0 ? `${days}d ${h}:${m}:${s}` : `${h}:${m}:${s}`;
}

/** Human deadline label: "25 days left", "3 days left", "Closed today". */
export function daysLeftLabel(days: number | null | undefined): string {
  if (days === null || days === undefined) return "";
  if (days <= 0) return "Closed";
  return `${days} day${days === 1 ? "" : "s"} left`;
}
