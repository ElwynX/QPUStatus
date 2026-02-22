document.addEventListener('DOMContentLoaded', async () => {
    
    // --- 1. THEME TOGGLE (Copied from main script to work here too) ---
    const themeBtn = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');
    const htmlTag = document.documentElement;

    const savedTheme = localStorage.getItem('theme') || 'dark';
    htmlTag.setAttribute('data-theme', savedTheme);
    themeIcon.innerText = savedTheme === 'dark' ? '☀️' : '🌙';

    themeBtn.addEventListener('click', () => {
        const newTheme = htmlTag.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        htmlTag.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        themeIcon.innerText = newTheme === 'dark' ? '☀️' : '🌙';
    });

    // --- 2. TAB SWITCHING LOGIC (SteamDB Style) ---
    const tabs = document.querySelectorAll('#tab-menu li');
    const panes = document.querySelectorAll('.tab-pane');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active from all tabs and panes
            tabs.forEach(t => t.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));
            
            // Add active to clicked tab and its target pane
            tab.classList.add('active');
            document.getElementById(tab.getAttribute('data-target')).classList.add('active');
        });
    });

    // --- 3. GENERATE 90-DAY UPTIME BLOCKS (Visual Placeholder) ---
    const uptimeGrid = document.getElementById('uptime-grid');
    for(let i = 0; i < 90; i++) {
        const block = document.createElement('div');
        block.className = 'uptime-block';
        // Randomly make 2 older blocks "offline" to make it look realistic for now
        if (i === 14 || i === 42) block.classList.add('down');
        uptimeGrid.appendChild(block);
    }

    // --- 4. FETCH DATA & CHARTS ---
    const mainContent = document.querySelector('.device-page');
    const awsId = mainContent.getAttribute('data-aws-id');
    const azureId = mainContent.getAttribute('data-azure-id');

    function formatQueue(depth, provider) {
        if (depth === undefined || depth === null) return '<span style="color: var(--muted)">--</span>';
        if (provider === 'aws') return `${depth} <span style="font-size: 0.7rem; color: var(--muted);">Tasks</span>`;
        if (depth > 60) return `${Math.floor(depth / 60)}h <span style="font-size: 0.7rem; color: var(--muted);">Wait</span>`;
        return `${depth}m <span style="font-size: 0.7rem; color: var(--muted);">Wait</span>`;
    }

    // Fetch Live Top Stats
    try {
        const statsRes = await fetch('https://api.qpustatus.com/stats');
        const statsData = await statsRes.json();
        const awsLive = statsData.find(q => q.id === awsId);
        const azureLive = statsData.find(q => q.id === azureId);

        const primaryStatus = awsLive ? awsLive.status : (azureLive ? azureLive.status : 'OFFLINE');
        const heroBadge = document.getElementById('hero-status');
        if (primaryStatus === 'ONLINE') {
            heroBadge.className = 'status-badge status-online';
            heroBadge.innerHTML = '<div class="dot dot-online"></div> ONLINE';
        } else {
            heroBadge.className = 'status-badge status-offline';
            heroBadge.innerHTML = '<div class="dot dot-offline"></div> OFFLINE';
        }

        document.getElementById('aws-queue').innerHTML = awsLive ? formatQueue(awsLive.queue_depth, 'aws') : "N/A";
        document.getElementById('azure-queue').innerHTML = azureLive ? formatQueue(azureLive.queue_depth, 'azure') : "N/A";
    } catch (e) { console.error("Stats fail", e); }

    // Fetch History & Draw Chart
    try {
        const [awsHistRes, azureHistRes] = await Promise.all([
            fetch(`https://api.qpustatus.com/history?id=${awsId}`),
            fetch(`https://api.qpustatus.com/history?id=${azureId}`)
        ]);

        const awsHistory = await awsHistRes.json();
        const azureHistory = await azureHistRes.json();

        // FAILSAFE: If DB is empty, show the "Gathering Data" message instead of crashing
        if (awsHistory.length === 0 && azureHistory.length === 0) {
            document.getElementById('queueChart').style.display = 'none';
            document.getElementById('chart-fallback').style.display = 'block';
            return;
        }

        const labels = (awsHistory.length > azureHistory.length ? awsHistory : azureHistory)
            .map(h => new Date(h.timestamp.replace(' ', 'T') + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

        const ctx = document.getElementById('queueChart').getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Azure (Wait Mins)',
                        data: azureHistory.map(h => h.queue_depth),
                        borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0, yAxisID: 'y'
                    },
                    {
                        label: 'AWS (Queued Tasks)',
                        data: awsHistory.map(h => h.queue_depth),
                        borderColor: '#f97316', borderWidth: 2, borderDash: [5, 5],
                        fill: false, tension: 0.4, pointRadius: 0, yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { grid: { color: '#334155' }, ticks: { maxTicksLimit: 8, color: '#94a3b8' } },
                    y: { type: 'linear', display: true, position: 'left', grid: { color: '#334155' }, ticks: { color: '#94a3b8' } },
                    y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#94a3b8' } }
                }
            }
        });
    } catch (e) {
        document.getElementById('queueChart').style.display = 'none';
        document.getElementById('chart-fallback').style.display = 'block';
        document.getElementById('chart-fallback').innerText = "Database connection error.";
    }
});
