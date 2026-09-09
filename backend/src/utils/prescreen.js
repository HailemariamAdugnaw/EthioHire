function evaluatePreScreen(candidate, job, knockoutAnswers = {}) {
  const reasons = [];

  if (candidate.gpa < job.minGpa) reasons.push('GPA below threshold');
  if (candidate.graduationYear < job.targetGradYearStart || candidate.graduationYear > job.targetGradYearEnd) {
    reasons.push('Graduation year out of range');
  }
  if (!job.allowedDegreeLevels.includes(candidate.degreeLevel)) reasons.push('Degree level not accepted');
  if (candidate.expectedSalary < job.salaryMin || candidate.expectedSalary > job.salaryMax) {
    reasons.push('Salary expectation out of budget range');
  }

  const knockout = Array.isArray(job.knockoutQuestions) ? job.knockoutQuestions : [];
  knockout.forEach((question) => {
    const answer = knockoutAnswers[question.key];
    if (question.requiredAnswer !== undefined && answer !== question.requiredAnswer) {
      reasons.push(`Knockout failed: ${question.text}`);
    }
  });

  const score = Math.max(0, 100 - reasons.length * 20);
  return { passed: reasons.length === 0, reasons, score };
}

module.exports = { evaluatePreScreen };
