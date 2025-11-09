# Deployment Guide

This guide covers deploying the Flight Email Classifier web application to production.

## Prerequisites

- Node.js 18+ LTS
- A server with SSH access (e.g., AWS EC2, DigitalOcean, etc.)
- Domain name (optional but recommended)
- Gmail API credentials

## Architecture Overview

- **Backend**: Express.js server on port 8000
- **Frontend**: Static files served by any web server or CDN
- **Database**: SQLite file stored on the backend server
- **Gmail API**: OAuth2 authentication

## Option 1: Deploy to a VPS (Ubuntu/Debian)

### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Install Nginx for reverse proxy
sudo apt install -y nginx

# Create application directory
sudo mkdir -p /var/www/gmail-tripit-web
sudo chown $USER:$USER /var/www/gmail-tripit-web
```

### 2. Deploy Backend

```bash
# Clone repository
cd /var/www/gmail-tripit-web
git clone https://github.com/TylerLeonhardt/gmail-tripit-web.git .

# Install and build backend
cd backend
npm install --production
npm run build

# Configure environment
cp .env.example .env
nano .env  # Edit with your values

# Start with PM2
pm2 start dist/server.js --name gmail-tripit-api
pm2 save
pm2 startup  # Follow the instructions to enable auto-start
```

### 3. Deploy Frontend

```bash
# Build frontend
cd ../frontend
npm install
npm run build

# Copy built files to Nginx directory
sudo mkdir -p /var/www/html/gmail-tripit-web
sudo cp -r dist/* /var/www/html/gmail-tripit-web/
```

### 4. Configure Nginx

Create `/etc/nginx/sites-available/gmail-tripit-web`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Frontend
    location / {
        root /var/www/html/gmail-tripit-web;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/gmail-tripit-web /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5. Enable HTTPS with Let's Encrypt (Optional but Recommended)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

### 6. Configure Firewall

```bash
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw enable
```

## Option 2: Deploy to Heroku

### Backend

1. Create a new Heroku app:
```bash
heroku create your-app-name-api
```

2. Add a `Procfile` to the backend directory:
```
web: node dist/server.js
```

3. Set environment variables:
```bash
heroku config:set NODE_ENV=production
heroku config:set PORT=8000
```

4. Deploy:
```bash
git subtree push --prefix backend heroku main
```

### Frontend

Deploy to Netlify, Vercel, or GitHub Pages:

**Netlify:**
```bash
npm install -g netlify-cli
cd frontend
npm run build
netlify deploy --prod --dir=dist
```

Update the API URL in your environment variables to point to your Heroku backend.

## Option 3: Deploy to AWS

### Backend (AWS Elastic Beanstalk or EC2)

1. Package the application:
```bash
cd backend
npm run build
zip -r application.zip dist node_modules package.json
```

2. Deploy to Elastic Beanstalk or upload to EC2

### Frontend (AWS S3 + CloudFront)

```bash
cd frontend
npm run build
aws s3 sync dist/ s3://your-bucket-name/
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

## Database Management

### Backup

```bash
# Create backup
sqlite3 data/emails.db ".backup 'backup-$(date +%Y%m%d).db'"

# Automated daily backup with cron
0 2 * * * cd /var/www/gmail-tripit-web && sqlite3 data/emails.db ".backup 'backups/backup-$(date +\%Y\%m\%d).db'"
```

### Restore

```bash
sqlite3 data/emails.db ".restore 'backup-20240101.db'"
```

## Monitoring

### PM2 Monitoring

```bash
pm2 monit
pm2 logs gmail-tripit-api
```

### Nginx Logs

```bash
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### Application Logs

Add logging to your backend:

```bash
pm2 logs gmail-tripit-api --lines 100
```

## Performance Optimization

### 1. Enable Gzip Compression in Nginx

Add to your Nginx config:

```nginx
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss application/rss+xml font/truetype font/opentype application/vnd.ms-fontobject image/svg+xml;
```

### 2. Enable Caching

```nginx
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

### 3. Database Optimization

```bash
# Optimize database
sqlite3 data/emails.db "VACUUM;"
```

## Security Checklist

- [ ] Enable HTTPS/SSL
- [ ] Set strong passwords for server access
- [ ] Keep Node.js and dependencies updated
- [ ] Configure firewall rules
- [ ] Set up regular backups
- [ ] Use environment variables for sensitive data
- [ ] Enable rate limiting on API endpoints
- [ ] Monitor logs for suspicious activity
- [ ] Use Gmail API OAuth2 with appropriate scopes

## Troubleshooting

### Backend won't start

```bash
# Check logs
pm2 logs gmail-tripit-api

# Restart
pm2 restart gmail-tripit-api

# Check port availability
sudo lsof -i :8000
```

### Frontend can't connect to backend

- Verify CORS settings in backend
- Check API URL in frontend environment variables
- Verify Nginx proxy configuration
- Check firewall rules

### Database issues

```bash
# Check database file permissions
ls -la data/emails.db

# Test database
sqlite3 data/emails.db "SELECT COUNT(*) FROM email_candidates;"
```

## Scaling Considerations

For high traffic:

1. **Backend**: Deploy multiple instances behind a load balancer
2. **Database**: Consider migrating to PostgreSQL or MySQL
3. **Frontend**: Use a CDN (CloudFlare, AWS CloudFront)
4. **Caching**: Implement Redis for session management

## Support

For issues or questions:
- Check the main README.md
- Review the spec.md for architecture details
- Open an issue on GitHub
