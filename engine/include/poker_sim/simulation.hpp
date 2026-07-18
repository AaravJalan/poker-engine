#ifndef POKER_SIM_SIMULATION_HPP
#define POKER_SIM_SIMULATION_HPP

#include <cstdint>
#include <vector>

#include <string>

namespace poker_sim {

struct SimResult {
    int wins   = 0;
    int ties   = 0;
    int losses = 0;
    int total  = 0;

    double win_rate()  const { return total > 0 ? (double)wins   / total : 0.0; }
    double tie_rate()  const { return total > 0 ? (double)ties   / total : 0.0; }
    double loss_rate() const { return total > 0 ? (double)losses / total : 0.0; }
    double equity()    const { return win_rate() + tie_rate() / 2.0; }
};

struct StreetData {
    std::string street;
    int board_len = 0;
    double equity = 0.0;
    double win_pct = 0.0;
    double tie_pct = 0.0;
    double loss_pct = 0.0;
};

struct AnalyzeResult {
    std::string hand_name;
    std::vector<std::string> hands_that_beat;
    std::vector<std::string> potential_draws;
};

std::vector<StreetData> get_equity_by_street(
    const std::vector<uint8_t>& hole_cards,
    const std::vector<uint8_t>& board,
    int num_opponents,
    uint32_t num_trials,
    unsigned seed = 0,
    int num_threads = 0
);

AnalyzeResult analyze_hand(
    const std::vector<uint8_t>& hole_cards,
    const std::vector<uint8_t>& board
);

/// Run a Monte Carlo simulation using multithreaded rollouts.
/// hole_cards: exactly 2 card indices (0-51)
/// board:      0, 3, 4, or 5 card indices
/// num_opponents: 1-8
/// num_trials: total number of simulations to run (split across threads)
/// num_threads: number of CPU threads to use (0 = auto-detect hardware concurrency)
/// seed:       base RNG seed (each thread gets seed + thread_id for independence)
SimResult run_monte_carlo(const std::vector<uint8_t>& hole_cards,
                          const std::vector<uint8_t>& board,
                          int num_opponents,
                          uint32_t num_trials,
                          unsigned seed = 0,
                          int num_threads = 0);

}  // namespace poker_sim

#endif
