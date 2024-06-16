const express = require("express");
const router = express.Router();
const config = require("../config.json");

router.get("/", async (req, res) => {
  try {
    const client = req.client;
    const statsHandler = req.statsHandler;
    const guild = await client.guilds.fetch(config.guildID);

    // Fetch basic information about the guild (this includes approximate member counts)
    const guildPreview = await guild.fetch();
    const totalMembers = guild.memberCount;
    const onlineMembers = guildPreview.approximatePresenceCount;
    const srvLog = function (text) {
      console.log(text);
    };

    res.render("overview", {
      srvLog,
      totalMembers,
      onlineMembers,
      stats: statsHandler.stats,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send(`<h1>Error</h1><p>${error.message}</p>`);
  }
});

module.exports = router;
