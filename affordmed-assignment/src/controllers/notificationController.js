const { fetchData } = require("../services/apiServices");
const Log = require("../middleware/logger");

const BASE_URL = "http://4.224.186.213/evaluation-service";
const PRIORITY_MAP = { Placement: 1, Result: 2, Event: 3 };

const getTopNotifications = async (req, res) => {
  await Log("backend", "info", "handler", "Top notifications request received");
  try {
    const data = await fetchData(`${BASE_URL}/notifications`);
    const notifications = data.notifications;
    if (!notifications || notifications.length === 0) {
      return res.status(200).json({ topNotifications: [] });
    }
    const sorted = [...notifications].sort((a, b) => {
      const pA = PRIORITY_MAP[a.type] ?? 99;
      const pB = PRIORITY_MAP[b.type] ?? 99;
      if (pA !== pB) return pA - pB;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    const top10 = sorted.slice(0, 10);
    await Log("backend", "info", "controller", `Returning top ${top10.length} notifications`);
    return res.status(200).json({ topNotifications: top10 });
  } catch (error) {
    await Log("backend", "error", "handler", `Failed: ${error.message}`);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { getTopNotifications };
