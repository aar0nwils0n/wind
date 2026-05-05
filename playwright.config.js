const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: 0,
    workers: 1,
    reporter: 'list',
    use: {
        baseURL: 'http://localhost:8080',
        trace: 'on-first-retry',
        viewport: { width: 1280, height: 720 },
    },
    webServer: {
        command: 'npx http-server -p 8080 --cors -c-1 --silent',
        url: 'http://localhost:8080',
        reuseExistingServer: !process.env.CI,
        timeout: 10000,
    },
});
