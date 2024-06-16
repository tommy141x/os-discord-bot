const fs = require("fs").promises;
const path = require("path");

class StatsHandler {
  constructor(client) {
    this.client = client;
    this.statsFile = path.join(__dirname, "stats.json");
    this.stats = {
      intervals: [],
    };
    this.joinCount = 0;
    this.leaveCount = 0;
    this.messageCount = 0;

    this.loadStats();
  }

  async loadStats() {
    try {
      const data = await fs.readFile(this.statsFile, "utf8");
      if (data.trim() === "") {
        console.log("Stats file is empty, starting fresh.");
        this.stats = { intervals: [] };
      } else {
        this.stats = JSON.parse(data);
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        console.log("No existing stats file, starting fresh.");
      } else if (error instanceof SyntaxError) {
        console.log("Invalid JSON in stats file, starting fresh.");
        this.stats = { intervals: [] };
      } else {
        console.error("Error loading stats:", error);
      }
    }
  }

  async saveStats() {
    try {
      await fs.writeFile(this.statsFile, JSON.stringify(this.stats, null, 2));
      console.log("Stats saved.");
    } catch (error) {
      console.error("Error saving stats:", error);
    }
  }

  incrementJoins() {
    this.joinCount++;
  }

  incrementLeaves() {
    this.leaveCount++;
  }

  incrementMessages() {
    this.messageCount++;
  }

  async collectStats() {
    console.log("Collecting stats at ", new Date().toISOString(), "...");
    const guilds = this.client.guilds.cache;
    let totalMembers = 0;
    let onlineMembers = 0;

    for (const guild of guilds.values()) {
      const guildPreview = await guild.fetch();
      totalMembers += guild.memberCount;
      onlineMembers += guildPreview.approximatePresenceCount;
    }

    const currentStats = {
      timestamp: new Date().toISOString(),
      totalMembers,
      onlineMembers,
      joins: this.joinCount,
      leaves: this.leaveCount,
      messages: this.messageCount,
    };

    this.stats.intervals.push(currentStats);
    await this.saveStats();

    // Reset counters
    this.joinCount = 0;
    this.leaveCount = 0;
    this.messageCount = 0;
  }

  startTracking() {
    this.collectStats(); // Collect stats immediately
    setInterval(() => this.collectStats(), 30 * 60 * 1000); // 30 minutes
  }
}

module.exports = StatsHandler;
