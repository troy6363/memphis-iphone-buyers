// Import Firebase (ES Modules via CDN)
// Repository: atlasinvoice
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyAM1TbquR-O_V0oJOTuJGfrafXSD0b8Nuk",
    authDomain: "memphis-inventory.firebaseapp.com",
    projectId: "memphis-inventory",
    storageBucket: "memphis-inventory.firebasestorage.app",
    messagingSenderId: "687793080054",
    appId: "1:687793080054:web:f0b8446780a5ba28770ed7"
};

// --- Initialization ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Data State
const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

let appData = {};
let currentView = 'dashboard';
let revenueChart = null;
let unsubscribe = null;
let currentUser = null;

// Initialize Empty Structure
months.forEach(month => {
    appData[month] = { invoices: [], totalDevices: 0, totalPaid: 0 };
});

// --- DOM Elements ---
const monthNav = document.getElementById('monthNav');
const pageTitle = document.getElementById('pageTitle');
const pageSubtitle = document.getElementById('pageSubtitle');
const dashboardView = document.getElementById('dashboardView');
const monthView = document.getElementById('monthView');
const dashUploadBtn = document.getElementById('dashUploadBtn');
const loginView = document.getElementById('loginView');
const appContainer = document.getElementById('app');

// --- Auth Monitoring ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Logged In
        console.log("✅ User logged in:", user.email);
        currentUser = user;
        loginView.classList.add('hidden');
        appContainer.classList.remove('hidden'); // Ensure app is visible

        // Start Data Sync
        setupRealtimeListener();
    } else {
        // Logged Out
        console.log("🔒 User logged out");
        currentUser = null;
        loginView.classList.remove('hidden');
        // Optional: Hide app content behind login, though overlay covers it
        if (unsubscribe) unsubscribe(); // Stop listening
    }
});

// --- Main Init ---
function init() {
    renderNav();
    loadView('dashboard');

    // Auth Listeners - EXPOSED GLOBALLY
    window.triggerLogin = function () {
        console.log("Attempting Google Sign-In...");
        signInWithPopup(auth, provider)
            .then((result) => {
                console.log("Sign-in successful", result.user);
            })
            .catch((error) => {
                console.error("Login Error:", error);
                alert(`Login Failed: ${error.message}`);
            });
    };

    window.triggerLogout = function () {
        if (confirm("Sign out?")) {
            signOut(auth).then(() => console.log("Signed out"));
        }
    };

    // App Listeners
    if (dashUploadBtn) {
        dashUploadBtn.addEventListener('click', () => {
            const currentMonth = new Date().toLocaleString('default', { month: 'long' });
            loadView(currentMonth);
        });
    }

    const searchInput = document.getElementById('globalSearch');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') performSearch(e.target.value);
        });
    }

    // File Upload
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    if (dropZone) {
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault(); dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
        });
    }
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) handleFile(e.target.files[0]);
        });
    }

    // Clear Month
    const clearBtn = document.getElementById('clearMonthBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm(`Are you sure you want to clear all data for ${currentView}?`)) {
                appData[currentView] = { invoices: [], totalDevices: 0, totalPaid: 0 };
                saveData();
            }
        });
    }

    updateDateDisplay();
}

// --- Firebase Logic ---
function setupRealtimeListener() {
    const docRef = doc(db, "data", "inventory");

    unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            const cloudData = docSnap.data();
            months.forEach(m => {
                if (cloudData[m]) appData[m] = cloudData[m];
                else appData[m] = { invoices: [], totalDevices: 0, totalPaid: 0 };
            });
            refreshUI();
        } else {
            console.log("☁️ Creating new database...");
            saveData();
        }
    }, (error) => {
        console.error("Sync Error:", error);
    });
}

function saveData() {
    if (!currentUser) return; // Guard clause
    const docRef = doc(db, "data", "inventory");
    setDoc(docRef, appData).catch((e) => console.error("Save failed:", e));
}

function refreshUI() {
    renderNav();
    if (currentView === 'dashboard') renderDashboard();
    else if (currentView !== 'search') renderMonthDetail(currentView);
}

// --- Navigation ---
window.loadView = function (view) {
    currentView = view;
    renderNav();

    if (dashboardView) dashboardView.classList.add('hidden');
    if (document.getElementById('monthView')) document.getElementById('monthView').classList.add('hidden');
    if (document.getElementById('searchView')) document.getElementById('searchView').classList.add('hidden');

    if (view === 'dashboard') {
        pageTitle.innerText = 'Memphis iPhone Buyers Inventory';
        pageSubtitle.innerText = 'Track and analyze your device inventory and revenue';
        dashboardView.classList.remove('hidden');
        renderDashboard();
    } else if (view === 'search') {
        pageTitle.innerText = 'Search Results';
        pageSubtitle.innerText = 'Locate devices by IMEI';
        document.getElementById('searchView').classList.remove('hidden');
    } else {
        pageTitle.innerText = `${view} Overview`;
        pageSubtitle.innerText = 'Manage monthly uploads and view item details';
        document.getElementById('monthView').classList.remove('hidden');
        renderMonthDetail(view);
    }
}

function renderNav() {
    const nav = document.getElementById('monthNav');
    nav.innerHTML = `<li class="nav-item ${currentView === 'dashboard' ? 'active' : ''}" onclick="loadView('dashboard')">
        <span><i class="ph ph-squares-four"></i> Dashboard</span>
    </li>`;

    months.forEach(month => {
        const data = appData[month] || { totalDevices: 0 };
        const isActive = currentView === month ? 'active' : '';
        const hasData = data.totalDevices > 0 ? `<span style="font-size:0.8rem; background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px;">${data.totalDevices}</span>` : '';

        nav.innerHTML += `
            <li class="nav-item ${isActive}" onclick="loadView('${month}')">
                <span><i class="ph ph-calendar"></i> ${month}</span>
                ${hasData}
            </li>
        `;
    });
}

// --- Dashboard Logic ---
function renderDashboard() {
    const filterEl = document.getElementById('dashboardTimeFilter');
    const filterValue = filterEl ? filterEl.value : 'year';

    if (filterEl && !filterEl.onchange) filterEl.onchange = () => renderDashboard();

    let totalDevices = 0;
    let totalRevenue = 0;
    let totalInvoices = 0;
    let itemsForLeaderboard = [];

    let targetMonths = (filterValue === 'year') ? months : [filterValue];
    if (document.getElementById('dashDevicesSub')) {
        document.getElementById('dashDevicesSub').innerText = (filterValue === 'year') ? 'All-time' : filterValue;
    }

    targetMonths.forEach(m => {
        const d = appData[m];
        if (d) {
            totalDevices += d.totalDevices;
            totalRevenue += d.totalPaid;
            totalInvoices += (d.invoices || []).length;
            (d.invoices || []).forEach(inv => {
                if (inv.items) itemsForLeaderboard.push(...inv.items);
            });
        }
    });

    const avgPrice = totalDevices > 0 ? (totalRevenue / totalDevices) : 0;

    animateValue('dashTotalDevices', totalDevices);
    document.getElementById('dashTotalRevenue').innerText = formatCurrency(totalRevenue);
    document.getElementById('dashAvgPrice').innerText = formatCurrency(avgPrice);
    animateValue('dashTotalInvoices', totalInvoices);

    renderChart();
    renderTopDevices(itemsForLeaderboard);
}

function renderChart() {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;
    const dataPoints = months.map(m => (appData[m] ? appData[m].totalPaid : 0));
    if (revenueChart) { revenueChart.destroy(); }

    const canvas = ctx.getContext('2d');
    const gradient = canvas.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.5)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

    if (typeof Chart !== 'undefined') {
        revenueChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: months.map(m => m.substring(0, 3)),
                datasets: [{
                    label: 'Revenue',
                    data: dataPoints,
                    borderColor: '#3b82f6',
                    backgroundColor: gradient,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#3b82f6'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8' } },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
                }
            }
        });
    }
}

function renderTopDevices(items) {
    const listContainer = document.getElementById('topDevicesList');
    if (!listContainer) return;
    if (items.length === 0) { listContainer.innerHTML = '<div class="empty-state">No devices sold yet</div>'; return; }

    const modelStats = {};
    items.forEach(item => {
        const name = item.model || 'Unknown';
        if (!modelStats[name]) modelStats[name] = { qty: 0, rev: 0 };
        modelStats[name].qty += item.quantity;
        modelStats[name].rev += item.price;
    });

    const sorted = Object.entries(modelStats)
        .map(([name, stat]) => ({ name, ...stat }))
        .sort((a, b) => b.rev - a.rev)
        .slice(0, 5);

    listContainer.innerHTML = '';
    sorted.forEach(device => {
        listContainer.innerHTML += `
            <div class="device-item">
                <div class="device-info">
                    <span class="device-name">${device.name}</span>
                    <span class="device-qty">${device.qty} units sold</span>
                </div>
                <div class="device-rev">${formatCurrency(device.rev)}</div>
            </div>
        `;
    });
}

function renderMonthDetail(month) {
    const data = appData[month];
    if (!data) return;

    animateValue('monthDevices', data.totalDevices);
    document.getElementById('monthSpend').innerText = formatCurrency(data.totalPaid);

    const tbody = document.getElementById('invoicesTableBody');
    const itemsTbody = document.getElementById('itemsTableBody');

    tbody.innerHTML = '';
    itemsTbody.innerHTML = '';

    // Delete Invoice Logic
    window.deleteInvoice = function (month, index) {
        if (!confirm('Are you sure you want to delete this invoice? This action cannot be undone.')) return;

        const monthData = appData[month];
        if (!monthData || !monthData.invoices[index]) return;

        // Remove invoice
        monthData.invoices.splice(index, 1);

        // Recalculate Totals
        let newDevices = 0;
        let newPaid = 0;
        monthData.invoices.forEach(inv => {
            newDevices += inv.deviceCount;
            newPaid += inv.totalAmount;
        });
        monthData.totalDevices = newDevices;
        monthData.totalPaid = newPaid;

        saveData();
    };

    if (data.invoices.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem;">No invoices uploaded yet</td></tr>`;
        itemsTbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 2rem;">No items yet</td></tr>`;
    } else {
        data.invoices.forEach((inv, index) => {
            tbody.innerHTML += `
                <tr>
                    <td>${new Date(inv.uploadDate).toLocaleDateString()}</td>
                    <td>${inv.fileName}</td>
                    <td>${inv.deviceCount}</td>
                    <td>${formatCurrency(inv.totalAmount)}</td>
                    <td>
                        <button class="btn btn-danger" style="padding: 0.4rem; font-size: 1rem;" onclick="deleteInvoice('${month}', ${index})">
                            <i class="ph-bold ph-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
            if (inv.items) {
                const uploadDate = new Date(inv.uploadDate).toLocaleDateString();
                inv.items.forEach(item => {
                    itemsTbody.innerHTML += `
                        <tr>
                            <td>${item.model}</td>
                            <td style="color: var(--text-muted); font-size: 0.9rem;">${uploadDate}</td>
                            <td style="font-family: monospace; font-size: 0.85rem; color: var(--text-muted);">${item.imei || '-'}</td>
                            <td>${item.quantity}</td>
                            <td>${formatCurrency(item.price)}</td>
                        </tr>
                    `;
                });
            }
        });
    }
}

window.handleFile = function (file) {
    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) { alert('Please upload a CSV file.'); return; }
    if (typeof Papa !== 'undefined') {
        Papa.parse(file, {
            header: true, dynamicTyping: true, skipEmptyLines: true,
            complete: function (results) { processInvoiceData(results.data, file.name); }
        });
    }
}

function processInvoiceData(rows, fileName) {
    let invoiceDeviceCount = 0;
    let invoiceTotal = 0;
    let invoiceItems = [];
    const fileDate = extractDateFromFilename(fileName);

    const validRows = rows.filter(row => {
        const values = Object.values(row);
        const populated = values.filter(v => v !== null && v !== '' && v !== undefined).length;
        if (populated < 2) return false;
        const hasTotalKeyword = values.some(v => typeof v === 'string' && (v.toLowerCase().includes('total') || v.toLowerCase().includes('subtotal') || v.toLowerCase().includes('amount due')));
        if (hasTotalKeyword) return false;
        return true;
    });

    validRows.forEach(row => {
        const keys = Object.keys(row);
        const lowerKeys = keys.map(k => k.toLowerCase());
        let qty = 1;
        const qtyKeyIndex = lowerKeys.findIndex(k => k.includes('qty') || k.includes('quantity'));
        if (qtyKeyIndex !== -1) {
            const raw = row[keys[qtyKeyIndex]];
            const parsed = parseCleanNumber(raw);
            if (!isNaN(parseFloat(raw))) qty = parsed;
        }
        const modelKeyIndex = lowerKeys.findIndex(k => k.includes('model') || k.includes('item') || k.includes('device') || k.includes('desc'));
        let model = modelKeyIndex !== -1 ? row[keys[modelKeyIndex]] : 'Unknown Device';
        if (!model || (typeof model === 'string' && (model.trim() === '' || model.toLowerCase() === 'total'))) model = 'Unknown Device';
        const imeiIndex = lowerKeys.findIndex(k => k.includes('imei') || k.includes('serial'));
        const imei = imeiIndex !== -1 ? String(row[keys[imeiIndex]]) : '';
        const itemDate = fileDate || null;
        let lineTotal = 0;
        const totalIdx = lowerKeys.findIndex(k => k.includes('total') || k.includes('amount'));
        if (totalIdx !== -1) lineTotal = parseCleanNumber(row[keys[totalIdx]]);
        else {
            const priceIdx = lowerKeys.findIndex(k => k.includes('price'));
            if (priceIdx !== -1) lineTotal = parseCleanNumber(row[keys[priceIdx]]) * qty;
        }
        invoiceDeviceCount += qty;
        invoiceTotal += lineTotal;
        invoiceItems.push({ model: model, quantity: qty, price: lineTotal, imei: imei, date: itemDate });
    });

    const invoiceRecord = {
        fileName: fileName,
        uploadDate: new Date().toISOString(),
        deviceCount: invoiceDeviceCount,
        totalAmount: invoiceTotal,
        items: invoiceItems
    };

    appData[currentView].invoices.push(invoiceRecord);
    appData[currentView].totalDevices += invoiceDeviceCount;
    appData[currentView].totalPaid += invoiceTotal;
    saveData();
}

window.performSearch = function (query) {
    if (!query || query.trim() === '') return;
    loadView('search');

    const resultsBody = document.getElementById('searchResultsBody');
    const stats = document.getElementById('searchStats');
    resultsBody.innerHTML = '';
    const q = query.toLowerCase().trim();
    let count = 0;
    months.forEach(month => {
        const data = appData[month];
        if (data.invoices) {
            data.invoices.forEach(inv => {
                if (inv.items) {
                    inv.items.forEach(item => {
                        const imei = String(item.imei || '').toLowerCase();
                        const model = String(item.model || '').toLowerCase();
                        if (imei.includes(q) || model.includes(q)) {
                            count++;
                            resultsBody.innerHTML += `
                                <tr>
                                    <td><span style="color:var(--primary); font-weight:500;">${month}</span></td>
                                    <td>${item.model}</td>
                                    <td style="font-family: monospace; background: rgba(255,255,255,0.05);">${item.imei || 'N/A'}</td>
                                    <td>${formatCurrency(item.price)}</td>
                                    <td style="font-size: 0.9em; color: var(--text-muted);">${inv.fileName || '-'}</td>
                                </tr>
                            `;
                        }
                    });
                }
            });
        }
    });

    if (count === 0) {
        resultsBody.innerHTML = `<tr><td colspan="5" class="empty-state">No devices found matching "${query}"</td></tr>`;
        stats.innerText = `0 results found`;
    } else {
        stats.innerText = `${count} result${count !== 1 ? 's' : ''} found for "${query}"`;
    }
}

function parseCleanNumber(val) {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        const clean = val.replace(/[$,\s]/g, '');
        const num = parseFloat(clean);
        return isNaN(num) ? 0 : num;
    }
    return 0;
}
function extractDateFromFilename(filename) {
    const match = filename.match(/(\d{4}[-.]\d{2}[-.]\d{2})|(\d{1,2}[-.]\d{1,2}[-.]\d{2,4})/);
    if (match) {
        const d = new Date(match[0]);
        if (!isNaN(d.getTime())) return d.toLocaleDateString();
    }
    return null;
}
function formatCurrency(num) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num); }
function updateDateDisplay() {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('dateDisplay').innerText = new Date().toLocaleDateString('en-US', options);
}
function animateValue(id, end) { const obj = document.getElementById(id); if (obj) obj.innerHTML = end; }

init();
