/**
 * @fileoverview Implements the PC8080 Keyboard component.
 * @author <a href="mailto:Jeff@pcjs.org">Jeff Parsons</a>
 * @copyright © Jeff Parsons 2012-2017
 *
 * This file is part of PCjs, a computer emulation software project at <http://pcjs.org/>.
 *
 * PCjs is free software: you can redistribute it and/or modify it under the terms of the
 * GNU General Public License as published by the Free Software Foundation, either version 3
 * of the License, or (at your option) any later version.
 *
 * PCjs is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without
 * even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with PCjs.  If not,
 * see <http://www.gnu.org/licenses/gpl.html>.
 *
 * You are required to include the above copyright notice in every modified copy of this work
 * and to display that copyright notice when the software starts running; see COPYRIGHT in
 * <http://pcjs.org/modules/shared/lib/defines.js>.
 *
 * Some PCjs files also attempt to load external resource files, such as character-image files,
 * ROM files, and disk image files. Those external resource files are not considered part of PCjs
 * for purposes of the GNU General Public License, and the author does not claim any copyright
 * as to their contents.
 */

"use strict";

if (NODE) {
    var Str = require("../../shared/lib/strlib");
    var Web = require("../../shared/lib/weblib");
    var Component = require("../../shared/lib/component");
    var Keys = require("../../shared/lib/keys");
    var State = require("../../shared/lib/state");
    var PC8080 = require("./defines");
    var ChipSet8080 = require("./chipset");
    var Messages8080 = require("./messages");
}

/**
 * TODO: The Closure Compiler treats ES6 classes as 'struct' rather than 'dict' by default,
 * which would force us to declare all class properties in the constructor, as well as prevent
 * us from defining any named properties.  So, for now, we mark all our classes as 'unrestricted'.
 *
 * @unrestricted
 */
class Keyboard8080 extends Component {
    /**
     * Keyboard8080(parmsKbd)
     *
     * The Keyboard8080 component has the following component-specific (parmsKbd) properties:
     *
     *      model:  eg, "VT100" (should be a member of Keyboard8080.MODELS)
     *
     * @this {Keyboard8080}
     * @param {Object} parmsKbd
     */
    constructor(parmsKbd)
    {
        super("Keyboard", parmsKbd, Messages8080.KEYBOARD);

        var model = parmsKbd['model'];

        if (model && !Keyboard8080.MODELS[model]) {
            Component.notice("Unrecognized Keyboard8080 model: " + model);
        }

        this.config = Keyboard8080.MODELS[model] || {};

        this.reset();

        this.setReady();
    }

    /**
     * setBinding(sHTMLType, sBinding, control, sValue)
     *
     * @this {Keyboard8080}
     * @param {string|null} sHTMLType is the type of the HTML control (eg, "button", "list", "text", "submit", "textarea", "canvas")
     * @param {string} sBinding is the value of the 'binding' parameter stored in the HTML control's "data-value" attribute (eg, "esc")
     * @param {Object} control is the HTML control DOM object (eg, HTMLButtonElement)
     * @param {string} [sValue] optional data value
     * @return {boolean} true if binding was successful, false if unrecognized binding request
     */
    setBinding(sHTMLType, sBinding, control, sValue)
    {
        /*
         * There's a special binding that the Video component uses ("screen") to effectively bind its
         * screen to the entire keyboard, in Video.powerUp(); ie:
         *
         *      video.kbd.setBinding("canvas", "screen", video.canvasScreen);
         * or:
         *      video.kbd.setBinding("textarea", "screen", video.textareaScreen);
         *
         * However, it's also possible for the keyboard XML definition to define a control that serves
         * a similar purpose; eg:
         *
         *      <control type="text" binding="kbd" width="2em">Keyboard</control>
         *
         * The latter is purely experimental, while we work on finding ways to trigger the soft keyboard on
         * certain pesky devices (like the Kindle Fire).  Note that even if you use the latter, the former will
         * still be enabled (there's currently no way to configure the Video component to not bind its screen,
         * but we could certainly add one if the need ever arose).
         */
        var kbd = this;
        var id = sHTMLType + '-' + sBinding;

        if (this.bindings[id] === undefined) {

            if (sHTMLType == "led" && this.config.LEDCODES[sBinding]) {
                this.bindings[id] = control;
                return true;
            }

            switch (sBinding) {
            case "kbd":
            case "screen":
                /*
                 * Recording the binding ID prevents multiple controls (or components) from attempting to erroneously
                 * bind a control to the same ID, but in the case of a "dual display" configuration, we actually want
                 * to allow BOTH video components to call setBinding() for "screen", so that it doesn't matter which
                 * display the user gives focus to.
                 *
                 *      this.bindings[id] = control;
                 */
                if (Web.isUserAgent("iOS")) {
                    /*
                     * For iOS devices, it's best to deal only with keypress events.  The main reason is that we don't
                     * get shift-key events, so we have no way of distinguishing between certain keys, such as ':' and
                     * ';', unless we are monitoring key presses.  Another reason is that, under certain poorly documented
                     * conditions, an iOS keyup event will not contain any keyCode; this is most easily reproduced with
                     * the iOS simulator and a physical keyboard (not the pop-up keyboard).  When this happens, we think
                     * the key is stuck.  Finally, certain other problems that we have tried to resolve when using a physical
                     * keyboard (eg, keeping the physical and virtual CAPS-LOCK states in sync) simply don't exist in the
                     * iOS environment.
                     *
                     * So, with all that mind, it seems best to have a separate iOS keypress handler and forego keydown
                     * and keyup events entirely.  The iOS keypress handler must also perform some additional checks, such
                     * as watching for keys that can only be typed on the emulated device when a shift key is down, and
                     * simulating "fake" shift-key down and up events.
                     *
                     * Perhaps we can eventually standardize on this alternate keypress-centric approach for ALL devices,
                     * but until then, it's safer to have these two code paths.
                     *
                     * UPDATE: So much for the best laid plans.  iOS won't deliver BACKSPACE events to the keypress handler,
                     * so we have to deal with keydown/keyup events after all.
                     */
                    control.onkeypress = function oniOSKeyPress(event)
                    {
                        return kbd.oniOSKeyPress(event);
                    };
                    control.onkeydown = function oniOSKeyDown(event)
                    {
                        return kbd.oniOSKeyDown(event, true);
                    };
                    control.onkeyup = function oniOSKeyUp(event)
                    {
                        return kbd.oniOSKeyDown(event, false);
                    };
                }
                else {
                    control.onkeydown = function onKeyDown(event)
                    {
                        return kbd.onKeyDown(event, true);
                    };
                    control.onkeyup = function onKeyUp(event)
                    {
                        return kbd.onKeyDown(event, false);
                    };
                    control.onkeypress = function onKeyPress(event)
                    {
                        return kbd.onKeyPress(event);
                    };
                }
                control.onpaste = function onKeyPaste(event)
                {
                    return kbd.onPaste(event);
                };
                return true;

            default:
                if (this.config.SOFTCODES && this.config.SOFTCODES[sBinding] !== undefined) {
                    this.bindings[id] = control;
                    control.onclick = function(kbd, keyCode) {
                        return function onKeyboardBindingDown(event) {
                            /*
                             * iOS usability improvement: calling preventDefault() prevents rapid clicks from
                             * also being (mis)interpreted as a desire to "zoom" in on the machine.
                             */
                            if (event.preventDefault) event.preventDefault();
                            /*
                             * TODO: Add some additional SOFTCODES configuration info that will tell us which soft
                             * keys (eg, CTRL) should be treated as toggles, instead of hard-coding that knowledge below.
                             *
                             * Moreover, if a *real* CTRL or CAPS-LOCK key is pressed or released, it would be nice
                             * to update the state of these on-screen controls, too (ie, not just when the controls are
                             * clicked).
                             */
                            var fDown = true, bit = 0;
                            if (keyCode == Keys.KEYCODE.CTRL) {
                                bit = Keyboard8080.STATE.CTRL;
                            }
                            else if (keyCode == Keys.KEYCODE.CAPS_LOCK) {
                                bit = Keyboard8080.STATE.CAPS_LOCK;
                            }
                            if (bit) {
                                control.style.fontWeight = "normal";
                                fDown = !(kbd.bitsState & bit);
                                if (fDown) control.style.fontWeight = "bold";
                                kbd.checkModifierKeys(keyCode, fDown);
                            }
                            kbd.onSoftKeyDown(keyCode, fDown, !bit);
                            if (kbd.cmp) kbd.cmp.updateFocus();
                        };
                    }(this, this.config.SOFTCODES[sBinding]);
                    //
                    // var fnUp = function (kbd, keyCode) {
                    //     return function onKeyboardBindingUp(event) {
                    //         kbd.onSoftKeyDown(keyCode, false);
                    //         /*
                    //          * Give focus back to the machine (since clicking the button takes focus away).
                    //          *
                    //          *      if (kbd.cmp) kbd.cmp.updateFocus();
                    //          *
                    //          * iOS Usability Improvement: NOT calling updateFocus() keeps the soft keyboard down
                    //          * (assuming it was already down).
                    //          */
                    //     };
                    // }(this, this.config.SOFTCODES[sBinding]);
                    //
                    // if ('ontouchstart' in window) {
                    //     control.ontouchstart = fnDown;
                    //     control.ontouchend = fnUp;
                    // } else {
                    //     control.onmousedown = fnDown;
                    //     control.onmouseup = control.onmouseout = fnUp;
                    // }
                    //
                    // UPDATE: Since the only controls that we explicitly bind to SOFTCODES are buttons, I'm simplifying
                    // the above code with a conventional "onclick" handler.  The only corresponding change I had to make
                    // to the onclick (formerly fnDown) function was to set fAutoRelease on its call to onSoftKeyDown(),
                    // since we're no longer attempting to detect when the control (ie, the button) is actually released.
                    //
                    // This change also resolves a problem I ran into with the Epiphany (WebKit-based) web browser running
                    // on the "elementary" (Ubuntu-based) OS, where clicks on the SET-UP button were ignored; perhaps its
                    // buttons don't generate mouse and/or touch events.  Anyway, an argument for keeping things simple.
                    //
                    return true;
                }
                break;
            }
        }
        return false;
    }

    /**
     * initBus(cmp, bus, cpu, dbg)
     *
     * @this {Keyboard8080}
     * @param {Computer8080} cmp
     * @param {Bus8080} bus
     * @param {CPUState8080} cpu
     * @param {Debugger8080} dbg
     */
    initBus(cmp, bus, cpu, dbg)
    {
        this.cmp = cmp;
        this.cpu = cpu;
        this.dbg = dbg;     // NOTE: The "dbg" property must be set for the message functions to work

        var kbd = this;
        this.timerReleaseKeys = this.cpu.addTimer(function() {
            kbd.checkSoftKeysToRelease();
        });

        this.chipset = /** @type {ChipSet8080} */ (cmp.getMachineComponent("ChipSet"));

        this.serial = /** @type {SerialPort8080} */ (cmp.getMachineComponent("SerialPort"));

        bus.addPortInputTable(this, this.config.portsInput);
        bus.addPortOutputTable(this, this.config.portsOutput);
    }

    /**
     * powerUp(data, fRepower)
     *
     * @this {Keyboard8080}
     * @param {Object|null} data
     * @param {boolean} [fRepower]
     * @return {boolean} true if successful, false if failure
     */
    powerUp(data, fRepower)
    {
        if (!fRepower) {
            if (!data) {
                this.reset();
            } else {
                if (!this.restore(data)) return false;
            }
        }
        return true;
    }

    /**
     * powerDown(fSave, fShutdown)
     *
     * @this {Keyboard8080}
     * @param {boolean} [fSave]
     * @param {boolean} [fShutdown]
     * @return {Object|boolean} component state if fSave; otherwise, true if successful, false if failure
     */
    powerDown(fSave, fShutdown)
    {
        return fSave? this.save() : true;
    }

    /**
     * reset()
     *
     * @this {Keyboard8080}
     */
    reset()
    {
        /*
         * As keyDown events are encountered, a corresponding "softCode" is looked up.  If one is found,
         * then an entry for the key is added to the aKeysActive array.  Each "key" entry in aKeysActive contains:
         *
         *      softCode:           number or string representing the key pressed
         *      msDown:             timestamp of the most recent "down" event
         *      fAutoRelease:       true to auto-release the key after MINPRESSTIME (set when "up" occurs too quickly)
         *
         * When the key is finally released (or auto-released), its entry is removed from the array.
         */
        this.aKeysActive = [];

        /*
         * The current (assumed) physical (and simulated) states of the various shift/lock keys.
         *
         * TODO: Determine how (or whether) we can query the browser's initial shift/lock key states.
         */
        this.bitsState = 0;

        if (this.config.INIT && !this.restore(this.config.INIT)) {
            this.notice("reset error");
        }
    }

    /**
     * save()
     *
     * This implements save support for the Keyboard component.
     *
     * @this {Keyboard8080}
     * @return {Object}
     */
    save()
    {
        var state = new State(this);
        switch(this.config.MODEL) {
        case Keyboard8080.SI1978.MODEL:
            break;
        case Keyboard8080.VT100.MODEL:
            state.set(0, [this.bVT100Status, this.bVT100Address, this.fVT100UARTBusy, this.nVT100UARTCycleSnap, -1]);
            break;
        }
        return state.data();
    }

    /**
     * restore(data)
     *
     * This implements restore support for the Keyboard component.
     *
     * @this {Keyboard8080}
     * @param {Object} data
     * @return {boolean} true if successful, false if failure
     */
    restore(data)
    {
        var a;
        if (data && (a = data[0]) && a.length) {
            switch(this.config.MODEL) {
            case Keyboard8080.SI1978.MODEL:
                return true;

            case Keyboard8080.VT100.MODEL:
                this.bVT100Status = a[0];
                this.updateLEDs(this.bVT100Status & Keyboard8080.VT100.STATUS.LEDS);
                this.bVT100Address = a[1];
                this.fVT100UARTBusy = a[2];
                this.nVT100UARTCycleSnap = a[3];
                this.iKeyNext = a[4];
                return true;
            }
        }
        return false;
    }

    /**
     * setLED(control, f, color)
     *
     * TODO: Add support for user-definable LED colors
     *
     * @this {Keyboard8080}
     * @param {Object} control is an HTML control DOM object
     * @param {boolean|number} f is true if the LED represented by control should be "on", false if "off"
     * @param {number} color (ie, 0xff0000 for RED, or 0x00ff00 for GREEN)
     */
    setLED(control, f, color)
    {
        control.style.backgroundColor = (f? ('#' + Str.toHex(color, 6)) : "#000000");
    }

    /**
     * updateLEDs(bLEDs)
     *
     * @this {Keyboard8080}
     * @param {number} [bLEDs]
     */
    updateLEDs(bLEDs)
    {
        var id, control;
        if (bLEDs != null) {
            this.bLEDs = bLEDs;
        } else {
            bLEDs = this.bLEDs;
        }
        for (var sBinding in this.config.LEDCODES) {
            id = "led-" + sBinding;
            control = this.bindings[id];
            if (control) {
                var bitLED = this.config.LEDCODES[sBinding];
                var fOn = !!(bLEDs & bitLED);
                if (bitLED & (bitLED-1)) {
                    fOn = !(bLEDs & ~bitLED);
                }
                this.setLED(control, fOn, 0xff0000);
            }
        }
        id = "led-caps-lock";
        control = this.bindings[id];
        if (control) {
            this.setLED(control, (this.bitsState & Keyboard8080.STATE.CAPS_LOCK), 0x00ff00);
        }
    }

    /**
     * checkModifierKeys(keyCode, fDown, fRight)
     *
     * @this {Keyboard8080}
     * @param {number} keyCode (ie, either a keycode or string ID)
     * @param {boolean} fDown (true if key going down, false if key going up)
     * @param {boolean} [fRight] (true if key is on the right, false if not or unknown or n/a)
     * @return {boolean} (fDown updated as needed for CAPS-LOCK weirdness)
     */
    checkModifierKeys(keyCode, fDown, fRight)
    {
        var bit = 0;
        switch(keyCode) {
        case Keys.KEYCODE.SHIFT:
            bit = fRight? Keyboard8080.STATE.RSHIFT : Keyboard8080.STATE.SHIFT;
            break;
        case Keys.KEYCODE.CTRL:
            bit = fRight? Keyboard8080.STATE.RCTRL : Keyboard8080.STATE.CTRL;
            break;
        case Keys.KEYCODE.ALT:
            bit = fRight? Keyboard8080.STATE.RALT : Keyboard8080.STATE.ALT;
            break;
        case Keys.KEYCODE.CMD:
            bit = fRight? Keyboard8080.STATE.RCMD : Keyboard8080.STATE.CMD;
            break;
        case Keys.KEYCODE.CAPS_LOCK:
            bit = Keyboard8080.STATE.CAPS_LOCK;
            /*
             * WARNING: You have an entered a browser weirdness zone.  In Chrome, pressing-and-releasing
             * CAPS-LOCK generates a "down" event when it turns the lock on and an "up" event when it turns
             * the lock off.  Firefox, OTOH, generates only "down" events, so we have to "manufacture"
             * the fDown parameter ourselves -- which means we also have to propagate it back to the caller.
             *
             * And, while this isn't necessary for Chrome, it doesn't appear to hurt anything in Chrome, so
             * we're not going to bother making it browser-specific.
             */
            fDown = !(this.bitsState & bit);
            break;
        }
        if (bit) {
            if (fDown) {
                this.bitsState |= bit;
            } else {
                this.bitsState &= ~bit;
            }
        }
        return fDown;
    }

    /**
     * getSoftCode(keyCode)
     *
     * Returns a number if the keyCode exists in the KEYMAP, or a string if the keyCode has a string ID.
     *
     * @this {Keyboard8080}
     * @return {string|number|null}
     */
    getSoftCode(keyCode)
    {
        keyCode = this.config.ALTCODES[keyCode] || keyCode;
        if (this.config.KEYMAP[keyCode]) {
            return keyCode;
        }
        for (var sSoftCode in this.config.SOFTCODES) {
            if (this.config.SOFTCODES[sSoftCode] === keyCode) {
                return sSoftCode;
            }
        }
        return null;
    }

    /**
     * onKeyDown(event, fDown)
     *
     * @this {Keyboard8080}
     * @param {Object} event
     * @param {boolean} fDown is true for a keyDown event, false for up
     * @return {boolean} true to pass the event along, false to consume it
     */
    onKeyDown(event, fDown)
    {
        var fPass = true;
        var keyCode = event.keyCode;

        if (!COMPILED && this.messageEnabled(Messages8080.KEYS)) {
            this.printMessage("onKey" + (fDown? "Down" : "Up") + "(" + keyCode + ")", true);
        }

        /*
         * A note about Firefox: it uses different keyCodes for certain keys; there's a logic to the differences
         * (they use ASCII codes), but since other browsers didn't follow suit, we must use a mapping table to
         * convert their keyCodes to the more traditional values.
         */
        keyCode = Keys.FF_KEYCODES[keyCode] || keyCode;

        /*
         * We now keep track of physical keyboard modifier keys.  This makes it possible for new services
         * to eventually be implemented (simulateKeysDown() and simulateKeysUp()), to map special ALT-key
         * combinations to VT100 keys, etc.
         */
        fDown = this.checkModifierKeys(keyCode, fDown, event.location == Keys.LOCATION.RIGHT);

        var softCode = this.getSoftCode(keyCode);
        if (softCode) {
            /*
             * Key combinations involving the "meta" key (ie, the Windows or Command key) are meaningless to
             * the VT100, so we ignore them.  The "meta" key itself is already effectively ignored, because it's
             * not acknowledged by getSoftCode(), but we also don't want any of the keys combined with "meta"
             * slipping through either.
             */
            if (!event.metaKey) {
                /*
                 * The LINE-FEED key is an important key on the VT100, and while we DO map a host function key
                 * to it (F7), I like the idea of making ALT-ENTER an alias for LINE-FEED as well.  Ditto for
                 * making ALT-DELETE an alias for BACKSPACE (and no, I don't mean ALT-BACKSPACE as an alias for
                 * DELETE; see my earlier discussion involving BACKSPACE and DELETE).
                 *
                 * Of course, as experienced VT100 users know, it's always possible to type CTRL-J for LINE-FEED
                 * and CTRL-H for BACKSPACE, too.  But not all our users are that experienced.
                 *
                 * I was also tempted to use CTRL-ENTER or SHIFT-ENTER, but those are composable VT100 key
                 * sequences, so it's best not to muck with those.
                 *
                 * Finally, this hack is complicated by the fact that if the ALT key is released first, we run
                 * the risk of the remapped key being stuck "down".  Hence the new REMAPPED bit, which should
                 * remain set (as a "proxy" for the ALT bit) as long as a remapped key is down.
                 */
                var fRemapped = false;
                if (this.bitsState & (Keyboard8080.STATE.ALTS | Keyboard8080.STATE.REMAPPED)) {
                    if (softCode == Keys.KEYCODE.CR) {
                        softCode = Keys.KEYCODE.F7;
                        fRemapped = true;
                    }
                    else if (softCode == Keys.KEYCODE.BS) {
                        softCode = Keys.KEYCODE.DEL;
                        fRemapped = true;
                    }
                    if (fRemapped) {
                        if (fDown) {
                            this.bitsState |= Keyboard8080.STATE.REMAPPED;
                        } else {
                            this.bitsState &= ~Keyboard8080.STATE.REMAPPED;
                        }
                    }
                }
                fPass = this.onSoftKeyDown(softCode, fDown);
                /*
                 * As onKeyPress() explains, the only key presses we're interested in are letters, which provide
                 * an important clue regarding the CAPS-LOCK state.  For all other keys, we call preventDefault(),
                 * which normally "suppresses" the keyPress event, as well as other unwanted browser behaviors
                 * (eg, the SPACE key, which browsers interpret as a desire to scroll the entire web page down).
                 *
                 * And, even if the key IS a letter, we STILL want to call preventDefault() if a CTRL key is down,
                 * so that Windows-based browsers (eg, Edge) don't interfere with their stupid CTRL-based shortcuts. ;-)
                 *
                 * NOTE: We COULD check event.ctrlKey too, but it's six of one, half a dozen of another.
                 */
                if (!(softCode >= Keys.ASCII.A && softCode <= Keys.ASCII.Z) || (this.bitsState | Keyboard8080.STATE.CTRLS)) {
                    if (event.preventDefault) event.preventDefault();
                }
            }
        }

        if (!COMPILED && this.messageEnabled(Messages8080.KEYS)) {
            this.printMessage("onKey" + (fDown? "Down" : "Up") + "(" + keyCode + "): softCode=" + softCode + ", pass=" + fPass, true);
        }

        return fPass;
    }

    /**
     * onKeyPress(event)
     *
     * For now, our only interest in keyPress events is letters, as a means of detecting the CAPS-LOCK state.
     *
     * @this {Keyboard8080}
     * @param {Object} event
     * @return {boolean} true to pass the event along, false to consume it
     */
    onKeyPress(event)
    {
        /*
         * A note about Firefox: the KeyboardEvent they pass to a keypress handler doesn't set 'keyCode', so
         * we have to fallback to 'charCode' (or 'which'), both of which are deprecated but realistically can't
         * really go away.
         *
         * TODO: Consider "upgrading" this code to use the new 'key' property.  Note, however, that it's a string,
         * not a number; for example; if the colon key is pressed, 'key' will be ":", whereas 'charCode' and 'which'
         * will be 58.
         */
        var charCode = event.keyCode || event.charCode;

        if (charCode >= Keys.ASCII.A && charCode <= Keys.ASCII.Z) {
            if (!(this.bitsState & (Keyboard8080.STATE.SHIFTS | Keyboard8080.STATE.CAPS_LOCK))) {
                this.bitsState |= Keyboard8080.STATE.CAPS_LOCK;
                this.onSoftKeyDown(Keys.KEYCODE.CAPS_LOCK, true);
                this.updateLEDs();
            }
        }
        else if (charCode >= Keys.ASCII.a && charCode <= Keys.ASCII.z) {
            if (this.bitsState & Keyboard8080.STATE.CAPS_LOCK) {
                this.bitsState &= ~Keyboard8080.STATE.CAPS_LOCK;
                this.onSoftKeyDown(Keys.KEYCODE.CAPS_LOCK, false);
                this.updateLEDs();
            }
        }

        if (!COMPILED && this.messageEnabled(Messages8080.KEYS)) {
            this.printMessage("onKeyPress(" + charCode + ")", true);
        }

        return true;
    }

    /**
     * oniOSKeyDown(event, fDown)
     *
     * @this {Keyboard8080}
     * @param {Object} event
     * @param {boolean} fDown is true for a keyDown event, false for up
     * @return {boolean} true to pass the event along, false to consume it
     */
    oniOSKeyDown(event, fDown)
    {
        var fPass = true;
        /*
         * Because keydown/keyup events on iOS are inherently "fake", they can be delivered so quickly that
         * if we generated matching down/up events, then the emulated machine might not see the key transition.
         * So we now deliver only down events, with fAutoRelease always set (see below).
         *
         * Also, because of iOS weirdness discussed in setBinding() when using a physical keyboard, the keyup
         * event may not provide a valid keyCode, which is another reason we have no choice but to always deliver
         * keys with fAutoRelease set to true.
         */
        if (fDown) {
            var keyCode = event.keyCode;
            var bMapping = this.config.KEYMAP[keyCode];
            if (bMapping) {
                /*
                 * If this is a mappable key, but the mapping isn't in the CHARMAP table, then we have to process
                 * it now; the most common reason is that the key doesn't generate a keypress event (eg, BACKSPACE).
                 */
                if (!this.indexOfCharMap(bMapping)) {
                    fPass = this.onSoftKeyDown(keyCode, fDown, true);
                    if (event.preventDefault) event.preventDefault();
                    if (!COMPILED && this.messageEnabled(Messages8080.KEYS)) {
                        this.printMessage("oniOSKey" + (fDown ? "Down" : "Up") + "(" + keyCode + "): pass=" + fPass, true);
                    }
                }
            }
        }
        return fPass;
    }

    /**
     * oniOSKeyPress(event)
     *
     * @this {Keyboard8080}
     * @param {Object} event
     * @return {boolean} true to pass the event along, false to consume it
     */
    oniOSKeyPress(event)
    {
        /*
         * A note about Firefox: the KeyboardEvent they pass to a keypress handler doesn't set 'keyCode', so
         * we have to fallback to 'charCode' (or 'which'), both of which are deprecated but realistically can't
         * really go away.
         *
         * TODO: Consider "upgrading" this code to use the new 'key' property.  Note, however, that it's a string,
         * not a number; for example; if the colon key is pressed, 'key' will be ":", whereas 'charCode' and 'which'
         * will be 58.
         */
        var charCode = event.keyCode || event.charCode;

        var fShifted = false;
        var bMapping = this.config.CHARMAP[charCode];
        if (bMapping) {
            if (bMapping & 0x80) {
                bMapping &= 0x7f;
                fShifted = true;
            }
            /*
             * Since the rest of our code was built around keyCodes, not charCodes, we look up the CHARMAP byte
             * in the KEYMAP table to find a corresponding keyCode, and that's what we'll use to simulate the key
             * press/release.
             */
            var softCode = this.indexOfKeyMap(bMapping);
            if (softCode) {
                if (!fShifted) {
                    this.onSoftKeyDown(Keys.KEYCODE.SHIFT, false);
                } else {
                    this.onSoftKeyDown(Keys.KEYCODE.SHIFT, true, true);
                }
                this.onSoftKeyDown(softCode, true, true);
            }
        }

        if (!COMPILED && this.messageEnabled(Messages8080.KEYS)) {
            this.printMessage("oniOSKeyPress(" + charCode + ")", true);
        }

        return true;
    }

    /**
     * onPaste(event)
     *
     * @this {Keyboard8080}
     * @param {Object} event
     * @return {boolean} true to pass the event along, false to consume it
     */
    onPaste(event)
    {
        /*
         * TODO: In a perfect world, we would have implemented simulateKeysDown() and simulateKeysUp(),
         * which would transform any given text into the appropriate keystrokes.  But for now, we're going
         * to leapfrog all that and try invoking the SerialPort's sendData() function, which if available,
         * is nothing more than a call into a connected machine's receiveData() function.
         *
         * Besides, paste functionality doesn't seem to be consistently implemented across all browsers
         * (partly out of security concerns, apparently) so it may not make sense to expend much more
         * effort on this right now.  If you want to paste a lot of text into a machine, you're better off
         * pasting into a machine that's been configured to use a textarea as part of its Control Panel.
         * A visible textarea seems to have less issues than the hidden textarea overlaid on top of our
         * Video display.
         */
        if (this.serial && this.serial.sendData) {
            if (event.stopPropagation) event.stopPropagation();
            if (event.preventDefault) event.preventDefault();
            var clipboardData = event.clipboardData || window.clipboardData;
            if (clipboardData) {
                this.serial.transmitData(clipboardData.getData('Text'));
                return false;
            }
        }
        return true;
    }

    /**
     * indexOfKeyMap(bMapping)
     *
     * @this {Keyboard8080}
     * @param {number} bMapping
     * @return {number}
     */
    indexOfKeyMap(bMapping)
    {
        for (var keyCode in this.config.KEYMAP) {
            if (this.config.KEYMAP[keyCode] == bMapping) return +keyCode;
        }
        return 0;
    }

    /**
     * indexOfCharMap(bMapping)
     *
     * @this {Keyboard8080}
     * @param {number} bMapping
     * @return {number}
     */
    indexOfCharMap(bMapping)
    {
        for (var charCode in this.config.CHARMAP) {
            if (this.config.CHARMAP[charCode] == bMapping) return +charCode;
        }
        return 0;
    }

    /**
     * indexOfSoftKey(softCode)
     *
     * @this {Keyboard8080}
     * @param {number|string} softCode
     * @return {number} index of softCode in aKeysActive, or -1 if not found
     */
    indexOfSoftKey(softCode)
    {
        for (var i = 0; i < this.aKeysActive.length; i++) {
            if (this.aKeysActive[i].softCode == softCode) return i;
        }
        return -1;
    }

    /**
     * onSoftKeyDown(softCode, fDown, fAutoRelease)
     *
     * @this {Keyboard8080}
     * @param {number|string} softCode
     * @param {boolean} fDown is true for a down event, false for up
     * @param {boolean} [fAutoRelease] is true only if we know we want the key to auto-release
     * @return {boolean} true to pass the event along, false to consume it
     */
    onSoftKeyDown(softCode, fDown, fAutoRelease)
    {
        var i = this.indexOfSoftKey(softCode);
        if (fDown) {
            // this.println(softCode + " down");
            if (i < 0) {
                this.aKeysActive.push({
                    softCode: softCode,
                    msDown: Date.now(),
                    fAutoRelease: fAutoRelease || false
                });
            } else {
                this.aKeysActive[i].msDown = Date.now();
                this.aKeysActive[i].fAutoRelease = fAutoRelease || false;
            }
            if (fAutoRelease) this.checkSoftKeysToRelease();        // prime the pump
        } else if (i >= 0) {
            // this.println(softCode + " up");
            if (!this.aKeysActive[i].fAutoRelease) {
                var msDown = this.aKeysActive[i].msDown;
                if (msDown) {
                    var msElapsed = Date.now() - msDown;
                    if (msElapsed < Keyboard8080.MINPRESSTIME) {
                        // this.println(softCode + " released after only " + msElapsed + "ms");
                        this.aKeysActive[i].fAutoRelease = true;
                        this.checkSoftKeysToRelease();
                        return true;
                    }
                }
            }
            this.aKeysActive.splice(i, 1);
        } else {
            // this.println(softCode + " up with no down?");
        }

        if (this.chipset) {
            var bit = 0;
            switch(softCode) {
            case '1p':
                bit = ChipSet8080.SI1978.STATUS1.P1;
                break;
            case '2p':
                bit = ChipSet8080.SI1978.STATUS1.P2;
                break;
            case 'coin':
                bit = ChipSet8080.SI1978.STATUS1.CREDIT;
                break;
            case 'left':
                bit = ChipSet8080.SI1978.STATUS1.P1_LEFT;
                break;
            case 'right':
                bit = ChipSet8080.SI1978.STATUS1.P1_RIGHT;
                break;
            case 'fire':
                bit = ChipSet8080.SI1978.STATUS1.P1_FIRE;
                break;
            }
            if (bit) {
                this.chipset.updateStatus1(bit, fDown);
            }
        }
        return true;
    }

    /**
     * checkSoftKeysToRelease()
     *
     * @this {Keyboard8080}
     */
    checkSoftKeysToRelease()
    {
        var i = 0;
        var msDelayMin = -1;
        while (i < this.aKeysActive.length) {
            if (this.aKeysActive[i].fAutoRelease) {
                var softCode = this.aKeysActive[i].softCode;
                var msDown = this.aKeysActive[i].msDown;
                var msElapsed = Date.now() - msDown;
                var msDelay = Keyboard8080.MINPRESSTIME - msElapsed;
                if (msDelay > 0) {
                    if (msDelayMin < 0 || msDelayMin > msDelay) {
                        msDelayMin = msDelay;
                    }
                } else {
                    /*
                     * Because the key is already in the auto-release state, this next call guarantees that the
                     * key will be removed from the array; a consequence of that removal, however, is that we must
                     * reset our array index to zero.
                     */
                    this.onSoftKeyDown(softCode, false);
                    i = 0;
                    continue;
                }
            }
            i++;
        }
        if (msDelayMin >= 0) {
            /*
             * Replaced the klunky browser setTimeout() call with our own timer service.
             *
             *      var kbd = this;
             *      setTimeout(function() { kbd.checkSoftKeysToRelease(); }, msDelayMin);
             */
            this.cpu.setTimer(this.timerReleaseKeys, msDelayMin);
        }
    }

    /**
     * isVT100TransmitterReady()
     *
     * Called whenever the VT100 ChipSet circuit needs the Keyboard UART's transmitter status.
     *
     * From p. 4-32 of the VT100 Technical Manual (July 1982):
     *
     *      The operating clock for the keyboard interface comes from an address line in the video processor (LBA4).
     *      This signal has an average period of 7.945 microseconds. Each data byte is transmitted with one start bit
     *      and one stop bit, and each bit lasts 16 clock periods. The total time for each data byte is 160 times 7.945
     *      or 1.27 milliseconds. Each time the Transmit Buffer Empty flag on the terminal's UART gets set (when the
     *      current byte is being transmitted), the microprocessor loads another byte into the transmit buffer. In this
     *      way, the stream of status bytes to the keyboard is continuous.
     *
     * We used to always return true (after all, what's wrong with an infinitely fast UART?), but unfortunately,
     * the VT100 firmware relies on the UART's slow transmission speed to drive cursor blink rate.  We have several
     * options:
     *
     *      1) Snapshot the CPU cycle count each time a byte is transmitted (see outVT100UARTStatus()) and then every
     *      time this is polled, see if the cycle count has exceeded the snapshot value by the necessary threshold;
     *      if we assume 361.69ns per CPU cycle, there are 22 CPU cycles for every 1 LBA4 cycle, and since transmission
     *      time is supposed to last for 160 LBA4 cycles, the threshold is 22*160 CPU cycles, or 3520 cycles.
     *
     *      2) Set a CPU timer using the new setTimer() interface, which can be passed the number of milliseconds to
     *      wait before firing (in this case, roughly 1.27ms).
     *
     *      3) Call the ChipSet's getVT100LBA(4) function for the state of the simulated LBA4, and count 160 LBA4
     *      transitions; however, that would be the worst solution, because there's no guarantee that the firmware's
     *      UART polling will occur regularly and/or frequently enough for us to catch every LBA4 transition.
     *
     * I'm going with solution #1 because it's less overhead.
     *
     * @this {Keyboard8080}
     * @return {boolean} (true if ready, false if not)
     */
    isVT100TransmitterReady()
    {
        if (this.fVT100UARTBusy) {
            /*
             * NOTE: getMSCycles(1.2731488) should work out to 3520 cycles for a CPU clocked at 361.69ns per cycle,
             * which is roughly 2.76Mhz.  We could just hard-code 3520 instead of calling getMSCycles(), but this helps
             * maintain a reasonable blink rate for the cursor even when the user cranks up the CPU speed.
             */
            if (this.cpu.getCycles() >= this.nVT100UARTCycleSnap + this.cpu.getMSCycles(1.2731488)) {
                this.fVT100UARTBusy = false;
            }
        }
        return !this.fVT100UARTBusy;
    }

    /**
     * inVT100UARTAddress(port, addrFrom)
     *
     * We take our cue from iKeyNext.  If it's -1 (default), we simply return the last value latched
     * in bVT100Address.  Otherwise, if iKeyNext is a valid index into aKeysActive, we look up the key
     * in the VT100.KEYMAP, latch it, and increment iKeyNext.  Failing that, we latch Keyboard8080.VT100.KEYLAST
     * and reset iKeyNext to -1.
     *
     * @this {Keyboard8080}
     * @param {number} port (0x82)
     * @param {number} [addrFrom] (not defined if the Debugger is trying to write the specified port)
     * @return {number} simulated port value
     */
    inVT100UARTAddress(port, addrFrom)
    {
        var b = this.bVT100Address;
        if (this.iKeyNext >= 0) {
            if (this.iKeyNext < this.aKeysActive.length) {
                var key = this.aKeysActive[this.iKeyNext];
                if (!MAXDEBUG) {
                    this.iKeyNext++;
                } else {
                    /*
                     * In MAXDEBUG builds, this code removes the key as soon as it's been reported, because
                     * when debugging, it's easy for the window to lose focus and never receive the keyUp event,
                     * thereby leaving us with a stuck key.  However, this may cause more problems than it solves,
                     * because the VT100's ROM seems to require that key presses persist for more than a single poll.
                     */
                    this.aKeysActive.splice(this.iKeyNext, 1);
                }
                b = Keyboard8080.VT100.KEYMAP[key.softCode];
                if (b & 0x80) {
                    /*
                     * TODO: This code is supposed to be accompanied by a SHIFT key; make sure that it is.
                     */
                    b &= 0x7F;
                }
            } else {
                this.iKeyNext = -1;
                b = Keyboard8080.VT100.KEYLAST;
            }
            this.bVT100Address = b;
            this.cpu.requestINTR(1);
        }
        this.printMessageIO(port, null, addrFrom, "KBDUART.ADDRESS", b);
        return b;
    }

    /**
     * outVT100UARTStatus(port, b, addrFrom)
     *
     * @this {Keyboard8080}
     * @param {number} port (0x82)
     * @param {number} b
     * @param {number} [addrFrom] (not defined if the Debugger is trying to write the specified port)
     */
    outVT100UARTStatus(port, b, addrFrom)
    {
        this.printMessageIO(port, b, addrFrom, "KBDUART.STATUS");
        this.bVT100Status = b;
        this.fVT100UARTBusy = true;
        this.nVT100UARTCycleSnap = this.cpu.getCycles();
        this.updateLEDs(b & Keyboard8080.VT100.STATUS.LEDS);
        if (b & Keyboard8080.VT100.STATUS.START) {
            this.iKeyNext = 0;
            this.cpu.requestINTR(1);
        }
    }

    /**
     * Keyboard8080.init()
     *
     * This function operates on every HTML element of class "keyboard", extracting the
     * JSON-encoded parameters for the Keyboard constructor from the element's "data-value"
     * attribute, invoking the constructor to create a Keyboard component, and then binding
     * any associated HTML controls to the new component.
     */
    static init()
    {
        var aeKbd = Component.getElementsByClass(document, PC8080.APPCLASS, "keyboard");
        for (var iKbd = 0; iKbd < aeKbd.length; iKbd++) {
            var eKbd = aeKbd[iKbd];
            var parmsKbd = Component.getComponentParms(eKbd);
            var kbd = new Keyboard8080(parmsKbd);
            Component.bindComponentControls(kbd, eKbd, PC8080.APPCLASS);
        }
    }
}

/*
 * Now that we want to keep track of the physical (and simulated) state of modifier keys, I've
 * grabbed a copy of the same bit definitions used by /modules/pcx86/lib/keyboard.js, since it's
 * only important that we have a set of unique values; what the values are isn't critical.
 */
Keyboard8080.STATE = {
    RSHIFT:         0x0001,
    SHIFT:          0x0002,
    SHIFTS:         0x0003,
    RCTRL:          0x0004,             // 101-key keyboard only
    CTRL:           0x0008,
    CTRLS:          0x000C,
    RALT:           0x0010,             // 101-key keyboard only
    ALT:            0x0020,
    ALTS:           0x0030,
    RCMD:           0x0040,             // 101-key keyboard only
    CMD:            0x0080,             // 101-key keyboard only
    CMDS:           0x00C0,
    ALL_RIGHT:      0x0055,             // RSHIFT | RCTRL | RALT | RCMD
    ALL_SHIFT:      0x00FF,             // SHIFT | RSHIFT | CTRL | RCTRL | ALT | RALT | CMD | RCMD
    INSERT:         0x0100,             // TODO: Placeholder (we currently have no notion of any "insert" states)
    CAPS_LOCK:      0x0200,
    NUM_LOCK:       0x0400,
    SCROLL_LOCK:    0x0800,
    ALL_LOCKS:      0x0E00,             // CAPS_LOCK | NUM_LOCK | SCROLL_LOCK
    REMAPPED:       0x1000
};

Keyboard8080.MINPRESSTIME = 50;         // minimum milliseconds to wait before auto-releasing keys

/**
 * Alternate keyCode mappings to support popular "WASD"-style directional-key mappings.
 *
 * TODO: ES6 computed property name support may now be in all mainstream browsers, allowing us to use
 * a simple object literal for this and all other object initializations.
 */
Keyboard8080.WASDCODES = {};
Keyboard8080.WASDCODES[Keys.ASCII.A] = Keys.KEYCODE.LEFT;
Keyboard8080.WASDCODES[Keys.ASCII.D] = Keys.KEYCODE.RIGHT;
Keyboard8080.WASDCODES[Keys.ASCII.L] = Keys.KEYCODE.SPACE;

/*
 * Supported keyboard configurations.
 *
 * A word (or two) about SOFTCODES.  Their main purpose is to provide a naming convention for machine-specific
 * controls, without tying us to any particular keyboard mapping.  They are used in two main ways.
 *
 * First, if we have a binding to the machine's "screen", there will, at a minimum, be onkeydown and onkeyup
 * handlers attached to the screen, and those handlers will need to iterate through the SOFTCODES table, looking
 * for key codes that we care about and converting them to corresponding soft codes.  Some machines, like
 * Space Invaders, will then act directly upon the soft code (eg, converting it to a machine-specific status bit).
 *
 * Second, a machine may have other bindings (eg, buttons) to one or more of these soft codes, and those bindings
 * will need to know which key codes they're supposed to generate.  Some machines, like the VT100, will then use
 * another table (KEYMAP) to convert key codes into a machine-specific "key addresses".
 */
Keyboard8080.SI1978 = {
    MODEL:          1978.1,
    KEYMAP:         {},
    CHARMAP:        {},
    ALTCODES:       Keyboard8080.WASDCODES,
    LEDCODES:       {},
    SOFTCODES: {
        '1p':       Keys.KEYCODE.ONE,
        '2p':       Keys.KEYCODE.TWO,
        'coin':     Keys.KEYCODE.THREE,
        'left':     Keys.KEYCODE.LEFT,
        'right':    Keys.KEYCODE.RIGHT,
        'fire':     Keys.KEYCODE.SPACE
    }
};

Keyboard8080.VT100 = {
    MODEL:          100.0,
    KEYMAP: {
        /*
         * Map of keydown keyCodes to VT100 key addresses (7-bit values representing key positions on the VT100).
         *
         * NOTE: The VT100 keyboard has both BACKSPACE and DELETE keys, whereas modern keyboards generally only
         * have DELETE.  And sadly, when you press DELETE, your modern keyboard and/or modern browser is reporting
         * it as keyCode 8: the code for BACKSPACE, aka CTRL-H.  You have to press a modified DELETE key to get
         * the actual DELETE keyCode of 127.
         *
         * We resolve this below by mapping KEYCODE.BS (8) to VT100 keyCode DELETE (0x03) and KEYCODE.DEL (127)
         * to VT100 keyCode BACKSPACE (0x33).  So, DELETE is BACKSPACE and BACKSPACE is DELETE.  Fortunately, this
         * confusion is all internal, because your physical key is (or should be) labeled DELETE, so the fact that
         * the browser is converting it to BACKSPACE and that we're converting BACKSPACE back into DELETE is
         * something most people don't need to worry their heads about.
         *
         * ES6 ALERT: As you can see below, I've finally started using computed property names.
         */
        [Keys.KEYCODE.BS]:      0x03,
        [Keys.ASCII.P]:         0x05,
        [Keys.ASCII.O]:         0x06,
        [Keys.ASCII.Y]:         0x07,
        [Keys.ASCII.T]:         0x08,
        [Keys.ASCII.W]:         0x09,
        [Keys.ASCII.Q]:         0x0A,
        [Keys.KEYCODE.RIGHT]:   0x10,
        [Keys.KEYCODE.RBRACK]:  0x14,
        [Keys.KEYCODE.LBRACK]:  0x15,
        [Keys.ASCII.I]:         0x16,
        [Keys.ASCII.U]:         0x17,
        [Keys.ASCII.R]:         0x18,
        [Keys.ASCII.E]:         0x19,
        [Keys.KEYCODE.ONE]:     0x1A,
        [Keys.KEYCODE.LEFT]:    0x20,
        [Keys.KEYCODE.DOWN]:    0x22,
        [Keys.KEYCODE.F6]:      0x23,   // aka BREAK
        [Keys.KEYCODE.PAUSE]:   0x23,   // aka BREAK
        [Keys.KEYCODE.BQUOTE]:  0x24,
        [Keys.KEYCODE.DASH]:    0x25,
        [Keys.KEYCODE.NINE]:    0x26,
        [Keys.KEYCODE.SEVEN]:   0x27,
        [Keys.KEYCODE.FOUR]:    0x28,
        [Keys.KEYCODE.THREE]:   0x29,
        [Keys.KEYCODE.ESC]:     0x2A,
        [Keys.KEYCODE.UP]:      0x30,
        [Keys.KEYCODE.F3]:      0x31,   // aka PF3
        [Keys.KEYCODE.F1]:      0x32,   // aka PF1
        [Keys.KEYCODE.DEL]:     0x33,
        [Keys.KEYCODE.EQUALS]:  0x34,
        [Keys.KEYCODE.ZERO]:    0x35,
        [Keys.KEYCODE.EIGHT]:   0x36,
        [Keys.KEYCODE.SIX]:     0x37,
        [Keys.KEYCODE.FIVE]:    0x38,
        [Keys.KEYCODE.TWO]:     0x39,
        [Keys.KEYCODE.TAB]:     0x3A,
        [Keys.KEYCODE.NUM_7]:   0x40,
        [Keys.KEYCODE.F4]:      0x41,   // aka PF4
        [Keys.KEYCODE.F2]:      0x42,   // aka PF2
        [Keys.KEYCODE.NUM_0]:   0x43,
        [Keys.KEYCODE.F7]:      0x44,   // aka LINE-FEED
        [Keys.KEYCODE.BSLASH]:  0x45,
        [Keys.ASCII.L]:         0x46,
        [Keys.ASCII.K]:         0x47,
        [Keys.ASCII.G]:         0x48,
        [Keys.ASCII.F]:         0x49,
        [Keys.ASCII.A]:         0x4A,
        [Keys.KEYCODE.NUM_8]:   0x50,
        [Keys.KEYCODE.NUM_CR]:  0x51,
        [Keys.KEYCODE.NUM_2]:   0x52,
        [Keys.KEYCODE.NUM_1]:   0x53,
        [Keys.KEYCODE.QUOTE]:   0x55,
        [Keys.KEYCODE.SEMI]:    0x56,
        [Keys.ASCII.J]:         0x57,
        [Keys.ASCII.H]:         0x58,
        [Keys.ASCII.D]:         0x59,
        [Keys.ASCII.S]:         0x5A,
        [Keys.KEYCODE.NUM_DEL]: 0x60,   // keypad period
        [Keys.KEYCODE.F5]:      0x61,   // aka KEYPAD COMMA
        [Keys.KEYCODE.NUM_5]:   0x62,
        [Keys.KEYCODE.NUM_4]:   0x63,
        [Keys.KEYCODE.CR]:      0x64,   // TODO: Figure out why the Technical Manual lists CR at both 0x04 and 0x64
        [Keys.KEYCODE.PERIOD]:  0x65,
        [Keys.KEYCODE.COMMA]:   0x66,
        [Keys.ASCII.N]:         0x67,
        [Keys.ASCII.B]:         0x68,
        [Keys.ASCII.X]:         0x69,
        [Keys.KEYCODE.F8]:      0x6A,   // aka NO-SCROLL
        [Keys.KEYCODE.NUM_9]:   0x70,
        [Keys.KEYCODE.NUM_3]:   0x71,
        [Keys.KEYCODE.NUM_6]:   0x72,
        [Keys.KEYCODE.NUM_SUB]: 0x73,   // aka KEYPAD MINUS
        [Keys.KEYCODE.SLASH]:   0x75,
        [Keys.ASCII.M]:         0x76,
        [Keys.ASCII[' ']]:      0x77,
        [Keys.ASCII.V]:         0x78,
        [Keys.ASCII.C]:         0x79,
        [Keys.ASCII.Z]:         0x7A,
        [Keys.KEYCODE.F9]:      0x7B,   // aka SET-UP
        [Keys.KEYCODE.CTRL]:    0x7C,
        [Keys.KEYCODE.SHIFT]:   0x7D,   // either shift key (doesn't matter)
        [Keys.KEYCODE.CAPS_LOCK]:0x7E
    },
    CHARMAP: {
        /*
         * Map of keypress charCodes to VT100 key addresses (7-bit values representing key positions on the VT100);
         * the 8th bit (0x80) is set for keys that need to be shifted.
         *
         * This is currently used only with the iOS keypress handler, which processes character codes rather than
         * keyboard codes.  As a result, this table is not as complete as the KEYMAP table, since certain keys are
         * not delivered as key presses (eg, BACKSPACE) and/or are simply not present on the iOS keyboard (eg, ESC,
         * arrow keys).  Also, SPACE had to be removed from the CHARMAP table as well, because otherwise it causes
         * the entire page to scroll down (you have to wonder who thought THAT was a good idea).
         *
         * ES6 ALERT: As you can see below, I've finally started using computed property names.
         */
        [Keys.ASCII.p]:         0x05,
        [Keys.ASCII.o]:         0x06,
        [Keys.ASCII.y]:         0x07,
        [Keys.ASCII.t]:         0x08,
        [Keys.ASCII.w]:         0x09,
        [Keys.ASCII.q]:         0x0A,
        [Keys.ASCII[']']]:      0x14,
        [Keys.ASCII['[']]:      0x15,
        [Keys.ASCII.i]:         0x16,
        [Keys.ASCII.u]:         0x17,
        [Keys.ASCII.r]:         0x18,
        [Keys.ASCII.e]:         0x19,
        [Keys.ASCII['1']]:      0x1A,
        [Keys.ASCII['`']]:      0x24,
        [Keys.ASCII['-']]:      0x25,
        [Keys.ASCII['9']]:      0x26,
        [Keys.ASCII['7']]:      0x27,
        [Keys.ASCII['4']]:      0x28,
        [Keys.ASCII['3']]:      0x29,
        [Keys.ASCII['=']]:      0x34,
        [Keys.ASCII['0']]:      0x35,
        [Keys.ASCII['8']]:      0x36,
        [Keys.ASCII['6']]:      0x37,
        [Keys.ASCII['5']]:      0x38,
        [Keys.ASCII['2']]:      0x39,
        [Keys.ASCII['\\']]:     0x45,
        [Keys.ASCII.l]:         0x46,
        [Keys.ASCII.k]:         0x47,
        [Keys.ASCII.g]:         0x48,
        [Keys.ASCII.f]:         0x49,
        [Keys.ASCII.a]:         0x4A,
        [Keys.ASCII["'"]]:      0x55,
        [Keys.ASCII[';']]:      0x56,
        [Keys.ASCII.j]:         0x57,
        [Keys.ASCII.h]:         0x58,
        [Keys.ASCII.d]:         0x59,
        [Keys.ASCII.s]:         0x5A,
        [Keys.KEYCODE.CR]:      0x64,   // TODO: Figure out why the Technical Manual lists CR at both 0x04 and 0x64
        [Keys.ASCII['.']]:      0x65,
        [Keys.ASCII[',']]:      0x66,
        [Keys.ASCII.n]:         0x67,
        [Keys.ASCII.b]:         0x68,
        [Keys.ASCII.x]:         0x69,
        [Keys.ASCII['/']]:      0x75,
        [Keys.ASCII.m]:         0x76,
     // [Keys.ASCII[' ']]:      0x77,   // as noted above, we need to process SPACE at keydown rather than keypress
        [Keys.ASCII.v]:         0x78,
        [Keys.ASCII.c]:         0x79,
        [Keys.ASCII.z]:         0x7A,
        [Keys.ASCII.P]:         0x85,
        [Keys.ASCII.O]:         0x86,
        [Keys.ASCII.Y]:         0x87,
        [Keys.ASCII.T]:         0x88,
        [Keys.ASCII.W]:         0x89,
        [Keys.ASCII.Q]:         0x8A,
        [Keys.ASCII['}']]:      0x94,
        [Keys.ASCII['{']]:      0x95,
        [Keys.ASCII.I]:         0x96,
        [Keys.ASCII.U]:         0x97,
        [Keys.ASCII.R]:         0x98,
        [Keys.ASCII.E]:         0x99,
        [Keys.ASCII['!']]:      0x9A,
        [Keys.ASCII['~']]:      0xA4,
        [Keys.ASCII['_']]:      0xA5,
        [Keys.ASCII['(']]:      0xA6,
        [Keys.ASCII['&']]:      0xA7,
        [Keys.ASCII['$']]:      0xA8,
        [Keys.ASCII['#']]:      0xA9,
        [Keys.ASCII['+']]:      0xB4,
        [Keys.ASCII[')']]:      0xB5,
        [Keys.ASCII['*']]:      0xB6,
        [Keys.ASCII['^']]:      0xB7,
        [Keys.ASCII['%']]:      0xB8,
        [Keys.ASCII['@']]:      0xB9,
        [Keys.ASCII['|']]:      0xC5,
        [Keys.ASCII.L]:         0xC6,
        [Keys.ASCII.K]:         0xC7,
        [Keys.ASCII.G]:         0xC8,
        [Keys.ASCII.F]:         0xC9,
        [Keys.ASCII.A]:         0xCA,
        [Keys.ASCII['"']]:      0xD5,
        [Keys.ASCII[':']]:      0xD6,
        [Keys.ASCII.J]:         0xD7,
        [Keys.ASCII.H]:         0xD8,
        [Keys.ASCII.D]:         0xD9,
        [Keys.ASCII.S]:         0xDA,
        [Keys.ASCII['>']]:      0xE5,
        [Keys.ASCII['<']]:      0xE6,
        [Keys.ASCII.N]:         0xE7,
        [Keys.ASCII.B]:         0xE8,
        [Keys.ASCII.X]:         0xE9,
        [Keys.ASCII['?']]:      0xF5,
        [Keys.ASCII.M]:         0xF6,
        [Keys.ASCII.V]:         0xF8,
        [Keys.ASCII.C]:         0xF9,
        [Keys.ASCII.Z]:         0xFA
    },
    ALTCODES: {},
    LEDCODES: {},
    SOFTCODES: {
        'caps-lock':    Keys.KEYCODE.CAPS_LOCK,
        'ctrl':         Keys.KEYCODE.CTRL,
        'esc':          Keys.KEYCODE.ESC,
        'tab':          Keys.KEYCODE.TAB,
        'num-comma':    Keys.KEYCODE.F5,        // since modern keypads don't typically have a comma...
        'break':        Keys.KEYCODE.F6,
        'line-feed':    Keys.KEYCODE.F7,
        'no-scroll':    Keys.KEYCODE.F8,
        'setup':        Keys.KEYCODE.F9
    },
    /*
     * Reading port 0x82 returns a key address from the VT100 keyboard's UART data output.
     *
     * Every time a keyboard scan is initiated (by setting the START bit of the status byte),
     * our internal address index (iKeyNext) is set to zero, and an interrupt is generated for
     * each entry in the aKeysActive array, along with a final interrupt for KEYLAST.
     */
    ADDRESS: {
        PORT:       0x82,
        INIT:       0x7F
    },
    /*
     * Writing port 0x82 updates the VT100's keyboard status byte via the keyboard's UART data input.
     */
    STATUS: {
        PORT:       0x82,               // write-only
        LED4:       0x01,
        LED3:       0x02,
        LED2:       0x04,
        LED1:       0x08,
        LOCKED:     0x10,
        LOCAL:      0x20,
        LEDS:       0x3F,               // all LEDs
        START:      0x40,               // set to initiate a scan
        /*
         * From p. 4-38 of the VT100 Technical Manual (July 1982):
         *
         *      A bit (CLICK) in the keyboard status word controls the bell....  When a single status word contains
         *      the bell bit, flip-flop E3 toggles and turns on E1, generating a click. If the bell bit is set for
         *      many words in succession, the UART latch holds the data output constant..., allowing the circuit to
         *      produce an 800 hertz tone. Bell is generated by setting the bell bit for 0.25 seconds.  Each cycle of
         *      the tone is at a reduced amplitude compared with the single keyclick....  The overall effect of the
         *      tone burst on the ear is that of a beep.
         */
        CLICK:      0x80,
        INIT:       0x00
    },
    KEYLAST:        0x7F                // special end-of-scan key address (all valid key addresses are < KEYLAST)
};

Keyboard8080.VT100.LEDCODES = {
    'l4':       Keyboard8080.VT100.STATUS.LED4,
    'l3':       Keyboard8080.VT100.STATUS.LED3,
    'l2':       Keyboard8080.VT100.STATUS.LED2,
    'l1':       Keyboard8080.VT100.STATUS.LED1,
    'locked':   Keyboard8080.VT100.STATUS.LOCKED,
    'local':    Keyboard8080.VT100.STATUS.LOCAL,
    'online':  ~Keyboard8080.VT100.STATUS.LOCAL,
    'caps-lock':Keyboard8080.STATE.CAPS_LOCK
};

/*
 * Supported models and their configurations
 */
Keyboard8080.MODELS = {
    "SI1978":       Keyboard8080.SI1978,
    "VT100":        Keyboard8080.VT100
};

Keyboard8080.VT100.INIT = [
    [
        Keyboard8080.VT100.STATUS.INIT,         // bVT100Status
        Keyboard8080.VT100.ADDRESS.INIT,        // bVT100Address
        false,                                  // fVT100UARTBusy
        0,                                      // nVT100UARTCycleSnap
        -1                                      // iKeyNext
    ]
];

/*
 * Port notification tables
 */
Keyboard8080.VT100.portsInput = {
    0x82: Keyboard8080.prototype.inVT100UARTAddress
};

Keyboard8080.VT100.portsOutput = {
    0x82: Keyboard8080.prototype.outVT100UARTStatus
};

/*
 * Initialize every Keyboard module on the page.
 */
Web.onInit(Keyboard8080.init);

if (NODE) module.exports = Keyboard8080;
