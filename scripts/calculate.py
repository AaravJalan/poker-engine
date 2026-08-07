#!/usr/bin/env python3
"""
Poker Equity Calculator (CLI)
Uses the high-performance C++ engine to calculate equities for multi-way pots.

Usage:
    python calculate.py --hero AsKs --opponents 3
    python calculate.py --hero AsKs --opponents 1 --board "2s 3s 4d"
"""

import sys
import os
import time
import argparse
from typing import List

# Add the backend directory to the python path so it can find the C++ bindings
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'backend'))

try:
    from poker_sim.poker_sim_cpp import run_monte_carlo
except ImportError:
    print("Error: Could not import C++ engine. Ensure you have run 'cmake --build build' and installed it.")
    sys.exit(1)

def parse_card(card_str: str) -> int:
    ranks = "23456789TJQKA"
    suits = "shdc"
    if len(card_str) != 2:
        raise ValueError(f"Invalid card format: {card_str}")
    
    r = ranks.find(card_str[0].upper())
    s = suits.find(card_str[1].lower())
    
    if r == -1 or s == -1:
        raise ValueError(f"Unknown card: {card_str}")
        
    return s * 13 + r

def parse_hand(hand_str: str) -> List[int]:
    if not hand_str:
        return []
    hand_str = hand_str.replace(" ", "")
    if len(hand_str) % 2 != 0:
        raise ValueError(f"Invalid hand length: {hand_str}")
    
    cards = []
    for i in range(0, len(hand_str), 2):
        cards.append(parse_card(hand_str[i:i+2]))
    return cards

def main():
    parser = argparse.ArgumentParser(description="High-Speed Poker Equity Calculator")
    parser.add_argument("--hero", type=str, required=True, help="Hero's hole cards (e.g. 'AsKs')")
    parser.add_argument("--opponents", type=int, default=1, help="Number of random opponents (1-8)")
    parser.add_argument("--board", type=str, default="", help="Community cards (e.g. '2s 3s 4d')")
    parser.add_argument("--trials", type=int, default=1_000_000, help="Number of Monte Carlo trials to run")
    
    args = parser.parse_args()
    
    if not (1 <= args.opponents <= 8):
        print("Error: Number of opponents must be between 1 and 8.")
        sys.exit(1)

    try:
        hero = parse_hand(args.hero)
        if len(hero) != 2:
            print("Error: Hero must have exactly 2 cards.")
            sys.exit(1)
        board = parse_hand(args.board)
    except ValueError as e:
        print(f"Error parsing inputs: {e}")
        sys.exit(1)
        
    print(f"--- Equity Calculator ---")
    print(f"Hero:      {args.hero}")
    print(f"Opponents: {args.opponents} (Random Hands)")
    print(f"Board:     {args.board if args.board else 'Preflop'}")
    print(f"Trials:    {args.trials:,}")
    print("-" * 36)
    
    t0 = time.perf_counter()
    
    # Run the ultra-fast C++ Monte Carlo
    # num_threads=0 automatically uses all available CPU cores
    result = run_monte_carlo(hero, board, args.opponents, args.trials, seed=42, num_threads=0)
    
    elapsed = time.perf_counter() - t0
    
    win_pct = result.win_rate() * 100
    tie_pct = result.tie_rate() * 100
    loss_pct = result.loss_rate() * 100
    equity = result.equity() * 100
    sims_per_sec = args.trials / elapsed
    
    print(f"Equity: {equity:>6.2f}% (Your true share of the pot)")
    print(f"Win:    {win_pct:>6.2f}%")
    print(f"Tie:    {tie_pct:>6.2f}%")
    print(f"Loss:   {loss_pct:>6.2f}%")
    print("-" * 36)
    print(f"Evaluated in {elapsed:.4f} seconds ({sims_per_sec:,.0f} sims/sec)")

if __name__ == "__main__":
    main()
