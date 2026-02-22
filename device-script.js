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
    // 4. LIVE HERO STATS
    // =========================================================
    async function updateHeroStats() {
        try {
            const res  = await fetch('https://api.qpustatus.com/stats');
            const data = await res.json();

            const awsLive   = data.find(q => q.id === awsId);
            const azureLive = data.find(q => q.id === azureId);

            const primaryStatus = awsLive?.status ?? azureLive?.status ?? 'OFFLINE';
            const heroBadge = document.getElementById('hero-status');
            if (primaryStatus === 'ONLINE') {
                heroBadge.className = 'status-badge status-online';
                heroBadge.innerHTML = '<div class="dot dot-online"></div> ONLINE';
            } else {
                heroBadge.className = 'status-badge status-offline';
                heroBadge.innerHTML = '<div class="dot dot-offline"></div> OFFLINE';
            }

            const fmtAws   = v => (v != null) ? `${v} <small>Tasks</small>`  : '--';
            const fmtAzure = v => (v != null) ? `${v}m <small>Wait</small>`  : '--';

            document.getElementById('aws-queue').innerHTML   = awsLive   ? fmtAws(awsLive.queue_depth)     : 'N/A';
            document.getElementById('azure-queue').innerHTML = azureLive ? fmtAzure(azureLive.queue_depth) : 'N/A';

        } catch (e) {
            console.error('Hero stats fetch failed:', e);
        }
    }

    await updateHeroStats();
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

    /** Filter to entries within last `days` days */
    function filterByDays(history, days) {
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        return history.filter(h =>
            new Date(h.timestamp.replace(' ', 'T') + 'Z').getTime() >= cutoff
        );
    }

    /** Format a timestamp for the x-axis label based on timeframe */
    function fmtLabel(tsStr, days) {
        const d = new Date(tsStr.replace(' ', 'T') + 'Z');
        if (days <= 1)
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (days <= 7)
            return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    /** Format a raw Date object to the same label format */
    function fmtDateLabel(d, days) {
        if (days <= 1)
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (days <= 7)
            return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    /** Show a "no data" overlay, hide the canvas */
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
                background:var(--panel, #1e293b);
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
    // EVENT DETECTION — FIXED "First Seen" System
    //
    // Key fix: "First Seen" always references globalHistory[0],
    // the absolute first record ever — never the first record of
    // the currently selected timeframe window.
    //
    // - If globalHistory[0] falls WITHIN the current window:
    //     → draw vertical line on chart + show in event bar
    // - If globalHistory[0] falls BEFORE the current window:
    //     → do NOT draw on chart, but still show in event bar
    //       with "(before window)" indicator so it's clear
    //
    // Transitions (ONLINE↔OFFLINE) within the filtered window
    // are detected and displayed normally.
    // =========================================================
    function detectStatusEvents(filtered, globalHistory) {
        const events = [];
        if (filtered.length === 0) return events;

        // ── First Seen (anchored to global history, not filtered) ──
        const globalFirst = globalHistory.length > 0 ? globalHistory[0] : null;
        if (globalFirst) {
            const windowStart = Date.now() - /* will be overridden by caller */ 0;
            const globalFirstMs = new Date(globalFirst.timestamp.replace(' ', 'T') + 'Z').getTime();
            const filteredStartMs = new Date(filtered[0].timestamp.replace(' ', 'T') + 'Z').getTime();

            if (globalFirstMs >= filteredStartMs) {
                // First seen IS within this window — draw at index 1 (accounting for start anchor)
                events.push({
                    index: 1,          // +1 because we prepend a null anchor
                    status: globalFirst.status,
                    timestamp: globalFirst.timestamp,
                    isFirst: true,
                    inWindow: true
                });
            } else {
                // First seen happened BEFORE this window — only show in event bar, no chart line
                events.push({
                    index: -1,
                    status: globalFirst.status,
                    timestamp: globalFirst.timestamp,
                    isFirst: true,
                    inWindow: false    // plugin will skip this; event bar still shows it
                });
            }
        }

        // ── Status transitions within the filtered window ──
        for (let i = 1; i < filtered.length; i++) {
            if (filtered[i].status !== filtered[i - 1].status) {
                events.push({
                    index: i + 1,  // +1 for the prepended start-anchor null
                    status: filtered[i].status,
                    timestamp: filtered[i].timestamp,
                    isFirst: false,
                    inWindow: true
                });
            }
        }

        return events;
    }

    // =========================================================
    // CHART.JS PLUGIN — TradingView-style event markers
    // =========================================================

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

    function drawCallout(ctx, cx, tipY, label, icon, bgColor, glowColor) {
        const PAD_X = 7, R = 4, PTR = 6;
        ctx.font = 'bold 10px sans-serif';
        const labelW = ctx.measureText(label).width;
        ctx.font = '900 11px "Font Awesome 6 Free"';
        const iconW = ctx.measureText(icon).width + 4;
        const totalW = iconW + labelW + PAD_X * 2;
        const boxH   = 18;
        const boxX   = cx - totalW / 2;
        const boxY   = tipY - boxH - PTR;

        ctx.shadowColor = glowColor;
        ctx.shadowBlur  = 10;
        ctx.fillStyle = bgColor;
        drawRoundRect(ctx, boxX, boxY, totalW, boxH, R);
        ctx.fill();

        // Pointer triangle
        ctx.beginPath();
        ctx.moveTo(cx - PTR * 0.7, boxY + boxH);
        ctx.lineTo(cx + PTR * 0.7, boxY + boxH);
        ctx.lineTo(cx, boxY + boxH + PTR);
        ctx.closePath();
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = '900 11px "Font Awesome 6 Free"';
        ctx.fillText(icon, boxX + PAD_X, boxY + boxH / 2);
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(label, boxX + PAD_X + iconW, boxY + boxH / 2);
    }

    const statusEventPlugin = {
        id: 'statusEvents',
        afterDraw(chart) {
            const events = chart.config._statusEvents;
            if (!events || events.length === 0) return;

            const { ctx, chartArea: { top, bottom, left, right } } = chart;
            const meta = chart.getDatasetMeta(0);

            events.forEach(ev => {
                // Skip events outside the current window (e.g. First Seen before window)
                if (!ev.inWindow || ev.index < 0) return;

                const point = meta.data[ev.index];
                if (!point) return;
                const xPos = point.x;
                if (xPos < left || xPos > right) return;

                const isOnline  = ev.status === 'ONLINE';
                const lineColor = isOnline ? '#10b981' : '#ef4444';
                const bgColor   = isOnline ? '#059669' : '#dc2626';
                const glowColor = isOnline ? '#10b981' : '#ef4444';

                // \uf0e7 = bolt, \uf062 = arrow-up, \uf063 = arrow-down
                const icon  = ev.isFirst ? '\uf0e7' : (isOnline ? '\uf062' : '\uf063');
                const label = ev.isFirst
                    ? `First Seen: ${ev.status}`
                    : (isOnline ? 'ONLINE' : 'OFFLINE');

                ctx.save();

                // Glowing dashed vertical line
                ctx.shadowColor = glowColor;
                ctx.shadowBlur  = 8;
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = lineColor;
                ctx.lineWidth   = 1.5;
                ctx.globalAlpha = 0.85;
                ctx.beginPath();
                ctx.moveTo(xPos, top + 30);
                ctx.lineTo(xPos, bottom);
                ctx.stroke();

                ctx.globalAlpha = 1;
                ctx.setLineDash([]);
                drawCallout(ctx, xPos, top + 30, label, icon, bgColor, glowColor);
                ctx.restore();
            });
        }
    };

    Chart.register(statusEventPlugin);

    // =========================================================
    // EVENT NOTIFIER BAR (chips below chart)
    // Always shows the true First Seen — even if outside window
    // =========================================================
    function renderEventBar(barId, events, days) {
        const bar = document.getElementById(barId);
        if (!bar) return;
        bar.innerHTML = '';

        // Show all events including out-of-window First Seen
        const displayEvents = events.filter(ev => ev.isFirst || ev.inWindow);

        if (displayEvents.length === 0) {
            bar.innerHTML = '<span style="color:var(--muted,#64748b);font-size:0.78rem;">No events in this timeframe</span>';
            return;
        }

        displayEvents.forEach(ev => {
            const isOnline  = ev.status === 'ONLINE';
            const outOfWin  = !ev.inWindow; // First Seen from before window
            const chip = document.createElement('div');
            chip.style.cssText = `
                display:inline-flex; align-items:center; gap:5px;
                padding:3px 10px; border-radius:20px; font-size:0.75rem;
                font-weight:600; white-space:nowrap; cursor:default;
                background:${isOnline ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'};
                border:1px solid ${isOnline ? '#10b981' : '#ef4444'};
                color:${isOnline ? '#10b981' : '#ef4444'};
                ${outOfWin ? 'opacity:0.65;' : ''}
            `;
            const dot = `<span style="width:6px;height:6px;border-radius:50%;background:${isOnline ? '#10b981' : '#ef4444'};display:inline-block;flex-shrink:0;"></span>`;
            const d = new Date(ev.timestamp.replace(' ', 'T') + 'Z');
            // First Seen chip always shows full date+time regardless of current timeframe
            const timeStr = ev.isFirst
                ? d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : (days <= 1
                    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }));

            let eventLabel = ev.isFirst
                ? `First Seen · ${ev.status}`
                : (isOnline ? '▲ ONLINE' : '▼ OFFLINE');

            // If First Seen is before the current window, note it
            if (ev.isFirst && outOfWin) {
                eventLabel = `First Seen · ${ev.status}`;
                chip.title = `First telemetry recorded at ${ev.timestamp} UTC (before current window)`;
            } else {
                chip.title = `${ev.timestamp} UTC`;
            }

            chip.innerHTML = `${dot} ${eventLabel} <span style="opacity:0.6;font-weight:400;">${timeStr}</span>`;
            bar.appendChild(chip);
        });
    }

    // =========================================================
    // RENDER QUEUE CHART — with FIXED timeframe x-axis
    //
    // Key fix: We always inject a null data point at the EXACT
    // start of the timeframe window (now - days) and one at NOW.
    // This forces Chart.js to always show the full selected period
    // even when data only covers part of it. Gaps appear as breaks
    // in the line rather than the axis shrinking to fit data.
    // =========================================================
    function renderQueueChart(canvasId, eventBarId, history, globalHistory, days, color, label) {
        if (CHART_INSTANCES[canvasId]) {
            CHART_INSTANCES[canvasId].destroy();
            delete CHART_INSTANCES[canvasId];
        }

        const filtered = filterByDays(history, days);
        const events   = detectStatusEvents(filtered, globalHistory);

        if (eventBarId) renderEventBar(eventBarId, events, days);

        if (filtered.length === 0) {
            showNoData(canvasId, 'Data not collected for this timeframe');
            return;
        }

        hideNoData(canvasId);

        // ── Build anchored labels/values ──────────────────────────
        // Start anchor: exact beginning of selected timeframe window
        // End anchor:   right now
        // Both use null so no line draws there, but the x-axis is forced to span the full period.
        const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const windowEnd   = new Date();

        const startLabel = fmtDateLabel(windowStart, days);
        const endLabel   = fmtDateLabel(windowEnd, days);

        const dataLabels = filtered.map(h => fmtLabel(h.timestamp, days));
        const dataValues = filtered.map(h => h.queue_depth);

        const labels = [startLabel, ...dataLabels, endLabel];
        const values = [null,        ...dataValues,  null];
        // Note: event indices already have +1 applied in detectStatusEvents
        // to account for this prepended start anchor.

        const maxVal       = Math.max(...dataValues);
        const suggestedMax = maxVal < 5 ? 5 : Math.ceil(maxVal * 1.2);

        const chartConfig = {
            type: 'line',
            _statusEvents: events,
            data: {
                labels,
                datasets: [{
                    label,
                    data: values,
                    borderColor: color,
                    backgroundColor: color + '1a',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.35,
                    pointRadius: 0,
                    spanGaps: false   // gaps in data stay as visible breaks
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
                            precision: 0,
                            stepSize: 1
                        }
                    }
                }
            }
        };

        CHART_INSTANCES[canvasId] = new Chart(
            document.getElementById(canvasId).getContext('2d'),
            chartConfig
        );

        // Attach events so the plugin can read them
        CHART_INSTANCES[canvasId].config._statusEvents = events;
    }

    // =========================================================
    // 7. QUEUE CHARTS (AWS | Azure | Direct Cloud coming soon)
    // =========================================================
    function renderAllQueueCharts(days) {
        renderQueueChart('awsChart',   'aws-event-bar',   globalAwsHistory,   globalAwsHistory,   days, '#f97316', 'AWS Queue (Tasks)');
        renderQueueChart('azureChart', 'azure-event-bar', globalAzureHistory, globalAzureHistory, days, '#3b82f6', 'Azure Queue (Wait Mins)');
    }

    document.querySelectorAll('#queue-tf button').forEach(btn => {
        btn.addEventListener('click', e => {
            document.querySelectorAll('#queue-tf button').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderAllQueueCharts(parseInt(e.target.getAttribute('data-tf')));
        });
    });

    renderAllQueueCharts(1);

    // =========================================================
    // 8. UPTIME GRIDS  (30d | 90d | 180d | 1Y)
    // =========================================================
    function buildUptimeGrid(gridId, pctId, history, days) {
        const grid = document.getElementById(gridId);
        if (!grid) return;
        grid.innerHTML = '';

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
    }

    document.querySelectorAll('#uptime-tf button').forEach(btn => {
        btn.addEventListener('click', e => {
            document.querySelectorAll('#uptime-tf button').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderUptime(parseInt(e.target.getAttribute('data-tf')));
        });
    });

    renderUptime(30);

    // =========================================================
    // 9. DETAILED 1-WEEK STATUS CHART (stepped)
    // =========================================================
    function renderDetailedStatus() {
        const canvasId = 'detailedStatusChart';

        if (CHART_INSTANCES[canvasId]) {
            CHART_INSTANCES[canvasId].destroy();
            delete CHART_INSTANCES[canvasId];
        }

        const awsData   = filterByDays(globalAwsHistory,   7);
        const azureData = filterByDays(globalAzureHistory, 7);

        if (awsData.length === 0 && azureData.length === 0) {
            showNoData(canvasId, 'No status data in the last 7 days');
            return;
        }

        hideNoData(canvasId);

        // Use whichever dataset has more points for labels
        const baseData = awsData.length >= azureData.length ? awsData : azureData;

        CHART_INSTANCES[canvasId] = new Chart(
            document.getElementById(canvasId).getContext('2d'),
            {
                type: 'line',
                data: {
                    labels: baseData.map(h => fmtLabel(h.timestamp, 7)),
                    datasets: [
                        {
                            label: 'AWS',
                            data: awsData.map(h => h.status === 'ONLINE' ? 1 : 0),
                            borderColor: '#f97316',
                            backgroundColor: 'rgba(249, 115, 22, 0.08)',
                            fill: true,
                            stepped: 'before',
                            borderWidth: 2,
                            pointRadius: 0
                        },
                        {
                            label: 'Azure',
                            data: azureData.map(h => h.status === 'ONLINE' ? 1 : 0),
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
