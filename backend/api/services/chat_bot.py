"""Poker chatbot. Uses Gemini or OpenAI if API keys are set. Answer the user's question directly."""
import os
from typing import Any


def get_chat_reply(message: str, context: dict[str, Any] | None = None) -> str:
    msg = (message or "").strip()
    if not msg:
        return "What would you like to know about poker?"

    sys_prompt = (
        "You are a friendly, experienced poker player. Answer the user's question directly and conversationally. "
        "Focus on what they asked—do NOT bring up their current hand, board, or win% unless they specifically ask about it. "
        "Give clear, helpful answers. Vary your wording. Keep it 2-4 sentences. Sound human and natural."
    )

    # 1. Try Gemini 2.5 Flash first
    gemini_key = os.environ.get("GEMINI_API_KEY")
    if gemini_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=gemini_key)
            model = genai.GenerativeModel('gemini-2.5-flash', system_instruction=sys_prompt)
            response = model.generate_content(msg)
            if response and response.text:
                return response.text.strip()
        except Exception as e:
            print(f"Gemini error: {e}")
            pass

    # 2. Fall back to OpenAI
    api_key = os.environ.get("OPENAI_API_KEY")
    if api_key:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=api_key)
            r = client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": sys_prompt},
                    {"role": "user", "content": msg},
                ],
                max_tokens=250,
            )
            return r.choices[0].message.content.strip()
        except Exception as e:
            print(f"OpenAI error: {e}")
            pass

    # 3. Fallback to hardcoded heuristics if no APIs are set or both fail
    m = msg.lower()
    if "odds" in m or "probability" in m:
        if "qq" in m and ("k" in m or "king" in m):
            return "QQ on a King-high board is tough—you're behind AK, KK, and KQ. You only have 2 outs (the other Queens). Most players fold to big bets or check-call and hope to improve."
        return "Pot odds = call / (pot + call). If your equity is higher, calling is profitable. For draws: multiply outs by 4 on the flop, 2 on the turn to estimate your chance of hitting."
    if "bluff" in m:
        return "Bluff when the board fits your range, your opponent shows weakness, and you have few showdown outs. Balance bluffs with value bets."
    if "position" in m:
        return "Late position is huge—you act last on future streets. Play more hands from the button, fewer from early position."
    if "draw" in m:
        return "Flush draw ~35% by river, open-ended straight ~32%. Rule of 4 and 2 for quick estimates. You need pot odds to justify calling."
    if "ev" in m or "expected value" in m:
        return "EV = (win% × profit) − (loss% × cost). Positive EV means profitable long-term."
    if ("hand" in m or "rank" in m or "order" in m or "hierarchy" in m):
        return "Strongest to weakest: Royal Flush, Straight Flush, Quads, Full House, Flush, Straight, Trips, Two Pair, Pair, High Card."
    if "pair" in m:
        return "Pocket pairs hit a set ~12% on the flop. Overpairs are strong; one pair is vulnerable to overcards."
    if "hello" in m or "hi" in m or "hey" in m:
        return "Hey! What poker question can I help with?"
    if "thanks" in m or "thank" in m:
        return "You're welcome! Good luck at the tables."
    return "I'm here to help with poker strategy, odds, position, bluffing, or hand rankings. What would you like to know?"
