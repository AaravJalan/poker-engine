#ifndef POKER_SIM_HAND_EVAL_HPP
#define POKER_SIM_HAND_EVAL_HPP

#include <array>
#include <cstdint>
#include <vector>

namespace poker_sim {

// Hand rank constants (higher = better)
constexpr int HIGH_CARD      = 0;
constexpr int ONE_PAIR       = 1;
constexpr int TWO_PAIR       = 2;
constexpr int THREE_KIND     = 3;
constexpr int STRAIGHT       = 4;
constexpr int FLUSH          = 5;
constexpr int FULL_HOUSE     = 6;
constexpr int FOUR_KIND      = 7;
constexpr int STRAIGHT_FLUSH = 8;

// Card encoding: cards 0-51, rank = c % 13, suit = c / 13
// Rank: 0=2, 1=3, ..., 11=K, 12=A
inline int card_rank(uint8_t c) { return c % 13; }
inline int card_suit(uint8_t c) { return c / 13; }

// A HandScore encodes both hand type and tiebreakers into a single uint32.
// Upper 4 bits = hand type (0-8). Lower 28 bits = packed rank tiebreakers.
// Two hands can be compared with a single integer comparison — no struct needed.
using HandScore = uint32_t;

/// Evaluate the best 5-card hand out of 7 cards using bitboards.
/// Returns a HandScore — higher is better.
HandScore evaluate7_bitboard(const uint8_t* cards);

/// Compare two 7-card hands. Returns 1 if h1 wins, -1 if h2 wins, 0 if tie.
int compare_hands(const std::vector<uint8_t>& h1, const std::vector<uint8_t>& h2);

}  // namespace poker_sim

#endif
