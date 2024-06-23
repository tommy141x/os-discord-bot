FROM node:alpine

# Set the working directory
WORKDIR /app

# Copy the package.json and optionally the pnpm-lock.yaml files
COPY package.json ./
COPY pnpm-lock.yaml* ./  # Use wildcard to handle potential absence

# Install pnpm globally
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install

# Copy the rest of the application
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["pnpm", "start"]
