import { _decorator, Component, Node } from 'cc';
// Make sure to import your GameManager script
// import { GameManager } from './GameManager';

const { ccclass, property } = _decorator;

@ccclass('Intro')
export class NewComponent extends Component {
    private _hasTriggered: boolean = false;

    start() {
        this.node.on(Node.EventType.TOUCH_END, this.onClick, this);

        this.scheduleOnce(this.autoCall, 3.0);
    }

    private onClick() {
        if (this._hasTriggered) return;

        this.unschedule(this.autoCall);

        this.triggerManager();
    }

    private autoCall() {
        if (this._hasTriggered) return;

        this.triggerManager();
    }

    private triggerManager() {
        this._hasTriggered = true;

        console.log("Calling GameManager!");
        this.node.active = false;
    }

    protected onDestroy() {
        this.node.off(Node.EventType.TOUCH_END, this.onClick, this);
    }
}