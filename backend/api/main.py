"""
FastAPI backend for poker simulation.
Run: cd python && uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
"""

import os
import sys
import time
import logging
from pathlib import Path

# Ensure poker_sim package is importable when running from repo root or python/
_root = Path(__file__).resolve().parent.parent
_project_root = _root.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

ON_VERCEL = os.getenv("VERCEL") == "1"

from fastapi import FastAPI, HTTPException, File, UploadFile, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

# Removed math imports that were previously here

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Poker Simulation API",
    description="Monte Carlo Texas Hold'em win/tie/loss and EV feedback",
)

_cors_origins = ["http://localhost:8000", "http://127.0.0.1:8000"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?|https://[a-zA-Z0-9-]+\.github\.io|https://[a-zA-Z0-9-]+\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AuthRegisterRequest(BaseModel):
    email: str | None = None
    password: str = Field(..., min_length=6)
    username: str = Field(..., min_length=1)


class AuthLoginRequest(BaseModel):
    identifier: str = Field(..., min_length=1, description="Email or username")
    password: str = Field(..., min_length=1)


class AuthResponse(BaseModel):
    id: str
    email: str
    name: str


@app.get("/api/health")
def health_check():
    return {"ok": True, "status": "running"}


@app.post("/api/auth/register", response_model=AuthResponse)
def auth_register(req: AuthRegisterRequest):
    """Register a new PokerID account. Email is optional; username must be unique."""
    try:
        from api.services.auth_db import register
        user = register(req.email, req.password, req.username)
        return AuthResponse(**user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Register failed")
        raise HTTPException(status_code=500, detail="Registration failed")


@app.post("/api/auth/login", response_model=AuthResponse)
def auth_login(req: AuthLoginRequest):
    """Login with PokerID (email/username + password)."""
    try:
        from api.services.auth_db import login
        try:
            user = login(req.identifier, req.password)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        if not user:
            raise HTTPException(status_code=401, detail="Invalid username/email or password")
        return AuthResponse(**user)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Login failed")
        raise HTTPException(status_code=500, detail="Login failed")


class ProfileUpdateRequest(BaseModel):
    user_id: str
    current_password: str
    new_username: str | None = None
    new_password: str | None = None


@app.post("/api/auth/update-profile", response_model=AuthResponse)
def auth_update_profile(req: ProfileUpdateRequest):
    try:
        import bcrypt
        from api.services.auth_db import _conn, update_username, update_password
        with _conn() as c:
            row = c.execute("SELECT id, email, password_hash, username FROM users WHERE id = ?", (req.user_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        if not bcrypt.checkpw(req.current_password.encode("utf-8"), row["password_hash"].encode("utf-8")):
            raise HTTPException(status_code=401, detail="Current password is incorrect")
        user_id, email = row["id"], row["email"]
        name = row["username"] or email.split("@")[0]
        if req.new_password:
            update_password(user_id, req.current_password, req.new_password)
        if req.new_username is not None and req.new_username.strip():
            u = update_username(user_id, req.new_username)
            name = u["name"]
        return AuthResponse(id=user_id, email=email, name=name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class WinningsEntryRequest(BaseModel):
    user_id: str
    session_date: str
    buy_in: float = 0
    cash_out: float = 0
    hours: float = 0
    notes: str = ""


@app.post("/api/winnings")
def winnings_add(req: WinningsEntryRequest):
    try:
        from api.services.db_router import winnings_add_entry
        return winnings_add_entry(req.user_id, req.session_date, req.buy_in, req.cash_out, req.notes, req.hours)
    except Exception as e:
        logger.exception("Winnings add failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/winnings")
def winnings_list(user_id: str, period: str = "all"):
    try:
        from api.services.db_router import winnings_get_entries
        return {"entries": winnings_get_entries(user_id, period)}
    except Exception as e:
        logger.exception("Winnings list failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/winnings/{entry_id}")
def winnings_delete(entry_id: str, user_id: str):
    try:
        from api.services.db_router import winnings_delete_entry
        if not winnings_delete_entry(user_id, entry_id):
            raise HTTPException(status_code=404, detail="Entry not found")
        return {"ok": True}
    except HTTPException:
        raise


@app.patch("/api/winnings/{entry_id}")
def winnings_update(entry_id: str, req: WinningsEntryRequest):
    try:
        from api.services.db_router import winnings_update_entry
        return winnings_update_entry(req.user_id, entry_id, req.session_date, req.buy_in, req.cash_out, req.notes, req.hours)
    except ImportError:
        raise HTTPException(status_code=501, detail="Update not supported on this backend")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Winnings update failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/friends")
def friends_list(user_id: str):
    try:
        from api.services.db_router import get_friends
        return {"friends": get_friends(user_id)}
    except Exception as e:
        logger.exception("Friends list failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/friends/search")
def friends_search(user_id: str, q: str = ""):
    try:
        from api.services.db_router import search_users
        return {"users": search_users(user_id, q)}
    except Exception as e:
        logger.exception("Friends search failed")
        raise HTTPException(status_code=500, detail=str(e))


class FriendAddRequest(BaseModel):
    user_id: str
    friend_id: str


@app.post("/api/friends")
def friends_add(req: FriendAddRequest):
    """Send a friend request. Recipient must accept in inbox."""
    try:
        from api.services.db_router import send_friend_request
        send_friend_request(req.user_id, req.friend_id)
        return {"ok": True, "status": "request_sent"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/friends/inbox")
def friends_inbox(user_id: str):
    """Pending friend requests (incoming)."""
    try:
        from api.services.db_router import get_pending_requests
        return {"requests": get_pending_requests(user_id)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/friends/sent")
def friends_sent(user_id: str):
    """User IDs we've sent requests to."""
    try:
        from api.services.db_router import get_sent_requests
        return {"sent_to": list(get_sent_requests(user_id))}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class FriendRequestAction(BaseModel):
    user_id: str  # acceptor/decliner
    from_id: str  # who sent the request


@app.post("/api/friends/accept")
def friends_accept(req: FriendRequestAction):
    try:
        from api.services.db_router import accept_friend_request
        accept_friend_request(req.user_id, req.from_id)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/friends/decline")
def friends_decline(req: FriendRequestAction):
    try:
        from api.services.db_router import decline_friend_request
        decline_friend_request(req.user_id, req.from_id)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/friends/{friend_id}")
def friends_remove(friend_id: str, user_id: str):
    try:
        from api.services.db_router import remove_friend
        remove_friend(user_id, friend_id)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/friends/all-users")
def friends_all_users(user_id: str, limit: int = 50):
    try:
        from api.services.db_router import list_all_users
        return {"users": list_all_users(user_id, limit)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---- Games ----
class GameCreateRequest(BaseModel):
    user_id: str
    user_name: str


class GameJoinRequest(BaseModel):
    user_id: str
    user_name: str
    initial_buy_in: float = 0


class GameAddBuyInRequest(BaseModel):
    user_id: str
    amount: float


class GameLeaveRequest(BaseModel):
    user_id: str
    cash_out: float


class GameInviteRequest(BaseModel):
    host_id: str
    friend_ids: list[str] = Field(default_factory=list)


class GameAddPlayersRequest(BaseModel):
    host_id: str
    user_ids: list[str] = Field(default_factory=list)
    user_names: dict[str, str] = Field(default_factory=dict)


class GameEndRequest(BaseModel):
    user_id: str


@app.post("/api/games")
def games_create(req: GameCreateRequest):
    try:
        from api.services.db_router import create_game
        return create_game(req.user_id, req.user_name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/games/by-code/{code}")
def games_get_by_code(code: str):
    try:
        from api.services.db_router import get_game_by_code
        g = get_game_by_code(code)
        if not g:
            raise HTTPException(status_code=404, detail="Game not found")
        return g
    except HTTPException:
        raise


@app.get("/api/games/{game_id}")
def games_get(game_id: str):
    try:
        from api.services.db_router import get_game
        g = get_game(game_id)
        if not g:
            raise HTTPException(status_code=404, detail="Game not found")
        return g
    except HTTPException:
        raise


@app.get("/api/games/user/{user_id}")
def games_list_user(user_id: str):
    try:
        from api.services.db_router import list_user_games
        return {"games": list_user_games(user_id)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/games/{game_id}/join")
def games_join(game_id: str, req: GameJoinRequest):
    try:
        from api.services.db_router import join_game
        return join_game(game_id, req.user_id, req.user_name, req.initial_buy_in)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/games/{game_id}/add-buy-in")
def games_add_buy_in(game_id: str, req: GameAddBuyInRequest):
    try:
        from api.services.db_router import add_buy_in
        return add_buy_in(game_id, req.user_id, float(req.amount))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("add-buy-in failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/games/{game_id}/leave")
def games_leave(game_id: str, req: GameLeaveRequest):
    try:
        from api.services.db_router import leave_game
        return leave_game(game_id, req.user_id, req.cash_out)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/games/{game_id}/invite")
def games_invite(game_id: str, req: GameInviteRequest):
    """Invite friends to game. They must accept to join."""
    try:
        from api.services.db_router import invite_friends_to_game
        return invite_friends_to_game(game_id, req.host_id, req.friend_ids)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/games/invites")
def games_pending_invites(user_id: str):
    """Get games this user is invited to."""
    try:
        from api.services.db_router import get_pending_game_invites
        return {"invites": get_pending_game_invites(user_id)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class GameAcceptInviteRequest(BaseModel):
    user_id: str
    user_name: str
    initial_buy_in: float = 0


@app.post("/api/games/{game_id}/accept-invite")
def games_accept_invite(game_id: str, req: GameAcceptInviteRequest):
    try:
        from api.services.db_router import accept_game_invite
        return accept_game_invite(game_id, req.user_id, req.user_name, req.initial_buy_in)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class GameAddByEmailRequest(BaseModel):
    host_id: str
    email: str


class GameAddManualRequest(BaseModel):
    host_id: str
    name: str


@app.post("/api/games/{game_id}/add-by-email")
def games_invite_by_email(game_id: str, req: GameAddByEmailRequest):
    """Invite user by email. They must accept to join."""
    try:
        from api.services.db_router import invite_by_email
        return invite_by_email(game_id, req.host_id, req.email)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/games/{game_id}/add-manual")
def games_add_manual(game_id: str, req: GameAddManualRequest):
    try:
        from api.services.db_router import add_player_manually
        return add_player_manually(game_id, req.host_id, req.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/games/{game_id}/end")
def games_end(game_id: str, req: GameEndRequest):
    try:
        from api.services.db_router import end_game
        return end_game(game_id, req.user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class GameRenameRequest(BaseModel):
    user_id: str
    name: str


@app.patch("/api/games/{game_id}")
def games_rename(game_id: str, req: GameRenameRequest):
    try:
        from api.services.db_router import rename_game
        return rename_game(game_id, req.user_id, req.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/games/{game_id}")
def games_delete(game_id: str, user_id: str = Query(..., description="Host user ID")):
    try:
        from api.services.db_router import delete_game
        delete_game(game_id, user_id)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    context: dict = Field(default_factory=dict)


@app.post("/api/chat")
def chat(req: ChatRequest):
    """Poker AI assistant. Set OPENAI_API_KEY for GPT, else uses canned tips."""
    try:
        from api.services.chat_bot import get_chat_reply
        reply = get_chat_reply(req.message, req.context)
        return {"reply": reply}
    except Exception as e:
        logger.exception("Chat failed")
        raise HTTPException(status_code=500, detail=str(e))


# Serve built React app from same origin (no CORS). Must be last.
# On Vercel, build outputs to public/; locally we use web/dist
_static_dir = (_project_root / "public" if ON_VERCEL else _project_root / "web" / "dist")
if _static_dir.exists():
    assets_dir = _static_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")


@app.get("/")
def serve_index():
    """Serve React app or API info if no build."""
    index = _static_dir / "index.html"
    if index.exists():
        return FileResponse(index)
    return {"message": "Poker Simulation API", "docs": "/docs"}


@app.get("/{path:path}")
def serve_spa(path: str):
    """Serve SPA routes (dashboard, login, etc.)."""
    if path.startswith("api"):
        raise HTTPException(status_code=404, detail="Not found")
    fp = _static_dir / path
    if fp.exists() and fp.is_file():
        return FileResponse(fp)
    index = _static_dir / "index.html"
    if index.exists():
        return FileResponse(index)
    raise HTTPException(status_code=404, detail="Not found")
