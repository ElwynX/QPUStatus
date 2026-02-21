// --- THEME TOGGLE LOGIC ---
const themeBtn = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');
const htmlTag = document.documentElement;

const savedTheme = localStorage.getItem('theme') || 'dark';
htmlTag.setAttribute('data-theme', savedTheme);
themeIcon.innerText = savedTheme === 'dark' ? '☀️' : '🌙';

themeBtn.addEventListener('click', () => {
    const currentTheme = htmlTag.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    htmlTag.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    themeIcon.innerText = newTheme === 'dark' ? '☀️' : '🌙';
});

// --- TELEMETRY LOGIC ---
function formatQueue(depth, provider, status) {
    if (status === 'OFFLINE') return '<span style="color: var(--muted)">--</span>';
    
    if (provider === 'aws') {
        return `${depth} <span style="font-size: 0.7rem; color: var(--muted); font-family: sans-serif;">Tasks</span>`;
    } else {
        if (depth === 0) return '0 <span style="font-size: 0.7rem; color: var(--muted); font-family: sans-serif;">Wait</span>';
        if (depth > 60) {
            const hrs = Math.floor(depth / 60);
            return `${hrs}h <span style="font-size: 0.7rem; color: var(--muted); font-family: sans-serif;">Wait</span>`;
        }
        return `${depth}m <span style="font-size: 0.7rem; color: var(--muted); font-family: sans-serif;">Wait</span>`;
    }
}

function timeSince(dateString) {
    const date = new Date(dateString.replace(' ', 'T') + 'Z');
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
}

function createCard(qpu) {
    const isOnline = qpu.status === 'ONLINE';
    const badgeClass = isOnline ? 'status-online' : 'status-offline';
    const dotClass = isOnline ? 'dot-online' : 'dot-offline';

    return `
        <div class="card">
            <div class="card-header">
                <div>
                    <p class="qpu-name">${qpu.cleanName}</p>
                    <p class="qpu-provider">via ${qpu.route}</p>
                </div>
                <div class="status-badge ${badgeClass}">
                    <div class="dot ${dotClass}"></div> ${qpu.status}
                </div>
            </div>
            <div class="metrics">
                <div>
                    <div class="metric-label">NETWORK LOAD</div>
                    <div class="metric-value">${formatQueue(qpu.queue_depth, qpu.provider, qpu.status)}</div>
                </div>
                <div class="time-ago">Updated ${timeSince(qpu.last_updated)}</div>
            </div>
        </div>
    `;
}

// Function to group items by manufacturer and build sub-grids
function renderGrouped(containerId, items) {
    const container = document.getElementById(containerId);
    container.innerHTML = ''; // Clear container to prevent duplicates
    
    const groups = {};
    items.forEach(item => {
        if (!groups[item.mfg]) groups[item.mfg] = [];
        groups[item.mfg].push(item);
    });

    // Alphabetical sort for manufacturers
    const sortedMfgs = Object.keys(groups).sort();

    sortedMfgs.forEach(mfg => {
        // Build the Subheading
        const header = document.createElement('h3');
        header.className = 'mfg-title';
        header.innerText = mfg;
        container.appendChild(header);

        // Build the specific Grid for this company
        const grid = document.createElement('div');
        grid.className = 'grid';
        grid.style.marginBottom = '1rem'; // tighter spacing between groups
        
        groups[mfg].sort((a, b) => a.cleanName.localeCompare(b.cleanName));
        groups[mfg].forEach(qpu => {
            grid.innerHTML += createCard(qpu);
        });
        
        container.appendChild(grid);
    });
}

async function init() {
    try {
        const res = await fetch('https://api.qpustatus.com/stats');
        let rawData = await res.json();
        
        let qpus = [];
        let sims = [];

        rawData.forEach(qpu => {
            const n = qpu.name.toLowerCase();
            let mfg = qpu.provider.toUpperCase();
            let cleanName = qpu.name.replace(' (Simulator)', '');
            let route = qpu.provider === 'aws' ? 'AWS' : 'Azure';

            // Tag AWS manufacturers
            if (qpu.provider === 'aws') {
                if (n.includes('aquila')) mfg = 'QuEra';
                else if (n.includes('aria') || n.includes('forte')) mfg = 'IonQ';
                else if (n.includes('ankaa') || n.includes('aspen')) mfg = 'Rigetti';
                else if (n.includes('garnet') || n.includes('emerald')) mfg = 'IQM';
                else if (n.includes('ibex')) mfg = 'AQT';
                else if (n.includes('sv1') || n.includes('dm1') || n.includes('tn1')) mfg = 'Amazon';
            } else {
                // Azure manufacturers (keeps the ugly name below)
                mfg = qpu.provider.charAt(0).toUpperCase() + qpu.provider.slice(1);
                
                // THE FIX: Force Azure's "Ionq" to match AWS's "IonQ" so they merge!
                if (mfg === 'Ionq') mfg = 'IonQ';
            }
            
            const processedItem = { ...qpu, mfg, cleanName, route };
            
            if (qpu.name.includes('(Simulator)')) {
                sims.push(processedItem);
            } else {
                qpus.push(processedItem);
            }
        });

        document.getElementById('loader').style.display = 'none';
        document.getElementById('title-qpus').style.display = 'block';
        document.getElementById('title-simulators').style.display = 'block';

        renderGrouped('grid-qpus', qpus);
        renderGrouped('grid-simulators', sims);

    } catch (e) {
        document.getElementById('loader').innerText = "Failed to establish connection to telemetry server.";
    }
}

init();
setInterval(init, 60000);
