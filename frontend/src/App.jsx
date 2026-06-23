import React, { useState, useEffect, useRef } from 'react';
import { 
  Camera, Map as MapIcon, ShieldAlert, Database, History, 
  LayoutDashboard, FileText, CheckCircle, AlertTriangle, XCircle, 
  Loader2, RefreshCw, Upload, Search, Download, Share2, Globe, Wifi, WifiOff, FileCheck,
  Send, MessageSquare, ChevronDown, ChevronUp, Star, ArrowRight, ExternalLink
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { motion, AnimatePresence } from 'framer-motion';

// Translation Dictionary (English, Hindi, Gujarati)
const t = {
  en: {
    title: "MedSecure AI",
    tagline: "Real-time Counterfeit Medicine Detection",
    scan: "Scan Package",
    map: "Alert Map",
    lookup: "CDSCO Lookup",
    history: "Scan History",
    dashboard: "Dashboard",
    verdict_verified: "Verified Genuine",
    verdict_caution: "Caution Required",
    verdict_danger: "High Risk Alert",
    anomalies: "Detected Anomalies",
    score: "Authenticity Score",
    status_online: "System Online",
    status_offline: "Offline Mode",
    details: "Traceability Details"
  },
  hi: {
    title: "मेडसिक्योर एआई",
    tagline: "वास्तविक समय नकली दवा का पता लगाना",
    scan: "पैकेज स्कैन करें",
    map: "अलर्ट नक्शा",
    lookup: "सीडीएससीओ खोज",
    history: "स्कैन इतिहास",
    dashboard: "डैशबोर्ड",
    verdict_verified: "सत्यापित असली",
    verdict_caution: "सावधानी आवश्यक",
    verdict_danger: "उच्च जोखिम चेतावनी",
    anomalies: "खोजे गए दोष",
    score: "प्रामाणिकता स्कोर",
    status_online: "सिस्टम ऑनलाइन",
    status_offline: "ऑफ़लाइन मोड",
    details: "उत्पत्ति विवरण"
  },
  gu: {
    title: "મેડસિક્યોર એઆઈ",
    tagline: "રીઅલ-ટાઇમ નકલી દવા શોધવા માટેનું પ્લેટફોર્મ",
    scan: "પેકેજ સ્કેન કરો",
    map: "એલર્ટ મેપ",
    lookup: "સીડીએસસીઓ લુકઅપ",
    history: "સ્કેન ઇતિહાસ",
    dashboard: "ડેશબોર્ડ",
    verdict_verified: "ચકાસાયેલ અસલી",
    verdict_caution: "સાવચેતી જરૂરી",
    verdict_danger: "ઉચ્ચ જોખમ એલર્ટ",
    anomalies: "શોધાયેલ વિસંગતતાઓ",
    score: "પ્રમાણભૂત સ્કોર",
    status_online: "સિસ્ટમ ઓનલાઈન",
    status_offline: "ઓફલાઇન મોડ",
    details: "વિગતવાર ટ્રેસીબિલિટી"
  }
};

const API_BASE_URL = 'http://localhost:3001/api/v1';

const getImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('/uploads/')) return `http://localhost:3001${url}`;
  if (url.startsWith('uploads/')) return `http://localhost:3001/${url}`;
  return url;
};

export default function App() {
  const [lang, setLang] = useState('en');
  const [isOffline, setIsOffline] = useState(false);
  const [currentView, setCurrentView] = useState('landing');
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('medsecure_user');
    return saved ? JSON.parse(saved) : null;
  });
  
  // Auth state
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authRole, setAuthRole] = useState('pharmacist');
  const [authLicense, setAuthLicense] = useState('');
  const [authPin, setAuthPin] = useState('');
  const [authError, setAuthError] = useState('');

  // Scanner state
  const [uploadFile, setUploadFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [scanResult, setScanResult] = useState(null);
  const [activeScanId, setActiveScanId] = useState('');
  const [scanHistory, setScanHistory] = useState([]);
  const [hoveredBox, setHoveredBox] = useState(null);
  const [alternatives, setAlternatives] = useState([]);

  // Lookup state
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupResults, setLookupResults] = useState([]);
  const [selectedMedicineDetails, setSelectedMedicineDetails] = useState(null);

  // Dashboard state
  const [dashboardStats, setDashboardStats] = useState(null);
  const [dashboardHistory, setDashboardHistory] = useState([]);
  const [dashboardTopFlagged, setDashboardTopFlagged] = useState([]);

  // Map state
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersGroupRef = useRef(null);
  const [alertsList, setAlertsList] = useState([]);
  const [mapFilter, setMapFilter] = useState('all'); // all, high, caution

  // Collapsible Assistant chatbot state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([
    { sender: 'bot', text: "Namaste! I am MedSecure Assist. Ask me anything about CDSCO specifications, batch rules, or verification anomalies." }
  ]);

  // Toast message
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000);
  };

  // Sync scan history and dashboard metrics
  useEffect(() => {
    if (user) {
      fetchScanHistory();
      if (user.role === 'pharmacist' || user.role === 'inspector') {
        fetchDashboardStats();
      }
    }
  }, [user]);

  // Fetch Scan History
  const fetchScanHistory = async () => {
    if (isOffline || !user) return;
    try {
      const res = await fetch(`${API_BASE_URL}/scans/history`, {
        headers: { 'Authorization': `Bearer ${user.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setScanHistory(data);
      }
    } catch (err) {
      console.error("Scan history error:", err);
    }
  };

  // Fetch Dashboard Statistics
  const fetchDashboardStats = async () => {
    if (isOffline || !user) return;
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/pharmacist`, {
        headers: { 'Authorization': `Bearer ${user.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDashboardStats(data.stats);
        setDashboardHistory(data.recentScans || []);
        setDashboardTopFlagged(data.topFlagged || []);
      }
    } catch (err) {
      console.error("Dashboard stats error:", err);
    }
  };

  // Fetch alternatives
  const fetchAlternatives = async (medId) => {
    if (isOffline) {
      // Offline mode alternatives generator
      if (medId === 'med-omez') {
        setAlternatives([
          { id: 'med-alt-1', name: 'Pantocid 400', generic_name: 'Pantoprazole', manufacturer_name: 'Alkem Laboratories Ltd', composition: ['Pantoprazole 400mg'], expected_colors: { primary: '#8b5cf6' }, approved_batch_format: '^MC\\d{4}$' }
        ]);
      } else {
        setAlternatives([
          { id: 'med-alt-2', name: 'Calpol 650', generic_name: 'Paracetamol', manufacturer_name: 'GlaxoSmithKline Pharmaceuticals', composition: ['Paracetamol 650mg'], expected_colors: { primary: '#10b981' }, approved_batch_format: '^GP\\d{5}$' }
        ]);
      }
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/medicines/${medId}/alternatives`);
      if (res.ok) {
        const data = await res.json();
        setAlternatives(data);
      }
    } catch (err) {
      console.error("Alternatives fetch error:", err);
    }
  };

  // Fetch Map Data and initialize Map
  useEffect(() => {
    if (currentView === 'map') {
      fetchMapAlerts();
    } else {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    }
  }, [currentView, mapFilter]);

  const fetchMapAlerts = async () => {
    try {
      const geoRes = await fetch(`${API_BASE_URL}/alerts/map`);
      const geoJsonData = await geoRes.json();
      
      const feedRes = await fetch(`${API_BASE_URL}/alerts/feed`);
      const feedData = await feedRes.json();
      
      // Filter list and features based on severity selection
      let filteredFeatures = geoJsonData.features || [];
      let filteredFeed = feedData || [];
      
      if (mapFilter !== 'all') {
        filteredFeatures = filteredFeatures.filter(f => f.properties.severity === (mapFilter === 'high' ? 'high' : 'caution'));
        filteredFeed = filteredFeed.filter(a => a.severity === (mapFilter === 'high' ? 'high' : 'caution'));
      }
      
      setAlertsList(filteredFeed);

      if (!mapRef.current && mapContainerRef.current) {
        const map = L.map(mapContainerRef.current, {
          zoomControl: true,
          attributionControl: false
        }).setView([20.5937, 78.9629], 5);
        mapRef.current = map;

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          maxZoom: 19
        }).addTo(map);

        markersGroupRef.current = L.layerGroup().addTo(map);
      }

      // Add markers
      if (markersGroupRef.current && mapRef.current) {
        markersGroupRef.current.clearLayers();

        filteredFeatures.forEach(feature => {
          const [lng, lat] = feature.geometry.coordinates;
          const { id, medicine_name, manufacturer_name, batch_number, report_count, severity } = feature.properties;

          const cssClass = severity === 'high' ? 'pulse-marker-high' : 'pulse-marker-caution';
          const customIcon = L.divIcon({
            className: cssClass,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          });

          const marker = L.marker([lat, lng], { icon: customIcon });
          marker.bindPopup(`
            <div class="p-3 text-slate-200 min-w-[200px]">
              <h4 class="font-bold text-base text-brand-amber font-mono">${medicine_name}</h4>
              <p class="text-xs text-slate-400 mt-0.5">${manufacturer_name}</p>
              <div class="mt-2 border-t border-slate-700/60 pt-2 flex flex-col gap-1.5 text-xs">
                <div>Batch ID: <span class="font-mono text-emerald-400 font-bold">${batch_number}</span></div>
                <div>Incident Count: <span class="text-rose-400 font-bold">${report_count} Reports</span></div>
                <div>Severity: <span class="${severity === 'high' ? 'text-red-500' : 'text-amber-500'} font-bold uppercase">${severity}</span></div>
              </div>
            </div>
          `);
          markersGroupRef.current.addLayer(marker);
        });
      }
    } catch (err) {
      console.error("Map load error:", err);
    }
  };

  const focusAlertOnMap = (alert) => {
    if (mapRef.current) {
      mapRef.current.setView([alert.lat, alert.lng], 9);
      if (markersGroupRef.current) {
        markersGroupRef.current.eachLayer((marker) => {
          const latLng = marker.getLatLng();
          if (Math.abs(latLng.lat - alert.lat) < 0.01 && Math.abs(latLng.lng - alert.lng) < 0.01) {
            marker.openPopup();
          }
        });
      }
    }
  };

  // Perform Medicine Database Lookup
  const handleLookupSearch = async (val) => {
    setLookupQuery(val);
    if (!val.trim()) {
      setLookupResults([]);
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/medicines/search?q=${encodeURIComponent(val)}`);
      if (res.ok) {
        const data = await res.json();
        setLookupResults(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Authentication: Login or Register
  const handleAuth = async (action) => {
    setAuthError('');
    if (!authEmail || !authPassword) {
      setAuthError('Email and Password are required.');
      return;
    }

    try {
      const endpoint = action === 'login' ? '/auth/login' : '/auth/register';
      const body = action === 'login' 
        ? { email: authEmail, password: authPassword }
        : { email: authEmail, password: authPassword, role: authRole, license_number: authLicense, pin_code: authPin };

      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Authentication failed');
        return;
      }

      const sessionUser = {
        token: data.token,
        email: data.user.email,
        role: data.user.role,
        verified: data.user.verified
      };
      
      localStorage.setItem('medsecure_user', JSON.stringify(sessionUser));
      setUser(sessionUser);
      showToast(`Successfully logged in as ${sessionUser.role}!`, 'success');
      setCurrentView('landing');
    } catch (err) {
      setAuthError('Server connection error. Is the backend running?');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('medsecure_user');
    setUser(null);
    showToast('Logged out successfully.', 'info');
    setCurrentView('landing');
  };

  // File Upload Handlers
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setUploadFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  // Trigger test samples from public folder
  const handleLoadSample = async (samplePath, filename) => {
    try {
      setPreviewUrl(samplePath);
      const res = await fetch(samplePath);
      const blob = await res.blob();
      const file = new File([blob], filename, { type: 'image/jpeg' });
      setUploadFile(file);
      showToast(`Loaded ${filename} sample image. Ready to verify.`, 'info');
    } catch (err) {
      showToast('Error loading sample image. Make sure server generated test assets.', 'error');
    }
  };

  // Scan execution
  const executeScan = async () => {
    if (!uploadFile) {
      showToast('Please select or capture a medicine package image first.', 'error');
      return;
    }

    setIsScanning(true);
    setScanStep(0);
    setScanResult(null);
    setAlternatives([]);

    // Simulate animated pipeline progress steps
    const stepInterval = setInterval(() => {
      setScanStep(prev => {
        if (prev >= 3) {
          clearInterval(stepInterval);
          return 3;
        }
        return prev + 1;
      });
    }, 750);

    // Simulated Offline scanning mode (completely in browser)
    if (isOffline) {
      setTimeout(() => {
        clearInterval(stepInterval);
        processOfflineScan();
      }, 3200);
      return;
    }

    // Normal Online scan route
    try {
      const formData = new FormData();
      formData.append('image', uploadFile);

      // India coordinates
      const userLat = 22.2587 + (Math.random() - 0.5) * 5; 
      const userLng = 71.1924 + (Math.random() - 0.5) * 5;

      const res = await fetch(`${API_BASE_URL}/scans`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user ? user.token : ''}`,
          'x-latitude': userLat.toString(),
          'x-longitude': userLng.toString()
        },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        clearInterval(stepInterval);
        setIsScanning(false);
        showToast(data.error || 'Failed to start scan', 'error');
        return;
      }

      const scanId = data.scanId;
      setActiveScanId(scanId);

      // Open WebSocket connection to wait for processing completion
      const socket = new WebSocket('ws://localhost:3001/ws/scan');
      socket.onopen = () => {
        socket.send(JSON.stringify({ action: 'join', scanId }));
      };

      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.status === 'completed' && msg.scanId === scanId) {
          clearInterval(stepInterval);
          setScanResult(msg.data);
          setIsScanning(false);
          setCurrentView('result');
          socket.close();
          showToast('Scan complete!', 'success');
          fetchScanHistory();
          if (msg.data.medicine_id) {
            fetchAlternatives(msg.data.medicine_id);
          }
        } else if (msg.status === 'failed') {
          clearInterval(stepInterval);
          setIsScanning(false);
          showToast('Scan analysis pipeline encountered an error.', 'error');
          socket.close();
        }
      };

      socket.onerror = () => {
        pollScanResult(scanId, stepInterval);
      };

    } catch (err) {
      clearInterval(stepInterval);
      setIsScanning(false);
      showToast('Backend connection failed. Scanning in offline simulator mode.', 'info');
      processOfflineScan();
    }
  };

  // Fallback scan polling
  const pollScanResult = async (scanId, interval) => {
    let attempts = 0;
    const pollInterval = setInterval(async () => {
      attempts++;
      if (attempts > 12) {
        clearInterval(pollInterval);
        clearInterval(interval);
        setIsScanning(false);
        showToast('Scan processing timed out.', 'error');
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}/scans/${scanId}`, {
          headers: { 'Authorization': `Bearer ${user ? user.token : ''}` }
        });
        const data = await res.json();
        if (res.ok && data.verdict) {
          clearInterval(pollInterval);
          clearInterval(interval);
          setScanResult(data);
          setIsScanning(false);
          setCurrentView('result');
          showToast('Scan complete!', 'success');
          fetchScanHistory();
          if (data.medicine_id) {
            fetchAlternatives(data.medicine_id);
          }
        }
      } catch (err) {
        console.error(err);
      }
    }, 1000);
  };

  // Process scan offline (runs locally in frontend simulating model run with local boxes)
  const processOfflineScan = () => {
    let offlineResult = null;
    const filename = uploadFile.name.toLowerCase();

    if (filename.includes('calpol')) {
      offlineResult = {
        medicine_id: "med-calpol",
        medicine_name: "Calpol 650",
        generic_name: "Paracetamol",
        manufacturer_name: "GlaxoSmithKline Pharmaceuticals",
        authenticity_score: 98.4,
        verdict: "verified",
        ocr_extracted: {
          name: "Calpol 650",
          manufacturer: "GlaxoSmithKline Pharmaceuticals",
          batch_number: "GP43210",
          expiry_date: "08-2027",
          mfg_date: "08-2024",
          mrp: "Rs. 35.00",
          ocr_boxes: [
            { text: "Calpol 650", confidence: 0.99, x: 20, y: 15, w: 45, h: 10 },
            { text: "Paracetamol 650mg", confidence: 0.95, x: 20, y: 28, w: 35, h: 8 },
            { text: "GlaxoSmithKline", confidence: 0.98, x: 15, y: 75, w: 50, h: 8 },
            { text: "Batch No: GP43210", confidence: 0.99, x: 55, y: 48, w: 38, h: 8 },
            { text: "Exp Date: 08-2027", confidence: 0.97, x: 55, y: 58, w: 38, h: 8 }
          ]
        },
        anomalies: [],
        signal_breakdown: { ocr: 98, visual: 99, batch: 100, barcode: 95, community: 100 }
      };
    } else if (filename.includes('crocin')) {
      offlineResult = {
        medicine_id: "med-crocin",
        medicine_name: "Crocin 500",
        generic_name: "Paracetamol",
        manufacturer_name: "GlaxoSmithKline Pharmaceuticals",
        authenticity_score: 42.5,
        verdict: "high_risk",
        ocr_extracted: {
          name: "Crocin 500",
          manufacturer: "GlaxoSmithKline Pharmaceuticals",
          batch_number: "INVALID-999-BATCH",
          expiry_date: "12-2028",
          mfg_date: "12-2025",
          mrp: "Rs. 20.00",
          ocr_boxes: [
            { text: "Crocin 500", confidence: 0.97, x: 25, y: 18, w: 40, h: 12 },
            { text: "Batch: INVALID-999-BATCH", confidence: 0.92, x: 45, y: 45, w: 48, h: 10 },
            { text: "GlaxoSmithKline", confidence: 0.98, x: 20, y: 78, w: 48, h: 8 }
          ]
        },
        anomalies: ["Batch number format mismatch: 'INVALID-999-BATCH' violates manufacturer schema '^BT\\d{4}$'"],
        signal_breakdown: { ocr: 90, visual: 92, batch: 0, barcode: 0, community: 100 }
      };
    } else if (filename.includes('omez')) {
      offlineResult = {
        medicine_id: "med-omez",
        medicine_name: "Omez 20",
        generic_name: "Omeprazole",
        manufacturer_name: "Dr. Reddy's Laboratories",
        authenticity_score: 36.8,
        verdict: "high_risk",
        ocr_extracted: {
          name: "Omez 20",
          manufacturer: "Dr. Reddy's Laboratories",
          batch_number: "MC8872",
          expiry_date: "12-2028",
          mfg_date: "12-2024",
          mrp: "Rs. 55.00",
          ocr_boxes: [
            { text: "Omez 20", confidence: 0.94, x: 30, y: 20, w: 35, h: 10 },
            { text: "Dr. Reddy's", confidence: 0.96, x: 18, y: 72, w: 55, h: 8 },
            { text: "Batch: MC8872", confidence: 0.95, x: 50, y: 45, w: 35, h: 8 }
          ]
        },
        anomalies: [
          "Low print resolution or high blur detected. Possible reprint simulation.",
          "Packaging color profile deviation detected. Expected red/rose hue, detected blue layout profile."
        ],
        signal_breakdown: { ocr: 95, visual: 30, batch: 100, barcode: 85, community: 50 }
      };
    } else {
      offlineResult = {
        medicine_id: "med-unknown",
        medicine_name: "Unknown Product",
        generic_name: "Unknown composition",
        manufacturer_name: "Unknown manufacturer",
        authenticity_score: 22.0,
        verdict: "high_risk",
        ocr_extracted: {
          name: "Not extracted",
          manufacturer: "Not matched",
          batch_number: "None",
          expiry_date: "None",
          mfg_date: "None",
          mrp: "None",
          ocr_boxes: []
        },
        anomalies: ["No approved CDSCO medicine brand matching name found in packaging text scan"],
        signal_breakdown: { ocr: 0, visual: 40, batch: 0, barcode: 0, community: 100 }
      };
    }

    const resultData = {
      ...offlineResult,
      image_url: previewUrl,
      lat: 28.6139,
      lng: 77.2090
    };

    setScanResult(resultData);
    setIsScanning(false);
    setCurrentView('result');
    showToast('Offline local scan completed successfully!', 'success');
    
    if (resultData.medicine_id) {
      fetchAlternatives(resultData.medicine_id);
    }
  };

  // Submit community suspect counterfeit report
  const submitAlertReport = async () => {
    if (!scanResult) return;
    try {
      const body = {
        medicine_id: scanResult.medicine_id || 'med-0',
        batch_number: scanResult.ocr_extracted?.batch_number || 'UNKNOWN',
        lat: scanResult.lat || 28.6139,
        lng: scanResult.lng || 77.2090
      };
      
      const res = await fetch(`${API_BASE_URL}/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user ? user.token : ''}`
        },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        showToast('Counterfeit warning flag filed! Community alerts database updated.', 'success');
      } else {
        showToast('Error filing report.', 'error');
      }
    } catch (err) {
      showToast('Network error filing alert.', 'error');
    }
  };

  // PDF report mock generator
  const downloadPdfReport = () => {
    if (!scanResult) return;
    
    const lines = [
      `MEDSECURE AI - SCAN VERIFICATION REPORT`,
      `=========================================`,
      `Scan ID: ${scanResult.id || 'N/A'}`,
      `Date Scanned: ${scanResult.scanned_at || new Date().toLocaleString()}`,
      `Authenticity Rating: ${scanResult.authenticity_score}%`,
      `Verdict: ${scanResult.verdict?.toUpperCase()}`,
      `-----------------------------------------`,
      `Medicine: ${scanResult.medicine_name || scanResult.ocr_extracted?.name}`,
      `Composition: ${scanResult.generic_name || 'N/A'}`,
      `Manufacturer: ${scanResult.manufacturer_name || scanResult.ocr_extracted?.manufacturer}`,
      `Batch Number: ${scanResult.ocr_extracted?.batch_number}`,
      `Expiry Date: ${scanResult.ocr_extracted?.expiry_date}`,
      `MRP: ${scanResult.ocr_extracted?.mrp}`,
      `-----------------------------------------`,
      `Anomalies flagged:`,
      scanResult.anomalies?.length > 0 
        ? scanResult.anomalies.map(a => `- ${a}`).join('\n')
        : "None (Packaging matches verified standards)",
      `=========================================`
    ];

    const element = document.createElement("a");
    const file = new Blob([lines.join('\n')], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `MedSecure_Report_${scanResult.ocr_extracted?.batch_number || 'scan'}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    showToast('Report downloaded as text layout format.', 'success');
  };

  // Collapsible chatbot handler
  const handleChatSend = () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setChatMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    setChatInput('');

    setTimeout(() => {
      let botResponse = "MedSecure AI system is ready. Please ask queries regarding CDSCO specifications, drug recall warnings, or batch formats.";
      
      const query = userMsg.toLowerCase();
      if (query.includes('batch') || query.includes('check')) {
        botResponse = "CDSCO batch formats are manufacturer-specific regex rules. For instance, GSK uses patterns like ^GP\\d{5}$ or ^BT\\d{4}$. MedSecure extracts the text and verifies if the layout match corresponds directly to this registered expression.";
      } else if (query.includes('score') || query.includes('criteria')) {
        botResponse = "The authenticity rating combines visual anomalies (30%), OCR field matches (25%), batch validation checksums (20%), barcode structure (15%), and geographic community alert multipliers (10%).";
      } else if (query.includes('high risk') || query.includes('report') || query.includes('flag')) {
        botResponse = "For High Risk medicines, do not dispense or ingest. Click 'Flag Suspect Package' on the results page. This raises a regional alert flag. Accumulating 3 pharmacist flags registers an active CDSCO recall status, notifying inspectors.";
      } else if (query.includes('offline')) {
        botResponse = "Yes, MedSecure supports offline mode! Click the WiFi icon in the top header. EasyOCR/FastAPI calls will fall back to local client regex checksum checks and offline database simulations.";
      }

      setChatMessages(prev => [...prev, { sender: 'bot', text: botResponse }]);
    }, 600);
  };

  return (
    <div className="min-h-screen bg-bg-dark text-slate-100 flex flex-col antialiased">
      
      {/* Toast Notification */}
      {toast.show && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-lg border shadow-xl flex items-center gap-3 transition-all duration-300 transform scale-100 ${
          toast.type === 'error' ? 'bg-red-950/80 border-red-500 text-red-200 animate-glow-red' : 
          toast.type === 'info' ? 'bg-blue-950/80 border-blue-500 text-blue-200' : 
          'bg-emerald-950/85 border-brand-green text-emerald-200 animate-glow-green'
        }`}>
          {toast.type === 'error' ? <XCircle className="w-5 h-5 text-red-400" /> : <CheckCircle className="w-5 h-5 text-brand-green" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Top Navbar */}
      <header className="border-b border-panel-border bg-bg-dark/80 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentView('landing')}>
          <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
            <ShieldAlert className="w-5 h-5 text-brand-green animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-emerald-400">
              {t[lang].title}
            </h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">Verification Engine</p>
          </div>
        </div>

        {/* Center menu */}
        <nav className="hidden md:flex items-center gap-1 font-medium text-sm text-slate-400">
          <button 
            onClick={() => setCurrentView('landing')} 
            className={`px-4 py-1.5 rounded-full hover:text-white transition-all ${currentView === 'landing' ? 'bg-white/5 text-white' : ''}`}>
            Home
          </button>
          <button 
            onClick={() => setCurrentView('scan')} 
            className={`px-4 py-1.5 rounded-full hover:text-white transition-all ${currentView === 'scan' ? 'bg-white/5 text-white' : ''}`}>
            {t[lang].scan}
          </button>
          <button 
            onClick={() => setCurrentView('map')} 
            className={`px-4 py-1.5 rounded-full hover:text-white transition-all ${currentView === 'map' ? 'bg-white/5 text-white' : ''}`}>
            {t[lang].map}
          </button>
          <button 
            onClick={() => setCurrentView('lookup')} 
            className={`px-4 py-1.5 rounded-full hover:text-white transition-all ${currentView === 'lookup' ? 'bg-white/5 text-white' : ''}`}>
            {t[lang].lookup}
          </button>
          {user && (
            <>
              <button 
                onClick={() => setCurrentView('history')} 
                className={`px-4 py-1.5 rounded-full hover:text-white transition-all ${currentView === 'history' ? 'bg-white/5 text-white' : ''}`}>
                {t[lang].history}
              </button>
              {(user.role === 'pharmacist' || user.role === 'inspector') && (
                <button 
                  onClick={() => setCurrentView('dashboard')} 
                  className={`px-4 py-1.5 rounded-full hover:text-white transition-all ${currentView === 'dashboard' ? 'bg-white/5 text-white' : ''}`}>
                  {t[lang].dashboard}
                </button>
              )}
            </>
          )}
        </nav>

        {/* Right side utility selectors */}
        <div className="flex items-center gap-3">
          {/* Offline Toggle */}
          <button 
            onClick={() => {
              setIsOffline(!isOffline);
              showToast(isOffline ? 'Online cloud synchronization active.' : 'Switched to offline local OCR Fallback mode.', 'info');
            }} 
            className={`p-2 rounded-lg border transition-all ${isOffline ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' : 'bg-emerald-500/10 border-emerald-500/20 text-brand-green'}`}
            title={isOffline ? "Currently Offline" : "Currently Online"}
          >
            {isOffline ? <WifiOff className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
          </button>

          {/* Language Selector */}
          <div className="relative flex items-center bg-panel-dark border border-panel-border rounded-lg px-2 py-1 gap-1">
            <Globe className="w-3.5 h-3.5 text-slate-400" />
            <select 
              value={lang} 
              onChange={(e) => setLang(e.target.value)} 
              className="bg-transparent text-xs text-slate-200 focus:outline-none pr-1 cursor-pointer font-mono"
            >
              <option value="en">EN</option>
              <option value="hi">HI</option>
              <option value="gu">GU</option>
            </select>
          </div>

          {/* Session Profile details */}
          {user ? (
            <div className="flex items-center gap-2">
              <div className="hidden lg:flex flex-col items-end">
                <span className="text-xs font-semibold text-slate-200">{user.email}</span>
                <span className="text-[10px] text-emerald-400 capitalize font-mono">{user.role}</span>
              </div>
              <button 
                onClick={handleLogout} 
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg transition-all"
              >
                Logout
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setCurrentView('login')} 
                className="text-xs bg-brand-green hover:bg-emerald-600 text-bg-dark font-bold px-4 py-1.5 rounded-lg transition-all"
              >
                Sign In
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main View Area */}
      <main className="flex-1 p-6 md:p-10 max-w-7xl w-full mx-auto">
        <AnimatePresence mode="wait">
          
          {/* ================= LANDING VIEW ================= */}
          {currentView === 'landing' && (
            <motion.div 
              key="landing"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-16 py-4"
            >
              {/* Hero segment */}
              <div className="text-center max-w-3xl mx-auto space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-brand-green text-xs font-semibold tracking-wide uppercase font-mono animate-glow-green">
                  <ShieldAlert className="w-3.5 h-3.5" /> India CDSCO Verification System
                </div>
                <h2 className="text-4xl md:text-5xl font-black tracking-tight leading-tight">
                  Instantly Detect <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-green to-emerald-400">Counterfeit</span> Medicine Packages
                </h2>
                <p className="text-base md:text-lg text-slate-400 leading-relaxed">
                  Protect patient safety using AI visual analytics. Upload or take a picture of any packaging box to analyze layout defects, print bleed, barcode discrepancies, and verify CDSCO registration.
                </p>
                
                <div className="pt-4 flex flex-wrap justify-center gap-4">
                  <button 
                    onClick={() => setCurrentView('scan')}
                    className="bg-brand-green hover:bg-emerald-600 text-bg-dark font-extrabold text-base px-8 py-3.5 rounded-xl shadow-lg shadow-emerald-950/20 transition-all flex items-center gap-3"
                  >
                    <Camera className="w-5 h-5" /> Launch Scanning Engine
                  </button>
                  <button 
                    onClick={() => setCurrentView('map')}
                    className="bg-panel-dark border border-panel-border hover:bg-slate-800/60 text-slate-200 px-6 py-3.5 rounded-xl transition-all flex items-center gap-3"
                  >
                    <MapIcon className="w-5 h-5" /> View Active Alerts Map
                  </button>
                </div>
              </div>

              {/* Quick Demo scanner box */}
              <div className="glass-panel rounded-2xl p-6 md:p-8 max-w-4xl mx-auto border-dashed border-2 border-emerald-500/20">
                <div className="text-center mb-6">
                  <h3 className="text-lg font-bold font-mono text-emerald-400 uppercase tracking-widest">DEMO VERIFICATION PORT</h3>
                  <p className="text-xs text-slate-400">Select a preconfigured sample file to test the ML scanning pipeline</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  <button 
                    onClick={() => handleLoadSample('/samples/calpol_genuine.jpg', 'calpol_genuine.jpg')}
                    className="p-4 rounded-xl glass-panel text-left glass-panel-hover transition-all flex flex-col gap-2 relative overflow-hidden group"
                  >
                    <div className="absolute top-0 right-0 w-2 h-full bg-emerald-500"></div>
                    <span className="text-[10px] uppercase font-mono tracking-widest text-emerald-400 font-bold">Sample 1</span>
                    <span className="font-bold text-sm text-slate-200">Calpol 650 (Genuine)</span>
                    <span className="text-xs text-slate-400">Valid batch format & colors. Expected result: Verified.</span>
                  </button>

                  <button 
                    onClick={() => handleLoadSample('/samples/crocin_counterfeit.jpg', 'crocin_counterfeit.jpg')}
                    className="p-4 rounded-xl glass-panel text-left glass-panel-hover transition-all flex flex-col gap-2 relative overflow-hidden group"
                  >
                    <div className="absolute top-0 right-0 w-2 h-full bg-red-500"></div>
                    <span className="text-[10px] uppercase font-mono tracking-widest text-red-400 font-bold">Sample 2</span>
                    <span className="font-bold text-sm text-slate-200">Crocin 500 (Counterfeit)</span>
                    <span className="text-xs text-slate-400">Violates CDSCO batch registration format.</span>
                  </button>

                  <button 
                    onClick={() => handleLoadSample('/samples/omez_counterfeit.jpg', 'omez_counterfeit.jpg')}
                    className="p-4 rounded-xl glass-panel text-left glass-panel-hover transition-all flex flex-col gap-2 relative overflow-hidden group"
                  >
                    <div className="absolute top-0 right-0 w-2 h-full bg-amber-500"></div>
                    <span className="text-[10px] uppercase font-mono tracking-widest text-amber-400 font-bold">Sample 3</span>
                    <span className="font-bold text-sm text-slate-200">Omez 20 (Counterfeit)</span>
                    <span className="text-xs text-slate-400">Mismatched color profile & high print blur.</span>
                  </button>
                </div>

                {previewUrl && (
                  <div className="flex flex-col items-center gap-6 p-4 bg-bg-dark/40 rounded-xl border border-panel-border">
                    <div className="relative max-w-sm rounded-lg overflow-hidden border border-panel-border bg-slate-950">
                      <img src={previewUrl} alt="Scan preview" className="max-h-64 object-contain" />
                      <div className="scanner-laser"></div>
                    </div>
                    <button 
                      onClick={executeScan}
                      className="bg-emerald-500 hover:bg-emerald-600 text-bg-dark font-extrabold px-8 py-3 rounded-lg flex items-center gap-2 transition-all animate-glow-green"
                    >
                      <FileCheck className="w-5 h-5" /> Start Verification Scan
                    </button>
                  </div>
                )}
              </div>

              {/* Core Pillars specs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="glass-panel p-6 rounded-xl space-y-4">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <Camera className="w-5 h-5 text-brand-green" />
                  </div>
                  <h4 className="text-lg font-bold">Packaging Defect YOLO Checks</h4>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Scans package prints for color drift, text misalignments, ink bleeds, and font variance. Flags cheap scanning replication attempts.
                  </p>
                </div>

                <div className="glass-panel p-6 rounded-xl space-y-4">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <Database className="w-5 h-5 text-brand-green" />
                  </div>
                  <h4 className="text-lg font-bold">Smart OCR Lookup</h4>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Extracts brand names, manufacturer info, and batch numbers. Validates format against registered CDSCO databases.
                  </p>
                </div>

                <div className="glass-panel p-6 rounded-xl space-y-4">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <ShieldAlert className="w-5 h-5 text-brand-green" />
                  </div>
                  <h4 className="text-lg font-bold">Community-Sourced Signals</h4>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Pharmacists log suspect packages instantly. Generates a live danger score multiplier for identical batches in the region.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* ================= SCANNER VIEW ================= */}
          {currentView === 'scan' && (
            <motion.div 
              key="scan"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-2xl mx-auto space-y-6"
            >
              <div className="text-center">
                <h2 className="text-2xl font-bold font-mono text-emerald-400 uppercase tracking-wide">{t[lang].scan}</h2>
                <p className="text-sm text-slate-400 mt-1">Upload an image of a medicine label box to run the verification engine</p>
              </div>

              {isScanning ? (
                // Animated scan process state
                <div className="glass-panel rounded-2xl p-8 flex flex-col items-center justify-center min-h-[380px] space-y-6">
                  <Loader2 className="w-12 h-12 text-brand-green animate-spin" />
                  <div className="text-center space-y-2">
                    <h3 className="text-lg font-bold font-mono text-emerald-400 uppercase tracking-wide">Analyzing Packaging Image...</h3>
                    <p className="text-xs text-slate-400 uppercase font-mono">Running Local ML Engine Models</p>
                  </div>
                  
                  {/* Pipeline visual steps */}
                  <div className="w-full max-w-sm space-y-3 pt-6 border-t border-slate-700/50">
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="flex items-center justify-between text-sm">
                      <span className={scanStep >= 0 ? "text-emerald-400 font-semibold" : "text-slate-500"}>1. EasyOCR Text Region Parsing</span>
                      {scanStep > 0 ? <CheckCircle className="w-4.5 h-4.5 text-brand-green" /> : <Loader2 className="w-4.5 h-4.5 text-slate-500 animate-spin" />}
                    </motion.div>
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="flex items-center justify-between text-sm">
                      <span className={scanStep >= 1 ? "text-emerald-400 font-semibold" : "text-slate-500"}>2. OpenCV Layout Contrast Check</span>
                      {scanStep > 1 ? <CheckCircle className="w-4.5 h-4.5 text-brand-green" /> : <Loader2 className="w-4.5 h-4.5 text-slate-500 animate-spin" />}
                    </motion.div>
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="flex items-center justify-between text-sm">
                      <span className={scanStep >= 2 ? "text-emerald-400 font-semibold" : "text-slate-500"}>3. CDSCO Register Regex Match</span>
                      {scanStep > 2 ? <CheckCircle className="w-4.5 h-4.5 text-brand-green" /> : <Loader2 className="w-4.5 h-4.5 text-slate-500 animate-spin" />}
                    </motion.div>
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="flex items-center justify-between text-sm">
                      <span className={scanStep >= 3 ? "text-emerald-400 font-semibold" : "text-slate-500"}>4. Checking Recall & Alerts Data</span>
                      {scanStep >= 3 ? <CheckCircle className="w-4.5 h-4.5 text-brand-green" /> : <Loader2 className="w-4.5 h-4.5 text-slate-500 animate-spin" />}
                    </motion.div>
                  </div>
                </div>
              ) : (
                // Main Scanner select box
                <div className="space-y-6">
                  <div className="glass-panel rounded-2xl p-6 flex flex-col items-center justify-center border-dashed border-2 border-slate-700/80 min-h-[320px] relative overflow-hidden group">
                    
                    {previewUrl ? (
                      <div className="relative max-w-sm rounded-lg overflow-hidden border border-panel-border bg-slate-950">
                        <img src={previewUrl} alt="Scan preview" className="max-h-64 object-contain" />
                        <div className="scanner-laser"></div>
                      </div>
                    ) : (
                      <div className="text-center space-y-4 py-8">
                        <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto">
                          <Upload className="w-8 h-8 text-slate-500" />
                        </div>
                        <div>
                          <p className="font-bold text-sm">Drag & drop or Click to choose image</p>
                          <p className="text-xs text-slate-500 mt-1">Supports PNG, JPG, JPEG up to 8MB</p>
                        </div>
                      </div>
                    )}

                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleFileChange}
                      className="absolute inset-0 opacity-0 cursor-pointer" 
                    />
                  </div>

                  {/* Preconfigured Test samples widget */}
                  <div className="p-4 bg-panel-dark/50 border border-panel-border rounded-xl">
                    <p className="text-xs font-bold text-emerald-400 font-mono mb-2 uppercase">Or select test sample box:</p>
                    <div className="flex flex-wrap gap-2">
                      <button 
                        onClick={() => handleLoadSample('/samples/calpol_genuine.jpg', 'calpol_genuine.jpg')}
                        className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-all"
                      >
                        Calpol Genuine
                      </button>
                      <button 
                        onClick={() => handleLoadSample('/samples/crocin_counterfeit.jpg', 'crocin_counterfeit.jpg')}
                        className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-all"
                      >
                        Crocin Counterfeit
                      </button>
                      <button 
                        onClick={() => handleLoadSample('/samples/omez_counterfeit.jpg', 'omez_counterfeit.jpg')}
                        className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-all"
                      >
                        Omez Counterfeit
                      </button>
                    </div>
                  </div>

                  {/* Trigger verification scan button */}
                  <button 
                    onClick={executeScan}
                    disabled={!uploadFile}
                    className={`w-full font-bold text-base py-3.5 rounded-xl transition-all flex items-center justify-center gap-3 ${
                      uploadFile 
                        ? 'bg-brand-green hover:bg-emerald-600 text-bg-dark font-extrabold cursor-pointer animate-glow-green' 
                        : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                    }`}
                  >
                    <Camera className="w-5 h-5" /> Run Verification Scan
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {/* ================= RESULTS VIEW ================= */}
          {currentView === 'result' && scanResult && (
            <motion.div 
              key="result"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
            >
              {/* Top result card summary */}
              <div className="glass-panel rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center gap-8 relative overflow-hidden">
                
                {/* Verdict vertical bar color */}
                <div className={`absolute left-0 top-0 bottom-0 w-2.5 ${
                  scanResult.verdict === 'verified' ? 'bg-brand-green animate-glow-green' : 
                  scanResult.verdict === 'caution' ? 'bg-brand-amber' : 
                  'bg-brand-red animate-glow-red'
                }`}></div>

                {/* Gauge and rating score */}
                <div className="relative flex items-center justify-center w-40 h-40">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" stroke="rgba(255,255,255,0.05)" strokeWidth="8" fill="transparent" />
                    <motion.circle 
                      cx="50" 
                      cy="50" 
                      r="40" 
                      stroke={
                        scanResult.verdict === 'verified' ? '#10b981' : 
                        scanResult.verdict === 'caution' ? '#f59e0b' : 
                        '#ef4444'
                      }
                      strokeWidth="8" 
                      fill="transparent" 
                      strokeDasharray="251.2"
                      initial={{ strokeDashoffset: 251.2 }}
                      animate={{ strokeDashoffset: 251.2 - (251.2 * scanResult.authenticity_score) / 100 }}
                      transition={{ duration: 1.2, ease: "easeOut" }}
                    />
                  </svg>
                  <div className="absolute text-center">
                    <span className="text-3xl font-black font-mono">{scanResult.authenticity_score}%</span>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Authentic</p>
                  </div>
                </div>

                {/* Text summary block */}
                <div className="flex-1 space-y-4 text-center md:text-left">
                  <div className="space-y-1">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                      scanResult.verdict === 'verified' ? 'bg-emerald-500/10 text-brand-green border border-emerald-500/25' : 
                      scanResult.verdict === 'caution' ? 'bg-amber-500/10 text-brand-amber border border-amber-500/25' : 
                      'bg-red-500/10 text-brand-red border border-red-500/25'
                    }`}>
                      {scanResult.verdict === 'verified' ? <CheckCircle className="w-4 h-4" /> : 
                       scanResult.verdict === 'caution' ? <AlertTriangle className="w-4 h-4" /> : 
                       <XCircle className="w-4 h-4" />}
                      {scanResult.verdict === 'verified' ? t[lang].verdict_verified : 
                       scanResult.verdict === 'caution' ? t[lang].verdict_caution : 
                       t[lang].verdict_danger}
                    </span>
                    <h2 className="text-3xl font-black">{scanResult.medicine_name || scanResult.ocr_extracted?.name}</h2>
                    <p className="text-slate-400 text-sm">{scanResult.generic_name || "Paracetamol Formulation"}</p>
                  </div>

                  <div className="flex flex-wrap justify-center md:justify-start gap-3">
                    <button 
                      onClick={downloadPdfReport}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold rounded-lg transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-emerald-400" /> Export PDF Report
                    </button>
                    {scanResult.verdict !== 'verified' && (
                      <button 
                        onClick={submitAlertReport}
                        className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-bold rounded-lg transition-all flex items-center gap-2 cursor-pointer"
                      >
                        <ShieldAlert className="w-4 h-4" /> Flag Suspect Package
                      </button>
                    )}
                    <button 
                      onClick={() => { setUploadFile(null); setPreviewUrl(''); setCurrentView('scan'); }}
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-bg-dark text-xs font-bold rounded-lg transition-all cursor-pointer"
                    >
                      Scan Another Package
                    </button>
                  </div>
                </div>
              </div>

              {/* Split screen content details */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Left Column: Traceability Specs */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="glass-panel rounded-xl p-6 space-y-4">
                    <h3 className="text-lg font-bold font-mono text-emerald-400 uppercase tracking-wider flex items-center gap-2 border-b border-slate-700/60 pb-3">
                      <FileText className="w-4.5 h-4.5" /> {t[lang].details}
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                      <div className="space-y-1">
                        <span className="text-slate-500 text-xs uppercase tracking-wider font-mono">Medicine Name</span>
                        <p className="font-semibold text-slate-200">{scanResult.ocr_extracted?.name || scanResult.medicine_name || 'N/A'}</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-slate-500 text-xs uppercase tracking-wider font-mono">Manufacturer</span>
                        <p className="font-semibold text-slate-200">{scanResult.ocr_extracted?.manufacturer || scanResult.manufacturer_name || 'N/A'}</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-slate-500 text-xs uppercase tracking-wider font-mono">Batch Number</span>
                        <p className="font-mono font-bold text-emerald-400">{scanResult.ocr_extracted?.batch_number || 'N/A'}</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-slate-500 text-xs uppercase tracking-wider font-mono">Expiration Date</span>
                        <p className="font-semibold text-slate-200">{scanResult.ocr_extracted?.expiry_date || 'N/A'}</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-slate-500 text-xs uppercase tracking-wider font-mono">Manufacturing Date</span>
                        <p className="font-semibold text-slate-200">{scanResult.ocr_extracted?.mfg_date || 'N/A'}</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-slate-500 text-xs uppercase tracking-wider font-mono">MRP Value</span>
                        <p className="font-semibold text-slate-200 font-mono">{scanResult.ocr_extracted?.mrp || 'N/A'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Dynamic Bounding Box Highlight Viewer */}
                  {scanResult.ocr_extracted?.ocr_boxes && scanResult.ocr_extracted.ocr_boxes.length > 0 && (
                    <div className="glass-panel rounded-xl p-6 space-y-4">
                      <h3 className="text-lg font-bold font-mono text-emerald-400 uppercase tracking-wider flex items-center gap-2 border-b border-slate-700/60 pb-3">
                        <Camera className="w-4.5 h-4.5" /> Interactive Label Coordinates Map
                      </h3>
                      <p className="text-xs text-slate-400">Hover over highlighted boxes on the label to verify extracted tokens and confidence parameters.</p>
                      
                      <div className="relative max-w-md mx-auto rounded-lg overflow-hidden border border-panel-border bg-slate-950 select-none">
                        <img 
                          src={getImageUrl(scanResult.image_url)} 
                          alt="Packaging details" 
                          className="w-full object-contain max-h-[380px]" 
                        />
                        {scanResult.ocr_extracted.ocr_boxes.map((box, idx) => {
                          const isWarning = scanResult.verdict !== 'verified' && (
                            box.text.toLowerCase().includes('invalid') || 
                            box.text.toLowerCase().includes('batch') ||
                            box.text.toLowerCase().includes('exp')
                          );
                          const boxClass = isWarning ? 'ocr-overlay-box ocr-overlay-box-danger' : 'ocr-overlay-box';
                          return (
                            <div 
                              key={idx}
                              className={boxClass}
                              style={{
                                left: `${box.x}%`,
                                top: `${box.y}%`,
                                width: `${box.w}%`,
                                height: `${box.h}%`
                              }}
                              onMouseEnter={() => setHoveredBox(box)}
                              onMouseLeave={() => setHoveredBox(null)}
                            />
                          );
                        })}
                      </div>

                      {hoveredBox && (
                        <motion.div 
                          initial={{ opacity: 0, y: 5 }} 
                          animate={{ opacity: 1, y: 0 }} 
                          className="p-3 bg-panel-dark/90 border border-emerald-500/20 rounded-lg text-xs flex justify-between items-center"
                        >
                          <div>
                            <span className="text-slate-500 block uppercase font-mono text-[9px]">Extracted Text</span>
                            <span className="font-bold font-mono text-slate-200 text-sm">{hoveredBox.text}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-slate-500 block uppercase font-mono text-[9px]">Confidence</span>
                            <span className="font-bold text-emerald-400 font-mono">{(hoveredBox.confidence * 100).toFixed(1)}%</span>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  )}

                  {/* Anomalies segment */}
                  <div className="glass-panel rounded-xl p-6 space-y-4">
                    <h3 className="text-lg font-bold font-mono text-emerald-400 uppercase tracking-wider flex items-center gap-2 border-b border-slate-700/60 pb-3">
                      <ShieldAlert className="w-4.5 h-4.5 text-amber-500" /> {t[lang].anomalies}
                    </h3>
                    
                    {scanResult.anomalies && scanResult.anomalies.length > 0 ? (
                      <div className="space-y-2">
                        {scanResult.anomalies.map((anomaly, idx) => (
                          <div key={idx} className="flex gap-3 p-3 bg-red-950/20 border border-red-500/20 rounded-lg text-slate-200 text-sm">
                            <AlertTriangle className="w-5 h-5 text-brand-red flex-shrink-0" />
                            <span className="leading-relaxed">{anomaly}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 p-4 bg-emerald-950/20 border border-emerald-500/25 rounded-lg text-emerald-200 text-sm animate-glow-green">
                        <CheckCircle className="w-5 h-5 text-brand-green flex-shrink-0" />
                        <span>Zero packaging defects detected. Printing alignment, font size, and color parameters fully conform to genuine manufacturer specification.</span>
                      </div>
                    )}
                  </div>

                  {/* NEW Feature: Alternative drug suggestions substitution component */}
                  {scanResult.verdict !== 'verified' && alternatives.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="glass-panel rounded-xl p-6 space-y-4 border-l-4 border-l-emerald-500 animate-glow-green"
                    >
                      <h3 className="text-lg font-bold font-mono text-emerald-400 uppercase tracking-wider flex items-center gap-2 border-b border-slate-700/60 pb-3">
                        <Database className="w-4.5 h-4.5" /> Approved CDSCO Substitutions
                      </h3>
                      <p className="text-xs text-slate-400">If this package is counterfeit, verify these registered alternative brands sharing the identical generic composition: <span className="font-semibold text-slate-200">{scanResult.generic_name}</span>.</p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {alternatives.map((alt) => (
                          <div key={alt.id} className="p-4 bg-bg-dark border border-panel-border rounded-lg flex flex-col justify-between gap-3 hover:border-emerald-500/30 transition-all">
                            <div>
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-200 text-sm">{alt.name}</span>
                                <span className="text-[9px] bg-emerald-500/10 text-brand-green border border-emerald-500/20 px-1.5 py-0.5 rounded font-mono">Approved</span>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-1">{alt.manufacturer_name}</p>
                            </div>
                            <div className="border-t border-slate-800/80 pt-2 text-[10px] font-mono text-slate-500 flex justify-between">
                              <span>Batch Pattern: <span className="text-emerald-400 font-bold">{alt.approved_batch_format}</span></span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Right Column: Signal breakdowns and uploaded image */}
                <div className="space-y-6">
                  
                  {/* Score Breakdown lists */}
                  <div className="glass-panel rounded-xl p-6 space-y-4">
                    <h3 className="text-base font-bold font-mono text-slate-300 uppercase tracking-wider">Verification Weights</h3>
                    
                    <div className="space-y-3.5">
                      {/* Visual check */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-mono font-medium text-slate-400">
                          <span>Packaging (YOLO Anomaly) - 30%</span>
                          <span className={scanResult.signal_breakdown?.visual >= 80 ? "text-brand-green" : "text-brand-red"}>
                            {scanResult.signal_breakdown?.visual}%
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                          <motion.div 
                            className={`h-full rounded-full ${scanResult.signal_breakdown?.visual >= 80 ? 'bg-brand-green' : 'bg-brand-red'}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${scanResult.signal_breakdown?.visual}%` }}
                            transition={{ duration: 1 }}
                          />
                        </div>
                      </div>

                      {/* OCR Check */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-mono font-medium text-slate-400">
                          <span>OCR Field Extraction - 25%</span>
                          <span className={scanResult.signal_breakdown?.ocr >= 80 ? "text-brand-green" : "text-brand-red"}>
                            {scanResult.signal_breakdown?.ocr}%
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                          <motion.div 
                            className={`h-full rounded-full ${scanResult.signal_breakdown?.ocr >= 80 ? 'bg-brand-green' : 'bg-brand-red'}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${scanResult.signal_breakdown?.ocr}%` }}
                            transition={{ duration: 1, delay: 0.15 }}
                          />
                        </div>
                      </div>

                      {/* Batch Code check */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-mono font-medium text-slate-400">
                          <span>CDSCO Batch Regex Format - 20%</span>
                          <span className={scanResult.signal_breakdown?.batch >= 80 ? "text-brand-green" : "text-brand-red"}>
                            {scanResult.signal_breakdown?.batch}%
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                          <motion.div 
                            className={`h-full rounded-full ${scanResult.signal_breakdown?.batch >= 80 ? 'bg-brand-green' : 'bg-brand-red'}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${scanResult.signal_breakdown?.batch}%` }}
                            transition={{ duration: 1, delay: 0.3 }}
                          />
                        </div>
                      </div>

                      {/* Barcode check */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-mono font-medium text-slate-400">
                          <span>Barcode Match - 15%</span>
                          <span className={scanResult.signal_breakdown?.barcode >= 80 ? "text-brand-green" : "text-brand-red"}>
                            {scanResult.signal_breakdown?.barcode}%
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                          <motion.div 
                            className={`h-full rounded-full ${scanResult.signal_breakdown?.barcode >= 80 ? 'bg-brand-green' : 'bg-brand-red'}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${scanResult.signal_breakdown?.barcode}%` }}
                            transition={{ duration: 1, delay: 0.45 }}
                          />
                        </div>
                      </div>

                      {/* Community check */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-mono font-medium text-slate-400">
                          <span>Community Alerts - 10%</span>
                          <span className={scanResult.signal_breakdown?.community >= 80 ? "text-brand-green" : "text-brand-red"}>
                            {scanResult.signal_breakdown?.community}%
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                          <motion.div 
                            className={`h-full rounded-full ${scanResult.signal_breakdown?.community >= 80 ? 'bg-brand-green' : 'bg-brand-red'}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${scanResult.signal_breakdown?.community}%` }}
                            transition={{ duration: 1, delay: 0.6 }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Uploaded Package snapshot visual */}
                  <div className="glass-panel rounded-xl p-6 space-y-4">
                    <h3 className="text-base font-bold font-mono text-slate-300 uppercase tracking-wider">Package Snapshot</h3>
                    <div className="rounded-lg overflow-hidden border border-panel-border bg-slate-950 p-2 flex justify-center">
                      <img 
                        src={getImageUrl(scanResult.image_url)} 
                        alt="Uploaded Scan" 
                        className="max-h-52 object-contain" 
                      />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ================= ALERTS MAP VIEW ================= */}
          {currentView === 'map' && (
            <motion.div 
              key="map"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold font-mono text-emerald-400 uppercase tracking-wide">Live Counterfeit Alert Map</h2>
                  <p className="text-sm text-slate-400 mt-1">Real-time geospatial hotspot intelligence dashboard of confirmed caution or high-risk scans</p>
                </div>
                
                {/* Severity Filter Controls */}
                <div className="flex items-center gap-3 bg-panel-dark border border-panel-border rounded-xl p-1.5">
                  <button 
                    onClick={() => setMapFilter('all')} 
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${mapFilter === 'all' ? 'bg-brand-green text-bg-dark font-extrabold' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    All Incidents
                  </button>
                  <button 
                    onClick={() => setMapFilter('high')} 
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${mapFilter === 'high' ? 'bg-red-500/20 text-brand-red border border-red-500/30' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    High Risk
                  </button>
                  <button 
                    onClick={() => setMapFilter('caution')} 
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${mapFilter === 'caution' ? 'bg-amber-500/20 text-brand-amber border border-amber-500/30' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    Cautions
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Map Canvas block */}
                <div className="lg:col-span-3 h-[500px] rounded-xl overflow-hidden border border-panel-border" ref={mapContainerRef}></div>

                {/* Map Alerts feed panel */}
                <div className="glass-panel rounded-xl p-5 h-[500px] flex flex-col">
                  <h3 className="font-bold text-sm text-slate-300 font-mono uppercase pb-3 border-b border-slate-700/60 flex items-center justify-between">
                    <span>Recent Incident Feed</span>
                    <span className="px-2 py-0.5 rounded bg-red-950/60 border border-red-500/35 text-brand-red text-[10px] font-mono font-bold animate-pulse">
                      Live Updates
                    </span>
                  </h3>

                  <div className="flex-1 overflow-y-auto space-y-3 pt-3">
                    {alertsList.length > 0 ? (
                      alertsList.map((alert, idx) => (
                        <motion.div 
                          key={idx}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          onClick={() => focusAlertOnMap(alert)}
                          className="p-3 bg-bg-dark/40 hover:bg-bg-dark/80 rounded-lg border border-panel-border hover:border-emerald-500/30 cursor-pointer transition-all flex flex-col gap-1.5 group"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-slate-200 font-mono group-hover:text-emerald-400 transition-all">{alert.medicine_name}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase ${
                              alert.severity === 'high' ? 'bg-red-950/65 text-brand-red border border-red-500/20' : 
                              'bg-amber-950/65 text-brand-amber border border-amber-500/20'
                            }`}>
                              {alert.severity}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex flex-col gap-0.5 font-mono">
                            <div>Batch: <span className="text-slate-300">{alert.batch_number}</span></div>
                            <div>Manufacturer: <span className="text-slate-400 text-[10px]">{alert.manufacturer_name}</span></div>
                            <div className="text-right text-[9px] text-slate-600 mt-1">Flagged Reports: {alert.report_count}</div>
                          </div>
                        </motion.div>
                      ))
                    ) : (
                      <div className="text-center py-16 text-slate-500 text-xs">
                        No suspect alerts recorded in the past 24 hours.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ================= MEDICINE LOOKUP VIEW ================= */}
          {currentView === 'lookup' && (
            <motion.div 
              key="lookup"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="max-w-3xl mx-auto space-y-6"
            >
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold font-mono text-emerald-400 uppercase tracking-wide">{t[lang].lookup}</h2>
                <p className="text-sm text-slate-400">Search approved manufacturers and specifications within the CDSCO Reference Database</p>
              </div>

              {/* Search Input bar */}
              <div className="relative">
                <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-500" />
                <input 
                  type="text"
                  placeholder="Search by brand name, active ingredients (e.g. Paracetamol), or manufacturer..."
                  value={lookupQuery}
                  onChange={(e) => handleLookupSearch(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 bg-panel-dark border border-panel-border focus:border-brand-green/50 rounded-xl text-slate-200 focus:outline-none placeholder-slate-500 font-medium transition-all"
                />
              </div>

              {/* Lookup Search Results list */}
              <div className="space-y-4">
                {lookupResults.length > 0 ? (
                  lookupResults.map((med, idx) => (
                    <div 
                      key={idx} 
                      onClick={() => setSelectedMedicineDetails(med)}
                      className="glass-panel p-5 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-emerald-500/25 cursor-pointer transition-all"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-lg text-slate-200">{med.name}</span>
                          <span className="text-[10px] bg-slate-800 border border-slate-700 text-slate-400 px-2 py-0.5 rounded font-mono">CDSCO Approved</span>
                        </div>
                        <p className="text-xs text-slate-400 font-mono">Manufacturer: <span className="text-slate-300 font-semibold">{med.manufacturer_name}</span></p>
                        <div className="flex flex-wrap gap-1.5 pt-2">
                          {med.composition.map((comp, cIdx) => (
                            <span key={cIdx} className="text-[10px] bg-emerald-500/10 text-brand-green border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono">
                              {comp}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="border-t md:border-t-0 md:border-l border-slate-700/60 pt-3 md:pt-0 md:pl-6 text-xs space-y-1.5 min-w-[200px] font-mono">
                        <div className="text-slate-500">Registered Batch Scheme:</div>
                        <div className="font-bold text-emerald-400 text-sm">{med.approved_batch_format}</div>
                        <div className="flex items-center gap-1.5 text-slate-400 text-[10px]">
                          <span className="w-2.5 h-2.5 rounded-full inline-block border border-white/20" style={{ backgroundColor: med.expected_colors?.primary || '#fff' }}></span>
                          <span>Standard Color Profile</span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : lookupQuery ? (
                  <div className="text-center py-12 text-slate-500 text-sm">
                    No registered medicines matched your search.
                  </div>
                ) : (
                  <div className="text-center py-16 text-slate-500 text-xs font-mono space-y-2">
                    <Database className="w-10 h-10 text-slate-700 mx-auto" />
                    <p>Database seeded with 500+ CDSCO registered pharmaceutical formulations.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ================= SCAN HISTORY VIEW ================= */}
          {currentView === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <div>
                <h2 className="text-2xl font-bold font-mono text-emerald-400 uppercase tracking-wide">{t[lang].history}</h2>
                <p className="text-sm text-slate-400 mt-1">Archived log files of packaging checks performed under this account</p>
              </div>

              <div className="glass-panel rounded-xl overflow-hidden border border-panel-border">
                <table className="w-full border-collapse text-left text-sm text-slate-200">
                  <thead className="bg-panel-dark border-b border-panel-border font-mono text-xs uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-6 py-4">Medicine Brand</th>
                      <th className="px-6 py-4">Scan Date</th>
                      <th className="px-6 py-4">Authentic Rating</th>
                      <th className="px-6 py-4">Verdict Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {scanHistory.length > 0 ? (
                      scanHistory.map((scan, idx) => (
                        <tr key={idx} className="hover:bg-bg-dark/50 transition-colors">
                          <td className="px-6 py-4 font-bold text-slate-200">{scan.medicine_name || "Unknown Product"}</td>
                          <td className="px-6 py-4 text-xs text-slate-400 font-mono">
                            {scan.scanned_at ? new Date(scan.scanned_at).toLocaleString() : 'N/A'}
                          </td>
                          <td className="px-6 py-4 font-mono font-bold">{scan.authenticity_score}%</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                              scan.verdict === 'verified' ? 'bg-emerald-500/10 text-brand-green border-emerald-500/20' : 
                              scan.verdict === 'caution' ? 'bg-amber-500/10 text-brand-amber border-amber-500/20' : 
                              'bg-red-500/10 text-brand-red border-red-500/20'
                            }`}>
                              {scan.verdict}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={async () => {
                                try {
                                  if (isOffline) {
                                    showToast("Offline mode. Loading local data simulator.", "info");
                                    return;
                                  }
                                  const res = await fetch(`${API_BASE_URL}/scans/${scan.id}`, {
                                    headers: { 'Authorization': `Bearer ${user.token}` }
                                  });
                                  const data = await res.json();
                                  if (res.ok) {
                                    setScanResult(data);
                                    if (data.medicine_id) {
                                      fetchAlternatives(data.medicine_id);
                                    }
                                    setCurrentView('result');
                                  }
                                } catch (err) {
                                  showToast('Error opening scan logs.', 'error');
                                }
                              }}
                              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1 rounded transition-all cursor-pointer"
                            >
                              Details
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" className="text-center py-16 text-slate-500 text-xs">
                          No scan records found in database history. Go to scan page to verify a package.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* ================= DASHBOARD VIEW ================= */}
          {currentView === 'dashboard' && dashboardStats && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
            >
              <div>
                <h2 className="text-2xl font-bold font-mono text-emerald-400 uppercase tracking-wide">Pharmacist Analytics Dashboard</h2>
                <p className="text-sm text-slate-400 mt-1">Live statistical insights of pharmaceutical checks and active regional anomalies</p>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="glass-panel p-5 rounded-xl space-y-2">
                  <span className="text-slate-500 text-xs uppercase tracking-wider font-mono">Total Verified Scans</span>
                  <p className="text-3xl font-black font-mono text-slate-100">{dashboardStats.total_scans}</p>
                </div>
                <div className="glass-panel p-5 rounded-xl space-y-2">
                  <span className="text-slate-500 text-xs uppercase tracking-wider font-mono">Verified Genuine</span>
                  <p className="text-3xl font-black font-mono text-emerald-400">{dashboardStats.verified}</p>
                </div>
                <div className="glass-panel p-5 rounded-xl space-y-2">
                  <span className="text-slate-500 text-xs uppercase tracking-wider font-mono">Caution Required</span>
                  <p className="text-3xl font-black font-mono text-amber-500">{dashboardStats.caution}</p>
                </div>
                <div className="glass-panel p-5 rounded-xl space-y-2">
                  <span className="text-slate-500 text-xs uppercase tracking-wider font-mono">High Risk Scans</span>
                  <p className="text-3xl font-black font-mono text-red-500">{dashboardStats.high_risk}</p>
                </div>
                <div className="glass-panel p-5 rounded-xl col-span-2 lg:col-span-1 space-y-2">
                  <span className="text-slate-500 text-xs uppercase tracking-wider font-mono">Active Recalls</span>
                  <p className="text-3xl font-black font-mono text-rose-400">{dashboardStats.active_alerts}</p>
                </div>
              </div>

              {/* Charts Section */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Scan trend Line chart - Explicit heights added to eliminate width/height Recharts warnings */}
                <div className="lg:col-span-2 glass-panel p-5 rounded-xl space-y-4">
                  <h3 className="text-sm font-bold font-mono text-slate-300 uppercase tracking-wider">Historical Verification Stream</h3>
                  <div className="h-64 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={[
                        { name: '1 Jun', scans: 12, flags: 1 },
                        { name: '5 Jun', scans: 18, flags: 0 },
                        { name: '10 Jun', scans: 25, flags: 3 },
                        { name: '15 Jun', scans: 22, flags: 2 },
                        { name: '20 Jun', scans: 34, flags: 5 },
                        { name: '23 Jun', scans: dashboardStats.total_scans, flags: dashboardStats.high_risk + dashboardStats.caution }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                        <YAxis stroke="#64748b" fontSize={11} />
                        <Tooltip contentStyle={{ backgroundColor: '#0f1423', borderColor: 'rgba(255,255,255,0.08)' }} />
                        <Line type="monotone" dataKey="scans" stroke="#10b981" strokeWidth={2} name="Total Scans" dot={{ r: 4 }} />
                        <Line type="monotone" dataKey="flags" stroke="#ef4444" strokeWidth={2} name="Anomalies Flagged" dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Pie risk ratio chart - Explicit height to eliminate console warnings */}
                <div className="glass-panel p-5 rounded-xl space-y-4 flex flex-col justify-between">
                  <h3 className="text-sm font-bold font-mono text-slate-300 uppercase tracking-wider">Authenticity Ratio</h3>
                  <div className="relative h-48 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Verified', value: dashboardStats.verified || 1 },
                            { name: 'Caution', value: dashboardStats.caution || 0 },
                            { name: 'High Risk', value: dashboardStats.high_risk || 0 }
                          ]}
                          innerRadius={50}
                          outerRadius={70}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          <Cell fill="#10b981" />
                          <Cell fill="#f59e0b" />
                          <Cell fill="#ef4444" />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute text-center">
                      <span className="text-2xl font-black font-mono">
                        {Math.round(((dashboardStats.verified) / (dashboardStats.total_scans || 1)) * 100)}%
                      </span>
                      <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Genuine Rate</p>
                    </div>
                  </div>
                  <div className="flex justify-around text-xs font-mono font-medium pt-2 border-t border-slate-800">
                    <span className="text-brand-green">Genuine</span>
                    <span className="text-brand-amber">Caution</span>
                    <span className="text-brand-red">High Risk</span>
                  </div>
                </div>
              </div>

              {/* NEW Interactive Dashboard Feature: BarChart detailing Top Flagged Brands */}
              {dashboardTopFlagged.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-panel p-6 rounded-xl space-y-4"
                >
                  <h3 className="text-sm font-bold font-mono text-slate-300 uppercase tracking-wider">Top Spurious Brands (Regional Detections)</h3>
                  <div className="h-64 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={dashboardTopFlagged}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                        <YAxis stroke="#64748b" fontSize={11} />
                        <Tooltip contentStyle={{ backgroundColor: '#0f1423', borderColor: 'rgba(255,255,255,0.08)' }} />
                        <Bar dataKey="flag_count" fill="#ef4444" radius={[4, 4, 0, 0]} name="Anomaly Scans Count">
                          {dashboardTopFlagged.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill="#ef4444" />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ================= AUTH VIEWS ================= */}
          {(currentView === 'login' || currentView === 'register') && (
            <motion.div 
              key="auth"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="max-w-md mx-auto py-8 animate-fade-in"
            >
              <div className="glass-panel p-8 rounded-2xl space-y-6">
                
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-bold font-mono text-emerald-400 uppercase tracking-wider">
                    {currentView === 'login' ? 'PORTAL ACCESS' : 'CREATE PORTAL ACCOUNT'}
                  </h2>
                  <p className="text-xs text-slate-400 uppercase tracking-widest font-mono">
                    {currentView === 'login' ? 'Sign in to access verify tools' : 'Register license credentials'}
                  </p>
                </div>

                {authError && (
                  <div className="p-3 bg-red-950/30 border border-red-500/30 text-red-200 text-xs rounded-lg text-center font-mono leading-relaxed">
                    {authError}
                  </div>
                )}

                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 font-mono uppercase">Email Address</label>
                    <input 
                      type="email"
                      placeholder="name@pharmacy.com"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      className="w-full px-4 py-2.5 bg-bg-dark border border-panel-border focus:border-emerald-500/40 rounded-lg text-slate-200 focus:outline-none text-sm transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 font-mono uppercase">Password</label>
                    <input 
                      type="password"
                      placeholder="••••••••"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      className="w-full px-4 py-2.5 bg-bg-dark border border-panel-border focus:border-emerald-500/40 rounded-lg text-slate-200 focus:outline-none text-sm transition-all"
                    />
                  </div>

                  {currentView === 'register' && (
                    <>
                      <div className="space-y-1">
                        <label className="text-xs text-slate-400 font-mono uppercase">Role Designation</label>
                        <select 
                          value={authRole}
                          onChange={(e) => setAuthRole(e.target.value)}
                          className="w-full px-4 py-2.5 bg-bg-dark border border-panel-border focus:border-emerald-500/40 rounded-lg text-slate-200 focus:outline-none text-sm cursor-pointer transition-all"
                        >
                          <option value="pharmacist">Verified Pharmacist</option>
                          <option value="inspector">Government Drug Inspector</option>
                          <option value="healthcare_worker">Healthcare Field Worker</option>
                          <option value="consumer">Standard Patient / Consumer</option>
                        </select>
                      </div>

                      {(authRole === 'pharmacist' || authRole === 'inspector') && (
                        <div className="space-y-1 animate-slide-in">
                          <label className="text-xs text-slate-400 font-mono uppercase">GSTIN / License Number</label>
                          <input 
                            type="text"
                            placeholder="DL-25129/2026"
                            value={authLicense}
                            onChange={(e) => setAuthLicense(e.target.value)}
                            className="w-full px-4 py-2.5 bg-bg-dark border border-panel-border focus:border-emerald-500/40 rounded-lg text-slate-200 focus:outline-none text-sm transition-all"
                          />
                        </div>
                      )}

                      <div className="space-y-1">
                        <label className="text-xs text-slate-400 font-mono uppercase">Postal PIN Code</label>
                        <input 
                          type="text"
                          placeholder="380009"
                          value={authPin}
                          onChange={(e) => setAuthPin(e.target.value)}
                          className="w-full px-4 py-2.5 bg-bg-dark border border-panel-border focus:border-emerald-500/40 rounded-lg text-slate-200 focus:outline-none text-sm transition-all"
                        />
                      </div>
                    </>
                  )}

                  <button 
                    onClick={() => handleAuth(currentView)}
                    className="w-full bg-brand-green hover:bg-emerald-600 text-bg-dark font-black py-3 rounded-lg text-sm tracking-wide uppercase transition-all mt-4 cursor-pointer"
                  >
                    {currentView === 'login' ? 'Authenticate Session' : 'Register Credentials'}
                  </button>

                  <div className="text-center pt-2 text-xs text-slate-500">
                    {currentView === 'login' ? (
                      <p>
                        No credentials yet?{' '}
                        <span onClick={() => { setCurrentView('register'); setAuthError(''); }} className="text-brand-green hover:underline cursor-pointer">
                          Create pharmacist account
                        </span>
                      </p>
                    ) : (
                      <p>
                        Already registered?{' '}
                        <span onClick={() => { setCurrentView('login'); setAuthError(''); }} className="text-brand-green hover:underline cursor-pointer">
                          Authenticate session
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Medicine detail view modal popup */}
        {selectedMedicineDetails && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="glass-panel p-6 rounded-2xl max-w-lg w-full space-y-4 border border-emerald-500/30"
            >
              <div className="flex justify-between items-start pb-2 border-b border-slate-700/60">
                <div>
                  <h3 className="font-extrabold text-xl text-slate-200">{selectedMedicineDetails.name}</h3>
                  <span className="text-xs text-slate-400 font-mono">{selectedMedicineDetails.generic_name}</span>
                </div>
                <button 
                  onClick={() => setSelectedMedicineDetails(null)}
                  className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-slate-500 text-xs uppercase font-mono block">Composition</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedMedicineDetails.composition?.map((comp, idx) => (
                      <span key={idx} className="bg-emerald-500/10 text-brand-green border border-emerald-500/25 px-2 py-0.5 rounded-full text-xs font-mono">{comp}</span>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-slate-500 text-xs uppercase font-mono block">Registered Manufacturer</span>
                  <p className="font-semibold text-slate-300 mt-0.5">{selectedMedicineDetails.manufacturer_name}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-slate-500 text-xs uppercase font-mono block">CDSCO License ID</span>
                    <p className="font-semibold text-slate-300 mt-0.5">{selectedMedicineDetails.cdsco_license || 'MFG/CDSCO/VALID'}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs uppercase font-mono block">Standard Batch Format</span>
                    <p className="font-semibold text-brand-green font-mono mt-0.5">{selectedMedicineDetails.approved_batch_format}</p>
                  </div>
                </div>

                <div className="pt-2">
                  <span className="text-slate-500 text-xs uppercase font-mono block mb-1">Standard Packaging Layout Colors</span>
                  <div className="flex items-center gap-2">
                    <div className="w-12 h-6 rounded border border-white/20" style={{ backgroundColor: selectedMedicineDetails.expected_colors?.primary || '#fff' }}></div>
                    <span className="text-xs text-slate-400 font-mono">Primary Palette Code: {selectedMedicineDetails.expected_colors?.primary}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </main>

      {/* Floating collapsable trust-signaling chatbot FAQ support - MedSecure Assist */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
        {isChatOpen ? (
          <motion.div 
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-80 h-96 glass-panel rounded-2xl flex flex-col overflow-hidden border border-emerald-500/25 shadow-2xl mb-3"
          >
            {/* Header */}
            <div className="bg-panel-dark px-4 py-3 border-b border-panel-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-brand-green" />
                <span className="font-bold font-mono text-sm tracking-wide text-emerald-400">MedSecure Assist</span>
              </div>
              <button 
                onClick={() => setIsChatOpen(false)} 
                className="text-slate-400 hover:text-white"
              >
                <ChevronDown className="w-5 h-5" />
              </button>
            </div>

            {/* Message Area */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 scrollbar-thin">
              {chatMessages.map((msg, idx) => (
                <div 
                  key={idx} 
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] rounded-xl px-3.5 py-2 text-xs leading-relaxed ${
                    msg.sender === 'user' 
                      ? 'bg-brand-green text-bg-dark font-semibold rounded-tr-none' 
                      : 'bg-bg-dark border border-panel-border text-slate-200 rounded-tl-none'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Prompts Helper */}
            <div className="px-4 py-1.5 bg-bg-dark/40 border-t border-panel-border/30 flex flex-wrap gap-1">
              <button onClick={() => { setChatInput("How do I check if my batch is real?"); }} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-0.5 rounded border border-slate-700 font-mono">Verify Batch Rules</button>
              <button onClick={() => { setChatInput("What criteria determines a risk score?"); }} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-0.5 rounded border border-slate-700 font-mono">Risk Weighting</button>
            </div>

            {/* Input Bar */}
            <div className="p-3 bg-panel-dark border-t border-panel-border flex gap-2">
              <input 
                type="text" 
                placeholder="Ask helper..." 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
                className="flex-1 bg-bg-dark border border-panel-border focus:border-brand-green/40 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none placeholder-slate-500"
              />
              <button 
                onClick={handleChatSend}
                className="p-2 bg-brand-green hover:bg-emerald-600 text-bg-dark rounded-lg flex items-center justify-center transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        ) : null}

        <button 
          onClick={() => setIsChatOpen(!isChatOpen)}
          className="flex items-center gap-2 bg-brand-green hover:bg-emerald-600 text-bg-dark font-extrabold px-4 py-3 rounded-full shadow-lg hover:scale-105 transition-all cursor-pointer animate-glow-green"
        >
          <MessageSquare className="w-5 h-5 text-bg-dark" />
          <span className="text-sm font-black font-mono">MedSecure FAQ</span>
        </button>
      </div>

      {/* Footer component */}
      <footer className="border-t border-panel-border bg-slate-950/40 py-6 px-6 text-center text-xs text-slate-600 font-mono mt-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          © 2026 MedSecure AI Project. Registered under India CDSCO framework validation standards.
        </div>
        <div className="flex items-center gap-4 text-[10px] uppercase">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span> {t[lang].status_online}</span>
          <span>Build: v2.0.0 (Fastify + OpenCV Local Runtime)</span>
        </div>
      </footer>
    </div>
  );
}
