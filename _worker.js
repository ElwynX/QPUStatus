class SEOTextInjector {
    constructor(apiData, url) {
        this.apiData = apiData;
        this.url = url;
    }

    element(element) {
        // 1. Setup Identity Variables
        let machineName = '';
        let brandName = ''; // For the disclaimer
        let ids = {
            aws: '',
            azure: '',
            direct: '' // New field for Direct API
        };

        // 2. Map URL to IDs (Add your specific Direct API IDs here)
        if (this.url.includes('ionq-aria-1')) {
            machineName = 'IonQ Aria-1';
            brandName = 'IonQ, Inc.';
            ids.aws = 'aws_Aria-1';
            ids.azure = 'azure_ionq.qpu.aria-1';
            ids.direct = 'ionq_direct_aria-1'; // Example ID
        } 
        else if (this.url.includes('ionq-forte-1')) {
            machineName = 'IonQ Forte-1';
            brandName = 'IonQ, Inc.';
            ids.aws = 'aws_Forte-1';
            ids.azure = 'azure_ionq.qpu.forte-1';
            ids.direct = 'ionq_direct_forte-1';
        } 
        else if (this.url.includes('rigetti-aspen')) {
            machineName = 'Rigetti Aspen-M-3';
            brandName = 'Rigetti Computing';
            ids.aws = 'aws_Aspen-M-3';
            ids.azure = 'azure_rigetti.sim.qvm'; 
            ids.direct = 'rigetti_qcs_aspen-m-3'; 
        } 
        else {
            return; // Not a hardware page
        }

        // 3. Helper: Generate "Safe" Status Text
        // Returns null if data is missing (so it doesn't show at all),
        // but returns text if it's explicitly ONLINE or OFFLINE.
        const getStatus = (sourceName, id) => {
            const data = this.apiData.find(q => q.id === id);

            // Case A: Data missing? (Coming soon / Not integrated yet) -> Hide it.
            if (!data) return null; 

            // Case B: Explicitly Offline? -> Show it.
            if (data.status !== 'ONLINE') {
                return `currently <strong>offline</strong> via ${sourceName}`;
            }

            // Case C: Online? -> Show details.
            // We check if queue_depth exists to avoid "undefined tasks"
            const metric = data.queue_depth !== undefined 
                ? ` (${data.queue_depth} tasks in queue)` 
                : ``;
            
            return `<strong>online</strong> via ${sourceName}${metric}`;
        };

        // 4. Build the Status List
        // We filter out nulls so "unavailable" sources just vanish from the sentence.
        const statusList = [
            getStatus('Direct API', ids.direct),
            getStatus('AWS', ids.aws),
            getStatus('Azure', ids.azure)
        ].filter(Boolean); // Removes null/undefined entries

        // 5. Construct the Final Sentence
        let contentHtml = '';

        if (statusList.length === 0) {
            // Fallback if ALL sources are missing/null
            contentHtml = `<strong>Status Update:</strong> Live data for ${machineName} is currently unavailable. Please check back later.`;
        } else {
            // Join with commas and "and" for natural reading
            // e.g., "online via AWS, and currently offline via Azure"
            const joinedStatus = statusList.join(', and is ');
            contentHtml = `<strong>Live Status Update:</strong> As of right now, the ${machineName} is ${joinedStatus}.`;
        }

        // 6. Add the Disclaimer (Small, italic, low contrast)
        const disclaimerHtml = `
            <br>
            <span style="font-size: 0.8em; opacity: 0.7; font-style: italic; display: block; margin-top: 8px;">
                * Disclaimer: This is an independent monitoring page. ${machineName} and associated trademarks belong to ${brandName} We are not officially affiliated with the providers listed above.
            </span>
        `;

        // 7. Inject combined content
        element.setInnerContent(contentHtml + disclaimerHtml, { html: true });
    }
}

export default {
    async fetch(request, env) {
        const response = await env.ASSETS.fetch(request);
        const contentType = response.headers.get("content-type");

        if (!contentType || !contentType.includes("text/html")) {
            return response;
        }

        try {
            // Fetch your backend stats
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
