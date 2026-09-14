"""EthioHire — standalone interview resources: reusable question banks and
evaluation templates (company-owned, managed independently of any job and
then linked from the job editor).

Interview question banks are deliberately separate from the proctored
text-exam pool (AssessmentQuestion). Evaluation templates carry per-
competency weights for the weighted overall-score auto-sum.
"""
from django.db.models import Count

from rest_framework.response import Response

from ..common import ApiError, audit, view
from ..ehauth import require_role
from ..models import CompanyProfile, EvalTemplate, InterviewBank, InterviewBankQuestion
from ..serializers import eval_template_dict, interview_bank_dict
from .jobs import _company_of


def _require_company(session: dict) -> CompanyProfile:
    company = _company_of(session["id"])
    if not company:
        raise ApiError(400, "Company profile missing.")
    return company


def _owned_bank(session: dict, bank_id: str) -> InterviewBank:
    bank = InterviewBank.objects.filter(id=bank_id).select_related("company").first()
    if not bank:
        raise ApiError(404, "Question bank not found.")
    if session["role"] == "RECRUITER" and bank.company.userId_id != session["id"]:
        raise ApiError(403, "Access denied.")
    return bank


def _owned_template(session: dict, template_id: str) -> EvalTemplate:
    tpl = EvalTemplate.objects.filter(id=template_id).select_related("company").first()
    if not tpl:
        raise ApiError(404, "Evaluation template not found.")
    if session["role"] == "RECRUITER" and tpl.company.userId_id != session["id"]:
        raise ApiError(403, "Access denied.")
    return tpl


def _clean_questions(raw) -> list[dict]:
    questions = []
    for i, q in enumerate(raw or []):
        if not isinstance(q, dict):
            continue
        text = str(q.get("questionText") or "").strip()
        if not text:
            continue
        questions.append({
            "questionText": text[:5000],
            "guidance": (str(q.get("guidance") or "").strip()[:2000] or None),
            "visibleToCandidate": bool(q.get("visibleToCandidate", True)),
            "order": i + 1,
        })
    return questions


# ------------------------------------------------------------- question banks

@view(["GET", "POST"])
def question_banks_view(request):
    session = require_role(request, "RECRUITER", "ADMIN")

    if request.method == "GET":
        qs = InterviewBank.objects.all()
        if session["role"] == "RECRUITER":
            company = _company_of(session["id"])
            if not company:
                return Response({"banks": []})
            qs = qs.filter(company=company)
        banks = qs.annotate(_qc=Count("questions")).select_related("company").order_by("-updatedAt")
        out = []
        for b in banks:
            data = interview_bank_dict(b)
            data["questionCount"] = b._qc
            out.append(data)
        return Response({"banks": out})

    company = _require_company(session)
    body = request.data if isinstance(request.data, dict) else {}
    name = str(body.get("name") or "").strip()
    if not name:
        raise ApiError(400, "Bank name is required.")
    bank = InterviewBank.objects.create(
        company=company,
        name=name[:200],
        description=str(body.get("description") or "").strip()[:1000] or None,
    )
    for q in _clean_questions(body.get("questions")):
        InterviewBankQuestion.objects.create(bank=bank, **q)
    audit(session["email"], "QUESTION_BANK_CREATED", f"InterviewBank:{bank.name}")
    return Response({"bank": interview_bank_dict(bank, detail=True)})


@view(["GET", "PUT", "DELETE"])
def question_bank_detail_view(request, bank_id: str):
    session = require_role(request, "RECRUITER", "ADMIN")
    bank = _owned_bank(session, bank_id)

    if request.method == "GET":
        return Response({"bank": interview_bank_dict(bank, detail=True)})

    if request.method == "DELETE":
        linked = bank.jobs.count()
        if linked > 0:
            raise ApiError(
                400,
                f"This bank is linked to {linked} job(s) — unlink it from the job editor before deleting.",
            )
        name = bank.name
        bank.delete()
        audit(session["email"], "QUESTION_BANK_DELETED", f"InterviewBank:{name}")
        return Response({"ok": True})

    body = request.data if isinstance(request.data, dict) else {}
    if "name" in body:
        name = str(body.get("name") or "").strip()
        if not name:
            raise ApiError(400, "Bank name is required.")
        bank.name = name[:200]
    if "description" in body:
        bank.description = str(body.get("description") or "").strip()[:1000] or None
    bank.save()
    if "questions" in body:
        bank.questions.all().delete()
        for q in _clean_questions(body.get("questions")):
            InterviewBankQuestion.objects.create(bank=bank, **q)
    audit(session["email"], "QUESTION_BANK_UPDATED", f"InterviewBank:{bank.name}")
    return Response({"bank": interview_bank_dict(bank, detail=True)})


# -------------------------------------------------------- evaluation templates

def _clean_competencies(raw) -> list[dict]:
    import json as _json

    comps = []
    for i, c in enumerate(raw or []):
        if not isinstance(c, dict):
            continue
        label = str(c.get("label") or "").strip()
        if not label:
            continue
        try:
            weight = max(1, min(10, int(c.get("weight") or 1)))
        except (TypeError, ValueError):
            weight = 1
        comps.append({"key": str(c.get("key") or f"c{i + 1}")[:60], "label": label[:120], "weight": weight})
    return comps


@view(["GET", "POST"])
def eval_templates_view(request):
    session = require_role(request, "RECRUITER", "ADMIN")

    if request.method == "GET":
        qs = EvalTemplate.objects.all()
        if session["role"] == "RECRUITER":
            company = _company_of(session["id"])
            if not company:
                return Response({"templates": []})
            qs = qs.filter(company=company)
        templates = qs.order_by("-updatedAt")
        return Response({"templates": [eval_template_dict(t) for t in templates]})

    company = _require_company(session)
    body = request.data if isinstance(request.data, dict) else {}
    name = str(body.get("name") or "").strip()
    if not name:
        raise ApiError(400, "Template name is required.")
    comps = _clean_competencies(body.get("competencies"))
    if not comps:
        raise ApiError(400, "At least one competency with a label is required.")
    try:
        scale = max(1, min(10, int(body.get("scaleMax") or 5)))
    except (TypeError, ValueError):
        scale = 5
    tpl = EvalTemplate.objects.create(
        company=company,
        name=name[:200],
        competencies=_json_dumps(comps),
        scaleMax=scale,
        rateQuestions=bool(body.get("rateQuestions", True)),
        instructions=str(body.get("instructions") or "").strip()[:2000] or None,
    )
    audit(session["email"], "EVAL_TEMPLATE_CREATED", f"EvalTemplate:{tpl.name}")
    return Response({"template": eval_template_dict(tpl)})


@view(["GET", "PUT", "DELETE"])
def eval_template_detail_view(request, template_id: str):
    session = require_role(request, "RECRUITER", "ADMIN")
    tpl = _owned_template(session, template_id)

    if request.method == "GET":
        return Response({"template": eval_template_dict(tpl)})

    if request.method == "DELETE":
        linked = tpl.jobs.count()
        if linked > 0:
            raise ApiError(
                400,
                f"This template is linked to {linked} job(s) — unlink it from the job editor before deleting.",
            )
        name = tpl.name
        tpl.delete()
        audit(session["email"], "EVAL_TEMPLATE_DELETED", f"EvalTemplate:{name}")
        return Response({"ok": True})

    body = request.data if isinstance(request.data, dict) else {}
    if "name" in body:
        name = str(body.get("name") or "").strip()
        if not name:
            raise ApiError(400, "Template name is required.")
        tpl.name = name[:200]
    if "competencies" in body:
        comps = _clean_competencies(body.get("competencies"))
        if not comps:
            raise ApiError(400, "At least one competency with a label is required.")
        tpl.competencies = _json_dumps(comps)
    if "scaleMax" in body:
        try:
            tpl.scaleMax = max(1, min(10, int(body.get("scaleMax") or 5)))
        except (TypeError, ValueError):
            raise ApiError(400, "Rating scale must be a number (1-10).")
    if "rateQuestions" in body:
        tpl.rateQuestions = bool(body.get("rateQuestions"))
    if "instructions" in body:
        tpl.instructions = str(body.get("instructions") or "").strip()[:2000] or None
    tpl.save()
    audit(session["email"], "EVAL_TEMPLATE_UPDATED", f"EvalTemplate:{tpl.name}")
    return Response({"template": eval_template_dict(tpl)})


def _json_dumps(obj) -> str:
    import json as _json

    return _json.dumps(obj)
