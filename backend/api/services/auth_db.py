"""
PokerID user storage with SQLite. Prevents duplicate emails.
"""
import sqlite3
import uuid
from pathlib import Path
from typing import Optional

import bcrypt

DB_PATH = Path(__file__).resolve().parent.parent / "poker_users.db"


def _conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def init_db():
    """Create users table if not exists."""
    with _conn() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                username TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        c.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)")


def register(email: str | None, password: str, username: str) -> dict:
    """
    Register a new user. Username required.
    Email is optional; if omitted we generate an internal placeholder email.
    Returns { id, email, name }.
    """
    init_db()
    email = (email or "").strip().lower()
    name = (username or "").strip()
    if not name:
        raise ValueError("Display name is required")
    if len(name) < 2:
        raise ValueError("Display name must be at least 2 characters")
    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user_id = str(uuid.uuid4())
    if not email:
        email = f"{user_id}@pokerid.local"

    with _conn() as c:
        existing = c.execute("SELECT 1 FROM users WHERE username = ? LIMIT 1", (name.strip(),)).fetchone()
        if existing:
            raise ValueError("Username already registered")
        try:
            c.execute(
                "INSERT INTO users (id, email, password_hash, username) VALUES (?, ?, ?, ?)",
                (user_id, email, password_hash, name.strip()),
            )
        except sqlite3.IntegrityError:
            raise ValueError("Email or username already registered")

    return {"id": user_id, "email": email, "name": name}


def login(identifier: str, password: str) -> Optional[dict]:
    """
    Verify credentials by email or username. Returns { id, email, name } or None if invalid.
    """
    init_db()
    ident = (identifier or "").strip()
    if not ident:
        return None
    is_email = "@" in ident
    ident_norm = ident.lower() if is_email else ident

    with _conn() as c:
        if is_email:
            row = c.execute(
                "SELECT id, email, password_hash, username FROM users WHERE email = ?",
                (ident_norm,),
            ).fetchone()
        else:
            cnt = c.execute("SELECT COUNT(1) AS n FROM users WHERE username = ?", (ident_norm,)).fetchone()
            if cnt and int(cnt["n"]) > 1:
                # Older databases might have duplicate usernames; require email to disambiguate.
                raise ValueError("Multiple accounts share this username. Please sign in with email.")
            row = c.execute(
                "SELECT id, email, password_hash, username FROM users WHERE username = ?",
                (ident_norm,),
            ).fetchone()

    if not row:
        return None
    if not bcrypt.checkpw(password.encode("utf-8"), row["password_hash"].encode("utf-8")):
        return None

    name = row["username"] or row["email"].split("@")[0]
    return {"id": row["id"], "email": row["email"], "name": name}


def update_username(user_id: str, new_username: str) -> dict:
    """Update username. Returns updated user dict."""
    init_db()
    new_username = (new_username or "").strip()
    if not new_username:
        raise ValueError("Username cannot be empty")
    with _conn() as conn:
        cur = conn.execute("UPDATE users SET username = ? WHERE id = ?", (new_username, user_id))
        if cur.rowcount == 0:
            raise ValueError("User not found")
        row = conn.execute("SELECT id, email, username FROM users WHERE id = ?", (user_id,)).fetchone()
    name = row["username"] or row["email"].split("@")[0]
    return {"id": row["id"], "email": row["email"], "name": name}


def update_password(user_id: str, current_password: str, new_password: str) -> None:
    """Update password. Verifies current password first."""
    init_db()
    if len(new_password) < 6:
        raise ValueError("Password must be at least 6 characters")
    with _conn() as c:
        row = c.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        raise ValueError("User not found")
    if not bcrypt.checkpw(current_password.encode("utf-8"), row["password_hash"].encode("utf-8")):
        raise ValueError("Current password is incorrect")
    new_hash = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    with _conn() as conn:
        cur = conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, user_id))
        if cur.rowcount == 0:
            raise ValueError("User not found")
