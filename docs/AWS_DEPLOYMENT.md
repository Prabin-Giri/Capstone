# AWS Deployment Setup

This repo is set up for an AWS-first deployment path:

- Frontend: AWS Amplify Hosting
- Backend: AWS EC2 + PM2
- Database: AWS RDS MySQL
- File storage: AWS S3

## Goal

Every push to `main` can deploy automatically:

- Frontend auto-deploys through Amplify's GitHub integration
- Backend auto-deploys through GitHub Actions over SSH to EC2

## Frontend: Amplify Hosting

1. In AWS, open **Amplify Hosting**.
2. Choose **Deploy an app** and connect your GitHub repository.
3. Select the `main` branch.
4. Amplify will detect `amplify.yml`.
5. Add frontend environment variables in Amplify:

```env
VITE_API_URL=https://<your-backend-domain>/api
VITE_APP_NAME=Autograder
VITE_ENV=production
AUTO_SEED_SAMPLE_DATA=0
```

6. Save and deploy.

After that, every push to `main` will rebuild and redeploy the frontend.

## Backend: EC2 Auto Deploy

### EC2 prerequisites

Install and configure on the EC2 instance:

```bash
sudo apt-get update && sudo apt-get upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs docker.io
sudo npm install -g pm2

git clone https://github.com/Prabin-Giri/Capstone.git
cd ~/Capstone/server
npm ci
pm2 start ecosystem.config.cjs
pm2 save
```

Keep your production `.env` on the server at:

```text
~/Capstone/.env
```

### GitHub repository secrets

Add these GitHub Actions secrets in your repo settings:

- `EC2_HOST`: public IP or DNS of the EC2 instance
- `EC2_USER`: SSH user, usually `ubuntu`
- `EC2_SSH_KEY`: private key contents for the EC2 instance
- `EC2_APP_DIR`: optional, defaults to `$HOME/Capstone`
- `EC2_PM2_APP_NAME`: optional, defaults to `autograde-backend`

The workflow file is `.github/workflows/deploy-backend.yml`.

The remote deploy script is `server/scripts/deploy-ec2.sh`.

Once the secrets are added, every push to `main` that touches backend files will:

1. SSH into EC2
2. Pull latest `main`
3. Run `npm ci --omit=dev` in `server/`
4. Reload the backend with PM2

## Recommended production URLs

- Frontend: Amplify domain or custom domain
- Backend: EC2 behind Nginx + HTTPS, or an ALB + ACM certificate

Recommended production frontend env:

```env
VITE_API_URL=https://api.your-domain.com/api
```

Recommended production backend env:

```env
FRONTEND_ORIGIN=https://app.your-domain.com
PORT=3001
```

## Important note

AWS Amplify handles frontend auto deploys by itself after you connect GitHub.

The backend auto deploy is handled by GitHub Actions because EC2 does not automatically redeploy your app on git push by default.
