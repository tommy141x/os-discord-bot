const { Twitch, YouTube } = require("@livecord/notify");
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
        useDatabase: true,
      });

      this.youtubeInstance.on("ready", (ready) => {
        console.log("YouTube connected at:", ready);
        this.subscribeYouTubeChannels(settings);
      });

      this.youtubeInstance.on("upload", (video) => {
        console.log("YouTube new video!", video);
        const alert = Object.values(settings).find(
          (a) => a.type === "youtube" && a.socialName === video.author,
        );

        if (
          alert &&
          this.isTitleWhitelisted(video.title, settings.whitelistTitleWords)
        ) {
          this.sendAlert(alert, {
            author: video.author,
            url: video.link,
            action: "uploaded a new video",
            platform: "youtube",
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
          token: twitchToken.access_token,
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

        if (
          alert &&
          this.isTitleWhitelisted(channel.title, settings.whitelistTitleWords)
        ) {
          this.sendAlert(alert, {
            author: settings.socialName || channel.user_name,
            title: channel.title,
            url: `https://www.twitch.tv/${channel.user_login}`,
            thumbnail: channel.thumbnail_url
              .replace("{width}", "1280")
              .replace("{height}", "720"),
            platform: "twitch",
            action: "started streaming",
          });
        }
      });
    } else {
      console.log("Twitch settings are not configured properly!");
    }
  }

  subscribeYouTubeChannels(settings) {
    if (this.youtubeInstance) {
      for (const alert of Object.values(settings)) {
        if (alert.type === "youtube") {
          this.youtubeInstance.subscribe(alert.socialId);
          console.log("Subscribed to " + alert.socialId + " on YouTube!");
        }
      }
    }
  }

  subscribeTwitchChannels(settings) {
    if (this.twitchInstance) {
      for (const alert of Object.values(settings)) {
        if (alert.type === "twitch") {
          this.twitchInstance.follow([alert.socialId]);
          console.log("Followed " + alert.socialId + " on Twitch!");
        }
      }
    }
  }

  isTitleWhitelisted(title, whitelist) {
    if (!whitelist || whitelist.length === 0) {
      return true; // If whitelist is empty, always return true
    }
    return whitelist.some((word) =>
      title.toLowerCase().includes(word.toLowerCase()),
    );
  }

  async sendAlert(alert, content) {
    const message = alert.message
      .replace("{author}", "**" + content.author + "**")
      .replace("{uploadedANewVideoOrStartedStreaming}", content.action);

    const mentionString = alert.rolesToMention
      .map((roleId) => `<@&${roleId}>`)
      .join(" ");

    const channel = this.client.channels.cache.get(alert.channelId);
    if (channel) {
      if (alert.platform === "twitch") {
        // Prepare embed for Twitch alerts
        const embed = {
          color: 0x9146ff,
          author: {
            name: content.author,
          },
          title: content.title,
          url: content.url,
          image: {
            url: content.thumbnail,
          },
        };

        await channel.send({
          content: `${mentionString} ${message}`,
          embeds: [embed],
        });
      } else if (alert.platform === "youtube") {
        await channel.send({
          content: mentionString + " " + message + "\n" + content.url,
        });
      }
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
