#include <emscripten/bind.h>
#include "poker_sim/simulation.hpp"
#include <vector>

using namespace emscripten;

// WebAssembly wrapper function
poker_sim::SimResult run_monte_carlo_wasm(const std::vector<uint8_t>& hole_cards, 
                                          const std::vector<uint8_t>& board, 
                                          int num_opponents, 
                                          uint32_t num_trials) {
    // We force num_threads = 1 because standard WebAssembly doesn't have shared-memory pthreads enabled by default in all browsers.
    // The C++ engine is so fast that 1 thread inside the browser still runs millions of simulations per second!
    return poker_sim::run_monte_carlo(hole_cards, board, num_opponents, num_trials, 0, 1);
}

std::vector<poker_sim::StreetData> get_equity_by_street_wasm(const std::vector<uint8_t>& hole_cards, 
                                          const std::vector<uint8_t>& board, 
                                          int num_opponents, 
                                          uint32_t num_trials) {
    return poker_sim::get_equity_by_street(hole_cards, board, num_opponents, num_trials, 0, 1);
}

EMSCRIPTEN_BINDINGS(poker_sim_wasm) {
    // Expose std::vector<uint8_t> so JavaScript can pass arrays into C++
    register_vector<uint8_t>("VectorUint8");

    // Expose the SimResult struct to JavaScript
    class_<poker_sim::SimResult>("SimResult")
        .property("wins", &poker_sim::SimResult::wins)
        .property("ties", &poker_sim::SimResult::ties)
        .property("losses", &poker_sim::SimResult::losses)
        .property("total", &poker_sim::SimResult::total)
        .function("win_rate", &poker_sim::SimResult::win_rate)
        .function("tie_rate", &poker_sim::SimResult::tie_rate)
        .function("loss_rate", &poker_sim::SimResult::loss_rate)
        .function("equity", &poker_sim::SimResult::equity);

    value_object<poker_sim::StreetData>("StreetData")
        .field("street", &poker_sim::StreetData::street)
        .field("board_len", &poker_sim::StreetData::board_len)
        .field("equity", &poker_sim::StreetData::equity)
        .field("win_pct", &poker_sim::StreetData::win_pct)
        .field("tie_pct", &poker_sim::StreetData::tie_pct)
        .field("loss_pct", &poker_sim::StreetData::loss_pct);

    class_<poker_sim::AnalyzeResult>("AnalyzeResult")
        .property("hand_name", &poker_sim::AnalyzeResult::hand_name)
        .property("hands_that_beat", &poker_sim::AnalyzeResult::hands_that_beat)
        .property("potential_draws", &poker_sim::AnalyzeResult::potential_draws);

    register_vector<std::string>("VectorString");
    register_vector<poker_sim::StreetData>("VectorStreetData");

    // Expose the main simulation function
    function("run_monte_carlo", &run_monte_carlo_wasm);
    function("get_equity_by_street", &get_equity_by_street_wasm);
    function("analyze_hand", &poker_sim::analyze_hand);
}
