import React from 'react';

export default function QRLockIcon({ className = "h-6 w-6 text-white" }) {
  return (
    <svg 
      viewBox="0 0 26 26" 
      className={className}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Message bubble with tail from your updated SVG */}
      <path 
        d="m3.06,2c-1.14,0 -2.06,0.97 -2.06,2.16l0,15.14c0,1.19 0.92,2.16 2.06,2.16l1.93,0.14l-3.73,4.05l10.42,-3.92l9.9,-0.27c1.14,0 2.06,-0.97 2.06,-2.16l0,-15.14c0,-1.19 -0.92,-2.16 -2.06,-2.16l-18.52,0z" 
        fill="currentColor"
      />
      
      {/* QR positioning squares from your design */}
      <g fill="none" stroke="white" strokeWidth="1.5" transform="translate(0.75 0) matrix(1 0 0 1 1 0)">
        {/* Top-left square */}
        <rect x="5" y="6" width="4" height="4"/>
        
        {/* Top-right square */}
        <rect x="12" y="6" width="4" height="4"/>
        
        {/* Bottom-left square */}
        <rect x="5" y="13" width="4" height="4"/>
      </g>
      
      {/* Key icon elements from your updated SVG */}
      <g fill="white">
        {/* Key head (circle) */}
        <circle 
          cx="1.41" cy="0.6" r="1.3" 
          fill="none" 
          stroke="white" 
          strokeWidth="0.8" 
          transform="matrix(1.04269 0.941647 -1.06267 0.959696 14.5678 12.3956)"
        />
        {/* Key shaft - updated positioning */}
        <rect 
          x="13.83" y="2.7" width="2.5" height="0.6" 
          transform="translate(20.1072 19.0951) scale(0.946025 0.924475) translate(-20.1072 -19.0951) matrix(1.52466 1.35751 -1.55388 1.38353 -0.660839 -7.70445)"
        />
        {/* Key teeth 1 - updated positioning */}
        <rect 
          x="28.92" y="-0.54" width="0.3" height="0.8" 
          transform="translate(18.075 18.1222) scale(1.1571 1.18894) translate(-18.075 -18.1222) matrix(1.69319 2.13421 -2.04735 1.87553 -29.7545 -44.1305)"
        />
        {/* Key teeth 2 - updated positioning */}
        <rect 
          x="17.98" y="15.75" width="1.62" height="0.75" 
          transform="rotate(135 18.7906 16.123)"
        />
      </g>
    </svg>
  );
}

// Alternate version with more defined message bubble shape
export function QRLockIconBubble({ className = "h-6 w-6 text-white" }) {
  return (
    <svg 
      viewBox="0 0 36 36" 
      className={className}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Message bubble with tail pointing down-left */}
      <path d="M 6 3 
               C 4 3 3 4 3 6 
               L 3 22 
               C 3 24 4 25 6 25 
               L 8 25
               L 3 32
               L 10 25
               L 30 25 
               C 32 25 33 24 33 22 
               L 33 6 
               C 33 4 32 3 30 3 
               Z" 
            fill="currentColor"
            opacity="0.1"/>
      
      {/* QR Code Pattern */}
      {/* Top-left corner square */}
      <rect x="6" y="6" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2"/>
      <rect x="8" y="8" width="6" height="6" fill="currentColor"/>
      
      {/* Top-right corner square */}
      <rect x="20" y="6" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2"/>
      <rect x="22" y="8" width="6" height="6" fill="currentColor"/>
      
      {/* Bottom-left corner square */}
      <rect x="6" y="18" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="8" y="20" width="3" height="3" fill="currentColor"/>
      
      {/* Middle QR pattern dots */}
      <rect x="14" y="18" width="2" height="2" fill="currentColor"/>
      <rect x="16" y="20" width="2" height="2" fill="currentColor"/>
      <rect x="18" y="18" width="2" height="2" fill="currentColor"/>
      
      {/* Lock icon in bottom-right corner */}
      <g transform="translate(22, 18)">
        {/* Lock body */}
        <rect x="0" y="3" width="7" height="5" rx="0.5" fill="currentColor"/>
        {/* Lock shackle */}
        <path d="M 1.5 3 L 1.5 1.5 Q 1.5 0 3.5 0 Q 5.5 0 5.5 1.5 L 5.5 3" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="1.2"
              strokeLinecap="round"/>
        {/* Keyhole */}
        <circle cx="3.5" cy="5" r="0.8" fill="white"/>
        <rect x="3" y="5" width="1" height="2" fill="white"/>
      </g>
    </svg>
  );
}