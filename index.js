// index.js

const express = require("express");
const { Client, Intents } = require("discord.js");
const config = require("./config.json");

const app = express();
const port = process.env.PORT || config.port;

// Web server
app.get("/", (req, res) => {
  res.send(`
    <h1>Dashboard</h1>
    <button onclick="location.href='/page1'">Go to Page 1</button>
    <button onclick="location.href='/page2'">Go to Page 2</button>
    <br>
    <button onclick="changeBotStatus('Online')">Set Bot Status Online</button>
    <button onclick="changeBotStatus('Idle')">Set Bot Status Idle</button>
    <button onclick="changeBotStatus('DND')">Set Bot Status Do Not Disturb</button>
    <script>
      function changeBotStatus(status) {
        fetch('/status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ status })
        });
      }
    </script>
  `);
});

app.get("/page1", (req, res) => {
  res.send(`
    <h1>Page 1</h1>
    <button onclick="location.href='/'">Go back to Dashboard</button>
  `);
});

app.get("/page2", (req, res) => {
  res.send(`
    <h1>Page 2</h1>
    <button onclick="location.href='/'">Go back to Dashboard</button>
  `);
});

app.post("/status", express.json(), (req, res) => {
  const { status } = req.body;
  if (status === "Online" || status === "Idle" || status === "DND") {
    client.user.setStatus(status);
    res.send(`Bot status set to ${status}`);
  } else {
    res.status(400).send("Invalid status");
  }
});

app.listen(port, () => {
  console.log(`Web server is running on port ${port}`);
});

// Discord bot
const client = new Client({ intents: [Intents.FLAGS.GUILDS] });

client.once("ready", () => {
  console.log("Discord bot is ready!");
});

client.login(config.discord_token);
