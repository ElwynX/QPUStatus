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
    if (provider === 'aws') return `${depth} Tasks`;
    if (depth === 0) return '0 Wait';
    if (depth > 60) return `${Math.floor(depth / 60)}h Wait`;
    return `${depth}m Wait`;
}

function timeSince(dateString) {
    const date = new Date(dateString.replace(' ', 'T') + 'Z');
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
}

function createCard(machine) {
    // If ANY route is online, the machine is online
    const routes = Object.values(machine.routes);
    const isOnline = routes.some(r => r.status === 'ONLINE');
    const badgeClass = isOnline ? 'status-online' : 'status-offline';
    const dotClass = isOnline ? 'dot-online' : 'dot-offline';
    const statusText = isOnline ? 'ONLINE' : 'OFFLINE';

    // Build the slug (e.g., 'IonQ Forte-1' -> 'ionq-forte-1')
    const slug = (machine.mfg + '-' + machine.name).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    // Render the mini-rows for available routes
    const routeHtml = ['Direct', 'AWS', 'Azure'].map(r => {
        const rData = machine.routes[r];
        if (!rData) return '';
        const rColor = rData.status === 'ONLINE' ? 'var(--online)' : 'var(--muted)';
        const rIcon = r === 'AWS' ? 'fa-cloud' : r === 'Azure' ? 'fa-network-wired' : 'fa-server';
        const iColor = r === 'AWS' ? '#f97316' : r === 'Azure' ? '#3b82f6' : '#a855f7';
        
        return `
        <div style="display:flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
            <span style="font-size: 0.8rem; color: var(--muted);"><i class="fa-solid ${rIcon}" style="color: ${iColor}; margin-right: 6px;"></i>${r}</span>
            <span style="font-size: 0.85rem; font-weight: 500; color: ${rColor}">${formatQueue(rData.queue_depth, rData.provider, rData.status)}</span>
        </div>`;
    }).join('');

    return `
        <div class="card">
            <div class="card-header">
                <div>
                    <p class="qpu-name">${machine.name}</p>
                    <p class="qpu-provider">${machine.mfg}</p>
                </div>
                <div class="status-badge ${badgeClass}">
                    <div class="dot ${dotClass}"></div> ${statusText}
                </div>
            </div>
            
            <div class="metrics" style="background: rgba(0,0,0,0.15); padding: 0.8rem; border-radius: 8px; margin-bottom: 1rem;">
                <div style="font-size: 0.7rem; font-weight: bold; color: var(--muted); margin-bottom: 0.5rem; letter-spacing: 0.5px;">ROUTING OPTIONS</div>
                ${routeHtml}
            </div>
            
            <div class="time-ago" style="margin-bottom: 1rem; text-align: right;">Updated ${timeSince(machine.last_updated)}</div>
            
            <a href="${slug}.html" class="view-more-btn">
                View Hardware Metrics <i class="fa-solid fa-arrow-right"></i>
            </a>
        </div>
    `;
}

function renderGrouped(containerId, itemsDict) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = ''; 
    
    // Group by Manufacturer for the UI sections
    const groups = {};
    Object.values(itemsDict).forEach(machine => {
        if (!groups[machine.mfg]) groups[machine.mfg] = [];
        groups[machine.mfg].push(machine);
    });

    const sortedMfgs = Object.keys(groups).sort();

    sortedMfgs.forEach(mfg => {
        const header = document.createElement('h3');
        header.className = 'mfg-title';
        header.innerText = mfg;
        container.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'grid';
        grid.style.marginBottom = '1.5rem'; 
        
        // Sort machines alphabetically
        groups[mfg].sort((a, b) => a.name.localeCompare(b.name));
        groups[mfg].forEach(machine => {
            grid.innerHTML += createCard(machine);
        });
        
        container.appendChild(grid);
    });
}

async function init() {
    try {
        const res = await fetch('https://api.qpustatus.com/stats');
        let rawData = await res.json();
        
        let qpus = {};
        let sims = {};

        rawData.forEach(qpu => {
            let mfg = 'Unknown';
            let route = 'Direct';
            
            // 1. Detect Route & Manufacturer
            if (qpu.id.startsWith('aws_')) {
                route = 'AWS';
                const n = qpu.name.toLowerCase();
                if (n.includes('aquila')) mfg = 'QuEra';
                else if (n.includes('aria') || n.includes('forte') || n.includes('harmony')) mfg = 'IonQ';
                else if (n.includes('ankaa') || n.includes('aspen')) mfg = 'Rigetti';
                else if (n.includes('garnet') || n.includes('emerald')) mfg = 'IQM';
                else if (n.includes('ibex')) mfg = 'AQT';
                else if (n.includes('sv1') || n.includes('dm1') || n.includes('tn1')) mfg = 'Amazon';
            } else if (qpu.id.startsWith('azure_')) {
                route = 'Azure';
                if (qpu.provider.includes('ionq')) mfg = 'IonQ';
                else if (qpu.provider.includes('rigetti')) mfg = 'Rigetti';
                else if (qpu.provider.includes('quantinuum')) mfg = 'Quantinuum';
            } else if (qpu.provider === 'ionq-direct') {
                mfg = 'IonQ';
                route = 'Direct';
            }

            // 2. Heavy Cleaning of the Name to ensure merging
            // This turns "ionq.qpu.aria-1", "IonQ Aria-1", and "Aria-1" all into just "Aria-1"
            let cleanName = qpu.name;
            
            // Remove Simulator tag first
            const isSim = cleanName.includes('(Simulator)') || cleanName.toLowerCase().includes('simulator');
            cleanName = cleanName.replace(' (Simulator)', '').replace('simulator', '');

            // Handle Azure's dot notation (e.g. "ionq.qpu.aria-1" -> "aria-1")
            if (cleanName.includes('.')) {
                cleanName = cleanName.split('.').pop();
            }

            // Remove Manufacturer prefix (case insensitive)
            const regex = new RegExp(`^${mfg}\\s*`, 'i');
            cleanName = cleanName.replace(regex, '').replace(/[-_]/g, ' ').trim();

            // Capitalize First Letter of each word
            cleanName = cleanName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-');

            // 3. Create the Merge Key
            const key = `${mfg}-${cleanName}`;
            const targetDict = isSim ? sims : qpus;

            if (!targetDict[key]) {
                targetDict[key] = { mfg, name: cleanName, routes: {}, last_updated: qpu.last_updated };
            }
            
            // Add this route to the unified card
            targetDict[key].routes[route] = qpu;
            
            // Keep the latest timestamp
            if (new Date(qpu.last_updated) > new Date(targetDict[key].last_updated)) {
                targetDict[key].last_updated = qpu.last_updated;
            }
        });

        document.getElementById('loader').style.display = 'none';
        document.getElementById('title-qpus').style.display = 'block';
        document.getElementById('title-simulators').style.display = 'block';

        renderGrouped('grid-qpus', qpus);
        renderGrouped('grid-simulators', sims);

    } catch (e) {
        console.error(e);
        const loader = document.getElementById('loader');
        if(loader) loader.innerText = "Failed to establish connection to telemetry server.";
    }
}

init();

let pollInterval = setInterval(() => {
    if (document.visibilityState === 'visible') init();
}, 120000);

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') init();
});
