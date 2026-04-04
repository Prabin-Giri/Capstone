FROM node:20

# Install Java and Python runtimes
RUN apt-get update && apt-get install -y \
    openjdk-17-jdk \
    python3 \
    g++ \
    gcc \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files from server directory
COPY package*.json ./

RUN npm install

# Copy all server files
COPY . .

EXPOSE 3001

CMD ["node", "index.js"]
