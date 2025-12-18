import React, { useState, useRef, useEffect } from "react";
import QR from "qrcode";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "./config/firebase.config.js";

/**
 * Location Test Page - New QR Generation Method
 *
 * Uses predefined locations + aisle markers (Letter + Number - Section)
 * Example: "A1-2" = Aisle A1, Section 2
 */

const DPI = 450;
const WIDTH_CM = 15.5;
const HEIGHT_CM = 14.2;
const WIDTH_INCHES = WIDTH_CM / 2.54;
const HEIGHT_INCHES = HEIGHT_CM / 2.54;
const BLEED_PIXELS = 3;
const WIDTH_PX = Math.round(WIDTH_INCHES * DPI);
const HEIGHT_PX = Math.round(HEIGHT_INCHES * DPI);
const TOTAL_WIDTH_PX = WIDTH_PX + (BLEED_PIXELS * 2);
const TOTAL_HEIGHT_PX = HEIGHT_PX + (BLEED_PIXELS * 2);

const TRUE_BLUE = "#0071CE";
const WHITE = "#FFFFFF";

// Locations are now loaded from Firestore (qr_locations collection)
// Managed via Admin Panel > Departments

function Button({ children, onClick, disabled, className = "" }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={"inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm " + className}
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
  const font = new FontFace(name, "url(" + url + ")");
  await font.load();
  document.fonts.add(font);
  return font;
}

export default function LocationTest() {
  const [store, setStore] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [aisleLetter, setAisleLetter] = useState("");
  const [aisleNumber, setAisleNumber] = useState("");
  const [sectionNumber, setSectionNumber] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sparkImg, setSparkImg] = useState(null);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [locations, setLocations] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const canvasRef = useRef(null);

  // Load locations from Firestore
  useEffect(() => {
    async function loadLocations() {
      try {
        const q = query(collection(db, "qr_locations"), orderBy("order", "asc"));
        const snap = await getDocs(q);
        const locs = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(l => l.active !== false);
        setLocations(locs);
      } catch (error) {
        console.error("Failed to load locations:", error);
      } finally {
        setLocationsLoading(false);
      }
    }
    loadLocations();
  }, []);

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

  // Get location marker string (format: A1-2 = Aisle A1, Section 2)
  const getLocationMarker = () => {
    if (!aisleLetter && !aisleNumber && !sectionNumber) return "";
    let marker = "";
    if (aisleLetter) marker += aisleLetter.toUpperCase();
    if (aisleNumber) marker += aisleNumber;
    if (sectionNumber) marker += "-" + sectionNumber;
    return marker;
  };

  // Get full location description
  const getFullLocation = () => {
    const loc = locations.find(l => l.id === selectedLocation);
    if (!loc) return "";
    const marker = getLocationMarker();
    return marker ? loc.name + " " + marker : loc.name;
  };

  const ready = /^\d{3,6}$/.test(store.trim()) && selectedLocation && !error && !busy && fontsLoaded && !locationsLoading;

  function validate() {
    setError("");
    const s = store.trim();
    if (!s) return setError("Please enter a store number.");
    if (!/^\d{3,6}$/.test(s)) return setError("Store number must be 3-6 digits.");
    if (!selectedLocation) return setError("Please select a location.");
    if (aisleLetter && !/^[A-Za-z]$/.test(aisleLetter)) return setError("Aisle letter must be A-Z.");
    if (aisleNumber && !/^\d{1,3}$/.test(aisleNumber)) return setError("Aisle number must be 1-3 digits.");
    if (sectionNumber && !/^\d{1,3}$/.test(sectionNumber)) return setError("Section must be 1-3 digits.");
    return true;
  }

  async function generate() {
    setError("");
    try {
      if (!validate()) return;
      setBusy(true);
      setQrDataUrl("");

      const marker = getLocationMarker();
      // Compact format: store:locationId:marker (e.g., 1458:beauty:A1-2)
      const compactData = store + ":" + selectedLocation + (marker ? ":" + marker : "");
      const testUrl = window.location.origin + "/s?d=" + btoa(compactData);

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

    ctx.fillStyle = TRUE_BLUE;
    ctx.fillRect(0, 0, TOTAL_WIDTH_PX, TOTAL_HEIGHT_PX);

    const contentTop = BLEED_PIXELS;
    const contentHeight = HEIGHT_PX;
    const centerX = TOTAL_WIDTH_PX / 2;

    const headerY = contentTop + contentHeight * 0.08;
    ctx.fillStyle = WHITE;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const fontSize = Math.round(contentHeight * 0.07);
    ctx.font = fontSize + "px EverydaySans-Bold";
    ctx.fillText("Scan for an associate!", centerX, headerY);

    const sparkAspect = sparkImg.width / sparkImg.height;
    const sparkHeight = contentHeight * 0.35;
    const sparkWidth = sparkHeight * sparkAspect;
    const sparkX = centerX - sparkWidth / 2;
    const sparkY = contentTop + contentHeight * 0.18;

    ctx.drawImage(sparkImg, sparkX, sparkY, sparkWidth, sparkHeight);

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

    const infoY = contentTop + contentHeight * 0.96;
    ctx.fillStyle = WHITE;
    const infoFontSize = Math.round(contentHeight * 0.028);
    ctx.font = infoFontSize + "px EverydaySans";
    ctx.textBaseline = "bottom";
    ctx.fillText("Store " + store + " - " + getFullLocation(), centerX, infoY);

    return canvas;
  }

  async function downloadPng() {
    const canvas = await generateRectImage();
    if (!canvas) return;

    const loc = PREDEFINED_LOCATIONS.find(l => l.id === selectedLocation);
    const marker = getLocationMarker();
    const filename = "QR_" + store + "_" + (loc?.id || "unknown") + (marker ? "_" + marker : "") + ".png";

    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = filename;
    a.click();
  }

  async function printQR() {
    const canvas = await generateRectImage();
    if (!canvas) return;

    const imgData = canvas.toDataURL("image/png");
    
    // Remove any existing print iframe
    const existingFrame = document.getElementById('print-frame');
    if (existingFrame) existingFrame.remove();
    
    // Create hidden iframe for printing (avoids popup blockers)
    const iframe = document.createElement('iframe');
    iframe.id = 'print-frame';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);
    
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print QR Code</title>
          <style>
            @page {
              size: letter;
              margin: 0;
            }
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            html, body {
              width: 100%;
              height: 100%;
              margin: 0;
              padding: 0;
            }
            .print-container {
              position: absolute;
              top: 4cm;
              left: 1.95cm;
              width: ${WIDTH_CM}cm;
              height: ${HEIGHT_CM}cm;
            }
            .print-container img {
              width: ${WIDTH_CM}cm;
              height: ${HEIGHT_CM}cm;
              object-fit: contain;
            }
            @media print {
              body {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
            }
          </style>
        </head>
        <body>
          <div class="print-container">
            <img src="${imgData}" alt="QR Code" />
          </div>
        </body>
      </html>
    `);
    doc.close();
    
    // Wait for image to load then print
    iframe.contentWindow.onload = function() {
      setTimeout(function() {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      }, 250);
    };
  }

  useEffect(() => {
    if (!qrDataUrl || !canvasRef.current || !sparkImg || !fontsLoaded) return;

    (async () => {
      const canvas = await generateRectImage();
      if (!canvas) return;

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
  }, [qrDataUrl, store, selectedLocation, aisleLetter, aisleNumber, sectionNumber, sparkImg, fontsLoaded]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <a href="/" className="text-indigo-400 hover:text-indigo-300 text-sm">Back to App</a>
        </div>

        <h1 className="text-2xl font-bold mb-2">Location-Based QR Test</h1>
        <p className="text-gray-400 mb-4">
          Testing standardized location names with aisle/section markers
        </p>

        <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-xl p-3 mb-6 text-sm text-yellow-200">
          Test page for the new location system. QR codes are for testing only.
        </div>

        {/* Problem/Solution Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-800 rounded-xl p-4">
            <h3 className="font-semibold mb-2 text-red-400">Current Problem</h3>
            <div className="flex flex-wrap gap-1 text-xs">
              {["Cosmetics", "cosmetics", "Cologne", "Beauty"].map(name => (
                <span key={name} className="px-2 py-1 bg-red-900/30 rounded text-red-300">{name}</span>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">All different in reports</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-4">
            <h3 className="font-semibold mb-2 text-green-400">New Solution</h3>
            <div className="flex gap-2 text-xs">
              <span className="px-2 py-1 bg-green-900/30 rounded text-green-300">Beauty & Cosmetics</span>
              <span className="px-2 py-1 bg-blue-900/30 rounded text-blue-300">A1-2</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">Consistent + precise location</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Form */}
          <div className="bg-gray-800 rounded-xl p-4">
            <h3 className="font-semibold mb-4">Generate QR Code</h3>

            {/* Store Number */}
            <label className="block mb-4">
              <span className="text-sm text-gray-300">Store Number</span>
              <input
                type="text"
                className="mt-1 w-full rounded-xl border border-gray-600 bg-gray-700 text-white px-3 py-2 placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. 1458"
                value={store}
                onChange={(e) => setStore(e.target.value)}
              />
            </label>

            {/* Location Dropdown */}
            <label className="block mb-4">
              <span className="text-sm text-gray-300">Location</span>
              <select
                className="mt-1 w-full rounded-xl border border-gray-600 bg-gray-700 text-white px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
              >
                <option value="">Select a location...</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </label>

            {/* Location Marker: Aisle Letter, Aisle Number, Section */}
            <div className="mb-4">
              <div className="text-sm text-gray-300 mb-2">Location Marker (optional)</div>
              <div className="flex gap-2 items-center">
                <div className="w-16">
                  <input
                    type="text"
                    className="w-full rounded-xl border border-gray-600 bg-gray-700 text-white px-3 py-2 text-center placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="A"
                    maxLength={1}
                    value={aisleLetter}
                    onChange={(e) => setAisleLetter(e.target.value.replace(/[^A-Za-z]/g, "").slice(0, 1).toUpperCase())}
                  />
                  <div className="text-xs text-gray-500 text-center mt-1">Aisle</div>
                </div>
                <div className="w-20">
                  <input
                    type="text"
                    className="w-full rounded-xl border border-gray-600 bg-gray-700 text-white px-3 py-2 text-center placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="1"
                    value={aisleNumber}
                    onChange={(e) => setAisleNumber(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  />
                  <div className="text-xs text-gray-500 text-center mt-1">Number</div>
                </div>
                <span className="text-gray-500 text-xl pb-5">-</span>
                <div className="w-20">
                  <input
                    type="text"
                    className="w-full rounded-xl border border-gray-600 bg-gray-700 text-white px-3 py-2 text-center placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="2"
                    value={sectionNumber}
                    onChange={(e) => setSectionNumber(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  />
                  <div className="text-xs text-gray-500 text-center mt-1">Section</div>
                </div>
              </div>
              <div className="text-xs text-gray-500 mt-2">
                Example: A1-2 = Aisle A1, Section 2
              </div>
            </div>

            {/* Preview of full location */}
            {(selectedLocation || aisleLetter || aisleNumber || sectionNumber) && (
              <div className="mb-4 p-3 bg-gray-700 rounded-lg">
                <div className="text-xs text-gray-400 mb-1">Full Location:</div>
                <div className="font-semibold text-indigo-300">{getFullLocation() || "Select a location"}</div>
              </div>
            )}

            {error && <div className="mb-4 text-sm text-red-400">{error}</div>}

            <div className="flex flex-wrap gap-2">
              <Button onClick={generate} disabled={!ready}>
                {busy ? "Generating..." : (fontsLoaded && !locationsLoading) ? "Generate QR" : "Loading..."}
              </Button>
              <Button onClick={downloadPng} disabled={!qrDataUrl} className="bg-emerald-600 hover:bg-emerald-700">
                Download PNG
              </Button>
              <Button onClick={printQR} disabled={!qrDataUrl} className="bg-blue-600 hover:bg-blue-700">
                🖨️ Print
              </Button>
            </div>
          </div>

          {/* Preview */}
          <div className="bg-gray-800 rounded-xl p-4">
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
                    height: (320 * (HEIGHT_CM / WIDTH_CM)) + "px"
                  }}
                >
                  <span className="text-white opacity-50">QR Preview</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Benefits */}
        <div className="bg-gray-800 rounded-xl p-4 mt-6">
          <h3 className="font-semibold mb-3">Benefits</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-400">
            <div className="flex gap-2"><span className="text-green-400">+</span> Consistent reporting (all cosmetics = Beauty)</div>
            <div className="flex gap-2"><span className="text-green-400">+</span> Heatmaps by aisle/section</div>
            <div className="flex gap-2"><span className="text-blue-400">+</span> Filter notifications by department</div>
            <div className="flex gap-2"><span className="text-blue-400">+</span> Route to department specialists</div>
          </div>
        </div>

        {/* All Locations */}
        <div className="bg-gray-800 rounded-xl p-4 mt-6">
          <h3 className="font-semibold mb-3">Available Departments ({locations.length})</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            {locationsLoading ? (
              <div className="col-span-4 text-gray-400">Loading...</div>
            ) : locations.map(loc => (
              <div key={loc.id} className="bg-gray-700 rounded px-2 py-1 text-white truncate">
                {loc.name}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
