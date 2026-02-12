import { _decorator, Component, Node, Vec3, tween, UITransform, UIOpacity, Tween } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('HandController')
export class HandController extends Component {

    @property({ group: "Settings", tooltip: "Time to slide one way" })
    slideDuration: number = 0.8;

    @property({ group: "Visuals", tooltip: "Distance from target to start" })
    slideDistance: number = 50;

    @property({ group: "Visuals" })
    rotation: number = 0; 

    @property({ group: "Visuals" })
    scaleX: number = 1.0;

    @property({ group: "Visuals" })
    scaleY: number = 1.0;

    @property({ group: "Offsets" })
    targetOffsetX: number = 20; 
    @property({ group: "Offsets" })
    targetOffsetY: number = -40; 

    private _targetPos: Vec3 = new Vec3(); 
    private _startPos: Vec3 = new Vec3();  
    private _tweenAnim: Tween<Node> | null = null;
    private _uiOpacity: UIOpacity | null = null;

    onLoad() {
        this._uiOpacity = this.node.getComponent(UIOpacity);
        if (!this._uiOpacity) {
            this._uiOpacity = this.node.addComponent(UIOpacity);
        }
        // Force fully visible
        this._uiOpacity.opacity = 255; 
        this.node.active = false;
    }

    public pointAt(targetCard: Node) {
        this.stopAnim();
        this.unscheduleAllCallbacks();

        if (!targetCard) return;

        // 1. Force Active & Top Layer
        this.node.active = true;
        if (this.node.parent) {
            this.node.parent.active = true;
            this.node.setSiblingIndex(1000); // Bring to front
        }
        if (this._uiOpacity) this._uiOpacity.opacity = 255;

        // 2. Calculate Positions
        const targetWorldPos = targetCard.getComponent(UITransform).convertToWorldSpaceAR(Vec3.ZERO);
        const parentTransform = this.node.parent.getComponent(UITransform);
        const localPos = parentTransform.convertToNodeSpaceAR(targetWorldPos);

        // Target (Where the card is)
        this._targetPos = new Vec3(localPos.x + this.targetOffsetX, localPos.y + this.targetOffsetY, 0);

        // Start (Offset by distance)
        this._startPos = new Vec3(
            this._targetPos.x + this.slideDistance, 
            this._targetPos.y - this.slideDistance, 
            0
        );

        // 3. Reset State
        this.node.setPosition(this._startPos);
        this.node.angle = this.rotation;
        this.node.setScale(new Vec3(this.scaleX, this.scaleY, 1));

        // 4. Start Ping-Pong Animation
        this.playPingPong();
    }

    public hide() {
        this.stopAnim();
        this.node.active = false;
    }

    private playPingPong() {
        this.stopAnim();

        // Ensure visible
        this.node.active = true;
        if (this._uiOpacity) this._uiOpacity.opacity = 255;
        this.node.setPosition(this._startPos);

        // --- PING PONG LOGIC ---
        // 1. Move To Target
        // 2. Tap (Scale Down/Up)
        // 3. Move Back to Start
        // 4. Repeat
        
        const pingPong = tween(this.node)
            // Move In
            .to(this.slideDuration, { position: this._targetPos }, { easing: 'sineOut' }) 
            
            // Tap Effect
            .to(0.1, { scale: new Vec3(this.scaleX * 0.85, this.scaleY * 0.85, 1) }) 
            .to(0.1, { scale: new Vec3(this.scaleX, this.scaleY, 1) }) 
            
            // Pause slightly on the card
            .delay(0.2) 

            // Move Back (Return)
            .to(this.slideDuration, { position: this._startPos }, { easing: 'sineIn' })
            
            // Pause slightly at start position
            .delay(0.1);

        this._tweenAnim = tween(this.node)
            .sequence(pingPong)
            .repeatForever()
            .start();
    }

    private stopAnim() {
        if (this._tweenAnim) {
            this._tweenAnim.stop();
            this._tweenAnim = null;
        }
    }
}