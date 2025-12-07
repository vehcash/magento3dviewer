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
        baseMaterinalName = "",
        defaultColor = "RAL 9001",
        colorList = {
            "Whites": {
            "List": [
                {"RAL 9001": "#FDF4E3"},{"RAL 9002": "#E7EBDA"}
            ],
            "Color": "#FFFFFF"
            },
            "Blacks": {
            "List": [
                {"RAL 9022": "#9C9C9C"},{"RAL 9023": "#828282"}
            ],
            "Color": "#282828"
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

    if (isSafariIOS())
    {
        // Safari/iOS: conservative settings
        renderer = new THREE.WebGLRenderer({
            antialias: false,
            alpha: true,
            powerPreference: 'low-power'
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    } 
    else 
    {
        // Default (desktop/other browsers)
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
    }

    renderer.setSize(window.innerWidth, window.innerHeight);
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

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(3, 5, 2);
    scene.add(dirLight);

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

    // Gradient Sky Sphere
    const geometry = new THREE.SphereGeometry(100, 32, 32);
    const material = new THREE.ShaderMaterial({
        uniforms: {
            topColor:   { value: new THREE.Color(topColorHex) },
            bottomColor:{ value: new THREE.Color(bottomColorHex) }
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
            float mixRatio = (vPos.y + 50.0) / 100.0; // adjust for sphere size
            gl_FragColor = vec4(mix(bottomColor, topColor, mixRatio), 1.0);
            }
        `,
        side: THREE.BackSide
    });
    
    const sky = new THREE.Mesh(geometry, material);
    scene.add(sky);

    // Loader
    const loader = new GLTFLoader();
    // Create Draco loader
    const dracoLoader = new DRACOLoader();
    // Set the path to Draco decoder files (from three.js examples)
    dracoLoader.setDecoderPath('./jsm/libs/draco/');
    // Set the draco loader
    loader.setDRACOLoader(dracoLoader);

    let mixer; // AnimationMixer

    loader.load(modelUrl, (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        model.position.set( modelPosition.x, modelPosition.y, modelPosition.z );
        model.scale.set( modelScale, modelScale, modelScale );
        scene.add(model);

        // Create mixer for the whole scene
        mixer = new THREE.AnimationMixer(model);

        // Play the first animation clip (global one)
        const clip = gltf.animations[0];
        if (clip) {
            const action = mixer.clipAction(clip);
            action.play();
        }

        // 👇 Apply default color immediately after model is added
        if (defaultColor) {
            applyColor(model, defaultColor, colorList);

            // 🔑 Update overlay div with the default color and name
            const overlay = document.getElementById("colorSelectorOverlay");
            if (overlay) {
                // Find hex value from colorList
                let hexValue = null;
                for (const group in colorList) {
                    colorList[group].List.forEach(entry => {
                    if (entry[defaultColor]) {
                        hexValue = entry[defaultColor];
                    }
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

    // PMREM generator
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    const texture_loader = new THREE.TextureLoader().load(
        options.envPngUrl, // path to your PNG
        (texture) => {
            const envMap = pmremGenerator.fromEquirectangular(texture).texture;
            scene.environment = envMap;
            scene.background = envMap; // optional: show PNG as background
            texture.dispose();
            pmremGenerator.dispose();
        },
        undefined,
        (err) => console.warn('PNG env failed:', err)
    );

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

    // Resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

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
            grid.style.gridTemplateColumns = `repeat(${cols}, max(7vh,7vw))`;

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
        grid.style.gridTemplateColumns = `repeat(${cols}, max(7vh,7vw))`;

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
