import React, { useRef, useState } from "react";
const POSTER_IMAGE = "/poster-template.png";



const PosterWithQR = React.forwardRef(function PosterWithQR({ qrDataUrl }, ref) {
  const printRef = useRef();
  const [posterDataUrl, setPosterDataUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  // Convert poster image to data URL for printing (avoids blank print)
  React.useEffect(() => {
    let isMounted = true;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = POSTER_IMAGE;
    img.onload = () => {
      if (!isMounted) return;
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
      setPosterDataUrl(canvas.toDataURL("image/png"));
      setLoading(false);
    };
    return () => { isMounted = false; };
  }, []);

  React.useImperativeHandle(ref, () => ({
    print: handlePrint
  }));

  function handlePrint() {
    if (!printRef.current || !posterDataUrl || !qrDataUrl) return;
    
    const win = window.open('', '', 'width=800,height=1200');
    win.document.write(`
      <html><head><title>Print QR Poster</title>
      <style>
        body { margin: 0; }
        .label-wrapper {
          width: 3.5in;
          height: 5in;
          margin: 0 auto;
          position: relative;
          border: 1px solid #ccc;
        }
        .label-content {
          position: absolute;
          width: 100%;
          height: 100%;
          top: 0;
          left: 0;
        }
        .label-content img.poster-img {
          width: 100%;
          height: 100%;
          position: absolute;
          top: 0;
          left: 0;
          z-index: 0;
        }
        .qr-area {
          position: absolute;
          width: 1.55in;
          height: 1.55in;
          bottom: 0.20in;
          left: 50%;
          transform: translateX(-50%);
          background: white;
          padding: 0;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .qr-area img {
          width: 1.55in;
          height: 1.55in;
          display: block;
        }
        @media print {
          body * { visibility: hidden; }
          .label-wrapper, .label-wrapper * { visibility: visible; }
          .label-wrapper { position: absolute; top: 0; left: 0; }
        }
      </style>
      </head><body>
        <div class="label-wrapper">
          <div class="label-content">
            <img src="${posterDataUrl}" alt="Poster" class="poster-img" />
            <div class="qr-area">
              <img src="${qrDataUrl}" alt="QR code" />
            </div>
          </div>
        </div>
      </body></html>`);
    win.document.close();
    win.focus();
    
    // Wait for images to load before printing
    setTimeout(() => {
      win.print();
      setTimeout(() => win.close(), 500);
    }, 1000);
  }

  if (loading) {
    return <div className="w-64 h-64 flex items-center justify-center text-gray-400">Loading poster…</div>;
  }

  return (
    <div>
      <div ref={printRef} className="label-wrapper" style={{ width: '3.5in', height: '5in', margin: '0 auto', position: 'relative', border: '1px solid #ccc' }}>
        <div className="label-content" style={{ position: 'absolute', width: '100%', height: '100%', top: 0, left: 0 }}>
          <img src={posterDataUrl} alt="Poster" className="poster-img" style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 0 }} />
          {qrDataUrl && (
            <div className="qr-area" style={{ position: 'absolute', width: '1.55in', height: '1.55in', bottom: '0.20in', left: '50%', transform: 'translateX(-50%)', background: 'white', padding: 0, zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src={qrDataUrl} alt="QR code" style={{ width: '1.55in', height: '1.55in', display: 'block' }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default PosterWithQR;
