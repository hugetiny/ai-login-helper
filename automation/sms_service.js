const axios = require('axios'); // You might need to install axios: npm install axios
const cheerio = require('cheerio'); // npm install cheerio

/**
 * Abstract base class for SMS services
 */
class SmsService {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }

    /**
     * Request a phone number for a specific service/country
     * @param {string} serviceCode - The service code (e.g., 'tg' for Telegram, 'wa' for WhatsApp, or specific site code)
     * @param {string} country - Country code
     * @returns {Promise<{id: string, number: string}>}
     */
    async getNumber(serviceCode, country) {
        throw new Error('Not implemented');
    }

    /**
     * Wait for SMS code
     * @param {string} id - The activation ID returned by getNumber
     * @returns {Promise<string>} - The SMS code
     */
    async getCode(id) {
        throw new Error('Not implemented');
    }

    /**
     * Cancel activation or mark as finished
     * @param {string} id
     */
    async setStatus(id, status) {
        throw new Error('Not implemented');
    }
}

/**
 * Mock SMS Service for testing without spending money
 */
class MockSmsService extends SmsService {
    async getNumber(serviceCode, country) {
        console.log(`[MockSMS] Requesting number for ${serviceCode} in ${country}...`);
        await new Promise(r => setTimeout(r, 1000));
        return {
            id: 'mock_id_' + Date.now(),
            number: '+1234567890' // Example number
        };
    }

    async getCode(id) {
        console.log(`[MockSMS] Waiting for code for id ${id}...`);
        // Simulate waiting time
        await new Promise(r => setTimeout(r, 5000));
        const code = '123456';
        console.log(`[MockSMS] Received code: ${code}`);
        return code;
    }

    async setStatus(id, status) {
        console.log(`[MockSMS] Setting status for ${id} to ${status}`);
    }
}

/**
 * Implementation for 5sim.net (Example)
 * Docs: https://5sim.net/docs
 */
class FiveSimService extends SmsService {
    constructor(apiKey) {
        super(apiKey);
        this.baseUrl = 'https://5sim.net/v1';
        this.headers = {
            'Authorization': 'Bearer ' + apiKey,
            'Accept': 'application/json'
        };
    }

    async getNumber(product, country = 'usa', operator = 'any') {
        // GET /user/buy/activation/{country}/{operator}/{product}
        try {
            const url = `${this.baseUrl}/user/buy/activation/${country}/${operator}/${product}`;
            const response = await axios.get(url, { headers: this.headers });
            // Response: { id: 123, phone: '+123...', ... }
            return {
                id: response.data.id,
                number: response.data.phone
            };
        } catch (error) {
            console.error('5sim getNumber error:', error.response ? error.response.data : error.message);
            throw error;
        }
    }

    async getCode(id) {
        // Poll for code
        const maxRetries = 60; // 5 minutes if 5s interval
        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await axios.get(`${this.baseUrl}/user/check/${id}`, { headers: this.headers });
                // Response: { status: 'RECEIVED', sms: [{code: '12345'}], ... }
                if (response.data.sms && response.data.sms.length > 0) {
                    return response.data.sms[0].code;
                }
                if (response.data.status === 'CANCELED' || response.data.status === 'TIMEOUT') {
                    throw new Error('Activation canceled or timed out');
                }
            } catch (e) {
                // Ignore network errors during polling
            }
            await new Promise(r => setTimeout(r, 5000));
        }
        throw new Error('Timeout waiting for SMS');
    }
}

/**
 * Implementation for receive-smss.com (Crawler)
 */
class FreeReceiveSmssService extends SmsService {
    constructor() {
        super(null);
        this.baseUrl = 'https://receive-smss.com';
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }

    async getNumber(serviceCode, country = 'any') {
        // If serviceCode is a URL, use it directly (Hack for testing specific number)
        if (serviceCode.startsWith('http')) {
            console.log(`[FreeSMS] Using fixed URL: ${serviceCode}`);
            // Extract number from URL if possible, or just return a placeholder
            // URL: https://receive-smss.com/sms/31620185296/
            const match = serviceCode.match(/\/sms\/(\d+)\/?/);
            const number = match ? '+' + match[1] : 'UNKNOWN';
            return {
                id: serviceCode,
                number: number,
                startTime: Date.now()
            };
        }

        // 1. Fetch homepage
        console.log('[FreeSMS] Fetching number list from receive-smss.com...');
        const res = await axios.get(this.baseUrl, { headers: { 'User-Agent': this.userAgent } });
        const $ = cheerio.load(res.data);

        // 2. Find number links
        const links = [];
        $('a[href*="/sms/"]').each((i, el) => {
            const href = $(el).attr('href');
            // href is like https://receive-smss.com/sms/1234567890/
            // Extract digits
            const match = href.match(/\/sms\/(\d+)\/?/);
            if (match) {
                links.push({
                    url: href,
                    number: '+' + match[1]
                });
            }
        });

        if (links.length === 0) throw new Error('No numbers found on receive-smss.com');

        // 3. Pick one
        // If country is specified, try to filter (not implemented fully, just random for now)
        const selected = links[Math.floor(Math.random() * links.length)];
        console.log(`[FreeSMS] Selected number: ${selected.number}`);

        return {
            id: selected.url, // We use the URL as the ID
            number: selected.number,
            startTime: Date.now()
        };
    }

    async getCode(idObj, serviceKeywords = [], timeoutMs = 300000, intervalMs = 30000) {
        let url = idObj;
        if (typeof idObj === 'object' && idObj.id) url = idObj.id;

        // Ensure absolute URL
        if (!url.startsWith('http')) {
            if (url.startsWith('/')) url = this.baseUrl + url;
            else url = this.baseUrl + '/' + url;
        }

        console.log(`[FreeSMS] Polling ${url} for code... Keywords: ${serviceKeywords.join(', ') || 'None'}`);
        console.log(`[FreeSMS] Timeout: ${timeoutMs}ms, Interval: ${intervalMs}ms`);

        const maxRetries = Math.ceil(timeoutMs / intervalMs);
        for (let i = 0; i < maxRetries; i++) {
            try {
                const res = await axios.get(url, { headers: { 'User-Agent': this.userAgent } });
                const $ = cheerio.load(res.data);

                let foundCode = null;

                // Heuristic: Look for 4-8 digit codes in the message list.
                // The text dump shows: Message[Content] Sender[Name] Time[Time]
                // We split by "Sender" to isolate messages.

                const bodyText = $('body').text();
                const parts = bodyText.split('Sender');

                // Look at the first few parts (messages)
                for (let j = 0; j < Math.min(parts.length, 10); j++) {
                    const part = parts[j];
                    // The message content is at the end of `part` (before "Sender")
                    // The "Time" is at the beginning of the NEXT part (after "Sender")?
                    // Wait, the split removes "Sender".
                    // Structure: Message[Content] Sender[Name] Time[Time]
                    // If we split by "Sender", we get:
                    // Part 0: ... Message[Content]
                    // Part 1: [Name] Time[Time] ... Message[Content]

                    // This split strategy is tricky because "Time" is not a delimiter.
                    // Let's try to parse the row structure if possible, but cheerio table parsing is safer if the structure is a table.
                    // The previous fetch showed it might not be a clean table in the text dump.
                    // Let's stick to the text dump but refine the regex or logic.

                    // Better approach: Use Cheerio to find the rows.
                    // The site usually uses a table or div list.
                    // Let's assume it's a table based on typical layout, or divs with classes.
                    // Since we can't see the classes, let's try to find the pattern in the full text more robustly.

                    // Pattern: Message(.*?)Sender(.*?)Time(.*?)ago
                    // But "ago" might be the end.

                    // Let's try to parse the "Time" from the text.
                    // We need to associate the Time with the Message.
                    // If we split by "Message", we might get:
                    // [Empty, "Your code... Sender... Time... ", "Your code... Sender... Time... "]

                    // Let's try splitting by "Message".
                }

                // New parsing logic using "Message" as delimiter
                const messageBlocks = bodyText.split('Message');
                // Skip the first block (header/nav)
                for (let j = 1; j < Math.min(messageBlocks.length, 15); j++) {
                    const block = messageBlocks[j];
                    // Block looks like: "Your code is 1234 SenderGoogle Time17 minutes ago "

                    // Extract Time
                    const timeMatch = block.match(/Time(.*?ago)/);
                    if (!timeMatch) continue;

                    const timeStr = timeMatch[1].trim(); // e.g. "17 minutes ago"

                    // Check if recent
                    if (!this.isRecent(timeStr)) {
                        // console.log(`[FreeSMS] Skipping old message: ${timeStr}`);
                        continue;
                    }

                    // Extract Content (everything before Sender)
                    const senderIndex = block.indexOf('Sender');
                    if (senderIndex === -1) continue;

                    const content = block.substring(0, senderIndex).trim();

                    // Check keywords
                    if (serviceKeywords && serviceKeywords.length > 0) {
                        const lowerContent = content.toLowerCase();
                        const hasKeyword = serviceKeywords.some(k => lowerContent.includes(k.toLowerCase()));
                        if (!hasKeyword) continue;
                    }

                    const codeMatch = content.match(/\b\d{4,8}\b/);
                    if (codeMatch) {
                        foundCode = codeMatch[0];
                        console.log(`[FreeSMS] Found matching NEW code: ${foundCode} (${timeStr})`);
                        break;
                    }
                }

                if (foundCode) return foundCode;

            } catch (e) {
                console.error('[FreeSMS] Error polling:', e.message);
            }
            if (i < maxRetries - 1) {
                console.log(`[FreeSMS] Waiting ${intervalMs/1000}s... (${i+1}/${maxRetries})`);
                await new Promise(r => setTimeout(r, intervalMs));
            }
        }
        throw new Error('Timeout waiting for SMS');
    }

    isRecent(timeStr) {
        // Formats: "X seconds ago", "X minutes ago", "1 hour ago"
        if (timeStr.includes('second')) return true;
        if (timeStr.includes('minute')) {
            const match = timeStr.match(/(\d+)\s*minute/);
            if (match) {
                const mins = parseInt(match[1], 10);
                return mins <= 1; // Stricter: only accept <= 1 minute old
            }
        }
        return false; // Hours, days, etc.
    }
}

module.exports = {
    MockSmsService,
    FiveSimService,
    FreeReceiveSmssService
};
