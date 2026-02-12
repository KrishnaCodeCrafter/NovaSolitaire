import { _decorator, Component, Node, tween, UIOpacity, Vec3, AudioSource } from 'cc'; 
import { HandController } from './HandController';
import { CardMover } from './CardMover';

const { ccclass, property } = _decorator;

@ccclass('GameManager')
export class GameManager extends Component {

    public static instance: GameManager | null = null;

    @property({ tooltip: "Maximum moves allowed before ending" })
    maxMoves: number = 3;

    @property({ tooltip: "Current move count (Read Only)" })
    moveCount: number = 0;

    @property({ type: [Node], tooltip: "Drag cards here in order" })
    correctCards: Node[] = [];

    @property({ type: HandController })
    handGuide: HandController | null = null;

    // --- Loading UI Nodes ---
    @property({ type: Node }) nowLoadingNode: Node | null = null;
    @property({ type: Node }) dullStar: Node | null = null;
    @property({ type: Node }) glowingStar: Node | null = null;
    @property({ type: Node }) afterLoadingNode: Node | null = null; 
    @property({ tooltip: "Loading time" }) totalLoadingTime: number = 1.0;

    // --- End Screen Nodes ---
    @property({ type: Node }) endScreenNode: Node | null = null;
    @property({ type: Node }) endScreenBg: Node | null = null;
    @property({ type: Node }) endScreenContainer: Node | null = null;

    // --- Audio Property ---
    @property({ type: AudioSource }) 
    bgmAudioSource: AudioSource | null = null;

    onLoad() {
        GameManager.instance = this;
        this.moveCount = 0;
        if (this.endScreenNode) this.endScreenNode.active = false;
        if (this.nowLoadingNode) this.nowLoadingNode.active = true;
        if (this.afterLoadingNode) this.afterLoadingNode.active = false;
    }

    start() {
        const halfTime = this.totalLoadingTime / 2;
        if (this.dullStar) this.dullStar.active = true;
        if (this.glowingStar) this.glowingStar.active = false;

        // Toggle star state halfway through loading
        this.scheduleOnce(() => {
            if (this.dullStar) this.dullStar.active = false;
            if (this.glowingStar) this.glowingStar.active = true;
        }, halfTime);

        // --- FINISH LOADING ---
        this.scheduleOnce(() => {
            if (this.nowLoadingNode) this.nowLoadingNode.active = false;
            if (this.afterLoadingNode) this.afterLoadingNode.active = true;

            // --- DEBUG LOG ---
            console.log("🃏 Checking Correct Cards...", this.correctCards);
            if (this.correctCards.length === 0) {
                console.error("❌ ERROR: 'Correct Cards' list is empty in GameManager! Drag the cards into the array in the Inspector.");
            }
            // -----------------
            
            // --- PLAY MUSIC HERE ---
            if (this.bgmAudioSource) {
                this.bgmAudioSource.loop = true; 
                this.bgmAudioSource.play();      
            }

            // [FIX]: Increased delay to 0.5s. 
            // This is CRITICAL. It allows the Layout system (Columns/Slots) 
            // to finish calculating card positions before we ask the hand to point.
            this.scheduleOnce(() => {
             this.highlightNextCard();
            }, 0.5);

        }, this.totalLoadingTime);
    }

    public isCardCorrect(clickedCard: Node): boolean {
        if (this.moveCount >= this.correctCards.length) return false;
        return clickedCard === this.correctCards[this.moveCount];
    }

    public incrementMove() {
        this.moveCount++;
        console.log(`Moves: ${this.moveCount} / ${this.maxMoves}`);

        if (this.moveCount >= this.maxMoves) {
            // Game Over
            if (this.handGuide) this.handGuide.hide(); 
            this.scheduleOnce(() => {
                this.showEndScreen();
            }, 1.0); 
        } else {
            this.highlightNextCard();
        }
    }

    highlightNextCard() {
        if (this.moveCount > 0 && this.moveCount - 1 < this.correctCards.length) {
             const prevCard = this.correctCards[this.moveCount - 1];
             const prevMover = prevCard.getComponent(CardMover);
             if (prevMover) prevMover.stopGlowing();
        }

        if (this.moveCount < this.correctCards.length) {
            const correctCard = this.correctCards[this.moveCount];
            const cardMover = correctCard.getComponent(CardMover);
            if (cardMover) {
                cardMover.startGlowing();
            }
            if (this.handGuide) this.handGuide.pointAt(correctCard);
        } else {
            if (this.handGuide) this.handGuide.hide();
        }
    }

    private showEndScreen() {
        if (!this.endScreenNode) return;
        this.endScreenNode.active = true;

        if (this.endScreenBg) {
            let op = this.endScreenBg.getComponent(UIOpacity);
            if (!op) op = this.endScreenBg.addComponent(UIOpacity);
            op.opacity = 0;
            tween(op).to(0.5, { opacity: 200 }).start();
        }

        if (this.endScreenContainer) {
            this.endScreenContainer.setScale(new Vec3(0, 0, 1));
            tween(this.endScreenContainer)
                .to(0.5, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
                .start();
        }
    }
}