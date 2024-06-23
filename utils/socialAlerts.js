const { Twitch, YouTube } = require("@livecord/notify");
const { EmbedBuilder } = require("discord.js");
const config = require("../config.json");
const db = require("./db.js");

class SocialAlertSystem {
  constructor(client) {
    this.client = client;
    this.db = db;
    this.config = config;
    this.youtubeInstance = null;
    this.twitchInstance = null;
  }

  async setup() {
    const settings = this.db.get("settings").socialAlertSettings;

    await this.setupYouTube(settings);
    await this.setupTwitch(settings);
  }

  async setupYouTube(settings) {
    if (Object.values(settings).some((a) => a.type === "youtube")) {
      this.youtubeInstance = new YouTube({
        interval: 60000,
        useDatabase: false,
      });

      this.youtubeInstance.on("ready", (ready) => {
        console.log("YouTube connected at:", ready);
        this.subscribeYouTubeChannels(settings);
      });

      this.youtubeInstance.on("upload", (video) => {
        console.log("YouTube new video!", video);
        const alert = Object.values(settings).find(
          (a) => a.type === "youtube" && a.socialId === video.author,
        );
        if (alert) {
          this.sendAlert(alert, {
            title: video.title,
            url: video.link,
            thumbnail: `https://img.youtube.com/vi/${video.id}/maxresdefault.jpg`,
            type: "video",
            platform: "YouTube",
          });
        }
      });
    }
  }

  async setupTwitch(settings) {
    if (
      Object.values(settings).some((a) => a.type === "twitch") &&
      this.config.twitchClientId &&
      this.config.twitchClientSecret
    ) {
      const twitchToken = await Twitch.getToken(
        this.config.twitchClientId,
        this.config.twitchClientSecret,
      );
      this.twitchInstance = new Twitch({
        client: {
          id: this.config.twitchClientId,
          token: twitchToken,
        },
        interval: 60000,
      });

      this.twitchInstance.on("ready", (ready) => {
        console.log("Twitch connected at:", ready);
        this.subscribeTwitchChannels(settings);
      });

      this.twitchInstance.on("live", (channel) => {
        console.log(channel.user_name + " is live!");
        const alert = Object.values(settings).find(
          (a) => a.type === "twitch" && a.socialId === channel.user_name,
        );
        if (alert) {
          this.sendAlert(alert, {
            title: channel.title,
            url: `https://www.twitch.tv/${channel.user_login}`,
            thumbnail: channel.thumbnail_url
              .replace("{width}", "1280")
              .replace("{height}", "720"),
            type: "livestream",
            platform: "Twitch",
          });
        }
      });
    }
  }

  subscribeYouTubeChannels(settings) {
    if (this.youtubeInstance) {
      for (const alert of Object.values(settings)) {
        if (alert.type === "youtube") {
          this.youtubeInstance.subscribe(alert.socialId);
        }
      }
    }
  }

  subscribeTwitchChannels(settings) {
    if (this.twitchInstance) {
      for (const alert of Object.values(settings)) {
        if (alert.type === "twitch") {
          this.twitchInstance.follow([alert.socialId]);
        }
      }
    }
  }

  async sendAlert(alert, content) {
    const embed = new EmbedBuilder()
      .setColor(content.platform === "YouTube" ? "#FF0000" : "#6441A4")
      .setTitle(content.title)
      .setURL(content.url)
      .setImage(content.thumbnail)
      .setDescription(alert.message)
      .addFields(
        { name: "Type", value: content.type, inline: true },
        { name: "Platform", value: content.platform, inline: true },
      )
      .setTimestamp();

    const mentionString = alert.rolesToMention
      .map((roleId) => `<@&${roleId}>`)
      .join(" ");

    const channel = this.client.channels.cache.get(alert.channelId);
    if (channel) {
      await channel.send({ content: mentionString, embeds: [embed] });
    }
  }

  reset() {
    const settings = this.db.get("settings").socialAlertSettings;

    if (this.youtubeInstance) {
      this.youtubeInstance.unsubscribeAll();
    }
    if (this.twitchInstance) {
      this.twitchInstance.unfollow();
    }

    this.subscribeYouTubeChannels(settings);
    this.subscribeTwitchChannels(settings);
  }
}

module.exports = SocialAlertSystem;
