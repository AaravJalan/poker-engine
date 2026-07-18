/*
 * hand_eval.cpp — Bitboard-based 7-card hand evaluator for Texas Hold'em.
 *
 * How it works:
 * ------------
 * Each card is encoded as 0-51 (rank = c%13, suit = c/13).
 * We build 4 suit bitboards (one per suit) and 1 rank bitboard.
 * Each bitboard is a 13-bit integer where bit i is set if rank i is present.
 *
 * Bitwise tricks we use:
 *  - Flush detection:  if any suit bitboard has >= 5 bits set, it's a flush.
 *  - Straight detection: a straight exists if (ranks & ranks>>1 & ranks>>2 & ranks>>3 & ranks>>4) != 0.
 *    This is O(1) instead of looping through all 5-card combinations.
 *  - Rank counting: we use popcount (built-in) to count bits instantly.
 *
 * The result is a HandScore (uint32) that encodes hand type and tiebreakers
 * so that any two hands can be compared with a single integer comparison.
 */

#include "poker_sim/hand_eval.hpp"
#include <algorithm>
#include <cstdint>
#include <vector>

namespace poker_sim {

namespace {

// Packs up to 5 rank values (0-12) into the lower 20 bits of a uint32.
// Each rank uses 4 bits (max value 12 fits in 4 bits). Leftmost = most significant.
inline uint32_t pack_ranks(int r0, int r1 = 0, int r2 = 0, int r3 = 0, int r4 = 0) {
    return ((uint32_t)r0 << 16) | ((uint32_t)r1 << 12) | ((uint32_t)r2 << 8) |
           ((uint32_t)r3 << 4) | (uint32_t)r4;
}

// Returns the index of the highest set bit in a 13-bit mask (0 = lowest rank).
inline int highest_bit(uint16_t mask) {
    return 31 - __builtin_clz((uint32_t)mask);  // clz = count leading zeros
}

// Removes the highest bit from a 13-bit rank mask and returns the new mask.
inline uint16_t remove_highest(uint16_t mask) {
    return mask & ~(1u << highest_bit(mask));
}

// Returns a 13-bit mask of the top N ranks present in the given rank mask.
// Used to pick tiebreaker kicker cards.
inline uint32_t top_n_ranks(uint16_t rank_mask, int n) {
    uint32_t packed = 0;
    for (int i = 0; i < n && rank_mask; ++i) {
        int r = highest_bit(rank_mask);
        packed |= ((uint32_t)r << (4 * (n - 1 - i)));
        rank_mask = remove_highest(rank_mask);
    }
    return packed;
}

// Detects the highest straight in a rank mask (13 bits).
// The A-2-3-4-5 wheel is handled by placing Ace (bit 12) also at bit -1 logically.
// Returns the high card of the straight (0-12), or -1 if no straight.
int best_straight(uint16_t rank_mask) {
    // Check A-2-3-4-5 (wheel): ace=bit12, 2=bit0, 3=bit1, 4=bit2, 5=bit3
    uint16_t wheel_mask = (1 << 12) | (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3);
    if ((rank_mask & wheel_mask) == wheel_mask) {
        // Wheel exists; check if there's something better first
    }

    // Standard straights: shift the mask and AND 4 times to find 5 consecutive ranks
    uint16_t m = rank_mask;
    m &= (rank_mask >> 1);
    m &= (rank_mask >> 2);
    m &= (rank_mask >> 3);
    m &= (rank_mask >> 4);
    if (m) return highest_bit(m) + 4;  // high card of the straight

    // Wheel (A-2-3-4-5) — high card is 5 (rank index 3 = "5")
    if ((rank_mask & wheel_mask) == wheel_mask) return 3;

    return -1;
}

// Encodes hand type + tiebreaker into a single uint32 for O(1) comparison.
inline uint32_t make_score(int hand_type, uint32_t tiebreaker) {
    return ((uint32_t)hand_type << 28) | (tiebreaker & 0x0FFFFFFFu);
}

}  // namespace

HandScore evaluate7_bitboard(const uint8_t* cards) {
    // Build suit bitboards and a combined rank bitboard.
    // suit_masks[s] has bit r set if a card of rank r and suit s exists.
    uint16_t suit_masks[4] = {0, 0, 0, 0};
    uint8_t  rank_count[13] = {0};  // how many of each rank across all suits

    for (int i = 0; i < 7; ++i) {
        int r = card_rank(cards[i]);
        int s = card_suit(cards[i]);
        suit_masks[s] |= (1u << r);
        rank_count[r]++;
    }

    // Combined rank mask (bit r set if any card of rank r exists)
    uint16_t rank_mask = 0;
    for (int r = 0; r < 13; ++r)
        if (rank_count[r]) rank_mask |= (1u << r);

    // --- Check for flush / straight-flush ---
    for (int s = 0; s < 4; ++s) {
        if (__builtin_popcount(suit_masks[s]) >= 5) {
            // We have a flush in suit s. Check for straight-flush.
            int sf_high = best_straight(suit_masks[s]);
            if (sf_high >= 0)
                return make_score(STRAIGHT_FLUSH, pack_ranks(sf_high));
            // Regular flush: pick top 5 cards of the flush suit
            return make_score(FLUSH, top_n_ranks(suit_masks[s], 5));
        }
    }

    // --- Count pairs/trips/quads by frequency ---
    // Collect ranks grouped by count (4-of-a-kind, 3-of-a-kind, pairs, singles)
    uint16_t quads = 0, trips = 0, pairs = 0, singles = 0;
    for (int r = 12; r >= 0; --r) {  // iterate high-to-low for easy "best first"
        switch (rank_count[r]) {
            case 4: quads  |= (1u << r); break;
            case 3: trips  |= (1u << r); break;
            case 2: pairs  |= (1u << r); break;
            case 1: singles |= (1u << r); break;
        }
    }

    // --- Four of a Kind ---
    if (quads) {
        int q = highest_bit(quads);
        // Kicker: best remaining card (not the quad rank)
        uint16_t kicker_mask = rank_mask & ~(1u << q);
        int k = highest_bit(kicker_mask);
        return make_score(FOUR_KIND, pack_ranks(q, k));
    }

    // --- Full House (trip + pair, or two trips -> use best trip + best remaining) ---
    if (trips) {
        int t = highest_bit(trips);  // best trip
        // Pair partner: second trip (demoted to pair) or best actual pair
        uint16_t pair_partner = (trips & ~(1u << t)) | pairs;
        if (pair_partner) {
            int p = highest_bit(pair_partner);
            return make_score(FULL_HOUSE, pack_ranks(t, p));
        }
    }

    // --- Straight ---
    int str_high = best_straight(rank_mask);
    if (str_high >= 0)
        return make_score(STRAIGHT, pack_ranks(str_high));

    // --- Three of a Kind ---
    if (trips) {
        int t = highest_bit(trips);
        uint16_t kicker_mask = rank_mask & ~(1u << t);
        return make_score(THREE_KIND, pack_ranks(t) | (top_n_ranks(kicker_mask, 2) >> 8));
    }

    // --- Two Pair ---
    if (__builtin_popcount(pairs) >= 2) {
        int p1 = highest_bit(pairs);
        int p2 = highest_bit(pairs & ~(1u << p1));
        uint16_t kicker_mask = rank_mask & ~(1u << p1) & ~(1u << p2);
        int k = highest_bit(kicker_mask);
        return make_score(TWO_PAIR, pack_ranks(p1, p2, k));
    }

    // --- One Pair ---
    if (pairs) {
        int p = highest_bit(pairs);
        uint16_t kicker_mask = rank_mask & ~(1u << p);
        uint32_t kickers = top_n_ranks(kicker_mask, 3);
        return make_score(ONE_PAIR, pack_ranks(p) | (kickers >> 4));
    }

    // --- High Card ---
    return make_score(HIGH_CARD, top_n_ranks(rank_mask, 5));
}

int compare_hands(const std::vector<uint8_t>& h1, const std::vector<uint8_t>& h2) {
    HandScore s1 = evaluate7_bitboard(h1.data());
    HandScore s2 = evaluate7_bitboard(h2.data());
    if (s1 > s2) return 1;
    if (s2 > s1) return -1;
    return 0;
}

}  // namespace poker_sim
