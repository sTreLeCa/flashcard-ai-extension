// db.js

const DB_NAME = 'flashcardDB';
const DB_VERSION = 1; // Increment this if you change the schema later
const STORE_NAME = 'flashcards';

let db; // Variable to hold the database instance

/**
 * Opens and initializes the IndexedDB database.
 * Returns a Promise that resolves with the database instance when ready.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
    // Return existing promise if already connecting/connected
    if (db) {
        // If db object exists, assume it's already open or opening.
        // For simplicity, we return a resolved promise.
        // A more robust solution might track the opening promise itself.
        return Promise.resolve(db);
    }

    return new Promise((resolve, reject) => {
        console.log(`Attempting to open DB: ${DB_NAME} version ${DB_VERSION}`);
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        // --- Event Handlers ---

        // Called only when the DB version changes or the DB is first created
        request.onupgradeneeded = (event) => {
            console.log('Database upgrade needed or first-time setup.');
            const tempDb = event.target.result;

            // Check if the object store already exists (it shouldn't on first creation/upgrade)
            if (!tempDb.objectStoreNames.contains(STORE_NAME)) {
                console.log(`Creating object store: ${STORE_NAME}`);
                // Create the object store. 'id' will be the keyPath and auto-incrementing.
                const store = tempDb.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });

                // Optional: Create indexes for faster searching/sorting later
                // Example: Create an index on the 'bucket' field
                // store.createIndex('bucketIndex', 'bucket', { unique: false });
                // Example: Create an index on 'tags' (if tags are common search criteria)
                // store.createIndex('tagsIndex', 'tags', { unique: false, multiEntry: true }); // multiEntry for arrays

                console.log('Object store created successfully.');
            } else {
                 console.log(`Object store "${STORE_NAME}" already exists.`);
                 // Handle potential migrations for existing stores here if needed in future versions
            }
        };

        // Called when the database is successfully opened
        request.onsuccess = (event) => {
            db = event.target.result; // Store the DB connection
            console.log(`Database "${DB_NAME}" opened successfully (version ${db.version}).`);

            // Set up generic error handler for the connection
            db.onerror = (errorEvent) => {
                console.error("Database error:", errorEvent.target.error);
            };

            resolve(db); // Resolve the promise with the DB instance
        };

        // Called if there's an error opening the database
        request.onerror = (event) => {
            console.error("Error opening database:", event.target.error);
            reject(event.target.error); // Reject the promise
        };

        // Called if the connection is blocked (e.g., another tab has an older version open)
        request.onblocked = (event) => {
             console.warn("Database open request blocked. Please close other tabs connected to this database with an older version.", event);
             // Potentially inform the user they need to close other tabs/windows.
             reject(new Error("Database connection blocked. Close other tabs/windows."));
        }
    });
}

// --- Export the openDB function so other scripts can use it ---
// (We'll need to figure out how to share this with popup.js and potentially background.js later)
// For now, this file just defines the function.

// Example of how you might call it (don't uncomment this here, just for illustration)
/*
openDB().then(dbInstance => {
    console.log("DB is ready to use!", dbInstance);
    // Now you can perform transactions...
}).catch(error => {
    console.error("Failed to open DB:", error);
});
*/