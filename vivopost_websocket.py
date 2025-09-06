from flask import Flask, request, jsonify, render_template_string
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from datetime import datetime
import uuid
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes
socketio = SocketIO(app, cors_allowed_origins="*", logger=True, engineio_logger=True)

# Store pending messages (backup in case client disconnects)
pending_messages = []
connected_clients = set()

@app.route('/webhook', methods=['POST'])
def webhook():
    """Receive messages from Firebase and push to Chrome extension immediately"""
    data = request.get_json()
    text = data.get('text', '')
    
    if text:
        message = {
            'id': str(uuid.uuid4()),
            'text': text,
            'timestamp': datetime.now().isoformat(),
            'posted': False
        }
        
        # Store for backup
        pending_messages.insert(0, message)
        if len(pending_messages) > 20:
            pending_messages.pop()
        
        logger.info(f"📩 New message received: {text[:50]}...")
        
        # Push to all connected Chrome extensions immediately
        socketio.emit('new_message', message, namespace='/')
        logger.info(f"🚀 Pushed message to {len(connected_clients)} connected clients")
        
        return jsonify({'status': 'success', 'id': message['id']})
    
    return jsonify({'status': 'error', 'message': 'No text provided'}), 400

@socketio.on('connect')
def handle_connect():
    """Handle new Chrome extension connection"""
    client_id = request.sid
    connected_clients.add(client_id)
    logger.info(f"✅ Chrome extension connected: {client_id} (Total: {len(connected_clients)})")
    
    # Send any pending messages to newly connected client
    unposted = [msg for msg in pending_messages if not msg['posted']]
    if unposted:
        logger.info(f"📤 Sending {len(unposted)} pending messages to new client")
        for msg in unposted:
            emit('new_message', msg)

@socketio.on('disconnect')
def handle_disconnect():
    """Handle Chrome extension disconnection"""
    client_id = request.sid
    connected_clients.discard(client_id)
    logger.info(f"❌ Chrome extension disconnected: {client_id} (Remaining: {len(connected_clients)})")

@socketio.on('message_posted')
def handle_message_posted(data):
    """Chrome extension confirms message was posted"""
    message_id = data.get('id')
    
    for msg in pending_messages:
        if msg['id'] == message_id:
            msg['posted'] = True
            logger.info(f"✅ Message confirmed posted: {msg['text'][:50]}...")
            break
    
    return {'status': 'success'}

@app.route('/status')
def status():
    """API endpoint to check server status"""
    unposted_count = len([msg for msg in pending_messages if not msg['posted']])
    return jsonify({
        'status': 'online',
        'connected_clients': len(connected_clients),
        'pending_count': unposted_count,
        'total_messages': len(pending_messages)
    })

@app.route('/')
def dashboard():
    """Simple dashboard with WebSocket status"""
    unposted = [msg for msg in pending_messages if not msg['posted']]
    
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>QRCall Workvivo Bot</title>
        <meta http-equiv="refresh" content="5">
        <style>
            body { font-family: Arial, sans-serif; padding: 20px; background: #f0f0f0; }
            .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; }
            .status { padding: 10px; background: #e8f5e9; border-radius: 5px; margin-bottom: 20px; }
            .pending { background: #fff3e0; }
            .posted { background: #e8f5e9; }
            .message { padding: 10px; margin: 10px 0; border-radius: 5px; }
            h1 { color: #333; }
            .stats { display: flex; gap: 20px; margin: 20px 0; }
            .stat { padding: 15px; background: #f5f5f5; border-radius: 5px; flex: 1; text-align: center; }
            .stat-value { font-size: 24px; font-weight: bold; color: #2196f3; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🤖 QRCall Workvivo Bot Server</h1>
            
            <div class="status">
                <strong>WebSocket Status:</strong> 
                <span style="color: green;">● Online</span> | 
                <strong>Connected Extensions:</strong> {{ connected_count }} |
                <strong>Mode:</strong> Push (No Polling!)
            </div>
            
            <div class="stats">
                <div class="stat">
                    <div class="stat-value">{{ pending_count }}</div>
                    <div>Pending Messages</div>
                </div>
                <div class="stat">
                    <div class="stat-value">{{ total_count }}</div>
                    <div>Total Messages</div>
                </div>
                <div class="stat">
                    <div class="stat-value">{{ connected_count }}</div>
                    <div>Connected Clients</div>
                </div>
            </div>
            
            <h2>Recent Messages</h2>
            <div class="messages">
                {% for msg in messages %}
                <div class="message {{ 'posted' if msg.posted else 'pending' }}">
                    <strong>{{ '✅ Posted' if msg.posted else '⏳ Pending' }}</strong> - 
                    {{ msg.text }} 
                    <small>({{ msg.timestamp }})</small>
                </div>
                {% endfor %}
            </div>
            
            <hr>
            <small>Auto-refreshes every 5 seconds | WebSocket Port: 5002</small>
        </div>
    </body>
    </html>
    """
    
    from flask import render_template_string
    return render_template_string(html, 
        messages=pending_messages[:10],
        pending_count=len(unposted),
        total_count=len(pending_messages),
        connected_count=len(connected_clients)
    )

@app.route('/test_webhook', methods=['GET'])
def test_webhook():
    """Test endpoint to simulate a Firebase webhook"""
    import requests
    test_message = f"Test message at {datetime.now().strftime('%H:%M:%S')}"
    
    response = requests.post('http://localhost:5002/webhook', 
                            json={'text': test_message})
    
    return jsonify({
        'test_message': test_message,
        'response': response.json() if response.ok else response.text
    })

if __name__ == "__main__":
    print("=" * 60)
    print("🔔 QRCall Workvivo Bot Server (WebSocket Version)")
    print("=" * 60)
    print("✨ NEW: Using WebSockets - No more polling!")
    print("📊 Dashboard: http://34.45.52.250:5002")
    print("🔌 WebSocket: ws://34.45.52.250:5002")
    print("🔗 Install updated Chrome extension from chrome_extension/ folder")
    print("=" * 60)
    print("📝 Logs:")
    print("-" * 60)
    
    socketio.run(app, host='0.0.0.0', port=5002, debug=False)