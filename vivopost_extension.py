from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime
import uuid

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Store pending messages
pending_messages = []

@app.route('/webhook', methods=['POST'])
def webhook():
    """Receive messages from Firebase"""
    data = request.get_json()
    text = data.get('text', '')
    
    if text:
        message = {
            'id': str(uuid.uuid4()),
            'text': text,
            'timestamp': datetime.now().isoformat(),
            'posted': False
        }
        
        pending_messages.insert(0, message)
        
        # Keep only last 20
        if len(pending_messages) > 20:
            pending_messages.pop()
        
        print(f"📩 New message queued: {text}")
        return jsonify({'status': 'success', 'id': message['id']})
    
    return jsonify({'status': 'error'}), 400

@app.route('/get_pending', methods=['GET'])
def get_pending():
    """Extension polls this to get new messages"""
    unposted = [msg for msg in pending_messages if not msg['posted']]
    return jsonify({'messages': unposted})

@app.route('/mark_posted', methods=['POST'])
def mark_posted():
    """Extension calls this after posting a message"""
    data = request.get_json()
    message_id = data.get('id')
    
    for msg in pending_messages:
        if msg['id'] == message_id:
            msg['posted'] = True
            print(f"✅ Message marked as posted: {msg['text'][:50]}...")
            break
    
    return jsonify({'status': 'success'})

@app.route('/status')
def status():
    unposted_count = len([msg for msg in pending_messages if not msg['posted']])
    return jsonify({
        'status': 'online',
        'pending_count': unposted_count,
        'total_messages': len(pending_messages)
    })

@app.route('/')
def dashboard():
    """Simple dashboard"""
    unposted = [msg for msg in pending_messages if not msg['posted']]
    html = f"""
    <h1>QRCall Workvivo Bot</h1>
    <p><strong>{len(unposted)}</strong> pending messages</p>
    <hr>
    """
    
    for msg in pending_messages[:10]:
        status = "✅ Posted" if msg['posted'] else "⏳ Pending"
        html += f"<p>{status} - {msg['text']} <small>({msg['timestamp']})</small></p>"
    
    return html

if __name__ == "__main__":
    print("=" * 60)
    print("🔔 QRCall Workvivo Bot Server")
    print("=" * 60)
    print("📊 Dashboard: http://34.45.52.250:5002")
    print("🔗 Install Chrome extension from chrome_extension/ folder")
    print("📱 Open Workvivo in Chrome with extension installed")
    print("=" * 60)
    
    app.run(host='0.0.0.0', port=5002)