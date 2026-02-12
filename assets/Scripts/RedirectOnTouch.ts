import { _decorator, Component, Node, sys } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('RedirectOnTouch')
export class RedirectOnTouch extends Component {

    @property({ tooltip: "The URL to open when clicked" })
    url: string = "https://www.google.com";

    start() {
        // Listen for a touch/click anywhere on THIS node
        this.node.on(Node.EventType.TOUCH_END, this.onScreenClicked, this);
    }

    onDestroy() {
        // Good practice to remove listeners
        this.node.off(Node.EventType.TOUCH_END, this.onScreenClicked, this);
    }

    private onScreenClicked() {
        console.log("Redirecting to: " + this.url);
        sys.openURL(this.url);
    }
}