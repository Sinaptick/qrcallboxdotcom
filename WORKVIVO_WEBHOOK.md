# Workvivo Webhook Documentation

## Overview
The Workvivo webhook bot runs on a Windows VM and handles automated posting/integration between systems.

## VM Details
- **Project**: qrcallbox
- **Instance ID**: 1099076271473572870
- **Zone**: us-central1-c
- **Type**: Google Compute Engine (GCE) Instance

## Starting the Workvivo Webhook

### Prerequisites
1. Remote access to the Windows VM
2. Python 3 installed with virtual environment
3. Access to the bot directory

### Start Commands
Execute these commands in order:

```bash
# 1. Navigate to the bot directory
cd /path/to/workvivo/bot

# 2. Activate the Python virtual environment
source venv/bin/activate

# 3. Start the webhook bot
python3 vivopost_extension.py
```

### Stopping the Bot
- Press `Ctrl+C` in the terminal running the bot
- Or close the terminal window (if running in background)

## Troubleshooting

### VM Performance Issues
If the VM becomes laggy:
1. Check Task Manager for CPU/Memory usage
2. Review log files for excessive logging
3. Ensure the bot has proper delays between API calls
4. Consider implementing rate limiting

### Common Issues
- **Bot not starting**: Check virtual environment is activated
- **API errors**: Verify API credentials are valid
- **High CPU usage**: Add delays between polling cycles
- **Memory leaks**: Restart the bot periodically

### Log Monitoring
Monitor logs using Google Cloud Console:
- Project: qrcallbox
- Look for excessive ERROR or WARNING messages
- Check log volume to ensure it's not overwhelming the system

## Optimization Recommendations

### Rate Limiting
Add delays between API calls:
```python
import time
time.sleep(300)  # 5 minute delay between checks
```

### Log Rotation
Implement log rotation to prevent disk space issues:
```python
from logging.handlers import RotatingFileHandler

handler = RotatingFileHandler(
    'workvivo_bot.log',
    maxBytes=10485760,  # 10MB
    backupCount=5
)
```

### Error Handling
Implement exponential backoff for errors:
```python
delay = 60
for attempt in range(max_retries):
    try:
        # API call here
        break
    except Exception as e:
        time.sleep(delay)
        delay *= 2  # Double delay each retry
```

## Maintenance

### Regular Tasks
- **Weekly**: Check log files and clear if needed
- **Monthly**: Review VM performance metrics
- **Quarterly**: Update dependencies in virtual environment

### Updating Dependencies
```bash
source venv/bin/activate
pip install --upgrade -r requirements.txt
```

## Contact Information
For issues with the Workvivo webhook, check:
1. VM logs in Google Cloud Console
2. Local log files on the VM
3. API status for Workvivo service

---

Last Updated: September 2025
Bot Script: `vivopost_extension.py`
Virtual Environment: `venv/`