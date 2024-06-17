const express = require("express");
const router = express.Router();
const config = require("../config.json");
const { GuildSystemChannelFlags } = require("discord.js");

router.get("/", async (req, res) => {
  const client = req.client;
  const guild = client.guilds.cache.get(config.guildID);

  if (!guild) {
    return res.status(404).send("Guild not found");
  }

  const guildData = {
    id: guild.id,
    name: guild.name,
    icon: guild.iconURL({ dynamic: true, size: 128 }),
    defaultMessageNotifications: guild.defaultMessageNotifications,
    explicitContentFilter: guild.explicitContentFilter,
    systemChannelId: guild.systemChannelId,
    preferredLocale: guild.preferredLocale,
    sendWelcomeMessage: !guild.systemChannelFlags.has(
      GuildSystemChannelFlags.SuppressJoinNotifications,
    ),
    promptWelcomeSticker: !guild.systemChannelFlags.has(
      GuildSystemChannelFlags.SuppressJoinNotificationReplies,
    ),
    sendBoostMessage: !guild.systemChannelFlags.has(
      GuildSystemChannelFlags.SuppressPremiumSubscriptions,
    ),
    sendPurchaseMessage: !guild.systemChannelFlags.has(
      GuildSystemChannelFlags.SuppressRoleSubscriptionPurchaseNotifications,
    ),
    promptSubscriptionSticker: !guild.systemChannelFlags.has(
      GuildSystemChannelFlags.SuppressRoleSubscriptionPurchaseNotificationReplies,
    ),
  };

  res.render("server-settings", {
    guild: guildData,
  });
});

router.post("/update-settings", async (req, res) => {
  console.log("wewewe");
  const client = req.client;
  const guild = client.guilds.cache.get(config.guildID);
  const settings = req.body;

  try {
    const systemChannelFlags = guild.systemChannelFlags.toArray();

    if (!settings.sendWelcomeMessage)
      systemChannelFlags.push("SuppressJoinNotifications");
    else
      systemChannelFlags.splice(
        systemChannelFlags.indexOf("SuppressJoinNotifications"),
        1,
      );

    if (!settings.promptWelcomeSticker)
      systemChannelFlags.push("SuppressJoinNotificationReplies");
    else
      systemChannelFlags.splice(
        systemChannelFlags.indexOf("SuppressJoinNotificationReplies"),
        1,
      );

    if (!settings.sendBoostMessage)
      systemChannelFlags.push("SuppressPremiumSubscriptions");
    else
      systemChannelFlags.splice(
        systemChannelFlags.indexOf("SuppressPremiumSubscriptions"),
        1,
      );

    if (!settings.sendPurchaseMessage)
      systemChannelFlags.push("SuppressRoleSubscriptionPurchaseNotifications");
    else
      systemChannelFlags.splice(
        systemChannelFlags.indexOf(
          "SuppressRoleSubscriptionPurchaseNotifications",
        ),
        1,
      );

    if (!settings.promptSubscriptionSticker)
      systemChannelFlags.push(
        "SuppressRoleSubscriptionPurchaseNotificationReplies",
      );
    else
      systemChannelFlags.splice(
        systemChannelFlags.indexOf(
          "SuppressRoleSubscriptionPurchaseNotificationReplies",
        ),
        1,
      );

    settings.systemChannelFlags = systemChannelFlags;

    // Remove the boolean fields
    delete settings.sendWelcomeMessage;
    delete settings.promptWelcomeSticker;
    delete settings.sendBoostMessage;
    delete settings.sendPurchaseMessage;
    delete settings.promptSubscriptionSticker;

    await guild.edit(settings);
    res.json({
      success: true,
      message: "Server settings updated successfully.",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
