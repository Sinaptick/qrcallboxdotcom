#!/bin/bash

# Script to check and clean up disk space on Debian VM
# Run without sudo - cleans user directories only

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}=== Disk Space Check ===${NC}"
df -h

echo -e "\n${YELLOW}=== Largest directories in home ===${NC}"
du -sh ~/* 2>/dev/null | sort -rh | head -10

echo -e "\n${YELLOW}=== Chrome cache size ===${NC}"
if [ -d ~/chrome-profile ]; then
    du -sh ~/chrome-profile/
    echo "Chrome cache subdirectories:"
    du -sh ~/chrome-profile/Default/Cache* 2>/dev/null
    du -sh ~/chrome-profile/Default/Storage* 2>/dev/null
    du -sh ~/chrome-profile/Default/IndexedDB* 2>/dev/null
fi

echo -e "\n${YELLOW}=== Python cache ===${NC}"
find ~ -type d -name "__pycache__" 2>/dev/null | xargs du -sh 2>/dev/null | tail -5
find ~ -type d -name ".cache" 2>/dev/null | xargs du -sh 2>/dev/null

echo -e "\n${YELLOW}=== Log files ===${NC}"
find ~ -name "*.log" -type f 2>/dev/null | xargs ls -lh 2>/dev/null | head -10

echo -e "\n${GREEN}=== Cleanup Options ===${NC}"
echo "Run these commands to free space:"
echo ""
echo "1. Clear Chrome cache (keeps login):"
echo "   rm -rf ~/chrome-profile/Default/Cache"
echo "   rm -rf ~/chrome-profile/Default/Code\\ Cache"
echo "   rm -rf ~/chrome-profile/Default/GPUCache"
echo "   rm -rf ~/chrome-profile/Default/Storage/ext"
echo ""
echo "2. Clear Python cache:"
echo "   find ~ -type d -name '__pycache__' -exec rm -rf {} + 2>/dev/null"
echo "   rm -rf ~/.cache/pip"
echo ""
echo "3. Clear old logs:"
echo "   find ~ -name '*.log' -type f -mtime +7 -delete"
echo ""
echo "4. Clear Chrome completely (will need to login again):"
echo "   rm -rf ~/chrome-profile"
echo ""
echo -e "${YELLOW}Auto-cleanup safe items? (y/n)${NC}"
read -r response

if [[ "$response" =~ ^[Yy]$ ]]; then
    echo -e "\n${GREEN}Cleaning safe items...${NC}"
    
    # Clear Chrome caches (keeps cookies/login)
    rm -rf ~/chrome-profile/Default/Cache 2>/dev/null
    rm -rf ~/chrome-profile/Default/Code\ Cache 2>/dev/null
    rm -rf ~/chrome-profile/Default/GPUCache 2>/dev/null
    rm -rf ~/chrome-profile/Default/Storage/ext 2>/dev/null
    rm -rf ~/chrome-profile/Default/Service\ Worker/CacheStorage 2>/dev/null
    
    # Clear Python caches
    find ~ -type d -name '__pycache__' -exec rm -rf {} + 2>/dev/null
    rm -rf ~/.cache/pip 2>/dev/null
    
    # Clear old logs (older than 7 days)
    find ~ -name '*.log' -type f -mtime +7 -delete 2>/dev/null
    
    # Clear temp files
    rm -rf ~/.local/share/Trash/* 2>/dev/null
    rm -rf /tmp/* 2>/dev/null
    
    echo -e "\n${GREEN}Cleanup complete!${NC}"
    echo -e "\n${YELLOW}=== Disk space after cleanup ===${NC}"
    df -h
fi