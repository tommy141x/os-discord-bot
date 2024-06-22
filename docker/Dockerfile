FROM node:alpine

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Clone the repository
RUN apk add --no-cache git && \
    git clone https://git.timmygstudios.com/tommys-stuff/os-discord-bot.git . && \
    pnpm install

# Copy config and db from the host
COPY config.json /app/config.json
COPY db.json /app/db.json

# Expose port 3000
EXPOSE 3000

# Start the application
CMD ["pnpm", "start"]
