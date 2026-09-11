// script for character logic

// hardcoded numbers
const FRAME_RATE = 30; // frames per second
const DEFAULT_SCALE = 1; // default character scale
const SPRTIE_STATE = {
    Walk: "Walk",
    Run: "Run",
    Emotes: "Emotes",
    Actions: "Actions",
}
const CHAR_CONTAINER = document.getElementById("character_container");

var id_counter = 0; // counter for character IDs
var loaded_characters = {
    // class object stored in this object, with the character's name as the key
};

// global variables
var mouseX = 0;
var mouseY = 0;

// user adjustable variables
var SCALE = 0.75; // global scale for all characters

// sprite logics
const spriteImageCache = new Map();

async function preloadImage(src) {
    if (spriteImageCache.has(src)) {
        return spriteImageCache.get(src);
    }
    const img = new Image();
    img.src = src;
    try {
        if (img.decode) {
            await img.decode();
        } else {
            await new Promise((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = reject;
            });
        }
        spriteImageCache.set(src, img);
        return img;
    } catch (error) {
        console.error(`Error loading or decoding image: ${src}`, error);
        return null;
    }
}

async function loadCharacterConfig(characterName) {
    const configPath = `./spritesheets/${encodeURIComponent(characterName)}/config.txt`;
    const res = await fetch(configPath);
    if (!res.ok) {
        throw new Error(`Could not load ${configPath}: ${res.status} ${res.statusText}`);
    }
    const text = await res.text();
    const config = {};
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('//')) {
            const [rawKey, rawVal] = trimmed.split('=');
            if (rawKey && rawVal !== undefined) {
                config[rawKey.trim().toLowerCase()] = parseFloat(rawVal.trim());
            }
        }
    }
    return config; // e.g. { width: 325, height: 325, column: 10, emote1: 61, idle: 340, ... }
};

class AnimatedSprite {
    constructor(image, config, spriteName = "idle") {
        this.image = typeof image === "string" ? new Image() : image;
        if (typeof image === "string") {
            this.image.src = image;
        }
        this.config = config;
        this.spriteName = spriteName;
        this.currentFrame = 0;
        this.x = 0;
        this.y = 0;
        this.totalFrames = this.calculateTotalFrames();

        if (this.image && !this.image.complete) {
            this.image.onload = () => {
                this.totalFrames = this.calculateTotalFrames();
            };
        }
    }

    calculateTotalFrames() {
        if (this.config && this.spriteName) {
            const key = this.spriteName.toLowerCase();
            if (this.config[key] !== undefined && !isNaN(this.config[key])) {
                return this.config[key];
            }
        }
        const height = this.image ? (this.image.naturalHeight || this.image.height || 0) : 0;
        if (height > 0 && this.config && this.config.height) {
            return this.config.column * Math.floor(height / this.config.height);
        }
        return (this.config && this.config.idle) || 1;
    }

    update() {
        if (!this.totalFrames || this.totalFrames <= 1) {
            this.totalFrames = this.calculateTotalFrames();
        }
        this.currentFrame = (this.currentFrame + 1) % (this.totalFrames || 1);
        const column = this.currentFrame % this.config.column;
        const row = Math.floor(this.currentFrame / this.config.column);
        this.x = column * this.config.width;
        this.y = row * this.config.height;
    }
};

// real!!! logic

async function checkFolder(path) {
    try {
        const response = await fetch(path, { method: 'HEAD' });
        return response.ok;
    } catch (error) {
        console.error(`Error checking folder: ${error}`);
        return false;
    }
};

function addCharacter(name, position, state, scale) {
    // verify if folder exists for name
    checkFolder(`./spritesheets/${name}`).then(exists => {
        if (!exists) {
            console.error(`Folder for character "${name}" does not exist.`);
            return;
        };

        // create a character object
        class Character {
            constructor(name, position = { x: 0, y: 0 }, state = "Actions", scale = null) {
                this.name = name;
                this.position = position;
                this.move_to = { ...position };
                this.state = state;
                this.spriteState = SPRTIE_STATE[state] || SPRTIE_STATE.Actions; // default to action if state is invalid
                this.spriteName = "idle";
                this.image = null;
                this.imageFrameCount = 0;
                this.config = null;
                this.scale = scale;
                this.spriteElement = null;
                this.charDiv = null;
                this._pendingSprite = null;
                //char stats
                this.stats = {
                    idle_while_active: 0, // custom counter
                    is_running: false, // is the character running
                    movement_speed: 50, // px per second
                    run_speed: 2.5, // multiplier for run speed
                    // mouse
                    clicked: false,
                    time_to_release_click: -1, // ms, -1 is inf
                    radians_to_mouse: 0, // radians to mouse
                };
            };

            async start() {
                // start loading the character's config and image
                console.log("Spawning character:", this.name);
                try {
                    this.config = await loadCharacterConfig(this.name);
                } catch (error) {
                    console.error(`Failed to load config for character "${this.name}":`, error);
                    return;
                }

                if (this.config) {
                    this.scale = this.scale ?? (this.config.scale ?? DEFAULT_SCALE);
                    this.scale = this.scale * SCALE; // apply post scale
                    this.spriteName = "idle";
                    this.image = `./spritesheets/${this.name}/${this.spriteState}/${this.spriteName}.png`;
                    preloadImage(this.image);
                    this.animatedSprite = new AnimatedSprite(this.image, this.config, this.spriteName);
                    this.imageFrameCount = this.animatedSprite.totalFrames;
                    this.createElements();
                    this.preloadSprites();
                } else {
                    console.error(`Failed to load config for character "${this.name}".`);
                }
            };

            preloadSprites() {
                // add more sprite states and names here as needed
                const sprites = [
                    // Walk
                    { state: SPRTIE_STATE.Walk, name: "walkDown" },
                    { state: SPRTIE_STATE.Walk, name: "walkLeft" },
                    { state: SPRTIE_STATE.Walk, name: "walkRight" },
                    { state: SPRTIE_STATE.Walk, name: "walkUp" },
                    // Run
                    { state: SPRTIE_STATE.Run, name: "runDown" },
                    { state: SPRTIE_STATE.Run, name: "runLeft" },
                    { state: SPRTIE_STATE.Run, name: "runRight" },
                    { state: SPRTIE_STATE.Run, name: "runUp" },
                    { state: SPRTIE_STATE.Run, name: "downLeft" },
                    { state: SPRTIE_STATE.Run, name: "downRight" },
                    { state: SPRTIE_STATE.Run, name: "upLeft" },
                    { state: SPRTIE_STATE.Run, name: "upRight" },
                    // Actions
                    { state: SPRTIE_STATE.Actions, name: "idle" },
                    { state: SPRTIE_STATE.Actions, name: "runIdle" },
                ];

                for (const s of sprites) {
                    preloadImage(`./spritesheets/${this.name}/${s.state}/${s.name}.png`);
                }
            };

            createElements() {
                console.log(`Creating elements for character: ${this.name}`);
                // create the character's HTML elements and append them to the container
                const charDiv = document.createElement("div");
                charDiv.className = "character";
                charDiv.id = `char_${id_counter++}`;
                charDiv.style.width = `${this.config.width * this.scale}px`;
                charDiv.style.height = `${this.config.height * this.scale}px`;
                charDiv.style.position = "absolute";
                charDiv.style.left = `${this.position.x}px`;
                charDiv.style.top = `${this.position.y}px`;
                CHAR_CONTAINER.appendChild(charDiv);
                this.charDiv = charDiv;

                // create a center div to hold the sprite and clickbox in line with the anchor point of the charDiv
                const centerDiv = document.createElement("div");
                centerDiv.className = "character_center";
                centerDiv.style.position = "absolute";
                centerDiv.style.left = "0px";
                centerDiv.style.top = "0px";
                centerDiv.className += " debug_outline"; // add debug outline class TODO: remove once debug is done
                charDiv.appendChild(centerDiv);

                const charSprite = document.createElement("div");
                charSprite.className = "character_sprite";
                charSprite.style.width = `${this.config.width}px`;
                charSprite.style.height = `${this.config.height}px`;
                charSprite.style.position = "absolute";
                charSprite.style.left = "0px";
                charSprite.style.top = "0px";
                charSprite.style.transformOrigin = "center center";
                charSprite.style.transform = `translate(-50%, -50%) scale(${this.scale})`;
                const imgSrc = this.image instanceof HTMLImageElement ? this.image.src : this.image;
                charSprite.style.backgroundImage = `url("${imgSrc}")`;
                charSprite.style.backgroundRepeat = "no-repeat";
                charSprite.style.backgroundPosition = "0px 0px";
                charSprite.style.zIndex = "1";
                charSprite.className += " debug_outline"; // add debug outline class TODO: remove once debug is done

                centerDiv.appendChild(charSprite);
                this.spriteElement = charSprite;

                // create clickbox
                const clickBox = document.createElement("div");
                clickBox.className = "character_clickbox";
                clickBox.style.width = `${this.config.width * this.scale * 0.7}px`;  // adjust sizes here
                clickBox.style.height = `${this.config.height * this.scale * 0.9}px`;
                clickBox.style.position = "absolute";
                clickBox.style.left = "0px";
                clickBox.style.top = "0px";
                clickBox.style.transformOrigin = "center center";
                clickBox.style.transform = "translate(-50%, -50%)";
                clickBox.style.cursor = "pointer";
                clickBox.style.zIndex = "8";
                clickBox.className += " debug_outline"; // add debug outline class TODO: remove once debug is done

                centerDiv.appendChild(clickBox);
                this.clickBox = clickBox;

                // add event listeners
                clickBox.addEventListener("click", () => {
                    console.log(`Character ${this.name} clicked.`);
                    this.stats.clicked = !this.stats.clicked; // toggle clicked state
                    this.stats.is_running = this.stats.clicked; // set running state based on clicked state
                    this.stats.idle_while_active = 0;
                });

                if (true) { // debug info
                    const debugDiv = document.createElement("div");
                    debugDiv.className = "character_debug_info";
                    debugDiv.id = `char_debug_info_${this.name}`;
                    debugDiv.style.top = "50%";
                    debugDiv.style.left = "0";
                    debugDiv.style.width = "100%";
                    debugDiv.style.height = "auto";
                    debugDiv.style.position = "absolute";

                    charDiv.appendChild(debugDiv);
                }
            };

            setScale(newScale) {
                // set the character's scale and update the sprite and clickbox sizes accordingly
                this.scale = newScale;
                if (this.charDiv && this.config) {
                    this.charDiv.style.width = `${this.config.width * this.scale}px`;
                    this.charDiv.style.height = `${this.config.height * this.scale}px`;
                }
                if (this.spriteElement) {
                    this.spriteElement.style.transform = `translate(-50%, -50%) scale(${this.scale})`;
                }
                if (this.clickBox && this.config) {
                    this.clickBox.style.width = `${this.config.width * this.scale * 0.7}px`;
                    this.clickBox.style.height = `${this.config.height * this.scale * 0.9}px`;
                }
                this.updateDebugInfo();
            };
            
            updateDebugInfo() {
                // update the character's debug info div with the current state and position
                const debugDiv = document.getElementById(`char_debug_info_${this.name}`);
                if (debugDiv) {
                    const moveToStr = this.move_to ? `${this.move_to.x}, ${this.move_to.y}` : `${this.position.x}, ${this.position.y}`;
                    const currentFrame = this.animatedSprite ? this.animatedSprite.currentFrame : 0;
                    const totalFrames = this.animatedSprite ? this.animatedSprite.totalFrames : 0;
                    const spritePath = this.image instanceof HTMLImageElement ? this.image.src : (this.image || "");
                    debugDiv.innerHTML = `<p>
                        ID: ${this.name}<br>
                        Frame: ${currentFrame} / ${totalFrames}<br>
                        Name: ${this.name}<br>
                        Position: ${this.position.x}, ${this.position.y}<br>
                        Move To: ${moveToStr}<br>
                        State: ${this.state}<br>
                        Scale: ${this.scale}<br>
                        Sprite State: ${this.spriteState}<br>
                        Sprite Name: ${spritePath}<br>
                        Is Running: ${this.stats.is_running}<br>
                        Run Speed: ${this.stats.run_speed}<br>
                        Idle While Active: ${this.stats.idle_while_active}<br>
                        Radians to Mouse: ${this.stats.radians_to_mouse.toFixed(2)}<br>
                        
                    </p>`;
                }
            };

            async replaceSprite(spriteState, name, spriteName = "idle") {
                // debounce if the sprite state and name are the same as the current ones
                const currentImagePath = this.image instanceof HTMLImageElement ? this.image.src : (this.image || "");
                if (this.spriteState === spriteState && this.spriteName === spriteName && currentImagePath.includes(`${spriteState}/${spriteName}.png`)) {
                    return;
                }
                const spriteKey = `${spriteState}/${spriteName}`;
                if (this._pendingSprite === spriteKey) {
                    return;
                }
                this._pendingSprite = spriteKey;

                const newImagePath = `./spritesheets/${name}/${spriteState}/${spriteName}.png`;
                const img = await preloadImage(newImagePath);

                // If another sprite was requested in the meantime, ignore this one
                if (this._pendingSprite !== spriteKey) {
                    return;
                }
                this._pendingSprite = null;

                if (!img) {
                    console.error(`Sprite ${newImagePath} for state "${spriteState}" could not be loaded for character "${name}".`);
                    return;
                }

                this.image = img;
                this.spriteState = spriteState;
                this.spriteName = spriteName;
                if (this.spriteElement) {
                    this.spriteElement.style.backgroundImage = `url("${newImagePath}")`;
                    this.spriteElement.style.backgroundPosition = "0px 0px";
                    // update the animated sprite with the new image and config
                    this.animatedSprite = new AnimatedSprite(this.image, this.config, spriteName);
                    this.imageFrameCount = this.animatedSprite.totalFrames;
                }
            };

            moveTo(x, y) {
                // set the character's move_to position
                this.move_to.x = x;
                this.move_to.y = y;
            }

            moveCharacter() {
                // handles movement
                const dx = this.move_to.x - this.position.x;
                const dy = this.move_to.y - this.position.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance > 2) {
                    this.stats.idle_while_active = 0; // reset idle counter if moving

                    var moveSpeed = this.stats.movement_speed / FRAME_RATE;

                    if (this.stats.is_running) {
                        moveSpeed *= this.stats.run_speed;
                    }

                    const moveX = (dx / distance) * moveSpeed;
                    const moveY = (dy / distance) * moveSpeed;
                    this.position.x += moveX;
                    this.position.y += moveY;

                    if (this.charDiv) {
                        this.charDiv.style.left = `${this.position.x}px`;
                        this.charDiv.style.top = `${this.position.y}px`;
                    }

                    // if running, use 8 directional movement, else use 4 directional movement
                    // downLeft, downRight, runDown, runLeft, runRight, runUp, upLeft, upRight
                    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

                    if (this.stats.is_running) {
                        // determine the direction based on the angle
                        if (angle >= -22.5 && angle < 22.5) {
                            // facing right
                            this.replaceSprite(SPRTIE_STATE.Run, this.name, "runRight");
                        } else if (angle >= 22.5 && angle < 67.5) {
                            // facing down-right
                            this.replaceSprite(SPRTIE_STATE.Run, this.name, "downRight");
                        } else if (angle >= 67.5 && angle < 112.5) {
                            // facing down
                            this.replaceSprite(SPRTIE_STATE.Run, this.name, "runDown");
                        } else if (angle >= 112.5 && angle < 157.5) {
                            // facing down-left
                            this.replaceSprite(SPRTIE_STATE.Run, this.name, "downLeft");
                        } else if (angle >= 157.5 || angle < -157.5) {
                            // facing left
                            this.replaceSprite(SPRTIE_STATE.Run, this.name, "runLeft");
                        } else if (angle >= -157.5 && angle < -112.5) {
                            // facing up-left
                            this.replaceSprite(SPRTIE_STATE.Run, this.name, "upLeft");
                        } else if (angle >= -112.5 && angle < -67.5) {
                            // facing up
                            this.replaceSprite(SPRTIE_STATE.Run, this.name, "runUp");
                        } else {
                            // facing up-right
                            this.replaceSprite(SPRTIE_STATE.Run, this.name, "upRight");
                        }
                    } else {
                        // 4 directional movement
                        if (angle >= -45 && angle < 45) {
                            // facing right
                            this.replaceSprite(SPRTIE_STATE.Walk, this.name, "walkRight");
                        } else if (angle >= 45 && angle < 135) {
                            // facing down
                            this.replaceSprite(SPRTIE_STATE.Walk, this.name, "walkDown");
                        } else if (angle >= -135 && angle < -45) {
                            // facing up
                            this.replaceSprite(SPRTIE_STATE.Walk, this.name, "walkUp");
                        } else {
                            // facing left
                            this.replaceSprite(SPRTIE_STATE.Walk, this.name, "walkLeft");
                        }
                    }
                } else {
                    // runIdle
                    if (this.stats.is_running) {
                        this.replaceSprite(SPRTIE_STATE.Actions, this.name, "runIdle");
                    }  
                }

                if (this.stats.idle_while_active > 60) {
                    // if the character has been idle for too long while active, reset clicked state
                    this.stats.clicked = false;
                    this.stats.is_running = false;
                    this.stats.idle_while_active = 0;

                    this.replaceSprite(SPRTIE_STATE.Actions, this.name, "idle");
                } else if (distance <= 2 && !this.stats.is_running) {
                    // if the character is idle and not running, set to idle sprite
                    this.replaceSprite(SPRTIE_STATE.Actions, this.name, "idle");
                }
            }

            update() {
                // update the character's sprite and debug info
                if (this.animatedSprite) {
                    this.animatedSprite.update();
                    this.imageFrameCount = this.animatedSprite.totalFrames;
                    if (this.spriteElement) {
                        this.spriteElement.style.backgroundPosition = `-${this.animatedSprite.x}px -${this.animatedSprite.y}px`;
                    }
                }
                this.updateDebugInfo();

                // update the character's position based on move_to
                this.moveCharacter();
            }
        };
        loaded_characters[name] = new Character(name, position, state, scale);
        loaded_characters[name].start();
    });
};

function mouseMoveHandler(event) {
    mouseX = event.clientX;
    mouseY = event.clientY;
};

function updateCharacter() {
    // TODO: supposed to be a large function that updates character's sprites, position, logic, and other user activities.
    // for every character clicked, follow the cursor
    for (const charName in loaded_characters) {
        const char = loaded_characters[charName];
        if (char.stats.clicked) {
            // follow the cursor
            char.moveTo(mouseX, mouseY);

            // if position is same as move_to, increment idle_while_active counter
            if (Math.abs(char.position.x - char.move_to.x) < 1 && Math.abs(char.position.y - char.move_to.y) < 1) {
                char.stats.idle_while_active++;
            }

            // caculate radians to mouse
            const dx = mouseX - char.position.x;
            const dy = mouseY - char.position.y;
            char.stats.radians_to_mouse = Math.atan2(dy, dx);
        }

        // update all characters update method
        char.update();
    }
};

function DEBUG_START() {
    // add a character for testing
    addCharacter("Doto", { x: 0, y: 0 });

    // mouse events
    document.addEventListener("mousemove", mouseMoveHandler);

    // loop
    setInterval(() => {
        updateCharacter();
    }, 1000 / FRAME_RATE);
}

DEBUG_START();