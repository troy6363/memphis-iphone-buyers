// State Management
const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

let appData = JSON.parse(localStorage.getItem('atlasData')) || {};
let currentView = 'dashboard';
let revenueChart = null; // Chart.js instance

// Initialize empty data structure if new
months.forEach(month => {
    if (!appData[month]) {
        appData[month] = {
            invoices: [],
            totalDevices: 0,
            totalPaid: 0
        };
    }
});

// DOM Elements
const monthNav = document.getElementById('monthNav');
const pageTitle = document.getElementById('pageTitle');
const pageSubtitle = document.getElementById('pageSubtitle');
const dashboardView = document.getElementById('dashboardView');
const monthView = document.getElementById('monthView');
const dashUploadBtn = document.getElementById('dashUploadBtn');

// --- Initialization ---
function init() {
    renderNav();
    updateDateDisplay();
    // Start on Dashboard now that it's useful
    loadView('dashboard');

    // Add event listener for quick upload button
    if (dashUploadBtn) {
        dashUploadBtn.addEventListener('click', () => {
            const currentMonth = new Date().toLocaleString('default', { month: 'long' });
            loadView(currentMonth);
        });
    }

    // Search Listener
    const searchInput = document.getElementById('globalSearch');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                performSearch(e.target.value);
            }
        });
    }
}

// --- Navigation ---
function renderNav() {
    monthNav.innerHTML = `<li class="nav-item ${currentView === 'dashboard' ? 'active' : ''}" onclick="loadView('dashboard')">
        <span><i class="ph ph-squares-four"></i> Dashboard</span>
    </li>`;

    months.forEach(month => {
        const data = appData[month];
        const isActive = currentView === month ? 'active' : '';
        const hasData = data.totalDevices > 0 ? `<span style="font-size:0.8rem; background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px;">${data.totalDevices}</span>` : '';

        monthNav.innerHTML += `
            <li class="nav-item ${isActive}" onclick="loadView('${month}')">
                <span><i class="ph ph-calendar"></i> ${month}</span>
                ${hasData}
            </li>
        `;
    });
}

function loadView(view) {
    currentView = view;
    renderNav();

    const dashboardView = document.getElementById('dashboardView');
    const monthView = document.getElementById('monthView');
    const searchView = document.getElementById('searchView');

    // Reset visibility
    if (dashboardView) dashboardView.classList.add('hidden');
    if (monthView) monthView.classList.add('hidden');
    if (searchView) searchView.classList.add('hidden');

    if (view === 'dashboard') {
        pageTitle.innerText = 'Memphis iPhone Buyers Inventory';
        pageSubtitle.innerText = 'Track and analyze your device inventory and revenue';
        dashboardView.classList.remove('hidden');
        renderDashboard();
    } else if (view === 'search') {
        pageTitle.innerText = 'Search Results';
        pageSubtitle.innerText = 'Locate devices by IMEI';
        searchView.classList.remove('hidden');
    } else {
        pageTitle.innerText = `${view} Overview`;
        pageSubtitle.innerText = 'Manage monthly uploads and view item details';
        monthView.classList.remove('hidden');
        renderMonthDetail(view);
    }
}

// --- Search Logic ---
function performSearch(query) {
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
                        // Search in IMEI or Model
                        const imei = String(item.imei || '').toLowerCase();
                        const model = String(item.model || '').toLowerCase();

                        if (imei.includes(q) || model.includes(q)) {
                            count++;
                            resultsBody.innerHTML += `
                                    <td><span style="color:var(--primary); font-weight:500;">${month}</span></td>
                                    <td>${item.model}</td>
                                    <td style="font-family: monospace; color: var(--text-main); background: rgba(255,255,255,0.05); padding: 4px 8px; border-radius: 4px;">${item.imei || 'N/A'}</td>
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
        resultsBody.innerHTML = `<tr><td colspan="4" class="empty-state">No devices found matching "${query}"</td></tr>`;
        stats.innerText = `0 results found`;
    } else {
        stats.innerText = `${count} result${count !== 1 ? 's' : ''} found for "${query}"`;
    }
}

// --- Dashboard Logic ---
function renderDashboard() {
    // 1. Get Filter Value
    const filterEl = document.getElementById('dashboardTimeFilter');
    const filterValue = filterEl ? filterEl.value : 'year';

    // Bind change event if not already
    if (filterEl && !filterEl.onchange) {
        filterEl.onchange = () => renderDashboard();
    }

    let totalDevices = 0;
    let totalRevenue = 0;
    let totalInvoices = 0;
    let itemsForLeaderboard = [];

    // 2. Select Months to Aggregate
    let targetMonths = [];
    if (filterValue === 'year') {
        targetMonths = months;
        if (document.getElementById('dashDevicesSub')) document.getElementById('dashDevicesSub').innerText = 'All-time';
    } else {
        targetMonths = [filterValue];
        if (document.getElementById('dashDevicesSub')) document.getElementById('dashDevicesSub').innerText = filterValue;
    }

    // 3. Aggregate Data
    targetMonths.forEach(m => {
        const d = appData[m];
        if (d) {
            totalDevices += d.totalDevices;
            totalRevenue += d.totalPaid;
            totalInvoices += d.invoices.length;

            d.invoices.forEach(inv => {
                if (inv.items) itemsForLeaderboard.push(...inv.items);
            });
        }
    });

    const avgPrice = totalDevices > 0 ? (totalRevenue / totalDevices) : 0;

    // 4. Update Cards
    animateValue('dashTotalDevices', totalDevices);
    document.getElementById('dashTotalRevenue').innerText = formatCurrency(totalRevenue);
    document.getElementById('dashAvgPrice').innerText = formatCurrency(avgPrice);
    animateValue('dashTotalInvoices', totalInvoices);

    // 5. Update Chart 
    // If specific month: maybe show daily? For now, let's keep the Yearly Trend visible as context,
    // OR we can highlight the selected month.
    // Let's Keep the chart showing the WHOLE Year context, but maybe we can update the title?
    // Actually, user said "revenue.. adjusts". A 1-point chart is ugly. 
    // Let's Keep the chart as "Yearly Trend" always, as it's better UX to see context.
    renderChart();

    // 6. Update Top Devices (Filtered)
    renderTopDevices(itemsForLeaderboard);
}

// --- Chart.js Integration ---
function renderChart() {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;

    // Format data for chart
    const dataPoints = months.map(m => appData[m].totalPaid);

    if (revenueChart) {
        revenueChart.destroy();
    }

    // Custom gradient for the chart
    const canvas = ctx.getContext('2d');
    const gradient = canvas.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.5)'); // Blue
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

    revenueChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months.map(m => m.substring(0, 3)), // Jan, Feb...
            datasets: [{
                label: 'Revenue',
                data: dataPoints,
                borderColor: '#3b82f6',
                backgroundColor: gradient,
                borderWidth: 2,
                fill: true,
                tension: 0.4, // Smooth curves
                pointBackgroundColor: '#fff',
                pointBorderColor: '#3b82f6'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });
}

function renderTopDevices(items) {
    const listContainer = document.getElementById('topDevicesList');
    if (!listContainer) return;

    if (items.length === 0) {
        listContainer.innerHTML = '<div class="empty-state">No devices sold yet</div>';
        return;
    }

    // Aggregate by Model
    const modelStats = {};
    items.forEach(item => {
        const name = item.model || 'Unknown';
        if (!modelStats[name]) modelStats[name] = { qty: 0, rev: 0 };
        modelStats[name].qty += item.quantity;
        modelStats[name].rev += item.price;
    });

    // Convert to Array and Sort by Revenue
    const sorted = Object.entries(modelStats)
        .map(([name, stat]) => ({ name, ...stat }))
        .sort((a, b) => b.rev - a.rev)
        .slice(0, 5); // Top 5

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

// --- Month Logic ---
function renderMonthDetail(month) {
    const data = appData[month];

    animateValue('monthDevices', data.totalDevices);
    document.getElementById('monthSpend').innerText = formatCurrency(data.totalPaid);

    const tbody = document.getElementById('invoicesTableBody');
    const itemsTbody = document.getElementById('itemsTableBody');

    tbody.innerHTML = '';
    itemsTbody.innerHTML = '';

    if (data.invoices.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 2rem;">No invoices uploaded yet</td></tr>`;
        itemsTbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 2rem;">No items yet</td></tr>`;
    } else {
        data.invoices.forEach(inv => {
            tbody.innerHTML += `
                <tr>
                    <td>${new Date(inv.uploadDate).toLocaleDateString()}</td>
                    <td>${inv.fileName}</td>
                    <td>${inv.deviceCount}</td>
                    <td>${formatCurrency(inv.totalAmount)}</td>
                </tr>
            `;

            if (inv.items) {
                inv.items.forEach(item => {
                    itemsTbody.innerHTML += `
                        <tr>
                            <td>${item.model}</td>
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

// --- File Upload Logic (Same as before) ---
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

function handleFile(file) {
    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) { alert('Please upload a CSV file.'); return; }
    Papa.parse(file, {
        header: true, dynamicTyping: true, skipEmptyLines: true,
        complete: function (results) { processInvoiceData(results.data, file.name); }
    });
}

// --- Helper to parse currency strings ---
function parseCleanNumber(val) {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        // Remove $ and , and spaces
        const clean = val.replace(/[$,\s]/g, '');
        const num = parseFloat(clean);
        return isNaN(num) ? 0 : num;
    }
    return 0;
}

// --- Helper to parse date from filename ---
function extractDateFromFilename(filename) {
    // Look for YYYY-MM-DD or MM-DD-YYYY or similar
    // Matches: 2024-01-15, 01-15-2024, 2024.01.15, etc.
    const dateRegex = /(\d{4}[-.]\d{2}[-.]\d{2})|(\d{1,2}[-.]\d{1,2}[-.]\d{2,4})/;
    const match = filename.match(dateRegex);

    if (match) {
        const d = new Date(match[0]);
        if (!isNaN(d.getTime())) {
            return d.toLocaleDateString();
        }
    }
    return null;
}

function processInvoiceData(rows, fileName) {
    let invoiceDeviceCount = 0;
    let invoiceTotal = 0;
    let invoiceItems = [];

    // Attempt to get date from filename
    const fileDate = extractDateFromFilename(fileName);

    // Filter out potential footer/summary rows
    const validRows = rows.filter(row => {
        const values = Object.values(row);

        // 1. Skip if row is nearly empty (less than 2 populated cells)
        const populated = values.filter(v => v !== null && v !== '' && v !== undefined).length;
        if (populated < 2) return false;

        // 2. Check for "Total" keywords in ANY string column
        // (Previously only checked matching keys or first col)
        const hasTotalKeyword = values.some(v =>
            typeof v === 'string' &&
            (v.toLowerCase().includes('total') ||
                v.toLowerCase().includes('subtotal') ||
                v.toLowerCase().includes('summary') ||
                v.toLowerCase().includes('amount due'))
        );
        if (hasTotalKeyword) return false;

        return true;
    });

    validRows.forEach(row => {
        const keys = Object.keys(row);
        const lowerKeys = keys.map(k => k.toLowerCase());

        // --- Quantity ---
        let qty = 1;
        const qtyKeyIndex = lowerKeys.findIndex(k => k.includes('qty') || k.includes('quantity'));

        if (qtyKeyIndex !== -1) {
            const rawQty = row[keys[qtyKeyIndex]];
            // Only update qty if we found a valid number. Keep default 1 ONLY if we found no column.
            // If we found a column but it's empty/0, that's suspicious for a line item, but let's parse it.
            const parsed = parseCleanNumber(rawQty);
            // If parsed is 0, it might be a refund or specific case, but for "Device count" default to 1 is safer IF it was NaN.
            // Let's stick to: if it's a number, use it.
            if (!isNaN(parseFloat(rawQty))) qty = parsed;
        }

        // --- Model Name ---
        const modelKeyIndex = lowerKeys.findIndex(k => k.includes('model') || k.includes('item') || k.includes('device') || k.includes('desc'));
        let model = modelKeyIndex !== -1 ? row[keys[modelKeyIndex]] : 'Unknown Device';

        // Extra check: if Model matches "Total" anywhere, skip it
        if (model && typeof model === 'string' && model.toLowerCase() === 'total') return;

        // Guard: If model is explicitly empty/null, it might be a bad row that slipped through
        if (!model || (typeof model === 'string' && model.trim() === '')) {
            model = 'Unknown Device';
        }

        // --- IMEI ---
        const imeiKeyIndex = lowerKeys.findIndex(k => k.includes('imei') || k.includes('serial') || k.includes('esn'));
        const imei = imeiKeyIndex !== -1 ? String(row[keys[imeiKeyIndex]]) : '';

        // --- Date (Row Level) ---
        const dateKeyIndex = lowerKeys.findIndex(k => k.includes('date') || k.includes('time'));
        let rowDate = dateKeyIndex !== -1 ? row[keys[dateKeyIndex]] : null;

        // Normalize Row Date if found
        if (rowDate) {
            const d = new Date(rowDate);
            if (!isNaN(d.getTime())) {
                rowDate = d.toLocaleDateString(); // Store normalized string
            } else {
                rowDate = null; // Bad date string
            }
        }

        // Final Date Strategy: Row > Filename > Upload Date (handled in display fallback)
        // Actually, store the best available date now
        const itemDate = rowDate || fileDate || null;

        // --- Price & Total ---
        let lineTotal = 0;

        const totalKeyIndex = lowerKeys.findIndex(k => k.includes('total') || k.includes('amount'));

        if (totalKeyIndex !== -1) {
            lineTotal = parseCleanNumber(row[keys[totalKeyIndex]]);
        } else {
            const priceKeyIndex = lowerKeys.findIndex(k => k.includes('price') || k.includes('cost'));
            if (priceKeyIndex !== -1) {
                const unitPrice = parseCleanNumber(row[keys[priceKeyIndex]]);
                lineTotal = unitPrice * qty;
            }
        }

        invoiceDeviceCount += qty;
        invoiceTotal += lineTotal;

        invoiceItems.push({ model: model, quantity: qty, price: lineTotal, imei: imei, date: itemDate });
    });

    // Double Check: If we calculated 0 items but have rows, something failed in providing useful data.
    // For now, allow it, but this logic above prevents the "Grand Total" row (device count +1, total * 2) scenario.

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
    renderMonthDetail(currentView);
}

// --- Utilities ---
function saveData() { localStorage.setItem('atlasData', JSON.stringify(appData)); }
document.getElementById('clearMonthBtn')?.addEventListener('click', () => {
    if (confirm(`Are you sure you want to clear all data for ${currentView}?`)) {
        appData[currentView] = { invoices: [], totalDevices: 0, totalPaid: 0 };
        saveData(); renderMonthDetail(currentView); renderNav();
    }
});

function formatCurrency(num) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num); }
function updateDateDisplay() {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('dateDisplay').innerText = new Date().toLocaleDateString('en-US', options);
}
function animateValue(id, end) {
    const obj = document.getElementById(id);
    if (!obj) return;
    obj.innerHTML = end; // Simple set for now to avoid animation jank on re-renders, or reimplement smoother if needed
}

// Start App
init();
