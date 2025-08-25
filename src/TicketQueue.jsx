import React, { useState, useEffect } from "react";
import Button from "./Button.jsx";
import { useFirebase } from "./app.jsx";

export default function TicketQueue() {
  const { auth } = useFirebase();
  const user = auth?.currentUser;
  
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [updatingPriority, setUpdatingPriority] = useState(false);
  const [statusFilter, setStatusFilter] = useState('open');
  const [response, setResponse] = useState("");
  const [lookupTicketId, setLookupTicketId] = useState("");
  const [lookingUp, setLookingUp] = useState(false);

  useEffect(() => {
    if (user) {
      loadTickets();
    }
  }, [user, statusFilter]);

  const loadTickets = async () => {
    try {
      setLoading(true);
      const token = await user.getIdToken();
      const response = await fetch(`/api/tickets/list?status=${statusFilter}&limit=100`, {
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

  const loadTicketDetails = async (ticketId) => {
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/tickets/details?ticketId=${ticketId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load ticket details');
      }

      const data = await response.json();
      setSelectedTicket(data.ticket);
    } catch (error) {
      console.error('Error loading ticket details:', error);
    }
  };

  const handleRespond = async () => {
    if (!response.trim() || !selectedTicket) return;

    try {
      setResponding(true);
      const token = await user.getIdToken();
      const res = await fetch('/api/tickets/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ticketId: selectedTicket.id,
          response: response,
          closeTicket: false
        })
      });

      if (!res.ok) {
        throw new Error('Failed to send response');
      }

      // Reload tickets and clear response
      await loadTickets();
      setResponse("");
      
      // Reload ticket details to show the new response
      await loadTicketDetails(selectedTicket.id);

    } catch (error) {
      console.error('Error sending response:', error);
    } finally {
      setResponding(false);
    }
  };

  const handleCloseTicket = async () => {
    console.log('=== CLOSE TICKET BUTTON CLICKED ===');
    if (!selectedTicket) {
      console.log('No selected ticket');
      return;
    }

    console.log('Closing ticket:', selectedTicket.id);

    try {
      setClosing(true);
      const token = await user.getIdToken();
      console.log('Making close request...');
      
      const res = await fetch('/api/tickets/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ticketId: selectedTicket.id,
          response: "Ticket closed by admin.",
          closeTicket: true
        })
      });

      console.log('Close response status:', res.status);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Close failed:', errorText);
        alert(`Failed to close ticket: ${errorText}`);
        throw new Error(`Failed to close ticket: ${errorText}`);
      }

      console.log('Ticket closed successfully, updating UI...');

      // Store the closed ticket ID for filtering
      const closedTicketId = selectedTicket.id;
      
      // If the current filter excludes closed tickets, immediately update the UI
      if (statusFilter === 'open' || statusFilter === 'in_progress') {
        // Remove the closed ticket from the current list
        const updatedTickets = tickets.filter(t => t.id !== closedTicketId);
        setTickets(updatedTickets);
        
        // Select the next available ticket or clear selection
        if (updatedTickets.length > 0) {
          const nextTicket = updatedTickets[0];
          setSelectedTicket(nextTicket);
          await loadTicketDetails(nextTicket.id);
        } else {
          setSelectedTicket(null);
        }
      } else {
        // If showing all/closed tickets, refresh the current ticket to show updated status
        await loadTickets();
        await loadTicketDetails(closedTicketId);
      }
      

    } catch (error) {
      console.error('Error closing ticket:', error);
      alert('Error closing ticket: ' + error.message);
    } finally {
      console.log('Setting closing to false');
      setClosing(false);
    }
  };

  const handleReopenTicket = async () => {
    console.log('=== REOPEN TICKET BUTTON CLICKED ===');
    if (!selectedTicket) {
      console.log('No selected ticket');
      return;
    }

    console.log('Reopening ticket:', selectedTicket.id);

    try {
      setReopening(true);
      const token = await user.getIdToken();
      console.log('Making reopen request...');
      
      const res = await fetch('/api/tickets/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ticketId: selectedTicket.id,
          response: "Ticket reopened by admin.",
          closeTicket: false,
          status: 'open'
        })
      });

      console.log('Reopen response status:', res.status);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Reopen failed:', errorText);
        alert(`Failed to reopen ticket: ${errorText}`);
        throw new Error(`Failed to reopen ticket: ${errorText}`);
      }

      console.log('Ticket reopened successfully, updating UI...');
      
      // Reload tickets and refresh the current ticket details
      await loadTickets();
      await loadTicketDetails(selectedTicket.id);

    } catch (error) {
      console.error('Error reopening ticket:', error);
      alert('Error reopening ticket: ' + error.message);
    } finally {
      console.log('Setting reopening to false');
      setReopening(false);
    }
  };

  const handlePriorityChange = async (newPriority) => {
    if (!selectedTicket || selectedTicket.priority === newPriority) return;

    console.log('Updating priority to:', newPriority);

    try {
      setUpdatingPriority(true);
      const token = await user.getIdToken();
      
      const res = await fetch('/api/tickets/update-priority', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ticketId: selectedTicket.id,
          priority: newPriority
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Priority update failed:', errorText);
        alert(`Failed to update priority: ${errorText}`);
        return;
      }

      console.log('Priority updated successfully');
      
      // Update the local selected ticket
      setSelectedTicket(prev => ({ ...prev, priority: newPriority }));
      
      // Reload the ticket list to reflect the change
      await loadTickets();

    } catch (error) {
      console.error('Error updating priority:', error);
      alert('Error updating priority: ' + error.message);
    } finally {
      setUpdatingPriority(false);
    }
  };

  const handleLookupTicket = async () => {
    if (!lookupTicketId.trim()) return;

    try {
      setLookingUp(true);
      const token = await user.getIdToken();
      const response = await fetch(`/api/tickets/lookup?ticketId=${encodeURIComponent(lookupTicketId.trim())}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          alert('Ticket not found. Please check the ticket ID and try again.');
        } else {
          throw new Error('Failed to lookup ticket');
        }
        return;
      }

      const data = await response.json();
      
      // Add the found ticket to the list if not already present
      const foundTicket = data.ticket;
      setTickets(prev => {
        const exists = prev.find(t => t.id === foundTicket.id);
        if (exists) {
          return prev;
        }
        return [foundTicket, ...prev];
      });
      
      // Select and load the found ticket
      setSelectedTicket(foundTicket);
      setLookupTicketId('');

    } catch (error) {
      console.error('Error looking up ticket:', error);
      alert('Error looking up ticket. Please try again.');
    } finally {
      setLookingUp(false);
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

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'text-red-400';
      case 'medium': return 'text-orange-400';
      case 'normal': return 'text-green-400';
      default: return 'text-gray-400';
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString() + ' ' + 
           new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-primary">Support Ticket Queue</h2>
        <div className="flex gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-themed bg-primary text-primary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Tickets</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="closed">Closed</option>
          </select>
          <Button onClick={loadTickets} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Ticket Lookup */}
      <div className="bg-secondary rounded-xl border border-themed p-4">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-primary whitespace-nowrap">
            Lookup Ticket:
          </label>
          <input
            type="text"
            value={lookupTicketId}
            onChange={(e) => setLookupTicketId(e.target.value)}
            placeholder="Enter ticket ID (e.g., TICKET-123456789-ABC123)"
            className="flex-1 rounded-xl border border-themed bg-primary text-primary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            onKeyPress={(e) => e.key === 'Enter' && handleLookupTicket()}
          />
          <Button 
            onClick={handleLookupTicket}
            disabled={!lookupTicketId.trim() || lookingUp}
            className="whitespace-nowrap"
          >
            {lookingUp ? "Looking up..." : "Find Ticket"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[600px]">
        {/* Ticket List */}
        <div className="bg-secondary rounded-xl border border-themed">
          <div className="p-4 border-b border-themed">
            <h3 className="font-semibold text-primary">
              Tickets ({tickets.length})
            </h3>
          </div>
          
          <div className="max-h-[500px] overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-secondary">Loading tickets...</div>
            ) : tickets.length === 0 ? (
              <div className="p-4 text-center text-secondary">
                No tickets found for the selected filter.
              </div>
            ) : (
              <div className="space-y-1 p-2">
                {tickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    onClick={() => loadTicketDetails(ticket.id)}
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
                          <span className={`text-xs ${getPriorityColor(ticket.priority)}`}>
                            {ticket.priority}
                          </span>
                        </div>
                        <div className="font-medium text-primary text-sm truncate">
                          {ticket.userName} - {ticket.subject}
                        </div>
                        <div className="text-xs text-secondary truncate">
                          {ticket.title}
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
                    <select
                      value={selectedTicket.priority || 'normal'}
                      onChange={(e) => handlePriorityChange(e.target.value)}
                      disabled={updatingPriority}
                      className={`text-xs px-2 py-1 rounded border-0 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                        getPriorityColor(selectedTicket.priority)
                      } ${
                        selectedTicket.priority === 'high' 
                          ? 'bg-red-900/20' 
                          : selectedTicket.priority === 'medium'
                          ? 'bg-orange-900/20'
                          : 'bg-green-900/20'
                      }`}
                    >
                      <option value="normal">Normal Priority</option>
                      <option value="medium">Medium Priority</option>
                      <option value="high">High Priority</option>
                    </select>
                    <span className="text-xs px-2 py-1 rounded bg-gray-800/50 text-gray-300">
                      {selectedTicket.subject}
                    </span>
                  </div>
                  <div className="text-sm text-secondary">
                    <strong>From:</strong> {selectedTicket.userName} ({selectedTicket.userEmail})
                  </div>
                  <div className="text-sm text-secondary">
                    <strong>Submitted:</strong> {formatDate(selectedTicket.submittedAt)}
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
                    <div className="text-sm font-medium text-primary">Responses:</div>
                    {selectedTicket.responses.map((resp, index) => (
                      <div 
                        key={resp.id || index} 
                        className={`border rounded-lg p-3 ${
                          resp.isAdmin ? 'border-blue-500/50 bg-blue-900/10' : 'border-themed'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-medium text-primary">
                            {resp.author} {resp.isAdmin ? '(Admin)' : ''}
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

                {/* Response Form */}
                <div className="border-t border-themed pt-4">
                  <div className="space-y-3">
                    {selectedTicket.status !== 'closed' && (
                      <div>
                        <label className="block text-sm font-medium text-primary mb-1">
                          Your Response:
                        </label>
                        <textarea
                          value={response}
                          onChange={(e) => setResponse(e.target.value)}
                          rows={4}
                          className="w-full rounded-xl border border-themed bg-primary text-primary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="Type your response to the user..."
                        />
                      </div>
                    )}
                    
                    <div className="flex gap-3">
                      {selectedTicket.status !== 'closed' && (
                        <Button
                          onClick={handleRespond}
                          disabled={!response.trim() || responding}
                          className="flex-1"
                        >
                          {responding ? "Sending..." : "Send Response"}
                        </Button>
                      )}
                      
                      {selectedTicket.status === 'closed' ? (
                        <Button
                          onClick={handleReopenTicket}
                          disabled={reopening}
                          className="bg-green-600 hover:bg-green-700 text-white px-4"
                        >
                          {reopening ? "Reopening..." : "Reopen Ticket"}
                        </Button>
                      ) : (
                        <Button
                          onClick={handleCloseTicket}
                          disabled={closing}
                          className="bg-red-600 hover:bg-red-700 text-white px-4"
                        >
                          {closing ? "Closing..." : "Close Ticket"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-secondary">
                Select a ticket from the list to view details and respond.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-3 bg-gray-900/20 border border-gray-600 rounded-xl text-xs text-secondary">
        <strong>Email Integration:</strong> When you respond to tickets, an email will be automatically sent 
        to the user from your QRcallbox support email address. Make sure your email integration is configured 
        in the Firebase Functions environment.
      </div>
    </div>
  );
}