import { _decorator, Component, view, ResolutionPolicy, Node, UITransform, tween, Vec3, UIOpacity } from 'cc';
import { GameManager } from './GameManager';
const { ccclass, property } = _decorator;

@ccclass('ResolutionManager')
export class ResolutionManager extends Component {

    @property(Node) portraitLogo: Node = null!; 
    @property(Node) landscapeLogo: Node = null!; 
    @property(Node) portraitUI: Node = null!;   
    @property(Node) landscapeUI: Node = null!;  

    @property(Node) portraitBackground: Node = null!;
    @property(Node) landscapeBackground: Node = null!;
    @property(Node) portraitIcon: Node = null!; 
    @property(Node) landscapeIcon: Node = null!;

    @property(GameManager) gameManager: GameManager = null!; 

    private _isLandscape: boolean = false;
    private _hasAnimatedPortraitUI: boolean = false; 

    onLoad() {
        view.setResizeCallback(() => this.updateLayout());
        
        if (this.gameManager) {
            this.gameManager.node.on('move-completed', this.onMoveCompleted, this);
        }

        this.updateLayout();
    }

    updateLayout() {
        const frameSize = view.getFrameSize();
        this._isLandscape = frameSize.width > frameSize.height;

        if (this._isLandscape) {
            view.setDesignResolutionSize(1440, 720, ResolutionPolicy.FIXED_HEIGHT);
        } else {
            view.setDesignResolutionSize(720, 1440, ResolutionPolicy.FIXED_WIDTH);
        }

        if (this._isLandscape) {
            if (this.landscapeLogo) this.landscapeLogo.active = true;
            if (this.landscapeUI) this.landscapeUI.active = true;
            if (this.landscapeBackground) this.landscapeBackground.active = true; 
            if (this.landscapeIcon) this.landscapeIcon.active = true;
            
            if (this.portraitLogo) this.portraitLogo.active = false;
            if (this.portraitUI) this.portraitUI.active = false;
            if (this.portraitBackground) this.portraitBackground.active = false; 
            if (this.portraitIcon) this.portraitIcon.active = false;
        } else {
            if (this.portraitLogo) this.portraitLogo.active = true;
            if (this.portraitBackground) this.portraitBackground.active = true; 
            if (this.portraitIcon) this.portraitIcon.active = true;
            
            const moves = this.gameManager ? this.gameManager.moveCount : 0;
            if (this.portraitUI) {
                if (moves >= 3) {
                    this.portraitUI.active = true;
                    if (this._hasAnimatedPortraitUI) {
                        // Ensure it resets cleanly if they rotate their phone
                        this.portraitUI.setScale(new Vec3(1, 1, 1));
                        const op = this.portraitUI.getComponent(UIOpacity);
                        if (op) op.opacity = 255;
                    }
                } else {
                    this.portraitUI.active = false;
                }
            }

            if (this.landscapeLogo) this.landscapeLogo.active = false;
            if (this.landscapeUI) this.landscapeUI.active = false;
            if (this.landscapeBackground) this.landscapeBackground.active = false; 
            if (this.landscapeIcon) this.landscapeIcon.active = false;
        }
        
        this.node.getComponent(UITransform)?.setContentSize(view.getVisibleSize());

        if (this.gameManager) {
            this.gameManager.resetIdleTimer();
            this.gameManager.refreshHandTutorial();
        }
    }

    private onMoveCompleted(moves: number) {
        if (!this._isLandscape && moves >= 3) {
            if (this.portraitUI && !this.portraitUI.active) {
                this.portraitUI.active = true;
                
                if (!this._hasAnimatedPortraitUI) {
                    this._hasAnimatedPortraitUI = true;

                    let op = this.portraitUI.getComponent(UIOpacity);
                    if (!op) op = this.portraitUI.addComponent(UIOpacity);

                    // 1. Start fully transparent and ONLY slightly scaled down (0.9)
                    // This prevents the illusion of the position changing.
                    op.opacity = 0;
                    this.portraitUI.setScale(new Vec3(0.9, 0.9, 1));

                    // 2. Smooth, elegant fade in over 0.5 seconds
                    tween(op)
                        .to(0.5, { opacity: 255 }, { easing: 'sineOut' })
                        .start();
                    
                    // 3. Smooth, bounce-free scale up to normal size
                    tween(this.portraitUI)
                        .to(0.5, { scale: new Vec3(1, 1, 1) }, { easing: 'cubicOut' })
                        .start();

                    console.log("3 moves reached! Portrait UI animated in smoothly.");
                }
            }
        }
    }
}