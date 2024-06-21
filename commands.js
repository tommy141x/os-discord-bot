const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v9");
const config = require("./config.json");
const { SlashCommandBuilder } = require("@discordjs/builders");

class CommandHandler {
  constructor(client) {
    this.client = client;
    this.commands = [];
    this.registerCommands();
  }

  registerCommands() {
    this.addCommand(
      new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Replies with Pong!"),
      async (interaction) => {
        await interaction.reply("Pong!");
      },
    );

    this.addCommand(
      new SlashCommandBuilder()
        .setName("echo")
        .setDescription("Echoes your input")
        .addStringOption((option) =>
          option
            .setName("message")
            .setDescription("The message to echo")
            .setRequired(true),
        ),
      async (interaction) => {
        const message = interaction.options.getString("message");
        await interaction.reply(message);
      },
    );

    this.addCommand(
      new SlashCommandBuilder()
        .setName("roll")
        .setDescription("Rolls a dice")
        .addIntegerOption((option) =>
          option
            .setName("sides")
            .setDescription("Number of sides on the dice")
            .setRequired(false),
        ),
      async (interaction) => {
        const sides = interaction.options.getInteger("sides") || 6;
        const result = Math.floor(Math.random() * sides) + 1;
        await interaction.reply(`You rolled a ${result} (${sides}-sided die)`);
      },
    );

    this.deployCommands();
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
