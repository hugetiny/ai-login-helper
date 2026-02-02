const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { MockSmsService, FiveSimService, FreeReceiveSmssService } = require('./sms_service');

// --- CONFIGURATION ---
const EXTENSION_PATH = path.resolve(__dirname, '../extension'); // Root of the extension
const HEADLESS = false; // Must be false for extensions to work
const CONCURRENT_TASKS = 1; // How many browsers to run in parallel
const TOTAL_TASKS = 1; // Total number of accounts to generate
const TARGET_URL = 'https://example.com/login'; // REPLACE THIS with your target site
const SMS_SERVICE_CODE = 'other'; // Service code for 5sim (e.g., 'google', 'telegram', 'other')
const SMS_COUNTRY = 'any'; // 'any' for random free country, or specific like 'romania'

// Choose your SMS provider
// const smsService = new FiveSimService('YOUR_API_KEY');
// const smsService = new MockSmsService();
const smsService = new FreeReceiveSmssService();

// --- MAIN LOGIC ---

async function runTask(taskId) {
    const userDataDir = path.join(__dirname, 'temp', `profile_${taskId}_${Date.now()}`);
    console.log(`[Task ${taskId}] Starting... Profile: ${userDataDir}`);

    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: HEADLESS,
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            '--no-sandbox'
        ],
        viewport: { width: 1280, height: 720 }
    });

    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    try {
        // 1. Get Extension ID (Optional, if you need to open popup)
        // We can find it by looking at the targets or just assuming it loaded.
        let extensionId = null;
        const serviceWorker = context.serviceWorkers()[0];
        if (serviceWorker) {
            const url = serviceWorker.url();
            extensionId = url.split('/')[2];
            console.log(`[Task ${taskId}] Extension ID found: ${extensionId}`);
        }

        // 2. Navigate to Target Site
        console.log(`[Task ${taskId}] Navigating to ${TARGET_URL}`);
        await page.goto(TARGET_URL);

        // --- CUSTOM LOGIN LOGIC START ---
        // Replace the selectors below with the actual ones from your target site.

        // Example: Click "Login with Phone"
        // await page.click('button:has-text("Phone")');

        // 3. Get Phone Number
        const { id: activationId, number } = await smsService.getNumber(SMS_SERVICE_CODE, SMS_COUNTRY);
        console.log(`[Task ${taskId}] Got number: ${number}`);

        // 4. Fill Phone Number & TRIGGER SMS
        // CRITICAL STEP: You MUST implement the click action that sends the SMS here.
        // The script will wait for the code AFTER this step.

        // await page.fill('input[type="tel"]', number);
        // await page.click('#send-code-btn'); // <--- THIS CLICK IS REQUIRED
        console.log(`[Task ${taskId}] Filled number and clicked send (Simulated)`);

        // 5. Wait for SMS Code
        console.log(`[Task ${taskId}] Waiting for SMS code...`);
        // Pass keywords relevant to your target service (e.g., 'doubao', 'google', 'whatsapp')
        // The service will now filter for messages that are NEW (arrived < 5 mins ago) AND contain the keywords.
        const code = await smsService.getCode(activationId, ['doubao', '豆包', 'verification', 'code']);
        console.log(`[Task ${taskId}] Got code: ${code}`);

        // 6. Fill Code & Login

        // 7. Wait for Login Success & Extract Data
        // You can intercept network requests to get the token
        const loginResponsePromise = page.waitForResponse(response =>
            response.url().includes('/api/login') && response.status() === 200
        , { timeout: 30000 }).catch(() => null);

        // Or wait for a specific element that appears after login
        // await page.waitForSelector('.user-profile');

        const loginResponse = await loginResponsePromise;
        let authData = {};

        if (loginResponse) {
            authData = await loginResponse.json();
        } else {
            // Fallback: Read from LocalStorage
            authData = await page.evaluate(() => {
                return {
                    token: localStorage.getItem('token'),
                    cookies: document.cookie
                };
            });
        }

        console.log(`[Task ${taskId}] Success! Data captured.`);
        // --- CUSTOM LOGIN LOGIC END ---

        // 8. Save Result
        const result = {
            taskId,
            phone: number,
            timestamp: new Date().toISOString(),
            data: authData
        };

        const outputDir = path.join(__dirname, 'results');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
        fs.writeFileSync(path.join(outputDir, `result_${taskId}.json`), JSON.stringify(result, null, 2));

    } catch (error) {
        console.error(`[Task ${taskId}] Error:`, error);
        // Take screenshot on error
        await page.screenshot({ path: path.join(__dirname, 'results', `error_${taskId}.png`) });
    } finally {
        await context.close();
        // Cleanup temp profile
        try {
            fs.rmSync(userDataDir, { recursive: true, force: true });
        } catch (e) {
            console.error(`[Task ${taskId}] Failed to cleanup profile: ${e.message}`);
        }
    }
}

async function main() {
    const tasks = [];
    for (let i = 0; i < TOTAL_TASKS; i++) {
        tasks.push(i + 1);
    }

    // Simple batch runner with concurrency limit
    for (let i = 0; i < tasks.length; i += CONCURRENT_TASKS) {
        const batch = tasks.slice(i, i + CONCURRENT_TASKS);
        await Promise.all(batch.map(id => runTask(id)));
    }

    console.log('All tasks completed.');
}

main();
