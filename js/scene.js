class Scene3D {
    constructor(container) {
        this.container = container;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.pathLine = null;
        this.glowLine = null;
        this.marker = null;
        this.groundPlane = null;
        this.data = null;
        this.currentPointIndex = 0;
        this.cameraTarget = new THREE.Vector3();
        this.cameraPosition = new THREE.Vector3();
        this.isInitialized = false;

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
            }
        }

        const totalTiles = tileMeshes.length;
        let loadedCount = 0;

        tileMeshes.forEach((tile, index) => {
            const loader = new THREE.TextureLoader();
            loader.crossOrigin = 'anonymous';
            loader.load(
                tileUrls[index],
                (texture) => {
                    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
                    texture.flipY = true;
                    texture.flipX = true
                    texture.generateMipmaps = true;
                    texture.minFilter = THREE.LinearMipmapLinearFilter;
                    texture.magFilter = THREE.LinearFilter;

                    tile.material.dispose();
                    tile.material = new THREE.MeshBasicMaterial({
                        map: texture,
                        transparent: false,
                        depthWrite: true
                    });

                    loadedCount++;
                    if (loadedCount === totalTiles) {
                        const oldGroup = this.satelliteGroup;
                        this.satelliteGroup = newGroup;
                        this.rootGroup.add(this.satelliteGroup);
                        newGroup.visible = true;

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
                    }
                },
                undefined,
                () => {
                    loadedCount++;
                    if (loadedCount === totalTiles) {
                        const oldGroup = this.satelliteGroup;
                        this.satelliteGroup = newGroup;
                        this.rootGroup.add(this.satelliteGroup);
                        newGroup.visible = true;

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
                    }
                }
            );
        });
    }

    tileYToLat(tileY, zoom) {
        const n = Math.PI - 2 * Math.PI * tileY / Math.pow(2, zoom);
        return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    }

    loadData(gpxData) {
        this.data = gpxData;
        this.currentPointIndex = 0;
        this.pathHeight = 3;

        this.clearPath();
        this.createPathLine();
        this.createGlowLine();
        this.createMarker();
        this.createSatelliteGround(gpxData.center.lat, gpxData.center.lon, gpxData.bounds);

        const minX = Math.min(...gpxData.points.map(p => p.x));
        const maxX = Math.max(...gpxData.points.map(p => p.x));
        const minZ = Math.min(...gpxData.points.map(p => p.z));
        const maxZ = Math.max(...gpxData.points.map(p => p.z));

        const pathWidth = maxX - minX;
        const pathLength = maxZ - minZ;
        const pathSize = Math.max(pathWidth, pathLength);

        const fov = this.camera.fov * (Math.PI / 180);
        const distanceForFov = (pathSize / 2) / Math.tan(fov / 2);
        const cameraDistance = distanceForFov * 0.88;
        const cameraHeight = Math.max(pathSize * 0.3, 50);

        this.cameraOffset = {
            distance: cameraDistance,
            height: cameraHeight,
            angle: Math.PI / 2.2
        };

        this.updateCameraPosition(0);

        this.camera.position.copy(this.cameraPosition);
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

        this.updateCameraPosition(progress);
        this.currentPointIndex = visiblePoints;
    }

    animate() {
        this.updateCameraSmooth();

        if (this.marker && this.marker.visible) {
            const pulse = Math.sin(Date.now() * 0.005) * 0.1 + 1;
            this.markerGlow.scale.set(pulse, pulse, pulse);
        }

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
