# NLHE Poker Engine

A high-performance Texas Hold'em poker decision-support platform featuring a native C++ Monte Carlo engine cross-compiled to WebAssembly for zero-latency in-browser evaluations, and bound to Python via pybind11 for ultra-fast local CLI analysis.

## Purpose

- Quickly estimate **win/tie/loss** and **equity** from any street (preflop → river)
- Explain *why* (hand analysis + draws) instead of just showing a percentage
- Track results over time (sessions + winnings)

## Features

### WebAssembly (WASM) Simulator
- **Tap-to-pick cards** (hole + board) with a visual deck grid (mobile-friendly layout).
- **Live probability** while selecting cards for fast approximations.
- **Run simulation** for a highly accurate Monte Carlo result.
- **Fast Native Engine:** Core C++ Monte Carlo logic uses **64-bit Bitboards** and is compiled to WebAssembly.
- **Zero-Latency UI:** Probability updates powered client-side (no network requests  for odds calculations).
- **Equity by street** chart (how equity changes as community cards arrive)
- **Hand analysis** (current best hand, hands that beat you, potential draws)

### Dashboard & Analytics
- Track sessions: **date, buy-in, cash-out, hours, notes**
- View a cumulative **profit over time** graph for bankroll management.

### Multiplayer & Social
- Search and add friends.
- Create games with a **join code** and track **buy-ins**, **cash-outs**, and **settlements**.

## Performance & Accuracy

Built to test the limits of browser-based computation, the platform ports low-level C++ game-engine techniques to WebAssembly:
- **Speed:** By representing 52-card decks as 64-bit Bitboards, the C++ engine avoids traditional loops and branches, relying on raw hardware bitwise operations (`popcount`, shifts). The result is an evaluation speed of **26.9+ million hands per second** per CPU thread.
- **Accuracy:** The Monte Carlo evaluator is rigorously benchmarked via a custom C++ combinatorial testing suite. It was validated against all **2,598,960** exact 7-card permutations, ensuring the simulated distributions converge to true mathematical probabilities with a **99.97% accuracy** (0.03% margin of error).

## Tech Stack

### Languages
- **C++ (WebAssembly / Emscripten):** High-performance core engine and bitwise evaluators.
- **TypeScript:** Frontend components, state, and WASM integration.
- **Python:** Backend routing, CLI tools, and API endpoints.
- **SQL:** Database schema and migrations.

### Frameworks & Libraries
- **React (Vite):** Frontend UI and component rendering.
- **FastAPI:** Lightweight backend router for DB ops and AI chat.
- **Pybind11:** Seamless bindings to expose the C++ engine to the Python backend CLI.

### APIs & Infrastructure
- **Supabase (PostgreSQL):** Authentication, real-time multiplayer sync, and database.
- **OpenAI API & Google Gemini 2.5 Flash:** Large Language Models powering the AI Poker Assistant.
- **Vercel:** Cloud hosting and deployment for the React frontend.

## How to Run Locally

### Requirements
- **Node.js** 18+
- **Python** 3.9+
- **Emscripten (`emcc`)** (if you plan to recompile the C++ WASM engine)

### 1. Start the Backend (FastAPI)
The backend acts as a lightweight router for database operations and AI chat.
From the repo root:
```bash
./run_api.sh
```
API runs at **`http://127.0.0.1:8000`**.

### 2. Start the Frontend (Vite)
```bash
cd web
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```
App runs at **`http://127.0.0.1:5173`**. The WebAssembly engine will load instantly in the browser.

## Environment Variables

### Frontend (`web/.env`)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Backend
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY` (optional)
- `GEMINI_API_KEY` (optional)
