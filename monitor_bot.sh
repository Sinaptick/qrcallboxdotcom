#!/bin/bash

# Debian/Linux monitoring script for WebSocket bot with auto-restart
# Place this in the same directory as your Python script

# Configuration
SCRIPT_NAME="vivopost_websocket_optimized.py"
MAX_MEMORY_MB=400
CHECK_INTERVAL=60
LOG_FILE="bot_monitor.log"
PYTHON_CMD="python3"
VENV_PATH="venv"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to log messages
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to check if virtual environment exists and activate it
activate_venv() {
    if [ -d "$VENV_PATH" ]; then
        if [ -f "$VENV_PATH/bin/activate" ]; then
            source "$VENV_PATH/bin/activate"
            log_message "Virtual environment activated"
            return 0
        fi
    fi
    return 1
}

# Function to get process memory usage in MB
get_memory_usage() {
    local pid=$1
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        # Get RSS memory in KB and convert to MB
        local mem_kb=$(ps -o rss= -p "$pid" 2>/dev/null | tr -d ' ')
        if [ -n "$mem_kb" ]; then
            echo $((mem_kb / 1024))
        else
            echo 0
        fi
    else
        echo 0
    fi
}

# Function to check bot health via HTTP
check_health() {
    if command -v curl &> /dev/null; then
        response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5002/health 2>/dev/null)
        if [ "$response" == "200" ]; then
            return 0
        fi
    fi
    return 1
}

# Trap signals for cleanup
cleanup() {
    log_message "Received shutdown signal"
    if [ -n "$BOT_PID" ] && kill -0 "$BOT_PID" 2>/dev/null; then
        log_message "Stopping bot process (PID: $BOT_PID)"
        kill -TERM "$BOT_PID" 2>/dev/null
        sleep 2
        if kill -0 "$BOT_PID" 2>/dev/null; then
            kill -KILL "$BOT_PID" 2>/dev/null
        fi
    fi
    exit 0
}

trap cleanup SIGINT SIGTERM

# Main monitoring loop
main() {
    echo -e "${GREEN}============================================================${NC}"
    echo -e "${GREEN}QRCall Workvivo Bot Monitor (Debian/Linux)${NC}"
    echo -e "${GREEN}============================================================${NC}"
    echo "Script: $SCRIPT_NAME"
    echo "Max Memory: ${MAX_MEMORY_MB}MB"
    echo "Check Interval: ${CHECK_INTERVAL}s"
    echo "Log File: $LOG_FILE"
    echo -e "${GREEN}============================================================${NC}"
    
    log_message "Monitor started"
    
    # Activate virtual environment if available
    activate_venv
    
    RESTART_COUNT=0
    MAX_RESTARTS=10
    
    while true; do
        # Start the bot
        log_message "Starting bot..."
        $PYTHON_CMD "$SCRIPT_NAME" &
        BOT_PID=$!
        
        log_message "Bot started with PID: $BOT_PID"
        
        # Monitor the bot
        while kill -0 "$BOT_PID" 2>/dev/null; do
            sleep "$CHECK_INTERVAL"
            
            # Check memory usage
            MEMORY_MB=$(get_memory_usage "$BOT_PID")
            
            if [ "$MEMORY_MB" -gt 0 ]; then
                echo -e "Memory usage: ${YELLOW}${MEMORY_MB}MB${NC} / ${MAX_MEMORY_MB}MB"
                
                if [ "$MEMORY_MB" -gt "$MAX_MEMORY_MB" ]; then
                    log_message "WARNING: Memory limit exceeded (${MEMORY_MB}MB > ${MAX_MEMORY_MB}MB)"
                    echo -e "${RED}Restarting due to high memory usage...${NC}"
                    kill -TERM "$BOT_PID" 2>/dev/null
                    sleep 3
                    if kill -0 "$BOT_PID" 2>/dev/null; then
                        kill -KILL "$BOT_PID" 2>/dev/null
                    fi
                    break
                fi
            fi
            
            # Check health endpoint
            if ! check_health; then
                log_message "WARNING: Health check failed"
                echo -e "${YELLOW}Health check failed, but process still running${NC}"
            fi
        done
        
        # Bot has stopped
        wait "$BOT_PID"
        EXIT_CODE=$?
        
        log_message "Bot stopped with exit code: $EXIT_CODE"
        
        # Check restart count
        RESTART_COUNT=$((RESTART_COUNT + 1))
        if [ "$RESTART_COUNT" -ge "$MAX_RESTARTS" ]; then
            log_message "ERROR: Maximum restart attempts ($MAX_RESTARTS) reached"
            echo -e "${RED}Maximum restart attempts reached. Exiting.${NC}"
            exit 1
        fi
        
        echo -e "${YELLOW}Restarting bot in 10 seconds... (Attempt $RESTART_COUNT/$MAX_RESTARTS)${NC}"
        sleep 10
        
        # Reset restart count after 1 hour of successful operation
        if [ "$SECONDS" -gt 3600 ]; then
            RESTART_COUNT=0
            SECONDS=0
        fi
    done
}

# Check if script exists
if [ ! -f "$SCRIPT_NAME" ]; then
    echo -e "${RED}Error: $SCRIPT_NAME not found!${NC}"
    exit 1
fi

# Check Python installation
if ! command -v $PYTHON_CMD &> /dev/null; then
    echo -e "${RED}Error: Python3 not found!${NC}"
    exit 1
fi

# Start monitoring
main