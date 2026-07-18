"""Friends - add friends from the database."""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "poker_users.db"


def _conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def init_db():
    # Ensure users table exists on fresh DBs (friends endpoints join against it)
    try:
        from api.services.auth_db import init_db as _init_users_db
        _init_users_db()
    except Exception:
        # If auth_db isn't available for some reason, let downstream queries raise.
        pass
    with _conn() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS friends (
                user_id TEXT NOT NULL,
                friend_id TEXT NOT NULL,
                PRIMARY KEY (user_id, friend_id),
                CHECK (user_id != friend_id)
            )
        """)
        c.execute("CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id)")
        c.execute("""
            CREATE TABLE IF NOT EXISTS friend_requests (
                from_id TEXT NOT NULL,
                to_id TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (from_id, to_id),
                CHECK (from_id != to_id)
            )
        """)
        c.execute("CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(to_id)")


def add_friend(user_id: str, friend_id: str) -> None:
    """Direct add (legacy) - prefer send_friend_request + accept."""
    if user_id == friend_id:
        raise ValueError("Cannot add yourself")
    init_db()
    with _conn() as c:
        try:
            c.execute("INSERT INTO friends (user_id, friend_id) VALUES (?, ?)", (user_id, friend_id))
            c.execute("INSERT INTO friends (user_id, friend_id) VALUES (?, ?)", (friend_id, user_id))
        except sqlite3.IntegrityError:
            raise ValueError("Already friends or invalid")


def send_friend_request(from_id: str, to_id: str) -> None:
    """Send a friend request. Recipient must accept."""
    if from_id == to_id:
        raise ValueError("Cannot add yourself")
    init_db()
    with _conn() as c:
        existing = c.execute("SELECT 1 FROM friends WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)",
                             (from_id, to_id, to_id, from_id)).fetchone()
        if existing:
            raise ValueError("Already friends")
        pending = c.execute("SELECT 1 FROM friend_requests WHERE from_id=? AND to_id=?", (from_id, to_id)).fetchone()
        if pending:
            raise ValueError("Request already sent")
        try:
            c.execute("INSERT INTO friend_requests (from_id, to_id) VALUES (?, ?)", (from_id, to_id))
        except sqlite3.IntegrityError:
            raise ValueError("Request already sent")


def accept_friend_request(to_id: str, from_id: str) -> None:
    """Accept a friend request."""
    init_db()
    with _conn() as c:
        row = c.execute("SELECT 1 FROM friend_requests WHERE from_id=? AND to_id=?", (from_id, to_id)).fetchone()
        if not row:
            raise ValueError("No pending request")
        c.execute("DELETE FROM friend_requests WHERE from_id=? AND to_id=?", (from_id, to_id))
        c.execute("INSERT OR IGNORE INTO friends (user_id, friend_id) VALUES (?, ?), (?, ?)",
                  (from_id, to_id, to_id, from_id))


def decline_friend_request(to_id: str, from_id: str) -> None:
    """Decline a friend request."""
    init_db()
    with _conn() as c:
        c.execute("DELETE FROM friend_requests WHERE from_id=? AND to_id=?", (from_id, to_id))


def get_pending_requests(user_id: str) -> list:
    """Get incoming friend requests for user."""
    init_db()
    with _conn() as c:
        rows = c.execute("""
            SELECT u.id, u.email, u.username, fr.from_id
            FROM friend_requests fr
            JOIN users u ON u.id = fr.from_id
            WHERE fr.to_id = ?
        """, (user_id,)).fetchall()
    return [{"id": r["id"], "email": r["email"], "name": r["username"] or r["email"].split("@")[0], "from_id": r["from_id"]} for r in rows]


def get_sent_requests(user_id: str) -> set:
    """Get set of user IDs this user has sent requests to."""
    init_db()
    with _conn() as c:
        rows = c.execute("SELECT to_id FROM friend_requests WHERE from_id=?", (user_id,)).fetchall()
    return {r["to_id"] for r in rows}


def remove_friend(user_id: str, friend_id: str) -> None:
    init_db()
    with _conn() as c:
        c.execute("DELETE FROM friends WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)",
                  (user_id, friend_id, friend_id, user_id))


def get_friends(user_id: str) -> list:
    init_db()
    with _conn() as c:
        rows = c.execute("""
            SELECT u.id, u.email, u.username FROM users u
            JOIN friends f ON f.friend_id = u.id
            WHERE f.user_id = ?
        """, (user_id,)).fetchall()
    return [{"id": r["id"], "email": r["email"], "name": r["username"] or r["email"].split("@")[0]} for r in rows]


def list_all_users(user_id: str, limit: int = 50) -> list:
    """List all users except self. Excludes current friends."""
    init_db()
    with _conn() as c:
        rows = c.execute("""
            SELECT u.id, u.email, u.username FROM users u
            WHERE u.id != ?
            AND u.id NOT IN (SELECT friend_id FROM friends WHERE user_id = ?)
            ORDER BY u.email
            LIMIT ?
        """, (user_id, user_id, limit)).fetchall()
    return [{"id": r["id"], "email": r["email"], "name": r["username"] or r["email"].split("@")[0]} for r in rows]


def search_users(user_id: str, query: str) -> list:
    """Search users by email or username (exclude self and existing friends)."""
    init_db()
    q = f"%{query.strip()}%" if query.strip() else "%"
    with _conn() as c:
        rows = c.execute("""
            SELECT u.id, u.email, u.username FROM users u
            WHERE (u.email LIKE ? OR u.username LIKE ?) AND u.id != ?
            AND u.id NOT IN (SELECT friend_id FROM friends WHERE user_id = ?)
            LIMIT 20
        """, (q, q, user_id, user_id)).fetchall()
    return [{"id": r["id"], "email": r["email"], "name": r["username"] or r["email"].split("@")[0]} for r in rows]
