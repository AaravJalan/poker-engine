const createPokerSim = require('./web/public/poker_sim.js');
async function run() {
  const m = await createPokerSim();
  const hole = new m.VectorUint8();
  hole.push_back(0); hole.push_back(1);
  const board = new m.VectorUint8();
  const t0 = performance.now();
  const res = m.run_monte_carlo(hole, board, 2, 100000);
  const t1 = performance.now();
  console.log(`100,000 trials took: ${(t1 - t0).toFixed(2)} ms`);
}
run();
