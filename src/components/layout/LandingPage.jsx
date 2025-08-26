import React, { useState } from "react";
import QRLockIcon from "../../QRLockIcon.jsx";
import LoginForm from "../auth/LoginForm.jsx";
import RegisterForm from "../auth/RegisterForm.jsx";

function LandingPage() {
  const [mode, setMode] = useState("signin");
  
  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center p-6">
      <div className="absolute inset-x-0 top-0 p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center">
            <QRLockIcon className="h-9 w-9 text-blue-600" />
          </div>
          <div className="text-lg font-semibold text-primary">QRcallbox</div>
        </div>
        <div className="text-sm text-secondary hidden md:block">Scan • Notify • Assist</div>
      </div>
      
      <div className="w-full max-w-5xl mx-auto">
        <div className="text-center mb-12 px-4">
          <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-8 mb-8">
            <div className="flex flex-col items-center gap-3 opacity-75 max-w-xs">
              <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center">
                <span className="text-xl">📱</span>
              </div>
              <div className="text-center">
                <div className="text-sm font-medium text-muted mb-1">SCAN</div>
                <div className="text-xs text-muted/70">Customers scan QR codes for instant help requests</div>
              </div>
            </div>
            <div className="text-muted text-lg hidden md:block">→</div>
            <div className="flex flex-col items-center gap-3 opacity-75 max-w-xs">
              <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center">
                <span className="text-xl">🔔</span>
              </div>
              <div className="text-center">
                <div className="text-sm font-medium text-muted mb-1">NOTIFY</div>
                <div className="text-xs text-muted/70">Staff receive real-time alerts with location details</div>
              </div>
            </div>
            <div className="text-muted text-lg hidden md:block">→</div>
            <div className="flex flex-col items-center gap-3 opacity-75 max-w-xs">
              <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center">
                <span className="text-xl">🤝</span>
              </div>
              <div className="text-center">
                <div className="text-sm font-medium text-muted mb-1">ASSIST</div>
                <div className="text-xs text-muted/70">Provide immediate help and track response times</div>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs opacity-60 max-w-2xl mx-auto">
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="text-blue-400 text-lg">📊</span>
              <div>
                <div className="font-medium text-muted mb-1">Heatmap Analytics</div>
                <div className="text-muted/70">Visualize help request patterns across locations</div>
              </div>
            </div>
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="text-blue-400 text-lg">⚡</span>
              <div>
                <div className="font-medium text-muted mb-1">Response Tracking</div>
                <div className="text-muted/70">Monitor team performance and response metrics</div>
              </div>
            </div>
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="text-blue-400 text-lg">🧠</span>
              <div>
                <div className="font-medium text-muted mb-1">Smart Insights</div>
                <div className="text-muted/70">Get AI-powered recommendations to improve service</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-center">
          {mode === "signin" ? (
            <LoginForm onSwitch={() => setMode("register")} />
          ) : (
            <RegisterForm onSwitch={() => setMode("signin")} />
          )}
        </div>
      </div>
      
      <footer className="absolute bottom-0 inset-x-0 p-6 text-center text-xs text-muted">
        © {new Date().getFullYear()} QRcallbox.com
      </footer>
    </div>
  );
}

export default LandingPage;