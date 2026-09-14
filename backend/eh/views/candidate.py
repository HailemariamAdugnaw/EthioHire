"""EthioHire — candidate profile / documents / references endpoints
(port of src/app/api/candidate/*)."""
from django.db.models import Q
from rest_framework.response import Response

from ..common import ApiError, audit, view
from ..ehauth import require_role
from ..models import CandidateProfile, Document, ReferenceContact
from ..serializers import document_dict, reference_dict


def _get_or_create_profile(session) -> CandidateProfile:
    profile = CandidateProfile.objects.filter(userId_id=session["id"]).first()
    if not profile:
        profile = CandidateProfile.objects.create(userId_id=session["id"], fullName=session["name"])
    return profile


def _profile_payload(profile: CandidateProfile) -> dict:
    from ..serializers import candidate_dict

    data = candidate_dict(profile)
    docs = [document_dict(d) for d in profile.documents.all()]
    refs = [reference_dict(r) for r in profile.references.all()]
    data["documents"] = docs
    data["references"] = refs
    return data


@view(["GET", "PUT"])
def profile_view(request):
    session = require_role(request, "CANDIDATE")

    if request.method == "GET":
        profile = _get_or_create_profile(session)
        return Response({"profile": _profile_payload(profile)})

    # PUT — upsert with form-style coercion (numbers arrive as strings)
    body = request.data if isinstance(request.data, dict) else {}
    profile = _get_or_create_profile(session)

    def s(name):
        v = body.get(name)
        return (str(v).strip() or None) if v is not None else None

    profile.fullName = s("fullName") or session["name"]
    for f in ("phone", "universityName", "degreeLevel", "fieldOfStudy", "skills", "about", "cvUrl"):
        setattr(profile, f, s(f))

    def num(name, cast):
        v = body.get(name)
        if v is None or v == "":
            return None
        try:
            return cast(v)
        except (TypeError, ValueError):
            return None

    gy = num("graduationYear", int)
    profile.graduationYear = gy if gy else None
    if body.get("gpa") is not None and body.get("gpa") != "":
        try:
            profile.gpa = float(body["gpa"])
        except (TypeError, ValueError):
            profile.gpa = None
    else:
        profile.gpa = None
    if body.get("expectedSalary"):
        try:
            profile.expectedSalary = float(body["expectedSalary"])
        except (TypeError, ValueError):
            profile.expectedSalary = None
    else:
        profile.expectedSalary = None
    profile.experienceYears = num("experienceYears", int)

    profile.save()
    audit(session["email"], "PROFILE_UPDATED", f"CandidateProfile:{profile.id}")
    return Response({"profile": _profile_payload(profile)})


@view(["GET", "POST", "DELETE"])
def documents_view(request):
    session = require_role(request, "CANDIDATE")

    if request.method == "GET":
        profile = CandidateProfile.objects.filter(userId_id=session["id"]).first()
        if not profile:
            return Response({"documents": []})
        docs = profile.documents.all().order_by("-createdAt")
        return Response({"documents": [document_dict(d) for d in docs]})

    if request.method == "POST":
        body = request.data if isinstance(request.data, dict) else {}
        profile = CandidateProfile.objects.filter(userId_id=session["id"]).first()
        if not profile:
            raise ApiError(404, "Candidate profile not found.")
        valid_types = ["DEGREE", "TRANSCRIPT", "CERTIFICATE", "CV", "OTHER"]
        doc_type = body.get("type") if body.get("type") in valid_types else "OTHER"
        name = str(body.get("name") or "document")[:200]
        file_url = str(body.get("fileUrl") or "")[:4_000_000]
        doc = Document.objects.create(candidate=profile, type=doc_type, name=name, fileUrl=file_url)
        return Response({"document": document_dict(doc)})

    # DELETE ?id=
    doc_id = request.query_params.get("id")
    if not doc_id:
        raise ApiError(400, "Document id is required.")
    profile = CandidateProfile.objects.filter(userId_id=session["id"]).first()
    if not profile:
        raise ApiError(404, "Candidate profile not found.")
    Document.objects.filter(Q(id=doc_id), candidate=profile).delete()
    return Response({"ok": True})


@view(["GET", "POST"])
def references_view(request):
    session = require_role(request, "CANDIDATE")

    if request.method == "GET":
        profile = CandidateProfile.objects.filter(userId_id=session["id"]).first()
        if not profile:
            return Response({"references": []})
        refs = profile.references.all().order_by("-createdAt")
        return Response({"references": [reference_dict(r) for r in refs]})

    body = request.data if isinstance(request.data, dict) else {}
    profile = CandidateProfile.objects.filter(userId_id=session["id"]).first()
    if not profile:
        raise ApiError(404, "Candidate profile not found.")
    ref = ReferenceContact.objects.create(
        candidate=profile,
        name=str(body.get("name") or "").strip(),
        title=body.get("title"),
        company=body.get("company"),
        email=body.get("email"),
        phone=body.get("phone"),
        surveyStatus="SENT",  # simulated survey dispatch
    )
    return Response({"reference": reference_dict(ref)})
