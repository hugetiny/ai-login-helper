const axios = require('axios');
const cheerio = require('cheerio');

class SmsProvider {
    constructor(config) {
        this.config = config;
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }

    /**
     * Get the latest message from the provider URL to establish a baseline.
     * @returns {Promise<{text: string, time: string, raw: string}>}
     */
    async getLatestMessage() {
        const url = this.config.url;
        console.log(`[SmsProvider] Fetching baseline from ${url}...`);
        try {
            const res = await axios.get(url, { headers: { 'User-Agent': this.userAgent } });
            const $ = cheerio.load(res.data);
            const bodyText = $('body').text();

            // Use configured splitters
            const splitKey = this.config.selectors.contentSplit || 'Message';
            const blocks = bodyText.split(splitKey);

            // Find the first valid block (skipping header)
            for (let i = 1; i < Math.min(blocks.length, 5); i++) {
                const block = blocks[i];
                const timeRegex = new RegExp(this.config.selectors.timestampRegex);
                const timeMatch = block.match(timeRegex);

                if (timeMatch) {
                    return {
                        text: block.trim(),
                        time: timeMatch[1].trim(),
                        raw: block
                    };
                }
            }
            return null;
        } catch (e) {
            console.error('[SmsProvider] Error fetching baseline:', e.message);
            return null;
        }
    }

    /**
     * Poll for a NEW message that is different from the baseline or newer.
     * @param {object} baseline - The message object returned by getLatestMessage
     * @param {string[]} keywords - Keywords to filter by
     */
    async waitForNewMessage(baseline, keywords = []) {
        const url = this.config.url;
        const timeout = this.config.timeout || 300000;
        const interval = this.config.pollingInterval || 30000;
        const maxRetries = Math.ceil(timeout / interval);

        console.log(`[SmsProvider] Waiting for NEW message... (Baseline: ${baseline ? baseline.time : 'None'})`);

        for (let i = 0; i < maxRetries; i++) {
            try {
                const res = await axios.get(url, { headers: { 'User-Agent': this.userAgent } });
                const $ = cheerio.load(res.data);
                const bodyText = $('body').text();

                const splitKey = this.config.selectors.contentSplit || 'Message';
                const blocks = bodyText.split(splitKey);

                for (let j = 1; j < Math.min(blocks.length, 10); j++) {
                    const block = blocks[j];
                    const timeRegex = new RegExp(this.config.selectors.timestampRegex);
                    const timeMatch = block.match(timeRegex);

                    if (!timeMatch) continue;

                    const timeStr = timeMatch[1].trim();

                    // Check if this is the baseline message (simple check by raw content or time)
                    if (baseline && block.includes(baseline.time) && block.length === baseline.raw.length) {
                        // Likely the same message
                        continue;
                    }

                    // Check if "recent" (e.g. "seconds ago" or "1 minute ago")
                    // This is a secondary check to ensure we don't pick up an old message if baseline failed
                    if (!this.isRecent(timeStr)) continue;

                    // Check keywords
                    const content = block; // Simplified, content is the whole block for keyword search
                    if (keywords.length > 0) {
                        const hasKeyword = keywords.some(k => content.toLowerCase().includes(k.toLowerCase()));
                        if (!hasKeyword) continue;
                    }

                    // Extract Code
                    const codeRegex = new RegExp(this.config.selectors.codeRegex);
                    const codeMatch = content.match(codeRegex);

                    if (codeMatch) {
                        console.log(`[SmsProvider] Found NEW code: ${codeMatch[0]} (${timeStr})`);
                        return codeMatch[0];
                    }
                }
            } catch (e) {
                console.error('[SmsProvider] Error polling:', e.message);
            }

            if (i < maxRetries - 1) {
                console.log(`[SmsProvider] Waiting ${interval/1000}s...`);
                await new Promise(r => setTimeout(r, interval));
            }
        }
        throw new Error('Timeout waiting for new SMS');
    }

    isRecent(timeStr) {
        if (timeStr.includes('second')) return true;
        if (timeStr.includes('minute')) {
            const match = timeStr.match(/(\d+)\s*minute/);
            if (match) {
                const mins = parseInt(match[1], 10);
                return mins <= 1;
            }
        }
        return false;
    }
}

module.exports = SmsProvider;
