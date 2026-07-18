/*
 * simulation.cpp — Multithreaded Monte Carlo poker equity calculator.
 *
 * How it works:
 * ------------
 * 1. We pre-build a "template deck" — a fixed-size array of the remaining cards
 *    (52 cards minus hole cards and known board cards). This is built ONCE, not
 *    every trial. Each thread gets its own copy.
 *
 * 2. The simulation is split across N threads (default = hardware concurrency).
 *    Each thread runs num_trials/N independent simulations with its own RNG seed
 *    so results are statistically independent.
 *
 * 3. Inside each trial, instead of building a deck from scratch (which was the
 *    old O(52) std::find loop), we use a fast Fisher-Yates partial shuffle:
 *    we only shuffle the FIRST (5 - board_size + num_opponents*2) cards of the
 *    deck to fill the board and deal opponent hands. The rest of the deck is
 *    untouched. This reduces work from O(52) to O(cards_needed) per trial.
 *
 * 4. Hand evaluation uses the new bitboard evaluate7_bitboard() which is O(1)
 *    per hand instead of the old O(21 * 5) combination loop.
 */

#include "poker_sim/simulation.hpp"
#include "poker_sim/hand_eval.hpp"
#include <algorithm>
#include <atomic>
#include <cstring>
#include <random>
#include <thread>
#include <vector>

namespace poker_sim {

namespace {

// Run a batch of Monte Carlo trials on a single thread.
// Results are written into partial_result. deck_template is read-only shared.
void run_batch(const uint8_t* hole_cards,         // 2 cards
               const uint8_t* board_template,     // 0-5 known board cards
               int board_size,
               int num_opponents,
               const std::vector<uint8_t>& deck_template,  // remaining cards (read-only)
               uint32_t num_trials,
               unsigned seed,
               SimResult& partial_result) {

    // Each thread gets its own shuffleable copy of the deck template.
    std::vector<uint8_t> deck(deck_template);

    // Each thread gets its own RNG seeded independently.
    std::mt19937 rng(seed);

    const int cards_needed = (5 - board_size) + (num_opponents * 2);

    int wins = 0, ties = 0, losses = 0;

    // Pre-build hero 7-card hand buffer (hole + 5 board). Board is filled each trial.
    uint8_t hero_hand[7];
    hero_hand[0] = hole_cards[0];
    hero_hand[1] = hole_cards[1];
    for (int i = 0; i < board_size; ++i) hero_hand[2 + i] = board_template[i];

    uint8_t opp_hand[7];

    for (uint32_t t = 0; t < num_trials; ++t) {
        // Partial Fisher-Yates shuffle — only shuffle the cards we actually need.
        // This is O(cards_needed) instead of O(52).
        int deck_sz = static_cast<int>(deck.size());
        for (int i = 0; i < cards_needed && i < deck_sz; ++i) {
            // Pick a random card from the unshuffled portion [i, deck_sz)
            std::uniform_int_distribution<int> dist(i, deck_sz - 1);
            int j = dist(rng);
            std::swap(deck[i], deck[j]);
        }

        // Fill the board from the shuffled prefix
        int idx = 0;
        for (int i = board_size; i < 5; ++i)
            hero_hand[2 + i] = deck[idx++];

        // Evaluate hero's hand
        HandScore hero_score = evaluate7_bitboard(hero_hand);

        // Check against each opponent
        bool lost = false;
        bool tied = false;

        for (int o = 0; o < num_opponents; ++o) {
            opp_hand[0] = deck[idx];
            opp_hand[1] = deck[idx + 1];
            idx += 2;
            // Fill opponent board (same board as hero)
            for (int i = 0; i < 5; ++i) opp_hand[2 + i] = hero_hand[2 + i];

            HandScore opp_score = evaluate7_bitboard(opp_hand);

            if (opp_score > hero_score) { lost = true; break; }
            if (opp_score == hero_score)  tied = true;
        }

        if (lost)        ++losses;
        else if (tied)   ++ties;
        else             ++wins;
    }

    partial_result.wins   = wins;
    partial_result.ties   = ties;
    partial_result.losses = losses;
    partial_result.total  = static_cast<int>(num_trials);
}

}  // namespace

SimResult run_monte_carlo(const std::vector<uint8_t>& hole_cards,
                          const std::vector<uint8_t>& board,
                          int num_opponents,
                          uint32_t num_trials,
                          unsigned seed,
                          int num_threads) {
    // Determine thread count
    if (num_threads <= 0)
        num_threads = static_cast<int>(std::thread::hardware_concurrency());
    if (num_threads < 1) num_threads = 1;

    // Build the deck template ONCE: all 52 cards minus hole cards and board.
    bool used[52] = {};
    for (uint8_t c : hole_cards) used[c] = true;
    for (uint8_t c : board)      used[c] = true;

    std::vector<uint8_t> deck_template;
    deck_template.reserve(52 - hole_cards.size() - board.size());
    for (int c = 0; c < 52; ++c)
        if (!used[c]) deck_template.push_back(static_cast<uint8_t>(c));

    const uint8_t board_arr[5] = {
        static_cast<uint8_t>(board.size() > 0 ? board[0] : 0),
        static_cast<uint8_t>(board.size() > 1 ? board[1] : 0),
        static_cast<uint8_t>(board.size() > 2 ? board[2] : 0),
        static_cast<uint8_t>(board.size() > 3 ? board[3] : 0),
        static_cast<uint8_t>(board.size() > 4 ? board[4] : 0),
    };

    // Distribute trials across threads
    uint32_t trials_per_thread = num_trials / num_threads;
    uint32_t remainder = num_trials % num_threads;

    std::vector<SimResult> partial(num_threads);
    std::vector<std::thread> threads;
    threads.reserve(num_threads);

    for (int t = 0; t < num_threads; ++t) {
        uint32_t batch = trials_per_thread + (t == 0 ? remainder : 0);
        unsigned thread_seed = seed == 0
            ? static_cast<unsigned>(std::random_device{}()) + t
            : seed + static_cast<unsigned>(t);

        threads.emplace_back(run_batch,
            hole_cards.data(),
            board_arr,
            static_cast<int>(board.size()),
            num_opponents,
            std::cref(deck_template),
            batch,
            thread_seed,
            std::ref(partial[t]));
    }

    // Join all threads
    for (auto& th : threads) th.join();

    // Aggregate results
    SimResult result;
    for (const auto& p : partial) {
        result.wins   += p.wins;
        result.ties   += p.ties;
        result.losses += p.losses;
        result.total  += p.total;
    }
    return result;
}

std::vector<StreetData> get_equity_by_street(
    const std::vector<uint8_t>& hole_cards,
    const std::vector<uint8_t>& board,
    int num_opponents,
    uint32_t num_trials,
    unsigned seed,
    int num_threads
) {
    std::vector<StreetData> streets;
    
    // Pre-flop
    {
        std::vector<uint8_t> empty_board;
        SimResult r = run_monte_carlo(hole_cards, empty_board, num_opponents, num_trials, seed, num_threads);
        streets.push_back({"Pre-Flop", 0, r.equity(), r.win_rate(), r.tie_rate(), r.loss_rate()});
    }

    // Flop
    if (board.size() >= 3) {
        std::vector<uint8_t> flop(board.begin(), board.begin() + 3);
        SimResult r = run_monte_carlo(hole_cards, flop, num_opponents, num_trials, seed, num_threads);
        streets.push_back({"Flop", 3, r.equity(), r.win_rate(), r.tie_rate(), r.loss_rate()});
    }

    // Turn
    if (board.size() >= 4) {
        std::vector<uint8_t> turn(board.begin(), board.begin() + 4);
        SimResult r = run_monte_carlo(hole_cards, turn, num_opponents, num_trials, seed, num_threads);
        streets.push_back({"Turn", 4, r.equity(), r.win_rate(), r.tie_rate(), r.loss_rate()});
    }

    // River
    if (board.size() == 5) {
        SimResult r = run_monte_carlo(hole_cards, board, num_opponents, num_trials, seed, num_threads);
        streets.push_back({"River", 5, r.equity(), r.win_rate(), r.tie_rate(), r.loss_rate()});
    }

    return streets;
}

AnalyzeResult analyze_hand(
    const std::vector<uint8_t>& hole_cards,
    const std::vector<uint8_t>& board
) {
    AnalyzeResult res;
    if (hole_cards.empty()) return res;

    uint16_t suit_masks[4] = {0, 0, 0, 0};
    uint8_t  rank_count[13] = {0};
    
    for (uint8_t c : hole_cards) {
        suit_masks[c / 13] |= (1u << (c % 13));
        rank_count[c % 13]++;
    }
    for (uint8_t c : board) {
        suit_masks[c / 13] |= (1u << (c % 13));
        rank_count[c % 13]++;
    }
    
    uint16_t rank_mask = 0;
    for (int r = 0; r < 13; ++r) if (rank_count[r]) rank_mask |= (1u << r);
    
    bool flush = false;
    for (int s = 0; s < 4; ++s) {
        if (__builtin_popcount(suit_masks[s]) >= 5) flush = true;
        if (__builtin_popcount(suit_masks[s]) == 4) res.potential_draws.push_back("Flush Draw");
    }
    
    bool straight = false;
    uint16_t m = rank_mask;
    if (m & (m>>1) & (m>>2) & (m>>3) & (m>>4)) straight = true;
    uint16_t wheel_mask = (1<<12) | 15;
    if ((rank_mask & wheel_mask) == wheel_mask) straight = true;
    
    bool straight_draw = false;
    for (int i = 0; i <= 9; ++i) {
        uint16_t window = (rank_mask >> i) & 0x1F;
        if (__builtin_popcount(window) == 4) straight_draw = true;
    }
    uint16_t wheel_window = (rank_mask & 0xF) | ((rank_mask >> 8) & 0x10);
    if (__builtin_popcount(wheel_window) == 4) straight_draw = true;
    
    if (straight_draw && !straight) res.potential_draws.push_back("Straight Draw");

    int quads = 0, trips = 0, pairs = 0;
    for (int r = 0; r < 13; ++r) {
        if (rank_count[r] == 4) quads++;
        else if (rank_count[r] == 3) trips++;
        else if (rank_count[r] == 2) pairs++;
    }
    
    if (straight && flush) {
        res.hand_name = "Straight Flush";
    } else if (quads) {
        res.hand_name = "Four of a Kind";
    } else if (trips && (pairs || trips > 1)) {
        res.hand_name = "Full House";
        res.hands_that_beat.push_back("Four of a Kind");
    } else if (flush) {
        res.hand_name = "Flush";
        res.hands_that_beat.push_back("Full House");
    } else if (straight) {
        res.hand_name = "Straight";
        res.hands_that_beat.push_back("Flush");
    } else if (trips) {
        res.hand_name = "Three of a Kind";
        res.hands_that_beat.push_back("Straight");
    } else if (pairs >= 2) {
        res.hand_name = "Two Pair";
        res.hands_that_beat.push_back("Three of a Kind");
    } else if (pairs == 1) {
        res.hand_name = "One Pair";
        res.hands_that_beat.push_back("Two Pair");
    } else {
        res.hand_name = "High Card";
        res.hands_that_beat.push_back("One Pair");
    }

    return res;
}

}  // namespace poker_sim
