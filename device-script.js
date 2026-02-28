document.addEventListener('DOMContentLoaded', async () => {

    // ── 0. THEME & TABS LOGIC ────────────────────────────────
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
        Object.values(CHART_INSTANCES).forEach(c => c.update()); 
    });

    const tabs = document.querySelectorAll('#tab-menu li');
    const panes = document.querySelectorAll('.tab-pane');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.getAttribute('data-target')).classList.add('active');

            const contentArea = document.querySelector('.content-area');
            const heroHeight = document.querySelector('.hero-section').offsetHeight;
            if (window.scrollY < heroHeight) {
                contentArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    // ── 1. SETUP & DATA FETCHING ─────────────────────────────
    const mainContent = document.querySelector('.device-page');
    const awsId    = mainContent.getAttribute('data-aws-id');
    const azureId  = mainContent.getAttribute('data-azure-id');
    const directId = mainContent.getAttribute('data-direct-id');
    const API      = 'https://api.qpustatus.com';
    let CHART_INSTANCES = {};

    // ── 2. EXACT EVENT FETCHING ──────────────────────────────
    let exactEvents = { aws: {}, azure: {}, direct: {} };
    let firstSeenAws = null, firstSeenAzure = null, firstSeenDirect = null;

    async function fetchExactEvents() {
        try {
            const safeFetch = (id) => id ? fetch(`${API}/events?id=${id}`) : Promise.resolve({ json: () => [] });
            const [awsRes, azRes, dirRes] = await Promise.all([
                safeFetch(awsId),
                safeFetch(azureId),
                safeFetch(directId)
            ]);
            const awsD = await awsRes.json();
            const azD  = await azRes.json();
            const dirD = await dirRes.json();
            
            if (awsD.length > 0) exactEvents.aws = awsD[0];
            if (azD.length > 0) exactEvents.azure = azD[0];
            if (dirD.length > 0) exactEvents.direct = dirD[0];

            if (exactEvents.aws?.first_seen) firstSeenAws = { timestamp: exactEvents.aws.first_seen };
            if (exactEvents.azure?.first_seen) firstSeenAzure = { timestamp: exactEvents.azure.first_seen };
            if (exactEvents.direct?.first_seen) firstSeenDirect = { timestamp: exactEvents.direct.first_seen };
        } catch (e) { console.error('Exact Events fetch failed:', e); }
    }

    // ── 3. HERO STATS UPDATER ────────────────────────────────
    async function updateHeroStats() {
        try {
            const res  = await fetch(`${API}/stats`);
            const data = await res.json();
            
            const awsLive    = awsId ? data.find(q => q.id === awsId) : null;
            const azureLive  = azureId ? data.find(q => q.id === azureId) : null;
            const directLive = directId ? data.find(q => q.id === directId) : null;

            const fmtExactDate = (ts) => ts ? new Date(ts.replace(' ', 'T') + 'Z').toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : 'Never';

            function updateProviderCard(liveData, exactData, prefix) {
                const statBadge = document.getElementById(`${prefix}-status`);
                const queueEl   = document.getElementById(`${prefix}-queue`);
                const lastSeenEl = document.getElementById(`${prefix}-last-seen`);
                const cardEl    = document.getElementById(`card-${prefix}`);
                const groupEl   = document.getElementById(`group-${prefix}`);

                if (!statBadge) return; 

                if (!liveData) {
                    queueEl.innerHTML = '--';
                    statBadge.className = 'status-badge status-offline';
                    statBadge.innerHTML = '<div class="dot dot-offline"></div> N/A';
                    if(lastSeenEl) lastSeenEl.innerHTML = 'Route not available';
                    if(cardEl) { cardEl.style.opacity = '0.4'; cardEl.style.order = '99'; }
                    if(groupEl) { groupEl.style.display = 'none'; }
                    return;
                }

                if(cardEl) { cardEl.style.opacity = '1'; cardEl.style.order = (prefix === 'direct' ? '1' : prefix === 'aws' ? '2' : '3'); }
                if(groupEl) { groupEl.style.display = 'block'; groupEl.style.order = (prefix === 'direct' ? '1' : prefix === 'aws' ? '2' : '3'); }

                const isOnline = liveData.status === 'ONLINE';
                statBadge.className = `status-badge ${isOnline ? 'status-online' : 'status-offline'}`;
                statBadge.innerHTML = `<div class="dot ${isOnline ? 'dot-online' : 'dot-offline'}"></div> ${liveData.status}`;
                queueEl.innerHTML = (liveData.queue_depth != null) ? liveData.queue_depth : '--';

                if (exactData) {
                    const lastImportantDate = isOnline 
                        ? `Last offline: ${fmtExactDate(exactData.last_offline)}` 
                        : `Last online: ${fmtExactDate(exactData.last_online)}`;
                    lastSeenEl.innerHTML = lastImportantDate;
                } else {
                    lastSeenEl.innerHTML = 'Awaiting telemetry...';
                }
            }

            updateProviderCard(directLive, exactEvents.direct, 'direct');
            updateProviderCard(awsLive, exactEvents.aws, 'aws');
            updateProviderCard(azureLive, exactEvents.azure, 'azure');

        } catch (e) { console.error('Hero stats fetch failed:', e); }
    }

    await fetchExactEvents();
    await updateHeroStats();
    setInterval(updateHeroStats, 60000);

    // ── 4. HISTORY CACHE & FETCHING ──────────────────────────
    const historyCache = {};
    const uptimeCache  = {};

    async function fetchUptime(days) {
        if (uptimeCache[days]) return uptimeCache[days];
        try {
            const safeUptimeFetch = (id) => id
                ? fetch(`${API}/uptime?id=${id}&days=${days}`)
                : Promise.resolve({ json: () => [] });
            const [awsRes, azRes, dirRes] = await Promise.all([
                safeUptimeFetch(awsId),
                safeUptimeFetch(azureId),
                safeUptimeFetch(directId)
            ]);
            const result = {
                aws:    await awsRes.json(),
                azure:  await azRes.json(),
                direct: await dirRes.json()
            };
            uptimeCache[days] = result;
            return result;
        } catch(e) {
            console.error('Uptime fetch failed days=' + days, e);
            return { aws: [], azure: [], direct: [] };
        }
    }

    async function fetchHistory(days) {
        if (historyCache[days]) return historyCache[days];
        try {
            const safeHistFetch = (id) => id ? fetch(`${API}/history?id=${id}&days=${days}`) : Promise.resolve({ json: () => [] });
            const [awsRes, azRes, dirRes] = await Promise.all([
                safeHistFetch(awsId),
                safeHistFetch(azureId),
                safeHistFetch(directId)
            ]);
            const result = { 
                aws: await awsRes.json(), 
                azure: await azRes.json(),
                direct: await dirRes.json() 
            };
            historyCache[days] = result;
            return result;
        } catch (e) {
            console.error('History fetch failed days=' + days, e);
            return { aws: [], azure: [], direct: [] };
        }
    }

    await fetchHistory(1);

    // ── 5. UTILS & HELPERS ───────────────────────────────────
    function fmtDate(d, days) {
        if (days <= 1)  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (days <= 30) return d.toLocaleString([],    { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' });
    }
    function fmtTs(ts, days) { return fmtDate(new Date(ts.replace(' ','T')+'Z'), days); }

    function showNoData(canvasId, msg) {
        msg = msg || 'Data not collected';
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        canvas.style.display = 'none';
        let ov = document.getElementById(canvasId + '-overlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = canvasId + '-overlay';
            ov.style.cssText = 'display:flex;align-items:center;justify-content:center;height:140px;border-radius:8px;background:var(--panel,#1e293b);color:var(--muted,#64748b);font-size:0.85rem;border:1px solid var(--border,#334155);';
            canvas.parentNode.insertBefore(ov, canvas.nextSibling);
        }
        ov.innerText = msg;
        ov.style.display = 'flex';
    }
    function hideNoData(canvasId) {
        var c = document.getElementById(canvasId); if (c) c.style.display = 'block';
        var o = document.getElementById(canvasId+'-overlay'); if (o) o.style.display = 'none';
    }

    // ── 6. EVENT DETECTION & PLUGINS ─────────────────────────
    function detectStatusEvents(windowData, firstSeenRecord, days) {
        var events = [];
        var windowStartMs = Date.now() - days * 86400000;
        // For 1W / 1M / 1Y, data is aggregated into hourly/daily majority-vote buckets.
        // A bucket flip (ONLINE→OFFLINE) reflects statistical noise in the bucket, not a
        // real transition event. Only first_seen is meaningful at these resolutions.
        var suppressTransitions = days > 1;

        if (firstSeenRecord) {
            var firstMs = new Date(firstSeenRecord.timestamp.replace(' ','T')+'Z').getTime();
            var lastWindowMs = windowData.length > 0
                ? new Date(windowData[windowData.length-1].timestamp.replace(' ','T')+'Z').getTime()
                : 0;
            var inWindow = firstMs >= windowStartMs && firstMs <= lastWindowMs && windowData.length > 0;
            events.push({ index: inWindow ? 1 : -1, status: firstSeenRecord.status,
                timestamp: firstSeenRecord.timestamp, isFirst: true, inWindow: inWindow });
        }

        if (!suppressTransitions) {
            for (var i = 1; i < windowData.length; i++) {
                if (windowData[i].status !== windowData[i-1].status) {
                    events.push({ index: i+1, status: windowData[i].status,
                        timestamp: windowData[i].timestamp, isFirst: false, inWindow: true });
                }
            }
        }
        return events;
    }

    function drawRoundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
        ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
        ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
        ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
    }

    function drawCallout(ctx, cx, tipY, label, icon, bgColor, glowColor) {
        var PAD=7, R=4, PTR=6;
        ctx.font='bold 10px sans-serif'; var lw=ctx.measureText(label).width;
        ctx.font='900 11px "Font Awesome 6 Free"'; var iw=ctx.measureText(icon).width+4;
        var tw=iw+lw+PAD*2, bh=18, bx=cx-tw/2, by=tipY-bh-PTR;
        ctx.shadowColor=glowColor; ctx.shadowBlur=10;
        ctx.fillStyle=bgColor; drawRoundRect(ctx,bx,by,tw,bh,R); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx-PTR*0.7,by+bh); ctx.lineTo(cx+PTR*0.7,by+bh); ctx.lineTo(cx,by+bh+PTR); ctx.closePath(); ctx.fill();
        ctx.shadowBlur=0; ctx.fillStyle='#fff'; ctx.textAlign='left'; ctx.textBaseline='middle';
        ctx.font='900 11px "Font Awesome 6 Free"'; ctx.fillText(icon,bx+PAD,by+bh/2);
        ctx.font='bold 10px sans-serif'; ctx.fillText(label,bx+PAD+iw,by+bh/2);
    }

    var statusEventPlugin = {
        id: 'statusEvents',
        afterDraw: function(chart) {
            var events = chart.config._statusEvents;
            if (!events || !events.length) return;
            var ctx = chart.ctx, ca = chart.chartArea;
            var meta = chart.getDatasetMeta(0);
            events.forEach(function(ev) {
                if (!ev.inWindow || ev.index < 0) return;
                var pt = meta.data[ev.index]; if (!pt) return;
                var xPos = pt.x;
                if (xPos < ca.left || xPos > ca.right) return;
                var isOnline = ev.status === 'ONLINE';
                var lc = ev.isFirst ? '#94a3b8' : (isOnline ? '#10b981' : '#ef4444');
                var bg = ev.isFirst ? '#475569' : (isOnline ? '#059669' : '#dc2626');
                var gw = ev.isFirst ? '#94a3b8' : (isOnline ? '#10b981' : '#ef4444');
                var icon  = ev.isFirst ? '\uf0e7' : (isOnline ? '\uf062' : '\uf063');
                var label = ev.isFirst ? 'First Tracked' : (isOnline ? 'ONLINE' : 'OFFLINE');
                ctx.save();
                ctx.shadowColor=gw; ctx.shadowBlur=8; ctx.setLineDash([4,4]);
                ctx.strokeStyle=lc; ctx.lineWidth=1.5; ctx.globalAlpha=0.85;
                ctx.beginPath(); ctx.moveTo(xPos,ca.top+30); ctx.lineTo(xPos,ca.bottom); ctx.stroke();
                ctx.globalAlpha=1; ctx.setLineDash([]);
                drawCallout(ctx, xPos, ca.top+30, label, icon, bg, gw);
                ctx.restore();
            });
        }
    };
    Chart.register(statusEventPlugin);

    function renderEventBar(barId, events, days) {
        var bar = document.getElementById(barId); if (!bar) return;
        bar.innerHTML = '';
        // For aggregated views, explain that full event log is on 24H
        if (days > 1) {
            var note = document.createElement('span');
            note.style.cssText = 'color:var(--muted,#64748b);font-size:0.78rem;font-style:italic;';
            note.innerText = 'Status transition events shown on 24H view — aggregated data at this resolution may contain bucket noise.';
            // Still show first_seen chip if present
            var firstEv = events.find(function(e){ return e.isFirst; });
            if (firstEv) {
                bar.appendChild(note);
                bar.innerHTML += ' ';
                events = [firstEv]; // only render first_seen chip below
            } else {
                bar.appendChild(note);
                return;
            }
        }
        if (!events.length) { bar.innerHTML='<span style="color:var(--muted,#64748b);font-size:0.78rem;">No events recorded</span>'; return; }
        events.forEach(function(ev) {
            var isOnline = ev.status==='ONLINE', outOfWin = ev.isFirst && !ev.inWindow;
            var chip = document.createElement('div');
            chip.style.cssText = 'display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;white-space:nowrap;cursor:default;'
                + 'background:' + (isOnline?'rgba(16,185,129,0.15)':'rgba(239,68,68,0.15)') + ';'
                + 'border:1px solid ' + (isOnline?'#10b981':'#ef4444') + ';'
                + 'color:' + (isOnline?'#10b981':'#ef4444') + ';'
                + (outOfWin?'opacity:0.55;':'');
            var dot = '<span style="width:6px;height:6px;border-radius:50%;background:'+(isOnline?'#10b981':'#ef4444')+';display:inline-block;flex-shrink:0;"></span>';
            var d = new Date(ev.timestamp.replace(' ','T')+'Z');
            var timeStr = ev.isFirst
                ? d.toLocaleString([],{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'})
                : (days<=1 ? d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})
                           : d.toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}));
            var evLabel = ev.isFirst ? 'First Seen \u00b7 '+ev.status : (isOnline?'\u25b2 ONLINE':'\u25bc OFFLINE');
            chip.title = ev.timestamp+' UTC'+(outOfWin?'\n(before current window)':'');
            chip.innerHTML = dot+' '+evLabel+' <span style="opacity:0.6;font-weight:400;">'+timeStr+'</span>';
            bar.appendChild(chip);
        });
    }

    // ── 7. CHART DRAWING ─────────────────────────────────────
    // yLabel: unit-specific description shown on the Y axis per provider type
    function renderQueueChart(canvasId, eventBarId, windowData, firstSeenRecord, days, color, label, yLabel) {
        if (CHART_INSTANCES[canvasId]) { CHART_INSTANCES[canvasId].destroy(); delete CHART_INSTANCES[canvasId]; }
        
        var events = detectStatusEvents(windowData, firstSeenRecord, days);
        if (eventBarId) renderEventBar(eventBarId, events, days);

        if (!windowData.length) { showNoData(canvasId, 'No data collected for this timeframe'); return; }
        hideNoData(canvasId);

        var wStart = new Date(Date.now() - days*86400000);
        var wEnd   = new Date();
        var dataLabels = windowData.map(function(h){ return fmtTs(h.timestamp,days); });
        var dataValues = windowData.map(function(h){ return h.queue_depth; });
        var labels = [fmtDate(wStart,days)].concat(dataLabels).concat([fmtDate(wEnd,days)]);
        var lastVal = dataValues.length ? dataValues[dataValues.length - 1] : null;
        var values = [null].concat(dataValues).concat([lastVal]);

        var maxVal = dataValues.length ? Math.max.apply(null,dataValues) : 0;
        var sugMax = maxVal < 5 ? 5 : Math.ceil(maxVal*1.2);

        var axisStyle = { color: '#64748b', font: { size: 11 } };

        var cfg = {
            type: 'line',
            _statusEvents: events,
            data: { labels: labels, datasets: [{ label:label, data:values,
                borderColor:color, backgroundColor:color+'1a',
                borderWidth:2, fill:true, tension:0.35, pointRadius:0, spanGaps:false }] },
            options: {
                responsive:true, maintainAspectRatio:false,
                interaction:{mode:'index',intersect:false},
                plugins:{legend:{display:false}},
                scales:{
                    x:{
                        grid:{color:'#334155'},
                        ticks:{maxTicksLimit: window.innerWidth < 768 ? 4 : 8, color:'#94a3b8'},
                        title:{ display:true, text:'Date / Time', ...axisStyle }
                    },
                    y:{
                        beginAtZero:true, suggestedMax:sugMax,
                        grid:{color:'#334155'},
                        ticks:{color:'#94a3b8',precision:0,stepSize:1},
                        title:{ display:true, text: yLabel || label, ...axisStyle }
                    }
                }
            }
        };
        CHART_INSTANCES[canvasId] = new Chart(document.getElementById(canvasId).getContext('2d'), cfg);
        CHART_INSTANCES[canvasId].config._statusEvents = events;
    }

    async function renderAllQueueCharts(days) {
        showNoData('directChart', 'Loading...');
        showNoData('awsChart',    'Loading...');
        showNoData('azureChart',  'Loading...');
        
        var h = await fetchHistory(days);
        // Third argument after color is the Y axis label — unit-specific per provider
        renderQueueChart('directChart', 'direct-event-bar', h.direct, firstSeenDirect, days, '#a855f7', 'Direct Queue (Wait Mins)', 'Avg Queue Age (min)');
        renderQueueChart('awsChart',    'aws-event-bar',    h.aws,    firstSeenAws,    days, '#f97316', 'AWS Queue (Tasks)',        'Jobs Pending');
        renderQueueChart('azureChart',  'azure-event-bar',  h.azure,  firstSeenAzure,  days, '#3b82f6', 'Azure Queue (Wait Mins)',  'Est. Wait (min)');
    }

    document.querySelectorAll('#queue-tf button').forEach(function(btn) {
        btn.addEventListener('click', async function(e) {
            document.querySelectorAll('#queue-tf button').forEach(function(b){b.classList.remove('active');});
            e.target.classList.add('active');
            await renderAllQueueCharts(parseInt(e.target.getAttribute('data-tf')));
        });
    });
    await renderAllQueueCharts(1);

    // ── 8. UPTIME GRIDS ──────────────────────────────────────
    // buildUptimeGrid uses minute-level data from /uptime (qpu_daily_stats).
    // dailyStats: array of { date, online_minutes, offline_minutes, total_minutes }
    // Today's block always shows as "collecting data" (striped) and is EXCLUDED from the %.
    // % = sum(online_minutes) / sum(total_minutes) for completed days only.
    function buildUptimeGrid(gridId, pctId, dailyStats, days) {
        var grid = document.getElementById(gridId); if (!grid) return;
        grid.innerHTML = '';

        // Build fast lookup by date string
        var statsMap = {};
        dailyStats.forEach(function(s) { statsMap[s.date] = s; });

        var todayKey     = new Date().toISOString().slice(0, 10);
        var totalOnlineM = 0, totalTrackedM = 0;

        for (var i = days - 1; i >= 0; i--) {
            var d = new Date(); d.setUTCDate(d.getUTCDate() - i);
            var key   = d.toISOString().slice(0, 10);
            var block = document.createElement('div');
            block.className = 'uptime-block';

            if (key === todayKey) {
                // Present day — always striped "collecting data", partial stats in tooltip
                block.style.background = 'repeating-linear-gradient(45deg,#1e3a5f,#1e3a5f 4px,#1e293b 4px,#1e293b 8px)';
                var ts = statsMap[key];
                if (ts && ts.total_minutes > 0) {
                    var pctToday = (ts.online_minutes / ts.total_minutes * 100).toFixed(1);
                    var onH  = (ts.online_minutes  / 60).toFixed(1);
                    var offH = (ts.offline_minutes / 60).toFixed(1);
                    block.title = key + ': Collecting data… ' + pctToday + '% online so far ('
                        + onH + 'h online, ' + offH + 'h offline tracked today)';
                } else {
                    block.title = key + ': Collecting data…';
                }
                // Today intentionally excluded from overall % calculation

            } else if (statsMap[key]) {
                var s    = statsMap[key];
                var pct  = s.total_minutes > 0 ? s.online_minutes / s.total_minutes : 0;
                var onH  = (s.online_minutes  / 60).toFixed(1);
                var offH = (s.offline_minutes / 60).toFixed(1);
                totalOnlineM  += s.online_minutes;
                totalTrackedM += s.total_minutes;

                if (pct >= 0.5) {
                    block.classList.add('online');
                    block.title = key + ': ' + (pct * 100).toFixed(1) + '% online — '
                        + onH + 'h online, ' + offH + 'h offline';
                } else {
                    block.classList.add('down');
                    block.title = key + ': ' + (pct * 100).toFixed(1) + '% — Degraded/Offline — '
                        + onH + 'h online, ' + offH + 'h offline';
                }
            } else {
                block.style.background = 'var(--border,#334155)';
                block.title = key + ': No data collected';
            }
            grid.appendChild(block);
        }

        var pctEl = document.getElementById(pctId);
        if (pctEl) {
            pctEl.innerText = totalTrackedM > 0
                ? ((totalOnlineM / totalTrackedM) * 100).toFixed(2) + '%'
                : 'No Data';
        }
    }

    async function renderUptime(days) {
        var sl = document.getElementById('uptime-start-label');
        if (sl) sl.innerText = days >= 365 ? '1 year ago' : days + ' days ago';
        // Use /uptime for minute-level accuracy (qpu_daily_stats).
        // Falls back to empty arrays if table not yet migrated.
        var u = await fetchUptime(days);
        buildUptimeGrid('direct-uptime-grid', 'direct-uptime-pct', u.direct, days);
        buildUptimeGrid('aws-uptime-grid',    'aws-uptime-pct',    u.aws,    days);
        buildUptimeGrid('azure-uptime-grid',  'azure-uptime-pct',  u.azure,  days);
    }

    document.querySelectorAll('#uptime-tf button').forEach(function(btn) {
        btn.addEventListener('click', async function(e) {
            document.querySelectorAll('#uptime-tf button').forEach(function(b){b.classList.remove('active');});
            e.target.classList.add('active');
            await renderUptime(parseInt(e.target.getAttribute('data-tf')));
        });
    });
    await renderUptime(30);

    // ── 9. DETAILED 7-DAY STATUS CHART ───────────────────────
    // FIX: Build a unified sorted timestamp set from all three datasets so
    // each dataset's data points land on the correct x-axis position.
    // Previously, the chart used only the longest dataset's timestamps as
    // labels, causing shorter datasets to cluster on the left side of the
    // chart because Chart.js maps by array index, not by value.
    async function renderDetailedStatus() {
        var canvasId = 'detailedStatusChart';
        if (CHART_INSTANCES[canvasId]) { CHART_INSTANCES[canvasId].destroy(); delete CHART_INSTANCES[canvasId]; }
        
        var h = await fetchHistory(7);
        var awsData = h.aws, azureData = h.azure, directData = h.direct;
        
        if (!awsData.length && !azureData.length && !directData.length) { 
            showNoData(canvasId, 'No status data in the last 7 days'); return; 
        }
        hideNoData(canvasId);

        // 1. Collect every unique timestamp from all three providers
        var tsSet = new Set();
        awsData.forEach(function(d) { tsSet.add(d.timestamp); });
        azureData.forEach(function(d) { tsSet.add(d.timestamp); });
        directData.forEach(function(d) { tsSet.add(d.timestamp); });

        // 2. Sort them chronologically to form the shared x-axis
        var allTimestamps = Array.from(tsSet).sort();

        // 3. Build lookup maps: timestamp -> 1 (ONLINE) | 0 (OFFLINE)
        function buildStatusMap(data) {
            var m = {};
            data.forEach(function(d) { m[d.timestamp] = d.status === 'ONLINE' ? 1 : 0; });
            return m;
        }
        var awsMap   = buildStatusMap(awsData);
        var azMap    = buildStatusMap(azureData);
        var dirMap   = buildStatusMap(directData);

        // 4. Map each provider's value against the unified timeline.
        //    null = no data at that timestamp (spanGaps:false will leave gaps).
        var awsValues = allTimestamps.map(function(ts) { return ts in awsMap ? awsMap[ts] : null; });
        var azValues  = allTimestamps.map(function(ts) { return ts in azMap  ? azMap[ts]  : null; });
        var dirValues = allTimestamps.map(function(ts) { return ts in dirMap ? dirMap[ts] : null; });
        var labels    = allTimestamps.map(function(ts) { return fmtTs(ts, 7); });

        CHART_INSTANCES[canvasId] = new Chart(document.getElementById(canvasId).getContext('2d'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Direct', data: dirValues,
                      borderColor: '#a855f7', backgroundColor: 'rgba(168,85,247,0.08)',
                      fill: true, stepped: 'before', borderWidth: 2, pointRadius: 0, spanGaps: false },
                    { label: 'AWS',    data: awsValues,
                      borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.08)',
                      fill: true, stepped: 'before', borderWidth: 2, pointRadius: 0, spanGaps: false },
                    { label: 'Azure',  data: azValues,
                      borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.08)',
                      fill: true, stepped: 'before', borderWidth: 2, pointRadius: 0, spanGaps: false }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: true, labels: { color: '#94a3b8' } },
                    tooltip: { callbacks: { label: function(ctx) {
                        if (ctx.raw === null) return ctx.dataset.label + ': No data';
                        return ctx.dataset.label + ': ' + (ctx.raw === 1 ? 'ONLINE' : 'OFFLINE');
                    }}}
                },
                scales: {
                    x: { ticks: { maxTicksLimit: 7, color: '#94a3b8' }, grid: { color: '#334155' },
                         title: { display: true, text: 'Date / Time', color: '#64748b', font: { size: 11 } } },
                    y: { min: -0.15, max: 1.2,
                         // Force exactly two ticks — OFFLINE at 0, ONLINE at 1.
                         // Without this, Chart.js sometimes skips the 0 tick when
                         // all data is ONLINE, making OFFLINE disappear from the axis.
                         afterBuildTicks: function(axis) { axis.ticks = [{ value: 0 }, { value: 1 }]; },
                         ticks: { stepSize: 1, color: '#94a3b8', callback: function(v) {
                             return v === 1 ? 'ONLINE' : v === 0 ? 'OFFLINE' : '';
                         }},
                         grid: { color: '#334155' }
                    }
                }
            }
        });
    }
    await renderDetailedStatus();

});
