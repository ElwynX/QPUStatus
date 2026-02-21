// --- THEME TOGGLE LOGIC ---
const themeBtn = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');
const htmlTag = document.documentElement;

// Check saved preference on load
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
    } else if (provider === 'azure' || provider === 'ionq' || provider === 'quantinuum' || provider === 'rigetti') {
        if (depth === 0) return '0 <span style="font-size: 0.7rem; color: var(--muted); font-family: sans-serif;">Wait</span>';
        if (depth > 60) {
            const hrs = Math.floor(depth / 60);
            return `${hrs}h <span style="font-size: 0.7rem; color: var(--muted); font-family: sans-serif;">Wait</span>`;
        }
        return `${depth}m <span style="font-size: 0.7rem; color: var(--muted); font-family: sans-serif;">Wait</span>`;
    }
    return depth;
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
    
    let displayProvider = qpu.provider;
    if(displayProvider.includes('.')) displayProvider = displayProvider.split('.')[0];

    return `
        <div class="card">
            <div class="card-header">
                <div>
                    <p class="qpu-name">${qpu.name.replace(' (Simulator)', '')}</p>
                    <p class="qpu-provider">${displayProvider} • ${qpu.region}</p>
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

async function init() {
    try {
        const res = await fetch('https://api.qpustatus.com/stats');
        const data = await res.json();
        
        document.getElementById('loader').style.display = 'none';
        document.getElementById('title-qpus').style.display = 'block';
        document.getElementById('title-simulators').style.display = 'block';

        const gridQpus = document.getElementById('grid-qpus');
        const gridSims = document.getElementById('grid-simulators');

        // THE FIX: Clear the grids before injecting new data so they don't duplicate!
        gridQpus.innerHTML = '';
        gridSims.innerHTML = '';

        data.forEach(qpu => {
            const cardHTML = createCard(qpu);
            if (qpu.name.includes('(Simulator)')) {
                gridSims.innerHTML += cardHTML;
            } else {
                gridQpus.innerHTML += cardHTML;
            }
        });
    } catch (e) {
        document.getElementById('loader').innerText = "Failed to establish connection to telemetry server.";
    }
}

init();
setInterval(init, 60000);
