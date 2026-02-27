class SEOTextInjector {
    constructor(apiData, url) {
        this.apiData = apiData;
        this.url = url;
    }

    element(element) {
        let machineName = '';
        let brandName = '';
        let ids = { aws: '', azure: '', direct: '' };

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

        const getStatus = (sourceName, id) => {
            if (!id) return null;
            const data = this.apiData.find(q => q.id === id);
            if (!data) return null;
            if (data.status !== 'ONLINE') return `currently <strong>offline</strong> via ${sourceName}`;
            const metric = data.queue_depth !== undefined ? ` (${data.queue_depth} tasks in queue)` : '';
            return `<strong>online</strong> via ${sourceName}${metric}`;
        };

        const statusList = [
            getStatus('Direct API', ids.direct),
            getStatus('AWS', ids.aws),
            getStatus('Azure', ids.azure)
        ].filter(Boolean);

        let statusHtml = '';
        if (statusList.length === 0) {
            statusHtml = `<strong>Status Update:</strong> Live data for ${machineName} is currently unavailable. Please check back later.`;
        } else {
            const joinedStatus = statusList.join(', and is ');
            statusHtml = `<strong>Live Status:</strong> The ${machineName} is ${joinedStatus}.`;
        }

        const noticeHtml = `
            <span style="display: block; margin-top: 10px; font-size: 0.78em; color: var(--muted); line-height: 1.6; opacity: 0.85;">
                QPUStatus is an independent project. Data is sourced from publicly available provider APIs and may not always reflect the true internal hardware state.
                The 24H chart updates every 3 minutes. Weekly, monthly, and yearly charts roll up once daily at 00:00 UTC due to the resource constraints of running this as a free project.
                ${machineName} and associated trademarks are the property of ${brandName}. We are not affiliated with or endorsed by any hardware provider listed on this site.
            </span>
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
