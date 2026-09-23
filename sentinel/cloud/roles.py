"""Roles for the MOCK auth header `X-Role` (no real identity provider in the prototype)."""
from __future__ import annotations

from enum import Enum


class Role(str, Enum):
    operator = "operator"
    trainee = "trainee"
    instructor = "instructor"
    supervisor = "supervisor"
    ml_service = "ml_service"
    system = "system"          # internal only (gap rule, re-assessment); never accepted from the header


HEADER_ROLES = frozenset(r.value for r in Role if r is not Role.system)
DEFAULT_ROLE = Role.operator   # MOCK: a request without X-Role is treated as the operator
LEARNER_ROLES = frozenset({Role.operator, Role.trainee})
# Roles that may verify a competency as DEMONSTRATED and approve training content. The prototype
# ships two roles (operator, supervisor), so the supervisor carries the instructor's sign-off duty;
# `instructor` stays accepted for deployments that separate the two.
VERIFIER_ROLES = frozenset({Role.instructor, Role.supervisor})


def parse_role(value: str | None) -> Role | None:
    """Map an `X-Role` header value to a Role; None when the value is not an accepted header role."""
    if value is None or not value.strip():
        return DEFAULT_ROLE
    v = value.strip().lower()
    return Role(v) if v in HEADER_ROLES else None
