import React, { useState } from "react";
import Button from "./Button.jsx";
import { useFirebase } from "./app.jsx";

export default function ContactUs({ onClose }) {
  const { auth, db } = useFirebase();
  const user = auth?.currentUser;

  const [formData, setFormData] = useState({
    subject: "General",
    title: "",
    description: "",
    email: user?.email || ""
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const subjectOptions = [
    { value: "Bugs", label: "🐛 Bug Report", description: "Report technical issues or errors" },
    { value: "Suggestions", label: "💡 Feature Suggestion", description: "Suggest new features or improvements" },
    { value: "General", label: "💬 General Inquiry", description: "General questions or feedback" },
    { value: "Setup Help", label: "🛠️ Setup Help", description: "Need help with configuration or setup" }
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!user) {
      setError("Please sign in to submit a support ticket");
      return;
    }

    if (!formData.title.trim() || !formData.description.trim()) {
      setError("Please fill in all required fields");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/tickets/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          subject: formData.subject,
          title: formData.title,
          description: formData.description
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to submit ticket');
      }

      const result = await response.json();
      setSubmitted(true);
      
      // Auto-close after 3 seconds
      setTimeout(() => {
        onClose?.();
      }, 3000);

    } catch (err) {
      setError(err.message);
      console.error('Error submitting ticket:', err);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-secondary rounded-xl p-6 max-w-md w-full border border-themed">
          <div className="text-center">
            <div className="text-4xl mb-4">✅</div>
            <h3 className="text-lg font-semibold text-primary mb-2">Ticket Submitted!</h3>
            <p className="text-sm text-secondary mb-4">
              Your support ticket has been submitted successfully. We'll review it and get back to you soon.
            </p>
            <div className="p-3 bg-blue-900/20 border border-blue-500/50 rounded-xl text-blue-400 text-sm">
              <strong>What's Next:</strong>
              <ul className="mt-2 text-xs text-left list-disc ml-4">
                <li>We'll review your ticket within 24 hours</li>
                <li>You'll receive an email response at your registered address</li>
                <li>Check your spam folder if you don't see our response</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-secondary rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-themed">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-primary">Contact Support</h2>
          <button 
            onClick={onClose}
            className="text-muted hover:text-primary text-2xl"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/20 border border-red-500/50 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Subject Selection */}
          <div>
            <label className="block text-sm font-medium text-primary mb-2">
              What can we help you with?
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {subjectOptions.map((option) => (
                <label
                  key={option.value}
                  className={`cursor-pointer p-3 rounded-xl border transition-colors ${
                    formData.subject === option.value
                      ? 'border-indigo-500 bg-indigo-900/20'
                      : 'border-themed bg-tertiary hover:border-indigo-400'
                  }`}
                >
                  <input
                    type="radio"
                    name="subject"
                    value={option.value}
                    checked={formData.subject === option.value}
                    onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                    className="sr-only"
                  />
                  <div className="font-medium text-primary text-sm">{option.label}</div>
                  <div className="text-xs text-secondary mt-1">{option.description}</div>
                </label>
              ))}
            </div>
          </div>


          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-primary mb-1">
              Subject Line: <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              className="w-full rounded-xl border border-themed bg-primary text-primary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder={
                formData.subject === "Bugs" ? "Brief description of the bug" :
                formData.subject === "Suggestions" ? "What feature would you like to see?" :
                formData.subject === "Setup Help" ? "What do you need help setting up?" :
                "Brief summary of your inquiry"
              }
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-primary mb-1">
              Description: <span className="text-red-400">*</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={6}
              className="w-full rounded-xl border border-themed bg-primary text-primary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-vertical"
              placeholder={
                formData.subject === "Bugs" ? 
                  "Please describe:\n• What were you trying to do?\n• What happened instead?\n• Steps to reproduce the issue\n• What browser/device are you using?" :
                formData.subject === "Suggestions" ? 
                  "Please describe:\n• What feature would you like?\n• How would it help your workflow?\n• Any specific requirements?" :
                formData.subject === "Setup Help" ? 
                  "Please describe:\n• What are you trying to set up?\n• Where are you getting stuck?\n• What have you tried so far?" :
                  "Please provide as much detail as possible about your inquiry."
              }
              required
            />
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={loading || !formData.title.trim() || !formData.description.trim()}
              className="flex-1"
            >
              {loading ? "Submitting..." : "Submit Ticket"}
            </Button>
            <Button
              type="button"
              onClick={onClose}
              className="bg-tertiary text-primary hover:bg-secondary"
            >
              Cancel
            </Button>
          </div>
        </form>

        <div className="mt-6 p-3 bg-gray-900/20 border border-gray-600 rounded-xl text-xs text-secondary">
          <strong>Response Time:</strong> We typically respond within 24 hours during business days. 
          For urgent issues, please contact your system administrator directly.
        </div>
      </div>
    </div>
  );
}