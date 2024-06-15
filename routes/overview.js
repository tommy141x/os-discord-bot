const express = require("express");
const router = express.Router();
const config = require("../config.json");

router.get("/", async (req, res) => {
  try {
    const client = req.client;
    if (!client || !client.guilds) {
      throw new Error("Discord client is not initialized");
    }
    const guild = await client.guilds.fetch(config.guildID);
    if (!guild) {
      throw new Error("Guild not found");
    }
    const members = await guild.members.fetch();
    const totalMembers = members.size;
    const onlineMembers = members.filter(
      (member) => member.presence?.status === "online",
    ).size;
    res.send(`
      <h1>Overview</h1>
      <p>Total Members: ${totalMembers}</p>
      <p>Online Members: ${onlineMembers}</p>
    `);
  } catch (error) {
    console.error(error);
    res.status(500).send(`<h1>Error</h1><p>${error.message}</p>`);
  }
});

module.exports = router;
