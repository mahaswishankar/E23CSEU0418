const express = require("express");
require("dotenv").config();
const { getAuthToken } = require("./config/auth");
const schedulerRoutes = require("./routes/schedulerRoutes");
const notificationRoutes = require("./routes/notificationRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use("/api/schedule", schedulerRoutes);
app.use("/api/notifications", notificationRoutes);
app.get("/", (req, res) => res.json({ status: "Affordmed Backend Running" }));

const start = async () => {
  const token = await getAuthToken();
  if (!token) { console.error("Auth failed"); process.exit(1); }
  console.log("Auth token verified.");
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
};

start();
