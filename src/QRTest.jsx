import React, { useState, useRef, useEffect } from "react";
import QR from "qrcode";

/**
 * QR Test Page - 16cm x 14.5cm Rectangle with Walmart Branding
 * 
 * Layout for pre-perforated pages on letter size:
 * - Width: 16cm (6.299")
 * - Height: 14.5cm (5.709")
 * - Left margin: 2cm
 * - Right margin: 3cm
 * 
 * TEST MODE: No authentication required
 */

const DPI = 450;

// Dimensions in cm, converted to inches
const WIDTH_CM = 16;
const HEIGHT_CM = 14.5;
const WIDTH_INCHES = WIDTH_CM / 2.54;   // 6.299"
const HEIGHT_INCHES = HEIGHT_CM / 2.54; // 5.709"

const BLEED_PIXELS = 4;

const LEFT_MARGIN = 2 / 2.54;   // 2cm = 0.787"
const RIGHT_MARGIN = 3 / 2.54;  // 3cm = 1.181"
const TOP_MARGIN = 4 / 2.54;    // 4cm (keeping same as before)

const WIDTH_PX = Math.round(WIDTH_INCHES * DPI);   // ~2835px
const HEIGHT_PX = Math.round(HEIGHT_INCHES * DPI); // ~2569px
const BLEED_INCHES = BLEED_PIXELS / DPI;
const TOTAL_WIDTH_PX = WIDTH_PX + (BLEED_PIXELS * 2);
const TOTAL_HEIGHT_PX = HEIGHT_PX + (BLEED_PIXELS * 2);

const TRUE_BLUE = "#0071CE";
const SPARK_YELLOW = "#FFC220";
const WHITE = "#FFFFFF";

function Button({ children, onClick, disabled, className = "" }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold
                 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm ${className}`}
    >
      {children}
    </button>
  );
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function loadFont(name, url) {
  const font = new FontFace(name, `url(${url})`);
  await font.load();
  document.fonts.add(font);
  return font;
}

export default function QRTest() {
  const [store, setStore] = useState("");
  const [area, setArea] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sparkImg, setSparkImg] = useState(null);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    Promise.all([
      loadImage("/spark.png"),
      loadFont("EverydaySans", "/fonts/EverydaySans-Regular-Web.woff2"),
      loadFont("EverydaySans-Bold", "/fonts/EverydaySans-Bold-Web.woff2"),
    ]).then(([spark]) => {
      setSparkImg(spark);
      setFontsLoaded(true);
    }).catch(console.error);
  }, []);

  const ready = /^\d{3,6}$/.test(store.trim()) && !!area.trim() && !error && !busy && fontsLoaded;

  function validate() {
    setError("");
    const s = store.trim();
    const a = area.trim();
    if (!s || !a) return setError("Please enter both Store number and Area.");
    if (!/^\d{3,6}$/.test(s)) return setError("Store number must be 3-6 digits.");
    if (!/^[a-zA-Z0-9\s._-]{1,50}$/.test(a)) {
      return setError("Area allows letters, numbers, space, . _ - (max 50 chars).");
    }
    return { s, a };
  }

  async function generate() {
    setError("");
    try {
      const ok = validate();
      if (!ok) return;
      setBusy(true);
      setQrDataUrl("");
      
      const testUrl = `${window.location.origin}/s?t=TEST_${store}_${area}_${Date.now()}`;
      
      const dataUrl = await QR.toDataURL(testUrl, {
        width: 1500,
        errorCorrectionLevel: "M",
        margin: 0,
        color: { dark: "#000000", light: "#FFFFFF" },
      });
      setQrDataUrl(dataUrl);
    } catch (e) {
      console.error(e);
      setQrDataUrl("");
      setError(e.message || "Could not generate QR. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function generateRectImage() {
    if (!qrDataUrl || !sparkImg || !fontsLoaded) return null;

    const canvas = document.createElement("canvas");
    canvas.width = TOTAL_WIDTH_PX;
    canvas.height = TOTAL_HEIGHT_PX;
    const ctx = canvas.getContext("2d");

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Fill with True Blue background (extends into bleed)
    ctx.fillStyle = TRUE_BLUE;
    ctx.fillRect(0, 0, TOTAL_WIDTH_PX, TOTAL_HEIGHT_PX);

    const contentLeft = BLEED_PIXELS;
    const contentTop = BLEED_PIXELS;
    const contentWidth = WIDTH_PX;
    const contentHeight = HEIGHT_PX;
    const centerX = TOTAL_WIDTH_PX / 2;
    
    // Header text "Scan for an associate!"
    const headerY = contentTop + contentHeight * 0.08;
    ctx.fillStyle = WHITE;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    
    const fontSize = Math.round(contentHeight * 0.07);
    ctx.font = `${fontSize}px EverydaySans-Bold`;
    ctx.fillText("Scan for an associate!", centerX, headerY);

    // Walmart Spark (centered)
    const sparkAspect = sparkImg.width / sparkImg.height;
    const sparkHeight = contentHeight * 0.35;
    const sparkWidth = sparkHeight * sparkAspect;
    const sparkX = centerX - sparkWidth / 2;
    const sparkY = contentTop + contentHeight * 0.18;
    
    ctx.drawImage(sparkImg, sparkX, sparkY, sparkWidth, sparkHeight);

    // QR Code (smaller, centered)
    const qrImg = await loadImage(qrDataUrl);

    const qrSize = Math.round(contentHeight * 0.32);
    const qrX = centerX - qrSize / 2;
    const qrY = contentTop + contentHeight * 0.58;

    const qrPadding = Math.round(qrSize * 0.07);
    const qrBgRadius = Math.round(qrSize * 0.05);
    ctx.fillStyle = WHITE;
    ctx.beginPath();
    ctx.roundRect(
      qrX - qrPadding, 
      qrY - qrPadding, 
      qrSize + qrPadding * 2, 
      qrSize + qrPadding * 2, 
      qrBgRadius
    );
    ctx.fill();

    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

    // Store/Area info at bottom
    const infoY = contentTop + contentHeight * 0.96;
    ctx.fillStyle = WHITE;
    const infoFontSize = Math.round(contentHeight * 0.028);
    ctx.font = `${infoFontSize}px EverydaySans`;
    ctx.textBaseline = "bottom";
    ctx.fillText(`Store ${store} - ${area}`, centerX, infoY);

    return canvas;
  }

  async function downloadPng() {
    const canvas = await generateRectImage();
    if (!canvas) return;

    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `QR_Walmart_${store}_${area}.png`;
    a.click();
  }

  async function handlePrint() {
    const canvas = await generateRectImage();
    if (!canvas) return;

    const dataUrl = canvas.toDataURL("image/png");
    
    const win = window.open("", "", "width=900,height=1100");
    win.document.write(`
      <html><head><title>Print QR</title>
      <style>
        @page { size: letter; margin: 0; }
        body { margin: 0; padding: 0; }
        .page {
          width: 8.5in;
          height: 11in;
          position: relative;
          page-break-after: always;
        }
        .rect-container {
          position: absolute;
          left: calc(${LEFT_MARGIN}in - ${BLEED_INCHES}in);
          top: calc(${TOP_MARGIN}in - ${BLEED_INCHES}in);
          width: calc(${WIDTH_INCHES}in + ${BLEED_INCHES * 2}in);
          height: calc(${HEIGHT_INCHES}in + ${BLEED_INCHES * 2}in);
        }
        .rect-container img { width: 100%; height: 100%; display: block; }
        .perf-guide {
          position: absolute;
          left: ${LEFT_MARGIN}in;
          top: ${TOP_MARGIN}in;
          width: ${WIDTH_INCHES}in;
          height: ${HEIGHT_INCHES}in;
          border: 1px dashed rgba(255,0,0,0.3);
          pointer-events: none;
          box-sizing: border-box;
        }
        @media print { .perf-guide { display: none; } }
        @media screen {
          .page {
            border: 1px solid #ccc;
            margin: 20px auto;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
        }
      </style>
      </head><body>
        <div class="page">
          <div class="rect-container">
            <img src="${dataUrl}" alt="QR Rectangle" />
          </div>
          <div class="perf-guide"></div>
        </div>
      </body></html>`);
    win.document.close();
    win.focus();
    
    setTimeout(() => {
      win.print();
      setTimeout(() => win.close(), 500);
    }, 500);
  }

  useEffect(() => {
    if (!qrDataUrl || !canvasRef.current || !sparkImg || !fontsLoaded) return;
    
    (async () => {
      const canvas = await generateRectImage();
      if (!canvas) return;
      
      // Preview maintains aspect ratio
      const aspectRatio = TOTAL_WIDTH_PX / TOTAL_HEIGHT_PX;
      const previewWidth = 400;
      const previewHeight = Math.round(previewWidth / aspectRatio);
      
      canvasRef.current.width = previewWidth;
      canvasRef.current.height = previewHeight;
      const previewCtx = canvasRef.current.getContext("2d");
      previewCtx.imageSmoothingEnabled = true;
      previewCtx.imageSmoothingQuality = "high";
      previewCtx.drawImage(canvas, 0, 0, previewWidth, previewHeight);
    })();
  }, [qrDataUrl, store, area, sparkImg, fontsLoaded]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <a href="/" className="text-indigo-400 hover:text-indigo-300 text-sm">← Back to App</a>
        </div>

        <h1 className="text-2xl font-bold mb-2">QR Test Page</h1>
        <p className="text-gray-400 mb-4">
          {WIDTH_CM}cm × {HEIGHT_CM}cm rectangle with Walmart branding
        </p>
        
        <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-xl p-3 mb-6 text-sm text-yellow-200">
          ⚠️ TEST MODE: QR codes are for layout testing only.
        </div>

        {/* Specs */}
        <div className="bg-gray-800 rounded-xl p-4 mb-6 text-sm">
          <h3 className="font-semibold mb-2">Specifications</h3>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded" style={{backgroundColor: TRUE_BLUE}}></div>
              <span className="text-gray-400 text-xs">True Blue</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded" style={{backgroundColor: SPARK_YELLOW}}></div>
              <span className="text-gray-400 text-xs">Spark Yellow</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded border border-gray-600" style={{backgroundColor: WHITE}}></div>
              <span className="text-gray-400 text-xs">White</span>
            </div>
          </div>
          <ul className="text-gray-400 space-y-1 text-xs">
            <li>• Size: {WIDTH_CM}cm × {HEIGHT_CM}cm ({WIDTH_INCHES.toFixed(2)}" × {HEIGHT_INCHES.toFixed(2)}")</li>
            <li>• Margins: 2cm left, 3cm right</li>
            <li>• Font: Everyday Sans {fontsLoaded ? "✓" : "(loading...)"}</li>
            <li>• Resolution: {DPI} DPI ({WIDTH_PX}×{HEIGHT_PX}px)</li>
          </ul>
        </div>

        {/* Input Form */}
        <div className="bg-gray-800 rounded-xl p-4 mb-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm text-gray-300">Store number</span>
              <input
                className="mt-1 w-full rounded-xl border border-gray-600 bg-gray-700 text-white px-3 py-2
                           placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. 1458"
                value={store}
                onChange={(e) => setStore(e.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-sm text-gray-300">Area</span>
              <input
                className="mt-1 w-full rounded-xl border border-gray-600 bg-gray-700 text-white px-3 py-2
                           placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. Electronics"
                value={area}
                onChange={(e) => setArea(e.target.value)}
              />
            </label>
          </div>

          {error && <div className="mt-3 text-sm text-red-400">{error}</div>}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={generate} disabled={!ready}>
              {busy ? "Generating..." : fontsLoaded ? "Generate QR" : "Loading fonts..."}
            </Button>

            <Button onClick={downloadPng} disabled={!qrDataUrl} className="bg-emerald-600 hover:bg-emerald-700">
              Download PNG
            </Button>

            <Button onClick={handlePrint} disabled={!qrDataUrl} className="bg-purple-600 hover:bg-purple-700">
              Print
            </Button>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-gray-800 rounded-xl p-6">
          <h3 className="font-semibold mb-4">Preview</h3>
          <div className="flex justify-center">
            {qrDataUrl ? (
              <canvas
                ref={canvasRef}
                className="rounded-xl shadow-lg"
                style={{ maxWidth: "100%", height: "auto" }}
              />
            ) : (
              <div 
                className="rounded-xl flex items-center justify-center text-gray-500" 
                style={{
                  backgroundColor: TRUE_BLUE,
                  width: "320px",
                  height: `${320 * (HEIGHT_CM / WIDTH_CM)}px`
                }}
              >
                <span className="text-white opacity-50">QR Preview</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
