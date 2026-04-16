
/**
 * Edu Bridge - IndexedDB for user session and downloaded lessons
 * DB: EduBridgeDB
 * Stores: user (persistent login), downloads (saved for offline)
 */
var EduBridgeDB = (function() {
    var DB_NAME = 'EduBridgeDB';
    var DB_VERSION = 4;
    var STORE_USER = 'user';
    var STORE_DOWNLOADS = 'downloads';
    var STORE_QUIZ_ATTEMPTS = 'quizAttempts';
    var STORE_VIDEO_BLOBS = 'videoBlobs';
    var STORE_EXAM_RESULTS = 'examResults';
    var USER_KEY = 'current';
    var db = null;

    function openDB() {
        return new Promise(function(resolve, reject) {
            if (db) return resolve(db);
            var req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onerror = function() { reject(req.error); };
            req.onsuccess = function() { db = req.result; resolve(db); };
            req.onupgradeneeded = function(e) {
                var database = e.target.result;
                if (!database.objectStoreNames.contains(STORE_USER)) {
                    database.createObjectStore(STORE_USER, { keyPath: 'id' });
                }
                if (!database.objectStoreNames.contains(STORE_DOWNLOADS)) {
                    database.createObjectStore(STORE_DOWNLOADS, { keyPath: 'id' });
                }
                if (!database.objectStoreNames.contains(STORE_QUIZ_ATTEMPTS)) {
                    database.createObjectStore(STORE_QUIZ_ATTEMPTS, { keyPath: 'id' });
                }
                if (!database.objectStoreNames.contains(STORE_VIDEO_BLOBS)) {
                    database.createObjectStore(STORE_VIDEO_BLOBS, { keyPath: 'id' });
                }
            };
        });
    }

    function getUser() {
        return openDB().then(function(database) {
            return new Promise(function(resolve, reject) {
                var tx = database.transaction(STORE_USER, 'readonly');
                var store = tx.objectStore(STORE_USER);
                var req = store.get(USER_KEY);
                req.onsuccess = function() { resolve(req.result || null); };
                req.onerror = function() { reject(req.error); };
            });
        });
    }

    function setUser(data) {
        return openDB().then(function(database) {
            return new Promise(function(resolve, reject) {
                var tx = database.transaction(STORE_USER, 'readwrite');
                var store = tx.objectStore(STORE_USER);
                var record = { id: USER_KEY, name: data.name, email: data.email };
                var req = store.put(record);
                req.onsuccess = function() { resolve(); };
                req.onerror = function() { reject(req.error); };
            });
        });
    }

    function clearUser() {
        return openDB().then(function(database) {
            return new Promise(function(resolve, reject) {
                var tx = database.transaction(STORE_USER, 'readwrite');
                var store = tx.objectStore(STORE_USER);
                var req = store.delete(USER_KEY);
                req.onsuccess = function() { resolve(); };
                req.onerror = function() { reject(req.error); };
            });
        });
    }

    function getDownloads() {
        return openDB().then(function(database) {
            return new Promise(function(resolve, reject) {
                var tx = database.transaction(STORE_DOWNLOADS, 'readonly');
                var store = tx.objectStore(STORE_DOWNLOADS);
                var req = store.getAll();
                req.onsuccess = function() {
                    var list = req.result || [];
                    list.sort(function(a, b) { return (b.savedAt || 0) - (a.savedAt || 0); });
                    resolve(list);
                };
                req.onerror = function() { reject(req.error); };
            });
        });
    }

    function addDownload(record) {
        var id = (record.courseId || '') + '_' + (record.lessonId || '');
        var doc = {
            id: id,
            courseId: record.courseId,
            lessonId: record.lessonId,
            title: record.title,
            courseName: record.courseName || '',
            videoUrl: record.videoUrl || null,
            videoPath: record.videoPath || null,
            language: record.language || null,
            blobId: record.blobId || null,
            savedAt: Date.now()
        };
        return openDB().then(function(database) {
            return new Promise(function(resolve, reject) {
                var tx = database.transaction(STORE_DOWNLOADS, 'readwrite');
                var store = tx.objectStore(STORE_DOWNLOADS);
                var req = store.put(doc);
                req.onsuccess = function() { resolve(); };
                req.onerror = function() { reject(req.error); };
            });
        });
    }

    function removeDownload(courseId, lessonId) {
        var id = (courseId || '') + '_' + (lessonId || '');
        return openDB().then(function(database) {
            return new Promise(function(resolve, reject) {
                var tx = database.transaction(STORE_DOWNLOADS, 'readwrite');
                var store = tx.objectStore(STORE_DOWNLOADS);
                var req = store.delete(id);
                req.onsuccess = function() { resolve(); };
                req.onerror = function() { reject(req.error); };
            });
        });
    }

    function isDownloaded(courseId, lessonId) {
        var id = (courseId || '') + '_' + (lessonId || '');
        return openDB().then(function(database) {
            return new Promise(function(resolve, reject) {
                var tx = database.transaction(STORE_DOWNLOADS, 'readonly');
                var store = tx.objectStore(STORE_DOWNLOADS);
                var req = store.get(id);
                req.onsuccess = function() { resolve(!!req.result); };
                req.onerror = function() { reject(req.error); };
            });
        });
    }

    // Quiz attempts for offline sync
    function addQuizAttempt(attempt) {
        var id = (attempt.quizId || 'quiz') + '_' + (attempt.localId || Date.now());
        var doc = {
            id: id,
            quizId: attempt.quizId || '',
            title: attempt.title || '',
            subject: attempt.subject || '',
            level: attempt.level || '',
            score: attempt.score || 0,
            total: attempt.total || 0,
            attemptedAt: attempt.attemptedAt || Date.now(),
            synced: !!attempt.synced
        };
        return openDB().then(function(database) {
            return new Promise(function(resolve, reject) {
                var tx = database.transaction(STORE_QUIZ_ATTEMPTS, 'readwrite');
                var store = tx.objectStore(STORE_QUIZ_ATTEMPTS);
                var req = store.put(doc);
                req.onsuccess = function() { resolve(doc); };
                req.onerror = function() { reject(req.error); };
            });
        });
    }

    function getUnsyncedQuizAttempts() {
        return openDB().then(function(database) {
            return new Promise(function(resolve, reject) {
                var tx = database.transaction(STORE_QUIZ_ATTEMPTS, 'readonly');
                var store = tx.objectStore(STORE_QUIZ_ATTEMPTS);
                var req = store.getAll();
                req.onsuccess = function() {
                    var list = req.result || [];
                    resolve(list.filter(function(a) { return !a.synced; }));
                };
                req.onerror = function() { reject(req.error); };
            });
        });
    }

    function markQuizAttemptSynced(id) {
        return openDB().then(function(database) {
            return new Promise(function(resolve, reject) {
                var tx = database.transaction(STORE_QUIZ_ATTEMPTS, 'readwrite');
                var store = tx.objectStore(STORE_QUIZ_ATTEMPTS);
                var getReq = store.get(id);
                getReq.onsuccess = function() {
                    var doc = getReq.result;
                    if (!doc) { resolve(); return; }
                    doc.synced = true;
                    var putReq = store.put(doc);
                    putReq.onsuccess = function() { resolve(); };
                    putReq.onerror = function() { reject(putReq.error); };
                };
                getReq.onerror = function() { reject(getReq.error); };
            });
        });
    }

    function addExamResult(result) {
        var completedAt = result.completedAt || Date.now();
        var id = (result.examId || 'exam') + '_' + completedAt;
        var doc = {
            id: id,
            examId: result.examId || '',
            examTitle: result.examTitle || '',
            subject: result.subject || '',
            score: result.score || 0,
            total: result.total || 0,
            percentage: result.percentage || 0,
            completedAt: completedAt,
            forced: !!result.forced
        };
        return openDB().then(function(database) {
            return new Promise(function(resolve, reject) {
                if (!database.objectStoreNames.contains(STORE_EXAM_RESULTS)) {
                    resolve(doc);
                    return;
                }
                var tx = database.transaction(STORE_EXAM_RESULTS, 'readwrite');
                var store = tx.objectStore(STORE_EXAM_RESULTS);
                var req = store.put(doc);
                req.onsuccess = function() { resolve(doc); };
                req.onerror = function() { reject(req.error); };
            });
        });
    }

    function getExamResults() {
        return openDB().then(function(database) {
            return new Promise(function(resolve, reject) {
                // Guard: store may not exist if DB hasn't upgraded yet
                if (!database.objectStoreNames.contains(STORE_EXAM_RESULTS)) {
                    resolve([]);
                    return;
                }
                var tx = database.transaction(STORE_EXAM_RESULTS, 'readonly');
                var store = tx.objectStore(STORE_EXAM_RESULTS);
                var req = store.getAll();
                req.onsuccess = function() {
                    var list = req.result || [];
                    list.sort(function(a, b) { return (a.completedAt || 0) - (b.completedAt || 0); });
                    resolve(list);
                };
                req.onerror = function() { reject(req.error); };
            });
        });
    }

    function clearAllDownloads() {
        return openDB().then(function(database) {
            return new Promise(function(resolve, reject) {
                var tx = database.transaction([STORE_DOWNLOADS, STORE_VIDEO_BLOBS], 'readwrite');
                tx.objectStore(STORE_DOWNLOADS).clear();
                tx.objectStore(STORE_VIDEO_BLOBS).clear();
                tx.oncomplete = function() { resolve(); };
                tx.onerror = function() { reject(tx.error); };
            });
        });
    }

    function saveVideoBlob(id, blob, mimeType) {
        return openDB().then(function(database) {
            return new Promise(function(resolve, reject) {
                var tx = database.transaction(STORE_VIDEO_BLOBS, 'readwrite');
                var store = tx.objectStore(STORE_VIDEO_BLOBS);
                var req = store.put({ id: id, blob: blob, mimeType: mimeType || 'video/mp4', savedAt: Date.now() });
                req.onsuccess = function() { resolve(); };
                req.onerror = function() { reject(req.error); };
            });
        });
    }

    function getVideoBlob(id) {
        return openDB().then(function(database) {
            return new Promise(function(resolve, reject) {
                var tx = database.transaction(STORE_VIDEO_BLOBS, 'readonly');
                var store = tx.objectStore(STORE_VIDEO_BLOBS);
                var req = store.get(id);
                req.onsuccess = function() { resolve(req.result || null); };
                req.onerror = function() { reject(req.error); };
            });
        });
    }

    function removeVideoBlob(id) {
        return openDB().then(function(database) {
            return new Promise(function(resolve, reject) {
                var tx = database.transaction(STORE_VIDEO_BLOBS, 'readwrite');
                var store = tx.objectStore(STORE_VIDEO_BLOBS);
                var req = store.delete(id);
                req.onsuccess = function() { resolve(); };
                req.onerror = function() { reject(req.error); };
            });
        });
    }

    return {
        openDB: openDB,
        getUser: getUser,
        setUser: setUser,
        clearUser: clearUser,
        getDownloads: getDownloads,
        addDownload: addDownload,
        removeDownload: removeDownload,
        isDownloaded: isDownloaded,
        saveVideoBlob: saveVideoBlob,
        getVideoBlob: getVideoBlob,
        removeVideoBlob: removeVideoBlob,
        clearAllDownloads: clearAllDownloads,
        addExamResult: addExamResult,
        getExamResults: getExamResults,
        addQuizAttempt: addQuizAttempt,
        getUnsyncedQuizAttempts: getUnsyncedQuizAttempts,
        markQuizAttemptSynced: markQuizAttemptSynced
    };
})();


