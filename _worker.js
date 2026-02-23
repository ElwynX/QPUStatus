class SEOTextInjector {
    constructor(apiData, url) {
        this.apiData = apiData;
        this.url = url;
    }

    element(element) {
        // 1. Figure out which page we are on based on the URL
        let awsId = '';
        let azureId = '';
        let machineName = '';

        if (this.url.includes('ionq-aria-1')) {
            awsId = 'aws_Aria-1';
            azureId = 'azure_ionq.qpu.aria-1';
            machineName = 'IonQ Aria-1';
        } else if (this.url.includes('ionq-forte-1')) {
            awsId = 'aws_Forte-1';
            azureId = 'azure_ionq.qpu.forte-1';
            machineName = 'IonQ Forte-1';
        } else if (this.url.includes('rigetti-aspen')) {
            awsId = 'aws_Aspen-M-3';
            azureId = 'azure_rigetti.sim.qvm'; // Update this to your actual Rigetti ID
            machineName = 'Rigetti Aspen-M-3';
        } else {
            return; // If it's not a hardware page, do nothing.
        }

        // 2. Find the live data for this specific machine
        const awsData = this.apiData.find(q => q.id === awsId);
        const azureData = this.apiData.find(q => q.id === azureId);

        let awsText = "unavailable on AWS";
        if (awsData) {
            awsText = awsData.status === 'ONLINE' 
                ? `online via AWS with a current queue depth of ${awsData.queue_depth} tasks`
                : `currently offline via AWS`;
        }

        let azureText = "unavailable on Azure";
        if (azureData) {
            azureText = azureData.status === 'ONLINE'
                ? `online via Azure with an estimated wait time of ${azureData.queue_depth} minutes`
                : `offline via Azure`;
        }

        // 3. Inject the sentence!
        const seoSentence = `<strong>Live Status Update:</strong> As of right now, the ${machineName} quantum computer is ${awsText}, and is ${azureText}. Track historical uptime and network latency below.`;
        element.setInnerContent(seoSentence, { html: true });
    }
}

export default {
    async fetch(request, env) {
        // 1. Fetch the static asset (HTML, CSS, JS) from your GitHub/Pages build
        const response = await env.ASSETS.fetch(request);

        // 2. If it's NOT an HTML file, just pass it through instantly (don't waste time)
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("text/html")) {
            return response;
        }

        try {
            // 3. Fetch the live stats from your backend (cached and lightning fast)
            const apiResponse = await fetch('https://api.qpustatus.com/stats');
            const apiData = await apiResponse.json();

            // 4. Transform the HTML on the fly!
            return new HTMLRewriter()
                .on('p#seo-dynamic-summary', new SEOTextInjector(apiData, request.url))
                .transform(response);
                
        } catch (e) {
            // If the API fails for some reason, just return the normal HTML so the site doesn't break
            return response; 
        }
    }
};
