# PeerSmash - Secure P2P File Transfer

![PeerSmash Logo](static/images/peersmash-logo.png)

**PeerSmash** is a browser-based secure peer-to-peer file transfer application that enables direct file sharing without size restrictions or cloud storage. Using WebRTC technology, files transfer directly between browsers with no server intermediary for the actual file data.

**Current Version:** 1.0.0 (Free Tier)
**Last Updated:** 2025-05-12

## 📋 Table of Contents

- [About](#about)
- [VPS Deployment](#vps-deployment)
- [Features](#features)
- [Usage](#usage)
- [Technical Details](#technical-details)
- [Security](#security)
- [Browser Compatibility](#browser-compatibility)
- [Roadmap](#roadmap)
- [License](#license)

## 🔍 About

PeerSmash eliminates the middleman in file transfers. No more uploading to cloud services or sending large email attachments. Connect directly with the recipient and send files of any size (up to 2GB in free tier) quickly and securely.

### Key Benefits

- **Direct Transfer**: Files move directly from sender to receiver
- **No Size Limits**: Free tier supports files up to 2GB, premium tier has no size limit
- **No Cloud Storage**: Files never stored on our servers
- **Fast Transfers**: Limited only by your network connection
- **Secure**: Optional encryption for sensitive files
- **No Registration**: Generate temporary sharing links instantly

## 🖥️ VPS Deployment

### Prerequisites

- VPS with minimum 1GB RAM (2GB+ recommended)
- Ubuntu 20.04 LTS or later (other Linux distros should work but commands may differ)
- Node.js 14.x or later
- npm 6.x or later
- Git
- Nginx (optional, for reverse proxy)
- Domain name with SSL certificate (recommended for production)

### Step 1: System Preparation

```bash
# Update package lists
sudo apt update

# Install required system packages
sudo apt install -y curl git build-essential

# Install Node.js and npm
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version
npm --version
```

### Step 2: Clone and Setup PeerSmash

```bash
# Create directory for the application
mkdir -p /var/www/peersmash
cd /var/www/peersmash

# Clone the repository
git clone https://github.com/peersmash/peersmash.git .

# Install dependencies
npm install --production
```

### Step 3: Configure the Application

```bash
# Create environment configuration file
cp .env.example .env

# Edit configuration with your settings
nano .env
```

Important configuration options in .env:
```
PORT=3000                    # Application port
NODE_ENV=production          # Environment (development/production)
SIGNALING_PATH=/signal       # Path for WebSocket signaling
MAX_CONNECTIONS=100          # Maximum concurrent connections
SESSION_TIMEOUT=3600         # Session timeout in seconds
```

### Step 4: Setup Process Management (PM2)

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start PeerSmash with PM2
pm2 start server.js --name "peersmash"

# Setup auto-restart on system reboot
pm2 startup
pm2 save

# Monitor the application
pm2 monit
```

### Step 5: Setup Nginx as Reverse Proxy (Recommended)

```bash
# Install Nginx
sudo apt install -y nginx

# Install Certbot for SSL
sudo apt install -y certbot python3-certbot-nginx
```

Create Nginx configuration file:
```bash
sudo nano /etc/nginx/sites-available/peersmash
```

Add the following configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Redirect all HTTP requests to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-XSS-Protection "1; mode=block";
    add_header X-Content-Type-Options "nosniff";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload";

    # Static files cache
    location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
        root /var/www/peersmash/static;
        expires 30d;
    }

    # Forward requests to Node.js
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket signaling path
    location /signal {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the configuration and obtain SSL certificate:
```bash
# Enable site configuration
sudo ln -s /etc/nginx/sites-available/peersmash /etc/nginx/sites-enabled/

# Verify Nginx configuration
sudo nginx -t

# Obtain SSL certificate
sudo certbot --nginx -d your-domain.com

# Restart Nginx
sudo systemctl restart nginx
```

### Step 6: Firewall Configuration

```bash
# Allow SSH, HTTP, and HTTPS
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https

# Enable firewall
sudo ufw enable
```

### Step 7: Verify Deployment

1. Open your domain in a browser: `https://your-domain.com`
2. Verify that the PeerSmash application loads correctly
3. Test file transfers between two browser windows

### Additional VPS Management Tips

#### Monitoring and Logs

```bash
# View application logs
pm2 logs peersmash

# Monitor application
pm2 monit

# View Nginx access logs
sudo tail -f /var/nginx/access.log

# View Nginx error logs
sudo tail -f /var/nginx/error.log
```

#### Updates and Maintenance

```bash
# Update PeerSmash to latest version
cd /var/www/peersmash
git pull
npm install --production
pm2 restart peersmash

# System updates
sudo apt update
sudo apt upgrade
```

## ✨ Features

### Core Functionality

- **Peer-to-Peer Connection**: Direct browser-to-browser file transfer using WebRTC
- **Session Management**: Create and join sessions with unique IDs
- **Queue System**: Transfer multiple files in sequence
- **Transfer Progress**: Real-time progress tracking for each file
- **Error Recovery**: Automatic retry mechanism for failed chunks
- **Connection Management**: Automatic reconnection attempts on disconnection

### Security Features

- **End-to-End Encryption**: Optional AES-GCM encryption for sensitive files
- **No Server Storage**: Files transfer directly between peers, never stored on servers
- **Secure Signaling**: TLS-encrypted signaling channel
- **Key Management**: Client-side key generation and management

### User Experience

- **Drag & Drop**: Easy file selection via drag and drop
- **Multiple Files**: Send multiple files in a single session
- **File Queue**: Organized queue for multiple file transfers
- **Transfer Controls**: Pause, resume, and cancel transfers
- **Responsive Design**: Works on desktop and mobile browsers
- **Browser Notifications**: Get notified when transfers complete
- **Status Updates**: Clear status indicators for connection and transfers

### Free Tier Limitations

- **2GB File Size Limit**: Individual files limited to 2GB
- **Basic Encryption**: Standard encryption options available
- **Standard Transfer Speed**: No bandwidth priority

## 🚀 Usage

### Starting a Transfer (Sender)

1. Open PeerSmash in your browser
2. Click "Send Files" to create a new transfer session
3. Share the generated session ID with the recipient
4. Wait for recipient to connect
5. Drag files onto the drop area or click to select files
6. Monitor transfer progress in the queue

### Receiving Files (Receiver)

1. Open PeerSmash in your browser
2. Click "Receive Files"
3. Enter the session ID provided by the sender
4. Wait for connection to establish
5. Files will automatically download as they are received
6. Click "Save" on completed files to download them

## 🔧 Technical Details

### Architecture

PeerSmash uses a hybrid architecture:
- **Signaling Server**: Facilitates initial connection between peers
- **WebRTC**: Handles the direct peer-to-peer data transfer
- **Client-side Processing**: All file handling and encryption occurs in the browser

### Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **WebRTC**: For peer connection and data channels
- **Socket.io**: For signaling between peers
- **Web Crypto API**: For file encryption/decryption
- **Backend**: Node.js with Express
- **Containerization**: Docker support for easy deployment

### File Transfer Protocol

Files are transferred in chunks (64KB by default) with the following workflow:
1. File metadata exchanged (name, size, type)
2. File divided into chunks
3. Each chunk transmitted with sequence information
4. Receiving browser reassembles chunks
5. Completion verification

## 🔒 Security

### Encryption Process

When encryption is enabled:
1. AES-GCM 256-bit key is generated client-side
2. File is encrypted in chunks before transmission
3. Encryption key is transmitted via secured data channel
4. Receiving browser decrypts data upon receipt

### Privacy Considerations

- **No Data Storage**: Files are never stored on our servers
- **No Logging**: Transfer content is not logged or monitored
- **Session Expiry**: Session IDs expire after completion
- **Client-side Processing**: All sensitive operations happen in your browser

## 🌐 Browser Compatibility

PeerSmash works on all modern browsers that support WebRTC:

| Browser | Minimum Version |
|---------|----------------|
| Chrome  | 72+            |
| Firefox | 65+            |
| Edge    | 79+            |
| Safari  | 12.1+          |
| Opera   | 62+            |

Mobile browsers are supported on:
- iOS Safari 12.1+
- Android Chrome 72+
- Samsung Internet 9.2+

## 🗺️ Roadmap

Upcoming features planned for PeerSmash:

### Near-term
- User accounts and authentication
- Premium tier with unlimited file sizes
- Transfer history
- File compression options

### Medium-term
- Multiple concurrent transfers
- Folder transfers (maintain directory structure)
- Resumable transfers (resume after browser close)
- Advanced encryption options

### Long-term
- Web extension for easier access
- Mobile applications
- Self-hosted option for enterprises
- API for application integration

## 📄 License

PeerSmash is licensed under the MIT License.

```
MIT License

Copyright (c) 2025 PeerSmash

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

Made with ❤️ by [tejpratap512](https://github.com/tejpratap512)

© 2025 PeerSmash. All rights reserved.