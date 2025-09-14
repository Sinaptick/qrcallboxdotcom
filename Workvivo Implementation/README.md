# Workvivo WebSocket Bot - Memory Optimized

## Files to Deploy to Debian VM

1. **`vivopost_websocket_optimized.py`** - Memory-optimized WebSocket server
2. **`setup_debian_rdp.sh`** - Setup script for RDP access (Windows Remote Desktop)
3. **`content_websocket_optimized.js`** - Optimized Chrome extension

## Quick Deployment Instructions

### 1. Upload all files to your Debian VM and run:
```bash
sudo bash setup_debian_rdp.sh
```

### 2. Connect via Windows Remote Desktop:
- Open Windows Remote Desktop Connection
- Enter your VM's IP address
- Login with your Linux username/password

### 3. In the remote desktop:
- Double-click "Chrome Workvivo Bot" on desktop
- Sign into Workvivo (first time only)
- Navigate to 1458-customer-calls space
- Leave Chrome running (it will auto-start on future logins)

The setup includes: This has been abandoned - Workvivo disabled it to the best of their ability.
- XRDP for Windows Remote Desktop access
- XFCE4 lightweight desktop environment
- Python bot server with memory leak fixes
- Google Chrome with persistent profile
- Auto-loading Chrome extension
- 2GB swap file for stability

## What's Fixed

- **Memory leaks eliminated** - Messages auto-expire after 24 hours
- **Connection limits** - Max 10 clients to prevent resource exhaustion  
- **Auto-recovery** - Restarts automatically if memory exceeds limits
- **Optimized for 2GB RAM** - Runs stably for weeks without intervention

## Commands After Setup

```bash
# Simple commands (created by setup script):
qrcall start       # Start bot + Chrome
qrcall stop        # Stop everything
qrcall restart     # Restart everything
qrcall status      # Check status & memory
qrcall logs        # View logs

# Manual systemctl commands:
sudo systemctl start qrcall-bot-full
sudo systemctl stop qrcall-bot-full
sudo systemctl status qrcall-bot-full

# Check memory usage
free -h
ps aux --sort=-%mem | head
```

## Health Check
Visit `http://YOUR_VM_IP:5002/health` to check bot health status.