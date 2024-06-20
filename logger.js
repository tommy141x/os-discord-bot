const config = require("./config.json");
const db = require("./db.js");

class Logger {
  constructor(client, settings) {
    this.settings = settings;
    this.client = client;
    this.registerEventListeners();
    this.interval = setInterval(async () => {
      const guild = await this.client.guilds.fetch(config.guildID);
      const guildPreview = await guild.fetch();
      let totalMembers = guild.memberCount;
      let onlineMembers = guildPreview.approximatePresenceCount;
      const currentStats = {
        timestamp: new Date().toISOString(),
        totalMembers,
        onlineMembers,
      };
      db.set("stats", [...(db.get("stats") || []), currentStats]);
    }, 60000);
  }

  logEvent(message, type, channelId, member) {
    //member is the member object of the member who triggered the event
    const log = {
      message: message,
      timestamp: new Date().toISOString(),
      type: type,
    };
    db.set("logs", [...(db.get("logs") || []), log]);

    if (channelId && channelId !== "" && member) {
      const guild = this.client.guilds.cache.get(config.guildID);
      if (!guild) {
        console.error("Guild not found");
        return;
      }

      const typeColors = {
        channel: 0x3498db,
        member: 0x2ecc71,
        role: 0x9b59b6,
        thread: 0xe67e22,
        message: 0xe74c3c,
        invite: 0x1abc9c,
        server: 0xf1c40f,
        voice: 0x95a5a6,
      };

      guild.channels
        .fetch(channelId)
        .then((channel) => {
          const embed = {
            color: typeColors[type] || 0x0099ff,
            description: message,
            timestamp: new Date(),
            footer: {
              text: guild.name,
            },
            author: {
              name: member.username,
              iconURL: member.displayAvatarURL(),
            },
          };
          channel.send({ embeds: [embed] });
        })
        .catch(console.error);
    }
  }

  registerEventListeners() {
    if (this.settings.logMemberBans.enabled) {
      this.client.on("guildBanAdd", this.handleMemberBanned.bind(this));
    }
    if (this.settings.logMemberUnbans.enabled) {
      this.client.on("guildBanRemove", this.handleMemberUnbanned.bind(this));
    }
    if (this.settings.logMemberLeaves.enabled) {
      this.client.on("guildMemberRemove", this.handleMemberLeft.bind(this));
    }
    if (this.settings.logMemberJoins.enabled) {
      this.client.on("guildMemberAdd", this.handleMemberJoined.bind(this));
    }
    if (this.settings.logMemberUpdates.enabled) {
      this.client.on("guildMemberUpdate", this.handleMemberUpdated.bind(this));
    }
    if (this.settings.logChannelCreations.enabled) {
      this.client.on("channelCreate", this.handleChannelCreated.bind(this));
    }
    if (this.settings.logChannelDeletions.enabled) {
      this.client.on("channelDelete", this.handleChannelDeleted.bind(this));
    }
    if (this.settings.logChannelUpdates.enabled) {
      this.client.on("channelUpdate", this.handleChannelUpdated.bind(this));
    }
    if (this.settings.logThreadCreations.enabled) {
      this.client.on("threadCreate", this.handleThreadCreated.bind(this));
    }
    if (this.settings.logThreadDeletions.enabled) {
      this.client.on("threadDelete", this.handleThreadDeleted.bind(this));
    }
    if (this.settings.logThreadUpdates.enabled) {
      this.client.on("threadUpdate", this.handleThreadUpdated.bind(this));
    }
    if (this.settings.logRoleCreations.enabled) {
      this.client.on("roleCreate", this.handleRoleCreated.bind(this));
    }
    if (this.settings.logRoleDeletions.enabled) {
      this.client.on("roleDelete", this.handleRoleDeleted.bind(this));
    }
    if (this.settings.logRoleUpdates.enabled) {
      this.client.on("roleUpdate", this.handleRoleUpdated.bind(this));
    }
    if (this.settings.logMessageCreation.enabled) {
      this.client.on("messageCreate", this.handleMessageCreated.bind(this));
    }
    if (this.settings.logMessageDeletions.enabled) {
      this.client.on("messageDelete", this.handleMessageDeleted.bind(this));
    }
    if (this.settings.logMessageEdits.enabled) {
      this.client.on("messageUpdate", this.handleMessageEdited.bind(this));
    }
    if (this.settings.logVoiceStateUpdates.enabled) {
      this.client.on(
        "voiceStateUpdate",
        this.handleVoiceStateUpdate.bind(this),
      );
    }
    if (this.settings.logInviteCreations.enabled) {
      this.client.on("inviteCreate", this.handleInviteCreated.bind(this));
    }
    if (this.settings.logInviteDeletions.enabled) {
      this.client.on("inviteDelete", this.handleInviteDeleted.bind(this));
    }
    if (this.settings.logServerUpdates.enabled) {
      this.client.on("guildUpdate", this.handleServerUpdated.bind(this));
    }
    if (this.settings.logPermissionUpdates.enabled) {
      this.client.on(
        "permissionOverwriteUpdate",
        this.handleChannelPermissionsUpdated.bind(this),
      );
    }
  }

  destroy() {
    this.client.removeAllListeners("guildBanAdd");
    this.client.removeAllListeners("guildBanRemove");
    this.client.removeAllListeners("guildMemberRemove");
    this.client.removeAllListeners("guildMemberAdd");
    this.client.removeAllListeners("guildMemberUpdate");
    this.client.removeAllListeners("channelCreate");
    this.client.removeAllListeners("channelDelete");
    this.client.removeAllListeners("channelUpdate");
    this.client.removeAllListeners("threadCreate");
    this.client.removeAllListeners("threadDelete");
    this.client.removeAllListeners("threadUpdate");
    this.client.removeAllListeners("roleCreate");
    this.client.removeAllListeners("roleDelete");
    this.client.removeAllListeners("roleUpdate");
    this.client.removeAllListeners("messageCreate");
    this.client.removeAllListeners("messageDelete");
    this.client.removeAllListeners("messageUpdate");
    this.client.removeAllListeners("voiceStateUpdate");
    this.client.removeAllListeners("inviteCreate");
    this.client.removeAllListeners("inviteDelete");
    this.client.removeAllListeners("guildUpdate");
    this.client.removeAllListeners("permissionOverwriteUpdate");
    clearInterval(this.interval);
  }

  handleMemberBanned(ban) {
    const mentionString = `<@${ban.user.id}>`;
    const logEntry = `${mentionString} **was banned**`;
    this.logEvent(
      logEntry,
      "ban",
      this.settings.logMemberBans.channelId,
      ban.user,
    );
  }

  handleMemberUnbanned(ban) {
    const mentionString = `<@${ban.user.id}>`;
    const logEntry = `${mentionString} **was unbanned**`;
    this.logEvent(
      logEntry,
      "unban",
      this.settings.logMemberUnbans.channelId,
      ban.user,
    );
  }

  handleMemberLeft(member) {
    const mentionString = `<@${member.user.id}>`;
    const logEntry = `${mentionString} **left the server**`;
    this.logEvent(
      logEntry,
      "left",
      this.settings.logMemberLeaves.channelId,
      member,
    );
  }

  handleMemberJoined(member) {
    const mentionString = `<@${member.user.id}>`;
    const logEntry = `${mentionString} **joined the server**`;
    this.logEvent(
      logEntry,
      "join",
      this.settings.logMemberJoins.channelId,
      member,
    );
  }

  handleMemberUpdated(oldMember, newMember) {
    const changes = [];
    const mentionString = `<@${newMember.user.id}>`;
    if (oldMember.nickname !== newMember.nickname) {
      changes.push(
        `${mentionString} **nickname changed**\n**Old:** ${oldMember.nickname}\n**New:** ${newMember.nickname}`,
      );
    }
    if (oldMember.roles.cache.size !== newMember.roles.cache.size) {
      const oldRoles = oldMember.roles.cache.map((r) => r.name);
      const newRoles = newMember.roles.cache.map((r) => r.name);
      const addedRoles = newRoles.filter((r) => !oldRoles.includes(r));
      const removedRoles = oldRoles.filter((r) => !newRoles.includes(r));
      if (addedRoles.length > 0) {
        changes.push(
          `${mentionString} **was given the role(s):**\n${addedRoles.join(", ")}`,
        );
      }
      if (removedRoles.length > 0) {
        changes.push(
          `${mentionString} **had the role(s) removed:**\n${removedRoles.join(", ")}`,
        );
      }
    }
    changes.forEach((change) =>
      this.logEvent(
        change,
        "member",
        this.settings.logMemberUpdates.channelId,
        newMember,
      ),
    );
  }

  handleChannelCreated(channel) {
    const channelString = `<#${channel.id}>`;
    const logEntry = `**New channel created:** ${channelString}.`;
    this.logEvent(
      logEntry,
      "channel",
      this.settings.logChannelCreations.channelId,
    );
  }

  handleChannelDeleted(channel) {
    const logEntry = `**Channel deleted:** ${channel.name}.`;
    this.logEvent(
      logEntry,
      "channel",
      this.settings.logChannelDeletions.channelId,
    );
  }

  handleChannelUpdated(oldChannel, newChannel) {
    const changes = [];
    const channelString = `<#${newChannel.id}>`;
    if (oldChannel.name !== newChannel.name) {
      changes.push(
        `**Channel name changed:** ${channelString}\n**Old:** ${oldChannel.name}\n**New:** ${newChannel.name}`,
      );
    }
    if (oldChannel.topic !== newChannel.topic) {
      changes.push(
        `**Channel topic changed:** ${channelString}\n**New topic:** ${newChannel.topic}`,
      );
    }
    changes.forEach((change) =>
      this.logEvent(
        change,
        "channel",
        this.settings.logChannelUpdates.channelId,
      ),
    );
  }

  handleThreadCreated(thread) {
    const channelString = `<#${thread.id}>`;
    const logEntry = `**New thread created:** ${channelString}.`;
    this.logEvent(
      logEntry,
      "new-thread",
      this.settings.logThreadCreations.channelId,
    );
  }

  handleThreadDeleted(thread) {
    const logEntry = `**Thread deleted:** ${thread.name}.`;
    this.logEvent(
      logEntry,
      "thread",
      this.settings.logThreadDeletions.channelId,
    );
  }

  handleThreadUpdated(oldThread, newThread) {
    const changes = [];
    const channelString = `<#${newThread.id}>`;
    if (oldThread.name !== newThread.name) {
      changes.push(
        `**Thread name changed:** ${channelString}\n**Old:** ${oldThread.name}\n**New:** ${newThread.name}`,
      );
    }
    changes.forEach((change) =>
      this.logEvent(change, "thread", this.settings.logThreadUpdates.channelId),
    );
  }

  handleRoleCreated(role) {
    const logEntry = `**New role created:** ${role.name} (${role.id})`;
    this.logEvent(logEntry, "role", this.settings.logRoleCreations.channelId);
  }

  handleRoleDeleted(role) {
    const logEntry = `**Role deleted:** ${role.name} (${role.id})`;
    this.logEvent(logEntry, "role", this.settings.logRoleDeletions.channelId);
  }

  handleRoleUpdated(oldRole, newRole) {
    const changes = [];
    if (oldRole.name !== newRole.name) {
      changes.push(
        `**Role name changed:**\n**Old:** ${oldRole.name}\n**New:** ${newRole.name} (${newRole.id})`,
      );
    }
    if (oldRole.color !== newRole.color) {
      changes.push(
        `**Role color changed:** ${newRole.name} (${newRole.id})\n**New color:** ${newRole.hexColor}`,
      );
    }
    changes.forEach((change) =>
      this.logEvent(change, "role", this.settings.logRoleUpdates.channelId),
    );
  }

  handleMessageCreated(message) {
    if (message.author.id === this.client.user.id) return; // Skip logging if it's the bot's own message
    const mentionString = `<@${message.author.id}>`;
    const channelString = `<#${message.channel.id}>`;
    const logEntry = `${mentionString} **sent a message in** ${channelString}:\n${message.content}`;
    this.logEvent(
      logEntry,
      "new-message",
      this.settings.logMessageCreation.channelId,
      message.author,
    );
  }

  handleMessageEdited(oldMessage, newMessage) {
    if (newMessage.author.id === this.client.user.id) return; // Skip logging if it's the bot's own message
    const mentionString = `<@${newMessage.author.id}>`;
    const channelString = `<#${newMessage.channel.id}>`;
    const logEntry = `${mentionString} **edited a message in** ${channelString}. \n **Old Content:** ${oldMessage.content} \n **New Content:** ${newMessage.content}`;
    this.logEvent(
      logEntry,
      "message",
      this.settings.logMessageEdits.channelId,
      newMessage.author,
    );
  }

  handleMessageDeleted(message) {
    if (message.author.id === this.client.user.id) return; // Skip logging if it's the bot's own message
    const mentionString = `<@${message.author.id}>`;
    const channelString = `<#${message.channel.id}>`;
    const moderatorString = message.executor
      ? `<@${message.executor.id}>`
      : "Unknown moderator";
    const logEntry = `${mentionString} **had a message deleted in** ${channelString} **by** ${moderatorString}:\n${message.content}`;
    this.logEvent(
      logEntry,
      "message",
      this.settings.logMessageDeletions.channelId,
      message.author,
    );
  }

  handleVoiceStateUpdate(oldState, newState) {
    const changes = [];
    const member = newState.member;
    const mentionString = `<@${member.user.id}>`;
    if (oldState.channelId === null && newState.channelId !== null) {
      const channelString = `<#${newState.channelId}>`;
      changes.push(
        `${mentionString} **joined voice channel** ${channelString}`,
      );
    } else if (oldState.channelId !== null && newState.channelId === null) {
      const channelString = `<#${oldState.channelId}>`;
      changes.push(`${mentionString} **left voice channel** ${channelString}`);
    } else if (oldState.channelId !== newState.channelId) {
      const oldChannelString = `<#${oldState.channelId}>`;
      const newChannelString = `<#${newState.channelId}>`;
      changes.push(
        `${mentionString} **switched voice channels**\n**From:** ${oldChannelString}\n**To:** ${newChannelString}`,
      );
    }
    if (oldState.selfMute !== newState.selfMute) {
      changes.push(
        `${mentionString} **${
          newState.selfMute ? "muted" : "unmuted"
        } themselves**`,
      );
    }
    if (oldState.selfDeaf !== newState.selfDeaf) {
      changes.push(
        `${mentionString} **${
          newState.selfDeaf ? "deafened" : "undeafened"
        } themselves**`,
      );
    }
    changes.forEach((change) =>
      this.logEvent(
        change,
        "voice",
        this.settings.logVoiceStateUpdates.channelId,
        member,
      ),
    );
  }

  handleInviteCreated(invite) {
    const channelString = `<#${invite.channel.id}>`;
    const logEntry = `**New invite created:** ${invite.code}\n**URL:** ${invite.url}\n**Channel:** ${channelString}`;
    this.logEvent(
      logEntry,
      "new-invite",
      this.settings.logInviteCreations.channelId,
    );
  }

  handleInviteDeleted(invite) {
    const channelString = `<#${invite.channel.id}>`;
    const logEntry = `**Invite deleted:** ${invite.code}\n**Channel:** ${channelString}`;
    this.logEvent(
      logEntry,
      "invite",
      this.settings.logInviteDeletions.channelId,
    );
  }

  handleServerUpdated(oldGuild, newGuild) {
    const changes = [];
    if (oldGuild.name !== newGuild.name) {
      changes.push(
        `**Server name changed:**\n**Old:** ${oldGuild.name}\n**New:** ${newGuild.name}`,
      );
    }
    changes.forEach((change) =>
      this.logEvent(change, "server", this.settings.logServerUpdates.channelId),
    );
  }

  handleChannelPermissionsUpdated(oldOverwrite, newOverwrite) {
    const channelString = `<#${newOverwrite.channel.id}>`;
    const subject =
      newOverwrite.type === "role"
        ? `**Role ${newOverwrite.role.name}** (${newOverwrite.role.id})`
        : `**Member <@${newOverwrite.member.user.id}>** (${newOverwrite.member.user.id})`;
    const logEntry = `**Channel permissions updated:**\n**Subject:** ${subject}\n**Channel:** ${channelString}`;
    this.logEvent(
      logEntry,
      "channel",
      this.settings.logPermissionUpdates.channelId,
      newOverwrite.member,
    );
  }
}

module.exports = Logger;
