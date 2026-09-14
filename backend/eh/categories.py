"""EthioHire — standardized job categories.

The Category field used to be free text, which produced inconsistent names
("IT", "I.T.", "Software Engineering" …) and made filtering unreliable.
Recruiters now pick from this exact standardized list and the backend
validates every write against it (see views/jobs.py).
"""

JOB_CATEGORIES = [
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
]

_CATEGORY_SET = frozenset(JOB_CATEGORIES)


def is_valid_category(value) -> bool:
    return bool(value) and str(value).strip() in _CATEGORY_SET


def validate_category(value, required: bool = False) -> str | None:
    """Validate a client-supplied category. Returns the normalized category
    (or None when absent-and-optional). Raises ApiError(400) on bad values."""
    from .common import ApiError

    if value in (None, ""):
        if required:
            raise ApiError(400, "Category is required — pick one from the standardized list.")
        return None
    val = str(value).strip()
    if val not in _CATEGORY_SET:
        raise ApiError(
            400,
            "Unknown category — pick one from the standardized category list "
            "(see the dropdown in the job editor).",
        )
    return val


__all__ = ["JOB_CATEGORIES", "is_valid_category", "validate_category"]
