/*
 * bindings.cpp — Pybind11 bridge exposing the C++ engine to Python.
 *
 * Usage from Python:
 *   from poker_sim.poker_sim_cpp import run_monte_carlo, SimResult
 *   result = run_monte_carlo([0, 13], [], num_opponents=1, num_trials=100000)
 *   print(result.equity())   # win% + tie%/2
 */

#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include <poker_sim/simulation.hpp>

namespace py = pybind11;

PYBIND11_MODULE(poker_sim_cpp, m) {
    m.doc() = "High-performance Texas Hold'em Monte Carlo engine (C++, multithreaded, bitboard evaluator)";

    py::class_<poker_sim::SimResult>(m, "SimResult")
        .def_readonly("wins",   &poker_sim::SimResult::wins)
        .def_readonly("ties",   &poker_sim::SimResult::ties)
        .def_readonly("losses", &poker_sim::SimResult::losses)
        .def_readonly("total",  &poker_sim::SimResult::total)
        .def("win_rate",  &poker_sim::SimResult::win_rate,
             "Fraction of trials where hero won outright.")
        .def("tie_rate",  &poker_sim::SimResult::tie_rate,
             "Fraction of trials that ended in a split pot.")
        .def("loss_rate", &poker_sim::SimResult::loss_rate,
             "Fraction of trials where hero lost.")
        .def("equity",    &poker_sim::SimResult::equity,
             "Hero's equity = win_rate + tie_rate/2. This is the true EV fraction.");

    m.def("run_monte_carlo",
        [](const std::vector<int>& hole_cards,
           const std::vector<int>& board,
           int num_opponents,
           uint32_t num_trials,
           py::object seed_obj,
           int num_threads) {
            // Convert int lists to uint8_t vectors
            std::vector<uint8_t> hc, b;
            hc.reserve(hole_cards.size());
            b.reserve(board.size());
            for (int c : hole_cards) hc.push_back(static_cast<uint8_t>(c));
            for (int c : board)      b.push_back(static_cast<uint8_t>(c));

            unsigned seed = seed_obj.is_none()
                ? 0u
                : static_cast<unsigned>(py::cast<int>(seed_obj));

            return poker_sim::run_monte_carlo(hc, b, num_opponents, num_trials, seed, num_threads);
        },
        py::arg("hole_cards"),
        py::arg("board")         = std::vector<int>{},
        py::arg("num_opponents") = 1,
        py::arg("num_trials")    = 100000,
        py::arg("seed")          = py::none(),
        py::arg("num_threads")   = 0,
        R"doc(
Run a multithreaded Monte Carlo equity simulation.

Args:
    hole_cards:    List of exactly 2 card indices (0-51). Rank = idx % 13, Suit = idx / 13.
    board:         List of 0, 3, 4, or 5 known community card indices.
    num_opponents: Number of opponents (1-8). Default: 1.
    num_trials:    Total number of random runouts to simulate. Default: 100,000.
    seed:          Optional integer seed for reproducibility.
    num_threads:   CPU threads to use (0 = auto hardware concurrency). Default: 0.

Returns:
    SimResult with .wins, .ties, .losses, .total, .win_rate(), .tie_rate(), .equity()
        )doc");
}
