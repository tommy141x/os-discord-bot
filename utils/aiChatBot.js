const axios = require("axios");
const cheerio = require("cheerio");
const OpenAI = require("openai");
const unirest = require("unirest");
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
      "\nYou can use placeholders in your responses! You can use {mention} to ping the user who triggered you, {username} to get their username, or just {name} (preferred) to get their name without pinging them. You can also use {servername} to get the name of the server you are in and represent. If a user says @You they are mentioning you.";
    const date = new Date();
    const options = {
      year: "numeric", // 'numeric'
      month: "long", // 'short', 'long', or 'numeric'
      day: "numeric", // 'numeric'
      timeZone: "America/New_York", // EST timezone
    };
    const formattedDate = date.toLocaleString("en-US", options);
    this.personality += `\nThe date is ${formattedDate} EST, you have access to the internet.`;
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

  async searchGoogle(query) {
    try {
      const url =
        "https://www.google.com/search?q=" + encodeURIComponent(query);
      const headers = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        DNT: "1",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
      };
      const response = await unirest.get(url).headers(headers);

      const $ = cheerio.load(response.body);

      let results = [];

      // Extract main search results
      $("div.g").each((i, element) => {
        if (results.length > 5) return false;
        const titleElement = $(element).find("h3");
        const linkElement = $(element).find("a");

        // Try different selectors for the snippet
        let snippetElement = $(element).find(
          'div[style="-webkit-line-clamp:2"]',
        );
        if (snippetElement.length === 0) {
          snippetElement = $(element).find("div.VwiC3b");
        }
        if (snippetElement.length === 0) {
          snippetElement = $(element).find("div.s");
        }

        if (titleElement.length > 0) {
          results.push({
            title: titleElement.text().trim(),
            snippet: snippetElement.text().trim(),
            link: linkElement.attr("href"),
          });
        }
      });

      // Extract featured snippet if available
      const featuredSnippet = $("div.xpdopen div.LGOjhe").text().trim();
      if (featuredSnippet) {
        results.unshift({ type: "featured snippet", content: featuredSnippet });
      }

      // Extract "People also ask" questions
      $("div.related-question-pair").each((i, element) => {
        const question = $(element).find("div.iDjcJe").text().trim();
        if (question) {
          results.push({
            type: "people also ask",
            question: question,
          });
        }
      });

      if (results.length === 0) {
        return [];
      } else {
        console.log(JSON.stringify(results, null, 2));
      }

      return results;
    } catch (e) {
      console.error("Error searching Google:", e);
      return [];
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
      let googleResults = null;
      if (this.settings.internet) {
        const googleCompletion = await this.openai.chat.completions.create({
          messages: [
            {
              role: "system",
              content: `You are an assistant that determines what to search if a given question or statement requires an internet search to answer.
                Always respond with a concise search query if an internet search would be helpful, or 'false' if it's not necessary.
                Never respond with anything else.`,
            },
            { role: "user", content: message.content },
          ],
          model: this.model,
        });

        const response =
          await googleCompletion.choices[0].message.content.trim();
        if (!response.startsWith("false")) {
          googleResults = await this.searchGoogle(response);
          if (googleResults.length === 0) {
            googleResults = null;
          }
        }
      }

      let systemMessage = this.personality;

      if (googleResults) {
        systemMessage += `\n\nI searched the internet for you and found this information: ${JSON.stringify(googleResults)}`;
      }

      let messages = [];
      if (message.previousMessage) {
        messages.push({
          role: "system",
          content: systemMessage,
        });
        messages.push({
          role: "user",
          content: message.previousMessage,
        });
      } else {
        messages.push({
          role: "system",
          content: systemMessage,
        });
      }
      if (message.repliedContent) {
        messages.push({
          role: "system",
          content: message.repliedContent,
        });
        messages.push({
          role: "user",
          content: message.content,
        });
      } else {
        messages.push({
          role: "user",
          content: message.content,
        });
      }

      const completion = await this.openai.chat.completions.create({
        messages: messages,
        model: this.model,
      });
      return completion.choices[0].message.content.trim();
    } catch (error) {
      console.error("Error generating OpenAI response:", error);
      return "Sorry, I encountered an error while processing your request.";
    }
  }

  async generateClaudeResponse(message) {
    try {
      let googleResults = null;
      if (this.settings.internet) {
        const searchPrompt = `Human: You are an assistant that determines what to search if a given question or statement requires an internet search to answer.
          Always respond with a concise search query if an internet search would be helpful, or 'false' if it's not necessary.
          Never respond with anything else.

  ${message.content}

  Assistant:`;

        const searchResponse = await axios.post(
          "https://api.anthropic.com/v1/complete",
          {
            prompt: searchPrompt,
            model: this.model,
            max_tokens_to_sample: 50,
            stop_sequences: ["\n\nHuman:"],
          },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.claudeApiKey}`,
            },
          },
        );

        const response = searchResponse.data.completion.trim();
        if (!response.startsWith("false")) {
          googleResults = await this.searchGoogle(response);
          if (googleResults.length === 0) {
            googleResults = null;
          }
        }
      }

      let systemMessage = this.personality;
      if (googleResults) {
        systemMessage += `\n\nI searched the internet for you and found this information: ${JSON.stringify(googleResults)}`;
      }

      let messages = [];
      if (message.previousMessage) {
        messages.push(`Assistant: ${systemMessage}`);
        messages.push(`Human: ${message.previousMessage}`);
      } else {
        messages.push(`Assistant: ${systemMessage}`);
      }

      if (message.repliedContent) {
        messages.push(`Assistant: ${message.repliedContent}`);
        messages.push(`Human: ${message.content}`);
      } else {
        messages.push(`Human: ${message.content}`);
      }

      messages.push(`Assistant:`);

      const prompt = messages.join("\n\n");

      const response = await axios.post(
        "https://api.anthropic.com/v1/complete",
        {
          prompt: prompt,
          model: this.model,
          max_tokens_to_sample: 1000,
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
