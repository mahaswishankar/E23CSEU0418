function solveKnapsack(tasks, maxHours) {
  const n = tasks.length;
  const dp = Array(n + 1).fill().map(() => Array(maxHours + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    const { Duration, Impact } = tasks[i - 1];
    for (let w = 0; w <= maxHours; w++) {
      if (Duration <= w) {
        dp[i][w] = Math.max(Impact + dp[i - 1][w - Duration], dp[i - 1][w]);
      } else {
        dp[i][w] = dp[i - 1][w];
      }
    }
  }
  let w = maxHours;
  const selectedTasks = [];
  for (let i = n; i > 0; i--) {
    if (dp[i][w] !== dp[i - 1][w]) {
      selectedTasks.push(tasks[i - 1]);
      w -= tasks[i - 1].Duration;
    }
  }
  return { maxImpact: dp[n][maxHours], selectedTasks };
}

module.exports = solveKnapsack;
