import { _decorator, Component, Node, Vec3, tween, UIOpacity, isValid, AudioSource, AudioClip, UITransform, Label, CCInteger, Tween, input, Input, ParticleSystem2D } from 'cc';
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
    @property(Node) public popupNode: Node = null!; 
    @property(Node) public mainNode: Node = null!;
    @property(Node) public ctaScreen: Node = null!;       
    @property(Node) public youLostScreen: Node = null!;   
    @property(Node) public globalOverlay: Node = null!;
    @property({ type: AudioClip }) public bgmClip: AudioClip = null!;
    @property({ type: AudioClip }) public cardDropSound: AudioClip = null!;

    @property({ type: ParticleSystem2D }) public confettiParticle: ParticleSystem2D = null!;

    // --- MOVES SYSTEM ---
    @property({ type: Label }) public movesLabel: Label = null!;
    @property({ type: CCInteger }) public maxMoves: number = 50;

    // --- PILE REFERENCES ---
    @property({ type: [Node] }) public tableauNodes: Node[] = [];
    @property({ type: [Node] }) public foundationNodes: Node[] = [];
    @property({ type: Node }) public stockNode: Node = null!;
    @property({ type: Node }) public wasteNode: Node = null!;

    // --- AI HINT SYSTEM ---
    @property({ type: StackOutline }) public stackOutline: StackOutline = null!; 
    @property public idleHintDelay: number = 5.0;

    // --- INTERNAL STATE ---
    private _movesMade: number = 0; 
    private _isFirstMovePending: boolean = true; 
    private _isIntroShowing: boolean = false; // Tracks if the intro message is currently active
    private _audioSource: AudioSource = null!;
    private _gameWon: boolean = false;
    private _gameOver: boolean = false; 
    private _isAutoPlaying: boolean = false; 
    private _idleTimer: number = 0;
    private _isHintActive: boolean = false;
    private _currentMoves: number = 0;   
    private _totalHiddenCards: number = 21; 
    private _revealedCount: number = 0;
    private _animationComplete: boolean = false; 

    onLoad() {
        this.initBGM();
        this.setupInitialState();
        this.startSequence();
    }

    update(dt: number) {
        if (!this._gameWon && !this._gameOver && !this._isHintActive && !this._isAutoPlaying && 
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

    public addValidMove(clickedNode: Node) {
        if (this._gameWon || this._gameOver || this._isAutoPlaying) return;

        if (this._isFirstMovePending) {
            this._isFirstMovePending = false;
            this.hideHandTutorial();
        }

        this.resetIdleTimer();
        this.ensureAudioPlays();

        this._currentMoves--;
        this.updateMovesLabel();
        this._movesMade++;
        if (this._movesMade === 5) {
            this.showPopup();
        }

        if (this._currentMoves <= 0) {
            this.triggerLoseState();
            return;
        }

        this.checkFoundationWinCondition(); 
    }

    // =========================================================================
    // 5-MOVE POPUP LOGIC
    // =========================================================================

    private showPopup() {
        if (!this.popupNode) return;
        
        this.popupNode.active = true;
        
        const op = this.popupNode.getComponent(UIOpacity) || this.popupNode.addComponent(UIOpacity);
        op.opacity = 0;
        
        this.popupNode.setScale(new Vec3(0.5, 0.5, 1));
        
        tween(op).to(0.3, { opacity: 255 }).start();
        
        tween(this.popupNode)
            .to(0.4, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .start();

        // NEW: Listen globally for ANY touch on the screen
        input.on(Input.EventType.TOUCH_START, this.hidePopup, this);
    }

    private hidePopup() {
        if (!this.popupNode || !this.popupNode.active) return;

        // NEW: Remove the global listener immediately so it doesn't trigger multiple times
        input.off(Input.EventType.TOUCH_START, this.hidePopup, this);

        const op = this.popupNode.getComponent(UIOpacity);
        if (op) {
            tween(op).to(0.2, { opacity: 0 }).start();
        }
        
        tween(this.popupNode)
            .to(0.2, { scale: new Vec3(0.8, 0.8, 1) }, { easing: 'backIn' })
            .call(() => {
                this.popupNode.active = false;
            })
            .start();
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
        }, maxDuration + 0.8);
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
        if (this._gameWon || this._gameOver || this._isAutoPlaying) return;
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

    private updateMovesLabel() {
        if (this.movesLabel) this.movesLabel.string = `${this._currentMoves}`;
    }

    private triggerLoseState() {
        if (this._gameWon || this._gameOver) return;
        this._gameOver = true;
        this.hideDynamicHint();
        this.scheduleOnce(() => { this.showYouLostScreen(); }, 0.5);
    }

    private showYouLostScreen() {
        if (!this.youLostScreen) return;
        this.youLostScreen.active = true;
        const op = this.youLostScreen.getComponent(UIOpacity) || this.youLostScreen.addComponent(UIOpacity);
        op.opacity = 0;
        tween(op).to(0.5, { opacity: 255 }).start();
        this.youLostScreen.setScale(new Vec3(0, 0, 1));
        tween(this.youLostScreen)
            .to(0.5, { scale: new Vec3(1.1, 1.1, 1) }, { easing: 'backOut' })
            .to(0.3, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })
            .start();
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
        if (this.youLostScreen) this.youLostScreen.active = false;
        if (this.introNode) this.introNode.active = false; 
        if (this.popupNode) this.popupNode.active = false; 
        
        this._movesMade = 0; 
        this._currentMoves = this.maxMoves;
        this.updateMovesLabel();
        if (this.stackOutline) this.stackOutline.clear();
    }
   
    private startSequence() {
        // Start the game logic right away instead of using the old intro sequence
        this.startGameLogic(); 
    }
   
    private showCTA() {
        if (!this.ctaScreen || this.ctaScreen.active) return;
        
        this.ctaScreen.active = true;
        const op = this.ctaScreen.getComponent(UIOpacity) || this.ctaScreen.addComponent(UIOpacity);
        op.opacity = 0;
        
        tween(op).to(0.3, { opacity: 255 }).start();
        
        this.ctaScreen.setScale(new Vec3(0, 0, 1));
        
        tween(this.ctaScreen)
            .to(0.5, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'backOut' })
            .to(0.3, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })
            .call(() => {
                this.playCTAPulse();
                
                // NEW: Play the confetti animation!
                if (this.confettiParticle) {
                    this.confettiParticle.resetSystem();
                }
            })
            .start();
    }
   
    private playCTAPulse() {
        if (!isValid(this.ctaScreen)) return;
        tween(this.ctaScreen).repeatForever(
            tween()
                .to(0.8, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'sineInOut' })
                .to(0.8, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })
        ).start();
    }
}