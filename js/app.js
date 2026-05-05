class App {
    constructor() {
        this.scene = null;
        this.gpxData = null;
        this.isPlaying = false;
        this.currentProgress = 0;
        this.animationId = null;
        this.lastFrameTime = 0;
        this.playbackSpeed = 50;
        this.isUserScrubbing = false;

        this.initElements();
        this.initScene();
        this.bindEvents();
    }

    initElements() {
        this.canvasContainer = document.getElementById('canvas-container');
        this.uploadOverlay = document.getElementById('upload-overlay');
        this.gpxInput = document.getElementById('gpx-input');
        this.loadExampleBtn = document.getElementById('load-example-btn');
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
    }

    initScene() {
        this.scene = new Scene3D(this.canvasContainer);
    }

    bindEvents() {
        this.gpxInput.addEventListener('change', (e) => this.handleFileSelect(e));

        if (this.loadExampleBtn) {
            this.loadExampleBtn.addEventListener('click', () => this.loadExampleGpx());
        }

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

    async loadExampleGpx() {
        this.loading.classList.remove('hidden');

        try {
            const response = await fetch('activity_22766008358.gpx');
            if (!response.ok) {
                throw new Error('Could not load example GPX file');
            }
            const text = await response.text();
            console.log('Example GPX file size:', text.length, 'bytes');
            this.gpxData = GpxParser.parse(text);
            console.log('Parsed GPX:', this.gpxData.points.length, 'points');
            this.scene.loadData(this.gpxData);

            this.uploadOverlay.classList.add('hidden');
            this.controls.classList.remove('hidden');
            this.statsBar.classList.remove('hidden');
            this.loading.classList.add('hidden');

            this.updateStats();
            this.updateTimeDisplay();
            this.scene.updateProgress(0);

            this.currentProgress = 0;
            this.isPlaying = false;
            this.updatePlayPauseIcon();

        } catch (error) {
            console.error('Error loading example GPX:', error);
            alert('Error loading example: ' + error.message);
            this.loading.classList.add('hidden');
        }
    }

    async loadGpxFile(file) {
        if (!file.name.endsWith('.gpx')) {
            alert('Please select a valid GPX file');
            return;
        }

        this.loading.classList.remove('hidden');

        try {
            const text = await file.text();
            console.log('GPX file size:', text.length, 'bytes');
            this.gpxData = GpxParser.parse(text);
            console.log('Parsed GPX:', this.gpxData.points.length, 'points');
            this.scene.loadData(this.gpxData);

            this.uploadOverlay.classList.add('hidden');
            this.controls.classList.remove('hidden');
            this.statsBar.classList.remove('hidden');
            this.loading.classList.add('hidden');

            this.updateStats();
            this.updateTimeDisplay();
            this.scene.updateProgress(0);

            this.currentProgress = 0;
            this.isPlaying = false;
            this.updatePlayPauseIcon();

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
            this.animate();
        } else {
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
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
        if (!this.isPlaying) return;

        this.animationId = requestAnimationFrame(() => this.animate());

        const now = performance.now();
        const delta = now - this.lastFrameTime;

        if (delta < 33.33) return;

        this.lastFrameTime = now - (delta % 33.33);

        if (!this.isUserScrubbing && this.gpxData.stats.totalDuration > 0) {
            const durationSeconds = this.gpxData.stats.totalDuration / 1000;
            const progressIncrement = (delta / 1000) * this.playbackSpeed / durationSeconds;
            this.currentProgress = Math.min(this.currentProgress + progressIncrement, 1);

            this.timeline.value = Math.round(this.currentProgress * 1000);
            this.updateTimeDisplay();
            this.scene.updateProgress(this.currentProgress);

            if (this.currentProgress >= 1) {
                this.isPlaying = false;
                this.updatePlayPauseIcon();
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
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
