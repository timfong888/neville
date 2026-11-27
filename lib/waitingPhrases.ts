// Quote data and pure functions have moved to lib/waitingQuotes.ts.
// This file re-exports them so older import paths continue to resolve.
export { QUOTES, emptyQuoteState, nextQuote, waitLine } from "./waitingQuotes";
export type { Quote, QuoteState } from "./waitingQuotes";
