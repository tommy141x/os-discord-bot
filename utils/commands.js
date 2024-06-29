const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v9");
const config = require("../config.json");
const axios = require("axios");
const { EmbedBuilder } = require("discord.js");
const OpenAI = require("openai");
const db = require("./db.js");
const { SlashCommandBuilder } = require("@discordjs/builders");

class CommandHandler {
  constructor(client) {
    this.client = client;
    this.commands = [];
    this.settings = db.get("settings");
    this.stickyMessages = new Map();
    this.handleStickyMessages = this.handleStickyMessages.bind(this);
    this.registerCommands();
  }

  async handleStickyMessages(message) {
    if (message.author.bot) return;

    const channelId = message.channelId;
    if (this.stickyMessages.has(channelId)) {
      const stickyId = this.stickyMessages.get(channelId);
      try {
        const stickyMessage = await message.channel.messages.fetch(stickyId);
        await stickyMessage.delete();
        const newSticky = await message.channel.send({
          embeds: [stickyMessage.embeds[0]],
        });
        this.stickyMessages.set(channelId, newSticky.id);
      } catch (error) {
        console.error("Failed to update sticky message:", error);
        this.stickyMessages.delete(channelId);
      }
    }
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

    if (utilitySettings.dreamCommand) {
      this.addCommand(
        new SlashCommandBuilder()
          .setName("dream")
          .setDescription("Generate an image based on your description")
          .addStringOption((option) =>
            option
              .setName("prompt")
              .setDescription("Describe the image you want to generate")
              .setRequired(true),
          ),
        async (interaction) => {
          await interaction.deferReply();

          const prompt = interaction.options.getString("prompt");

          try {
            if (config.aiType != "openai" || !config.openAIToken) {
              return await interaction.editReply(
                "Sorry, this feature is only available with OpenAI. Please contact the bot owner to enable it.",
              );
            }
            if (!this.openai) {
              this.openai = new OpenAI({
                apiKey: config.openAIToken,
              });
            }

            const response = await this.openai.images.generate({
              model: "dall-e-2",
              prompt: prompt,
              n: 1,
              size: "512x512",
            });

            const image_url = response.data[0].url;

            // Fetch the image data
            const imageResponse = await axios.get(image_url, {
              responseType: "arraybuffer",
            });
            const buffer = Buffer.from(imageResponse.data, "binary");

            // Send the generated image
            await interaction.editReply({
              content: `Here's an image of **${prompt}**.`,
              files: [
                {
                  attachment: image_url,
                  name: "dalle2.png",
                },
              ],
            });
          } catch (error) {
            console.error("Error generating image:", error);
            await interaction.editReply(
              "Sorry, there was an error generating your image. Please try again later.",
            );
          }
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
            const randomColor = Math.floor(Math.random() * 16777215); // Generate random color
            const discordEmbed = new EmbedBuilder()
              .setColor(randomColor)
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

    // Helper function to create and send embed responses
    async function sendEmbed(
      interaction,
      title,
      description,
      color = "#0099ff",
    ) {
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color);
      await interaction.reply({ embeds: [embed] });
    }

    // Helper function to check moderator permissions
    function isModeratorAllowed(member) {
      return member.roles.cache.some((role) =>
        modSettings.modRoles.includes(role.id),
      );
    }

    if (modSettings.giveawayCommand) {
      this.addCommand(
        new SlashCommandBuilder()
          .setName("giveaway")
          .setDescription("Start a giveaway")
          .addStringOption((option) =>
            option
              .setName("prize")
              .setDescription("The prize for the giveaway")
              .setRequired(true),
          )
          .addIntegerOption((option) =>
            option
              .setName("duration")
              .setDescription("Duration of the giveaway in minutes")
              .setRequired(true),
          ),
        async (interaction) => {
          if (!isModeratorAllowed(interaction.member)) {
            return interaction.reply({
              embeds: [
                {
                  title: "Permission Denied",
                  description:
                    "You do not have permission to use this command.",
                  color: 0xff0000,
                },
              ],
              ephemeral: true,
            });
          }

          const prize = interaction.options.getString("prize");
          const duration = interaction.options.getInteger("duration");
          const endTime = Math.floor(Date.now() / 1000) + duration * 60;

          const embed = {
            title: "🎉 Giveaway Started! 🎉",
            description: `Prize: **${prize}**\nEnds: <t:${endTime}:R>\nReact with 🎉 to enter!`,
            color: 0x00ff00,
          };

          await interaction.reply({ embeds: [embed] });
          const giveawayMessage = await interaction.fetchReply();

          // Add reaction to the message
          await giveawayMessage.react("🎉");

          // Set a timeout to end the giveaway
          setTimeout(async () => {
            const fetchedMessage = await interaction.channel.messages.fetch(
              giveawayMessage.id,
            );
            const reaction = fetchedMessage.reactions.cache.get("🎉");

            // Get users who reacted
            const users = await reaction.users.fetch();
            const validEntrants = users.filter((user) => !user.bot);

            if (validEntrants.size === 0) {
              embed.title = "Giveaway Ended";
              embed.description = "No one entered the giveaway.";
              embed.color = 0xff0000;
            } else {
              // Select a winner
              const winner = validEntrants.random();

              embed.title = "🎉 Giveaway Ended! 🎉";
              embed.description = `Congratulations to ${winner}! You won: **${prize}**!`;
            }

            await giveawayMessage.edit({ embeds: [embed] });
          }, duration * 60000); // Convert minutes to milliseconds
        },
      );
    }

    if (modSettings.stickyCommand) {
      this.addCommand(
        new SlashCommandBuilder()
          .setName("sticky")
          .setDescription("Manage sticky messages")
          .addSubcommand((subcommand) =>
            subcommand
              .setName("set")
              .setDescription("Set or update the sticky message")
              .addStringOption((option) =>
                option
                  .setName("message")
                  .setDescription("The message to stick")
                  .setRequired(true),
              ),
          )
          .addSubcommand((subcommand) =>
            subcommand
              .setName("clear")
              .setDescription("Clear the sticky message"),
          ),
        async (interaction) => {
          if (!isModeratorAllowed(interaction.member)) {
            return interaction.reply({
              embeds: [
                {
                  title: "Permission Denied",
                  description:
                    "You do not have permission to use this command.",
                  color: 0xff0000,
                },
              ],
              ephemeral: true,
            });
          }

          const subcommand = interaction.options.getSubcommand();
          const channelId = interaction.channelId;

          if (subcommand === "set") {
            const message = interaction.options.getString("message");
            const embed = {
              description: message,
              color: 0x00ff00,
              footer: { text: "Sticky Message" },
            };

            let stickyMessage;
            if (this.stickyMessages.has(channelId)) {
              stickyMessage = await interaction.channel.messages.fetch(
                this.stickyMessages.get(channelId),
              );
              await stickyMessage.edit({ embeds: [embed] });
            } else {
              stickyMessage = await interaction.channel.send({
                embeds: [embed],
              });
              this.stickyMessages.set(channelId, stickyMessage.id);
            }

            await interaction.reply({
              content: "Sticky message set successfully!",
              ephemeral: true,
            });
          } else if (subcommand === "clear") {
            if (this.stickyMessages.has(channelId)) {
              const messageId = this.stickyMessages.get(channelId);
              try {
                const message =
                  await interaction.channel.messages.fetch(messageId);
                await message.delete();
              } catch (error) {
                console.error("Failed to delete sticky message:", error);
              }
              this.stickyMessages.delete(channelId);
              await interaction.reply({
                content: "Sticky message cleared successfully!",
                ephemeral: true,
              });
            } else {
              await interaction.reply({
                content: "There's no sticky message in this channel.",
                ephemeral: true,
              });
            }
          }
        },
      );
    }

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
          if (!isModeratorAllowed(interaction.member)) {
            return sendEmbed(
              interaction,
              "Permission Denied",
              "You do not have permission to use this command.",
              "#FF0000",
            );
          }
          const targetUser = interaction.options.getUser("user");
          const targetMember = await interaction.guild.members.fetch(
            targetUser.id,
          );
          const nickname = interaction.options.getString("nickname");
          await targetMember.setNickname(nickname);
          await sendEmbed(
            interaction,
            "Nickname Set",
            `Nickname for ${targetUser.username} set to **${nickname}**.`,
          );
        },
      );
    }

    if (modSettings.kickCommand) {
      this.addCommand(
        new SlashCommandBuilder()
          .setName("kick")
          .setDescription("Kick a user from the server")
          .addUserOption((option) =>
            option
              .setName("user")
              .setDescription("The user to kick")
              .setRequired(true),
          )
          .addStringOption((option) =>
            option.setName("reason").setDescription("Reason for kicking"),
          ),
        async (interaction) => {
          if (!isModeratorAllowed(interaction.member)) {
            return sendEmbed(
              interaction,
              "Permission Denied",
              "You do not have permission to use this command.",
              "#FF0000",
            );
          }
          const targetUser = interaction.options.getUser("user");
          const reason =
            interaction.options.getString("reason") || "No reason provided";
          await interaction.guild.members.kick(targetUser, reason);
          await sendEmbed(
            interaction,
            "User Kicked",
            `${targetUser.username} has been kicked.\nReason: ${reason}`,
          );
        },
      );
    }

    if (modSettings.banCommand) {
      this.addCommand(
        new SlashCommandBuilder()
          .setName("ban")
          .setDescription("Ban a user from the server")
          .addUserOption((option) =>
            option
              .setName("user")
              .setDescription("The user to ban")
              .setRequired(true),
          )
          .addStringOption((option) =>
            option.setName("reason").setDescription("Reason for banning"),
          ),
        async (interaction) => {
          if (!isModeratorAllowed(interaction.member)) {
            return sendEmbed(
              interaction,
              "Permission Denied",
              "You do not have permission to use this command.",
              "#FF0000",
            );
          }
          const targetUser = interaction.options.getUser("user");
          const reason =
            interaction.options.getString("reason") || "No reason provided";
          await interaction.guild.members.ban(targetUser, { reason });
          await sendEmbed(
            interaction,
            "User Banned",
            `${targetUser.username} has been banned.\nReason: ${reason}`,
          );
        },
      );
    }

    if (modSettings.unbanCommand) {
      this.addCommand(
        new SlashCommandBuilder()
          .setName("unban")
          .setDescription("Unban a user from the server")
          .addStringOption((option) =>
            option
              .setName("userid")
              .setDescription("The ID of the user to unban")
              .setRequired(true),
          ),
        async (interaction) => {
          if (!isModeratorAllowed(interaction.member)) {
            return sendEmbed(
              interaction,
              "Permission Denied",
              "You do not have permission to use this command.",
              "#FF0000",
            );
          }
          const userId = interaction.options.getString("userid");
          await interaction.guild.members.unban(userId);
          await sendEmbed(
            interaction,
            "User Unbanned",
            `User with ID ${userId} has been unbanned.`,
          );
        },
      );
    }

    if (modSettings.muteCommand) {
      this.addCommand(
        new SlashCommandBuilder()
          .setName("mute")
          .setDescription("Mute a user in the server")
          .addUserOption((option) =>
            option
              .setName("user")
              .setDescription("The user to mute")
              .setRequired(true),
          )
          .addStringOption((option) =>
            option.setName("reason").setDescription("Reason for muting"),
          ),
        async (interaction) => {
          if (!isModeratorAllowed(interaction.member)) {
            return sendEmbed(
              interaction,
              "Permission Denied",
              "You do not have permission to use this command.",
              "#FF0000",
            );
          }
          const targetUser = interaction.options.getUser("user");
          const reason =
            interaction.options.getString("reason") || "No reason provided";
          const muteRole = interaction.guild.roles.cache.find(
            (role) => role.name === "Muted",
          );
          if (!muteRole) {
            return sendEmbed(
              interaction,
              "Error",
              "Muted role not found. Please create a 'Muted' role.",
              "#FF0000",
            );
          }
          const member = await interaction.guild.members.fetch(targetUser.id);
          await member.roles.add(muteRole);
          await sendEmbed(
            interaction,
            "User Muted",
            `${targetUser.username} has been muted.\nReason: ${reason}`,
          );
        },
      );
    }

    if (modSettings.unmuteCommand) {
      this.addCommand(
        new SlashCommandBuilder()
          .setName("unmute")
          .setDescription("Unmute a user in the server")
          .addUserOption((option) =>
            option
              .setName("user")
              .setDescription("The user to unmute")
              .setRequired(true),
          ),
        async (interaction) => {
          if (!isModeratorAllowed(interaction.member)) {
            return sendEmbed(
              interaction,
              "Permission Denied",
              "You do not have permission to use this command.",
              "#FF0000",
            );
          }
          const targetUser = interaction.options.getUser("user");
          const muteRole = interaction.guild.roles.cache.find(
            (role) => role.name === "Muted",
          );
          if (!muteRole) {
            return sendEmbed(
              interaction,
              "Error",
              "Muted role not found.",
              "#FF0000",
            );
          }
          const member = await interaction.guild.members.fetch(targetUser.id);
          await member.roles.remove(muteRole);
          await sendEmbed(
            interaction,
            "User Unmuted",
            `${targetUser.username} has been unmuted.`,
          );
        },
      );
    }

    if (modSettings.timeoutCommand) {
      this.addCommand(
        new SlashCommandBuilder()
          .setName("timeout")
          .setDescription("Timeout a user in the server")
          .addUserOption((option) =>
            option
              .setName("user")
              .setDescription("The user to timeout")
              .setRequired(true),
          )
          .addIntegerOption((option) =>
            option
              .setName("duration")
              .setDescription("Timeout duration in minutes")
              .setRequired(true),
          )
          .addStringOption((option) =>
            option.setName("reason").setDescription("Reason for timeout"),
          ),
        async (interaction) => {
          if (!isModeratorAllowed(interaction.member)) {
            return sendEmbed(
              interaction,
              "Permission Denied",
              "You do not have permission to use this command.",
              "#FF0000",
            );
          }
          const targetUser = interaction.options.getUser("user");
          const duration = interaction.options.getInteger("duration");
          const reason =
            interaction.options.getString("reason") || "No reason provided";
          const member = await interaction.guild.members.fetch(targetUser.id);
          await member.timeout(duration * 60 * 1000, reason);
          await sendEmbed(
            interaction,
            "User Timed Out",
            `${targetUser.username} has been timed out for ${duration} minutes.\nReason: ${reason}`,
          );
        },
      );
    }

    if (modSettings.untimeoutCommand) {
      this.addCommand(
        new SlashCommandBuilder()
          .setName("untimeout")
          .setDescription("Remove timeout from a user in the server")
          .addUserOption((option) =>
            option
              .setName("user")
              .setDescription("The user to remove timeout from")
              .setRequired(true),
          ),
        async (interaction) => {
          if (!isModeratorAllowed(interaction.member)) {
            return sendEmbed(
              interaction,
              "Permission Denied",
              "You do not have permission to use this command.",
              "#FF0000",
            );
          }
          const targetUser = interaction.options.getUser("user");
          const member = await interaction.guild.members.fetch(targetUser.id);
          await member.timeout(null);
          await sendEmbed(
            interaction,
            "Timeout Removed",
            `Timeout has been removed for ${targetUser.username}.`,
          );
        },
      );
    }

    if (modSettings.lockCommand) {
      this.addCommand(
        new SlashCommandBuilder()
          .setName("lock")
          .setDescription("Lock a channel")
          .addChannelOption((option) =>
            option
              .setName("channel")
              .setDescription("The channel to lock")
              .setRequired(true),
          ),
        async (interaction) => {
          if (!isModeratorAllowed(interaction.member)) {
            return sendEmbed(
              interaction,
              "Permission Denied",
              "You do not have permission to use this command.",
              "#FF0000",
            );
          }
          const channel = interaction.options.getChannel("channel");
          await channel.permissionOverwrites.edit(
            interaction.guild.roles.everyone,
            { SendMessages: false },
          );
          await sendEmbed(
            interaction,
            "Channel Locked",
            `${channel} has been locked.`,
          );
        },
      );
    }

    if (modSettings.unlockCommand) {
      this.addCommand(
        new SlashCommandBuilder()
          .setName("unlock")
          .setDescription("Unlock a channel")
          .addChannelOption((option) =>
            option
              .setName("channel")
              .setDescription("The channel to unlock")
              .setRequired(true),
          ),
        async (interaction) => {
          if (!isModeratorAllowed(interaction.member)) {
            return sendEmbed(
              interaction,
              "Permission Denied",
              "You do not have permission to use this command.",
              "#FF0000",
            );
          }
          const channel = interaction.options.getChannel("channel");
          await channel.permissionOverwrites.edit(
            interaction.guild.roles.everyone,
            { SendMessages: null },
          );
          await sendEmbed(
            interaction,
            "Channel Unlocked",
            `${channel} has been unlocked.`,
          );
        },
      );
    }

    if (modSettings.slowmodeCommand) {
      this.addCommand(
        new SlashCommandBuilder()
          .setName("slowmode")
          .setDescription("Set slowmode for a channel")
          .addChannelOption((option) =>
            option
              .setName("channel")
              .setDescription("The channel to set slowmode for")
              .setRequired(true),
          )
          .addIntegerOption((option) =>
            option
              .setName("seconds")
              .setDescription("Slowmode duration in seconds")
              .setRequired(true),
          ),
        async (interaction) => {
          if (!isModeratorAllowed(interaction.member)) {
            return sendEmbed(
              interaction,
              "Permission Denied",
              "You do not have permission to use this command.",
              "#FF0000",
            );
          }
          const channel = interaction.options.getChannel("channel");
          const seconds = interaction.options.getInteger("seconds");
          await channel.setRateLimitPerUser(seconds);
          await sendEmbed(
            interaction,
            "Slowmode Set",
            `Slowmode in ${channel} has been set to ${seconds} seconds.`,
          );
        },
      );
    }

    if (modSettings.clearCommand) {
      this.addCommand(
        new SlashCommandBuilder()
          .setName("clear")
          .setDescription("Clear messages in a channel")
          .addIntegerOption((option) =>
            option
              .setName("amount")
              .setDescription("Number of messages to clear")
              .setRequired(true),
          ),
        async (interaction) => {
          if (!isModeratorAllowed(interaction.member)) {
            return sendEmbed(
              interaction,
              "Permission Denied",
              "You do not have permission to use this command.",
              "#FF0000",
            );
          }
          const amount = interaction.options.getInteger("amount");
          const channel = interaction.channel;
          const messages = await channel.bulkDelete(amount, true);
          await sendEmbed(
            interaction,
            "Messages Cleared",
            `Successfully cleared ${messages.size} messages.`,
          );
        },
      );
    }

    this.deployCommands();
  }

  calculatePoints(logs) {
    if (!Array.isArray(logs) || logs.length === 0) {
      return {};
    }

    const userPoints = {};
    const voiceJoinTimes = {};
    const messageMultiplier = 5; // Multiplier for message points
    const voiceMultiplier = 2; // Multiplier for voice points

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
