document.addEventListener('DOMContentLoaded', async () => {

    // =========================================================
    // 1. THEME TOGGLE
    // =========================================================
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
    });

    // =========================================================
    // 2. TAB SWITCHING
    // =========================================================
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

    // =========================================================
    // 3. IDs FROM HTML
    // =========================================================
    const mainContent = document.querySelector('.device-page');
    const awsId   = mainContent.getAttribute('data-aws-id');
    const azureId = mainContent.getAttribute('data-azure-id');

    // =========================================================
    // 4. LIVE HERO STATS (status badge + queue depths)
    // =========================================================
    async function updateHeroStats() {
        try {
            const res  = await fetch('https://api.qpustatus.com/stats');
            const data = await res.json();

            const awsLive   = data.find(q => q.id === awsId);
            const azureLive = data.find(q => q.id === azureId);

            // --- Status badge (driven by AWS, fallback Azure) ---
            const primaryStatus = awsLive?.status ?? azureLive?.status ?? 'OFFLINE';
            const heroBadge = document.getElementById('hero-status');
            if (primaryStatus === 'ONLINE') {
                heroBadge.className = 'status-badge status-online';
                heroBadge.innerHTML = '<div class="dot dot-online"></div> ONLINE';
            } else {
                heroBadge.className = 'status-badge status-offline';
                heroBadge.innerHTML = '<div class="dot dot-offline"></div> OFFLINE';
            }

            // --- Queue depth display ---
            const fmtAws   = v => (v != null) ? `${v} <small>Tasks</small>`   : '--';
            const fmtAzure = v => (v != null) ? `${v}m <small>Wait</small>`   : '--';

            document.getElementById('aws-queue').innerHTML   = awsLive   ? fmtAws(awsLive.queue_depth)     : 'N/A';
            document.getElementById('azure-queue').innerHTML = azureLive  ? fmtAzure(azureLive.queue_depth) : 'N/A';

        } catch (e) {
            console.error('Hero stats fetch failed:', e);
        }
    }

    await updateHeroStats();
    // Refresh live stats every 60 seconds
    setInterval(updateHeroStats, 60_000);

    // =========================================================
    // 5. FETCH HISTORY
    // =========================================================
    let globalAwsHistory   = [];
    let globalAzureHistory = [];

    try {
        const [awsRes, azureRes] = await Promise.all([
            fetch(`https://api.qpustatus.com/history?id=${awsId}`),
            fetch(`https://api.qpustatus.com/history?id=${azureId}`)
        ]);
        globalAwsHistory   = await awsRes.json();
        globalAzureHistory = await azureRes.json();
    } catch (e) {
        console.error('History fetch failed:', e);
    }

    // =========================================================
    // 6. CHART HELPERS
    // =========================================================

    /**
     * Filter history array to only entries within the last `days` days.
     * Returns the filtered array (may be empty if no data in that window).
     */
    function filterByDays(history, days) {
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        return history.filter(h => new Date(h.timestamp.replace(' ', 'T') + 'Z').getTime() >= cutoff);
    }

    /**
     * Format a timestamp string for chart x-axis labels.
     * For ranges > 7 days, show date only; otherwise show date + time.
     */
    function fmtLabel(tsStr, days) {
        const d = new Date(tsStr.replace(' ', 'T') + 'Z');
        if (days <= 1)
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (days <= 7)
            return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    /**
     * Show a "no data" overlay on a canvas and hide the chart.
     */
    function showNoData(canvasId, message = 'Data not collected') {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        canvas.style.display = 'none';

        let overlay = document.getElementById(canvasId + '-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = canvasId + '-overlay';
            overlay.style.cssText = `
                display:flex; align-items:center; justify-content:center;
                height:140px; border-radius:8px;
                background:var(--card-bg, #1e293b);
                color:var(--muted, #64748b); font-size:0.85rem;
                border: 1px solid var(--border, #334155);
            `;
            canvas.parentNode.insertBefore(overlay, canvas.nextSibling);
        }
        overlay.innerText = message;
        overlay.style.display = 'flex';
    }

    function hideNoData(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (canvas) canvas.style.display = 'block';
        const overlay = document.getElementById(canvasId + '-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    const CHART_INSTANCES = {};

    // =========================================================
    // EVENT DETECTION  — "first seen" transition system
    // Returns array of { index, status, timestamp } for each
    // ONLINE↔OFFLINE transition in the given filtered array.
    // The very first data point is always included as a "First Seen" event.
    // =========================================================
    function detectStatusEvents(filtered) {
        const events = [];
        if (filtered.length === 0) return events;

        // Always mark the first data point
        events.push({ index: 0, status: filtered[0].status, timestamp: filtered[0].timestamp, isFirst: true });

        for (let i = 1; i < filtered.length; i++) {
            if (filtered[i].status !== filtered[i - 1].status) {
                events.push({ index: i, status: filtered[i].status, timestamp: filtered[i].timestamp, isFirst: false });
            }
        }
        return events;
    }

    // =========================================================
    // INLINE Chart.js PLUGIN — TradingView-style event markers
    // =========================================================

    // Cross-browser rounded rectangle (ctx.roundRect not supported everywhere)
    function drawRoundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    // Draw a callout label: rounded rect + downward pointer triangle
    function drawCallout(ctx, cx, tipY, label, icon, bgColor, glowColor) {
        const PAD_X = 7, PAD_Y = 4, R = 4, PTR = 6;
        ctx.font = 'bold 10px sans-serif';
        const labelW = ctx.measureText(label).width;

        // Icon width using Font Awesome font
        ctx.font = '900 11px "Font Awesome 6 Free"';
        const iconW = ctx.measureText(icon).width + 4; // 4px gap
        const totalW = iconW + labelW + PAD_X * 2;
        const boxH   = 18;
        const boxX   = cx - totalW / 2;
        const boxY   = tipY - boxH - PTR;

        // Glow effect
        ctx.shadowColor = glowColor;
        ctx.shadowBlur  = 10;

        // Background pill + pointer
        ctx.fillStyle = bgColor;
        drawRoundRect(ctx, boxX, boxY, totalW, boxH, R);
        ctx.fill();

        // Pointer triangle (downward)
        ctx.beginPath();
        ctx.moveTo(cx - PTR * 0.7, boxY + boxH);
        ctx.lineTo(cx + PTR * 0.7, boxY + boxH);
        ctx.lineTo(cx, boxY + boxH + PTR);
        ctx.closePath();
        ctx.fill();

        ctx.shadowBlur = 0;

        // Icon (Font Awesome unicode)
        ctx.fillStyle = '#ffffff';
        ctx.textAlign  = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = '900 11px "Font Awesome 6 Free"';
        ctx.fillText(icon, boxX + PAD_X, boxY + boxH / 2);

        // Label text
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(label, boxX + PAD_X + iconW, boxY + boxH / 2);
    }

    const statusEventPlugin = {
        id: 'statusEvents',
        afterDraw(chart) {
            const events = chart.config._statusEvents;
            if (!events || events.length === 0) return;

            const { ctx, chartArea: { top, bottom, left, right } } = chart;

            // ✅ FIXED: use getDatasetMeta pixel positions, not getPixelForIndex
            const meta = chart.getDatasetMeta(0);

            events.forEach(ev => {
                const point = meta.data[ev.index];
                if (!point) return;
                const xPos = point.x;
                if (xPos < left || xPos > right) return;

                const isOnline  = ev.status === 'ONLINE';
                const lineColor = isOnline ? '#10b981' : '#ef4444';
                const bgColor   = isOnline ? '#059669' : '#dc2626';
                const glowColor = isOnline ? '#10b981' : '#ef4444';

                // FA unicode: \uf0e7 = bolt (first seen), \uf062 = arrow-up, \uf063 = arrow-down
                const icon  = ev.isFirst ? '\uf0e7' : (isOnline ? '\uf062' : '\uf063');
                const label = ev.isFirst
                    ? `First Seen: ${ev.status}`
                    : (isOnline ? 'ONLINE' : 'OFFLINE');

                ctx.save();

                // Glowing dashed vertical line
                ctx.shadowColor  = glowColor;
                ctx.shadowBlur   = 8;
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle  = lineColor;
                ctx.lineWidth    = 1.5;
                ctx.globalAlpha  = 0.85;
                ctx.beginPath();
                ctx.moveTo(xPos, top + 30); // start below the callout
                ctx.lineTo(xPos, bottom);
                ctx.stroke();

                // Reset for callout
                ctx.globalAlpha = 1;
                ctx.setLineDash([]);

                // Draw callout marker at top of line
                drawCallout(ctx, xPos, top + 30, label, icon, bgColor, glowColor);

                ctx.restore();
            });
        }
    };

    // Register the plugin globally once
    Chart.register(statusEventPlugin);

    // =========================================================
    // RENDER EVENT NOTIFIER BAR below the chart
    // A horizontal scrollable row of event chips.
    // =========================================================
    function renderEventBar(barId, events, days) {
        const bar = document.getElementById(barId);
        if (!bar) return;
        bar.innerHTML = '';

        if (events.length === 0) {
            bar.innerHTML = '<span style="color:var(--muted,#64748b);font-size:0.78rem;">No events in this timeframe</span>';
            return;
        }

        events.forEach(ev => {
            const isOnline = ev.status === 'ONLINE';
            const chip = document.createElement('div');
            chip.style.cssText = `
                display:inline-flex; align-items:center; gap:5px;
                padding:3px 9px; border-radius:20px; font-size:0.75rem;
                font-weight:600; white-space:nowrap; cursor:default;
                background:${isOnline ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'};
                border:1px solid ${isOnline ? '#10b981' : '#ef4444'};
                color:${isOnline ? '#10b981' : '#ef4444'};
            `;
            const dot = `<span style="width:6px;height:6px;border-radius:50%;background:${isOnline ? '#10b981' : '#ef4444'};display:inline-block;"></span>`;
            const d = new Date(ev.timestamp.replace(' ', 'T') + 'Z');
            const timeStr = days <= 1
                ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

            const eventLabel = ev.isFirst ? `First Seen · ${ev.status}` : ev.status;
            chip.innerHTML = `${dot} ${eventLabel} <span style="opacity:0.6;font-weight:400;">${timeStr}</span>`;
            chip.title = `${ev.timestamp} UTC — ${ev.status}`;
            bar.appendChild(chip);
        });
    }

    /**
     * Render (or re-render) a single queue depth line chart.
     * @param {string} canvasId  - target <canvas> id
     * @param {string} eventBarId - target event bar div id (or null)
     * @param {Array}  history   - full history array
     * @param {number} days      - timeframe in days
     * @param {string} color     - hex border colour
     * @param {string} label     - dataset label
     */
    function renderQueueChart(canvasId, eventBarId, history, days, color, label) {
        if (CHART_INSTANCES[canvasId]) {
            CHART_INSTANCES[canvasId].destroy();
            delete CHART_INSTANCES[canvasId];
        }

        const filtered = filterByDays(history, days);

        if (filtered.length === 0) {
            showNoData(canvasId);
            if (eventBarId) renderEventBar(eventBarId, [], days);
            return;
        }

        hideNoData(canvasId);

        const events = detectStatusEvents(filtered);
        if (eventBarId) renderEventBar(eventBarId, events, days);

        const bg     = color + '1a'; // 10% opacity fill
        const labels = filtered.map(h => fmtLabel(h.timestamp, days));
        const values = filtered.map(h => h.queue_depth);

        // Compute a sensible y-axis max: at least 5, or 20% above actual max
        const maxVal = Math.max(...values);
        const suggestedMax = maxVal < 5 ? 5 : Math.ceil(maxVal * 1.2);

        const chartConfig = {
            type: 'line',
            _statusEvents: events,   // picked up by our plugin
            data: {
                labels,
                datasets: [{
                    label,
                    data: values,
                    borderColor: color,
                    backgroundColor: bg,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.35,
                    pointRadius: 0,
                    spanGaps: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        grid: { color: '#334155' },
                        ticks: { maxTicksLimit: 8, color: '#94a3b8' }
                    },
                    y: {
                        beginAtZero: true,
                        suggestedMax,
                        grid: { color: '#334155' },
                        ticks: {
                            color: '#94a3b8',
                            precision: 0,    // no decimals
                            stepSize: 1      // min increment = 1
                        }
                    }
                }
            }
        };

        CHART_INSTANCES[canvasId] = new Chart(
            document.getElementById(canvasId).getContext('2d'),
            chartConfig
        );

        // Attach event data to instance so the plugin can reach it
        CHART_INSTANCES[canvasId].config._statusEvents = events;
    }

    // =========================================================
    // 7. QUEUE CHARTS (AWS | Azure | Direct Cloud [coming soon])
    // =========================================================
    let currentQueueTf = 1; // default: 24H

    function renderAllQueueCharts(days) {
        renderQueueChart('awsChart',   'aws-event-bar',   globalAwsHistory,   days, '#f97316', 'AWS Queue (Tasks)');
        renderQueueChart('azureChart', 'azure-event-bar', globalAzureHistory, days, '#3b82f6', 'Azure Queue (Wait Mins)');
        // Direct Cloud chart stays greyed-out / "Coming Soon" – no render needed
    }

    // Timeframe buttons
    document.querySelectorAll('#queue-tf button').forEach(btn => {
        btn.addEventListener('click', e => {
            document.querySelectorAll('#queue-tf button').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentQueueTf = parseInt(e.target.getAttribute('data-tf'));
            renderAllQueueCharts(currentQueueTf);
        });
    });

    // Initial render
    renderAllQueueCharts(1);

    // =========================================================
    // 8. UPTIME GRIDS  (30d | 90d | 180d | 1Y)
    // =========================================================

    /**
     * Build a per-day uptime grid.
     * Each block = 1 day.  Green = online, Red = offline, Grey = no data.
     *
     * @param {string} gridId   - container element id
     * @param {string} pctId    - uptime % span id
     * @param {Array}  history  - full status history for this provider
     * @param {number} days     - how many day-blocks to render
     */
    function buildUptimeGrid(gridId, pctId, history, days) {
        const grid = document.getElementById(gridId);
        if (!grid) return;
        grid.innerHTML = '';

        // Bucket history into per-day maps  { "YYYY-MM-DD": [status, ...] }
        const dayMap = {};
        history.forEach(h => {
            const key = new Date(h.timestamp.replace(' ', 'T') + 'Z').toISOString().slice(0, 10);
            if (!dayMap[key]) dayMap[key] = [];
            dayMap[key].push(h.status);
        });

        let onlineDays = 0;
        let dataDays   = 0;

        for (let i = days - 1; i >= 0; i--) {
            const d = new Date();
            d.setUTCDate(d.getUTCDate() - i);
            const key = d.toISOString().slice(0, 10);

            const block = document.createElement('div');
            block.className = 'uptime-block';

            if (dayMap[key]) {
                dataDays++;
                const entries   = dayMap[key];
                const onlinePct = entries.filter(s => s === 'ONLINE').length / entries.length;
                if (onlinePct >= 0.9) {
                    block.classList.add('online');
                    block.title = `${key}: Online`;
                    onlineDays++;
                } else {
                    block.classList.add('down');
                    block.title = `${key}: Degraded / Offline`;
                }
            } else {
                // No data for this day
                block.style.background = 'var(--border, #334155)';
                block.title = `${key}: Data not collected`;
            }

            grid.appendChild(block);
        }

        const pctEl = document.getElementById(pctId);
        if (pctEl) {
            pctEl.innerText = dataDays > 0
                ? `${((onlineDays / dataDays) * 100).toFixed(2)}%`
                : 'No Data';
        }
    }

    function renderUptime(days) {
        const startLabel = document.getElementById('uptime-start-label');
        if (startLabel) startLabel.innerText = days >= 365 ? '1 year ago' : `${days} days ago`;

        buildUptimeGrid('aws-uptime-grid',   'aws-uptime-pct',   globalAwsHistory,   days);
        buildUptimeGrid('azure-uptime-grid', 'azure-uptime-pct', globalAzureHistory, days);
        // Direct cloud grid: Coming Soon — leave empty / handled by HTML placeholder
    }

    document.querySelectorAll('#uptime-tf button').forEach(btn => {
        btn.addEventListener('click', e => {
            document.querySelectorAll('#uptime-tf button').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderUptime(parseInt(e.target.getAttribute('data-tf')));
        });
    });

    // Default: 30 days
    renderUptime(30);

    // =========================================================
    // 9. DETAILED 1-WEEK STATUS CHART  (stepped, daily ticks)
    // =========================================================
    function renderDetailedStatus() {
        const canvasId = 'detailedStatusChart';

        if (CHART_INSTANCES[canvasId]) {
            CHART_INSTANCES[canvasId].destroy();
            delete CHART_INSTANCES[canvasId];
        }

        // Use 7 days of AWS data for the detail view
        const data = filterByDays(globalAwsHistory, 7);

        if (data.length === 0) {
            showNoData(canvasId, 'No status data in the last 7 days');
            return;
        }

        hideNoData(canvasId);

        CHART_INSTANCES[canvasId] = new Chart(
            document.getElementById(canvasId).getContext('2d'),
            {
                type: 'line',
                data: {
                    labels: data.map(h => fmtLabel(h.timestamp, 7)),
                    datasets: [
                        {
                            label: 'AWS Status',
                            data: data.map(h => h.status === 'ONLINE' ? 1 : 0),
                            borderColor: '#10b981',
                            backgroundColor: 'rgba(16, 185, 129, 0.08)',
                            fill: true,
                            stepped: 'before',   // sharp, blocky transitions
                            borderWidth: 2,
                            pointRadius: 0
                        },
                        {
                            label: 'Azure Status',
                            data: filterByDays(globalAzureHistory, 7).map(h => h.status === 'ONLINE' ? 1 : 0),
                            borderColor: '#3b82f6',
                            backgroundColor: 'rgba(59, 130, 246, 0.08)',
                            fill: true,
                            stepped: 'before',
                            borderWidth: 2,
                            pointRadius: 0
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { display: true, labels: { color: '#94a3b8' } },
                        tooltip: {
                            callbacks: {
                                label: ctx => `${ctx.dataset.label}: ${ctx.raw === 1 ? 'ONLINE' : 'OFFLINE'}`
                            }
                        }
                    },
                    scales: {
                        x: {
                            ticks: { maxTicksLimit: 7, color: '#94a3b8' },
                            grid: { color: '#334155' }
                        },
                        y: {
                            min: -0.05, max: 1.15,
                            ticks: {
                                stepSize: 1,
                                color: '#94a3b8',
                                callback: val => val === 1 ? 'ONLINE' : val === 0 ? 'OFFLINE' : ''
                            },
                            grid: { color: '#334155' }
                        }
                    }
                }
            }
        );
    }

    renderDetailedStatus();

}); // end DOMContentLoaded
