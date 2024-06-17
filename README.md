# Multi-Purpose Open Source Discord Bot

This is a multi-purpose Discord bot built using Node.js with the discord.js library. It provides a simple web dashboard along with various bot functionalities.

## Features

- **Web Dashboard**: Includes a basic web server to host a dashboard.
- **Page Navigation**: Navigate between different pages on the web dashboard.
- **Bot Status Management**: Change the Discord bot's status directly from the dashboard.

## Prerequisites

- Node.js installed on your machine
- Discord bot token

## Installation

1. Clone the repository:

   ```bash
   git clone https://git.timmygstudios.com/tommys-stuff/os-discord-bot.git
    ```
2. Install the dependencies:

   ```bash
   npm install
   ```
3. Configure the bot

   * Rename `config.example.json` to `config.json`
    * Fill in the required fields in `config.json`
4. Start the bot:

   ```bash
   npm start
   ```
5. Visit `http://localhost:3000` in your browser to access the dashboard.

## Technologies Used:

- **Backend Technologies:**
  - Node.js
  - npm
  - Express

- **Discord Bot Development:**
  - [discord.js](https://discord.js.org/docs)

- **Frontend Technologies:**
  - [Franken UI](https://www.franken-ui.dev/)
  - jQuery

- **Authentication:**
  - Passport.js

## Contributing
Contributions to this project are encouraged and appreciated. Please feel free to submit pull requests or open issues if you encounter any problems or have suggestions for improvements.

## License
This project is open source and available under the [MIT License](LICENSE).
