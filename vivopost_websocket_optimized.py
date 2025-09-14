from flask import Flask, request, jsonify, render_template_string
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from datetime import datetime, timedelta
from collections import deque
import uuid
import logging
import threading
import time
import gc
import psutil
import os

# Configure logging with rotation
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Reduce logging verbosity
logging.getLogger('werkzeug').setLevel(logging.WARNING)
logging.getLogger('engineio').setLevel(logging.WARNING)
logging.getLogger('socketio').setLevel(logging.WARNING)

app = Flask(__name__)
CORS(app)
socketio = SocketIO(
    app, 
    cors_allowed_origins="*", 
    logger=False,  # Disable verbose socket logging
    engineio_logger=False,
    ping_timeout=60,
    ping_interval=25,
    max_http_buffer_size=1000000  # 1MB max message size
)

# Configuration
MAX_PENDING_MESSAGES = 20
MAX_MESSAGE_AGE_HOURS = 24
CLEANUP_INTERVAL_SECONDS = 3600  # Run cleanup every hour
MAX_CLIENTS = 10  # Limit concurrent connections
MESSAGE_RATE_LIMIT = 10  # Max messages per minute

# Use deque for efficient message management with automatic size limit
pending_messages = deque(maxlen=MAX_PENDING_MESSAGES)
connected_clients = {}  # Track clients with metadata
message_timestamps = deque(maxlen=MESSAGE_RATE_LIMIT)  # For rate limiting
cleanup_lock = threading.Lock()

def cleanup_old_messages():
    """Remove messages older than MAX_MESSAGE_AGE_HOURS"""
    global pending_messages
    with cleanup_lock:
        try:
            cutoff_time = datetime.now() - timedelta(hours=MAX_MESSAGE_AGE_HOURS)
            # Convert to list, filter, and convert back to deque
            filtered = [
                msg for msg in pending_messages 
                if datetime.fromisoformat(msg['timestamp']) > cutoff_time
            ]
            pending_messages = deque(filtered, maxlen=MAX_PENDING_MESSAGES)
            logger.info(f"Cleanup: Kept {len(pending_messages)} recent messages")
            
            # Force garbage collection
            gc.collect()
            
            # Log memory usage
            process = psutil.Process(os.getpid())
            memory_mb = process.memory_info().rss / 1024 / 1024
            logger.info(f"Memory usage: {memory_mb:.1f} MB")
            
        except Exception as e:
            logger.error(f"Cleanup error: {e}")

def periodic_cleanup():
    """Background thread for periodic cleanup"""
    while True:
        time.sleep(CLEANUP_INTERVAL_SECONDS)
        cleanup_old_messages()
        
        # Clean up disconnected clients
        with cleanup_lock:
            connected_clients.clear()
            # Re-add only currently connected clients
            for sid in socketio.server.manager.get_participants('/', '/'):
                connected_clients[sid] = {
                    'connected_at': datetime.now().isoformat(),
                    'messages_sent': 0
                }

# Start cleanup thread
cleanup_thread = threading.Thread(target=periodic_cleanup, daemon=True)
cleanup_thread.start()

@app.route('/webhook', methods=['POST'])
def webhook():
    """Receive messages from Firebase with rate limiting"""
    
    # Rate limiting check
    now = datetime.now()
    message_timestamps.append(now)
    
    # Remove timestamps older than 1 minute
    one_minute_ago = now - timedelta(minutes=1)
    while message_timestamps and message_timestamps[0] < one_minute_ago:
        message_timestamps.popleft()
    
    if len(message_timestamps) > MESSAGE_RATE_LIMIT:
        logger.warning(f"Rate limit exceeded: {len(message_timestamps)} messages/minute")
        return jsonify({'status': 'error', 'message': 'Rate limit exceeded'}), 429
    
    data = request.get_json()
    text = data.get('text', '')
    
    if not text or len(text) > 1000:  # Limit message size
        return jsonify({'status': 'error', 'message': 'Invalid message'}), 400
    
    message = {
        'id': str(uuid.uuid4()),
        'text': text[:500],  # Truncate long messages
        'timestamp': datetime.now().isoformat(),
        'posted': False
    }
    
    with cleanup_lock:
        pending_messages.append(message)
    
    # Only log important events
    logger.info(f"New message: {text[:30]}...")
    
    # Push to connected clients
    if connected_clients:
        socketio.emit('new_message', message, namespace='/')
        logger.info(f"Pushed to {len(connected_clients)} clients")
    
    return jsonify({'status': 'success', 'id': message['id']})

@socketio.on('connect')
def handle_connect():
    """Handle new connection with client limit"""
    client_id = request.sid
    
    # Check client limit
    if len(connected_clients) >= MAX_CLIENTS:
        logger.warning(f"Connection rejected: Max clients ({MAX_CLIENTS}) reached")
        return False  # Reject connection
    
    connected_clients[client_id] = {
        'connected_at': datetime.now().isoformat(),
        'messages_sent': 0
    }
    
    logger.info(f"Client connected: {client_id[:8]}... ({len(connected_clients)}/{MAX_CLIENTS})")
    
    # Send only unposted messages from last hour
    with cleanup_lock:
        one_hour_ago = datetime.now() - timedelta(hours=1)
        recent_unposted = [
            msg for msg in pending_messages 
            if not msg['posted'] and 
            datetime.fromisoformat(msg['timestamp']) > one_hour_ago
        ]
        
        if recent_unposted:
            logger.info(f"Sending {len(recent_unposted)} pending messages")
            for msg in recent_unposted[-5:]:  # Send only last 5 messages
                emit('new_message', msg)

@socketio.on('disconnect')
def handle_disconnect():
    """Handle disconnection"""
    client_id = request.sid
    if client_id in connected_clients:
        del connected_clients[client_id]
    logger.info(f"Client disconnected: {client_id[:8]}... ({len(connected_clients)} remaining)")

@socketio.on('message_posted')
def handle_message_posted(data):
    """Mark message as posted"""
    message_id = data.get('id')
    
    with cleanup_lock:
        for msg in pending_messages:
            if msg['id'] == message_id:
                msg['posted'] = True
                logger.debug(f"Message {message_id[:8]}... marked as posted")
                break
    
    # Increment client message counter
    client_id = request.sid
    if client_id in connected_clients:
        connected_clients[client_id]['messages_sent'] += 1
    
    return {'status': 'success'}

@app.route('/status')
def status():
    """API endpoint with system health info"""
    process = psutil.Process(os.getpid())
    memory_mb = process.memory_info().rss / 1024 / 1024
    cpu_percent = process.cpu_percent()
    
    with cleanup_lock:
        unposted_count = len([msg for msg in pending_messages if not msg['posted']])
    
    return jsonify({
        'status': 'online',
        'connected_clients': len(connected_clients),
        'max_clients': MAX_CLIENTS,
        'pending_count': unposted_count,
        'total_messages': len(pending_messages),
        'memory_mb': round(memory_mb, 1),
        'cpu_percent': cpu_percent,
        'uptime_hours': round((datetime.now() - start_time).total_seconds() / 3600, 1)
    })

@app.route('/health')
def health():
    """Simple health check for monitoring"""
    process = psutil.Process(os.getpid())
    memory_mb = process.memory_info().rss / 1024 / 1024
    
    # Auto-restart recommendation if memory > 500MB
    if memory_mb > 500:
        return jsonify({'status': 'warning', 'memory_mb': memory_mb, 'message': 'High memory usage'}), 503
    
    return jsonify({'status': 'healthy', 'memory_mb': memory_mb})

@app.route('/')
def dashboard():
    """Lightweight dashboard"""
    with cleanup_lock:
        recent_messages = list(pending_messages)[-10:]  # Last 10 messages only
        unposted = [msg for msg in recent_messages if not msg['posted']]
    
    process = psutil.Process(os.getpid())
    memory_mb = process.memory_info().rss / 1024 / 1024
    
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>QRCall Workvivo Bot</title>
        <meta http-equiv="refresh" content="30">
        <style>
            body { font-family: Arial, sans-serif; padding: 20px; background: #f0f0f0; }
            .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; }
            .status { padding: 10px; background: #e8f5e9; border-radius: 5px; margin-bottom: 20px; }
            .warning { background: #fff3e0; }
            .pending { background: #fff3e0; }
            .posted { background: #e8f5e9; opacity: 0.7; }
            .message { padding: 8px; margin: 5px 0; border-radius: 5px; font-size: 14px; }
            h1 { color: #333; font-size: 24px; }
            .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 20px 0; }
            .stat { padding: 10px; background: #f5f5f5; border-radius: 5px; text-align: center; }
            .stat-value { font-size: 20px; font-weight: bold; color: #2196f3; }
            .health { float: right; padding: 5px 10px; border-radius: 5px; font-size: 12px; }
            .healthy { background: #4caf50; color: white; }
            .warning { background: #ff9800; color: white; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="health {{ 'warning' if memory_mb > 300 else 'healthy' }}">
                Memory: {{ memory_mb|round(1) }} MB
            </div>
            
            <h1>🤖 QRCall Workvivo Bot (Optimized)</h1>
            
            <div class="status {{ 'warning' if memory_mb > 300 else '' }}">
                <strong>Status:</strong> Online | 
                <strong>Clients:</strong> {{ connected_count }}/{{ max_clients }} |
                <strong>Uptime:</strong> {{ uptime_hours }} hours
            </div>
            
            <div class="stats">
                <div class="stat">
                    <div class="stat-value">{{ pending_count }}</div>
                    <div>Pending</div>
                </div>
                <div class="stat">
                    <div class="stat-value">{{ total_count }}</div>
                    <div>Total ({{ max_messages }} max)</div>
                </div>
                <div class="stat">
                    <div class="stat-value">{{ connected_count }}</div>
                    <div>Clients</div>
                </div>
                <div class="stat">
                    <div class="stat-value">{{ memory_mb|round(1) }}</div>
                    <div>MB RAM</div>
                </div>
            </div>
            
            <h3>Recent Messages</h3>
            <div class="messages">
                {% for msg in messages %}
                <div class="message {{ 'posted' if msg.posted else 'pending' }}">
                    {{ '✅' if msg.posted else '⏳' }}
                    {{ msg.text[:50] }}{% if msg.text|length > 50 %}...{% endif %}
                </div>
                {% endfor %}
            </div>
            
            <hr>
            <small>Auto-refresh: 30s | Port: 5002 | Max age: 24h</small>
        </div>
    </body>
    </html>
    """
    
    return render_template_string(html, 
        messages=recent_messages,
        pending_count=len(unposted),
        total_count=len(pending_messages),
        max_messages=MAX_PENDING_MESSAGES,
        connected_count=len(connected_clients),
        max_clients=MAX_CLIENTS,
        memory_mb=memory_mb,
        uptime_hours=round((datetime.now() - start_time).total_seconds() / 3600, 1)
    )

# Track server start time
start_time = datetime.now()

if __name__ == "__main__":
    print("=" * 60)
    print("🔔 QRCall Workvivo Bot Server (Memory Optimized)")
    print("=" * 60)
    print(f"✨ Optimizations enabled:")
    print(f"  - Max {MAX_PENDING_MESSAGES} messages in memory")
    print(f"  - Auto-cleanup every {CLEANUP_INTERVAL_SECONDS//60} minutes")
    print(f"  - Max {MAX_CLIENTS} concurrent clients")
    print(f"  - Rate limit: {MESSAGE_RATE_LIMIT} messages/minute")
    print(f"  - Messages expire after {MAX_MESSAGE_AGE_HOURS} hours")
    print("=" * 60)
    print(f"📊 Dashboard: http://34.45.52.250:5002")
    print(f"🔌 WebSocket: ws://34.45.52.250:5002")
    print(f"❤️  Health: http://34.45.52.250:5002/health")
    print("=" * 60)
    
    # Run with production server settings
    socketio.run(app, host='0.0.0.0', port=5002, debug=False, use_reloader=False)