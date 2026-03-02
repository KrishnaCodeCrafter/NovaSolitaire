import { _decorator, Component, Node } from 'cc';
const { ccclass, property } = _decorator;

declare const super_html_playable: any;
declare const mraid: any;

@ccclass('CTARedirect')
export class CTARedirect extends Component {

    @property
    public googlePlayUrl: string = "https://play.google.com/store/apps/details?id=nova.solitaire.patience.card.games.klondike.free";

    @property
    public appStoreUrl: string = "https://apps.apple.com/us/app/klondike-solitaire-card-games/id6502341990";

    onLoad() {
        this.node.on(Node.EventType.TOUCH_START, this.onButtonClick, this);
    }

    private onButtonClick() {
        console.log("[CTARedirect] CTA Clicked");

        // ✅ If Super HTML wrapper exists (BEST METHOD)
        if (typeof super_html_playable !== "undefined") {
            super_html_playable.set_google_play_url(this.googlePlayUrl);
            super_html_playable.set_app_store_url(this.appStoreUrl);
            super_html_playable.download();   
            return;
        }

        // Detect OS for fallbacks
        const userAgent = navigator.userAgent || navigator.vendor;
        const isAndroid = /android/i.test(userAgent);
        const targetUrl = isAndroid ? this.googlePlayUrl : this.appStoreUrl;

        // ✅ Fallback to MRAID
        if (typeof mraid !== "undefined") {
            mraid.open(targetUrl);
            return;
        }

        // ✅ Final fallback (browser testing)
        window.open(targetUrl, "_blank");
    }
}