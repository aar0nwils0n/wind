import { GpxParser } from './gpx-parser.js';
import { Scene3D } from './scene.js';

class App {
    constructor() {
        this.scene = null;
        this.gpxData = null;
        this.isPlaying = false;
        this.currentProgress = 0;
        this.animationId = null;
        this.lastFrameTime = 0;
        this.playbackSpeed = 100;
        this.isUserScrubbing = false;
        this.windDir = null;

        this.initElements();
        this.initScene();
        this.bindEvents();
    }

    initElements() {
        this.canvasContainer = document.getElementById('canvas-container');
        this.uploadOverlay = document.getElementById('upload-overlay');
        this.gpxInput = document.getElementById('gpx-input');
        this.controls = document.getElementById('controls');
        this.statsBar = document.getElementById('stats');
        this.loading = document.getElementById('loading');
        this.playPauseBtn = document.getElementById('play-pause-btn');
        this.playIcon = document.getElementById('play-icon');
        this.pauseIcon = document.getElementById('pause-icon');
        this.timeline = document.getElementById('timeline');
        this.currentTimeLabel = document.getElementById('current-time');
        this.totalTimeLabel = document.getElementById('total-time');
        this.speedSelect = document.getElementById('speed');
        this.statDistance = document.getElementById('stat-distance');
        this.statElevation = document.getElementById('stat-elevation');
        this.statDuration = document.getElementById('stat-duration');
        this.statSpeed = document.getElementById('stat-speed');
        this.windOverlay = document.getElementById('wind-overlay');
        this.windSpeed = document.getElementById('wind-speed');
        this.windDirection = document.getElementById('wind-direction');
        this.upwindOverlay = document.getElementById('upwind-overlay');
        this.upwindAngle = document.getElementById('upwind-angle');
        this.currentSpeed = document.getElementById('current-speed');
    }

    initScene() {
        this.scene = new Scene3D(this.canvasContainer);
    }

    bindEvents() {
        this.gpxInput.addEventListener('change', (e) => this.handleFileSelect(e));

        this.uploadOverlay.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadOverlay.classList.add('drag-over');
        });

        this.uploadOverlay.addEventListener('dragleave', () => {
            this.uploadOverlay.classList.remove('drag-over');
        });

        this.uploadOverlay.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadOverlay.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.loadGpxFile(files[0]);
            }
        });

        this.playPauseBtn.addEventListener('click', () => this.togglePlayback());

        this.timeline.addEventListener('input', () => {
            this.isUserScrubbing = true;
            this.currentProgress = this.timeline.value / 1000;
            this.scene.updateProgress(this.currentProgress);
            this.updateTimeDisplay();
            this.updateUpwindAngle();
        });

        this.timeline.addEventListener('change', () => {
            this.isUserScrubbing = false;
        });

        this.speedSelect.addEventListener('change', () => {
            this.playbackSpeed = parseFloat(this.speedSelect.value);
        });

        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                this.togglePlayback();
            } else if (e.code === 'ArrowLeft') {
                this.scrub(-0.01);
            } else if (e.code === 'ArrowRight') {
                this.scrub(0.01);
            }
        });
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            this.loadGpxFile(file);
        }
    }

    async loadGpxFile(file) {
        if (!file.name.endsWith('.gpx')) {
            alert('Please select a valid GPX file');
            return;
        }
        const text = await file.text();
        this.loadGpxText(text)
    }

    async loadGpxText(text) {

        this.loading.classList.remove('hidden');

        try {
            console.log('GPX file size:', text.length, 'bytes');
            this.gpxData = GpxParser.parse(text);
            console.log('Parsed GPX:', this.gpxData.points.length, 'points');
            await this.scene.loadData(this.gpxData, this.windDir);

            this.uploadOverlay.classList.add('hidden');
            this.controls.classList.remove('hidden');
            this.statsBar.classList.remove('hidden');
            this.loading.classList.add('hidden');

            this.updateStats();
            this.updateTimeDisplay();
            this.scene.updateProgress(0);
            await this.fetchWindData();
            this.upwindOverlay.classList.remove('hidden');

            this.currentProgress = 0;
            this.isPlaying = false;
            this.updatePlayPauseIcon();

            if (!this.animationId) {
                this.lastFrameTime = performance.now();
                this.animate();
            }

        } catch (error) {
            console.error('Error loading GPX:', error);
            console.error('Stack:', error.stack);
            alert('Error loading GPX file: ' + error.message);
            this.loading.classList.add('hidden');
        }
    }

    updateStats() {
        const stats = this.gpxData.stats;
        this.statDistance.textContent = GpxParser.formatDistance(stats.totalDistance);
        this.statElevation.textContent = `${Math.round(stats.elevationGain)} m`;
        this.statDuration.textContent = GpxParser.formatDuration(stats.totalDuration);

        if (stats.totalDuration > 0) {
            const avgSpeed = stats.totalDistance / (stats.totalDuration / 1000);
            this.statSpeed.textContent = GpxParser.formatSpeed(avgSpeed);
        }
    }

    async fetchWindData() {
        const points = this.gpxData.points;
        if (!points.length) return;

        const lat = points[0].lat;
        const lon = points[0].lon;
        const startTime = this._activityStartDate;

        if (!startTime) return;

        const dateStr = startTime.toISOString().split('T')[0];
        const url = `https://archive-api.open-meteo.com/v1/era5?latitude=${lat}&longitude=${lon}&start_date=${dateStr}&end_date=${dateStr}&hourly=windspeed_10m,winddirection_10m&timezone=UTC`;

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);
            const data = await response.json();

            const times = data.hourly.time;
            const speeds = data.hourly.windspeed_10m;
            const directions = data.hourly.winddirection_10m;

            const activityHour = startTime.toISOString().slice(0, 13);
            let idx = times.findIndex(t => t.startsWith(activityHour));
            if (idx === -1) idx = 0;

            const speed = speeds[idx];
            const direction = directions[idx];

            if (speed != null) {
                this.windSpeed.textContent = `${Math.round(speed * 0.621371)} mph`;
                this.windDirection.textContent = this.degToCompass(direction);
                this.windOverlay.classList.remove('hidden');
                this.windDir = direction;
                this.scene.setWindDirection(direction);
                this.updateUpwindAngle();
            }
        } catch (err) {
            console.error('Failed to fetch wind data:', err);
        }
    }

    degToCompass(deg) {
        const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        return dirs[Math.round(deg / 45) % 8];
    }

    updateUpwindAngle() {
        if (!this.gpxData || this.windDir === null) return;

        const points = this.gpxData.points;
        const pointIndex = Math.floor(this.currentProgress * (points.length - 1));

        if (pointIndex < 1) {
            this.upwindAngle.textContent = '--';
            this.currentSpeed.textContent = '0 mph';
            return;
        }

        const prevPoint = points[pointIndex - 1];
        const currPoint = points[pointIndex];

        const dx = currPoint.x - prevPoint.x;
        const dz = currPoint.z - prevPoint.z;

        const travelAngle = Math.atan2(dz, dx) * 180 / Math.PI;
        const travelCompass = (90 - travelAngle + 360) % 360;

        const angleDiff = Math.abs(travelCompass - this.windDir);
        const angleToWind = Math.min(angleDiff, 360 - angleDiff);
        const upwindAngle = 90 - angleToWind;

        this.upwindAngle.textContent = `${Math.round(upwindAngle)}°`;

        const timeDelta = (currPoint.elapsedTime - prevPoint.elapsedTime) / 1000;
        if (timeDelta > 0) {
            const speedMps = currPoint.distanceFromPrev / timeDelta;
            this.currentSpeed.textContent = GpxParser.formatSpeed(speedMps);
        }
    }

    updateTimeDisplay() {
        if (!this.gpxData) return;

        const currentTime = this.currentProgress * this.gpxData.stats.totalDuration;
        this.currentTimeLabel.textContent = GpxParser.formatDuration(currentTime);
        this.totalTimeLabel.textContent = GpxParser.formatDuration(this.gpxData.stats.totalDuration);
    }

    togglePlayback() {
        if (!this.gpxData) return;

        if (this.currentProgress >= 1) {
            this.currentProgress = 0;
        }

        this.isPlaying = !this.isPlaying;
        this.updatePlayPauseIcon();

        if (this.isPlaying) {
            this.lastFrameTime = performance.now();
        }
    }

    updatePlayPauseIcon() {
        if (this.isPlaying) {
            this.playIcon.classList.add('hidden');
            this.pauseIcon.classList.remove('hidden');
        } else {
            this.playIcon.classList.remove('hidden');
            this.pauseIcon.classList.add('hidden');
        }
    }

    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());

        const now = performance.now();
        const delta = now - this.lastFrameTime;

        if (this.isPlaying && delta >= 33.33) {
            this.lastFrameTime = now - (delta % 33.33);

            if (!this.isUserScrubbing && this.gpxData.stats.totalDuration > 0) {
                const durationSeconds = this.gpxData.stats.totalDuration / 1000;
                const progressIncrement = (delta / 1000) * this.playbackSpeed / durationSeconds;
                this.currentProgress = Math.min(this.currentProgress + progressIncrement, 1);

                this.timeline.value = Math.round(this.currentProgress * 1000);
                this.updateTimeDisplay();
                this.scene.updateProgress(this.currentProgress);
                this.updateUpwindAngle();

                if (this.currentProgress >= 1) {
                    this.isPlaying = false;
                    this.updatePlayPauseIcon();
                }
            }
        }

        this.scene.animate();
    }

    scrub(delta) {
        if (!this.gpxData) return;
        this.currentProgress = Math.max(0, Math.min(1, this.currentProgress + delta));
        this.timeline.value = Math.round(this.currentProgress * 1000);
        this.updateTimeDisplay();
        this.scene.updateProgress(this.currentProgress);
        this.updateUpwindAngle();
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    window.app = new App();

    const params = new URLSearchParams(window.location.search);
    const activityId = params.get('activityId');
    const userId = params.get('userId');

    if (activityId && userId) {
        try {
            const res = await fetch(`/api/strava/activity/${activityId}/gpx?userId=${userId}`);
            const data = await res.json();

            if (data.startDate) {
                window.app._activityStartDate = new Date(data.startDate);
            }

            await window.app.loadGpxText(data.gpx);
            window.app.isPlaying = false;
            window.app.updatePlayPauseIcon();
            window.app.updateUpwindAngle();
            history.replaceState(null, '', '/');
        } catch (err) {
            console.error('Failed to load activity GPX:', err);
        }
    }
});
