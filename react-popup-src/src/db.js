
import * as tf from '@tensorflow/tfjs';


// --- Constants ---
export const DB_NAME = 'flashcardDB';

export const DB_VERSION = 5; // <<< INCREMENTED VERSION TO 5

export const STORE_NAME = 'flashcards';
export const DECKS_STORE_NAME = 'decks';
export const GESTURE_MODEL_STORE_NAME = 'gestureModel';
export const UNASSIGNED_DECK_ID = null;

// --- Singleton Connection Management ---
let dbInstance = null;
let openingPromise = null;



/**
 * Opens and initializes the IndexedDB database.
 * Returns a Promise that resolves with the database instance when ready.
 * Manages a single connection instance and handles concurrent requests.
 * @returns {Promise<IDBDatabase>}
 */
export function openDB() {
    // Reuse existing connection or opening promise if available

/**
 * Opens and initializes the IndexedDB database using a singleton pattern.
 * Ensures only one connection attempt happens at a time and reuses existing connections.
 * Handles version upgrades.
 * @returns {Promise<IDBDatabase>} A promise that resolves with the database instance.
 */
export function openDB() {

    if (dbInstance && dbInstance.objectStoreNames.length > 0) {
        console.log(`DB Util: Reusing existing DB instance (v${dbInstance.version}).`);
        return Promise.resolve(dbInstance);
    }
    if (openingPromise) {
        console.log("DB Util: Reusing existing opening promise.");
        return openingPromise;
    }

    console.log(`DB Util: Starting new DB open request for '${DB_NAME}' v${DB_VERSION}...`);
    openingPromise = new Promise((resolve, reject) => {

        console.log(`DB Util: Inside new Promise constructor.`);
        if (typeof indexedDB === 'undefined') {
            console.error("DB Util: IndexedDB not supported.");
            openingPromise = null;
            return reject(new Error("IndexedDB not supported"));


        // <<< UPDATED: Use new DB_VERSION >>>
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        console.log(`DB Util: indexedDB.open called for "${DB_NAME}" v${DB_VERSION}.`);

        // ========================================================
        // == THE FULL SCHEMA DEFINITION IS HERE                 ==
        // ========================================================
        request.onupgradeneeded = (event) => {
            console.log(`DB Util: onupgradeneeded event fired (Old version: ${event.oldVersion}, New version: ${event.newVersion}).`);
            const db = event.target.result;
            const transaction = event.target.transaction; // Use this transaction

            // --- V1 Schema ---
            if (event.oldVersion < 1) {
                console.log("DB Util: Creating schema for v1...");
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const flashcardStore = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                    // Add indexes needed by App/ManageFlashcards
                    flashcardStore.createIndex('deckIdIndex', 'deckId', { unique: false }); // For filtering by deck in Manage
                    console.log(`DB Util: Object store '${STORE_NAME}' created with indexes.`);
                }
                if (!db.objectStoreNames.contains(DECKS_STORE_NAME)) {
                    const deckStore = db.createObjectStore(DECKS_STORE_NAME, { keyPath: 'id', autoIncrement: true });
                    deckStore.createIndex('name', 'name', { unique: false });
                    console.log(`DB Util: Object store '${DECKS_STORE_NAME}' created.`);

                    // Add default deck after structure commit
                    transaction.addEventListener('complete', () => {
                        console.log(`DB Util: v1 upgrade complete. Adding default deck.`);
                        const addDeckTx = db.transaction(DECKS_STORE_NAME, 'readwrite');
                        const addDeckStore = addDeckTx.objectStore(DECKS_STORE_NAME);
                        const getReq = addDeckStore.get(UNASSIGNED_DECK_ID);
                        getReq.onsuccess = () => {
                            if (!getReq.result) {
                                console.log("DB Util: Adding default 'Unassigned' deck.");
                                addDeckStore.put({ id: UNASSIGNED_DECK_ID, name: 'Unassigned', createdAt: new Date().toISOString() });
                            } else {
                                console.log("DB Util: Default 'Unassigned' deck already exists.");
                            }
                        };
                        getReq.onerror = (e) => console.error("DB Util: Error checking default deck:", e.target.error);
                    });
                }
            }

            // --- V2 Schema Changes (Add deckId index if migrating from old V1) ---
            // Note: V1 above now creates the index directly. This ensures it exists if upgrading from an older v1 structure.
            if (event.oldVersion < 2) {
                console.log("DB Util: Applying schema changes for v2 (ensure deckIdIndex)...");
                if (db.objectStoreNames.contains(STORE_NAME)) {
                    try {
                        const flashcardStore = transaction.objectStore(STORE_NAME);
                        if (!flashcardStore.indexNames.contains('deckIdIndex')) {
                             console.warn("DB Util: Creating 'deckIdIndex' on flashcards during v2 check (should have existed).");
                             flashcardStore.createIndex('deckIdIndex', 'deckId', { unique: false });
                        }
                    } catch (e) {
                       console.error("DB Util: Error ensuring deckIdIndex for v2 upgrade:", e);
                    }
                }
            }

             // --- V3 Schema Changes (Example: Placeholder) ---
             if (event.oldVersion < 3) {
                  console.log("DB Util: Applying schema changes for v3 (if any)...");
             }


            // --- V4 Schema Changes (Add Gesture Model Store) ---
            if (event.oldVersion < 4) {
                console.log("DB Util: Applying schema changes for v4 (add gestureModel)...");
                if (!db.objectStoreNames.contains(GESTURE_MODEL_STORE_NAME)) {
                    db.createObjectStore(GESTURE_MODEL_STORE_NAME, { keyPath: 'id' });
                    console.log(`DB Util: Object store '${GESTURE_MODEL_STORE_NAME}' created.`);
                } else {
                    console.log(`DB Util: Object store '${GESTURE_MODEL_STORE_NAME}' already exists.`);
                }
            }

             // --- V5 Schema Changes (Ensure gestureModel exists if upgrading from broken V4) ---
             if (event.oldVersion < 5) {
                  console.log("DB Util: Applying schema changes for v5 (ensure gestureModel)...");
                  // Check AGAIN in case upgrading from a v4 that didn't have it
                  if (!db.objectStoreNames.contains(GESTURE_MODEL_STORE_NAME)) {
                      console.warn(`DB Util: Creating '${GESTURE_MODEL_STORE_NAME}' during V5 upgrade check (should have existed!).`);
                      db.createObjectStore(GESTURE_MODEL_STORE_NAME, { keyPath: 'id' });
                  }
                  // Add any NEW V5 specific changes here...
             }

            console.log(`DB Util: onupgradeneeded finished processing for target v${DB_VERSION}.`);
        }; // End of onupgradeneeded
        // ========================================================

        request.onsuccess = (event) => {
            console.log("DB Util: request.onsuccess fired.");
            dbInstance = event.target.result;
            console.log(`DB Util: DB "${DB_NAME}" connection established (v${dbInstance.version}).`);
            // Attach listeners
            dbInstance.onversionchange = () => {
                 console.warn("DB Util: Database version change requested elsewhere. Closing connection.");
                 dbInstance?.close(); dbInstance = null; openingPromise = null;
            };
            dbInstance.onclose = () => {
                 console.warn('DB Util: DB connection closed.');
                 dbInstance = null; openingPromise = null;
            };
            dbInstance.onerror = (errEvent) => {
                 console.error("DB Util: Generic DB connection error:", errEvent.target.error);
            };
            openingPromise = null; // Clear promise
            resolve(dbInstance); // Resolve
            console.log("DB Util: resolve(dbInstance) called from onsuccess.");
        };

        request.onerror = (event) => {
            console.error("DB Util: request.onerror fired:", event.target.error);
            openingPromise = null;
            reject(event.target.error);
            console.log("DB Util: reject(error) called from onerror.");
        };

        request.onblocked = (event) => {
            console.warn("DB Util: request.onblocked fired. Close other tabs/windows.", event);
            openingPromise = null;
            reject(new Error(`Database open blocked (v${DB_VERSION}). Close other tabs.`));
            console.log("DB Util: reject(error) called from onblocked.");
       };

        console.log("DB Util: indexedDB.open called.");

        // --- Upgrade Handler (Critical) ---
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            const transaction = event.target.transaction;
            const oldVersion = event.oldVersion;
            const newVersion = event.newVersion;
            console.log(`DB Util: Upgrading database from version ${oldVersion} to ${newVersion}...`);

            try {
                // Version 1: Create 'flashcards' store
                if (oldVersion < 1) { // Changed condition slightly for clarity
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        console.log(`DB Util (V1): Creating object store: ${STORE_NAME}`);
                        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                    } else {
                        console.log(`DB Util (V1): Object store ${STORE_NAME} already exists.`);
                    }
                }

                // Version 2: Create 'decks' store and index on 'flashcards'
                if (oldVersion < 2) {
                    console.log("DB Util (V2): Applying V2 changes...");
                    if (!db.objectStoreNames.contains(DECKS_STORE_NAME)) {
                        console.log(`DB Util (V2): Creating object store: ${DECKS_STORE_NAME}`);
                        db.createObjectStore(DECKS_STORE_NAME, { keyPath: 'id', autoIncrement: true });
                    } else {
                         console.log(`DB Util (V2): Object store ${DECKS_STORE_NAME} already exists.`);
                    }

                    // Ensure flashcard store exists before adding index
                    if (transaction && transaction.objectStoreNames.contains(STORE_NAME)) {
                         const flashcardStore = transaction.objectStore(STORE_NAME);
                         if (!flashcardStore.indexNames.contains('deckIdIndex')) {
                             console.log(`DB Util (V2): Creating index 'deckIdIndex' on store: ${STORE_NAME}`);
                             flashcardStore.createIndex('deckIdIndex', 'deckId', { unique: false });
                         } else {
                              console.log(`DB Util (V2): Index 'deckIdIndex' already exists on ${STORE_NAME}.`);
                         }
                    } else {
                         // This case might happen if V1 failed or ran incompletely. Warn but proceed.
                         console.warn(`DB Util (V2): Cannot add index 'deckIdIndex' as '${STORE_NAME}' store not available in upgrade transaction.`);
                    }
                }

                // Version 3: (Placeholder)
                // if (oldVersion < 3) {
                //    console.log("DB Util: Applying V3 changes...");
                // }

                // Version 4: Create 'gestureModel' store
                if (oldVersion < 4) {
                    console.log("DB Util (V4): Applying V4 changes...");
                    if (!db.objectStoreNames.contains(GESTURE_MODEL_STORE_NAME)) {
                        console.log(`DB Util (V4): Creating object store: ${GESTURE_MODEL_STORE_NAME}`);
                        db.createObjectStore(GESTURE_MODEL_STORE_NAME, { keyPath: 'id' });
                    } else {
                         console.log(`DB Util (V4): Object store ${GESTURE_MODEL_STORE_NAME} already exists.`);
                    }
                }

                // <<< NEW: Version 5 Upgrade Logic >>>
                if (oldVersion < 5) {
                    console.log("DB Util (V5): Applying V5 changes (SRS fields and hintImageUrl)...");
                    if (transaction && transaction.objectStoreNames.contains(STORE_NAME)) {
                        const flashcardStore = transaction.objectStore(STORE_NAME);
                        console.log(`DB Util (V5): Migrating existing flashcards in ${STORE_NAME}...`);

                        // Use a cursor to iterate and update existing records
                        const cursorRequest = flashcardStore.openCursor();
                        let updateCount = 0;

                        cursorRequest.onsuccess = (e) => {
                            const cursor = e.target.result;
                            if (cursor) {
                                try {
                                    const card = cursor.value;
                                    let needsUpdate = false;

                                    // Add SRS fields if they don't exist
                                    if (card.easeFactor === undefined) {
                                        card.easeFactor = 2.5; // Default ease factor
                                        needsUpdate = true;
                                    }
                                    if (card.interval === undefined) {
                                        card.interval = 0; // Default interval (days)
                                        needsUpdate = true;
                                    }
                                    if (card.repetitions === undefined) {
                                        card.repetitions = 0; // Default repetitions
                                        needsUpdate = true;
                                    }
                                    if (card.nextReviewDate === undefined) {
                                        // Set initial review date (e.g., based on last reviewed or now)
                                        card.nextReviewDate = card.lastReviewed || new Date().toISOString();
                                        needsUpdate = true;
                                    }
                                    // Add hintImageUrl field if it doesn't exist
                                    if (card.hintImageUrl === undefined) {
                                        card.hintImageUrl = null; // Default to null
                                        needsUpdate = true;
                                    }

                                    if (needsUpdate) {
                                        cursor.update(card);
                                        updateCount++;
                                    }
                                } catch (updateError) {
                                     console.error(`DB Util (V5): Error updating card ID ${cursor.primaryKey}:`, updateError);
                                     // Decide whether to abort transaction or just log error
                                     // For robustness, let's log and continue
                                } finally {
                                    cursor.continue(); // Move to the next record
                                }
                            } else {
                                // Cursor finished
                                console.log(`DB Util (V5): Finished migrating flashcards. Updated ${updateCount} records.`);
                            }
                        };
                        cursorRequest.onerror = (e) => {
                            console.error("DB Util (V5): Error opening cursor for flashcard migration:", e.target.error);
                            // Transaction might automatically abort here, or you could explicitly abort.
                            // transaction.abort();
                        };

                    } else {
                        console.warn(`DB Util (V5): Cannot migrate flashcards as '${STORE_NAME}' store not available in upgrade transaction.`);
                    }
                }
                // <<< END: Version 5 Upgrade Logic >>>

                console.log("DB Util: Database upgrade steps completed.");

            } catch (upgradeError) {
                 console.error("DB Util: Error during database upgrade process:", upgradeError);
                 if (transaction && typeof transaction.abort === 'function') {
                     transaction.abort();
                 }
                 // Potentially reject the outer promise here if critical
                 // reject(upgradeError);
            }
        }; // End onupgradeneeded

        // --- Success Handler ---
        request.onsuccess = (event) => { /* ... remains the same ... */
            console.log("DB Util: request.onsuccess fired.");
            dbInstance = event.target.result;
            console.log(`DB Util: DB "${DB_NAME}" connection established (v${dbInstance.version}).`);
            dbInstance.onversionchange = () => { console.warn("DB Util: Database version change requested elsewhere. Closing connection."); if(dbInstance?.close) dbInstance.close(); dbInstance = null; openingPromise = null; };
            dbInstance.onclose = () => { console.warn('DB Util: DB connection closed unexpectedly.'); dbInstance = null; openingPromise = null; };
            dbInstance.onerror = (errEvent) => { console.error("DB Util: Generic DB connection error:", errEvent.target.error); };
            openingPromise = null;
            resolve(dbInstance);
            console.log("DB Util: openDB promise resolved.");
        };

        // --- Error Handler ---
        request.onerror = (event) => { /* ... remains the same ... */
            console.error("DB Util: request.onerror fired:", event.target.error);
            openingPromise = null;
            reject(event.target.error);
            console.log("DB Util: openDB promise rejected from onerror.");
        };

        // --- Blocked Handler ---
        request.onblocked = (event) => { /* ... remains the same ... */
             console.warn("DB Util: request.onblocked fired. Another tab might have an older version open.", event);
             openingPromise = null;
             reject(new Error(`Database open blocked (v${DB_VERSION}). Please close other tabs/windows using this extension and try again.`));
             console.log("DB Util: openDB promise rejected from onblocked.");
        };


        console.log("DB Util: Event listeners attached to request.");
    });

    return openingPromise;
}


// --- Gesture Model Save/Load Functions ---
// These functions remain unchanged as they don't depend on the flashcard schema

export async function saveGestureModel(knnClassifierInstance, classExampleCounts) {
    // ... (code remains the same) ...
    if (!knnClassifierInstance || knnClassifierInstance.getNumClasses() === 0) { throw new Error("No training data recorded yet to save."); }
    console.log("DB Util: Preparing KNN dataset for saving...");
    const dataset = knnClassifierInstance.getClassifierDataset();
    const serializableDataset = {};
    const tensorsToDispose = [];
    let processingError = false;
    for (const classIndex in dataset) { const dataTensor = dataset[classIndex]; if (dataTensor) { try { const dataAsArray = Array.from(dataTensor.dataSync()); serializableDataset[classIndex] = { data: dataAsArray, shape: dataTensor.shape }; tensorsToDispose.push(dataTensor); } catch (e) { console.error(`DB Util: Error processing tensor for class ${classIndex}`, e); processingError = true; tensorsToDispose.forEach(t => { if (t && !t.isDisposed) t.dispose(); }); throw new Error(`Failed to process tensor for class ${classIndex}: ${e.message}`); } } else { console.warn(`DB Util: Tensor data for class index ${classIndex} is null/undefined.`); } }
    console.log(`DB Util: Disposing ${tensorsToDispose.length} original tensors after data extraction.`);
    tensorsToDispose.forEach(t => { if (t && !t.isDisposed) t.dispose(); });
    console.log("DB Util: Original tensors disposed.");
    if (Object.keys(serializableDataset).length === 0 || processingError) { throw new Error("Failed to serialize training data or processing error."); }
    const modelDataToSave = { id: 1, dataset: serializableDataset, classCounts: classExampleCounts };
    console.log("DB Util: Data prepared for saving:", JSON.stringify(modelDataToSave).substring(0, 300) + "...");
    console.log("DB Util: Attempting transaction to save gesture model...");
    try {
        const db = await openDB(); const transaction = db.transaction(GESTURE_MODEL_STORE_NAME, 'readwrite'); console.log("DB Util: Save model transaction obtained.");
        transaction.oncomplete = () => console.log("DB Util: Save model transaction COMPLETED."); transaction.onerror = (e) => console.error("DB Util: Save model TRANSACTION ERROR:", e.target.error); transaction.onabort = (e) => console.warn("DB Util: Save model TRANSACTION ABORTED:", e.target.error);
        const store = transaction.objectStore(GESTURE_MODEL_STORE_NAME); console.log("DB Util: Store obtained, executing put request..."); const putRequest = store.put(modelDataToSave);
        return new Promise((resolve, reject) => { console.log("DB Util: Promise for putRequest created."); putRequest.onsuccess = () => { console.log("DB Util: putRequest succeeded. Model saved."); resolve(); }; putRequest.onerror = (e) => { console.error("DB Util: putRequest failed:", e.target.error); reject(new Error(`Failed to save model data: ${e.target.error?.message}`)); }; });
    } catch (err) { console.error("DB Util: DB Error during save model setup/execution:", err); throw new Error(`DB Error saving model: ${err.message}`); }
}


export async function loadGestureModel(knnClassifierInstance) {
    // ... (code remains the same) ...
    if (!knnClassifierInstance || typeof knnClassifierInstance.setClassifierDataset !== 'function') { console.error("DB Util: Invalid or missing KNN instance provided to loadGestureModel."); return {}; }
    console.log("DB Util: Attempting to load gesture model...");
    try {
        const db = await openDB(); if (!db.objectStoreNames.contains(GESTURE_MODEL_STORE_NAME)) { console.log(`DB Util: Object store "${GESTURE_MODEL_STORE_NAME}" doesn't exist. No model to load.`); return {}; }
        const transaction = db.transaction(GESTURE_MODEL_STORE_NAME, 'readonly'); const store = transaction.objectStore(GESTURE_MODEL_STORE_NAME); console.log("DB Util: Requesting saved model data with key 1..."); const getRequest = store.get(1);
        return new Promise((resolve, reject) => { console.log("DB Util: Promise created for getRequest."); getRequest.onsuccess = () => { console.log("DB Util: getRequest succeeded."); const savedData = getRequest.result; if (savedData?.dataset && typeof savedData.dataset === 'object' && Object.keys(savedData.dataset).length > 0) { console.log("DB Util: Found saved model data, processing entries..."); const tensorsToSet = {}; let processingSuccessful = true; tf.tidy(() => { Object.entries(savedData.dataset).forEach(([classIndex, dataObj]) => { if (!processingSuccessful) return; try { if (dataObj?.data && Array.isArray(dataObj.data) && dataObj.shape && Array.isArray(dataObj.shape)) { const loadedTensor = tf.tensor(dataObj.data, dataObj.shape); tensorsToSet[classIndex] = loadedTensor; console.log(`   DB Util: Processed tensor for class ${classIndex}, Shape: ${loadedTensor.shape}`); } else { console.warn(`   DB Util: Invalid data or shape for class ${classIndex}. Skipping.`); processingSuccessful = false; } } catch (e) { console.error(`   DB Util: Error processing tensor for class ${classIndex}`, e); processingSuccessful = false; } }); if (processingSuccessful && Object.keys(tensorsToSet).length > 0) { try { knnClassifierInstance.setClassifierDataset(tensorsToSet); console.log(`DB Util: KNN dataset successfully set with ${Object.keys(tensorsToSet).length} tensors.`); resolve(savedData.classCounts || {}); } catch (knnError) { console.error("DB Util: Error calling knnClassifierInstance.setClassifierDataset:", knnError); reject(new Error(`Failed to set KNN dataset: ${knnError.message}`)); processingSuccessful = false; } } else if (!processingSuccessful) { console.warn("DB Util: Dataset processing failed. Not setting KNN dataset."); resolve({}); } else { console.log("DB Util: No valid tensors processed from saved data."); resolve({}); } }); if (!processingSuccessful) { resolve({}); } } else { console.log("DB Util: No valid saved model data structure found."); resolve({}); } }; getRequest.onerror = (e) => { console.error("DB Util: Error executing getRequest loading saved model:", e.target.error); reject(new Error(`Failed to load model data: ${e.target.error?.message}`)); }; transaction.oncomplete = () => console.log("DB Util: Load model read transaction complete."); transaction.onerror = (e) => console.error("DB Util: Load model read transaction error:", e.target.error); });
    } catch (err) { console.error("DB Util: Error during loadGestureModel setup:", err); return Promise.resolve({}); }
}