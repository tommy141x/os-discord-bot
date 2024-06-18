const fs = require("fs").promises;
const path = require("path");
const config = require("./config.json");

class StatsHandler {
  constructor(client) {
    this.client = client;
    this.statsFile = path.join(__dirname, "stats.json");
    this.stats = {
      intervals: [],
      joins: 0,
      leaves: 0,
      messages: 0,
    };
    this.localJoins = 0;
    this.localLeaves = 0;
    this.localMessages = 0;
  }

  registerEventListeners() {
    this.client.on("guildMemberAdd", (member) => this.incrementJoins());
    this.client.on("guildMemberRemove", (member) => this.incrementLeaves());
    this.client.on("messageCreate", (message) => this.incrementMessages());
  }

  async loadStats() {
    try {
      const data = await fs.readFile(this.statsFile, "utf8");
      if (data.trim() === "") {
        console.log("Stats file is empty, starting fresh.");
      } else {
        const existingStats = JSON.parse(data);
        this.stats.intervals = [
          ...existingStats.intervals,
          ...this.stats.intervals,
        ];
        this.stats.joins = existingStats.joins;
        this.stats.leaves = existingStats.leaves;
        this.stats.messages = existingStats.messages;
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        console.log("No existing stats file, starting fresh.");
      } else if (error instanceof SyntaxError) {
        console.log("Invalid JSON in stats file, starting fresh.");
      } else {
        console.error("Error loading stats:", error);
      }
    }
  }

  async saveStats() {
    try {
      const existingData = await fs.readFile(this.statsFile, "utf8");
      const existingStats =
        existingData.trim() === "" ? {} : JSON.parse(existingData);

      const updatedStats = {
        intervals: [...existingStats.intervals, ...this.stats.intervals],
        joins: existingStats.joins + this.stats.joins,
        leaves: existingStats.leaves + this.stats.leaves,
        messages: existingStats.messages + this.stats.messages,
      };

      await fs.writeFile(this.statsFile, JSON.stringify(updatedStats, null, 2));
      console.log("Stats saved.");
    } catch (error) {
      console.error("Error saving stats:", error);
    }
  }

  incrementJoins() {
    this.localJoins++;
    this.stats.joins++;
  }

  incrementLeaves() {
    this.localLeaves++;
    this.stats.leaves++;
  }

  incrementMessages() {
    this.localMessages++;
    this.stats.messages++;
  }

  async collectStats() {
    console.log("Collecting stats at ", new Date().toISOString(), "...");
    const guild = await this.client.guilds.fetch(config.guildID);
    const guildPreview = await guild.fetch();
    let totalMembers = guild.memberCount;
    let onlineMembers = guildPreview.approximatePresenceCount;

    const currentStats = {
      timestamp: new Date().toISOString(),
      totalMembers,
      onlineMembers,
      joins: this.localJoins,
      leaves: this.localLeaves,
      messages: this.localMessages,
    };
    this.stats.intervals.push(currentStats);
    this.localJoins = 0;
    this.localLeaves = 0;
    this.localMessages = 0;
    await this.saveStats();
  }

  startTracking() {
    this.loadStats(); // Load existing stats or start fresh
    this.collectStats(); // Collect stats immediately
    this.registerEventListeners();
    const statsInterval = config.statsInterval || 30; // Default to 30 minutes if not provided
    setInterval(() => this.collectStats(), statsInterval * 60 * 1000);
  }
}

module.exports = StatsHandler;
