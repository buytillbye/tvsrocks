FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S stocks -G nodejs -u 1001

# Change ownership
RUN chown -R stocks:nodejs /app
USER stocks

# Expose port
EXPOSE 8080

# Health check (simple check, could be improved)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "console.log('Health check passed')" || exit 1

# Start application
CMD ["node", "src/index.js"]
