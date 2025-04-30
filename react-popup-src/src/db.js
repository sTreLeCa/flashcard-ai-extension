// db.js
import * as tf from '@tensorflow/tfjs';

export const DB_NAME = 'flashcardDB';
export const DB_VERSION = 4; // <<< Use V4 to include gestureModel store
export const STORE_NAME = 'flashcards';
export const DECKS_STORE_NAME = 'decks';
export const GESTURE_MODEL_STORE_NAME = 'gestureModel'; // <<< Add this constant
export const UNASSIGNED_DECK_ID = 0;

let dbPromise = null;;

let db; // Variable to hold the database instance

/**
 * Opens and initializes the IndexedDB database.
 * Returns a Promise that resolves with the database instance when ready.
 * @returns {Promise<IDBDatabase>}
 */

export function openDB() {
    if (dbPromise && dbPromise.readyState !== 'done') { return dbPromise; }
    console.log(`DB Util: Opening/Requesting DB: ${DB_NAME} v${DB_VERSION}`);
    dbPromise = new Promise((resolve, reject) => {
         if (typeof indexedDB === 'undefined') { /* ... */ }
         const request = indexedDB.open(DB_NAME, DB_VERSION);

         request.onupgradeneeded = (event) => {
             const currentVersion = event.oldVersion;
             console.log(`DB Util: Upgrade needed from v${currentVersion} to v${DB_VERSION}.`);
             const tempDb = event.target.result;
             const transaction = event.target.transaction;
             if (!transaction) { /* handle error */ reject(new Error("No tx")); return; }

             // Schema updates for V1, V2, V3... (ensure these are present)
             if (currentVersion < 1 && !tempDb.objectStoreNames.contains(STORE_NAME)) { /* create flashcards */ }
             if (currentVersion < 2 && !tempDb.objectStoreNames.contains(DECKS_STORE_NAME)) { /* create decks */ }
             if (currentVersion < 2 && transaction.objectStoreNames.contains(STORE_NAME)) { /* create deckIdIndex */ }
             if (currentVersion < 3 && transaction.objectStoreNames.contains(STORE_NAME)) { /* migrate null deckId */ }

             // --- V4 logic (Ensure this is present) ---
             if (currentVersion < 4) {
                  console.log("DB Util: Applying V4 updates (adding gestureModel store).");
                  if (!tempDb.objectStoreNames.contains(GESTURE_MODEL_STORE_NAME)) {
                       console.log(`DB Util: Creating store ${GESTURE_MODEL_STORE_NAME}`);
                       tempDb.createObjectStore(GESTURE_MODEL_STORE_NAME, { keyPath: 'id' });
                  }
             }
              console.log('DB Util: DB onupgradeneeded finished.');
         }; // End onupgradeneeded

         request.onsuccess=(e)=>{/* ... */};
         request.onerror=(e)=>{/* ... */};
         request.onblocked=(e)=>{/* ... */};
    });
    return dbPromise;
}

/**
 * Saves the KNN classifier dataset and class counts to IndexedDB.
 * @param {object} knnClassifierInstance - The initialized KNN Classifier instance.
 * @param {object} classExampleCounts - Object mapping class names to sample counts.
 * @returns {Promise<void>} Resolves on success, rejects on error.
 */
export async function saveGestureModel(knnClassifierInstance, classExampleCounts) {
    if (!knnClassifierInstance || knnClassifierInstance.getNumClasses() === 0) {
        console.warn("DB Util: No KNN data to save.");
        throw new Error("No training data recorded yet to save.");
    }
    console.log("DB Util: Preparing KNN dataset for saving...");

    // Step 1: Get the dataset (references to tensors)
    const dataset = knnClassifierInstance.getClassifierDataset();
    const serializableDataset = {};
    const tensorsToDispose = []; // Keep track of tensors to dispose later

    // Step 2: Extract data and shape from tensors *before* disposing
    for (const classIndex in dataset) {
        const dataTensor = dataset[classIndex];
        if (dataTensor) {
            try {
                // dataSync() is synchronous, so we get the data immediately
                const dataAsArray = Array.from(dataTensor.dataSync());
                serializableDataset[classIndex] = { data: dataAsArray, shape: dataTensor.shape };
                // Add the tensor to the list to be disposed later
                tensorsToDispose.push(dataTensor);
            } catch (e) {
                console.error(`Error processing tensor for class ${classIndex}`, e);
                // If one tensor fails, we might want to abort the whole save
                // Dispose any tensors we collected so far
                tensorsToDispose.forEach(t => t.dispose());
                throw new Error(`Failed to process tensor for class ${classIndex}: ${e.message}`);
            }
        } else {
            console.warn(`Tensor data for class index ${classIndex} is null/undefined.`);
        }
    }

    // Step 3: Dispose all original tensors now that we have the data copied
    tensorsToDispose.forEach(t => t.dispose());
    console.log("DB Util: Original tensors disposed.");

    // Step 4: Check if we actually got any data
    if (Object.keys(serializableDataset).length === 0) {
         console.warn("DB Util: Serializable dataset is empty after processing.");
         throw new Error("Failed to serialize training data.");
    }

    // Step 5: Prepare data for IndexedDB
    const modelDataToSave = { id: 1, dataset: serializableDataset, classCounts: classExampleCounts };

    // Step 6: Save to IndexedDB
    console.log("DB Util: Attempting to save gesture model to IndexedDB...");
    try {
        const db = await openDB();
        const transaction = db.transaction(GESTURE_MODEL_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(GESTURE_MODEL_STORE_NAME);
        const putRequest = store.put(modelDataToSave);

        return new Promise((resolve, reject) => { // Return promise wrapping the DB operation
            putRequest.onsuccess = () => { console.log("DB Util: Model saved to IndexedDB."); resolve(); };
            putRequest.onerror = (e) => { console.error("DB Util: Error saving model:", e.target.error); reject(e.target.error); };
            transaction.oncomplete = () => { console.log("DB Util: Save model transaction complete."); };
            transaction.onerror = (e) => { console.error("DB Util: Save model Tx Error:", e.target.error); reject(e.target.error); }; // Reject on tx error too
        });
    } catch (err) {
         console.error("DB Util: DB Error during save model setup:", err);
         throw new Error(`DB Error saving model: ${err.message}`); // Re-throw error
    }
}

/**
 * Loads the KNN classifier dataset from IndexedDB and configures the provided KNN instance.
 * @param {object} knnClassifierInstance - The KNN Classifier instance to load data into.
 * @returns {Promise<object>} A promise resolving with the loaded class counts object, or empty object if no data found/error.
 */
export async function loadGestureModel(knnClassifierInstance) {
    if (!knnClassifierInstance) {
        console.error("DB Util: KNN instance not provided to loadGestureModel.");
        return {}; // Return empty counts if no KNN instance
    }
    console.log("DB Util: Attempting to load gesture model...");
    const db = await openDB();
    if (!db.objectStoreNames.contains(GESTURE_MODEL_STORE_NAME)) {
        console.log("DB Util: Gesture model store doesn't exist yet.");
        return {}; // Return empty counts
    }

    const transaction = db.transaction(GESTURE_MODEL_STORE_NAME, 'readonly');
    const store = transaction.objectStore(GESTURE_MODEL_STORE_NAME);
    const getRequest = store.get(1); // Get model data using fixed ID 1

    return new Promise((resolve, reject) => {
        getRequest.onsuccess = () => {
            const savedData = getRequest.result;
            if (savedData?.dataset && Object.keys(savedData.dataset).length > 0) {
                console.log("DB Util: Found saved model data.");
                const tensors = {}; let success = true;
                Object.entries(savedData.dataset).forEach(([classIndex, dataObj]) => {
                    try { if (dataObj?.data && dataObj.shape) { tensors[classIndex] = tf.tensor(dataObj.data, dataObj.shape); } }
                    catch (e) { console.error(`Error creating tensor ${classIndex}`, e); success = false; }
                });
                if (Object.keys(tensors).length > 0 && success) {
                      knnClassifierInstance.setClassifierDataset(tensors);
                      console.log("DB Util: KNN dataset loaded.");
                      Object.values(tensors).forEach(tensor => tensor?.dispose());
                      resolve(savedData.classCounts || {}); // Return loaded counts
                 } else { console.warn("DB Util: Saved dataset empty/invalid."); Object.values(tensors).forEach(tensor => tensor?.dispose()); resolve({}); }
            } else { console.log("DB Util: No saved model data found."); resolve({}); } // Return empty counts
        };
        getRequest.onerror = (e) => { console.error("DB Util: Error loading saved model:", e.target.error); reject(e.target.error); }; // Reject on error
        transaction.oncomplete = () => { console.log("DB Util: Load model transaction complete."); };
        transaction.onerror = (e) => { console.error("DB Util: Load model Tx Error:", e.target.error); reject(e.target.error); };
    });
}