from flask import Flask, request, jsonify
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
import time
import logging
import threading
from datetime import datetime

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

# Global variables
driver = None
logged_in = False
message_queue = []

WORKVIVO_URL = 'https://walmart.workvivo.com/groups/1458-customer-calls'

def init_browser():
    """Initialize Chrome browser with saved profile"""
    global driver
    
    chrome_options = Options()
    # Use Chrome profile to stay logged in
    chrome_options.add_argument("user-data-dir=C:\\Users\\YourUsername\\AppData\\Local\\Google\\Chrome\\User Data")  # UPDATE THIS PATH
    chrome_options.add_argument("profile-directory=Default")
    chrome_options.add_experimental_option("excludeSwitches", ["enable-logging"])
    
    try:
        driver = webdriver.Chrome(options=chrome_options)
        driver.get(WORKVIVO_URL)
        logging.info("Browser initialized")
        return True
    except Exception as e:
        logging.error(f"Failed to initialize browser: {e}")
        return False

def check_login():
    """Check if we're logged into Workvivo"""
    global logged_in
    try:
        # Check for login indicators
        time.sleep(3)
        
        # Look for chat input or other logged-in elements
        login_indicators = [
            '[contenteditable="true"]',
            'textarea[placeholder*="message"]',
            '.message-input',
            '#chat-markdown-editor'
        ]
        
        for selector in login_indicators:
            try:
                driver.find_element(By.CSS_SELECTOR, selector)
                logged_in = True
                logging.info("Already logged in to Workvivo!")
                return True
            except:
                continue
        
        # If not logged in, wait for manual login
        logging.info("Please log in to Workvivo manually in the browser window...")
        
        # Wait up to 5 minutes for login
        for i in range(60):  # Check every 5 seconds for 5 minutes
            time.sleep(5)
            for selector in login_indicators:
                try:
                    driver.find_element(By.CSS_SELECTOR, selector)
                    logged_in = True
                    logging.info("Login successful!")
                    return True
                except:
                    continue
        
        logging.error("Login timeout - please restart and log in")
        return False
        
    except Exception as e:
        logging.error(f"Error checking login: {e}")
        return False

def post_to_workvivo(message):
    """Post a message to Workvivo chat"""
    global driver, logged_in
    
    if not driver or not logged_in:
        logging.error("Not connected to Workvivo")
        return False
    
    try:
        # Navigate to the group if not there
        if WORKVIVO_URL not in driver.current_url:
            driver.get(WORKVIVO_URL)
            time.sleep(3)
        
        # Try multiple selectors for the message input
        input_selectors = [
            '#chat-markdown-editor div[contenteditable="true"]',
            'div[contenteditable="true"]',
            'textarea[placeholder*="message"]',
            '.message-input textarea',
            '[data-testid="message-input"]'
        ]
        
        message_sent = False
        
        for selector in input_selectors:
            try:
                # Find the input field
                wait = WebDriverWait(driver, 5)
                input_field = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, selector)))
                
                # Click to focus
                input_field.click()
                time.sleep(0.5)
                
                # Clear any existing text
                input_field.clear()
                
                # Type the message
                input_field.send_keys(message)
                time.sleep(0.5)
                
                # Try to find and click send button
                send_selectors = [
                    'button[type="submit"]',
                    'button:has-text("Send")',
                    '.send-button',
                    '[data-testid="send-button"]',
                    'button[aria-label="Send"]'
                ]
                
                for send_sel in send_selectors:
                    try:
                        send_btn = driver.find_element(By.CSS_SELECTOR, send_sel)
                        send_btn.click()
                        message_sent = True
                        break
                    except:
                        continue
                
                # If no send button found, try Enter key
                if not message_sent:
                    input_field.send_keys(Keys.RETURN)
                    message_sent = True
                
                if message_sent:
                    logging.info(f"Posted: {message}")
                    time.sleep(2)  # Wait for message to post
                    return True
                    
            except Exception as e:
                continue
        
        logging.error("Could not find message input field")
        return False
        
    except Exception as e:
        logging.error(f"Failed to post message: {e}")
        return False

def process_queue():
    """Process messages in the queue"""
    global message_queue
    
    while True:
        if message_queue and logged_in:
            message = message_queue.pop(0)
            success = post_to_workvivo(message)
            if not success:
                # Put it back if failed
                message_queue.insert(0, message)
                time.sleep(10)  # Wait before retry
        time.sleep(2)

@app.route('/send', methods=['POST'])
def receive_from_firebase():
    """Endpoint that Firebase calls"""
    try:
        data = request.get_json()
        message = data.get('message', '')
        
        if not message:
            return jsonify({'status': 'error', 'message': 'No message provided'}), 400
        
        # Add to queue
        message_queue.append(message)
        logging.info(f"Queued message: {message}")
        
        return jsonify({
            'status': 'success', 
            'message': 'Message queued for posting',
            'queue_size': len(message_queue),
            'logged_in': logged_in
        })
        
    except Exception as e:
        logging.error(f"Error: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/status')
def status():
    """Check bot status"""
    return jsonify({
        'status': 'online',
        'logged_in': logged_in,
        'queue_size': len(message_queue),
        'browser_active': driver is not None
    })

@app.route('/test', methods=['GET', 'POST'])
def test():
    """Test endpoint to manually send a message"""
    test_message = f"🔔 Test message at {datetime.now().strftime('%I:%M:%S %p')}"
    message_queue.append(test_message)
    return jsonify({
        'status': 'success',
        'message': 'Test message queued',
        'test_message': test_message
    })

if __name__ == '__main__':
    print("=" * 60)
    print("WORKVIVO AUTO-POSTING BOT FOR STORE 1458")
    print("=" * 60)
    print("\nStarting browser...")
    
    # Initialize browser
    if init_browser():
        print("Browser started successfully!")
        print("\nChecking login status...")
        
        # Check if logged in
        if check_login():
            print("\n✅ Connected to Workvivo!")
        else:
            print("\n⚠️  Please log in manually in the browser window")
            print("The bot will detect when you're logged in")
        
        # Start queue processor in background
        queue_thread = threading.Thread(target=process_queue, daemon=True)
        queue_thread.start()
        
        print("\n" + "=" * 60)
        print(f"Server starting on http://0.0.0.0:5002")
        print(f"Firebase endpoint: http://YOUR_SERVER_IP:5002/send")
        print(f"Test endpoint: http://localhost:5002/test")
        print(f"Status endpoint: http://localhost:5002/status")
        print("=" * 60)
        
        # Run Flask server
        app.run(host='0.0.0.0', port=5002, debug=False)
    else:
        print("Failed to start browser. Please check Chrome installation and path.")