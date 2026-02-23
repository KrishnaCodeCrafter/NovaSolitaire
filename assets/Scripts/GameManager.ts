import { _decorator, Component, Node, Vec3, tween, UIOpacity, isValid, AudioSource, AudioClip, UITransform, Label, Tween, Prefab, instantiate, Color, math, view, Sprite, Widget } from 'cc';
import { StackOutline } from './stackOutline'; 

const { ccclass, property } = _decorator;

// --- 1. INTERFACES ---
interface CardData {
    value: number;  
    suit: number;   
    isRed: boolean;
    node: Node;
}

interface CardLogicComponent extends Component {
    getCardData(node: Node): CardData | null;
    visualDeckTop?: Node;
    emptyStockVisual?: Node;
    placeholderNode?: Node;
    setHighlightState?(isActive: boolean): void;
}

// Interface for Hints
interface StrategicMove {
    type: string;
    from: Node;
    to?: Node;
    score: number;
}

// Interface for card animation data
interface CardAnimationData {
    node: Node;
    originalY: number;
    originalX: number;
    originalZ: number;
    column: number;
    row: number;
}

@ccclass('GameManager')
export class GameManager extends Component {

    // --- UI REFERENCES ---
    @property(Node) public introNode: Node = null!; // Now used for the post-deal message
    @property(Node) public handNode: Node = null!; 
    @property(Node) public mainNode: Node = null!;
    @property(Node) public ctaScreen: Node = null!;       
    @property(Node) public globalOverlay: Node = null!;
    @property({ type: AudioClip }) public bgmClip: AudioClip = null!;
    @property({ type: AudioClip }) public cardDropSound: AudioClip = null!;
    @property(Node) public timePopup: Node = null!; 
    @property({ type: Prefab }) public confettiPrefab: Prefab = null!;
    @property({ type: Node }) public confettiContainer: Node = null!;
    @property public popupDelay: number = 30.0; 


    // --- PILE REFERENCES ---
    @property({ type: [Node] }) public tableauNodes: Node[] = [];
    @property({ type: [Node] }) public foundationNodes: Node[] = [];
    @property({ type: Node }) public stockNode: Node = null!;
    @property({ type: Node }) public wasteNode: Node = null!;

    // --- AI HINT SYSTEM ---
    @property({ type: StackOutline }) public stackOutline: StackOutline = null!; 
    @property public idleHintDelay: number = 5.0;

    // --- INTERNAL STATE ---
    private _isFirstMovePending: boolean = true; 
    private _isIntroShowing: boolean = false;
    private _audioSource: AudioSource = null!;
    private _gameWon: boolean = false;
    private _isAutoPlaying: boolean = false; 
    private _idleTimer: number = 0;
    private _isHintActive: boolean = false;
    private _totalHiddenCards: number = 21; 
    private _revealedCount: number = 0;
    private _animationComplete: boolean = false; 
    private _isTimePopupShowing: boolean = false; 

    onLoad() {
        this.initBGM();
        this.setupInitialState();
        this.startSequence();
    }

    update(dt: number) {
        if (!this._gameWon && !this._isHintActive && !this._isAutoPlaying && 
            this.mainNode.active && this._animationComplete) {
            
            if (this._isFirstMovePending) return;

            this._idleTimer += dt;
            if (this._idleTimer >= this.idleHintDelay) {
                this.showDynamicHint();
            }
        }
    }

    public resetIdleTimer() {
        if (this._isAutoPlaying) return; 
        this._idleTimer = 0;
        this.hideDynamicHint();
    }

    public get isInteractable(): boolean {
        return this._animationComplete && 
               !this._isIntroShowing && 
               !this._isTimePopupShowing &&
               !this._gameWon && 
               !this._isAutoPlaying;
    }

    public addValidMove(clickedNode: Node) {
        if (this._gameWon || this._isAutoPlaying) return;

        if (this._isFirstMovePending) {
            this._isFirstMovePending = false;
            this.hideHandTutorial();
        }

        this.resetIdleTimer();
        this.ensureAudioPlays();

        // Check for win condition right away
        this.checkFoundationWinCondition(); 
    }


    // =========================================================================
    // INITIAL CARD DROP ANIMATION
    // =========================================================================

    private startGameLogic() {
        if (this.mainNode) {
            this.mainNode.active = true;
            
            this.hideTableauCards();
            
            tween(this.mainNode.getComponent(UIOpacity) || this.mainNode.addComponent(UIOpacity))
                .to(0.3, { opacity: 255 })
                .call(() => {
                    this.animateCardsDropping();
                })
                .start();
        }
    }

    private hideTableauCards() {
        this.tableauNodes.forEach((pile) => {
            const cardLogic = pile.getComponent('CardLogic') as unknown as CardLogicComponent;
            const cardNodes = pile.children.filter(c => 
                c.active && 
                c !== cardLogic?.placeholderNode &&
                (c.name.startsWith("card") || c.name.includes("faceDown"))
            );
            
            cardNodes.forEach((card) => {
                const opacity = card.getComponent(UIOpacity) || card.addComponent(UIOpacity);
                opacity.opacity = 0; 
            });
        });
    }

    private animateCardsDropping() {
        const cardAnimations: CardAnimationData[] = [];
        const stockWorldPos = this.stockNode.getWorldPosition();

        const originalStockScale = this.stockNode.getScale().clone();
        const originalWasteScale = this.wasteNode.getScale().clone();
        this.stockNode.setScale(new Vec3(0, 0, 1));
        this.wasteNode.setScale(new Vec3(0, 0, 1));

        this.tableauNodes.forEach((pile, columnIndex) => {
            const cardLogic = pile.getComponent('CardLogic') as unknown as CardLogicComponent;
            const cardNodes = pile.children.filter(c => 
                c.active && 
                c !== cardLogic?.placeholderNode &&
                (c.name.startsWith("card") || c.name.includes("faceDown"))
            );
            
            cardNodes.forEach((card, rowIndex) => {
                const finalPos = card.getPosition().clone(); 
                const transform = card.parent?.getComponent(UITransform);
                const localStart = transform ? transform.convertToNodeSpaceAR(stockWorldPos) : new Vec3(0,0,0);

                cardAnimations.push({
                    node: card,
                    originalX: finalPos.x,
                    originalY: finalPos.y,
                    originalZ: finalPos.z,
                    column: columnIndex,
                    row: rowIndex,
                    //@ts-ignore
                    startPos: localStart
                });
            });
        });

        cardAnimations.sort((a, b) => {
            if (a.column === b.column) return a.row - b.row;
            return a.column - b.column;
        });

        let maxDuration = 0;

        cardAnimations.forEach((data, index) => {
            const card = data.node;
            //@ts-ignore
            const startPos = data.startPos as Vec3;
            const endPos = new Vec3(data.originalX, data.originalY, data.originalZ);

            card.setPosition(startPos);
            card.setScale(new Vec3(0, 0, 1)); 
            card.angle = 180; 
            const opacity = card.getComponent(UIOpacity);
            if(opacity) opacity.opacity = 255;

            const midX = (startPos.x + endPos.x) / 2;
            const midY = (startPos.y + endPos.y) / 2 + 300; 
            const controlPos = new Vec3(midX, midY, 0);

            const delay = 0.1 + (index * 0.08); 
            const flightDuration = 0.6;
            maxDuration = Math.max(maxDuration, delay + flightDuration);

            if (index % 3 === 0) {
                this.scheduleOnce(() => {
                    if(this._audioSource && this.cardDropSound) this._audioSource.playOneShot(this.cardDropSound, 0.3);
                }, delay);
            }

            const tweenObj = { t: 0 };
            
            tween(tweenObj)
                .delay(delay)
                .to(flightDuration, { t: 1 }, { 
                    easing: 'sineOut', 
                    onUpdate: (target: {t: number}) => {
                        const t = target.t;
                        
                        const u = 1 - t;
                        const tt = t * t;
                        const uu = u * u;

                        const x = (uu * startPos.x) + (2 * u * t * controlPos.x) + (tt * endPos.x);
                        const y = (uu * startPos.y) + (2 * u * t * controlPos.y) + (tt * endPos.y);
                        
                        card.setPosition(x, y, 0);
                        card.angle = 180 - (180 * t); 
                        
                        const scaleAdd = 0.5 * (4 * t * (1 - t)); 
                        card.setScale(1 + scaleAdd, 1 + scaleAdd, 1);
                    }
                })
                .call(() => {
                    card.setPosition(endPos); 
                    card.angle = 0;
                    
                    tween(card)
                        .to(0.1, { scale: new Vec3(1.15, 0.85, 1) }) 
                        .to(0.1, { scale: new Vec3(1, 1, 1) })      
                        .start();
                })
                .start();
        });

        this.scheduleOnce(() => {
            this.popInNode(this.stockNode, originalStockScale);
            this.popInNode(this.wasteNode, originalWasteScale);
        }, maxDuration * 0.6);

        this.scheduleOnce(() => {
            this._animationComplete = true;
            if (this._isFirstMovePending) {
                this.showIntroMessage(); // Launch intro message instead of hand directly
            }
            this.scheduleOnce(this.showTimePopup, this.popupDelay);
        }, maxDuration + 0.2);
    }

    private popInNode(node: Node, targetScale: Vec3) {
        if(!node) return;
        node.active = true;
        node.setScale(new Vec3(0,0,1));
        this.ensureCardsVisible(node); 
        tween(node)
            .to(0.4, { scale: targetScale }, { easing: 'elasticOut' })
            .start();
    }

    private ensureCardsVisible(pile: Node) {
        const cardLogic = pile.getComponent('CardLogic') as unknown as CardLogicComponent;
        const cards = pile.children.filter(c => 
            c.active && 
            c !== cardLogic?.placeholderNode &&
            c !== cardLogic?.visualDeckTop &&
            c !== cardLogic?.emptyStockVisual
        );
        
        cards.forEach((card) => {
            const opacity = card.getComponent(UIOpacity);
            if (opacity) {
                opacity.opacity = 255;
            }
        });
    }


    // =========================================================================
    // 30-SECOND POPUP LOGIC
    // =========================================================================

    private showTimePopup() {
        // Don't show if the node isn't assigned or the player already won
        if (!this.timePopup || this._gameWon) return;

        this._isTimePopupShowing = true;
        this.timePopup.active = true;
        
        // Fade it in smoothly
        const op = this.timePopup.getComponent(UIOpacity) || this.timePopup.addComponent(UIOpacity);
        op.opacity = 0;
        tween(op).to(0.3, { opacity: 255 }).start();

        // Listen for a tap anywhere on the popup to dismiss it early
        this.timePopup.on(Node.EventType.TOUCH_END, this.hideTimePopup, this);

        // Auto-dismiss after 3 seconds if the user doesn't click it
        this.scheduleOnce(this.hideTimePopup, 3.0);
    }

    private hideTimePopup() {
        if (!this.timePopup || !this._isTimePopupShowing) return;

        this._isTimePopupShowing = false;
        
        // Cancel the 3-second auto-timer and remove the touch event
        this.unschedule(this.hideTimePopup);
        this.timePopup.off(Node.EventType.TOUCH_END, this.hideTimePopup, this);

        // Fade it out smoothly
        const op = this.timePopup.getComponent(UIOpacity);
        if (op) {
            tween(op).to(0.3, { opacity: 0 })
                .call(() => {
                    this.timePopup.active = false;
                })
                .start();
        } else {
            this.timePopup.active = false;
        }
    }

    // =========================================================================
    // POST-DEAL INTRO MESSAGE LOGIC
    // =========================================================================

    private showIntroMessage() {
        if (!this.introNode) {
            // Fallback: If introNode isn't assigned, just start the hand tutorial immediately
            if (this._isFirstMovePending) this.showHandTutorial();
            return;
        }

        this._isIntroShowing = true;
        this.introNode.active = true;
        
        const op = this.introNode.getComponent(UIOpacity) || this.introNode.addComponent(UIOpacity);
        op.opacity = 0;
        tween(op).to(0.3, { opacity: 255 }).start();

        // Listen for user tap anywhere on the intro node
        this.introNode.on(Node.EventType.TOUCH_END, this.hideIntroMessage, this);

        // Auto-dismiss after 3 seconds
        this.scheduleOnce(this.hideIntroMessage, 3.0);
    }

    private hideIntroMessage() {
        if (!this.introNode || !this._isIntroShowing) return;

        this._isIntroShowing = false;
        
        // Cancel the 3-second timer and remove the touch event
        this.unschedule(this.hideIntroMessage);
        this.introNode.off(Node.EventType.TOUCH_END, this.hideIntroMessage, this);

        const op = this.introNode.getComponent(UIOpacity);
        if (op) {
            tween(op).to(0.3, { opacity: 0 })
                .call(() => {
                    this.introNode.active = false;
                    // Start the hand tutorial right after the message hides
                    if (this._isFirstMovePending) {
                        this.showHandTutorial();
                    }
                })
                .start();
        } else {
            this.introNode.active = false;
            if (this._isFirstMovePending) this.showHandTutorial();
        }
    }

    // =========================================================================
    // FIRST MOVE TUTORIAL LOGIC
    // =========================================================================

    public refreshHandTutorial() {
        // Only refresh the hand if the cards are done, it's the first move, 
        // AND the intro message is no longer showing on the screen.
        if (this._isFirstMovePending && this._animationComplete && !this._isIntroShowing) {
            this.hideHandTutorial();
            this.unschedule(this.showHandTutorial);
            this.scheduleOnce(this.showHandTutorial, 0.1);
        }
    }

    private showHandTutorial() {
        if (!this.handNode || !this._isFirstMovePending) return;

        const bestMove = this.findBestMove();
        if (bestMove && bestMove.from && this.handNode.parent) {
            this.handNode.active = true;
            
            Tween.stopAllByTarget(this.handNode);
            
            const op = this.handNode.getComponent(UIOpacity) || this.handNode.addComponent(UIOpacity);
            const transform = this.handNode.parent.getComponent(UITransform);
            if (!transform) return;

            const handOffset = new Vec3(40, -60, 0); 
            const fromWorldPos = bestMove.from.getWorldPosition();
            const fromLocalPos = transform.convertToNodeSpaceAR(fromWorldPos).add(handOffset);

            if (bestMove.to) {
                const toWorldPos = bestMove.to.getWorldPosition();
                const toLocalPos = transform.convertToNodeSpaceAR(toWorldPos).add(handOffset);
                
                op.opacity = 0; 
                this.handNode.angle = 0;
                
                tween(this.handNode)
                    .repeatForever(
                        tween()
                            .call(() => { 
                                this.handNode.setPosition(fromLocalPos); 
                                this.handNode.angle = 0;
                            })
                            .parallel(
                                tween(op).to(0.3, { opacity: 255 }),
                                tween(this.handNode).to(0.3, { scale: new Vec3(1.1, 1.1, 1) }) 
                            )
                            .to(0.2, { scale: new Vec3(0.9, 0.9, 1), angle: -5 }, { easing: 'sineOut' })
                            .to(0.8, { position: toLocalPos }, { easing: 'sineInOut' })
                            .to(0.2, { scale: new Vec3(1.1, 1.1, 1), angle: 0 }, { easing: 'sineIn' })
                            .parallel(
                                tween(op).to(0.3, { opacity: 0 }),
                                tween(this.handNode).to(0.3, { scale: new Vec3(1, 1, 1) })
                            )
                            .delay(0.4) 
                    )
                    .start();
            } else {
                op.opacity = 0;
                this.handNode.angle = 0;
                
                tween(this.handNode)
                    .repeatForever(
                        tween()
                            .call(() => { this.handNode.setPosition(fromLocalPos); })
                            .parallel(
                                tween(op).to(0.3, { opacity: 255 }),
                                tween(this.handNode).to(0.3, { scale: new Vec3(1.1, 1.1, 1) })
                            )
                            .delay(0.2)
                            .to(0.15, { scale: new Vec3(0.85, 0.85, 1), angle: -8 }, { easing: 'sineOut' })
                            .to(0.15, { scale: new Vec3(1.1, 1.1, 1), angle: 0 }, { easing: 'sineIn' })
                            .delay(0.3)
                            .parallel(
                                tween(op).to(0.3, { opacity: 0 }),
                                tween(this.handNode).to(0.3, { scale: new Vec3(1, 1, 1) })
                            )
                            .delay(0.4)
                    )
                    .start();
            }
        }
    }
    
    private hideHandTutorial() {
        if (this.handNode) {
            Tween.stopAllByTarget(this.handNode);
            this.handNode.active = false;
        }
    }

    // =========================================================================
    // AUTO WIN & AI HINT LOGIC 
    // =========================================================================

    public onCardRevealed() {
        if (this._isAutoPlaying) return;

        this._revealedCount++;

        if (this._revealedCount >= this._totalHiddenCards) {
            this.startAutoWinSequence();
        }
    }

    private startAutoWinSequence() {
        if (this._isAutoPlaying) return;
        this._isAutoPlaying = true;
        this.hideDynamicHint();
        this.schedule(this.processNextAutoMove, 0.08);
    }

    private processNextAutoMove() {
        let cardMoved = false;
        const offset = Math.floor(Math.random() * 4); 

        for (let i = 0; i < 4; i++) {
            const fIndex = (i + offset) % 4; 
            const fNode = this.foundationNodes[fIndex];
            const neededCard = this.getNextNeededCard(fNode);
            
            if (neededCard) {
                const foundNode = this.findCardGlobally(neededCard.suit, neededCard.rank);
                if (foundNode) {
                    this.animateAutoMove(foundNode, fNode);
                    cardMoved = true;
                    break; 
                }
            }
        }

        let totalFoundationCards = 0;
        this.foundationNodes.forEach(f => totalFoundationCards += f.children.filter(c => c.name.startsWith("card")).length);

        if (totalFoundationCards >= 52) {
            this.unschedule(this.processNextAutoMove); 
            this.triggerWinState(); 
        } else if (!cardMoved && totalFoundationCards >= 52) {
             this.unschedule(this.processNextAutoMove);
             this.triggerWinState();
        }
    }

    private getNextNeededCard(foundationNode: Node): { suit: number, rank: number } | null {
        const topCard = this.getTopCard(foundationNode);
        if (!topCard) {
            const takenSuits = this.foundationNodes
                .map(f => this.getTopCard(f))
                .filter(c => c !== null)
                .map(c => Math.floor(parseInt(c!.name.replace("card", "")) / 13));

            for (let s = 0; s < 4; s++) {
                if (takenSuits.indexOf(s) === -1) return { suit: s, rank: 0 };
            }
            return null; 
        }
        const index = parseInt(topCard.name.replace("card", ""));
        const currentRank = index % 13;
        const currentSuit = Math.floor(index / 13);
        if (currentRank === 12) return null; 
        return { suit: currentSuit, rank: currentRank + 1 };
    }

    private findCardGlobally(targetSuit: number, targetRank: number): Node | null {
        const targetIndex = (targetSuit * 13) + targetRank;
        const paddedIndex = ("000" + targetIndex).slice(-3);
        const targetName = `card${paddedIndex}`;

        for (const pile of this.tableauNodes) {
            const match = pile.children.find(c => c.name === targetName);
            if (match) return match;
        }
        const wasteMatch = this.wasteNode.children.find(c => c.name === targetName);
        if (wasteMatch) return wasteMatch;
        const stockMatch = this.stockNode.children.find(c => c.name === targetName);
        if (stockMatch) return stockMatch;
        return null; 
    }

    private animateAutoMove(card: Node, target: Node) {
        const startWorld = card.getWorldPosition();
        card.setParent(target);
        card.setPosition(0, 0, 0); 
        card.setWorldPosition(startWorld);
        tween(card)
            .to(0.15, { position: new Vec3(0, 0, 0) }, { easing: 'sineOut' })
            .call(() => { card.setScale(1, 1, 1); })
            .start();
    }

    private showDynamicHint() {
        if (!this._animationComplete) return;
        
        const bestMove = this.findBestMove();

        if (bestMove) {
            this._isHintActive = true;
            if (this.stackOutline && bestMove.from) {
                let cardCount = 1;
                if (bestMove.from.parent && this.tableauNodes.indexOf(bestMove.from.parent) !== -1){
                    const children = bestMove.from.parent.children;
                    const index = children.indexOf(bestMove.from);
                    if (index !== -1) {
                        cardCount = children.length - index;
                    }
                }
                this.stackOutline.show(bestMove.from, cardCount);
            }
        }
    }

    private hideDynamicHint() {
        if (this.stackOutline) this.stackOutline.clear();
        this._isHintActive = false;
    }

    private findBestMove(): StrategicMove | null {
        const allMoves: StrategicMove[] = [];

        for (let i = 0; i < this.tableauNodes.length; i++) {
            const pile = this.tableauNodes[i];
            const faceUpCards = pile.children.filter(c => c.active && c.name.startsWith("card"));
            
            if (faceUpCards.length === 0) continue;

            for (const sourceCard of faceUpCards) {
                if (sourceCard === faceUpCards[faceUpCards.length - 1]) {
                    const fTarget = this.checkFoundationMoves(sourceCard).node;
                    if (fTarget) {
                        allMoves.push({ type: 'TableauToFoundation', from: sourceCard, to: fTarget, score: 100 });
                    }
                }

                const tTarget = this.checkTableauMoves(sourceCard, i);
                if (tTarget) {
                    const siblingIndex = sourceCard.getSiblingIndex();
                    const cardBelow = pile.children[siblingIndex - 1];
                    const isRevealing = cardBelow && cardBelow.name.includes("faceDown");
                    const isBottomCard = (siblingIndex === 1);
                    const isTargetNonEmpty = tTarget.children.length > 1;

                    if (isRevealing) {
                        allMoves.push({ type: 'RevealHiddenCard', from: sourceCard, to: tTarget, score: 90 });
                    } else if (isBottomCard && isTargetNonEmpty) {
                        allMoves.push({ type: 'ClearTableauSlot', from: sourceCard, to: tTarget, score: 50 });
                    } else {
                        allMoves.push({ type: 'TableauReposition', from: sourceCard, to: tTarget, score: 10 });
                    }
                }
            }
        }

        const wasteTop = this.getTopCard(this.wasteNode);
        if (wasteTop) {
            const fTarget = this.checkFoundationMoves(wasteTop).node;
            if (fTarget) {
                allMoves.push({ type: 'WasteToFoundation', from: wasteTop, to: fTarget, score: 80 });
            }
            const tTarget = this.checkTableauMoves(wasteTop, -1);
            if (tTarget) {
                allMoves.push({ type: 'WasteToTableau', from: wasteTop, to: tTarget, score: 60 });
            }
        }

        const stockCount = this.stockNode.children.filter(c => c.name.startsWith("card") || c.name.includes("faceDown")).length;
        if (stockCount > 0) {
            allMoves.push({ type: 'DrawStock', from: this.stockNode, score: 40 });
        } else {
            const stockLogic = this.stockNode.getComponent('CardLogic') as unknown as CardLogicComponent;
            const wasteCount = this.wasteNode.children.filter(c => c.name.startsWith("card")).length;
            if (wasteCount > 0 && stockLogic && !stockLogic.emptyStockVisual?.active) {
                allMoves.push({ type: 'RestackStock', from: this.stockNode, score: 40 });
            }
        }

        if (allMoves.length === 0) return null;
        allMoves.sort((a, b) => b.score - a.score);
        return allMoves[0];
    }

    private checkFoundationMoves(cardNode: Node): { node: Node | null } {
        const cardLogic = cardNode.parent?.getComponent('CardLogic') as unknown as CardLogicComponent;
        const cardData = cardLogic?.getCardData(cardNode);
        if (!cardData) return { node: null };

        for (const fNode of this.foundationNodes) {
            const fLogic = fNode.getComponent('CardLogic') as unknown as CardLogicComponent;
            const fTop = this.getTopCard(fNode);
            
            if (!fTop) {
                if (cardData.value === 0) return { node: fNode }; 
            } else {
                const fData = fLogic?.getCardData(fTop);
                if (fData && fData.suit === cardData.suit && cardData.value === fData.value + 1) {
                    return { node: fNode };
                }
            }
        }
        return { node: null };
    }

    private checkTableauMoves(cardNode: Node, ignoreIndex: number): Node | null {
        const cardLogic = cardNode.parent?.getComponent('CardLogic') as unknown as CardLogicComponent;
        const cardData = cardLogic?.getCardData(cardNode);
        if (!cardData) return null;

        for (let i = 0; i < this.tableauNodes.length; i++) {
            if (i === ignoreIndex) continue;

            const tNode = this.tableauNodes[i];
            const tLogic = tNode.getComponent('CardLogic') as unknown as CardLogicComponent;
            const tTop = this.getTopCard(tNode);

            if (!tTop) {
                if (cardData.value === 12) return tNode;
            } else {
                const tData = tLogic?.getCardData(tTop);
                if (tData) {
                    const isOppositeColor = tData.isRed !== cardData.isRed;
                    const isRankOneLower = tData.value === cardData.value + 1; 
                    if (isOppositeColor && isRankOneLower) return tNode;
                }
            }
        }
        return null;
    }

    // --- HELPER METHODS ---
    private checkFoundationWinCondition() {
        if (this._gameWon || this._isAutoPlaying) return;
        let count = 0;
        this.foundationNodes.forEach(f => count += f.children.filter(c => c.name.startsWith("card")).length);
        if (count >= 52) {
            this.triggerWinState();
        }
    }

    private triggerWinState() {
        if (this._gameWon) return;
        this._gameWon = true;
        this.scheduleOnce(() => { this.showCTA(); }, 0.5);
    }

    private getTopCard(holder: Node): Node | null {
        if (!holder) return null;
        const cards = holder.children.filter(c => c.active && c.name.startsWith("card"));
        return cards.length > 0 ? cards[cards.length - 1] : null;
    }

    private initBGM() {
       if (!this.bgmClip) return;
       this._audioSource = this.node.getComponent(AudioSource) || this.node.addComponent(AudioSource);
       this._audioSource.clip = this.bgmClip;
       this._audioSource.loop = true;
       this._audioSource.playOnAwake = true;
       this._audioSource.volume = 0.5;
       this._audioSource.play();
    }

    private ensureAudioPlays() { 
        if (this._audioSource && !this._audioSource.playing) this._audioSource.play(); 
    }
   
    private setupInitialState() {
        if (this.mainNode) this.mainNode.active = false;
        if (this.ctaScreen) this.ctaScreen.active = false;
        if (this.introNode) this.introNode.active = false; 
        if (this.timePopup) this.timePopup.active = false; 
        
        if (this.stackOutline) this.stackOutline.clear();
    }
   
    private startSequence() {
        this.startGameLogic(); 
    }
   
    private showCTA() {
        if (!this.ctaScreen || this.ctaScreen.active) return;
        
        this.ctaScreen.active = true;
        const widget = this.ctaScreen.getComponent(Widget);
        if (widget) widget.updateAlignment();
        
        const op = this.ctaScreen.getComponent(UIOpacity) || this.ctaScreen.addComponent(UIOpacity);
        op.opacity = 0;
        
        tween(op).to(0.3, { opacity: 255 }).start();
        
        this.ctaScreen.setScale(new Vec3(0, 0, 1));
        
        tween(this.ctaScreen)
            .to(0.5, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'backOut' })
            .to(0.3, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })
            .call(() => {
                this.playCTAPulse();
            })
            .start();
    }
   
    private playCTAPulse() {
        if (!isValid(this.ctaScreen)) return;
        
        // 1. Loop the UI scaling
        tween(this.ctaScreen).repeatForever(
            tween()
                .to(0.8, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'sineInOut' })
                .to(0.8, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })
        ).start();

        // 2. Play first burst immediately
        this.playEpicConfetti();
        
        // 3. Loop the confetti continuously while the CTA screen is active
        this.schedule(() => {
            if (this.ctaScreen.active) {
                this.playEpicConfetti();
            }
        }, 1.6);
    }

    private playEpicConfetti() {
        const elegantColors = [
            new Color(255, 215, 0, 255),   // Magical Gold
            new Color(100, 255, 150, 255), // Forest Glow Green
            new Color(255, 255, 255, 255)  // Pure White
        ];

        // 1. THE BURST: An immediate, energetic magical explosion from the pedestal
        this.createMysticBurst(0, -150, 80, elegantColors);

        // 2. THE CASCADE: The elegant, randomized falling leaves that sustain the joy
        this.scheduleOnce(() => {
            this.createEnchantedCascade(elegantColors, 40);
        }, 0.3); // Starts just as the burst slows down
        
        this.scheduleOnce(() => {
            this.createEnchantedCascade(elegantColors, 35);
        }, 1.2);
        
        this.scheduleOnce(() => {
            this.createEnchantedCascade(elegantColors, 35);
        }, 2.4);
    }

    private createMysticBurst(startX: number, startY: number, count: number, colors: Color[]) {
        if (!this.confettiPrefab || !this.confettiContainer) return;

        for (let i = 0; i < count; i++) {
            const piece = instantiate(this.confettiPrefab);
            this.confettiContainer.addChild(piece);

            const sprite = piece.getComponent(Sprite);
            const uiOpacity = piece.getComponent(UIOpacity) || piece.addComponent(UIOpacity);
            uiOpacity.opacity = 255;

            if (sprite) sprite.color = colors[Math.floor(Math.random() * colors.length)];
            
            // Slightly smaller scale for the burst so it feels like dense energy
            const baseScale = Math.random() * 0.3 + 0.15;
            piece.setScale(new Vec3(baseScale, baseScale, 1));
            piece.setPosition(startX, startY, 0);

            // 360-degree explosive math
            const angle = Math.random() * Math.PI * 2; 
            const force = Math.random() * 700 + 300; // High speed
            
            const burstTargetX = startX + (Math.cos(angle) * force);
            const burstTargetY = startY + (Math.sin(angle) * force);

            const burstDuration = Math.random() * 0.4 + 0.2; // Very fast outwards
            const floatDuration = Math.random() * 1.5 + 1.0; // Hangs in the air

            const animState = { t: 0 };
            
            tween(animState)
                // Phase 1: The Snappy Explosion
                .to(burstDuration, { t: 1 }, {
                    easing: 'expoOut', // Starts incredibly fast, brakes hard
                    onUpdate: (target: {t: number}) => {
                        const progress = target.t;
                        const currentX = math.lerp(startX, burstTargetX, progress);
                        const currentY = math.lerp(startY, burstTargetY, progress);
                        
                        piece.setPosition(currentX, currentY, 0);
                        piece.angle = progress * 720; // Violent spin
                    }
                })
                // Phase 2: The Magic Dissipates
                .call(() => { animState.t = 0; })
                .to(floatDuration, { t: 1 }, {
                    easing: 'sineOut',
                    onUpdate: (target: {t: number}) => {
                        const progress = target.t;
                        
                        // Drift down very slightly like embers
                        const currentY = math.lerp(burstTargetY, burstTargetY - 80, progress);
                        piece.setPosition(burstTargetX, currentY, 0);
                        
                        // Fade out into the background
                        uiOpacity.opacity = math.lerp(255, 0, progress);
                        piece.angle += 2;
                    }
                })
                .call(() => { piece.destroy(); })
                .start();
        }
    }

    private createEnchantedCascade(colors: Color[], count: number) {
        if (!this.confettiPrefab || !this.confettiContainer) return;

        const screenSize = view.getVisibleSize();
        
        for (let i = 0; i < count; i++) {
            const piece = instantiate(this.confettiPrefab);
            this.confettiContainer.addChild(piece);

            const sprite = piece.getComponent(Sprite);
            const uiOpacity = piece.getComponent(UIOpacity) || piece.addComponent(UIOpacity);
            
            if (sprite) sprite.color = colors[Math.floor(Math.random() * colors.length)];
            
            // RANDOMNESS 1: Stagger the starting heights so they don't drop in a perfect flat line
            const startX = (Math.random() * screenSize.width) - (screenSize.width / 2);
            const startY = (screenSize.height / 2) + 100 + (Math.random() * 300); 
            piece.setPosition(startX, startY, 0);

            // RANDOMNESS 2: Extreme scale variations for "Depth" (some close to camera, some far)
            const isForeground = Math.random() > 0.85; // 15% chance to be a massive foreground piece
            const baseScale = isForeground ? (Math.random() * 0.5 + 0.4) : (Math.random() * 0.2 + 0.1);
            piece.setScale(new Vec3(baseScale, baseScale, 1));
            
            // Dim the background ones slightly to enhance the 3D parallax feel
            const maxOpacity = isForeground ? 255 : 160;

            // RANDOMNESS 3: Chaotic physics variables
            const fallSpeed = Math.random() * 4.0 + 2.5; 
            const swayWidth = Math.random() * 200 + 50;  
            const swaySpeed = Math.random() * 1.5 + 0.5;     
            const turbulence = Math.random() * 4 + 2; // A secondary, faster wind pattern
            
            const tumbleSpeed = Math.random() * 4 + 1; 
            const spinDirection = Math.random() > 0.5 ? 1 : -1;
            const spinSpeed = (Math.random() * 3 + 0.5) * spinDirection; // Random direction and speed

            const animState = { t: 0 };
            
            tween(animState)
                .to(fallSpeed, { t: 1 }, {
                    onUpdate: (target: {t: number}) => {
                        const progress = target.t;
                        
                        const currentY = math.lerp(startY, -screenSize.height / 2 - 150, progress);
                        
                        // RANDOMNESS 4: Double sine-wave for organic, unpredictable fluttering
                        const primarySway = Math.sin(progress * Math.PI * swaySpeed) * swayWidth;
                        const erraticFlutter = Math.cos(progress * Math.PI * turbulence) * (swayWidth * 0.25);
                        
                        piece.setPosition(startX + primarySway + erraticFlutter, currentY, 0);

                        // 3D Tumble
                        const scaleFlip = Math.cos(progress * Math.PI * tumbleSpeed);
                        piece.setScale(new Vec3(scaleFlip * baseScale, baseScale, 1));
                        
                        // Chaotic Spin
                        piece.angle += spinSpeed;

                        // Fade logic adapting to the random maxOpacity
                        if (progress < 0.1) {
                            uiOpacity.opacity = math.lerp(0, maxOpacity, progress * 10);
                        } else if (progress > 0.8) {
                            uiOpacity.opacity = math.lerp(maxOpacity, 0, (progress - 0.8) / 0.2);
                        } else {
                            uiOpacity.opacity = maxOpacity;
                        }
                    }
                })
                .call(() => { piece.destroy(); })
                .start();
        }
    }
}