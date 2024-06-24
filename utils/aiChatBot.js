const axios = require("axios");
const cheerio = require("cheerio");
const OpenAI = require("openai");
const config = require("../config.json");
const db = require("./db.js");

class AIChatBot {
  constructor(client) {
    this.client = client;
    this.aiType = config.aiType;
    this.model = config.aiModel;
    this.settings = db.get("settings").aiSettings;
    this.personality = "";
    this.isInitialized = false;

    if (this.aiType === "openai" && config.openAIToken) {
      this.openai = new OpenAI({
        apiKey: config.openAIToken,
      });
    } else if (this.aiType === "claude" && config.claudeApiKey) {
      this.claudeApiKey = config.claudeApiKey;
    }
  }

  async initialize() {
    if (!this.settings.enabled || !this.aiType || !this.model) {
      console.log("AI ChatBot is not enabled or not properly configured.");
      return;
    }
    await this.loadPersonality();
    this.isInitialized = true;
    console.log("AI ChatBot initialized successfully.");
  }

  async loadPersonality() {
    this.personality = this.settings.personality;
    this.personality +=
      "\nYou can use placeholders in your responses! You can use {mention} to ping the user who triggered you, {username} to get their username, or just {name} to get their name without pinging them. You can also use {servername} to get the name of the server you are in and represent.";
    const date = new Date();
    const options = {
      year: "numeric", // 'numeric'
      month: "long", // 'short', 'long', or 'numeric'
      day: "numeric", // 'numeric'
      timeZone: "America/New_York", // EST timezone
    };
    const formattedDate = date.toLocaleString("en-US", options);
    this.personality += `\nThe date is ${formattedDate} EST, you have access to the internet. Here is some information from the internet you can use to answer questions:`;
    for (const url of this.settings.dataFetchs) {
      try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        $("script").remove();

        // Extract text content using Cheerio
        const textContent = $("body").text().trim();

        // Append to personality with source URL
        this.personality += `\n\nSource of information: ${url}\n\n${textContent}`;
      } catch (error) {
        console.error(`Error fetching data from ${url}:`, error);
      }
    }
  }

  shouldRespond(message) {
    if (!this.isInitialized || !this.settings.enabled) return false;
    if (this.settings.ignoredChannels.includes(message.channel.id))
      return false;
    const containsTriggerWord = this.settings.triggerWords.some((word) =>
      message.content.toLowerCase().includes(word.toLowerCase()),
    );
    return containsTriggerWord;
  }

  async generateResponse(message) {
    let response;
    // Start fake typing
    message.channel.sendTyping();
    if (this.aiType === "openai") {
      response = await this.generateOpenAIResponse(message);
    } else if (this.aiType === "claude") {
      response = await this.generateClaudeResponse(message);
    } else {
      throw new Error("Unsupported AI type");
    }
    return response;
  }

  async generateOpenAIResponse(message) {
    try {
      const completion = await this.openai.chat.completions.create({
        messages: [
          { role: "system", content: this.personality },
          { role: "user", content: message.content },
        ],
        model: this.model,
      });
      return completion.choices[0].message.content.trim();
    } catch (error) {
      console.error("Error generating OpenAI response:", error);
      return "Sorry, I encountered an error while processing your request.";
    }
  }

  async generateClaudeResponse(message) {
    const prompt = `${this.personality}\n\nHuman: ${message.content}\n\nAssistant:`;
    try {
      const response = await axios.post(
        "https://api.anthropic.com/v1/complete",
        {
          prompt: prompt,
          model: this.model,
          max_tokens_to_sample: 150,
          stop_sequences: ["\n\nHuman:"],
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.claudeApiKey}`,
          },
        },
      );
      return response.data.completion.trim();
    } catch (error) {
      console.error("Error generating Claude response:", error);
      return "Sorry, I encountered an error while processing your request.";
    }
  }

  async reset() {
    this.settings = db.get("settings").aiSettings;
    if (!this.isInitialized) {
      this.initialize();
    } else if (this.settings.enabled) {
      await this.loadPersonality();
      console.log("AI ChatBot has been reset with new settings.");
    } else {
      this.isInitialized = false;
      console.log("AI ChatBot has been disabled.");
    }
  }
}

module.exports = AIChatBot;
