"""Poker winnings tracking - buy-ins, profits, sessions."""
import sqlite3
import uuid
from pathlib import Path
from typing import Optional

DB_PATH = Path(__file__).resolve().parent.parent / "poker_users.db"


def _conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def init_db():
    with _conn() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS winnings (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                session_date TEXT NOT NULL,
                buy_in REAL NOT NULL DEFAULT 0,
                cash_out REAL NOT NULL DEFAULT 0,
                profit REAL NOT NULL,
                hours REAL DEFAULT 0,
                notes TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        try:
            c.execute("ALTER TABLE winnings ADD COLUMN hours REAL DEFAULT 0")
        except sqlite3.OperationalError:
            pass
        c.execute("CREATE INDEX IF NOT EXISTS idx_winnings_user ON winnings(user_id)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_winnings_date ON winnings(session_date)")


def add_entry(user_id: str, session_date: str, buy_in: float, cash_out: float, notes: str = "", hours: float = 0) -> dict:
    init_db()
    co = cash_out if cash_out is not None else 0
    profit = co - buy_in
    eid = str(uuid.uuid4())
    with _conn() as c:
        c.execute(
            "INSERT INTO winnings (id, user_id, session_date, buy_in, cash_out, profit, hours, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (eid, user_id, session_date, buy_in, co, profit, hours or 0, notes or ""),
        )
    return {"id": eid, "session_date": session_date, "buy_in": buy_in, "cash_out": cash_out, "profit": profit}


def get_entries(user_id: str, period: str = "all") -> list:
    """period: all, daily, monthly, yearly"""
    init_db()
    with _conn() as c:
        rows = c.execute(
            "SELECT id, session_date, buy_in, cash_out, profit, hours, notes, created_at FROM winnings WHERE user_id = ? ORDER BY session_date DESC, created_at DESC",
            (user_id,),
        ).fetchall()
    entries = [dict(r) for r in rows]
    if period == "daily":
        from datetime import datetime, timedelta
        cutoff = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        entries = [e for e in entries if e["session_date"] >= cutoff]
    elif period == "monthly":
        from datetime import datetime, timedelta
        cutoff = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        entries = [e for e in entries if e["session_date"] >= cutoff]
    elif period == "yearly":
        from datetime import datetime, timedelta
        cutoff = (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d")
        entries = [e for e in entries if e["session_date"] >= cutoff]
    return entries


def delete_entry(user_id: str, entry_id: str) -> bool:
    init_db()
    with _conn() as conn:
        cur = conn.execute("DELETE FROM winnings WHERE id = ? AND user_id = ?", (entry_id, user_id))
        return cur.rowcount > 0


def update_entry(user_id: str, entry_id: str, session_date: str, buy_in: float, cash_out: float, notes: str = "", hours: float = 0) -> dict:
    init_db()
    co = cash_out if cash_out is not None else 0
    profit = co - buy_in
    with _conn() as conn:
        cur = conn.execute(
            "UPDATE winnings SET session_date=?, buy_in=?, cash_out=?, profit=?, hours=?, notes=? WHERE id=? AND user_id=?",
            (session_date, buy_in, co, profit, hours or 0, notes or "", entry_id, user_id),
        )
        if cur.rowcount == 0:
            raise ValueError("Entry not found")
    return {"id": entry_id, "session_date": session_date, "buy_in": buy_in, "cash_out": cash_out, "profit": profit, "hours": hours or 0, "notes": notes or ""}
