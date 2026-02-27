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
            <div style="border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); margin: 10px 0; font-size: 0.88em; line-height: 1.5;">
                <p style="margin: 0 0 8px 0; color: var(--text);">
                    <span style="font-weight: 700; color: var(--accent); margin-right: 5px;">Live Status:</span>
                    Currently, the <strong>${machineName}</strong> ${joinedStatus}. 
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
        const response = await env.ASSETS.fetch(request);
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("text/html")) return response;

        try {
            const apiResponse = await fetch('https://api.qpustatus.com/stats');
            const apiData = await apiResponse.json();
            return new HTMLRewriter()
                .on('p#seo-dynamic-summary', new SEOTextInjector(apiData, request.url))
                .transform(response);
        } catch (e) {
            return response;
        }
    }
};
