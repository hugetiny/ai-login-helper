const { FreeReceiveSmssService } = require('./sms_service');

(async () => {
    const sms = new FreeReceiveSmssService();
    try {
        console.log('Testing FreeReceiveSmssService...');
        const { id, number } = await sms.getNumber('any', 'any');
        console.log('Got number:', number);
        console.log('ID (URL):', id);

        console.log('Waiting for code (simulated polling)...');
        // We won't actually wait for a real code as we can't trigger one easily without a real site.
        // But we can check if getCode throws or polls correctly.
        // We'll just run it for a few seconds.

        // To test getCode, we can try to fetch the page and see if it parses.
        // We can't expect a code unless we send one.
        // But we can verify it doesn't crash.

        // Let's just try to poll once.
        try {
            // Test with a keyword that likely exists or doesn't exist to verify filtering
            // For testing, we might not find 'doubao' on a random number, so let's try generic words or just see logs.
            const code = await sms.getCode(id, ['doubao', '豆包', 'verification', 'code']);
            console.log('Poll result (might be old code):', code);
        } catch (e) {
            console.log('Poll result:', e.message);
        }

    } catch (e) {
        console.error('Error:', e);
    }
})();
