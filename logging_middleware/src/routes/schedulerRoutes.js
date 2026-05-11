const express = require("express");
const router = express.Router();
const { getSchedule } = require("../controllers/schedulerController");
router.get("/:depotId", getSchedule);
module.exports = router;
