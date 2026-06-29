FROM mcr.microsoft.com/playwright:v1.61.1-jammy

# Install python3 and ffmpeg which are required by yt-dlp
RUN apt-get update && \
    apt-get install -y python3 ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# The postinstall script "playwright install chromium" will run, 
# but browsers are already in the base image, so it will be very fast.
RUN npm ci

COPY . .

# Ensure yt-dlp is executable
RUN chmod +x bin/yt-dlp

# Build TypeScript
RUN npm run build

# Set environment variables for Playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["npm", "start"]
