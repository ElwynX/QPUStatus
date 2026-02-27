class SEOTextInjector {
    constructor(apiData, url) {
        this.apiData = apiData;
        this.url = url;
    }

    element(element) {
        let machineName = '';
        let brandName = '';
        let ids = { aws: '', azure: '', direct: '' };

        // ... [Your existing machine detection logic remains the same] ...
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

        const getStatusDetailed = (sourceName, id) => {
            if (!id) return null;
            const data = this.apiData.find(q => q.id === id);
            if (!data) return null;

            if (data.status !== 'ONLINE') {
                return `${sourceName} reports the device is currently <strong>Offline</strong>`;
            }

            // Wordy metric logic
            let metricText = '';
            if (data.queue_depth !== undefined) {
                if (sourceName === 'AWS') {
                    metricText = ` with a workload of <strong>${data.queue_depth} tasks</strong> in the execution queue`;
                } else if (sourceName === 'Azure' || sourceName === 'Direct API') {
                    metricText = ` with an estimated wait time of <strong>${data.queue_depth} minutes</strong>`;
                }
            }

            return `is <strong>Online</strong> via ${sourceName}${metricText}`;
        };

        const statusList = [
            getStatusDetailed('Direct API', ids.direct),
            getStatusDetailed('AWS', ids.aws),
            getStatusDetailed('Azure', ids.azure)
        ].filter(Boolean);

        // --- 1. WORDY LIVE STATUS ---
        let statusHtml = `
            <div style="margin-bottom: 25px;">
                <h3 style="font-size: 1.1em; color: var(--text); margin-bottom: 8px;">Is the ${machineName} online right now?</h3>
                <p style="font-size: 1em; line-height: 1.6; color: var(--text);">
                    According to our latest telemetry data, the <strong>${machineName}</strong> quantum computer ${statusList.length > 0 ? statusList.join(', ') : 'is currently seeing no live reporting across major providers'}. 
                    Uptime tracking for ${brandName} hardware is updated in real-time to help researchers and developers monitor availability for quantum circuit execution.
                </p>
            </div>
        `;

        // --- 2. SEPARATE DISCLAIMER BOX ---
        const noticeHtml = `
            <div style="background: rgba(150, 150, 150, 0.05); border: 1px solid var(--border); border-radius: 8px; padding: 15px; margin-top: 20px;">
                <p style="margin: 0; font-size: 0.82em; color: var(--muted); line-height: 1.5; opacity: 0.9;">
                    <strong>Data Accuracy Notice:</strong> QPUStatus is an independent monitoring project. 
                    Real-time data is aggregated from public provider APIs (AWS Braket, Azure Quantum, ${brandName}) and may vary from internal proprietary hardware states. 
                    The 24-hour availability chart is updated every 3 minutes. Long-term historical rollups (Weekly/Monthly) occur daily at 00:00 UTC. 
                    ${machineName} is a trademark of ${brandName}. We are not officially affiliated with or endorsed by any listed hardware manufacturer.
                </p>
            </div>
        `;

        element.setInnerContent(statusHtml + noticeHtml, { html: true });
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
