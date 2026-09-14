"""
EthioHire — Stage 1 pre-screening & match score engine (port of
src/lib/matching.ts, 1:1 including user-facing strings shown in the UI).

Hard knockout filters (any failure disqualifies):
  GPA | graduation window | experience | salary vs budget | knockout answers
Weighted match score: GPA 30 | Experience 25 | Salary fit 20 | Degree 15 | Skills 10
"""
import re

from .common import jsloc, jsnum

DEGREE_POINTS = {"HIGH_SCHOOL": 4, "DIPLOMA": 8, "BACHELORS": 12, "MASTERS": 15, "PHD": 15}

DASH = "\u2014"  # em dash — used in JS template strings for null values
ENDASH = "\u2013"  # en dash – used in "2020–2025" windows
GEQ = "\u2265"  # ≥


def _clamp_score(n) -> int:
    # Math.round equivalent (half away from zero, matching JS for positives)
    import math

    return max(0, min(100, int(math.floor(n + 0.5))))


def pre_screen(req: dict, candidate: dict, knockout=None) -> dict:
    knockout = knockout or []
    reject_reasons: list = []
    checks: list = []

    # --- GPA ---
    min_gpa = req.get("minGpa")
    c_gpa = candidate.get("gpa")
    gpa_ok = min_gpa is None or (c_gpa is not None and c_gpa >= min_gpa)
    checks.append({
        "label": "Minimum GPA",
        "passed": gpa_ok,
        "detail": "No threshold set" if min_gpa is None
        else f"Requires {GEQ} {jsnum(min_gpa)}, candidate has {jsnum(c_gpa) if c_gpa is not None else DASH}",
    })
    if not gpa_ok:
        reject_reasons.append(
            f"GPA {jsnum(c_gpa) if c_gpa is not None else DASH} is below the minimum {jsnum(min_gpa)}."
        )

    # --- Graduation year window ---
    grad_ok = True
    grad_detail = "No window set"
    if req.get("targetGradYearStart") is not None or req.get("targetGradYearEnd") is not None:
        y = candidate.get("graduationYear")
        grad_ok = (
            y is not None
            and (req.get("targetGradYearStart") is None or y >= req["targetGradYearStart"])
            and (req.get("targetGradYearEnd") is None or y <= req["targetGradYearEnd"])
        )
        start = req.get("targetGradYearStart") if req.get("targetGradYearStart") is not None else "\u2026"
        end = req.get("targetGradYearEnd") if req.get("targetGradYearEnd") is not None else "\u2026"
        grad_detail = f"Window {start}{ENDASH}{end}, candidate graduated {y if y is not None else DASH}"
    checks.append({"label": "Graduation year", "passed": grad_ok, "detail": grad_detail})
    if not grad_ok:
        y = candidate.get("graduationYear")
        reject_reasons.append(
            f"Graduation year {y if y is not None else DASH} is outside the accepted range."
        )

    # --- Experience ---
    min_exp = req.get("minExperienceYears") or 0
    exp = candidate.get("experienceYears") or 0
    exp_ok = exp >= min_exp
    checks.append({
        "label": "Minimum experience",
        "passed": exp_ok,
        "detail": f"Requires {GEQ} {min_exp} yr, candidate has {exp} yr",
    })
    if not exp_ok:
        reject_reasons.append(
            f"Experience ({exp} years) is below the required {min_exp} years."
        )

    # --- Salary expectation vs budget ---
    salary_soft_penalty = False
    budget_max = req.get("salaryBudgetMax")
    expected = candidate.get("expectedSalary")
    if budget_max is not None and expected is not None:
        budget_min = req.get("salaryBudgetMin") if req.get("salaryBudgetMin") is not None else 0
        salary_ok = budget_min <= expected <= budget_max
        soft_ok = (not salary_ok) and expected <= budget_max * 1.15
        salary_soft_penalty = soft_ok
        soft_note = " (soft mismatch " + ENDASH + " score penalty applied)" if soft_ok else ""
        salary_detail = (
            f"Budget {jsloc(budget_min)}{ENDASH}{jsloc(budget_max)} ETB, "
            f"expectation {jsloc(expected)} ETB{soft_note}"
        )
        if not salary_ok and not soft_ok:
            reject_reasons.append(
                f"Salary expectation ({jsloc(expected)} ETB) exceeds the budget ceiling ({jsloc(budget_max)} ETB)."
            )
        checks.append({"label": "Salary expectation", "passed": salary_ok or soft_ok, "detail": salary_detail})
    else:
        checks.append({"label": "Salary expectation", "passed": True, "detail": "No budget range set"})

    # --- Knockout questionnaire ---
    knockout_ok = True
    if knockout:
        failed = [k for k in knockout if (k.get("answer") or "").upper() != k.get("requiredAnswer", "").upper()]
        knockout_ok = len(failed) == 0
        checks.append({
            "label": "Knockout questionnaire",
            "passed": knockout_ok,
            "detail": f"{len(knockout)}/{len(knockout)} prerequisite answers correct" if knockout_ok
            else f"{len(failed)} prerequisite question(s) failed",
        })
        if not knockout_ok:
            reject_reasons.append("One or more knockout (Yes/No prerequisite) questions were answered incorrectly.")

    # ---------- Weighted score ----------
    gpa_points = 15 if c_gpa is None else _clamp_score(((c_gpa - 2) / 2) * 30)  # 2.0→0, 4.0→30
    exp_req = max(1, req.get("minExperienceYears") or 1)
    exp_points = _clamp_score((min(exp, exp_req * 2) / (exp_req * 2)) * 25)
    salary_points = 10 if salary_soft_penalty or budget_max is None or expected is None else 20
    degree_points = DEGREE_POINTS.get(candidate.get("degreeLevel") or "", 8)
    if candidate.get("degreeLevel") is None:
        degree_points = 8

    required = [s.lower().strip() for s in (req.get("requiredSkills") or []) if s and s.strip()]
    owned = [s.strip().lower() for s in re.split(r",", candidate.get("skills") or "") if s.strip()]
    if not required:
        overlap = 0.7
    else:
        overlap = sum(1 for r in required if any(r in o or o in r for o in owned)) / len(required)
    skills_points = _clamp_score(overlap * 10)

    match_score = _clamp_score(gpa_points + exp_points + salary_points + degree_points + skills_points)

    return {
        "passed": len(reject_reasons) == 0,
        "matchScore": match_score,
        "rejectReasons": reject_reasons,
        "checks": checks,
    }
