/**
 * Type declarations for isomorphic-dompurify
 * 
 * This file provides type definitions for the isomorphic-dompurify package
 * which re-exports DOMPurify for both browser and Node.js environments.
 * 
 * DOMPurify provides its own type definitions, so we don't need @types/dompurify.
 */

declare module 'isomorphic-dompurify' {
        export * from 'dompurify'
        export { default } from 'dompurify'
}
