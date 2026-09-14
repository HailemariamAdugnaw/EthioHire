"""
EthioHire — exam question-bank helpers (port of src/lib/questions.ts).

Four question types:
  MCQ        → multiple choice, options stored as a JSON array of strings
  TRUE_FALSE → correctAnswer is "TRUE" | "FALSE"
  FILL_BLANK → correctAnswer is a comma-separated list of accepted answers
  TEXT       → free text, correctAnswer holds expected keywords; the grading
               keyword heuristic runs at the call site (human-reviewed)
"""

QUESTION_TYPES = ["MCQ", "TRUE_FALSE", "FILL_BLANK", "TEXT"]


def normalize_assessment_question(q: dict, order: int) -> dict:
    qtype = q.get("questionType")
    if qtype not in QUESTION_TYPES:
        qtype = "MCQ"

    correct_answer = str(q.get("correctAnswer") or "").strip()
    options = None

    if qtype == "MCQ":
        raw = q.get("options")
        opts = [str(o).strip() for o in raw if str(o).strip()] if isinstance(raw, list) else []
        options = __import__("json").dumps(opts) if opts else None
    elif qtype == "TRUE_FALSE":
        up = correct_answer.upper()
        correct_answer = "FALSE" if up in ("FALSE", "F", "NO", "0") else "TRUE"
    # FILL_BLANK + TEXT keep correctAnswer as free-form text

    try:
        time_limit = int(str(q.get("timeLimitSeconds") if q.get("timeLimitSeconds") is not None else 90))
    except (TypeError, ValueError):
        time_limit = 90
    if time_limit == 0 and q.get("timeLimitSeconds") not in (None, "", 0, "0"):
        time_limit = 90
    time_limit = min(600, max(15, time_limit if time_limit else 90))

    return {
        "questionText": str(q.get("questionText") or "").strip(),
        "questionType": qtype,
        "options": options,
        "correctAnswer": correct_answer,
        "timeLimitSeconds": time_limit,
        "order": order,
    }


def norm_answer(s) -> str:
    """Case/whitespace-insensitive comparison form."""
    import re as _re

    return _re.sub(r"\s+", " ", str(s if s is not None else "").strip().lower())


def grade_answer(question_type: str, correct_answer: str, answer):
    """Grade a candidate answer server-side. Returns bool, or None for TEXT."""
    if question_type == "MCQ":
        return norm_answer(answer) == norm_answer(correct_answer)
    if question_type == "TRUE_FALSE":
        truthy = ("true", "t", "yes", "1")
        falsy = ("false", "f", "no", "0")
        a = norm_answer(answer)
        c = norm_answer(correct_answer)
        return (a in truthy and c in truthy) or (a in falsy and c in falsy)
    if question_type == "FILL_BLANK":
        accepted = [norm_answer(part) for part in correct_answer.split(",")]
        accepted = [a for a in accepted if a]
        return norm_answer(answer) in accepted
    return None  # TEXT — graded by keyword heuristic at the call site


def grade_text_answer(correct_answer: str, answer) -> bool:
    """Keyword heuristic for TEXT questions (mirrors the exam route's fallback):
    keywords = correctAnswer lowercased split on commas/whitespace, filtered to
    length > 4; correct if any keyword appears in the normalized answer, else
    correct when the answer is longer than 20 characters."""
    import re as _re

    text = norm_answer(answer)
    keywords = [k for k in _re.split(r"[,\s]+", (correct_answer or "").lower()) if len(k) > 4]
    if any(k in text for k in keywords):
        return True
    return len(text) > 20
