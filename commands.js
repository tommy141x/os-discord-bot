const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v9");
const config = require("./config.json");
const { EmbedBuilder } = require("discord.js");
const db = require("./db.js");
const { SlashCommandBuilder } = require("@discordjs/builders");

class CommandHandler {
  constructor(client) {
    this.client = client;
    this.commands = [];
    this.settings = db.get("settings");
    this.registerCommands();
  }

  registerCommands() {
    /* UTILITY COMMANDS */
    const utilitySettings = this.settings.utilitySettings;

    if (utilitySettings.pingCommand) {
      this.addCommand(
        new SlashCommandBuilder()
          .setName("ping")
          .setDescription("Tests the bot's response time."),
        async (interaction) => {
          const sent = await interaction.deferReply({ fetchReply: true });
          const timeDiff = sent.createdTimestamp - interaction.createdTimestamp;

          const embed = new EmbedBuilder()
            .setColor("#00FF00")
            .setTitle("🏓 Pong!")
            .addFields(
              { name: "Latency", value: `${timeDiff}ms`, inline: true },
              {
                name: "API Latency",
                value: `${Math.round(interaction.client.ws.ping)}ms`,
                inline: true,
              },
            )
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
        },
      );
    }

    if (utilitySettings.userCommand) {
      this.addCommand(
        new SlashCommandBuilder()
          .setName("user")
          .setDescription("Shows user information.")
          .addUserOption((option) =>
            option
              .setName("target")
              .setDescription("The user to get information about")
              .setRequired(false),
          ),
        async (interaction) => {
          const targetUser =
            interaction.options.getUser("target") || interaction.user;
          const member = interaction.guild.members.cache.get(targetUser.id);

          const embed = new EmbedBuilder()
            .setColor("#0099ff")
            .setTitle("User Information")
            .setThumbnail(targetUser.displayAvatarURL())
            .addFields(
              { name: "ID", value: targetUser.id, inline: true },
              { name: "Username", value: targetUser.username, inline: true },
              {
                name: "Nickname",
                value: member ? member.nickname || "None" : "None",
                inline: true,
              },
              {
                name: "Joined Server",
                value: member ? member.joinedAt.toDateString() : "Unknown",
                inline: true,
              },
              {
                name: "Account Created",
                value: targetUser.createdAt.toDateString(),
                inline: true,
              },
            )
            .setTimestamp();

          await interaction.reply({ embeds: [embed] });
        },
      );
    }

    if (utilitySettings.serverCommand) {
      this.addCommand(
        new SlashCommandBuilder()
          .setName("server")
          .setDescription(
            "Shows server information and provides a permanent invite link.",
          ),
        async (interaction) => {
          const guild = interaction.guild;
          const invite = await guild.invites.create(guild.systemChannelId, {
            maxAge: 0,
            maxUses: 0,
          });

          const embed = new EmbedBuilder()
            .setColor("#0099ff")
            .setTitle("Server Information")
            .setThumbnail(guild.iconURL())
            .addFields(
              { name: "ID", value: guild.id, inline: true },
              { name: "Name", value: guild.name, inline: true },
              { name: "Owner", value: `<@${guild.ownerId}>`, inline: true },
              {
                name: "Member Count",
                value: guild.memberCount.toString(),
                inline: true,
              },
              {
                name: "Created At",
                value: guild.createdAt.toDateString(),
                inline: true,
              },
              {
                name: "Boost Level",
                value: guild.premiumTier.toString(),
                inline: true,
              },
              { name: "Permanent Invite Link", value: invite.url },
            )
            .setTimestamp();

          await interaction.reply({ embeds: [embed] });
        },
      );
    }

    if (utilitySettings.leaderboardCommand) {
      this.addCommand(
        new SlashCommandBuilder()
          .setName("leaderboard")
          .setDescription("Shows the top 5 users with the most points"),
        async (interaction) => {
          const logs = db.get("logs") || [];
          const userPoints = this.calculatePoints(logs);
          const sortedUsers = Object.entries(userPoints).sort(
            (a, b) => b[1].total - a[1].total,
          );

          const embed = new EmbedBuilder()
            .setColor("#0099ff")
            .setTitle("🏆 Leaderboard")
            .setDescription("Top 5 users with the most points")
            .setTimestamp();

          // Total Points
          let totalPointsField = sortedUsers
            .slice(0, 5)
            .map(
              ([userId, points], index) =>
                `${index + 1}. <@${userId}>: ${points.total} points`,
            )
            .join("\n");
          embed.addFields({
            name: "📊 Total Points",
            value: totalPointsField || "No data",
          });

          // Messages Sent
          let messagesField = sortedUsers
            .sort((a, b) => b[1].messages - a[1].messages)
            .slice(0, 5)
            .map(
              ([userId, points], index) =>
                `${index + 1}. <@${userId}>: ${points.messages}`,
            )
            .join("\n");

          // Voice Time
          let voiceTimeField = sortedUsers
            .sort((a, b) => b[1].voiceTime - a[1].voiceTime)
            .slice(0, 5)
            .map(([userId, points], index) => {
              const hours = Math.floor(points.voiceTime / 3600);
              const minutes = Math.floor((points.voiceTime % 3600) / 60);
              return `${index + 1}. <@${userId}>: ${hours}h ${minutes}m`;
            })
            .join("\n");

          // Add Messages and Voice Time fields side by side
          embed.addFields(
            {
              name: "💬 Messages Sent",
              value: messagesField || "No data",
              inline: true,
            },
            {
              name: "🎙️ Voice Time",
              value: voiceTimeField || "No data",
              inline: true,
            },
          );

          await interaction.reply({ embeds: [embed] });
        },
      );
    }

    if (utilitySettings.pointsCommand) {
      this.addCommand(
        new SlashCommandBuilder()
          .setName("points")
          .setDescription("Shows user's points")
          .addUserOption((option) =>
            option
              .setName("user")
              .setDescription("The user to check points for")
              .setRequired(false),
          ),
        async (interaction) => {
          const targetUser =
            interaction.options.getUser("user") || interaction.user;
          const logs = db.get("logs") || [];
          const userPoints = this.calculatePoints(logs);
          const points = userPoints[targetUser.id] || {
            messages: 0,
            voiceTime: 0,
            total: 0,
          };
          const hours = Math.floor(points.voiceTime / 3600);
          const minutes = Math.floor((points.voiceTime % 3600) / 60);

          const embed = new EmbedBuilder()
            .setColor("#0099ff")
            .setTitle(`Points for ${targetUser.username}`)
            .setThumbnail(targetUser.displayAvatarURL())
            .addFields(
              {
                name: "💬 Messages",
                value: points.messages.toString(),
                inline: true,
              },
              {
                name: "🎙️ Voice Time",
                value: `${hours}h ${minutes}m`,
                inline: true,
              },
              {
                name: "📊 Total Points",
                value: points.total.toString(),
                inline: true,
              },
            )
            .setTimestamp();

          await interaction.reply({ embeds: [embed] });
        },
      );
    }

    utilitySettings.customCommands.forEach((command) => {
      this.addCommand(
        new SlashCommandBuilder()
          .setName(command.name.toLowerCase())
          .setDescription(command.description),
        async (interaction) => {
          command.embeds.forEach((embed) => {
            const discordEmbed = new EmbedBuilder()
              .setColor(embed.color)
              .setTitle(embed.title)
              .setDescription(embed.description);
            interaction.reply({ embeds: [discordEmbed] });
          });
          command.messages.forEach((message) => {
            interaction.reply(message);
          });
        },
      );
    });

    /* MODERATION COMMANDS */
    const modSettings = this.settings.moderationSettings;

    if (modSettings.setNickCommand) {
      this.addCommand(
        new SlashCommandBuilder()
          .setName("setnick")
          .setDescription("Set a user's nickname")
          .addUserOption((option) =>
            option
              .setName("user")
              .setDescription("The user to set nickname for")
              .setRequired(true),
          )
          .addStringOption((option) =>
            option
              .setName("nickname")
              .setDescription("The nickname to set")
              .setRequired(true),
          ),
        async (interaction) => {
          const member = await interaction.guild.members.fetch(
            interaction.user.id,
          );
          if (
            !member.roles.cache.some((role) =>
              modSettings.modRoles.includes(role.id),
            )
          ) {
            return interaction.reply({
              content: "**You do not have permission to use this command.**",
              ephemeral: true,
            });
          }

          // set the nickname
          const targetUser = interaction.options.getUser("user");
          const targetMember = await interaction.guild.members.fetch(
            targetUser.id,
          );
          const nickname = interaction.options.getString("nickname");
          await targetMember.setNickname(nickname);
          await interaction.reply(`Nickname set to **${nickname}**.`);
        },
      );
    }

    this.deployCommands();
  }

  calculatePoints(logs) {
    const userPoints = {};
    const voiceJoinTimes = {};
    const messageMultiplier = 2; // Multiplier for message points
    const voiceMultiplier = 3; // Multiplier for voice points

    logs.forEach((log) => {
      try {
        let userId;
        const userIdMatch = log.message.match(/<@(\d+)>/);

        if (userIdMatch && userIdMatch[1]) {
          userId = userIdMatch[1];
        } else {
          return; // Skip this log entry
        }

        if (!userPoints[userId])
          userPoints[userId] = { messages: 0, voiceTime: 0, total: 0 };

        if (log.type === "new-message") {
          userPoints[userId].messages++;
          userPoints[userId].total += messageMultiplier;
        } else if (log.type === "voice") {
          if (log.message.includes("joined voice channel")) {
            voiceJoinTimes[userId] = new Date(log.timestamp);
          } else if (
            log.message.includes("left voice channel") &&
            voiceJoinTimes[userId]
          ) {
            const joinTime = voiceJoinTimes[userId];
            const leaveTime = new Date(log.timestamp);
            const duration = (leaveTime - joinTime) / 1000; // duration in seconds
            userPoints[userId].voiceTime += duration;
            userPoints[userId].total +=
              Math.floor(duration / 60) * voiceMultiplier; // 1 point per minute
            delete voiceJoinTimes[userId];
          }
        }
      } catch (error) {
        console.error(`Error processing log entry: ${JSON.stringify(log)}`);
        console.error(error);
      }
    });

    return userPoints;
  }

  addCommand(builder, executeFunction) {
    this.commands.push({
      data: builder.toJSON(),
      execute: executeFunction,
    });
  }

  async deployCommands() {
    const rest = new REST({ version: "9" }).setToken(this.client.token);

    try {
      console.log(
        `Started refreshing application (/) commands. Total: ${this.commands.length}`,
      );

      await rest.put(Routes.applicationCommands(this.client.user.id), {
        body: this.commands.map((cmd) => cmd.data),
      });

      console.log(
        `Successfully reloaded application (/) commands. Total: ${this.commands.length}`,
      );
    } catch (error) {
      console.error(error);
    }
  }

  async handleCommand(interaction) {
    if (!interaction.isCommand()) return;

    const command = this.commands.find(
      (cmd) => cmd.data.name === interaction.commandName,
    );

    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: "There was an error while executing this command!",
        ephemeral: true,
      });
    }
  }
}

module.exports = CommandHandler;
