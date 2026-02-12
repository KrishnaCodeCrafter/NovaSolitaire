import { _decorator, Component, Node, tween, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('PulseEffect')
export class PulseEffect extends Component {

    @property({ tooltip: 'How big it scales up (e.g. 1.2 = 20% bigger)' })
    scaleAmount: number = 1.2;

    @property({ tooltip: 'How fast one pulse takes (in seconds)' })
    pulseDuration: number = 0.8;

    start() {
        this.startPulse();
    }

    private startPulse() {
        // 1. Store original scale so we don't lose it
        const originalScale = this.node.scale.clone();
        
        // 2. Calculate target scale
        const targetScale = new Vec3(
            originalScale.x * this.scaleAmount, 
            originalScale.y * this.scaleAmount, 
            1
        );

        // 3. Create the Loop
        tween(this.node)
            .to(this.pulseDuration, { scale: targetScale }, { easing: 'sineOut' }) // Grow
            .to(this.pulseDuration, { scale: originalScale }, { easing: 'sineIn' })  // Shrink
            .union() // Combine them into one action
            .repeatForever() // Do it forever
            .start();
    }
}