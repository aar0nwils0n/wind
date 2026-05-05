const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('GPX 3D Visualizer - E2E', () => {
    const gpxFilePath = path.join(__dirname, '..', 'activity_22766008358.gpx');

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('loads the page and shows upload screen', async ({ page }) => {
        await expect(page.locator('#upload-overlay')).toBeVisible();
        await expect(page.locator('h1')).toContainText('GPX 3D Visualizer');
        await expect(page.locator('#gpx-input')).toBeAttached();
        await expect(page.locator('#load-example-btn')).toBeVisible();
    });

    test('loads example GPX and shows 3D visualization', async ({ page }) => {
        await page.locator('#load-example-btn').click();

        await expect(page.locator('#upload-overlay')).toBeHidden({ timeout: 10000 });
        await expect(page.locator('#controls')).toBeVisible();
        await expect(page.locator('#stats')).toBeVisible();

        const canvas = page.locator('canvas');
        await expect(canvas).toBeVisible();

        const canvasBox = await canvas.boundingBox();
        expect(canvasBox.width).toBeGreaterThan(100);
        expect(canvasBox.height).toBeGreaterThan(100);
    });

    test('displays correct stats after loading GPX', async ({ page }) => {
        await page.locator('#load-example-btn').click();
        await expect(page.locator('#upload-overlay')).toBeHidden({ timeout: 10000 });

        const distanceText = await page.locator('#stat-distance').textContent();
        expect(distanceText).toMatch(/[\d.]+ km/);

        const elevationText = await page.locator('#stat-elevation').textContent();
        expect(elevationText).toMatch(/[\d]+ m/);

        const durationText = await page.locator('#stat-duration').textContent();
        expect(durationText).toMatch(/[\d:]+/);

        const speedText = await page.locator('#stat-speed').textContent();
        expect(speedText).toMatch(/[\d.]+ km\/h/);
    });

    test('play/pause button toggles correctly', async ({ page }) => {
        await page.locator('#load-example-btn').click();
        await expect(page.locator('#upload-overlay')).toBeHidden({ timeout: 10000 });

        const playIcon = page.locator('#play-icon');
        const pauseIcon = page.locator('#pause-icon');

        await expect(playIcon).toBeVisible();
        await expect(pauseIcon).toBeHidden();

        await page.locator('#play-pause-btn').click();

        await expect(playIcon).toBeHidden();
        await expect(pauseIcon).toBeVisible();

        await page.locator('#play-pause-btn').click();

        await expect(playIcon).toBeVisible();
        await expect(pauseIcon).toBeHidden();
    });

    test('timeline scrubbing works', async ({ page }) => {
        await page.locator('#load-example-btn').click();
        await expect(page.locator('#upload-overlay')).toBeHidden({ timeout: 10000 });

        const timeline = page.locator('#timeline');
        await expect(timeline).toHaveValue('0');

        await timeline.fill('500');
        await timeline.dispatchEvent('input');

        const value = await timeline.inputValue();
        expect(parseInt(value)).toBe(500);

        const currentTime = await page.locator('#current-time').textContent();
        expect(currentTime).not.toBe('00:00');
    });

    test('time display updates during playback', async ({ page }) => {
        await page.locator('#load-example-btn').click();
        await expect(page.locator('#upload-overlay')).toBeHidden({ timeout: 10000 });

        await page.locator('#play-pause-btn').click();

        await page.waitForTimeout(500);

        const initialTime = await page.locator('#current-time').textContent();

        await page.waitForTimeout(500);

        const laterTime = await page.locator('#current-time').textContent();

        expect(laterTime).not.toBe(initialTime);

        await page.locator('#play-pause-btn').click();
    });

    test('speed defaults to 100x', async ({ page }) => {
        await page.locator('#load-example-btn').click();
        await expect(page.locator('#upload-overlay')).toBeHidden({ timeout: 10000 });

        await expect(page.locator('#speed')).toHaveValue('100');
    });

    test('speed control affects playback', async ({ page }) => {
        await page.locator('#load-example-btn').click();
        await expect(page.locator('#upload-overlay')).toBeHidden({ timeout: 10000 });

        const speedSelect = page.locator('#speed');
        await expect(speedSelect).toHaveValue('100');

        await page.locator('#speed').selectOption('500');

        await page.locator('#play-pause-btn').click();
        await page.waitForTimeout(500);
        const fastTime = await page.locator('#current-time').textContent();

        await page.locator('#play-pause-btn').click();
        await page.locator('#timeline').fill('0');
        await page.locator('#timeline').dispatchEvent('input');
        await page.waitForTimeout(100);

        await page.locator('#speed').selectOption('10');

        await page.locator('#play-pause-btn').click();
        await page.waitForTimeout(500);
        const slowTime = await page.locator('#current-time').textContent();

        expect(slowTime).not.toBe(fastTime);
    });

    test('keyboard shortcuts work', async ({ page }) => {
        await page.locator('#load-example-btn').click();
        await expect(page.locator('#upload-overlay')).toBeHidden({ timeout: 10000 });

        await page.keyboard.press('Space');
        await expect(page.locator('#pause-icon')).toBeVisible();

        await page.keyboard.press('Space');
        await expect(page.locator('#play-icon')).toBeVisible();

        await page.locator('#timeline').fill('0');
        await page.locator('#timeline').dispatchEvent('input');
        await page.waitForTimeout(100);

        await page.keyboard.press('ArrowRight');
        const timelineValue = await page.locator('#timeline').inputValue();
        expect(parseInt(timelineValue)).toBeGreaterThan(0);
    });

    test('file upload via file input works', async ({ page }) => {
        await page.locator('#gpx-input').setInputFiles(gpxFilePath);

        await expect(page.locator('#upload-overlay')).toBeHidden({ timeout: 10000 });
        await expect(page.locator('#controls')).toBeVisible();
        await expect(page.locator('#stats')).toBeVisible();
    });

    test('drag and drop works', async ({ page }) => {
        const uploadOverlay = page.locator('#upload-overlay');

        await uploadOverlay.dispatchEvent('dragover');
        await expect(uploadOverlay).toHaveClass(/drag-over/);

        await uploadOverlay.dispatchEvent('dragleave');
        await expect(uploadOverlay).not.toHaveClass(/drag-over/);

        await uploadOverlay.dispatchEvent('drop');
        await expect(uploadOverlay).not.toHaveClass(/drag-over/);
    });

    test('canvas renders without WebGL errors', async ({ page }) => {
        const consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });

        await page.locator('#load-example-btn').click();
        await expect(page.locator('#upload-overlay')).toBeHidden({ timeout: 10000 });

        await page.waitForTimeout(1000);

        const webglErrors = consoleErrors.filter(e =>
            e.includes('WebGL') || e.includes('THREE') || e.includes('renderer')
        );
        expect(webglErrors).toHaveLength(0);
    });

    test('loading state appears and disappears', async ({ page }) => {
        await page.route('**/activity_22766008358.gpx', async route => {
            await new Promise(r => setTimeout(r, 500));
            route.continue();
        });

        await page.locator('#load-example-btn').click();

        const loading = page.locator('#loading');
        await expect(loading).toBeVisible({ timeout: 5000 });
        await expect(loading).toBeHidden({ timeout: 10000 });
    });

    test('marker is visible on the path after scrubbing forward', async ({ page }) => {
        await page.locator('#load-example-btn').click();
        await expect(page.locator('#upload-overlay')).toBeHidden({ timeout: 10000 });

        await page.locator('#timeline').fill('100');
        await page.locator('#timeline').dispatchEvent('input');
        await page.waitForTimeout(200);

        const markerVisible = await page.evaluate(() => {
            return window.app &&
                window.app.scene &&
                window.app.scene.marker &&
                window.app.scene.marker.visible;
        });

        expect(markerVisible).toBe(true);
    });

    test('marker stays hidden at start', async ({ page }) => {
        await page.locator('#load-example-btn').click();
        await expect(page.locator('#upload-overlay')).toBeHidden({ timeout: 10000 });

        const markerVisible = await page.evaluate(() => {
            return window.app &&
                window.app.scene &&
                window.app.scene.marker &&
                window.app.scene.marker.visible;
        });

        expect(markerVisible).toBe(false);
    });

    test('path line has correct draw range at start', async ({ page }) => {
        await page.locator('#load-example-btn').click();
        await expect(page.locator('#upload-overlay')).toBeHidden({ timeout: 10000 });

        const drawRange = await page.evaluate(() => {
            if (!window.app || !window.app.scene || !window.app.scene.pathLine) return null;
            return window.app.scene.pathLine.geometry.drawRange;
        });

        expect(drawRange).not.toBeNull();
        expect(drawRange.start).toBe(0);
        expect(drawRange.count).toBe(0);
    });

    test('path draw range updates during playback', async ({ page }) => {
        await page.locator('#load-example-btn').click();
        await expect(page.locator('#upload-overlay')).toBeHidden({ timeout: 10000 });

        await page.locator('#timeline').fill('500');
        await page.locator('#timeline').dispatchEvent('input');

        const drawRange = await page.evaluate(() => {
            if (!window.app || !window.app.scene || !window.app.scene.pathLine) return null;
            return window.app.scene.pathLine.geometry.drawRange;
        });

        expect(drawRange).not.toBeNull();
        expect(drawRange.count).toBeGreaterThan(0);
    });
});
