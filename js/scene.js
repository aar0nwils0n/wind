export class Scene3D {
    constructor(container) {
        this.container = container;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.pathLine = null;
        this.glowLine = null;
        this.marker = null;
        this.markerGlow = null;
        this.groundPlane = null;
        this.data = null;
        this.currentPointIndex = 0;
        this.cameraTarget = new THREE.Vector3();
        this.cameraPosition = new THREE.Vector3();
        this.isInitialized = false;
        this.isDragging = false;
        this.previousMousePosition = { x: 0, y: 0 };
        this.spherical = { radius: 0, theta: 0, phi: 0 };
        this.windParticles = [];
        this.windDirection = 0;
        this.satelliteGroup = null;
        this.tileBounds = null;

        this.init();
    }

    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0a);

        this.rootGroup = new THREE.Group();
        this.scene.add(this.rootGroup);
        this.rootGroup.scale.x = -1;

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);

        this.camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.5,
            10000
        );

        this.createGroundPlane();

        window.addEventListener('resize', () => this.onResize());
        window.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
        this.renderer.domElement.addEventListener('mousedown', (e) => this.onMouseDown(e));
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('mouseup', () => this.onMouseUp());

        this.isInitialized = true;
    }

    createGroundPlane() {
        const planeSize = 20;
        const geometry = new THREE.PlaneGeometry(planeSize, planeSize);
        const material = new THREE.MeshBasicMaterial({
            color: 0x1a1a2e
        });

        this.groundPlane = new THREE.Mesh(geometry, material);
        this.groundPlane.rotation.x = -Math.PI / 2;
        this.groundPlane.position.y = -1;
        this.rootGroup.add(this.groundPlane);
    }

    setWindDirection(deg) {
        this.windDirection = deg;
        this.clearWindParticles();
        this.createWindParticles();
    }

    createSatelliteGround(centerLat, centerLon, bounds) {
        const zoom = 15;
        const centerX = Math.floor((centerLon + 180) / 360 * Math.pow(2, zoom));
        const centerY = Math.floor(
            (1 - Math.log(Math.tan(centerLat * Math.PI / 180) + 1 / Math.cos(centerLat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)
        );

        const tileRadius = 2;
        const metersPerDegreeLon = 111320 * Math.cos(centerLat * Math.PI / 180);
        const metersPerDegreeLat = 111320;

        const tileLonWidth = 360 / Math.pow(2, zoom);

        const newGroup = new THREE.Group();
        newGroup.visible = false;

        const tileMeshes = [];
        const tileUrls = [];

        let minTileX = Infinity;
        let maxTileX = -Infinity;
        let minTileZ = Infinity;
        let maxTileZ = -Infinity;

        for (let dy = -tileRadius; dy <= tileRadius; dy++) {
            for (let dx = -tileRadius; dx <= tileRadius; dx++) {
                const tx = centerX + dx;
                const ty = centerY + dy;
                const tileUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${tx}`;
                tileUrls.push(tileUrl);

                const tileCenterLon = (tx + 0.5) * tileLonWidth - 180;
                const tileCenterLat = this.tileYToLat(ty + 0.5, zoom);
                const tileNorthLat = this.tileYToLat(ty, zoom);
                const tileSouthLat = this.tileYToLat(ty + 1, zoom);

                const tileWidthMeters = tileLonWidth * metersPerDegreeLon;
                const tileHeightMeters = (tileNorthLat - tileSouthLat) * metersPerDegreeLat;

                const tileX = (tileCenterLon - bounds.minLon) * metersPerDegreeLon;
                const tileZ = (tileCenterLat - bounds.minLat) * metersPerDegreeLat;

                const overlap = 1.002;
                const geometry = new THREE.PlaneGeometry(tileWidthMeters * overlap, tileHeightMeters * overlap);
                const material = new THREE.MeshBasicMaterial({
                    transparent: false,
                    color: 0x2a2a3e,
                    depthWrite: true
                });

                const tile = new THREE.Mesh(geometry, material);
                tile.rotation.x = -Math.PI / 2;
                tile.scale.set(1, -1, 1);
                tile.position.set(tileX, 0, tileZ);
                tile.frustumCulled = false;
                newGroup.add(tile);
                tileMeshes.push(tile);

                minTileX = Math.min(minTileX, tileX - tileWidthMeters * overlap / 2);
                maxTileX = Math.max(maxTileX, tileX + tileWidthMeters * overlap / 2);
                minTileZ = Math.min(minTileZ, tileZ - tileHeightMeters * overlap / 2);
                maxTileZ = Math.max(maxTileZ, tileZ + tileHeightMeters * overlap / 2);
            }
        }

        const loadPromises = tileMeshes.map((tile, index) => {
            const loader = new THREE.TextureLoader();
            loader.crossOrigin = 'anonymous';
            return loader.loadAsync(tileUrls[index])
                .then(texture => {
                    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
                    texture.flipY = true;
                    texture.flipX = true;
                    texture.generateMipmaps = true;
                    texture.minFilter = THREE.LinearMipmapLinearFilter;
                    texture.magFilter = THREE.LinearFilter;

                    tile.material.dispose();
                    tile.material = new THREE.MeshBasicMaterial({
                        map: texture,
                        transparent: false,
                        depthWrite: true
                    });
                })
                .catch(() => {});
        });

        return Promise.all(loadPromises).then(() => {
            const oldGroup = this.satelliteGroup;
            this.satelliteGroup = newGroup;
            this.rootGroup.add(this.satelliteGroup);
            newGroup.visible = true;

            this.tileBounds = { minX: minTileX, maxX: maxTileX, minZ: minTileZ, maxZ: maxTileZ };

            if (oldGroup) {
                this.rootGroup.remove(oldGroup);
                oldGroup.traverse(obj => {
                    if (obj.geometry) obj.geometry.dispose();
                    if (obj.material) {
                        if (obj.material.map) obj.material.map.dispose();
                        obj.material.dispose();
                    }
                });
            }

            this.clearWindParticles();
            this.createWindParticles();
        });
    }

    tileYToLat(tileY, zoom) {
        const n = Math.PI - 2 * Math.PI * tileY / Math.pow(2, zoom);
        return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    }

    loadData(gpxData, windDirectionDeg) {
        this.data = gpxData;
        this.currentPointIndex = 0;
        this.pathHeight = 3;
        this.windDirection = windDirectionDeg || 0;
        this.tileBounds = null;

        const minX = Math.min(...gpxData.points.map(p => p.x));
        const maxX = Math.max(...gpxData.points.map(p => p.x));
        const minZ = Math.min(...gpxData.points.map(p => p.z));
        const maxZ = Math.max(...gpxData.points.map(p => p.z));

        const centerX = -(minX + maxX) / 2;
        const centerZ = (minZ + maxZ) / 2;

        const pathSize = Math.max(maxX - minX, maxZ - minZ);

        const fov = this.camera.fov * (Math.PI / 180);
        const distanceForFov = (pathSize / 2) / Math.tan(fov / 2);

        this.cameraOffset = {
            distance: distanceForFov * 0.88,
            height: Math.max(pathSize * 0.3, 50)
        };

        this.cameraTarget.set(centerX, 0, centerZ);
        this.spherical.theta = 0;
        this.spherical.phi = Math.PI / 4;

        this.updateCameraFromSpherical();

        this.clearPath();
        this.clearWindParticles();
        this.createPathLine();
        this.createGlowLine();
        this.createMarker();
        this.createWindParticles();
        return this.createSatelliteGround(gpxData.center.lat, gpxData.center.lon, gpxData.bounds);
    }

    clearPath() {
        if (this.pathLine) {
            this.rootGroup.remove(this.pathLine);
            this.pathLine.geometry.dispose();
            this.pathLine.material.dispose();
            this.pathLine = null;
        }
        if (this.glowLine) {
            this.rootGroup.remove(this.glowLine);
            this.glowLine.geometry.dispose();
            this.glowLine.material.dispose();
            this.glowLine = null;
        }
        if (this.marker) {
            this.rootGroup.remove(this.marker);
            this.marker.geometry.dispose();
            this.marker.material.dispose();
            this.marker = null;
        }
    }

    clearWindParticles() {
        this.windParticles.forEach(p => {
            this.rootGroup.remove(p.head);
            p.head.geometry.dispose();
            p.head.material.dispose();
            p.trail.forEach(m => {
                this.rootGroup.remove(m);
                m.geometry.dispose();
                m.material.dispose();
            });
        });
        this.windParticles = [];
    }

     createWindParticles() {
        const rad = (this.windDirection - 90) * Math.PI / 180;
        this.windDirX = -Math.cos(rad);
        this.windDirZ = Math.sin(rad);

        let minX, maxX, minZ, maxZ;
        if (this.tileBounds) {
            minX = this.tileBounds.minX;
            maxX = this.tileBounds.maxX;
            minZ = this.tileBounds.minZ;
            maxZ = this.tileBounds.maxZ;
        } else {
            const points = this.data.points;
            minX = Math.min(...points.map(p => p.x));
            maxX = Math.max(...points.map(p => p.x));
            minZ = Math.min(...points.map(p => p.z));
            maxZ = Math.max(...points.map(p => p.z));
        }
        const w = maxX - minX || 600;
        const d = maxZ - minZ || 600;

        const count = 2000;
        const trailLength = 6;

        for (let i = 0; i < count; i++) {
            const headGeo = new THREE.SphereGeometry(4, 6, 6);
            const headMat = new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.5 });
            const head = new THREE.Mesh(headGeo, headMat);

            const x = minX - 50 + Math.random() * (w + 100);
            const z = minZ - 50 + Math.random() * (d + 100);
            const y = this.pathHeight + 30 + Math.random() * 60;
            head.position.set(x, y, z);
            this.rootGroup.add(head);

            const trail = [];
            for (let j = 1; j <= trailLength; j++) {
                const tGeo = new THREE.SphereGeometry(4 * (1 - j / trailLength), 4, 4);
                const tMat = new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.5 * (1 - j / trailLength) });
                const t = new THREE.Mesh(tGeo, tMat);
                t.position.set(x - this.windDirX * j * 10, y, z - this.windDirZ * j * 10);
                this.rootGroup.add(t);
                trail.push(t);
            }

            this.windParticles.push({
                head,
                trail,
                speed: 10 + Math.random() * 8,
                x: x,
                z: z,
                y: y
            });
        }
    }

    createPathLine() {
        const positions = new Float32Array(this.data.points.length * 3);
        this.data.points.forEach((pt, i) => {
            positions[i * 3] = pt.x;
            positions[i * 3 + 1] = this.pathHeight;
            positions[i * 3 + 2] = pt.z;
        });

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const colors = new Float32Array(this.data.points.length * 3);
        const gradientColors = [
            new THREE.Color(0x00d4ff),
            new THREE.Color(0x7b2cbf),
            new THREE.Color(0xff006e)
        ];

        this.data.points.forEach((pt, i) => {
            const t = i / (this.data.points.length - 1);
            const colorIndex = t * (gradientColors.length - 1);
            const idx1 = Math.floor(colorIndex);
            const idx2 = Math.min(idx1 + 1, gradientColors.length - 1);
            const frac = colorIndex - idx1;
            const color = gradientColors[idx1].clone().lerp(gradientColors[idx2], frac);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        });

        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.LineBasicMaterial({
            vertexColors: true,
            linewidth: 1,
            transparent: true,
            opacity: 0.95
        });

        this.pathLine = new THREE.Line(geometry, material);
        this.pathLine.frustumCulled = false;
        this.rootGroup.add(this.pathLine);
    }

    createGlowLine() {
        const positions = new Float32Array(this.data.points.length * 3);
        this.data.points.forEach((pt, i) => {
            positions[i * 3] = pt.x;
            positions[i * 3 + 1] = this.pathHeight;
            positions[i * 3 + 2] = pt.z;
        });

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.LineBasicMaterial({
            color: 0x00d4ff,
            transparent: true,
            opacity: 0.15,
            linewidth: 1
        });

        this.glowLine = new THREE.Line(geometry, material);
        this.glowLine.scale.set(1.01, 1.01, 1.01);
        this.glowLine.frustumCulled = false;
        this.rootGroup.add(this.glowLine);
    }

    createMarker() {
        const geometry = new THREE.SphereGeometry(8, 16, 16);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ff88
        });

        this.marker = new THREE.Mesh(geometry, material);

        const glowGeometry = new THREE.SphereGeometry(15, 16, 16);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0.2
        });
        this.markerGlow = new THREE.Mesh(glowGeometry, glowMaterial);
        this.marker.add(this.markerGlow);

        this.rootGroup.add(this.marker);
    }

    updateCameraPosition(progress) {
        if (!this.data || !this.cameraOffset) return;

        const pointIndex = Math.floor(progress * (this.data.points.length - 1));
        const currentPoint = this.data.points[pointIndex];

        let lookAheadIndex = Math.min(pointIndex + 30, this.data.points.length - 1);
        const lookAheadPoint = this.data.points[lookAheadIndex];

        const dx = lookAheadPoint.x - currentPoint.x;
        const dz = lookAheadPoint.z - currentPoint.z;
        const angle = Math.atan2(dx, dz);

        const dist = this.cameraOffset.distance;
        const height = this.cameraOffset.height;

        const offsetX = -Math.sin(angle) * dist * 0.3;
        const offsetZ = -Math.cos(angle) * dist * 0.3;

        const cameraX = currentPoint.x + offsetX;
        const cameraZ = currentPoint.z + offsetZ;

        this.cameraTarget.set(-currentPoint.x, 0, currentPoint.z);
        this.cameraPosition.set(-cameraX, height, cameraZ);
    }

    handleWheel(event) {
        event.preventDefault();
        const zoomFactor = 0.1;
        const delta = event.deltaY > 0 ? 1 + zoomFactor : 1 - zoomFactor;

        this.cameraOffset.distance *= delta;
        this.cameraOffset.height *= delta;

        this.cameraOffset.distance = Math.max(this.cameraOffset.distance, 10);
        this.cameraOffset.distance = Math.min(this.cameraOffset.distance, 50000);
        this.cameraOffset.height = Math.max(this.cameraOffset.height, 5);
        this.cameraOffset.height = Math.min(this.cameraOffset.height, 20000);

        this.updateCameraFromSpherical();
    }

    onMouseDown(event) {
        this.isDragging = true;
        this.previousMousePosition = { x: event.clientX, y: event.clientY };
    }

    onMouseMove(event) {
        if (!this.isDragging) return;

        const deltaX = event.clientX - this.previousMousePosition.x;
        const deltaY = event.clientY - this.previousMousePosition.y;

        this.spherical.theta -= deltaX * 0.005;
        this.spherical.phi -= deltaY * 0.005;
        this.spherical.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.1, this.spherical.phi));

        this.previousMousePosition = { x: event.clientX, y: event.clientY };
        this.updateCameraFromSpherical();
    }

    onMouseUp() {
        this.isDragging = false;
    }

    updateCameraFromSpherical() {
        if (!this.cameraOffset || !this.cameraTarget) return;

        const r = this.cameraOffset.distance;
        const theta = this.spherical.theta;
        const phi = this.spherical.phi;

        this.cameraPosition.x = r * Math.sin(phi) * Math.cos(theta);
        this.cameraPosition.y = r * Math.cos(phi) + this.cameraOffset.height;
        this.cameraPosition.z = r * Math.sin(phi) * Math.sin(theta);

        const center = this.cameraTarget;
        this.cameraPosition.x += center.x;
        this.cameraPosition.z += center.z;
    }

    updateCameraSmooth() {
        if (!this.cameraPosition) return;

        this.camera.position.lerp(this.cameraPosition, 0.08);

        const lookTarget = new THREE.Vector3(
            this.cameraTarget.x,
            0,
            this.cameraTarget.z
        );
        this.camera.lookAt(lookTarget);
    }

    updateProgress(progress) {
        if (!this.data) return;

        const totalPoints = this.data.points.length;
        const visiblePoints = Math.floor(progress * totalPoints);

        if (this.pathLine) {
            this.pathLine.geometry.setDrawRange(0, visiblePoints);
        }

        if (this.glowLine) {
            this.glowLine.geometry.setDrawRange(0, visiblePoints);
        }

        if (visiblePoints > 0 && this.marker) {
            const currentPoint = this.data.points[visiblePoints - 1];
            this.marker.position.set(currentPoint.x, this.pathHeight, currentPoint.z);
            this.marker.visible = true;
        } else if (this.marker) {
            this.marker.visible = false;
        }

        if (visiblePoints > 0) {
            const currentPoint = this.data.points[visiblePoints - 1];
            this.cameraTarget.set(-currentPoint.x, 0, currentPoint.z);
            this.updateCameraFromSpherical();
        }

        this.currentPointIndex = visiblePoints;
    }

    animate() {
        if (this.cameraPosition && this.cameraTarget) {
            this.camera.position.copy(this.cameraPosition);
            this.camera.lookAt(this.cameraTarget);
        }

        if (!this.data) return;

        if (this.marker && this.marker.visible) {
            const pulse = Math.sin(Date.now() * 0.005) * 0.1 + 1;
            this.markerGlow.scale.set(pulse, pulse, pulse);
        }

        let minX, maxX, minZ, maxZ;
        if (this.tileBounds) {
            minX = this.tileBounds.minX;
            maxX = this.tileBounds.maxX;
            minZ = this.tileBounds.minZ;
            maxZ = this.tileBounds.maxZ;
        } else {
            const points = this.data.points;
            minX = Math.min(...points.map(p => p.x)) - 50;
            maxX = Math.max(...points.map(p => p.x)) + 50;
            minZ = Math.min(...points.map(p => p.z)) - 50;
            maxZ = Math.max(...points.map(p => p.z)) + 50;
        }
        const w = maxX - minX;
        const d = maxZ - minZ;

        this.windParticles.forEach(p => {
            const dt = 0.016;
            p.x += this.windDirX * p.speed * dt;
            p.z += this.windDirZ * p.speed * dt;

            if (p.x > maxX) p.x -= w;
            if (p.x < minX) p.x += w;
            if (p.z > maxZ) p.z -= d;
            if (p.z < minZ) p.z += d;

            p.head.position.set(p.x, p.y, p.z);

            p.trail.forEach((m, j) => {
                const s = (j + 1) * 12;
                m.position.set(p.x - this.windDirX * s, p.y, p.z - this.windDirZ * s);
            });
        });

        this.renderer.render(this.scene, this.camera);
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    dispose() {
        this.renderer.dispose();
        if (this.container.contains(this.renderer.domElement)) {
            this.container.removeChild(this.renderer.domElement);
        }
    }
}
