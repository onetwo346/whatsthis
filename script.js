class WhatIsThis {
    constructor() {
        this.currentScreen = 'intro';
        this.cameraStream = null;
        this.currentCamera = 'environment';
        this.scanHistory = this.loadHistory();
        this.settings = this.loadSettings();
        this.isScanning = false;
        this.continuousScan = false;
        this.model = null;
        this.detectionInterval = null;
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.applySettings();
        await this.loadModel();
    }

    async loadModel() {
        try {
            console.log('Loading COCO-SSD model in background...');
            this.model = await cocoSsd.load();
            console.log('COCO-SSD model loaded successfully');
        } catch (error) {
            console.error('Failed to load model:', error);
            this.model = null;
        }
    }

    setupEventListeners() {
        document.getElementById('enter-btn').addEventListener('click', () => this.enterCamera());
        document.getElementById('how-it-works-link').addEventListener('click', (e) => {
            e.preventDefault();
            this.showModal('how-it-works-modal');
        });
        document.getElementById('examples-link').addEventListener('click', (e) => {
            e.preventDefault();
            this.showModal('examples-modal');
        });

        document.getElementById('back-btn').addEventListener('click', () => this.showScreen('intro'));
        document.getElementById('history-btn').addEventListener('click', () => this.showHistory());
        document.getElementById('flip-camera-btn').addEventListener('click', () => this.flipCamera());

        document.getElementById('scan-btn').addEventListener('click', () => this.performScan());
        
        let tapCount = 0;
        let tapTimer = null;
        const cameraContainer = document.querySelector('.camera-container');
        cameraContainer.addEventListener('click', (e) => {
            if (e.target.id === 'scan-btn') return;
            
            tapCount++;
            if (tapCount === 1) {
                tapTimer = setTimeout(() => {
                    tapCount = 0;
                }, 300);
            } else if (tapCount === 2) {
                clearTimeout(tapTimer);
                tapCount = 0;
                this.flipCamera();
            }
        });

        let pressTimer = null;
        document.getElementById('scan-btn').addEventListener('mousedown', () => {
            pressTimer = setTimeout(() => {
                this.startContinuousScan();
            }, 500);
        });
        document.getElementById('scan-btn').addEventListener('mouseup', () => {
            clearTimeout(pressTimer);
            if (this.continuousScan) {
                this.stopContinuousScan();
            }
        });
        document.getElementById('scan-btn').addEventListener('touchstart', () => {
            pressTimer = setTimeout(() => {
                this.startContinuousScan();
            }, 500);
        });
        document.getElementById('scan-btn').addEventListener('touchend', () => {
            clearTimeout(pressTimer);
            if (this.continuousScan) {
                this.stopContinuousScan();
            }
        });

        document.getElementById('close-result-btn').addEventListener('click', () => this.closeResultPanel());
        document.getElementById('save-btn').addEventListener('click', () => this.saveCurrentScan());
        document.getElementById('share-btn').addEventListener('click', () => this.shareResult());
        document.getElementById('scan-again-btn').addEventListener('click', () => this.closeResultPanel());

        document.getElementById('history-back-btn').addEventListener('click', () => this.showScreen('camera'));
        document.getElementById('settings-btn').addEventListener('click', () => this.showSettings());

        document.getElementById('settings-back-btn').addEventListener('click', () => this.showHistory());
        document.getElementById('camera-select').addEventListener('change', (e) => {
            this.currentCamera = e.target.value;
            this.saveSettings();
            const cameraName = e.target.value === 'environment' ? 'Back' : 'Front';
            this.showNotification(`Switched to ${cameraName} Camera`);
            if (this.cameraStream) {
                this.stopCamera();
                this.startCamera();
            }
        });
        document.getElementById('scan-mode-select').addEventListener('change', (e) => {
            this.saveSettings();
            const modeName = e.target.value === 'live' ? 'Live Scan' : 'Tap to Scan';
            this.showNotification(`Scan mode: ${modeName}`);
            if (this.cameraStream && this.model) {
                if (e.target.value === 'live') {
                    this.startLiveDetection();
                } else {
                    this.stopLiveDetection();
                }
            }
        });
        document.getElementById('language-select').addEventListener('change', (e) => {
            this.saveSettings();
            const langMap = { 'en': 'English', 'es': 'Español', 'fr': 'Français', 'de': 'Deutsch' };
            this.showNotification(`Language: ${langMap[e.target.value] || e.target.value}`);
        });
        document.getElementById('dark-mode-toggle').addEventListener('change', (e) => {
            this.saveSettings();
            this.applySettings();
            this.showNotification(e.target.checked ? 'Dark mode enabled' : 'Dark mode disabled');
        });
        document.getElementById('auto-save-toggle').addEventListener('change', (e) => {
            this.saveSettings();
            this.showNotification(e.target.checked ? 'Auto-save enabled' : 'Auto-save disabled');
        });
        document.getElementById('clear-history-btn').addEventListener('click', () => this.clearHistory());

        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => this.closeModals());
        });

        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModals();
                }
            });
        });
    }

    async enterCamera() {
        const loadingOverlay = document.getElementById('loading-overlay');
        
        if (!this.model) {
            if (loadingOverlay) {
                loadingOverlay.classList.add('active');
                loadingOverlay.classList.remove('hidden');
            }
            
            await this.loadModel();
            
            if (loadingOverlay) {
                loadingOverlay.classList.remove('active');
                setTimeout(() => {
                    loadingOverlay.classList.add('hidden');
                }, 500);
            }
            
            if (!this.model) {
                this.showNotification('AI model failed to load. Please refresh the page.');
                return;
            }
        }
        
        this.showScreen('camera');
        await this.startCamera();
    }

    async startCamera() {
        if (this.cameraStream) {
            return;
        }
        
        try {
            const constraints = {
                video: {
                    facingMode: this.currentCamera,
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            };

            this.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
            const video = document.getElementById('camera-feed');
            video.srcObject = this.cameraStream;
            
            await new Promise(resolve => {
                video.onloadedmetadata = () => resolve();
            });
            
            const scanMode = this.settings.scanMode || 'tap';
            if (scanMode === 'live') {
                this.showNotification('Live scan mode active');
                if (this.model) {
                    this.startLiveDetection();
                }
            } else {
                this.showNotification('Camera ready! Tap to scan');
            }
        } catch (error) {
            console.error('Camera error:', error);
            this.showNotification('Camera access denied. Please enable camera permissions.');
        }
    }

    startLiveDetection() {
        if (this.detectionInterval || !this.model) return;
        
        this.detectionInterval = setInterval(async () => {
            if (this.model && !this.isScanning) {
                await this.detectObjectsInView();
            }
        }, 1000);
    }

    stopLiveDetection() {
        if (this.detectionInterval) {
            clearInterval(this.detectionInterval);
            this.detectionInterval = null;
        }
    }

    async detectObjectsInView() {
        const video = document.getElementById('camera-feed');
        if (!video || video.readyState !== 4 || !this.model) return;
        
        try {
            const predictions = await this.model.detect(video);
            
            if (predictions.length > 0) {
                const topPrediction = predictions[0];
                if (topPrediction.score > 0.6) {
                    this.showLiveBoundingBox(topPrediction);
                } else {
                    const boundingBox = document.getElementById('bounding-box');
                    const objectLabel = document.getElementById('object-label');
                    boundingBox.classList.add('hidden');
                    objectLabel.classList.add('hidden');
                }
            } else {
                const boundingBox = document.getElementById('bounding-box');
                const objectLabel = document.getElementById('object-label');
                boundingBox.classList.add('hidden');
                objectLabel.classList.add('hidden');
            }
        } catch (error) {
            console.error('Detection error:', error);
        }
    }

    showLiveBoundingBox(prediction) {
        const boundingBox = document.getElementById('bounding-box');
        const objectLabel = document.getElementById('object-label');
        
        const [x, y, width, height] = prediction.bbox;
        
        boundingBox.style.left = x + 'px';
        boundingBox.style.top = y + 'px';
        boundingBox.style.width = width + 'px';
        boundingBox.style.height = height + 'px';
        
        boundingBox.classList.remove('hidden');
        objectLabel.classList.remove('hidden');
        
        document.getElementById('object-name').textContent = this.formatObjectName(prediction.class);
        document.getElementById('confidence').textContent = (prediction.score * 100).toFixed(1) + '%';
    }

    stopCamera() {
        this.stopLiveDetection();
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
        }
        const boundingBox = document.getElementById('bounding-box');
        const objectLabel = document.getElementById('object-label');
        boundingBox.classList.add('hidden');
        objectLabel.classList.add('hidden');
    }

    async flipCamera() {
        this.currentCamera = this.currentCamera === 'environment' ? 'user' : 'environment';
        const cameraSelect = document.getElementById('camera-select');
        if (cameraSelect) {
            cameraSelect.value = this.currentCamera;
        }
        this.saveSettings();
        
        if (this.cameraStream) {
            this.stopCamera();
            await this.startCamera();
        }
    }

    async performScan() {
        if (this.isScanning || !this.model) {
            if (!this.model) {
                this.showNotification('AI model still loading...');
            }
            return;
        }
        
        this.isScanning = true;
        this.showNotification('Scanning...');
        
        const scanBtn = document.getElementById('scan-btn');
        scanBtn.style.transform = 'scale(0.9)';
        
        setTimeout(() => {
            scanBtn.style.transform = 'scale(1)';
        }, 200);

        await this.performRealAIRecognition();
        
        this.isScanning = false;
    }

    startContinuousScan() {
        this.continuousScan = true;
        this.showNotification('Continuous scanning active');
        document.querySelector('.scan-hint').textContent = 'Scanning...';
        
        this.continuousScanInterval = setInterval(() => {
            if (!this.isScanning) {
                this.performScan();
            }
        }, 1500);
    }

    stopContinuousScan() {
        this.continuousScan = false;
        clearInterval(this.continuousScanInterval);
        document.querySelector('.scan-hint').textContent = 'Tap to Scan';
        this.showNotification('Continuous scan stopped');
    }

    async performRealAIRecognition() {
        const video = document.getElementById('camera-feed');
        
        if (!video || video.readyState !== 4) {
            this.showNotification('Camera not ready');
            return;
        }

        try {
            const predictions = await this.model.detect(video);
            
            if (predictions.length === 0) {
                this.showNotification('No objects detected. Try pointing at something else.');
                return;
            }

            const topPrediction = predictions.sort((a, b) => b.score - a.score)[0];
            
            if (topPrediction.score < 0.5) {
                this.showNotification('Low confidence. Try better lighting or closer view.');
                return;
            }

            const result = this.enrichObjectData(topPrediction);
            this.currentScanResult = result;
            
            this.showBoundingBox(topPrediction);
            this.displayResult(result);
            
        } catch (error) {
            console.error('Recognition error:', error);
            this.showNotification('Detection failed. Please try again.');
        }
    }

    formatObjectName(className) {
        return className.split(' ').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }

    enrichObjectData(prediction) {
        const objectName = this.formatObjectName(prediction.class);
        const confidence = (prediction.score * 100).toFixed(1);
        
        const objectDatabase = {
            'person': {
                icon: '👤',
                category: 'Human',
                uses: 'Living being, social interaction',
                origin: 'Homo sapiens',
                warning: 'Respect privacy when scanning people',
                description: 'A human being detected in the camera view.'
            },
            'bicycle': {
                icon: '🚲',
                category: 'Vehicle',
                uses: 'Transportation, exercise, recreation',
                origin: 'Invented in 19th century',
                warning: 'Always wear a helmet when riding',
                description: 'A human-powered pedal-driven vehicle with two wheels attached to a frame.'
            },
            'car': {
                icon: '🚗',
                category: 'Vehicle',
                uses: 'Transportation, travel',
                origin: 'Invented late 1800s',
                warning: 'Stay clear of moving vehicles',
                description: 'A wheeled motor vehicle used for transportation, typically with four wheels.'
            },
            'motorcycle': {
                icon: '🏍️',
                category: 'Vehicle',
                uses: 'Transportation, recreation',
                origin: 'Invented 1885',
                warning: 'Requires protective gear and license',
                description: 'A two-wheeled motor vehicle designed for speed and maneuverability.'
            },
            'airplane': {
                icon: '✈️',
                category: 'Aircraft',
                uses: 'Air transportation, travel',
                origin: 'Invented 1903 by Wright Brothers',
                warning: null,
                description: 'A powered flying vehicle with fixed wings and greater weight than air.'
            },
            'bus': {
                icon: '🚌',
                category: 'Vehicle',
                uses: 'Public transportation',
                origin: 'Early 1900s',
                warning: null,
                description: 'A large motor vehicle designed to carry multiple passengers.'
            },
            'train': {
                icon: '🚂',
                category: 'Vehicle',
                uses: 'Mass transportation, freight',
                origin: 'Invented early 1800s',
                warning: 'Stay clear of tracks',
                description: 'A connected series of rail vehicles propelled along a track.'
            },
            'truck': {
                icon: '🚚',
                category: 'Vehicle',
                uses: 'Cargo transportation, delivery',
                origin: 'Early 1900s',
                warning: 'Large blind spots',
                description: 'A motor vehicle designed to transport cargo.'
            },
            'boat': {
                icon: '⛵',
                category: 'Watercraft',
                uses: 'Water transportation, recreation',
                origin: 'Ancient invention',
                warning: 'Requires safety equipment',
                description: 'A watercraft designed for travel or transport on water.'
            },
            'traffic light': {
                icon: '🚦',
                category: 'Traffic Control',
                uses: 'Road safety, traffic management',
                origin: 'Invented 1912',
                warning: 'Always obey traffic signals',
                description: 'A signaling device positioned at road intersections to control vehicle and pedestrian traffic.'
            },
            'fire hydrant': {
                icon: '🚰',
                category: 'Safety Equipment',
                uses: 'Emergency water supply for firefighting',
                origin: '19th century',
                warning: 'Do not park near or obstruct',
                description: 'A connection point for firefighters to tap into water supply.'
            },
            'stop sign': {
                icon: '🛑',
                category: 'Traffic Sign',
                uses: 'Traffic control, safety',
                origin: 'Invented 1915',
                warning: 'Complete stop required',
                description: 'An octagonal red sign requiring vehicles to come to a complete stop.'
            },
            'parking meter': {
                icon: '🅿️',
                category: 'Parking Equipment',
                uses: 'Parking time and payment management',
                origin: 'Invented 1935',
                warning: null,
                description: 'A device for collecting payment for parking in a designated space.'
            },
            'bench': {
                icon: '🪑',
                category: 'Furniture',
                uses: 'Seating, resting',
                origin: 'Ancient furniture',
                warning: null,
                description: 'A long seat for multiple people, typically found in public spaces.'
            },
            'bird': {
                icon: '🐦',
                category: 'Animal',
                uses: 'Wildlife, ecosystem balance',
                origin: 'Evolved from dinosaurs',
                warning: 'Do not feed wild birds human food',
                description: 'A warm-blooded vertebrate with feathers, wings, and a beak.'
            },
            'cat': {
                icon: '🐱',
                category: 'Pet',
                uses: 'Companion animal, pest control',
                origin: 'Domesticated ~9,500 years ago',
                warning: 'May scratch or bite if threatened',
                description: 'A small carnivorous mammal, one of the most popular pets worldwide.'
            },
            'dog': {
                icon: '🐕',
                category: 'Pet',
                uses: 'Companion animal, service, protection',
                origin: 'Domesticated ~15,000 years ago',
                warning: 'Approach unfamiliar dogs with caution',
                description: 'A domesticated carnivorous mammal, known as human\'s best friend.'
            },
            'horse': {
                icon: '🐴',
                category: 'Animal',
                uses: 'Transportation, agriculture, sport',
                origin: 'Domesticated ~6,000 years ago',
                warning: 'Approach from the side, not behind',
                description: 'A large domesticated mammal used for riding and draft work.'
            },
            'sheep': {
                icon: '🐑',
                category: 'Livestock',
                uses: 'Wool production, meat, milk',
                origin: 'Domesticated ~10,000 years ago',
                warning: null,
                description: 'A domesticated ruminant mammal typically kept for wool and meat.'
            },
            'cow': {
                icon: '🐄',
                category: 'Livestock',
                uses: 'Milk production, meat, leather',
                origin: 'Domesticated ~10,000 years ago',
                warning: 'Can be dangerous if provoked',
                description: 'A large domesticated bovine raised for dairy and meat products.'
            },
            'elephant': {
                icon: '🐘',
                category: 'Wild Animal',
                uses: 'Ecosystem engineering, tourism',
                origin: 'Africa and Asia',
                warning: 'Dangerous - maintain safe distance',
                description: 'The largest land animal, known for intelligence and strong social bonds.'
            },
            'bear': {
                icon: '🐻',
                category: 'Wild Animal',
                uses: 'Ecosystem balance',
                origin: 'Found in Americas, Europe, Asia',
                warning: 'Extremely dangerous - do not approach',
                description: 'A large carnivorous or omnivorous mammal found in various habitats.'
            },
            'zebra': {
                icon: '🦓',
                category: 'Wild Animal',
                uses: 'Wildlife, ecosystem',
                origin: 'Africa',
                warning: 'Wild animal - observe from distance',
                description: 'An African equine known for distinctive black and white stripes.'
            },
            'giraffe': {
                icon: '🦒',
                category: 'Wild Animal',
                uses: 'Wildlife, ecosystem',
                origin: 'Africa',
                warning: 'Wild animal - observe from distance',
                description: 'The tallest living terrestrial animal, known for its long neck.'
            },
            'backpack': {
                icon: '🎒',
                category: 'Bag',
                uses: 'Carrying items, travel, school',
                origin: 'Ancient carrying device',
                warning: null,
                description: 'A bag with shoulder straps for carrying items on one\'s back.'
            },
            'umbrella': {
                icon: '☂️',
                category: 'Accessory',
                uses: 'Rain protection, sun shade',
                origin: 'Ancient invention',
                warning: null,
                description: 'A collapsible canopy used for protection from rain or sun.'
            },
            'handbag': {
                icon: '👜',
                category: 'Bag',
                uses: 'Carrying personal items',
                origin: 'Ancient accessory',
                warning: null,
                description: 'A bag used for carrying personal items, typically by hand or shoulder.'
            },
            'tie': {
                icon: '👔',
                category: 'Clothing',
                uses: 'Formal wear accessory',
                origin: '17th century',
                warning: null,
                description: 'A long piece of cloth worn around the neck, typically for formal occasions.'
            },
            'suitcase': {
                icon: '🧳',
                category: 'Luggage',
                uses: 'Travel, carrying belongings',
                origin: 'Late 1800s',
                warning: null,
                description: 'A rectangular case with a handle for carrying clothes and belongings while traveling.'
            },
            'frisbee': {
                icon: '🥏',
                category: 'Sports Equipment',
                uses: 'Recreation, sport',
                origin: 'Invented 1948',
                warning: null,
                description: 'A disc-shaped gliding toy used for recreational activities and sports.'
            },
            'skis': {
                icon: '🎿',
                category: 'Sports Equipment',
                uses: 'Snow sports, recreation',
                origin: 'Ancient Scandinavia',
                warning: 'Requires training and safety equipment',
                description: 'Long runners attached to boots for gliding over snow.'
            },
            'snowboard': {
                icon: '🏂',
                category: 'Sports Equipment',
                uses: 'Snow sports, recreation',
                origin: 'Invented 1960s',
                warning: 'Requires training and safety equipment',
                description: 'A board for gliding on snow, ridden in a standing position.'
            },
            'sports ball': {
                icon: '⚽',
                category: 'Sports Equipment',
                uses: 'Recreation, sports, exercise',
                origin: 'Ancient invention',
                warning: null,
                description: 'A spherical object used in various sports and games.'
            },
            'kite': {
                icon: '🪁',
                category: 'Toy',
                uses: 'Recreation, flying',
                origin: 'Ancient China',
                warning: 'Avoid power lines',
                description: 'A tethered craft that flies in the wind.'
            },
            'baseball bat': {
                icon: '⚾',
                category: 'Sports Equipment',
                uses: 'Baseball, softball',
                origin: 'Mid-1800s',
                warning: 'Use only for sports',
                description: 'A smooth wooden or metal club used to hit the ball in baseball.'
            },
            'baseball glove': {
                icon: '🥎',
                category: 'Sports Equipment',
                uses: 'Baseball, softball fielding',
                origin: '1870s',
                warning: null,
                description: 'A large leather glove worn to catch and field balls in baseball.'
            },
            'skateboard': {
                icon: '🛹',
                category: 'Sports Equipment',
                uses: 'Recreation, transportation, sport',
                origin: 'Invented 1940s-50s',
                warning: 'Wear protective gear',
                description: 'A board with wheels used for riding and performing tricks.'
            },
            'surfboard': {
                icon: '🏄',
                category: 'Sports Equipment',
                uses: 'Surfing, water sports',
                origin: 'Ancient Polynesia',
                warning: 'Requires swimming ability',
                description: 'A long narrow board used for riding ocean waves.'
            },
            'tennis racket': {
                icon: '🎾',
                category: 'Sports Equipment',
                uses: 'Tennis, racquet sports',
                origin: '16th century',
                warning: null,
                description: 'A bat with a round frame strung with cord, used in tennis.'
            },
            'bottle': {
                icon: '🍾',
                category: 'Container',
                uses: 'Liquid storage, drinking',
                origin: 'Ancient invention',
                warning: 'Recycle when empty',
                description: 'A container with a narrow neck used for storing liquids.'
            },
            'wine glass': {
                icon: '🍷',
                category: 'Drinkware',
                uses: 'Drinking wine',
                origin: 'Ancient glassware',
                warning: 'Fragile - handle with care',
                description: 'A stemmed glass designed for drinking wine.'
            },
            'cup': {
                icon: '☕',
                category: 'Drinkware',
                uses: 'Drinking beverages',
                origin: 'Ancient invention',
                warning: 'May be hot',
                description: 'A small container for drinking, typically with a handle.'
            },
            'fork': {
                icon: '🍴',
                category: 'Utensil',
                uses: 'Eating, food handling',
                origin: 'Ancient Rome',
                warning: 'Sharp prongs',
                description: 'A utensil with prongs used for eating or serving food.'
            },
            'knife': {
                icon: '🔪',
                category: 'Utensil',
                uses: 'Cutting, food preparation',
                origin: 'Ancient tool',
                warning: 'Sharp - handle with care',
                description: 'A cutting instrument with a sharp blade.'
            },
            'spoon': {
                icon: '🥄',
                category: 'Utensil',
                uses: 'Eating, serving',
                origin: 'Ancient invention',
                warning: null,
                description: 'A utensil with a shallow bowl-shaped end used for eating or serving.'
            },
            'bowl': {
                icon: '🥣',
                category: 'Dishware',
                uses: 'Serving food, eating',
                origin: 'Ancient pottery',
                warning: null,
                description: 'A round, deep dish used for serving or eating food.'
            },
            'banana': {
                icon: '🍌',
                category: 'Fruit',
                uses: 'Food, nutrition',
                origin: 'Southeast Asia',
                warning: 'Slippery peel',
                description: 'A long curved fruit with yellow skin and soft sweet flesh.'
            },
            'apple': {
                icon: '🍎',
                category: 'Fruit',
                uses: 'Food, nutrition',
                origin: 'Central Asia',
                warning: 'Contains seeds',
                description: 'A round fruit with red or green skin and crisp flesh.'
            },
            'sandwich': {
                icon: '🥪',
                category: 'Food',
                uses: 'Meal, nutrition',
                origin: 'Invented 18th century',
                warning: 'Check for allergens',
                description: 'Food items placed between slices of bread.'
            },
            'orange': {
                icon: '🍊',
                category: 'Fruit',
                uses: 'Food, vitamin C source',
                origin: 'Southeast Asia',
                warning: null,
                description: 'A round citrus fruit with orange skin and juicy flesh.'
            },
            'broccoli': {
                icon: '🥦',
                category: 'Vegetable',
                uses: 'Food, nutrition',
                origin: 'Italy',
                warning: null,
                description: 'A green vegetable with a tree-like structure, rich in vitamins.'
            },
            'carrot': {
                icon: '🥕',
                category: 'Vegetable',
                uses: 'Food, nutrition',
                origin: 'Persia',
                warning: null,
                description: 'An orange root vegetable, rich in beta-carotene.'
            },
            'hot dog': {
                icon: '🌭',
                category: 'Food',
                uses: 'Meal, fast food',
                origin: 'Germany/USA',
                warning: 'Processed meat',
                description: 'A cooked sausage served in a sliced bun.'
            },
            'pizza': {
                icon: '🍕',
                category: 'Food',
                uses: 'Meal',
                origin: 'Italy',
                warning: 'May be hot',
                description: 'A flatbread topped with tomato sauce, cheese, and various toppings.'
            },
            'donut': {
                icon: '🍩',
                category: 'Food',
                uses: 'Dessert, snack',
                origin: 'Netherlands/USA',
                warning: 'High sugar content',
                description: 'A fried dough confection, typically ring-shaped and sweet.'
            },
            'cake': {
                icon: '🎂',
                category: 'Food',
                uses: 'Dessert, celebration',
                origin: 'Ancient Egypt',
                warning: 'High sugar content',
                description: 'A sweet baked dessert, often layered and frosted.'
            },
            'chair': {
                icon: '🪑',
                category: 'Furniture',
                uses: 'Seating',
                origin: 'Ancient Egypt',
                warning: null,
                description: 'A piece of furniture with a back and legs for one person to sit on.'
            },
            'couch': {
                icon: '🛋️',
                category: 'Furniture',
                uses: 'Seating, relaxation',
                origin: 'Ancient furniture',
                warning: null,
                description: 'A long upholstered seat for multiple people, also called a sofa.'
            },
            'potted plant': {
                icon: '🪴',
                category: 'Plant',
                uses: 'Decoration, air purification',
                origin: 'Ancient horticulture',
                warning: 'Some plants toxic to pets',
                description: 'A plant grown in a container for indoor or outdoor decoration.'
            },
            'bed': {
                icon: '🛏️',
                category: 'Furniture',
                uses: 'Sleeping, resting',
                origin: 'Ancient furniture',
                warning: null,
                description: 'A piece of furniture used for sleeping or resting.'
            },
            'dining table': {
                icon: '🍽️',
                category: 'Furniture',
                uses: 'Eating, gathering',
                origin: 'Ancient furniture',
                warning: null,
                description: 'A table used for serving and eating meals.'
            },
            'toilet': {
                icon: '🚽',
                category: 'Plumbing Fixture',
                uses: 'Sanitation',
                origin: 'Ancient invention, modern 1596',
                warning: null,
                description: 'A plumbing fixture for the disposal of human waste.'
            },
            'tv': {
                icon: '📺',
                category: 'Electronics',
                uses: 'Entertainment, information',
                origin: 'Invented 1920s',
                warning: 'Limit screen time',
                description: 'A device for receiving broadcast signals and displaying video content.'
            },
            'laptop': {
                icon: '💻',
                category: 'Electronics',
                uses: 'Computing, work, entertainment',
                origin: 'Invented 1980s',
                warning: 'Avoid overheating',
                description: 'A portable personal computer with a screen and keyboard.'
            },
            'mouse': {
                icon: '🖱️',
                category: 'Computer Accessory',
                uses: 'Computer input device',
                origin: 'Invented 1964',
                warning: null,
                description: 'A handheld pointing device for computers.'
            },
            'remote': {
                icon: '📱',
                category: 'Electronics',
                uses: 'Device control',
                origin: 'Invented 1950s',
                warning: 'Requires batteries',
                description: 'A wireless device for controlling electronic equipment from a distance.'
            },
            'keyboard': {
                icon: '⌨️',
                category: 'Computer Accessory',
                uses: 'Text input, computer control',
                origin: 'Typewriter era',
                warning: null,
                description: 'An input device with keys for typing and computer control.'
            },
            'cell phone': {
                icon: '📱',
                category: 'Electronics',
                uses: 'Communication, computing',
                origin: 'Invented 1973',
                warning: 'Distraction while driving',
                description: 'A portable telephone that can make and receive calls wirelessly.'
            },
            'microwave': {
                icon: '📟',
                category: 'Appliance',
                uses: 'Food heating, cooking',
                origin: 'Invented 1945',
                warning: 'No metal objects inside',
                description: 'An oven that heats food using electromagnetic radiation.'
            },
            'oven': {
                icon: '🔥',
                category: 'Appliance',
                uses: 'Cooking, baking',
                origin: 'Ancient invention',
                warning: 'Hot - risk of burns',
                description: 'An enclosed compartment for heating, baking, or roasting food.'
            },
            'toaster': {
                icon: '🍞',
                category: 'Appliance',
                uses: 'Toasting bread',
                origin: 'Invented 1893',
                warning: 'Hot surfaces',
                description: 'An electric device for browning sliced bread by exposure to heat.'
            },
            'sink': {
                icon: '🚰',
                category: 'Plumbing Fixture',
                uses: 'Washing, cleaning',
                origin: 'Ancient invention',
                warning: null,
                description: 'A basin with a water supply and drain for washing.'
            },
            'refrigerator': {
                icon: '🧊',
                category: 'Appliance',
                uses: 'Food preservation, cooling',
                origin: 'Invented 1913',
                warning: 'Keep door closed',
                description: 'An appliance for keeping food and drinks cold.'
            },
            'book': {
                icon: '📖',
                category: 'Reading Material',
                uses: 'Reading, learning, entertainment',
                origin: 'Ancient invention',
                warning: null,
                description: 'A written or printed work consisting of pages bound together.'
            },
            'clock': {
                icon: '🕐',
                category: 'Timepiece',
                uses: 'Timekeeping',
                origin: 'Ancient invention',
                warning: null,
                description: 'A device for measuring and displaying time.'
            },
            'vase': {
                icon: '🏺',
                category: 'Decor',
                uses: 'Holding flowers, decoration',
                origin: 'Ancient pottery',
                warning: 'Fragile',
                description: 'A container used for holding cut flowers or as decoration.'
            },
            'scissors': {
                icon: '✂️',
                category: 'Tool',
                uses: 'Cutting paper, fabric, etc.',
                origin: 'Ancient Egypt',
                warning: 'Sharp - handle with care',
                description: 'A cutting instrument with two blades pivoted together.'
            },
            'teddy bear': {
                icon: '🧸',
                category: 'Toy',
                uses: 'Comfort, play',
                origin: 'Invented 1902',
                warning: null,
                description: 'A soft stuffed toy in the form of a bear.'
            },
            'hair drier': {
                icon: '💨',
                category: 'Appliance',
                uses: 'Hair drying, styling',
                origin: 'Invented 1890',
                warning: 'Keep away from water',
                description: 'An electric device that blows hot air to dry hair.'
            },
            'toothbrush': {
                icon: '🪥',
                category: 'Hygiene',
                uses: 'Dental cleaning',
                origin: 'Ancient China',
                warning: 'Replace every 3 months',
                description: 'A brush for cleaning teeth.'
            }
        };

        const dbEntry = objectDatabase[prediction.class.toLowerCase()] || {
            icon: '🔍',
            category: 'Object',
            uses: 'Various applications',
            origin: 'Unknown',
            warning: null,
            description: `A ${objectName} detected with ${confidence}% confidence.`
        };

        return {
            ...dbEntry,
            name: objectName,
            confidence: confidence,
            bbox: prediction.bbox
        };
    }

    showBoundingBox(prediction) {
        const boundingBox = document.getElementById('bounding-box');
        const objectLabel = document.getElementById('object-label');
        
        if (prediction && prediction.bbox) {
            const [x, y, width, height] = prediction.bbox;
            
            boundingBox.style.left = x + 'px';
            boundingBox.style.top = y + 'px';
            boundingBox.style.width = width + 'px';
            boundingBox.style.height = height + 'px';
        }
        
        boundingBox.classList.remove('hidden');
        objectLabel.classList.remove('hidden');
        
        document.getElementById('object-name').textContent = this.currentScanResult.name;
        document.getElementById('confidence').textContent = this.currentScanResult.confidence + '%';
        
        setTimeout(() => {
            boundingBox.classList.add('hidden');
            objectLabel.classList.add('hidden');
        }, 3000);
    }

    displayResult(result) {
        document.getElementById('result-icon').textContent = result.icon;
        document.getElementById('result-name').textContent = result.name;
        document.getElementById('result-category').textContent = result.category;
        document.getElementById('result-uses').textContent = result.uses;
        document.getElementById('result-origin').textContent = result.origin;
        document.getElementById('result-description').textContent = result.description;
        
        const warningSection = document.getElementById('warning-section');
        if (result.warning) {
            document.getElementById('result-warning').textContent = result.warning;
            warningSection.classList.remove('hidden');
        } else {
            warningSection.classList.add('hidden');
        }
        
        const resultPanel = document.getElementById('result-panel');
        resultPanel.classList.remove('hidden');
        setTimeout(() => {
            resultPanel.classList.add('active');
        }, 10);
        
        if (this.settings.autoSave) {
            this.saveCurrentScan();
        }
    }

    closeResultPanel() {
        const resultPanel = document.getElementById('result-panel');
        resultPanel.classList.remove('active');
        setTimeout(() => {
            resultPanel.classList.add('hidden');
        }, 400);
    }

    saveCurrentScan() {
        if (!this.currentScanResult) return;
        
        const scan = {
            ...this.currentScanResult,
            timestamp: Date.now(),
            id: Date.now() + Math.random()
        };
        
        this.scanHistory.unshift(scan);
        
        if (this.scanHistory.length > 100) {
            this.scanHistory = this.scanHistory.slice(0, 100);
        }
        
        this.saveHistory();
        this.showNotification('Scan saved!');
    }

    async shareResult() {
        if (!this.currentScanResult) return;
        
        const shareText = `I just scanned this with #WhatIsThisApp\n\n${this.currentScanResult.icon} ${this.currentScanResult.name}\nCategory: ${this.currentScanResult.category}\n\n${this.currentScanResult.description}`;
        
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `What Is This? - ${this.currentScanResult.name}`,
                    text: shareText
                });
                this.showNotification('Shared successfully!');
            } catch (error) {
                if (error.name !== 'AbortError') {
                    this.fallbackShare(shareText);
                }
            }
        } else {
            this.fallbackShare(shareText);
        }
    }

    fallbackShare(text) {
        navigator.clipboard.writeText(text).then(() => {
            this.showNotification('Copied to clipboard!');
        }).catch(() => {
            this.showNotification('Share failed');
        });
    }

    showHistory() {
        this.showScreen('history');
        this.renderHistory();
    }

    renderHistory() {
        const historyContainer = document.getElementById('scan-history');
        const emptyState = document.getElementById('empty-history');
        
        if (this.scanHistory.length === 0) {
            historyContainer.innerHTML = '';
            emptyState.classList.remove('hidden');
            return;
        }
        
        emptyState.classList.add('hidden');
        
        historyContainer.innerHTML = this.scanHistory.map(scan => {
            const timeAgo = this.getTimeAgo(scan.timestamp);
            return `
                <div class="scan-item" data-id="${scan.id}">
                    <div class="scan-item-icon">${scan.icon}</div>
                    <div class="scan-item-content">
                        <div class="scan-item-name">${scan.name}</div>
                        <div class="scan-item-category">${scan.category}</div>
                        <div class="scan-item-time">${timeAgo}</div>
                    </div>
                </div>
            `;
        }).join('');
        
        historyContainer.querySelectorAll('.scan-item').forEach(item => {
            item.addEventListener('click', () => {
                const scanId = parseFloat(item.dataset.id);
                const scan = this.scanHistory.find(s => s.id === scanId);
                if (scan) {
                    this.currentScanResult = scan;
                    this.showScreen('camera');
                    this.displayResult(scan);
                }
            });
        });
    }

    getTimeAgo(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        
        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return Math.floor(seconds / 60) + ' min ago';
        if (seconds < 86400) return Math.floor(seconds / 3600) + ' hr ago';
        if (seconds < 604800) return Math.floor(seconds / 86400) + ' days ago';
        return new Date(timestamp).toLocaleDateString();
    }

    clearHistory() {
        if (confirm('Are you sure you want to clear all scan history?')) {
            this.scanHistory = [];
            this.saveHistory();
            this.renderHistory();
            this.showNotification('History cleared');
        }
    }

    showSettings() {
        this.showScreen('settings');
        
        const cameraSelect = document.getElementById('camera-select');
        const scanModeSelect = document.getElementById('scan-mode-select');
        const languageSelect = document.getElementById('language-select');
        const darkModeToggle = document.getElementById('dark-mode-toggle');
        const autoSaveToggle = document.getElementById('auto-save-toggle');
        
        if (cameraSelect) cameraSelect.value = this.settings.camera || 'environment';
        if (scanModeSelect) scanModeSelect.value = this.settings.scanMode || 'tap';
        if (languageSelect) languageSelect.value = this.settings.language || 'en';
        if (darkModeToggle) darkModeToggle.checked = this.settings.darkMode !== false;
        if (autoSaveToggle) autoSaveToggle.checked = this.settings.autoSave || false;
    }

    showScreen(screenName) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        
        const targetScreen = document.getElementById(`${screenName}-screen`);
        if (targetScreen) {
            targetScreen.classList.add('active');
        }
        
        this.currentScreen = screenName;
        
        if (screenName === 'camera') {
            if (!this.cameraStream) {
                this.startCamera();
            }
        } else {
            if (this.cameraStream) {
                this.stopCamera();
            }
        }
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.add('active');
            }, 10);
        }
    }

    closeModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.classList.add('hidden');
            }, 300);
        });
    }

    showNotification(message) {
        const notification = document.getElementById('notification');
        const notificationText = document.getElementById('notification-text');
        
        notificationText.textContent = message;
        notification.classList.remove('hidden');
        setTimeout(() => {
            notification.classList.add('active');
        }, 10);
        
        setTimeout(() => {
            notification.classList.remove('active');
            setTimeout(() => {
                notification.classList.add('hidden');
            }, 300);
        }, 3000);
    }

    loadHistory() {
        try {
            const history = localStorage.getItem('whatIsThis_history');
            return history ? JSON.parse(history) : [];
        } catch (error) {
            return [];
        }
    }

    saveHistory() {
        try {
            localStorage.setItem('whatIsThis_history', JSON.stringify(this.scanHistory));
        } catch (error) {
            console.error('Failed to save history:', error);
        }
    }

    loadSettings() {
        try {
            const settings = localStorage.getItem('whatIsThis_settings');
            return settings ? JSON.parse(settings) : {
                camera: 'environment',
                scanMode: 'tap',
                language: 'en',
                darkMode: true,
                autoSave: false
            };
        } catch (error) {
            return {
                camera: 'environment',
                scanMode: 'tap',
                language: 'en',
                darkMode: true,
                autoSave: false
            };
        }
    }

    saveSettings() {
        const cameraSelect = document.getElementById('camera-select');
        const scanModeSelect = document.getElementById('scan-mode-select');
        const languageSelect = document.getElementById('language-select');
        const darkModeToggle = document.getElementById('dark-mode-toggle');
        const autoSaveToggle = document.getElementById('auto-save-toggle');
        
        this.settings = {
            camera: cameraSelect ? cameraSelect.value : this.settings.camera,
            scanMode: scanModeSelect ? scanModeSelect.value : this.settings.scanMode,
            language: languageSelect ? languageSelect.value : this.settings.language,
            darkMode: darkModeToggle ? darkModeToggle.checked : this.settings.darkMode,
            autoSave: autoSaveToggle ? autoSaveToggle.checked : this.settings.autoSave
        };
        
        try {
            localStorage.setItem('whatIsThis_settings', JSON.stringify(this.settings));
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }

    applySettings() {
        if (this.settings.darkMode) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new WhatIsThis();
});
