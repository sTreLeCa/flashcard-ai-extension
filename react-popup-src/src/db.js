// react-popup-src/src/db.js
import * as tf from '@tensorflow/tfjs'; // Keep TFJS imports if needed elsewhere in db.js

// --- Constants ---
export const DB_NAME = 'flashcardDB';
export const DB_VERSION = 4; // Ensure this is the latest version needed
export const STORE_NAME = 'flashcards';
export const DECKS_STORE_NAME = 'decks';
export const GESTURE_MODEL_STORE_NAME = 'gestureModel'; // Added for V4
export const UNASSIGNED_DECK_ID = null; // Use null for clarity, or keep 0 if preferred

// --- Singleton Connection Management ---
let dbInstance = null; // Holds the active DB connection
let openingPromise = null; // Holds the promise during the opening process

/**
 * Opens and initializes the IndexedDB database using a singleton pattern.
 * Ensures only one connection attempt happens at a time and reuses existing connections.
 * Handles version upgrades.
 * @returns {Promise<IDBDatabase>} A promise that resolves with the database instance.
 */
export function openDB() {
    // 1. Check if a valid, open connection already exists
    if (dbInstance && dbInstance.objectStoreNames.length > 0) {
        console.log(`DB Util: Reusing existing DB instance (v${dbInstance.version}).`);
        return Promise.resolve(dbInstance);
    }

    // 2. Check if an opening operation is already in progress
    if (openingPromise) {
        console.log("DB Util: Reusing existing opening promise.");
        return openingPromise;
    }

    // 3. Start a new opening process
    console.log(`DB Util: Starting new DB open request for '${DB_NAME}' v${DB_VERSION}...`);
    openingPromise = new Promise((resolve, reject) => {

        if (typeof indexedDB === 'undefined') {
            console.error("DB Util: IndexedDB not supported.");
            openingPromise = null; // Reset promise state
            return reject(new Error("IndexedDB is not supported by this browser."));
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);
        console.log("DB Util: indexedDB.open called.");

        // --- Upgrade Handler (Critical) ---
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            const transaction = event.target.transaction; // Use this transaction for upgrades
            const oldVersion = event.oldVersion;
            const newVersion = event.newVersion;
            console.log(`DB Util: Upgrading database from version ${oldVersion} to ${newVersion}...`);

            try {
                // Version 1: Create 'flashcards' store
                if (oldVersion < 1 && !db.objectStoreNames.contains(STORE_NAME)) {
                    console.log(`DB Util: Creating object store: ${STORE_NAME}`);
                    db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                }

                // Version 2: Create 'decks' store and index on 'flashcards'
                if (oldVersion < 2) {
                    if (!db.objectStoreNames.contains(DECKS_STORE_NAME)) {
                        console.log(`DB Util: Creating object store: ${DECKS_STORE_NAME}`);
                        db.createObjectStore(DECKS_STORE_NAME, { keyPath: 'id', autoIncrement: true });
                    }
                    // Add index ONLY if the flashcards store exists in this transaction
                    if (transaction && transaction.objectStoreNames.contains(STORE_NAME)) {
                         const flashcardStore = transaction.objectStore(STORE_NAME);
                         if (!flashcardStore.indexNames.contains('deckIdIndex')) {
                             console.log(`DB Util: Creating index 'deckIdIndex' on store: ${STORE_NAME}`);
                             flashcardStore.createIndex('deckIdIndex', 'deckId', { unique: false });
                         }
                    } else {
                         console.warn(`DB Util: Cannot add index 'deckIdIndex' as '${STORE_NAME}' store not available in upgrade transaction from v${oldVersion}.`);
                    }
                }

                // Version 3: (Placeholder for future changes if needed)
                // if (oldVersion < 3) {
                //    console.log("DB Util: Applying V3 changes...");
                // }

                // Version 4: Create 'gestureModel' store
                if (oldVersion < 4 && !db.objectStoreNames.contains(GESTURE_MODEL_STORE_NAME)) {
                    console.log(`DB Util: Creating object store: ${GESTURE_MODEL_STORE_NAME}`);
                    // Use a keyPath 'id'. We will always use id=1 for the single model entry.
                    db.createObjectStore(GESTURE_MODEL_STORE_NAME, { keyPath: 'id' });
                }

                console.log("DB Util: Database upgrade steps completed.");

            } catch (upgradeError) {
                 console.error("DB Util: Error during database upgrade:", upgradeError);
                 // Make sure the transaction aborts if upgrade fails
                 if (transaction && typeof transaction.abort === 'function') {
                     transaction.abort();
                 }
                 // Reject the main promise if upgrade fails critically
                 // Note: This might prevent onsuccess from firing, which could be intended.
                 // reject(upgradeError); // Consider if rejecting here is desired. Often letting onerror handle it is fine.
            }
        };

        // --- Success Handler ---
        request.onsuccess = (event) => {
            console.log("DB Util: request.onsuccess fired.");
            dbInstance = event.target.result; // Store the connection
            console.log(`DB Util: DB "${DB_NAME}" connection established (v${dbInstance.version}).`);

            // Generic handlers for the active connection
            dbInstance.onversionchange = () => {
                 console.warn("DB Util: Database version change requested elsewhere. Closing connection.");
                 if(dbInstance && typeof dbInstance.close === 'function') {
                     dbInstance.close();
                 }
                 dbInstance = null;
                 openingPromise = null; // Allow reopening
                 // Optionally: Notify the user to reload
            };
            dbInstance.onclose = () => {
                 console.warn('DB Util: DB connection closed unexpectedly.');
                 dbInstance = null;
                 openingPromise = null; // Allow reopening
            };
            dbInstance.onerror = (errEvent) => { // Generic error on the connection itself
                 console.error("DB Util: Generic DB connection error:", errEvent.target.error);
                 // Don't nullify openingPromise here unless connection is truly unusable
            };

            openingPromise = null; // Clear the promise *after* setting dbInstance
            resolve(dbInstance); // Resolve the main promise with the connection
            console.log("DB Util: openDB promise resolved.");
        };

        // --- Error Handler ---
        request.onerror = (event) => {
            console.error("DB Util: request.onerror fired:", event.target.error);
            openingPromise = null; // Reset promise state on error
            reject(event.target.error); // Reject the main promise
            console.log("DB Util: openDB promise rejected from onerror.");
        };

        // --- Blocked Handler ---
        request.onblocked = (event) => {
            console.warn("DB Util: request.onblocked fired. Another tab might have an older version open.", event);
            openingPromise = null; // Reset promise state
            // Provide a more user-friendly error message
            reject(new Error(`Database open blocked (v${DB_VERSION}). Please close other tabs/windows using this extension and try again.`));
            console.log("DB Util: openDB promise rejected from onblocked.");
        };

        console.log("DB Util: Event listeners attached to request.");
    });

    return openingPromise;
}


// --- Gesture Model Save/Load Functions (Keep these as they are, assuming they use openDB correctly) ---

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
    // NOTE: tf.tidy() might be a cleaner way to handle disposal here,
    // but this manual approach is also valid if done carefully.
    for (const classIndex in dataset) {
        const dataTensor = dataset[classIndex];
        if (dataTensor) {
            try {
                // IMPORTANT: Ensure data is copied synchronously before disposal
                const dataAsArray = Array.from(dataTensor.dataSync());
                serializableDataset[classIndex] = { data: dataAsArray, shape: dataTensor.shape };
                tensorsToDispose.push(dataTensor); // Add to list for later disposal
            } catch (e) {
                console.error(`DB Util: Error processing tensor for class ${classIndex}`, e);
                processingError = true;
                // Clean up any tensors already collected if processing fails mid-way
                tensorsToDispose.forEach(t => { if (t && !t.isDisposed) t.dispose(); });
                throw new Error(`Failed to process tensor for class ${classIndex}: ${e.message}`);
            }
        } else {
            console.warn(`DB Util: Tensor data for class index ${classIndex} is null/undefined.`);
        }
    }

    // Step 3: Dispose all original tensors *after* data extraction is complete
    console.log(`DB Util: Disposing ${tensorsToDispose.length} original tensors after data extraction.`);
    tensorsToDispose.forEach(t => { if (t && !t.isDisposed) t.dispose(); });
    console.log("DB Util: Original tensors disposed.");


    // Step 4: Check if we actually got any data or if processing failed
    if (Object.keys(serializableDataset).length === 0 || processingError) {
         console.warn("DB Util: Serializable dataset empty or processing error occurred.");
         throw new Error("Failed to serialize training data or processing error.");
    }

    // Step 5: Prepare data for IndexedDB (Use ID 1 for the single model entry)
    const modelDataToSave = { id: 1, dataset: serializableDataset, classCounts: classExampleCounts };
    console.log("DB Util: Data prepared for saving:", JSON.stringify(modelDataToSave).substring(0, 300) + "..."); // Log snippet

    // Step 6: Save to IndexedDB using the master openDB
    console.log("DB Util: Attempting transaction to save gesture model...");
    try {
        const db = await openDB(); // <<< USE THE EXPORTED FUNCTION
        const transaction = db.transaction(GESTURE_MODEL_STORE_NAME, 'readwrite');
        console.log("DB Util: Save model transaction obtained.");

        // Add detailed transaction handlers
        transaction.oncomplete = () => console.log("DB Util: Save model transaction COMPLETED.");
        transaction.onerror = (e) => console.error("DB Util: Save model TRANSACTION ERROR:", e.target.error);
        transaction.onabort = (e) => console.warn("DB Util: Save model TRANSACTION ABORTED:", e.target.error);

        const store = transaction.objectStore(GESTURE_MODEL_STORE_NAME);
        console.log("DB Util: Store obtained, executing put request...");
        const putRequest = store.put(modelDataToSave);

        return new Promise((resolve, reject) => { // Wrap the request in a promise
             console.log("DB Util: Promise for putRequest created.");
            putRequest.onsuccess = () => {
                 console.log("DB Util: putRequest succeeded. Model saved.");
                 resolve(); // Resolve on successful put
            };
            putRequest.onerror = (e) => {
                 console.error("DB Util: putRequest failed:", e.target.error);
                 reject(new Error(`Failed to save model data: ${e.target.error?.message}`)); // Reject with specific error
            };
        });
    } catch (err) {
         console.error("DB Util: DB Error during save model setup/execution:", err);
         // Propagate the error (could be DB open error or transaction error)
         throw new Error(`DB Error saving model: ${err.message}`);
    }
}


/**
 * Loads the KNN classifier dataset from IndexedDB and configures the provided KNN instance.
 * @param {object} knnClassifierInstance - The KNN Classifier instance to load data into.
 * @returns {Promise<object>} A promise resolving with the loaded class counts object, or empty object if no data found/error.
 */
export async function loadGestureModel(knnClassifierInstance) {
     if (!knnClassifierInstance || typeof knnClassifierInstance.setClassifierDataset !== 'function') {
         console.error("DB Util: Invalid or missing KNN instance provided to loadGestureModel.");
         return {}; // Return empty counts
     }
     console.log("DB Util: Attempting to load gesture model...");

     try {
         const db = await openDB(); // <<< USE THE EXPORTED FUNCTION

         if (!db.objectStoreNames.contains(GESTURE_MODEL_STORE_NAME)) {
             console.log(`DB Util: Object store "${GESTURE_MODEL_STORE_NAME}" doesn't exist. No model to load.`);
             return {}; // No store, no data
         }

         const transaction = db.transaction(GESTURE_MODEL_STORE_NAME, 'readonly');
         const store = transaction.objectStore(GESTURE_MODEL_STORE_NAME);
         console.log("DB Util: Requesting saved model data with key 1...");
         const getRequest = store.get(1); // Get the single model entry with ID 1

         return new Promise((resolve, reject) => {
             console.log("DB Util: Promise created for getRequest.");

             getRequest.onsuccess = () => {
                 console.log("DB Util: getRequest succeeded.");
                 const savedData = getRequest.result;

                 if (savedData?.dataset && typeof savedData.dataset === 'object' && Object.keys(savedData.dataset).length > 0) {
                     console.log("DB Util: Found saved model data, processing entries...");
                     const tensorsToSet = {};
                     let processingSuccessful = true;

                    // Wrap tensor creation/cloning in tf.tidy for automatic cleanup of intermediates
                    tf.tidy(() => {
                        Object.entries(savedData.dataset).forEach(([classIndex, dataObj]) => {
                            if (!processingSuccessful) return; // Skip remaining if error occurred

                            try {
                                if (dataObj?.data && Array.isArray(dataObj.data) && dataObj.shape && Array.isArray(dataObj.shape)) {
                                    // Create tensor directly from data
                                    const loadedTensor = tf.tensor(dataObj.data, dataObj.shape);
                                    // Store the tensor itself (KNN expects tensors). KNN manages its memory.
                                    tensorsToSet[classIndex] = loadedTensor;
                                    console.log(`   DB Util: Processed tensor for class ${classIndex}, Shape: ${loadedTensor.shape}`);
                                } else {
                                    console.warn(`   DB Util: Invalid data or shape for class ${classIndex}. Skipping.`);
                                    processingSuccessful = false;
                                }
                            } catch (e) {
                                console.error(`   DB Util: Error processing tensor for class ${classIndex}`, e);
                                processingSuccessful = false;
                            }
                        }); // End forEach

                        // Only set dataset if processing was fully successful
                        if (processingSuccessful && Object.keys(tensorsToSet).length > 0) {
                             try {
                                knnClassifierInstance.setClassifierDataset(tensorsToSet);
                                console.log(`DB Util: KNN dataset successfully set with ${Object.keys(tensorsToSet).length} tensors.`);
                                resolve(savedData.classCounts || {}); // Resolve with counts
                            } catch (knnError) {
                                 console.error("DB Util: Error calling knnClassifierInstance.setClassifierDataset:", knnError);
                                 reject(new Error(`Failed to set KNN dataset: ${knnError.message}`)); // Reject on KNN set error
                                 processingSuccessful = false; // Mark as failed
                            }
                        } else if (!processingSuccessful) {
                             console.warn("DB Util: Dataset processing failed. Not setting KNN dataset.");
                             resolve({}); // Resolve empty, tensors handled by tidy
                        } else {
                             console.log("DB Util: No valid tensors processed from saved data.");
                             resolve({}); // Resolve empty, tensors handled by tidy
                        }
                    }); // End tf.tidy

                    // If processing failed inside tidy but didn't reject, resolve empty here too
                     if (!processingSuccessful) {
                         resolve({});
                     }

                 } else {
                     console.log("DB Util: No valid saved model data structure found.");
                     resolve({}); // Resolve with empty counts if no data
                 }
             }; // End onsuccess

             getRequest.onerror = (e) => {
                 console.error("DB Util: Error executing getRequest loading saved model:", e.target.error);
                 reject(new Error(`Failed to load model data: ${e.target.error?.message}`)); // Reject on error
             };

             transaction.oncomplete = () => console.log("DB Util: Load model read transaction complete.");
             transaction.onerror = (e) => console.error("DB Util: Load model read transaction error:", e.target.error); // Log, but let request handle reject

         }); // End Promise

     } catch (err) {
         // Catch errors during DB open or transaction start
         console.error("DB Util: Error during loadGestureModel setup:", err);
         return Promise.resolve({}); // Resolve with empty object on setup failure
     }
}

// Add any other DB utility functions here if needed