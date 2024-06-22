// Required modules
const express = require("express");
const session = require("express-session");
const fileUpload = require("express-fileupload");
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
const path = require("path");
const fs = require("fs");
const https = require("https");

// Custom modules
const config = require("./config.json");
const db = require("./utils/db");
const Logger = require("./utils/logger");
const GarbageCollector = require("./utils/garbageCollector");
const CommandHandler = require("./utils/commands");

// Initialize Express app
const app = express();
const port = process.env.PORT || config.port;

// Middleware setup
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
      logFn: () => {},
    }),
  }),
);
app.use(passport.initialize());
app.use(passport.session());
app.use(
  fileUpload({
    createParentPath: true,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  }),
);
app.use(express.json());
app.use(favicon(__dirname + "/public/favicon.ico"));

// Initialize Discord client
const client = new Client({
  intents: Object.values(GatewayIntentBits),
});

let logger;
let commandHandler;

// Middleware to attach client to req object
app.use((req, res, next) => {
  req.client = client;
  next();
});

// Discord bot login
client.login(config.botToken);

// Bot ready event handler
client.once("ready", async () => {
  console.log("Discord bot is started!");

  // Initialize settings
  const settings = initializeSettings();

  // Initialize logger and command handler
  logger = new Logger(client, settings.logSettings);
  commandHandler = new CommandHandler(client);

  // Set up event listeners
  setupEventListeners();

  // Set guild favicon
  await setGuildFavicon();
});

// Initialize settings
function initializeSettings() {
  let settings = db.get("settings") || {};
  const defaultSettings = getDefaultSettings();
  settings = { ...defaultSettings, ...settings };
  db.set("settings", settings);
  return settings;
}

// Get default settings
function getDefaultSettings() {
  return {
    logSettings: {
      logMemberBans: { enabled: true, channelId: "" },
      logMemberUnbans: { enabled: false, channelId: "" },
      logMemberLeaves: { enabled: true, channelId: "" },
      logMemberJoins: { enabled: true, channelId: "" },
      logMemberUpdates: { enabled: false, channelId: "" },
      logChannelCreations: { enabled: false, channelId: "" },
      logChannelDeletions: { enabled: false, channelId: "" },
      logChannelUpdates: { enabled: false, channelId: "" },
      logThreadCreations: { enabled: false, channelId: "" },
      logThreadDeletions: { enabled: false, channelId: "" },
      logThreadUpdates: { enabled: false, channelId: "" },
      logRoleCreations: { enabled: false, channelId: "" },
      logRoleDeletions: { enabled: false, channelId: "" },
      logRoleUpdates: { enabled: false, channelId: "" },
      logMessageCreation: { enabled: true, channelId: "" },
      logMessageDeletions: { enabled: false, channelId: "" },
      logMessageEdits: { enabled: false, channelId: "" },
      logVoiceStateUpdates: { enabled: false, channelId: "" },
      logInviteCreations: { enabled: false, channelId: "" },
      logInviteDeletions: { enabled: false, channelId: "" },
      logServerUpdates: { enabled: false, channelId: "" },
      logPermissionUpdates: { enabled: false, channelId: "" },
    },
    utilitySettings: {
      pingCommand: true,
      userCommand: true,
      serverCommand: true,
      pointsCommand: true,
      leaderboardCommand: true,
      customCommands: [],
    },
    moderationSettings: {
      modRoles: [],
      setNickCommand: true,
      kickCommand: true,
      banCommand: true,
      unbanCommand: true,
      muteCommand: true,
      unmuteCommand: true,
      timeoutCommand: true,
      untimeoutCommand: true,
      lockCommand: true,
      unlockCommand: true,
      slowmodeCommand: true,
      clearCommand: true,
    },
  };
}

// Set up event listeners
function setupEventListeners() {
  client.on("interactionCreate", async (interaction) => {
    await commandHandler.handleCommand(interaction);
  });

  client.on("disconnect", () => {
    console.log("Disconnected. Attempting to reconnect...");
    client.login(config.botToken);
  });
}

// Set guild favicon
async function setGuildFavicon() {
  const guild = client.guilds.cache.get(config.guildID);
  if (guild) {
    const guildIconURL = guild.iconURL();
    if (guildIconURL) {
      const guildFaviconPath = "./public/favicon.ico";
      const file = fs.createWriteStream(guildFaviconPath);
      https.get(guildIconURL, (response) => {
        response.pipe(file);
      });
    }
  }
}

// Passport configuration
configurePassport();

// Authentication middleware
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/login");
}

// Routes
setupRoutes();

// Start server
app.listen(port, () => {
  console.log(`Dashboard can be accessed at ${config.publicURL}`);
});

// Helper functions (move these to a separate file if they grow too large)
function rgbStringToInt(rgbString) {
  const cleanedString = rgbString.replace("rgb(", "").replace(")", "");
  const [r, g, b] = cleanedString.split(",");
  return (parseInt(r) << 16) | (parseInt(g) << 8) | parseInt(b);
}

// Additional functions (implement these based on your existing code)
function configurePassport() {
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
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Fetch guild member to check for admin role
          const guild = await client.guilds.fetch(config.guildID);
          const member = await guild.members.fetch(profile.id);

          if (member && member.permissions.has("ADMINISTRATOR")) {
            // User is an admin
            return done(null, profile);
          } else {
            // User is not an admin
            return done(null, false, {
              message: "You are not an admin in the specified guild.",
            });
          }
        } catch (error) {
          return done(error);
        }
      },
    ),
  );
}

function setupRoutes() {
  /*
  AUTHENTICATION ROUTES
  */

  app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "auth.html"));
  });
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

  /*

  MAIN ROUTE

  */

  app.get("/", ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, "app.html"));
  });

  /*

  API ROUTES

  */

  //Fetch Guild Info
  app.get("/api/guild", ensureAuthenticated, async (req, res) => {
    try {
      const guild = await client.guilds.fetch(config.guildID);
      const guildPreview = await guild.fetch();
      const totalMembers = guild.memberCount;
      const onlineMembers = guildPreview.approximatePresenceCount;
      const stats = db.get("stats");
      const logs = db.get("logs");
      const controlLogs = db.get("controlLogs");

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

      res.json({
        guildData,
        stats: stats,
        logs: logs,
        controlLogs: controlLogs,
      });
    } catch (error) {
      res.status(500).send(error.message);
    }
  });

  // Update Guild Info
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

      logger.logControlEvent("modified the Guild Settings", req.user);
      res.send("Guild settings updated successfully");
    } catch (error) {
      console.error(error);
      res.status(500).send(error.message);
    }
  });

  // Fetch all embeds
  app.get("/api/embeds", ensureAuthenticated, async (req, res) => {
    try {
      const embeds = db.get("embeds") || {};
      res.json(embeds);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch embeds" });
    }
  });

  // Create or update embed
  app.post("/api/embeds", ensureAuthenticated, async (req, res) => {
    const { embedData, channelID, messageID } = req.body;
    if (!embedData || !channelID) {
      return res
        .status(400)
        .json({ error: "Embed data and channel ID are required" });
    }
    try {
      const authorIcon =
        embedData.authorIcon === "undefined" || embedData.authorIcon === null
          ? undefined
          : embedData.authorIcon;
      const thumbnail =
        embedData.thumbnail === "undefined" || embedData.thumbnail === null
          ? undefined
          : embedData.thumbnail;
      const image =
        embedData.image === "undefined" || embedData.image === null
          ? undefined
          : embedData.image;
      const embed = {
        color: rgbStringToInt(embedData.color),
        title: embedData.title || undefined,
        timestamp: embedData.timestamp ? new Date() : undefined,
        description: embedData.description,
        thumbnail: {
          url: thumbnail || undefined,
        },
        image: {
          url: image || undefined,
        },
        fields: embedData.fields || [],
        footer: {
          text: embedData.footer || undefined,
        },
        author: {
          name: embedData.author || undefined,
          icon_url: authorIcon || undefined,
        },
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
      const storedEmbedData = {
        ...embedData,
        channelID,
        messageID: message.id,
      };
      const dbFetch = db.get("embeds") || {};
      dbFetch[message.id] = storedEmbedData;
      db.set("embeds", dbFetch);
      logger.logControlEvent("sent/updated an embed", req.user);
      res.status(201).json({
        message: "Embed saved and message sent/updated successfully",
      });
    } catch (error) {
      console.error(error);
      res
        .status(500)
        .json({ error: "Failed to save embed or send/update message" });
    }
  });

  // Delete embed
  app.delete(
    "/api/embeds/:messageID",
    ensureAuthenticated,
    async (req, res) => {
      const { messageID } = req.params;
      try {
        const dbFetch = db.get("embeds") || {};
        const embedData = dbFetch[messageID];
        if (!embedData) {
          return res.status(404).json({ error: "Embed not found" });
        }
        const channel = await client.channels.fetch(embedData.channelID);
        if (channel.type !== ChannelType.GuildText) {
          return res
            .status(400)
            .json({ error: "Channel ID is not a text channel" });
        }
        const message = await channel.messages.fetch(messageID);
        await message.delete();
        // Delete associated files
        const filesToDelete = ["authorIcon", "thumbnail", "image"];
        for (const fileType of filesToDelete) {
          if (embedData[fileType]) {
            const fileName = embedData[fileType].split("/").pop();
            fs.unlink(
              path.join(__dirname, "public", "media", fileName),
              (err) => {
                if (err) console.error(`Error deleting ${fileType} file:`, err);
              },
            );
          }
        }
        delete dbFetch[messageID];
        db.set("embeds", dbFetch);
        logger.logControlEvent("deleted an embed", req.user);
        res.json({ message: "Embed and message deleted successfully" });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to delete embed or message" });
      }
    },
  );

  // Upload media
  app.post("/api/media", ensureAuthenticated, (req, res) => {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.files.filepond;
    if (!file) {
      return res.status(400).json({ error: "File not found in request" });
    }

    const fileName = file.name;
    const filePath = path.join(__dirname, "public", "media", fileName);

    file.mv(filePath, (err) => {
      if (err) {
        console.error("Error saving file:", err);
        return res.status(500).json({ error: "Failed to save file" });
      }
      const fileURL = `${config.publicURL}/media/${fileName}`;
      res.json({ message: "File uploaded successfully", url: fileURL });
    });
  });

  // Delete media
  app.delete("/api/media/:fileName", ensureAuthenticated, (req, res) => {
    const { fileName } = req.params;
    const filePath = path.join(__dirname, "public", "media", fileName);

    fs.access(filePath, fs.constants.F_OK, (err) => {
      if (err) {
        return res.status(404).json({ error: "File not found" });
      }

      fs.unlink(filePath, (err) => {
        if (err) {
          console.error("Error deleting file:", err);
          return res.status(500).json({ error: "Failed to delete file" });
        }
        res.json({ message: "File deleted successfully" });
      });
    });
  });

  // Serve media files
  app.use("/media", express.static(path.join(__dirname, "public", "media")));

  // Fetch Settings
  app.get("/api/settings", ensureAuthenticated, (req, res) => {
    try {
      const settings = db.get("settings") || {}; // Get current settings from the database
      res.json(settings);
    } catch (err) {
      console.error("Error retrieving settings:", err);
      res.status(500).json({ error: "Failed to retrieve settings" });
    }
  });

  // Update Settings
  app.post("/api/settings", ensureAuthenticated, async (req, res) => {
    try {
      const updatedSettings = req.body; // Entire settings object is expected
      const currentSettings = db.get("settings") || {};

      // Update settings in the database
      db.set("settings", updatedSettings);

      // Check if logSettings have changed
      if (
        JSON.stringify(currentSettings.logSettings) !==
        JSON.stringify(updatedSettings.logSettings)
      ) {
        logger.destroy();
        logger = new Logger(client, updatedSettings.logSettings);
        logger.logControlEvent("updated log settings", req.user);
      }

      if (
        JSON.stringify(currentSettings.utilitySettings) !==
          JSON.stringify(updatedSettings.utilitySettings) ||
        JSON.stringify(currentSettings.moderationSettings) !==
          JSON.stringify(updatedSettings.moderationSettings)
      ) {
        commandHandler = new CommandHandler(client);
        logger.logControlEvent("updated command settings", req.user);
      }

      res.json({ message: `Settings updated successfully` });
    } catch (err) {
      console.error("Error setting settings:", err);
      res.status(500).json({ error: "Failed to set settings" });
    }
  });
}
