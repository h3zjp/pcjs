/**
 * @fileoverview Implements the PCx86 ParallelPort component.
 * @author <a href="mailto:Jeff@pcjs.org">Jeff Parsons</a>
 * @copyright Jeff Parsons 2012-2016
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
 * You are required to include the above copyright notice in every source code file of every
 * copy or modified version of this work, and to display that copyright notice on every screen
 * that loads or runs any version of this software (see COPYRIGHT in /modules/shared/lib/defines.js).
 *
 * Some PCjs files also attempt to load external resource files, such as character-image files,
 * ROM files, and disk image files. Those external resource files are not considered part of PCjs
 * for purposes of the GNU General Public License, and the author does not claim any copyright
 * as to their contents.
 */

"use strict";

if (NODE) {
    var str         = require("../../shared/lib/strlib");
    var web         = require("../../shared/lib/weblib");
    var Component   = require("../../shared/lib/component");
    var State       = require("../../shared/lib/state");
    var PCX86       = require("./defines");
    var Messages    = require("./messages");
    var ChipSet     = require("./chipset");
}

/**
 * ParallelPort(parmsParallel)
 *
 * The ParallelPort component has the following component-specific (parmsParallel) properties:
 *
 *      adapter: 1 (port 0x3BC), 2 (port 0x378), or 3 (port 0x278); 0 if not defined
 *
 *      binding: name of a control (based on its "binding" attribute) to bind to this port's I/O
 *
 * In the future, we may support 'port' and 'irq' properties that allow the machine to define a
 * non-standard parallel port configuration, instead of only our pre-defined 'adapter' configurations.
 *
 * NOTE: Since the XSL file defines 'adapter' as a number, not a string, there's no need to use
 * parseInt(), and as an added benefit, we don't need to worry about whether a hex or decimal format
 * was used.
 *
 * DOS typically names the Primary adapter "LPT1" and the Secondary adapter "LPT2", but I prefer
 * to stick to adapter numbers, since not all operating systems follow those naming conventions.
 *
 * @constructor
 * @extends Component
 * @param {Object} parmsParallel
 */
function ParallelPort(parmsParallel) {

    this.iAdapter = parmsParallel['adapter'];

    switch (this.iAdapter) {
    case 1:
        this.portBase = 0x3BC;
        this.nIRQ = ChipSet.IRQ.LPT1;
        break;
    case 2:
        this.portBase = 0x378;
        this.nIRQ = ChipSet.IRQ.LPT1;
        break;
    case 3:
        this.portBase = 0x278;
        this.nIRQ = ChipSet.IRQ.LPT2;
        break;
    default:
        Component.warning("Unrecognized parallel adapter #" + this.iAdapter);
        return;
    }
    /**
     * consoleOutput becomes a string that records parallel port output if the 'binding' property is set to the
     * reserved name "console".  Nothing is written to the console, however, until a linefeed (0x0A) is output
     * or the string length reaches a threshold (currently, 1024 characters).
     *
     * @type {string|null}
     */
    this.consoleOutput = null;

    /**
     * controlIOBuffer is a DOM element bound to the port (currently used for output only; see transmitByte()).
     *
     * @type {Object}
     */
    this.controlIOBuffer = null;

    Component.call(this, "ParallelPort", parmsParallel, ParallelPort, Messages.PARALLEL);

    var sBinding = parmsParallel['binding'];
    if (sBinding == "console") {
        this.consoleOutput = "";
    } else {
        /*
         * NOTE: If sBinding is not the name of a valid Control Panel DOM element, this call does nothing.
         */
        Component.bindExternalControl(this, sBinding, ParallelPort.sIOBuffer);
    }
}

/*
 * class ParallelPort
 * property {number} iAdapter
 * property {number} portBase
 * property {number} nIRQ
 * property {Object} controlIOBuffer is a DOM element bound to the port (for rudimentary output; see transmitByte())
 *
 * NOTE: This class declaration started as a way of informing the code inspector of the controlIOBuffer property,
 * which remained undefined until a setBinding() call set it later, but I've since decided that explicitly
 * initializing such properties in the constructor is a better way to go -- even though it's more code -- because
 * JavaScript compilers are supposed to be happier when the underlying object structures aren't constantly changing.
 *
 * Besides, I'm not sure I want to get into documenting every property this way, for this or any/every other class,
 * let alone getting into which ones should be considered private or protected, because PCjs isn't really a library
 * for third-party apps.
 */

Component.subclass(ParallelPort);

/*
 * Internal name used for the I/O buffer control, if any, that we bind to the ParallelPort.
 *
 * Alternatively, if ParallelPort wants to use another component's control (eg, the Panel's
 * "print" control), it can specify the name of that control with the 'binding' property.
 *
 * For that binding to succeed, we also need to know the target component; for now, that's
 * been hard-coded to "Panel", in part because that's one of the few components we can rely
 * upon initializing before we do, but it would be a simple matter to include a component type
 * or ID as part of the 'binding' property as well, if we need more flexibility later.
 */
ParallelPort.sIOBuffer = "buffer";

/*
 * The "Data Register" is an input/output register at offset 0 from portBase.  The bit-to-pin mappings are:
 *
 *      Bit     Pin
 *      ---     ---
 *       0       2              // 0x01 (DATA 1)
 *       1       3              // 0x02 (DATA 2)
 *       2       4              // 0x04 (DATA 3)
 *       3       5              // 0x08 (DATA 4)
 *       4       6              // 0x10 (DATA 5)
 *       5       7              // 0x20 (DATA 6)
 *       6       8              // 0x40 (DATA 7)
 *       7       9              // 0x80 (DATA 8)
 */
ParallelPort.DATA = {           // (read/write)
    REG:        0
};

/*
 * The "Status Register" is an input register at offset 1 from portBase.  The bit-to-pin mappings are:
 *
 *      Bit     Pin
 *      ---     ---
 *       0       -              // 0x01
 *       1       -              // 0x02
 *       2       -              // 0x04
 *       3       15             // 0x08 (not used)
 *       4       13             // 0x10 (printer is in the selected state)
 *       5       12             // 0x20 (out of paper)
 *       6       10             // 0x40 (printer not yet ready to accept another character)
 *       7       11             // 0x80 (printer cannot receive data; eg, printer off-line, or print operation in progress)
 */
ParallelPort.STATUS = {         // (read)
    REG:        1,
    NOTREADY:   0x40            // when this bit goes clear, interrupt requested
};

/*
 * The "Control Register" is an input/output register at offset 2 from portBase.  The bit-to-pin mappings are:
 *
 *      Bit     Pin
 *      ---     ---
 *       0       !1             // 0x01 (read input data)
 *       1      !14             // 0x02 (automatically feed paper one line)
 *       2       16             // 0x04
 *       3      !17             // 0x08
 *
 * Additionally, bit 4 is the IRQ ENABLE bit, which allows interrupts when pin 10 transitions high to low.
 */
ParallelPort.CONTROL = {        // (read/write)
    REG:        2,
    IRQ_ENABLE: 0x10            // set to enable interrupts
};

/**
 * setBinding(sHTMLType, sBinding, control, sValue)
 *
 * @this {ParallelPort}
 * @param {string|null} sHTMLType is the type of the HTML control (eg, "button", "list", "text", "submit", "textarea", "canvas")
 * @param {string} sBinding is the value of the 'binding' parameter stored in the HTML control's "data-value" attribute (eg, "buffer")
 * @param {Object} control is the HTML control DOM object (eg, HTMLButtonElement)
 * @param {string} [sValue] optional data value
 * @return {boolean} true if binding was successful, false if unrecognized binding request
 */
ParallelPort.prototype.setBinding = function(sHTMLType, sBinding, control, sValue)
{
    switch (sBinding) {
    case ParallelPort.sIOBuffer:
        this.bindings[sBinding] = this.controlIOBuffer = control;
        return true;

    default:
        break;
    }
    return false;
};

/**
 * initBus(cmp, bus, cpu, dbg)
 *
 * @this {ParallelPort}
 * @param {Computer} cmp
 * @param {Bus} bus
 * @param {X86CPU} cpu
 * @param {DebuggerX86} dbg
 */
ParallelPort.prototype.initBus = function(cmp, bus, cpu, dbg)
{
    this.bus = bus;
    this.cpu = cpu;
    this.dbg = dbg;
    this.chipset = cmp.getMachineComponent("ChipSet");
    bus.addPortInputTable(this, ParallelPort.aPortInput, this.portBase);
    bus.addPortOutputTable(this, ParallelPort.aPortOutput, this.portBase);
    this.setReady();
};

/**
 * powerUp(data, fRepower)
 *
 * @this {ParallelPort}
 * @param {Object|null} data
 * @param {boolean} [fRepower]
 * @return {boolean} true if successful, false if failure
 */
ParallelPort.prototype.powerUp = function(data, fRepower)
{
    if (!fRepower) {
        if (!data || !this.restore) {
            this.reset();
        } else {
            if (!this.restore(data)) return false;
        }
    }
    return true;
};

/**
 * powerDown(fSave, fShutdown)
 *
 * @this {ParallelPort}
 * @param {boolean} [fSave]
 * @param {boolean} [fShutdown]
 * @return {Object|boolean} component state if fSave; otherwise, true if successful, false if failure
 */
ParallelPort.prototype.powerDown = function(fSave, fShutdown)
{
    return fSave? this.save() : true;
};

/**
 * reset()
 *
 * @this {ParallelPort}
 */
ParallelPort.prototype.reset = function()
{
    this.initState();
};

/**
 * save()
 *
 * This implements save support for the ParallelPort component.
 *
 * @this {ParallelPort}
 * @return {Object}
 */
ParallelPort.prototype.save = function()
{
    var state = new State(this);
    state.set(0, this.saveRegisters());
    return state.data();
};

/**
 * restore(data)
 *
 * This implements restore support for the ParallelPort component.
 *
 * @this {ParallelPort}
 * @param {Object} data
 * @return {boolean} true if successful, false if failure
 */
ParallelPort.prototype.restore = function(data)
{
    return this.initState(data[0]);
};

/**
 * initState(data)
 *
 * @this {ParallelPort}
 * @param {Array} [data]
 * @return {boolean} true if successful, false if failure
 */
ParallelPort.prototype.initState = function(data)
{
    var i = 0;
    if (data === undefined) {
        data = [0, 0, 0];
    }
    this.bData = data[i++];
    this.bStatus = data[i++];
    this.bControl = data[i];
    return true;
};

/**
 * saveRegisters()
 *
 * @this {ParallelPort}
 * @return {Array}
 */
ParallelPort.prototype.saveRegisters = function()
{
    var i = 0;
    var data = [];
    data[i++] = this.bData;
    data[i++] = this.bStatus;
    data[i]   = this.bControl;
    return data;
};

/**
 * inData(port, addrFrom)
 *
 * @this {ParallelPort}
 * @param {number} port (0x3BC, 0x378, or 0x278)
 * @param {number} [addrFrom] (not defined whenever the Debugger tries to read the specified port)
 * @return {number} simulated port value
 */
ParallelPort.prototype.inData = function(port, addrFrom)
{
    var b = this.bData;
    this.printMessageIO(port, null, addrFrom, "DATA", b);
    return b;
};

/**
 * inStatus(port, addrFrom)
 *
 * @this {ParallelPort}
 * @param {number} port (0x3BD, 0x379, or 0x279)
 * @param {number} [addrFrom] (not defined whenever the Debugger tries to read the specified port)
 * @return {number} simulated port value
 */
ParallelPort.prototype.inStatus = function(port, addrFrom)
{
    var b = this.bStatus;
    this.printMessageIO(port, null, addrFrom, "STAT", b);
    return b;
};

/**
 * inControl(port, addrFrom)
 *
 * @this {ParallelPort}
 * @param {number} port (0x3BE, 0x37A, or 0x27A)
 * @param {number} [addrFrom] (not defined whenever the Debugger tries to read the specified port)
 * @return {number} simulated port value
 */
ParallelPort.prototype.inControl = function(port, addrFrom)
{
    var b = this.bControl;
    this.printMessageIO(port, null, addrFrom, "CTRL", b);
    return b;
};

/**
 * outData(port, bOut, addrFrom)
 *
 * @this {ParallelPort}
 * @param {number} port (0x3BC, 0x378, or 0x278)
 * @param {number} bOut
 * @param {number} [addrFrom] (not defined whenever the Debugger tries to write the specified port)
 */
ParallelPort.prototype.outData = function(port, bOut, addrFrom)
{
    this.printMessageIO(port, bOut, addrFrom, "DATA");
    this.bData = bOut;
    this.bStatus |= ParallelPort.STATUS.NOTREADY;
    if (this.transmitByte(bOut)) {
        this.bStatus &= ~ParallelPort.STATUS.NOTREADY;
    }
    this.updateIRR();
};

/**
 * outControl(port, bOut, addrFrom)
 *
 * @this {ParallelPort}
 * @param {number} port (0x3BE, 0x37A, or 0x27A)
 * @param {number} bOut
 * @param {number} [addrFrom] (not defined whenever the Debugger tries to write the specified port)
 */
ParallelPort.prototype.outControl = function(port, bOut, addrFrom)
{
    this.printMessageIO(port, bOut, addrFrom, "CTRL");
    this.bControl = bOut;
    this.updateIRR();
};

/**
 * updateIRR()
 *
 * @this {ParallelPort}
 */
ParallelPort.prototype.updateIRR = function()
{
    if (this.chipset && this.nIRQ) {
        if ((this.bControl & ParallelPort.CONTROL.IRQ_ENABLE) && !(this.bStatus & ParallelPort.STATUS.NOTREADY)) {
            this.chipset.setIRR(this.nIRQ);
        } else {
            this.chipset.clearIRR(this.nIRQ);
        }
    }
};

/**
 * transmitByte(b)
 *
 * @this {ParallelPort}
 * @param {number} b
 * @return {boolean} true if transmitted, false if not
 */
ParallelPort.prototype.transmitByte = function(b)
{
    var fTransmitted = false;

    this.printMessage("transmitByte(" + str.toHexByte(b) + ")");

    if (this.controlIOBuffer) {
        if (b == 0x08) {
            this.controlIOBuffer.value = this.controlIOBuffer.value.slice(0, -1);
        }
        else {
            this.controlIOBuffer.value += String.fromCharCode(b);
            this.controlIOBuffer.scrollTop = this.controlIOBuffer.scrollHeight;
        }
        fTransmitted = true;
    }
    if (this.consoleOutput != null) {
        if (b == 0x0A || this.consoleOutput.length >= 1024) {
            this.println(this.consoleOutput);
            this.consoleOutput = "";
        }
        if (b != 0x0A) {
            this.consoleOutput += String.fromCharCode(b);
        }
        fTransmitted = true;
    }

    return fTransmitted;
};

/*
 * Port input notification table
 */
ParallelPort.aPortInput = {
    0x0: ParallelPort.prototype.inData,
    0x1: ParallelPort.prototype.inStatus,
    0x2: ParallelPort.prototype.inControl
};

/*
 * Port output notification table
 */
ParallelPort.aPortOutput = {
    0x0: ParallelPort.prototype.outData,
    0x2: ParallelPort.prototype.outControl
};

/**
 * ParallelPort.init()
 *
 * This function operates on every HTML element of class "parallel", extracting the
 * JSON-encoded parameters for the ParallelPort constructor from the element's "data-value"
 * attribute, invoking the constructor to create a ParallelPort component, and then binding
 * any associated HTML controls to the new component.
 */
ParallelPort.init = function()
{
    var aeParallel = Component.getElementsByClass(document, PCX86.APPCLASS, "parallel");
    for (var iParallel = 0; iParallel < aeParallel.length; iParallel++) {
        var eParallel = aeParallel[iParallel];
        var parmsParallel = Component.getComponentParms(eParallel);
        var parallel = new ParallelPort(parmsParallel);
        Component.bindComponentControls(parallel, eParallel, PCX86.APPCLASS);
    }
};

/*
 * Initialize every ParallelPort module on the page.
 */
web.onInit(ParallelPort.init);

if (NODE) module.exports = ParallelPort;
