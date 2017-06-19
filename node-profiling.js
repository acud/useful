/*
  Written by Elad Nachmias (theman@elad.im); MIT License
  
  require() this file in your application load script. it will profile your application according to
  the settings below. It will take a heap snapshot before and after every CPU usage profile in order
  to avoid the heap dump CPU usage from polluting the CPU profile of the application. 
  After completing all profile runs the script will create a gzipped tarball of the the CPU and heap dumps :)
  Enjoy and use with care.
*/

'use strict';

const TOTAL_ITERATIONS = 10;
const CPU_PROFILE_LENGTH = 30000; //30 seconds, 1 heap snapshot before, one after
const NS_PER_SEC = 1e9;

let iterationsDone = 0;
let filesCreated = [];

const fs = require('fs');
const tar = require('tar');
const path = require('path');
const profiler = require('v8-profiler');

const doProfile = () => {
    // set a unique filename for the profiles. avoid filename collisions when profiling clusters
    const time = process.hrtime();
    const profileReference = `${Date.now() + '_' + time[0] * NS_PER_SEC + time[1]}`;
    // take a heap snapshot before the CPU profiling so that the heap snapshot CPU usage
    // doesn't show up in the CPU profile
    headHeapSnapshot(profileReference, () => {
        // start the CPU profiling here
        profiler.startProfiling(profileReference, true);
        setTimeout(() => {
            // stop the CPU profiling after CPU_PROFILE_LENGTH (ms)
            let profile = profiler.stopProfiling(profileReference);
            // take another heap snapshot and save it
            tailHeapSnapshot(profileReference, () => {
                profile.export((error, result) => {
                    let fname = `CPUPROFILE_${profileReference}.cpuprofile`;
                    filesCreated.push(fname);
                    fs.writeFile(fname, result, null, () => {
                        profile.delete();
                        profiler.deleteAllProfiles();
                        if (++iterationsDone < TOTAL_ITERATIONS) {
                            setImmediate(doProfile);
                        } else {
                            packFiles();
                        }
                    });
                });
            });
        }, CPU_PROFILE_LENGTH);
    });
};

const packFiles = ()=>{
    tar.c(
        {
            gzip: true,
            sync: true,
            file: `profiling_session-${Date.now()}.tgz`
        },
        filesCreated
    );
    removeFilesSync(filesCreated);
};

const removeFilesSync = (files) => {
    files.forEach(file => {
        let filePath = path.join(__dirname, file);
        try {
            fs.unlinkSync(filePath);
        } catch (e) {
            console.error('could not unlink file: ' + filePath);
            console.error(e);
        }
    });
};

const headHeapSnapshot = (profileReference, cb) => {
    takeHeapSnapshot(profileReference + '_START', cb);
};

const tailHeapSnapshot = (profileReference, cb) => {
    takeHeapSnapshot(profileReference + '_END', cb);
};

const takeHeapSnapshot = (profileReference, cb) => {
    let heap = profiler.takeSnapshot();
    // Export snapshot to file
    heap.export(function (error, result) {
        let fname = `HEAPSNAPSHOT_${profileReference}.heapsnapshot`;
        filesCreated.push(fname);
        fs.writeFile(fname, result, null, () => {
            heap.delete();
            if (cb && typeof cb === 'function') {
                cb();
            }
        });
    });
};

doProfile();
