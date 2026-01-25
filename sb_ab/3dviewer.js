import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function createMagento3DViewer(options = {})
{
    // Default gradient colors if none are provided
    const {
        topColorHex = 0x4A5A6A,     // medium grayish blue
        bottomColorHex = 0x7B8D9A,  // lighter gray‑blue
        modelPosition = new THREE.Vector3(-0.25,-1.0,0.0),
        previewPortraitPng = "",
        previewLandscapePng = "",
        baseMaterinalName = "",
        defaultColor = "RAL 9001",
        colorList = {
            "Whites": {
            "List": [
                {"RAL 9001": "#FDF4E3"},{"RAL 9002": "#E7EBDA"}
            ],
            "Color": "#FFFFFF"
            }
        },
        modelScale = 1.15,
        modelUrl = "",
        envPngUrl = ""
    } = options;

    function isSafariIOS() 
    {
        const ua = navigator.userAgent;
        const isIOS = /iPad|iPhone|iPod/.test(ua) || 
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
        return isIOS && isSafari;
    }

    let renderer;
    let viewer;

    // conservative settings
    renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: true,
        powerPreference: 'low-power'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.NoToneMapping;
    document.body.appendChild(renderer.domElement);

    // Scene
    const scene = new THREE.Scene();

    // Camera
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(2.5, 1.6, 3.5);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enableZoom = true;
    controls.enableRotate = true;
    controls.enablePan = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 0.5;
    controls.maxDistance = 6.0;
    controls.target.set(0, 0.75, 0);

    // Custom behavior: Shift+Left pans instead of rotates
    renderer.domElement.addEventListener('mousedown', (event) => {
        if (event.button === 0 && event.shiftKey) {
            controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
        } else {
            controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
        }
    });

    // --- Auto orbit parameters ---
    const cycleDuration = 30000; // 30s per full revolution
    const idleDelay = 60000;     // 1 min idle before auto orbit resumes
    const lookAtHeight = 1;
    const radius = 5;
    const height = 1.5;

    let autoOrbit = true;
    let lastInteraction = performance.now();
    let startTime = performance.now();

    // --- Interaction listener ---
    ["mousedown","touchstart","wheel"].forEach(evt => {
        renderer.domElement.addEventListener(evt, () => {
            autoOrbit = false;
            controls.enabled = true;
            lastInteraction = performance.now();
        });
    });

    // --- Preview Plane ---
    let previewMesh = null;
    let previewCamera = null;

    function addPreviewTexture() {
        const aspect = window.innerWidth / window.innerHeight;
        const previewUrl = aspect > 1 ? previewLandscapePng : previewPortraitPng;
        if (!previewUrl) return;

        const texLoader = new THREE.TextureLoader();
        const texture = texLoader.load(previewUrl);
        texture.colorSpace = THREE.SRGBColorSpace;

        const distance = 1; // plane distance from camera
        const vFov = THREE.MathUtils.degToRad(camera.fov);
        const height = 2 * Math.tan(vFov / 2) * distance;
        const width = height * aspect;

        const geometry = new THREE.PlaneGeometry(width, height);
        const material = new THREE.MeshBasicMaterial(
            { map: texture, toneMapped: false } );
        previewMesh = new THREE.Mesh(geometry, material);
        previewMesh.position.set(0, 0, -distance);

        previewCamera = camera;
        camera.add(previewMesh);
        scene.add(camera);
    }

    // Remove preview
    function removePreviewTexture() {
        if (previewMesh) {
            camera.remove(previewMesh);
            previewMesh.geometry.dispose();
            previewMesh.material.map.dispose();
            previewMesh.material.dispose();
            previewMesh = null;
        }
        if (previewCamera) {
            scene.remove(previewCamera);
            previewCamera = null;
        }
    }

    addPreviewTexture();

    // Loader
    const loader = new GLTFLoader();
    // Create Draco loader
    const dracoLoader = new DRACOLoader();
    // Set the path to Draco decoder files (from three.js examples)
    dracoLoader.setDecoderPath('./jsm/libs/draco/');
    // Set the draco loader
    loader.setDRACOLoader(dracoLoader);

    let mixer; // AnimationMixer
	
	// Utility: Promisify TextureLoader
	function loadTextureWithProgress(url, onProgress) {
		return new Promise((resolve, reject) => {
			new THREE.TextureLoader().load(
				url,
				tex => resolve(tex),
				xhr => {
					if (xhr.lengthComputable) {
						onProgress(xhr.loaded, xhr.total);
					}
				},
				err => reject(err)
			);
		});
	}

	// Utility: Promisify GLTFLoader
	function loadGLTFWithProgress(url, onProgress) {
		return new Promise((resolve, reject) => {
			loader.load(
				url,
				gltf => resolve(gltf),
				xhr => {
					if (xhr.lengthComputable) {
						onProgress(xhr.loaded, xhr.total);
					}
				},
				err => reject(err)
			);
		});
	}

	// Track progress
	let envLoaded = 0, envTotal = 1;
	let modelLoaded = 0, modelTotal = 1;

	function updateCombinedProgress() {
		const percent = Math.round(
			((envLoaded / envTotal) + (modelLoaded / modelTotal)) / 2 * 100
		);
		document.getElementById("loading").innerText = `${percent}%`;
	}

	// Start both loads in parallel
	const envPromise = loadTextureWithProgress(options.envPngUrl, (loaded, total) => {
		envLoaded = loaded;
		envTotal = total;
		updateCombinedProgress();
	});

	const modelPromise = loadGLTFWithProgress(modelUrl, (loaded, total) => {
		modelLoaded = loaded;
		modelTotal = total;
		updateCombinedProgress();
	});

	// When both finish:
	Promise.all([envPromise, modelPromise]).then(([texture, gltf]) => {

		// Remove loading UI
		document.getElementById("loading").style.display = "none";

		// --- ENVIRONMENT SETUP ---
		const pmremGenerator = new THREE.PMREMGenerator(renderer);
		pmremGenerator.compileEquirectangularShader();

		const envMap = pmremGenerator.fromEquirectangular(texture).texture;
		scene.environment = envMap;
		scene.background = envMap;

		const ambient = new THREE.AmbientLight(0xffffff, 0.2);
		scene.add(ambient);

		texture.dispose();
		pmremGenerator.dispose();

		// --- MODEL SETUP ---
		removePreviewTexture();

		const model = gltf.scene;
		model.position.set(modelPosition.x, modelPosition.y, modelPosition.z);
		model.scale.set(modelScale, modelScale, modelScale);
		scene.add(model);

		// Gradient sky sphere
		const geometry = new THREE.SphereGeometry(100, 32, 32);
		const material = new THREE.ShaderMaterial({
			uniforms: {
				topColor: { value: new THREE.Color(topColorHex) },
				bottomColor: { value: new THREE.Color(bottomColorHex) }
			},
			vertexShader: `
				varying vec3 vPos;
				void main() {
					vPos = position;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
				}
			`,
			fragmentShader: `
				varying vec3 vPos;
				uniform vec3 topColor;
				uniform vec3 bottomColor;
				void main() {
					float mixRatio = (vPos.y + 50.0) / 100.0;
					gl_FragColor = vec4(mix(bottomColor, topColor, mixRatio), 1.0);
				}
			`,
			side: THREE.BackSide
		});

		const sky = new THREE.Mesh(geometry, material);
		scene.add(sky);

		// Animation
		mixer = new THREE.AnimationMixer(model);
		const clip = gltf.animations[0];
		if (clip) mixer.clipAction(clip).play();

		// Default color
		if (defaultColor) {
			applyColor(model, defaultColor, colorList);

			const overlay = document.getElementById("colorSelectorOverlay");
			if (overlay) {
				let hexValue = null;
				for (const group in colorList) {
					colorList[group].List.forEach(entry => {
						if (entry[defaultColor]) hexValue = entry[defaultColor];
					});
				}
				if (hexValue) {
					overlay.style.background = hexValue;
					overlay.textContent = defaultColor;
				}
			}
		}

		controls.update();
	});

    const clock = new THREE.Clock();

    // Animation loop
    function animate() {
        requestAnimationFrame(animate);

        const now = performance.now();

        // If user has been idle for > idleDelay, resume auto orbit
        if (!autoOrbit && now - lastInteraction > idleDelay) {
            autoOrbit = true;
            controls.enabled = false;
            // Reset startTime so interpolation continues smoothly
            startTime = now;
        }

        if (autoOrbit) {
            const elapsed = (now - startTime) % cycleDuration;
            const t = elapsed / cycleDuration; // 0..1
            const angle = t * Math.PI * 2;

            camera.position.set(
                Math.cos(angle) * radius,
                height,
                Math.sin(angle) * radius
            );
            camera.lookAt(0,lookAtHeight,0);
        } else {
            controls.update();
        }

        const delta = clock.getDelta();
        if (mixer) mixer.update(delta);

        renderer.render(scene, camera);
    }

    animate();

    let resizeTimeout;

    function onWindowResize() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            document.body.style.display = "none";
            document.body.offsetHeight; // force reflow
            document.body.style.display = "";
            renderer.setSize(window.innerWidth, window.innerHeight);
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
        }, 200);
    }

    window.addEventListener('resize', onWindowResize);
    window.addEventListener('orientationchange', onWindowResize);

    function applyColor(scene, ralCode, colorList)
    {
        // Find the hex value from the list
        let hexValue = null;
        for (const group in colorList) {
            colorList[group].List.forEach(entry => {
            if (entry[ralCode]) {
                hexValue = entry[ralCode];
            }
            });
        }

        if (!hexValue) {
            console.warn(`Color code ${ralCode} not found`);
            return;
        }

        // Traverse scene and apply color
        scene.traverse(child => {
            if (child.isMesh && child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach(mat => {
                    if (mat.name === baseMaterinalName) {
                    mat.color.set(hexValue);
                    }
                });
            }
        });
    }

    const btn = document.getElementById("fullscreen-icon");

    btn.addEventListener("click", () => {
        const doc = document;
        const docEl = document.documentElement;

        const isFullScreen =
            doc.fullscreenElement ||
            doc.webkitFullscreenElement ||
            doc.mozFullScreenElement ||
            doc.msFullscreenElement;

        if (!isFullScreen) {
            // Enter fullscreen
            if (docEl.requestFullscreen) {
                docEl.requestFullscreen();
            } else if (docEl.webkitRequestFullscreen) { // Safari
                docEl.webkitRequestFullscreen();
            } else if (docEl.mozRequestFullScreen) { // Old Firefox
                docEl.mozRequestFullScreen();
            } else if (docEl.msRequestFullscreen) { // IE/Edge legacy
                docEl.msRequestFullscreen();
            }
        } else {
            // Exit fullscreen
            if (doc.exitFullscreen) {
                doc.exitFullscreen();
            } else if (doc.webkitExitFullscreen) { // Safari
                doc.webkitExitFullscreen();
            } else if (doc.mozCancelFullScreen) {
                doc.mozCancelFullScreen();
            } else if (doc.msExitFullscreen) {
                doc.msExitFullscreen();
            }
        }
    });

    function getReadableTextColor(hex) {
        // Remove '#' if present
        hex = hex.replace('#', '');

        // Parse RGB values
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);

        // Calculate relative luminance (per ITU-R BT.709)
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

        // If luminance is low → background is dark → use white text
        // Otherwise → background is light → use black text
        return luminance < 0.5 ? "#FFFFFF" : "#000000";
    }

    const overlay = document.getElementById('colorSelectorOverlay');
    const grid = document.getElementById('colorGrid');
    let state = 'main';
    let selectedGroup = null;

    // Show groups as a grid of squares
    overlay.addEventListener('click', () => {
        if (state === 'main') {
            overlay.style.display = 'none';
            grid.style.display = 'grid';

            const groups = Object.keys(colorList);
            const count = groups.length;
            const cols = Math.min(5, Math.ceil(Math.sqrt(count)));
            grid.style.gridTemplateColumns = `repeat(${cols}, min(12vh,12vw))`;

            grid.innerHTML = '';
            groups.forEach(group => {
            const cell = document.createElement('div');
            cell.className = 'colorSquare';
            cell.textContent = group;
            const bg = colorList[group].Color;   // background from your list
            cell.style.background = bg;          // set background
            cell.style.color = getReadableTextColor(bg); // set text color to complementary
            cell.onclick = () => {
                selectedGroup = group;
                showColors(group);
            };
            grid.appendChild(cell);
            });

            state = 'groups';
        }
    });

    // Show colors for a group
    function showColors(group) {
        grid.innerHTML = '';
        const colors = colorList[group].List;
        const count = colors.length;
        const cols = Math.min(5, Math.ceil(Math.sqrt(count)));
        grid.style.gridTemplateColumns = `repeat(${cols}, min(12vh,12vw))`;

        colors.forEach(entry => {
            const ral = Object.keys(entry)[0];
            const hex = entry[ral];

            const cell = document.createElement('div');
            cell.className = 'colorSquare';
            cell.style.background = hex;
            cell.style.color = getReadableTextColor(hex);
            cell.textContent = ral;

            cell.onclick = () => {
                viewer.applyColor(viewer.scene, ral, colorList); // 🔑 apply the color
                overlay.style.background = hex;
                overlay.style.color = getReadableTextColor(hex);
                overlay.textContent = ral;
                grid.style.display = 'none';
                overlay.style.display = 'flex';
                state = 'main';
            };

            grid.appendChild(cell);
        });

        state = 'colors';
    }

    // Collapse grid when clicking canvas
    renderer.domElement.addEventListener('click', () => {
        if (grid.style.display === 'grid') {
            grid.style.display = 'none';
            overlay.style.display = 'flex';
            state = 'main';
        }
    });

    // Return a viewer object with everything you need
    viewer = {
        scene,
        renderer,
        camera,
        controls,
        params: options,
        applyColor
    };

    return viewer;
}
