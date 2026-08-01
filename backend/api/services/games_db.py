"""Games - create, join, track buy-ins, settlements."""
import sqlite3
import random
import string
import uuid
from pathlib import Path
from datetime import datetime

DB_PATH = Path(__file__).resolve().parent.parent / "poker_users.db"


def _conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def _gen_code() -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


def init_db():
    # Ensure users table exists on fresh DBs (invite-by-email uses it)
    try:
        from api.services.auth_db import init_db as _init_users_db
        _init_users_db()
    except Exception:
        pass
    with _conn() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS games (
                id TEXT PRIMARY KEY,
                host_id TEXT NOT NULL,
                join_code TEXT UNIQUE NOT NULL,
                status TEXT DEFAULT 'active',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        c.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_games_code ON games(join_code)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_games_host ON games(host_id)")
        c.execute("""
            CREATE TABLE IF NOT EXISTS game_players (
                game_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                user_name TEXT NOT NULL,
                initial_buy_in REAL DEFAULT 0,
                total_buy_in REAL DEFAULT 0,
                cash_out REAL,
                left_at TEXT,
                PRIMARY KEY (game_id, user_id),
                FOREIGN KEY (game_id) REFERENCES games(id)
            )
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS game_invites (
                game_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                PRIMARY KEY (game_id, user_id)
            )
        """)


def create_game(host_id: str, host_name: str) -> dict:
    """Create a new game. Returns { id, join_code, ... }."""
    init_db()
    game_id = str(uuid.uuid4())
    for _ in range(20):
        code = _gen_code()
        with _conn() as c:
            try:
                c.execute(
                    "INSERT INTO games (id, host_id, join_code) VALUES (?, ?, ?)",
                    (game_id, host_id, code),
                )
                c.execute(
                    "INSERT INTO game_players (game_id, user_id, user_name, initial_buy_in, total_buy_in) VALUES (?, ?, ?, 0, 0)",
                    (game_id, host_id, host_name),
                )
            except sqlite3.IntegrityError:
                continue
        
        # After the context manager exits, the transaction is committed
        return get_game(game_id)
    raise ValueError("Could not generate unique code")


def get_game_by_code(join_code: str) -> dict | None:
    """Get game by join code. Returns game dict with players or None."""
    init_db()
    code = join_code.strip().upper()
    with _conn() as c:
        row = c.execute("SELECT id, host_id, join_code, status FROM games WHERE join_code = ?", (code,)).fetchone()
        if not row:
            return None
        players = c.execute(
            "SELECT user_id, user_name, initial_buy_in, total_buy_in, cash_out, left_at FROM game_players WHERE game_id = ?",
            (row["id"],),
        ).fetchall()
        return {
            "id": row["id"],
            "host_id": row["host_id"],
            "join_code": row["join_code"],
            "status": row["status"],
            "players": [
                {
                    "user_id": p["user_id"],
                    "user_name": p["user_name"],
                    "initial_buy_in": p["initial_buy_in"],
                    "total_buy_in": p["total_buy_in"],
                    "cash_out": p["cash_out"],
                    "left_at": p["left_at"],
                }
                for p in players
            ],
        }


def get_game(game_id: str) -> dict | None:
    init_db()
    with _conn() as c:
        try:
            row = c.execute("SELECT id, host_id, join_code, status, created_at, display_name FROM games WHERE id = ?", (game_id,)).fetchone()
        except sqlite3.OperationalError:
            row = c.execute("SELECT id, host_id, join_code, status, created_at FROM games WHERE id = ?", (game_id,)).fetchone()
        if not row:
            return None
        players = c.execute(
            "SELECT user_id, user_name, initial_buy_in, total_buy_in, cash_out, left_at FROM game_players WHERE game_id = ?",
            (game_id,),
        ).fetchall()
        invites = c.execute("SELECT user_id FROM game_invites WHERE game_id = ?", (game_id,)).fetchall()
        try:
            disp = row["display_name"]
        except (KeyError, IndexError):
            disp = None
        return {
            "id": row["id"],
            "host_id": row["host_id"],
            "join_code": row["join_code"],
            "display_name": disp,
            "status": row["status"],
            "created_at": row["created_at"],
            "players": [
                {
                    "user_id": p["user_id"],
                    "user_name": p["user_name"],
                    "initial_buy_in": p["initial_buy_in"],
                    "total_buy_in": p["total_buy_in"],
                    "cash_out": p["cash_out"],
                    "left_at": p["left_at"],
                }
                for p in players
            ],
            "invited_ids": [i["user_id"] for i in invites],
        }


def join_game(game_id: str, user_id: str, user_name: str, initial_buy_in: float) -> dict:
    """Join a game with initial buy-in. Raises ValueError if already in game or game full/invalid."""
    init_db()
    with _conn() as c:
        row = c.execute("SELECT status FROM games WHERE id = ?", (game_id,)).fetchone()
        if not row:
            raise ValueError("Game not found")
        if row["status"] != "active":
            raise ValueError("Game has ended")
        existing = c.execute("SELECT 1 FROM game_players WHERE game_id = ? AND user_id = ?", (game_id, user_id)).fetchone()
        if existing:
            raise ValueError("Already in this game")
        bi = max(0, float(initial_buy_in))
        c.execute(
            "INSERT INTO game_players (game_id, user_id, user_name, initial_buy_in, total_buy_in) VALUES (?, ?, ?, ?, ?)",
            (game_id, user_id, user_name, bi, bi),
        )
    return get_game(game_id)


def add_buy_in(game_id: str, user_id: str, amount: float) -> dict:
    """Add to player's total buy-in."""
    init_db()
    amt = max(0, float(amount))
    with _conn() as conn:
        cur = conn.execute(
            "UPDATE game_players SET total_buy_in = total_buy_in + ? WHERE game_id = ? AND user_id = ? AND left_at IS NULL",
            (amt, game_id, user_id),
        )
        if cur.rowcount == 0:
            raise ValueError("Player not in game or already left")
    return get_game(game_id)


def leave_game(game_id: str, user_id: str, cash_out: float) -> dict:
    """Leave game with final cash-out."""
    init_db()
    with _conn() as conn:
        cur = conn.execute(
            "UPDATE game_players SET cash_out = ?, left_at = ? WHERE game_id = ? AND user_id = ?",
            (float(cash_out), datetime.utcnow().isoformat(), game_id, user_id),
        )
        if cur.rowcount == 0:
            raise ValueError("Player not in game")
    return get_game(game_id)


def invite_friends(game_id: str, host_id: str, friend_ids: list[str]) -> None:
    """Invite friends to game. Host must own the game."""
    init_db()
    with _conn() as c:
        row = c.execute("SELECT host_id FROM games WHERE id = ?", (game_id,)).fetchone()
        if not row or row["host_id"] != host_id:
            raise ValueError("Not the host")
        for fid in friend_ids:
            try:
                c.execute("INSERT OR IGNORE INTO game_invites (game_id, user_id) VALUES (?, ?)", (game_id, fid))
            except Exception:
                pass


def invite_by_email(game_id: str, host_id: str, email: str) -> dict:
    """Host invites a user to the game by email. User must accept to join."""
    init_db()
    email = email.strip().lower()
    with _conn() as c:
        row = c.execute("SELECT host_id, status FROM games WHERE id = ?", (game_id,)).fetchone()
        if not row or row["host_id"] != host_id:
            raise ValueError("Not the host")
        if row["status"] != "active":
            raise ValueError("Game has ended")
        user = c.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if not user:
            raise ValueError("No user found with that email")
        uid = user["id"]
        existing = c.execute("SELECT 1 FROM game_players WHERE game_id = ? AND user_id = ?", (game_id, uid)).fetchone()
        if existing:
            raise ValueError("Already in game")
        c.execute("INSERT OR IGNORE INTO game_invites (game_id, user_id) VALUES (?, ?)", (game_id, uid))
    return get_game(game_id)


def add_player_manually(game_id: str, host_id: str, name: str) -> dict:
    """Host manually adds a player (e.g. someone without an account)."""
    init_db()
    name = (name or "").strip()
    if not name:
        raise ValueError("Name required")
    manual_id = "manual-" + str(uuid.uuid4())
    with _conn() as c:
        row = c.execute("SELECT host_id FROM games WHERE id = ?", (game_id,)).fetchone()
        if not row or row["host_id"] != host_id:
            raise ValueError("Not the host")
        c.execute(
            "INSERT INTO game_players (game_id, user_id, user_name, initial_buy_in, total_buy_in) VALUES (?, ?, ?, 0, 0)",
            (game_id, manual_id, name),
        )
    return get_game(game_id)


def invite_friends_to_game(game_id: str, host_id: str, friend_ids: list[str]) -> dict:
    """Host invites friends to game. They must accept to join."""
    init_db()
    with _conn() as c:
        row = c.execute("SELECT host_id, status FROM games WHERE id = ?", (game_id,)).fetchone()
        if not row or row["host_id"] != host_id:
            raise ValueError("Not the host")
        if row["status"] != "active":
            raise ValueError("Game has ended")
        for uid in friend_ids:
            existing = c.execute("SELECT 1 FROM game_players WHERE game_id = ? AND user_id = ?", (game_id, uid)).fetchone()
            if not existing:
                c.execute("INSERT OR IGNORE INTO game_invites (game_id, user_id) VALUES (?, ?)", (game_id, uid))
    return get_game(game_id)


def get_pending_game_invites(user_id: str) -> list:
    """Get games this user is invited to (not yet joined)."""
    init_db()
    with _conn() as c:
        rows = c.execute("""
            SELECT g.id, g.join_code, g.display_name, g.host_id
            FROM game_invites gi
            JOIN games g ON g.id = gi.game_id
            LEFT JOIN game_players gp ON gp.game_id = g.id AND gp.user_id = ?
            WHERE gi.user_id = ? AND g.status = 'active' AND gp.user_id IS NULL
        """, (user_id, user_id)).fetchall()
    return [{"id": r["id"], "join_code": r["join_code"], "display_name": r["display_name"], "host_id": r["host_id"]} for r in rows]


def accept_game_invite(game_id: str, user_id: str, user_name: str, initial_buy_in: float = 0) -> dict:
    """Accept a game invite and join the game."""
    init_db()
    with _conn() as c:
        row = c.execute("SELECT 1 FROM game_invites WHERE game_id = ? AND user_id = ?", (game_id, user_id)).fetchone()
        if not row:
            raise ValueError("No invite found")
        c.execute("DELETE FROM game_invites WHERE game_id = ? AND user_id = ?", (game_id, user_id))
    return join_game(game_id, user_id, user_name, initial_buy_in)


def end_game(game_id: str, host_id: str) -> dict:
    """Mark game as ended. Returns game with settlements."""
    init_db()
    with _conn() as c:
        row = c.execute("SELECT host_id FROM games WHERE id = ?", (game_id,)).fetchone()
        if not row or row["host_id"] != host_id:
            raise ValueError("Not the host")
        c.execute("UPDATE games SET status = 'ended' WHERE id = ?", (game_id,))
    return get_game(game_id)


def rename_game(game_id: str, user_id: str, new_name: str) -> dict:
    """Rename game display name. Only host can rename."""
    init_db()
    new_name = (new_name or "").strip()[:30] or None
    if not new_name:
        raise ValueError("Name required")
    try:
        with _conn() as c:
            c.execute("ALTER TABLE games ADD COLUMN display_name TEXT")
    except sqlite3.OperationalError:
        pass  # column exists
    with _conn() as c:
        row = c.execute("SELECT host_id FROM games WHERE id = ?", (game_id,)).fetchone()
        if not row:
            raise ValueError("Game not found")
        if row["host_id"] != user_id:
            raise ValueError("Only host can rename")
        c.execute("UPDATE games SET display_name = ? WHERE id = ?", (new_name, game_id))
    return get_game(game_id)


def delete_game(game_id: str, user_id: str) -> None:
    """Delete a game. Only host can delete."""
    init_db()
    with _conn() as c:
        row = c.execute("SELECT host_id FROM games WHERE id = ?", (game_id,)).fetchone()
        if not row:
            raise ValueError("Game not found")
        if row["host_id"] != user_id:
            raise ValueError("Only host can delete")
        c.execute("DELETE FROM game_players WHERE game_id = ?", (game_id,))
        c.execute("DELETE FROM game_invites WHERE game_id = ?", (game_id,))
        c.execute("DELETE FROM games WHERE id = ?", (game_id,))


def list_user_games(user_id: str) -> list:
    """List games the user has participated in (past and active)."""
    init_db()
    with _conn() as c:
        try:
            rows = c.execute("""
                SELECT g.id, g.host_id, g.join_code, g.display_name, g.status, g.created_at
                FROM games g
                JOIN game_players gp ON gp.game_id = g.id
                WHERE gp.user_id = ?
                ORDER BY g.created_at DESC
            """, (user_id,)).fetchall()
        except sqlite3.OperationalError:
            rows = c.execute("""
                SELECT g.id, g.host_id, g.join_code, g.status, g.created_at
                FROM games g
                JOIN game_players gp ON gp.game_id = g.id
                WHERE gp.user_id = ?
                ORDER BY g.created_at DESC
            """, (user_id,)).fetchall()
    out = []
    for r in rows:
        d = {"id": r["id"], "host_id": r["host_id"], "join_code": r["join_code"], "status": r["status"], "created_at": r["created_at"]}
        try:
            d["display_name"] = r["display_name"]
        except (KeyError, IndexError):
            pass
        out.append(d)
    return out
