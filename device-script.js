document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. Theme Toggle & Tab Logic (Unchanged)
    const htmlTag = document.documentElement;
    const themeBtn = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');
    const savedTheme = localStorage.getItem('theme') || 'dark';
    htmlTag.setAttribute('data-theme', savedTheme);
    themeIcon.innerText = savedTheme === 'dark' ? '☀️' : '🌙';

    themeBtn.addEventListener('click', () => {
        const newTheme = htmlTag.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        htmlTag.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        themeIcon.innerText = newTheme === 'dark' ? '☀️' : '🌙';
        Chart.instances.forEach(c => c.update()); // Update chart colors on toggle
    });

    const tabs = document.querySelectorAll('#tab-menu li');
    const panes = document.querySelectorAll('.tab-pane');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.getAttribute('data-target')).classList.add('active');
        });
    });

    // 2. Data Fetching Setup
    const mainContent = document.querySelector('.device-page');
    const awsId = mainContent.getAttribute('data-aws-id');
    const azureId = mainContent.getAttribute('data-azure-id');
    let globalAwsHistory = [];
    let globalAzureHistory = [];
    let awsChartInstance = null;
    let azureChartInstance = null;
    let detailedStatusChart = null;

    // Fetch History Data (Asking Worker for max available, up to 1 week for now to prevent crashes)
    // NOTE: Requires updating Worker to accept `?days=` param later. For now, we work with what it returns.
    try {
        const [awsHistRes, azureHistRes] = await Promise.all([
            fetch(`https://api.qpustatus.com/history?id=${awsId}`),
            fetch(`https://api.qpustatus.com/history?id=${azureId}`)
        ]);
        globalAwsHistory = await awsHistRes.json();
        globalAzureHistory = await azureHistRes.json();
    } catch(e) { console.error("History fetch failed", e); }

    // 3. Chart Rendering Logic
    function renderQueueCharts(days) {
        // Filter data based on selected timeframe (1 day = 1440 mins)
        const limit = days * 1440; 
        const awsData = globalAwsHistory.slice(-limit);
        const azureData = globalAzureHistory.slice(-limit);

        const mapChartData = (data) => ({
            labels: data.map(h => new Date(h.timestamp.replace(' ', 'T') + 'Z').toLocaleString([], {month:'short', day:'numeric', hour: '2-digit', minute: '2-digit'})),
            values: data.map(h => h.queue_depth)
        });

        const aws = mapChartData(awsData);
        const azure = mapChartData(azureData);

        const commonOptions = {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { maxTicksLimit: 6, color: '#94a3b8' }, grid: { display: false } },
                y: { beginAtZero: true, grid: { color: '#334155' }, ticks: { color: '#94a3b8' } }
            }
        };

        if (awsChartInstance) awsChartInstance.destroy();
        if (azureChartInstance) azureChartInstance.destroy();

        awsChartInstance = new Chart(document.getElementById('awsChart').getContext('2d'), {
            type: 'line',
            data: { labels: aws.labels, datasets: [{ data: aws.values, borderColor: '#f97316', backgroundColor: 'rgba(249, 115, 22, 0.1)', fill: true, tension: 0.3, pointRadius: 0 }] },
            options: commonOptions
        });

        azureChartInstance = new Chart(document.getElementById('azureChart').getContext('2d'), {
            type: 'line',
            data: { labels: azure.labels, datasets: [{ data: azure.values, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, tension: 0.3, pointRadius: 0 }] },
            options: commonOptions
        });
    }

    // --- RESTORED HERO UPDATE LOGIC ---
    async function updateHeroStats() {
        try {
            const statsRes = await fetch('https://api.qpustatus.com/stats');
            const statsData = await statsRes.json();
            
            const awsLive = statsData.find(q => q.id === awsId);
            const azureLive = statsData.find(q => q.id === azureId);

            // Update Status Badge
            const primaryStatus = awsLive ? awsLive.status : (azureLive ? azureLive.status : 'OFFLINE');
            const heroBadge = document.getElementById('hero-status');
            if (primaryStatus === 'ONLINE') {
                heroBadge.className = 'status-badge status-online';
                heroBadge.innerHTML = '<div class="dot dot-online"></div> ONLINE';
            } else {
                heroBadge.className = 'status-badge status-offline';
                heroBadge.innerHTML = '<div class="dot dot-offline"></div> OFFLINE';
            }

            // Helper to format the queue text
            const fmt = (val, p) => {
                if (val === undefined || val === null) return '--';
                return p === 'aws' ? `${val} <small>Tasks</small>` : `${val}m <small>Wait</small>`;
            };

            document.getElementById('aws-queue').innerHTML = awsLive ? fmt(awsLive.queue_depth, 'aws') : "N/A";
            document.getElementById('azure-queue').innerHTML = azureLive ? fmt(azureLive.queue_depth, 'azure') : "N/A";
        } catch (e) { console.error("Hero update failed", e); }
    }

    // 4. Uptime Grid Logic (Simulated grouping by day)
    function renderUptime(days) {
        document.getElementById('uptime-start-label').innerText = `${days} days ago`;
        
        function buildGrid(containerId, pctId, data) {
            const grid = document.getElementById(containerId);
            grid.innerHTML = '';
            
            // If database is new, pad the missing days with "Grey / No Data" blocks
            const blocksToRender = days;
            
            for(let i = 0; i < blocksToRender; i++) {
                const block = document.createElement('div');
                block.className = 'uptime-block';
                
                // Simulate: If i is greater than the days of data we actually have, grey it out.
                // (Since your DB is 1 day old, 29 blocks will be grey!)
                if (i < blocksToRender - 1) { 
                    block.style.background = 'var(--border)'; 
                    block.title = "Data not collected";
                } else {
                    // Check actual data for the latest block
                    const isOnline = data.length > 0 && data[data.length-1].status === 'ONLINE';
                    block.classList.add(isOnline ? 'online' : 'down');
                    block.title = isOnline ? "Online" : "Offline / Maintenance";
                }
                grid.appendChild(block);
            }
            document.getElementById(pctId).innerText = data.length > 0 ? "100%" : "No Data";
        }

        buildGrid('aws-uptime-grid', 'aws-uptime-pct', globalAwsHistory);
        buildGrid('azure-uptime-grid', 'azure-uptime-pct', globalAzureHistory);
    }

    function buildGrid(containerId, pctId, data) {
            const grid = document.getElementById(containerId);
            grid.innerHTML = '';
            
            if (data.length === 0) {
                grid.innerHTML = '<p style="color: var(--muted); font-size: 0.8rem;">Awaiting first telemetry data...</p>';
                document.getElementById(pctId).innerText = "0%";
                return;
            }

            // Only render blocks for data we HAVE, no grey padding
            data.forEach(point => {
                const block = document.createElement('div');
                block.className = 'uptime-block';
                const isOnline = point.status === 'ONLINE';
                block.classList.add(isOnline ? 'online' : 'down');
                block.title = `${new Date(point.timestamp).toLocaleString()}: ${point.status}`;
                grid.appendChild(block);
            });

            // Calculate actual uptime percentage from the data
            const onlineCount = data.filter(p => p.status === 'ONLINE').length;
            const uptimePct = ((onlineCount / data.length) * 100).toFixed(2);
            document.getElementById(pctId).innerText = `${uptimePct}%`;
        }

    // 5. Detailed 1W Step Chart (Using Stepped Line)
    function renderDetailedStatus() {
        const data = globalAwsHistory.slice(-10080); // Up to 7 days
        if (detailedStatusChart) detailedStatusChart.destroy();

        detailedStatusChart = new Chart(document.getElementById('detailedStatusChart').getContext('2d'), {
            type: 'line',
            data: {
                labels: data.map(h => new Date(h.timestamp.replace(' ', 'T') + 'Z').toLocaleString([], {month:'short', day:'numeric', hour: '2-digit'})),
                datasets: [{
                    label: 'AWS Route Status',
                    data: data.map(h => h.status === 'ONLINE' ? 1 : 0),
                    borderColor: '#10b981',
                    stepped: true, // This makes it a rigid blocky chart, perfect for Online/Offline
                    borderWidth: 2,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { maxTicksLimit: 7 }, grid: { display: false } },
                    y: { 
                        min: -0.1, max: 1.1, 
                        ticks: { stepSize: 1, callback: (val) => val === 1 ? 'ONLINE' : (val === 0 ? 'OFFLINE' : '') },
                        grid: { color: '#334155' }
                    }
                }
            }
        });
    }

    // 6. Timeframe Button Listeners
    document.querySelectorAll('#queue-tf button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#queue-tf button').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderQueueCharts(parseInt(e.target.getAttribute('data-tf')));
        });
    });

    document.querySelectorAll('#uptime-tf button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#uptime-tf button').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderUptime(parseInt(e.target.getAttribute('data-tf')));
        });
    });

    // Initial Render
    renderQueueCharts(1);


    renderUptime(30);
    renderDetailedStatus();
});
