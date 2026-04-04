# AutoGrade Backend — EC2 Deployment Guide

> Use this guide only if you're moving the backend from Render to AWS EC2.
> If you're staying on Render, you only need to set the env vars in the Render Dashboard.

---

## AWS Setup Checklist

### 1. S3 Bucket
1. Go to **AWS S3 → Create bucket**
2. Name: `autograde-uploads` (or your choice)
3. Region: `us-east-2` (match your RDS)
4. **Block all public access** ✅ (files served via backend proxy, not direct S3 URLs)
5. Leave all other settings as default → Create

### 2. IAM User for S3 Access
1. Go to **IAM → Users → Create user**
2. Name: `autograde-backend`
3. Attach policy: Create a new inline policy with:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::autograde-uploads/*"
    }
  ]
}
```
4. After creating user → **Security credentials → Create access key**
5. Copy `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`

### 3. EC2 Instance
1. Launch an **Ubuntu 24.04 LTS** instance (`t2.micro` for free tier / `t3.small` for better grading)
2. Storage: 20GB gp3
3. Security Group inbound rules:
   | Port | Protocol | Source | Purpose |
   |------|----------|--------|---------|
   | 22   | TCP | Your IP only | SSH |
   | 3001 | TCP | 0.0.0.0/0 | Backend API |
4. Note the **Public IPv4 DNS** — you'll use this as the backend URL

---

## EC2 Server Setup (Ubuntu 24.04)

SSH into your instance, then run:

```bash
# 1. Update system
sudo apt-get update && sudo apt-get upgrade -y

# 2. Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Install Docker (for grading)
sudo apt-get install -y docker.io
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker $USER   # allow current user to run docker
newgrp docker                   # apply group change without logout

# 4. Install PM2 (keeps backend alive after logout)
sudo npm install -g pm2

# 5. Clone the repo
git clone https://github.com/Prabin-Giri/Capstone.git
cd Capstone/server

# 6. Install dependencies
npm install

# 7. Set environment variables
cp .env.example .env
nano .env   # fill in all values (DB, S3, etc.)
# Set GRADER_RUN_MODE=docker (Docker is available on EC2)

# 8. Start the backend with PM2
pm2 start index.js --name autograde-backend
pm2 save        # auto-restart on reboot
pm2 startup     # follow the printed command to enable on boot
```

## Updating the Backend

```bash
cd ~/Capstone
git pull origin main
cd server && npm install
pm2 restart autograde-backend
```

## Useful PM2 Commands

```bash
pm2 logs autograde-backend      # view live logs
pm2 status                      # check if running
pm2 restart autograde-backend   # restart
pm2 stop autograde-backend      # stop
```

## Vercel Frontend Config

In your **Vercel project settings → Environment Variables**, set:
```
VITE_API_URL = http://<EC2-PUBLIC-DNS>:3001/api
```

Or better, put the EC2 behind a domain and use HTTPS.

---

## Summary of Env Vars for EC2

```env
DB_HOST=autograde-db.<id>.us-east-2.rds.amazonaws.com
DB_PORT=3306
DB_USER=admin
DB_PASSWORD=your-db-password
DB_NAME=autograde-db
DB_SSL_VERIFY=false

AWS_REGION=us-east-2
AWS_S3_BUCKET=autograde-uploads
AWS_ACCESS_KEY_ID=AKIAxxxxx
AWS_SECRET_ACCESS_KEY=xxxxxx

GRADER_RUN_MODE=docker   # Docker available on EC2
PORT=3001
FRONTEND_ORIGIN=https://your-frontend.vercel.app
```
