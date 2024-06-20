const express = require("express");
const session = require("express-session");
const favicon = require("express-favicon");
const FileStore = require("session-file-store")(session);
const passport = require("passport");
const { Strategy } = require("passport-discord");
const {
  Client,
  GatewayIntentBits,
  ChannelType,
  GuildSystemChannelFlags,
} = require("discord.js");
const config = require("./config.json");
const db = require("./db");
const Logger = require("./logger");
const path = require("path");
const fs = require("fs");

// Init Express
const app = express();
const port = process.env.PORT || config.port;

// Web server
app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: new FileStore({
      retries: 1,
      fileExtension: ".json",
      ttl: 3600,
      path: "./sessions",
      reapInterval: 3600,
      logFn: function () {},
    }),
  }),
);
app.use(passport.initialize());
app.use(passport.session());

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

let logger;

app.use((req, res, next) => {
  req.client = client;
  next();
});

client.login(config.botToken);

client.once("ready", () => {
  console.log("Discord bot is started!");

  let settings = db.get("settings");
  if (!settings || settings === {}) {
    const defaultChannelId = "";
    const logSettings = {
      logMemberBans: {
        enabled: true,
        channelId: defaultChannelId,
      },
      logMemberUnbans: {
        enabled: false,
        channelId: defaultChannelId,
      },
      logMemberLeaves: {
        enabled: true,
        channelId: defaultChannelId,
      },
      logMemberJoins: {
        enabled: true,
        channelId: defaultChannelId,
      },
      logMemberUpdates: {
        enabled: false,
        channelId: defaultChannelId,
      },
      logChannelCreations: {
        enabled: false,
        channelId: defaultChannelId,
      },
      logChannelDeletions: {
        enabled: false,
        channelId: defaultChannelId,
      },
      logChannelUpdates: {
        enabled: false,
        channelId: defaultChannelId,
      },
      logThreadCreations: {
        enabled: false,
        channelId: defaultChannelId,
      },
      logThreadDeletions: {
        enabled: false,
        channelId: defaultChannelId,
      },
      logThreadUpdates: {
        enabled: false,
        channelId: defaultChannelId,
      },
      logRoleCreations: {
        enabled: false,
        channelId: defaultChannelId,
      },
      logRoleDeletions: {
        enabled: false,
        channelId: defaultChannelId,
      },
      logRoleUpdates: {
        enabled: false,
        channelId: defaultChannelId,
      },
      logMessageCreation: {
        enabled: true,
        channelId: defaultChannelId,
      },
      logMessageDeletions: {
        enabled: false,
        channelId: defaultChannelId,
      },
      logMessageEdits: {
        enabled: false,
        channelId: defaultChannelId,
      },
      logVoiceStateUpdates: {
        enabled: false,
        channelId: defaultChannelId,
      },
      logInviteCreations: {
        enabled: false,
        channelId: defaultChannelId,
      },
      logInviteDeletions: {
        enabled: false,
        channelId: defaultChannelId,
      },
      logServerUpdates: {
        enabled: false,
        channelId: defaultChannelId,
      },
      logPermissionUpdates: {
        enabled: false,
        channelId: defaultChannelId,
      },
    };
    settings = {
      logSettings: logSettings,
    };
    db.set("settings", settings);
  }
  logger = new Logger(client, settings.logSettings);

  const guild = client.guilds.cache.get(config.guildID);
  if (guild) {
    const guildIconURL = guild.iconURL();
    if (guildIconURL) {
      const guildFaviconPath = "./public/favicon.ico";
      const file = fs.createWriteStream(guildFaviconPath);
      const https = require("https");
      https.get(guildIconURL, function (response) {
        response.pipe(file);
      });
    }
  }
});

app.use(favicon(__dirname + "/public/favicon.ico"));

// Configure Passport
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  done(null, obj);
});

passport.use(
  new Strategy(
    {
      clientID: config.clientID,
      clientSecret: config.clientSecret,
      callbackURL: config.publicURL + "/login/callback",
      scope: ["identify"],
    },
    (accessToken, refreshToken, profile, done) => {
      process.nextTick(() => done(null, profile));
    },
  ),
);

// Authentication middleware
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/login");
}

// Define routes for authentication
app.get("/login/auth", passport.authenticate("discord"));

app.get(
  "/login/callback",
  passport.authenticate("discord", { failureRedirect: "/login" }),
  (req, res) => {
    res.redirect("/");
  },
);

app.get("/logout", (req, res) => {
  req.logout(() => {
    res.redirect("/login");
  });
});

app.use(express.json());

app.get("/api/guild", ensureAuthenticated, async (req, res) => {
  try {
    const guild = await client.guilds.fetch(config.guildID);
    const guildPreview = await guild.fetch();
    const totalMembers = guild.memberCount;
    const onlineMembers = guildPreview.approximatePresenceCount;
    const stats = db.get("stats");
    const logs = db.get("logs");

    const channels = guild.channels.cache.map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
    }));

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
      sendHelpfulTips: !guild.systemChannelFlags.has(
        GuildSystemChannelFlags.SuppressGuildReminderNotifications,
      ),
      totalMembers,
      onlineMembers,
      channels,
    };

    res.json({ guildData, stats: stats, logs: logs });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Update guild settings
app.post("/api/guild", ensureAuthenticated, async (req, res) => {
  try {
    const guild = await client.guilds.fetch(config.guildID);
    if (!guild) {
      return res.status(404).send("Guild not found");
    }

    const updates = [];

    if (req.body.name) updates.push(guild.setName(req.body.name));
    if (req.body.defaultMessageNotifications !== undefined)
      updates.push(
        guild.setDefaultMessageNotifications(
          parseInt(req.body.defaultMessageNotifications),
        ),
      );
    if (req.body.explicitContentFilter !== undefined)
      updates.push(
        guild.setExplicitContentFilter(
          parseInt(req.body.explicitContentFilter),
        ),
      );
    if (req.body.systemChannelId)
      updates.push(guild.setSystemChannel(req.body.systemChannelId));
    if (req.body.preferredLocale)
      updates.push(guild.setPreferredLocale(req.body.preferredLocale));

    // Calculate system channel flags
    const systemChannelFlags =
      (req.body.sendWelcomeMessage
        ? 0
        : GuildSystemChannelFlags.SuppressJoinNotifications) |
      (req.body.promptWelcomeSticker
        ? 0
        : GuildSystemChannelFlags.SuppressJoinNotificationReplies) |
      (req.body.sendBoostMessage
        ? 0
        : GuildSystemChannelFlags.SuppressPremiumSubscriptions) |
      (req.body.sendPurchaseMessage
        ? 0
        : GuildSystemChannelFlags.SuppressRoleSubscriptionPurchaseNotifications) |
      (req.body.promptSubscriptionSticker
        ? 0
        : GuildSystemChannelFlags.SuppressRoleSubscriptionPurchaseNotificationReplies) |
      (req.body.sendHelpfulTips
        ? 0
        : GuildSystemChannelFlags.SuppressGuildReminderNotifications);

    updates.push(guild.setSystemChannelFlags(systemChannelFlags));

    await Promise.all(updates);

    res.send("Guild settings updated successfully");
  } catch (error) {
    console.error(error);
    res.status(500).send(error.message);
  }
});

// Fetch all embeds
app.get("/api/embeds", ensureAuthenticated, async (req, res) => {
  try {
    const dbFetch = db.get("embeds") || {};
    const embedKeys = Object.keys(dbFetch); // List all keys
    const embeds = embedKeys.map((key) => ({
      key,
      data: db[key],
    }));
    res.json(embeds);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch embeds" });
  }
});

// Create or update an embed and send/update the message
app.post("/api/embeds", ensureAuthenticated, async (req, res) => {
  const { embedData, channelID, messageID } = req.body;
  if (!embedData || !channelID) {
    return res
      .status(400)
      .json({ error: "Embed data and channel ID are required" });
  }
  try {
    const embed = {
      title: embedData.title,
      description: embedData.description,
      fields: embedData.fields || [],
      // Add other embed fields as needed
    };
    const channel = await client.channels.fetch(channelID);
    if (channel.type !== ChannelType.GuildText) {
      return res
        .status(400)
        .json({ error: "Channel ID is not a text channel" });
    }
    let message;
    if (messageID) {
      // Update existing message
      message = await channel.messages.fetch(messageID);
      await message.edit({ embeds: [embed] });
    } else {
      // Send new message
      message = await channel.send({ embeds: [embed] });
    }
    // Store the embed data with the message ID
    const storedEmbedData = { ...embedData, channelID, messageID: message.id };
    const dbFetch = db.get("embeds") || {};
    dbFetch[message.id] = storedEmbedData;
    db.set("embeds", dbFetch);
    res
      .status(201)
      .json({ message: "Embed saved and message sent/updated successfully" });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "Failed to save embed or send/update message" });
  }
});

// Example route to get settings
app.get("/api/settings", ensureAuthenticated, (req, res) => {
  try {
    const settings = db.get("settings") || {}; // Get current settings from the database
    res.json(settings);
  } catch (err) {
    console.error("Error retrieving settings:", err);
    res.status(500).json({ error: "Failed to retrieve settings" });
  }
});

app.post("/api/settings", ensureAuthenticated, async (req, res) => {
  try {
    const updatedSettings = req.body; // Entire settings object is expected
    const currentSettings = db.get("settings") || {};

    // Check if logSettings have changed
    if (
      JSON.stringify(currentSettings.logSettings) !==
      JSON.stringify(updatedSettings.logSettings)
    ) {
      logger.destroy();
      logger = new Logger(client, updatedSettings.logSettings);
    }

    // Update settings in the database
    db.set("settings", updatedSettings);
    res.json({ message: `Settings updated successfully` });
  } catch (err) {
    console.error("Error setting settings:", err);
    res.status(500).json({ error: "Failed to set settings" });
  }
});

// Define your routes
app.get("/", ensureAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, "app.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "auth.html"));
});

app.listen(port, () => {
  console.log(`Dashboard can be accessed at ${config.publicURL}`);
});
