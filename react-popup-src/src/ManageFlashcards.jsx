// react-popup-src/src/ManageFlashcards.jsx
import React, { useState, useEffect } from 'react';

// --- Start: IndexedDB Logic (Copied & adapted from db.js/App.jsx for now) ---
const DB_NAME = 'flashcardDB';
const DB_VERSION = 1;
const STORE_NAME = 'flashcards';

let dbPromise = null; // Store the promise for opening the DB

function openDB() {
    // Reuse existing promise if available
    if (dbPromise) return dbPromise;

    console.log(`Manage: Attempting to open DB: ${DB_NAME} version ${DB_VERSION}`);
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            console.log('Manage: Database upgrade needed.');
            const tempDb = event.target.result;
            if (!tempDb.objectStoreNames.contains(STORE_NAME)) {
                console.log(`Manage: Creating object store: ${STORE_NAME}`);
                tempDb.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                console.log('Manage: Object store created successfully.');
            }
        };

        request.onsuccess = (event) => {
            const db = event.target.result;
            console.log(`Manage: Database "${DB_NAME}" opened successfully (version ${db.version}).`);
            db.onerror = (errorEvent) => {
                 console.error("Manage: Database connection error:", errorEvent.target.error);
                 dbPromise = null;
            };
             db.onclose = () => {
                console.warn('Manage: Database connection closed.');
                dbPromise = null;
            };
            resolve(db);
        };

        request.onerror = (event) => {
            console.error("Manage: Error opening database:", event.target.error);
             dbPromise = null;
            reject(event.target.error);
        };

         request.onblocked = (event) => {
             console.warn("Manage: Database open request blocked.");
             dbPromise = null;
             reject(new Error("Database connection blocked. Close other tabs/windows."));
        }
    });
    return dbPromise;
}
// --- End: IndexedDB Logic ---


function ManageFlashcards() {
    const [flashcards, setFlashcards] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let isMounted = true; // Prevent state update on unmounted component
        setIsLoading(true);
        setError('');
        setFlashcards([]); // Clear previous results

        const fetchFlashcards = async () => {
            try {
                const db = await openDB();
                const transaction = db.transaction(STORE_NAME, 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const getAllRequest = store.getAll(); // Get all records

                getAllRequest.onsuccess = () => {
                    if (isMounted) {
                       console.log("Fetched cards:", getAllRequest.result);
                       setFlashcards(getAllRequest.result || []); // Ensure it's an array
                       setIsLoading(false);
                    }
                };

                getAllRequest.onerror = (event) => {
                    console.error('Error fetching flashcards:', event.target.error);
                     if (isMounted) {
                       setError(`Error fetching cards: ${event.target.error.message}`);
                       setIsLoading(false);
                    }
                };

                 transaction.onerror = (event) => {
                     console.error('Read transaction error:', event.target.error);
                     if (isMounted && !error) { // Don't overwrite specific request error
                          setError(`Transaction error: ${event.target.error.message}`);
                          setIsLoading(false);
                     }
                 };

            } catch (err) {
                console.error('Failed to open DB for fetching:', err);
                if (isMounted) {
                   setError(`DB Error: ${err.message}`);
                   setIsLoading(false);
                }
            }
        };

        fetchFlashcards();

        // Cleanup function
        return () => {
            isMounted = false;
             console.log("Unmounting ManageFlashcards, isMounted set to false");
        };
    }, []); // Empty dependency array means run once on mount

    if (isLoading) {
        return <div>Loading flashcards...</div>;
    }

    if (error) {
        return <div style={{ color: 'red' }}>Error loading flashcards: {error}</div>;
    }

    return (
        <div>
            <h2>Manage Flashcards</h2>
            {flashcards.length === 0 ? (
                <p>No flashcards saved yet.</p>
            ) : (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {flashcards.map((card) => (
                        <li key={card.id} style={{ border: '1px solid #ccc', padding: '8px', marginBottom: '5px', borderRadius: '4px' }}>
                            <p><strong>Front:</strong> {card.front}</p>
                            {/* Add more details later (back, edit/delete buttons) */}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default ManageFlashcards;