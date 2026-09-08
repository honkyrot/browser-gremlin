// script for character logic

// hardcoded numbers
const FRAME_RATE = 30; // frames per second
const DEFAULT_SCALE = 1.0; // default character scale
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

// sprite logics

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
            const [key, val] = trimmed.split('=');
            config[key.toLowerCase()] = parseFloat(val);
        }
    }
    return config; // e.g. { width: 325, height: 325, column: 10, emote1: 61, idle: 340, ... }
}

class AnimatedSprite {
    constructor(image, config) {
        this.image = image;
        this.config = config;
        this.currentFrame = 0;
        this.x = 0;
        this.y = 0;
        this.totalFrames = this.calculateTotalFrames();
    }

    calculateTotalFrames() {
        const height = this.image.naturalHeight || this.image.height || 0;
        if (height > 0 && this.config.height) {
            return this.config.column * Math.floor(height / this.config.height);
        }
        return this.config.idle || 1;
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
}

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
        }

        // create a character object
        class Character {
            constructor(name, position = { x: 0, y: 0 }, state = "Actions", scale = null) {
                this.name = name;
                this.position = position;
                this.move_to = { ...position };
                this.state = state;
                this.spriteState = SPRTIE_STATE[state] || SPRTIE_STATE.Actions; // default to action if state is invalid
                this.image = null;
                this.imageFrameCount = 0;
                this.config = null;
                this.scale = scale;
                this.spriteElement = null;
                this.charDiv = null;
            }

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
                    this.image = new Image();
                    this.image.src = `./spritesheets/${this.name}/${this.spriteState}/idle.png`;
                    this.animatedSprite = new AnimatedSprite(this.image, this.config);
                    this.createElements();
                } else {
                    console.error(`Failed to load config for character "${this.name}".`);
                }
            }

            createElements() {
                console.log(`Creating elements for character: ${this.name}`);
                // create the character's HTML elements and append them to the container
                const charDiv = document.createElement("div");
                charDiv.className = "character";
                charDiv.id = `char_${id_counter++}`;
                charDiv.style.width = `${this.config.width * this.scale}px`;
                charDiv.style.height = `${this.config.height * this.scale}px`;
                charDiv.style.position = "relative";
                CHAR_CONTAINER.appendChild(charDiv);
                this.charDiv = charDiv;

                const charSprite = document.createElement("div");
                charSprite.className = "character_sprite";
                charSprite.style.width = `${this.config.width}px`;
                charSprite.style.height = `${this.config.height}px`;
                charSprite.style.transform = `scale(${this.scale})`;
                charSprite.style.transformOrigin = "top left";
                const imgSrc = this.image instanceof HTMLImageElement ? this.image.src : this.image;
                charSprite.style.backgroundImage = `url("${imgSrc}")`;
                charSprite.style.backgroundRepeat = "no-repeat";
                charSprite.style.backgroundPosition = "0px 0px";

                charDiv.appendChild(charSprite);
                this.spriteElement = charSprite;

                if (true) { // debug info
                    const debugDiv = document.createElement("div");
                    debugDiv.className = "character_debug_info";
                    debugDiv.id = `char_debug_info_${this.name}`;
                    charDiv.appendChild(debugDiv);
                }
            }

            setScale(newScale) {
                this.scale = newScale;
                if (this.charDiv && this.config) {
                    this.charDiv.style.width = `${this.config.width * this.scale}px`;
                    this.charDiv.style.height = `${this.config.height * this.scale}px`;
                }
                if (this.spriteElement) {
                    this.spriteElement.style.transform = `scale(${this.scale})`;
                }
                this.updateDebugInfo();
            }
            
            updateDebugInfo() {
                const debugDiv = document.getElementById(`char_debug_info_${this.name}`);
                if (debugDiv) {
                    const moveToStr = this.move_to ? `${this.move_to.x}, ${this.move_to.y}` : `${this.position.x}, ${this.position.y}`;
                    const currentFrame = this.animatedSprite ? this.animatedSprite.currentFrame : 0;
                    debugDiv.innerHTML = `
                        <p>ID: ${this.name}</p>
                        <p>Frame: ${currentFrame}</p>
                        <p>Name: ${this.name}</p>
                        <p>Position: ${this.position.x}, ${this.position.y}</p>
                        <p>Move To: ${moveToStr}</p>
                        <p>State: ${this.state}</p>
                        <p>Scale: ${this.scale}</p>
                    `;
                }
            }

            replaceSprite(spriteState, name) {
                // check if png exists for the new sprite
                const newImagePath = `./spritesheets/${name}/${spriteState}/${name}.png`;
                checkFolder(newImagePath).then(exists => {
                    if (!exists) {
                        console.error(`Sprite for state "${spriteState}" does not exist for character "${name}".`);
                        return;
                    }
                    this.image = newImagePath;
                    if (this.spriteElement) {
                        this.spriteElement.style.backgroundImage = `url("${newImagePath}")`;
                    }
                });

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
            }
        }
        loaded_characters[name] = new Character(name, position, state, scale);
        loaded_characters[name].start();
    });
};

function updateCharacter() {
    // TODO: supposed to be a large function that updates character's sprites, position, logic, and other user activities.
};


function DEBUG_START() {
    // add a character for testing
    addCharacter("Doto", { x: 0, y: 0 });
    setInterval(() => {
        for (const charName in loaded_characters) {
            loaded_characters[charName].update();
        }
    }, 1000 / FRAME_RATE);
}

DEBUG_START();