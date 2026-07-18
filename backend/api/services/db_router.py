"""
Route database calls to Supabase or SQLite based on env.
When SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set, use Supabase.
Otherwise use SQLite (friends_db, games_db, winnings_db).
"""
import os

_use_supabase = bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
_on_vercel = os.getenv("VERCEL") == "1"

if _on_vercel and not _use_supabase:
    raise RuntimeError(
        "Server is running on Vercel without Supabase configured. "
        "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel Environment Variables."
    )

if _use_supabase:
    from api.services.supabase_backend import (
        add_friend,
        send_friend_request,
        accept_friend_request,
        decline_friend_request,
        get_pending_requests,
        get_sent_requests,
        remove_friend,
        get_friends,
        list_all_users,
        search_users,
        create_game,
        get_game_by_code,
        get_game,
        join_game,
        add_buy_in,
        leave_game,
        invite_friends,
        invite_by_email,
        add_player_manually,
        invite_friends_to_game,
        get_pending_game_invites,
        accept_game_invite,
        end_game,
        rename_game,
        delete_game,
        list_user_games,
        add_entry as winnings_add_entry,
        get_entries as winnings_get_entries,
        delete_entry as winnings_delete_entry,
        # Supabase backend currently doesn't support update; fall back to delete+add in UI if needed.
    )
else:
    from api.services.friends_db import (
        add_friend,
        send_friend_request,
        accept_friend_request,
        decline_friend_request,
        get_pending_requests,
        get_sent_requests,
        remove_friend,
        get_friends,
        list_all_users,
        search_users,
    )
    from api.services.games_db import (
        create_game,
        get_game_by_code,
        get_game,
        join_game,
        add_buy_in,
        leave_game,
        invite_friends,
        invite_by_email,
        add_player_manually,
        invite_friends_to_game,
        get_pending_game_invites,
        accept_game_invite,
        end_game,
        rename_game,
        delete_game,
        list_user_games,
    )
    from api.services.winnings_db import (
        add_entry as winnings_add_entry,
        get_entries as winnings_get_entries,
        delete_entry as winnings_delete_entry,
        update_entry as winnings_update_entry,
    )
