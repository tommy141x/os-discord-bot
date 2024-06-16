const express = require("express");
const session = require("express-session");
const FileStore = require("session-file-store")(session);
const passport = require("passport");
const { Client, GatewayIntentBits } = require("discord.js");
const config = require("./config.json");
const StatsHandler = require("./statsHandler");
const path = require("path");

// Define the routes
const loginRoute = require("./routes/login");
const mainRoute = require("./routes/main");
const overviewRoute = require("./routes/overview");
/*
const serverSettingsRoute = require("./routes/serverSettings");
const embedMessagesRoute = require("./routes/embedMessages");

const utilityRoute = require("./routes/utility");
const moderationRoute = require("./routes/moderation");
const automodRoute = require("./routes/automod");
const welcomeGoodbyeRoute = require("./routes/welcomeGoodbye");
const autoResponderRoute = require("./routes/autoResponder");
const levelingSystemRoute = require("./routes/levelingSystem");
const autoRolesRoute = require("./routes/autoRoles");
const logsRoute = require("./routes/logs");
const colorsRoute = require("./routes/colors");
const selfAssignableRolesRoute = require("./routes/selfAssignableRoles");
const starboardRoute = require("./routes/starboard");
const temporaryChannelsRoute = require("./routes/temporaryChannels");
const antiRaidRoute = require("./routes/antiRaid");

const socialAlerts = require("./routes/socialAlerts");

const controlPanelLogsRoute = require("./routes/controlPanelLogs");
const modActionsRoute = require("./routes/modActions");
*/

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
      retries: 1, // Retry failed write operations only once
      fileExtension: ".json",
      ttl: 3600, // Set the time-to-live for sessions to 1 hour
      path: "./sessions", // Define a custom directory for session files
      reapInterval: 3600, // Cleanup expired sessions every hour
      logFn: function () {}, // Suppress logging
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
  console.log("Discord bot is ready!");

  client.on("guildMemberAdd", () => statsHandler.incrementJoins());
  client.on("guildMemberRemove", () => statsHandler.incrementLeaves());
  client.on("messageCreate", () => statsHandler.incrementMessages());

  statsHandler.startTracking();
});

app.set("view engine", "ejs");

// Authentication middleware
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/login");
}

// Apply middleware to all routes except the login route
app.use("/login", loginRoute);
app.use("/", ensureAuthenticated, mainRoute);
app.use("/overview", ensureAuthenticated, overviewRoute);
/*
app.use("/server-settings", ensureAuthenticated, serverSettingsRoute);
app.use("/embed-messages", ensureAuthenticated, embedMessagesRoute);

app.use("/utility", ensureAuthenticated, utilityRoute);
app.use("/moderation", ensureAuthenticated, moderationRoute);
app.use("/automod", ensureAuthenticated, automodRoute);
app.use("/welcome-goodbye", ensureAuthenticated, welcomeGoodbyeRoute);
app.use("/auto-responder", ensureAuthenticated, autoResponderRoute);
app.use("/leveling-system", ensureAuthenticated, levelingSystemRoute);
app.use("/auto-roles", ensureAuthenticated, autoRolesRoute);
app.use("/logs", ensureAuthenticated, logsRoute);
app.use("/colors", ensureAuthenticated, colorsRoute);
app.use("/self-assignable-roles", ensureAuthenticated, selfAssignableRolesRoute);
app.use("/starboard", ensureAuthenticated, starboardRoute);
app.use("/temporary-channels", ensureAuthenticated, temporaryChannelsRoute);
app.use("/anti-raid", ensureAuthenticated, antiRaidRoute);

app.use("/social-alerts", ensureAuthenticated, socialAlerts);

app.use("/control-panel-logs", ensureAuthenticated, controlPanelLogsRoute);
app.use("/mod-actions", ensureAuthenticated, modActionsRoute);
*/
app.get("/logout", (req, res) => {
  req.logout(() => {
    res.redirect("/login");
  });
});

app.listen(port, () => {
  console.log(`Web server is running on port ${port}`);
});
