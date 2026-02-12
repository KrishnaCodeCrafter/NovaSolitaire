import { _decorator, Component, Node, instantiate, UITransform, Vec3, tween, UIOpacity, EventTouch, AudioClip, AudioSource, Sprite } from 'cc';
import { GameManager } from './GameManager';
import { CardMover } from './CardMover';
import { HandController } from './HandController'; // [FIX] Import HandController

const { ccclass, property } = _decorator;

@ccclass('CardGroupController')
export class CardGroupController extends Component {

    // --- VISUALS ---
    @property({ type: Node, tooltip: "Drag 'Effects/Cross' here" })
    crossTemplate: Node | null = null;

    @property({ type: Node, tooltip: "The node where the cross should spawn (usually 'Effects')" })
    effectsContainer: Node | null = null;

    // --- AUDIO ---
    @property({ type: AudioClip })
    wrongSoundClip: AudioClip | null = null;

    private _audioSource: AudioSource | null = null;

    start() {
        if (this.crossTemplate) this.crossTemplate.active = false;

        if (this.wrongSoundClip) {
            this._audioSource = this.node.getComponent(AudioSource);
            if (!this._audioSource) this._audioSource = this.node.addComponent(AudioSource);
        }

        this.registerAllCards();
    }

    private registerAllCards() {
        // 1. Register "Real" Cards (Movers)
        const movers = this.node.getComponentsInChildren(CardMover);
        movers.forEach(mover => this.addClickListener(mover.node));

        // 2. Register "Dummy" Cards (Sprites)
        const allSprites = this.node.getComponentsInChildren(Sprite);
        
        allSprites.forEach(sprite => {
            const node = sprite.node;
            
            // --- [FIX] EXCLUSION LIST ---
            // We skip Effects, Crosses, Templates, and now the HAND.
            if (node.name === "Effects" || node.name === "Cross") return;
            if (node === this.crossTemplate) return;
            
            // IGNORE THE HAND
            if (node.name === "Hand" || node.getComponent(HandController)) return; 
            // -----------------------------

            if (node.getComponent(CardMover)) return; // Already handled above

            this.addClickListener(node);
        });
    }

    private addClickListener(cardNode: Node) {
        // Prevent double registration
        if (cardNode.hasChangedFlags === 123) return; 
        cardNode.hasChangedFlags = 123; 

        cardNode.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            event.propagationStopped = true; 
            this.onCardClicked(event, cardNode);
        }, this);
    }

    private onCardClicked(event: EventTouch, clickedCard: Node) {
        if (!GameManager.instance) return;

        const isCorrect = GameManager.instance.isCardCorrect(clickedCard);

        if (isCorrect) {
            console.log("✅ Correct Move!");
            GameManager.instance.incrementMove(); 
            clickedCard.off(Node.EventType.TOUCH_END);

            const mover = clickedCard.getComponent(CardMover);
            if (mover) mover.performCorrectAction();

        } else {
            console.log(`❌ Wrong Move! Clicked: ${clickedCard.name}`);
            this.shakeCard(clickedCard);
            this.spawnCrossMark(event);
            
            if (this.wrongSoundClip && this._audioSource) {
                this._audioSource.playOneShot(this.wrongSoundClip, 1.0);
            }
        }
    }

    private shakeCard(card: Node) {
        tween(card)
            .by(0.05, { position: new Vec3(5, 0, 0) })
            .by(0.05, { position: new Vec3(-10, 0, 0) })
            .by(0.05, { position: new Vec3(10, 0, 0) })
            .by(0.05, { position: new Vec3(-5, 0, 0) })
            .start();
    }

    private spawnCrossMark(event: EventTouch) {
        let parentNode = this.effectsContainer;
        let template = this.crossTemplate;

        // Auto-find if missing
        if (!parentNode) parentNode = this.node.scene.getChildByPath('Canvas/Card_Section/Effects');
        if (!template && parentNode) template = parentNode.getChildByName('Cross');

        if (!parentNode || !template) return;

        if (!parentNode.activeInHierarchy) parentNode.active = true;

        const cross = instantiate(template);
        cross.parent = parentNode;
        cross.active = true;
        cross.setSiblingIndex(999);

        // Position
        const uiTransform = parentNode.getComponent(UITransform);
        if (uiTransform) {
            const uiPos = event.getUILocation(); 
            const localPos = uiTransform.convertToNodeSpaceAR(new Vec3(uiPos.x, uiPos.y, 0));
            cross.setPosition(new Vec3(localPos.x, localPos.y, 0));
        }

        // --- ANIMATION ---
        cross.setScale(new Vec3(0, 0, 1)); 
        cross.angle = 0;
        
        let op = cross.getComponent(UIOpacity);
        if (!op) op = cross.addComponent(UIOpacity);
        op.opacity = 255;

        // Smaller Scale (0.4)
        const targetScale = 0.2;  
        const popScale = 0.3;     

        tween(cross)
            .to(0.2, { scale: new Vec3(popScale, popScale, 1) }, { easing: 'backOut' })
            .to(0.1, { scale: new Vec3(targetScale, targetScale, 1) })
            .by(0.05, { angle: 15 })
            .by(0.1, { angle: -30 })
            .by(0.1, { angle: 30 })
            .by(0.05, { angle: -15 })
            .delay(0.2)
            .parallel(
                tween(op).to(0.3, { opacity: 0 }),
                tween(cross).by(0.3, { position: new Vec3(0, -30, 0) })
            )
            .call(() => { cross.destroy(); }) 
            .start();
    }
}