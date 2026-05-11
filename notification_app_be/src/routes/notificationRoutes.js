const express = require("express");
const router = express.Router();
const { getTopNotifications } = require("../controllers/notificationController");
router.get("/top", getTopNotifications);
module.exports = router;
