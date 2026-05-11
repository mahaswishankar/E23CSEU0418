const { fetchData } = require("../services/apiServices");
const solveKnapsack = require("../services/knapsackService");
const Log = require("../middleware/logger");

const BASE_URL = "http://4.224.186.213/evaluation-service";

const getSchedule = async (req, res) => {
  const { depotId } = req.params;
  await Log("backend", "info", "handler", `Schedule request for depotId: ${depotId}`);
  try {
    const depotData = await fetchData(`${BASE_URL}/depots`);
    const depot = depotData.depots.find((d) => String(d.ID) === String(depotId));
    if (!depot) {
      await Log("backend", "warn", "handler", `Depot not found: ${depotId}`);
      return res.status(404).json({ error: `Depot ${depotId} not found` });
    }
    const mechanicHours = depot.MechanicHours;
    const vehicleData = await fetchData(`${BASE_URL}/vehicles`);
    const tasks = vehicleData.vehicles;
    const result = solveKnapsack(tasks, mechanicHours);
    await Log("backend", "info", "controller", `Optimization complete. MaxImpact: ${result.maxImpact}`);
    return res.status(200).json({ depotId: depot.ID, mechanicHours, ...result });
  } catch (error) {
    await Log("backend", "error", "handler", `Failed: ${error.message}`);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { getSchedule };
