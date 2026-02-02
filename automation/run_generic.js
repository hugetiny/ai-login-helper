const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const SmsProvider = require('./sms_provider');

async function runActions(page, actions, context = {}, defaultTimeout = 5000) {
    for (const action of actions) {
        console.log(`  -> Action: ${action.type} ${action.description || ''}`);

        try {
            switch (action.type) {
                case 'goto':
                    await page.goto(action.url);
                    break;
                case 'click':
                    if (action.optional) {
                        try {
                            await page.click(action.selector, { timeout: 2000, force: action.force });
                        } catch (e) {
                            console.log(`     (Optional click skipped: ${action.selector} - ${e.message})`);
                        }
                    } else {
                        await page.click(action.selector, { timeout: action.timeout || defaultTimeout, force: action.force });
                    }
                    break;
                case 'fill':
                    let value = action.value;
                    // Replace placeholders
                    if (value === '{phoneNumber}') value = context.phoneNumber;
                    if (value === '{code}') value = context.code;

                    await page.fill(action.selector, value, { timeout: action.timeout || defaultTimeout });
                    break;
                case 'check':
                    if (action.optional) {
                        try {
                            await page.check(action.selector, { timeout: 2000, force: action.force });
                        } catch (e) {
                            console.log(`     (Optional check skipped: ${action.selector})`);
                        }
                    } else {
                        await page.check(action.selector, { timeout: action.timeout || defaultTimeout, force: action.force });
                    }
                    break;
                case 'wait':
                    if (action.selector) {
                        try {
                            await page.waitForSelector(action.selector, { timeout: action.timeout || defaultTimeout });
                        } catch (e) {
                            if (!action.optional) throw e;
                            console.log(`     (Optional wait skipped: ${action.selector})`);
                        }
                    } else {
                        // If timeout is specified, use it. If not, use defaultTimeout.
                        await page.waitForTimeout(action.timeout || defaultTimeout);
                    }
                    break;
                case 'waitForUrl':
                    await page.waitForURL(new RegExp(action.pattern), { timeout: action.timeout || 30000 });
                    break;
                case 'waitForSelector':
                    try {
                        await page.waitForSelector(action.selector, { timeout: action.timeout || 30000 });
                    } catch (e) {
                        if (!action.optional) throw e;
                        console.log(`     (Optional waitForSelector skipped: ${action.selector})`);
                    }
                    break;
            }
        } catch (error) {
            console.error(`     Error in action ${action.type}: ${error.message}`);
            if (!action.optional) throw error;
        }
    }
}

async function main() {
    const configPath = path.join(__dirname, 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const globalDefaultTimeout = config.defaultTimeout || 5000;

    const smsProvider = new SmsProvider(config.sms);
    const verifiedSites = [];

    for (const site of config.sites) {
        console.log(`\n=== Starting automation for ${site.name} ===`);
        const siteTimeout = site.timeout || globalDefaultTimeout;

        const browser = await chromium.launch({ headless: false });
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            // 1. Init
            console.log('Phase: Init');
            await runActions(page, site.actions.init, {}, siteTimeout);

            // 2. Fill Phone
            console.log('Phase: Fill Phone');
            await runActions(page, site.actions.fillPhone, { phoneNumber: config.sms.phoneNumber }, siteTimeout);

            // 3. Get Baseline SMS
            console.log('Phase: SMS Baseline');
            const baseline = await smsProvider.getLatestMessage();

            // 4. Trigger SMS
            console.log('Phase: Trigger SMS');
            await runActions(page, site.actions.triggerSms, {}, siteTimeout);

            // 5. Wait for Code
            console.log('Phase: Wait for Code');
            const code = await smsProvider.waitForNewMessage(baseline, site.keywords);
            if (!code) throw new Error('Failed to retrieve verification code');
            console.log(`Got code: ${code}`);

            // 6. Fill Code
            console.log('Phase: Fill Code');
            await runActions(page, site.actions.fillCode, { code: code }, siteTimeout);

            // 7. Verify Login
            console.log('Phase: Verify Login');
            await runActions(page, site.actions.verifyLogin, {}, siteTimeout);

            console.log(`SUCCESS: ${site.name} login verified.`);

            // Add to verified list (clean up fields for export)
            const { actions, keywords, timeout, ...siteConfig } = site;
            verifiedSites.push(siteConfig);

        } catch (error) {
            console.error(`FAILURE: ${site.name} automation failed - ${error.message}`);
            await page.screenshot({ path: path.join(__dirname, `${site.id}_error.png`) });
        } finally {
            await browser.close();
        }
    }

    // Generate Output JSON
    if (verifiedSites.length > 0) {
        const output = {
            version: "1.0.0",
            description: "Generated by Automation",
            exportTime: new Date().toISOString(),
            sites: verifiedSites
        };
        const outputPath = path.join(__dirname, 'verified_sites.json');
        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
        console.log(`\nGenerated verified sites config at: ${outputPath}`);
    }
}

main();
