// db.js
import * as tf from '@tensorflow/tfjs';

export const DB_NAME = 'flashcardDB';
export const DB_VERSION = 4;
export const STORE_NAME = 'flashcards';
export const DECKS_STORE_NAME = 'decks';
export const GESTURE_MODEL_STORE_NAME = 'gestureModel';
export const UNASSIGNED_DECK_ID = 0;

let dbInstance = null; // Hold the actual DB connection instance
let openingPromise = null
/**
 * Opens and initializes the IndexedDB database.
 * Returns a Promise that resolves with the database instance when ready.
 * @returns {Promise<IDBDatabase>}
 */

export function openDB() {
    // If we already have a valid, open connection, return it directly
    if (dbInstance && dbInstance.objectStoreNames.length > 0) { // Basic check if connection seems valid
        console.log(`DB Util: Reusing existing DB instance (v${dbInstance.version}).`);
        return Promise.resolve(dbInstance);
    }

    // If an opening operation is already in progress, return its promise
    if (openingPromise) {
        console.log(`DB Util: Reusing existing opening promise.`);
        return openingPromise;
    }

    console.log(`DB Util: Starting new DB open request for v${DB_VERSION}...`);
    openingPromise = new Promise((resolve, reject) => {
        console.log(`DB Util: Inside new Promise constructor.`); // <<< LOG
        if (typeof indexedDB === 'undefined') {
            console.error("DB Util: IndexedDB not supported.");
            openingPromise = null; // Reset promise state
            return reject(new Error("IndexedDB not supported"));
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);
        console.log(`DB Util: indexedDB.open called.`); // <<< LOG

        request.onupgradeneeded = (event) => {
            // ... (Keep your full V1, V2, V3, V4 upgrade logic here) ...
            console.log(`DB Util: onupgradeneeded event fired (Old: ${event.oldVersion}, New: ${event.newVersion}).`);
            // ... schema changes ...
            console.log(`DB Util: onupgradeneeded finished processing.`);
        };

        request.onsuccess = (event) => {
            console.log("DB Util: request.onsuccess fired."); // <<< LOG
            dbInstance = event.target.result; // Store the successful connection
            console.log(`DB Util: DB "${DB_NAME}" connection established (v${dbInstance.version}).`);
            dbInstance.onversionchange = () => { // Handle external version change requests
                 console.warn("DB Util: Database version change requested elsewhere. Closing connection.");
                 dbInstance?.close();
                 dbInstance = null;
                 openingPromise = null;
            };
            dbInstance.onclose = () => {
                 console.warn('DB Util: DB connection closed.');
                 dbInstance = null;
                 openingPromise = null; // Allow reopening
            };
            dbInstance.onerror = (errEvent) => { // Generic handler on the connection
                 console.error("DB Util: Generic DB connection error:", errEvent.target.error);
                 // Don't necessarily nullify dbPromise here, maybe connection is still partially usable? Depends.
            };
            openingPromise = null; // Clear the opening promise now we have an instance
            resolve(dbInstance); // Resolve with the DB instance
            console.log("DB Util: resolve(dbInstance) called."); // <<< LOG
        };

        request.onerror = (event) => {
            console.error("DB Util: request.onerror fired:", event.target.error); // <<< LOG
            openingPromise = null; // Reset promise state on error
            reject(event.target.error); // Reject the promise
            console.log("DB Util: reject(error) called from onerror."); // <<< LOG
        };

        request.onblocked = (event) => {
            // This implies an upgrade is needed but blocked by another connection
            console.warn("DB Util: request.onblocked fired. Close other tabs/windows using this extension.", event); // <<< LOG
            openingPromise = null; // Reset promise state
            reject(new Error(`Database open blocked (v${DB_VERSION}). Close other tabs.`)); // Reject the promise
             console.log("DB Util: reject(error) called from onblocked."); // <<< LOG
       };
        console.log("DB Util: Event listeners attached to request."); // <<< LOG
    });

    return openingPromise;
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
    const tensorsToDispose = [];
    let processingError = false;

    // Step 2: Extract data and shape from tensors *before* disposing
    for (const classIndex in dataset) {
        const dataTensor = dataset[classIndex];
        if (dataTensor) {
            try {
                const dataAsArray = Array.from(dataTensor.dataSync());
                serializableDataset[classIndex] = { data: dataAsArray, shape: dataTensor.shape };
                tensorsToDispose.push(dataTensor);
            } catch (e) {
                console.error(`DB Util: Error processing tensor for class ${classIndex}`, e);
                processingError = true;
                tensorsToDispose.forEach(t => t.dispose()); // Dispose already collected tensors
                throw new Error(`Failed to process tensor for class ${classIndex}: ${e.message}`);
            }
        } else {
            console.warn(`DB Util: Tensor data for class index ${classIndex} is null/undefined.`);
        }
    }

    // Step 3: Dispose all original tensors
    tensorsToDispose.forEach(t => t.dispose());
    console.log("DB Util: Original tensors disposed.");

    // Step 4: Check if we actually got any data or if processing failed
    if (Object.keys(serializableDataset).length === 0 || processingError) {
         console.warn("DB Util: Serializable dataset empty or processing error occurred.");
         throw new Error("Failed to serialize training data or processing error.");
    }

    // Step 5: Prepare data for IndexedDB
    // VVV UNCOMMENT THIS LINE VVV
    const modelDataToSave = { id: 1, dataset: serializableDataset, classCounts: classExampleCounts };
    // VVV Log the actual data being prepared VVV
    console.log("DB Util: Data prepared for saving:", JSON.stringify(modelDataToSave).substring(0, 300) + "...");

    // Step 6: Save to IndexedDB
    console.log("DB Util: Attempting transaction to save gesture model...");
    try {
        const db = await openDB(); // Call the exported openDB function
        const transaction = db.transaction(GESTURE_MODEL_STORE_NAME, 'readwrite');
        console.log("DB Util: Transaction obtained."); // <<< LOG

        // Add detailed transaction handlers
        transaction.oncomplete = () => { 
            console.log("DB Util: Save model transaction COMPLETED SUCCESSFULLY."); 
        };
        transaction.onerror = (e) => { 
            console.error("DB Util: Save model TRANSACTION ERROR:", e.target.error); 
        }; // Don't reject promise here, let putRequest handle it
        transaction.onabort = (e) => { 
            console.warn("DB Util: Save model TRANSACTION ABORTED:", e.target.error); 
        }; // Don't reject promise here


        const store = transaction.objectStore(GESTURE_MODEL_STORE_NAME);
        console.log("DB Util: Store obtained, executing put request...");
        const putRequest = store.put(modelDataToSave);

        return new Promise((resolve, reject) => { // Return promise wrapping the request
             console.log("DB Util: Promise for putRequest created."); // <<< LOG
            putRequest.onsuccess = () => {
                 console.log("DB Util: putRequest succeeded. Model saved."); // <<< LOG
                 resolve(); // Resolve on successful put
            };
            putRequest.onerror = (e) => {
                 console.error("DB Util: putRequest failed:", e.target.error); // <<< LOG
                 reject(e.target.error);
            };
            // Note: Transaction handlers defined outside promise are still active
        });
    } catch (err) {
         console.error("DB Util: DB Error during save model setup/execution:", err);
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
    try {
    const db = await openDB();
    if (!db.objectStoreNames.contains(GESTURE_MODEL_STORE_NAME)) {
        console.log("DB Util: Gesture model store doesn't exist yet.");
        return {}; // Return empty counts
    }

    const transaction = db.transaction(GESTURE_MODEL_STORE_NAME, 'readonly');
    const store = transaction.objectStore(GESTURE_MODEL_STORE_NAME);
    console.log("DB Util: Requesting data with key 1...");
    const getRequest = store.get(1); // Get model data using fixed ID 1

    return new Promise((resolve, reject) => {
        console.log("DB Util: Promise for getRequest created."); // <<< ADD LOG
        getRequest.onsuccess = () => {
            console.log("DB Util: getRequest succeeded.");
            const savedData = getRequest.result;
            if (savedData?.dataset && Object.keys(savedData.dataset).length > 0) {
                console.log("DB Util: Found saved model data, processing...");
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
            } else {
                console.log("DB Util: No valid saved model data found in result."); // <<< ADD LOG
                 console.log("DB Util: No saved model data found."); 
                 resolve({}); } // Return empty counts
        };
        getRequest.onerror = (e) => { console.error("DB Util: Error loading saved model:", e.target.error); reject(e.target.error); }; // Reject on error
        transaction.oncomplete = () => { console.log("DB Util: Load model transaction complete."); };
        transaction.onerror = (e) => { console.error("DB Util: Load model Tx Error:", e.target.error); reject(e.target.error); };
    });} catch (err) {
        console.error("DB Util: Error during load model (maybe openDB failed?):", err); // <<< ADD LOG
        return {}; // Return empty on error
   }
}
