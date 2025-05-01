import * as tf from '@tensorflow/tfjs';

export const DB_NAME = 'flashcardDB';
export const DB_VERSION = 5; // <<< INCREMENTED VERSION TO 5
export const STORE_NAME = 'flashcards';
export const DECKS_STORE_NAME = 'decks';
export const GESTURE_MODEL_STORE_NAME = 'gestureModel';
export const UNASSIGNED_DECK_ID = 0;

let dbInstance = null; // Hold the actual DB connection instance
let openingPromise = null;

/**
 * Opens and initializes the IndexedDB database.
 * Returns a Promise that resolves with the database instance when ready.
 * Manages a single connection instance and handles concurrent requests.
 * @returns {Promise<IDBDatabase>}
 */
export function openDB() {
    // Reuse existing connection or opening promise if available
    if (dbInstance && dbInstance.objectStoreNames.length > 0) {
        console.log(`DB Util: Reusing existing DB instance (v${dbInstance.version}).`);
        return Promise.resolve(dbInstance);
    }
    if (openingPromise) {
        console.log(`DB Util: Reusing existing opening promise.`);
        return openingPromise;
    }

    console.log(`DB Util: Starting new DB open request for v${DB_VERSION}...`);
    openingPromise = new Promise((resolve, reject) => {
        console.log(`DB Util: Inside new Promise constructor.`);
        if (typeof indexedDB === 'undefined') {
            console.error("DB Util: IndexedDB not supported.");
            openingPromise = null;
            return reject(new Error("IndexedDB not supported"));
        }

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
        console.log("DB Util: Event listeners attached to request.");
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
    // Check if a valid KNN instance was provided
    if (!knnClassifierInstance || typeof knnClassifierInstance.setClassifierDataset !== 'function') {
        console.error("DB Util: Invalid or missing KNN instance provided to loadGestureModel.");
        return {}; // Return empty counts if no valid KNN instance
    }

    console.log("DB Util: Attempting to load gesture model...");

    try {
        // Get a connection to the IndexedDB database
        const db = await openDB();

        // Check if the required object store exists
        if (!db.objectStoreNames.contains(GESTURE_MODEL_STORE_NAME)) {
            console.log(`DB Util: Object store "${GESTURE_MODEL_STORE_NAME}" doesn't exist yet. No model to load.`);
            return {}; // Return empty counts if the store isn't there
        }

        // Start a read-only transaction on the gesture model store
        const transaction = db.transaction(GESTURE_MODEL_STORE_NAME, 'readonly');
        const store = transaction.objectStore(GESTURE_MODEL_STORE_NAME);

        console.log("DB Util: Requesting saved model data with key 1...");
        // Request the saved model data (assuming it's stored with a fixed key, e.g., 1)
        const getRequest = store.get(1);

        // Return a Promise that resolves/rejects based on the IndexedDB request outcome
        return new Promise((resolve, reject) => {
            console.log("DB Util: Promise created for getRequest.");

            // Handle successful retrieval of data
            getRequest.onsuccess = () => {
                console.log("DB Util: getRequest succeeded.");
                const savedData = getRequest.result;

                // Check if valid data and dataset were retrieved
                if (savedData?.dataset && typeof savedData.dataset === 'object' && Object.keys(savedData.dataset).length > 0) {
                    console.log("DB Util: Found saved model data, processing entries...");

                    const tensorsToSet = {};       // To hold the CLONED tensors for KNN
                    const tensorsToDispose = [];   // To hold the ORIGINAL tensors created from arrays
                    let processingSuccessful = true; // Flag to track if all tensors were processed ok

                    // Iterate through the saved dataset entries (classIndex -> {data, shape})
                    Object.entries(savedData.dataset).forEach(([classIndex, dataObj]) => {
                        let originalTensor = null; // Tensor created directly from loaded data

                        try {
                            // Validate the data object for the current class
                            if (dataObj?.data && Array.isArray(dataObj.data) && dataObj.shape && Array.isArray(dataObj.shape)) {
                                // 1. Create the original tensor from the loaded array data and shape
                                originalTensor = tf.tensor(dataObj.data, dataObj.shape);
                                console.log(`   DB Util: Created original tensor for class ${classIndex}, isDisposed: ${originalTensor.isDisposed}, shape: ${originalTensor.shape}`);
                                tensorsToDispose.push(originalTensor); // Add original to disposal list

                                // 2. Clone the original tensor to create an independent copy
                                tensorsToSet[classIndex] = originalTensor.clone();
                                console.log(`   DB Util: Cloned tensor for class ${classIndex}, isDisposed: ${tensorsToSet[classIndex].isDisposed}, shape: ${tensorsToSet[classIndex].shape}`);

                            } else {
                                console.warn(`   DB Util: Invalid data or shape found for class ${classIndex}. Skipping.`);
                                processingSuccessful = false; // Mark processing as failed if data is bad
                            }
                        } catch (e) {
                            // Catch errors during tensor creation or cloning
                            console.error(`   DB Util: Error processing tensor for class ${classIndex}`, e);
                            processingSuccessful = false;
                            // Ensure partial tensor is disposed if error occurred during processing
                            if (originalTensor && !originalTensor.isDisposed) {
                                originalTensor.dispose();
                            }
                            // No need to dispose clone here as error likely happened before/during cloning
                        }
                    });

                    // Check if processing was successful and at least one tensor was prepared
                    if (Object.keys(tensorsToSet).length > 0 && processingSuccessful) {
                        try {
                            // 3. Set the dataset in the KNN instance using the CLONED tensors
                            knnClassifierInstance.setClassifierDataset(tensorsToSet);
                            console.log(`DB Util: KNN dataset successfully set using ${Object.keys(tensorsToSet).length} CLONED tensors.`);

                            // Resolve the promise with the loaded class counts
                            resolve(savedData.classCounts || {});

                        } catch (knnError) {
                             console.error("DB Util: Error calling knnClassifierInstance.setClassifierDataset:", knnError);
                             // Reject if setting the dataset fails
                             reject(knnError);
                        } finally {
                             // 4. Dispose the ORIGINAL tensors created directly from data arrays
                             //    The KNN instance now manages the clones.
                             console.log(`DB Util: Disposing ${tensorsToDispose.length} original temporary tensors...`);
                             tensorsToDispose.forEach(tensor => {
                                 if (tensor && !tensor.isDisposed) {
                                     tensor.dispose();
                                 }
                             });
                              console.log("DB Util: Original temporary tensors disposed.");
                        }
                    } else {
                        // Handle cases where processing failed or resulted in no valid tensors
                        console.warn("DB Util: Dataset processing failed or resulted in no tensors to set.");
                        // Ensure cleanup of any created tensors if processing failed
                        tensorsToDispose.forEach(tensor => { if (tensor && !tensor.isDisposed) tensor.dispose(); });
                        Object.values(tensorsToSet).forEach(tensor => { if (tensor && !tensor.isDisposed) tensor.dispose(); });
                        resolve({}); // Resolve with empty counts if processing failed
                    }
                } else {
                    // Handle case where no valid saved data was found in IndexedDB
                    console.log("DB Util: No valid saved model data structure found in result.");
                    resolve({}); // Resolve with empty counts
                }
            };

            // Handle errors during the IndexedDB get request
            getRequest.onerror = (e) => {
                console.error("DB Util: Error executing getRequest loading saved model:", e.target.error);
                reject(e.target.error); // Reject the promise on error
            };

            // Optional: Handle transaction completion and errors
            transaction.oncomplete = () => {
                console.log("DB Util: Load model read transaction complete.");
            };
            transaction.onerror = (e) => {
                // Don't necessarily reject here, as getRequest.onerror should handle the primary failure
                console.error("DB Util: Load model read transaction error:", e.target.error);
            };
        });

    } catch (err) {
        // Catch errors during the initial DB opening or transaction setup phase
        console.error("DB Util: Error during loadGestureModel setup (e.g., opening DB):", err);
        // Ensure promise resolves with empty object even if setup fails
        return Promise.resolve({});
    }
}