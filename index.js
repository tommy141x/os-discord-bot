const express = require("express");
const session = require("express-session");
const favicon = require("express-favicon");
const FileStore = require("session-file-store")(session);
const passport = require("passport");
const { Strategy } = require("passport-discord");
const {
  Client,
  GatewayIntentBits,
  GuildSystemChannelFlags,
} = require("discord.js");
const config = require("./config.json");
const StatsHandler = require("./statsHandler");
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
  ],
});

const statsHandler = new StatsHandler(client);

app.use((req, res, next) => {
  req.client = client;
  req.statsHandler = statsHandler;
  next();
});

client.login(config.botToken);

client.once("ready", () => {
  console.log("Discord bot is started!");
  statsHandler.startTracking();
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

// Fetch detailed guild information and stats
app.get("/api/guild", ensureAuthenticated, async (req, res) => {
  try {
    const guild = await client.guilds.fetch(config.guildID);
    const guildPreview = await guild.fetch();
    const totalMembers = guild.memberCount;
    const onlineMembers = guildPreview.approximatePresenceCount;

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
    };

    res.json({ guildData, stats: req.statsHandler.stats });
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

const { get, set, list } = require("./db");

// Fetch all embeds
app.get("/api/embeds", ensureAuthenticated, async (req, res) => {
  try {
    const db = get("embeds") || {};
    const embedKeys = Object.keys(db); // List all keys
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
    if (!channel.isText()) {
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
    const db = get("embeds") || {};
    db[message.id] = storedEmbedData;
    set("embeds", db);

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
