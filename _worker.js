// --- HELPER FUNCTIONS FOR EDGE RENDERING ---
function formatQueue(depth, provider, status) {
    if (depth === undefined || depth === null) return '--';
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

function createCardHTML(machine) {
    const routes = Object.values(machine.routes);
    const isOnline = routes.some(r => r.status === 'ONLINE');
    const badgeClass = isOnline ? 'status-online' : 'status-offline';
    const dotClass = isOnline ? 'dot-online' : 'dot-offline';
    const statusText = isOnline ? 'ONLINE' : 'OFFLINE';

    const slug = (machine.mfg + '-' + machine.name).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    const routeHtml = ['Direct', 'AWS', 'Azure'].map(r => {
        const rData = machine.routes[r];
        if (!rData) return '';
        
        const rColor = rData.status === 'ONLINE' ? 'var(--online)' : 'var(--muted)';
        const rIcon = r === 'AWS' ? 'fa-cloud' : r === 'Azure' ? 'fa-network-wired' : 'fa-server';
        const iColor = r === 'AWS' ? '#f97316' : r === 'Azure' ? '#3b82f6' : '#a855f7';
        
        return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); gap: 15px; width: 100%;">
            <div style="display: flex; align-items: center; min-width: 0;">
                <div style="width: 24px; text-align: center; flex-shrink: 0; margin-right: 8px;">
                    <i class="fa-solid ${rIcon}" style="color: ${iColor}; font-size: 0.9rem;"></i>
                </div>
                <span style="font-size: 0.85rem; color: var(--muted); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${r}
                </span>
            </div>
            <div style="text-align: right; flex-shrink: 0;">
                <span style="font-size: 0.85rem; font-weight: 600; color: ${rColor}; white-space: nowrap;">
                    ${formatQueue(rData.queue_depth, rData.provider, rData.status)}
                </span>
            </div>
        </div>`;
    }).join('');

    return `
        <div class="card" style="display: flex; flex-direction: column; height: 100%;">
            <div class="card-header" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1rem;">
                <div style="min-width: 0; flex: 1;">
                    <p class="qpu-name" style="margin: 0; font-weight: 700; font-size: 1.1rem; line-height: 1.2;">${machine.name}</p>
                    <p class="qpu-provider" style="margin: 2px 0 0 0; font-size: 0.8rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px;">${machine.mfg}</p>
                </div>
                <div class="status-badge ${badgeClass}" style="flex-shrink: 0;">
                    <div class="dot ${dotClass}"></div> ${statusText}
                </div>
            </div>
            
            <div class="metrics" style="background: rgba(0,0,0,0.15); padding: 0.5rem 1rem; border-radius: 8px; margin-bottom: auto; display: flex; flex-direction: column;">
                ${routeHtml}
            </div>
            
            <div class="time-ago" style="margin-top: 1rem; margin-bottom: 1rem; text-align: right; font-size: 0.75rem; color: var(--muted);">Updated ${timeSince(machine.last_updated)}</div>
            
            ${machine.isSim
              ? `<div class="view-more-btn" style="opacity:0.3; cursor:default; pointer-events:none;">
                    Simulator — No Hardware Metrics
                 </div>`
              : `<a href="${slug}.html" class="view-more-btn">
                    View Hardware Metrics <i class="fa-solid fa-arrow-right"></i>
                 </a>`
            }
        </div>
    `;
}

// --- INJECTOR FOR THE HOMEPAGE GRID ---
class HomePageGridInjector {
    constructor(apiData, targetIsSim) {
        this.apiData = apiData;
        this.targetIsSim = targetIsSim;
    }

    element(element) {
        let targets = {};
        
        // Grouping Logic (Identical to your JS)
        this.apiData.forEach(qpu => {
            let mfg = 'Unknown';
            let route = 'Direct';
            
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
                mfg = 'IonQ'; route = 'Direct';
            }

            let cleanName = qpu.name;
            const isSim = cleanName.includes('(Simulator)') || cleanName.toLowerCase().includes('simulator');
            cleanName = cleanName.replace(' (Simulator)', '').replace('simulator', '');
            if (cleanName.includes('.')) cleanName = cleanName.split('.').pop();
            const regex = new RegExp(`^${mfg}\\s*`, 'i');
            cleanName = cleanName.replace(regex, '').replace(/[-_]/g, ' ').trim();
            cleanName = cleanName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-');

            // Only process if it matches the target (QPU vs Sim)
            if (isSim !== this.targetIsSim) return;

            const key = `${mfg}-${cleanName}`;
            if (!targets[key]) {
                targets[key] = { mfg, name: cleanName, isSim, routes: {}, last_updated: qpu.last_updated };
            }
            targets[key].routes[route] = qpu;
            if (new Date(qpu.last_updated) > new Date(targets[key].last_updated)) {
                targets[key].last_updated = qpu.last_updated;
            }
        });

        // Group by MFG and build HTML
        let finalHtml = '';
        const groups = {};
        Object.values(targets).forEach(machine => {
            if (!groups[machine.mfg]) groups[machine.mfg] = [];
            groups[machine.mfg].push(machine);
        });

        const sortedMfgs = Object.keys(groups).sort();
        sortedMfgs.forEach(mfg => {
            finalHtml += `<h3 class="mfg-title">${mfg}</h3><div class="grid home-layout">`;
            groups[mfg].sort((a, b) => a.name.localeCompare(b.name));
            groups[mfg].forEach(machine => {
                finalHtml += createCardHTML(machine);
            });
            finalHtml += `</div>`;
        });

        element.setInnerContent(finalHtml, { html: true });
    }
}

// --- INJECTOR FOR DEVICE PAGE SEO ---
class SEOTextInjector {
    constructor(apiData, url) {
        this.apiData = apiData;
        this.url = url;
    }

    element(element) {
        let machineName = '';
        let brandName = '';
        let ids = { aws: '', azure: '', direct: '' };

        // ... [Keep your existing machine detection logic here] ...
        if (this.url.includes('ionq-aria-1')) {
            machineName = 'IonQ Aria-1'; brandName = 'IonQ, Inc.';
            ids.aws = 'aws_Aria-1'; ids.azure = 'azure_ionq.qpu.aria-1'; ids.direct = 'ionq_qpu.aria-1';
        } else if (this.url.includes('ionq-forte-1')) {
            machineName = 'IonQ Forte-1'; brandName = 'IonQ, Inc.';
            ids.aws = 'aws_Forte-1'; ids.azure = 'azure_ionq.qpu.forte-1'; ids.direct = 'ionq_qpu.forte-1';
        } else if (this.url.includes('ionq-forte-enterprise')) {
            machineName = 'IonQ Forte Enterprise-1'; brandName = 'IonQ, Inc.';
            ids.aws = 'aws_Forte-Enterprise-1'; ids.azure = 'azure_ionq.qpu.forte-enterprise-1'; ids.direct = 'ionq_qpu.forte-enterprise-1';
        } else if (this.url.includes('rigetti-ankaa-3')) {
            machineName = 'Rigetti Ankaa-3'; brandName = 'Rigetti Computing';
            ids.aws = 'aws_Ankaa-3'; ids.azure = 'azure_rigetti.qpu.ankaa-3';
        } else if (this.url.includes('quera-aquila')) {
            machineName = 'QuEra Aquila'; brandName = 'QuEra Computing';
            ids.aws = 'aws_Aquila';
        } else if (this.url.includes('iqm-garnet')) {
            machineName = 'IQM Garnet'; brandName = 'IQM Quantum Computers';
            ids.aws = 'aws_Garnet';
        } else if (this.url.includes('iqm-emerald')) {
            machineName = 'IQM Emerald'; brandName = 'IQM Quantum Computers';
            ids.aws = 'aws_Emerald';
        } else if (this.url.includes('aqt-ibex-q1')) {
            machineName = 'AQT IBEX Q1'; brandName = 'Alpine Quantum Technologies';
            ids.aws = 'aws_Ibex-Q1';
        } else {
            return;
        }

        const getStatusShort = (sourceName, id) => {
            if (!id) return null;
            const data = this.apiData.find(q => q.id === id);
            if (!data) return null;

            if (data.status !== 'ONLINE') return `${sourceName} (Offline)`;
            
            const metric = data.queue_depth !== undefined 
                ? ` (${data.queue_depth}${sourceName === 'AWS' ? ' tasks' : 'm'})` 
                : '';
            return `<strong>Online</strong> via ${sourceName}${metric}`;
        };

        const statusList = [
            getStatusShort('Direct API', ids.direct),
            getStatusShort('AWS', ids.aws),
            getStatusShort('Azure', ids.azure)
        ].filter(Boolean);

        const joinedStatus = statusList.length > 0 
            ? statusList.join(', ') 
            : 'No live telemetry reported';

        // COMPACT UNIFIED BLOCK
        const html = `
            <div style="font-size: 0.88em; line-height: 1.5;">
                <p style="margin: 0 0 8px 0; color: var(--text);">
                    <span style="font-weight: 700; color: var(--accent); margin-right: 5px;">Live Status:</span>
                    Currently, the <strong>${machineName}</strong> is ${joinedStatus}. 
                    <span style="color: var(--muted); font-size: 0.95em;">Updated real-time for ${brandName} circuit monitoring.</span>
                </p>
                <p style="margin: 0; font-size: 0.8em; color: var(--muted); opacity: 0.8; font-style: italic; border-left: 2px solid var(--border); padding-left: 10px;">
                    QPUStatus is independent. Data from provider APIs may vary from internal states. 
                    Trademarks property of ${brandName}. Not affiliated.
                </p>
            </div>
        `;

        element.setInnerContent(html, { html: true });
    }
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const response = await env.ASSETS.fetch(request);
        const contentType = response.headers.get("content-type");
        
        if (!contentType || !contentType.includes("text/html")) return response;

        try {
            const apiResponse = await fetch('https://api.qpustatus.com/stats', {headers: { 'X-Internal-Key': env.INTERNAL_API_SECRET }});
            const apiData = await apiResponse.json();
            
            let rewriter = new HTMLRewriter();

            // Routing Logic: Apply different injectors based on the URL
            if (url.pathname === '/' || url.pathname === '/index.html') {
                // We are on the homepage -> Inject the Grids
                rewriter.on('div#grid-qpus', new HomePageGridInjector(apiData, false));
                rewriter.on('div#grid-simulators', new HomePageGridInjector(apiData, true));
                
                // Optional: Hide the loader instantly via Edge CSS
                rewriter.on('div#loader', { element(el) { el.setAttribute('style', 'display:none;') }});
            } else {
                // We are on a device page -> Inject the SEO Box
                rewriter.on('div#seo-dynamic-summary', new SEOTextInjector(apiData, request.url));
            }

            return rewriter.transform(response);
            
        } catch (e) {
            return response;
        }
    }
};
