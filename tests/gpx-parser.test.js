const fs = require('fs');
const path = require('path');
const { GpxParser } = require('../js/gpx-parser');

const gpxFileContent = fs.readFileSync(path.join(__dirname, '..', 'activity_22766008358.gpx'), 'utf-8');

describe('GpxParser', () => {
    describe('Basic parsing', () => {
        test('parses a minimal GPX file', () => {
            const gpx = `<?xml version="1.0" encoding="UTF-8"?>
            <gpx version="1.1">
                <trk>
                    <trkseg>
                        <trkpt lat="38.9" lon="-94.4">
                            <ele>200</ele>
                            <time>2026-05-04T13:50:27Z</time>
                        </trkpt>
                        <trkpt lat="38.91" lon="-94.41">
                            <ele>210</ele>
                            <time>2026-05-04T13:51:27Z</time>
                        </trkpt>
                    </trkseg>
                </trk>
            </gpx>`;

            const data = GpxParser.parse(gpx);

            expect(data.points.length).toBe(2);
            expect(data.points[0].lat).toBe(38.9);
            expect(data.points[0].lon).toBe(-94.4);
            expect(data.points[0].elevation).toBe(200);
        });

        test('parses GPX with Garmin namespace', () => {
            const gpx = `<?xml version="1.0" encoding="UTF-8"?>
            <gpx creator="Garmin Connect" version="1.1"
                xmlns:ns3="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"
                xmlns="http://www.topografix.com/GPX/1/1">
                <trk>
                    <trkseg>
                        <trkpt lat="38.9171" lon="-94.4747">
                            <ele>226.4</ele>
                            <time>2026-05-04T13:50:27Z</time>
                            <extensions>
                                <ns3:TrackPointExtension>
                                    <ns3:hr>129</ns3:hr>
                                </ns3:TrackPointExtension>
                            </extensions>
                        </trkpt>
                        <trkpt lat="38.9172" lon="-94.4748">
                            <ele>226.6</ele>
                            <time>2026-05-04T13:50:28Z</time>
                        </trkpt>
                    </trkseg>
                </trk>
            </gpx>`;

            const data = GpxParser.parse(gpx);

            expect(data.points.length).toBe(2);
            expect(data.points[0].elevation).toBe(226.4);
        });

        test('throws on invalid GPX', () => {
            expect(() => GpxParser.parse('not xml')).toThrow();
        });

        test('throws on empty trackpoints', () => {
            const gpx = `<?xml version="1.0" encoding="UTF-8"?>
            <gpx version="1.1"></gpx>`;

            expect(() => GpxParser.parse(gpx)).toThrow('No trackpoints found');
        });
    });

    describe('Coordinate conversion', () => {
        test('first point starts at origin', () => {
            const gpx = `<?xml version="1.0" encoding="UTF-8"?>
            <gpx version="1.1">
                <trk><trkseg>
                    <trkpt lat="38.9" lon="-94.4"><ele>200</ele><time>2026-05-04T13:50:00Z</time></trkpt>
                    <trkpt lat="38.91" lon="-94.39"><ele>210</ele><time>2026-05-04T13:51:00Z</time></trkpt>
                </trkseg></trk>
            </gpx>`;

            const data = GpxParser.parse(gpx);

            expect(data.points[0].x).toBeCloseTo(0);
            expect(data.points[0].z).toBeCloseTo(0);
            expect(data.points[1].x).toBeGreaterThan(0);
            expect(data.points[1].z).toBeGreaterThan(0);
        });

        test('coordinates are in meters', () => {
            const gpx = `<?xml version="1.0" encoding="UTF-8"?>
            <gpx version="1.1">
                <trk><trkseg>
                    <trkpt lat="0" lon="0"><ele>0</ele><time>2026-05-04T13:50:00Z</time></trkpt>
                    <trkpt lat="0.001" lon="0"><ele>0</ele><time>2026-05-04T13:51:00Z</time></trkpt>
                </trkseg></trk>
            </gpx>`;

            const data = GpxParser.parse(gpx);

            expect(data.points[1].z).toBeCloseTo(111.32, 1);
        });
    });

    describe('Distance calculation', () => {
        test('first point distanceFromStart is 0', () => {
            const gpx = `<?xml version="1.0" encoding="UTF-8"?>
            <gpx version="1.1">
                <trk><trkseg>
                    <trkpt lat="38.9" lon="-94.4"><ele>200</ele><time>2026-05-04T13:50:00Z</time></trkpt>
                    <trkpt lat="38.91" lon="-94.4"><ele>200</ele><time>2026-05-04T13:51:00Z</time></trkpt>
                </trkseg></trk>
            </gpx>`;

            const data = GpxParser.parse(gpx);

            expect(data.points[0].distanceFromStart).toBe(0);
            expect(data.points[1].distanceFromStart).toBeGreaterThan(0);
        });

        test('cumulative distance increases monotonically', () => {
            const gpx = `<?xml version="1.0" encoding="UTF-8"?>
            <gpx version="1.1">
                <trk><trkseg>
                    <trkpt lat="38.9" lon="-94.4"><ele>200</ele><time>2026-05-04T13:50:00Z</time></trkpt>
                    <trkpt lat="38.91" lon="-94.41"><ele>205</ele><time>2026-05-04T13:51:00Z</time></trkpt>
                    <trkpt lat="38.92" lon="-94.42"><ele>210</ele><time>2026-05-04T13:52:00Z</time></trkpt>
                    <trkpt lat="38.93" lon="-94.43"><ele>215</ele><time>2026-05-04T13:53:00Z</time></trkpt>
                </trkseg></trk>
            </gpx>`;

            const data = GpxParser.parse(gpx);

            for (let i = 1; i < data.points.length; i++) {
                expect(data.points[i].distanceFromStart).toBeGreaterThan(data.points[i - 1].distanceFromStart);
            }
        });
    });

    describe('Time calculation', () => {
        test('calculates total duration correctly', () => {
            const gpx = `<?xml version="1.0" encoding="UTF-8"?>
            <gpx version="1.1">
                <trk><trkseg>
                    <trkpt lat="38.9" lon="-94.4"><ele>200</ele><time>2026-05-04T13:50:00Z</time></trkpt>
                    <trkpt lat="38.91" lon="-94.41"><ele>210</ele><time>2026-05-04T13:51:00Z</time></trkpt>
                </trkseg></trk>
            </gpx>`;

            const data = GpxParser.parse(gpx);

            expect(data.stats.totalDuration).toBe(60000);
        });

        test('elapsedTime starts at 0', () => {
            const gpx = `<?xml version="1.0" encoding="UTF-8"?>
            <gpx version="1.1">
                <trk><trkseg>
                    <trkpt lat="38.9" lon="-94.4"><ele>200</ele><time>2026-05-04T13:50:00Z</time></trkpt>
                    <trkpt lat="38.91" lon="-94.41"><ele>210</ele><time>2026-05-04T13:52:00Z</time></trkpt>
                </trkseg></trk>
            </gpx>`;

            const data = GpxParser.parse(gpx);

            expect(data.points[0].elapsedTime).toBe(0);
            expect(data.points[1].elapsedTime).toBe(120000);
        });

        test('handles GPX without timestamps', () => {
            const gpx = `<?xml version="1.0" encoding="UTF-8"?>
            <gpx version="1.1">
                <trk><trkseg>
                    <trkpt lat="38.9" lon="-94.4"><ele>200</ele></trkpt>
                    <trkpt lat="38.91" lon="-94.41"><ele>210</ele></trkpt>
                </trkseg></trk>
            </gpx>`;

            const data = GpxParser.parse(gpx);

            expect(data.points.length).toBe(2);
            expect(data.points[0].elapsedTime).toBe(0);
        });
    });

    describe('Stats', () => {
        test('calculates elevation gain', () => {
            const gpx = `<?xml version="1.0" encoding="UTF-8"?>
            <gpx version="1.1">
                <trk><trkseg>
                    <trkpt lat="38.9" lon="-94.4"><ele>100</ele><time>2026-05-04T13:50:00Z</time></trkpt>
                    <trkpt lat="38.91" lon="-94.4"><ele>200</ele><time>2026-05-04T13:51:00Z</time></trkpt>
                    <trkpt lat="38.92" lon="-94.4"><ele>150</ele><time>2026-05-04T13:52:00Z</time></trkpt>
                </trkseg></trk>
            </gpx>`;

            const data = GpxParser.parse(gpx);

            expect(data.stats.maxElevation).toBe(200);
            expect(data.stats.minElevation).toBe(100);
            expect(data.stats.elevationGain).toBe(100);
        });
    });

    describe('Formatting utilities', () => {
        test('formatDuration for minutes and seconds', () => {
            expect(GpxParser.formatDuration(65000)).toBe('1:05');
        });

        test('formatDuration for hours', () => {
            expect(GpxParser.formatDuration(3661000)).toBe('1:01:01');
        });

        test('formatDistance in meters', () => {
            expect(GpxParser.formatDistance(500)).toBe('500 m');
        });

        test('formatDistance in kilometers', () => {
            expect(GpxParser.formatDistance(1500)).toBe('1.50 km');
        });

        test('formatSpeed', () => {
            expect(GpxParser.formatSpeed(10)).toBe('36.0 km/h');
        });
    });

    describe('Real Garmin GPX file', () => {
        let realData;

        beforeAll(() => {
            realData = GpxParser.parse(gpxFileContent);
        });

        test('parses all trackpoints', () => {
            expect(realData.points.length).toBeGreaterThan(0);
        });

        test('has valid distance', () => {
            expect(realData.stats.totalDistance).toBeGreaterThan(0);
        });

        test('has valid duration', () => {
            expect(realData.stats.totalDuration).toBeGreaterThan(0);
        });

        test('has valid elevation data', () => {
            expect(realData.stats.maxElevation).toBeGreaterThan(realData.stats.minElevation);
        });

        test('all points have x, y, z coordinates', () => {
            realData.points.forEach(pt => {
                expect(typeof pt.x).toBe('number');
                expect(typeof pt.y).toBe('number');
                expect(typeof pt.z).toBe('number');
            });
        });

        test('all points have elapsedTime', () => {
            realData.points.forEach(pt => {
                expect(typeof pt.elapsedTime).toBe('number');
                expect(pt.elapsedTime).toBeGreaterThanOrEqual(0);
            });
        });

        test('distanceFromStart is monotonically increasing', () => {
            for (let i = 1; i < realData.points.length; i++) {
                expect(realData.points[i].distanceFromStart)
                    .toBeGreaterThanOrEqual(realData.points[i - 1].distanceFromStart);
            }
        });

        test('elapsedTime is monotonically increasing', () => {
            for (let i = 1; i < realData.points.length; i++) {
                expect(realData.points[i].elapsedTime)
                    .toBeGreaterThanOrEqual(realData.points[i - 1].elapsedTime);
            }
        });

        test('center coordinates are reasonable', () => {
            expect(realData.center.lat).toBeCloseTo(38.9, 0);
            expect(realData.center.lon).toBeCloseTo(-94.5, 0);
        });
    });
});
