"""Engine / session helpers. Usage:

    from sentinel.store.db import Database
    edge = Database.edge()          # data/edge.db
    with edge.session() as s: ...
"""
from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from sentinel.shared import config
from sentinel.store import taskcentre_models  # noqa: F401 - registers the tc_* tables on Base
from sentinel.store.models import Base


class Database:
    def __init__(self, url: str) -> None:
        self.url = url
        self.engine = create_engine(url, connect_args={"check_same_thread": False} if url.startswith("sqlite") else {})
        if url.startswith("sqlite"):
            @event.listens_for(self.engine, "connect")
            def _pragma(dbapi_conn, _):  # noqa: ANN001
                cur = dbapi_conn.cursor()
                cur.execute("PRAGMA journal_mode=WAL")
                cur.execute("PRAGMA synchronous=NORMAL")
                cur.close()
        Base.metadata.create_all(self.engine)
        self._sessionmaker = sessionmaker(self.engine, expire_on_commit=False)

    @contextmanager
    def session(self) -> Iterator[Session]:
        s = self._sessionmaker()
        try:
            yield s
            s.commit()
        except Exception:
            s.rollback()
            raise
        finally:
            s.close()

    @classmethod
    def edge(cls) -> "Database":
        return cls(config.EDGE_DB_URL)

    @classmethod
    def cloud(cls) -> "Database":
        return cls(config.CLOUD_DB_URL)

    @classmethod
    def memory(cls) -> "Database":
        return cls("sqlite:///:memory:")
