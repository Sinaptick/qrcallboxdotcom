import React, { useState, useEffect } from 'react';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

const WorkvivoWebAuth = ({ storeNumber = "1458" }) => {
  const [status, setStatus] = useState('disconnected');
  const [authWindow, setAuthWindow] = useState(null);
  const [sessionActive, setSessionActive] = useState(false);
  
  const db = getFirestore();
  const auth = getAuth();

  useEffect(() => {
    checkExistingSession();
  }, []);

  const checkExistingSession = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      
      const sessionDoc = await getDoc(doc(db, 'workvivo_sessions', user.uid));
      if (sessionDoc.exists() && sessionDoc.data().active) {
        setSessionActive(true);
        setStatus('connected');
      }
    } catch (error) {
      console.error('Error checking session:', error);
    }
  };

  const openWorkvivoAuth = () => {
    // Open Workvivo login in a popup window
    const width = 500;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    
    const popup = window.open(
      'https://walmart.workvivo.com/login',
      'WorkvivoAuth',
      `width=${width},height=${height},left=${left},top=${top}`
    );
    
    setAuthWindow(popup);
    setStatus('authenticating');
    
    // Monitor the popup
    const checkInterval = setInterval(() => {
      try {
        // Check if user completed login by looking at URL
        if (popup.closed) {
          clearInterval(checkInterval);
          setStatus('cancelled');
          return;
        }
        
        // Try to access the popup URL (will fail due to CORS but we can detect success)
        if (popup.location.href.includes('workvivo.com/groups') || 
            popup.location.href.includes('workvivo.com/dashboard')) {
          // User successfully logged in
          captureSession(popup);
          clearInterval(checkInterval);
        }
      } catch (e) {
        // Cross-origin error is expected, but we can still detect URL changes
      }
    }, 1000);
  };

  const captureSession = async (authWindow) => {
    try {
      // Inject script to capture cookies/session (if possible)
      // Note: This requires the extension approach or server-side handling
      
      setStatus('capturing');
      
      // Store session info in Firestore
      const user = auth.currentUser;
      await setDoc(doc(db, 'workvivo_sessions', user.uid), {
        active: true,
        storeNumber: storeNumber,
        authenticatedAt: new Date().toISOString(),
        method: 'web_auth'
      });
      
      setSessionActive(true);
      setStatus('connected');
      
      // Close the auth window
      authWindow.close();
      
      // Notify backend to start using this session
      await fetch('https://us-central1-qrwebaccdb.cloudfunctions.net/workvivoWebAuth', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${await user.getIdToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'session_ready',
          storeNumber: storeNumber
        })
      });
      
    } catch (error) {
      console.error('Error capturing session:', error);
      setStatus('error');
    }
  };

  const disconnectWorkvivo = async () => {
    try {
      const user = auth.currentUser;
      await setDoc(doc(db, 'workvivo_sessions', user.uid), {
        active: false,
        disconnectedAt: new Date().toISOString()
      });
      
      setSessionActive(false);
      setStatus('disconnected');
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">Workvivo Integration - Store {storeNumber}</h3>
      
      {status === 'disconnected' && (
        <div>
          <p className="text-gray-600 mb-4">
            Connect to Workvivo to automatically post QR scan notifications to your store's chat.
          </p>
          <button
            onClick={openWorkvivoAuth}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
          >
            Connect to Workvivo
          </button>
        </div>
      )}
      
      {status === 'authenticating' && (
        <div>
          <p className="text-blue-600">
            Please log into Workvivo in the popup window...
          </p>
          <div className="mt-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </div>
      )}
      
      {status === 'capturing' && (
        <div>
          <p className="text-green-600">
            Capturing session... Please wait...
          </p>
        </div>
      )}
      
      {status === 'connected' && sessionActive && (
        <div>
          <p className="text-green-600 mb-4">
            ✓ Connected to Workvivo
          </p>
          <p className="text-sm text-gray-600 mb-4">
            QR scans will automatically post to your Workvivo chat.
          </p>
          <button
            onClick={disconnectWorkvivo}
            className="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700"
          >
            Disconnect
          </button>
        </div>
      )}
      
      {status === 'error' && (
        <div>
          <p className="text-red-600 mb-4">
            Failed to connect. Please try again.
          </p>
          <button
            onClick={openWorkvivoAuth}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
          >
            Retry Connection
          </button>
        </div>
      )}
    </div>
  );
};

export default WorkvivoWebAuth;