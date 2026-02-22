document.addEventListener('DOMContentLoaded', async () => {
    // 1. Identify which machine page we are on
    const mainContent = document.getElementById('overview');
    const awsId = mainContent.getAttribute('data-aws-id');
    const azureId = mainContent.getAttribute('data-azure-id');

    // Helper functions
    function formatQueue(depth, provider) {
        if (depth === undefined || depth === null) return '<span style="color: var(--muted)">--</span>';
        if (provider === 'aws') return `${depth} <span style="font-size: 0.7rem; color: var(--muted);">Tasks</span>`;
        if (depth > 60) return `${Math.floor(depth / 60)}h <span style="font-size: 0.7rem; color: var(--muted);">Wait</span>`;
        return `${depth}m <span style="font-size: 0.7rem; color: var(--muted);">Wait</span>`;
    }

    // 2. Fetch Live Stats for the Hero Section
    try {
        const statsRes = await fetch('https://api.qpustatus.com/stats');
        const statsData = await statsRes.json();
        
        const awsLive = statsData.find(q => q.id === awsId);
        const azureLive = statsData.find(q => q.id === azureId);

        // Update Hero Status (Use AWS as primary online/offline indicator, fallback to Azure)
        const primaryStatus = awsLive ? awsLive.status : (azureLive ? azureLive.status : 'OFFLINE');
        const heroBadge = document.getElementById('hero-status');
        if (primaryStatus === 'ONLINE') {
            heroBadge.className = 'status-badge status-online';
            heroBadge.innerHTML = '<div class="dot dot-online"></div> ONLINE';
        } else {
            heroBadge.className = 'status-badge status-offline';
            heroBadge.innerHTML = '<div class="dot dot-offline"></div> OFFLINE';
        }

        // Update Route Queue Numbers
        if (awsLive) {
            document.getElementById('aws-queue').innerHTML = formatQueue(awsLive.queue_depth, 'aws');
        } else {
            document.getElementById('aws-queue').innerText = "Not Available";
        }

        if (azureLive) {
            document.getElementById('azure-queue').innerHTML = formatQueue(azureLive.queue_depth, 'azure');
        } else {
            document.getElementById('azure-queue').innerText = "Not Available";
        }

    } catch (e) {
        console.error("Failed to load live stats", e);
    }

    // 3. Fetch History and Build the Chart
    try {
        // Fetch both histories simultaneously
        const [awsHistRes, azureHistRes] = await Promise.all([
            fetch(`https://api.qpustatus.com/history?id=${awsId}`),
            fetch(`https://api.qpustatus.com/history?id=${azureId}`)
        ]);

        const awsHistory = await awsHistRes.json();
        const azureHistory = await azureHistRes.json();

        // Extract labels (timestamps) from whichever array is longer
        const labels = (awsHistory.length > azureHistory.length ? awsHistory : azureHistory)
            .map(h => {
                const d = new Date(h.timestamp.replace(' ', 'T') + 'Z');
                return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            });

        const ctx = document.getElementById('queueChart').getContext('2d');
        
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Azure Expected Wait (Minutes)',
                        data: azureHistory.map(h => h.queue_depth),
                        borderColor: '#3b82f6', // Blue for Azure
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        yAxisID: 'y'
                    },
                    {
                        label: 'AWS Queue Depth (Tasks)',
                        data: awsHistory.map(h => h.queue_depth),
                        borderColor: '#f97316', // Orange for AWS
                        borderWidth: 2,
                        borderDash: [5, 5],
                        fill: false,
                        tension: 0.4,
                        pointRadius: 0,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    x: {
                        grid: { color: '#334155' },
                        ticks: { maxTicksLimit: 12, color: '#94a3b8' }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: true, text: 'Azure (Minutes)', color: '#94a3b8' },
                        grid: { color: '#334155' },
                        ticks: { color: '#94a3b8' }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: { display: true, text: 'AWS (Tasks)', color: '#94a3b8' },
                        grid: { drawOnChartArea: false }, // Prevent gridline overlap
                        ticks: { color: '#94a3b8' }
                    }
                },
                plugins: {
                    legend: { labels: { color: '#f8fafc' } }
                }
            }
        });

    } catch (e) {
        console.error("Failed to load chart data", e);
        document.getElementById('queueChart').parentElement.innerHTML = '<p style="color: var(--offline);">Failed to load history data.</p>';
    }
});
