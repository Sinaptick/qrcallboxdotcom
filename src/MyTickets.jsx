import React, { useState, useEffect } from "react";
import Button from "./Button.jsx";
import { useFirebase } from "./hooks/useFirebase.js";

export default function MyTickets({ onCreateTicket }) {
  const { auth } = useFirebase();
  const user = auth?.currentUser;
  
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadMyTickets();
    }
  }, [user]);

  const loadMyTickets = async () => {
    try {
      setLoading(true);
      const token = await user.getIdToken();
      const response = await fetch(`/api/tickets/my-tickets`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load tickets');
      }

      const data = await response.json();
      setTickets(data.tickets || []);
    } catch (error) {
      console.error('Error loading tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'open': return 'text-green-400 bg-green-900/20';
      case 'closed': return 'text-gray-400 bg-gray-900/20';
      case 'in_progress': return 'text-yellow-400 bg-yellow-900/20';
      default: return 'text-blue-400 bg-blue-900/20';
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString() + ' ' + 
           new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const hasUnreadResponse = (ticket) => {
    if (!ticket.responses || ticket.responses.length === 0) return false;
    
    // Check if the last response is from admin
    const lastResponse = ticket.responses[ticket.responses.length - 1];
    return lastResponse.isAdmin;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-primary">My Support Tickets</h2>
        <div className="flex gap-3">
          {onCreateTicket && (
            <Button onClick={onCreateTicket} className="bg-blue-600 hover:bg-blue-700 text-white">
              Create Ticket
            </Button>
          )}
          <Button onClick={loadMyTickets} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[600px]">
        {/* Ticket List */}
        <div className="bg-secondary rounded-xl border border-themed">
          <div className="p-4 border-b border-themed">
            <h3 className="font-semibold text-primary">
              Your Tickets ({tickets.length})
            </h3>
          </div>
          
          <div className="max-h-[500px] overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-secondary">Loading your tickets...</div>
            ) : tickets.length === 0 ? (
              <div className="p-4 text-center text-secondary">
                You haven't submitted any support tickets yet.
              </div>
            ) : (
              <div className="space-y-1 p-2">
                {tickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    onClick={() => setSelectedTicket(ticket)}
                    className={`p-3 rounded-lg cursor-pointer transition-colors border ${
                      selectedTicket?.id === ticket.id
                        ? 'border-indigo-500 bg-indigo-900/20'
                        : 'border-transparent hover:border-themed hover:bg-tertiary'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-1 rounded ${getStatusColor(ticket.status)}`}>
                            {ticket.status}
                          </span>
                          <span className="text-xs text-blue-400 bg-blue-900/20 px-2 py-1 rounded">
                            {ticket.subject}
                          </span>
                          {hasUnreadResponse(ticket) && (
                            <span className="text-xs text-orange-400 bg-orange-900/20 px-2 py-1 rounded">
                              New Response
                            </span>
                          )}
                        </div>
                        <div className="font-medium text-primary text-sm truncate">
                          {ticket.title}
                        </div>
                        <div className="text-xs text-secondary truncate">
                          Ticket: {ticket.ticketId}
                        </div>
                        <div className="text-xs text-muted mt-1">
                          {formatDate(ticket.submittedAt)}
                        </div>
                      </div>
                      {ticket.responses && ticket.responses.length > 0 && (
                        <div className="text-xs text-blue-400 bg-blue-900/20 px-2 py-1 rounded">
                          {ticket.responses.length} replies
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Ticket Details */}
        <div className="bg-secondary rounded-xl border border-themed">
          <div className="p-4 border-b border-themed">
            <h3 className="font-semibold text-primary">
              {selectedTicket ? `Ticket Details - ${selectedTicket.ticketId}` : 'Select a ticket'}
            </h3>
          </div>
          
          <div className="h-[500px] overflow-y-auto">
            {selectedTicket ? (
              <div className="p-4 space-y-4">
                {/* Ticket Header */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded ${getStatusColor(selectedTicket.status)}`}>
                      {selectedTicket.status}
                    </span>
                    <span className="text-xs px-2 py-1 rounded bg-gray-800/50 text-gray-300">
                      {selectedTicket.subject}
                    </span>
                  </div>
                  <div className="text-sm text-secondary">
                    <strong>Submitted:</strong> {formatDate(selectedTicket.submittedAt)}
                  </div>
                  <div className="text-sm text-secondary">
                    <strong>Last Updated:</strong> {formatDate(selectedTicket.updatedAt)}
                  </div>
                </div>

                {/* Original Message */}
                <div className="border border-themed rounded-lg p-3">
                  <div className="font-medium text-primary mb-2">{selectedTicket.title}</div>
                  <div className="text-sm text-secondary whitespace-pre-wrap">
                    {selectedTicket.description}
                  </div>
                </div>

                {/* Responses */}
                {selectedTicket.responses && selectedTicket.responses.length > 0 && (
                  <div className="space-y-3">
                    <div className="text-sm font-medium text-primary">Conversation:</div>
                    {selectedTicket.responses.map((resp, index) => (
                      <div 
                        key={resp.id || index} 
                        className={`border rounded-lg p-3 ${
                          resp.isAdmin ? 'border-blue-500/50 bg-blue-900/10' : 'border-green-500/50 bg-green-900/10'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-medium text-primary flex items-center gap-1">
                            {resp.author} 
                            {resp.isAdmin ? (
                              <span className="text-blue-400">(Support Team)</span>
                            ) : (
                              <span className="text-green-400">(You)</span>
                            )}
                            {resp.source === 'email' && (
                              <span className="text-gray-400">(via email)</span>
                            )}
                          </span>
                          <span className="text-xs text-secondary">
                            {formatDate(resp.timestamp)}
                          </span>
                        </div>
                        <div className="text-sm text-secondary whitespace-pre-wrap">
                          {resp.text}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reply Instructions */}
                {selectedTicket.status !== 'closed' && (
                  <div className="border border-blue-500/50 bg-blue-900/10 rounded-lg p-3">
                    <div className="text-sm font-medium text-primary mb-2">💬 Want to reply?</div>
                    <div className="text-xs text-secondary">
                      <p>You can reply to this ticket by responding to the support email we sent you.</p>
                      <p className="mt-1">Your email reply will automatically reopen the ticket and notify our support team.</p>
                    </div>
                  </div>
                )}

                {selectedTicket.status === 'closed' && (
                  <div className="border border-gray-500/50 bg-gray-900/10 rounded-lg p-3">
                    <div className="text-sm font-medium text-primary mb-2">✅ Ticket Closed</div>
                    <div className="text-xs text-secondary">
                      This ticket has been resolved. If you need further assistance, please submit a new support ticket.
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-secondary">
                Select a ticket from the list to view details and conversation history.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-3 bg-blue-900/20 border border-blue-600 rounded-xl text-xs text-secondary">
        <strong>How to get help:</strong> Submit new tickets using the "Contact Us" link at the bottom of any page. 
        To reply to existing tickets, simply respond to the support emails we send you.
      </div>
    </div>
  );
}