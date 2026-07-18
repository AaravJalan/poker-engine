"""
Supabase PostgreSQL backend for friends, games, winnings.
Used when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set (e.g. on Vercel).
"""
import os
import random
import string
import uuid
from datetime import datetime, timedelta
from typing import Optional

from supabase import create_client, Client


def _client() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    return create_client(url, key)


def _gen_code() -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


def _ensure_uuid(s: str) -> str:
    """Return string as-is; used for consistency."""
    return str(s)


# ---- Friends ----

def add_friend(user_id: str, friend_id: str) -> None:
    if user_id == friend_id:
        raise ValueError("Cannot add yourself")
    sb = _client()
    try:
        sb.table("friends").insert([
            {"user_id": user_id, "friend_id": friend_id},
            {"user_id": friend_id, "friend_id": user_id},
        ]).execute()
    except Exception as e:
        if "duplicate" in str(e).lower() or "unique" in str(e).lower():
            raise ValueError("Already friends or invalid")
        raise


def send_friend_request(from_id: str, to_id: str) -> None:
    if from_id == to_id:
        raise ValueError("Cannot add yourself")
    sb = _client()
    # Check existing friends (either direction)
    r1 = sb.table("friends").select("user_id").eq("user_id", from_id).eq("friend_id", to_id).execute()
    r2 = sb.table("friends").select("user_id").eq("user_id", to_id).eq("friend_id", from_id).execute()
    if (r1.data and len(r1.data) > 0) or (r2.data and len(r2.data) > 0):
        raise ValueError("Already friends")
    r = sb.table("friend_requests").select("from_id").eq("from_id", from_id).eq("to_id", to_id).execute()
    if r.data and len(r.data) > 0:
        raise ValueError("Request already sent")
    try:
        sb.table("friend_requests").insert({"from_id": from_id, "to_id": to_id}).execute()
    except Exception as e:
        if "duplicate" in str(e).lower():
            raise ValueError("Request already sent")
        raise


def accept_friend_request(to_id: str, from_id: str) -> None:
    sb = _client()
    r = sb.table("friend_requests").select("from_id").eq("from_id", from_id).eq("to_id", to_id).execute()
    if not r.data or len(r.data) == 0:
        raise ValueError("No pending request")
    sb.table("friend_requests").delete().eq("from_id", from_id).eq("to_id", to_id).execute()
    sb.table("friends").insert([
        {"user_id": from_id, "friend_id": to_id},
        {"user_id": to_id, "friend_id": from_id},
    ]).execute()


def decline_friend_request(to_id: str, from_id: str) -> None:
    sb = _client()
    sb.table("friend_requests").delete().eq("from_id", from_id).eq("to_id", to_id).execute()


def get_pending_requests(user_id: str) -> list:
    sb = _client()
    r = sb.table("friend_requests").select("from_id").eq("to_id", user_id).execute()
    if not r.data:
        return []
    from_ids = [row["from_id"] for row in r.data]
    if not from_ids:
        return []
    profiles = sb.table("profiles").select("id,email,username").in_("id", from_ids).execute()
    by_id = {p["id"]: p for p in (profiles.data or [])}
    return [
        {
            "id": fid,
            "email": by_id.get(fid, {}).get("email", ""),
            "name": (by_id.get(fid, {}).get("username") or by_id.get(fid, {}).get("email", "").split("@")[0]),
            "from_id": fid,
        }
        for fid in from_ids
    ]


def get_sent_requests(user_id: str) -> set:
    sb = _client()
    r = sb.table("friend_requests").select("to_id").eq("from_id", user_id).execute()
    return {row["to_id"] for row in (r.data or [])}


def remove_friend(user_id: str, friend_id: str) -> None:
    sb = _client()
    sb.table("friends").delete().eq("user_id", user_id).eq("friend_id", friend_id).execute()
    sb.table("friends").delete().eq("user_id", friend_id).eq("friend_id", user_id).execute()


def get_friends(user_id: str) -> list:
    sb = _client()
    r = sb.table("friends").select("friend_id").eq("user_id", user_id).execute()
    friend_ids = [row["friend_id"] for row in (r.data or [])]
    if not friend_ids:
        return []
    profiles = sb.table("profiles").select("id,email,username").in_("id", friend_ids).execute()
    return [
        {
            "id": p["id"],
            "email": p.get("email", ""),
            "name": p.get("username") or (p.get("email", "") or "").split("@")[0],
        }
        for p in (profiles.data or [])
    ]


def list_all_users(user_id: str, limit: int = 50) -> list:
    sb = _client()
    r = sb.table("friends").select("friend_id").eq("user_id", user_id).execute()
    friend_ids = {row["friend_id"] for row in (r.data or [])}
    friend_ids.add(user_id)
    profiles = sb.table("profiles").select("id,email,username").limit(min(200, limit * 3)).execute()
    out = []
    for p in (profiles.data or []):
        if p["id"] in friend_ids:
            continue
        out.append({
            "id": p["id"],
            "email": p.get("email", ""),
            "name": p.get("username") or (p.get("email", "") or "").split("@")[0],
        })
        if len(out) >= limit:
            break
    return out


def search_users(user_id: str, query: str) -> list:
    sb = _client()
    q = (query or "").strip().lower()
    if not q:
        return list_all_users(user_id, limit=20)
    r = sb.table("friends").select("friend_id").eq("user_id", user_id).execute()
    friend_ids = {row["friend_id"] for row in (r.data or [])}
    friend_ids.add(user_id)
    # Search by email and username (simple ilike)
    by_email = sb.table("profiles").select("id,email,username").ilike("email", f"%{q}%").limit(25).execute()
    by_name = sb.table("profiles").select("id,email,username").ilike("username", f"%{q}%").limit(25).execute()
    seen = set()
    out = []
    for p in (by_email.data or []) + (by_name.data or []):
        if p["id"] in friend_ids or p["id"] in seen:
            continue
        seen.add(p["id"])
        out.append({
            "id": p["id"],
            "email": p.get("email", ""),
            "name": p.get("username") or (p.get("email", "") or "").split("@")[0],
        })
        if len(out) >= 20:
            break
    return out


# ---- Games ----

def create_game(host_id: str, host_name: str) -> dict:
    sb = _client()
    game_id = str(uuid.uuid4())
    for _ in range(20):
        code = _gen_code()
        try:
            sb.table("games").insert({
                "id": game_id,
                "host_id": host_id,
                "join_code": code,
            }).execute()
            sb.table("game_players").insert({
                "game_id": game_id,
                "user_id": host_id,
                "user_name": host_name,
                "initial_buy_in": 0,
                "total_buy_in": 0,
            }).execute()
            return get_game(game_id)
        except Exception as e:
            if "duplicate" in str(e).lower() or "unique" in str(e).lower():
                continue
            raise
    raise ValueError("Could not generate unique code")


def get_game_by_code(join_code: str) -> Optional[dict]:
    sb = _client()
    code = join_code.strip().upper()
    r = sb.table("games").select("id,host_id,join_code,status").eq("join_code", code).execute()
    if not r.data or len(r.data) == 0:
        return None
    row = r.data[0]
    players = sb.table("game_players").select("user_id,user_name,initial_buy_in,total_buy_in,cash_out,left_at").eq("game_id", row["id"]).execute()
    return {
        "id": row["id"],
        "host_id": row["host_id"],
        "join_code": row["join_code"],
        "status": row["status"],
        "players": [
            {
                "user_id": p["user_id"],
                "user_name": p["user_name"],
                "initial_buy_in": p.get("initial_buy_in") or 0,
                "total_buy_in": p.get("total_buy_in") or 0,
                "cash_out": p.get("cash_out"),
                "left_at": p.get("left_at"),
            }
            for p in (players.data or [])
        ],
    }


def get_game(game_id: str) -> Optional[dict]:
    sb = _client()
    r = sb.table("games").select("id,host_id,join_code,status,created_at,display_name").eq("id", game_id).execute()
    if not r.data or len(r.data) == 0:
        return None
    row = r.data[0]
    players = sb.table("game_players").select("user_id,user_name,initial_buy_in,total_buy_in,cash_out,left_at").eq("game_id", game_id).execute()
    invites = sb.table("game_invites").select("user_id").eq("game_id", game_id).execute()
    return {
        "id": row["id"],
        "host_id": row["host_id"],
        "join_code": row["join_code"],
        "display_name": row.get("display_name"),
        "status": row["status"],
        "created_at": row.get("created_at"),
        "players": [
            {
                "user_id": p["user_id"],
                "user_name": p["user_name"],
                "initial_buy_in": p.get("initial_buy_in") or 0,
                "total_buy_in": p.get("total_buy_in") or 0,
                "cash_out": p.get("cash_out"),
                "left_at": p.get("left_at"),
            }
            for p in (players.data or [])
        ],
        "invited_ids": [i["user_id"] for i in (invites.data or [])],
    }


def join_game(game_id: str, user_id: str, user_name: str, initial_buy_in: float) -> dict:
    sb = _client()
    r = sb.table("games").select("status").eq("id", game_id).execute()
    if not r.data:
        raise ValueError("Game not found")
    if r.data[0].get("status") != "active":
        raise ValueError("Game has ended")
    ex = sb.table("game_players").select("user_id").eq("game_id", game_id).eq("user_id", user_id).execute()
    if ex.data and len(ex.data) > 0:
        raise ValueError("Already in this game")
    bi = max(0, float(initial_buy_in))
    sb.table("game_players").insert({
        "game_id": game_id,
        "user_id": user_id,
        "user_name": user_name,
        "initial_buy_in": bi,
        "total_buy_in": bi,
    }).execute()
    return get_game(game_id)


def add_buy_in(game_id: str, user_id: str, amount: float) -> dict:
    sb = _client()
    amt = max(0, float(amount))
    r = sb.table("game_players").select("total_buy_in").eq("game_id", game_id).eq("user_id", user_id).is_("left_at", "null").execute()
    if not r.data:
        raise ValueError("Player not in game or already left")
    new_total = (r.data[0].get("total_buy_in") or 0) + amt
    sb.table("game_players").update({"total_buy_in": new_total}).eq("game_id", game_id).eq("user_id", user_id).execute()
    return get_game(game_id)


def leave_game(game_id: str, user_id: str, cash_out: float) -> dict:
    sb = _client()
    r = sb.table("game_players").select("user_id").eq("game_id", game_id).eq("user_id", user_id).execute()
    if not r.data:
        raise ValueError("Player not in game")
    sb.table("game_players").update({"cash_out": float(cash_out), "left_at": datetime.utcnow().isoformat()}).eq("game_id", game_id).eq("user_id", user_id).execute()
    return get_game(game_id)


def invite_friends(game_id: str, host_id: str, friend_ids: list) -> None:
    sb = _client()
    r = sb.table("games").select("host_id").eq("id", game_id).execute()
    if not r.data or r.data[0]["host_id"] != host_id:
        raise ValueError("Not the host")
    for fid in friend_ids:
        try:
            sb.table("game_invites").upsert({"game_id": game_id, "user_id": fid}, on_conflict="game_id,user_id").execute()
        except Exception:
            pass


def invite_by_email(game_id: str, host_id: str, email: str) -> dict:
    sb = _client()
    email = email.strip().lower()
    r = sb.table("games").select("host_id,status").eq("id", game_id).execute()
    if not r.data or r.data[0]["host_id"] != host_id:
        raise ValueError("Not the host")
    if r.data[0].get("status") != "active":
        raise ValueError("Game has ended")
    p = sb.table("profiles").select("id").eq("email", email).execute()
    if not p.data:
        raise ValueError("No user found with that email")
    uid = p.data[0]["id"]
    ex = sb.table("game_players").select("user_id").eq("game_id", game_id).eq("user_id", uid).execute()
    if ex.data:
        raise ValueError("Already in game")
    sb.table("game_invites").upsert({"game_id": game_id, "user_id": uid}, on_conflict="game_id,user_id").execute()
    return get_game(game_id)


def add_player_manually(game_id: str, host_id: str, name: str) -> dict:
    sb = _client()
    name = (name or "").strip()
    if not name:
        raise ValueError("Name required")
    r = sb.table("games").select("host_id").eq("id", game_id).execute()
    if not r.data or r.data[0]["host_id"] != host_id:
        raise ValueError("Not the host")
    manual_id = "manual-" + str(uuid.uuid4())
    sb.table("game_players").insert({
        "game_id": game_id,
        "user_id": manual_id,
        "user_name": name,
        "initial_buy_in": 0,
        "total_buy_in": 0,
    }).execute()
    return get_game(game_id)


def invite_friends_to_game(game_id: str, host_id: str, friend_ids: list) -> dict:
    sb = _client()
    r = sb.table("games").select("host_id,status").eq("id", game_id).execute()
    if not r.data or r.data[0]["host_id"] != host_id:
        raise ValueError("Not the host")
    if r.data[0].get("status") != "active":
        raise ValueError("Game has ended")
    for uid in friend_ids:
        ex = sb.table("game_players").select("user_id").eq("game_id", game_id).eq("user_id", uid).execute()
        if not ex.data:
            try:
                sb.table("game_invites").upsert({"game_id": game_id, "user_id": uid}, on_conflict="game_id,user_id").execute()
            except Exception:
                pass
    return get_game(game_id)


def get_pending_game_invites(user_id: str) -> list:
    sb = _client()
    # Games user is invited to, not yet in game_players
    inv = sb.table("game_invites").select("game_id").eq("user_id", user_id).execute()
    if not inv.data:
        return []
    game_ids = [i["game_id"] for i in inv.data]
    in_game = sb.table("game_players").select("game_id").eq("user_id", user_id).in_("game_id", game_ids).execute()
    in_game_ids = {p["game_id"] for p in (in_game.data or [])}
    active = sb.table("games").select("id,join_code,display_name,host_id").eq("status", "active").in_("id", game_ids).execute()
    return [
        {"id": g["id"], "join_code": g["join_code"], "display_name": g.get("display_name"), "host_id": g["host_id"]}
        for g in (active.data or [])
        if g["id"] not in in_game_ids
    ]


def accept_game_invite(game_id: str, user_id: str, user_name: str, initial_buy_in: float = 0) -> dict:
    sb = _client()
    r = sb.table("game_invites").select("user_id").eq("game_id", game_id).eq("user_id", user_id).execute()
    if not r.data:
        raise ValueError("No invite found")
    sb.table("game_invites").delete().eq("game_id", game_id).eq("user_id", user_id).execute()
    return join_game(game_id, user_id, user_name, initial_buy_in)


def end_game(game_id: str, host_id: str) -> dict:
    sb = _client()
    r = sb.table("games").select("host_id").eq("id", game_id).execute()
    if not r.data or r.data[0]["host_id"] != host_id:
        raise ValueError("Not the host")
    sb.table("games").update({"status": "ended"}).eq("id", game_id).execute()
    return get_game(game_id)


def rename_game(game_id: str, user_id: str, new_name: str) -> dict:
    sb = _client()
    new_name = (new_name or "").strip()[:30] or None
    if not new_name:
        raise ValueError("Name required")
    r = sb.table("games").select("host_id").eq("id", game_id).execute()
    if not r.data:
        raise ValueError("Game not found")
    if r.data[0]["host_id"] != user_id:
        raise ValueError("Only host can rename")
    sb.table("games").update({"display_name": new_name}).eq("id", game_id).execute()
    return get_game(game_id)


def delete_game(game_id: str, user_id: str) -> None:
    sb = _client()
    r = sb.table("games").select("host_id").eq("id", game_id).execute()
    if not r.data:
        raise ValueError("Game not found")
    if r.data[0]["host_id"] != user_id:
        raise ValueError("Only host can delete")
    sb.table("game_players").delete().eq("game_id", game_id).execute()
    sb.table("game_invites").delete().eq("game_id", game_id).execute()
    sb.table("games").delete().eq("id", game_id).execute()


def list_user_games(user_id: str) -> list:
    sb = _client()
    r = sb.table("game_players").select("game_id").eq("user_id", user_id).execute()
    if not r.data:
        return []
    game_ids = [p["game_id"] for p in r.data]
    games = sb.table("games").select("id,host_id,join_code,display_name,status,created_at").in_("id", game_ids).order("created_at", desc=True).execute()
    out = []
    for g in (games.data or []):
        out.append({
            "id": g["id"],
            "host_id": g["host_id"],
            "join_code": g["join_code"],
            "display_name": g.get("display_name"),
            "status": g["status"],
            "created_at": g.get("created_at"),
        })
    return out


# ---- Winnings ----

def add_entry(user_id: str, session_date: str, buy_in: float, cash_out: float, notes: str = "", hours: float = 0) -> dict:
    sb = _client()
    co = cash_out if cash_out is not None else 0
    profit = co - buy_in
    eid = str(uuid.uuid4())
    sb.table("winnings").insert({
        "id": eid,
        "user_id": user_id,
        "session_date": session_date,
        "buy_in": buy_in,
        "cash_out": co,
        "profit": profit,
        "hours": hours or 0,
        "notes": notes or "",
    }).execute()
    return {"id": eid, "session_date": session_date, "buy_in": buy_in, "cash_out": cash_out, "profit": profit}


def get_entries(user_id: str, period: str = "all") -> list:
    sb = _client()
    r = sb.table("winnings").select("id,session_date,buy_in,cash_out,profit,hours,notes,created_at").eq("user_id", user_id).order("session_date", desc=True).order("created_at", desc=True).execute()
    entries = [dict(e) for e in (r.data or [])]
    if period == "daily":
        cutoff = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        entries = [e for e in entries if str(e.get("session_date", ""))[:10] >= cutoff]
    elif period == "monthly":
        cutoff = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        entries = [e for e in entries if str(e.get("session_date", ""))[:10] >= cutoff]
    elif period == "yearly":
        cutoff = (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d")
        entries = [e for e in entries if str(e.get("session_date", ""))[:10] >= cutoff]
    return entries


def delete_entry(user_id: str, entry_id: str) -> bool:
    sb = _client()
    r = sb.table("winnings").delete().eq("id", entry_id).eq("user_id", user_id).execute()
    return bool(r.data)
