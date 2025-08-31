import { useReducer } from 'react';

// Initial state for the ticket queue
const initialState = {
  // Data states
  tickets: [],
  selectedTicket: null,
  
  // UI states  
  statusFilter: 'open',
  response: '',
  lookupTicketId: '',
  
  // Loading states
  loading: true,
  responding: false,
  closing: false,
  reopening: false,
  updatingPriority: false,
  lookingUp: false,
};

// Action types
export const TICKET_ACTIONS = {
  // Data actions
  SET_TICKETS: 'SET_TICKETS',
  SET_SELECTED_TICKET: 'SET_SELECTED_TICKET',
  UPDATE_TICKET_IN_LIST: 'UPDATE_TICKET_IN_LIST',
  REMOVE_TICKET_FROM_LIST: 'REMOVE_TICKET_FROM_LIST',
  ADD_TICKET_TO_LIST: 'ADD_TICKET_TO_LIST',
  
  // UI actions
  SET_STATUS_FILTER: 'SET_STATUS_FILTER',
  SET_RESPONSE: 'SET_RESPONSE',
  SET_LOOKUP_TICKET_ID: 'SET_LOOKUP_TICKET_ID',
  CLEAR_RESPONSE: 'CLEAR_RESPONSE',
  
  // Loading actions
  SET_LOADING: 'SET_LOADING',
  SET_RESPONDING: 'SET_RESPONDING',
  SET_CLOSING: 'SET_CLOSING',
  SET_REOPENING: 'SET_REOPENING',
  SET_UPDATING_PRIORITY: 'SET_UPDATING_PRIORITY',
  SET_LOOKING_UP: 'SET_LOOKING_UP',
  
  // Complex actions (multiple state updates)
  START_RESPOND: 'START_RESPOND',
  END_RESPOND: 'END_RESPOND',
  START_CLOSE: 'START_CLOSE',
  END_CLOSE: 'END_CLOSE',
  START_REOPEN: 'START_REOPEN',
  END_REOPEN: 'END_REOPEN',
  START_PRIORITY_UPDATE: 'START_PRIORITY_UPDATE',
  END_PRIORITY_UPDATE: 'END_PRIORITY_UPDATE',
  START_LOOKUP: 'START_LOOKUP',
  END_LOOKUP: 'END_LOOKUP',
  
  // Composite actions
  CLOSE_TICKET_SUCCESS: 'CLOSE_TICKET_SUCCESS',
  UPDATE_SELECTED_TICKET_PRIORITY: 'UPDATE_SELECTED_TICKET_PRIORITY',
  LOOKUP_SUCCESS: 'LOOKUP_SUCCESS',
};

/**
 * Ticket Queue Reducer
 * Manages all state transitions for the ticket queue component
 * Replaces 10+ useState hooks with predictable state management
 */
function ticketReducer(state, action) {
  switch (action.type) {
    // Simple data updates
    case TICKET_ACTIONS.SET_TICKETS:
      return { ...state, tickets: action.payload };
    
    case TICKET_ACTIONS.SET_SELECTED_TICKET:
      return { ...state, selectedTicket: action.payload };
    
    case TICKET_ACTIONS.UPDATE_TICKET_IN_LIST:
      return {
        ...state,
        tickets: state.tickets.map(ticket => 
          ticket.id === action.payload.id ? { ...ticket, ...action.payload.updates } : ticket
        )
      };
    
    case TICKET_ACTIONS.REMOVE_TICKET_FROM_LIST:
      return {
        ...state,
        tickets: state.tickets.filter(ticket => ticket.id !== action.payload)
      };
    
    case TICKET_ACTIONS.ADD_TICKET_TO_LIST:
      return {
        ...state,
        tickets: [action.payload, ...state.tickets]
      };
    
    // UI state updates
    case TICKET_ACTIONS.SET_STATUS_FILTER:
      return { ...state, statusFilter: action.payload };
    
    case TICKET_ACTIONS.SET_RESPONSE:
      return { ...state, response: action.payload };
    
    case TICKET_ACTIONS.SET_LOOKUP_TICKET_ID:
      return { ...state, lookupTicketId: action.payload };
    
    case TICKET_ACTIONS.CLEAR_RESPONSE:
      return { ...state, response: '' };
    
    // Loading state updates
    case TICKET_ACTIONS.SET_LOADING:
      return { ...state, loading: action.payload };
    
    case TICKET_ACTIONS.SET_RESPONDING:
      return { ...state, responding: action.payload };
    
    case TICKET_ACTIONS.SET_CLOSING:
      return { ...state, closing: action.payload };
    
    case TICKET_ACTIONS.SET_REOPENING:
      return { ...state, reopening: action.payload };
    
    case TICKET_ACTIONS.SET_UPDATING_PRIORITY:
      return { ...state, updatingPriority: action.payload };
    
    case TICKET_ACTIONS.SET_LOOKING_UP:
      return { ...state, lookingUp: action.payload };
    
    // Complex state transitions
    case TICKET_ACTIONS.START_RESPOND:
      return { ...state, responding: true };
    
    case TICKET_ACTIONS.END_RESPOND:
      return { ...state, responding: false, response: '' };
    
    case TICKET_ACTIONS.START_CLOSE:
      return { ...state, closing: true };
    
    case TICKET_ACTIONS.END_CLOSE:
      return { ...state, closing: false };
    
    case TICKET_ACTIONS.START_REOPEN:
      return { ...state, reopening: true };
    
    case TICKET_ACTIONS.END_REOPEN:
      return { ...state, reopening: false };
    
    case TICKET_ACTIONS.START_PRIORITY_UPDATE:
      return { ...state, updatingPriority: true };
    
    case TICKET_ACTIONS.END_PRIORITY_UPDATE:
      return { ...state, updatingPriority: false };
    
    case TICKET_ACTIONS.START_LOOKUP:
      return { ...state, lookingUp: true };
    
    case TICKET_ACTIONS.END_LOOKUP:
      return { ...state, lookingUp: false, lookupTicketId: '' };
    
    // Composite actions for complex operations
    case TICKET_ACTIONS.CLOSE_TICKET_SUCCESS:
      const { ticketId, nextTicket, shouldRemoveFromList } = action.payload;
      
      if (shouldRemoveFromList) {
        return {
          ...state,
          closing: false,
          tickets: state.tickets.filter(t => t.id !== ticketId),
          selectedTicket: nextTicket || null
        };
      } else {
        return {
          ...state,
          closing: false
        };
      }
    
    case TICKET_ACTIONS.UPDATE_SELECTED_TICKET_PRIORITY:
      return {
        ...state,
        selectedTicket: state.selectedTicket ? {
          ...state.selectedTicket,
          priority: action.payload
        } : null,
        updatingPriority: false
      };
    
    case TICKET_ACTIONS.LOOKUP_SUCCESS:
      const { ticket: foundTicket, updatedTickets } = action.payload;
      return {
        ...state,
        lookingUp: false,
        lookupTicketId: '',
        tickets: updatedTickets,
        selectedTicket: foundTicket
      };
    
    default:
      return state;
  }
}

/**
 * Custom hook that provides the ticket reducer
 * @returns {[state, dispatch]} Tuple containing state and dispatch function
 */
export function useTicketReducer() {
  return useReducer(ticketReducer, initialState);
}

/**
 * Action creators for common operations
 * Makes it easier to dispatch actions with proper payload structure
 */
export const ticketActions = {
  setTickets: (tickets) => ({ 
    type: TICKET_ACTIONS.SET_TICKETS, 
    payload: tickets 
  }),
  
  setSelectedTicket: (ticket) => ({ 
    type: TICKET_ACTIONS.SET_SELECTED_TICKET, 
    payload: ticket 
  }),
  
  setStatusFilter: (filter) => ({ 
    type: TICKET_ACTIONS.SET_STATUS_FILTER, 
    payload: filter 
  }),
  
  setResponse: (response) => ({ 
    type: TICKET_ACTIONS.SET_RESPONSE, 
    payload: response 
  }),
  
  setLookupTicketId: (id) => ({ 
    type: TICKET_ACTIONS.SET_LOOKUP_TICKET_ID, 
    payload: id 
  }),
  
  startLoading: () => ({ 
    type: TICKET_ACTIONS.SET_LOADING, 
    payload: true 
  }),
  
  endLoading: () => ({ 
    type: TICKET_ACTIONS.SET_LOADING, 
    payload: false 
  }),
  
  startRespond: () => ({ 
    type: TICKET_ACTIONS.START_RESPOND 
  }),
  
  endRespond: () => ({ 
    type: TICKET_ACTIONS.END_RESPOND 
  }),
  
  startClose: () => ({ 
    type: TICKET_ACTIONS.START_CLOSE 
  }),
  
  closeTicketSuccess: ({ ticketId, nextTicket, shouldRemoveFromList }) => ({
    type: TICKET_ACTIONS.CLOSE_TICKET_SUCCESS,
    payload: { ticketId, nextTicket, shouldRemoveFromList }
  }),
  
  updateSelectedTicketPriority: (priority) => ({
    type: TICKET_ACTIONS.UPDATE_SELECTED_TICKET_PRIORITY,
    payload: priority
  }),
  
  lookupSuccess: ({ ticket, updatedTickets }) => ({
    type: TICKET_ACTIONS.LOOKUP_SUCCESS,
    payload: { ticket, updatedTickets }
  })
};