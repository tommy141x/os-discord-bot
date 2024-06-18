const path = require("path");
const config = require("./config.json");
const db = require("./db.js");

class StatsHandler {
  constructor(client) {
    this.client = client;
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
      const existingStats = db.get("stats");
      if (existingStats) {
        this.stats.intervals = existingStats.intervals || [];
        this.stats.joins = existingStats.joins || 0;
        this.stats.leaves = existingStats.leaves || 0;
        this.stats.messages = existingStats.messages || 0;
      } else {
        console.log("No existing stats, starting fresh.");
      }
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  }

  async saveStats() {
    try {
      const existingStats = db.get("stats") || {
        intervals: [],
        joins: 0,
        leaves: 0,
        messages: 0,
      };

      const updatedStats = {
        intervals: [...existingStats.intervals, ...this.stats.intervals],
        joins: existingStats.joins + this.stats.joins,
        leaves: existingStats.leaves + this.stats.leaves,
        messages: existingStats.messages + this.stats.messages,
      };

      db.set("stats", updatedStats);
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

    // Filter intervals to only keep data for the past 24 hours
    const now = Date.now();
    this.stats.intervals = this.stats.intervals.filter(
      (interval) =>
        now - new Date(interval.timestamp).getTime() <= 24 * 60 * 60 * 1000,
    );

    // Calculate joins, leaves, and messages in the past 24 hours
    this.stats.joins = this.stats.intervals.reduce(
      (sum, interval) => sum + interval.joins,
      0,
    );
    this.stats.leaves = this.stats.intervals.reduce(
      (sum, interval) => sum + interval.leaves,
      0,
    );
    this.stats.messages = this.stats.intervals.reduce(
      (sum, interval) => sum + interval.messages,
      0,
    );

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
