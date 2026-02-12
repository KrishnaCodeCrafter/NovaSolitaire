import { _decorator, Component, Node, Vec3, tween, UITransform, Sprite, SpriteFrame, UIOpacity, isValid, AudioClip, AudioSource, Tween, director } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('CardMover')
export class CardMover extends Component {

    // --- MOVEMENT SETTINGS ---
    @property({ type: Node }) targetNode: Node | null = null;
    @property yOffset: number = 0;
    @property moveDuration: number = 0.5;

    // --- NEXT CARD SETTINGS ---
    @property({ type: Node }) nextCardNode: Node | null = null;
    @property({ type: SpriteFrame }) nextCardSpriteFrame: SpriteFrame | null = null;

    // --- EFFECT SETTINGS ---
    @property({ header: 'Effect Settings' })
    @property({ type: SpriteFrame }) ringSprite: SpriteFrame | null = null;
    @property({ type: SpriteFrame }) starSprite: SpriteFrame | null = null;
    @property({ type: AudioClip }) successSound: AudioClip | null = null;

    // --- GLOW SETTINGS ---
    @property({ header: 'Glow Settings' })
    
    @property({ type: SpriteFrame, tooltip: 'Drag the glowing_card.png here' })
    glowSpriteFrame: SpriteFrame | null = null;

    @property({ tooltip: 'Time in seconds to wait before the glow starts' })
    glowDelay: number = 0.5;

    @property({ tooltip: 'If true, uses the width/height below. If false, matches card size.' })
    useCustomGlowSize: boolean = true;

    @property({ visible: function(this: CardMover) { return this.useCustomGlowSize; } })
    glowWidth: number = 250;

    @property({ visible: function(this: CardMover) { return this.useCustomGlowSize; } })
    glowHeight: number = 350;

    private _isMoved: boolean = false;
    private _glowNode: Node | null = null;
    private _glowTween: Tween<UIOpacity> | null = null;

    public performCorrectAction() {
        if (this._isMoved) return;
        this._isMoved = true;
        this.stopGlowing(); 
        this.moveToTarget();
    }

    private moveToTarget() {
        if (!this.targetNode) return;

        // [FIX] Strict Reparenting Logic
        // We must keep the card inside 'Card_Section' so it stays behind the EndScreen.
        
        let safeParent: Node | null = null;
        let cardSection: Node | null = null;

        // 1. Recursive search up to find 'Card_Section'
        let current = this.node.parent;
        while (current) {
            if (current.name === 'Card_Section') {
                cardSection = current;
                break;
            }
            current = current.parent;
        }

        // 2. Determine Safe Parent
        if (cardSection) {
            // Try to find 'Effects' inside Card_Section
            safeParent = cardSection.getChildByName("Effects");
            
            // If 'Effects' is missing, put it directly in Card_Section (but at the end)
            if (!safeParent) {
                safeParent = cardSection; 
            }
        } else {
            // Panic Fallback: If we can't find Card_Section, stay in current parent 
            // (Layout might fight us, but it's better than overlapping EndScreen)
            safeParent = this.node.parent;
        }

        // 3. Reparent safely
        if (safeParent && safeParent !== this.node.parent) {
            this.node.setParent(safeParent, true); // true = keep world position
            this.node.setSiblingIndex(safeParent.children.length - 1); 
        }

        // 4. Calculate target position in the NEW parent's local space
        let targetWorldPos = this.targetNode.worldPosition.clone();
        targetWorldPos.y += this.yOffset;
        
        let finalPos = targetWorldPos;
        const parentTransform = this.node.parent?.getComponent(UITransform);
        
        if (parentTransform) {
            finalPos = parentTransform.convertToNodeSpaceAR(targetWorldPos);
        }

        // 5. Animate
        tween(this.node)
            .to(this.moveDuration, { position: finalPos }, { easing: 'cubicOut' })
            .call(() => {
                if (this.targetNode) this.playSuccessEffect(this.targetNode);
                this.flipNextCard();
            })
            .start();
    }

    private flipNextCard() {
        if (!this.nextCardNode || !this.nextCardSpriteFrame) return;
        const duration = 0.3;
        const initialScale = this.nextCardNode.scale.clone();

        tween(this.nextCardNode)
            .to(duration / 2, { scale: new Vec3(0, initialScale.y, 1) }, { easing: 'sineIn' })
            .call(() => {
                const sprite = this.nextCardNode?.getComponent(Sprite);
                if (sprite) sprite.spriteFrame = this.nextCardSpriteFrame;
            })
            .to(duration / 2, { scale: initialScale }, { easing: 'sineOut' })
            .start();
    }

    private playSuccessEffect(targetNode: Node) {
        if (!this.ringSprite || !this.starSprite) return;
        this.playSFX(this.successSound);

        const effectContainer = new Node('EffectContainer');
        effectContainer.layer = this.node.layer; 
        
        // Ensure effects spawn in the same parent as the moved card
        if (this.node.parent) {
            this.node.parent.addChild(effectContainer);
        } else {
             targetNode.addChild(effectContainer);
        }
        
        effectContainer.setWorldPosition(targetNode.worldPosition);

        const ring = new Node('Ring');
        ring.layer = this.node.layer; 
        const ringSpriteComp = ring.addComponent(Sprite);
        ringSpriteComp.spriteFrame = this.ringSprite;
        ring.addComponent(UIOpacity).opacity = 255;
        ring.addComponent(UITransform).setContentSize(80, 80); 
        effectContainer.addChild(ring);

        for (let i = 0; i < 20; i++) { 
            const star = new Node('Star');
            star.layer = this.node.layer;
            const starSpriteComp = star.addComponent(Sprite);
            starSpriteComp.spriteFrame = this.starSprite;
            star.addComponent(UIOpacity).opacity = 255;
            star.addComponent(UITransform).setContentSize(20, 20);
            
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 30; 
            star.setPosition(new Vec3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0));
            effectContainer.addChild(star);
        }

        effectContainer.setScale(new Vec3(0.5, 0.5, 1));
        
        tween(effectContainer)
            .to(0.5, { scale: new Vec3(2.5, 2.5, 1) }, { easing: 'sineOut' })
            .start();

        const opacityComp = effectContainer.addComponent(UIOpacity);
        tween(opacityComp)
            .to(0.5, { opacity: 0 }, { easing: 'sineIn' })
            .call(() => { if (isValid(effectContainer)) effectContainer.destroy(); })
            .start();
    }

    private playSFX(clip: AudioClip | null) {
        if (!clip) return;
        let audioSource = this.node.getComponent(AudioSource);
        if (!audioSource) audioSource = this.node.addComponent(AudioSource);
        audioSource.playOneShot(clip);
    }

    // --- GLOW LOGIC ---

    public startGlowing() {
        if (!this.glowSpriteFrame) return;

        if (!isValid(this._glowNode)) {
            this._glowNode = new Node("GlowEffect");
            this._glowNode.layer = this.node.layer; 
            this.node.addChild(this._glowNode);
            this._glowNode.setSiblingIndex(0); 

            const sprite = this._glowNode.addComponent(Sprite);
            sprite.spriteFrame = this.glowSpriteFrame;
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;

            const t = this._glowNode.addComponent(UITransform);
            if (this.useCustomGlowSize) {
                t.setContentSize(this.glowWidth, this.glowHeight);
            } else {
                const parentT = this.node.getComponent(UITransform);
                if (parentT) t.setContentSize(parentT.contentSize);
            }
            this._glowNode.addComponent(UIOpacity).opacity = 0;
        }

        this.stopGlowing();
        this.scheduleOnce(this._startGlowAnimation, this.glowDelay);
    }

    private _startGlowAnimation = () => {
        if (!isValid(this._glowNode)) return;

        this._glowNode.active = true;
        const opacityComp = this._glowNode.getComponent(UIOpacity)!;
        opacityComp.opacity = 0;

        this._glowTween = tween(opacityComp)
            .to(0.5, { opacity: 255 }, { easing: 'sineOut' })
            .to(0.5, { opacity: 100 }, { easing: 'sineIn' })
            .union()
            .repeatForever()
            .start();
    }

    public stopGlowing() {
        this.unschedule(this._startGlowAnimation);

        if (this._glowTween) {
            this._glowTween.stop();
            this._glowTween = null;
        }

        if (isValid(this._glowNode)) {
            this._glowNode.active = false;
        }
    }
}