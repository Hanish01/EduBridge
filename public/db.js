/**
 * Edu Bridge - IndexedDB for user session and downloaded lessons
 * DB: EduBridgeDB
 * Stores: user (persistent login), downloads (saved for offline)
 */
var EduBridgeDB = (function() {
    var DB_NAME = 'EduBridgeDB';
    var DB_VERSION = 2;
    var STORE_USER = 'user';
    var STORE_DOWNLOADS = 'downloads';
    var STORE_QUIZ_ATTEMPTS = 'quizAttempts';
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

    return {
        openDB: openDB,
        getUser: getUser,
        setUser: setUser,
        clearUser: clearUser,
        getDownloads: getDownloads,
        addDownload: addDownload,
        removeDownload: removeDownload,
        isDownloaded: isDownloaded,
        addQuizAttempt: addQuizAttempt,
        getUnsyncedQuizAttempts: getUnsyncedQuizAttempts,
        markQuizAttemptSynced: markQuizAttemptSynced
    };
})();

