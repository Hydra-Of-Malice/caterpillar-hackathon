"""Append-only audit log helpers (state changes, approvals, instructor drill-downs, content gaps)."""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.store.models import AuditLogRow


def write_audit(s: Session, *, actor: str, role: str, action: str, target: str,
                data: dict[str, Any] | None = None) -> AuditLogRow:
    """Add one audit row to the session (committed with the caller's transaction)."""
    row = AuditLogRow(actor=actor, role=role, action=action, target=target, data=data or {})
    s.add(row)
    return row


def audit_rows(s: Session, action: str, target_prefix: str | None = None) -> list[AuditLogRow]:
    """Audit rows for one action, oldest first, optionally filtered by target prefix."""
    q = select(AuditLogRow).where(AuditLogRow.action == action).order_by(AuditLogRow.id)
    rows = list(s.scalars(q))
    if target_prefix is not None:
        rows = [r for r in rows if r.target.startswith(target_prefix)]
    return rows
