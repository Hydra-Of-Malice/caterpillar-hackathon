"""Task Centre chat: pair-scoped supervisor <-> operator messages.

One thread per (supervisor, operator) pair, keyed ``"<supervisor_id>:<operator_id>"`` whichever
direction a message travels. Scoping is enforced here, in the API: an operator may only talk to
their own supervisor, a supervisor only to their own operators, and an admin may read any thread
but never post as somebody else. All timestamps are UTC seconds, displayed as GMT.
"""
from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.cloud.api.deps import get_session
from sentinel.shared.schemas import new_id
from sentinel.store.taskcentre_models import ChatMessageRow, UserRow
from sentinel.taskcentre.auth import current_user
from sentinel.taskcentre.service import gmt_iso, notify, user_public

router = APIRouter(prefix="/tc/chat", tags=["task-centre-chat"])

MESSAGE_LIMIT = 200


class MessageIn(BaseModel):
    """A chat message typed by a person (system messages are written server-side)."""
    text: str = Field(min_length=1, max_length=2000)
    task_id: str | None = None


def thread_key(supervisor_id: str, operator_id: str) -> str:
    """Key for a supervisor <-> operator thread; identical in both directions."""
    return f"{supervisor_id}:{operator_id}"


def resolve_pair(s: Session, user: UserRow, other_user_id: str) -> tuple[UserRow, UserRow]:
    """Return ``(supervisor, operator)`` for the thread between `user` and `other_user_id`.

    404 when the other user does not exist, 403 when the pair is outside the caller's scope.
    An admin must name an operator: the thread returned is that operator's thread with their
    own supervisor.
    """
    other = s.get(UserRow, other_user_id)
    if other is None:
        raise HTTPException(404, f"user {other_user_id!r} not found")
    if user.role == "operator":
        if not user.supervisor_id or other.user_id != user.supervisor_id:
            raise HTTPException(403, "an operator may only chat with their own supervisor")
        return other, user
    if user.role == "supervisor":
        if other.role != "operator" or other.supervisor_id != user.user_id:
            raise HTTPException(403, "a supervisor may only chat with their own operators")
        return user, other
    if other.role != "operator":
        raise HTTPException(400, "name an operator to read a thread")
    supervisor = s.get(UserRow, other.supervisor_id) if other.supervisor_id else None
    if supervisor is None:
        raise HTTPException(404, f"operator {other.user_id!r} has no supervisor")
    return supervisor, other


def post_message(s: Session, *, supervisor_id: str, operator_id: str, from_user_id: str, to_user_id: str,
                 text: str, task_id: str | None = None, system: bool = False) -> ChatMessageRow:
    """Append a message to the pair's thread and notify the recipient. Used by the review flow too."""
    key = thread_key(supervisor_id, operator_id)
    # Strictly increasing ts per thread: the coarse system clock can stamp two rapid messages
    # identically, and a poller using ?since_ts= (exclusive) would then never see the second one.
    last = s.scalars(select(ChatMessageRow.ts).where(ChatMessageRow.thread_key == key)
                     .order_by(ChatMessageRow.ts.desc()).limit(1)).first()
    ts = time.time()
    if last is not None and ts <= last:
        ts = last + 0.001
    row = ChatMessageRow(message_id=new_id("tcmsg"), thread_key=key,
                         from_user_id=from_user_id, to_user_id=to_user_id, ts=ts, text=text,
                         task_id=task_id, system=system)
    s.add(row)
    s.flush()
    notify(s, to_user_id, kind="chat", title="New message" if not system else "Message from your supervisor",
           body=text[:200], severity="info", link="/tc/op" if system else None)
    return row


def message_dict(row: ChatMessageRow, viewer_id: str) -> dict[str, Any]:
    """Wire form of one message."""
    return {"message_id": row.message_id, "thread_key": row.thread_key, "from_user_id": row.from_user_id,
            "to_user_id": row.to_user_id, "ts": row.ts, "ts_gmt": gmt_iso(row.ts), "text": row.text,
            "task_id": row.task_id, "system": bool(row.system), "read_at": row.read_at,
            "mine": row.from_user_id == viewer_id}


@router.get("/{other_user_id}")
def get_thread(other_user_id: str, limit: int = Query(MESSAGE_LIMIT, ge=1, le=500),
               since_ts: float | None = Query(None, description="only messages strictly newer than this"),
               s: Session = Depends(get_session), user: UserRow = Depends(current_user)) -> dict[str, Any]:
    """The pair's messages, oldest first. Messages addressed to the caller are marked read."""
    supervisor, operator = resolve_pair(s, user, other_user_id)
    key = thread_key(supervisor.user_id, operator.user_id)
    q = select(ChatMessageRow).where(ChatMessageRow.thread_key == key)
    if since_ts is not None:
        q = q.where(ChatMessageRow.ts > since_ts)
    rows = list(s.scalars(q.order_by(ChatMessageRow.ts.desc()).limit(limit)))
    rows.reverse()
    now = time.time()
    is_participant = user.user_id in (supervisor.user_id, operator.user_id)
    if is_participant:
        for row in rows:
            if row.to_user_id == user.user_id and row.read_at is None:
                row.read_at = now
    return {"thread_key": key, "supervisor": user_public(supervisor), "operator": user_public(operator),
            "me": user.user_id, "can_post": is_participant, "read_only": not is_participant,
            "generated_at": now, "generated_at_gmt": gmt_iso(now),
            "messages": [message_dict(r, user.user_id) for r in rows]}


@router.post("/{other_user_id}")
def send_message(other_user_id: str, body: MessageIn, s: Session = Depends(get_session),
                 user: UserRow = Depends(current_user)) -> dict[str, Any]:
    """Send a message to the other side of the pair. Admins may read threads but not post in them."""
    supervisor, operator = resolve_pair(s, user, other_user_id)
    if user.user_id not in (supervisor.user_id, operator.user_id):
        raise HTTPException(403, "an admin may read a thread but not post as somebody else")
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "text is empty")
    row = post_message(s, supervisor_id=supervisor.user_id, operator_id=operator.user_id,
                       from_user_id=user.user_id, to_user_id=other_user_id, text=text, task_id=body.task_id)
    return message_dict(row, user.user_id)
