// page1.js
const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.send(`
    <h1>Page 1</h1>
    <button onclick="location.href='/'">Go back to Dashboard</button>
  `);
});

module.exports = router;
