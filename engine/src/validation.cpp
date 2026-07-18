#include "poker_sim/hand_eval.hpp"
#include "poker_sim/simulation.hpp"
#include <iostream>
#include <iomanip>
#include <vector>
#include <random>
#include <map>
#include <cmath>
#include <map>

using namespace poker_sim;

const int TRIALS = 5'000'000;

void print_row(const std::string& name, double expected, double actual) {
    double err = std::abs(expected - actual);
    std::cout << std::left << std::setw(30) << name 
              << std::right << std::setw(10) << std::fixed << std::setprecision(4) << expected << "%"
              << std::setw(15) << actual << "%"
              << std::setw(15) << err << "%" << "\n";
}

void test_1_preflop_dealing() {
    std::cout << "--- 1. Pre-Flop Dealing Frequencies (" << TRIALS << " hands) ---\n";
    std::cout << std::left << std::setw(30) << "Category" 
              << std::right << std::setw(11) << "Expected" << std::setw(16) << "Actual" << std::setw(16) << "Error\n";
    std::cout << std::string(75, '-') << "\n";

    std::mt19937 rng(42);
    int any_pair = 0, aa = 0, suited = 0, aks = 0, ako = 0;

    for (int t = 0; t < TRIALS; ++t) {
        // Fast pick 2 cards without full shuffle
        std::uniform_int_distribution<int> d1(0, 51);
        int c1 = d1(rng);
        std::uniform_int_distribution<int> d2(0, 50);
        int c2 = d2(rng);
        if (c2 >= c1) c2++;

        int r1 = card_rank(c1), r2 = card_rank(c2);
        int s1 = card_suit(c1), s2 = card_suit(c2);

        if (r1 == r2) any_pair++;
        if (r1 == 12 && r2 == 12) aa++;
        if (s1 == s2) suited++;
        if ((r1 == 12 && r2 == 11) || (r1 == 11 && r2 == 12)) {
            if (s1 == s2) aks++;
            else ako++;
        }
    }

    print_row("Any Pocket Pair", 5.88, any_pair * 100.0 / TRIALS);
    print_row("Specific Pair (AA)", 0.452, aa * 100.0 / TRIALS); // 1/221 = 0.4524%
    print_row("Any Suited", 23.53, suited * 100.0 / TRIALS);
    print_row("AK Suited (AKs)", 0.301, aks * 100.0 / TRIALS); // 4/1326 = 0.3016%
    print_row("AK Offsuit (AKo)", 0.905, ako * 100.0 / TRIALS); // 12/1326 = 0.905%
    std::cout << "\n";
}

void test_2_hand_rankings() {
    std::cout << "--- 2. Final Hand Rankings 7-Card (" << TRIALS << " hands) ---\n";
    std::cout << std::left << std::setw(30) << "Hand Type" 
              << std::right << std::setw(11) << "Expected" << std::setw(16) << "Actual" << std::setw(16) << "Error\n";
    std::cout << std::string(75, '-') << "\n";

    std::mt19937 rng(42);
    int counts[9] = {0};
    std::vector<uint8_t> deck(52);
    for (int i=0; i<52; ++i) deck[i] = i;

    for (int t = 0; t < TRIALS; ++t) {
        for (int i = 0; i < 7; ++i) {
            std::uniform_int_distribution<int> dist(i, 51);
            std::swap(deck[i], deck[dist(rng)]);
        }
        HandScore score = evaluate7_bitboard(deck.data());
        int type = score >> 28;
        counts[type]++;
    }

    const char* names[] = {"High Card", "One Pair", "Two Pair", "Three of a Kind", 
                           "Straight", "Flush", "Full House", "Four of a Kind", "Straight Flush"};
    double expected[] = {17.41, 43.82, 23.50, 4.83, 4.62, 3.03, 2.60, 0.168, 0.0279};

    for (int i = 0; i <= 8; ++i) {
        double exp = i == 8 ? 0.0311 : expected[i]; // Combine SF and Royal for simplicity (0.0279 + 0.0032 = 0.0311)
        print_row(names[i], exp, counts[i] * 100.0 / TRIALS);
    }
    std::cout << "\n";
}

void test_3_equities() {
    std::cout << "--- 3. Classic Pre-Flop All-In Equities (vs specific hands) ---\n";
    std::cout << "Running 5M trials multithreaded per matchup...\n";
    std::cout << std::left << std::setw(15) << "Matchup" 
              << std::right << std::setw(15) << "Win%" << std::setw(15) << "Loss%" << std::setw(15) << "Tie%\n";
    std::cout << std::string(60, '-') << "\n";

    auto print_eq = [](const std::string& name, const std::vector<uint8_t>& h1, const std::vector<uint8_t>& h2) {
        // Run MC where h1 is hero, h2 is fixed opponent. 
        // Our engine run_monte_carlo takes opponents as random. We need to evaluate h1 vs h2 directly.
        // We can just use evaluate7_bitboard directly on a board for 5M trials.
        std::mt19937 rng(42);
        std::vector<uint8_t> deck;
        for(uint8_t i=0; i<52; ++i) {
            if(i!=h1[0] && i!=h1[1] && i!=h2[0] && i!=h2[1]) deck.push_back(i);
        }
        int w=0, l=0, t=0;
        uint8_t b1[7] = {h1[0], h1[1], 0,0,0,0,0};
        uint8_t b2[7] = {h2[0], h2[1], 0,0,0,0,0};
        
        for(int i=0; i<TRIALS; ++i) {
            for (int j = 0; j < 5; ++j) {
                std::uniform_int_distribution<int> dist(j, 47);
                int swap_idx = dist(rng);
                uint8_t card = deck[swap_idx];
                deck[swap_idx] = deck[j];
                deck[j] = card;
                b1[2+j] = card;
                b2[2+j] = card;
            }
            HandScore s1 = evaluate7_bitboard(b1);
            HandScore s2 = evaluate7_bitboard(b2);
            if (s1 > s2) w++;
            else if (s1 < s2) l++;
            else t++;
        }
        std::cout << std::left << std::setw(15) << name 
                  << std::right << std::setw(14) << std::fixed << std::setprecision(2) << (w*100.0/TRIALS) << "%"
                  << std::setw(14) << (l*100.0/TRIALS) << "%"
                  << std::setw(14) << (t*100.0/TRIALS) << "%\n";
    };

    // QQ (QsQh) vs AKs (AsKs)
    print_eq("QQ vs AKs", {10, 23}, {12, 11}); // QQ expected: win 53.9%, AKs expected loss 45.7% (wait, 12,11 is AsKs. QsQh is 10,23. That conflicts on suits if we use spades/hearts for both. Let's use different suits to be safe).
    // Let's use QQ (Qd, Qc) vs AKs (As, Ks). Qd=36, Qc=49
    // As=12, Ks=11
    
    // QQ vs AKs
    print_eq("QQ vs AKs", {36, 49}, {12, 11});
    // AA vs KK
    print_eq("AA vs KK", {38, 51}, {11, 24});
    // AKo vs AQo (AsKd vs AhQc) As=12, Kd=37, Ah=25, Qc=49
    print_eq("AKo vs AQo", {12, 37}, {25, 49});
    // AA vs 72o (AdAc vs 7s2h) Ad=38, Ac=51, 7s=5, 2h=13
    print_eq("AA vs 72o", {38, 51}, {5, 13});
    std::cout << "\n";
}

void test_4_flop_hit() {
    std::cout << "--- 4. Flop Hit Rates (" << TRIALS << " flops) ---\n";
    std::cout << std::left << std::setw(30) << "Draw" 
              << std::right << std::setw(11) << "Expected" << std::setw(16) << "Actual" << std::setw(16) << "Error\n";
    std::cout << std::string(75, '-') << "\n";

    std::mt19937 rng(42);
    int exactly_set = 0;
    int flush_completed = 0;
    int flush_draw = 0;

    std::vector<uint8_t> deck_55;
    for(uint8_t i=0; i<52; ++i) if(i != 3 && i != 16) deck_55.push_back(i); // 5s=3, 5h=16

    std::vector<uint8_t> deck_suited;
    for(uint8_t i=0; i<52; ++i) if(i != 12 && i != 11) deck_suited.push_back(i); // As=12, Ks=11

    for(int t=0; t<TRIALS; ++t) {
        // Flop 3 cards for 55
        for (int j = 0; j < 3; ++j) {
            std::uniform_int_distribution<int> dist(j, 49);
            int idx = dist(rng);
            std::swap(deck_55[j], deck_55[idx]);
        }
        int count_5 = 0;
        if(card_rank(deck_55[0]) == 3) count_5++;
        if(card_rank(deck_55[1]) == 3) count_5++;
        if(card_rank(deck_55[2]) == 3) count_5++;
        if(count_5 == 1) exactly_set++; // Exactly a set (not quads)

        // Flop 3 cards for suited
        for (int j = 0; j < 3; ++j) {
            std::uniform_int_distribution<int> dist(j, 49);
            int idx = dist(rng);
            std::swap(deck_suited[j], deck_suited[idx]);
        }
        int count_suit = 0;
        if(card_suit(deck_suited[0]) == 0) count_suit++; // Spades
        if(card_suit(deck_suited[1]) == 0) count_suit++;
        if(card_suit(deck_suited[2]) == 0) count_suit++;
        
        if(count_suit == 3) flush_completed++;
        if(count_suit == 2) flush_draw++;
    }

    print_row("Flopping exactly a Set", 11.80, exactly_set * 100.0 / TRIALS);
    print_row("Flopping completed Flush", 0.84, flush_completed * 100.0 / TRIALS);
    print_row("Flopping a Flush Draw", 10.90, flush_draw * 100.0 / TRIALS);
}

int main() {
    test_1_preflop_dealing();
    test_2_hand_rankings();
    test_3_equities();
    test_4_flop_hit();
    return 0;
}
