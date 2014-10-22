/**
 * @fileoverview Implements disk image support for both FDC and HDC.
 * @author <a href="mailto:Jeff@pcjs.org">Jeff Parsons</a>
 * @version 1.0
 * @suppress {missingProperties}
 * Created 2012-Nov-26
 *
 * Copyright © 2012-2014 Jeff Parsons <Jeff@pcjs.org>
 *
 * This file is part of PCjs, which is part of the JavaScript Machines Project (aka JSMachines)
 * at <http://jsmachines.net/> and <http://pcjs.org/>.
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
 * that loads or runs any version of this software (see Computer.sCopyright).
 *
 * Some PCjs files also attempt to load external resource files, such as character-image files,
 * ROM files, and disk image files. Those external resource files are not considered part of the
 * PCjs program for purposes of the GNU General Public License, and the author does not claim
 * any copyright as to their contents.
 */

/*
 *  The Disk component provides methods for:
 *
 *      1) creating an empty disk: create()
 *      2) loading a disk image: load()
 *      3) mounting a disk image: mount()
 *      4) getting disk information: info()
 *      5) dumping disk contents: dump()
 *      6) seeking a disk sector: seek()
 *      7) reading data from a sector: read()
 *      8) writing data to a sector: write()
 *      9) save disk deltas: save()
 *     10) restore disk deltas: restore()
 *
 *  More functionality may be factored out of the FDC and HDC components later and moved here, to
 *  further reduce some of the duplication between them, but the above functionality is a good start.
 */

/*
 * Client/Server Disk I/O
 *
 * To support large disks without consuming large amounts of client-side memory, and to push
 * client-side disk changes back the server, we need a DiskIO API that can be used in place of
 * the DiskDump API.
 *
 * Use of the DiskIO API and any associated disk images must be tightly coupled to per-user
 * storage and specific machine configurations, to prevent the disk images from being corrupted
 * by inconsistent I/O operations.  Our basic User API (userapi.js) already provides some
 * per-user storage that we can use to get the design rolling.
 *
 * The DiskIO API must also provide the ability to create new (empty) hard disk images in per-user
 * storage and automatically associate them with the machine configurations that requested them.
 *
 * Principles
 * ---
 * Originally, when the Disk class was given a disk image to load and mount, it would request the
 * ENTIRE disk image from the DiskDump module.  That works well for small (floppy) disk images, but
 * for larger disks -- let's just say anything stored on the server as an IMG file -- we'd prefer
 * to interact with that disk using "On-Demand I/O".  Any IMG file on the same server as the PCjs
 * application should be a candidate for on-demand access.
 *
 * On-Demand I/O means that nothing is initially transferred from the server.  As sectors are
 * requested by the PCjs machine, PCjs requests them from the server, and maintains an MRU cache
 * of sectors, periodically discarding the least-used clean sectors above a certain memory limit.
 * Dirty sectors (ie, those that the PCjs machine has written to) must be periodically sent
 * back to the server and then marked as clean, so that they can be discarded like any other
 * sector.
 *
 * We also support "local" init-only disk images, which means that dirty sectors are never sent
 * back to the server and are instead retained by the client for the lifetime of the app; such
 * images are "read-only" as far as the server is concerned, but "read-write" as far as the client
 * is concerned.  Reloading/restarting an app with an "local" disk will return the disk to its
 * initial state.
 *
 * Practice
 * ---
 * Let's first look at what we *already* do for the HDC component:
 *
 *  1) Creating new (empty) disk images
 *  2) Pre-loading pre-built JSON-encoded disk images (converting them to JSON on the fly as needed)
 *
 * An example of #1 is in /configs/pc/machines/5160/cga/256kb/demo/machine.xml:
 *
 *      <hdc id="hdcXT" drives='[{name:"10Mb Hard Disk",type:3}]'/>
 *
 * and an example of #2 is in /configs/pc/disks/fixed/win101.xml:
 *
 *      <hdc id="hdcXT" drives='[{name:"10Mb Hard Disk",path:"/disks/pc/fixed/win101/10mb.json",type:3}]'/>
 *
 * The HDC component expects an array of drive entries.  Array position determines drive numbering
 * (the first entry is drive 0, the second is drive 1, etc), and each entry contains the following
 * properties:
 *
 *      'name': user-friendly name for the disk, if any
 *      'path': URL of the disk image, if any
 *      'type': a drive type
 *
 * Of those properties, only 'type' is required, which provides an index into an HDC "Drive Type"
 * table that determines disk geometry and therefore disk size.  As we add support for larger disks and
 * newer disk controllers, the 'type' parameter will be superseded by either a user-defined 'geometry'
 * parameter that will define number of heads, cylinders, tracks, sectors per track, and (max) bytes per
 * sector, or perhaps a generic 'size' parameter that leaves geometry choices to the HDC component,
 * which will then pass those decisions on to the Disk component.
 *
 * We will enable on-demand I/O for a disk image with a new 'mode' parameter that looks like:
 *
 *      'mode': one of "local", "preload", "demandrw", "demandro"
 *
 * "preload" means the disk image will be completely preloaded, exactly as before; "demandrw" enables
 * full on-demand I/O support; and "demandro" enables on-demand I/O for reads only (all writes are retained
 * and never written back to the server).
 *
 * "ro" will be the fallback for "rw" unless TWO other important criteria are met: 1) the user has a
 * private user key, and therefore per-user storage; and 2) the disk image 'path' contains an asterisk (*)
 * that the server can internally remap to a directory in the user's storage; eg:
 *
 *      'path': <asterisk>/10mb.img (path components following the asterisk are optional)
 *
 * If the disk image does not already exist, it will be created (but not formatted).
 *
 * This preserves the promise that EVERYTHING a user does within a PCjs machine is private (ie, not
 * visible to any other PCjs users).  I don't want to be in the business of saving any user machine
 * states or disk changes, but at least those operations are limited to users who have asked for (and
 * received) a private user key.
 *
 * Another important consideration at this stage is dealing with multiple machines writing to the same
 * disk image; even though we're limiting the "demandrw" mode to per-user images, a single user may still
 * inadvertently start up multiple machines that refer to the same disk image.
 *
 * So, every PCjs machine needs to generate a unique token and include that token with every Disk I/O API
 * operation, so that the server can revoke a previous machine's "rw" access to a disk image when a new
 * machine requests "rw" access to the same disk image.
 *
 * From the client's perspective, revocation can be quietly dealt with by reverting to "demandro" mode;
 * that client becomes stuck with all their dirty sectors until they can reclaim "rw" access, which should
 * only happen if no intervening writes to the disk image on the server have occurred (if I bother allowing
 * reclamation at all).
 *
 * The real challenge here is avoiding revocation of a machine that still has critical changes to commit,
 * but since we can't even solve the problem of a user closing their browser at an inopportune time
 * and potentially leaving a disk image in an inconsistent state, premature revocation is the least of
 * our problems.  Since a real hard disk could suffer the same fate if the machine's power was turned off
 * at the wrong time, you could say that we're simply providing a faithful simulation of reality.
 */

"use strict";

if (typeof module !== 'undefined') {
    var str         = require("../../shared/lib/strlib");
    var usr         = require("../../shared/lib/usrlib");
    var web         = require("../../shared/lib/weblib");
    var DiskAPI     = require("../../shared/lib/diskapi");
    var DumpAPI     = require("../../shared/lib/dumpapi");
    var Component   = require("../../shared/lib/component");
}

/**
 * @class Sector
 * @property {number} sector
 * @property {number} length
 * @property {Array.<number>} data
 * @property {number|null} pattern
 * @property {number} iCylinder
 * @property {number} iHead
 * @property {number} iModify
 * @property {number} cModify
 *
 * Every Sector object (once loaded and fully parsed) should have ALL of the following named properties:
 *
 *      'sector':   sector number
 *      'length':   size of the sector, in bytes
 *      'data':     array of dwords
 *      'pattern':  dword pattern to use for empty or partial sectors (or null if sector still needs to be loaded)
 *
 * initSector() also sets the following properties, to help us quickly identify its location within aDiskData:
 *
 *      iCylinder
 *      iHead
 *
 * In addition, we will maintain the following information on a per-sector basis, as sectors are modified:
 *
 *      iModify:    index of first modified dword in sector
 *      cModify:    number of modified dwords in sector
 *      fDirty:     true if sector is dirty, false if clean (or cleaning in progress)
 *
 * fDirty is used in conjunction with "demandrw" disks; it is set to true whenever the sector is modified, and is
 * set to false whenever the sector has been sent to the server.  If the server write succeeds and fDirty is still
 * false, then the sector modifications are removed (cModify is set to zero).  If the write succeeds but fDirty was
 * set to true again in the meantime, then all the sector modifications (even those that were just written) remain
 * in place (since we don't keep track of more than one modification range within a sector).  And if the write failed,
 * then fDirty is set back to true and again all modifications remain in place; the best we can do is schedule another
 * write attempt.
 *
 * TODO: Perhaps we should also maintain a failure count and stop trying to write sectors that reach a certain
 * threshold.  Error-handling, as usual, is the thorniest problem.
 */

/**
 * Disk(controller, drive, mode)
 *
 * Disk contents are stored as an array (aDiskData) of cylinders, each of which is an array of
 * heads, each of which is an array of sector objects; the latter contain sector numbers and
 * sector data, where sector data is an array of dwords.  The format does not impose any
 * limitations on number of cylinders, number of heads, sectors per track, or bytes per sector.
 *
 * WARNING: All accesses to disk sector properties must be via their string names, not their
 * "dot" names, otherwise code will break after it's been processed by the Closure Compiler,
 * and any dumped disks may be unmountable.  This is a side-effect of how we mount and dump
 * disk images (ie, as JSON-encoded streams).
 *
 * This means, for example, that all references to "track[iSector].data" must actually appear as
 * "track[iSector]['data']".
 *
 * @constructor
 * @extends Component
 * @param {HDC|FDC} controller
 * @param {Object} drive
 * @param {string} mode
 */
function Disk(controller, drive, mode)
{
    Component.call(this, "Disk", {'id': controller.idMachine + ".disk" + Disk.nDisks++}, Disk);

    this.controller = controller;
    this.cmp = controller.cmp;
    this.dbg = controller.dbg;
    this.drive = drive;
    this.mode = mode;

    /*
     * We pull out a number of drive properties that we may or may not need as defaults
     */
    this.sDiskName = drive.name;
    this.nCylinders = drive.nCylinders;
    this.nHeads = drive.nHeads;
    this.nSectors = drive.nSectors;
    this.cbSector = drive.cbSector;
    this.fRemovable = drive.fRemovable;
    this.fOnDemand = this.fRemote = false;

    /*
     * Initialize the disk contents
     */
    this.create();

    /*
     * The following dirty sector and timer properties are used only with fOnDemand disks,
     * assuming fRemote was successfully set.
     */
    this.aDirtySectors = [];
    this.aDirtyTimestamps = [];         // this array is parallel to aDirtySectors
    this.timerWrite = null;             // REMOTE_WRITE_DELAY timer in effect, if any
    this.msTimerWrite = 0;              // the time that the write timer, if any, is set to fire
    this.fWriteInProgress = false;

    this.setReady();
}

/**
 * @class SectorInfo
 * @property {number} 0 contains iCylinder
 * @property {number} 1 contains iHead
 * @property {number} 2 contains iSector
 * @property {number} 3 contains nSectors
 * @property {boolean} 4 contains fAsync
 * @property {function(nErrorCode:number,fAsync:boolean)} 5 contains done
 */

/**
 * The default number of milliseconds to wait before writing a dirty sector back to a remote disk image
 *
 * @const {number}
 */
Disk.REMOTE_WRITE_DELAY = 2000;         // 2-second delay

/*
 * A global disk count, used to form unique Disk component IDs
 */
Disk.nDisks = 0;

Component.subclass(Component, Disk);

/**
 * initBus(cmp, bus, cpu, dbg)
 *
 * We have no real interest in this notification, other than to obtain a reference to the Debugger
 * for every disk loaded BEFORE the initBus() phase; any disk loaded AFTER that point will get its Debugger
 * reference, if any, from the disk controller passed to the Disk() constructor.
 *
 * @this {ChipSet}
 * @param {Computer} cmp
 * @param {Bus} bus
 * @param {X86CPU} cpu
 * @param {Debugger} dbg
 */
Disk.prototype.initBus = function(cmp, bus, cpu, dbg) {
    this.dbg = dbg;
};

/**
 * powerUp(data, fRepower)
 *
 * As with powerDown(), our sole concern here is for REMOTE disks: if a powerDown() call disconnected an
 * "on-demand" disk, we need to get reconnected.  Calling our own load() function should get the job done.
 *
 * The HDC component could have triggered this as well, but its powerUp() function only calls autoMount()
 * in case of page (ie, application) reload, which is fine for local disks but insufficient for remote disks,
 * which have a server connection that must re-established.
 *
 * @this {Disk}
 * @param {Object|null} data
 * @param {boolean} [fRepower]
 * @return {boolean} true if successful, false if failure
 */
Disk.prototype.powerUp = function(data, fRepower) {
    if (!fRepower) {
        if (this.fOnDemand && !this.fRemote) {
            this.load(this.sDiskName, this.sDiskPath);
        }
    }
    return true;
};

/**
 * powerDown(fSave, fShutdown)
 *
 * Our sole concern here is for REMOTE disks, making sure any unwritten changes get flushed to
 * the server during a shutdown.  No local state is ever returned, so fSave is ignored.
 *
 * Local disks are managed by the controller (ie, FDC or HDC) that mounted them; the controller's
 * powerDown() handler will take care of calling save() as needed.
 *
 * TODO: Consider taking responsibility for saving the state of local disks as well; the only reason
 * the controllers still take care of them is historical, because this component originally didn't
 * exist, and even after it was created, it didn't originally receive powerDown() notifications.
 *
 * @this {Disk}
 * @param {boolean} fSave
 * @param {boolean} [fShutdown]
 * @return {Object|boolean}
 */
Disk.prototype.powerDown = function(fSave, fShutdown)
{
    /*
     * If we're connected to a remote disk, take this opportunity to flush any remaining unwritten
     * changes and then close the connection.
     */
    if (this.fRemote) {
        var response;
        var nErrorCode = 0;
        if (this.fWriteInProgress) {
            /*
             * TODO: Verify that the Computer's powerOff() handler will actually honor a false return value.
             */
            if (!web.confirmUser("Disk writes are still in progress, shut down anyway?")) {
                return false;
            }
        }
        while ((response = this.findDirtySectors(false))) {
            if ((nErrorCode = response[0])) {
                this.notice('Unable to save "' + this.sDiskName + '" (error ' + nErrorCode + ')');
                break;
            }
        }
        if (fShutdown) {
            this.disconnectRemoteDisk();
        }
        if (!nErrorCode) this.notice(this.sDiskName + " saved");
    }
    return true;
};

/**
 * create()
 *
 * Initializes the disk contents according to the current drive mode and parameters.
 */
Disk.prototype.create = function()
{
    this.aDiskData = [];
    /*
     * If the drive is using PRELOAD mode, then it will use the load()/mount() process to initialize the disk contents;
     * it wouldn't hurt to let create() do its thing, too, but it's a waste of time.
     */
    if (this.mode != DiskAPI.MODE.PRELOAD) {
        if (DEBUG) this.messageDebugger("blank disk for \"" + this.sDiskName + "\": " + this.nCylinders + " cylinders, " + this.nHeads + " head(s)");
        var aCylinders = new Array(this.nCylinders);
        for (var iCylinder = 0; iCylinder < aCylinders.length; iCylinder++) {
            var aHeads = new Array(this.nHeads);
            for (var iHead = 0; iHead < aHeads.length; iHead++) {
                var aSectors = new Array(this.nSectors);
                for (var iSector = 1; iSector <= aSectors.length; iSector++) {
                    /*
                     * Now that our read() and write() functions can deal with unallocated data
                     * arrays, and can read/write the specified pattern on-the-fly, we no longer need
                     * to pre-allocate and pre-initialize the 'data' array.
                     *
                     * For "local" disks, we can assume a 'pattern' of 0, but for "demandrw" and "demandro"
                     * disks, 'pattern' is set to null, as yet another indication that I/O is required to load
                     * the sector from the server (or to write it back to the server).
                     */
                    aSectors[iSector - 1] = this.initSector(null, iCylinder, iHead, iSector, this.cbSector, (this.mode == DiskAPI.MODE.LOCAL? 0 : null));
                }
                aHeads[iHead] = aSectors;
            }
            aCylinders[iCylinder] = aHeads;
        }
        this.aDiskData = aCylinders;
    }
    this.dwChecksum = 0;
};

/**
 * load(sDiskName, sDiskPath, fnNotify)
 *
 * TODO: Figure out how we can strongly type fnNotify, because the Closure Compiler has issues with:
 *
 *      param {function(Component,Object,Disk,string,string)} fnNotify
 *
 * Also, while we're at it, learn if there are ways to:
 *
 *      1) declare a function taking NO parameters (ie, generate a warning if any parameters are specified)
 *      2) declare a type for a function's return value
 *
 * @this {Disk}
 * @param {string} sDiskName
 * @param {string} sDiskPath
 * @param {function(...)} [fnNotify]
 */
Disk.prototype.load = function(sDiskName, sDiskPath, fnNotify)
{
    var sDiskURL = sDiskPath;

    /*
     * We could use this.log() as well, but it wouldn't also log which component initiated the load.
     */
    if (DEBUG) {
        var sMessage = 'Disk.load("' + sDiskName + '","' + sDiskPath + '")';
        this.controller.log(sMessage);
        this.messageDebugger(sMessage);
    }

    this.sDiskName = sDiskName;
    this.sDiskPath = sDiskPath;
    this.fnNotify = fnNotify;

    /*
     * If there's an occurrence of API_ENDPOINT anywhere in the path, we assume we can use it as-is;
     * ie, that the user has already formed a URL of the type we use ourselves for unconverted disk images.
     */
    if (sDiskPath.indexOf(DumpAPI.ENDPOINT) < 0) {
        /*
         * If the selected disk image has a "json" extension, then we assume it's a pre-converted
         * JSON-encoded disk image, so we load it as-is; otherwise, we ask our server-side disk image
         * converter to return the corresponding JSON-encoded data.
         */
        var sDiskExt = str.getExtension(sDiskPath);
        if (sDiskExt == DumpAPI.FORMAT.JSON) {
            sDiskURL = encodeURI(sDiskPath);
        } else {
            if (this.mode == DiskAPI.MODE.DEMANDRW || this.mode == DiskAPI.MODE.DEMANDRO) {
                sDiskURL = this.connectRemoteDisk(sDiskPath);
                this.fOnDemand = true;
            } else {
                var sDiskParm = DumpAPI.QUERY.PATH;
                var sSizeParm = '&' + DumpAPI.QUERY.MBHD + "=10";
                /*
                 * 'mbhd' is a new parm added for hard disk support.  In the case of 'file' or 'dir' requests,
                 * 'mbhd' informs DumpAPI.ENDPOINT that it should create a hard disk image, and one not larger than
                 * the specified size (eg, 10mb).  In fact, until DumpAPI.ENDPOINT is changed to create custom hard
                 * disk BPBs, you'll always get a standard PC XT 10mb disk image, so if the 'file' or 'dir' contains
                 * more than 10mb of data, the request will fail.  Ultimately, I want to honor the controller's
                 * driveConfig 'size' parm, or to match the capacity required by the driveConfig 'type' parameter.
                 *
                 * If a 'disk' is specified, we pass mbhd=0, because the actual size will depend on the image.
                 * However, I don't currently have any .DSK or .IMG files containing hard disk images; those formats
                 * were really intended for floppy disk images.  If I never create any hard disk image files, then
                 * we can simply eliminate sSizeParm in the 'disk' case.
                 *
                 * Added more extensions to the list of paths-treated-as-disk-images, so that URLs to files located here:
                 *
                 *      ftp://ftp.oldskool.org/pub/TOPBENCH/dskimage/
                 *
                 * can be used as-is.  TODO: There's a TODO in netlib.getFile() regarding remote support that needs
                 * to be resolved first; DiskDump relies on that function for its remote requests, and it currently
                 * supports only HTTP.
                 */
                if (!sDiskPath.indexOf("http:") || !sDiskPath.indexOf("ftp:") || ["dsk", "ima", "img", "360", "720", "12", "144"].indexOf(sDiskExt) >= 0) {
                    sDiskParm = DumpAPI.QUERY.DISK;
                    sSizeParm = '&' + DumpAPI.QUERY.MBHD + "=0";
                } else if (str.endsWith(sDiskPath, '/')) {
                    sDiskParm = DumpAPI.QUERY.DIR;
                }
                sDiskURL = web.getHost() + DumpAPI.ENDPOINT + '?' + sDiskParm + '=' + encodeURIComponent(sDiskPath) + (this.fRemovable ? "" : sSizeParm) + "&" + DumpAPI.QUERY.FORMAT + "=" + DumpAPI.FORMAT.JSON;
            }
        }
    }
    web.loadResource(sDiskURL, true, null, this, this.onLoadDisk, sDiskPath);
};

/**
 * onLoadDisk(sDiskFile, sDiskData, nErrorCode, sDiskPath)
 *
 * This function was originally called mount().  If the mount is successful, we pass the Disk object to the
 * caller's fnNotify handler; otherwise, we pass null.
 *
 * @this {Disk}
 * @param {string} sDiskFile
 * @param {string} sDiskData
 * @param {number} nErrorCode (response from server if anything other than 200)
 * @param {string} sDiskPath (passed through from load() to loadResource())
 */
Disk.prototype.onLoadDisk = function(sDiskFile, sDiskData, nErrorCode, sDiskPath)
{
    var disk = null;
    this.fWriteProtected = false;
    var fPrintOnly = (nErrorCode < 0 && this.cmp && !this.cmp.fPowered);

    if (this.fOnDemand) {
        if (!nErrorCode) {
            if (DEBUG) this.messageDebugger('Disk.onLoadDisk("' + sDiskFile + '","' + sDiskPath + '")');
            this.fRemote = true;
            disk = this;
        } else {
            this.notice('Unable to connect to disk "' + sDiskPath + '" (error ' + nErrorCode + ': ' + sDiskData + ')', fPrintOnly);
        }
    }
    else if (nErrorCode) {
        /*
         * This can happen for innocuous reasons, such as the user switching away too quickly,
         * forcing the request to be cancelled.  And unfortunately, the browser cancels XMLHttpRequest
         * requests BEFORE it notifies any page event handlers, so if the Computer's being powered down,
         * we won't know that yet.  For now, we rely on the lack of a specific error (nErrorCode < 0), and
         * suppress the notify() alert if there's no specific error AND the computer is not powered up yet.
         */
        this.notice("Unable to load disk \"" + this.sDiskName + "\" (error " + nErrorCode + ")", fPrintOnly);
    } else {
        if (DEBUG) this.messageDebugger('Disk.onLoadDisk("' + sDiskFile + '","' + sDiskPath + '")');
        try {
            /*
             * The following code was a hack to turn on write-protection for a disk image if there was
             * an initial comment line containing the string "write-protected".  However, since comments
             * are technically not allowed in JSON, I needed an alternative solution.  So, if the basename
             * contains the suffix "-readonly", then I'll turn on write-protection for that disk as well.
             *
             * TODO: Provide some UI for turning write-protection on/off for disks at will, and provide
             * an XML-based solution (ie, a per-disk XML configuration option) for controlling it as well.
             */
            var sBaseName = str.getBaseName(sDiskFile, true).toLowerCase();
            if (sBaseName.indexOf("-readonly") > 0) {
                this.fWriteProtected = true;
            } else {
                var iEOL = sDiskData.indexOf("\n");
                if (iEOL > 0 && iEOL < 1024) {
                    var sConfig = sDiskData.substring(0, iEOL);
                    if (sConfig.indexOf("write-protected") > 0) {
                        this.fWriteProtected = true;
                    }
                }
            }
            /*
             * The most likely source of any exception will be here, where we're parsing the disk data.
             *
             * TODO: IE9 is rather unfriendly and restrictive with regard to how much data it's willing to
             * eval().  In particular, the 10Mb disk image we use for the Windows 1.01 demo config fails in
             * IE9 with an "Out of memory" exception.  One work-around would be to chop the data into chunks
             * (perhaps one track per chunk, using regular expressions) and then manually re-assemble it.
             *
             * However, it turns out that using JSON.parse(sDiskData) instead of eval("(" + sDiskData + ")")
             * is a much easier fix. The only drawback is that we must first quote any unquoted property names
             * and remove any comments, because while eval() was cool with them, JSON.parse() is more particular;
             * the following RegExp replacements take care of those requirements.
             *
             * The use of hex values is something else that eval() was OK with, but JSON.parse() is not, and
             * while I've stopped using hex values in DumpAPI responses (at least when "format=json" is specified),
             * I can't guarantee they won't show up in "legacy" images, and there's no simple RegExp replacement
             * for transforming hex values into decimal values, so I cop out and fall back to eval() if I detect
             * any hex prefixes ("0x") in the sequence.  Ditto for error messages, which appear like so:
             *
             *      ["unrecognized disk path: test.img"]
             */
            var aDiskData;
            if (sDiskData.substr(0, 1) == "<") {        // if the "data" begins with a "<"...
                /*
                 * Early server configs reported an error (via the nErrorCode parameter) if a disk URL was invalid,
                 * but more recent server configs now display a somewhat friendlier HTML error page.  The downside,
                 * however, is that the original error has been buried, and we've received "data" that isn't actually
                 * disk data.
                 *
                 * So, if the data we've received appears to be "HTML-like", all we can really do is assume that the
                 * disk image is missing.  And so we pretend we received an error message to that effect.
                 */
                aDiskData = ["Missing disk image: " + this.sDiskName];
            } else {
                if (sDiskData.indexOf("0x") < 0 && sDiskData.substr(0, 2) != "[\"") {
                    aDiskData = JSON.parse(sDiskData.replace(/([a-z]+):/gm, "\"$1\":").replace(/\/\/[^\n]*/gm, ""));
                } else {
                    aDiskData = eval("(" + sDiskData + ")");
                }
            }

            if (!aDiskData.length) {
                Component.error("Empty disk image: " + this.sDiskName);
            }
            else if (aDiskData.length == 1) {
                Component.error(aDiskData[0]);
            }
            /*
             * aDiskData is an array of cylinders, each of which is an array of heads, each of which
             * is an array of sector objects.  The format does not impose any limitations on number of
             * cylinders, number of heads, or number of bytes in any of the sector object byte-arrays.
             *
             * WARNING: All accesses to sector object properties must be via their string names, not their
             * "dot" names, otherwise code will break after it's been processed by the Closure Compiler.
             *
             * Sector object properties include:
             *
             *      'sector'    the sector number (1-based, not required to be sequential)
             *      'length'    the byte-length (ie, formatted length) of the sector
             *      'data'      the dword-array containing the sector data
             *      'pattern'   if the dword-array length is less than 'length'/4, this value must be used
             *                  to pad out the sector; if no 'pattern' is specified, it's assumed to be zero
             *
             * We still support the older JSON encoding, where sector data was encoded as an array of 'bytes'
             * rather than a dword 'data' array.  However, our support is strictly limited to an on-the-fly
             * conversion to a forward-compatible 'data' array.
             */
            else {
                if (MAXDEBUG && DEBUGGER && this.dbg && this.dbg.messageEnabled(this.dbg.MESSAGE_DISK)) {
                    var sCylinders = aDiskData.length + " track" + (aDiskData.length > 1 ? "s" : "");
                    var nHeads = aDiskData[0].length;
                    var sHeads = nHeads + " head" + (nHeads > 1 ? "s" : "");
                    var nSectorsPerTrack = aDiskData[0][0].length;
                    var sSectorsPerTrack = nSectorsPerTrack + " sector" + (nSectorsPerTrack > 1 ? "s" : "") + "/track";
                    this.dbg.message(sCylinders + ", " + sHeads + ", " + sSectorsPerTrack);
                }
                /*
                 * Before the image is usable, we must "normalize" all the sectors.  In the past, this meant
                 * "inflating" them all.  However, that's no longer strictly necessary.  Mainly, it just means
                 * setting 'length', 'pattern' and 'data' properties, so that all the sectors are well-defined.
                 * This includes detecting sector data in older formats (eg, the OLD array of 'bytes' instead
                 * of the NEW 'data' array of dwords) and converting them on-the-fly to the current format.
                 */
                var dwChecksum = 0;
                for (var iCylinder = 0; iCylinder < aDiskData.length; iCylinder++) {
                    for (var iHead = 0; iHead < aDiskData[iCylinder].length; iHead++) {
                        for (var iSector = 0; iSector < aDiskData[iCylinder][iHead].length; iSector++) {
                            var sector = aDiskData[iCylinder][iHead][iSector];
                            if (!sector) continue;          // non-standard (eg, XDF) disk images may have "unused" (null) sectors
                            var length = sector['length'];
                            if (length === undefined) {     // provide backward-compatibility with older JSON...
                                length = sector['length'] = 512;
                            }
                            length >>= 2;                   // convert length from a byte-length to a dword-length
                            var dwPattern = sector['pattern'];
                            if (dwPattern === undefined) {
                                dwPattern = sector['pattern'] = 0;
                            }
                            var adw = sector['data'];
                            if (adw === undefined) {
                                var ab = sector['bytes'];
                                if (ab === undefined || !ab.length) {
                                    /*
                                     * It would be odd if there was neither a 'bytes' nor 'data' array; I'm just
                                     * being paranoid.  It's more likely that the 'bytes' array is simply empty,
                                     * in which case we need only create an empty 'data' array and turn the byte
                                     * pattern, if any, into a dword pattern.
                                     */
                                    adw = [];
                                    Component.assert((dwPattern & 0xff) == dwPattern);
                                    dwPattern = sector['pattern'] = (dwPattern | (dwPattern << 8) | (dwPattern << 16) | (dwPattern << 24));
                                    sector['data'] = adw;
                                } else {
                                    /*
                                     * To keep the conversion code simple, we'll do any necessary pattern-filling first,
                                     * to fully "inflate" the sector, eliminating the possibility of partial dwords and
                                     * saving any code downstream from dealing with byte-size patterns.
                                     */
                                    var cb = length << 2;
                                    for (var ib = ab.length; ib < cb; ib++) {
                                        ab[ib] = dwPattern; // the pattern for byte-arrays was only a byte
                                    }
                                    this.fill(sector, ab, 0);
                                }
                                delete sector['bytes'];
                            }
                            /*
                             * The current sector should now have ALL the properties of a proper Sector object; ie:
                             *
                             *      'sector':   sector number
                             *      'length':   size of the sector, in bytes
                             *      'data':     array of dwords
                             *      'pattern':  dword pattern to use for empty or partial sectors
                             *
                             * In addition, we will maintain the following information on a per-sector basis,
                             * as sectors are modified:
                             *
                             *      iModify:    index of first modified dword in sector
                             *      cModify:    number of modified dwords in sector
                             *      fDirty:     true if sector is dirty, false if clean (or cleaning in progress)
                             *
                             * And for the disk as a whole, we maintain a checksum of the original unmodified data:
                             *
                             *      dwChecksum: summation of all dwords in all non-empty sectors
                             */
                            this.initSector(sector, iCylinder, iHead);
                            /*
                             * Pattern-filling of sectors is deferred until absolutely necessary (eg, when a sector is
                             * being written).  So all we need to do at this point is checksum all the initial sector data.
                             */
                            for (var idw = 0; idw < adw.length; idw++) {
                                dwChecksum = (dwChecksum + adw[idw]) & 0xffffffff;
                            }
                        }
                    }
                }
                this.aDiskData = aDiskData;
                this.dwChecksum = dwChecksum;
                disk = this;
            }
        } catch (e) {
            Component.error("Disk image error: " + e.message);
        }
    }
    if (this.fnNotify) {
        this.fnNotify.call(this.controller, this.drive, disk, this.sDiskName, this.sDiskPath);
    }
};

/**
 * initSector(sector, iCylinder, iHead, iSector, cbSector, dwPattern)
 *
 * @param {Object} sector
 * @param {number} iCylinder
 * @param {number} iHead
 * @param {number} [iSector]
 * @param {number} [cbSector]
 * @param {number|null} [dwPattern]
 * @return {Object}
 */
Disk.prototype.initSector = function(sector, iCylinder, iHead, iSector, cbSector, dwPattern)
{
    if (!sector) {
        sector = {'sector': iSector, 'length': cbSector, 'data': [], 'pattern': dwPattern};
    }
    sector.iCylinder = iCylinder;
    sector.iHead = iHead;
    sector.iModify = sector.cModify = 0;
    sector.fDirty = false;
    return sector;
};

/**
 * onLoadParseSectors(sURLName, sURLData, nErrorCode, sectorInfo)
 *
 * @param {string} sURLName
 * @param {string} sURLData
 * @param {number} nErrorCode
 * @param {Array} sectorInfo
 */
Disk.prototype.onLoadParseSectors = function(sURLName, sURLData, nErrorCode, sectorInfo)
{
    var fAsync = false;
    if (!nErrorCode) {
        var iCylinder = sectorInfo[0];
        var iHead = sectorInfo[1];
        var iSector = sectorInfo[2];
        var nSectors = sectorInfo[3];
        fAsync = sectorInfo[4];

        if (DEBUG) this.messageDebugger("Disk.onLoadParseSectors(" + iCylinder + ":" + iHead + ":" + iSector + ":" + nSectors + ")");

        var abData = JSON.parse(sURLData);
        var offData = 0;
        while (nSectors--) {
            /*
             * We call seek with fWrite == true to prevent seek() from triggering another call
             * to readRemoteSectors() and endlessly recursing.  That also forces seek() to:
             *
             *  1) zero the sector's 'pattern'
             *  2) disable warning about reading an uninitialized sector
             *
             * We KNOW this is an uninitialized sector, because we're about to initialize it.
             */
            var sector = this.seek(iCylinder, iHead, iSector, true);
            if (!sector) {
                if (DEBUG) this.messageDebugger("Disk.onLoadParseSectors(): seek(" + iCylinder + "," + iHead + "," + iSector + ") failed");
                break;
            }
            this.fill(sector, abData, offData);
            offData += sector['length'];
            /*
             * We happen to know that when seek() calls readRemoteSectors(), it limits the number of sectors
             * to the current track, so the only variable we need to advance is iSector.
             */
            iSector++;
        }
    }
    var done = sectorInfo[5];
    if (done) done(nErrorCode, fAsync);
};

/**
 * connectRemoteDisk(sDiskPath)
 *
 * Unlike disconnect(), we don't issue the connect request ourselves; instead, we piggyback on the existing
 * preload code in load() to establish the connection.  That, in turn, will trigger a call to mount(), which
 * will check fOnDemand and set fRemote if the connection was successful.
 *
 * @this {Disk}
 * @param {string} sDiskPath
 * @return {string} is the URL connection string required to connect to sDiskPath
 */
Disk.prototype.connectRemoteDisk = function(sDiskPath)
{
    var sParms = DiskAPI.QUERY.ACTION + '=' + DiskAPI.ACTION.OPEN;
    sParms += '&' + DiskAPI.QUERY.VOLUME + '=' + sDiskPath;
    sParms += '&' + DiskAPI.QUERY.MODE + '=' + this.mode;
    sParms += '&' + DiskAPI.QUERY.CHS + '=' + this.nCylinders + ':' + this.nHeads + ':' + this.nSectors + ':' + this.cbSector;
    sParms += '&' + DiskAPI.QUERY.MACHINE + '=' + this.controller.getMachineID();
    sParms += '&' + DiskAPI.QUERY.USER + '=' + this.controller.getUserID();
    return web.getHost() + DiskAPI.ENDPOINT + '?' + sParms;
};

/**
 * readRemoteSectors(iCylinder, iHead, iSector, nSectors, done)
 *
 * @param {number} iCylinder
 * @param {number} iHead
 * @param {number} iSector
 * @param {number} cbSector
 * @param {number} nSectors
 * @param {function(number,boolean)} [done]
 */
Disk.prototype.readRemoteSectors = function(iCylinder, iHead, iSector, cbSector, nSectors, done)
{
    if (DEBUG) this.messageDebugger("Disk.readRemoteSectors(" + iCylinder + ":" + iHead + ":" + iSector + ":" + nSectors + "," + cbSector + ")");

    if (this.fRemote) {
        var sParms = DiskAPI.QUERY.ACTION + '=' + DiskAPI.ACTION.READ;
        sParms += '&' + DiskAPI.QUERY.VOLUME + '=' + this.sDiskPath;
        sParms += '&' + DiskAPI.QUERY.CHS + '=' + this.nCylinders + ':' + this.nHeads + ':' + this.nSectors + ':' + this.cbSector;
        sParms += '&' + DiskAPI.QUERY.ADDR + '=' + iCylinder + ':' + iHead + ':' + iSector + ':' + nSectors;
        sParms += '&' + DiskAPI.QUERY.MACHINE + '=' + this.controller.getMachineID();
        sParms += '&' + DiskAPI.QUERY.USER + '=' + this.controller.getUserID();
        var sDiskURL = web.getHost() + DiskAPI.ENDPOINT + '?' + sParms;
        web.loadResource(sDiskURL, true, null, this, this.onLoadParseSectors, [iCylinder, iHead, iSector, nSectors, true, done]);
        return;
    }
    if (done) done(-1, false);
};

/**
 * writeRemoteSectors(iCylinder, iHead, iSector, nSectors, abSectors, fAsync)
 *
 * Writes to a remote disk are performed on a timer-driven basis.  When a sector is modified for the first time,
 * a reference to that sector is "pushed" onto (ie, appended to the end of) aDirtySectors, and if aDirtySectors was
 * originally empty, then a REMOTE_WRITE_DELAY timer is set.
 *
 * When the timer fires, the first batch of contiguous sectors is sent off the server, and when the server responds
 * (ie, when cleanDirtySectors() is called), if the response indicates success, every sector that was sent is marked
 * clean -- unless one or more writes to the sector occurred in the meantime, which we track through a per-sector
 * fDirty flag.
 *
 * @param {number} iCylinder
 * @param {number} iHead
 * @param {number} iSector
 * @param {number} nSectors
 * @param {Array.<number>} abSectors
 * @param {boolean} fAsync
 * @return {boolean|Array}
 */
Disk.prototype.writeRemoteSectors = function(iCylinder, iHead, iSector, nSectors, abSectors, fAsync)
{
    if (DEBUG) this.messageDebugger("Disk.writeRemoteSectors(" + iCylinder + ":" + iHead + ":" + iSector + ":" + nSectors + ")");

    if (this.fRemote) {
        var data = {};
        this.fWriteInProgress = true;
        data[DiskAPI.QUERY.ACTION] = DiskAPI.ACTION.WRITE;
        data[DiskAPI.QUERY.VOLUME] = this.sDiskPath;
        data[DiskAPI.QUERY.CHS] = this.nCylinders + ':' + this.nHeads + ':' + this.nSectors + ':' + this.cbSector;
        data[DiskAPI.QUERY.ADDR] = iCylinder + ':' + iHead + ':' + iSector + ':' + nSectors;
        data[DiskAPI.QUERY.MACHINE] = this.controller.getMachineID();
        data[DiskAPI.QUERY.USER] = this.controller.getUserID();
        data[DiskAPI.QUERY.DATA] = JSON.stringify(abSectors);
        var sDiskURL = web.getHost() + DiskAPI.ENDPOINT;
        return web.loadResource(sDiskURL, fAsync, data, this, this.onWriteCleanSectors, [iCylinder, iHead, iSector, nSectors, fAsync]);
    }
    return false;
};

/**
 * disconnectRemoteDisk()
 *
 * This is called by our powerDown() notification handler.  If fRemote is true, we issue the disconnect request and
 * then immediately set fRemote to false; we don't wait for (or test) the response.
 *
 * @this {Disk}
 */
Disk.prototype.disconnectRemoteDisk = function()
{
    if (this.fRemote) {
        var sParms = DiskAPI.QUERY.ACTION + '=' + DiskAPI.ACTION.CLOSE;
        sParms += '&' + DiskAPI.QUERY.VOLUME + '=' + this.sDiskPath;
        sParms += '&' + DiskAPI.QUERY.MACHINE + '=' + this.controller.getMachineID();
        sParms += '&' + DiskAPI.QUERY.USER + '=' + this.controller.getUserID();
        var sDiskURL = web.getHost() + DiskAPI.ENDPOINT + '?' + sParms;
        web.loadResource(sDiskURL, true);
        this.fRemote = false;
    }
};

/**
 * queueDirtySector(sector, fAsync)
 *
 * Mark the specified sector as dirty, add it to the queue (aDirtySectors) if not already added,
 * and establish a timeout handler (findDirtySectors) if not already established.
 *
 * A freshly dirtied sector should sit in the queue for a short period of time (eg, 2 seconds)
 * before we attempt to write it; that is, a REMOTE_WRITE_DELAY timer should start ticking again
 * for any sector that is rewritten.  However, there will be exceptions; for example, when a sector
 * is finally written, we want to take advantage of the write request to write any additional dirty
 * sectors that follow it, even if those additional sectors were written less than 2 seconds ago.
 *
 * @param {Object} sector
 * @param {boolean} fAsync (true to update write timer, false to not)
 * @return {boolean} true if write timer set, false if not
 */
Disk.prototype.queueDirtySector = function(sector, fAsync)
{
    sector.fDirty = true;

    var j = this.aDirtySectors.indexOf(sector);
    if (j >= 0) {
        this.aDirtySectors.splice(j, 1);
        this.aDirtyTimestamps.splice(j, 1);
    }
    this.aDirtySectors.push(sector);
    this.aDirtyTimestamps.push(usr.getTime());

    if (DEBUG) this.messageDebugger("Disk.queueDirtySector(" + sector.iCylinder + ":" + sector.iHead + ":" + sector['sector'] + "): " + this.aDirtySectors.length + " dirty");

    return fAsync && this.updateWriteTimer();
};

/**
 * updateWriteTimer()
 *
 * If a timer is already active, make sure it's still valid (ie, the time the timer is scheduled to fire is
 * >= the timestamp of the next dirty sector + REMOTE_WRITE_DELAY); if not, cancel the timer and start a new one.
 *
 * @return {boolean} true if write timer set, false if not
 */
Disk.prototype.updateWriteTimer = function()
{
    if (this.aDirtySectors.length) {
        var msWrite = this.aDirtyTimestamps[0] + Disk.REMOTE_WRITE_DELAY;
        if (this.timerWrite) {
            if (this.msTimerWrite < msWrite) {
                clearTimeout(this.timerWrite);
                this.timerWrite = null;
            }
        }
        if (!this.timerWrite) {
            var obj = this;
            var msNow = usr.getTime();
            var msDelay = msWrite - msNow;
            if (msDelay < 0) msDelay = 0;
            if (msDelay > Disk.REMOTE_WRITE_DELAY) msDelay = Disk.REMOTE_WRITE_DELAY;
            this.timerWrite = setTimeout(function() {
                obj.findDirtySectors(true);
            }, msDelay);
            this.msTimerWrite = msNow + msDelay;
        }
    } else {
        if (this.timerWrite) {
            clearTimeout(this.timerWrite);
            this.timerWrite = null;
        }
    }
    return this.timerWrite !== null;
};

/**
 * findDirtySectors(fAsync)
 *
 * @param {boolean} fAsync is true if this function is being called asynchronously, false otherwise
 * @return {boolean|Array} false if no dirty sectors, otherwise true (or a response array if not fAsync)
 *
 * Starting with the oldest dirty sector in the queue (aDirtySectors), determine the longest contiguous stretch of
 * dirty sectors (currently limited to the same track), mark them all as not dirty, and then call writeRemoteSectors().
 */
Disk.prototype.findDirtySectors = function(fAsync)
{
    if (fAsync) {
        this.timerWrite = null;
    }
    var sector = this.aDirtySectors[0];
    if (sector) {
        var iCylinder = sector.iCylinder;
        var iHead = sector.iHead;
        var iSector = sector['sector'];
        var nSectors = 0;
        var abSectors = [];
        for (var i = iSector - 1; i < this.aDiskData[iCylinder][iHead].length; i++) {
            var sectorNext = this.aDiskData[iCylinder][iHead][i];
            if (!sectorNext.fDirty) break;
            var j = this.aDirtySectors.indexOf(sectorNext);
            Component.assert(j >= 0, "dirty sector (" + iCylinder + ":" + iHead + ":" + sectorNext['sector'] + ") missing from aDirtySectors");
            if (DEBUG) this.messageDebugger("Disk.findDirtySectors(" + iCylinder + ":" + iHead + ":" + sectorNext['sector'] + ")");
            this.aDirtySectors.splice(j, 1);
            this.aDirtyTimestamps.splice(j, 1);
            abSectors = abSectors.concat(this.toBytes(sectorNext));
            sectorNext.fDirty = false;
            nSectors++;
        }
        Component.assert(!!abSectors.length, "no data for dirty sector (" + iCylinder + ":" + iHead + ":" + sector['sector'] + ")");
        var response = this.writeRemoteSectors(iCylinder, iHead, iSector, nSectors, abSectors, fAsync);
        return fAsync || response;
    }
    return false;
};

/**
 * onWriteCleanSectors(sURLName, sURLData, nErrorCode, sectorInfo)
 *
 * @param {string} sURLName
 * @param {string} sURLData
 * @param {number} nErrorCode
 * @param {Array} sectorInfo
 */
Disk.prototype.onWriteCleanSectors = function(sURLName, sURLData, nErrorCode, sectorInfo)
{
    var iCylinder = sectorInfo[0];
    var iHead = sectorInfo[1];
    var iSector = sectorInfo[2];
    var nSectors = sectorInfo[3];
    var fAsync = sectorInfo[4];
    this.fWriteInProgress = false;

    if (iCylinder >= 0 && iCylinder < this.aDiskData.length && iHead >= 0 && iHead < this.aDiskData[iCylinder].length) {
        for (var i = iSector - 1; nSectors-- > 0 && i >= 0 && i < this.aDiskData[iCylinder][iHead].length; i++) {
            var sector = this.aDiskData[iCylinder][iHead][i];

            if (DEBUG) this.messageDebugger("Disk.onWriteCleanSectors(" + iCylinder + ":" + iHead + ":" + sector['sector'] + ")");

            if (!nErrorCode) {
                if (!sector.fDirty) {
                    sector.iModify = sector.cModify = 0;
                }
            } else {
                this.queueDirtySector(sector, false);
            }
        }
    }
    if (fAsync) this.updateWriteTimer();
};

/**
 * info()
 *
 * @this {Disk}
 * @return {Array} containing: [nCylinders, nHeads, nSectorsPerTrack, nBytesPerSector]
 */
Disk.prototype.info = function()
{
    if (!this.aDiskData.length) {
        return [0, 0, 0, 0];
    }
    return [this.aDiskData.length, this.aDiskData[0].length, this.aDiskData[0][0].length, this.aDiskData[0][0][0]['length']];
};

/**
 * dump()
 *
 * We perform some RegExp massaging on the JSON data to eliminate unnecessary properties
 * (eg, 'length' values of 512, 'pattern' values of 0, quotes around the property names, etc).
 * Sectors that were initially compressed should remain compressed unless/until they were modified.
 *
 * TODO: Check sectors (or at least modified sectors) to see if they can be recompressed.
 *
 * @this {Disk}
 * @return {string} containing the entire disk image as JSON-encoded data
 */
Disk.prototype.dump = function()
{
    var s = JSON.stringify(this.aDiskData);
    s = s.replace(/,"length":512/gm, "").replace(/,"pattern":0/gm, "");
    /*
     * I don't really want to strip quotes from disk image property names, since I would have to put them
     * back again during mount() -- or whenever JSON.parse() is used instead of eval().  But I still remove
     * them temporarily, so that any remaining property names (eg, "iModify", "cModify", "fDirty") can
     * easily be stripped out, by virtue of their being the only quoted properties left.  We then "requote"
     * all the property names that remain.
     */
    s = s.replace(/"(sector|length|data|pattern)":/gm, "$1:");
    /*
     * The next line will remove any other numeric or boolean properties that were added at runtime, although
     * they may have completely different ("minified") names if the code has been compiled.
     */
    s = s.replace(/,"[^"]*":([0-9]+|true|false)/gm, "");
    s = s.replace(/(sector|length|data|pattern):/gm, "\"$1\":");
    return s;
};

/**
 * seek(iCylinder, iHead, iSector, fWrite, done)
 *
 * TODO: There's some dodgy code in seek() that allows floppy images to be dynamically
 * reconfigured with more heads and/or sectors/track, and it does so by peeking at more drive
 * properties.  That code used to be in the FDC component, where it was perfectly reasonable
 * to access those properties.  We need a cleaner interface back to the drive, similar to the
 * info() interface we provide to the controller.
 *
 * Whether or not the "dynamic reconfiguration" feature itself is perfectly reasonable is,
 * of course, a separate question.
 *
 * @this {Disk}
 * @param {number} iCylinder
 * @param {number} iHead
 * @param {number} iSector
 * @param {boolean} [fWrite]
 * @param {function(Object,boolean)} [done]
 * @return {Object|null} is the requested sector, or null if not found (or not available yet)
 */
Disk.prototype.seek = function(iCylinder, iHead, iSector, fWrite, done)
{
    var sector = null;
    var drive = this.drive;
    var cylinder = this.aDiskData[iCylinder];
    if (cylinder) {
        var i;
        var track = cylinder[iHead];
        /*
         * The following code allows a single-sided diskette image to be reformatted (ie, "expanded")
         * as a double-sided image, provided the drive has more than one head (see drive.nHeads).
         */
        if (!track && drive.bFormatting && iHead < drive.nHeads) {
            track = cylinder[iHead] = new Array(drive.bSectorEnd);
            for (i = 0; i < track.length; i++) {
                track[i] = this.initSector(null, iCylinder, iHead, i + 1, drive.nBytes, 0);
            }
        }
        if (track) {
            for (i = 0; i < track.length; i++) {
                if (track[i] && track[i]['sector'] == iSector) {
                    /*
                     * If the sector's pattern is null, then this sector's true contents have not yet
                     * been fetched from the server.
                     */
                    sector = track[i];
                    if (sector['pattern'] === null) {
                        if (fWrite) {
                            /*
                             * Optimization: if the caller has explicitly told us that they're about to WRITE to the
                             * sector, then we shouldn't need to read it from the server; assume a zero pattern and return.
                             */
                            sector['pattern'] = 0;
                        } else if (done) {
                            var nSectors = 1;
                            /*
                             * We know we need to read at least 1 sector, but let's count the number of trailing sectors
                             * on the same track that may also be required.
                             */
                            while (++i < track.length) {
                                if (track[i]['pattern'] === null) nSectors++;
                            }
                            this.readRemoteSectors(iCylinder, iHead, iSector, drive.cbSector, nSectors, function onReadRemoteComplete(err, fAsync) {
                                if (err) sector = null;
                                // noinspection JSReferencingMutableVariableFromClosure
                                done(sector, fAsync);
                            });
                            return null;
                        } else {
                            if (DEBUG) this.messageDebugger('Disk.seek("' + this.sDiskName + '"): uninitialized sector ' + iCylinder + ':' + iHead + ':' + iSector);
                        }
                    }
                    break;
                }
            }
            /*
             * The following code allows an 8-sector track to be reformatted (ie, "expanded") as a 9-sector track.
             */
            if (!sector && drive.bFormatting && drive.bSector == 9) {
                sector = track[i] = this.initSector(null, iCylinder, iHead, drive.bSector, drive.nBytes, 0);
            }
        }
    }
    if (done) done(sector, false);
    return sector;
};

/**
 * fill(sector, ab, off)
 *
 * @param {Object} sector
 * @param {*} ab (technically, this should be typed as Array.<number> but I'm having trouble coercing JSON.parse() to that)
 * @param {number} off
 */
Disk.prototype.fill = function(sector, ab, off)
{
    var cdw = sector['length'] >> 2;
    var adw = new Array(cdw);
    for (var idw = 0; idw < cdw; idw++) {
        adw[idw] = ab[off] | (ab[off + 1] << 8) | (ab[off + 2] << 16) | (ab[off + 3] << 24);
        off += 4;
    }
    sector['data'] = adw;
    /*
     * TODO: Consider taking this opportunity to shrink 'data' down by the number of dwords at the end of the buffer that
     * contain the same pattern, and setting 'pattern' accordingly.
     */
};

/**
 * toBytes(sector)
 *
 * @param {Object} sector
 * @return {Array.<number>} is an array of bytes
 */
Disk.prototype.toBytes = function(sector)
{
    var cb = sector['length'];
    var ab = new Array(cb);
    var ib = 0;
    var cdw = cb >> 2;
    var adw = sector['data'];
    var dwPattern = sector['pattern'];
    for (var idw = 0; idw < cdw; idw++) {
        var dw = (idw < adw.length? adw[idw] : dwPattern);
        ab[ib++] = dw & 0xff;
        ab[ib++] = (dw >> 8) & 0xff;
        ab[ib++] = (dw >> 16) & 0xff;
        ab[ib++] = (dw >> 24) & 0xff;
    }
    return ab;
};

/**
 * read(sector, ibSector, fCompare)
 *
 * @this {Disk}
 * @param {Object} sector (returned from a previous seek)
 * @param {number} ibSector a byte index within the given sector
 * @param {boolean} [fCompare] is true if this write-compare read
 * @return {number} the specified (unsigned) byte, or -1 if no more data in the sector
 */
Disk.prototype.read = function(sector, ibSector, fCompare)
{
    var b = -1;

    if (DEBUG && !ibSector && !fCompare) this.messageDebugger("Disk.read(" + this.controller.id + ":" + this.drive.iDrive + "," + sector.iCylinder + ":" + sector.iHead + ":" + sector['sector'] + ")");

    if (ibSector < sector['length']) {
        var adw = sector['data'];
        var idw = ibSector >> 2;
        var dw = (idw < adw.length ? adw[idw] : sector['pattern']);
        b = ((dw >> ((ibSector & 0x3) << 3)) & 0xff);
    }
    return b;
};

/**
 * write(sector, ibSector, b)
 *
 * @this {Disk}
 * @param {Object} sector (returned from a previous seek)
 * @param {number} ibSector a byte index within the given sector
 * @param {number} b the byte value to write
 * @return {boolean|null} true if write successful, false if write-protected, null if out of bounds
 */
Disk.prototype.write = function(sector, ibSector, b)
{
    if (this.fWriteProtected)
        return false;

    if (DEBUG && !ibSector) this.messageDebugger("Disk.write(" + this.controller.id + ":" + this.drive.iDrive + "," + sector.iCylinder + ":" + sector.iHead + ":" + sector['sector'] + ")");

    if (ibSector < sector['length']) {
        if (b != this.read(sector, ibSector, true)) {
            var adw = sector['data'];
            var dwPattern = sector['pattern'];
            var idw = ibSector >> 2;
            var nShift = (ibSector & 0x3) << 3;
            /*
             * Ensure every byte up to the specified byte is properly initialized.
             */
            for (var i = adw.length; i <= idw; i++) adw[i] = dwPattern;

            if (!sector.cModify) {
                sector.iModify = idw;
                sector.cModify = 1;
            } else if (idw < sector.iModify) {
                sector.cModify += sector.iModify - idw;
                sector.iModify = idw;
            } else if (idw >= sector.iModify + sector.cModify) {
                sector.cModify += idw - (sector.iModify + sector.cModify) + 1;
            }
            adw[idw] = (adw[idw] & ~(0xff << nShift)) | (b << nShift);

            if (this.fRemote) this.queueDirtySector(sector, true);
        }
        return true;
    }
    return null;
};

/**
 * save()
 *
 * The first array entry contains some disk information:
 *
 *      [sDiskPath, dwChecksum]
 *
 * Each subsequent entry in the returned array contains the following:
 *
 *      [iCylinder, iHead, iSector, iModify, [...]]
 *
 * where [...] is an array of modified dword(s) in the corresponding sector.
 *
 * @this {Disk}
 * @return {Array} of modified sectors
 */
Disk.prototype.save = function()
{
    var i = 0;
    var deltas = [];
    deltas[i++] = [this.sDiskPath, this.dwChecksum];
    if (!this.fRemote && !this.fWriteProtected) {
        var aDiskData = this.aDiskData;
        for (var iCylinder = 0; iCylinder < aDiskData.length; iCylinder++) {
            for (var iHead = 0; iHead < aDiskData[iCylinder].length; iHead++) {
                for (var iSector = 0; iSector < aDiskData[iCylinder][iHead].length; iSector++) {
                    var sector = aDiskData[iCylinder][iHead][iSector];
                    if (sector.cModify) {
                        var mods = [], n = 0;
                        var iModify = sector.iModify, iModifyLimit = sector.iModify + sector.cModify;
                        while (iModify < iModifyLimit) {
                            mods[n++] = sector['data'][iModify++];
                        }
                        deltas[i++] = [iCylinder, iHead, iSector, sector.iModify, mods];
                    }
                }
            }
        }
    }
    if (DEBUG) this.messageDebugger('Disk.save("' + this.sDiskName + '"): saved ' + (deltas.length - 1) + ' change(s)');
    return deltas;
};

/**
 * restore(deltas)
 *
 * The first array entry contains some disk information:
 *
 *      [sDiskPath, dwChecksum]
 *
 * Each subsequent entry in the supplied array contains the following:
 *
 *      [iCylinder, iHead, iSector, iModify, [...]]
 *
 * where [...] is an array of modified dword(s) in the corresponding sector.
 *
 * @this {Disk}
 * @param {Array} deltas
 * @return {number} 0 if no changes applied, -1 if an error occurred, otherwise the number of sectors modified
 */
Disk.prototype.restore = function(deltas)
{
    /*
     * If deltas is undefined, that's not necessarily an error;  the controller may simply be (re)initializing
     * itself (although neither controller should be calling restore() under those conditions anymore).
     */
    var nChanges = 0;
    var sReason = "unsupported restore format";
    /*
     * I originally added a check for aDiskData here on the assumption that if there was an error loading
     * a disk image, we will have already notified the user, so any additional errors about differing checksums,
     * failure to restore the disk state, etc, would just be annoying.  HOWEVER, HDC will create an empty disk
     * image if its initialization code discovers that no disk was loaded earlier (see verifyDrive).  So while
     * checking aDiskData is still a good idea, be aware that it won't necessarily avoid redundant error messages
     * (at least in the case of HDC).
     */
    if (this.aDiskData.length && deltas && deltas.length > 0) {
        var i = 0;
        var aDiskInfo = deltas[i++];
        if (aDiskInfo && aDiskInfo.length >= 2) {
            /*
             * v1.01 failed to indicate an error if either one of these failure conditions occurred.  Although maybe that's
             * just as well, since v1.01 also failed to properly deal with situations where the user mounted different diskette(s)
             * prior to exiting (hopefully fixed in v1.02).
             */
            if (aDiskInfo[1] != this.dwChecksum) {
                sReason = "original checksum (" + aDiskInfo[1] + ") differs from current checksum (" + this.dwChecksum + ")";
                nChanges = -1;
            }
            /*
             * Checksum is more important than disk path, and for now, I want the flexibility to move disk images.
             *
            else if (aDiskInfo[0] != this.sDiskPath) {
                sReason = "original path '" + aDiskInfo[0] + "' differs from current path '" + this.sDiskPath + "'";
                nChanges = -1;
            }
             */
        }
        while (i < deltas.length && nChanges >= 0) {
            var m = 0;
            var mod = deltas[i++];
            var iCylinder = mod[m++];
            var iHead = mod[m++];
            var iSector = mod[m++];
            /*
             * Note the buried test for write-protection.  Yes, an invariant condition should be tested
             * outside the loop, not inside, but (a) it's a trivial test, (b) the test should never fail
             * because save() should never generate any mods for a write-protected disk, and (c) it
             * centralizes all the failure conditions we're currently checking (which, admittedly, ain't much).
             */
            if (iCylinder >= this.aDiskData.length || iHead >= this.aDiskData[iCylinder].length || iSector >= this.aDiskData[iCylinder][iHead].length) {
                sReason = "sector " + iCylinder + ":" + iHead + ":" + iSector + " out of range (" + nChanges + " changes applied)";
                nChanges = -1;
                break;
            }
            if (this.fWriteProtected) {
                sReason = "unable to modify write-protected disk";
                nChanges = -1;
                break;
            }
            var iModify = mod[m++];
            var mods = mod[m++];
            var iModifyLimit = iModify + mods.length;
            var sector = this.aDiskData[iCylinder][iHead][iSector];
            /*
             * Since write() now deals with empty/partial sectors, we no longer need to completely "inflate" the sector prior
             * to applying modifications.  So let's just make sure that the sector is "inflated" up to iModify.
             */
            var idw = sector['data'].length;
            while (idw < iModify) {
                sector['data'][idw++] = sector['pattern'];
            }
            var n = 0;
            sector.iModify = iModify;
            sector.cModify = mods.length;
            while (iModify < iModifyLimit) {
                sector['data'][iModify++] = mods[n++];
            }
            nChanges++;
        }
    }
    if (nChanges < 0) {
        this.notice("unable to restore disk '" + this.sDiskName + ": " + sReason);
    } else {
        if (DEBUG) this.messageDebugger('Disk.restore("' + this.sDiskName + '"): restored ' + nChanges + ' change(s)');
    }
    return nChanges;
};

/**
 * messageDebugger(sMessage)
 *
 * This is a combination of the Debugger's messageEnabled(MESSAGE_DISK) and message() functions, for convenience.
 *
 * @this {Disk}
 * @param {string} sMessage is any caller-defined message string
 */
Disk.prototype.messageDebugger = function(sMessage)
{
    if (DEBUGGER && this.dbg) {
        if (this.dbg.messageEnabled(this.dbg.MESSAGE_DISK)) {
            this.dbg.message(sMessage);
        }
    }
};

if (typeof APP_PCJS !== 'undefined') APP_PCJS.Disk = Disk;

if (typeof module !== 'undefined') module.exports = Disk;
