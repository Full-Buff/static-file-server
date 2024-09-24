# Use Node.js LTS version
FROM node:16

# Create app directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy application source code
COPY app.js ./
COPY views ./views
COPY public ./public

# Expose port
EXPOSE 8080

# Start the app
CMD ["node", "app.js"]
