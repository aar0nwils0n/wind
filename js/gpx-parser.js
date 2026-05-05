class GpxParser {
    static parse(xmlString) {
        const parser = new DOMParser();
        const xml = parser.parseFromString(xmlString, 'text/xml');

        const parseError = xml.querySelector('parsererror');
        if (parseError) {
            throw new Error('Invalid GPX file: ' + parseError.textContent);
        }

        const trackpoints = [];
        const trkpts = xml.getElementsByTagName('trkpt');

        for (let i = 0; i < trkpts.length; i++) {
            const pt = trkpts[i];
            const lat = parseFloat(pt.getAttribute('lat'));
            const lon = parseFloat(pt.getAttribute('lon'));
            const eleElement = pt.getElementsByTagName('ele')[0];
            const timeElement = pt.getElementsByTagName('time')[0];

            trackpoints.push({
                lat,
                lon,
                elevation: eleElement ? parseFloat(eleElement.textContent) : 0,
                time: timeElement ? new Date(timeElement.textContent) : null,
                index: i
            });
        }

        if (trackpoints.length === 0) {
            throw new Error('No trackpoints found in GPX file');
        }

        return this.processTrackpoints(trackpoints);
    }

    static processTrackpoints(trackpoints) {
        const minLat = Math.min(...trackpoints.map(p => p.lat));
        const maxLat = Math.max(...trackpoints.map(p => p.lat));
        const minLon = Math.min(...trackpoints.map(p => p.lon));
        const maxLon = Math.max(...trackpoints.map(p => p.lon));

        const centerLat = (minLat + maxLat) / 2;
        const metersPerDegLat = 111320;
        const metersPerDegLon = 111320 * Math.cos(centerLat * Math.PI / 180);

        let cumulativeDistance = 0;
        let processedPoints = [];

        for (let i = 0; i < trackpoints.length; i++) {
            const pt = trackpoints[i];
            const x = (pt.lon - minLon) * metersPerDegLon;
            const z = (pt.lat - minLat) * metersPerDegLat;
            const y = pt.elevation;

            let distanceFromPrev = 0;
            if (i > 0) {
                const prev = processedPoints[i - 1];
                const dx = x - prev.x;
                const dy = y - prev.y;
                const dz = z - prev.z;
                distanceFromPrev = Math.sqrt(dx * dx + dy * dy + dz * dz);
            }

            cumulativeDistance += distanceFromPrev;

            processedPoints.push({
                ...pt,
                x,
                y,
                z,
                distanceFromStart: cumulativeDistance,
                distanceFromPrev
            });
        }

        const totalTime = this.calculateTotalTime(processedPoints);

        processedPoints.forEach((pt, i) => {
            if (!pt.time && totalTime > 0 && i > 0) {
                const prevTime = processedPoints[i - 1].timeMs || 0;
                const fraction = pt.distanceFromStart / processedPoints[processedPoints.length - 1].distanceFromStart;
                pt.timeMs = prevTime + (totalTime / processedPoints.length);
            } else if (pt.time) {
                pt.timeMs = pt.time.getTime();
            } else {
                pt.timeMs = 0;
            }
        });

        const startTime = processedPoints[0].timeMs;
        processedPoints.forEach(pt => {
            pt.elapsedTime = pt.timeMs - startTime;
        });

        const totalDuration = processedPoints[processedPoints.length - 1].elapsedTime;
        const totalDistance = processedPoints[processedPoints.length - 1].distanceFromStart;
        const maxElevation = Math.max(...processedPoints.map(p => p.y));
        const minElevation = Math.min(...processedPoints.map(p => p.y));

        return {
            points: processedPoints,
            center: {
                lat: centerLat,
                lon: (minLon + maxLon) / 2
            },
            bounds: {
                minLat,
                maxLat,
                minLon,
                maxLon
            },
            stats: {
                totalDistance,
                totalDuration,
                maxElevation,
                minElevation,
                elevationGain: maxElevation - minElevation
            }
        };
    }

    static calculateTotalTime(points) {
        const times = points.filter(p => p.time).map(p => p.time.getTime());
        if (times.length < 2) return 0;
        return Math.max(...times) - Math.min(...times);
    }

    static formatDuration(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
        return `${minutes}:${String(seconds).padStart(2, '0')}`;
    }

    static formatDistance(meters) {
        if (meters >= 1000) {
            return `${(meters / 1000).toFixed(2)} km`;
        }
        return `${Math.round(meters)} m`;
    }

    static formatSpeed(mps) {
        const kmh = mps * 3.6;
        return `${kmh.toFixed(1)} km/h`;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GpxParser };
}
