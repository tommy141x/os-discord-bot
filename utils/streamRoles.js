const config = require("../config.json");
const db = require("./db.js");

class StreamRoleHandler {
  constructor(client) {
    this.client = client;
    this.db = db;
    this.config = config;
    this.interval = setInterval(() => this.checkStreams(), 60000);
  }

  async checkStreams() {
    try {
      const settings = this.db.get("settings").socialAlertSettings;
      const guild = await this.client.guilds.fetch(this.config.guildID);
      const members = await guild.members.fetch();
      const streamRole = await guild.roles.fetch(settings.streamRoleID);
      const streamRoleWords = settings.streamRoleWords || [];

      for (const member of members) {
        let isStreaming = false;
        if (member?.presence?.activities) {
          for (const activity of member.presence.activities) {
            if (activity.type === "STREAMING" && activity.url) {
              const streamer = await this.db.getStreamer(activity.url);
              if (streamer) {
                const titleContainsWord =
                  streamRoleWords.length === 0 ||
                  streamRoleWords.some((word) => activity.name.includes(word));
                if (titleContainsWord) {
                  isStreaming = true;
                  if (!member.roles.cache.has(streamRole.id)) {
                    await member.roles.add(streamRole);
                    console.log(
                      `Added ${streamRole.name} to ${member.user.tag}`,
                    );
                  }
                }
              }
            }
          }
        }
        if (!isStreaming && member.roles.cache.has(streamRole.id)) {
          await member.roles.remove(streamRole);
          console.log(`Removed ${streamRole.name} from ${member.user.tag}`);
        }
      }
    } catch (e) {
      console.log(e);
      return;
    }
  }
}

module.exports = StreamRoleHandler;
