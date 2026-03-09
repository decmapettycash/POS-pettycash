// app.js

// --- FIREBASE CONFIGURATION ---
// ⚠️ IMPORTANT: Replace this with your own Firebase Config from Firebase Console
const firebaseConfig = {
    apiKey: "AIzaSyBTFGcgqQ6dNZxy4U2wb6oJqL4Bj6yKLsM",
    authDomain: "decmapcash.firebaseapp.com",
    databaseURL: "https://decmapcash-default-rtdb.firebaseio.com",
    projectId: "decmapcash",
    storageBucket: "decmapcash.firebasestorage.app",
    messagingSenderId: "37380443747",
    appId: "1:37380443747:web:9cdede2fa2886456a63256"
};

let db = null;
const isFirebaseConfigured = true;

if (isFirebaseConfigured) {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
}

// App State
let appSettings = {
    fundLimit: 200000,
    threshold: 20000
};

// Chart Instance
let categoryChartInstance = null;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {

    if (!isFirebaseConfigured) {
        document.getElementById('firebase-setup-modal').classList.remove('hidden');
    } else {
        // Load Settings from Cloud
        await loadSettings();
    }

    // Register event listeners
    document.getElementById('expense-form').addEventListener('submit', handleAddExpense);

    // Set default date to today
    document.getElementById('exp-date').valueAsDate = new Date();

    // Set default date filters to today
    const nowStr = new Date().toISOString().split('T')[0];
    const filterDateEl = document.getElementById('filter-date');
    if (filterDateEl) filterDateEl.value = nowStr;
    const billFilterDateEl = document.getElementById('bill-filter-date');
    if (billFilterDateEl) billFilterDateEl.value = nowStr;

    // Load Dashboard by default
    showSection('dashboard');
});

// --- Settings Management ---
async function loadSettings() {
    if (!db) return;
    try {
        const snapshot = await db.ref('settings/config').once('value');
        if (snapshot.exists()) {
            appSettings = snapshot.val();
        } else {
            // Default settings
            await db.ref('settings/config').set({ fundLimit: 200000, threshold: 20000 });
        }

        document.getElementById('setting-fund').value = appSettings.fundLimit;
        document.getElementById('setting-threshold').value = appSettings.threshold;
    } catch (error) {
        console.error("Failed to load settings:", error);
    }
}

async function saveSettings() {
    if (!db) return showToast('Error', 'Connect Firebase first!', 'error');

    const lim = parseFloat(document.getElementById('setting-fund').value) || 0;
    const thresh = parseFloat(document.getElementById('setting-threshold').value) || 0;

    try {
        await db.ref('settings/config').set({ fundLimit: lim, threshold: thresh });
        appSettings.fundLimit = lim;
        appSettings.threshold = thresh;

        showToast('System Configured', 'Limits successfully saved.', 'success');
        updateDashboard();
    } catch (e) {
        showToast('Error', 'Failed to save settings.', 'error');
    }
}

async function clearDatabase() {
    if (!db) return showToast('Error', 'Connect Firebase first!', 'error');

    if (confirm("Are you sure you want to delete all records? This cannot be undone.")) {
        try {
            await db.ref('expenses').remove();

            showToast('Factory Reset', 'All expense records deleted.', 'success');
            setTimeout(() => window.location.reload(), 2000);
        } catch (e) {
            showToast('Error', 'Failed to reset system.', 'error');
        }
    }
}

// --- Navigation ---
function showSection(id) {
    const sections = ['dashboard', 'expenses', 'reports', 'settings', 'billexport'];
    sections.forEach(sec => {
        document.getElementById(`sec-${sec}`).classList.add('hidden');

        // Reset styles for sidebar links
        const navEl = document.getElementById(`nav-${sec}`);
        navEl.className = 'w-full flex items-center gap-4 px-5 py-3.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all font-medium group';
        navEl.querySelector('i').className = navEl.querySelector('i').className.replace('text-blue-400', 'text-slate-400');
    });

    // Show active section
    document.getElementById(`sec-${id}`).classList.remove('hidden');

    // Active style
    const activeNav = document.getElementById(`nav-${id}`);
    activeNav.className = 'w-full flex items-center gap-4 px-5 py-3.5 bg-blue-600/10 text-blue-400 border border-blue-500/20 rounded-xl transition-all font-medium group ring-1 ring-transparent';

    if (id === 'dashboard') updateDashboard();
    if (id === 'reports') {
        resetFilters(); // Also loads history automatically
    }
}

// --- UI Helpers ---
const formatCurrency = (amount) => {
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatDate = (dateString) => {
    const d = new Date(dateString);
    return isNaN(d) ? dateString : d.toLocaleDateString('en-GB'); // DD/MM/YYYY
};

function showToast(title, msg, type = 'success') {
    const t = document.getElementById('toast');
    const tTitle = document.getElementById('toast-title');
    const tMsg = document.getElementById('toast-msg');
    const tIconWrap = document.getElementById('toast-icon-wrapper');
    const tIcon = document.getElementById('toast-icon');

    tTitle.innerText = title;
    tMsg.innerText = msg;

    // Style update based on type
    if (type === 'success') {
        t.style.borderLeftColor = '#10B981'; // Emerald
        tIconWrap.className = 'w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center mt-0.5 flex-shrink-0';
        tIcon.className = 'fa-solid fa-check text-emerald-400 text-sm';
    } else {
        t.style.borderLeftColor = '#EF4444'; // Red
        tIconWrap.className = 'w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center mt-0.5 flex-shrink-0';
        tIcon.className = 'fa-solid fa-triangle-exclamation text-red-400 text-sm';
    }

    t.classList.remove('translate-y-24', 'opacity-0');
    t.classList.add('translate-y-0', 'opacity-100');

    setTimeout(() => {
        t.classList.remove('translate-y-0', 'opacity-100');
        t.classList.add('translate-y-24', 'opacity-0');
    }, 4000);
}

// --- Image Handling & Compression ---
const handleImageUpload = (file) => {
    return new Promise((resolve, reject) => {
        if (!file) { resolve(null); return; }

        if (!file.type.match('image.*')) {
            reject(new Error("Only images are allowed."));
            return;
        }

        const reader = new FileReader();
        reader.onloadend = (e) => {
            const img = new Image();
            img.onload = () => {
                // Compress image to save Firestore space (Max 1MB per document)
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                const MAX_HEIGHT = 800;
                let width = img.width;
                let height = img.height;

                if (width > height && width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                } else if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const dataUrl = canvas.toDataURL('image/jpeg', 0.6); // 60% quality JPEG
                resolve(dataUrl);
            };
            img.onerror = () => reject(new Error("Failed to load image."));
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

function viewImage(base64Str) {
    if (!base64Str) return;
    const modal = document.getElementById('image-modal');
    document.getElementById('modal-img').src = base64Str;
    document.getElementById('download-img-btn').href = base64Str;
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.remove('opacity-0'), 10);
}

function closeImageModal() {
    const modal = document.getElementById('image-modal');
    modal.classList.add('opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

// --- Core Logic: Add Expense ---
async function handleAddExpense(e) {
    e.preventDefault();

    try {
        const fileInput = document.getElementById('exp-billimage');
        const file = fileInput.files[0];

        let base64Image = null;
        if (file) {
            base64Image = await handleImageUpload(file);
        }

        const expense = {
            date: document.getElementById('exp-date').value,
            shopName: document.getElementById('exp-shop').value.trim(),
            vehicleNo: document.getElementById('exp-vehicle').value.trim().toUpperCase() || 'N/A',
            category: document.getElementById('exp-category').value,
            amount: parseFloat(document.getElementById('exp-amount').value),
            billRef: document.getElementById('exp-billref').value.trim() || 'N/A',
            description: 'No description provided',
            billImage: base64Image,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };

        if (db) {
            await db.ref('expenses').push(expense);
        } else {
            throw new Error("Cloud Database Not Connected!");
        }

        showToast('Expense Recorded', `${expense.category}: Rs. ${formatCurrency(expense.amount)}`);

        // Reset form gracefully
        document.getElementById('expense-form').reset();
        document.getElementById('exp-date').valueAsDate = new Date();
        document.getElementById('file-name').innerText = 'Upload photo...';

    } catch (err) {
        if (err.message !== "Image size exceeds 1MB target.") {
            showToast('Critical Error', 'Failed to save expense data.', 'error');
            console.error(err);
        }
    }
}

// --- Core Logic: Dashboard ---
async function updateDashboard() {
    if (!db) return;
    try {
        const snapshot = await db.ref('expenses').once('value');
        const allExpenses = [];
        if (snapshot.exists()) {
            const data = snapshot.val();
            Object.keys(data).forEach(key => {
                allExpenses.push({ id: key, ...data[key] });
            });
        }

        let totalSpent = 0;
        let categoryTotals = {};

        allExpenses.forEach(exp => {
            totalSpent += exp.amount;
            if (categoryTotals[exp.category]) {
                categoryTotals[exp.category] += exp.amount;
            } else {
                categoryTotals[exp.category] = exp.amount;
            }
        });

        const balance = appSettings.fundLimit - totalSpent;

        document.getElementById('display-total-fund').innerText = 'Rs.' + formatCurrency(appSettings.fundLimit);
        document.getElementById('display-total-spent').innerText = 'Rs.' + formatCurrency(totalSpent);
        const balEl = document.getElementById('display-balance');
        balEl.innerText = 'Rs.' + formatCurrency(balance);

        // Alert Logic
        const cardBalance = document.getElementById('card-balance');
        const alertMsg = document.getElementById('balance-alert-msg');
        const iconBal = document.getElementById('icon-balance');

        if (balance < appSettings.threshold) {
            balEl.className = 'text-4xl font-bold text-red-500 mb-2';
            cardBalance.className = 'glass-panel p-6 relative overflow-hidden group bg-red-900/10 border-red-500/20';
            iconBal.className = 'w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center text-red-400 border border-red-500/20';
            alertMsg.className = 'text-xs font-semibold text-red-400 bg-red-400/10 border border-red-400/20 inline-block px-3 py-1.5 rounded-md';
            alertMsg.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-1 animate-pulse"></i> Low Balance';
        } else {
            balEl.className = 'text-4xl font-bold text-emerald-400 mb-2';
            cardBalance.className = 'glass-panel p-6 relative overflow-hidden group';
            iconBal.className = 'w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 border border-emerald-500/20';
            alertMsg.className = 'text-xs font-semibold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 inline-block px-3 py-1.5 rounded-md';
            alertMsg.innerHTML = '<i class="fa-solid fa-check-circle mr-1"></i> Balance OK';
        }

        // Build Analytics Chart
        renderChart(categoryTotals, totalSpent);

        // Populate Datalists for Auto-suggestions
        const shopList = document.getElementById('shop-list');
        const vehicleList = document.getElementById('vehicle-list');
        let shops = new Set();
        let vehicles = new Set();

        allExpenses.forEach(exp => {
            if (exp.shopName) shops.add(exp.shopName);
            if (exp.vehicleNo && exp.vehicleNo !== 'N/A') vehicles.add(exp.vehicleNo);
        });

        if (shopList) shopList.innerHTML = Array.from(shops).map(s => `<option value="${s}">`).join('');
        if (vehicleList) vehicleList.innerHTML = Array.from(vehicles).map(v => `<option value="${v}">`).join('');

        // Recent 5 Transactions (oldest -> newest order, but only taking the 5 latest inserts)
        const recent = allExpenses.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)).slice(-5);
        const tBody = document.getElementById('recent-transactions-body');

        if (recent.length === 0) {
            tBody.innerHTML = '<tr><td colspan="5" class="px-6 py-6 text-center text-slate-500 text-sm">No recent transactions recorded.</td></tr>';
        } else {
            tBody.innerHTML = recent.map(exp => {
                let thumbMatch = exp.billImage
                    ? `<button onclick="viewImage('${exp.billImage}')" class="w-10 h-10 rounded-lg overflow-hidden border border-white/10 hover:border-blue-500 transition-colors shadow-sm block mx-auto group relative"><img src="${exp.billImage}" class="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"><div class="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/20 transition-colors flex items-center justify-center"><i class="fa-solid fa-magnifying-glass-plus text-white opacity-0 group-hover:opacity-100 drop-shadow-md text-xs"></i></div></button>`
                    : `<label class="cursor-pointer w-10 h-10 rounded-lg bg-slate-800/50 hover:bg-slate-700/80 flex items-center justify-center text-slate-400 border border-white/5 mx-auto text-xs transition-colors group relative" title="Upload Bill Image">
                           <i class="fa-solid fa-camera"></i>
                           <input type="file" class="hidden" accept="image/*" capture="environment" onchange="attachImageToExpense('${exp.id}', this)">
                       </label>`;

                return `
                <tr class="hover:bg-white/5 transition-colors">
                    <td class="px-5 py-3 align-middle">${thumbMatch}</td>
                    <td class="px-6 py-4 text-xs text-slate-400 align-middle">${exp.timestamp ? formatDate(exp.timestamp) : formatDate(exp.date)}</td>
                    <td class="px-6 py-4 align-middle">
                        <div class="font-bold text-white uppercase text-xs truncate max-w-[150px]">${exp.shopName || '-'}</div>
                        <div class="text-[10px] text-slate-500 uppercase mt-0.5"><i class="fa-solid fa-car text-[9px] mr-1"></i> ${exp.vehicleNo}</div>
                    </td>
                    <td class="px-6 py-4 text-xs align-middle">
                        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wide uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            ${exp.category}
                        </span>
                    </td>
                    <td class="px-6 py-4 font-mono font-bold text-sm text-right text-white align-middle">Rs. ${formatCurrency(exp.amount)}</td>
                </tr>
            `}).join('');
        }

    } catch (e) {
        console.error("Dashboard update failed", e);
    }
}

function renderChart(categoryTotals, totalSpent) {
    const ctx = document.getElementById('categoryChart').getContext('2d');

    let labels = [];
    let dataSets = [];
    let bgColors = [];

    // Check if totals are 0
    let hasData = totalSpent > 0;

    // Define colors for categories
    const colorMap = {
        'Spares': '#8B5CF6',
        'External Service': '#F97316',
        'Mechanical Maintenance': '#10B981',
        'Courier': '#F43F5E',
        'Office Items': '#3B82F6',
        'Employee Welfare': '#EAB308',
        'Others': '#94A3B8'
    };

    if (hasData) {
        for (const [cat, amt] of Object.entries(categoryTotals)) {
            if (amt > 0) {
                labels.push(cat);
                dataSets.push(amt);
                bgColors.push(colorMap[cat] || '#CBD5E1'); // Fallback color
            }
        }
    } else {
        labels = ['No Data'];
        dataSets = [1];
        bgColors = ['#1E293B'];
    }

    if (categoryChartInstance) {
        categoryChartInstance.destroy();
    }

    Chart.defaults.color = '#94A3B8';
    Chart.defaults.font.family = 'Inter';

    categoryChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: dataSets,
                backgroundColor: bgColors,
                borderWidth: 2,
                borderColor: '#0f172a', // to separate slices nicely (slate-900)
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: hasData,
                    callbacks: {
                        label: function (context) {
                            return ' Rs. ' + formatCurrency(context.raw);
                        }
                    }
                }
            }
        }
    });

    // Custom Legend Updates
    const legendDiv = document.getElementById('chart-legend');
    if (!hasData) {
        legendDiv.innerHTML = `<div class="text-center text-slate-500 text-sm italic">No data to display</div>`;
    } else {
        legendDiv.innerHTML = '';
        const sortedIndices = dataSets.map((v, i) => i).sort((a, b) => dataSets[b] - dataSets[a]); // highest first

        for (let i of sortedIndices) {
            let cat = labels[i];
            let amt = dataSets[i];
            let perc = Math.round((amt / totalSpent) * 100);
            let color = bgColors[i];

            legendDiv.innerHTML += `
                <div class="flex justify-between items-center text-sm mb-2 opacity-90 hover:opacity-100 transition-opacity">
                    <div class="flex items-center gap-2 text-slate-300 w-3/4">
                        <div class="w-3 h-3 rounded-full flex-shrink-0" style="background-color: ${color}"></div> 
                        <span class="truncate" title="${cat}">${cat}</span>
                    </div>
                    <div class="font-mono font-medium text-white w-1/4 text-right">${perc}%</div>
                </div>
            `;
        }
    }
}

// --- Core Logic: Reports & History ---
async function loadHistory(expenses = null) {
    if (!db) return;
    try {
        let list = expenses;
        if (!list) {
            const snapshot = await db.ref('expenses').orderByChild('timestamp').once('value');
            list = [];
            if (snapshot.exists()) {
                snapshot.forEach(child => {
                    list.push({ id: child.key, ...child.val() }); // push for chronological insertion order
                });
            }
        }

        const tBody = document.getElementById('history-table-body');
        let total = 0;

        if (list.length === 0) {
            tBody.innerHTML = `<tr><td colspan="6" class="px-6 py-16 text-center text-slate-500 bg-white/[0.02]">
                <div class="w-16 h-16 mx-auto bg-slate-800 rounded-full flex items-center justify-center mb-4 border border-slate-700">
                    <i class="fa-solid fa-folder-open text-2xl text-slate-600"></i>
                </div>
                No transaction records found matching your filters.
            </td></tr>`;
            document.getElementById('filtered-total').innerText = '0.00';
            return;
        }

        tBody.innerHTML = list.map(exp => {
            total += exp.amount;
            return `
            <tr class="hover:bg-blue-600/[0.03] transition-colors border-b border-white/5">
                <td class="px-6 py-5 text-xs text-slate-400 whitespace-nowrap">${exp.timestamp ? formatDate(exp.timestamp) : formatDate(exp.date)}</td>
                <td class="px-6 py-5">
                    <div class="font-bold text-white uppercase text-[12px] truncate max-w-[200px] hover:text-blue-400 transition-colors cursor-default" title="${exp.shopName || '-'}">${exp.shopName || '-'}</div>
                    <div class="text-[10px] text-slate-500 font-mono mt-0.5"><i class="fa-solid fa-car text-[8px] mr-1"></i> ${exp.vehicleNo}</div>
                </td>
                <td class="px-6 py-5 whitespace-nowrap">
                    <span class="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
                        ${exp.category}
                    </span>
                </td>
                <td class="px-6 py-5 font-mono font-bold text-[14px] text-white text-right whitespace-nowrap">Rs. ${formatCurrency(exp.amount)}</td>
                <td class="px-6 py-5 action-col text-center whitespace-nowrap">
                    <div class="flex items-center justify-center gap-2">
                    ${exp.billImage ?
                    `<button onclick="viewImage('${exp.billImage}')" class="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-600 hover:text-white transition-all transform hover:scale-110" title="View Document"><i class="fa-solid fa-file-image"></i></button>
                     <label class="cursor-pointer w-8 h-8 rounded-lg bg-yellow-500/10 text-yellow-500 hover:bg-yellow-600 hover:text-white transition-all transform hover:scale-110 flex items-center justify-center shadow-sm" title="Change Bill Image">
                         <i class="fa-solid fa-pen-to-square text-xs"></i>
                         <input type="file" class="hidden" accept="image/*" capture="environment" onchange="attachImageToExpense('${exp.id}', this)">
                     </label>` :
                    `<label class="cursor-pointer w-8 h-8 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500 hover:text-white transition-all transform hover:scale-110 flex items-center justify-center shadow-sm" title="Take Bill Photo">
                        <i class="fa-solid fa-camera text-sm"></i>
                        <input type="file" class="hidden" accept="image/*" capture="environment" onchange="attachImageToExpense('${exp.id}', this)">
                    </label>`
                }
                    <button onclick="deleteExpense('${exp.id}')" class="w-8 h-8 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-600 hover:text-white transition-all transform hover:scale-110 ml-2 shadow-[0_0_10px_rgba(239,68,68,0)] hover:shadow-[0_0_10px_rgba(239,68,68,0.5)]" title="Delete record"><i class="fa-solid fa-trash-can shadow-sm"></i></button>
                    </div>
                </td>
            </tr>
            `;
        }).join('');

        document.getElementById('filtered-total').innerText = 'Rs. ' + formatCurrency(total);

    } catch (e) {
        console.error("Filter failed", e);
    }
}

async function applyFilters() {
    const qVeh = document.getElementById('filter-search').value.toLowerCase().trim();
    const qCat = document.getElementById('filter-category').value;
    const qDate = document.getElementById('filter-date').value;

    if (!db) return;

    try {
        const snapshot = await db.ref('expenses').orderByChild('timestamp').once('value');
        let results = [];
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                results.push({ id: child.key, ...child.val() });
            });
        }

        if (qVeh) results = results.filter(e => e.vehicleNo.toLowerCase().includes(qVeh));
        if (qCat !== 'all') results = results.filter(e => e.category === qCat);
        if (qDate) results = results.filter(e => e.date <= qDate);

        loadHistory(results);
    } catch (e) {
        console.error("Error applying filters:", e);
    }
}

function resetFilters() {
    document.getElementById('filter-search').value = '';
    document.getElementById('filter-category').value = 'all';

    const now = new Date();
    document.getElementById('filter-date').value = now.toISOString().split('T')[0];

    applyFilters();
}

async function deleteExpense(id) {
    if (!db) return;

    if (confirm("Are you sure you want to delete this expense record?")) {
        try {
            await db.ref('expenses').child(id).remove();
            showToast('Deleted', 'Expense record deleted.', 'success');

            applyFilters();
            updateDashboard();
        } catch (e) {
            showToast('Error', 'Failed to delete record.', 'error');
        }
    }
}

async function attachImageToExpense(id, input) {
    const file = input.files[0];
    if (!file) return;
    if (!db) {
        showToast('Error', 'Database not connected.', 'error');
        return;
    }

    showToast('Uploading', 'Processing and saving image...', 'success');

    try {
        const base64Image = await handleImageUpload(file);
        if (base64Image) {
            await db.ref('expenses').child(id).update({
                billImage: base64Image
            });
            showToast('Success', 'Bill image attached successfully.', 'success');

            input.value = ''; // Reset input

            applyFilters();
            updateDashboard();
        }
    } catch (e) {
        if (e.message !== "Image size exceeds 1MB target.") {
            showToast('Error', e.message || 'Failed to attach image.', 'error');
            console.error(e);
        }
    }
}

// --- Export Functions ---
function getFileSafeTimestamp() {
    const now = new Date();
    const date = now.toLocaleDateString('en-GB').replace(/\//g, '-');
    const time = now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/:/g, '-').replace(/ /g, '_');
    return `${date}_${time}`;
}

async function exportBillsPDF() {
    if (!db) {
        showToast('Export Failed', 'Database not connected.', 'error');
        return;
    }

    const qDate = document.getElementById('bill-filter-date').value;

    showToast('Processing', 'Gathering images for export...', 'success');

    try {
        const snapshot = await db.ref('expenses').orderByChild('timestamp').once('value');
        let allExps = [];
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                allExps.push({ id: child.key, ...child.val() }); // chronological insertion order
            });
        }

        if (qDate) allExps = allExps.filter(e => e.date <= qDate);

        // Filter only those that have a billImage
        const expsWithBills = allExps.filter(e => e.billImage);

        if (expsWithBills.length === 0) {
            showToast('Export Failed', 'No bills found for the selected month.', 'error');
            return;
        }

        const printElement = document.createElement('div');
        let htmlContent = `
            <div style="padding: 20px; font-family: 'Helvetica', sans-serif; background-color: #ffffff; color: #000;">
                <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px;">
                    <h1 style="font-size: 24px; font-weight: bold; margin: 0; color: #000;">DeCMA Repair</h1>
                    <h2 style="font-size: 18px; margin: 5px 0 0 0; color: #333;">Expense Receipts Log</h2>
                    <p style="font-size: 14px; margin: 5px 0 0 0; color: #666;">Export Date: ${new Date().toISOString().split('T')[0]}</p>
                </div>
                <div style="display: flex; flex-direction: column; gap: 30px;">
        `;

        expsWithBills.forEach((exp, index) => {
            htmlContent += `
                <div style="page-break-inside: avoid; border: 1px solid #ccc; padding: 15px; margin-bottom: 20px; background: #fff; width: 100%;">
                    <h3 style="margin: 0 0 10px 0; font-size: 16px; border-bottom: 1px solid #eee; padding-bottom: 5px; color: #000;">
                        Bill #${index + 1} | Uploaded On: ${exp.timestamp ? formatDate(exp.timestamp) : formatDate(exp.date)} | Rs. ${formatCurrency(exp.amount)}
                    </h3>
                    <div style="font-size: 12px; margin-bottom: 10px; color: #444;">
                        <b>Category:</b> ${exp.category} &nbsp;|&nbsp;
                        <b>Shop:</b> ${exp.shopName || '-'} &nbsp;|&nbsp;
                        <b>Vehicle:</b> ${exp.vehicleNo || '-'} &nbsp;|&nbsp;
                        <b>Ref:</b> ${exp.billRef || '-'}
                    </div>
                    <div style="text-align: center;">
                        <img src="${exp.billImage}" style="max-width: 100%; max-height: 700px; object-fit: contain;">
                    </div>
                </div>
            `;
        });

        htmlContent += `</div></div>`;
        printElement.innerHTML = htmlContent;

        const opt = {
            margin: 0.5,
            filename: `DeCMA_Receipts_${qDate || 'All_Time'}_${getFileSafeTimestamp()}.pdf`,
            image: { type: 'jpeg', quality: 0.8 },
            html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
            jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };

        html2pdf().set(opt).from(printElement).save().then(() => {
            showToast('Success', 'PDF Downloaded Successfully!', 'success');
        });

    } catch (e) {
        console.error(e);
        showToast('Error', 'Failed to generate PDF.', 'error');
    }
}

function exportToPDF() {
    // Configure Light Theme for Print
    const stylesheet = document.createElement('style');
    stylesheet.id = 'print-style';
    stylesheet.innerHTML = `
        .action-col { display: none !important; }
        .print-header { display: block !important; margin-bottom: 2rem; color: #000; background: #fff; }
        #print-area { padding: 40px; background: white !important; box-shadow: none !important; border-radius:0; border: none; }
        #print-area table { border-collapse: collapse; }
        #print-area th { background: #f1f5f9 !important; color: #000 !important; font-weight: bold; border-bottom: 2px solid #000; }
            td { color: #000 !important; font-weight: normal !important; border-bottom: 1px solid #e2e8f0; }
            tfoot { background: #f8fafc !important; border-top: 2px solid #000; }
            tfoot td { color: #000 !important; font-weight: bold !important; }
        body { font-family: 'Helvetica', sans-serif; }
    `;
    document.head.appendChild(stylesheet);

    // Add date range info
    const dateVal = document.getElementById('filter-date').value;
    document.getElementById('print-date-range').innerText = `Report Filter: ${dateVal ? dateVal : 'All Time'}`;

    const element = document.getElementById('print-area');

    const opt = {
        margin: 0.5,
        filename: `DeCMA_Expenses_${dateVal || 'Log'}_${getFileSafeTimestamp()}.pdf`,
        image: { type: 'jpeg', quality: 1 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' }
    };

    html2pdf().set(opt).from(element).save().then(() => {
        document.getElementById('print-style').remove();
        document.getElementById('print-date-range').innerText = '';
    });
}

async function exportToExcel() {
    try {
        if (!db) {
            showToast('Export Failed', 'Database not connected.', 'error');
            return;
        }

        // Obey current filters
        const qVeh = document.getElementById('filter-search').value.toLowerCase().trim();
        const qCat = document.getElementById('filter-category').value;
        const qDate = document.getElementById('filter-date').value;

        const snapshot = await db.ref('expenses').orderByChild('timestamp').once('value');
        let allExps = [];
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                allExps.push({ id: child.key, ...child.val() });
            });
        }

        if (qVeh) {
            allExps = allExps.filter(e => e.vehicleNo.toLowerCase().includes(qVeh) || (e.shopName && e.shopName.toLowerCase().includes(qVeh)));
        }
        if (qCat !== 'all') allExps = allExps.filter(e => e.category === qCat);
        if (qDate) allExps = allExps.filter(e => e.date <= qDate);

        if (allExps.length === 0) {
            showToast('Export Failed', 'No records to export.', 'error');
            return;
        }

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Petty Cash Ledger');

        // Styles
        const headerStyle = {
            font: { bold: true, name: 'Calibri', size: 11 },
            alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
            border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
        };

        const titleStyle = {
            font: { bold: true, name: 'Calibri', size: 16 },
            alignment: { horizontal: 'center', vertical: 'middle' },
            border: { top: { style: 'medium' }, left: { style: 'medium' }, bottom: { style: 'medium' }, right: { style: 'medium' } }
        };

        const normalBorder = {
            top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
        };

        // Title Row
        sheet.mergeCells('A1:M1');
        const titleRow = sheet.getCell('A1');
        titleRow.value = `PETTY CASH EXPENDITURE REIMBURSEMENT LEDGER - ${new Date().toISOString().split('T')[0]}`;
        titleRow.style = titleStyle;
        sheet.getRow(1).height = 35;

        // Headers
        const headers = [
            'Date', 'Shop / Supplier', 'Vehicle No', 'Bill No', 'Description',
            'Total Amount', 'Spares', 'External Service', 'Mechanical Maintenance',
            'Courier', 'Office Items', 'Employee Welfare', 'Others', 'Balance'
        ];

        sheet.getRow(2).values = headers;
        sheet.getRow(2).height = 40;
        sheet.getRow(2).eachCell((cell) => {
            cell.style = headerStyle;
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE0E0E0' }
            };
        });

        // Set column widths
        sheet.columns = [
            { key: 'date', width: 12 },
            { key: 'shop', width: 25 },
            { key: 'vehicle', width: 15 },
            { key: 'billNo', width: 12 },
            { key: 'desc', width: 30 },
            { key: 'amount', width: 15 },
            { key: 'spares', width: 15 },
            { key: 'ext_srv', width: 15 },
            { key: 'mech_maint', width: 22 },
            { key: 'courier', width: 15 },
            { key: 'office', width: 15 },
            { key: 'welfare', width: 18 },
            { key: 'others', width: 15 },
            { key: 'balance', width: 18 }
        ];

        // Intial Balance Row
        let currentBalance = appSettings.fundLimit;

        sheet.addRow({
            shop: 'Initial Cash Limit',
            balance: currentBalance
        });
        const initialRow = sheet.lastRow;
        initialRow.getCell('balance').font = { bold: true };
        initialRow.getCell('balance').numFmt = '#,##0.00';
        initialRow.eachCell(c => c.border = normalBorder);

        let sumAmount = 0;
        let sums = {
            'Spares': 0, 'External Service': 0, 'Mechanical Maintenance': 0,
            'Courier': 0, 'Office Items': 0, 'Employee Welfare': 0, 'Others': 0
        };

        allExps.forEach(exp => {
            currentBalance -= exp.amount;
            sumAmount += exp.amount;
            if (sums[exp.category] !== undefined) sums[exp.category] += exp.amount;

            const rowData = {
                date: exp.timestamp ? formatDate(exp.timestamp) : formatDate(exp.date),
                shop: exp.shopName || '-',
                vehicle: exp.vehicleNo,
                billNo: exp.billRef || '-',
                desc: exp.description,
                amount: exp.amount,
                spares: exp.category === 'Spares' ? exp.amount : '',
                ext_srv: exp.category === 'External Service' ? exp.amount : '',
                mech_maint: exp.category === 'Mechanical Maintenance' ? exp.amount : '',
                courier: exp.category === 'Courier' ? exp.amount : '',
                office: exp.category === 'Office Items' ? exp.amount : '',
                welfare: exp.category === 'Employee Welfare' ? exp.amount : '',
                others: exp.category === 'Others' ? exp.amount : '',
                balance: currentBalance
            };

            const newRow = sheet.addRow(rowData);
            newRow.eachCell((cell, colNumber) => {
                cell.border = normalBorder;
                cell.alignment = { vertical: 'middle' };
                if (typeof cell.value === 'number') {
                    cell.numFmt = '#,##0.00';
                }
                if (colNumber >= 6) { // amount columns formatting
                    cell.alignment = { horizontal: 'right', vertical: 'middle' };
                }
            });
            newRow.getCell('date').alignment = { horizontal: 'center', vertical: 'middle' };
        });

        // Totals Row
        const totalRow = sheet.addRow({
            desc: 'TOTAL EXPENDITURE',
            amount: sumAmount,
            spares: sums['Spares'],
            ext_srv: sums['External Service'],
            mech_maint: sums['Mechanical Maintenance'],
            courier: sums['Courier'],
            office: sums['Office Items'],
            welfare: sums['Employee Welfare'],
            others: sums['Others'],
            balance: currentBalance
        });

        totalRow.eachCell(cell => {
            cell.font = { bold: true };
            cell.border = { top: { style: 'double' }, bottom: { style: 'double' }, left: { style: 'thin' }, right: { style: 'thin' } };
            if (typeof cell.value === 'number') {
                cell.numFmt = '#,##0.00';
            }
        });
        totalRow.getCell('desc').alignment = { horizontal: 'right', vertical: 'middle' };
        totalRow.getCell('desc').font = { bold: true };

        // Summary Table (Right Aligned)
        sheet.addRow([]);
        sheet.addRow([]);

        const summaryData = [
            { label: 'Total Spare parts -', value: sums['Spares'] },
            { label: 'Total External services -', value: sums['External Service'] },
            { label: 'Total mechanical Maintainance -', value: sums['Mechanical Maintenance'] },
            { label: 'Total Office items -', value: sums['Office Items'] },
            { label: 'Total Employee Welfare -', value: sums['Employee Welfare'] },
            { label: 'Courier -', value: sums['Courier'] },
            { label: 'Others -', value: sums['Others'] },
            { label: 'Total expenses -', value: sumAmount, isTotal: true }
        ];

        summaryData.forEach(item => {
            const row = sheet.addRow([]);
            sheet.mergeCells(row.number, 11, row.number, 13);
            const labelCell = row.getCell(11);
            const valueCell = row.getCell(14);

            labelCell.value = item.label;
            valueCell.value = item.value || 0;
            labelCell.alignment = { horizontal: 'right', vertical: 'middle' };
            labelCell.font = { bold: item.isTotal };

            valueCell.alignment = { horizontal: 'right', vertical: 'middle' };
            valueCell.numFmt = '#,##0.00';
            valueCell.font = { bold: item.isTotal };

            if (item.isTotal) {
                valueCell.border = { top: { style: 'thin' }, bottom: { style: 'double' } };
            }
        });

        // Signature Rows
        sheet.addRow([]);
        sheet.addRow([]);
        sheet.addRow([]);

        const sigRow1 = sheet.addRow([]);
        const sigRow2 = sheet.addRow([]);

        const sigCols = [2, 5, 8, 11, 14];
        const sigLabels = ['Prepared By', 'Checked By', 'Certified By', 'Recommended By', 'Approved By'];

        sigCols.forEach((col, idx) => {
            sigRow1.getCell(col).value = '...............................';
            sigRow1.getCell(col).alignment = { horizontal: 'center' };
            sigRow2.getCell(col).value = sigLabels[idx];
            sigRow2.getCell(col).alignment = { horizontal: 'center' };
            sigRow2.getCell(col).font = { bold: true };
        });

        // Save file
        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer], { type: "application/octet-stream" }), `DeCMA_Ledger_${qDate || 'All'}_${getFileSafeTimestamp()}.xlsx`);

        showToast('Export Complete', 'Excel (XLSX) ledger downloaded successfully.');

    } catch (e) {
        console.error("Excel Export Failed:", e);
        showToast('Export Error', 'Failed to generate Smart Excel.', 'error');
    }
}

async function backupDatabase() {
    if (!db) {
        showToast('Backup Failed', 'Database not connected.', 'error');
        return;
    }

    showToast('Preparing Backup', 'Gathering data, please wait...', 'success');

    try {
        const snapshot = await db.ref('/').once('value');
        if (snapshot.exists()) {
            const data = snapshot.val();
            const jsonString = JSON.stringify(data, null, 2);

            // Create Blob
            const blob = new Blob([jsonString], { type: 'application/json' });

            // Generate filename
            const fileName = `DeCMA_DBBackup_${getFileSafeTimestamp()}.json`;

            // Trigger download using FileSaver
            saveAs(blob, fileName);

            showToast('Backup Complete', 'Database backup downloaded successfully.');
        } else {
            showToast('Backup Failed', 'No data found to backup.', 'error');
        }
    } catch (e) {
        console.error("Backup Error:", e);
        showToast('Backup Error', 'Failed to generate database backup.', 'error');
    }
}
