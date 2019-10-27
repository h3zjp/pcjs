"use strict";

/**
 * @copyright https://www.pcjs.org/modules/devices/lib/defs.js (C) Jeff Parsons 2012-2019
 */

/**
 * COMMAND is the default name of the global command handler we will define, to provide
 * the same convenient access to all the WebIO COMMAND handlers that the Debugger enjoys.
 *
 * @define {string}
 */
var COMMAND = "command";

/**
 * COMPILED is false by default; overridden with true in the Closure Compiler release.
 *
 * @define {boolean}
 */
var COMPILED = false;

/**
 * DEBUG is true by default, enabling assertions and other runtime checks; overridden with false
 * in the Closure Compiler release, which generally results in the removal of any DEBUG code.  Our
 * gulpfile, however, takes the extra precaution of physically removing all "assert" method calls
 * from the concatenated file that is generated for the Closure Compiler.
 *
 * @define {boolean}
 */
var DEBUG = true;

/**
 * FACTORY is "Machine" by default; overridden with the machine's "factory" string in machines.json
 * to ensure unique factories.
 *
 * @define {string}
 */
var FACTORY = "Machine";

/**
 * MAXDEBUG is false by default; overridden with false in the Closure Compiler release.  Set it to
 * true to manually to enable any hyper-aggressive DEBUG checks.
 *
 * @define {boolean}
 */
var MAXDEBUG = false;

/**
 * VERSION is the current PCjs Project release number, updated somewhat arbitrarily and usually only after
 * significant changes.  It will be overriden the machine's "version" string in machines.json.
 *
 * @define {string}
 */
var VERSION = "2.00";

/*
 * The following globals CANNOT be overridden.
 *
 * LITTLE_ENDIAN is true if the browser's ArrayBuffer storage is little-endian.  If LITTLE_ENDIAN matches
 * the endian-ness of a machine being emulated, then that machine can use ArrayBuffers for Memory buffers as-is.
 */
var LITTLE_ENDIAN = function() {
    let buffer = new ArrayBuffer(2);
    new DataView(buffer).setUint16(0, 256, true);
    return new Uint16Array(buffer)[0] === 256;
}();

/*
 * RS-232 DB-25 Pin Definitions, mapped to bits 1-25 in a 32-bit status value.
 *
 * Serial devices in PCjs machines are considered DTE (Data Terminal Equipment), which means they should be "virtually"
 * connected to each other via a null-modem cable, which assumes the following cross-wiring:
 *
 *     G       1  <->  1        G       (Ground)
 *     TD      2  <->  3        RD      (Received Data)
 *     RD      3  <->  2        TD      (Transmitted Data)
 *     RTS     4  <->  5        CTS     (Clear To Send)
 *     CTS     5  <->  4        RTS     (Request To Send)
 *     DSR   6+8  <->  20       DTR     (Data Terminal Ready)
 *     SG      7  <->  7        SG      (Signal Ground)
 *     DTR    20  <->  6+8      DSR     (Data Set Ready + Carrier Detect)
 *     RI     22  <->  22       RI      (Ring Indicator)
 *
 * TODO: Move these definitions to a more appropriate shared file at some point.
 */
var RS232 = {
    RTS: {
        PIN:  4,
        MASK: 0x00000010
    },
    CTS: {
        PIN:  5,
        MASK: 0x00000020
    },
    DSR: {
        PIN:  6,
        MASK: 0x00000040
    },
    CD: {
        PIN:  8,
        MASK: 0x00000100
    },
    DTR: {
        PIN:  20,
        MASK: 0x00100000
    },
    RI: {
        PIN:  22,
        MASK: 0x00400000
    }
};

/**
 * @class {Defs}
 * @unrestricted
 */
class Defs {
    /**
     * Defs()
     *
     * @this {Defs}
     */
    constructor()
    {
    }
}

Defs.CLASSES = {};
Defs.CLASSES["Defs"] = Defs;

/**
 * @copyright https://www.pcjs.org/modules/devices/lib/numio.js (C) Jeff Parsons 2012-2019
 */

/**
 * @class {NumIO}
 * @unrestricted
 */
class NumIO extends Defs {
    /**
     * NumIO()
     *
     * String to integer conversion:
     *
     *      isInt()
     *      parseInt()
     *
     * Integer to string conversion:
     *
     *      toBase()
     *
     * Bit operations (for values with more than 32 bits):
     *
     *      clearBits()
     *      setBits()
     *      testBits()
     *
     * Initially, this file was going to be called "stdlib.js", since the C runtime library file "stdlib.h"
     * defines numeric conversion functions like atoi().  But stdlib has too many other functions that have
     * nothing to do with data conversion, and we have many conversion functions that you won't find in stdlib.
     * So I settled on "numio.js" instead.
     *
     * @this {NumIO}
     */
    constructor()
    {
        super();
    }

    /**
     * isInt(s, base)
     *
     * The built-in parseInt() function has the annoying feature of returning a partial value (ie,
     * up to the point where it encounters an invalid character); eg, parseInt("foo", 16) returns 0xf.
     *
     * So it's best to use our own parseInt() function, which will in turn use this function to validate
     * the entire string.
     *
     * @this {NumIO}
     * @param {string} s is the string representation of some number
     * @param {number} [base] is the radix to use (default is 10); only 2, 8, 10 and 16 are supported
     * @return {boolean} true if valid, false if invalid (or the specified base isn't supported)
     */
    isInt(s, base)
    {
        if (!base || base == 10) return s.match(/^-?[0-9]+$/) !== null;
        if (base == 16) return s.match(/^-?[0-9a-f]+$/i) !== null;
        if (base == 8) return s.match(/^-?[0-7]+$/) !== null;
        if (base == 2) return s.match(/^-?[01]+$/) !== null;
        return false;
    }

    /**
     * parseDIPSwitches(sws, switchesDefault)
     *
     * @this {NumIO}
     * @param {string} sws (eg, "00000000", where sws[0] is DIP0, sws[1] is DIP1, etc.)
     * @param {number} [switchesDefault] (use -1 to parse sws as a mask: 0 for any non-digit character)
     * @return {number|undefined}
     */
    parseDIPSwitches(sws, switchesDefault)
    {
        let switches;
        if (!sws) {
            switches = switchesDefault;
        } else {
            /*
             * NOTE: It's not convenient to use parseInt() with a base of 2, in part because both bit order
             * and bit sense are reversed, but also because we use this function to parse switch masks, which
             * contain non-digits.  See the "switches" defined in invaders.json for examples.
             */
            switches = 0;
            let bit = 0x1;
            for (let i = 0; i < sws.length; i++) {
                let ch = sws.charAt(i);
                if (switchesDefault == -1) {
                    switches |= (ch != '0' && ch != '1'? 0 : bit);
                }
                else {
                    switches |= (ch == '0'? bit : 0);
                }
                bit <<= 1;
            }
        }
        return switches;
    }

    /**
     * parseInt(s, base)
     *
     * This is a wrapper around the built-in parseInt() function.  Our wrapper recognizes certain prefixes
     * ('$' or "0x" for hex, '#' or "0o" for octal) and suffixes ('.' for decimal, 'h' for hex, 'y' for
     * binary), and then calls isInt() to ensure we don't convert strings that contain partial values;
     * see isInt() for details.
     *
     * The use of multiple prefix/suffix combinations is undefined (although for the record, we process
     * prefixes first).  We do NOT support the "0b" prefix to indicate binary UNLESS one or more commas are
     * also present (because "0b" is also a valid hex sequence), and we do NOT support a single leading zero
     * to indicate octal (because such a number could also be decimal or hex).  Any number of commas are
     * allowed; we remove them all before calling the built-in parseInt().
     *
     * More recently, we've added support for "^D", "^O", and "^B" prefixes to accommodate the base overrides
     * that the PDP-10's MACRO-10 assembly language supports (decimal, octal, and binary, respectively).
     * If this support turns out to adversely affect other debuggers, then it will have to be "conditionalized".
     * Similarly, we've added support for "K", "M", and "G" MACRO-10-style suffixes that add 3, 6, or 9 zeros
     * to the value to be parsed, respectively.
     *
     * @this {NumIO}
     * @param {string} s is the string representation of some number
     * @param {number} [base] is the radix to use (default is 10); can be overridden by prefixes/suffixes
     * @return {number|undefined} corresponding value, or undefined if invalid
     */
    parseInt(s, base)
    {
        let value;

        if (s) {
            if (!base) base = 10;

            let ch, chPrefix, chSuffix;
            let fCommas = (s.indexOf(',') > 0);
            if (fCommas) s = s.replace(/,/g, '');

            ch = chPrefix = s.charAt(0);
            if (chPrefix == '#') {
                base = 8;
                chPrefix = '';
            }
            else if (chPrefix == '$') {
                base = 16;
                chPrefix = '';
            }
            if (ch != chPrefix) {
                s = s.substr(1);
            }
            else {
                ch = chPrefix = s.substr(0, 2);
                if (chPrefix == '0b' && fCommas || chPrefix == '^B') {
                    base = 2;
                    chPrefix = '';
                }
                else if (chPrefix == '0o' || chPrefix == '^O') {
                    base = 8;
                    chPrefix = '';
                }
                else if (chPrefix == '^D') {
                    base = 10;
                    chPrefix = '';
                }
                else if (chPrefix == '0x') {
                    base = 16;
                    chPrefix = '';
                }
                if (ch != chPrefix) s = s.substr(2);
            }
            ch = chSuffix = s.slice(-1);
            if (chSuffix == 'Y' || chSuffix == 'y') {
                base = 2;
                chSuffix = '';
            }
            else if (chSuffix == '.') {
                base = 10;
                chSuffix = '';
            }
            else if (chSuffix == 'H' || chSuffix == 'h') {
                base = 16;
                chSuffix = '';
            }
            else if (chSuffix == 'K') {
                chSuffix = '000';
            }
            else if (chSuffix == 'M') {
                chSuffix = '000000';
            }
            else if (chSuffix == 'G') {
                chSuffix = '000000000';
            }
            if (ch != chSuffix) s = s.slice(0, -1) + chSuffix;
            /*
             * This adds support for the MACRO-10 binary shifting (Bn) suffix, which must be stripped from the
             * number before parsing, and then applied to the value after parsing.  If n is omitted, 35 is assumed,
             * which is a net shift of zero.  If n < 35, then a left shift of (35 - n) is required; if n > 35, then
             * a right shift of -(35 - n) is required.
             */
            let v, shift = 0;
            if (base <= 10) {
                let match = s.match(/(-?[0-9]+)B([0-9]*)/);
                if (match) {
                    s = match[1];
                    shift = 35 - ((match[2] || 35) & 0xff);
                }
            }
            if (this.isInt(s, base) && !isNaN(v = parseInt(s, base))) {
                /*
                 * With the need to support larger (eg, 36-bit) integers, truncating to 32 bits is no longer helpful.
                 *
                 *      value = v|0;
                 */
                if (shift) {
                    /*
                     * Since binary shifting is a logical operation, and since shifting by division only works properly
                     * with positive numbers, we must convert a negative value to a positive value, by computing the two's
                     * complement.
                     */
                    if (v < 0) v += Math.pow(2, 36);
                    if (shift > 0) {
                        v *= Math.pow(2, shift);
                    } else {
                        v = Math.trunc(v / Math.pow(2, -shift));
                    }
                }
                value = v;
            }
        }
        return value;
    }

    /**
     * toBase(n, base, bits, prefix, nGrouping)
     *
     * Converts the given number (as an unsigned integer) to a string using the specified base (radix).
     *
     * sprintf() may be a better choice, depending on your needs (eg, signed integers, formatting options, etc.)
     * and support for the desired radix (eg, 8, 10, and 16).
     *
     * @this {NumIO}
     * @param {number|*} n
     * @param {number} [base] (ie, the radix; 0 or undefined for default)
     * @param {number} [bits] (the number of bits in the value, 0 for variable)
     * @param {string} [prefix] (prefix is based on radix; use "" for none)
     * @param {number} [nGrouping]
     * @return {string}
     */
    toBase(n, base, bits = 0, prefix = undefined, nGrouping = 0)
    {
        /*
         * We can't rely entirely on isNaN(), because isNaN(null) returns false, and we can't rely
         * entirely on typeof either, because typeof NaN returns "number".  Sigh.
         *
         * Alternatively, we could mask and shift n regardless of whether it's null/undefined/NaN,
         * since JavaScript coerces such operands to zero, but I think there's "value" in seeing those
         * values displayed differently.
         */
        let s = "", suffix = "", cch = -1;
        if (!base) base = this.nDefaultBase || 10;
        if (bits) cch = Math.ceil(bits / Math.log2(base));
        if (prefix == undefined) {
            switch(base) {
            case 8:
                prefix = "0o";
                break;
            case 16:
                prefix = "0x";
                break;
            case 10:
                suffix = ".";
                /* falls through */
            default:
                prefix = "";
                break;
            }
        }
        if (isNaN(n) || typeof n != "number") {
            n = undefined;
            prefix = suffix = "";
        } else {
            /*
             * Callers that produced an input by dividing by a power of two rather than shifting (in order
             * to access more than 32 bits) may produce a fractional result, which ordinarily we would simply
             * ignore, but if the integer portion is zero and the sign is negative, we should probably treat
             * this value as a sign-extension.
             */
            if (n < 0 && n > -1) n = -1;
            /*
             * Negative values should be twos-complemented to produce a positive value for conversion purposes,
             * but we can only do that if/when we're given the number of bits; Math.pow(base, cch) is equivalent
             * to Math.pow(2, bits), but less precise for bases that aren't a power of two (eg, base 10).
             */
            if (bits) {
                if (n < 0) {
                    n += Math.pow(2, bits);
                }
                if (n >= Math.pow(2, bits)) {
                    cch = Math.ceil(Math.log(n) / Math.log(base));
                }
            }
        }
        let g = nGrouping || -1;
        while (cch--) {
            if (!g) {
                s = ',' + s;
                g = nGrouping;
            }
            if (n == undefined) {
                s = '?' + s;
                if (cch < 0) break;
            } else {
                let d = n % base;
                n = Math.trunc(n / base);
                d += (d >= 0 && d <= 9? 0x30 : 0x41 - 10);
                s = String.fromCharCode(d) + s;
                if (!n && cch < 0) break;
            }
            g--;
        }
        return prefix + s + suffix;
    }

    /**
     * clearBits(num, bits)
     *
     * Function for clearing bits in numbers with more than 32 bits.
     *
     * @this {NumIO}
     * @param {number} num
     * @param {number} bits
     * @return {number} (num & ~bits)
     */
    clearBits(num, bits)
    {
        let shift = NumIO.TWO_POW32;
        let numHi = (num / shift)|0;
        let bitsHi = (bits / shift)|0;
        return (num & ~bits) + (numHi & ~bitsHi) * shift;
    }

    /**
     * setBits(num, bits)
     *
     * Function for setting bits in numbers with more than 32 bits.
     *
     * @this {NumIO}
     * @param {number} num
     * @param {number} bits
     * @return {number} (num | bits)
     */
    setBits(num, bits)
    {
        let shift = NumIO.TWO_POW32;
        let numHi = (num / shift)|0;
        let bitsHi = (bits / shift)|0;
        return (num | bits) + (numHi | bitsHi) * shift;
    }

    /**
     * testBits(num, bits)
     *
     * Function for testing bits in numbers with more than 32 bits.
     *
     * @this {NumIO}
     * @param {number} num
     * @param {number} bits
     * @return {boolean} (true IFF num & bits == bits)
     */
    testBits(num, bits)
    {
        let shift = NumIO.TWO_POW32;
        let numHi = (num / shift)|0;
        let bitsHi = (bits / shift)|0;
        return ((num & bits) == (bits|0) && (numHi & bitsHi) == bitsHi);
    }

    /**
     * compress(aSrc)
     *
     * Compresses an array of numbers.
     *
     * @this {NumIO}
     * @param {Array|Uint8Array} aSrc
     * @return {Array|Uint8Array} is either the original array (aSrc), or a smaller array of "count, value" pairs (aComp)
     */
    compress(aSrc)
    {
        let iSrc = 0;
        let iComp = 0;
        let aComp = [];
        while (iSrc < aSrc.length) {
            let n = aSrc[iSrc];

            let iCompare = iSrc + 1;
            while (iCompare < aSrc.length && aSrc[iCompare] === n) iCompare++;
            aComp[iComp++] = iCompare - iSrc;
            aComp[iComp++] = n;
            iSrc = iCompare;
        }
        if (aComp.length >= aSrc.length) return aSrc;
        return aComp;
    }

    /**
     * decompress(aComp, length)
     *
     * Decompresses an array of numbers.
     *
     * @this {NumIO}
     * @param {Array} aComp
     * @param {number} [length] (expected length of decompressed data)
     * @return {Array}
     */
    decompress(aComp, length = 0)
    {
        if (aComp.length == length) return aComp;
        let iDst = 0;
        let aDst = length? new Array(length) : [];
        let iComp = 0;
        while (iComp < aComp.length - 1) {
            let c = aComp[iComp++];
            let n = aComp[iComp++];
            while (c--) aDst[iDst++] = n;
        }

        return aDst;
    }
}

/*
 * Assorted constants
 */
NumIO.TWO_POW32 = Math.pow(2, 32);

Defs.CLASSES["NumIO"] = NumIO;

/**
 * @copyright https://www.pcjs.org/modules/devices/lib/stdio.js (C) Jeff Parsons 2012-2019
 */

/**
 * @class {StdIO}
 * @unrestricted
 */
class StdIO extends NumIO {
    /**
     * StdIO()
     *
     * Summary of functions:
     *
     *      flush()
     *      isDate()
     *      parseDate()
     *      print()
     *      printf()
     *      println()
     *      sprintf()
     *      toHex()
     *
     * This class is called "StdIO" rather than "stdio" because classes are global entities and I prefer global
     * entities to begin with a capital letter and use camelCase.  And its methods are primarily object functions
     * rather than class functions, because the parent objects are typically Device objects which may wish to have
     * unique "print" bindings.  Mingling every object's print output in the same container may not be desired.
     *
     * The filename "stdio.js" is inspired by the C runtime library file "stdio.h", since it includes printf()
     * and sprintf() functions that have many C-like features, but they also have many differences (both additions
     * and omissions).  And you will find other functions here that have no counterpart in "stdio.h", so don't take
     * the name too seriously.
     *
     * @this {StdIO}
     */
    constructor()
    {
        super();
    }

    /**
     * flush()
     *
     * @this {StdIO}
     */
    flush()
    {
        let buffer = StdIO.PrintBuffer;
        StdIO.PrintBuffer = "";
        this.print(buffer);
    }

    /**
     * isDate(date)
     *
     * @this {StdIO}
     * @param {Date} date
     * @return {boolean}
     */
    isDate(date)
    {
        return !isNaN(date.getTime());
    }

    /**
     * parseDate(date)
     * parseDate(date, time)
     * parseDate(year, month, day, hour, minute, second)
     *
     * Produces a UTC date when ONLY a date (no time) is provided; otherwise, it combines the date and
     * and time, producing a date that is either UTC or local, depending on the presence (or lack) of time
     * zone information.  Finally, if numeric inputs are provided, then Date.UTC() is called to generate
     * a UTC time.
     *
     * In general, you should use this instead of new Date(), because the Date constructor implicitly calls
     * Date.parse(s), which behaves inconsistently.  For example, ISO date-only strings (e.g. "1970-01-01")
     * generate a UTC time, but non-ISO date-only strings (eg, "10/1/1945" or "October 1, 1945") generate a
     * local time.
     *
     * @this {StdIO}
     * @param {...} args
     * @return {Date} (UTC unless a time string with a non-GMT timezone is explicitly provided)
     */
    parseDate(...args)
    {
        let date;
        if (args[0] === undefined) {
            date = new Date(Date.now());
        }
        else if (typeof args[0] === "string") {
            date = new Date(args[0] + ' ' + (args[1] || "00:00:00 GMT"));
        }
        else if (args[1] === undefined) {
            date = new Date(args[0]);
        } else {
            date = new Date(Date.UTC(...args));
        }
        return date;
    }

    /**
     * print(s, fBuffer)
     *
     * @this {StdIO}
     * @param {string} s
     * @param {boolean} [fBuffer] (true to always buffer; otherwise, only buffer the last partial line)
     * @return {number}
     */
    print(s, fBuffer)
    {
        if (!fBuffer) {
            let i = s.lastIndexOf('\n');
            if (i >= 0) {
                console.log(StdIO.PrintBuffer + s.substr(0, i));
                StdIO.PrintBuffer = "";
                s = s.substr(i + 1);
            }
        }
        StdIO.PrintBuffer += s;
        return s.length;
    }

    /**
     * println(s, fBuffer)
     *
     * @this {StdIO}
     * @param {string} s
     * @param {boolean} [fBuffer] (true to always buffer; otherwise, only buffer the last partial line)
     * @return {number}
     */
    println(s, fBuffer)
    {
        return this.print(s + '\n', fBuffer);
    }

    /**
     * printf(format, ...args)
     *
     * @this {StdIO}
     * @param {string} format
     * @param {...} [args]
     * @return {number}
     */
    printf(format, ...args)
    {
        return this.print(this.sprintf(format, ...args));
    }

    /**
     * sprintf(format, ...args)
     *
     * Copied from the CCjs project (https://github.com/jeffpar/ccjs/blob/master/lib/stdio.js) and extended.
     *
     * Far from complete, let alone sprintf-compatible, but it's adequate for the handful of sprintf-style format
     * specifiers that I use.
     *
     * @this {StdIO}
     * @param {string} format
     * @param {...} [args]
     * @return {string}
     */
    sprintf(format, ...args)
    {
        let buffer = "";
        let aParts = format.split(/%([-+ 0#]*)([0-9]*|\*|~)(\.[0-9]+|)([hlL]?)([A-Za-z%])/);

        let iArg = 0, iPart;
        for (iPart = 0; iPart < aParts.length - 6; iPart += 6) {

            buffer += aParts[iPart];
            let arg, type = aParts[iPart+5];

            /*
             * Check for unrecognized types immediately, so we don't inadvertently pop any arguments;
             * the first 12 ("ACDFHIMNSTWY") are for our non-standard Date extensions (see below).
             *
             * For reference purposes, the standard ANSI C set of format types is: "dioxXucsfeEgGpn%".
             */
            let iType = "ACDFHIMNSTWYbdfjcsoXx%".indexOf(type);
            if (iType < 0) {
                buffer += '%' + aParts[iPart+1] + aParts[iPart+2] + aParts[iPart+3] + aParts[iPart+4] + type;
                continue;
            }

            if (iArg < args.length) {
                arg = args[iArg];
                if (type != '%') iArg++;
            } else {
                arg = args[args.length-1];
            }
            let flags = aParts[iPart+1];
            let hash = flags.indexOf('#') >= 0;
            let zeroPad = flags.indexOf('0') >= 0;
            let width = aParts[iPart+2];
            if (width == '*' || width == '~') {
                /*
                 * The '~' width character is my own innovation that interprets the width value as a number of bits,
                 * which must then be converted to a number of characters; currently that calculation is only correct
                 * for hexadecimal output.  TODO: Add base-independent bits-to-characters conversion logic.
                 */
                width = (width == '~'? ((arg >> 2) + (hash && (type == 'x' || type == 'X')? 2 : 0)) : arg);
                if (iArg < args.length) {
                    arg = args[iArg++];
                } else {
                    arg = args[args.length-1];
                }
            } else {
                width = +width || 0;
            }
            let precision = aParts[iPart+3];
            precision = precision? +precision.substr(1) : -1;
            // let length = aParts[iPart+4];       // eg, 'h', 'l' or 'L' (all currently ignored)
            let ach = null, s, radix = 0, prefix = ""

            /*
             * The following non-standard sprintf() format codes provide handy alternatives to the
             * PHP date() format codes that we used to use with the old datelib.formatDate() function:
             *
             *      a:  lowercase ante meridiem and post meridiem (am or pm)                %A
             *      d:  day of the month, 2 digits with leading zeros (01, 02, ..., 31)     %02D
             *      D:  3-letter day of the week ("Sun", "Mon", ..., "Sat")                 %.3W
             *      F:  month ("January", "February", ..., "December")                      %F
             *      g:  hour in 12-hour format, without leading zeros (1, 2, ..., 12)       %I
             *      h:  hour in 24-hour format, without leading zeros (0, 1, ..., 23)       %H
             *      H:  hour in 24-hour format, with leading zeros (00, 01, ..., 23)        %02H
             *      i:  minutes, with leading zeros (00, 01, ..., 59)                       %02N
             *      j:  day of the month, without leading zeros (1, 2, ..., 31)             %D
             *      l:  day of the week ("Sunday", "Monday", ..., "Saturday")               %W
             *      m:  month, with leading zeros (01, 02, ..., 12)                         %02M
             *      M:  3-letter month ("Jan", "Feb", ..., "Dec")                           %.3F
             *      n:  month, without leading zeros (1, 2, ..., 12)                        %M
             *      s:  seconds, with leading zeros (00, 01, ..., 59)                       %02S
             *      y:  2-digit year (eg, 14)                                               %0.2Y
             *      Y:  4-digit year (eg, 2014)                                             %Y
             *
             * We also support a few custom format codes:
             *
             *      %C:  calendar output (equivalent to: %W, %F %D, %Y)
             *      %T:  timestamp output (equivalent to: %Y-%02M-%02D %02H:%02N:%02S)
             *
             * Use the optional '#' flag with any of the above '%' format codes to produce UTC results
             * (eg, '%#I' instead of '%I').
             *
             * The %A, %F, and %W types act as strings (which support the '-' left justification flag, as well as
             * the width and precision options), and the rest act as integers (which support the '0' padding flag
             * and the width option).  Also, while %Y does act as an integer, it also supports truncation using the
             * precision option (normally, integers do not); this enables a variable number of digits for the year.
             *
             * So old code like this:
             *
             *      printf("%s\n", formatDate("l, F j, Y", date));
             *
             * can now be written like this:
             *
             *      printf("%W, %F %D, %Y\n", date, date, date, date);
             *
             * or even more succinctly, as:
             *
             *      printf("%C\n", date);
             *
             * In fact, even the previous example can be written more succinctly as:
             *
             *      printf("%W, %F %D, %Y\n", date);
             *
             * because unlike the C runtime, we reuse the final parameter once the format string has exhausted all parameters.
             */
            let ch, date = /** @type {Date} */ (iType < 12 && typeof arg != "object"? this.parseDate(arg) : arg), dateUndefined;

            switch(type) {
            case 'C':
                ch = hash? '#' : '';
                buffer += (this.isDate(date)? this.sprintf(this.sprintf("%%%sW, %%%sF %%%sD, %%%sY", ch), date) : dateUndefined);
                continue;

            case 'D':
                arg = hash? date.getUTCDate() : date.getDate();
                type = 'd';
                break;

            case 'A':
            case 'H':
            case 'I':
                arg = hash? date.getUTCHours() : date.getHours();
                if (type == 'A') {
                    arg = (arg < 12 ? "am" : "pm");
                    type = 's';
                }
                else {
                    if (type == 'I') {
                        arg = (!arg? 12 : (arg > 12 ? arg - 12 : arg));
                    }
                    type = 'd';
                }
                break;

            case 'F':
            case 'M':
                arg = hash? date.getUTCMonth() : date.getMonth();
                if (type == 'F') {
                    arg = StdIO.NamesOfMonths[arg];
                    type = 's';
                } else {
                    arg++;
                    type = 'd';
                }
                break;

            case 'N':
                arg = hash? date.getUTCMinutes() : date.getMinutes();
                type = 'd';
                break;

            case 'S':
                arg = hash? date.getUTCSeconds() : date.getSeconds();
                type = 'd'
                break;

            case 'T':
                ch = hash? '#' : '';
                buffer += (this.isDate(date)? this.sprintf(this.sprintf("%%%sY-%%%s02M-%%%s02D %%%s02H:%%%s02N:%%%s02S", ch), date) : dateUndefined);
                continue;

            case 'W':
                arg = StdIO.NamesOfDays[hash? date.getUTCDay() : date.getDay()];
                type = 's';
                break;

            case 'Y':
                arg = hash? date.getUTCFullYear() : date.getFullYear();
                if (precision > 0) {
                    arg = arg % (Math.pow(10, precision));
                    precision = -1;
                }
                type = 'd';
                break;
            }

            switch(type) {
            case 'b':
                /*
                 * "%b" for boolean-like values is a non-standard format specifier that seems handy.
                 */
                buffer += (arg? "true" : "false");
                break;

            case 'd':
                /*
                 * We could use "arg |= 0", but there may be some value to supporting integers > 32 bits.
                 *
                 * Also, unlike the 'X' and 'x' hexadecimal cases, there's no need to explicitly check for string
                 * arguments, because Math.trunc() automatically coerces any string value to a (decimal) number.
                 */
                arg = Math.trunc(arg);
                /* falls through */

            case 'f':
                arg = +arg;
                s = arg + "";
                if (precision >= 0) {
                    s = arg.toFixed(precision);
                }
                if (s.length < width) {
                    if (zeroPad) {
                        if (arg < 0) {
                            width--;
                            s = s.substr(1);
                        }
                        s = ("0000000000" + s).slice(-width);
                        if (arg < 0) s = '-' + s;
                    } else {
                        s = ("          " + s).slice(-width);
                    }
                }
                buffer += s;
                break;

            case 'j':
                /*
                 * 'j' is one of our non-standard extensions to the sprintf() interface; it signals that
                 * the caller is providing an Object that should be rendered as JSON.  If a width is included
                 * (eg, "%2j"), it's used as an indentation value; otherwise, no whitespace is added.
                 */
                buffer += JSON.stringify(arg, null, width || undefined);
                break;

            case 'c':
                arg = typeof arg == "string"? arg[0] : String.fromCharCode(arg);
                /* falls through */

            case 's':
                /*
                 * 's' includes some non-standard behavior, such as coercing non-strings to strings first.
                 */
                if (arg !== undefined) {
                    if (typeof arg != "string") {
                        arg = arg.toString();
                    }
                    if (precision >= 0) {
                        arg = arg.substr(0, precision);
                    }
                    while (arg.length < width) {
                        if (flags.indexOf('-') >= 0) {
                            arg += ' ';
                        } else {
                            arg = ' ' + arg;
                        }
                    }
                }
                buffer += arg;
                break;

            case 'o':
                radix = 8;
                if (hash) prefix = "0";
                /* falls through */

            case 'X':
                ach = StdIO.HexUpperCase;
                // if (hash) prefix = "0X";     // I don't like that %#X uppercases both the prefix and the value
                /* falls through */

            case 'x':
                s = "";
                if (!radix) radix = 16;
                if (!prefix && hash) prefix = "0x";
                if (!ach) ach = StdIO.HexLowerCase;
                if (typeof arg == "string") {
                    /*
                     * Since we're advised to ALWAYS pass a radix to parseInt(), we must detect explicitly
                     * hex values ourselves, because using a radix of 10 with any "0x..." value always returns 0.
                     *
                     * And if the value CAN be interpreted as decimal, then we MUST interpret it as decimal, because
                     * we have sprintf() calls in /modules/pcx86/lib/testmon.js that depend on this code to perform
                     * decimal to hex conversion.  We're going to make our own rules here, since passing numbers in
                     * string form isn't part of the sprintf "spec".
                     */
                    arg = Number.parseInt(arg, arg.match(/(^0x|[a-f])/i)? 16 : 10);
                }
                if (zeroPad && !width) {
                    /*
                     * When zero padding is specified without a width (eg, "%0x"), we select a width based on the value.
                     */
                    let v = Math.abs(arg);
                    if (v <= 0xff) {
                        width = 2;
                    } else if (v <= 0xffff) {
                        width = 4;
                    } else if (v <= 0xffffffff) {
                        width = 8;
                    } else {
                        width = 9;
                    }
                    width += prefix.length;
                }
                width -= prefix.length;
                do {
                    let d = arg & (radix - 1);
                    arg >>>= (radix == 16? 4 : 3);
                    if (zeroPad || !s || d || arg) {
                        s = ach[d] + s;
                    } else {
                        if (prefix) {
                            s = prefix + s;
                            prefix = "";
                        }
                        if (width > 0) s = ' ' + s;
                    }
                } while (--width > 0 || arg);
                buffer += prefix + s;
                break;

            case '%':
                buffer += '%';
                break;

            default:
                buffer += "(unimplemented printf type %" + type + ")";
                break;
            }
        }

        buffer += aParts[iPart];
        return buffer;
    }

    /**
     * toHex(n)
     *
     * This is a helper function mainly intended for use in a debugging console, allowing you to display numbers
     * as hex by evaluating the expression "this.toHex(n)".
     *
     * In a C runtime, you might use "itoa(n, buffer, 16)", which would be in "stdlib" instead of "stdio", and
     * it would not display a "0x" prefix; however, since we're relying on sprintf() to perform all our number
     * to string conversions, and sprintf() is a "stdio" function, we're keeping all these related functions here.
     *
     * @this {StdIO}
     * @param {number} n
     */
    toHex(n)
    {
        return this.sprintf("%#x", n);
    }
}

/*
 * Global variables
 */
StdIO.PrintBuffer = "";

/*
 * Global constants
 */
StdIO.HexLowerCase = "0123456789abcdef";
StdIO.HexUpperCase = "0123456789ABCDEF";
StdIO.NamesOfDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
StdIO.NamesOfMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

Defs.CLASSES["StdIO"] = StdIO;

/**
 * @copyright https://www.pcjs.org/modules/devices/lib/webio.js (C) Jeff Parsons 2012-2019
 */

/*
 * List of standard message groups.  The messages properties defines the set of active message
 * groups, and their names are defined by MESSAGE_NAMES.  See the Device class for more message
 * group definitions.
 *
 * NOTE: To support more than 32 message groups, be sure to use "+", not "|", when concatenating.
 */
var MESSAGE = {
    ALL:        0xffffffffffff,
    NONE:       0x000000000000,
    DEFAULT:    0x000000000000,
    BUFFER:     0x800000000000,
};

/** @typedef {{ class: (string|undefined), bindings: (Object|undefined), version: (number|undefined), overrides: (Array.<string>|undefined) }} */
var Config;

/**
 * @class {WebIO}
 * @unrestricted
 * @property {Object} bindings
 * @property {number} messages
 * @property {WebIO} machine
 */
class WebIO extends StdIO {
    /**
     * WebIO(isMachine)
     *
     * @this {WebIO}
     * @param {boolean} isMachine
     */
    constructor(isMachine)
    {
        super();
        this.bindings = {};
        this.messages = 0;
        /*
         * If this is the machine device, initialize a set of per-machine variables; if it's not,
         * the Device constructor will update this.machine with the actual machine device (see addDevice()).
         */
        this.machine = this;
        if (isMachine) {
            this.machine.messages = 0;
            this.machine.aCommands = [];
            this.machine.iCommand = 0;
            this.machine.handlers = {};
            this.machine.isFullScreen = false;
        }
    }

    /**
     * addBinding(binding, element)
     *
     * @this {WebIO}
     * @param {string} binding
     * @param {Element} element
     */
    addBinding(binding, element)
    {
        let webIO = this;

        switch (binding) {

        case WebIO.BINDING.CLEAR:
            element.onclick = function onClickClear() {
                webIO.clear();
            };
            break;

        case WebIO.BINDING.PRINT:
            /*
             * This was added for Firefox (Safari will clear the <textarea> on a page reload, but Firefox does not).
             */
            this.disableAuto(element);
            /*
             * An onKeyDown handler has been added to this element to intercept special (non-printable) keys, such as
             * the UP and DOWN arrow keys, which are used to implement a simple command history/recall feature.
             */
            element.addEventListener(
                'keydown',
                function onKeyDown(event) {
                    webIO.onCommandEvent(event, true);
                }
            );
            /*
             * One purpose of the onKeyPress handler for this element is to stop event propagation, so that if the
             * element has been explicitly given focus, any key presses won't be picked up by the Input device (which,
             * as that device's constructor explains, is monitoring key presses for the entire document).
             *
             * The other purpose is to support the entry of commands and pass them on to parseCommands().
             */
            element.addEventListener(
                'keypress',
                function onKeyPress(event) {
                    webIO.onCommandEvent(event);
                }
            );
            break;
        }
    }

    /**
     * addBindings(bindings)
     *
     * Builds the set of ACTUAL bindings (this.bindings) from the set of DESIRED bindings (this.config['bindings']),
     * using either a "bindings" object map OR an array of "direct bindings".
     *
     * @this {WebIO}
     * @param {Object} [bindings]
     */
    addBindings(bindings = {})
    {
        let fDirectBindings = Array.isArray(bindings);
        /*
         * To relieve every device from having to explicitly declare its own container, we set up a default.
         */
        if (!bindings['container']) {
            bindings['container'] = this.idDevice;
        }
        for (let binding in bindings) {
            let id = bindings[binding];
            if (fDirectBindings) {
                binding = id;
            } else {
                /*
                 * This new bit of code allows us to define a binding like this:
                 *
                 *      "label": "0"
                 *
                 * and we will automatically look for "label0", "label1", etc, and build an array for binding "label".
                 */
                if (id.match(/^[0-9]+$/)) {
                    let i = +id;
                    this.bindings[binding] = [];
                    do {
                        id = binding + i++;
                        let element = document.getElementById(id);
                        if (!element) break;
                        this.bindings[binding].push(element);
                    } while (true);
                    continue;
                }
            }
            let element = document.getElementById(id);
            if (element) {
                this.bindings[binding] = element;
                this.addBinding(binding, element);
                continue;
            }
            if (MAXDEBUG && !fDirectBindings && id != this.idDevice) {
                this.printf("unable to find element '%s' for device '%s'\n", id, this.idDevice);
            }
        }
    }

    /**
     * addBindingOptions(element, options, fReset, sDefault)
     *
     * @this {WebIO}
     * @param {Element|HTMLSelectElement} element
     * @param {Object} options (eg, key/value pairs for a series of "option" elements)
     * @param {boolean} [fReset]
     * @param {string} [sDefault]
     */
    addBindingOptions(element, options, fReset, sDefault)
    {
        if (fReset) {
            element.options.length = 0;
        }
        if (options) {
            for (let prop in options) {
                let option = document.createElement("option");
                option.text = prop;
                option.value = (typeof options[prop] == "string"? options[prop] : prop);
                element.appendChild(option);
                if (option.value == sDefault) element.selectedIndex = element.options.length - 1;
            }
        }
    }

    /**
     * addHandler(type, func)
     *
     * @this {WebIO}
     * @param {string} type
     * @param {function(Array.<string>)} func
     */
    addHandler(type, func)
    {
        if (!this.machine.handlers[type]) this.machine.handlers[type] = [];
        this.machine.handlers[type].push(func);
    }

    /**
     * alert(s, type)
     *
     * @this {WebIO}
     * @param {string} s
     * @param {string} [type]
     */
    alert(s, type)
    {
        if (type && WebIO.Alerts.list.indexOf(type) < 0) {
            alert(s);
            WebIO.Alerts.list.push(type);
        }
        this.println(s);
    }

    /**
     * assert(f, format, args)
     *
     * Verifies conditions that must be true (for DEBUG builds only).
     *
     * The Closure Compiler should automatically remove all references to assert() in non-DEBUG builds.
     *
     * TODO: Add a task to the build process that "asserts" there are no instances of "assertion failure" in RELEASE builds.
     *
     * @this {WebIO}
     * @param {*} f is the expression asserted to be true
     * @param {string} [format] is an optional description of the assertion failure
     * @param {...} [args]
     */
    assert(f, format, ...args)
    {
        if (DEBUG) {
            if (!f) {
                throw new Error(format? this.sprintf(format, ...args) : "assertion failure");
            }
        }
    }

    /**
     * clear()
     *
     * @this {WebIO}
     */
    clear()
    {
        let element = this.findBinding(WebIO.BINDING.PRINT, true);
        if (element) element.value = "";
    }

    /**
     * disableAuto(element)
     *
     * @this {WebIO}
     * @param {Element} element
     */
    disableAuto(element)
    {
        element.value = "";
        element.setAttribute("autocapitalize", "off");
        element.setAttribute("autocomplete", "off");
        element.setAttribute("autocorrect", "off");
        element.setAttribute("spellcheck", "false");
    }

    /**
     * findBinding(name, all)
     *
     * @this {WebIO}
     * @param {string} [name]
     * @param {boolean} [all]
     * @return {Element|null|undefined}
     */
    findBinding(name, all)
    {
        return this.bindings[name];
    }

    /**
     * findHandlers(type)
     *
     * @this {WebIO}
     * @param {string} type
     * @return {Array.<function(Array.<string>)>|undefined}
     */
    findHandlers(type)
    {
        return this.machine.handlers[type];
    }

    /**
     * findProperty(obj, sProp, sSuffix)
     *
     * If both sProp and sSuffix are set, then any browser-specific prefixes are inserted between sProp and sSuffix,
     * and if a match is found, it is returned without sProp.
     *
     * For example, if findProperty(document, 'on', 'fullscreenchange') discovers that 'onwebkitfullscreenchange' exists,
     * it will return 'webkitfullscreenchange', in preparation for an addEventListener() call.
     *
     * More commonly, sSuffix is not used, so whatever property is found is returned as-is.
     *
     * @this {WebIO}
     * @param {Object|null|undefined} obj
     * @param {string} sProp
     * @param {string} [sSuffix]
     * @return {string|null}
     */
    findProperty(obj, sProp, sSuffix)
    {
        if (obj) {
            do {
                for (let i = 0; i < WebIO.BrowserPrefixes.length; i++) {
                    let sName = WebIO.BrowserPrefixes[i];
                    if (sSuffix) {
                        sName += sSuffix;
                        let sEvent = sProp + sName;
                        if (sEvent in obj) return sName;
                    } else {
                        if (!sName) {
                            sName = sProp[0];
                        } else {
                            sName += sProp[0].toUpperCase();
                        }
                        sName += sProp.substr(1);
                        if (sName in obj) return sName;
                    }
                }
                if (sProp.indexOf("screen") < 0) break;
                sProp = sProp.replace("screen", "Screen");
            } while (true);
        }
        return null;
    }

    /**
     * getBindingID(name)
     *
     * Since this.bindings contains the actual elements, not their original IDs, we must delve back into
     * the original this.config['bindings'] to determine the original ID.
     *
     * @this {WebIO}
     * @param {string} name
     * @return {string|undefined}
     */
    getBindingID(name)
    {
        return this.config['bindings'] && this.config['bindings'][name];
    }

    /**
     * getBindingText(name)
     *
     * @this {WebIO}
     * @param {string} name
     * @return {string|undefined}
     */
    getBindingText(name)
    {
        let text;
        let element = this.bindings[name];
        if (element) text = element.textContent;
        return text;
    }

    /**
     * getBounded(n, min, max)
     *
     * Restricts n to the bounds defined by min and max.  A side-effect is ensuring that the return
     * value is ALWAYS a number, even if n is not.
     *
     * @this {WebIO}
     * @param {number} n
     * @param {number} min
     * @param {number} max
     * @return {number} (updated n)
     */
    getBounded(n, min, max)
    {

        n = +n || 0;
        if (n < min) n = min;
        if (n > max) n = max;
        return n;
    }

    /**
     * getDefault(idConfig, defaultValue, mappings)
     *
     * @this {WebIO}
     * @param {string} idConfig
     * @param {*} defaultValue
     * @param {Object} [mappings] (used to provide optional user-friendly mappings for values)
     * @return {*}
     */
    getDefault(idConfig, defaultValue, mappings)
    {
        let value = this.config[idConfig];
        if (value === undefined) {
            value = defaultValue;
        } else {
            if (mappings && mappings[value] !== undefined) {
                value = mappings[value];
            }
            let type = typeof defaultValue;
            if (typeof value != type) {

                if (type == "boolean") {
                    value = !!value;
                } else if (typeof defaultValue == "number") {
                    value = +value;
                }
            }
        }
        return value;
    }

    /**
     * getDefaultBoolean(idConfig, defaultValue)
     *
     * @this {WebIO}
     * @param {string} idConfig
     * @param {boolean} defaultValue
     * @return {boolean}
     */
    getDefaultBoolean(idConfig, defaultValue)
    {
        return /** @type {boolean} */ (this.getDefault(idConfig, defaultValue));
    }

    /**
     * getDefaultNumber(idConfig, defaultValue, mappings)
     *
     * @this {WebIO}
     * @param {string} idConfig
     * @param {number} defaultValue
     * @param {Object} [mappings]
     * @return {number}
     */
    getDefaultNumber(idConfig, defaultValue, mappings)
    {
        return /** @type {number} */ (this.getDefault(idConfig, defaultValue, mappings));
    }

    /**
     * getDefaultString(idConfig, defaultValue)
     *
     * @this {WebIO}
     * @param {string} idConfig
     * @param {string} defaultValue
     * @return {string}
     */
    getDefaultString(idConfig, defaultValue)
    {
        return /** @type {string} */ (this.getDefault(idConfig, defaultValue));
    }

    /**
     * getHost()
     *
     * This is like getHostName() but with the port number, if any.
     *
     * @this {WebIO}
     * @return {string}
     */
    getHost()
    {
        return (window? window.location.host : "localhost");
    }

    /**
     * getHostName()
     *
     * @this {WebIO}
     * @return {string}
     */
    getHostName()
    {
        return (window? window.location.hostname : this.getHost());
    }

    /**
     * getHostOrigin()
     *
     * @this {WebIO}
     * @return {string}
     */
    getHostOrigin()
    {
        return (window? window.location.origin : this.getHost());
    }

    /**
     * getHostPath()
     *
     * @this {WebIO}
     * @return {string|null}
     */
    getHostPath()
    {
        return (window? window.location.pathname : null);
    }

    /**
     * getHostProtocol()
     *
     * @this {WebIO}
     * @return {string}
     */
    getHostProtocol()
    {
        return (window? window.location.protocol : "file:");
    }

    /**
     * getHostURL()
     *
     * @this {WebIO}
     * @return {string|null}
     */
    getHostURL()
    {
        return (window? window.location.href : null);
    }

    /**
     * getResource(url, done)
     *
     * Request the specified resource, and once the request is complete, notify done().
     *
     * done() is passed four parameters:
     *
     *      done(url, sResource, readyState, nErrorCode)
     *
     * readyState comes from the request's 'readyState' property, and the operation should not be
     * considered complete until readyState is 4.
     *
     * If nErrorCode is zero, sResource should contain the requested data; otherwise, an error occurred.
     *
     * @this {WebIO}
     * @param {string} url
     * @param {function(string,string,number,number)} done
     */
    getResource(url, done)
    {
        let obj = this;
        let nErrorCode = 0, sResource = null;
        let xmlHTTP = (window.XMLHttpRequest? new window.XMLHttpRequest() : new window.ActiveXObject("Microsoft.XMLHTTP"));
        xmlHTTP.onreadystatechange = function()
        {
            if (xmlHTTP.readyState !== 4) {
                done(url, sResource, xmlHTTP.readyState, nErrorCode);
                return;
            }

            /*
             * The following line was recommended for WebKit, as a work-around to prevent the handler firing multiple
             * times when debugging.  Unfortunately, that's not the only XMLHttpRequest problem that occurs when
             * debugging, so I think the WebKit problem is deeper than that.  When we have multiple XMLHttpRequests
             * pending, any debugging activity means most of them simply get dropped on floor, so what may actually be
             * happening are mis-notifications rather than redundant notifications.
             *
             *      xmlHTTP.onreadystatechange = undefined;
             */
            sResource = xmlHTTP.responseText;

            /*
             * The normal "success" case is an HTTP status code of 200, but when testing with files loaded
             * from the local file system (ie, when using the "file:" protocol), we have to be a bit more "flexible".
             */
            if (xmlHTTP.status == 200 || !xmlHTTP.status && sResource.length && obj.getHostProtocol() == "file:") {
                // if (MAXDEBUG) Web.log("xmlHTTP.onreadystatechange(" + url + "): returned " + sResource.length + " bytes");
            }
            else {
                nErrorCode = xmlHTTP.status || -1;
            }
            done(url, sResource, xmlHTTP.readyState, nErrorCode);
        };

        xmlHTTP.open("GET", url, true);
        xmlHTTP.send();
    }

    /**
     * getURLParms(sParms)
     *
     * @this {WebIO}
     * @param {string} [sParms] containing the parameter portion of a URL (ie, after the '?')
     * @return {Object} containing properties for each parameter found
     */
    getURLParms(sParms)
    {
        let parms = WebIO.URLParms;
        if (!parms) {
            parms = {};
            if (window) {
                if (!sParms) {
                    /*
                     * Note that window.location.href returns the entire URL, whereas window.location.search
                     * returns only parameters, if any (starting with the '?', which we skip over with a substr() call).
                     */
                    sParms = window.location.search.substr(1);
                }
                let match;
                let pl = /\+/g; // RegExp for replacing addition symbol with a space
                let search = /([^&=]+)=?([^&]*)/g;
                let decode = function decodeParameter(s) {
                    return decodeURIComponent(s.replace(pl, " ")).trim();
                };

                while ((match = search.exec(sParms))) {
                    parms[decode(match[1])] = decode(match[2]);
                }
            }
            WebIO.URLParms = parms;
        }
        return parms;
    }

    /**
     * hasLocalStorage
     *
     * If localStorage support exists, is enabled, and works, return true.
     *
     * @this {WebIO}
     * @return {boolean}
     */
    hasLocalStorage()
    {
        if (WebIO.LocalStorage.Available === undefined) {
            let f = false;
            if (window) {
                try {
                    window.localStorage.setItem(WebIO.LocalStorage.Test, WebIO.LocalStorage.Test);
                    f = (window.localStorage.getItem(WebIO.LocalStorage.Test) == WebIO.LocalStorage.Test);
                    window.localStorage.removeItem(WebIO.LocalStorage.Test);
                } catch(err) {
                    this.println(err.message);
                    f = false;
                }
            }
            WebIO.LocalStorage.Available = f;
        }
        return !!WebIO.LocalStorage.Available;
    }

    /**
     * isMessageOn(messages)
     *
     * If messages is MESSAGE.DEFAULT (0), then the device's default message group(s) are used,
     * and if it's MESSAGE.ALL (-1), then the message is always displayed, regardless what's enabled.
     *
     * @this {WebIO}
     * @param {number} [messages] is zero or more MESSAGE flags
     * @return {boolean} true if all specified message enabled, false if not
     */
    isMessageOn(messages = 0)
    {
        if (messages > 1 && (messages % 2)) messages--;
        messages = messages || this.messages;
        if ((messages|1) == -1 || this.testBits(this.machine.messages, messages)) {
            return true;
        }
        return false;
    }

    /**
     * isUserAgent(s)
     *
     * Check the browser's user-agent string for the given substring; "iOS" and "MSIE" are special values you can
     * use that will match any iOS or MSIE browser, respectively (even IE11, in the case of "MSIE").
     *
     * 2013-11-06: In a questionable move, MSFT changed the user-agent reported by IE11 on Windows 8.1, eliminating
     * the "MSIE" string (which MSDN calls a "version token"; see http://msdn.microsoft.com/library/ms537503.aspx);
     * they say "public websites should rely on feature detection, rather than browser detection, in order to design
     * their sites for browsers that don't support the features used by the website." So, in IE11, we get a user-agent
     * that tries to fool apps into thinking the browser is more like WebKit or Gecko:
     *
     *      Mozilla/5.0 (Windows NT 6.3; Trident/7.0; rv:11.0) like Gecko
     *
     * 2019-10-26: Apple has pulled a similar stunt in iPadOS 13, trying to pretend that Safari on iPadOS is
     * indistinguishable from the desktop version.  Except that there are still situations where we need to know the
     * difference (eg, when there's only a soft keyboard as opposed to a dedicated keyboard).  See monitor.js for details.
     *
     * @this {WebIO}
     * @param {string} s is a substring to search for in the user-agent; as noted above, "iOS" and "MSIE" are special values
     * @return {boolean} is true if the string was found, false if not
     */
    isUserAgent(s)
    {
        if (window) {
            let userAgent = window.navigator.userAgent;
            return s == "iOS" && (!!userAgent.match(/(iPod|iPhone|iPad)/) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)) || s == "MSIE" && !!userAgent.match(/(MSIE|Trident)/) || (userAgent.indexOf(s) >= 0);
        }
        return false;
    }

    /**
     * loadLocalStorage()
     *
     * @this {WebIO}
     * @return {Array|null}
     */
    loadLocalStorage()
    {
        let state = null;
        if (this.hasLocalStorage()) {
            let sValue;
            if (window) {
                try {
                    sValue = window.localStorage.getItem(this.idMachine);
                    if (sValue) state = /** @type {Array} */ (JSON.parse(sValue));
                } catch (err) {
                    this.println(err.message);
                }
            }
        }
        return state;
    }

    /**
     * onCommandEvent(event, down)
     *
     * @this {WebIO}
     * @param {Event} event
     * @param {boolean} [down] (true if keydown, false if keyup, undefined if keypress)
     */
    onCommandEvent(event, down)
    {
        event = event || window.event;
        let keyCode = event.which || event.keyCode;
        if (keyCode) {
            let machine = this.machine;
            let element = /** @type {HTMLTextAreaElement} */ (event.target);
            if (down) {
                let consume = false, s;
                let text = element.value;
                let i = text.lastIndexOf('\n');
                /*
                * Checking for BACKSPACE is not as important as the UP and DOWN arrows, but it's helpful to ensure
                * that BACKSPACE only erases characters on the final line; consume it otherwise.
                */
                if (keyCode == WebIO.KEYCODE.BS) {
                    if (element.selectionStart <= i + 1) {
                        consume = true;
                    }
                }
                if (keyCode == WebIO.KEYCODE.UP) {
                    consume = true;
                    if (machine.iCommand > 0) {
                        s = machine.aCommands[--machine.iCommand];
                    }
                }
                else if (keyCode == WebIO.KEYCODE.DOWN) {
                    consume = true;
                    if (machine.iCommand < machine.aCommands.length) {
                        s = machine.aCommands[++machine.iCommand] || "";
                    }
                }
                if (consume) event.preventDefault();
                if (s != undefined) {
                    element.value = text.substr(0, i + 1) + s;
                }
            }
            else {
                let charCode = keyCode;
                let char = String.fromCharCode(charCode);
                /*
                 * Move the caret to the end of any text in the textarea, unless it's already
                 * past the final LF (because it's OK to insert characters on the last line).
                 */
                let text = element.value;
                let i = text.lastIndexOf('\n');
                if (element.selectionStart <= i) {
                    element.setSelectionRange(text.length, text.length);
                }
                /*
                 * Don't let the Input device's document-based keypress handler see any key presses
                 * that came to this element first.
                 */
                event.stopPropagation();
                /*
                 * If '@' is pressed as the first character on the line, then append the last command
                 * that parseCommands() processed, and transform '@' into ENTER.
                 */
                if (char == '@' && machine.iCommand > 0) {
                    if (i + 1 == text.length) {
                        element.value += machine.aCommands[--machine.iCommand];
                        char = '\r';
                    }
                }
                /*
                 * On the ENTER key, call parseCommands() to look for any COMMAND handlers and invoke
                 * them until one of them returns true.
                 *
                 * Note that even though new lines are entered with the ENTER (CR) key, which uses
                 * ASCII character '\r' (aka RETURN aka CR), new lines are stored in the text buffer
                 * as ASCII character '\n' (aka LINEFEED aka LF).
                 */
                if (char == '\r') {
                    /*
                     * At the time we call any command handlers, a LINEFEED will not yet have been
                     * appended to the text, so for consistency, we prevent the default behavior and
                     * add the LINEFEED ourselves.  Unfortunately, one side-effect is that we must
                     * go to some extra effort to ensure the cursor remains in view; hence the stupid
                     * blur() and focus() calls.
                     */
                    event.preventDefault();
                    text = (element.value += '\n');
                    element.blur();
                    element.focus();
                    let i = text.lastIndexOf('\n', text.length - 2);
                    let commands = text.slice(i + 1, -1) || "";
                    let result = this.parseCommands(commands);
                    if (result) this.println(result.replace(/\n$/, ""), false);
                }
            }
        }
    }

    /**
     * onPageEvent(sName, fn)
     *
     * This function creates a chain of callbacks, allowing multiple JavaScript modules to define handlers
     * for the same event, which wouldn't be possible if everyone modified window['onload'], window['onunload'],
     * etc, themselves.
     *
     * NOTE: It's risky to refer to obscure event handlers with "dot" names, because the Closure Compiler may
     * erroneously replace them (eg, window.onpageshow is a good example).
     *
     * @this {WebIO}
     * @param {string} sFunc
     * @param {function()} fn
     */
    onPageEvent(sFunc, fn)
    {
        if (window) {
            let fnPrev = window[sFunc];
            if (typeof fnPrev !== 'function') {
                window[sFunc] = fn;
            } else {
                /*
                 * TODO: Determine whether there's any value in receiving/sending the Event object that the
                 * browser provides when it generates the original event.
                 */
                window[sFunc] = function onWindowEvent() {
                    if (fnPrev) fnPrev();
                    fn();
                };
            }
        }
    }

    /**
     * parseBoolean(token)
     *
     * @this {WebIO}
     * @param {string} token (true if token is "on" or "true", false if "off" or "false", undefined otherwise)
     * @return {boolean|undefined}
     */
    parseBoolean(token)
    {
        return (token == "true" || token == "on"? true : (token == "false" || token == "off"? false : undefined));
    }

    /**
     * parseCommand(command)
     *
     * @this {WebIO}
     * @param {string} [command]
     * @return {string|undefined}
     */
    parseCommand(command)
    {
        let result;
        if (command != undefined) {
            let machine = this.machine;
            try {
                command = command.trim();
                if (command) {
                    if (machine.iCommand < machine.aCommands.length && command == machine.aCommands[machine.iCommand]) {
                        machine.iCommand++;
                    } else {
                        machine.aCommands.push(command);
                        machine.iCommand = machine.aCommands.length;
                    }
                }

                let aTokens = command.split(' ');
                let token = aTokens[0], message, on, list, iToken;
                let afnHandlers = this.findHandlers(WebIO.HANDLER.COMMAND);

                switch(token[0]) {
                case 'm':
                    if (token[1] == '?') {
                        result = "";
                        WebIO.MESSAGE_COMMANDS.forEach((command) => {result += command + '\n';});
                        if (result) result = "message commands:\n" + result;
                        break;
                    }
                    result = ""; iToken = 1; list = undefined;
                    token = aTokens[aTokens.length-1].toLowerCase();
                    on = this.parseBoolean(token);
                    if (on != undefined) {
                        aTokens.pop();
                    }
                    if (aTokens.length <= 1) {
                        if (on != undefined) {
                            list = on;
                            on = undefined;
                        }
                        aTokens[iToken] = "all";
                    }
                    if (aTokens[iToken] == "all") {
                        aTokens = Object.keys(WebIO.MESSAGE_NAMES);
                    }
                    for (let i = iToken; i < aTokens.length; i++) {
                        token = aTokens[i];
                        message = WebIO.MESSAGE_NAMES[token];
                        if (!message) {
                            result += "unrecognized message: " + token + '\n';
                            break;
                        }
                        if (on != undefined) {
                            this.setMessages(message, on);
                        }
                        if (list == undefined || list == this.isMessageOn(message)) {
                            result += this.sprintf("%8s: %b\n", token, this.isMessageOn(message));
                        }
                    }
                    if (this.isMessageOn(MESSAGE.BUFFER)) {
                        result += "all messages will be buffered until buffer is turned off\n";
                    }
                    if (!result) result = "no messages\n";
                    break;

                case '?':
                    result = "";
                    WebIO.COMMANDS.forEach((command) => {result += command + '\n';});
                    if (result) result = "default commands:\n" + result;
                    /* falls through */

                default:
                    aTokens.unshift(command);
                    if (afnHandlers) {
                        for (let i = 0; i < afnHandlers.length; i++) {
                            let s = afnHandlers[i](aTokens);
                            if (s != undefined) {
                                if (!result) {
                                    result = s;
                                } else {
                                    result += s;
                                }
                                break;
                            }
                        }
                    }
                    break;
                }
            }
            catch(err) {
                result = "error: " + err.message + '\n';
            }
        }
        return result;
    }

    /**
     * parseCommands(commands)
     *
     * @this {WebIO}
     * @param {string} [commands]
     * @return {string|undefined}
     */
    parseCommands(commands = "?")
    {
        let result;
        if (commands) {
            result = "";
            let aCommands = commands.split(/(?:\n|;\s*)/);
            for (let i = 0; i < aCommands.length; i++) {
                result += this.parseCommand(aCommands[i]);
            }
        }
        return result;
    }

    /**
     * print(s)
     *
     * This overrides StdIO.print(), in case the device has a PRINT binding that should be used instead,
     * or if all printing should be buffered.
     *
     * @this {WebIO}
     * @param {string} s
     * @param {boolean} [fBuffer] (true to always buffer; otherwise, only buffer the last partial line)
     * @return {number}
     */
    print(s, fBuffer)
    {
        if (fBuffer == undefined) {
            fBuffer = this.isMessageOn(MESSAGE.BUFFER);
        }
        if (!fBuffer) {
            let element = this.findBinding(WebIO.BINDING.PRINT, true);
            if (element) {
                /*
                 * To help avoid situations where the element can get overwhelmed by the same repeated string,
                 * don't add the string if it already appears at the end.
                 */
                if (element.value.substr(-s.length) != s) {
                    element.value += s;
                    /*
                     * Prevent the <textarea> from getting too large; otherwise, printing becomes slower and slower.
                     */
                    if (!DEBUG && element.value.length > 8192) {
                        element.value = element.value.substr(element.value.length - 4096);
                    }
                    element.scrollTop = element.scrollHeight;
                    /*
                     * Safari requires this, to keep the caret at the end; Chrome and Firefox, not so much.  Go figure.
                     *
                     * However, if I do this in Safari on iPadOS WHILE the app is full-screen, Safari cancels full-screen
                     * mode.  Argh.  And if printf() is called during the full-screen mode change, setSelectionRange() may
                     * trigger the iPad's soft keyboard, even if the machine does not require it (eg, Space Invaders).
                     *
                     * So this Safari-specific hack is now performed ONLY on non-iOS devices.
                     */
                    if (!this.isUserAgent("iOS")) {
                        element.setSelectionRange(element.value.length, element.value.length);
                    }
                }
                return s.length;
            }
        }
        return super.print(s, fBuffer);
    }


    /**
     * printf(format, ...args)
     *
     * This overrides StdIO.printf(), to add support for Messages; if format is a number, then it's treated
     * as one or more MESSAGE flags, and the real format string is the first arg.
     *
     * @this {WebIO}
     * @param {string|number} format
     * @param {...} [args]
     * @return {number}
     */
    printf(format, ...args)
    {
        let messages = 0;
        if (typeof format == "number") {
            messages = format;
            format = args.shift();
        }
        if (this.isMessageOn(messages)) {
            return super.printf(format, ...args);
        }
        return 0;
    }

    /**
     * saveLocalStorage(state)
     *
     * @this {WebIO}
     * @param {Array} state
     * @return {boolean} true if successful, false if error
     */
    saveLocalStorage(state)
    {
        if (this.hasLocalStorage()) {
            let sValue = JSON.stringify(state);
            try {
                window.localStorage.setItem(this.idMachine, sValue);
                return true;
            } catch(err) {
                this.println(err.message);
            }
        }
        return false;
    }

    /**
     * setBindingText(name, text)
     *
     * @this {WebIO}
     * @param {string} name
     * @param {string} text
     */
    setBindingText(name, text)
    {
        let element = this.bindings[name];
        if (element) element.textContent = text;
    }

    /**
     * setMessages(messages, on)
     *
     * Use this function to set/clear message groups.  Use isMessageOn() to decide whether to print
     * messages that are part of a group.
     *
     * MESSAGE.BUFFER is special, causing all print calls to be buffered; the print buffer will be dumped
     * as soon as setMessages() clears MESSAGE.BUFFER.
     *
     * @this {WebIO}
     * @param {number} messages
     * @param {boolean} on (true to set, false to clear)
     */
    setMessages(messages, on)
    {
        let flush = false;
        if (on) {
            this.machine.messages = this.setBits(this.machine.messages, messages);
        } else {
            flush = (this.testBits(this.machine.messages, MESSAGE.BUFFER) && this.testBits(messages, MESSAGE.BUFFER));
            this.machine.messages = this.clearBits(this.machine.messages, messages);
        }
        if (flush) this.flush();
    }
}

WebIO.BINDING = {
    CLEAR:      "clear",
    PRINT:      "print"
};

WebIO.COMMANDS = [
    "\u2191 \u2193\t\trecall commands",
    "@\t\trepeat last command",
    "m?\t\tmessage commands"
];

WebIO.MESSAGE_COMMANDS = [
    "m\t\tdisplay all messages",
    "m on\t\tdisplay all active messages",
    "m off\t\tdisplay all inactive messages",
    "m all [on|off]\tturn all messages on or off",
    "m ... [on|off]\tturn selected messages on or off"
];

/*
 * NOTE: The first name is automatically omitted from global "on" and "off" operations.
 */
WebIO.MESSAGE_NAMES = {
    "all":      MESSAGE.ALL,
    "buffer":   MESSAGE.BUFFER
};

WebIO.HANDLER = {
    COMMAND:    "command"
};

/*
 * Codes provided by KeyboardEvent.keyCode on a "keypress" event.
 */
WebIO.CHARCODE = {
    /* 0x0D */ CR:         13
};

/*
 * Codes provided by KeyboardEvent.keyCode on "keydown" and "keyup" events.
 */
WebIO.KEYCODE = {
    /* 0x08 */ BS:          8,          // BACKSPACE        (ASCII.CTRL_H)
    /* 0x09 */ TAB:         9,          // TAB              (ASCII.CTRL_I)
    /* 0x0A */ LF:          10,         // LINEFEED         (ASCII.CTRL_J) (Some Windows-based browsers used to generate this via CTRL-ENTER)
    /* 0x0D */ CR:          13,         // CARRIAGE RETURN  (ASCII.CTRL_M)
    /* 0x10 */ SHIFT:       16,
    /* 0x11 */ CTRL:        17,
    /* 0x12 */ ALT:         18,
    /* 0x13 */ PAUSE:       19,         // PAUSE/BREAK
    /* 0x14 */ CAPS_LOCK:   20,
    /* 0x1B */ ESC:         27,
    /* 0x20 */ SPACE:       32,
    /* 0x21 */ PGUP:        33,
    /* 0x22 */ PGDN:        34,
    /* 0x23 */ END:         35,
    /* 0x24 */ HOME:        36,
    /* 0x25 */ LEFT:        37,
    /* 0x26 */ UP:          38,
    /* 0x27 */ RIGHT:       39,
    /* 0x27 */ FF_QUOTE:    39,
    /* 0x28 */ DOWN:        40,
    /* 0x2C */ FF_COMMA:    44,
    /* 0x2C */ PRTSC:       44,
    /* 0x2D */ INS:         45,
    /* 0x2E */ DEL:         46,
    /* 0x2E */ FF_PERIOD:   46,
    /* 0x2F */ FF_SLASH:    47,
    /* 0x30 */ ZERO:        48,
    /* 0x31 */ ONE:         49,
    /* 0x32 */ TWO:         50,
    /* 0x33 */ THREE:       51,
    /* 0x34 */ FOUR:        52,
    /* 0x35 */ FIVE:        53,
    /* 0x36 */ SIX:         54,
    /* 0x37 */ SEVEN:       55,
    /* 0x38 */ EIGHT:       56,
    /* 0x39 */ NINE:        57,
    /* 0x3B */ FF_SEMI:     59,
    /* 0x3D */ FF_EQUALS:   61,
    /* 0x41 */ A:           65,
    /* 0x42 */ B:           66,
    /* 0x43 */ C:           67,
    /* 0x44 */ D:           68,
    /* 0x45 */ E:           69,
    /* 0x46 */ F:           70,
    /* 0x47 */ G:           71,
    /* 0x48 */ H:           72,
    /* 0x49 */ I:           73,
    /* 0x4A */ J:           74,
    /* 0x4B */ K:           75,
    /* 0x4C */ L:           76,
    /* 0x4D */ M:           77,
    /* 0x4E */ N:           78,
    /* 0x4F */ O:           79,
    /* 0x50 */ P:           80,
    /* 0x51 */ Q:           81,
    /* 0x52 */ R:           82,
    /* 0x53 */ S:           83,
    /* 0x54 */ T:           84,
    /* 0x55 */ U:           85,
    /* 0x56 */ V:           86,
    /* 0x57 */ W:           87,
    /* 0x58 */ X:           88,
    /* 0x59 */ Y:           89,
    /* 0x5A */ Z:           90,
    /* 0x5B */ CMD:         91,         // aka WIN
    /* 0x5B */ FF_LBRACK:   91,
    /* 0x5C */ FF_BSLASH:   92,
    /* 0x5D */ RCMD:        93,         // aka MENU
    /* 0x5D */ FF_RBRACK:   93,
    /* 0x60 */ NUM_0:       96,
    /* 0x60 */ NUM_INS:     96,
    /* 0x60 */ FF_BQUOTE:   96,
    /* 0x61 */ NUM_1:       97,
    /* 0x61 */ NUM_END:     97,
    /* 0x62 */ NUM_2:       98,
    /* 0x62 */ NUM_DOWN:    98,
    /* 0x63 */ NUM_3:       99,
    /* 0x63 */ NUM_PGDN:    99,
    /* 0x64 */ NUM_4:       100,
    /* 0x64 */ NUM_LEFT:    100,
    /* 0x65 */ NUM_5:       101,
    /* 0x65 */ NUM_CENTER:  101,
    /* 0x66 */ NUM_6:       102,
    /* 0x66 */ NUM_RIGHT:   102,
    /* 0x67 */ NUM_7:       103,
    /* 0x67 */ NUM_HOME:    103,
    /* 0x68 */ NUM_8:       104,
    /* 0x68 */ NUM_UP:      104,
    /* 0x69 */ NUM_9:       105,
    /* 0x69 */ NUM_PGUP:    105,
    /* 0x6A */ NUM_MUL:     106,
    /* 0x6B */ NUM_ADD:     107,
    /* 0x6D */ NUM_SUB:     109,
    /* 0x6E */ NUM_DEL:     110,        // aka PERIOD
    /* 0x6F */ NUM_DIV:     111,
    /* 0x70 */ F1:          112,
    /* 0x71 */ F2:          113,
    /* 0x72 */ F3:          114,
    /* 0x73 */ F4:          115,
    /* 0x74 */ F5:          116,
    /* 0x75 */ F6:          117,
    /* 0x76 */ F7:          118,
    /* 0x77 */ F8:          119,
    /* 0x78 */ F9:          120,
    /* 0x79 */ F10:         121,
    /* 0x7A */ F11:         122,
    /* 0x7B */ F12:         123,
    /* 0x90 */ NUM_LOCK:    144,
    /* 0x91 */ SCROLL_LOCK: 145,
    /* 0xAD */ FF_DASH:     173,
    /* 0xBA */ SEMI:        186,        // Firefox:  59 (FF_SEMI)
    /* 0xBB */ EQUALS:      187,        // Firefox:  61 (FF_EQUALS)
    /* 0xBC */ COMMA:       188,
    /* 0xBD */ DASH:        189,        // Firefox: 173 (FF_DASH)
    /* 0xBE */ PERIOD:      190,
    /* 0xBF */ SLASH:       191,
    /* 0xC0 */ BQUOTE:      192,
    /* 0xDB */ LBRACK:      219,
    /* 0xDC */ BSLASH:      220,
    /* 0xDD */ RBRACK:      221,
    /* 0xDE */ QUOTE:       222,
    /* 0xE0 */ FF_CMD:      224,        // Firefox only (used for both CMD and RCMD)
               VIRTUAL:    1000         // bias used by other devices to define "virtual" keyCodes
};

/*
 * Maps Firefox-specific keyCodes to their more common keyCode counterparts.
 */
WebIO.FF_KEYCODE = {
    [WebIO.KEYCODE.FF_SEMI]:    WebIO.KEYCODE.SEMI,     //  59 -> 186
    [WebIO.KEYCODE.FF_EQUALS]:  WebIO.KEYCODE.EQUALS,   //  61 -> 187
    [WebIO.KEYCODE.FF_DASH]:    WebIO.KEYCODE.DASH,     // 173 -> 189
    [WebIO.KEYCODE.FF_CMD]:     WebIO.KEYCODE.CMD       // 224 -> 91
};

/*
 * This maps KEYCODE values to ASCII character (or a string representation for non-ASCII keys).
 */
WebIO.KEYNAME = {
    [WebIO.KEYCODE.BS]:     "\b",
    [WebIO.KEYCODE.TAB]:    "\t",
    [WebIO.KEYCODE.LF]:     "\n",
    [WebIO.KEYCODE.CR]:     "\r",
    [WebIO.KEYCODE.SPACE]:  " ",
    [WebIO.KEYCODE.ZERO]:   "0",
    [WebIO.KEYCODE.ONE]:    "1",
    [WebIO.KEYCODE.TWO]:    "2",
    [WebIO.KEYCODE.THREE]:  "3",
    [WebIO.KEYCODE.FOUR]:   "4",
    [WebIO.KEYCODE.FIVE]:   "5",
    [WebIO.KEYCODE.SIX]:    "6",
    [WebIO.KEYCODE.SEVEN]:  "7",
    [WebIO.KEYCODE.EIGHT]:  "8",
    [WebIO.KEYCODE.NINE]:   "9",
    [WebIO.KEYCODE.A]:      "A",
    [WebIO.KEYCODE.B]:      "B",
    [WebIO.KEYCODE.C]:      "C",
    [WebIO.KEYCODE.D]:      "D",
    [WebIO.KEYCODE.E]:      "E",
    [WebIO.KEYCODE.F]:      "F",
    [WebIO.KEYCODE.G]:      "G",
    [WebIO.KEYCODE.H]:      "H",
    [WebIO.KEYCODE.I]:      "I",
    [WebIO.KEYCODE.J]:      "J",
    [WebIO.KEYCODE.K]:      "K",
    [WebIO.KEYCODE.L]:      "L",
    [WebIO.KEYCODE.M]:      "M",
    [WebIO.KEYCODE.N]:      "N",
    [WebIO.KEYCODE.O]:      "O",
    [WebIO.KEYCODE.P]:      "P",
    [WebIO.KEYCODE.Q]:      "Q",
    [WebIO.KEYCODE.R]:      "R",
    [WebIO.KEYCODE.S]:      "S",
    [WebIO.KEYCODE.T]:      "T",
    [WebIO.KEYCODE.U]:      "U",
    [WebIO.KEYCODE.V]:      "V",
    [WebIO.KEYCODE.W]:      "W",
    [WebIO.KEYCODE.X]:      "X",
    [WebIO.KEYCODE.Y]:      "Y",
    [WebIO.KEYCODE.Z]:      "Z",
    [WebIO.KEYCODE.LEFT]:   "Left",
    [WebIO.KEYCODE.RIGHT]:  "Right",
};

WebIO.Alerts = {
    list:       [],
    Version:    "version"
};

WebIO.BrowserPrefixes = ['', 'moz', 'ms', 'webkit'];

WebIO.COLORS = {
    "aliceblue":            "#f0f8ff",
    "antiquewhite":         "#faebd7",
    "aqua":                 "#00ffff",
    "aquamarine":           "#7fffd4",
    "azure":                "#f0ffff",
    "beige":                "#f5f5dc",
    "bisque":               "#ffe4c4",
    "black":                "#000000",
    "blanchedalmond":       "#ffebcd",
    "blue":                 "#0000ff",
    "blueviolet":           "#8a2be2",
    "brown":                "#a52a2a",
    "burlywood":            "#deb887",
    "cadetblue":            "#5f9ea0",
    "chartreuse":           "#7fff00",
    "chocolate":            "#d2691e",
    "coral":                "#ff7f50",
    "cornflowerblue":       "#6495ed",
    "cornsilk":             "#fff8dc",
    "crimson":              "#dc143c",
    "cyan":                 "#00ffff",
    "darkblue":             "#00008b",
    "darkcyan":             "#008b8b",
    "darkgoldenrod":        "#b8860b",
    "darkgray":             "#a9a9a9",
    "darkgreen":            "#006400",
    "darkkhaki":            "#bdb76b",
    "darkmagenta":          "#8b008b",
    "darkolivegreen":       "#556b2f",
    "darkorange":           "#ff8c00",
    "darkorchid":           "#9932cc",
    "darkred":              "#8b0000",
    "darksalmon":           "#e9967a",
    "darkseagreen":         "#8fbc8f",
    "darkslateblue":        "#483d8b",
    "darkslategray":        "#2f4f4f",
    "darkturquoise":        "#00ced1",
    "darkviolet":           "#9400d3",
    "deeppink":             "#ff1493",
    "deepskyblue":          "#00bfff",
    "dimgray":              "#696969",
    "dodgerblue":           "#1e90ff",
    "firebrick":            "#b22222",
    "floralwhite":          "#fffaf0",
    "forestgreen":          "#228b22",
    "fuchsia":              "#ff00ff",
    "gainsboro":            "#dcdcdc",
    "ghostwhite":           "#f8f8ff",
    "gold":                 "#ffd700",
    "goldenrod":            "#daa520",
    "gray":                 "#808080",
    "green":                "#008000",
    "greenyellow":          "#adff2f",
    "honeydew":             "#f0fff0",
    "hotpink":              "#ff69b4",
    "indianred ":           "#cd5c5c",
    "indigo":               "#4b0082",
    "ivory":                "#fffff0",
    "khaki":                "#f0e68c",
    "lavender":             "#e6e6fa",
    "lavenderblush":        "#fff0f5",
    "lawngreen":            "#7cfc00",
    "lemonchiffon":         "#fffacd",
    "lightblue":            "#add8e6",
    "lightcoral":           "#f08080",
    "lightcyan":            "#e0ffff",
    "lightgoldenrodyellow": "#fafad2",
    "lightgrey":            "#d3d3d3",
    "lightgreen":           "#90ee90",
    "lightpink":            "#ffb6c1",
    "lightsalmon":          "#ffa07a",
    "lightseagreen":        "#20b2aa",
    "lightskyblue":         "#87cefa",
    "lightslategray":       "#778899",
    "lightsteelblue":       "#b0c4de",
    "lightyellow":          "#ffffe0",
    "lime":                 "#00ff00",
    "limegreen":            "#32cd32",
    "linen":                "#faf0e6",
    "magenta":              "#ff00ff",
    "maroon":               "#800000",
    "mediumaquamarine":     "#66cdaa",
    "mediumblue":           "#0000cd",
    "mediumorchid":         "#ba55d3",
    "mediumpurple":         "#9370d8",
    "mediumseagreen":       "#3cb371",
    "mediumslateblue":      "#7b68ee",
    "mediumspringgreen":    "#00fa9a",
    "mediumturquoise":      "#48d1cc",
    "mediumvioletred":      "#c71585",
    "midnightblue":         "#191970",
    "mintcream":            "#f5fffa",
    "mistyrose":            "#ffe4e1",
    "moccasin":             "#ffe4b5",
    "navajowhite":          "#ffdead",
    "navy":                 "#000080",
    "oldlace":              "#fdf5e6",
    "olive":                "#808000",
    "olivedrab":            "#6b8e23",
    "orange":               "#ffa500",
    "orangered":            "#ff4500",
    "orchid":               "#da70d6",
    "palegoldenrod":        "#eee8aa",
    "palegreen":            "#98fb98",
    "paleturquoise":        "#afeeee",
    "palevioletred":        "#d87093",
    "papayawhip":           "#ffefd5",
    "peachpuff":            "#ffdab9",
    "peru":                 "#cd853f",
    "pink":                 "#ffc0cb",
    "plum":                 "#dda0dd",
    "powderblue":           "#b0e0e6",
    "purple":               "#800080",
    "rebeccapurple":        "#663399",
    "red":                  "#ff0000",
    "rosybrown":            "#bc8f8f",
    "royalblue":            "#4169e1",
    "saddlebrown":          "#8b4513",
    "salmon":               "#fa8072",
    "sandybrown":           "#f4a460",
    "seagreen":             "#2e8b57",
    "seashell":             "#fff5ee",
    "sienna":               "#a0522d",
    "silver":               "#c0c0c0",
    "skyblue":              "#87ceeb",
    "slateblue":            "#6a5acd",
    "slategray":            "#708090",
    "snow":                 "#fffafa",
    "springgreen":          "#00ff7f",
    "steelblue":            "#4682b4",
    "tan":                  "#d2b48c",
    "teal":                 "#008080",
    "thistle":              "#d8bfd8",
    "tomato":               "#ff6347",
    "turquoise":            "#40e0d0",
    "violet":               "#ee82ee",
    "wheat":                "#f5deb3",
    "white":                "#ffffff",
    "whitesmoke":           "#f5f5f5",
    "yellow":               "#ffff00",
    "yellowgreen":          "#9acd32"
};

WebIO.LocalStorage = {
    Available:  undefined,
    Test:       "PCjs.localStorage"
};

Defs.CLASSES["WebIO"] = WebIO;

/**
 * @copyright https://www.pcjs.org/modules/devices/main/device.js (C) Jeff Parsons 2012-2019
 */

/** @typedef {{ get: function(), set: function(number) }} */
var Register;

/**
 * In addition to basic Device services, such as:
 *
 *      addDevice()
 *      enumDevices()
 *      findDevice()
 *      findDeviceByClass()
 *
 * this class also supports register "registration" services, to allow a Device to make any registers
 * it supports available by name to other devices (notably the Debugger):
 *
 *      defineRegister()
 *      getRegister()
 *      setRegister()
 *
 * Besides CPUs, other devices may have internal registers or ports that are useful to access by name, too.
 *
 * @class {Device}
 * @unrestricted
 * @property {string} idMachine
 * @property {string} idDevice
 * @property {Config} config
 * @property {string} id
 * @property {Object} registers
 * @property {Device|undefined|null} cpu
 * @property {Device|undefined|null} dbg
 */
class Device extends WebIO {
    /**
     * Device()
     *
     * Supported config properties:
     *
     *      "bindings": object containing name/value pairs, where name is the generic name
     *      of a element, and value is the ID of the DOM element that should be mapped to it
     *
     * The properties in the "bindings" object are copied to our own bindings object in addBindings(),
     * but only for DOM elements that actually exist, and it is the elements themselves (rather than
     * their IDs) that we store.
     *
     * Also, URL parameters can be used to override config properties, as long as those properties
     * have been listed in the device's "overrides" array.  For example, the URL:
     *
     *      http://localhost:4000/?cyclesPerSecond=100000
     *
     * will set the Time device's cyclesPerSecond config property to 100000.  In general, the values
     * will be treated as strings, unless they contain all digits (number), or equal "true" or "false"
     * (boolean).
     *
     * @this {Device}
     * @param {string} idMachine
     * @param {string} idDevice
     * @param {Config} [config]
     * @param {Array} [overrides] (default overrides, if any, which in turn can be overridden by config['overrides'])
     */
    constructor(idMachine, idDevice, config, overrides)
    {
        super(idMachine == idDevice);
        this.addDevice(idMachine, idDevice);
        this.checkConfig(config, overrides);
        this.registers = {};
        this.cpu = this.dbg = undefined;
    }

    /**
     * addDevice(idMachine, idDevice)
     *
     * Adds this Device to the global set of Devices, so that findDevice(), findBinding(), etc, will work.
     *
     * @this {Device}
     * @param {string} idMachine
     * @param {string} idDevice
     */
    addDevice(idMachine, idDevice)
    {
        this.idMachine = idMachine;
        this.idDevice = idDevice;
        if (!Device.Machines[this.idMachine]) {
            Device.Machines[this.idMachine] = {};
        }
        if (Device.Machines[this.idMachine][this.idDevice]) {
            this.printf("warning: machine configuration contains multiple '%s' devices\n", this.idDevice);
        }
        Device.Machines[this.idMachine][this.idDevice] = this;
        /*
         * The new Device classes don't use the Components array or machine+device IDs, but we need to continue
         * updating both of those for backward compatibility with older PCjs machines.
         */
        this['id'] = this.idMachine + '.' + this.idDevice;
        Device.Components.push(this);
        /*
         * The WebIO constructor set this.machine tentatively, so that it could define any per-machine variables it needed;
         * now we set it definitively.
         */
        this.machine = this.findDevice(this.idMachine);
    }

    /**
     * checkConfig(config, overrides)
     *
     * @this {Device}
     * @param {Config} [config]
     * @param {Array} [overrides]
     */
    checkConfig(config = {}, overrides = [])
    {
        /*
         * If this device's config contains an "overrides" array, then any of the properties listed in
         * that array may be overridden with a URL parameter.  We don't impose any checks on the overriding
         * value, so it is the responsibility of the component with overridable properties to validate them.
         */
        overrides = config['overrides'] || overrides;
        if (overrides.length) {
            let parms = this.getURLParms();
            for (let prop in parms) {
                if (overrides.indexOf(prop) >= 0) {
                    let value;
                    let s = parms[prop];
                    /*
                     * You might think we could simply call parseInt() and check isNaN(), but parseInt() has
                     * some annoying quirks, like stopping at the first non-numeric character.  If the ENTIRE
                     * string isn't a number, then we don't want to treat ANY part of it as a number.
                     */
                    if (s.match(/^[+-]?[0-9.]+$/)) {
                        value = Number.parseInt(s, 10);
                    } else if (s == "true") {
                        value = true;
                    } else if (s == "false") {
                        value = false;
                    } else {
                        value = s;
                        s = '"' + s + '"';
                    }
                    config[prop] = value;
                    this.println("overriding " + this.idDevice + " property '" + prop + "' with " + s);
                }
            }
        }
        this.config = config;
        this.addBindings(config['bindings']);
        this.checkVersion(config);
    }

    /**
     * checkVersion(config)
     *
     * Verify that device's version matches the machine's version, and also that the config version stored in
     * the JSON (if any) matches the device's version.
     *
     * This is normally performed by the constructor, but the Machine device cannot be fully initialized in the
     * constructor, so it calls this separately.
     *
     * @this {Device}
     * @param {Config} [config]
     */
    checkVersion(config = {})
    {
        this.version = +VERSION;
        if (this.version) {
            let sVersion = "", version;
            if (this.idMachine != this.idDevice) {
                let machine = this.findDevice(this.idMachine);
                version = machine.version;
                if (version && version != this.version) {
                    sVersion = "Machine";
                }
            }
            if (!sVersion) {
                version = config['version'];
                if (version && version > this.version) {
                    sVersion = "Config";
                }
            }
            if (sVersion) {
                let sError = this.sprintf("%s Device version (%3.2f) incompatible with %s version (%3.2f)", config.class, this.version, sVersion, version);
                this.alert("Error: " + sError + '\n\n' + "Clearing your browser's cache may resolve the issue.", Device.Alerts.Version);
            }
        }
    }

    /**
     * defineRegister(name, get, set)
     *
     * @this {Device}
     * @param {string} name
     * @param {function()} get
     * @param {function(number)} set
     */
    defineRegister(name, get, set)
    {
        this.registers[name] = {get: get.bind(this), set: set.bind(this)};
    }

    /**
     * enumDevices(func)
     *
     * @this {Device}
     * @param {function(Device)} func
     * @return {boolean} (true if all devices successfully enumerated, false otherwise)
     */
    enumDevices(func)
    {
        let id;
        try {
            let devices = Device.Machines[this.idMachine];
            if (devices) {
                for (id in devices) {
                    let device = devices[id];
                    if (device.config['class'] != "Machine") {
                        if (!func(device)) return false;
                    }
                }
            }
            return true;
        } catch(err) {
            this.printf("error while enumerating device '%s': %s\n", id, err.message);
        }
        return false;
    }

    /**
     * findBinding(name, all)
     *
     * This will search the current device's bindings, and optionally all the device bindings within the
     * machine.  If the binding is found in another device, that binding is recorded in this device as well.
     *
     * @this {Device}
     * @param {string} [name]
     * @param {boolean} [all]
     * @return {Element|null|undefined}
     */
    findBinding(name, all = false)
    {
        let element;
        if (name) {
            element = super.findBinding(name, all);
            if (element === undefined && all) {
                let devices = Device.Machines[this.idMachine];
                for (let id in devices) {
                    element = devices[id].bindings[name];
                    if (element) break;
                }
                if (!element) element = null;
                this.bindings[name] = element;
            }
        }
        return element;
    }

    /**
     * findDevice(idDevice, fRequired)
     *
     * @this {Device}
     * @param {string} idDevice
     * @param {boolean} [fRequired] (default is true, so if the device is not found, an Error is thrown)
     * @return {Device|null}
     */
    findDevice(idDevice, fRequired=true)
    {
        let id = idDevice;
        let idMachine = this.idMachine;
        let i = idMachine.indexOf('.');
        if (i > 0) {
            idMachine = idMachine.substr(0, i);
            idDevice = idDevice.substr(i + 1);
        }
        let devices = Device.Machines[idMachine];
        let device = devices && devices[idDevice] || null;
        if (!device) {
            /*
             * Also check the old list of PCjs machine component IDs, to maintain backward compatibility.
             */
            for (i = 0; i < Device.Components.length; i++) {
                if (Device.Components[i]['id'] === id) {
                    device = Device.Components[i];
                    break;
                }
            }
            if (!device && fRequired) {
                throw new Error(this.sprintf("unable to find device with ID '%s'", id));
            }
        }
        return device;
    }

    /**
     * findDeviceByClass(idClass, fRequired)
     *
     * This is only appropriate for device classes where no more than one instance of the device is allowed;
     * for example, it is NOT appropriate for the Bus class, because machines can have multiple buses (eg, an
     * I/O bus and a memory bus).
     *
     * @this {Device}
     * @param {string} idClass
     * @param {boolean} [fRequired] (default is true, so if the device is not found, an Error is thrown)
     * @return {Device|null}
     */
    findDeviceByClass(idClass, fRequired=true)
    {
        let device = null;
        let devices = Device.Machines[this.idMachine];
        if (devices) {
            for (let id in devices) {
                if (devices[id].config['class'] == idClass) {
                    if (device) {
                        device = null;      // multiple devices with the same class, so return an error
                        break;
                    }
                    device = devices[id];
                }
            }
        }
        if (!device && fRequired) {
            throw new Error(this.sprintf("unable to find device with class '%s'", idClass));
        }
        return device;
    }

    /**
     * getMachineConfig(prop)
     *
     * @this {Device}
     * @param {string} prop
     * @return {*}
     */
    getMachineConfig(prop)
    {
        let machine = this.findDevice(this.idMachine);
        return machine && machine.config && machine.config[prop];
    }

    /**
     * getRegister(name)
     *
     * @this {Device}
     * @param {string} name
     * @return {number|undefined}
     */
    getRegister(name)
    {
        let reg = this.registers[name];
        return reg && reg.get();
    }

    /**
     * notifyMessage(messages)
     *
     * Overidden by other devices (eg, Debugger) to receive notifications of messages, along with the messages bits.
     *
     * @this {Device}
     * @param {number} messages
     */
    notifyMessage(messages)
    {
    }

    /**
     * printf(format, ...args)
     *
     * Just as WebIO.printf() overrides StdIO.printf() to add support for Messages, we override WebIO.printf()
     * to add support for MESSAGE.ADDR: if that message bit is set, we want to append the current execution address
     * (PC) to any message-driven printf() call.
     *
     * @this {Device}
     * @param {string|number} format
     * @param {...} args
     * @return {number}
     */
    printf(format, ...args)
    {
        if (typeof format == "number" && this.isMessageOn(format)) {
            /*
             * The following will execute at most once, because findDeviceByClass() returns either a Device or null,
             * neither of which is undefined.
             */
            if (this.dbg === undefined) {
                this.dbg = /** @type {Device} */ (this.findDeviceByClass("Debugger"));
            }
            if (this.dbg) {
                this.dbg.notifyMessage(format);
            }
            if (this.machine.messages & MESSAGE.ADDR) {
                /*
                 * Same rules as above apply here.  Hopefully no message-based printf() calls will arrive with MESSAGE.ADDR
                 * set *before* the CPU device has been initialized.
                 */
                if (this.cpu === undefined) {
                    this.cpu = /** @type {CPU} */ (this.findDeviceByClass("CPU"));
                }
                if (this.cpu) {
                    format = args.shift();      // TODO: Define a getPCLast() interface for all machines that replaces regPCLast
                    return super.printf("%#06x: %s.%s\n", this.cpu.regPCLast, this.idDevice, this.sprintf(format, ...args).trim());
                }
            }
        }
        return super.printf(format, ...args);
    }

    /**
     * removeDevice(idDevice)
     *
     * @this {Device}
     * @param {string} idDevice
     */
    removeDevice(idDevice)
    {
        let device;
        let devices = Device.Machines[this.idMachine];
        if (devices) delete devices[idDevice];
    }

    /**
     * setRegister(name, value)
     *
     * @this {Device}
     * @param {string} name
     * @param {number} value
     * @return {boolean} (true if register exists and successfully set, false otherwise)
     */
    setRegister(name, value)
    {
        let reg = this.registers[name];
        if (reg) {
            reg.set(value);
            return true;
        }
        return false;
    }
}

/**
 * Machines is a global object whose properties are machine IDs and whose values are arrays of Devices.
 *
 * @type {Object}
 */
Device.Machines = {};

/**
 * Components is maintained for backward-compatibility with older PCjs machines, to facilitate machine connections.
 *
 * @type {Array}
 */
Device.Components = [];

/*
 * List of additional message groups, extending the base set defined in lib/webio.js.
 *
 * NOTE: To support more than 32 message groups, be sure to use "+", not "|", when concatenating.
 */
MESSAGE.ADDR            = 0x000000000001;       // this is a special bit (bit 0) used to append address info to messages
MESSAGE.BUS             = 0x000000000002;
MESSAGE.MEMORY          = 0x000000000004;
MESSAGE.PORTS           = 0x000000000008;
MESSAGE.CHIPS           = 0x000000000010;
MESSAGE.KBD             = 0x000000000020;
MESSAGE.SERIAL          = 0x000000000040;
MESSAGE.MISC            = 0x000000000080;
MESSAGE.CPU             = 0x000000000100;
MESSAGE.VIDEO           = 0x000000000200;       // used with video hardware messages (see video.js)
MESSAGE.MONITOR         = 0x000000000400;       // used with video monitor messages (see monitor.js)
MESSAGE.SCREEN          = 0x000000000800;       // used with screen-related messages (also monitor.js)
MESSAGE.TIMER           = 0x000000001000;
MESSAGE.EVENT           = 0x000000002000;
MESSAGE.INPUT           = 0x000000004000;
MESSAGE.KEY             = 0x000000008000;
MESSAGE.MOUSE           = 0x000000010000;
MESSAGE.TOUCH           = 0x000000020000;
MESSAGE.WARN            = 0x000000040000;
MESSAGE.HALT            = 0x000000080000;

WebIO.MESSAGE_NAMES["addr"]     = MESSAGE.ADDR;
WebIO.MESSAGE_NAMES["bus"]      = MESSAGE.BUS;
WebIO.MESSAGE_NAMES["memory"]   = MESSAGE.MEMORY;
WebIO.MESSAGE_NAMES["ports"]    = MESSAGE.PORTS;
WebIO.MESSAGE_NAMES["chips"]    = MESSAGE.CHIPS;
WebIO.MESSAGE_NAMES["kbd"]      = MESSAGE.KBD;
WebIO.MESSAGE_NAMES["serial"]   = MESSAGE.SERIAL;
WebIO.MESSAGE_NAMES["misc"]     = MESSAGE.MISC;
WebIO.MESSAGE_NAMES["cpu"]      = MESSAGE.CPU;
WebIO.MESSAGE_NAMES["video"]    = MESSAGE.VIDEO;
WebIO.MESSAGE_NAMES["monitor"]  = MESSAGE.MONITOR;
WebIO.MESSAGE_NAMES["screen"]   = MESSAGE.SCREEN;
WebIO.MESSAGE_NAMES["timer"]    = MESSAGE.TIMER;
WebIO.MESSAGE_NAMES["event"]    = MESSAGE.EVENT;
WebIO.MESSAGE_NAMES["input"]    = MESSAGE.INPUT;
WebIO.MESSAGE_NAMES["key"]      = MESSAGE.KEY;
WebIO.MESSAGE_NAMES["mouse"]    = MESSAGE.MOUSE;
WebIO.MESSAGE_NAMES["touch"]    = MESSAGE.TOUCH;
WebIO.MESSAGE_NAMES["warn"]     = MESSAGE.WARN;
WebIO.MESSAGE_NAMES["halt"]     = MESSAGE.HALT;

if (window) {
    if (!window['PCjs']) window['PCjs'] = {};
    Device.Machines = window['PCjs']['Machines'] || (window['PCjs']['Machines'] = {});
    Device.Components = window['PCjs']['Components'] || (window['PCjs']['Components'] = []);
}

Defs.CLASSES["Device"] = Device;

/**
 * @copyright https://www.pcjs.org/modules/devices/bus/bus.js (C) Jeff Parsons 2012-2019
 */

/** @typedef {{ type: string, addrWidth: number, dataWidth: number, blockSize: (number|undefined), littleEndian: (boolean|undefined) }} */
var BusConfig;

/**
 * @class {Bus}
 * @unrestricted
 * @property {BusConfig} config
 * @property {number} type (Bus.TYPE value, converted from config['type'])
 * @property {number} addrWidth
 * @property {number} addrTotal
 * @property {number} addrLimit
 * @property {number} blockSize
 * @property {number} blockTotal
 * @property {number} blockShift
 * @property {number} blockLimit
 * @property {number} dataWidth
 * @property {number} dataLimit
 * @property {boolean} littleEndian
 * @property {Array.<Memory>} blocks
 * @property {number} nTraps (number of blocks currently being trapped)
 */
class Bus extends Device {
    /**
     * Bus(idMachine, idDevice, config)
     *
     * Sample config:
     *
     *      "bus": {
     *        "class": "Bus",
     *        "type": "static",
     *        "addrWidth": 16,
     *        "dataWidth": 8,
     *        "blockSize": 1024,
     *        "littleEndian": true
     *      }
     *
     * @this {Bus}
     * @param {string} idMachine
     * @param {string} idDevice
     * @param {BusConfig} [config]
     */
    constructor(idMachine, idDevice, config)
    {
        super(idMachine, idDevice, config);
        /*
         * Our default type is DYNAMIC for the sake of older device configs (eg, TI-57) which didn't specify a type
         * and need a dynamic bus to ensure that their LED ROM array (if any) gets updated on ROM accesses.  Obviously,
         * that can (and should) be controlled by a configuration file that is unique to the device's display requirements,
         * but at the moment, all TI-57 config files have LED ROM array support enabled, whether it's actually used or not.
         */
        this.type = config['type'] == "static"? Bus.TYPE.STATIC : Bus.TYPE.DYNAMIC;
        this.addrWidth = config['addrWidth'] || 16;
        this.addrTotal = Math.pow(2, this.addrWidth);
        this.addrLimit = (this.addrTotal - 1)|0;
        this.blockSize = config['blockSize'] || 1024;
        if (this.blockSize > this.addrTotal) this.blockSize = this.addrTotal;
        this.blockTotal = (this.addrTotal / this.blockSize)|0;
        this.blockShift = Math.log2(this.blockSize)|0;
        this.blockLimit = (1 << this.blockShift) - 1;
        this.dataWidth = config['dataWidth'] || 8;
        this.dataLimit = Math.pow(2, this.dataWidth) - 1;
        this.littleEndian = config['littleEndian'] !== false;
        this.blocks = new Array(this.blockTotal);
        this.nTraps = 0;
        let block = new Memory(idMachine, idDevice + "[NONE]", {"size": this.blockSize, "bus": this.idDevice});
        for (let addr = 0; addr < this.addrTotal; addr += this.blockSize) {
            this.addBlocks(addr, this.blockSize, Memory.TYPE.NONE, block);
        }
        this.selectInterface(this.type);
    }

    /**
     * addBlocks(addr, size, type, block)
     *
     * Bus interface for other devices to add blocks at specific addresses.  It's an error to add blocks to
     * regions that already contain blocks (other than blocks with TYPE of NONE).  There is no attempt to clean
     * up that error (and there is no removeBlocks() function) because it's currently considered a configuration
     * error, but that will likely change as machines with fancier buses are added.
     *
     * @this {Bus}
     * @param {number} addr is the starting physical address of the request
     * @param {number} size of the request, in bytes
     * @param {number} type is one of the Memory.TYPE constants
     * @param {Memory} [block] (optional preallocated block that must implement the same Memory interfaces the Bus uses)
     * @return {boolean} (true if successful, false if error)
     */
    addBlocks(addr, size, type, block)
    {
        let addrNext = addr;
        let sizeLeft = size;
        let offset = 0;
        let iBlock = addrNext >>> this.blockShift;
        while (sizeLeft > 0 && iBlock < this.blocks.length) {
            let blockNew;
            let addrBlock = iBlock * this.blockSize;
            let sizeBlock = this.blockSize - (addrNext - addrBlock);
            if (sizeBlock > sizeLeft) sizeBlock = sizeLeft;
            let blockExisting = this.blocks[iBlock];
            /*
             * If addrNext does not equal addrBlock, or sizeBlock does not equal this.blockSize, then either
             * the current block doesn't start on a block boundary or the size is something other than a block;
             * while we might support such requests down the road, that is currently a configuration error.
             */
            if (addrNext != addrBlock || sizeBlock != this.blockSize) {

                return false;
            }
            /*
             * Make sure that no block exists at the specified address, or if so, make sure its type is NONE.
             */
            if (blockExisting && blockExisting.type != Memory.TYPE.NONE) {

                return false;
            }
            /*
             * When no block is provided, we must allocate one that matches the specified type (and remaining size).
             */
            let idBlock = this.idDevice + '[' + this.toBase(addrNext, 16, this.addrWidth) + ']';
            if (!block) {
                blockNew = new Memory(this.idMachine, idBlock, {type, addr: addrNext, size: sizeBlock, "bus": this.idDevice});
            } else {
                /*
                 * When a block is provided, make sure its size maches the default Bus block size, and use it if so.
                 */
                if (block['size'] == this.blockSize) {
                    blockNew = block;
                } else {
                    /*
                     * When a block of a different size is provided, make a new block, importing any values as needed.
                     */
                    let values;
                    if (block['values']) {
                        values = block['values'].slice(offset, offset + sizeBlock);
                        if (values.length != sizeBlock) {

                            return false;
                        }
                    }
                    blockNew = new Memory(this.idMachine, idBlock, {type, addr: addrNext, size: sizeBlock, "bus": this.idDevice, values});
                }
            }
            this.blocks[iBlock] = blockNew;
            addrNext = addrBlock + this.blockSize;
            sizeLeft -= sizeBlock;
            offset += sizeBlock;
            iBlock++;
        }
        return true;
    }

    /**
     * cleanBlocks(addr, size)
     *
     * @this {Bus}
     * @param {number} addr
     * @param {number} size
     * @return {boolean} true if all blocks were clean, false if dirty; all blocks are cleaned in the process
     */
    cleanBlocks(addr, size)
    {
        let clean = true;
        let iBlock = addr >>> this.blockShift;
        let sizeBlock = this.blockSize - (addr & this.blockLimit);
        while (size > 0 && iBlock < this.blocks.length) {
            if (this.blocks[iBlock].isDirty()) {
                clean = false;
            }
            size -= sizeBlock;
            sizeBlock = this.blockSize;
            iBlock++;
        }
        return clean;
    }

    /**
     * enumBlocks(types, func)
     *
     * This is used by the Debugger to enumerate all the blocks of certain types.
     *
     * @this {Bus}
     * @param {number} types
     * @param {function(Memory)} func
     * @return {number} (the number of blocks enumerated based on the requested types)
     */
    enumBlocks(types, func)
    {
        let cBlocks = 0;
        for (let iBlock = 0; iBlock < this.blocks.length; iBlock++) {
            let block = this.blocks[iBlock];
            if (!block || !(block.type & types)) continue;
            func(block);
            cBlocks++;
        }
        return cBlocks;
    }

    /**
     * onReset()
     *
     * Called by the Machine device to provide notification of a reset event.
     *
     * @this {Bus}
     */
    onReset()
    {
        /*
         * The following logic isn't needed because Memory and Port objects are Devices as well,
         * so their onReset() handlers will be invoked automatically.
         *
         *      this.enumBlocks(Memory.TYPE.WRITABLE, function(block) {
         *          if (block.onReset) block.onReset();
         *      });
         */
    }

    /**
     * onLoad(state)
     *
     * Automatically called by the Machine device if the machine's 'autoSave' property is true.
     *
     * @this {Bus}
     * @param {Array} state
     * @return {boolean}
     */
    onLoad(state)
    {
        return state && this.loadState(state)? true : false;
    }

    /**
     * onSave(state)
     *
     * Automatically called by the Machine device before all other devices have been powered down (eg, during
     * a page unload event).
     *
     * @this {Bus}
     * @param {Array} state
     */
    onSave(state)
    {
        this.saveState(state);
    }

    /**
     * loadState(state)
     *
     * @this {Bus}
     * @param {Array} state
     * @return {boolean}
     */
    loadState(state)
    {
        for (let iBlock = 0; iBlock < this.blocks.length; iBlock++) {
            let block = this.blocks[iBlock];
            if (this.type == Bus.TYPE.DYNAMIC || (block.type & Memory.TYPE.READWRITE)) {
                if (block.loadState) {
                    let stateBlock = state.shift();
                    if (!block.loadState(stateBlock)) return false;
                }
            }
        }
        return true;
    }

    /**
     * saveState(state)
     *
     * @this {Bus}
     * @param {Array} state
     */
    saveState(state)
    {
        for (let iBlock = 0; iBlock < this.blocks.length; iBlock++) {
            let block = this.blocks[iBlock];
            if (this.type == Bus.TYPE.DYNAMIC || (block.type & Memory.TYPE.READWRITE)) {
                if (block.saveState) {
                    let stateBlock = [];
                    block.saveState(stateBlock);
                    state.push(stateBlock);
                }
            }
        }
    }

    /**
     * readBlockData(addr)
     *
     * @this {Bus}
     * @param {number} addr
     * @return {number}
     */
    readBlockData(addr)
    {

        return this.blocks[addr >>> this.blockShift].readData(addr & this.blockLimit);
    }

    /**
     * writeBlockData(addr, value)
     *
     * @this {Bus}
     * @param {number} addr
     * @param {number} value
     */
    writeBlockData(addr, value)
    {

        this.blocks[addr >>> this.blockShift].writeData(addr & this.blockLimit, value);
    }

    /**
     * readBlockPairBE(addr)
     *
     * NOTE: Any addr we are passed is assumed to be properly masked; however, any address that we
     * we calculate ourselves (ie, addr + 1) must be masked ourselves.
     *
     * @this {Bus}
     * @param {number} addr
     * @return {number}
     */
    readBlockPairBE(addr)
    {

        if (addr & 0x1) {
            return this.readData((addr + 1) & this.addrLimit) | (this.readData(addr) << this.dataWidth);
        }
        return this.blocks[addr >>> this.blockShift].readPair(addr & this.blockLimit);
    }

    /**
     * readBlockPairLE(addr)
     *
     * NOTE: Any addr we are passed is assumed to be properly masked; however, any address that we
     * we calculate ourselves (ie, addr + 1) must be masked ourselves.
     *
     * @this {Bus}
     * @param {number} addr
     * @return {number}
     */
    readBlockPairLE(addr)
    {

        if (addr & 0x1) {
            return this.readData(addr) | (this.readData((addr + 1) & this.addrLimit) << this.dataWidth);
        }
        return this.blocks[addr >>> this.blockShift].readPair(addr & this.blockLimit);
    }

    /**
     * writeBlockPairBE(addr, value)
     *
     * NOTE: Any addr we are passed is assumed to be properly masked; however, any address that we
     * we calculate ourselves (ie, addr + 1) must be masked ourselves.
     *
     * @this {Bus}
     * @param {number} addr
     * @param {number} value
     */
    writeBlockPairBE(addr, value)
    {

        if (addr & 0x1) {
            this.writeData(addr, value >> this.dataWidth);
            this.writeData((addr + 1) & this.addrLimit, value & this.dataLimit);
            return;
        }
        this.blocks[addr >>> this.blockShift].writePair(addr & this.blockLimit, value);
    }

    /**
     * writeBlockPairLE(addr, value)
     *
     * NOTE: Any addr we are passed is assumed to be properly masked; however, any address that we
     * we calculate ourselves (ie, addr + 1) must be masked ourselves.
     *
     * @this {Bus}
     * @param {number} addr
     * @param {number} value
     */
    writeBlockPairLE(addr, value)
    {

        if (addr & 0x1) {
            this.writeData(addr, value & this.dataLimit);
            this.writeData((addr + 1) & this.addrLimit, value >> this.dataWidth);
            return;
        }
        this.blocks[addr >>> this.blockShift].writePair(addr & this.blockLimit, value);
    }

    /**
     * selectInterface(n)
     *
     * We prefer Bus readData() and writeData() functions that access the corresponding values directly,
     * but if the Bus is dynamic (or if any traps are enabled), then we must revert to calling functions instead.
     *
     * In reality, this function exists purely for future optimizations; for now, we always use the block functions.
     *
     * @this {Bus}
     * @param {number} nDelta (the change in trap requests; eg, +/-1)
     */
    selectInterface(nDelta)
    {
        let nTraps = this.nTraps;
        this.nTraps += nDelta;

        if (!nTraps || !this.nTraps) {
            this.readData = this.readBlockData;
            this.writeData = this.writeBlockData;
            if (!this.littleEndian) {
                this.readPair = this.readBlockPairBE;
                this.writePair = this.writeBlockPairBE;
            } else {
                this.readPair = this.readBlockPairLE;
                this.writePair = this.writeBlockPairLE;
            }
        }
    }

    /**
     * trapRead(addr, func)
     *
     * @this {Bus}
     * @param {number} addr
     * @param {function((number|undefined), number, number)} func (receives the base address, offset, and value read)
     * @return {boolean} true if trap successful, false if unsupported or already trapped by another function
     */
    trapRead(addr, func)
    {
        if (this.blocks[addr >>> this.blockShift].trapRead(func)) {
            this.selectInterface(1);
            return true;
        }
        return false;
    }

    /**
     * trapWrite(addr, func)
     *
     * Note that for blocks of type NONE, the base will be undefined, so function will not see the original address,
     * only the block offset.
     *
     * @this {Bus}
     * @param {number} addr
     * @param {function((number|undefined), number, number)} func (receives the base address, offset, and value written)
     * @return {boolean} true if trap successful, false if unsupported already trapped by another function
     */
    trapWrite(addr, func)
    {
        if (this.blocks[addr >>> this.blockShift].trapWrite(func)) {
            this.selectInterface(1);
            return true;
        }
        return false;
    }

    /**
     * untrapRead(addr, func)
     *
     * @this {Bus}
     * @param {number} addr
     * @param {function((number|undefined), number, number)} func (receives the base address, offset, and value read)
     * @return {boolean} true if untrap successful, false if no (or another) trap was in effect
     */
    untrapRead(addr, func)
    {
        if (this.blocks[addr >>> this.blockShift].untrapRead(func)) {
            this.selectInterface(-1);
            return true;
        }
        return false;
    }

    /**
     * untrapWrite(addr, func)
     *
     * @this {Bus}
     * @param {number} addr
     * @param {function((number|undefined), number, number)} func (receives the base address, offset, and value written)
     * @return {boolean} true if untrap successful, false if no (or another) trap was in effect
     */
    untrapWrite(addr, func)
    {
        if (this.blocks[addr >>> this.blockShift].untrapWrite(func)) {
            this.selectInterface(-1);
            return true;
        }
        return false;
    }
}

/*
 * A "dynamic" bus (eg, an I/O bus) is one where block accesses must always be performed via function (no direct
 * value access) because there's "logic" on the other end, whereas a "static" bus can be accessed either way, via
 * function or value.
 *
 * Why don't we use ONLY functions on dynamic buses and ONLY direct value access on static buses?  Partly for
 * historical reasons, but also because when trapping is enabled on one or more blocks of a bus, all accesses must
 * be performed via function, to ensure that the appropriate trap handler always gets invoked.
 *
 * This is why it's important that TYPE.DYNAMIC be 1 (not 0), because we pass that value to selectInterface()
 * to effectively force all block accesses on a "dynamic" bus to use function calls.
 */
Bus.TYPE = {
    STATIC:     0,
    DYNAMIC:    1
};

Defs.CLASSES["Bus"] = Bus;

/**
 * @copyright https://www.pcjs.org/modules/devices/bus/memory.js (C) Jeff Parsons 2012-2019
 */

/** @typedef {{ addr: (number|undefined), size: number, type: (number|undefined), littleEndian: (boolean|undefined), values: (Array.<number>|undefined) }} */
var MemoryConfig;

/**
 * @class {Memory}
 * @unrestricted
 * @property {number} [addr]
 * @property {number} size
 * @property {number} type
 * @property {Bus} bus
 * @property {number} dataWidth
 * @property {number} dataLimit
 * @property {number} pairLimit
 * @property {boolean} littleEndian
 * @property {ArrayBuffer|null} buffer
 * @property {DataView|null} dataView
 * @property {Array.<number>} values
 * @property {Array.<Uint16>|null} valuePairs
 * @property {Array.<Int32>|null} valueQuads
 * @property {boolean} fDirty
 * @property {number} nReadTraps
 * @property {number} nWriteTraps
 * @property {function((number|undefined),number,number)|null} readTrap
 * @property {function((number|undefined),number,number)|null} writeTrap
 * @property {function(number)|null} readDataOrig
 * @property {function(number,number)|null} writeDataOrig
 * @property {function(number)|null} readPairOrig
 * @property {function(number,number)|null} writePairOrig
 */
class Memory extends Device {
    /**
     * Memory(idMachine, idDevice, config)
     *
     * @this {Memory}
     * @param {string} idMachine
     * @param {string} idDevice
     * @param {MemoryConfig} [config]
     */
    constructor(idMachine, idDevice, config)
    {
        super(idMachine, idDevice, config);

        this.addr = config['addr'];
        this.size = config['size'];
        this.type = config['type'] || Memory.TYPE.NONE;

        /*
         * If no Bus ID was provided, then we fallback to the default Bus.
         */
        let idBus = this.config['bus'];
        this.bus = /** @type {Bus} */ (idBus? this.findDevice(idBus) : this.findDeviceByClass(idBus = "Bus"));
        if (!this.bus) throw new Error(this.sprintf("unable to find bus '%s'", idBus));

        this.dataWidth = this.bus.dataWidth;
        this.dataLimit = Math.pow(2, this.dataWidth) - 1;
        this.pairLimit = Math.pow(2, this.dataWidth * 2) - 1;

        this.littleEndian = this.bus.littleEndian !== false;
        this.buffer = this.dataView = null
        this.values = this.valuePairs = this.valueQuads = null;

        let readValue = this.readValue;
        let writeValue = this.writeValue;
        let readPair = this.readValuePair;
        let writePair = this.writeValuePair;

        if (this.bus.type == Bus.TYPE.STATIC) {
            writeValue = this.writeValueDirty;
            readPair = this.littleEndian? this.readValuePairLE : this.readValuePairBE;
            writePair = this.writeValuePairDirty;
            if (this.dataWidth == 8 && this.getMachineConfig('ArrayBuffer') !== false) {
                this.buffer = new ArrayBuffer(this.size);
                this.dataView = new DataView(this.buffer, 0, this.size);
                /*
                * If littleEndian is true, we can use valuePairs[] and valueQuads[] directly; well, we can use
                * them whenever the offset is a multiple of 1, 2 or 4, respectively.  Otherwise, we must fallback
                * to dv.getUint8()/dv.setUint8(), dv.getUint16()/dv.setUint16() and dv.getInt32()/dv.setInt32().
                */
                this.values = new Uint8Array(this.buffer, 0, this.size);
                this.valuePairs = new Uint16Array(this.buffer, 0, this.size >> 1);
                this.valueQuads = new Int32Array(this.buffer, 0, this.size >> 2);
                readPair = this.littleEndian == LITTLE_ENDIAN? this.readValuePair16 : this.readValuePair16SE;
            }
        }

        this.fDirty = false;
        this.initValues(config['values']);

        switch(this.type) {
        case Memory.TYPE.NONE:
            this.readData = this.readNone;
            this.writeData = this.writeNone;
            this.readPair = this.readNonePair;
            this.writePair = this.writeNone;
            break;
        case Memory.TYPE.READONLY:
            this.readData = readValue;
            this.writeData = this.writeNone;
            this.readPair = readPair;
            this.writePair = this.writeNone;
            break;
        case Memory.TYPE.READWRITE:
            this.readData = readValue;
            this.writeData = writeValue;
            this.readPair = readPair;
            this.writePair = writePair;
            break;
        default:

            break;
        }

        /*
         * Additional block properties used for trapping reads/writes
         */
        this.nReadTraps = this.nWriteTraps = 0;
        this.readTrap = this.writeTrap = null;
        this.readDataOrig = this.writeDataOrig = null;
        this.readPairOrig = this.writePairOrig = null;
    }

    /**
     * initValues(values)
     *
     * @this {Memory}
     * @param {Array.<number>|undefined} values
     */
    initValues(values)
    {
        if (!this.values) {
            if (values) {

                this.values = values;
            } else {
                this.values = new Array(this.size).fill(this.dataLimit);
            }
        } else {
            if (values) {

                for (let i = 0; i < this.size; i++) {

                    this.values[i] = values[i];
                }
            }
        }
    }

    /**
     * onReset()
     *
     * Called by the Bus device to provide notification of a reset event.
     *
     * NOTE: Machines probably don't (and shouldn't) depend on the initial memory contents being zero, but this
     * can't hurt, and if we decide to save memory blocks in a compressed format (eg, RLE), this will help them compress.
     *
     * @this {Memory}
     */
    onReset()
    {
        if (this.type >= Memory.TYPE.READWRITE) this.values.fill(0);
    }

    /**
     * isDirty()
     *
     * @this {Memory}
     * @return {boolean}
     */
    isDirty()
    {
        if (this.fDirty) {
            this.fDirty = false;
            if (!this.nWriteTraps) {
                this.writeData = this.writeValueDirty;
                this.writePair = this.writeValuePairDirty;
            } else {
                this.writeDataOrig = this.writeValueDirty;
                this.writePairOrig = this.writeValuePairDirty;
            }
            return true;
        }
        return false;
    }

    /**
     * readNone(offset)
     *
     * @this {Memory}
     * @param {number} offset
     * @return {number}
     */
    readNone(offset)
    {
        return this.dataLimit;
    }

    /**
     * readNonePair(offset)
     *
     * @this {Memory}
     * @param {number} offset
     * @return {number}
     */
    readNonePair(offset)
    {
        if (this.littleEndian) {
            return this.readNone(offset) | (this.readNone(offset + 1) << this.dataWidth);
        } else {
            return this.readNone(offset + 1) | (this.readNone(offset) << this.dataWidth);
        }
    }

    /**
     * readValue(offset)
     *
     * @this {Memory}
     * @param {number} offset
     * @return {number}
     */
    readValue(offset)
    {
        return this.values[offset];
    }

    /**
     * readValuePair(offset)
     *
     * This slow version is used with a dynamic (ie, I/O) bus only.
     *
     * @this {Memory}
     * @param {number} offset (must be an even block offset)
     * @return {number}
     */
    readValuePair(offset)
    {
        if (this.littleEndian) {
            return this.readValue(offset) | (this.readValue(offset + 1) << this.dataWidth);
        } else {
            return this.readValue(offset + 1) | (this.readValue(offset) << this.dataWidth);
        }
    }

    /**
     * readValuePairBE(offset)
     *
     * @this {Memory}
     * @param {number} offset (must be an even block offset)
     * @return {number}
     */
    readValuePairBE(offset)
    {
        return this.values[offset + 1] | (this.values[offset] << this.dataWidth);
    }

    /**
     * readValuePairLE(offset)
     *
     * @this {Memory}
     * @param {number} offset (must be an even block offset)
     * @return {number}
     */
    readValuePairLE(offset)
    {
        return this.values[offset] | (this.values[offset + 1] << this.dataWidth);
    }

    /**
     * readValuePair16(offset)
     *
     * @this {Memory}
     * @param {number} offset (must be an even block offset)
     * @return {number}
     */
    readValuePair16(offset)
    {
        return this.valuePairs[offset >>> 1];
    }

    /**
     * readValuePair16SE(offset)
     *
     * This function is neither big-endian (BE) or little-endian (LE), but rather "swap-endian" (SE), which
     * means there's a mismatch between our emulated machine and the host machine, so we call the appropriate
     * DataView function with the desired littleEndian setting.
     *
     * @this {Memory}
     * @param {number} offset (must be an even block offset)
     * @return {number}
     */
    readValuePair16SE(offset)
    {
        return this.dataView.getUint16(offset, this.littleEndian);
    }

    /**
     * writeNone(offset, value)
     *
     * @this {Memory}
     * @param {number} offset
     * @param {number} value
     */
    writeNone(offset, value)
    {
    }

    /**
     * writeValue(offset, value)
     *
     * @this {Memory}
     * @param {number} offset
     * @param {number} value
     */
    writeValue(offset, value)
    {

        this.values[offset] = value;
    }

    /**
     * writeValueDirty(offset, value)
     *
     * @this {Memory}
     * @param {number} offset
     * @param {number} value
     */
    writeValueDirty(offset, value)
    {

        this.values[offset] = value;
        this.fDirty = true;
        if (!this.nWriteTraps) {
            this.writeData = this.writeValue;
        } else {
            this.writeDataOrig = this.writeValue;
        }
    }

    /**
     * writeValuePair(offset, value)
     *
     * This slow version is used with a dynamic (ie, I/O) bus only.
     *
     * @this {Memory}
     * @param {number} offset (must be an even block offset)
     * @param {number} value
     */
    writeValuePair(offset, value)
    {
        if (this.littleEndian) {
            this.writeValue(offset, value & this.dataLimit);
            this.writeValue(offset + 1, value >> this.dataWidth);
        } else {
            this.writeValue(offset, value >> this.dataWidth);
            this.writeValue(offset + 1, value & this.dataLimit);
        }
    }

    /**
     * writeValuePairBE(offset, value)
     *
     * @this {Memory}
     * @param {number} offset (must be an even block offset)
     * @param {number} value
     */
    writeValuePairBE(offset, value)
    {

        this.values[offset] = value >> this.dataWidth;
        this.values[offset + 1] = value & this.dataLimit;
    }

    /**
     * writeValuePairLE(offset, value)
     *
     * @this {Memory}
     * @param {number} offset (must be an even block offset)
     * @param {number} value
     */
    writeValuePairLE(offset, value)
    {

        this.values[offset] = value & this.dataLimit;
        this.values[offset + 1] = value >> this.dataWidth;
    }

    /**
     * writeValuePair16(offset, value)
     *
     * @this {Memory}
     * @param {number} offset (must be an even block offset)
     * @param {number} value
     */
    writeValuePair16(offset, value)
    {
        let off = offset >>> 1;

        this.valuePairs[off] = value;
    }

    /**
     * writeValuePair16SE(offset, value)
     *
     * This function is neither big-endian (BE) or little-endian (LE), but rather "swap-endian" (SE), which
     * means there's a mismatch between our emulated machine and the host machine, so we call the appropriate
     * DataView function with the desired littleEndian setting.
     *
     * @this {Memory}
     * @param {number} offset (must be an even block offset)
     * @param {number} value
     */
    writeValuePair16SE(offset, value)
    {

        this.dataView.setUint16(offset, value, this.littleEndian);
    }

    /**
     * writeValuePairDirty(offset, value)
     *
     * @this {Memory}
     * @param {number} offset (must be an even block offset, because we will halve it to obtain a pair offset)
     * @param {number} value
     */
    writeValuePairDirty(offset, value)
    {
        if (!this.buffer) {
            if (this.littleEndian) {
                this.writeValuePairLE(offset, value);
                if (!this.nWriteTraps) {
                    this.writePair = this.writeValuePairLE;
                } else {
                    this.writePairOrig = this.writeValuePairLE;
                }
            } else {
                this.writeValuePairBE(offset, value);
                if (!this.nWriteTraps) {
                    this.writePair = this.writeValuePairBE;
                } else {
                    this.writePairOrig = this.writeValuePairBE;
                }
            }
        } else {
            if (this.littleEndian == LITTLE_ENDIAN) {
                this.writeValuePair16(offset, value);
                if (!this.nWriteTraps) {
                    this.writePair = this.writeValuePair16;
                } else {
                    this.writePairOrig = this.writeValuePair16;
                }
            } else {
                this.writeValuePair16SE(offset, value);
                if (!this.nWriteTraps) {
                    this.writePair = this.writeValuePair16SE;
                } else {
                    this.writePairOrig = this.writeValuePair16SE;
                }
            }
        }
    }

    /**
     * trapRead(func)
     *
     * I've decided to call the trap handler AFTER reading the value, so that we can pass the value
     * along with the address; for example, the Debugger might find that useful for its history buffer.
     *
     * Note that for blocks of type NONE, the base will be undefined, so function will not see the
     * original address, only the block offset.
     *
     * @this {Memory}
     * @param {function((number|undefined), number, number)} func (receives the base address, offset, and value written)
     * @return {boolean} true if trap successful, false if unsupported already trapped by another function
     */
    trapRead(func)
    {
        if (!this.nReadTraps) {
            let block = this;
            this.nReadTraps++;
            this.readTrap = func;
            this.readDataOrig = this.readData;
            this.readPairOrig = this.readPair;
            this.readData = function readDataTrap(offset) {
                let value = block.readDataOrig(offset);
                block.readTrap(block.addr, offset, value);
                return value;
            };
            this.readPair = function readPairTrap(offset) {
                let value = block.readPairOrig(offset);
                block.readTrap(block.addr, offset, value);
                block.readTrap(block.addr, offset + 1, value);
                return value;
            };
            return true;
        }
        if (this.readTrap == func) {
            this.nReadTraps++;
            return true;
        }
        return false;
    }

    /**
     * trapWrite(func)
     *
     * Note that for blocks of type NONE, the base will be undefined, so function will not see the original address,
     * only the block offset.
     *
     * @this {Memory}
     * @param {function((number|undefined), number, number)} func (receives the base address, offset, and value written)
     * @return {boolean} true if trap successful, false if unsupported already trapped by another function
     */
    trapWrite(func)
    {
        if (!this.nWriteTraps) {
            let block = this;
            this.nWriteTraps++;
            this.writeTrap = func;
            this.writeDataOrig = this.writeData;
            this.writePairOrig = this.writePair;
            this.writeData = function writeDataTrap(offset, value) {
                block.writeTrap(block.addr, offset, value);
                block.writeDataOrig(offset, value);
            };
            this.writePair = function writePairTrap(offset, value) {
                block.writeTrap(block.addr, offset, value);
                block.writeTrap(block.addr, offset + 1, value);
                block.writePairOrig(offset, value);
            };
            return true;
        }
        if (this.writeTrap == func) {
            this.nWriteTraps++;
            return true
        }
        return false;
    }

    /**
     * untrapRead(func)
     *
     * @this {Memory}
     * @param {function((number|undefined), number, number)} func (receives the base address, offset, and value read)
     * @return {boolean} true if untrap successful, false if no (or another) trap was in effect
     */
    untrapRead(func)
    {
        if (this.nReadTraps && this.readTrap == func) {
            if (!--this.nReadTraps) {
                this.readData = this.readDataOrig;
                this.readPair = this.readPairOrig;
                this.readDataOrig = this.readPairOrig = this.readTrap = null;
            }

            return true;
        }
        return false;
    }

    /**
     * untrapWrite(func)
     *
     * @this {Memory}
     * @param {function((number|undefined), number, number)} func (receives the base address, offset, and value written)
     * @return {boolean} true if untrap successful, false if no (or another) trap was in effect
     */
    untrapWrite(func)
    {
        if (this.nWriteTraps && this.writeTrap == func) {
            if (!--this.nWriteTraps) {
                this.writeData = this.writeDataOrig;
                this.writePair = this.writePairOrig;
                this.writeDataOrig = this.writePairOrig = this.writeTrap = null;
            }

            return true;
        }
        return false;
    }

    /**
     * loadState(state)
     *
     * Memory and Ports states are loaded by the Bus onLoad() handler, which calls our loadState() handler.
     *
     * @this {Memory}
     * @param {Array} state
     * @return {boolean}
     */
    loadState(state)
    {
        let idDevice = state.shift();
        if (this.idDevice == idDevice) {
            this.fDirty = state.shift();
            state.shift();      // formerly fDirtyEver, now unused
            this.initValues(this.decompress(state.shift(), this.size));
            return true;
        }
        return false;
    }

    /**
     * saveState(state)
     *
     * Memory and Ports states are saved by the Bus onSave() handler, which calls our saveState() handler.
     *
     * @this {Memory}
     * @param {Array} state
     */
    saveState(state)
    {
        state.push(this.idDevice);
        state.push(this.fDirty);
        state.push(false);      // formerly fDirtyEver, now unused
        state.push(this.compress(this.values));
    }
}

/*
 * Memory block types use discrete bits so that enumBlocks() can be passed a set of combined types,
 * by OR'ing the desired types together.
 */
Memory.TYPE = {
    NONE:               0x01,
    READONLY:           0x02,
    READWRITE:          0x04,
    /*
     * The rest are not discrete memory types, but rather sets of types that are handy for enumBlocks().
     */
    READABLE:           0x0E,
    WRITABLE:           0x0C
};

Defs.CLASSES["Memory"] = Memory;

/**
 * @copyright https://www.pcjs.org/modules/devices/bus/rom.js (C) Jeff Parsons 2012-2019
 */

/** @typedef {{ addr: number, size: number, values: Array.<number>, file: string, reference: string, chipID: string, revision: (number|undefined), colorROM: (string|undefined), backgroundColorROM: (string|undefined) }} */
var ROMConfig;

/**
 * @class {ROM}
 * @unrestricted
 * @property {ROMConfig} config
 */
class ROM extends Memory {
    /**
     * ROM(idMachine, idDevice, config)
     *
     * Sample config:
     *
     *      "rom": {
     *        "class": "ROM",
     *        "addr": 0,
     *        "size": 2048,
     *        "bus": "busIO"
     *        "littleEndian": true,
     *        "file": "ti57le.bin",
     *        "reference": "",
     *        "chipID": "TMC1501NC DI 7741",
     *        "revision": "0",
     *        "bindings": {
     *          "array": "romArrayTI57",
     *          "cellDesc": "romCellTI57"
     *        },
     *        "overrides": ["colorROM","backgroundColorROM"],
     *        "values": [
     *          ...
     *        ]
     *      }
     *
     * @this {ROM}
     * @param {string} idMachine
     * @param {string} idDevice
     * @param {ROMConfig} [config]
     */
    constructor(idMachine, idDevice, config)
    {
        config['type'] = Memory.TYPE.READONLY;
        super(idMachine, idDevice, config);

        /*
         * The Memory constructor automatically finds the correct Bus for us.
         */
        this.bus.addBlocks(config['addr'], config['size'], config['type'], this);
        this.cpu = this.dbg = undefined;

        /*
         * If an "array" binding has been supplied, then create an LED array sufficiently large to represent the
         * entire ROM.  If data.length is an odd power-of-two, then we will favor a slightly wider array over a taller
         * one, by virtue of using Math.ceil() instead of Math.floor() for the columns calculation.
         */
        if (Defs.CLASSES["LED"] && this.bindings[ROM.BINDING.ARRAY]) {
            let rom = this;
            let addrLines = Math.log2(this.values.length) / 2;
            this.cols = Math.pow(2, Math.ceil(addrLines));
            this.rows = (this.values.length / this.cols)|0;
            let configLEDs = {
                "class":            "LED",
                "bindings":         {"container": this.getBindingID(ROM.BINDING.ARRAY)},
                "type":             LED.TYPE.ROUND,
                "cols":             this.cols,
                "rows":             this.rows,
                "color":            this.getDefaultString('colorROM', "green"),
                "backgroundColor":  this.getDefaultString('backgroundColorROM', "black"),
                "persistent":       true
            };
            this.ledArray = new LED(idMachine, idDevice + "LEDs", configLEDs);
            this.clearArray();
            let configInput = {
                "class":        "Input",
                "location":     [0, 0, this.ledArray.widthView, this.ledArray.heightView, this.cols, this.rows],
                "bindings":     {"surface": this.getBindingID(ROM.BINDING.ARRAY)}
            };
            this.ledInput = new Input(idMachine, idDevice + "Input", configInput);
            this.sCellDesc = this.getBindingText(ROM.BINDING.CELLDESC) || "";
            this.ledInput.addHover(function onROMHover(col, row) {
                if (rom.cpu) {
                    let sDesc = rom.sCellDesc;
                    if (col >= 0 && row >= 0) {
                        let offset = row * rom.cols + col;

                        let opcode = rom.values[offset];
                        sDesc = rom.cpu.toInstruction(rom.addr + offset, opcode);
                    }
                    rom.setBindingText(ROM.BINDING.CELLDESC, sDesc);
                }
            });
        }
    }

    /**
     * clearArray()
     *
     * clearBuffer(true) performs a combination of clearBuffer() and drawBuffer().
     *
     * @this {ROM}
     */
    clearArray()
    {
        if (this.ledArray) this.ledArray.clearBuffer(true);
    }

    /**
     * drawArray()
     *
     * This performs a simple drawBuffer(); intended for synchronous updates (eg, step operations);
     * otherwise, you should allow the LED object's async animation handler take care of drawing updates.
     *
     * @this {ROM}
     */
    drawArray()
    {
        if (this.ledArray) this.ledArray.drawBuffer();
    }

    /**
     * loadState(state)
     *
     * If any saved values don't match (presumably overridden), abandon the given state and return false.
     *
     * @this {ROM}
     * @param {Array} state
     * @return {boolean}
     */
    loadState(state)
    {
        let length, success = true;
        let buffer = state.shift();
        if (buffer && this.ledArray) {
            length = buffer.length;

            if (this.ledArray.buffer.length == length) {
                this.ledArray.buffer = buffer;
                this.ledArray.drawBuffer(true);
            } else {
                this.printf("inconsistent saved LED state (%d), unable to load\n", length);
                success = false;
            }
        }
        /*
         * Version 1.21 and up also saves the ROM contents, since our "mini-debugger" has been updated
         * with an edit command ("e") to enable ROM patching.  However, we prefer to detect improvements
         * in saved state based on the length of the array, not the version number.
         */
        if (state.length) {
            let data = state.shift();
            let length = data && data.length || -1;
            if (this.values.length == length) {
                this.values = data;
            } else {
                this.printf("inconsistent saved ROM state (%d), unable to load\n", length);
                success = false;
            }
        }
        return success;
    }

    /**
     * onPower(on)
     *
     * Called by the Machine device to provide notification of a power event.
     *
     * @this {ROM}
     * @param {boolean} on (true to power on, false to power off)
     */
    onPower(on)
    {
        /*
         * We only care about the first power event, because it's a safe point to query the CPU.
         */
        if (this.cpu === undefined) {
            this.cpu = /* @type {CPU} */ (this.findDeviceByClass("CPU"));
        }
        /*
         * This is also a good time to get access to the Debugger, if any, and pass it symbol information, if any.
         */
        if (this.dbg === undefined) {
            this.dbg = /* @type {Debugger} */ (this.findDeviceByClass("Debugger", false));
            if (this.dbg && this.dbg.addSymbols) this.dbg.addSymbols(this.config['symbols']);
        }
    }

    /**
     * readDirect(offset)
     *
     * This provides an alternative to readValue() for those callers who don't want the LED array to see their access.
     *
     * Note that this "Direct" function requires the caller to perform their own address-to-offset calculation, since they
     * are bypassing the Bus device.
     *
     * @this {ROM}
     * @param {number} offset
     * @return {number}
     */
    readDirect(offset)
    {
        return this.values[offset];
    }

    /**
     * readValue(offset)
     *
     * This overrides the Memory readValue() function so that the LED array, if any, can track ROM accesses.
     *
     * @this {ROM}
     * @param {number} offset
     * @return {number}
     */
    readValue(offset)
    {
        if (this.ledArray) {
            this.ledArray.setLEDState(offset % this.cols, (offset / this.cols)|0, LED.STATE.ON, LED.FLAGS.MODIFIED);
        }
        return this.values[offset];
    }

    /**
     * reset()
     *
     * Called by the CPU (eg, TMS1500) onReset() handler.  Originally, there was no need for this
     * handler, until we added the mini-debugger's ability to edit ROM locations via setData().  So this
     * gives the user the ability to revert back to the original ROM if they want to undo any modifications.
     *
     * @this {ROM}
     */
    reset()
    {
        this.values = this.config['values'];
    }

    /**
     * saveState(state)
     *
     * @this {ROM}
     * @param {Array} state
     */
    saveState(state)
    {
        if (this.ledArray) {
            state.push(this.ledArray.buffer);
            state.push(this.values);
        }
    }

    /**
     * writeDirect(offset, value)
     *
     * This provides an alternative to writeValue() for callers who need to "patch" the ROM (normally unwritable).
     *
     * Note that this "Direct" function requires the caller to perform their own address-to-offset calculation, since they
     * are bypassing the Bus device.
     *
     * @this {ROM}
     * @param {number} offset
     * @param {number} value
     */
    writeDirect(offset, value)
    {
        this.values[offset] = value;
    }
}

ROM.BINDING = {
    ARRAY:      "array",
    CELLDESC:   "cellDesc"
};

Defs.CLASSES["ROM"] = ROM;

/**
 * @copyright https://www.pcjs.org/modules/devices/main/input.js (C) Jeff Parsons 2012-2019
 */

/** @typedef {{ class: string, bindings: (Object|undefined), version: (number|undefined), overrides: (Array.<string>|undefined), location: Array.<number>, map: (Array.<Array.<number>>|Object|undefined), drag: (boolean|undefined), scroll: (boolean|undefined), hexagonal: (boolean|undefined), buttonDelay: (number|undefined) }} */
var InputConfig;

 /** @typedef {{ keyNum: number, msDown: number, autoRelease: boolean }} */
var ActiveKey;

 /** @typedef {{ id: string, func: function(string,boolean) }} */
var KeyListener;

 /** @typedef {{ id: string, cxGrid: number, cyGrid: number, xGrid: number, yGrid: number, func: function(boolean) }} */
var SurfaceListener;

/**
 * @class {Input}
 * @unrestricted
 * @property {InputConfig} config
 * @property {Array.<number>} location
 * @property {Array.<Array.<number>>|Object} map
 * @property {boolean} fDrag
 * @property {boolean} fScroll
 * @property {boolean} fHexagonal
 * @property {number} buttonDelay
 * @property {{
 *  surface: Element|undefined
 * }} bindings
 * @property {function(number,number)} onInput
 * @property {function(number,number)} onHover
 * @property {Array.<KeyListener>} aKeyListeners
 * @property {Array.<SurfaceListener>} aSurfaceListeners
 * @property {Array.<ActiveKey>} aActiveKeys
 */
class Input extends Device {
    /**
     * Input(idMachine, idDevice, config)
     *
     * Sample config:
     *
     *      "input": {
     *        "class": "Input",
     *        "location": [139, 325, 368, 478, 0.34, 0.5, 640, 853],
     *        "map": [
     *          ["2nd",  "inv",  "lnx",  "\\b",  "clr"],
     *          ["lrn",  "xchg", "sq",   "sqrt", "rcp"],
     *          ["sst",  "sto",  "rcl",  "sum",  "exp"],
     *          ["bst",  "ee",   "(",    ")",    "/"],
     *          ["gto",  "7",    "8",    "9",    "*"],
     *          ["sbr",  "4",    "5",    "6",    "-"],
     *          ["rst",  "1",    "2",    "3",    "+"],
     *          ["r/s",  "0",    ".",    "+/-",  "=|\\r"]
     *        ],
     *        "drag": false,
     *        "bindings": {
     *          "surface": "imageTI57",
     *          "power": "powerTI57",
     *          "reset": "resetTI57"
     *        }
     *      }
     *
     * A word about the "power" button: the page will likely use absolute positioning to overlay the HTML button
     * onto the image of the physical button, and the temptation might be to use the style "display:none" to hide
     * it, but "opacity:0" should be used instead, because otherwise our efforts to use it as focusable element
     * may fail.
     *
     * @this {Input}
     * @param {string} idMachine
     * @param {string} idDevice
     * @param {InputConfig} [config]
     */
    constructor(idMachine, idDevice, config)
    {
        super(idMachine, idDevice, config);

        this.messages = MESSAGE.INPUT;
        this.onInput = this.onHover = null;
        this.time = /** @type {Time} */ (this.findDeviceByClass("Time"));
        this.machine = /** @type {Machine} */ (this.findDeviceByClass("Machine"));

        /*
         * If 'drag' is true, then the onInput() handler will be called whenever the current col and/or row
         * changes, even if the mouse hasn't been released since the previous onInput() call.
         *
         * The default is false, because in general, allowing drag is a bad idea for calculator buttons.  But
         * I've made this an option for other input surfaces, like LED arrays, where you might want to turn a
         * series of LEDs on or off.
         */
        this.fDrag = this.getDefaultBoolean('drag', false);

        /*
         * If 'scroll' is true, then we do NOT call preventDefault() on touch events; this permits the input
         * surface to be scrolled like any other part of the page.  The default is false, because this has other
         * side-effects (eg, inadvertent zooms).
         */
        this.fScroll = this.getDefaultBoolean('scroll', false);

        /*
         * If 'hexagonal' is true, then we treat the input grid as hexagonal, where even rows of the associated
         * display are offset.
         */
        this.fHexagonal = this.getDefaultBoolean('hexagonal', false);

        /*
         * The 'buttonDelay' setting is only necessary for devices (ie, old calculators) that are either slow
         * to respond and/or have debouncing logic that would otherwise be defeated.
         */
        this.buttonDelay = this.getDefaultNumber('buttonDelay', 0);

        /*
         * This is set on receipt of the first 'touch' event of any kind, and is used by the 'mouse' event
         * handlers to disregard mouse events if set.
         */
        this.fTouch = false;

        /*
         * There are two supported configuration maps: a two-dimensional grid (gridMap) and a list of IDs (idMap).
         *
         * The two-dimensional button layouts do not (currently) support individual listeners; instead, any key event
         * that corresponds to a position within the button layout is transformed into an (x,y) position that is passed
         * on to a special function supplied to addInput().
         *
         * Any two-dimensional layout COULD be converted to a list of logical buttons, each with their own grid
         * coordinates, but for devices like calculators that have a natural grid design, the two-dimensional layout
         * is much simpler.
         *
         * Each ID in an idMap references an object with a "keys" array, a "grid" array, and a "state" value;
         * the code below ensures that every object has all three.  As "keys" go down and up (or mouse/touch events
         * occur within the "grid"), the corresponding "state" is updated (0 or 1).
         *
         * A third type of map (keyMap) is supported, but not as a configuration parameter; any keyMap must be supplied
         * by another device, via an addKeyMap() call.
         */
        let map = this.config['map'];
        this.gridMap = this.idMap = this.keyMap = null;

        if (map) {
            if (map.length) {
                this.gridMap = map;
            } else {
                this.idMap = {};
                let ids = Object.keys(map);
                for (let i = 0; i < ids.length; i++) {
                    let grid = [];
                    let id = ids[i];
                    let keys = map[id];
                    if (typeof keys == "string") {
                        keys = [keys];
                    } else if (keys.length == undefined) {
                        grid = keys['grid'];
                        keys = keys['keys'];
                        if (typeof keys == "string") keys = [keys];
                    }
                    let state = 0;
                    this.idMap[id] = {keys, grid, state};
                }
            }
        }

        this.altFocus = false;
        this.focusElement = this.altFocusElement = null;
        let element = this.bindings[Input.BINDING.SURFACE];
        if (element) {
            this.addSurface(element, this.findBinding(config['focusBinding'], true), this.config['location']);
        }

        this.aKeyListeners = [];
        this.aSurfaceListeners = [];

        this.onReset();
    }

    /**
     * addHover(onHover)
     *
     * @this {Input}
     * @param {function(number,number)} onHover
     */
    addHover(onHover)
    {
        this.onHover = onHover;
    }

    /**
     * addInput(onInput)
     *
     * Called by the CPU device to set up input notifications.
     *
     * @this {Input}
     * @param {function(number,number)} onInput
     */
    addInput(onInput)
    {
        this.onInput = onInput;
    }

    /**
     * addListener(type, id, func, init)
     *
     * @this {Input}
     * @param {string} type (see Input.TYPE)
     * @param {string} id
     * @param {function(string,boolean)|null} [func]
     * @param {number|boolean|string} [init] (initial state; treated as a boolean for the SWITCH type)
     * @return {boolean} (true if successful, false if not)
     */
    addListener(type, id, func, init)
    {
        if (type == Input.TYPE.IDMAP && this.idMap) {
            let map = this.idMap[id];
            if (map) {
                let keys = map.keys;
                if (keys && keys.length) {
                    this.aKeyListeners.push({id, func});
                }
                let grid = map.grid;
                if (grid && grid.length) {
                    this.aSurfaceListeners.push({id, cxGrid: grid[0], cyGrid: grid[1], xGrid: grid[2], yGrid: grid[3], func});
                }
                return true;
            }
            return false;
        }
        /*
         * The visual state of a SWITCH control (which could be a div or button or any other element) is controlled
         * by its class attribute -- specifically, the last class name in the attribute.  You must define two classes:
         * one that ends with "On" for the on (true) state and another that ends with "Off" for the off (false) state.
         *
         * The first addListener() call should include both your listener function and the initial state; the control's
         * class is automatically switched every time the control is clicked, and the newly switched state is passed to
         * your function.  If you need to change the state of the switch for other reasons, call addListener() with NO
         * function, just a new initial state.
         */
        if (type == Input.TYPE.SWITCH) {
            let element = this.findBinding(id, true);
            if (element) {
                let getClass = function() {
                    return element.getAttribute("class") || "";
                };
                let setClass = function(s) {
                    element.setAttribute("class", s);
                };
                let getState = function() {
                    return (getClass().slice(-2) == "On")? true : false;
                };
                let setState = function(state) {
                    setClass(getClass().replace(/(On|Off)$/, state? "On" : "Off"));
                    return state;
                };
                if (init != undefined) setState(init);
                if (func) {
                    element.addEventListener('click', function onSwitchClick() {
                        func(id, setState(!getState()));
                    });
                }
            }
            return false;
        }
        return false;
    }

    /**
     * addKeyMap(device, keyMap, clickMap)
     *
     * This records the caller's keyMap, changes onKeyCode() to record any physical keyCode
     * that exists in the keyMap as an active key, and allows the caller to use getActiveKey()
     * to get the mapped key of an active key.
     *
     * It also supports an optional clickMap, which lists a set of bindings that the caller
     * supports.  For every valid binding, we add an onclick handler that simulates a call to
     * onKeyCode() with the corresponding keyCode.
     *
     * @this {Input}
     * @param {Device} device
     * @param {Object} keyMap
     * @param {Object} [clickMap]
     * @return {boolean}
     */
    addKeyMap(device, keyMap, clickMap)
    {
        if (!this.keyMap) {
            let input = this;
            this.keyMap = keyMap;
            this.timerAutoRelease = this.time.addTimer("timerAutoRelease", function onAutoRelease() {
                input.checkAutoRelease();
            });
            if (clickMap) {
                for (let binding in clickMap) {
                    let element = device.bindings[binding];
                    if (element) {
                        element.addEventListener('click', function onKeyClick() {
                            input.onKeyCode(clickMap[binding], true, true);
                            input.setFocus();
                        });
                    }
                }
            }
            return true;
        }
        return false;
    }

    /**
     * checkKeyListeners(id, down)
     *
     * @this {Input}
     * @param {string} id
     * @param {boolean} down
     */
    checkKeyListeners(id, down)
    {
        for (let i = 0; i < this.aKeyListeners.length; i++) {
            let listener = this.aKeyListeners[i];
            if (listener.id == id) {
                listener.func(id, down);
            }
        }
    }

    /**
     * addSurface(inputElement, focusElement, location)
     *
     * @this {Input}
     * @param {Element} inputElement (surface element)
     * @param {Element|null} [focusElement] (should be provided if surface element is non-focusable)
     * @param {Array} [location]
     */
    addSurface(inputElement, focusElement, location = [])
    {
        /*
         * The location array, eg:
         *
         *      "location": [139, 325, 368, 478, 0.34, 0.5, 640, 853, 180, 418, 75, 36],
         *
         * contains the top left corner (xInput, yInput) and dimensions (cxInput, cyInput)
         * of the input rectangle where the buttons described in the map are located, relative
         * to the surface image.  It also describes the average amount of horizontal and vertical
         * space between buttons, as fractions of the average button width and height (hGap, vGap).
         *
         * With all that, we can now calculate the center lines for each column and row.  This
         * obviously assumes that all the buttons are evenly laid out in a perfect grid.  For
         * devices that don't have such a nice layout, a different location array format will
         * have to be defined.
         *
         * NOTE: While element.naturalWidth and element.naturalHeight should, for all modern
         * browsers, contain the surface image's dimensions as well, those values still might not
         * be available if our constructor is called before the page's onload event has fired,
         * so we allow them to be stored in the next two elements of the location array, too.
         *
         * Finally, the position and size of the device's power button may be stored in the array
         * as well, in case some browsers refuse to generate onClickPower() events (eg, if they
         * think the button is inaccessible/not visible).
         */
        this.xInput = location[0] || 0;
        this.yInput = location[1] || 0;
        this.cxInput = location[2] || inputElement.clientWidth;
        this.cyInput = location[3] || inputElement.clientHeight;
        this.hGap = location[4] || 1.0;
        this.vGap = location[5] || 1.0;
        this.cxSurface = location[6] || inputElement.naturalWidth || this.cxInput;
        this.cySurface = location[7] || inputElement.naturalHeight || this.cyInput;
        this.xPower = location[8] || 0;
        this.yPower = location[9] || 0;
        this.cxPower = location[10] || 0;
        this.cyPower = location[11] || 0;
        if (this.gridMap) {
            this.nRows = this.gridMap.length;
            this.nCols = this.gridMap[0].length;
        } else {
            this.nCols = this.hGap;
            this.nRows = this.vGap;
            this.hGap = this.vGap = 0;
        }

        /*
         * To calculate the average button width (cxButton), we know that the overall width
         * must equal the sum of all the button widths + the sum of all the button gaps:
         *
         *      cxInput = nCols * cxButton + nCols * (cxButton * hGap)
         *
         * The number of gaps would normally be (nCols - 1), but we require that cxInput include
         * only 1/2 the gap at the edges, too.  Solving for cxButton:
         *
         *      cxButton = cxInput / (nCols + nCols * hGap)
         */
        this.cxButton = (this.cxInput / (this.nCols + this.nCols * this.hGap))|0;
        this.cyButton = (this.cyInput / (this.nRows + this.nRows * this.vGap))|0;
        this.cxGap = (this.cxButton * this.hGap)|0;
        this.cyGap = (this.cyButton * this.vGap)|0;

        /*
         * xStart and yStart record the last 'touchstart' or 'mousedown' position on the surface
         * image; they will be reset to -1 when movement has ended (eg, 'touchend' or 'mouseup').
         */
        this.xStart = this.yStart = -1;

        /*
         * If no location data is provided, then there shouldn't be any need to capture these.
         */
        if (location.length) {
            this.captureMouse(inputElement);
            this.captureTouch(inputElement);
        }

        if (this.time) {
            /*
             * We use a timer for the touch/mouse release events, to ensure that the machine had
             * enough time to notice the input before releasing it.
             */
            let input = this;
            if (this.buttonDelay) {
                this.timerInputRelease = this.time.addTimer("timerInputRelease", function onInputRelease() {
                    if (input.xStart < 0 && input.yStart < 0) { // auto-release ONLY if it's REALLY released
                        input.setPosition(-1, -1);
                    }
                });
            }
            if (this.gridMap || this.idMap || this.keyMap) {
                /*
                 * This auto-releases the last key reported after an appropriate delay, to ensure that
                 * the machine had enough time to notice the corresponding button was pressed.
                 */
                if (this.buttonDelay) {
                    this.timerKeyRelease = this.time.addTimer("timerKeyRelease", function onKeyRelease() {
                        input.onKeyTimer();
                    });
                }

                /*
                 * I used to maintain a single-key buffer (this.keyPressed) and would immediately release
                 * that key as soon as another key was pressed, but it appears that the ROM wants a minimum
                 * delay between release and the next press -- probably for de-bouncing purposes.  So we
                 * maintain a key state: 0 means no key has gone down or up recently, 1 means a key just went
                 * down, and 2 means a key just went up.  keysPressed maintains a queue of keys (up to 16)
                 * received while key state is non-zero.
                 */
                this.keyState = 0;
                this.keyActive = "";
                this.keysPressed = [];

                /*
                 * I'm attaching my key event handlers to the document object, since image elements are
                 * not focusable.  I'm disinclined to do what I've done with other machines (ie, create an
                 * invisible <textarea> overlay), because in this case, I don't really want a soft keyboard
                 * popping up and obscuring part of the display.
                 *
                 * A side-effect, however, is that if the user attempts to explicitly give the image
                 * focus, we don't have anything for focus to attach to.  We address that in onMouseDown(),
                 * by redirecting focus to the "power" button, if any, not because we want that or any other
                 * button to have focus, but simply to remove focus from any other input element on the page.
                 */
                let element = inputElement;
                if (focusElement) {
                    element = focusElement;
                    if (!this.focusElement && focusElement.nodeName == "BUTTON") {
                        element = document;
                        this.focusElement = focusElement;
                        /*
                         * Although we've elected to attach key handlers to the document object in this case,
                         * we also attach to the inputElement as an alternative.
                         */
                        this.captureKeys(inputElement);
                        this.altFocusElement = inputElement;
                    }
                }
                this.captureKeys(element);
                if (!this.focusElement) {
                    this.focusElement = element;
                }
            }
        }
    }

    /**
     * checkSurfaceListeners(action, x, y, cx, cy)
     *
     * @this {Input}
     * @param {number} action (eg, Input.ACTION.MOVE, Input.ACTION.PRESS, Input.ACTION.RELEASE)
     * @param {number} x (valid for MOVE and PRESS, not RELEASE)
     * @param {number} y (valid for MOVE and PRESS, not RELEASE)
     * @param {number} cx (width of the element that received the event)
     * @param {number} cy (height of the element that received the event)
     */
    checkSurfaceListeners(action, x, y, cx, cy)
    {
        if (action == Input.ACTION.PRESS || action == Input.ACTION.RELEASE) {
            for (let i = 0; i < this.aSurfaceListeners.length; i++) {
                let listener = this.aSurfaceListeners[i];
                if (action == Input.ACTION.RELEASE) {
                    listener.func(listener.id, false);
                    continue;
                }
                let cxSpan = (cx / listener.cxGrid)|0, xActive = (x / cxSpan)|0;
                let cySpan = (cy / listener.cyGrid)|0, yActive = (y / cySpan)|0;
                if (xActive == listener.xGrid && yActive == listener.yGrid) {
                    listener.func(listener.id, true);
                }
            }
        }
    }

    /**
     * advanceKeyState()
     *
     * @this {Input}
     */
    advanceKeyState()
    {
        if (!this.buttonDelay) {
            this.onKeyTimer();
        } else {
            this.time.setTimer(this.timerKeyRelease, this.buttonDelay);
        }
    }

    /**
     * captureKeys(element)
     *
     * @this {Input}
     * @param {Document|Element} element
     */
    captureKeys(element)
    {
        let input = this;

        /**
         * isFocus(event)
         *
         * @param {Object} event
         * @return {Object|null}
         */
        let isFocus = function(event) {
            let activeElement = document.activeElement;
            return (!input.focusElement || activeElement == input.focusElement || activeElement == input.altFocusElement)? (event || window.event) : null;
        };

        /**
         * printEvent(type, code, used)
         *
         * @param {string} type
         * @param {number} code
         * @param {boolean} [used]
         */
        let printEvent = function(type, code, used) {
            let activeElement = document.activeElement;
            input.printf(MESSAGE.KEY + MESSAGE.EVENT, "%s.onKey%s(%d): %5.2f (%s)\n", activeElement.id || activeElement.nodeName, type, code, (Date.now() / 1000) % 60, used != undefined? (used? "used" : "unused") : "ignored");
        };

        element.addEventListener(
            'keydown',
            function onKeyDown(event) {
                event = isFocus(event);
                if (event) {
                    let keyCode = event.which || event.keyCode;
                    let used = input.onKeyCode(keyCode, true);
                    printEvent("Down", keyCode, used);
                    if (used) event.preventDefault();
                }
            }
        );

        element.addEventListener(
            'keypress',
            function onKeyPress(event) {
                event = isFocus(event);
                if (event) {
                    let charCode = event.which || event.charCode;
                    let used = input.onKeyCode(charCode);
                    printEvent("Press", charCode, used);
                    if (used) event.preventDefault();
                }
            }
        );

        element.addEventListener(
            'keyup',
            function onKeyUp(event) {
                event = isFocus(event);
                if (event) {
                    let keyCode = event.which || event.keyCode;
                    input.onKeyCode(keyCode, false);
                    printEvent("Up", keyCode);
                    event.preventDefault();
                    if (element.nodeName == "TEXTAREA") element.value = "";
                }
            }
        );

        /*
         * The following onBlur() and onFocus() handlers are currently just for debugging purposes, but
         * PCx86 experience suggests that we may also eventually need them for future pointer-locking support.
         */
        if (DEBUG) {
            element.addEventListener(
                'blur',
                function onBlur(event) {
                    input.printf(MESSAGE.KEY + MESSAGE.EVENT, "onBlur(%s)\n", event.target.id || event.target.nodeName);
                }
            );
            element.addEventListener(
                'focus',
                function onFocus(event) {
                    input.printf(MESSAGE.KEY + MESSAGE.EVENT, "onFocus(%s)\n", event.target.id || event.target.nodeName);
                }
            );
        }
    }

    /**
     * captureMouse(element)
     *
     * @this {Input}
     * @param {Element} element
     */
    captureMouse(element)
    {
        let input = this;

        element.addEventListener(
            'mousedown',
            function onMouseDown(event) {
                if (input.fTouch) return;
                /*
                 * If there are any text input elements on the page that might currently have focus,
                 * this is a good time to divert focus to a focusable element of our own (eg, focusElement).
                 * Otherwise, key presses could be confusingly processed in two places.
                 *
                 * Unfortunately, setting focus on an element can cause the browser to scroll the element
                 * into view, so to avoid that, we use the following scrollTo() work-around.
                 */
                let focusElement = input.altFocus? input.altFocusElement : input.focusElement;
                if (focusElement) {
                    let x = window.scrollX, y = window.scrollY;
                    focusElement.focus();
                    window.scrollTo(x, y);
                }
                if (!event.button) {
                    input.onSurfaceEvent(element, Input.ACTION.PRESS, event);
                }
            }
        );

        element.addEventListener(
            'mousemove',
            function onMouseMove(event) {
                if (input.fTouch) return;
                input.onSurfaceEvent(element, Input.ACTION.MOVE, event);
            }
        );

        element.addEventListener(
            'mouseup',
            function onMouseUp(event) {
                if (input.fTouch) return;
                if (!event.button) {
                    input.onSurfaceEvent(element, Input.ACTION.RELEASE, event);
                }
            }
        );

        element.addEventListener(
            'mouseout',
            function onMouseOut(event) {
                if (input.fTouch) return;
                if (input.xStart < 0) {
                    input.onSurfaceEvent(element, Input.ACTION.MOVE, event);
                } else {
                    input.onSurfaceEvent(element, Input.ACTION.RELEASE, event);
                }
            }
        );
    }

    /**
     * captureTouch(element)
     *
     * @this {Input}
     * @param {Element} element
     */
    captureTouch(element)
    {
        let input = this;

        /*
         * NOTE: The mouse event handlers below deal only with events where the left button is involved
         * (ie, left button is pressed, down, or released).
         */
        element.addEventListener(
            'touchstart',
            function onTouchStart(event) {
                /*
                 * Under normal circumstances (ie, when fScroll is false), when any touch events arrive,
                 * onSurfaceEvent() calls preventDefault(), which prevents a variety of potentially annoying
                 * behaviors (ie, zooming, scrolling, fake mouse events, etc).  Under non-normal circumstances,
                 * (ie, when fScroll is true), we set fTouch on receipt of a 'touchstart' event, which will
                 * help our mouse event handlers avoid any redundant actions due to fake mouse events.
                 */
                if (input.fScroll) input.fTouch = true;
                input.onSurfaceEvent(element, Input.ACTION.PRESS, event);
            }
        );

        element.addEventListener(
            'touchmove',
            function onTouchMove(event) {
                input.onSurfaceEvent(element, Input.ACTION.MOVE, event);
            }
        );

        element.addEventListener(
            'touchend',
            function onTouchEnd(event) {
                input.onSurfaceEvent(element, Input.ACTION.RELEASE, event);
            }
        );
    }

    /**
     * checkAutoRelease()
     *
     * Auto-release handler for active keys.
     *
     * @this {Input}
     */
    checkAutoRelease()
    {
        let i = 0;
        let msDelayMin = -1;
        while (i < this.aActiveKeys.length) {
            if (this.aActiveKeys[i].autoRelease) {
                let keyNum = this.aActiveKeys[i].keyNum;
                let msDown = this.aActiveKeys[i].msDown;
                let msElapsed = Date.now() - msDown;
                let msDelay = Input.BUTTON_DELAY - msElapsed;
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
                    this.removeActiveKey(keyNum);
                    i = 0;
                    continue;
                }
            }
            i++;
        }
        if (msDelayMin >= 0) {
            this.time.setTimer(this.timerAutoRelease, msDelayMin);
        }
    }

    /**
     * getActiveKey(index)
     *
     * @this {Input}
     * @param {number} index
     * @return {number} (the requested active keyNum, -1 if none)
     */
    getActiveKey(index)
    {
        let keyNum = -1;
        if (index < this.aActiveKeys.length) {
            keyNum = this.aActiveKeys[index].keyNum;
        }
        return keyNum;
    }

    /**
     * getKeyState(id)
     *
     * @this {Input}
     * @param {string} id
     * @return {number|undefined} 1 if down, 0 if up, undefined otherwise
     */
    getKeyState(id)
    {
        let state;
        if (this.idMap) {
            let key = this.idMap[id];
            if (key) state = key.state;
        }
        return state;
    }

    /**
     * addActiveKey(keyNum, autoRelease)
     *
     * @this {Input}
     * @param {number|Array.<number>} keyNum
     * @param {boolean} [autoRelease]
     */
    addActiveKey(keyNum, autoRelease = false)
    {
        if (typeof keyNum != "number") {
            for (let i = 0; i < keyNum.length; i++) {
                this.addActiveKey(keyNum[i]);
            }
            return;
        }
        let i = this.isActiveKey(keyNum);
        if (i < 0) {
            let msDown = Date.now();
            this.aActiveKeys.push({
                keyNum, msDown, autoRelease
            });
            this.printf(MESSAGE.KEY + MESSAGE.INPUT, "addActiveKey(keyNum=%d)\n", keyNum);
        } else {
            this.aActiveKeys[i].msDown = Date.now();
            this.aActiveKeys[i].autoRelease = autoRelease;
        }
        if (autoRelease) this.checkAutoRelease();
    }

    /**
     * isActiveKey(keyNum)
     *
     * @this {Input}
     * @param {number} keyNum
     * @return {number} index of keyNum in aActiveKeys, or -1 if not found
     */
    isActiveKey(keyNum)
    {
        for (let i = 0; i < this.aActiveKeys.length; i++) {
            if (this.aActiveKeys[i].keyNum == keyNum) return i;
        }
        return -1;
    }

    /**
     * removeActiveKey(keyNum)
     *
     * @this {Input}
     * @param {number|Array.<number>} keyNum
     */
    removeActiveKey(keyNum)
    {
        if (typeof keyNum != "number") {
            for (let i = 0; i < keyNum.length; i++) {
                this.removeActiveKey(keyNum[i]);
            }
            return;
        }
        let i = this.isActiveKey(keyNum);
        if (i >= 0) {
            if (!this.aActiveKeys[i].autoRelease) {
                let msDown = this.aActiveKeys[i].msDown;
                if (msDown) {
                    let msElapsed = Date.now() - msDown;
                    if (msElapsed < Input.BUTTON_DELAY) {
                        this.aActiveKeys[i].autoRelease = true;
                        this.checkAutoRelease();
                        return true;
                    }
                }
            }
            this.printf(MESSAGE.KEY + MESSAGE.INPUT, "removeActiveKey(keyNum=%d)\n", keyNum);
            this.aActiveKeys.splice(i, 1);
        } else {
            this.printf(MESSAGE.KEY + MESSAGE.INPUT, "removeActiveKey(keyNum=%d): up without down?\n", keyNum);
        }
    }

    /**
     * onKeyCode(code, down, autoRelease)
     *
     * @this {Input}
     * @param {number} code (ie, keyCode if down is defined, charCode if undefined)
     * @param {boolean} [down] (true if keydown, false if keyup, undefined if keypress)
     * @param {boolean} [autoRelease]
     * @return {boolean} (true if processed, false if not)
     */
    onKeyCode(code, down, autoRelease=false)
    {
        let keyCode, keyName;
        if (down != undefined) {
            keyCode = WebIO.FF_KEYCODE[code] || code;       // fix any Firefox-specific keyCodes
            keyName = WebIO.KEYNAME[code];
        } else {
            keyCode = 0;
            keyName = String.fromCharCode(code).toUpperCase();
        }
        if (this.gridMap) {
            if (down === false) return true;
            for (let row = 0; row < this.gridMap.length; row++) {
                let rowMap = this.gridMap[row];
                for (let col = 0; col < rowMap.length; col++) {
                    let aParts = rowMap[col].split('|');
                    if (aParts.indexOf(keyName) >= 0) {
                        if (this.keyState) {
                            if (this.keysPressed.length < 16) {
                                this.keysPressed.push(code);
                            }
                        } else {
                            this.keyState = 1;
                            this.keyActive = keyName;
                            this.setPosition(col, row);
                            this.checkKeyListeners(keyName, true);
                            this.advanceKeyState();
                        }
                        return true;
                    }
                }
            }
        }
        if (this.idMap) {
            if (down != undefined) {
                let ids = Object.keys(this.idMap);
                for (let i = 0; i < ids.length; i++) {
                    let id = ids[i];
                    if (this.idMap[id].keys.indexOf(keyName) >= 0) {
                        this.checkKeyListeners(id, down);
                        this.idMap[id].state = down? 1 : 0;
                        return true;
                    }
                }
            }
        }
        if (this.keyMap) {
            if (!keyCode) {
                return true;            // if we received a charCode rather than a keyCode, just consume it
            }
            let keyNum = this.keyMap[keyCode];
            if (keyNum) {
                if (down) {
                    this.addActiveKey(keyNum, autoRelease);
                } else {
                    this.removeActiveKey(keyNum);
                }
                return true;            // success is automatic when the keyCode is in the keyMap; consume it
            }
        }
        return false;
    }

    /**
     * onKeyTimer()
     *
     * @this {Input}
     */
    onKeyTimer()
    {

        if (this.keyState == 1) {
            this.keyState++;
            this.checkKeyListeners(this.keyActive, false);
            this.keyActive = "";
            this.setPosition(-1, -1);
            this.advanceKeyState();
        } else {
            this.keyState = 0;
            if (this.keysPressed.length) {
                this.onKeyCode(this.keysPressed.shift());
            }
        }
    }

    /**
     * onReset()
     *
     * Called by the Machine device to provide notification of a reset event.
     *
     * @this {Input}
     */
    onReset()
    {
        /*
         * As keyDown events are encountered, the event keyCode is checked against the active keyMap, if any.
         * If the keyCode exists in the keyMap, then each keyNum in the keyMap is added to the aActiveKeys array.
         * As each key is released (or auto-released), its entry is removed from the array.
         */
        this.aActiveKeys = [];

        /*
         * The current (assumed) physical (and simulated) states of the various shift/lock keys.
         *
         * TODO: Determine how (or whether) we can query the browser's initial shift/lock key states.
         */
        this.bitsState = 0;

        /*
         * Finally, the active input state.  If there is no active input, col and row are -1.  After
         * this point, these variables will be updated by setPosition().
         */
        this.col = this.row = -1;
    }

    /**
     * onSurfaceEvent(element, action, event)
     *
     * @this {Input}
     * @param {Element} element
     * @param {number} action
     * @param {Event|MouseEvent|TouchEvent} [event] (eg, the object from a 'touch' or 'mouse' event)
     */
    onSurfaceEvent(element, action, event)
    {
        let col = -1, row = -1;
        let fMultiTouch = false;
        let x, y, xInput, yInput, fButton, fInput, fPower;

        if (action < Input.ACTION.RELEASE) {

            /**
             * @name Event
             * @property {Array} targetTouches
             */
            event = event || window.event;

            if (!event.targetTouches || !event.targetTouches.length) {
                x = event.clientX;
                y = event.clientY;
            } else {
                x = event.targetTouches[0].clientX;
                y = event.targetTouches[0].clientY;
                fMultiTouch = (event.targetTouches.length > 1);
            }

            /*
             * The following code replaces the older code below it.  It requires that we use clientX and clientY
             * instead of pageX and pageY from the targetTouches array.  The older code seems to be completely broken
             * whenever the page is full-screen, hence this change.
             */
            let rect = event.target.getBoundingClientRect();
            x -= rect.left;
            y -= rect.top;

            /*
             * Touch coordinates (that is, the pageX and pageY properties) are relative to the page, so to make
             * them relative to the element, we must subtract the element's left and top positions.  This Apple document:
             *
             *      https://developer.apple.com/library/safari/documentation/AudioVideo/Conceptual/HTML-canvas-guide/AddingMouseandTouchControlstoCanvas/AddingMouseandTouchControlstoCanvas.html
             *
             * makes it sound simple, but it turns out we have to walk the element's entire "parentage" of DOM elements to
             * get the exact offsets.
             *
             *      let xOffset = 0;
             *      let yOffset = 0;
             *      let elementNext = element;
             *      do {
             *          if (!isNaN(elementNext.offsetLeft)) {
             *              xOffset += elementNext.offsetLeft;
             *              yOffset += elementNext.offsetTop;
             *          }
             *      } while ((elementNext = elementNext.offsetParent));
             *      x -= xOffset;
             *      y -= yOffset;
             */

            /*
             * Due to the responsive nature of our pages, the displayed size of the surface image may be smaller than
             * the original size, and the coordinates we receive from events are based on the currently displayed size.
             */
            x = (x * (this.cxSurface / element.offsetWidth))|0;
            y = (y * (this.cySurface / element.offsetHeight))|0;

            xInput = x - this.xInput;
            yInput = y - this.yInput;

            /*
             * fInput is set if the event occurred somewhere within the input region (ie, the calculator keypad),
             * either on a button or between buttons, whereas fButton is set if the event occurred squarely (rectangularly?)
             * on a button.  fPower deals separately with the power button; it is set if the event occurred on the
             * power button.
             */
            fInput = fButton = false;
            fPower = (x >= this.xPower && x < this.xPower + this.cxPower && y >= this.yPower && y < this.yPower + this.cyPower);

            /*
             * I use the top of the input region, less some gap, to calculate a dividing line, above which
             * default actions should be allowed, and below which they should not.  Ditto for any event inside
             * the power button.
             */
            if (xInput >= 0 && xInput < this.cxInput && yInput + this.cyGap >= 0 || fPower) {
                /*
                 * If we allow touch events to be processed, they will generate mouse events as well, causing
                 * confusion and delays.  We can sidestep that problem by preventing default actions on any event
                 * that occurs within the input region.  One downside is that you can no longer scroll or zoom the
                 * image using touch, but that may be just as well, because you probably don't want sloppy touches
                 * moving your display around (or worse, a rapid double-tap zooming the display).  I do try to
                 * make one small concession for two-finger zoom operations (see fMultiTouch), but that's a bit
                 * fiddly, because it depends on both fingers hitting the surface at the same instant.
                 */
                if (!fMultiTouch && !this.fScroll) event.preventDefault();

                if (xInput >= 0 && xInput < this.cxInput && yInput >= 0 && yInput < this.cyInput) {
                    fInput = true;
                    /*
                     * The width and height of each column and row could be determined by computing cxGap + cxButton
                     * and cyGap + cyButton, respectively, but those gap and button sizes are merely estimates, and should
                     * only be used to help with the final button coordinate checks farther down.
                     */
                    let cxCol = (this.cxInput / this.nCols) | 0;
                    let cyCol = (this.cyInput / this.nRows) | 0;
                    let colInput = (xInput / cxCol) | 0;
                    let rowInput = (yInput / cyCol) | 0;

                    /*
                     * If the grid is hexagonal (aka "Lite-Brite" mode), then the cells of even-numbered rows are
                     * offset horizontally by 1/2 cell.  In addition, the last cell in those rows is unused, so if
                     * after compensating by 1/2 cell, the target column is the last cell, we set xInput to -1,
                     * effectively ignoring input on that cell.
                     */
                    if (this.fHexagonal && !(rowInput & 0x1)) {
                        xInput -= (cxCol >> 1);
                        colInput = (xInput / cxCol) | 0;
                        if (colInput == this.nCols - 1) xInput = -1;
                    }

                    /*
                     * (xCol,yCol) will be the top left corner of the button closest to the point of input.  However, that's
                     * based on our gap estimate.  If things seem "too tight", shrink the gap estimates, which will automatically
                     * increase the button size estimates.
                     */
                    let xCol = colInput * cxCol + (this.cxGap >> 1);
                    let yCol = rowInput * cyCol + (this.cyGap >> 1);

                    xInput -= xCol;
                    yInput -= yCol;
                    if (xInput >= 0 && xInput < this.cxButton && yInput >= 0 && yInput < this.cyButton) {
                        col = colInput;
                        row = rowInput;
                        fButton = true;
                    }
                }
            }
        }

        this.checkSurfaceListeners(action, xInput || 0, yInput || 0, element.offsetWidth, element.offsetHeight);

        if (fMultiTouch) return;

        if (action == Input.ACTION.PRESS) {
            /*
             * Record the position of the event, transitioning xStart and yStart to non-negative values.
             */
            this.xStart = x;
            this.yStart = y;
            if (fInput) {
                /*
                 * The event occurred in the input region, so we call setPosition() regardless of whether
                 * it hit or missed a button.
                 */
                this.setPosition(col, row);
                /*
                 * On the other hand, if it DID hit a button, then we arm the auto-release timer, to ensure
                 * a minimum amount of time (ie, BUTTON_DELAY).
                 */
                if (fButton && this.buttonDelay) {
                    this.time.setTimer(this.timerInputRelease, this.buttonDelay, true);
                }
            } else if (fPower) {
                this.machine.onPower();
            }
        }
        else if (action == Input.ACTION.MOVE) {
            if (this.xStart >= 0 && this.yStart >= 0 && this.fDrag) {
                this.setPosition(col, row);
            }
            else if (this.onHover) {
                this.onHover(col, row);
            }
        }
        else if (action == Input.ACTION.RELEASE) {
            /*
             * Don't immediately signal the release if the release timer is active (let the timer take care of it).
             */
            if (!this.buttonDelay || !this.time.isTimerSet(this.timerInputRelease)) {
                this.setPosition(-1, -1);
            }
            this.xStart = this.yStart = -1;
        }
        else {
            this.println("unrecognized action: " + action);
        }
    }

    /**
     * setFocus()
     *
     * If we have a focusable input element, give it focus.  This is used by the Debugger, for example, to switch focus
     * after starting the machine.
     *
     * @this {Input}
     */
    setFocus()
    {
        /*
         * In addition, we now check machine.ready, to avoid jerking the page's focus around when a machine is first
         * powered; it won't be marked ready until all the onPower() calls have completed, including the CPU's onPower()
         * call, which in turn calls setFocus().
         */
        let focusElement = this.altFocus? this.altFocusElement : this.focusElement;
        if (focusElement && this.machine.ready) {
            this.printf('setFocus("%s")\n', focusElement.id || focusElement.nodeName);
            focusElement.focus();
            focusElement.scrollIntoView();      // one would have thought focus() would do this, but apparently not....
        }
    }

    /**
     * setAltFocus(fAlt)
     *
     * When a device (eg, Monitor) needs us to use altFocusElement as the input focus (eg, when the machine is running
     * full-screen), it calls setAltFocus(true).
     *
     * @this {Input}
     * @param {boolean} fAlt
     */
    setAltFocus(fAlt)
    {
        this.altFocus = fAlt;
        this.setFocus();
    }

    /**
     * setPosition(col, row)
     *
     * @this {Input}
     * @param {number} col
     * @param {number} row
     */
    setPosition(col, row)
    {
        if (col != this.col || row != this.row) {
            this.col = col;
            this.row = row;
            if (this.onInput) this.onInput(col, row);
        }
    }
}

Input.ACTION = {
    PRESS:      1,              // eg, an action triggered by a 'mousedown' or 'touchstart' event
    MOVE:       2,              // eg, an action triggered by a 'mousemove' or 'touchmove' event
    RELEASE:    3               // eg, an action triggered by a 'mouseup' (or 'mouseout') or 'touchend' event
};

Input.BINDING = {
    POWER:      "power",
    RESET:      "reset",
    SURFACE:    "surface"
};

Input.TYPE = {
    IDMAP:      "idMap",
    SWITCH:     "switch"
};

Input.BUTTON_DELAY = 50;    // minimum number of milliseconds to ensure between button presses and releases

Defs.CLASSES["Input"] = Input;

/**
 * @copyright https://www.pcjs.org/modules/devices/main/led.js (C) Jeff Parsons 2012-2019
 */

/** @typedef {{ class: string, bindings: (Object|undefined), version: (number|undefined), overrides: (Array.<string>|undefined), type: number, width: (number|undefined), height: (number|undefined), cols: (number|undefined), colsExtra: (number|undefined), rows: (number|undefined), rowsExtra: (number|undefined), color: (string|undefined), backgroundColor: (string|undefined), fixed: (boolean|undefined), hexagonal: (boolean|undefined), highlight: (boolean|undefined), persistent: (boolean|undefined) }} */
var LEDConfig;

/**
 * The ultimate goal is to provide support for a variety of LED types, such as:
 *
 * 1) LED Light (single light)
 * 2) LED Digit (7-segment digit)
 *
 * The initial goal is to manage a 12-element array of 7-segment LED digits for the TI-57.
 *
 * We create a "view" canvas element inside the specified "container" element, along with a "grid" canvas
 * where all the real drawing occurs; drawView() then renders the "grid" canvas onto the "view" canvas.
 *
 * Internally, our LED digits have a width and height of 96 and 128.  Those are "grid" dimensions which
 * cannot be changed, because our table of drawing coordinates in LED.SEGMENTS are hard-coded for those
 * dimensions.  The cell width and height that are specified as part of the LEDConfig are "view" dimensions,
 * which usually match the grid dimensions, but you're welcome to scale them up or down; the browser's
 * drawImage() function takes care of that.
 *
 * There is a low-level function, drawGridSegment(), for drawing specific LED segments of specific digits;
 * generally, you start with clearGrid(), draw all the segments for a given update, and then call drawView()
 * to make them visible.
 *
 * However, our devices operate at a higher level.  They use setLEDState() to modify the state,
 * character, etc, that each of the LED cells should display, which updates our internal LED buffer.  Then
 * at whatever display refresh rate is set (typically 60Hz), drawBuffer() is called to see if the buffer
 * contents have been modified since the last refresh, and if so, it converts the contents of the buffer to
 * a string and calls drawString().
 *
 * This buffering strategy, combined with the buffer "tickled" flag (see below), not only makes life
 * simple for this device, but also simulates how the display goes blank for short periods of time while
 * the CPU is busy performing calculations.
 *
 * @class {LED}
 * @unrestricted
 * @property {LEDConfig} config
 * @property {number} type (one of the LED.TYPE values)
 * @property {number} width (default is 96 for LED.TYPE.DIGIT, 32 otherwise; see LED.SIZES)
 * @property {number} height (default is 128 for LED.TYPE.DIGIT, 32 otherwise; see LED.SIZES)
 * @property {number} cols (default is 1)
 * @property {number} rows (default is 1)
 * @property {number} colsView (default is cols)
 * @property {number} rowsView (default is rows)
 * @property {string} color (default is none; ie, transparent foreground)
 * @property {string} colorBackground (default is none; ie, transparent background)
 * @property {boolean} fFixed (default is false, meaning the view may fill the container to its maximum size)
 * @property {boolean} fHexagonal (default is false)
 * @property {boolean} fHighlight (default is true)
 * @property {boolean} fPersistent (default is false for LED.TYPE.DIGIT, meaning the view will be blanked if not refreshed)
 * @property {number} widthView (computed)
 * @property {number} heightView (computed)
 * @property {number} widthGrid (computed)
 * @property {number} heightGrid (computed)
 * @property {HTMLCanvasElement} canvasView
 * @property {CanvasRenderingContext2D} contextView
 * @property {HTMLCanvasElement} canvasGrid
 * @property {CanvasRenderingContext2D} contextGrid
 * @property {{ container: Element|undefined }} bindings
 * @property {Array.<string|number|null>} buffer
 * @property {Array.<string|number>|null} bufferClone
 * @property {boolean} fBufferModified
 * @property {boolean} fBufferTickled
 */
class LED extends Device {
    /**
     * LED(idMachine, idDevice, config)
     *
     * Sample config:
     *
     *      "display": {
     *        "class": "LED",
     *        "type": 3,
     *        "cols": 12,
     *        "rows": 1,
     *        "color": "red",
     *        "bindings": {
     *          "container": "displayTI57"
     *        }
     *      }
     *
     * @this {LED}
     * @param {string} idMachine
     * @param {string} idDevice
     * @param {LEDConfig} [config]
     */
    constructor(idMachine, idDevice, config)
    {
        super(idMachine, idDevice, config, ["color", "backgroundColor"]);

        let container = this.bindings[LED.BINDING.CONTAINER];
        if (!container) {
            let sError = "LED binding for '" + LED.BINDING.CONTAINER + "' missing: '" + this.config.bindings[LED.BINDING.CONTAINER] + "'";
            throw new Error(sError);
        }

        let canvasView = /** @type {HTMLCanvasElement} */ (document.createElement("canvas"));
        if (!canvasView || !canvasView.getContext) {
            let sError = "LED device requires HTML5 canvas support";
            container.innerHTML = sError;
            throw new Error(sError);
        }

        this.container = container;
        this.canvasView = canvasView;

        this.type = this.getBounded(this.getDefaultNumber('type', LED.TYPE.ROUND, LED.TYPES), LED.TYPE.SMALL, LED.TYPE.DIGIT);
        this.widthCell = LED.SIZES[this.type][0];
        this.heightCell = LED.SIZES[this.type][1];
        this.width = this.getDefaultNumber('width', this.widthCell);
        this.height = this.getDefaultNumber('height', this.heightCell);
        this.colsView = this.getDefaultNumber('cols',  1);
        this.cols = this.colsView + this.getDefaultNumber('colsExtra', 0);
        this.rowsView = this.getDefaultNumber('rows',  1);
        this.rows = this.rowsView + this.getDefaultNumber('rowsExtra', 0);
        this.widthView = this.width * this.colsView;
        this.heightView = this.height * this.rowsView;

        this.colorTransparent = this.getRGBAColor("black", 0);
        this.colorOn = this.getRGBColor(this.config['color']) || this.colorTransparent;
        this.colorOff = this.getRGBAColor(this.colorOn, 1.0, 0.25);
        this.colorHighlight = this.getRGBAColor(this.colorOn, 1.0, 2.0);
        this.colorBackground = this.getRGBColor(this.config['backgroundColor']);

        /*
         * We generally want our view canvas to be "responsive", not "fixed" (ie, to automatically resize
         * with changes to the overall window size), so we apply the following style attributes:
         *
         *      width: 100%;
         *      height: auto;
         *
         * But, if you really don't want that feature, then set the LED config's "fixed" property to true.
         */
        this.fFixed = this.getDefaultBoolean('fixed', false);
        if (!this.fFixed) {
            canvasView.style.width = "100%";
            canvasView.style.height = "auto";
        }

        /*
         * Hexagonal (aka "Lite-Brite" mode) and highlighting options
         */
        this.fHexagonal = this.getDefaultBoolean('hexagonal', false);
        this.fHighlight = this.getDefaultBoolean('highlight', true);

        /*
         * Persistent LEDS are the default, except for LED.TYPE.DIGIT, which is used with calculator displays
         * whose underlying hardware must constantly "refresh" the LEDs to prevent them from going dark.
         */
        this.fPersistent = this.getDefaultBoolean('persistent', (this.type < LED.TYPE.DIGIT));

        canvasView.setAttribute("width", this.widthView.toString());
        canvasView.setAttribute("height", this.heightView.toString());
        canvasView.style.backgroundColor = this.colorTransparent;
        container.appendChild(canvasView);
        this.contextView = /** @type {CanvasRenderingContext2D} */ (canvasView.getContext("2d"));

        /*
         * canvasGrid is where all LED segments are composited; then they're drawn onto canvasView.
         */
        this.canvasGrid = /** @type {HTMLCanvasElement} */ (document.createElement("canvas"));
        if (this.canvasGrid) {
            this.canvasGrid.width = this.widthGrid = this.widthCell * this.colsView;
            this.canvasGrid.height = this.heightGrid = this.heightCell * this.rowsView;
            this.contextGrid = this.canvasGrid.getContext("2d");
        }

        /*
         * Time to allocate our internal LED buffer.  Other devices access the buffer through interfaces
         * like setLEDState() and getLEDState().  The LED buffer contains four per elements per LED cell:
         *
         *      [0]:    state (eg, ON or OFF or a digit)
         *      [1]:    color
         *      [2]:    count(s) (eg, 0 to 8  4-bit counts)
         *      [3]:    flags (eg, PERIOD, MODIFIED, etc)
         *
         * The LED buffer also contains an extra (scratch) row at the end.  This extra row, along with the
         * dynamically allocated "clone" buffer, is used by the LED Controller for direct buffer manipulation;
         * see the low-level getBuffer(), getBufferClone(), and swapBuffers() interfaces.
         */
        this.nBufferInc = 4;
        this.nBufferCells = ((this.rows + 1) * this.cols) * this.nBufferInc;
        this.buffer = new Array(this.nBufferCells);
        this.bufferClone = null;
        this.nBufferIncExtra = (this.colsView < this.cols? (this.cols - this.colsView) * 4 : 0);

        /*
         * fBufferModified is straightforward: set to true by any setLEDState() call that actually
         * changed something in the LED buffer, set to false after every drawBuffer() call, periodic
         * or otherwise.
         *
         * fBufferTickled is a flag which, under normal (idle) circumstances, will constantly be set
         * to true by periodic display operations that call setLEDState(); we clear it after every
         * periodic drawBuffer(), so if the machine fails to execute a setBuffer() in a timely manner,
         * we will see that fBufferTickled hasn't been "tickled", and automatically blank the display.
         *
         * fDisplayOn is a global "on/off" switch for the entire display.
         */
        this.fBufferModified = this.fBufferTickled = false;
        this.msLastDraw = 0;
        this.fDisplayOn = true;

        /*
         * nShiftedLeft is an optimization that tells drawGrid() when it can minimize the number of
         * individual cells to redraw, by shifting the entire grid image leftward and redrawing only
         * the rightmost cells.
         */
        this.nShiftedLeft = 0;

        /*
         * This records the location of the most recent LED buffer location updated via setLEDState(),
         * in case we want to highlight it.
         */
        this.iBufferRecent = -1;

        let led = this;
        this.time = /** @type {Time} */ (this.findDeviceByClass("Time"));
        this.time.addAnimation(function ledAnimate(t) {
            led.drawBuffer(false, t);
        });

        led.clearBuffer(true);
    }

    /**
     * clearBuffer(fDraw)
     *
     * @this {LED}
     * @param {boolean} [fDraw]
     */
    clearBuffer(fDraw)
    {
        this.initBuffer(this.buffer);
        this.fBufferModified = this.fBufferTickled = true;
        if (fDraw) this.drawBuffer(true);
    }

    /**
     * clearGrid()
     *
     * @this {LED}
     */
    clearGrid()
    {
        if (this.colorBackground) {
            this.contextGrid.fillStyle = this.colorBackground;
            this.contextGrid.fillRect(0, 0, this.widthGrid, this.heightGrid);
        } else {
            this.contextGrid.clearRect(0, 0, this.widthGrid, this.heightGrid);
        }
    }

    /**
     * clearGridCell(col, row, xOffset)
     *
     * @this {LED}
     * @param {number} col
     * @param {number} row
     * @param {number} xOffset
     */
    clearGridCell(col, row, xOffset)
    {
        let xDst = col * this.widthCell + xOffset;
        let yDst = row * this.heightCell;
        if (this.colorBackground) {
            this.contextGrid.fillStyle = this.colorBackground;
            this.contextGrid.fillRect(xDst, yDst, this.widthCell, this.heightCell);
        } else {
            this.contextGrid.clearRect(xDst, yDst, this.widthCell, this.heightCell);
        }
    }

    /**
     * drawBuffer(fForced, t)
     *
     * This is our periodic (60Hz) redraw function; however, it can also be called synchronously
     * (eg, see clearBuffer()).  The other important periodic side-effect of this function is clearing
     * fBufferTickled, so that if no other setLEDState() calls occur between now and the next drawBuffer(),
     * an automatic clearBuffer() will be triggered.  This simulates the normal blanking of the display
     * whenever the machine performs lengthy calculations, because for an LED display to remain lit,
     * the machine must perform a display operation ("refresh") at least 30-60 times per second.
     *
     * @this {LED}
     * @param {boolean} [fForced] (if not set, this is a normal refresh call)
     * @param {number} [t] (time value, if available, from the requestAnimationFrame() callback)
     */
    drawBuffer(fForced = false, t = 0)
    {
        if (this.fBufferModified || fForced) {
            if (this.type < LED.TYPE.DIGIT) {
                this.drawGrid(fForced);
            } else {
                let s = "";
                for (let i = 0; i < this.buffer.length; i += this.nBufferInc) {
                    s += this.buffer[i] || ' ';
                    if (this.buffer[i+3] & LED.FLAGS.PERIOD) s += '.';
                }
                this.drawString(s);
            }
            this.fBufferModified = false;
            this.iBufferRecent = -1;
        }
        else if (!this.fPersistent && !this.fBufferTickled) {
            if (!t || !this.msLastDraw || (t - this.msLastDraw) >= ((1000 / 60)|0)) {
                this.clearBuffer(true);
            }
        }
        this.fBufferTickled = false;
        if (t) this.msLastDraw = t;
    }

    /**
     * drawGrid(fForced)
     *
     * Used by drawBuffer() for LED.TYPE.ROUND, LED.TYPE.SQUARE, etc.
     *
     * If the buffer was recently shifted left (ie, nShiftedLeft is set), then we take advantage
     * of that knowledge to use drawImage() to shift the entire grid image left, and then redrawing
     * only the rightmost visible column.
     *
     * @this {LED}
     * @param {boolean} [fForced] (if not set, this is a normal refresh call)
     */
    drawGrid(fForced)
    {
        let colRedraw = 0;
        if (!this.fPersistent || fForced) {
            this.clearGrid();
        } else if (this.nShiftedLeft) {
            colRedraw = this.colsView - this.nShiftedLeft;
            let xStart = this.widthCell * this.nShiftedLeft;
            let cxVisible = this.widthCell * colRedraw;
            this.contextGrid.drawImage(this.canvasGrid, xStart, 0, cxVisible, this.heightGrid, 0, 0, cxVisible, this.heightGrid);
            /*
             * At this point, the only grid drawing we might need to do now is the column at colRedraw,
             * but we still loop over the entire buffer to ensure all the cell MODIFIED states are in sync.
             */
        }
        let i = 0;
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.colsView; col++) {
                let state = this.buffer[i];
                let color = this.buffer[i+1] || this.colorTransparent;
                let fLeaveModified = false;
                let fModified = !!(this.buffer[i+3] & LED.FLAGS.MODIFIED);
                let fHighlight = (this.fHighlight && i == this.iBufferRecent);
                if (!this.fDisplayOn && state) {
                    state = LED.STATE.OFF;
                    fModified = fLeaveModified = true;
                }
                if (fModified || fHighlight || fForced) {
                    if (col >= colRedraw) {
                        this.drawGridCell(state, color, col, row, fHighlight);
                    }
                    if (fHighlight || fLeaveModified) {
                        this.buffer[i+3] |= LED.FLAGS.MODIFIED;
                    } else {
                        this.buffer[i+3] &= ~LED.FLAGS.MODIFIED;
                    }
                }
                i += this.nBufferInc;
            }
            i += this.nBufferIncExtra;
        }
        this.nShiftedLeft = 0;
        this.drawView();
    }

    /**
     * drawGridCell(state, color, col, row, fHighlight)
     *
     * Used by drawGrid() for LED.TYPE.ROUND, LED.TYPE.SQUARE, etc.
     *
     * @this {LED}
     * @param {string} state (eg, LED.STATE.ON or LED.STATE.OFF)
     * @param {string} [color]
     * @param {number} [col] (default is zero)
     * @param {number} [row] (default is zero)
     * @param {boolean} [fHighlight] (true if the cell should be highlighted; default is false)
     */
    drawGridCell(state, color, col = 0, row = 0, fHighlight = false)
    {
        let xOffset = 0;
        if (this.fHexagonal) {
            if (!(row & 0x1)) {
                xOffset = (this.widthCell >> 1);
                if (col == this.colsView - 1) return;
            }
        }

        let colorOn, colorOff;
        if (!color || color == this.colorOn) {
            colorOn = fHighlight? this.colorHighlight : this.colorOn;
            colorOff = this.colorOff;
        } else {
            colorOn = fHighlight? this.getRGBAColor(color, 1.0, 2.0) : color;
            colorOff = this.getRGBAColor(color, 1.0, 0.25);
        }

        let fTransparent = false;
        let colorCell = (state? colorOn : colorOff);
        if (colorOn == this.colorTransparent) {
            colorCell = this.colorBackground;
            fTransparent = true;
        }

        let xDst = col * this.widthCell + xOffset;
        let yDst = row * this.heightCell;

        /*
         * If this is NOT a persistent LED display, then drawGrid() will have done a preliminary clearGrid(),
         * eliminating the need to clear individual cells.  Whereas if this IS a persistent LED display, then
         * we need to clear cells on an as-drawn basis.  If we don't, there could be residual "bleed over"
         * around the edges of the shape we drew here previously.
         */
        if (this.fPersistent) {
            this.clearGridCell(col, row, xOffset);
        }

        this.contextGrid.fillStyle = colorCell;

        let coords = LED.SHAPES[this.type];
        if (coords.length == 3) {
            this.contextGrid.beginPath();
            this.contextGrid.arc(xDst + coords[0], yDst + coords[1], coords[2], 0, Math.PI * 2);
            if (fTransparent) {
                /*
                 * The following code works as well:
                 *
                 *      this.contextGrid.save();
                 *      this.contextGrid.clip();
                 *      this.contextGrid.clearRect(xDst, yDst, this.widthCell, this.heightCell);
                 *      this.contextGrid.restore();
                 *
                 * but I assume it's not as efficient.
                 */
                this.contextGrid.globalCompositeOperation = "destination-out";
                this.contextGrid.fill();
                this.contextGrid.globalCompositeOperation = "source-over";
            } else {
                this.contextGrid.fill();
            }
        } else {
            this.contextGrid.fillRect(xDst + coords[0], yDst + coords[1], coords[2], coords[3]);
        }
    }

    /**
     * drawGridSegment(seg, col, row)
     *
     * Used by drawSymbol() for LED.TYPE.DIGIT.
     *
     * @this {LED}
     * @param {string} seg (eg, "A")
     * @param {number} [col] (default is zero)
     * @param {number} [row] (default is zero)
     */
    drawGridSegment(seg, col = 0, row = 0)
    {
        let coords = LED.SEGMENTS[seg];
        if (coords) {
            let xDst = col * this.widthCell;
            let yDst = row * this.heightCell;
            this.contextGrid.fillStyle = this.colorOn;
            this.contextGrid.beginPath();
            if (coords.length == 3) {
                this.contextGrid.arc(xDst + coords[0], yDst + coords[1], coords[2], 0, Math.PI * 2);
            } else {
                for (let i = 0; i < coords.length; i += 2) {
                    if (!i) {
                        this.contextGrid.moveTo(xDst + coords[i], yDst + coords[i+1]);
                    } else {
                        this.contextGrid.lineTo(xDst + coords[i], yDst + coords[i+1]);
                    }
                }
            }
            this.contextGrid.closePath();
            this.contextGrid.fill();
        }
    }

    /**
     * drawString(s)
     *
     * Used by drawBuffer() for LED.TYPE.DIGIT.
     *
     * @this {LED}
     * @param {string} s
     */
    drawString(s)
    {
        this.clearGrid();
        for (let i = 0, col = 0, row = 0; i < s.length; i++) {
            let ch = s[i];
            if (ch == '.') {
                if (col) col--;
            }
            this.drawSymbol(ch, col, row);
            if (++col == this.colsView) {
                col = 0;
                if (++row == this.rows) {
                    break;
                }
            }
        }
        this.drawView();
    }

    /**
     * drawSymbol(symbol, col, row)
     *
     * Used by drawString() for LED.TYPE.DIGIT.
     *
     * If the symbol does not exist in LED.SYMBOL_SEGMENTS, then nothing is drawn.
     *
     * @this {LED}
     * @param {string} symbol
     * @param {number} [col] (default is zero)
     * @param {number} [row] (default is zero)
     */
    drawSymbol(symbol, col = 0, row = 0)
    {
        let segments = LED.SYMBOL_SEGMENTS[symbol];
        if (segments) {
            for (let i = 0; i < segments.length; i++) {
                this.drawGridSegment(segments[i], col, row)
            }
        }
    }

    /**
     * drawView()
     *
     * @this {LED}
     */
    drawView()
    {
        /*
         * Setting the 'globalCompositeOperation' property of a 2D context is something you rarely need to do,
         * because the default draw behavior ("source-over") is fine for most cases.  One case where it is NOT
         * fine is when we're using a transparent background color, because it doesn't copy over any transparent
         * pixels, effectively making it impossible to "turn off" any previously drawn LED segments.  To force
         * that behavior, we must select the "copy" behavior.
         *
         * Refer to: https://www.w3.org/TR/2dcontext/#dom-context-2d-globalcompositeoperation
         */
        this.contextView.globalCompositeOperation = (this.colorBackground && this.colorOn != this.colorTransparent)? "source-over" : "copy";
        this.contextView.drawImage(this.canvasGrid, 0, 0, this.widthGrid, this.heightGrid, 0, 0, this.widthView, this.heightView);
    }

    /**
     * enableDisplay(on)
     *
     * @this {LED}
     * @param {boolean} [on]
     */
    enableDisplay(on = true)
    {
        if (this.fDisplayOn != on) {
            this.fDisplayOn = on;
            this.fBufferModified = true;
        }
    }

    /**
     * getBuffer()
     *
     * @this {LED}
     * @return {Array}
     */
    getBuffer()
    {
        return this.buffer;
    }

    /**
     * getBufferClone()
     *
     * @this {LED}
     * @return {Array}
     */
    getBufferClone()
    {
        if (!this.bufferClone) {
            this.bufferClone = new Array(this.nBufferCells);
            this.initBuffer(this.bufferClone);
        }
        return this.bufferClone;
    }

    /**
     * getLEDColor(col, row)
     *
     * @this {LED}
     * @param {number} col
     * @param {number} row
     * @return {string}
     */
    getLEDColor(col, row)
    {
        let i = (row * this.cols + col) * this.nBufferInc;
        return this.buffer[i+1] || this.colorTransparent;
    }

    /**
     * getLEDColorValues(col, row, rgb)
     *
     * @this {LED}
     * @param {number} col
     * @param {number} row
     * @param {Array.<number>} rgb
     * @return {boolean}
     */
    getLEDColorValues(col, row, rgb)
    {
        let i = (row * this.cols + col) * this.nBufferInc;
        return this.parseRGBValues(this.buffer[i+1] || this.colorTransparent, rgb);
    }

    /**
     * getLEDCounts(col, row, counts)
     *
     * This function returns success (true) ONLY for cells that are not transparent.
     *
     * For a typical "Lite-Brite" grid, transparent cells are considered "empty", so we want to
     * ignore them.
     *
     * @this {LED}
     * @param {number} col
     * @param {number} row
     * @param {Array.<number>} counts
     * @return {boolean}
     */
    getLEDCounts(col, row, counts)
    {
        let fSuccess = false;
        let i = (row * this.cols + col) * this.nBufferInc;
        if (i <= this.buffer.length - this.nBufferInc && this.buffer[i+1]) {
            fSuccess = true;
            let bits = this.buffer[i+2];
            for (let c = counts.length - 1; c >= 0; c--) {
                counts[c] = bits & 0xf;
                bits >>>= 4;
            }
        }
        return fSuccess;
    }

    /**
     * getLEDCountsPacked(col, row)
     *
     * @this {LED}
     * @param {number} col
     * @param {number} row
     * @return {number}
     */
    getLEDCountsPacked(col, row)
    {
        let i = (row * this.cols + col) * this.nBufferInc;
        return (i <= this.buffer.length - this.nBufferInc)? this.buffer[i+2] : 0;
    }

    /**
     * getLEDState(col, row)
     *
     * @this {LED}
     * @param {number} col
     * @param {number} row
     * @return {number|undefined}
     */
    getLEDState(col, row)
    {
        let state;
        let i = (row * this.cols + col) * this.nBufferInc;
        if (i <= this.buffer.length - this.nBufferInc) {
            state = this.buffer[i];
        }
        return state;
    }

    /**
     * getDefaultColor()
     *
     * @this {LED}
     * @return {string}
     */
    getDefaultColor()
    {
        return this.colorOn;
    }

    /**
     * getRGBColor(color, colorDefault)
     *
     * Returns a color string in the "hex" format that fillStyle recognizes (eg, "#rrggbb").
     *
     * The default is optional, allowing an undefined color to remain undefined if we want to use
     * that to signal transparency (as in the case of colorBackground).
     *
     * @this {LED}
     * @param {string|undefined} color
     * @param {string} [colorDefault]
     * @return {string|undefined}
     */
    getRGBColor(color, colorDefault)
    {
        color = color || colorDefault;
        return color && WebIO.COLORS[color] || color;
    }

    /**
     * getRGBColorString(rgb)
     *
     * Returns a color string fillStyle recognizes (ie, "#rrggbb", or "rgba(r,g,b,a)" if an alpha value
     * less than 1 is set).
     *
     * TODO: Cache frequently requested colors.
     *
     * @this {LED}
     * @param {Array.<number>} rgb
     * @return {string}
     */
    getRGBColorString(rgb)
    {
        let s;
        if (rgb.length < 4 || rgb[3] == 1) {
            s = this.sprintf("#%02x%02x%02x", rgb[0], rgb[1], rgb[2]);
        } else {
            s = this.sprintf("rgba(%d,%d,%d,%d)", rgb[0], rgb[1], rgb[2], rgb[3]);
        }
        return s;
    }

    /**
     * getRGBAColor(color, alpha, brightness)
     *
     * Returns a color string in the "rgba" format that fillStyle recognizes (eg, "rgba(255, 255, 255, 0)").
     *
     * I used to use "alpha" to adjust the brightness, but it's safer to use the "brightness" parameter,
     * which simply scales all the RGB values.  That's because if any shapes are redrawn using a fillStyle
     * with alpha < 1.0, the target alpha values will be added instead of replaced, resulting in progressively
     * brighter shapes; probably not what you want.
     *
     * @this {LED}
     * @param {string} color
     * @param {number} [alpha]
     * @param {number} [brightness]
     * @return {string}
     */
    getRGBAColor(color, alpha = 1.0, brightness = 1.0)
    {
        if (color) {
            let rgb = [];
            color = WebIO.COLORS[color] || color;
            if (this.parseRGBValues(color, rgb)) {
                color = "rgba(";
                let i;
                for (i = 0; i < 3; i++) {
                    let n = Math.round(rgb[i] * brightness);
                    n = (n < 0? 0 : (n > 255? 255 : n));
                    color += n + ",";
                }
                color += (i < rgb.length? rgb[i] : alpha) + ")";
            }
        }
        return color;
    }

    /**
     * initBuffer(buffer)
     *
     * @this {LED}
     * @param {Array.<number|string|null>} buffer
     */
    initBuffer(buffer)
    {
        for (let i = 0; i < buffer.length; i += this.nBufferInc) {
            this.initCell(buffer, i);
        }
    }

    /**
     * initCell(buffer, iCell)
     *
     * @this {LED}
     * @param {Array.<number|string|null>} buffer
     * @param {number} iCell
     */
    initCell(buffer, iCell)
    {
        if (this.type < LED.TYPE.DIGIT) {
            buffer[iCell] = LED.STATE.OFF;
        } else {
            buffer[iCell] = ' ';
        }
        buffer[iCell+1] = (this.colorOn == this.colorTransparent? null : this.colorOn);
        buffer[iCell+2] = 0;
        buffer[iCell+3] = LED.FLAGS.MODIFIED;
    }

    /**
     * loadState(state)
     *
     * If any saved values don't match (possibly overridden), abandon the given state and return false.
     *
     * @this {LED}
     * @param {Array} state
     * @return {boolean}
     */
    loadState(state)
    {
        let colorOn = state.shift();
        let colorBackground = state.shift();
        let buffer = state.shift();
        if (colorOn == this.colorOn && colorBackground == this.colorBackground && buffer && buffer.length == this.buffer.length) {
            this.buffer = buffer;
            /*
             * Loop over all the buffer colors to fix a legacy problem (ie, before we started storing null for colorTransparent)
             */
            for (let i = 0; i <= this.buffer.length - this.nBufferInc; i += this.nBufferInc) {
                if (this.buffer[i+1] == this.colorTransparent) this.buffer[i+1] = null;
            }
            this.drawBuffer(true);
            return true;
        }
        return false;
    }

    /**
     * parseRGBValues(color, rgb)
     *
     * @this {LED}
     * @param {string} color
     * @param {Array.<number>} rgb
     * @return {boolean}
     */
    parseRGBValues(color, rgb)
    {
        let base = 16;
        let match = color.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
        if (!match) {
            base = 10;
            match = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,?\s*(\d+|)\)$/i);
        }
        if (match) {
            let i;
            for (i = 1; i < match.length; i++) {
                rgb[i-1] = Number.parseInt(match[i], base);
            }
            rgb.length = i-1;
            return true;
        }
        return false;
    }

    /**
     * saveState(state)
     *
     * @this {LED}
     * @param {Array} state
     */
    saveState(state)
    {
        if (this.buffer) {
            state.push(this.colorOn);
            state.push(this.colorBackground);
            state.push(this.buffer);
        }
    }

    /**
     * setContainerStyle(sAttr, sValue)
     *
     * @this {LED}
     * @param {string} sAttr
     * @param {string} sValue
     */
    setContainerStyle(sAttr, sValue)
    {
        if (this.container) this.container.style[sAttr] = sValue;
    }

    /**
     * setLEDColor(col, row, color)
     *
     * @this {LED}
     * @param {number} col
     * @param {number} row
     * @param {string} [color]
     * @return {boolean|null} (true if this call modified the LED color, false if not, null if error)
     */
    setLEDColor(col, row, color)
    {
        let fModified = null;
        if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
            fModified = false;
            let colorNew = color || this.colorOn;
            if (colorNew == this.colorTransparent) colorNew = null;
            let i = (row * this.cols + col) * this.nBufferInc;
            if (this.buffer[i+1] !== colorNew) {
                this.buffer[i+1] = colorNew;
                if (!colorNew) this.buffer[i] = LED.STATE.OFF;  // transparent LEDs are automatically turned off
                this.buffer[i+3] |= LED.FLAGS.MODIFIED;
                this.fBufferModified = fModified = true;
            }
            this.iBufferRecent = i;
            this.fBufferTickled = true;
        }
        return fModified;
    }

    /**
     * setLEDCounts(col, row, counts)
     *
     * @this {LED}
     * @param {number} col
     * @param {number} row
     * @param {Array.<number>} counts
     * @return {boolean|null} (true if this call modified the LED color, false if not, null if error)
     */
    setLEDCounts(col, row, counts)
    {
        let fModified = null;
        if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
            fModified = false;
            let i = (row * this.cols + col) * this.nBufferInc;
            let bits = 0;
            if (this.buffer[i+1]) {                             // only non-transparent LEDs are allowed to set counters
                for (let c = 0; c < counts.length; c++) {
                    bits = (bits << 4) | (counts[c] & 0xf);
                }
            }
            if (this.buffer[i+2] !== bits) {
                this.buffer[i+2] = bits;
                this.buffer[i+3] |= LED.FLAGS.MODIFIED;
                this.fBufferModified = fModified = true;
            }
            this.iBufferRecent = i;
            this.fBufferTickled = true;
        }
        return fModified;
    }

    /**
     * setLEDCountsPacked(col, row, counts)
     *
     * @this {LED}
     * @param {number} col
     * @param {number} row
     * @param {number} counts
     * @return {boolean|null} (true if this call modified the LED state, false if not, null if error)
     */
    setLEDCountsPacked(col, row, counts)
    {
        let i = (row * this.cols + col) * this.nBufferInc;
        if (i <= this.buffer.length - this.nBufferInc) {
            if (this.buffer[i+2] != counts) {
                this.buffer[i+2] = counts;
                return true;
            }
            return false;
        }
        return null;
    }

    /**
     * setLEDState(col, row, state, flags)
     *
     * For LED.TYPE.ROUND or LED.TYPE.SQUARE, the state parameter should be LED.STATE.OFF or LED.STATE.ON.
     *
     * @this {LED}
     * @param {number} col
     * @param {number} row
     * @param {string|number} state (new state for the specified cell)
     * @param {number} [flags]
     * @return {boolean} (true if this call modified the LED state, false if not)
     */
    setLEDState(col, row, state, flags = 0)
    {
        let fModified = false;
        let flagsSet = flags & LED.FLAGS.SET;
        let i = (row * this.cols + col) * this.nBufferInc;
        if (i <= this.buffer.length - this.nBufferInc) {
            if (this.buffer[i] !== state || (this.buffer[i+3] & LED.FLAGS.SET) !== flagsSet) {
                this.buffer[i] = state;
                this.buffer[i+3] = (this.buffer[i+3] & ~LED.FLAGS.SET) | flagsSet | LED.FLAGS.MODIFIED;
                this.fBufferModified = fModified = true;
            }
            this.iBufferRecent = i;
            this.fBufferTickled = true;
            this.nShiftedLeft = 0;
        }
        return fModified;
    }

    /**
     * swapBuffers()
     *
     * @this {LED}
     */
    swapBuffers()
    {
        let buffer = this.buffer;
        this.buffer = this.bufferClone;
        this.bufferClone = buffer;
        this.fBufferModified = true;
    }
}

LED.TYPE = {
    SMALL:      0,      // a smaller, more efficient (round) LED for large grids
    ROUND:      1,      // a single (round) LED
    SQUARE:     2,      // a single (square) LED
    DIGIT:      3       // a 7-segment (digit) LED, with optional period as an 8th segment
};

LED.TYPES = {
    "small":    LED.TYPE.SMALL,
    "round":    LED.TYPE.ROUND,
    "square":   LED.TYPE.SQUARE,
    "digit":    LED.TYPE.DIGIT
};

LED.BINDING = {
    CONTAINER:  "container"
};

LED.STATE = {
    OFF:        0,
    ON:         1
};

/*
 * NOTE: Although technically the MODIFIED flag is an internal flag, it may be set explicitly as well;
 * the ROM device uses the setLEDState() flags parameter to set it, in order to trigger highlighting of
 * the most recently active LED.
 */
LED.FLAGS = {
    NONE:       0x00,
    SET:        0x81,   // bits that may be set using the flags parameter of setLEDState()
    PERIOD:     0x01,   // used with DIGIT-type LED to indicate that the period "segment" should be on, too
    MODIFIED:   0x80,   // cell has been modified since the last time it was drawn
};

LED.SHAPES = {
    [LED.TYPE.SMALL]:   [4, 4, 4],
    [LED.TYPE.ROUND]:   [16, 16, 14],
    [LED.TYPE.SQUARE]:  [2, 2, 28, 28]
};

LED.SIZES = [
    [8,   8],           // LED.TYPE.SMALL
    [32,  32],          // LED.TYPE.ROUND
    [32,  32],          // LED.TYPE.SQUARE
    [96, 128]           // LED.TYPE.DIGIT
];

/*
 * The segments are arranged roughly as follows, in a 96x128 grid:
 *
 *      AAAA
 *     F    B
 *     F    B
 *      GGGG
 *     E    C
 *     E    C
 *      DDDD P
 *
 * The following arrays specify pairs of moveTo()/lineTo() coordinates, used by drawGridSegment().  They all
 * assume the hard-coded width and height in LED.SIZES[LED.TYPE.DIGIT] specified above.  If there is a triplet
 * instead of one or more pairs (eg, the 'P' or period segment), then the coordinates are treated as arc()
 * parameters.
 */
LED.SEGMENTS = {
    'A':        [30,   8,  79,   8,  67,  19,  37,  19],
    'B':        [83,  10,  77,  52,  67,  46,  70,  22],
    'C':        [77,  59,  71, 100,  61,  89,  64,  64],
    'D':        [28,  91,  58,  91,  69, 104,  15, 104],
    'E':        [18,  59,  28,  64,  25,  88,  12, 100],
    'F':        [24,  10,  34,  21,  31,  47,  18,  52],
    'G':        [24,  56,  34,  50,  60,  50,  71,  56,  61,  61,  33,  61],
    'P':        [80, 102,  8]
};

/*
 * Segmented symbols are formed with the following segments.
 */
LED.SYMBOL_SEGMENTS = {
    ' ':        [],
    '0':        ['A','B','C','D','E','F'],
    '1':        ['B','C'],
    '2':        ['A','B','D','E','G'],
    '3':        ['A','B','C','D','G'],
    '4':        ['B','C','F','G'],
    '5':        ['A','C','D','F','G'],
    '6':        ['A','C','D','E','F','G'],
    '7':        ['A','B','C'],
    '8':        ['A','B','C','D','E','F','G'],
    '9':        ['A','B','C','D','F','G'],
    'A':        ['A','B','C','E','F','G'],
    'B':        ['C','D','E','F','G'],      // NOTE: this shape is a lower-case 'b', to make 'B' must be distinguishable from '8'
    'C':        ['A','D','E','F'],
    'D':        ['B','C','D','E','G'],      // NOTE: this shape is a lower-case 'd', to make 'D' must be distinguishable from '0'
    'E':        ['A','D','E','F','G'],
    'F':        ['A','E','F','G'],
    '-':        ['G'],
    '.':        ['P']
};

Defs.CLASSES["LED"] = LED;

/**
 * @copyright https://www.pcjs.org/modules/devices/main/time.js (C) Jeff Parsons 2012-2019
 */

/** @typedef {{ id: string, callBack: function(), msAuto: number, nCyclesLeft: number }} */
var Timer;

/** @typedef {{ class: string, bindings: (Object|undefined), version: (number|undefined), overrides: (Array.<string>|undefined), cyclesMinimum: (number|undefined), cyclesMaximum: (number|undefined), cyclesPerSecond: (number|undefined), yieldsPerSecond: (number|undefined), yieldsPerUpdate: (number|undefined), requestAnimationFrame: (boolean|undefined), clockByFrame: (boolean|undefined) }} */
var TimeConfig;

/**
 * @class {Time}
 * @unrestricted
 * @property {TimeConfig} config
 * @property {number} nCyclesMinimum
 * @property {number} nCyclesMaximum
 * @property {number} nCyclesPerSecond
 * @property {number} nYieldsPerSecond
 * @property {number} nYieldsPerUpdate
 * @property {boolean} fClockByFrame
 */
class Time extends Device {
    /**
     * Time(idMachine, idDevice, config)
     *
     * Sample config:
     *
     *      "clock": {
     *        "class": "Time",
     *        "cyclesPerSecond": 650000,
     *        "clockByFrame": true,
     *        "bindings": {
     *          "run": "runTI57",
     *          "speed": "speedTI57",
     *          "step": "stepTI57"
     *        },
     *        "overrides": ["cyclesPerSecond","yieldsPerSecond","yieldsPerUpdate"]
     *      }
     *
     * @this {Time}
     * @param {string} idMachine
     * @param {string} idDevice
     * @param {TimeConfig} [config]
     */
    constructor(idMachine, idDevice, config)
    {
        super(idMachine, idDevice, config);

        /*
         * NOTE: The default speed of 650,000Hz (0.65Mhz) was a crude approximation based on real world TI-57
         * device timings.  I had originally assumed the speed as 1,600,000Hz (1.6Mhz), based on timing information
         * in TI's patents, but in hindsight, that speed seems rather high for a mid-1970's device, and reality
         * suggests it was much lower.  The TMS-1500 does burn through a lot of cycles (minimum of 128) per instruction,
         * but either that cycle burn was much higher, or the underlying clock speed was much lower.  I assume the latter.
         */
        this.nCyclesMinimum = this.getDefaultNumber('cyclesMinimum', 100000);
        this.nCyclesMaximum = this.getDefaultNumber('cyclesMaximum', 3000000);
        this.nCyclesPerSecond = this.getBounded(this.getDefaultNumber('cyclesPerSecond', 650000), this.nCyclesMinimum, this.nCyclesMaximum);
        this.nYieldsPerSecond = this.getBounded(this.getDefaultNumber('yieldsPerSecond', Time.YIELDS_PER_SECOND), 30, 120);
        this.nYieldsPerUpdate = this.getBounded(this.getDefaultNumber('yieldsPerUpdate', Time.YIELDS_PER_UPDATE), 1, this.nYieldsPerSecond);
        this.fClockByFrame = this.getDefaultBoolean('clockByFrame', this.nCyclesPerSecond <= 120);
        this.fRequestAnimationFrame = this.fClockByFrame || this.getDefaultBoolean('requestAnimationFrame', true);

        this.nBaseMultiplier = this.nCurrentMultiplier = this.nTargetMultiplier = 1;
        this.mhzBase = (this.nCyclesPerSecond / 10000) / 100;
        this.mhzCurrent = this.mhzTarget = this.mhzBase * this.nTargetMultiplier;
        this.nYields = 0;
        this.msYield = Math.round(1000 / this.nYieldsPerSecond);
        this.aAnimations = [];
        this.aClocks = [];
        this.aTimers = [];
        this.aUpdates = [];
        this.fPowered = this.fRunning = this.fYield = this.fThrottling = false;
        this.nStepping = 0;
        this.idRunTimeout = this.idStepTimeout = 0;
        this.onRunTimeout = this.run.bind(this);
        this.onAnimationFrame = this.animate.bind(this);
        this.requestAnimationFrame = (window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.setTimeout).bind(window);

        /*
         * Assorted bookkeeping variables.  A running machine actually performs one long series of "runs",
         * each followed by a yield back to the browser.  And each "run" consists of one or more "bursts"; the
         * size and number of "bursts" depends on how often the machine's timers needed to fire during the "run".
         */
        this.nCyclesLife = 0;           // number of cycles executed for the lifetime of the machine
        this.nCyclesRun = 0;            // number of cycles executed since the machine was last stopped
        this.nCyclesThisRun = 0;        // number of cycles executed during the last run (before yielding)
        this.nCyclesBurst = 0;          // number of cycles requested for the next "burst"
        this.nCyclesRemain = 0;         // number of cycles remaining in the next "burst"

        if (this.fClockByFrame) {
            /*
            * When clocking exclusively by animation frames, setSpeed() calculates how many cycles
            * each animation frame should "deposit" in our cycle bank:
            *
            *      this.nCyclesDepositPerFrame = (nCyclesPerSecond / 60) + 0.00000001;
            *
            * After that amount is added to our "balance" (this.nCyclesDeposited), we make a "withdrawal"
            * whenever the balance is >= 1.0 and call all our clocking functions with the maximum number
            * of cycles we were able to withdraw.
            *
            * setSpeed() also adds a tiny amount of "interest" to each "deposit" (0.00000001); otherwise
            * you can end up in situations where the deposit amount is, say, 0.2499999 instead of 0.25,
            * and four such deposits would still fall short of the 1-cycle threshold.
            */
            this.nCyclesDeposited = this.nCyclesDepositPerFrame = 0;
        }
        else {
            /*
            * When fClockByFrame is true, we rely exclusively on requestAnimationFrame() instead of setTimeout()
            * to drive the clock, which means we automatically yield after every frame, so no yield timer is required.
            */
            let time = this;
            this.timerYield = this.addTimer("timerYield", function onYield() {
                time.yield();
            }, this.msYield);
        }

        this.resetSpeed();
    }

    /**
     * addAnimation(callBack)
     *
     * Animation functions used to be called with YIELDS_PER_SECOND frequency, when animate() was called
     * on every yield() call, but now we rely on requestAnimationFrame(), so the frequency is browser-dependent
     * (but presumably at least 60Hz).
     *
     * @this {Time}
     * @param {function(number)} callBack
     */
    addAnimation(callBack)
    {
        this.aAnimations.push(callBack);
    }

    /**
     * addBinding(binding, element)
     *
     * @this {Time}
     * @param {string} binding
     * @param {Element} element
     */
    addBinding(binding, element)
    {
        let time = this, elementInput;

        switch(binding) {

        case Time.BINDING.RUN:
            element.onclick = function onClickRun() {
                time.onRun();
            };
            break;

        case Time.BINDING.STEP:
            element.onclick = function onClickStep() {
                time.onStep();
            };
            break;

        case Time.BINDING.THROTTLE:
            elementInput = /** @type {HTMLInputElement} */ (element);
            elementInput.addEventListener("mousedown", function onThrottleStart() {
                time.fThrottling = true;
            });
            elementInput.addEventListener("mouseup", function onThrottleStop() {
                time.setSpeedThrottle();
                time.fThrottling = false;
            });
            elementInput.addEventListener("mousemove", function onThrottleChange() {
                if (time.fThrottling) {
                    time.setSpeedThrottle();
                }
            });
            elementInput.addEventListener("change", function onThrottleChange() {
                time.fThrottling = true;
                time.setSpeedThrottle();
                time.fThrottling = false;
            });
            break;
        }
        super.addBinding(binding, element);
    }

    /**
     * addClock(clock)
     *
     * Adds a clocked device, which must support the following interfaces:
     *
     *      startClock(nCycles)
     *      stopClock()
     *      getClock()
     *
     * @this {Time}
     * @param {Device} clock
     */
    addClock(clock)
    {
        this.aClocks.push(clock);
    }

    /**
     * addTimer(id, callBack, msAuto)
     *
     * Devices that want to have timers that fire after some number of milliseconds call addTimer() to create
     * the timer, and then setTimer() when they want to arm it.  Alternatively, they can specify an automatic
     * timeout value (in milliseconds) to have the timer fire automatically at regular intervals.  There is
     * currently no removeTimer() because these are generally used for the entire lifetime of a device.
     *
     * A timer is initially dormant; dormant timers have a cycle count of -1 (although any negative number will
     * suffice) and active timers have a non-negative cycle count.
     *
     * @this {Time}
     * @param {string} id
     * @param {function()} callBack
     * @param {number} [msAuto] (if set, enables automatic setTimer calls)
     * @return {number} timer index (1-based)
     */
    addTimer(id, callBack, msAuto = -1)
    {
        let nCyclesLeft = -1;
        let iTimer = this.aTimers.length + 1;
        this.aTimers.push({id, callBack, msAuto, nCyclesLeft});
        if (msAuto >= 0) this.setTimer(iTimer, msAuto);
        return iTimer;
    }

    /**
     * addUpdate(device)
     *
     * Adds a device to the update list.  Each device's onUpdate() function is then called from update(),
     * either as the result of periodic updates from yield(), single-step updates from step(), or transitional
     * updates from start() and stop().
     *
     * @this {Time}
     * @param {Device} device
     */
    addUpdate(device)
    {
        this.aUpdates.push(device);
    }

    /**
     * animate(t)
     *
     * This is the callback function we supply to requestAnimationFrame().  The callback has a single
     * (DOMHighResTimeStamp) argument, which indicates the current time (returned from performance.now())
     * for when requestAnimationFrame() starts to fire callbacks.
     *
     * See: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
     *
     * @this {Time}
     * @param {number} [t]
     */
    animate(t)
    {
        if (this.fClockByFrame) {
            /*
             * Mimic the logic in run()
             */
            if (!this.fRunning) return;
            this.snapStart();
            try {
                this.fYield = false;
                do {
                    /*
                     * Execute the burst and then update all timers.
                     */
                    this.notifyTimers(this.endBurst(this.doBurst(this.getCyclesPerFrame())));
                } while (this.fRunning && !this.fYield);
            }
            catch (err) {
                this.println(err.message);
                this.stop();
                return;
            }
            this.snapStop();
        }
        for (let i = 0; i < this.aAnimations.length; i++) {
            this.aAnimations[i](t);
        }
        if (this.fRunning && this.fRequestAnimationFrame) this.requestAnimationFrame(this.onAnimationFrame);
    }

    /**
     * calcCycles()
     *
     * Calculate the maximum number of cycles we should attempt to process before the next yield.
     *
     * @this {Time}
     */
    calcCycles()
    {
        let nMultiplier = this.mhzCurrent / this.mhzBase;
        if (!nMultiplier || nMultiplier > this.nTargetMultiplier) {
            nMultiplier = this.nTargetMultiplier;
        }
        /*
         * nCyclesPerYield is now allowed to be a fractional number, so that for machines configured
         * to run at an extremely slow speed (eg, less than 60Hz), a fractional value here will signal
         * to snapStop() that it should increase msYield to a proportionally higher value.
         */
        this.nCyclesPerYield = (this.nCyclesPerSecond / this.nYieldsPerSecond * nMultiplier);
        this.nCurrentMultiplier = nMultiplier;
    }

    /**
     * calcSpeed(nCycles, msElapsed)
     *
     * @this {Time}
     * @param {number} nCycles
     * @param {number} msElapsed
     */
    calcSpeed(nCycles, msElapsed)
    {
        if (msElapsed) {
            this.mhzCurrent = (nCycles / (msElapsed * 10)) / 100;
        }
    }

    /**
     * doBurst(nCycles)
     *
     * @this {Time}
     * @param {number} nCycles
     * @return {number} (number of cycles actually executed)
     */
    doBurst(nCycles)
    {
        this.nCyclesBurst = this.nCyclesRemain = nCycles;
        if (!this.aClocks.length) {
            this.nCyclesRemain = 0;
            return this.nCyclesBurst;
        }
        let iClock = 0;
        while (this.nCyclesRemain > 0) {
            if (iClock < this.aClocks.length) {
                let clock = this.aClocks[iClock++];
                nCycles = clock.startClock.call(clock, nCycles) || 1;
            } else {
                iClock = nCycles = 0;
            }
            this.nCyclesRemain -= nCycles;
        }
        return this.nCyclesBurst - this.nCyclesRemain;
    }

    /**
     * doOutside(fn)
     *
     * Use this function to perform any work outside of normal time (eg, DOM updates),
     * to prevent that work from disrupting our speed calculations.
     *
     * @this {Time}
     * @param {function()} fn (should return true only if the function actually performed any work)
     * @return {boolean}
     */
    doOutside(fn)
    {
        let msStart = Date.now();
        if (fn()) {
            let msStop = Date.now();
            this.msOutsideThisRun += msStop - msStart;
            return true;
        }
        return false;
    }

    /**
     * endBurst(nCycles)
     *
     * @this {Time}
     * @param {number} [nCycles]
     * @return {number} (number of cycles executed in burst)
     */
    endBurst(nCycles = this.nCyclesBurst - this.nCyclesRemain)
    {
        if (this.fClockByFrame) {
            if (!this.fRunning) {
                if (this.nCyclesDeposited) {
                    for (let iClock = 0; iClock < this.aClocks.length; iClock++) {
                        let clock = this.aClocks[iClock];
                        clock.stopClock.call(clock);
                    }
                }
                this.nCyclesDeposited = nCycles;
            }
            this.nCyclesDeposited -= nCycles;
            if (this.nCyclesDeposited < 1) {
                this.yield();
            }
        }
        this.nCyclesBurst = this.nCyclesRemain = 0;
        this.nCyclesThisRun += nCycles;
        this.nCyclesRun += nCycles;
        this.nCyclesLife += nCycles;
        if (!this.fRunning) this.nCyclesRun = 0;
        return nCycles;
    }

    /**
     * getCycles()
     *
     * Returns the number of cycles executed so far.
     *
     * @this {Time}
     * @return {number}
     */
    getCycles()
    {
        let nCyclesClocked = 0;
        for (let iClock = 0; iClock < this.aClocks.length; iClock++) {
            let clock = this.aClocks[iClock];
            nCyclesClocked += clock.getClock.call(clock);
        }
        return this.nCyclesLife + (this.nCyclesBurst - this.nCyclesRemain) + nCyclesClocked;
    }

    /**
     * getCyclesPerBurst()
     *
     * Returns the number of cycles to execute as a burst.
     *
     * @this {Time}
     * @return {number} (the maximum number of cycles we should execute in the next burst)
     */
    getCyclesPerBurst()
    {
        let nCycles = this.getCyclesPerMS(this.msYield);
        for (let iTimer = this.aTimers.length; iTimer > 0; iTimer--) {
            let timer = this.aTimers[iTimer-1];

            if (timer.nCyclesLeft < 0) continue;
            if (nCycles > timer.nCyclesLeft) {
                nCycles = timer.nCyclesLeft;
            }
        }
        return nCycles;
    }

    /**
     * getCyclesPerFrame(nMinCycles)
     *
     * Returns the number of cycles to execute per frame (assuming fClockByFrame).
     *
     * @this {Time}
     * @param {number} [nMinCycles]
     * @return {number} (the maximum number of cycles we should execute in the next burst)
     */
    getCyclesPerFrame(nMinCycles=0)
    {
        let nCycles;
        if (nMinCycles) {
            nCycles = nMinCycles;
            this.nCyclesDeposited += nMinCycles;
        } else {
            nCycles = this.nCyclesDeposited;
            if (nCycles < 1) {
                nCycles = (this.nCyclesDeposited += this.nCyclesDepositPerFrame);
            }
            if (nCycles < 0) {
                this.printf("warning: nCyclesDeposited dropped below zero: %f\n", this.nCyclesDeposited);
                nCycles = 0;
            }
            nCycles |= 0;
            for (let iTimer = this.aTimers.length; iTimer > 0; iTimer--) {
                let timer = this.aTimers[iTimer-1];

                if (timer.nCyclesLeft < 0) continue;
                if (nCycles > timer.nCyclesLeft) {
                    nCycles = timer.nCyclesLeft;
                }
            }
        }
        return nCycles;
    }

    /**
     * getCyclesPerMS(ms)
     *
     * If no time period is specified, returns the current number of cycles per second (ie, 1000ms).
     *
     * @this {Time}
     * @param {number} ms (default is 1000)
     * @return {number} number of corresponding cycles
     */
    getCyclesPerMS(ms = 1000)
    {
        return Math.ceil((this.nCyclesPerSecond * this.nCurrentMultiplier) / 1000 * ms);
    }

    /**
     * getSpeed(mhz)
     *
     * @this {Time}
     * @param {number} mhz
     * @return {string} the given speed, as a formatted string
     */
    getSpeed(mhz)
    {
        let s;
        if (mhz >= 1) {
            s = mhz.toFixed(2) + "Mhz";
        } else {
            let hz = Math.round(mhz * 1000000);
            if (hz <= 999) {
                s = hz + "Hz";
            } else {
                s = Math.ceil(hz / 1000) + "Khz";
            }
        }
        return s;
    }

    /**
     * getSpeedCurrent()
     *
     * @this {Time}
     * @return {string} the current speed, as a formatted string
     */
    getSpeedCurrent()
    {
        return (this.fRunning && this.mhzCurrent)? this.getSpeed(this.mhzCurrent) : "Stopped";
    }

    /**
     * getSpeedTarget()
     *
     * @this {Time}
     * @return {string} the target speed, as a formatted string
     */
    getSpeedTarget()
    {
        return this.getSpeed(this.mhzTarget);
    }

    /**
     * isPowered()
     *
     * @this {Time}
     * @return {boolean} true if powered, false if not
     */
    isPowered()
    {
        if (!this.fPowered) {
            this.println("not powered");
            return false;
        }
        return true;
    }

    /**
     * isRunning()
     *
     * @this {Time}
     * @return {boolean}
     */
    isRunning()
    {
        return this.fRunning;
    }

    /**
     * isTimerSet(iTimer)
     *
     * NOTE: Even if the timer is armed, we return false if the clock is currently stopped;
     * in that sense, perhaps this function should be named isTimerArmedAndWillItFireOnTime().
     *
     * @this {Time}
     * @param {number} iTimer
     * @return {boolean}
     */
    isTimerSet(iTimer)
    {
        if (this.fRunning) {
            if (iTimer > 0 && iTimer <= this.aTimers.length) {
                let timer = this.aTimers[iTimer - 1];
                return (timer.nCyclesLeft >= 0);
            }
        }
        return false;
    }

    /**
     * notifyTimers(nCycles)
     *
     * Used by run() to reduce all active timer countdown values by the number of cycles just executed;
     * this is the function that actually "fires" any timer(s) whose countdown has reached (or dropped below)
     * zero, invoking their callback function.
     *
     * @this {Time}
     * @param {number} nCycles (number of cycles actually executed)
     */
    notifyTimers(nCycles)
    {
        if (nCycles >= 1) {
            for (let iTimer = this.aTimers.length; iTimer > 0; iTimer--) {
                let timer = this.aTimers[iTimer-1];

                if (timer.nCyclesLeft < 0) continue;
                timer.nCyclesLeft -= nCycles;
                if (timer.nCyclesLeft <= 0) {
                    timer.nCyclesLeft = -1; // zero is technically an "active" value, so ensure the timer is dormant now
                    timer.callBack();       // safe to invoke the callback function now
                    if (timer.msAuto >= 0) {
                        this.setTimer(iTimer, timer.msAuto);
                    }
                }
            }
        }
    }

    /**
     * onPower(on)
     *
     * Called by the Machine device to provide notification of a power event.
     *
     * @this {Time}
     * @param {boolean} on (true to power on, false to power off)
     */
    onPower(on)
    {
        this.fPowered = on;
    }

    /**
     * onRun()
     *
     * This handles the "run" button, if any, attached to the Time device.
     *
     * Note that this serves a different purpose than the "power" button that's managed by the Input device,
     * because toggling power also requires resetting the program counter prior to start() OR clearing the display
     * after stop().
     *
     * @this {Time}
     */
    onRun()
    {
        if (this.isPowered()) {
            if (this.fRunning) {
                this.stop();
            } else {
                this.start();
            }
        }
    }

    /**
     * onStep(nRepeat)
     *
     * This handles the "step" button, if any, attached to the Time device.
     *
     * @this {Time}
     * @param {number} [nRepeat]
     */
    onStep(nRepeat)
    {
        if (this.isPowered()) {
            if (!this.fRunning) {
                if (this.nStepping) {
                    this.stop();
                } else {
                    this.step(nRepeat);
                }
            } else {
                this.println("already running");
            }
        }
    }

    /**
     * resetSpeed()
     *
     * Resets speed and cycle information as part of any reset() or restore(); this typically occurs during powerUp().
     * It's important that this be called BEFORE the actual restore() call, because restore() may want to call setSpeed(),
     * which in turn assumes that all the cycle counts have been initialized to sensible values.
     *
     * @this {Time}
     */
    resetSpeed()
    {
        this.nCyclesRun = this.nCyclesBurst = this.nCyclesRemain = 0;
        if (!this.setSpeedThrottle()) this.setSpeed(this.nBaseMultiplier);
    }

    /**
     * resetTimers()
     *
     * When the target speed multiplier is altered, it's a good idea to run through all the timers that
     * have a fixed millisecond period and re-arm them, because the timers are using cycle counts that were based
     * on a previous multiplier.
     *
     * @this {Time}
     */
    resetTimers()
    {
        for (let iTimer = this.aTimers.length; iTimer > 0; iTimer--) {
            let timer = this.aTimers[iTimer-1];
            if (timer.msAuto >= 0) this.setTimer(iTimer, timer.msAuto, true);
        }
    }

    /**
     * run()
     *
     * @this {Time}
     */
    run()
    {
        this.idRunTimeout = 0;
        if (!this.fRunning) return;
        this.snapStart();
        try {
            this.fYield = false;
            do {
                /*
                 * Execute the burst and then update all timers.
                 */
                this.notifyTimers(this.endBurst(this.doBurst(this.getCyclesPerBurst())));

            } while (this.fRunning && !this.fYield);
        }
        catch(err) {
            this.println(err.message);
            this.stop();
            return;
        }
        if (this.fRunning) {

            this.idRunTimeout = setTimeout(this.onRunTimeout, this.snapStop());
            if (!this.fRequestAnimationFrame) this.animate();
        }
    }

    /**
     * setSpeedThrottle()
     *
     * This handles speed adjustments requested by the throttling slider.
     *
     * @this {Time}
     * @return {boolean} (true if a throttle exists, false if not)
     */
    setSpeedThrottle()
    {
        /*
         * We're not going to assume any direct relationship between the slider's min/max/value
         * and our own nCyclesMinimum/nCyclesMaximum/nCyclesPerSecond.  We're just going to calculate
         * a new target nCyclesPerSecond that is proportional, and then convert that to a speed multiplier.
         */
        let elementInput = this.bindings[Time.BINDING.THROTTLE];
        if (elementInput) {
            let ratio = (elementInput.value - elementInput.min) / (elementInput.max - elementInput.min);
            let nCycles = Math.floor((this.nCyclesMaximum - this.nCyclesMinimum) * ratio + this.nCyclesMinimum);
            let nMultiplier = nCycles / this.nCyclesPerSecond;

            this.setSpeed(nMultiplier);
            return true;
        }
        return false;
    }

    /**
     * setSpeed(nMultiplier)
     *
     * @desc Whenever the speed is changed, the running cycle count and corresponding start time must be reset,
     * so that the next effective speed calculation obtains sensible results.  In fact, when run() initially calls
     * setSpeed() with no parameters, that's all this function does (it doesn't change the current speed setting).
     *
     * @this {Time}
     * @param {number} [nMultiplier] is the new proposed multiplier (reverts to default if target was too high)
     * @return {boolean} true if successful, false if not
     */
    setSpeed(nMultiplier)
    {
        let fSuccess = true;
        if (nMultiplier !== undefined) {
            /*
             * If we haven't reached 90% (0.9) of the current target speed, revert to the default multiplier.
             */
            if (!this.fThrottling && this.mhzCurrent > 0 && this.mhzCurrent < this.mhzTarget * 0.9) {
                nMultiplier = this.nBaseMultiplier;
                fSuccess = false;
            }
            this.nTargetMultiplier = nMultiplier;
            let mhzTarget = this.mhzBase * this.nTargetMultiplier;
            if (this.mhzTarget != mhzTarget) {
                this.mhzTarget = mhzTarget;
                this.setBindingText(Time.BINDING.SPEED, this.getSpeedTarget());
            }
            /*
             * After every yield, calcSpeed() will update mhzCurrent, but we also need to be optimistic
             * and set it to the mhzTarget now, so that the next calcCycles() call will make a reasonable
             * initial estimate.
             */
            this.mhzCurrent = this.mhzTarget;
        }
        if (this.fClockByFrame) {
            let nCyclesPerSecond = this.mhzCurrent * 1000000;
            this.nCyclesDepositPerFrame = (nCyclesPerSecond / 60) + 0.00000001;
            this.nCyclesDeposited = 0;
        }
        this.nCyclesRun = 0;
        this.msStartRun = this.msEndRun = 0;
        this.calcCycles();      // calculate a new value for the current cycle multiplier
        this.resetTimers();     // and then update all the fixed-period timers using the new cycle multiplier
        return fSuccess;
    }

    /**
     * setTimer(iTimer, ms, fReset)
     *
     * Using the timer index from a previous addTimer() call, this sets that timer to fire after the
     * specified number of milliseconds.
     *
     * @this {Time}
     * @param {number} iTimer
     * @param {number} ms (converted into a cycle countdown internally)
     * @param {boolean} [fReset] (true if the timer should be reset even if already armed)
     * @return {number} (number of cycles used to arm timer, or -1 if error)
     */
    setTimer(iTimer, ms, fReset)
    {
        let nCycles = -1;
        if (iTimer > 0 && iTimer <= this.aTimers.length) {
            let timer = this.aTimers[iTimer-1];
            if (fReset || timer.nCyclesLeft < 0) {
                nCycles = this.getCyclesPerMS(ms);
                /*
                 * If we're currently executing a burst of cycles, the number of cycles it has executed in
                 * that burst so far must NOT be charged against the cycle timeout we're about to set.  The simplest
                 * way to resolve that is to immediately call endBurst() and bias the cycle timeout by the number
                 * of cycles that the burst executed.
                 */
                if (this.fRunning) {
                    nCycles += this.endBurst();
                }
                timer.nCyclesLeft = nCycles;
            }
        }
        return nCycles;
    }

    /**
     * snapStart()
     *
     * @this {Time}
     */
    snapStart()
    {
        this.calcCycles();

        this.nCyclesThisRun = 0;
        this.msOutsideThisRun = 0;
        this.msStartThisRun = Date.now();
        if (!this.msStartRun) this.msStartRun = this.msStartThisRun;

        /*
         * Try to detect situations where the browser may have throttled us, such as when the user switches
         * to a different tab; in those situations, Chrome and Safari may restrict setTimeout() callbacks
         * to roughly one per second.
         *
         * Another scenario: the user resizes the browser window.  setTimeout() callbacks are not throttled,
         * but there can still be enough of a lag between the callbacks that speed will be noticeably
         * erratic if we don't compensate for it here.
         *
         * We can detect throttling/lagging by verifying that msEndRun (which was set at the end of the
         * previous run and includes any requested sleep time) is comparable to the current msStartThisRun;
         * if the delta is significant, we compensate by bumping msStartRun forward by that delta.
         *
         * This shouldn't be triggered when the Debugger stops time, because setSpeed() -- which is called
         * whenever the time starts again -- zeroes msEndRun.
         */
        let msDelta = 0;
        if (this.msEndRun) {
            msDelta = this.msStartThisRun - this.msEndRun;
            if (msDelta > this.msYield) {
                this.msStartRun += msDelta;
                /*
                 * Bumping msStartRun forward should NEVER cause it to exceed msStartThisRun; however, just
                 * in case, I make absolutely sure it cannot happen, since doing so could result in negative
                 * speed calculations.
                 */

                if (this.msStartRun > this.msStartThisRun) {
                    this.msStartRun = this.msStartThisRun;
                }
            }
        }
    }

    /**
     * snapStop()
     *
     * @this {Time}
     * @return {number}
     */
    snapStop()
    {
        this.msEndRun = Date.now();

        if (this.msOutsideThisRun) {
            this.msStartRun += this.msOutsideThisRun;
            this.msStartThisRun += this.msOutsideThisRun;
        }

        let msYield = this.msYield;
        if (this.nCyclesThisRun) {
            /*
             * Normally, we assume we executed a full quota of work over msYield.  If nCyclesThisRun is correct,
             * then the ratio of nCyclesThisRun/nCyclesPerYield should represent the percentage of work we performed,
             * and so applying that percentage to msYield should give us a better estimate of work vs. time.
             */
            msYield = Math.round(msYield * this.nCyclesThisRun / this.nCyclesPerYield);
        }

        let msElapsedThisRun = this.msEndRun - this.msStartThisRun;
        let msRemainsThisRun = msYield - msElapsedThisRun;

        let nCycles = this.nCyclesRun;
        let msElapsed = this.msEndRun - this.msStartRun;

        if (DEBUG && msRemainsThisRun < 0 && this.nTargetMultiplier > 1) {
            this.println("warning: updates @" + msElapsedThisRun + "ms (prefer " + Math.round(msYield) + "ms)");
        }

        this.calcSpeed(nCycles, msElapsed);

        if (msRemainsThisRun < 0) {
            /*
             * Try "throwing out" the effects of large anomalies, by moving the overall run start time up;
             * ordinarily, this should only happen when the someone is using an external Debugger or some other
             * tool or feature that is interfering with our overall execution.
             */
            if (msRemainsThisRun < -1000) {
                this.msStartRun -= msRemainsThisRun;
            }
            /*
             * If the last burst took MORE time than we allotted (ie, it's taking more than 1 second to simulate
             * nCyclesPerSecond), all we can do is yield for as little time as possible (ie, 0ms) and hope that the
             * simulation is at least usable.
             */
            msRemainsThisRun = 0;
        }
        else if (this.mhzCurrent < this.mhzTarget) {
            msRemainsThisRun = 0;
        }

        this.msEndRun += msRemainsThisRun;

        this.printf(MESSAGE.TIMER, "after running %d cycles, resting for %dms\n", this.nCyclesThisRun, msRemainsThisRun);

        return msRemainsThisRun;
    }

    /**
     * start()
     *
     * @this {Time}
     * @return {boolean}
     */
    start()
    {
        if (this.fRunning || this.nStepping) {
            return false;
        }

        if (this.idRunTimeout) {
            clearTimeout(this.idRunTimeout);
            this.idRunTimeout = 0;
        }

        this.fRunning = true;
        this.msStartRun = this.msEndRun = 0;
        this.update(true);

        /*
         * Kickstart both the clocks and requestAnimationFrame; it's a little premature to start
         * animation here, because the first run() should take place before the first animate(), but
         * since clock speed is now decoupled from animation speed, this isn't something we should
         * worry about.
         */
        if (!this.fClockByFrame) {

            this.idRunTimeout = setTimeout(this.onRunTimeout, 0);
        }
        if (this.fRequestAnimationFrame) this.requestAnimationFrame(this.onAnimationFrame);
        return true;
    }

    /**
     * step(nRepeat)
     *
     * @this {Time}
     * @param {number} [nRepeat]
     * @return {boolean} true if successful, false if already running
     */
    step(nRepeat = 1)
    {
        if (!this.fRunning) {
            if (nRepeat && !this.nStepping) {
                this.nStepping = nRepeat;
            }
            if (this.nStepping) {
                /*
                 * Execute a minimum-cycle burst and then update all timers.
                 */
                this.nStepping--;
                this.notifyTimers(this.endBurst(this.doBurst(this.getCyclesPerFrame(1))));
                this.update(false);
                if (this.nStepping) {
                    let time = this;
                    this.idStepTimeout = setTimeout(function onStepTimeout() {
                        time.step(0);
                    }, 0);
                    return true;
                }
            }
            return true;
        }
        return false;
    }

    /**
     * stop()
     *
     * @this {Time}
     * @return {boolean} true if successful, false if already stopped
     */
    stop()
    {
        if (this.nStepping) {
            this.nStepping = 0;
            this.update(true);
            return true;
        }
        if (this.fRunning) {
            this.fRunning = false;
            this.endBurst();
            this.update(true);
            return true;
        }
        return false;
    }

    /**
     * update(fTransition)
     *
     * Used for periodic updates from yield(), single-step updates from step(), and transitional updates
     * from start() and stop().
     *
     * fTransition is set to true by start() and stop() calls, because the machine is transitioning to or from
     * a running state; it is set to false by step() calls, because the machine state changed but it never entered
     * a running state; and it is undefined in all other situations,
     *
     * When we call the update handlers, we set fTransition to true for all of the start(), stop(), and step()
     * cases, because there has been a "transition" in the overall state, just not the running state.
     *
     * @this {Time}
     * @param {boolean} [fTransition]
     */
    update(fTransition)
    {
        if (fTransition) {
            if (this.fRunning) {
                this.println("started with " + this.getSpeedTarget() + " target" + (DEBUG? " using " + (this.fClockByFrame? "requestAnimationFrame()" : "setTimeout()") : ""));
            } else {
                this.println("stopped");
            }
        }

        this.setBindingText(Time.BINDING.RUN, this.fRunning? "Halt" : "Run");
        this.setBindingText(Time.BINDING.STEP, this.nStepping? "Stop" : "Step");
        if (!this.fThrottling) {
            this.setBindingText(Time.BINDING.SPEED, this.getSpeedCurrent());
        }

        for (let i = 0; i < this.aUpdates.length; i++) {
            let device = this.aUpdates[i];
            device.onUpdate.call(device, fTransition != undefined);
        }
    }

    /**
     * yield()
     *
     * @this {Time}
     */
    yield()
    {
        this.fYield = true;
        let nYields = this.nYields;
        let nCyclesPerSecond = this.getCyclesPerMS();
        if (nCyclesPerSecond >= this.nYieldsPerSecond) {
            this.nYields++;
        } else {
            /*
             * Let's imagine that nCyclesPerSecond has dropped to 4, whereas the usual nYieldsPerSecond is 60;
             * that's means we're yielding at 1/15th the usual rate, so to compensate, we want to bump nYields
             * by 15 instead of 1.
             */
            this.nYields += Math.ceil(this.nYieldsPerSecond / nCyclesPerSecond);
        }
        if (this.nYields >= this.nYieldsPerUpdate && nYields < this.nYieldsPerUpdate) {
            this.update();
        }
        if (this.nYields >= this.nYieldsPerSecond) {
            this.nYields = 0;
        }
    }
}

Time.BINDING = {
    RUN:        "run",
    SPEED:      "speed",
    STEP:       "step",
    THROTTLE:   "throttle"
};

/*
 * We yield more often now (120 times per second instead of 60), to help ensure that requestAnimationFrame()
 * callbacks can be called as timely as possible.  And we still only want to perform DOM-related status updates
 * no more than twice per second, so the required number of yields before each update has been increased as well.
 */
Time.YIELDS_PER_SECOND = 120;
Time.YIELDS_PER_UPDATE = 60;

Defs.CLASSES["Time"] = Time;

/**
 * @copyright https://www.pcjs.org/modules/devices/cpu/tms1500.js (C) Jeff Parsons 2012-2019
 */

/**
 * 64-bit Register
 *
 * @class {Reg64}
 * @unrestricted
 * @property {CPU} cpu
 * @property {Array.<number>} digits
 */
class Reg64 extends Device {
    /**
     * Reg64(cpu, id, fInternal)
     *
     * @this {Reg64}
     * @param {CPU} cpu
     * @param {string} id
     * @param {boolean} [fInternal]
     */
    constructor(cpu, id, fInternal)
    {
        super(cpu.idMachine, id);
        this.cpu = cpu;
        this.name = id;

        /*
         * Each Reg64 register contains 16 BCD/Hex digits, which we store as 16 independent 4-bit numbers,
         * where [0] is D0, aka DIGIT 0, and [15] is D15, aka DIGIT 15.
         */
        this.digits = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];

        /*
         * Automatically add direct bindings for this new register and all its digits to the caller's bindings.
         */
        if (!fInternal) {
            let bindings = [];
            let name = "reg" + this.name;
            bindings.push(name);
            cpu.regMap[name] = [this, -1];
            for (let d = 0; d < this.digits.length; d++) {
                name = this.sprintf("reg%s-%02d", this.name, d);
                bindings.push(name);
                cpu.regMap[name] = [this, d];
            }
            cpu.addBindings(bindings);
        }
    }

    /**
     * add(reg, regSrc, range, base)
     *
     * @this {Reg64}
     * @param {Reg64} reg
     * @param {Reg64} regSrc
     * @param {Array.<number>} range
     * @param {number} base
     */
    add(reg, regSrc, range, base)
    {
        let carry = 0;
        for (let i = range[0], j = range[1]; i <= j; i++) {
            this.digits[i] = reg.digits[i] + regSrc.digits[i] + carry;
            carry = 0;
            if (this.digits[i] >= base) {
                this.digits[i] -= base;
                carry = 1;
            }
        }
        if (carry) this.cpu.fCOND = true;
        this.updateR5(range);
    }

    /**
     * get()
     *
     * @this {Reg64}
     * @return {Array}
     */
    get()
    {
        return this.digits;
    }

    /**
     * init(value, range)
     *
     * @this {Reg64}
     * @param {number} value
     * @param {Array.<number>} range
     * @return {Reg64}
     */
    init(value, range = [0,15])
    {
        for (let i = 0; i < this.digits.length; i++) {
            this.digits[i] = 0;
        }
        for (let i = range[0], j = range[1]; i <= j; i++) {
            this.digits[i] = value & 0xf;
            value >>>= 4;
        }
        return this;
    }

    /**
     * move(regSrc, range)
     *
     * @this {Reg64}
     * @param {Reg64} regSrc
     * @param {Array.<number>} range
     */
    move(regSrc, range)
    {
        for (let i = range[0], j = range[1]; i <= j; i++) {
            this.digits[i] = regSrc.digits[i];
        }
        regSrc.updateR5(range);
    }

    /**
     * set(digits)
     *
     * @this {Reg64}
     * @param {Array} digits
     */
    set(digits)
    {
        if (!digits || digits.length != this.digits.length) return;
        for (let i = 0; i < this.digits.length; i++) this.digits[i] = digits[i];
    }

    /**
     * shl(reg, range)
     *
     * @this {Reg64}
     * @param {Reg64} reg
     * @param {Array.<number>} range
     */
    shl(reg, range)
    {
        let i, j;
        for (i = range[1], j = range[0]; i > j; i--) {
            this.digits[i] = reg.digits[i-1];
        }
        this.digits[i] = 0;
        this.updateR5(range);
    }

    /**
     * shr(reg, range)
     *
     * @this {Reg64}
     * @param {Reg64} reg
     * @param {Array.<number>} range
     */
    shr(reg, range)
    {
        let i, j;
        for (i = range[0], j = range[1]; i < j; i++) {
            this.digits[i] = reg.digits[i+1];
        }
        this.digits[i] = 0;
        this.updateR5(range);
    }

    /**
     * store(reg)
     *
     * STORE is similar to MOVE, but all digits are stored (ie, no mask is involved), and R5 is not affected.
     *
     * @this {Reg64}
     * @param {Reg64} reg
     */
    store(reg)
    {
        for (let i = 0, j = this.digits.length; i < j; i++) {
            this.digits[i] = reg.digits[i];
        }
    }

    /**
     * sub(reg, regSrc, range, base)
     *
     * @this {Reg64}
     * @param {Reg64} reg
     * @param {Reg64} regSrc
     * @param {Array.<number>} range
     * @param {number} base
     */
    sub(reg, regSrc, range, base)
    {
        let carry = 0;
        for (let i = range[0], j = range[1]; i <= j; i++) {
            this.digits[i] = reg.digits[i] - regSrc.digits[i] - carry;
            carry = 0;
            if (this.digits[i] < 0) {
                this.digits[i] += base;
                carry = 1;
            }
        }
        if (carry) this.cpu.fCOND = true;
        this.updateR5(range);
    }

    /**
     * toString(fSpaces)
     *
     * @this {Reg64}
     * @param {boolean} [fSpaces]
     * @return {string}
     */
    toString(fSpaces = false)
    {
        let s = this.idDevice + '=';
        if (fSpaces && s.length < 3) s += ' ';
        for (let i = this.digits.length - 1; i >= 0; i--) {
            if (fSpaces) {
                s += Device.HexUpperCase[this.digits[i]];
            } else {
                s += Device.HexLowerCase[this.digits[i]] + ((i % 4)? '' : ' ');
            }
        }
        return s;
    }

    /**
     * updateR5(range)
     *
     * @this {Reg64}
     */
    updateR5(range)
    {
        this.cpu.regR5 = this.digits[range[0]];

        if (range[0] < range[1]) {
            this.cpu.regR5 |= this.digits[range[0]+1] << 4;

        }
    }

    /**
     * xchg(regSrc, range)
     *
     * @this {Reg64}
     * @param {Reg64} regSrc
     * @param {Array.<number>} range
     */
    xchg(regSrc, range)
    {
        for (let i = range[0], j = range[1]; i <= j; i++) {
            let d = this.digits[i];
            this.digits[i] = regSrc.digits[i];
            regSrc.digits[i] = d;
        }
        regSrc.updateR5(range);
    }
}

/**
 * TMS-150x Calculator CPU
 *
 * Emulates various TMS ("Texas Mos Standard") and TMC ("Texas Mos Custom") CPUs.  The 'type' property of
 * the config object should contain one of the following strings:
 *
 *      TI-57: "TMS-1501" or "TMC-1501" (or simply "1501")
 *      TI-55: "TMS-1503" or "TMC-1503" (or simply "1503")
 *
 * This CPU contains lots of small discrete devices, most of which will be emulated either within this
 * class or within another small container class in the same file, because most of them are either very simple
 * or have unique quirks, so it's not clear there's much reusability.
 *
 * One exception is the ROM, since ROMs are a very common device with very similar characteristics.  Since
 * the Machine class guarantees that the CPU class is initialized after the ROM class, we can look it up in
 * the constructor.
 *
 * @class {CPU}
 * @unrestricted
 * @property {Array.<Reg64>} regsO (operational registers A-D)
 * @property {Reg64} regA (alias for regsO[0])
 * @property {Reg64} regB (alias for regsO[1])
 * @property {Reg64} regC (alias for regsO[2])
 * @property {Reg64} regD (alias for regsO[3])
 * @property {Array.<Reg64>} regsX (storage registers X0-X7)
 * @property {Array.<Reg64>} regsY (storage registers Y0-Y7)
 * @property {Reg64} regSupp (alternate register used when the destination must be suppressed)
 * @property {Reg64} regTemp (temporary register used to supply constants or other internal values)
 * @property {number} base (10 or 16)
 * @property {boolean} fCOND (true when a carry has been detected)
 * @property {number} regRAB
 * @property {number} regR5 (least significant masked digit(s) from last arithmetic result)
 * @property {number} regPC (program counter: address of next instruction to decode)
 * @property {number} regKey (current key status, propagated to regR5 at appropriate intervals)
 * @property {Array.<number>} stack (3-level address stack; managed by push() and pop())
 * @property {number} nCyclesClocked
 * @property {Input} input
 * @property {LED} led
 * @property {ROM} rom
 * @property {Time} time
 * @property {number} addrPrev
 * @property {number} addrStop
 * @property {Object} breakConditions
 * @property {number} nStringFormat
 * @property {number} type (one of the CPU.TYPE values)
 */
class CPU extends Device {
    /**
     * CPU(idMachine, idDevice, config)
     *
     * Defines the basic elements of the TMS-150x CPU, as illustrated by U.S. Patent No. 4,125,901, Fig. 3 (p. 4)
     *
     * @this {CPU}
     * @param {string} idMachine
     * @param {string} idDevice
     * @param {Config} [config]
     */
    constructor(idMachine, idDevice, config)
    {
        super(idMachine, idDevice, config);

        let sType = this.getDefaultString('type', "1501");
        this.type = Number.parseInt(sType.slice(-4), 10);

        this.regMap = {};

        /*
         * Four (4) Operational Registers (A-D)
         */
        this.regsO = new Array(4);
        for (let i = 0; i < 4; i++) {
            this.regsO[i] = new Reg64(this, String.fromCharCode(0x41+i));
        }

        /*
         * Aliases for each of the Operational Registers, since some instructions use hard-coded registers,
         * rather than calculating a register index (0-3).
         */
        this.regA = this.regsO[0];
        this.regB = this.regsO[1];
        this.regC = this.regsO[2];
        this.regD = this.regsO[3];

        /*
         * Eight (8) Storage Registers (X0-X7)
         */
        this.regsX = new Array(8);
        for (let i = 0; i < 8; i++) {
            this.regsX[i] = new Reg64(this, "X" + i);
        }

        /*
         * Eight (8) Storage Registers (Y0-Y7)
         */
        this.regsY = new Array(8);
        for (let i = 0; i < 8; i++) {
            this.regsY[i] = new Reg64(this, "Y" + i);
        }

        this.regSupp = new Reg64(this, "Supp", true);
        this.regTemp = new Reg64(this, "Temp", true);

        this.base = 10;
        this.fCOND = false;

        /*
         * RAB (Register Address Buffer) is a 3-bit register "selectively loadable by the I4-I6 bits of an
         * instruction word" and "also selectively loadable from the three least significant bits of the number
         * stored in R5 register".
         */
        this.regRAB = 0;

        /*
         * R5 is "an eight bit shift register which may be selectively loaded from either the serial output from
         * arithmetic unit" or "may be loaded on lines KR1-3 and KR5-7 via gates from keyboard logic (at which
         * times the MSB of each digit in Register R5 is loaded with a zero via gates according to the keyboard code
         * code indicated in Table II)".
         */
        this.regR5 = 0;

        /*
         * The "Output Register" is twelve bit register, one bit for each digit of the display.  This essentially
         * provides column information for the LED display, while the next register (regScanGen) provides row
         * information.
         *
         * However, this is only necessary if we decide to simulate the internal operation of the Display Decoder
         * and Keyboard Scanner.
         *
         * Refer to patent Fig. 11c (p. 28)
         */
        // this.regOut = 0;

        /*
         * The "Scan Generator Counter" is a 3-bit register.  It is updated once each instruction cycle.
         * It "does not count sequentially, but during eight instruction cycle provides the three bit binary
         * representations of zero through seven."  Here's the sequence from "Reference A" of Fig. 11e:
         *
         *                 DECODE    DISP     KBD
         *      W   V   U     SEG     SEG    SCAN    HOLD
         *      ---------  ------    ----    ----    ----
         *      1   1   1       D       -       -       1
         *      1   1   0       A       D     KS6       1
         *      1   0   1       B       A     KS5       1
         *      0   1   0       C       B     KS2       1
         *      1   0   0       E       C     KS4       1
         *      0   0   0       F       E     KS0       1
         *      0   0   1       G       F     KS1       1
         *      0   1   1       P       G     KS3       0
         *      ---------  ------    ----    ----    ----
         *      1   1   1       D       P     KS7       1
         *      1   1   0       A       D     KS6       1
         *      ...
         *
         * However, this is only necessary if we decide to simulate the internal operation of the Display Decoder
         * and Keyboard Scanner.
         *
         * Refer to patent Fig. 11e (p. 30)
         */
        // this.regScanGen = 0;

        /*
         * The "Segment/Keyboard Scan" is an 8-bit register "arranged as a ring counter for shifting a logical zero
         * to a different stage during each instruction cycle....  [It is] further interconnected with the RESET signal
         * for inserting a logical one into all stages of the counter."  The outputs from the stages are connected to
         * SEG D, followed by SEG A, SEG B, SEG C, SEG E, SEG F, SEG G, and SEG P.
         *
         * However, this is only necessary if we decide to simulate the internal operation of the Display Decoder
         * and Keyboard Scanner.
         *
         * Refer to patent Fig. 11b (p. 27)
         */
        // this.regSegKbdScan = 0xff;

        /*
         * The "State Time Generator" is represented by a 5-bit register that contains values 00000b through 11111b
         * for each of the 32 state times that occur during a single instruction cycle.  And since each "state time"
         * consists of four clock pulses, designated Φ1, P1, Φ2, and P2, we keep track of which pulse we're on, too.
         *
         * However, these are only necessary if we decide to simulate the internal operation of the Display Decoder
         * and Keyboard Scanner.
         *
         * Refer to patent Fig. 11f (p. 31)
         */
        // this.regStateTime = 0;
        // this.regPulseTime = 0;

        /*
         * The "Program Counter" (regPC) is an 11-bit register that automatically increments unless a HOLD signal
         * is applied, effectively locking execution on a single instruction.
         */
        this.regPC = 0;

        /*
         * regPCLast is a non-standard register that simply snapshots the PC at the start of every
         * instruction; this is useful not only for CPUs that need to support instruction restartability,
         * but also for diagnostic/debugging purposes.
         */
        this.regPCLast = this.regPC;

        /*
         * If non-zero, a key is being pressed.  Bits 0-3 are the row (0-based) and bits 4-7 are the col (1-based).
         */
        this.regKey = 0;

        /*
         * The "Subroutine Stack".  "When an unconditional branch instruction is decoded by branch logic 32b, the
         * CALL signal goes to zero permitting the present ROM address plus one to be loaded into subroutine stack
         * register 33a....  Addresses previously loaded into subroutine stack/registers 33a and 33b are shifted
         * to registers 33b and 33c."
         *
         * We initialize it with "guard values" (-1) to help detect the presence of invalid data, and to catch stack
         * overflow/underflow errors.
         *
         * Refer to patent Fig. 7a (p. 9)
         */
        this.stack = [-1, -1, -1];

        /*
         * nCyclesStart and nCyclesRemain are initialized on every startClock() invocation.
         * The number of cycles executed during the current burst is nCyclesStart - nCyclesRemain,
         * and the burst is complete when nCyclesRemain has been exhausted (ie, is <= 0).
         */
       this.nCyclesStart = this.nCyclesRemain = 0;

        /*
         * Get access to the Input device, so we can add our click functions.
         */
        this.input = /** @type {Input} */ (this.findDevice(this.config['input']));
        this.input.addInput(this.onInput.bind(this));

        /*
         * Get access to the LED device, so we can update its display.
         */
        this.led = /** @type {LED} */ (this.findDevice(this.config['output'], false));

        /*
         * Get access to the Bus device, so we have access to the address space.
         * NOTE: We're kinda breaking the rules about searching for these devices by class,
         * simply because we know that this particular machine has only one Bus and one ROM.
         */
        this.bus = /** @type {Bus} */ (this.findDeviceByClass("Bus"));
        this.rom = /** @type {ROM} */ (this.findDeviceByClass("ROM"));

        /*
         * Get access to the Time device, so we can give it our clockCPU() function.
         */
        this.time = /** @type {Time} */ (this.findDeviceByClass("Time"));
        if (this.time && this.rom) {
            this.time.addClock(this);
            this.time.addUpdate(this);
        }

        /*
         * To add support for indicators like "2nd" and "INV", I use a set of flags to reflect
         * the state of the external indicator.  They are initially undefined and will be updated
         * by updateIndicators() whenever the internal and external states differ.
         */
        this.f2nd = this.fINV = this.angleMode = undefined;

        /*
         * The following set of properties are all debugger-related; see onCommand().
         */
        this.addrPrev = -1;
        this.addrStop = -1;
        this.breakConditions = {};
        this.nStringFormat = CPU.SFORMAT.DEFAULT;
        this.addHandler(WebIO.HANDLER.COMMAND, this.onCommand.bind(this));
    }

    /**
     * checkBreakCondition(c)
     *
     * @this {CPU}
     * @param {string} c
     * @return {boolean}
     */
    checkBreakCondition(c)
    {
        if (this.breakConditions[c]) {
            this.breakConditions[c] = false;
            this.println("break on " + CPU.BREAK[c]);
            this.time.stop();
            return true;
        }
        return false;
    }

    /**
     * clearDisplays()
     *
     * There are certain events (eg, power off, reset) where it is wise to clear all associated displays,
     * such as the LED display, the ROM activity array (if any), and assorted calculator indicators.
     *
     * @this {CPU}
     */
    clearDisplays()
    {
        if (this.led) this.led.clearBuffer(true);
        if (this.rom) this.rom.clearArray();
        this.updateIndicators(false);
    }

    /**
     * startClock(nCycles)
     *
     * NOTE: TI patents imply that the TI-57 would have a standard cycle time of 0.625us, which translates to
     * 1,600,000 cycles per second.  However, my crude tests with a real device suggest that the TI-57 actually
     * ran at around 40% of that speed, which is why you'll see all my configuration files specifying 650,000
     * cycles per second instead.  But, for purposes of the following discussion, we'll continue to assume a cycle
     * time of 0.625us.
     *
     * Every set of four cycles is designated a "state time".  Within a single state time (2.5us), the four cycles
     * are designated Φ1, P1, Φ2, and P2.  Moreover, one state time is required to transfer 2 bits from a data word
     * register.  Since a data word consists of 16 BCD digits (ie, 64 bits), 32 state times (80us) are required to
     * "clock" all the bits from one register to another.  This total time is referred to as an instruction cycle.
     *
     * Note that some instructions (ie, the DISP instruction) slow the delivery of cycles, such that one state time
     * is 10us instead of 2.5us, and therefore the entire instruction cycle will take 320us instead of 80us.
     *
     * We're currently simulating a full 32 "state times" (128 cycles aka CPU.OP_CYCLES) per instruction, since
     * we don't perform discrete simulation of the Display Decoder/Keyboard Scanner circuitry.  See opDISP() for
     * an example of an operation that imposes additional cycle overhead.
     *
     * @this {CPU}
     * @param {number} [nCycles] (default is 0 to single-step)
     * @return {number} (number of cycles actually "clocked")
     */
    startClock(nCycles = 0)
    {
        /*
         * NOTE: We can assume that the rom exists here, because we don't call addClock() it if doesn't.
         */

        this.nCyclesStart = this.nCyclesRemain = nCycles;
        while (this.nCyclesRemain > 0) {
            if (this.addrStop == this.regPC) {
                this.addrStop = -1;
                this.println("break");
                this.time.stop();
                break;
            }
            let opcode = this.bus.readData(this.regPC);
            let addr = this.regPCLast = this.regPC;
            this.regPC = (addr + 1) & this.bus.addrLimit;
            if (opcode == undefined || !this.decode(opcode, addr)) {
                this.regPC = this.regPCLast;
                this.println("unimplemented opcode");
                this.time.stop();
                break;
            }
            this.nCyclesRemain -= CPU.OP_CYCLES;
        }
        if (nCycles <= 0) {
            let cpu = this;
            this.time.doOutside(function clockOutside() {
                cpu.rom.drawArray();
                cpu.print(cpu.toString());
            });
        }
        return this.getClock();
    }

    /**
     * stopClock()
     *
     * @this {CPU}
     */
    stopClock()
    {
        this.nCyclesRemain = 0;
    }

    /**
     * getClock()
     *
     * Returns the number of cycles executed so far during the current burst.
     *
     * @this {CPU}
     * @return {number}
     */
    getClock()
    {
        return this.nCyclesStart - this.nCyclesRemain;
    }

    /**
     * decode(opcode, addr)
     *
     * Most operations are performed inline, since this isn't a super complex instruction set, but
     * a few are separated into their own handlers (eg, opDISP).
     *
     * @this {CPU}
     * @param {number} opcode (opcode)
     * @param {number} addr (of the opcode)
     * @return {boolean} (true if opcode successfully decoded, false if unrecognized or unsupported)
     */
    decode(opcode, addr)
    {
        if (opcode & 0x1000) {
            if (opcode & 0x0800) {  // BRC/BRNC
                /*
                 * As TI patent 4078251 states:
                 *
                 *      There being only ten bits in the address for the “branch on condition” instruction, when the
                 *      branch is executed only the ten least significant bits are loaded into the 11 bit address register
                 *      of program counter 32a. The most significant bit in the program counter remains unchanged.
                 */
                if (!!(opcode & 0x0400) == this.fCOND) {
                    this.regPC = (this.regPC & 0x0400) | (opcode & 0x03FF);
                }
            } else {                // CALL
                /*
                 * As TI patent 4078251 states:
                 *
                 *      Since the “branch unconditionally” address contains 11 bits and since the program counter 32a
                 *      contains 11 bits, the “branch unconditionally” instruction can cause the branch anywhere within ROM.
                 */
                this.push(this.regPC);
                this.regPC = opcode & 0x07FF;
            }
            this.fCOND = false;
            return true;
        }

        let range, regSrc, regResult, iOp, base;
        let j, k, l, n, d, b, mask = opcode & CPU.IW_MF.MASK;

        switch(mask) {
        case CPU.IW_MF.MMSD:    // 0x0000: Mantissa Most Significant Digit (D12)
        case CPU.IW_MF.ALL:     // 0x0100: (D0-D15)
        case CPU.IW_MF.MANT:    // 0x0200: Mantissa (D2-D12)
        case CPU.IW_MF.MAEX:    // 0x0300: Mantissa and Exponent (D0-D12)
        case CPU.IW_MF.LLSD:    // 0x0400: Mantissa Least Significant Digit (D2)
        case CPU.IW_MF.EXP:     // 0x0500: Exponent (D0-D1)
        case CPU.IW_MF.FMAEX:   // 0x0700: Flag and Mantissa and Exponent (D0-D13)
        case CPU.IW_MF.D14:     // 0x0800: (D14)
        case CPU.IW_MF.FLAG:    // 0x0900: (D13-D15)
        case CPU.IW_MF.DIGIT:   // 0x0a00: (D14-D15)
        case CPU.IW_MF.D13:     // 0x0d00: (D13)
        case CPU.IW_MF.D15:     // 0x0f00: (D15)
            range = CPU.RANGE[mask];


            j = (opcode & CPU.IW_MF.J_MASK) >> CPU.IW_MF.J_SHIFT;
            k = (opcode & CPU.IW_MF.K_MASK) >> CPU.IW_MF.K_SHIFT;
            l = (opcode & CPU.IW_MF.L_MASK) >> CPU.IW_MF.L_SHIFT;
            n = (opcode & CPU.IW_MF.N_MASK);
            iOp = (n? CPU.OP.SUB : CPU.OP.ADD);

            switch(k) {
            case 0:
            case 1:
            case 2:
            case 3:
                regSrc = this.regsO[k];
                break;
            case 4:
                regSrc = this.regTemp.init(1, range);
                break;
            case 5:
                iOp = (n? CPU.OP.SHR : CPU.OP.SHL);
                break;
            case 6:
                regSrc = this.regTemp.init(this.regR5 & 0xf, range);
                break;
            case 7:
                regSrc = this.regTemp.init(this.regR5 & 0xff, range);
                break;
            }

            switch(l) {
            case 0:
                regResult = this.regsO[j];
                break;
            case 1:
                regResult = (k < 4? this.regsO[k] : undefined);
                break;
            case 2:
                regResult = (k < 5? this.regSupp : (k == 5? this.regsO[j] : undefined));
                break;
            case 3:
                if (!n) {

                    this.regA.xchg(regSrc, range);
                } else {

                    this.regsO[j].move(regSrc, range);
                }
                return true;
            }

            if (!regResult) break;

            base = (opcode >= CPU.IW_MF.D14? 16 : this.base);

            switch(iOp) {
            case CPU.OP.ADD:
                regResult.add(this.regsO[j], regSrc, range, base);
                break;
            case CPU.OP.SUB:
                regResult.sub(this.regsO[j], regSrc, range, base);
                break;
            case CPU.OP.SHL:
                regResult.shl(this.regsO[j], range);
                break;
            case CPU.OP.SHR:
                regResult.shr(this.regsO[j], range);
                break;
            }
            return true;

        case CPU.IW_MF.FF:      // 0x0c00: (used for flag operations)
            j = (opcode & CPU.IW_FF.J_MASK) >> CPU.IW_FF.J_SHIFT;
            d = (opcode & CPU.IW_FF.D_MASK) >> CPU.IW_FF.D_SHIFT;
            b = 1 << ((opcode & CPU.IW_FF.B_MASK) >> CPU.IW_FF.B_SHIFT);
            if (!d) break;
            d += 12;
            /*
             * For the following bit operations (SET, RESET, TEST, and TOGGLE, displayed by toInstruction()
             * as "SET", "CLR", "TST", and "NOT") are rather trivial, so I didn't bother adding Reg64 methods
             * for them (eg, setBit, resetBit, testBit, toggleBit).
             */
            switch(opcode & CPU.IW_FF.MASK) {
            case CPU.IW_FF.SET:
                this.regsO[j].digits[d] |= b;
                break;
            case CPU.IW_FF.RESET:
                this.regsO[j].digits[d] &= ~b;
                break;
            case CPU.IW_FF.TEST:
                if (this.regsO[j].digits[d] & b) this.fCOND = true;
                break;
            case CPU.IW_FF.TOGGLE:
                this.regsO[j].digits[d] ^= b;
                break;
            }
            return true;

        case CPU.IW_MF.PF:      // 0x0e00: (used for misc operations)
            switch(opcode & CPU.IW_PF.MASK) {
            case CPU.IW_PF.STYA:        // 0x0000: Contents of storage register Y defined by RAB loaded into operational register A (Yn -> A)
                this.regA.store(this.regsY[this.regRAB]);
                break;
            case CPU.IW_PF.RABI:        // 0x0001: Bits 4-6 of instruction are stored in RAB
                this.regRAB = (opcode >> 4) & 0x7;
                break;
            case CPU.IW_PF.BRR5:        // 0x0002: Branch to R5
                /*
                 * TODO: Determine whether this type of BRANCH should set fCOND to false like other branches do
                 */
                this.regPC = this.regR5;
                break;
            case CPU.IW_PF.RET:         // 0x0003: Return
                this.fCOND = false;
                this.regPC = this.pop();
                break;
            case CPU.IW_PF.STAX:        // 0x0004: Contents of operational register A loaded into storage register X defined by RAB (A -> Xn)
                this.regsX[this.regRAB].store(this.regA);
                break;
            case CPU.IW_PF.STXA:        // 0x0005: Contents of storage register X defined by RAB loaded into operational register A (Xn -> A)
                this.regA.store(this.regsX[this.regRAB]);
                break;
            case CPU.IW_PF.STAY:        // 0x0006: Contents of operational register A loaded into storage register Y defined by RAB (A -> Yn)
                this.regsY[this.regRAB].store(this.regA);
                break;
            case CPU.IW_PF.DISP:        // 0x0007: registers A and B are output to the Display Decoder and the Keyboard is scanned
                return this.opDISP();
            case CPU.IW_PF.BCDS:        // 0x0008: BCD set: enables BCD corrector in arithmetic unit
                this.base = 10;
                break;
            case CPU.IW_PF.BCDR:        // 0x0009: BCD reset: disables BCD corrector in arithmetic unit (which then functions as hexadecimal)
                this.base = 16;
                break;
            case CPU.IW_PF.RABR5:       // 0x000A: LSD of R5 (3 bits) is stored in RAB
                this.regRAB = this.regR5 & 0x7;
                break;
            default:
                return false;
            }
            return true;

        case CPU.IW_MF.RES1:    // 0x0600: (reserved)
        case CPU.IW_MF.RES2:    // 0x0b00: (reserved)
        default:
            break;
        }
        return false;
    }

    /**
     * loadState(state)
     *
     * If any saved values don't match (possibly overridden), abandon the given state and return false.
     *
     * @this {CPU}
     * @param {Array|Object} state
     * @return {boolean}
     */
    loadState(state)
    {
        let stateCPU = state['stateCPU'] || state[0];
        if (!stateCPU || !stateCPU.length) {
            this.println("invalid saved state");
            return false;
        }
        let version = stateCPU.shift();
        if ((version|0) !== (+VERSION|0)) {
            this.printf("saved state version mismatch: %3.2f\n", version);
            return false;
        }
        try {
            this.regsO.forEach((reg) => reg.set(stateCPU.shift()));
            this.regsX.forEach((reg) => reg.set(stateCPU.shift()));
            this.regsY.forEach((reg) => reg.set(stateCPU.shift()));
            this.regSupp.set(stateCPU.shift());
            this.regTemp.set(stateCPU.shift());
            this.base = stateCPU.shift();
            this.fCOND = stateCPU.shift();
            this.regRAB = stateCPU.shift();
            this.regR5 = stateCPU.shift();
            this.regPC = stateCPU.shift();
            this.stack = stateCPU.shift();
            this.regKey = stateCPU.shift();
        } catch(err) {
            this.println("CPU state error: " + err.message);
            return false;
        }
        let stateROM = state['stateROM'] || state[1];
        if (stateROM && this.rom) {
            if (!this.rom.loadState(stateROM)) {
                return false;
            }
        }
        return true;
    }

    /**
     * onCommand(aTokens)
     *
     * Processes commands for our "mini-debugger".
     *
     * @this {CPU}
     * @param {Array.<string>} aTokens
     * @return {string|undefined}
     */
    onCommand(aTokens)
    {
        let result = "";
        let c, condition, count = 0, values = [];
        let s = aTokens[1];
        let addr = Number.parseInt(aTokens[2], 16);
        if (isNaN(addr)) addr = -1;
        let nValues = Number.parseInt(aTokens[3], 10) || 8;

        for (let i = 3; i < aTokens.length; i++) {
            values.push(Number.parseInt(aTokens[i], 16));
        }

        this.nStringFormat = CPU.SFORMAT.DEFAULT;

        switch(s[0]) {
        case 'b':
            c = s.substr(1);
            if (c == 'l') {
                for (c in CPU.BREAK) {
                    condition = CPU.BREAK[c];
                    result += "break on " + condition + " (b" + c + "): " + (this.breakConditions[c] || false) + '\n';
                }
                break;
            }
            condition = CPU.BREAK[c];
            if (condition) {
                this.breakConditions[c] = !this.breakConditions[c];
                result = "break on " + condition + " (b" + c + "): " + this.breakConditions[c];
            } else {
                if (c) result = "unrecognized break option '" + c + "'";
            }
            break;

        case 'e':
            for (let i = 0; i < values.length; i++) {
                /*
                 * We use the ROM's readDirect() and writeDirect() functions, so that reads won't affect the
                 * ROM LED array (if any), and so that writes will be allowed (since ROM is normally unwritable).
                 */
                let prev = this.rom.readDirect(addr);
                if (prev == undefined) break;
                this.rom.writeDirect(addr, values[i]);
                result += this.sprintf("%#06x: %#06x changed to %#06x\n", addr, prev, values[i]);
                count++;
                addr++;
            }
            result += this.sprintf("%d locations updated\n", count);
            break;

        case 'g':
            if (this.time.start()) {
                this.addrStop = addr;
            } else {
                result = "already started\n";
            }
            break;

        case 'h':
            if (!this.time.stop()) result = "already stopped\n";
            break;

        case 't':
            if (s[1] == 'c') this.nStringFormat = CPU.SFORMAT.COMPACT;
            nValues = Number.parseInt(aTokens[2], 10) || 1;
            this.time.onStep(nValues);
            break;

        case 'r':
            if (s[1] == 'c') this.nStringFormat = CPU.SFORMAT.COMPACT;
            this.setRegister(s.substr(1), addr);
            result += this.toString(s[1]);
            break;

        case 'u':
            addr = (addr >= 0? addr : (this.addrPrev >= 0? this.addrPrev : this.regPC));
            while (nValues--) {
                let opcode = this.rom && this.rom.readDirect(addr);
                if (opcode == undefined) break;
                result += this.toInstruction(addr++, opcode);
            }
            this.addrPrev = addr;
            break;

        case '?':
            result = "additional commands:\n";
            CPU.COMMANDS.forEach((cmd) => {result += cmd + '\n';});
            break;

        default:
            if (aTokens[0]) {
                result = "unrecognized command '" + aTokens[0] + "' (try '?')\n";
            }
            break;
        }
        return result;
    }

    /**
     * onInput(col, row)
     *
     * Called by the Input device to provide notification of key presses and releases.
     *
     * Converts a logical (col,row), where the top left keyboard position is (0,0), into an 8-bit physical
     * location value, where bits 0-3 are the row (0-based) and bits 4-7 are the col (1-based).  Moreover,
     * if either col or row is negative, then all bits are cleared.
     *
     * @this {CPU}
     * @param {number} col
     * @param {number} row
     */
    onInput(col, row)
    {
        let b = 0;
        if (col >= 0 && row >= 0) {

            b = row | ((col + 1) << 4);
        }
        this.regKey = b;
    }

    /**
     * onLoad(state)
     *
     * Automatically called by the Machine device if the machine's 'autoSave' property is true.
     *
     * @this {CPU}
     * @param {Array|Object} state
     * @return {boolean}
     */
    onLoad(state)
    {
        return state && this.loadState(state)? true : false;
    }

    /**
     * onPower(on)
     *
     * Called by the Machine device to provide notification of a power event.
     *
     * @this {CPU}
     * @param {boolean} on (true to power on, false to power off)
     */
    onPower(on)
    {
        if (on) {
            this.time.start();
        } else {
            this.time.stop();
            this.clearDisplays();
        }
    }

    /**
     * onReset()
     *
     * Called by the Machine device to provide notification of a reset event.
     *
     * @this {CPU}
     */
    onReset()
    {
        this.println("reset");
        this.regPC = 0;
        this.rom.reset();
        this.clearDisplays();
        if (!this.time.isRunning()) this.print(this.toString());
    }

    /**
     * onSave(state)
     *
     * Automatically called by the Machine device before all other devices have been powered down (eg, during
     * a page unload event).
     *
     * @this {CPU}
     * @param {Array} state
     */
    onSave(state)
    {
        this.saveState(state);
    }

    /**
     * onUpdate(fTransition)
     *
     * Enumerate all bindings and update their values.
     *
     * Called by Time's update() function whenever 1) its YIELDS_PER_UPDATE threshold is reached
     * (default is twice per second), 2) a step() operation has just finished (ie, the device is being
     * single-stepped), and 3) a start() or stop() transition has occurred.
     *
     * @this {CPU}
     * @param {boolean} [fTransition]
     */
    onUpdate(fTransition)
    {
        for (let binding in this.bindings) {
            let regMap = this.regMap[binding];
            if (regMap) {
                let sValue;
                let reg = regMap[0];
                let digit = regMap[1];
                if (digit < 0) {
                    sValue = reg.toString();
                } else {
                    sValue = Device.HexUpperCase[reg.digits[digit]];
                }
                this.setBindingText(binding, sValue);
            }
        }
        if (fTransition && !this.time.isRunning()) {
            this.rom.drawArray();
            this.print(this.toString());
        }
    }

    /**
     * opDISP()
     *
     * Handles the DISP opcode.  The following details/tables are from the TI patents:
     *
     *      Register A and Register B are outputted to the display decoder and the keyboard is scanned.
     *      A closed keyboard switch loads K5 and sets condition latch.
     *
     *      Display decoder receives a data representing numerals to be displayed from operational register A.
     *
     *      Display decoder is also responsive to the data from operational register B, which indicates where
     *      the decimal point is to be displayed among the numerals, whether minus signs are to be provided,
     *      and which digits are to be blanked, according to the codes listed in Table III.
     *
     *      TABLE II
     *
     *          Register R5
     *          --------------------------------
     *             7   6   5   4   3   2   1   0
     *           KR8 KR7 KR6 KR5 KR4 KR3 KR2 KR1
     *
     *            K             KS (Keyboard Line Actuated)
     *          -------------------------------------------
     *           001            K1
     *           010            K2
     *           011            K3
     *           100            K4
     *           101            K5
     *
     *            K             KS (Segment Scan Line Actuated)
     *          -----------------------------------------------
     *           000            KS0     (SEG E)
     *           001            KS1     (SEG F)
     *           010            KS2     (SEG B)
     *           011            KS3     (SEG G)
     *           100            KS4     (SEG C)
     *           101            KS5     (SEG A)
     *           110            KS6     (SEG D/D12)
     *
     *      TABLE III
     *
     *          Register B
     *          Control Code    Function
     *          ------------    ------------------------------------------------------------
     *           1XXX           Display digit is blanked in the corresponding digit position
     *           0XX1           Turns on minus sign (Segment G) in corresponding digit position
     *           XX1X           Turns on decimal point and digit specified by register A in corresponding digit position
     *           0XX0           Turns on digit specified by Register A in corresponding digit position
     *
     * @this {CPU}
     * @return {boolean} (true to indicate the opcode was successfully decoded)
     */
    opDISP()
    {
        this.checkBreakCondition('o');

        if (this.led) {
            for (let col = 0, iDigit = 11; iDigit >= 0; col++, iDigit--) {
                let ch;
                if (this.regB.digits[iDigit] & 0x8) {
                    ch = ' ';
                }
                else if (this.regB.digits[iDigit] & 0x1) {
                    ch = '-';
                }
                else {
                    ch = Device.HexUpperCase[this.regA.digits[iDigit]];
                }
                if (this.led.setLEDState(col, 0, ch, (this.regB.digits[iDigit] & 0x2)? LED.FLAGS.PERIOD : 0)) {
                    this.checkBreakCondition('om');
                }
            }
            this.updateIndicators();
        }

        /*
         * The TI patents indicate that DISP operations slow the clock by a factor of 4, and on top of
         * that, the display scan generator uses a HOLD signal to prevent the Program Counter from being
         * incremented while it cycles through all 8 possible segments for all digits, so the total delay
         * imposed by DISP is a factor of 32.  Since every instruction already accounts for OP_CYCLES once,
         * I need to account for it here 31 more times.
         */
        this.nCyclesRemain -= CPU.OP_CYCLES * 31;

        if (this.regKey) {
            this.regR5 = this.regKey;
            this.fCOND = true;
            this.checkBreakCondition('i');
        }

        return true;
    }

    /**
     * pop()
     *
     * @this {CPU}
     * @return {number}
     */
    pop()
    {
        /*
         * Normally, you would simply decrement a stack pointer, but that's not how this stack was implemented.
         */
        let addr = this.stack[0];
        let i = 0, j = this.stack.length - 1;
        while (i < j) this.stack[i] = this.stack[++i];
        this.stack[i] = -1;

        return addr;
    }

    /**
     * push(addr)
     *
     * @this {CPU}
     * @param {number} addr
     */
    push(addr)
    {
        /*
         * Normally, you would simply increment a stack pointer, but that's not how this stack was implemented.
         */
        let i = this.stack.length - 1;
        /*
         * Apparently, legitimate values are allowed to fall off the end of the stack, so we can't assert overflow.
         *
         *
         */
        while (i > 0) this.stack[i] = this.stack[--i];
        this.stack[0] = addr;
    }

    /**
     * saveState(state)
     *
     * @this {CPU}
     * @param {Array} state
     */
    saveState(state)
    {
        let stateCPU = [];
        let stateROM = [];
        stateCPU.push(+VERSION);
        this.regsO.forEach((reg) => stateCPU.push(reg.get()));
        this.regsX.forEach((reg) => stateCPU.push(reg.get()));
        this.regsY.forEach((reg) => stateCPU.push(reg.get()));
        stateCPU.push(this.regSupp.get());
        stateCPU.push(this.regTemp.get());
        stateCPU.push(this.base);
        stateCPU.push(this.fCOND);
        stateCPU.push(this.regRAB);
        stateCPU.push(this.regR5);
        stateCPU.push(this.regPC);
        stateCPU.push(this.stack);
        stateCPU.push(this.regKey);
        if (this.rom) this.rom.saveState(stateROM);
        state.push(stateCPU);
        state.push(stateROM);
    }

    /**
     * setRegister(name, value)
     *
     * TODO: Even though this CPU implementation contains its own "mini-debugger", it should eventually be
     * changed to use the Device register services to define/get/set registers; for now, this override suffices.
     *
     * @this {CPU}
     * @param {string} name
     * @param {number} value
     * @return {boolean}
     */
    setRegister(name, value)
    {
        if (name && value >= 0) {
            switch(name) {
            case "pc":
                this.regPC = value;
                return true;
            default:
                this.println("unrecognized register: " + name);
                break;
            }
        }
        return false;
    }

    /**
     * toInstruction(addr, opcode, fCompact)
     *
     * Returns a string representation of the specified instruction.
     *
     * The TI-57 patents suggest mnemonics for some of the instructions, but not all, so I've taken
     * some liberties in the interests of clarity and familiarity.  Special-purpose instructions like
     * "BCDS" and "BCDR" are displayed as-is, but for more general-purpose instructions, I've adopted
     * the following format:
     *
     *      operation   destination,input(s)[,mask]
     *
     * Instructions that the patent refers to as "STYA", "STAY", "STXA", and "STAX" are all displayed
     * as "STORE" instructions; eg, instead of "STAX", I use:
     *
     *      STORE       X[RAB],A
     *
     * Instructions that use masks are displayed as either "LOAD", "MOVE", or "XCHG".  If the result
     * of the operation is suppressed, the destination will be displayed as "NUL" instead of a register.
     * And if the inputs are being added, subtracted, shifted left, or shifted right, they will be
     * displayed with "+", "-", "<<", or ">>", respectively.  Finally, the 16-digit mask is displayed,
     * as a series of hex digits rather than the unmemorable names used in the patents (eg, MMSD, FMAEX,
     * etc).  I do use the patent nomenclature internally, just not for display purposes.
     *
     * @this {CPU}
     * @param {number} addr
     * @param {number|undefined} [opcode]
     * @param {boolean} [fCompact]
     * @return {string}
     */
    toInstruction(addr, opcode, fCompact = false)
    {
        let sOp = "???", sOperands = "";

        if (opcode & 0x1000) {
            let v;
            if (opcode & 0x0800) {
                sOp = "BR";
                if (opcode & 0x0400) {
                    sOp += "C";
                } else {
                    sOp += "NC";
                }
                v = (addr & 0x0400) | (opcode & 0x03FF);
            } else {
                sOp = "CALL";
                v = opcode & 0x07FF;
            }
            sOperands = this.sprintf("%#06x", v);
        }
        else if (opcode >= 0) {
            let d, j, k, l, n;
            let mask = opcode & CPU.IW_MF.MASK;
            let sMask, sOperator, sDst, sSrc, sStore;

            switch(mask) {
            case CPU.IW_MF.MMSD:    // 0x0000: Mantissa Most Significant Digit (D12)
            case CPU.IW_MF.ALL:     // 0x0100: (D0-D15)
            case CPU.IW_MF.MANT:    // 0x0200: Mantissa (D2-D12)
            case CPU.IW_MF.MAEX:    // 0x0300: Mantissa and Exponent (D0-D12)
            case CPU.IW_MF.LLSD:    // 0x0400: Mantissa Least Significant Digit (D2)
            case CPU.IW_MF.EXP:     // 0x0500: Exponent (D0-D1)
            case CPU.IW_MF.FMAEX:   // 0x0700: Flag and Mantissa and Exponent (D0-D13)
            case CPU.IW_MF.D14:     // 0x0800: (D14)
            case CPU.IW_MF.FLAG:    // 0x0900: (D13-D15)
            case CPU.IW_MF.DIGIT:   // 0x0a00: (D14-D15)
            case CPU.IW_MF.D13:     // 0x0d00: (D13)
            case CPU.IW_MF.D15:     // 0x0f00: (D15)
                sMask = this.toStringMask(mask);
                j = (opcode & CPU.IW_MF.J_MASK) >> CPU.IW_MF.J_SHIFT;
                k = (opcode & CPU.IW_MF.K_MASK) >> CPU.IW_MF.K_SHIFT;
                l = (opcode & CPU.IW_MF.L_MASK) >> CPU.IW_MF.L_SHIFT;
                n = (opcode & CPU.IW_MF.N_MASK);

                sOp = "LOAD";
                sOperator = "";
                sDst = "?"; sSrc = "?";

                if (!n) {
                    sOperator = (k == 5? "<<" : "+");
                } else {
                    sOperator = (k == 5? ">>" : "-");
                }

                switch(l) {
                case 0:
                    sDst = CPU.OP_INPUTS[j];
                    break;
                case 1:
                    if (k < 4) sDst = CPU.OP_INPUTS[k];
                    break;
                case 2:
                    if (k < 6) sDst = "NUL";    // "suppressed" operation
                    break;
                case 3:
                    if (!n) {
                        sOp = "XCHG";
                        if (!j) sDst = "A";     // j != 0 or k >= 4 is invalid
                        if (k < 4) sSrc = CPU.OP_INPUTS[k];
                    } else {
                        sOp = "MOVE";
                        sDst = CPU.OP_INPUTS[j];
                        sSrc = CPU.OP_INPUTS[k];    // k == 5 is invalid
                    }
                    k = -1;
                    break;
                }

                switch(k) {
                case 0:
                case 1:
                case 2:
                case 3:
                    sSrc = CPU.OP_INPUTS[j] + sOperator + CPU.OP_INPUTS[k];
                    break;
                case 4:
                case 5:
                    sSrc = CPU.OP_INPUTS[j] + sOperator + "1";
                    break;
                case 6:
                    sSrc = CPU.OP_INPUTS[j] + sOperator + "R5L";
                    break;
                case 7:
                    sSrc = CPU.OP_INPUTS[j] + sOperator + "R5";
                    break;
                }
                sOperands = sDst + "," + sSrc + "," + sMask;
                break;

            case CPU.IW_MF.FF:      // 0x0c00: (used for flag operations)
                switch(opcode & CPU.IW_FF.MASK) {
                case CPU.IW_FF.SET:
                    sOp = "SET";
                    break;
                case CPU.IW_FF.RESET:
                    sOp = "CLR";
                    break;
                case CPU.IW_FF.TEST:
                    sOp = "TST";
                    break;
                case CPU.IW_FF.TOGGLE:
                    sOp = "NOT";
                    break;
                }
                sOperands = this.regsO[(opcode & CPU.IW_FF.J_MASK) >> CPU.IW_FF.J_SHIFT].name;
                d = ((opcode & CPU.IW_FF.D_MASK) >> CPU.IW_FF.D_SHIFT);
                sOperands += '[' + (d? (d + 12) : '?') + ':' + ((opcode & CPU.IW_FF.B_MASK) >> CPU.IW_FF.B_SHIFT) + ']';
                break;

            case CPU.IW_MF.PF:      // 0x0e00: (used for misc operations)
                sStore = "STORE";
                switch(opcode & CPU.IW_PF.MASK) {
                case CPU.IW_PF.STYA:    // 0x0000: Contents of storage register Y defined by RAB loaded into operational register A (Yn -> A)
                    sOp = sStore;
                    sOperands = "A,Y[RAB]";
                    break;
                case CPU.IW_PF.RABI:    // 0x0001: Bits 4-6 of instruction are stored in RAB
                    sOp = sStore;
                    sOperands = "RAB," + ((opcode & 0x70) >> 4);
                    break;
                case CPU.IW_PF.BRR5:    // 0x0002: Branch to R5
                    sOp = "BR";
                    sOperands = "R5";
                    break;
                case CPU.IW_PF.RET:     // 0x0003: Return
                    sOp = "RET";
                    break;
                case CPU.IW_PF.STAX:    // 0x0004: Contents of operational register A loaded into storage register X defined by RAB (A -> Xn)
                    sOp = sStore;
                    sOperands = "X[RAB],A";
                    break;
                case CPU.IW_PF.STXA:    // 0x0005: Contents of storage register X defined by RAB loaded into operational register A (Xn -> A)
                    sOp = sStore;
                    sOperands = "A,X[RAB]";
                    break;
                case CPU.IW_PF.STAY:    // 0x0006: Contents of operational register A loaded into storage register Y defined by RAB (A -> Yn)
                    sOp = sStore;
                    sOperands = "Y[RAB],A";
                    break;
                case CPU.IW_PF.DISP:    // 0x0007: registers A and B are output to the Display Decoder and the Keyboard is scanned
                    sOp = "DISP";
                    break;
                case CPU.IW_PF.BCDS:    // 0x0008: BCD set: enables BCD corrector in arithmetic unit
                    sOp = "BCDS";
                    break;
                case CPU.IW_PF.BCDR:    // 0x0009: BCD reset: disables BCD corrector in arithmetic unit (which then functions as hexadecimal)
                    sOp = "BCDR";
                    break;
                case CPU.IW_PF.RABR5:   // 0x000A: LSD of R5 (3 bits) is stored in RAB
                    sOp = sStore;
                    sOperands = "RAB,R5L";
                    break;
                default:
                    break;
                }
                break;

            case CPU.IW_MF.RES1:    // 0x0600: (reserved)
            case CPU.IW_MF.RES2:    // 0x0b00: (reserved)
            default:
                break;
            }
        }
        return this.sprintf(fCompact? "%03X %04X\n" : "%#06x: %#06x  %-8s%s\n", addr, opcode, sOp, sOperands);
    }

    /**
     * toString(options, regs)
     *
     * @this {CPU}
     * @param {string} [options]
     * @param {Array.<Reg64>} [regs]
     * @return {string}
     */
    toString(options = "", regs = null)
    {
        let s = "";
        if (this.nStringFormat) {
            if (this.rom) {
                s += this.toInstruction(this.regPC, this.rom.readDirect(this.regPC), true);
            }
            s += "  ";
            for (let i = 0, n = this.regsO.length; i < n; i++) {
                s += this.regsO[i].toString() + ' ';
            }
            s += "\n ";
            s += " COND=" + (this.fCOND? 1 : 0);
            s += " BASE=" + this.base;
            s += " R5=" + this.sprintf("%02X", this.regR5);
            s += " RAB=" + this.regRAB + " ST=";
            this.stack.forEach((addr, i) => {s += this.sprintf("%03X ", (addr < 0? 0 : (addr & 0xfff)));});
            return s.trim();
        }
        if (regs) {
            for (let i = 0, n = regs.length >> 1; i < n; i++) {
                s += regs[i].toString(true) + '  ' + regs[i+n].toString(true) + '\n';
            }
            return s;
        }
        s += this.toString(options, this.regsO);
        if (options.indexOf('a') >= 0) {
            s += this.toString(options, this.regsX);
            s += this.toString(options, this.regsY);
        }
        s += "COND=" + (this.fCOND? 1 : 0);
        s += " BASE=" + this.base;
        s += " R5=" + this.sprintf("%#04x", this.regR5);
        s += " RAB=" + this.regRAB + ' ';
        this.stack.forEach((addr, i) => {s += this.sprintf("ST%d=%#06x ", i, addr & 0xffff);});
        if (this.rom) {
            s += '\n' + this.toInstruction(this.regPC, this.rom.readDirect(this.regPC));
        }
        this.addrPrev = this.regPC;
        return s;
    }

    /**
     * toStringMask(mask)
     *
     * @this {CPU}
     * @param {number} mask
     * @return {string}
     */
    toStringMask(mask)
    {
        let s = "";
        let range = CPU.RANGE[mask];
        for (let i = 0; i < 16; i++) {
            if (!(i % 4)) s = ' ' + s;
            s = (range? (i >= range[0] && i <= range[1]? 'F' : '0') : '?') + s;
        }
        return s;
    }

    /**
     * updateIndicators(on)
     *
     * I made the following observations while running the TI-57's 1501 ROM:
     *
     *      "2nd"   C[14] bit 3 set
     *      "INV"   B[15] bit 2 set
     *      "Deg"   X4[15] == 0x0
     *      "Rad"   X4[15] == 0x4
     *      "Grad"  X4[15] == 0xC
     *
     * Similarly, for the TI-55's 1503 ROM:
     *
     *      "2nd"   B[15] bit 2 set
     *      "INV"   D[15] bit 3 set
     *      "Deg"   C[15] == 0x0
     *      "Rad"   C[15] == 0x1
     *      "Grad"  C[15] == 0x2
     *
     * If this is the first time any of the indicator properties (ie, f2nd, fINV, or angleMode) have been initialized,
     * we will also propagate the LED display color (this.led.color) to the indicator's color, so that the colors of all
     * the elements overlaid on the display match.
     *
     * NOTE: These indicators are specific to locations chosen by the ROM, not by the CPU's hardware, but since the
     * ROMs are closely tied to their respective CPUs, I'm going to cheat and just check the CPU type.
     *
     * @this {CPU}
     * @param {boolean} [on] (default is true, to display all active indicators; set to false to force all indicators off)
     */
    updateIndicators(on = true)
    {
        let element;
        let f2nd = on && (this.type == CPU.TYPE.TMS1501? !!(this.regC.digits[14] & 0x8) : !!(this.regB.digits[15] & 0x4));
        if (this.f2nd !== f2nd) {
            if ((element = this.bindings['2nd'])) {
                element.style.opacity = f2nd? "1" : "0";
                if (this.f2nd === undefined && this.led) element.style.color = this.led.color;
            }
            this.f2nd = f2nd;
        }
        let fINV = on && (this.type == CPU.TYPE.TMS1501? !!(this.regB.digits[15] & 0x4) : !!(this.regD.digits[15] & 0x8));
        if (this.fINV !== fINV) {
            if ((element = this.bindings['INV'])) {
                element.style.opacity = fINV? "1" : "0";
                if (this.fINV === undefined && this.led) element.style.color = this.led.color;
            }
            this.fINV = fINV;
        }
        let angleBits = (this.type == CPU.TYPE.TMS1501? (this.regsX[4].digits[15] >> 2) : this.regC.digits[15]);
        let angleMode = on? ((!angleBits)? CPU.ANGLEMODE.DEGREES : (angleBits == 1)? CPU.ANGLEMODE.RADIANS : CPU.ANGLEMODE.GRADIENTS) : CPU.ANGLEMODE.OFF;
        if (this.angleMode !== angleMode) {
            if ((element = this.bindings['Deg'])) {
                element.style.opacity = (angleMode == CPU.ANGLEMODE.DEGREES)? "1" : "0";
                if (this.angleMode === undefined && this.led) element.style.color = this.led.color;
            }
            if ((element = this.bindings['Rad'])) {
                element.style.opacity = (angleMode == CPU.ANGLEMODE.RADIANS)? "1" : "0";
                if (this.angleMode === undefined && this.led) element.style.color = this.led.color;
            }
            if ((element = this.bindings['Grad'])) {
                element.style.opacity = (angleMode == CPU.ANGLEMODE.GRADIENTS)? "1" : "0";
                if (this.angleMode === undefined && this.led) element.style.color = this.led.color;
            }
            this.angleMode = angleMode;
        }
    }
}

CPU.IW_MF = {           // Instruction Word Mask Field
    MASK:   0x0F00,
    MMSD:   0x0000,     // Mantissa Most Significant Digit (D12)
    ALL:    0x0100,     // (D0-D15)
    MANT:   0x0200,     // Mantissa (D2-D12)
    MAEX:   0x0300,     // Mantissa and Exponent (D0-D12)
    LLSD:   0x0400,     // Mantissa Least Significant Digit (D2)
    EXP:    0x0500,     // Exponent (D0-D1)
    RES1:   0x0600,     // (reserved)
    FMAEX:  0x0700,     // Flag and Mantissa and Exponent (D0-D13)
    D14:    0x0800,     // (D14)
    FLAG:   0x0900,     // (D13-D15)
    DIGIT:  0x0A00,     // (D14-D15)
    RES2:   0x0B00,     // (reserved)
    FF:     0x0C00,     // FF used for additional instruction decoding
    D13:    0x0D00,     // (D13)
    PF:     0x0E00,     // PF used for additional instruction decoding
    D15:    0x0F00,     // (D15)
    J_MASK: 0x00C0,
    J_SHIFT:     6,
    K_MASK: 0x0038,
    K_SHIFT:     3,
    L_MASK: 0x0006,
    L_SHIFT:     1,
    N_MASK: 0x0001
};

CPU.IW_FF = {           // Instruction Word Flag Field (used when the Mask Field is FF)
    MASK:   0x0003,
    SET:    0x0000,
    RESET:  0x0001,
    TEST:   0x0002,
    TOGGLE: 0x0003,
    J_MASK: 0x00C0,
    J_SHIFT:     6,
    D_MASK: 0x0030,
    D_SHIFT:     4,
    B_MASK: 0x000C,
    B_SHIFT:     2,
};

CPU.IW_PF = {           // Instruction Word Misc Field (used when the Mask Field is PF)
    MASK:   0x000F,
    STYA:   0x0000,     // Contents of storage register Y defined by RAB loaded into operational register A (Yn -> A)
    RABI:   0x0001,     // Bits 4-6 of instruction are stored in RAB
    BRR5:   0x0002,     // Branch to R5
    RET:    0x0003,     // Return
    STAX:   0x0004,     // Contents of operational register A loaded into storage register X defined by RAB (A -> Xn)
    STXA:   0x0005,     // Contents of storage register X defined by RAB loaded into operational register A (Xn -> A)
    STAY:   0x0006,     // Contents of operational register A loaded into storage register Y defined by RAB (A -> Yn)
    DISP:   0x0007,     // registers A and B are output to the Display Decoder and the Keyboard is scanned
    BCDS:   0x0008,     // BCD set: enables BCD corrector in arithmetic unit
    BCDR:   0x0009,     // BCD reset: disables BCD corrector in arithmetic unit (which then functions as hexadecimal)
    RABR5:  0x000A,     // LSD of R5 (3 bits) is stored in RAB
    RES1:   0x000B,     // (reserved)
    RES2:   0x000C,     // (reserved)
    RES3:   0x000D,     // (reserved)
    RES4:   0x000E,     // (reserved)
    RES5:   0x000F      // (reserved)
};

CPU.RANGE = {
    [CPU.IW_MF.MMSD]:  [12,12],         // 0x0000: Mantissa Most Significant Digit (D12)
    [CPU.IW_MF.ALL]:   [0,15],          // 0x0100: (D0-D15)
    [CPU.IW_MF.MANT]:  [2,12],          // 0x0200: Mantissa (D2-D12)
    [CPU.IW_MF.MAEX]:  [0,12],          // 0x0300: Mantissa and Exponent (D0-D12)
    [CPU.IW_MF.LLSD]:  [2,2],           // 0x0400: Mantissa Least Significant Digit (D2)
    [CPU.IW_MF.EXP]:   [0,1],           // 0x0500: Exponent (D0-D1)
    [CPU.IW_MF.FMAEX]: [0,13],          // 0x0700: Flag and Mantissa and Exponent (D0-D13)
    [CPU.IW_MF.D14]:   [14,14],         // 0x0800: (D14)
    [CPU.IW_MF.FLAG]:  [13,15],         // 0x0900: (D13-D15)
    [CPU.IW_MF.DIGIT]: [14,15],         // 0x0a00: (D14-D15)
    [CPU.IW_MF.D13]:   [13,13],         // 0x0d00: (D13)
    [CPU.IW_MF.D15]:   [15,15],         // 0x0f00: (D15)
};

CPU.OP_CYCLES = 128;                    // default number of cycles per instruction

/*
 * Table of operations used by toInstruction() for "masked" operations
 */
CPU.OP = {
    ADD:    0,
    SUB:    1,
    SHL:    2,
    SHR:    3,
    XCHG:   4,
    MOVE:   5
};

CPU.TYPE = {
    TMS1501:    1501,       // aka TI-57
    TMS1502:    1502,       // aka TI-42 ("MBA")
    TMS1503:    1503        // aka TI-55
};

CPU.ANGLEMODE = {
    OFF:        0,
    DEGREES:    1,
    RADIANS:    2,
    GRADIENTS:  3
};

CPU.BREAK = {
    'i':    "input",
    'o':    "output",
    'om':   "output modification"
};

CPU.SFORMAT = {
    DEFAULT:    0,
    COMPACT:    1
};

/*
 * Table of operational inputs used by toInstruction() for "masked" operations
 */
CPU.OP_INPUTS = ["A","B","C","D","1","?","R5L","R5"];

CPU.COMMANDS = [
    "b[c]\t\tbreak on condition c",
    "bl\t\tlist break conditions",
    "e [addr] ...\tedit ROM locations",
    "g [addr]\trun (to addr)",
    "h\t\thalt",
    "r[a]\t\tdump (all) registers",
    "t [n]\t\tstep (n instructions)",
    "u [addr] [n]\tunassemble (at addr)"
];

Defs.CLASSES["CPU"] = CPU;

/**
 * @copyright https://www.pcjs.org/modules/devices/main/machine.js (C) Jeff Parsons 2012-2019
 */

/**
 * @class {Machine}
 * @unrestricted
 * @property {CPU} cpu
 * @property {string} sConfigFile
 * @property {boolean} fConfigLoaded
 * @property {boolean} fPageLoaded
 */
class Machine extends Device {
    /**
     * Machine(idMachine, sConfig, sParms)
     *
     * If sConfig contains a JSON object definition, then we parse it immediately and save the result in this.config;
     * otherwise, we assume it's the URL of an JSON object definition, so we request the resource, and once it's loaded,
     * we parse it.
     *
     * One important change in v2: the order of the device objects in the JSON file determines creation/initialization order.
     * In general, the Machine object should always be first (it's always created first anyway), and the Time object should
     * be listed next, so that its services are available to any other device when they're created/initialized.
     *
     * Sample config:
     *
     *    {
     *      "ti57": {
     *        "class": "Machine",
     *        "type": "TI57",
     *        "name": "TI-57 Programmable Calculator Simulation",
     *        "version": 2.00,
     *        "autoSave": true,
     *        "autoStart": true,
     *        "bindings": {
     *          "power": "powerTI57",
     *          "reset": "resetTI57",
     *          "clear": "clearTI57",
     *          "print": "printTI57"
     *        }
     *      },
     *      "clock": {
     *        "class": "Time",
     *        "cyclesPerSecond": 650000
     *        "bindings": {
     *          "run": "runTI57",
     *          "speed": "speedTI57",
     *          "step": "stepTI57"
     *        },
     *        "overrides": ["cyclesPerSecond"]
     *      },
     *      "display": {
     *        "class": "LED",
     *        "type": 3,
     *        "cols": 12,
     *        "rows": 1,
     *        "color": "red",
     *        "bindings": {
     *          "container": "displayTI57"
     *        },
     *        "overrides": ["color","backgroundColor"]
     *      },
     *      "buttons": {
     *        "class": "Input",
     *        "map": [
     *          ["2nd",  "inv",  "lnx",  "\\b",  "clr"],
     *          ["lrn",  "xchg", "sq",   "sqrt", "rcp"],
     *          ["sst",  "sto",  "rcl",  "sum",  "exp"],
     *          ["bst",  "ee",   "(",    ")",    "/"],
     *          ["gto",  "7",    "8",    "9",    "*"],
     *          ["sbr",  "4",    "5",    "6",    "-"],
     *          ["rst",  "1",    "2",    "3",    "+"],
     *          ["r/s",  "0",    ".",    "+/-",  "=|\\r"]
     *        ],
     *        "location": [139, 325, 368, 478, 0.34, 0.5, 640, 853, 418, 180, 75, 36],
     *        "bindings": {
     *          "surface": "imageTI57"
     *        }
     *      },
     *      "rom": {
     *        "class": "ROM",
     *        "wordSize": 13,
     *        "valueSize": 16,
     *        "valueTotal": 2048,
     *        "littleEndian": true,
     *        "file": "ti57le.bin",
     *        "reference": "",
     *        "values": [
     *        ]
     *      },
     *      "cpu": {
     *        "class": "CPU",
     *        "type": "TMS-1500",
     *        "input": "buttons",
     *        "output": "display"
     *      }
     *    }
     *
     * @this {Machine}
     * @param {string} idMachine (of both the machine AND the <div> to contain it)
     * @param {string} sConfig (JSON configuration for entire machine, including any static resources)
     * @param {string} [sParms] (optional JSON parameters that can supplement or override the configuration)
     */
    constructor(idMachine, sConfig, sParms)
    {
        super(idMachine, idMachine);

        let machine = this;
        this.ready = false;
        this.powered = false;
        this.sParms = sParms;
        this.sConfigFile = "";
        this.fConfigLoaded = false;
        this.fPageLoaded = false;

        /*
         * You can pass "m" commands to the machine via the "commands" parameter to turn on any desired
         * message groups, but since the Debugger is responsible for parsing those commands, and since the
         * Debugger is usually not initialized until last, one alternative is to hard-code any MESSAGE groups
         * here, to ensure that all relevant messages from all the device constructors get displayed.
         */
        this.messages = MESSAGE.WARN;

        sConfig = sConfig.trim();
        if (sConfig[0] == '{') {
            this.loadConfig(sConfig);
        } else {
            this.sConfigFile = sConfig;
            this.getResource(this.sConfigFile, function onLoadConfig(sURL, sResource, readyState, nErrorCode) {
                if (readyState == 4) {
                    if (!nErrorCode && sResource) {
                        machine.loadConfig(sResource);
                        machine.initDevices();
                    }
                    else {
                        machine.printf("error (%d) loading configuration: %s\n", nErrorCode, sURL);
                    }
                }
            });
        }

        /*
         * Device initialization is now deferred until after the page is fully loaded, for the benefit
         * of devices (eg, Input) that may be dependent on page resources.
         *
         * Strangely, for these page events, I must use the window object rather than the document object.
         */
        window.addEventListener('load', function onLoadPage(event) {
            machine.fPageLoaded = true;
            machine.initDevices();
        });
        let sEvent = this.isUserAgent("iOS")? 'pagehide' : (this.isUserAgent("Opera")? 'unload' : undefined);
        window.addEventListener(sEvent || 'beforeunload', function onUnloadPage(event) {
            machine.killDevices();
        });
    }

    /**
     * addBinding(binding, element)
     *
     * @this {Machine}
     * @param {string} binding
     * @param {Element} element
     */
    addBinding(binding, element)
    {
        let machine = this;

        switch(binding) {

        case Machine.BINDING.POWER:
            element.onclick = function onClickPower() {
                if (machine.ready) {
                    machine.onPower();
                }
            };
            break;

        case Machine.BINDING.RESET:
            element.onclick = function onClickReset() {
                if (machine.ready) {
                    machine.onReset();
                }
            };
            break;
        }
        super.addBinding(binding, element);
    }

    /**
     * initDevices()
     *
     * Initializes devices in the proper order.  For example, any Time devices should be initialized first,
     * to ensure that their timer services are available to other devices within their constructor.
     *
     * However, we should avoid device order dependencies whenever possible, so if a Device can defer a call
     * to another Device until its onLoad() or onPower() handler can be called, even better.
     *
     * @this {Machine}
     */
    initDevices()
    {
        let power = true;
        if (this.fConfigLoaded && this.fPageLoaded) {
            for (let idDevice in this.deviceConfigs) {
                let sClass;
                try {
                    let config = this.deviceConfigs[idDevice];
                    sClass = config['class'];
                    if (!Defs.CLASSES[sClass]) {
                        this.printf("unrecognized %s device class: %s\n", idDevice, sClass);
                    }
                    else if (sClass == "Machine") {
                        this.printf("PCjs %s v%3.2f\n%s\n%s\n", config['name'], +VERSION, Machine.COPYRIGHT, Machine.LICENSE);
                        if (this.sConfigFile) this.printf("Configuration: %s\n", this.sConfigFile);
                    } else {
                        let device = new Defs.CLASSES[sClass](this.idMachine, idDevice, config);
                        if (MAXDEBUG) this.printf("%s device: %s\n", sClass, idDevice);
                    }
                }
                catch (err) {
                    this.printf("error initializing %s device '%s': %s\n", sClass, idDevice, err.message);
                    this.removeDevice(idDevice);
                    power = false;
                }
            }
            if (this.fAutoSave) {
                let state = this.loadLocalStorage();
                this.enumDevices(function onDeviceLoad(device) {
                    if (device.onLoad) {
                        if (!device.onLoad(state)) {
                            device.printf("unable to restore state for device: %s\n", device.idDevice);
                            return false;
                        }
                    }
                    return true;
                });
            }
            this.onPower(power);
        }
    }

    /**
     * killDevices()
     *
     * @this {Machine}
     */
    killDevices()
    {
        if (this.fAutoSave) {
            let state = [];
            this.enumDevices(function onDeviceSave(device) {
                if (device.onSave) {
                    device.onSave(state);
                }
                return true;
            });
            this.saveLocalStorage(state);
        }
        this.onPower(false);
    }

    /**
     * loadConfig(sConfig)
     *
     * @this {Machine}
     * @param {string} sConfig
     */
    loadConfig(sConfig)
    {
        try {
            this.deviceConfigs = JSON.parse(sConfig);
            this.checkConfig(this.deviceConfigs[this.idMachine], ['autoSave', 'autoStart']);
            this.fAutoSave = (this.config['autoSave'] !== false);
            this.fAutoStart = (this.config['autoStart'] !== false);
            if (this.sParms) {
                /*
                 * Historically, my web servers have not been consistent about quoting property names inside
                 * the optional parameters object, so we must use eval() instead of JSON.parse() to parse them.
                 * Of couse, the REAL problem is that JSON.parse() is being a dick about otherwise perfectly
                 * legitimate Object syntax, but I shall not repeat my long list of gripes about JSON here.
                 */
                let parms = /** @type {Object} */ (eval("(" + this.sParms + ")"));
                /*
                 * Slam all these parameters into the machine's config, overriding any matching machine configuration
                 * properties.  Any other devices that need access to these properties should use getMachineConfig().
                 */
                for (let prop in parms) {
                    this.config[prop] = parms[prop];
                }
            }
            this.fConfigLoaded = true;
        } catch(err) {
            let sError = err.message;
            let match = sError.match(/position ([0-9]+)/);
            if (match) {
                sError += " ('" + sConfig.substr(+match[1], 40).replace(/\s+/g, ' ') + "...')";
            }
            this.println("machine '" + this.idMachine + "' initialization error: " + sError);
        }
    }

    /**
     * onPower(on)
     *
     * @this {Machine}
     * @param {boolean} [on]
     */
    onPower(on = !this.powered)
    {
        let machine = this;
        if (on) this.println("power on");
        this.enumDevices(function onDevicePower(device) {
            if (device.onPower && device != machine) {
                if (device.config['class'] != "CPU" || machine.fAutoStart || machine.ready) {
                    device.onPower(on);
                } else {
                    /*
                     * If we're not going to start the CPU on the first power notification, then we should
                     * we fake a transition to the "stopped" state, so that the Debugger will display the current
                     * machine state.
                     */
                    device.time.update(true);
                }
            }
            return true;
        });
        this.ready = true;
        this.powered = on;
        if (!on) this.println("power off");
    }

    /**
     * onReset()
     *
     * @this {Machine}
     */
    onReset()
    {
        let machine = this;
        this.enumDevices(function onDeviceReset(device) {
            if (device.onReset && device != machine) {
                device.onReset();
            }
            return true;
        });
    }
}

Machine.BINDING = {
    POWER:      "power",
    RESET:      "reset",
};

Machine.COPYRIGHT = "Copyright © 2012-2019 Jeff Parsons <Jeff@pcjs.org>";
Machine.LICENSE = "License: GPL version 3 or later <http://gnu.org/licenses/gpl.html>";

/*
 * Create the designated machine FACTORY function (this should suffice for all compiled versions).
 *
 * In addition, expose the machine's COMMAND handler interface, so that it's easy to access any of the
 * machine's built-in commands from a browser or IDE debug console:
 *
 *      window.command("?")
 *
 * Normally, access to the COMMAND handlers will be through the machine's WebIO.BINDING.PRINT textarea,
 * but not all machines will have such a control, and sometimes that control will be inaccessible (eg, if
 * the browser is currently debugging the machine).
 */
window[FACTORY] = function createMachine(idMachine, sConfig, sParms) {
    let machine = new Machine(idMachine, sConfig, sParms);
    window[COMMAND] = function(commands) {
        return machine.parseCommands(commands);
    };
    return machine;
};

/*
 * If we're NOT running a compiled release (ie, FACTORY wasn't overriden from "Machine" to something else),
 * then create hard-coded aliases for all known factories; only DEBUG servers should be running uncompiled code.
 */
if (FACTORY == "Machine") {
    window['Invaders'] = window[FACTORY];
    window['LEDs'] = window[FACTORY];
    window['TMS1500'] = window[FACTORY];
    window['VT100'] = window[FACTORY];
}

Defs.CLASSES["Machine"] = Machine;
