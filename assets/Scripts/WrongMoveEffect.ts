import { _decorator, Component, Node, Sprite, tween, Vec3, UIOpacity } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('WrongMoveEffect')
export class WrongMoveEffect extends Component {

    @property({ type: Node, tooltip: "The node containing the Cross (X) sprite" })
    crossNode: Node | null = null;

    start() {
        // Ensure cross is hidden at start
        if (this.crossNode) {
            this.crossNode.active = false;
        }
    }

    public playEffect() {
        if (!this.crossNode) return;

        // 1. Show Cross
        this.crossNode.active = true;
        this.crossNode.setScale(new Vec3(0, 0, 1)); // Start small
        
        // 2. Animate Cross (Pop in)
        tween(this.crossNode)
            .to(0.2, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .delay(0.5)
            .call(() => {
                this.crossNode.active = false; // Hide after 0.5s
            })
            .start();

        // 3. Shake the Card (Visual feedback)
        const originalPos = this.node.position.clone();
        tween(this.node)
            .by(0.05, { position: new Vec3(10, 0, 0) })
            .by(0.05, { position: new Vec3(-20, 0, 0) })
            .by(0.05, { position: new Vec3(20, 0, 0) })
            .by(0.05, { position: new Vec3(-10, 0, 0) })
            .to(0.05, { position: originalPos })
            .start();
    }
}