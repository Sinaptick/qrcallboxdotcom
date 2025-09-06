#!/bin/bash

echo "=== DNS Propagation Check for qrcallbox.com ==="
echo ""

# Check local DNS
echo "1. Local DNS:"
nslookup qrcallbox.com | grep -A2 "Answer:" | grep Address || nslookup qrcallbox.com | grep Address | tail -1

echo ""
echo "2. Google DNS (8.8.8.8):"
nslookup qrcallbox.com 8.8.8.8 | grep -A2 "Answer:" | grep Address || nslookup qrcallbox.com 8.8.8.8 | grep Address | tail -n +2

echo ""
echo "3. Cloudflare DNS (1.1.1.1):"
nslookup qrcallbox.com 1.1.1.1 | grep -A2 "Answer:" | grep Address || nslookup qrcallbox.com 1.1.1.1 | grep Address | tail -n +2

echo ""
echo "4. OpenDNS (208.67.222.222):"
nslookup qrcallbox.com 208.67.222.222 | grep -A2 "Answer:" | grep Address || nslookup qrcallbox.com 208.67.222.222 | grep Address | tail -n +2

echo ""
echo "5. Quad9 DNS (9.9.9.9):"
nslookup qrcallbox.com 9.9.9.9 | grep -A2 "Answer:" | grep Address || nslookup qrcallbox.com 9.9.9.9 | grep Address | tail -n +2

echo ""
echo "6. Site Status Check:"
echo -n "HTTP Response: "
curl -s -o /dev/null -w "%{http_code}" -I --resolve qrcallbox.com:443:151.101.1.195 https://qrcallbox.com/

echo ""
echo ""
echo "7. Testing actual QR code URL:"
echo -n "QR Code URL Response: "
curl -s -o /dev/null -w "%{http_code}" -I --resolve qrcallbox.com:443:151.101.1.195 https://qrcallbox.com/s?t=test

echo ""
echo ""
echo "=== Expected IPs for Firebase: ==="
echo "151.101.1.195"
echo "151.101.65.195"
echo ""
echo "=== Old/Wrong IPs to avoid: ==="
echo "199.36.158.100 (GoDaddy parking)"
echo "45.54.28.15 (Old IP)"