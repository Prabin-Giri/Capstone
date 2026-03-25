FROM node:20

WORKDIR /app

# Copy package files from root directory
COPY package*.json ./

RUN npm install

# Copy all frontend files
COPY . .

EXPOSE 5173

# Run vite dev server with host flag to allow access from container
CMD ["npm", "run", "dev:frontend", "--", "--host"]
