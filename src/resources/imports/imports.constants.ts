// Limits while the feature is being tested
export const MAX_IMPORT_ROWS = 200
export const MAX_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024

// Courtesy with the external sources: wait after each search that reaches them
export const SOURCES_PAUSE_MS = 500

// Picks up imports left in the queue if the worker stopped because of a database failure
export const QUEUE_CHECK_INTERVAL_MS = 60_000

export const MAX_FILE_NAME_LENGTH = 255
export const ANALYSIS_SAMPLE_ROWS = 5
