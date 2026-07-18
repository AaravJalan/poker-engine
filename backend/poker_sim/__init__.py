"""
Texas Hold'em Monte Carlo simulation – Python API.

This package provides Python bindings to the highly optimized C++ Bitboard engine.
"""

# Import the C++ extension directly
from poker_sim.poker_sim_cpp import run_monte_carlo

__all__ = [
    "run_monte_carlo",
]
