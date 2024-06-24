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
  AuditLogEvent,
  GuildSystemChannelFlags,
  EmbedBuilder,
  PermissionsBitField,
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
const SocialAlertSystem = require("./utils/socialAlerts");
const AIChatBot = require("./utils/aiChatBot");

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

const publicDir = path.join(__dirname, "public");
const mediaDir = path.join(publicDir, "media");
const sessionDir = path.join(__dirname, "sessions");
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir);
}
if (!fs.existsSync(mediaDir)) {
  fs.mkdirSync(mediaDir);
}
if (!fs.existsSync(sessionDir)) {
  fs.mkdirSync(sessionDir);
}

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

// Initialize Discord client
const client = new Client({
  intents: Object.values(GatewayIntentBits),
});

let logger;
let chatBot;
let commandHandler;
let socialAlertSystem;

// Middleware to attach client to req object
app.use((req, res, next) => {
  req.client = client;
  next();
});

// Discord bot login
client.login(config.botToken);

let botPresenceInterval;
// Bot ready event handler
client.once("ready", async () => {
  console.log("Discord bot is started!");

  // Initialize settings
  const settings = initializeSettings();

  // Initialize logger and command handler
  logger = new Logger(client, settings.logSettings);
  commandHandler = new CommandHandler(client);
  socialAlertSystem = new SocialAlertSystem(client);
  await socialAlertSystem.setup();

  if (config.aiType && (config.openAIToken || config.claudeApiKey)) {
    chatBot = new AIChatBot(client);
    await chatBot.initialize();
  }

  setBotPresence();
  botPresenceInterval = setInterval(
    setBotPresence,
    settings.botPresenceSettings.changeInterval * 60 * 1000,
  );

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
    autoModSettings: {
      ignoredAutoModRoles: [],
      ignoredAutoModChannels: [],
      mediaOnlyChannels: [],
      ytLinkOnlyChannels: [],
      ttvLinkOnlyChannels: [],
      discordInvites: false,
      externalLinks: false,
      massMention: false,
    },
    welcomeGoodbyeSettings: {
      join: {
        enabled: false,
        channelId: "",
        message: "",
        color: "",
      },
      leave: {
        enabled: false,
        channelId: "",
        message: "",
        color: "",
      },
    },
    autoResponderSettings: {},
    aiSettings: {
      enabled: false,
      ignoredChannels: [],
      triggerWords: [],
      personality: "",
      dataFetchs: [], // Contains URLs to fetch text from to append to the personality
    },
    autoRoleSettings: {
      roles: [], //Roles to give to new members
    },
    temporaryChannelSettings: {},
    socialAlertSettings: {},
    botPresenceSettings: {
      status: "online",
      activities: [
        {
          type: "PLAYING",
          name: "with the API",
        },
        {
          type: "WATCHING",
          name: "over the server",
        },
      ],
      changeInterval: 1, //in minutes
    },
  };
}

// Set up event listeners
function setupEventListeners() {
  client.on("interactionCreate", async (interaction) => {
    await commandHandler.handleCommand(interaction);
  });

  client.on("messageCreate", autoMod);
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    let responded = false;

    const aiSettings = db.get("settings").aiSettings;
    if (aiSettings.ignoredChannels.includes(message.channelId)) return;

    // Check if the message mentions the bot
    if (message.mentions.has(client.user)) {
      message.content = message.content.replace(client.user.toString(), "@You");
      const response = await chatBot.generateResponse(message);
      await message.reply(formatPlaceholders(response, message.member));
      responded = true; // Mark as responded by the chatbot
    }

    // Check if the message is a reply to a bot message
    if (!responded && message.reference && message.reference.messageId) {
      try {
        const repliedMessage = await message.channel.messages.fetch(
          message.reference.messageId,
        );

        if (repliedMessage && repliedMessage.author.bot) {
          const repliedContent = repliedMessage.content;

          // Trigger the chatbot with both the replied message content and the new message content
          message.content = `I am responding to your previous message "${repliedContent}", ${message.content}`;

          const response = await chatBot.generateResponse(message);

          // Reply with the chatbot's response
          await message.reply(formatPlaceholders(response, message.member));

          responded = true; // Mark as responded by the chatbot
        }
      } catch (error) {
        console.error("Error fetching or processing replied message:", error);
      }
    }

    // If the chatbot hasn't responded yet, check if it should respond to the current message
    if (!responded && chatBot && chatBot.shouldRespond(message)) {
      const response = await chatBot.generateResponse(message);
      await message.reply(formatPlaceholders(response, message.member));
      responded = true; // Mark as responded by the chatbot
    }

    // If the chatbot still hasn't responded, trigger the autoResponder
    if (!responded) {
      autoResponder(message);
    }
  });

  client.on("guildMemberAdd", async (member) => {
    await applyAutoRoles(member);
  });
  client.on("guildMemberAdd", (member) => welcomeGoodbye(member, true));
  client.on("guildMemberRemove", (member) => welcomeGoodbye(member, false));
  setupTemporaryChannels(client);

  client.on("disconnect", () => {
    console.log("Disconnected. Attempting to reconnect...");
    client.login(config.botToken);
  });
}

function setBotPresence() {
  const botPresenceSettings = db.get("settings").botPresenceSettings;
  if (botPresenceSettings.activities.length === 0) {
    client.user.setPresence({
      status: botPresenceSettings.status,
      activities: [],
    });
  } else {
    const activityType = {
      playing: 0,
      streaming: 1,
      listening: 2,
      watching: 3,
      custom: 4,
      competing: 5,
    };
    const activity =
      botPresenceSettings.activities[
        Math.floor(Math.random() * botPresenceSettings.activities.length)
      ];

    const typeToUse = activityType[activity.type.toLowerCase()] || 0;
    const presenceActivity = [
      {
        type: typeToUse,
        name: activity.name,
      },
    ];

    client.user.setPresence({
      status: botPresenceSettings.status,
      activities: presenceActivity,
    });
  }
}

async function applyAutoRoles(member) {
  try {
    const guild = client.guilds.cache.get(config.guildID);
    if (!guild) {
      console.error("Guild not found");
      return;
    }

    const autoRoles = db.get("settings").autoRoleSettings.roles;

    if (autoRoles.length === 0) {
      console.log("No auto roles configured");
      return;
    }

    const rolesToAdd = autoRoles
      .map((roleId) => guild.roles.cache.get(roleId))
      .filter((role) => role);

    if (rolesToAdd.length === 0) {
      console.log("No valid roles found to add");
      return;
    }

    await member.roles.add(rolesToAdd);
    console.log(`Auto roles applied to ${member.user.tag}`);
  } catch (error) {
    console.error("Error applying auto roles:", error);
  }
}

function setupTemporaryChannels(client) {
  client.on("voiceStateUpdate", async (oldState, newState) => {
    // Check if user joined a voice channel
    if (newState.channelId && !oldState.channelId) {
      await handleVoiceJoin(newState);
    }

    // Check if user left a voice channel
    if (oldState.channelId && !newState.channelId) {
      await handleVoiceLeave(oldState);
    }

    // Check if user switched channels
    if (
      oldState.channelId &&
      newState.channelId &&
      oldState.channelId !== newState.channelId
    ) {
      await handleVoiceLeave(oldState);
      await handleVoiceJoin(newState);
    }
  });
}

async function handleVoiceJoin(state) {
  const settings = db.get("settings").temporaryChannelSettings;
  const triggerChannel = Object.values(settings).find(
    (item) => item.triggerChannel === state.channelId,
  );
  if (!triggerChannel) return;

  const guild = state.guild;
  const member = state.member;

  const channelName = formatPlaceholders(triggerChannel.channelName, member);

  try {
    const newChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildVoice,
      parent: triggerChannel.category || null,
      userLimit: triggerChannel.maxUsers || 0,
      permissionOverwrites: [
        {
          id: member.id,
          allow: [
            PermissionsBitField.Flags.ManageChannels,
            PermissionsBitField.Flags.MoveMembers,
          ],
        },
      ],
    });

    await member.voice.setChannel(newChannel);
  } catch (error) {
    console.error("Failed to create temporary channel:", error);
  }
}

async function handleVoiceLeave(state) {
  const channel = state.channel;
  if (!channel) return;

  // Check if the channel is empty and it's not a trigger channel
  if (
    channel.members.size === 0 &&
    !Object.values(db.get("settings").temporaryChannelSettings).some(
      (item) => item.triggerChannel === channel.id,
    )
  ) {
    try {
      await channel.delete();
    } catch (error) {
      console.error("Failed to delete temporary channel:", error);
    }
  }
}

function formatPlaceholders(string, member) {
  return string
    .replace("{mention}", member.user.toString())
    .replace("{name}", member.displayName)
    .replace("{username}", member.user.username)
    .replace("{tag}", member.user.tag)
    .replace("{id}", member.id)
    .replace("{servername}", member.guild.name);
}

// Placeholders available: {user}, {username}, {tag}, {id}, {servername}

function welcomeGoodbye(member, isJoining) {
  const settings = db.get("settings").welcomeGoodbyeSettings;
  const eventType = isJoining ? "join" : "leave";
  const eventSettings = settings[eventType];

  if (
    !eventSettings.enabled ||
    !eventSettings.channelId ||
    !eventSettings.message
  ) {
    return; // Exit if the event is not enabled or if required settings are missing
  }

  const channel = member.guild.channels.cache.get(eventSettings.channelId);
  if (!channel) return; // Exit if the channel is not found

  const embed = new EmbedBuilder()
    .setColor(
      rgbStringToInt(eventSettings.color) || isJoining ? 0x00ff00 : 0xff0000,
    )
    .setDescription(formatPlaceholders(eventSettings.message, member))
    .setTimestamp();

  if (isJoining) {
    embed.setTitle("Welcome to the server!");
    embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
  } else {
    embed.setTitle("Goodbye from the server!");
  }

  channel.send({ embeds: [embed] });
}

async function autoResponder(message) {
  const settings = db.get("settings").autoResponderSettings;

  if (message.author.bot) return;

  // Calculate random initial delay between 0.5 to 2 seconds (500 to 2000 milliseconds)
  const initialDelay = Math.floor(Math.random() * (1500 - 500 + 1)) + 500;

  // Wait for initial delay
  await new Promise((resolve) => setTimeout(resolve, initialDelay));

  for (const item in settings) {
    const { triggerWords, responses, ignoredAIChannels, sendAsReply } =
      settings[item];

    // Check if triggerWords or responses are empty or undefined
    if (
      !triggerWords ||
      triggerWords.length === 0 ||
      !responses ||
      responses.length === 0
    )
      continue;

    // Check if the message channel is in ignoredAIChannels, handle undefined or empty case
    if (ignoredAIChannels && ignoredAIChannels.includes(message.channel.id))
      continue;

    for (const trigger of triggerWords) {
      if (message.content.includes(trigger)) {
        // Simulate typing indicator
        await message.channel.sendTyping();

        // Calculate random typing delay between 0.5 to 2 seconds (500 to 2000 milliseconds)
        const typingDelay = Math.floor(Math.random() * (1500 - 500 + 1)) + 500;

        // Wait for typing delay
        await new Promise((resolve) => setTimeout(resolve, typingDelay));

        // Send the response
        const response =
          responses[Math.floor(Math.random() * responses.length)];

        if (sendAsReply) {
          message.reply(formatPlaceholders(response, message.member));
        } else {
          message.channel.send(formatPlaceholders(response, message.member));
        }
        return;
      }
    }
  }
}

function autoMod(message) {
  const settings = db.get("settings").autoModSettings;

  // Ignore messages from bots
  if (message.author.bot) return;

  if (message.member.permissions.has("Administrator")) return;

  // Check if the message author's role is in the ignored roles list
  if (
    message.member &&
    message.member.roles.cache.some((role) =>
      settings.ignoredRoles.includes(role.id),
    )
  )
    return;

  // Check if the channel is in the ignored channels list
  if (settings.ignoredChannels.includes(message.channel.id)) return;

  // Check media-only channels
  if (
    settings.mediaOnlyChannels.includes(message.channel.id) &&
    message.attachments.size === 0
  ) {
    const channel = message.guild.channels.cache.get(message.channel.id);
    message.delete().catch(console.error);
    channel.send("Only media is allowed in this channel.").then((msg) => {
      setTimeout(() => {
        msg.delete().catch(console.error);
      }, 3000);
    });
    return;
  }

  // Check YouTube and Twitch link-only channels
  if (
    settings.ytLinkOnlyChannels.includes(message.channel.id) ||
    settings.ttvLinkOnlyChannels.includes(message.channel.id)
  ) {
    const isYoutubeLink =
      message.content.includes("youtube.com") ||
      message.content.includes("youtu.be");
    const isTwitchLink = message.content.includes("twitch.tv");

    const isYoutubeChannel = settings.ytLinkOnlyChannels.includes(
      message.channel.id,
    );
    const isTwitchChannel = settings.ttvLinkOnlyChannels.includes(
      message.channel.id,
    );

    if (
      (isYoutubeChannel &&
        isTwitchChannel &&
        !isYoutubeLink &&
        !isTwitchLink) ||
      (isYoutubeChannel && !isTwitchChannel && !isYoutubeLink) ||
      (isTwitchChannel && !isYoutubeChannel && !isTwitchLink)
    ) {
      const channel = message.guild.channels.cache.get(message.channel.id);
      message.delete().catch(console.error);

      let errorMessage = "This channel only allows ";
      if (isYoutubeChannel && isTwitchChannel) {
        errorMessage += "YouTube and Twitch links.";
      } else if (isYoutubeChannel) {
        errorMessage += "YouTube links.";
      } else {
        errorMessage += "Twitch links.";
      }

      channel.send(errorMessage).then((msg) => {
        setTimeout(() => {
          msg.delete().catch(console.error);
        }, 3000);
      });
      return;
    }
  }

  // Check for Discord invites
  if (
    settings.discordInvites &&
    message.content.match(
      /(?:https?:\/\/)?(?:www\.)?(?:discord\.(?:gg|io|me|li|com)|discordapp\.com)\/(?:invite\/)?[a-zA-Z0-9]+/i,
    )
  ) {
    const channel = message.guild.channels.cache.get(message.channel.id);
    message.delete().catch(console.error);
    channel.send("External discord invites are not allowed.").then((msg) => {
      setTimeout(() => {
        msg.delete().catch(console.error);
      }, 3000);
    });
    return;
  }

  // Check for external links
  const urlPattern =
    /(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi;
  const matchedUrls = message.content.match(urlPattern);
  if (settings.externalLinks && matchedUrls) {
    const channel = message.guild.channels.cache.get(message.channel.id);
    message.delete().catch(console.error);
    channel.send("External links are not allowed.").then((msg) => {
      setTimeout(() => {
        msg.delete().catch(console.error);
      }, 3000);
    });
    return;
  }

  // Check for mass mentions
  if (settings.massMention && message.mentions.users.size > 5) {
    const channel = message.guild.channels.cache.get(message.channel.id);
    message.delete().catch(console.error);
    channel.send("Mass mentions are not allowed.").then((msg) => {
      setTimeout(() => {
        msg.delete().catch(console.error);
      }, 3000);
    });
    return;
  }
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
      app.use(favicon(__dirname + "/public/favicon.ico"));
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

  // Get audit log
  app.get("/api/audit-log", ensureAuthenticated, async (req, res) => {
    try {
      const guild = await client.guilds.fetch(config.guildID);
      const auditLogs = await guild.fetchAuditLogs({ limit: 100 });

      const actionMap = {
        MemberDisconnect: "disconnected",
        MemberUpdate: "updated profile of",
        ChannelOverwriteUpdate: "modified permissions in",
        MemberRoleUpdate: "updated roles for",
        InviteCreate: "created an invite",
        ChannelDelete: "deleted channel",
        RoleUpdate: "modified role",
        MemberMove: "moved",
        ChannelCreate: "created channel",
        undefined: "performed unknown action on",
      };

      const auditLogEntries = auditLogs.entries.map((entry) => ({
        action: actionMap[AuditLogEvent[entry.action]],
        targetID: entry.target?.id ?? undefined,
        targetType: entry.targetType ?? undefined,
        executorID: entry.executor?.id ?? undefined,
        executorTag: entry.executor?.tag ?? undefined,
        createdAt: entry.createdAt,
        changes: entry.changes,
      }));
      res.json(auditLogEntries);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to retrieve audit log" });
    }
  });

  // Fetch logged in user
  app.get("/api/user", ensureAuthenticated, async (req, res) => {
    try {
      let member, user, presence, activities, customStatus;

      // Try to fetch from guild first
      try {
        const guild = await client.guilds.fetch(config.guildID);
        member = await guild.members.fetch(req.user.id);
        user = member.user;
        presence = member.presence;
      } catch (error) {
        console.log("User not found in guild, falling back to direct fetch");
      }

      // If not found in guild, fall back to direct user fetch
      if (!user) {
        user = await client.users.fetch(req.user.id, { force: true });
        presence = user.presence;
      }

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      activities = presence?.activities || [];
      customStatus = activities.find(
        (activity) => activity.type === "CUSTOM_STATUS",
      );

      res.json({
        name: member?.displayName || user.username,
        avatar: user.displayAvatarURL({ format: "png", size: 128 }),
        status: presence?.status || "offline",
        customStatus: customStatus?.state || null,
      });
    } catch (err) {
      console.error("Error getting user", err);
      res.status(500).json({ error: "Failed getting user" });
    }
  });

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

      if (
        JSON.stringify(currentSettings.autoModSettings) !==
        JSON.stringify(updatedSettings.autoModSettings)
      ) {
        logger.logControlEvent("updated automod settings", req.user);
      }

      if (
        JSON.stringify(currentSettings.botPresenceSettings) !==
        JSON.stringify(updatedSettings.botPresenceSettings)
      ) {
        clearInterval(botPresenceInterval);
        botPresenceInterval = setInterval(
          setBotPresence,
          updatedSettings.botPresenceSettings.changeInterval * 60000,
        );
      }

      if (
        JSON.stringify(currentSettings.aiSettings) !==
        JSON.stringify(updatedSettings.aiSettings)
      ) {
        chatBot.reset();
      }

      res.json({ message: `Settings updated successfully` });
    } catch (err) {
      console.error("Error setting settings:", err);
      res.status(500).json({ error: "Failed to set settings" });
    }
  });
}
